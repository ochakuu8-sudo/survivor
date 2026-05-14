import { TAU, INITIAL_WEAPON_ATTACHMENT_SLOTS, MAX_ATTACHMENTS, WEAPON_STAT_KEYS, getWeaponMaxLevel } from "./constants.js";
import { game, nextWeaponId } from "./state.js";
import { distanceToSegmentSq, distSq } from "./utils/math.js";
import { addEffect, addSparks } from "./effects.js";
import { shortestDungeonDelta, shortestDungeonDistanceSq } from "./dungeon.js";
import {
  damageEnemy,
  damageEnemiesInCone,
  damageEnemiesInLine,
  damageEnemiesInRadius,
  findNearestEnemyFrom,
  removeDeadEnemies,
} from "./combat.js";

const WEAPON_RARITIES = {
  normal: { label: "ノーマル", affixCount: 0, power: 1 },
  rare: { label: "レア", affixCount: 1, power: 1 },
  epic: { label: "エピック", affixCount: 2, power: 1.08 },
  legend: { label: "レジェンド", affixCount: 3, power: 1.18 },
};

const MULTI_PROJECTILE_STEP = Math.PI / 36;

const WEAPON_AFFIXES = {
  石: [
    {
      key: "sharp",
      prefix: "鋭い",
      text: (power) => `威力 +${percent(0.18, power)}`,
      apply: (weapon, power) => { weapon.damage *= 1 + 0.18 * power; },
    },
    {
      key: "far",
      prefix: "遠投の",
      text: (power) => `射程 +${percent(0.16, power)}`,
      apply: (weapon, power) => {
        weapon.range *= 1 + 0.16 * power;
        weapon.bulletSpeed *= 1 + 0.12 * power;
      },
    },
    {
      key: "quick",
      prefix: "速投げ",
      text: (power) => `攻撃頻度 +${percent(0.14, power)}`,
      apply: (weapon, power) => { weapon.fireRate *= 1 + 0.14 * power; },
    },
    {
      key: "heavy",
      prefix: "重い",
      text: (power) => `威力 +${percent(0.24, power)} / 攻撃頻度 -${percent(0.08, power)}`,
      apply: (weapon, power) => {
        weapon.damage *= 1 + 0.24 * power;
        weapon.fireRate *= Math.max(0.55, 1 - 0.08 * power);
        weapon.kick *= 1 + 0.16 * power;
      },
    },
  ],
  火炎放射器: [
    {
      key: "hot",
      prefix: "高火力",
      text: (power) => `威力 +${percent(0.16, power)}`,
      apply: (weapon, power) => { weapon.damage *= 1 + 0.16 * power; },
    },
    {
      key: "wide",
      prefix: "広角",
      text: (power) => `炎の角度 +${Math.round((0.08 * power) * 100)}%`,
      apply: (weapon, power) => { weapon.cone = Math.min(1.12, weapon.cone + 0.08 * power); },
    },
    {
      key: "long",
      prefix: "長炎",
      text: (power) => `射程 +${percent(0.16, power)}`,
      apply: (weapon, power) => { weapon.range *= 1 + 0.16 * power; },
    },
    {
      key: "pressure",
      prefix: "高圧",
      text: (power) => `攻撃頻度 +${percent(0.14, power)}`,
      apply: (weapon, power) => { weapon.fireRate *= 1 + 0.14 * power; },
    },
  ],
  モーニングスター: [
    {
      key: "large",
      prefix: "大玉",
      text: (power) => `範囲 +${percent(0.16, power)}`,
      apply: (weapon, power) => {
        weapon.areaRadius *= 1 + 0.16 * power;
        weapon.damage *= 1 + 0.08 * power;
      },
    },
    {
      key: "chain",
      prefix: "長鎖",
      text: (power) => `回転半径 +${percent(0.16, power)}`,
      apply: (weapon, power) => {
        weapon.orbitRadius *= 1 + 0.16 * power;
        weapon.range *= 1 + 0.12 * power;
      },
    },
    {
      key: "fast",
      prefix: "高速回転",
      text: (power) => `回転速度 +${percent(0.18, power)}`,
      apply: (weapon, power) => {
        weapon.orbitSpeed *= 1 + 0.18 * power;
        weapon.fireRate *= 1 + 0.1 * power;
      },
    },
    {
      key: "heavy",
      prefix: "重撃",
      text: (power) => `威力 +${percent(0.2, power)} / 回転速度 -${percent(0.06, power)}`,
      apply: (weapon, power) => {
        weapon.damage *= 1 + 0.2 * power;
        weapon.orbitSpeed *= Math.max(0.65, 1 - 0.06 * power);
      },
    },
  ],
};

function percent(value, power = 1) {
  return `${Math.round(value * power * 100)}%`;
}

function pickWeaponRarity(floor = 1) {
  const f = Math.max(1, floor || 1);
  let weights = [
    ["normal", 72],
    ["rare", 25],
    ["epic", 3],
    ["legend", 0],
  ];
  if (f >= 3) {
    weights = [
      ["normal", 60],
      ["rare", 32],
      ["epic", 7],
      ["legend", 1],
    ];
  }
  if (f >= 6) {
    weights = [
      ["normal", 45],
      ["rare", 36],
      ["epic", 16],
      ["legend", 3],
    ];
  }
  if (f >= 9) {
    weights = [
      ["normal", 34],
      ["rare", 38],
      ["epic", 22],
      ["legend", 6],
    ];
  }
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return "normal";
}

function pickAffixes(baseName, count) {
  const pool = WEAPON_AFFIXES[baseName] || [];
  const available = [...pool];
  const picked = [];
  while (available.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * available.length);
    picked.push(available.splice(index, 1)[0]);
  }
  return picked;
}

function roundWeaponStats(weapon) {
  WEAPON_STAT_KEYS.forEach((key) => {
    const value = weapon[key];
    if (typeof value !== "number") return;
    const integers = new Set(["projectiles", "pierce", "chainCount", "orbitCount", "droneCount", "maxMines"]);
    weapon[key] = integers.has(key)
      ? Math.max(0, Math.round(value))
      : Math.round(value * 100) / 100;
  });
  weapon.fireRate = Math.max(0.15, weapon.fireRate);
  weapon.range = Math.max(32, weapon.range);
  weapon.radius = Math.max(2, weapon.radius);
}

