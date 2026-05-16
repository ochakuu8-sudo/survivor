import { INITIAL_STONE_ITEM_SLOTS } from "./constants.js";
import { game } from "./state.js";
import { STONE_ITEMS, findStoneItem } from "./data/stoneItems.js";
import { restoreWeaponBaseStats } from "./weapons.js";

const PLAYER_BASE_STAT_KEYS = ["maxHp", "speed", "pickup", "armor", "barrierMax", "weaponPowerBonus"];
const STONE_EVOLUTIONS = [
  {
    key: "rubberBall",
    name: "ゴムボール",
    progress: [{ key: "bounceStone", need: 3 }],
    when: (counts) => (counts.bounceStone || 0) >= 3,
    apply: (weapon) => {
      weapon.name = "ゴムボール";
      weapon.ricochetSplitCount = Math.max(weapon.ricochetSplitCount || 1, 2);
      weapon.splitShardCount = Math.max(weapon.splitShardCount || 0, 1);
      weapon.splitSpawnLimit = Math.max(weapon.splitSpawnLimit || 10, 14);
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "rubber", trail: "yellow", hitEffect: "heavy" };
      weapon.bulletTint = [0.95, 0.86, 0.45];
      weapon.bulletGlow = "glowAmber";
      weapon.bulletSprite = "stoneRound";
    },
  },
  {
    key: "meteorCore",
    name: "隕石核",
    progress: [{ key: "explosiveStone", need: 3 }],
    when: (counts) => (counts.explosiveStone || 0) >= 3,
    apply: (weapon) => {
      weapon.name = "隕石核";
      weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 92);
      weapon.explosionDamage *= 1.25;
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "meteor", trail: "orange", hitEffect: "heavy" };
      weapon.bulletTint = [1, 0.34, 0.18];
      weapon.bulletGlow = "glowRed";
      weapon.effectTint = [1, 0.34, 0.18];
      weapon.effectGlow = "glowRed";
    },
  },
  {
    key: "masterStone",
    name: "名人の一石",
    progress: [{ key: "critStone", need: 2 }, { key: "sniperStone", need: 2 }],
    when: (counts) => (counts.critStone || 0) >= 2 && (counts.sniperStone || 0) >= 2,
    apply: (weapon) => {
      weapon.name = "名人の一石";
      weapon.masterStoneInterval = Math.min(8, weapon.masterStoneInterval || 8);
      weapon.masterStoneTimer = Math.min(weapon.masterStoneTimer ?? weapon.masterStoneInterval, weapon.masterStoneInterval);
      weapon.masterStoneDamageScale = Math.max(weapon.masterStoneDamageScale || 0, 3.6);
      weapon.masterStoneEliteBossBonus = Math.max(weapon.masterStoneEliteBossBonus || 0, 0.6);
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "master", trail: "white", hitEffect: "critical" };
      weapon.bulletTint = [1, 1, 0.92];
      weapon.bulletGlow = "glowCyan";
      weapon.bulletSprite = "stoneMaster";
    },
  },
];

export function isStoneWeapon(weapon) {
  return (weapon?.baseName || weapon?.name) === "石" || ["石ころ", "ゴムボール", "隕石核", "名人の一石"].includes(weapon?.name);
}

export function ensureStoneItemSlots(weapon) {
  if (!weapon) return null;
  if (!Array.isArray(weapon.items)) weapon.items = [];
  weapon.itemSlots = Math.max(1, weapon.itemSlots || INITIAL_STONE_ITEM_SLOTS);
  return weapon.items;
}

export function countItemsByKey(items = []) {
  return items.reduce((counts, item) => {
    if (item?.key) counts[item.key] = (counts[item.key] || 0) + 1;
    return counts;
  }, {});
}

function restorePlayerBaseStats() {
  const player = game.player;
  if (!player?.baseStats) return;
  PLAYER_BASE_STAT_KEYS.forEach((key) => {
    if (player.baseStats[key] !== undefined) player[key] = player.baseStats[key];
  });
}

function count(weapon, key) {
  return countItemsByKey(weapon.items || [])[key] || 0;
}

export function stoneItemCount(weapon, key) {
  return count(weapon, key);
}

export function stoneItemCapacity(weapon) {
  return Math.max(1, weapon?.itemSlots || INITIAL_STONE_ITEM_SLOTS);
}

export function hasStoneItemSpace(weapon) {
  ensureStoneItemSlots(weapon);
  return (weapon.items?.length || 0) < stoneItemCapacity(weapon);
}

