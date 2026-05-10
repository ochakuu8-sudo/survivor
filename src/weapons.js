import { FIXED_RELOAD_SECONDS, TAU, WEAPON_STAT_KEYS, getWeaponMaxLevel } from "./constants.js";
import { game, nextWeaponId } from "./state.js";
import { distanceToSegmentSq, distSq } from "./utils/math.js";
import { addEffect, addSparks } from "./effects.js";
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
  豆鉄砲: [
    {
      key: "rapid",
      prefix: "連射式",
      text: (power) => `攻撃頻度 +${percent(0.18, power)}`,
      apply: (weapon, power) => { weapon.fireRate *= 1 + 0.18 * power; },
    },
    {
      key: "long",
      prefix: "長銃身",
      text: (power) => `射程 +${percent(0.18, power)}`,
      apply: (weapon, power) => {
        weapon.range *= 1 + 0.18 * power;
        weapon.life *= 1 + 0.1 * power;
      },
    },
    {
      key: "large",
      prefix: "大粒",
      text: (power) => `威力 +${percent(0.16, power)}`,
      apply: (weapon, power) => {
        weapon.damage *= 1 + 0.16 * power;
        weapon.radius += 1 + power;
      },
    },
    {
      key: "stable",
      prefix: "安定型",
      text: (power) => `拡散 -${percent(0.22, power)}`,
      apply: (weapon, power) => { weapon.spread *= Math.max(0.04, 1 - 0.22 * power); },
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
    const integers = new Set(["projectiles", "pierce", "chainCount", "orbitCount", "ammoCapacity"]);
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
  const usesAmmo = template.usesAmmo ?? kind !== "orbit";
  const fuelMode = !!template.fuelMode;
  const ammoCapacity = usesAmmo
    ? fuelMode
      ? Math.max(0.5, template.ammoCapacity || 8)
      : Math.max(1, Math.round(template.ammoCapacity || 8))
    : 0;
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
    usesAmmo,
    fuelMode,
    ammoCapacity,
    ammo: usesAmmo
      ? Math.min(ammoCapacity, Math.max(0, fuelMode ? (template.ammo ?? ammoCapacity) : Math.round(template.ammo ?? ammoCapacity)))
      : 0,
    reloadTime: usesAmmo ? FIXED_RELOAD_SECONDS : 0,
    reloadTimer: 0,
    reloading: false,
    critChance: template.critChance || 0,
    critMultiplier: template.critMultiplier || 1.75,
    freezeChance: template.freezeChance || 0,
    freezeSlow: template.freezeSlow || 0.62,
    freezeDuration: template.freezeDuration || 1.6,
    lifeStealPerKill: template.lifeStealPerKill || 0,
    ricochetCount: template.ricochetCount || 0,
    ricochetRange: template.ricochetRange || 220,
    ricochetSplitCount: template.ricochetSplitCount || 1,
    radialFlame: !!template.radialFlame,
    orbitCount: template.orbitCount || 1,
    orbitPushOut: template.orbitPushOut || 0,
    bulletTint: template.bulletTint ? [...template.bulletTint] : [1, 1, 1],
    bulletGlow: template.bulletGlow || "glowAmber",
    effectTint: template.effectTint ? [...template.effectTint] : [1, 1, 1],
    effectGlow: template.effectGlow || "glowAmber",
    bulletSprite: template.bulletSprite || null,
    shootTimer: template.shootTimer ?? 0.45,
    attachments: [],
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

export function weaponUsesAmmo(weapon) {
  return !!weapon && weapon.usesAmmo !== false && weapon.kind !== "orbit";
}

function startWeaponReload(weapon) {
  if (!weaponUsesAmmo(weapon) || weapon.reloading) return;
  weapon.reloadTime = FIXED_RELOAD_SECONDS;
  weapon.reloadTimer = FIXED_RELOAD_SECONDS;
  weapon.reloading = true;
}

function completeWeaponReload(weapon) {
  weapon.ammo = weapon.fuelMode
    ? Math.max(0.5, weapon.ammoCapacity || 1)
    : Math.max(1, Math.round(weapon.ammoCapacity || 1));
  weapon.reloadTimer = 0;
  weapon.reloading = false;
}

export function weaponAmmoLabel(weapon) {
  if (!weapon) return "武器なし";
  if (!weaponUsesAmmo(weapon)) return "弾薬なし";
  if (weapon.reloading) return `${weapon.fuelMode ? "補給" : "リロード"} ${Math.max(0, weapon.reloadTimer || 0).toFixed(1)}秒`;
  if (weapon.fuelMode) {
    return `燃料 ${Math.max(0, weapon.ammo || 0).toFixed(1)}秒/${Math.max(0.5, weapon.ammoCapacity || 1).toFixed(0)}秒`;
  }
  return `弾薬 ${Math.max(0, Math.ceil(weapon.ammo || 0))}/${Math.max(1, Math.round(weapon.ammoCapacity || 1))}`;
}

export function weaponKindLabel(weapon) {
  const labels = {
    projectile: "投射",
    flame: "火炎",
    laser: "レーザー",
    sustainedLaser: "設置レーザー",
    bomb: "爆発",
    timedBomb: "時限爆弾",
    chain: "電撃",
    orbit: "回転",
    sword: "斬撃",
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
    if (!weaponUsesAmmo(weapon)) continue;

    weapon.reloadTime = FIXED_RELOAD_SECONDS;
    weapon.ammoCapacity = weapon.fuelMode
      ? Math.max(0.5, weapon.ammoCapacity || 1)
      : Math.max(1, Math.round(weapon.ammoCapacity || 1));
    weapon.ammo = Math.min(
      weapon.ammoCapacity,
      Math.max(0, weapon.fuelMode ? (weapon.ammo ?? weapon.ammoCapacity) : Math.round(weapon.ammo ?? weapon.ammoCapacity)),
    );

    if (weapon.reloading) {
      weapon.reloadTimer = Math.max(0, (weapon.reloadTimer || 0) - dt);
      if (weapon.reloadTimer <= 0) completeWeaponReload(weapon);
    } else if (weapon.ammo <= 0) {
      startWeaponReload(weapon);
    }
  }
}

export function boostWeaponImpact(weapon, amount) {
  weapon.damage += amount;
  if (weapon.explosionRadius > 0) weapon.explosionDamage += amount * 1.35;
}

export function extendWeaponReach(weapon, multiplier) {
  weapon.range *= multiplier;
  if (weapon.bulletSpeed > 1) {
    weapon.bulletSpeed *= multiplier;
    weapon.life *= 1 + (multiplier - 1) * 0.45;
  }
  if (weapon.kind === "sustainedLaser") weapon.duration *= 1 + (multiplier - 1) * 0.75;
  if (weapon.orbitRadius > 0) weapon.orbitRadius *= 1 + (multiplier - 1) * 0.65;
  if (weapon.kind === "chain") weapon.chainRange *= 1 + (multiplier - 1) * 0.7;
}

export function addWeaponPierce(weapon, amount = 1) {
  const rounded = Math.max(1, Math.round(amount));
  weapon.pierce += rounded;
  if (weapon.kind === "laser") weapon.lineWidth += 3 + rounded;
  if (weapon.kind === "sustainedLaser") weapon.lineWidth += 4 + rounded;
  if (weapon.kind === "flame") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "sword") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "chain") weapon.chainCount += rounded;
  if (weapon.explosionRadius > 0) weapon.explosionRadius += 12 + rounded * 6;
  if (weapon.areaRadius > 0) weapon.areaRadius += 8 + rounded * 4;
  if (weapon.kind === "projectile") weapon.radius += Math.max(1, Math.round(rounded * 0.65));
}