function applyWeaponVariant(weapon, { floor = 1, rarity = null } = {}) {
  const baseName = weapon.baseName || weapon.name;
  const rarityKey = rarity || pickWeaponRarity(floor);
  const rarityConfig = WEAPON_RARITIES[rarityKey] || WEAPON_RARITIES.normal;
  const affixes = pickAffixes(baseName, rarityConfig.affixCount);

  affixes.forEach((affix) => affix.apply(weapon, rarityConfig.power));
  roundWeaponStats(weapon);

  weapon.rarity = rarityKey;
  weapon.rarityLabel = rarityConfig.label;
  weapon.affixes = affixes.map((affix) => ({
    key: affix.key,
    prefix: affix.prefix,
    text: affix.text(rarityConfig.power),
  }));
  weapon.name = affixes[0] ? `${affixes[0].prefix}${baseName}` : baseName;
}

export function snapshotWeaponStats(weapon) {
  const stats = {};
  WEAPON_STAT_KEYS.forEach((key) => {
    const value = weapon[key];
    stats[key] = Array.isArray(value) ? [...value] : value;
  });
  return stats;
}

export function restoreWeaponBaseStats(weapon) {
  Object.entries(weapon.baseStats || snapshotWeaponStats(weapon)).forEach(([key, value]) => {
    weapon[key] = Array.isArray(value) ? [...value] : value;
  });
}

export function createWeapon(template, options = {}) {
  const baseName = template.baseName || template.name;
  const kind = template.kind || "projectile";
  const bulletSpeed = template.bulletSpeed ?? 690;
  const life = template.life || 0.72;
  const rarityKey = template.rarity || "normal";
  const rarityLabel = template.rarityLabel || {
    normal: "ノーマル",
    rare: "レア",
    epic: "エピック",
    legend: "レジェンド",
  }[rarityKey] || rarityKey;
  const weapon = {
    id: nextWeaponId(),
    name: template.name,
    baseName,
    level: Math.max(1, template.level || 1),
    kind,
    damage: template.damage,
    fireRate: template.fireRate,
    bulletSpeed,
    projectiles: template.projectiles || 1,
    pierce: template.pierce || 0,
    knockback: template.knockback || 0,
    spread: template.spread ?? 0.18,
    life,
    range: template.range || bulletSpeed * life,
    cone: template.cone ?? 0.5,
    lineWidth: template.lineWidth || 18,
    explosionRadius: template.explosionRadius || 0,
    explosionDamage: template.explosionDamage || template.damage,
    chainCount: template.chainCount || 0,
    chainRange: template.chainRange || 170,
    duration: template.duration || 0,
    tickRate: template.tickRate || 0,
    fuse: template.fuse || life,
    areaRadius: template.areaRadius || 0,
    orbitRadius: template.orbitRadius || 0,
    orbitSpeed: template.orbitSpeed || 4.2,
    radius: template.radius || 9,
    jitter: template.jitter || 0,
    kick: template.kick || 1.8,
    critChance: template.critChance || 0,
    critMultiplier: template.critMultiplier || 1.75,
    freezeChance: template.freezeChance || 0,
    freezeSlow: template.freezeSlow || 0.62,
    freezeDuration: template.freezeDuration || 1.6,
    lifeStealPerKill: template.lifeStealPerKill || 0,
    ricochetCount: template.ricochetCount || 0,
    ricochetRange: template.ricochetRange || 220,
    ricochetSplitCount: template.ricochetSplitCount || 1,
    ricochetSpeedScale: template.ricochetSpeedScale || 1,
    splitShardCount: template.splitShardCount || 0,
    hitShardCount: template.hitShardCount || 0,
    elasticGrowth: template.elasticGrowth ? { ...template.elasticGrowth } : null,
    splitSpawnLimit: template.splitSpawnLimit || 10,
    chainShatterChance: template.chainShatterChance || 0,
    chainShatterRadiusScale: template.chainShatterRadiusScale || 0.6,
    chainShatterDamageScale: template.chainShatterDamageScale || 0.45,
    criticalThrowEvery: template.criticalThrowEvery || 0,
    criticalThrowDamageScale: template.criticalThrowDamageScale || 1.5,
    criticalThrowSizeScale: template.criticalThrowSizeScale || 1.35,
    masterStoneInterval: template.masterStoneInterval || 0,
    masterStoneTimer: template.masterStoneTimer ?? (template.masterStoneInterval || 0),
    masterStoneDamageScale: template.masterStoneDamageScale || 2.8,
    masterStoneEliteBossBonus: template.masterStoneEliteBossBonus || 0,
    radialFlame: !!template.radialFlame,
    orbitCount: template.orbitCount || 1,
    droneCount: template.droneCount || 1,
    maxMines: template.maxMines || 0,
    armingTime: template.armingTime || 0,
    returnTime: template.returnTime || 0,
    orbitPushOut: template.orbitPushOut || 0,
    bulletTint: template.bulletTint ? [...template.bulletTint] : [1, 1, 1],
    bulletGlow: template.bulletGlow || "glowAmber",
    effectTint: template.effectTint ? [...template.effectTint] : [1, 1, 1],
    effectGlow: template.effectGlow || "glowAmber",
    bulletSprite: template.bulletSprite || null,
    stoneVisual: {
      form: "normal",
      sizeScale: 1,
      trail: "none",
      hitEffect: "normal",
      ...(template.stoneVisual || {}),
    },
    stoneFlags: { ...(template.stoneFlags || {}) },
    throwCounter: template.throwCounter || 0,
    shootTimer: template.shootTimer ?? 0.45,
    attachments: [],
    unlockedSlots: Math.min(MAX_ATTACHMENTS, Math.max(1, template.unlockedSlots || INITIAL_WEAPON_ATTACHMENT_SLOTS)),
    rarity: rarityKey,
    rarityLabel,
    variantSummary: template.variantSummary || "",
    affixes: [],
  };
  if (options.rollVariant || template.rollVariant) {
    applyWeaponVariant(weapon, {
      floor: options.floor ?? game.wave,
      rarity: options.rarity,
    });
  } else {
    weapon.name = template.name || baseName;
  }
  weapon.level = Math.min(getWeaponMaxLevel(weapon), Math.max(1, weapon.level || 1));
  weapon.baseStats = snapshotWeaponStats(weapon);
  return weapon;
}