export function addStoneItemToWeapon(weapon, key, slotIndex = null) {
  const definition = findStoneItem(key);
  if (!weapon || !definition) return false;
  ensureStoneItemSlots(weapon);
  const item = { key: definition.key };
  if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < stoneItemCapacity(weapon)) {
    weapon.items[slotIndex] = item;
  } else if (hasStoneItemSpace(weapon)) {
    weapon.items.push(item);
  } else {
    return false;
  }
  recomputeStoneItems(weapon, game.player, { gainedKey: key });
  return true;
}

export function pickStoneItemChoices(count = 3) {
  const pool = [...STONE_ITEMS];
  const choices = [];
  while (pool.length > 0 && choices.length < count) {
    const total = pool.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let roll = Math.random() * total;
    const index = pool.findIndex((item) => {
      roll -= item.weight ?? 1;
      return roll <= 0;
    });
    choices.push(pool.splice(index < 0 ? pool.length - 1 : index, 1)[0]);
  }
  return choices;
}

export function recomputeStoneItems(weapon, player = game.player, { gainedKey = null } = {}) {
  if (!weapon || !player) return;
  ensureStoneItemSlots(weapon);
  restoreWeaponBaseStats(weapon);
  ensureStoneItemSlots(weapon);
  restorePlayerBaseStats();
  const counts = countItemsByKey(weapon.items);

  weapon.damage *= 1 + 0.15 * (counts.sharpEdge || 0);
  weapon.fireRate = Math.min(5.5, weapon.fireRate * (1 + 0.08 * (counts.quickThrow || 0)));
  weapon.range *= 1 + 0.12 * (counts.longThrow || 0);
  weapon.life *= 1 + 0.12 * (counts.longThrow || 0);
  weapon.bulletSpeed *= 1 + 0.12 * (counts.strongArm || 0);
  weapon.radius *= 1 + 0.1 * (counts.bigStone || 0);
  weapon.knockback += 8 * (counts.heavyStone || 0);
  weapon.projectiles = Math.min(7, weapon.projectiles + (counts.multiThrow || 0));
  weapon.ricochetCount = Math.min(8, weapon.ricochetCount + (counts.bounceStone || 0));
  if ((counts.explosiveStone || 0) > 0) {
    weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 58);
    weapon.explosionDamage = weapon.damage * 0.35 * counts.explosiveStone;
  }
  weapon.burnDamage = weapon.damage * 0.2 * (counts.lavaStone || 0);
  weapon.freezeChance = Math.min(1, weapon.freezeChance + 0.12 * (counts.frostStone || 0));
  weapon.critChance = Math.min(1, weapon.critChance + 0.1 * (counts.critStone || 0));
  weapon.eliteBossBonus = (weapon.eliteBossBonus || 0) + 0.2 * (counts.sniperStone || 0);
  weapon.pullStrength = Math.min(8, (weapon.pullStrength || 0) + (counts.gravityStone || 0));
  weapon.lifeStealPerKill += counts.drainStone || 0;

  applyStoneBehaviorItems(weapon, counts);

  player.maxHp += 10 * (counts.lifeStone || 0);
  player.barrierMax += counts.barrierStone || 0;
  player.pickup += 35 * (counts.magnetPowder || 0);
  player.speed += 20 * (counts.lightPowder || 0);
  if (gainedKey === "barrierStone") player.barrier = (player.barrier || 0) + 1;
  player.hp = Math.min(player.hp, player.maxHp);
  player.barrier = Math.min(player.barrier || 0, player.barrierMax || 0);

  checkStoneEvolution(weapon, counts);
}