export function expandWeaponArea(weapon, power) {
  const areaBoost = 1 + 0.08 * power;
  if (weapon.explosionRadius > 0) weapon.explosionRadius *= areaBoost;
  if (weapon.areaRadius > 0) weapon.areaRadius *= areaBoost;
  if (weapon.kind === "laser" || weapon.kind === "sustainedLaser") weapon.lineWidth *= areaBoost;
  if (weapon.kind === "flame" || weapon.kind === "sword") weapon.cone = Math.min(1.08, weapon.cone + 0.05 * power);
  if (weapon.radius > 0) weapon.radius += power;
}

const TARGETLESS_KINDS = new Set(["flame", "sword"]);

export function autoShoot() {
  const p = game.player;
  const weapon = getActiveWeapon(p);

  if (!weapon || weapon.kind === "orbit") return;
  if (weapon.shootTimer > 0) return;
  if (weaponUsesAmmo(weapon)) {
    if (weapon.reloading || (weapon.ammo || 0) <= 0) {
      startWeaponReload(weapon);
      return;
    }
  }

  let target = null;
  if (TARGETLESS_KINDS.has(weapon.kind)) {
    // Always fire on cooldown; direction comes from facing or self-position.
  } else {
    if (game.enemies.length === 0) return;
    target = findTargetForWeapon(p, weapon);
    if (!target) return;
  }

  fireWeapon(weapon, target);
  if (weaponUsesAmmo(weapon)) {
    const ammoCost = weapon.fuelMode ? 1 / Math.max(0.1, weapon.fireRate || 1) : 1;
    weapon.ammo = Math.max(0, (weapon.ammo || 0) - ammoCost);
    if (weapon.ammo <= 0) startWeaponReload(weapon);
  }
  weapon.shootTimer = 1 / weapon.fireRate;
  game.shake = Math.max(game.shake, weapon.kick);
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

function findTargetForWeapon(player, weapon) {
  let best = null;
  let bestDistance = Math.pow(weapon.range || (weapon.bulletSpeed || 690) * (weapon.life || 0.72), 2);
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = distSq(player.x, player.y, enemy.x, enemy.y);
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
      ? Math.atan2(target.y - p.y, target.x - p.x)
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

function fireProjectileWeapon(weapon, angle) {
  const count = Math.max(1, Math.round(weapon.projectiles || 1));
  const spread = count === 1 ? 0 : MULTI_PROJECTILE_STEP;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * spread;
    const jitter = count === 1 && weapon.jitter > 0 ? (Math.random() - 0.5) * weapon.jitter : 0;
    fireBullet(angle + offset + jitter, weapon);
  }
}

function fireBullet(angle, weapon) {
  const p = game.player;
  const speed = weapon.bulletSpeed;
  const bonus = p.weaponPowerBonus;
  const tumbles = !!weapon.bulletSprite;
  game.bullets.push({
    kind: "projectile",
    x: p.x + Math.cos(angle) * 25,
    y: p.y + Math.sin(angle) * 25,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius,
    damage: weapon.damage + bonus,
    life: weapon.life,
    maxLife: weapon.life,
    pierce: weapon.pierce,
    knockback: weapon.knockback || 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + bonus,
    critChance: weapon.critChance || 0,
    critMultiplier: weapon.critMultiplier || 1.75,
    freezeChance: weapon.freezeChance || 0,
    freezeSlow: weapon.freezeSlow || 0.62,
    freezeDuration: weapon.freezeDuration || 1.6,
    lifeStealPerKill: weapon.lifeStealPerKill || 0,
    ricochetCount: weapon.ricochetCount || 0,
    ricochetRange: weapon.ricochetRange || 220,
    ricochetSplitCount: weapon.ricochetSplitCount || 1,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    bulletSprite: weapon.bulletSprite || null,
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
  const placeX = p.x + Math.cos(angle) * 18;
  const placeY = p.y + Math.sin(angle) * 18;
  const fuse = Math.max(0.45, weapon.fuse || weapon.life || 2);
  game.bullets.push({
    kind: "timedBomb",
    x: placeX,
    y: placeY,
    vx: 0,
    vy: 0,
    angle: game.elapsed,
    radius: weapon.radius,
    damage: 0,
    life: fuse,
    maxLife: fuse,
    pierce: 0,
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
    collides: false,
    hitIds: new Set(),
  });
  addEffect({
    type: "burst",
    x: placeX,
    y: placeY,
    radius: 24,
    life: 0.18,
    maxLife: 0.18,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
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

  const cone = weapon.cone;
  const baseTint = weapon.effectTint || [0.74, 0.96, 1];
  const glow = weapon.effectGlow || "glowCyan";
  const segments = 10;
  weapon.swingCount = (weapon.swingCount || 0) + 1;
  const swingDir = weapon.swingCount % 2 === 0 ? 1 : -1;

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

  drawArc(weapon.range * 0.96, 20, 0.18, [baseTint[0] * 0.7, baseTint[1] * 0.85, baseTint[2] * 0.95], glow, 0.005);
  drawArc(weapon.range * 0.84, 11, 0.16, baseTint, glow, 0.006);
  drawArc(weapon.range * 0.72, 4, 0.12, [0.96, 1, 1], "glowCyan", 0.006);

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