export function findWeapon(id) {
  return game.player.gear.weapons.find((weapon) => weapon.id === id) || null;
}

export function clampActiveWeaponIndex(gear = game.player?.gear) {
  if (!gear) return 0;
  const count = gear.weapons?.length || 0;
  if (count <= 0) {
    gear.activeWeaponIndex = 0;
    return 0;
  }
  const index = Math.min(Math.max(gear.activeWeaponIndex || 0, 0), count - 1);
  gear.activeWeaponIndex = index;
  return index;
}

export function getActiveWeapon(player = game.player) {
  const gear = player?.gear;
  if (!gear?.weapons?.length) return null;
  return gear.weapons[clampActiveWeaponIndex(gear)] || null;
}

export function setActiveWeaponIndex(index) {
  const gear = game.player?.gear;
  if (!gear?.weapons?.length) return null;
  gear.activeWeaponIndex = Number.isFinite(index) ? index : 0;
  return getActiveWeapon(game.player);
}

export function cycleActiveWeapon() {
  const gear = game.player?.gear;
  if (!gear?.weapons?.length) return null;
  gear.activeWeaponIndex = (clampActiveWeaponIndex(gear) + 1) % gear.weapons.length;
  game.shake = Math.max(game.shake, 1.2);
  return getActiveWeapon(game.player);
}

export function weaponStatusLabel(weapon) {
  if (!weapon) return "武器なし";
  return "無制限攻撃";
}

export function weaponKindLabel(weapon) {
  const labels = {
    projectile: "投射",
    flame: "火炎",
    laser: "レーザー",
    sustainedLaser: "持続レーザー",
    bomb: "爆発",
    timedBomb: "時限爆弾",
    chain: "電撃",
    orbit: "回転",
    sword: "ソード",
    boomerang: "往復",
    mine: "設置",
    poisonBottle: "毒",
    drone: "自律",
  };
  return labels[weapon.kind] || "武器";
}

export function weaponRarityLabel(weapon) {
  return weapon?.rarityLabel || WEAPON_RARITIES.normal.label;
}

export function weaponVariantSummary(weapon) {
  if (weapon?.variantSummary) return weapon.variantSummary;
  if (!weapon?.affixes?.length) return "個体差なし";
  return weapon.affixes.map((affix) => affix.text).join(" / ");
}

export function weaponVariantText(weapon) {
  const summary = weaponVariantSummary(weapon);
  if (weapon?.variantSummary) return `${weaponRarityLabel(weapon)}個体・${summary}。`;
  return summary === "個体差なし"
    ? `${weaponRarityLabel(weapon)}個体。基礎性能のまま扱いやすい。`
    : `${weaponRarityLabel(weapon)}個体。${summary}。`;
}

export function weaponMetaLabel(weapon) {
  const rarity = weaponRarityLabel(weapon);
  const kind = weaponKindLabel(weapon);
  const summary = weaponVariantSummary(weapon);
  return summary === "個体差なし"
    ? `${rarity}・${kind}`
    : `${rarity}・${kind}・${summary}`;
}

export function updateWeaponTimers(player, dt) {
  clampActiveWeaponIndex(player.gear);
  for (const weapon of player.gear.weapons) {
    weapon.shootTimer = Math.max(0, weapon.shootTimer - dt);
    if ((weapon.masterStoneInterval || 0) > 0) {
      weapon.masterStoneTimer = Math.max(0, (weapon.masterStoneTimer ?? weapon.masterStoneInterval) - dt);
    }
  }
}

function baseWeaponStat(weapon, key, fallback = 0) {
  const baseValue = weapon?.baseStats?.[key];
  if (typeof baseValue === "number") return baseValue;
  const currentValue = weapon?.[key];
  return typeof currentValue === "number" ? currentValue : fallback;
}

export function addWeaponBasePercent(weapon, key, percent, { min = -Infinity, max = Infinity } = {}) {
  const baseValue = baseWeaponStat(weapon, key);
  if (!Number.isFinite(baseValue) || baseValue === 0) return;
  const currentValue = typeof weapon[key] === "number" ? weapon[key] : baseValue;
  weapon[key] = Math.min(max, Math.max(min, currentValue + baseValue * percent));
}

export function reduceWeaponBasePercent(weapon, key, percent, { min = 0, max = Infinity } = {}) {
  const baseValue = baseWeaponStat(weapon, key);
  if (!Number.isFinite(baseValue) || baseValue === 0) return;
  const currentValue = typeof weapon[key] === "number" ? weapon[key] : baseValue;
  weapon[key] = Math.min(max, Math.max(min, currentValue - baseValue * percent));
}

export function boostWeaponImpactPercent(weapon, percent) {
  addWeaponBasePercent(weapon, "damage", percent);
  if (baseWeaponStat(weapon, "explosionRadius") > 0 || weapon.explosionRadius > 0) {
    addWeaponBasePercent(weapon, "explosionDamage", percent);
  }
}

export function extendWeaponReach(weapon, multiplier) {
  const percent = multiplier - 1;
  addWeaponBasePercent(weapon, "range", percent, { min: 32 });
  if (baseWeaponStat(weapon, "bulletSpeed") > 1 || weapon.bulletSpeed > 1) {
    addWeaponBasePercent(weapon, "bulletSpeed", percent, { min: 1 });
    addWeaponBasePercent(weapon, "life", percent * 0.45, { min: 0.05 });
  }
  if (weapon.kind === "sustainedLaser") addWeaponBasePercent(weapon, "duration", percent * 0.75, { min: 0.05 });
  if (baseWeaponStat(weapon, "orbitRadius") > 0 || weapon.orbitRadius > 0) {
    addWeaponBasePercent(weapon, "orbitRadius", percent * 0.65, { min: 0 });
  }
  if (weapon.kind === "chain") addWeaponBasePercent(weapon, "chainRange", percent * 0.7, { min: 0 });
  if (weapon.kind === "drone") addWeaponBasePercent(weapon, "orbitRadius", percent * 0.5, { min: 0 });
}