function applyStoneBehaviorItems(weapon, counts) {
  const returning = counts.returningStone || 0;
  if (returning > 0) {
    weapon.returningStone = returning;
    weapon.returnTimeScale = Math.max(0.42, 0.58 - returning * 0.06);
    weapon.returnLifeScale = Math.min(2.35, 1.75 + returning * 0.22);
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), trail: "white", hitEffect: "pierce" };
  }

  const echo = counts.echoStone || 0;
  if (echo > 0) {
    weapon.wallBounceCount = Math.min(5, (weapon.wallBounceCount || 0) + echo);
    weapon.wallBounceSpeedScale = Math.max(weapon.wallBounceSpeedScale || 1, 1.04 + echo * 0.04);
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), trail: "orange", hitEffect: "bounce" };
  }

  const placed = counts.placedStone || 0;
  if (placed > 0) {
    weapon.deployStoneHazard = {
      duration: Math.min(4.2, 2.2 + placed * 0.55),
      radiusScale: Math.min(2.6, 1.45 + placed * 0.24),
      damageScale: Math.min(0.42, 0.18 + placed * 0.05),
      maxActive: 14,
    };
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), hitEffect: "heavy" };
  }

  const stuck = counts.stuckStone || 0;
  if (stuck > 0) {
    weapon.stuckStone = {
      delay: Math.max(0.75, 1.85 - stuck * 0.18),
      damageScale: Math.min(1.15, 0.42 + stuck * 0.16),
    };
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "sharp", hitEffect: "pierce" };
    weapon.bulletSprite = weapon.bulletSprite || "stoneSharp";
  }

  const rolling = counts.rollingStone || 0;
  if (rolling > 0) {
    weapon.rollingStone = rolling;
    weapon.bulletSpeed *= Math.max(0.42, 0.62 - rolling * 0.04);
    weapon.life *= Math.min(2.4, 1.55 + rolling * 0.2);
    weapon.knockback += 10 + rolling * 4;
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "heavy", trail: "none", hitEffect: "heavy" };
    weapon.bulletSprite = "stoneHeavy";
  }

  const shatter = counts.shatterStone || 0;
  if (shatter > 0) {
    weapon.hitShardCount = Math.min(8, (weapon.hitShardCount || 0) + shatter * 3);
    weapon.splitSpawnLimit = Math.max(weapon.splitSpawnLimit || 10, 10 + shatter * 3);
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "cracked", trail: "yellow", hitEffect: "shatter" };
    weapon.bulletSprite = weapon.bulletSprite || "stoneCracked";
  }

  const satellite = counts.satelliteStone || 0;
  if (satellite > 0) {
    weapon.satelliteStone = {
      count: Math.min(3, satellite),
      duration: Math.min(4.6, 2.4 + satellite * 0.55),
      orbitRadius: Math.min(92, 54 + satellite * 10),
      damageScale: Math.max(0.44, 0.62 - satellite * 0.04),
    };
    weapon.fireRate = Math.min(5.5, weapon.fireRate * 1.08);
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), trail: "white", hitEffect: "heavy" };
  }

  const accelerating = counts.acceleratingStone || 0;
  if (accelerating > 0) {
    weapon.flightGrowth = {
      speedPerSecond: 0.42 + accelerating * 0.08,
      damagePerSecond: 0.28 + accelerating * 0.06,
      maxScale: Math.min(2.4, 1.55 + accelerating * 0.22),
    };
    weapon.life *= 1 + accelerating * 0.12;
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), trail: "orange" };
  }

  const fuse = counts.fuseStone || 0;
  if (fuse > 0) {
    weapon.damageTrail = {
      duration: Math.min(0.65, 0.28 + fuse * 0.08),
      damageScale: Math.min(0.42, 0.14 + fuse * 0.05),
      widthScale: Math.min(0.9, 0.45 + fuse * 0.08),
    };
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), trail: "red" };
    weapon.effectTint = [1, 0.38, 0.12];
    weapon.effectGlow = "glowRed";
  }
}

export function checkStoneEvolution(weapon, counts = countItemsByKey(weapon?.items || [])) {
  if (!weapon) return false;
  const existing = STONE_EVOLUTIONS.find((candidate) => candidate.key === weapon.evolvedStoneKey);
  if (existing) {
    existing.apply(weapon);
    return false;
  }
  const evolution = STONE_EVOLUTIONS.find((candidate) => candidate.when(counts));
  if (!evolution) return false;
  weapon.evolvedStoneKey = evolution.key;
  weapon.evolvedStoneName = evolution.name;
  evolution.apply(weapon);
  return true;
}

export function applyStoneEvolutionByName(weapon, evolutionName) {
  if (!weapon || !evolutionName) return false;
  const evolution = STONE_EVOLUTIONS.find((candidate) => candidate.name === evolutionName);
  if (!evolution) return false;
  weapon.evolvedStoneKey = evolution.key;
  weapon.evolvedStoneName = evolution.name;
  evolution.apply(weapon);
  return true;
}


export function stoneEvolutionProgress(counts) {
  return STONE_EVOLUTIONS.map((evolution) => ({
    name: evolution.name,
    complete: evolution.when(counts),
    requirements: evolution.progress.map((req) => ({
      name: findStoneItem(req.key)?.name || req.key,
      count: counts[req.key] || 0,
      need: req.need,
    })),
  }));
}

function stoneItemCategoryIcon(category) {
  const icons = {
    stat: "◆",
    trajectory: "↻",
    deploy: "▣",
    shatter: "✹",
    element: "✦",
    control: "◎",
    delayed: "⌛",
    defense: "✚",
    growth: "▲",
    throwStyle: "⇉",
    special: "★",
  };
  return icons[category] || "◆";
}

export function formatStoneItemSummary(weapon) {
  const counts = countItemsByKey(weapon?.items || []);
  const entries = STONE_ITEMS.filter((item) => counts[item.key] > 0).map((item) => `${stoneItemCategoryIcon(item.category)}${item.name} x${counts[item.key]}`);
  return entries.length ? entries.join(" / ") : "アイテムなし";
}