export function addWeaponPierce(weapon, amount = 1) {
  const rounded = Math.max(1, Math.round(amount));
  weapon.pierce += rounded;
  if (weapon.kind === "laser") weapon.lineWidth += 3 + rounded;
  if (weapon.kind === "sustainedLaser") weapon.lineWidth += 4 + rounded;
  if (weapon.kind === "flame") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "sword") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "chain") weapon.chainCount += rounded;
  if (weapon.kind === "drone") weapon.droneCount = (weapon.droneCount || 1) + rounded;
  if (weapon.kind === "mine") weapon.maxMines = (weapon.maxMines || 8) + rounded;
  if (weapon.explosionRadius > 0) weapon.explosionRadius += 12 + rounded * 6;
  if (weapon.areaRadius > 0) weapon.areaRadius += 8 + rounded * 4;
  if (weapon.kind === "projectile") weapon.radius += Math.max(1, Math.round(rounded * 0.65));
}

export function expandWeaponArea(weapon, power) {
  const percent = 0.08 * power;
  if (baseWeaponStat(weapon, "explosionRadius") > 0 || weapon.explosionRadius > 0) {
    addWeaponBasePercent(weapon, "explosionRadius", percent, { min: 0 });
  }
  if (baseWeaponStat(weapon, "areaRadius") > 0 || weapon.areaRadius > 0) {
    addWeaponBasePercent(weapon, "areaRadius", percent, { min: 0 });
  }
  if (weapon.kind === "laser" || weapon.kind === "sustainedLaser") {
    addWeaponBasePercent(weapon, "lineWidth", percent, { min: 1 });
  }
  if (weapon.kind === "flame" || weapon.kind === "sword") {
    addWeaponBasePercent(weapon, "cone", percent, { min: 0.1, max: 1.35 });
  }
  if (baseWeaponStat(weapon, "radius") > 0 || weapon.radius > 0) {
    addWeaponBasePercent(weapon, "radius", percent, { min: 2 });
  }
}

const TARGETLESS_KINDS = new Set(["flame", "sword", "mine"]);

export function autoShoot() {
  const p = game.player;
  const weapon = getActiveWeapon(p);

  if (!weapon || weapon.kind === "orbit" || weapon.kind === "drone") return;
  fireMasterStoneIfReady(weapon);
  if (weapon.shootTimer > 0) return;
  let target = null;
  if (TARGETLESS_KINDS.has(weapon.kind)) {
    // Always fire on cooldown; direction comes from facing or self-position.
  } else {
    if (game.enemies.length === 0) return;
    target = findTargetForWeapon(p, weapon);
    if (!target) return;
  }

  fireWeapon(weapon, target);
  weapon.shootTimer = 1 / weapon.fireRate;
  game.shake = Math.max(game.shake, weapon.kick);
}

export function updateDroneWeapons(dt) {
  const p = game.player;
  if (!p?.gear) return;
  const weapon = getActiveWeapon(p);
  if (!weapon || weapon.kind !== "drone") return;

  weapon.droneShootTimer = Math.max(0, (weapon.droneShootTimer || 0) - dt);
  const count = Math.max(1, Math.round(weapon.droneCount || 1));
  const orbitRadius = weapon.orbitRadius || 96;
  const orbitSpeed = weapon.orbitSpeed || 2.6;
  if (weapon.droneShootTimer <= 0 && game.enemies.length > 0) {
    for (let i = 0; i < count; i += 1) {
      const phase = (i / count) * TAU;
      const spin = game.elapsed * orbitSpeed + weapon.id * 1.31 + phase;
      const x = p.x + Math.cos(spin) * orbitRadius;
      const y = p.y + Math.sin(spin) * orbitRadius;
      const target = findNearestEnemyFrom(x, y, weapon.range || 420);
      if (!target) continue;
      const angle = targetAngle({ x, y }, target);
      const speed = weapon.bulletSpeed || 620;
      game.bullets.push({
        kind: "projectile",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle,
        radius: weapon.radius || 5,
        damage: weapon.damage + p.weaponPowerBonus,
        life: weapon.life || 0.72,
        maxLife: weapon.life || 0.72,
        pierce: weapon.pierce || 0,
        knockback: weapon.knockback || 0,
        explosionRadius: 0,
        explosionDamage: weapon.explosionDamage + p.weaponPowerBonus,
        critChance: weapon.critChance || 0,
        critMultiplier: weapon.critMultiplier || 1.75,
        freezeChance: weapon.freezeChance || 0,
        freezeSlow: weapon.freezeSlow || 0.62,
        freezeDuration: weapon.freezeDuration || 1.6,
        lifeStealPerKill: weapon.lifeStealPerKill || 0,
        ricochetCount: weapon.ricochetCount || 0,
        ricochetRange: weapon.ricochetRange || 220,
        ricochetSplitCount: weapon.ricochetSplitCount || 1,
        ricochetSpeedScale: weapon.ricochetSpeedScale || 1,
        splitShardCount: weapon.splitShardCount || 0,
        hitShardCount: weapon.hitShardCount || 0,
        elasticGrowth: null,
        splitSpawnLimit: weapon.splitSpawnLimit || 10,
        chainShatterChance: 0,
        chainShatterRadiusScale: 0.6,
        chainShatterDamageScale: 0.45,
        originId: `${weapon.id}:drone:${i}:${game.elapsed.toFixed(3)}`,
        spawnedFromOrigin: 1,
        lastHitId: null,
        bulletTint: weapon.bulletTint,
        bulletGlow: weapon.bulletGlow,
        bulletSprite: "droneShot",
        trail: "white",
        hitEffect: "normal",
        effectTint: weapon.effectTint,
        effectGlow: weapon.effectGlow,
        spinSeed: 0,
        spinRate: 0,
        hitIds: new Set(),
      });
      addEffect({ type: "line", x1: x, y1: y, x2: x + Math.cos(angle) * 28, y2: y + Math.sin(angle) * 28, width: 5, life: 0.08, maxLife: 0.08, glow: weapon.effectGlow, tint: weapon.effectTint });
    }
    weapon.droneShootTimer = 1 / Math.max(0.15, weapon.fireRate || 2.2);
  }
}

export function updateOrbitWeapons(dt) {
  const p = game.player;
  if (!p?.gear) return;
  const weapon = getActiveWeapon(p);
  if (!weapon || weapon.kind !== "orbit") return;

  const orbitSpeed = weapon.orbitSpeed || 4.2;
  const orbitRadius = weapon.orbitRadius || 78;
  const areaRadius = weapon.areaRadius || 34;
  const orbitCount = Math.max(1, Math.round(weapon.orbitCount || 1));

  if (!weapon.hitCooldowns) weapon.hitCooldowns = new Map();
  for (const [id, cd] of weapon.hitCooldowns) {
    const next = cd - dt;
    if (next <= 0) weapon.hitCooldowns.delete(id);
    else weapon.hitCooldowns.set(id, next);
  }

  const cooldownPerEnemy = 1 / Math.max(0.5, weapon.fireRate);
  const damage = weapon.damage + p.weaponPowerBonus;
  let hits = 0;

  for (let i = 0; i < orbitCount; i += 1) {
    const phase = (i / orbitCount) * TAU;
    const currSpin = game.elapsed * orbitSpeed + weapon.id * 1.73 + phase;
    const prevSpin = (game.elapsed - dt) * orbitSpeed + weapon.id * 1.73 + phase;
    const cx = p.x + Math.cos(currSpin) * orbitRadius;
    const cy = p.y + Math.sin(currSpin) * orbitRadius;
    const px = p.x + Math.cos(prevSpin) * orbitRadius;
    const py = p.y + Math.sin(prevSpin) * orbitRadius;
    let localHits = 0;

    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      if (weapon.hitCooldowns.has(enemy.id)) continue;
      const range = enemy.radius + areaRadius;
      if (distanceToSegmentSq(enemy.x, enemy.y, px, py, cx, cy) > range * range) continue;
      damageEnemy(enemy, damage, enemy.x, enemy.y, 2, 90, weapon);
      if (weapon.orbitPushOut > 0) {
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / len) * weapon.orbitPushOut;
        enemy.y += (dy / len) * weapon.orbitPushOut;
      }
      weapon.hitCooldowns.set(enemy.id, cooldownPerEnemy);
      hits += 1;
      localHits += 1;
    }

    if (localHits > 0) {
      addEffect({
        type: "burst",
        x: cx,
        y: cy,
        radius: areaRadius * 0.95,
        life: 0.2,
        maxLife: 0.2,
        glow: weapon.effectGlow,
        tint: weapon.effectTint,
      });
    }
  }

  if (hits > 0) game.shake = Math.max(game.shake, (weapon.kick || 1.5) * 0.5);
}

function findHighestHpEnemy() {
  let best = null;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    if (!best || (enemy.hp || 0) > (best.hp || 0)) best = enemy;
  }
  return best;
}

function fireMasterStoneIfReady(weapon) {
  if ((weapon.masterStoneInterval || 0) <= 0 || (weapon.masterStoneTimer || 0) > 0) return;
  const target = findHighestHpEnemy();
  if (!target) return;
  const p = game.player;
  const angle = targetAngle(p, target);
  fireBullet(angle, weapon, { master: true, target });
  weapon.masterStoneTimer = weapon.masterStoneInterval;
  addEffect({
    type: "burst",
    x: p.x,
    y: p.y,
    radius: 28,
    life: 0.18,
    maxLife: 0.18,
    glow: "glowCyan",
    tint: [1, 1, 1],
  });
}

function findTargetForWeapon(player, weapon) {
  let best = null;
  let bestDistance = Math.pow(weapon.range || (weapon.bulletSpeed || 690) * (weapon.life || 0.72), 2);
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = shortestDungeonDistanceSq(game.dungeon, player.x, player.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function fireWeapon(weapon, target) {
  const p = game.player;
  const usesFacing = weapon.kind === "flame" || weapon.kind === "sword";
  const angle = usesFacing
    ? Math.atan2(p.facingY ?? 0, p.facingX ?? 1)
    : target
      ? targetAngle(p, target)
      : 0;
  if (weapon.kind === "flame") {
    fireFlame(weapon, angle);
    return;
  }
  if (weapon.kind === "laser") {
    fireLaser(weapon, angle);
    return;
  }
  if (weapon.kind === "sustainedLaser") {
    fireSustainedLaser(weapon, angle);
    return;
  }
  if (weapon.kind === "timedBomb") {
    fireTimedBomb(weapon, angle);
    return;
  }
  if (weapon.kind === "boomerang") {
    fireBoomerang(weapon, angle);
    return;
  }
  if (weapon.kind === "mine") {
    fireMine(weapon, angle);
    return;
  }
  if (weapon.kind === "poisonBottle") {
    firePoisonBottle(weapon, angle);
    return;
  }
  if (weapon.kind === "pulseBomb") {
    firePulseBomb(weapon);
    return;
  }
  if (weapon.kind === "orbit") {
    fireOrbit(weapon);
    return;
  }
  if (weapon.kind === "sword") {
    fireSword(weapon, angle);
    return;
  }
  if (weapon.kind === "chain") {
    fireChain(weapon, target);
    return;
  }
  fireProjectileWeapon(weapon, angle);
}

function targetAngle(from, target) {
  const delta = shortestDungeonDelta(game.dungeon, from.x, from.y, target.x, target.y);
  return Math.atan2(delta.dy, delta.dx);
}

function fireProjectileWeapon(weapon, angle) {
  weapon.throwCounter = (weapon.throwCounter || 0) + 1;
  const count = Math.max(1, Math.round(weapon.projectiles || 1));
  const spread = count === 1 ? 0 : MULTI_PROJECTILE_STEP;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * spread;
    const jitter = count === 1 && weapon.jitter > 0 ? (Math.random() - 0.5) * weapon.jitter : 0;
    fireBullet(angle + offset + jitter, weapon);
  }
}

function fireBullet(angle, weapon, options = {}) {
  const p = game.player;
  const speed = options.master ? Math.max(weapon.bulletSpeed * 1.25, 620) : weapon.bulletSpeed;
  const bonus = p.weaponPowerBonus;
  const isCriticalThrow = !options.master && weapon.criticalThrowEvery > 0 && weapon.throwCounter % weapon.criticalThrowEvery === 0;
  const damageScale = options.master ? (weapon.masterStoneDamageScale || 2.8) : isCriticalThrow ? (weapon.criticalThrowDamageScale || 1.5) : 1;
  const sizeScale = options.master ? 1.5 : isCriticalThrow ? (weapon.criticalThrowSizeScale || 1.35) : 1;
  const visual = weapon.stoneVisual || {};
  const originId = `${weapon.id}:${game.elapsed.toFixed(3)}:${Math.random().toString(36).slice(2, 8)}`;
  const tumbles = !!(options.master ? "stoneMaster" : weapon.bulletSprite);
  game.bullets.push({
    kind: "projectile",
    x: p.x + Math.cos(angle) * 25,
    y: p.y + Math.sin(angle) * 25,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius * sizeScale,
    damage: (weapon.damage + bonus) * damageScale,
    life: weapon.life,
    maxLife: weapon.life,
    pierce: options.master ? (weapon.pierce || 0) + 3 : weapon.pierce,
    knockback: weapon.knockback || 0,
    explosionRadius: options.master ? 0 : weapon.explosionRadius,
    explosionDamage: (weapon.explosionDamage + bonus) * damageScale,
    critChance: options.master || isCriticalThrow ? 1 : (weapon.critChance || 0),
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    ricochetCount: weapon.ricochetCount || 0,
    ricochetRange: weapon.ricochetRange || 220,
    ricochetSplitCount: weapon.ricochetSplitCount || 1,
    ricochetSpeedScale: weapon.ricochetSpeedScale || 1,
    splitShardCount: weapon.splitShardCount || 0,
    hitShardCount: weapon.hitShardCount || 0,
    elasticGrowth: weapon.elasticGrowth ? { ...weapon.elasticGrowth } : null,
    splitSpawnLimit: weapon.splitSpawnLimit || 10,
    chainShatterChance: weapon.chainShatterChance || 0,
    chainShatterRadiusScale: weapon.chainShatterRadiusScale || 0.6,
    chainShatterDamageScale: weapon.chainShatterDamageScale || 0.45,
    isCriticalStone: isCriticalThrow,
    isMasterStone: !!options.master,
    eliteBossBonus: options.master ? (weapon.masterStoneEliteBossBonus || 0) : 0,
    originId,
    spawnedFromOrigin: 1,
    lastHitId: null,
    bulletTint: options.master ? [1, 1, 1] : isCriticalThrow ? [1, 1, 0.92] : weapon.bulletTint,
    bulletGlow: options.master ? "glowCyan" : isCriticalThrow ? "glowAmber" : weapon.bulletGlow,
    bulletSprite: options.master ? "stoneMaster" : weapon.bulletSprite || null,
    visualForm: options.master ? "master" : visual.form || "normal",
    trail: options.master ? "white" : visual.trail || "none",
    hitEffect: options.master ? "critical" : visual.hitEffect || "normal",
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    spinSeed: tumbles ? Math.random() * TAU : 0,
    spinRate: tumbles ? 1.8 + Math.random() * 1.6 : 0,
    hitIds: new Set(),
  });
  addSparks(p.x + Math.cos(angle) * 28, p.y + Math.sin(angle) * 28, 1, 40);
}

function fireFlame(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 20;
  const originY = p.y + Math.sin(angle) * 20;
  if (weapon.radialFlame) {
    fireRadialFlame(weapon, originX, originY);
    return;
  }
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus, weapon);

  const baseTint = weapon.effectTint || [1, 0.42, 0.12];
  const glow = weapon.effectGlow || "glowRed";

  const billowCount = 16;
  for (let i = 0; i < billowCount; i += 1) {
    const t = (i + Math.random()) / billowCount;
    const distance = weapon.range * (0.08 + t * 0.86);
    const fan = (Math.random() - 0.5) * weapon.cone * 1.9;
    const flameAngle = angle + fan;
    const px = originX + Math.cos(flameAngle) * distance;
    const py = originY + Math.sin(flameAngle) * distance;
    const heat = 1 - t;

    let tint;
    if (heat > 0.7) {
      tint = [1, 0.95 - (1 - heat) * 0.4, 0.55 - (1 - heat) * 0.6];
    } else if (heat > 0.4) {
      tint = [1, 0.6 + heat * 0.22, 0.2];
    } else {
      tint = [baseTint[0] * 0.92, baseTint[1] * 0.65, baseTint[2] * 0.55];
    }

    const radius = 22 + heat * 16 + Math.random() * 14;
    const life = 0.18 + Math.random() * 0.14 + heat * 0.05;
    addEffect({
      type: "burst",
      x: px,
      y: py,
      radius,
      life,
      maxLife: life,
      glow,
      tint,
    });
  }

  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 22,
    y: originY + Math.sin(angle) * 22,
    radius: 44,
    life: 0.16,
    maxLife: 0.16,
    glow: "glowAmber",
    tint: [1, 0.94, 0.6],
  });
  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 10,
    y: originY + Math.sin(angle) * 10,
    radius: 30,
    life: 0.12,
    maxLife: 0.12,
    glow: "glowAmber",
    tint: [1, 1, 0.86],
  });

  const emberCount = 9;
  for (let i = 0; i < emberCount; i += 1) {
    const fan = (Math.random() - 0.5) * weapon.cone * 1.7;
    const dir = angle + fan;
    const speed = 180 + Math.random() * 200;
    const heatColor = Math.random();
    game.particles.push({
      x: originX + Math.cos(dir) * 8,
      y: originY + Math.sin(dir) * 8,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      life: 0.32 + Math.random() * 0.28,
      maxLife: 0.6,
      size: 10 + Math.random() * 10,
      sprite: "spark",
      tint: heatColor > 0.7 ? [1, 0.92, 0.5] : heatColor > 0.35 ? [1, 0.55, 0.18] : [0.85, 0.3, 0.1],
    });
  }
}

function fireRadialFlame(weapon, originX, originY) {
  const p = game.player;
  const radius = weapon.range || 170;
  damageEnemiesInRadius(originX, originY, radius, weapon.damage + p.weaponPowerBonus, 0.7, weapon);

  const glow = weapon.effectGlow || "glowRed";
  const tint = weapon.effectTint || [1, 0.55, 0.16];
  const streams = 12;
  for (let i = 0; i < streams; i += 1) {
    const dir = (i / streams) * TAU + game.elapsed * 0.18;
    const distance = radius * (0.35 + Math.random() * 0.55);
    const x = originX + Math.cos(dir) * distance;
    const y = originY + Math.sin(dir) * distance;
    addEffect({
      type: "burst",
      x,
      y,
      radius: 26 + Math.random() * 24,
      life: 0.18 + Math.random() * 0.12,
      maxLife: 0.3,
      glow,
      tint,
    });
    game.particles.push({
      x: originX + Math.cos(dir) * 12,
      y: originY + Math.sin(dir) * 12,
      vx: Math.cos(dir) * (210 + Math.random() * 170),
      vy: Math.sin(dir) * (210 + Math.random() * 170),
      life: 0.28 + Math.random() * 0.25,
      maxLife: 0.58,
      size: 10 + Math.random() * 10,
      sprite: "spark",
      tint: Math.random() > 0.45 ? [1, 0.88, 0.32] : tint,
    });
  }
  addEffect({
    type: "burst",
    x: originX,
    y: originY,
    radius: radius * 0.78,
    life: 0.18,
    maxLife: 0.18,
    glow,
    tint,
  });
}

function fireLaser(weapon, angle) {
  const p = game.player;
  const startX = p.x + Math.cos(angle) * 26;
  const startY = p.y + Math.sin(angle) * 26;
  const endX = p.x + Math.cos(angle) * weapon.range;
  const endY = p.y + Math.sin(angle) * weapon.range;
  damageEnemiesInLine(startX, startY, endX, endY, weapon.lineWidth * 0.5, weapon.damage + p.weaponPowerBonus, weapon.pierce + 1, 2, 110, weapon);
  addEffect({
    type: "line",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: weapon.lineWidth,
    life: 0.32,
    maxLife: 0.32,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
  addEffect({
    type: "line",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: Math.max(5, weapon.lineWidth * 0.28),
    life: 0.26,
    maxLife: 0.26,
    glow: "white",
    tint: [1, 1, 1],
  });
}

function fireSustainedLaser(weapon, angle) {
  const p = game.player;
  const startX = p.x + Math.cos(angle) * 28;
  const startY = p.y + Math.sin(angle) * 28;
  const endX = startX + Math.cos(angle) * weapon.range;
  const endY = startY + Math.sin(angle) * weapon.range;
  const duration = Math.max(0.35, weapon.duration || 1.2);
  addEffect({
    type: "damageLine",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: weapon.lineWidth,
    damage: weapon.damage + p.weaponPowerBonus,
    tickRate: weapon.tickRate || 8,
    tickTimer: 0,
    maxHits: weapon.pierce + 1,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    life: duration,
    maxLife: duration,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
  addEffect({
    type: "burst",
    x: startX,
    y: startY,
    radius: weapon.lineWidth * 1.45,
    life: 0.2,
    maxLife: 0.2,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function fireTimedBomb(weapon, angle) {
  const p = game.player;
  const speed = weapon.bulletSpeed || 460;
  const fuse = Math.max(0.45, weapon.fuse || weapon.life || 0.85);
  const placeX = p.x + Math.cos(angle) * 18;
  const placeY = p.y + Math.sin(angle) * 18;
  game.bullets.push({
    kind: "timedBomb",
    x: placeX,
    y: placeY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius,
    damage: weapon.damage + p.weaponPowerBonus,
    life: fuse,
    maxLife: fuse,
    pierce: 0,
    knockback: weapon.knockback || 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + p.weaponPowerBonus,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    bulletSprite: weapon.bulletSprite || "bomb",
    spinSeed: Math.random() * TAU,
    spinRate: 3.2,
    collides: true,
    hitIds: new Set(),
  });
  addSparks(placeX, placeY, 2, 70);
}

function fireBoomerang(weapon, angle) {
  const p = game.player;
  const speed = weapon.bulletSpeed || 540;
  const life = weapon.life || 2.1;
  game.bullets.push({
    kind: "boomerang",
    x: p.x + Math.cos(angle) * 24,
    y: p.y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius,
    damage: weapon.damage + p.weaponPowerBonus,
    life,
    maxLife: life,
    returnTime: weapon.returnTime || life * 0.45,
    age: 0,
    pierce: 999,
    knockback: weapon.knockback || 0,
    explosionRadius: 0,
    explosionDamage: weapon.explosionDamage + p.weaponPowerBonus,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    bulletSprite: weapon.bulletSprite || "boomerang",
    trail: "orange",
    hitEffect: "normal",
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    spinSeed: Math.random() * TAU,
    spinRate: 11,
    hitIds: new Set(),
    hitCooldowns: new Map(),
  });
}

function fireMine(weapon, angle) {
  const p = game.player;
  const count = Math.max(1, Math.round(weapon.projectiles || 1));
  const maxMines = Math.max(count, Math.round(weapon.maxMines || 8));
  const existing = game.bullets.filter((bullet) => bullet.kind === "mine" && bullet.weaponId === weapon.id);
  const overflow = existing.length + count - maxMines;
  if (overflow > 0) {
    let removed = 0;
    game.bullets = game.bullets.filter((bullet) => {
      if (removed < overflow && bullet.kind === "mine" && bullet.weaponId === weapon.id) {
        removed += 1;
        return false;
      }
      return true;
    });
  }
  const backAngle = Math.atan2(-(p.facingY ?? Math.sin(angle)), -(p.facingX ?? Math.cos(angle)));
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * 26;
    const side = backAngle + Math.PI / 2;
    const x = p.x + Math.cos(backAngle) * 42 + Math.cos(side) * offset;
    const y = p.y + Math.sin(backAngle) * 42 + Math.sin(side) * offset;
    game.bullets.push({
      kind: "mine",
      weaponId: weapon.id,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: game.elapsed,
      radius: weapon.radius,
      damage: 0,
      life: weapon.life || 10,
      maxLife: weapon.life || 10,
      armingTime: weapon.armingTime || 0.35,
      explosionRadius: weapon.explosionRadius,
      explosionDamage: weapon.explosionDamage + p.weaponPowerBonus,
      critChance: weapon.critChance || 0,
      critMultiplier: weapon.critMultiplier || 1.75,
      freezeChance: weapon.freezeChance || 0,
      freezeSlow: weapon.freezeSlow || 0.62,
      freezeDuration: weapon.freezeDuration || 1.6,
      lifeStealPerKill: weapon.lifeStealPerKill || 0,
      bulletTint: weapon.bulletTint,
      bulletGlow: weapon.bulletGlow,
      effectTint: weapon.effectTint,
      effectGlow: weapon.effectGlow,
      bulletSprite: weapon.bulletSprite || "mine",
      collides: false,
      hitIds: new Set(),
    });
  }
}

function firePoisonBottle(weapon, angle) {
  const p = game.player;
  const speed = weapon.bulletSpeed || 480;
  const life = weapon.life || Math.max(0.55, (weapon.range || 520) / speed);
  game.bullets.push({
    kind: "poisonBottle",
    x: p.x + Math.cos(angle) * 20,
    y: p.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius || 8,
    damage: 0,
    life,
    maxLife: life,
    pierce: 0,
    areaRadius: weapon.areaRadius || 100,
    duration: weapon.duration || 4.2,
    tickRate: weapon.tickRate || 3.5,
    poolDamage: weapon.damage + p.weaponPowerBonus,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: Math.max(weapon.freezeChance || 0, 1),
    freezeSlow: weapon.freezeSlow || 0.82,
    freezeDuration: weapon.freezeDuration || 0.65,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    bulletSprite: weapon.bulletSprite || "poisonBottle",
    spinSeed: Math.random() * TAU,
    spinRate: 5,
    collides: true,
    hitIds: new Set(),
  });
}


function firePulseBomb(weapon) {
  const p = game.player;
  const bonus = p.weaponPowerBonus;
  const duration = Math.max(0.6, weapon.duration || 4.5);
  const pulseInterval = weapon.tickRate > 0 ? 1 / weapon.tickRate : 1.0;
  const fuse = Math.max(0, weapon.fuse ?? 0.4);
  game.bullets.push({
    kind: "pulseBomb",
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    angle: game.elapsed,
    radius: weapon.radius,
    damage: 0,
    life: duration,
    maxLife: duration,
    pulseTimer: fuse,
    pulseInterval,
    pierce: 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: (weapon.explosionDamage || 0) + bonus,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    collides: false,
    hitIds: new Set(),
  });
  addEffect({
    type: "burst",
    x: p.x,
    y: p.y,
    radius: 28,
    life: 0.2,
    maxLife: 0.2,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function fireOrbit(weapon) {
  const p = game.player;
  const spin = game.elapsed * (weapon.orbitSpeed || 4.2) + weapon.id * 1.73;
  const orbitRadius = weapon.orbitRadius || 78;
  const areaRadius = weapon.areaRadius || 34;
  const x = p.x + Math.cos(spin) * orbitRadius;
  const y = p.y + Math.sin(spin) * orbitRadius;
  const hits = damageEnemiesInRadius(x, y, areaRadius, weapon.damage + p.weaponPowerBonus, 0.72, weapon);
  if (hits > 0) {
    addEffect({
      type: "burst",
      x,
      y,
      radius: areaRadius * 0.9,
      life: 0.22,
      maxLife: 0.22,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
    addSparks(x, y, 3, 130);
  }
}

function fireSword(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 14;
  const originY = p.y + Math.sin(angle) * 14;
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus, weapon);

  weapon.swingCount = (weapon.swingCount || 0) + 1;
  const swingDir = weapon.swingCount % 2 === 0 ? 1 : -1;
  addEffect({
    type: "slash",
    x: originX,
    y: originY,
    angle,
    range: weapon.range,
    cone: weapon.cone,
    swingDir,
    life: 0.2,
    maxLife: 0.2,
    glow: weapon.effectGlow || "glowAmber",
    tint: weapon.effectTint || [0.95, 0.9, 0.78],
  });

  const cone = weapon.cone;
  const baseTint = weapon.effectTint || [0.74, 0.96, 1];
  const glow = weapon.effectGlow || "glowCyan";
  const segments = 8;

  const drawArc = (radius, width, life, tint, glowName, lifeStagger = 0) => {
    for (let i = 0; i < segments; i += 1) {
      const tA = i / segments - 0.5;
      const tB = (i + 1) / segments - 0.5;
      const arcA = angle + tA * cone * 2;
      const arcB = angle + tB * cone * 2;
      const lead = swingDir > 0 ? i : segments - 1 - i;
      addEffect({
        type: "line",
        x1: originX + Math.cos(arcA) * radius,
        y1: originY + Math.sin(arcA) * radius,
        x2: originX + Math.cos(arcB) * radius,
        y2: originY + Math.sin(arcB) * radius,
        width,
        life: life + lead * lifeStagger,
        maxLife: life + lead * lifeStagger,
        glow: glowName || glow,
        tint,
      });
    }
  };

  drawArc(weapon.range * 0.94, 10, 0.14, [baseTint[0] * 0.78, baseTint[1] * 0.9, baseTint[2]], glow, 0.004);
  drawArc(weapon.range * 0.78, 4, 0.1, [0.96, 1, 1], "glowCyan", 0.004);

  const leadingT = swingDir > 0 ? 0.5 : -0.5;
  const leadingAngle = angle + leadingT * cone * 2;
  const tipX = originX + Math.cos(leadingAngle) * weapon.range;
  const tipY = originY + Math.sin(leadingAngle) * weapon.range;

  addEffect({
    type: "line",
    x1: originX,
    y1: originY,
    x2: tipX,
    y2: tipY,
    width: 5,
    life: 0.1,
    maxLife: 0.1,
    glow: "glowCyan",
    tint: [1, 1, 1],
  });
  addEffect({
    type: "burst",
    x: tipX,
    y: tipY,
    radius: 22,
    life: 0.18,
    maxLife: 0.18,
    glow,
    tint: baseTint,
  });
  addEffect({
    type: "burst",
    x: originX,
    y: originY,
    radius: 18,
    life: 0.12,
    maxLife: 0.12,
    glow: "glowCyan",
    tint: [1, 1, 1],
  });
  addSparks(tipX, tipY, 4, 140);
}

function fireChain(weapon, target) {
  const p = game.player;
  const blocked = new Set();
  let fromX = p.x;
  let fromY = p.y;
  let enemy = target;
  let jumps = 0;
  const maxJumps = weapon.chainCount + 1;

  while (enemy && jumps < maxJumps) {
    const falloff = Math.max(0.62, 1 - jumps * 0.12);
    addEffect({
      type: "line",
      x1: fromX,
      y1: fromY,
      x2: enemy.x,
      y2: enemy.y,
      width: 18,
      life: 0.34,
      maxLife: 0.34,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
    damageEnemy(enemy, (weapon.damage + p.weaponPowerBonus) * falloff, enemy.x, enemy.y, 3, 120, weapon);
    blocked.add(enemy.id);
    fromX = enemy.x;
    fromY = enemy.y;
    enemy = findNearestEnemyFrom(fromX, fromY, weapon.chainRange, blocked);
    jumps += 1;
  }

  removeDeadEnemies();
}
