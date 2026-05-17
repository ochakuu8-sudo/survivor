import { INITIAL_STONE_ITEM_SLOTS } from "./constants.js";
import { game } from "./state.js";
import { STONE_ITEMS, STONE_MATERIALS, STONE_SPECIAL_ITEMS, findStoneItem, findStoneMaterial, findStoneSpecialItem } from "./data/stoneItems.js";
import { restoreWeaponBaseStats } from "./weapons.js";

const PLAYER_BASE_STAT_KEYS = ["maxHp", "speed", "pickup", "armor", "barrierMax", "weaponPowerBonus"];
export const STONE_EVOLUTIONS = [
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
  {
    key: "rollingBoulder",
    name: "転がる巨岩",
    progress: [{ key: "rollingStone", need: 2 }, { key: "heavyStone", need: 2 }],
    when: (counts) => (counts.rollingStone || 0) >= 2 && (counts.heavyStone || 0) >= 2,
    apply: (weapon) => {
      weapon.name = "転がる巨岩";
      weapon.rollingStone = Math.max(weapon.rollingStone || 0, 2);
      weapon.radius *= 1.18;
      weapon.knockback += 18;
      weapon.splitSpawnLimit = Math.max(weapon.splitSpawnLimit || 10, 12);
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "heavy", trail: "none", hitEffect: "heavy" };
      weapon.bulletSprite = "stoneHeavy";
    },
  },
  {
    key: "gravityCore",
    name: "引力核",
    progress: [{ key: "gravityStone", need: 2 }, { key: "explosiveStone", need: 1 }],
    when: (counts) => (counts.gravityStone || 0) >= 2 && (counts.explosiveStone || 0) >= 1,
    apply: (weapon) => {
      weapon.name = "引力核";
      weapon.pullStrength = Math.max(weapon.pullStrength || 0, 4);
      weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 82);
      weapon.chainShatterChance = Math.max(weapon.chainShatterChance || 0, 0.18);
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "meteor", trail: "orange", hitEffect: "heavy" };
      weapon.effectTint = [0.7, 0.45, 1];
      weapon.effectGlow = "glowCyan";
    },
  },
  {
    key: "returningSpear",
    name: "帰還石槍",
    progress: [{ key: "returningStone", need: 2 }, { key: "piercingStone", need: 2 }],
    when: (counts) => (counts.returningStone || 0) >= 2 && (counts.piercingStone || 0) >= 2,
    apply: (weapon) => {
      weapon.name = "帰還石槍";
      weapon.returningStone = Math.max(weapon.returningStone || 0, 2);
      weapon.pierce = Math.max(weapon.pierce || 0, 4);
      weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "sharp", trail: "white", hitEffect: "pierce" };
      weapon.bulletSprite = "stoneSharp";
    },
  },

];

export function isStoneWeapon(weapon) {
  return (weapon?.baseName || weapon?.name) === "石" || ["石ころ", "ゴムボール", "隕石核", "名人の一石", "転がる巨岩", "引力核", "帰還石槍"].includes(weapon?.name);
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
  return !!weapon;
}

export function addStoneItemToWeapon(weapon, key) {
  const definition = findStoneItem(key);
  if (!weapon || !definition) return false;
  ensureStoneItemSlots(weapon);
  weapon.items.push({ key: definition.key });
  recomputeStoneItems(weapon, game.player, { gainedKey: key });
  return true;
}

export function pickStoneItemChoices(count = 3, { includeRareSpecial = true } = {}) {
  const pool = includeRareSpecial && Math.random() < 0.08 ? [...STONE_MATERIALS, ...STONE_SPECIAL_ITEMS] : [...STONE_MATERIALS];
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

export function ensureStoneMaterialInventory() {
  if (!game.stoneMaterials || typeof game.stoneMaterials !== "object") game.stoneMaterials = {};
  STONE_MATERIALS.forEach((material) => {
    if (!Number.isFinite(game.stoneMaterials[material.key])) game.stoneMaterials[material.key] = 0;
  });
  return game.stoneMaterials;
}

function getEquippedStoneWeapon() {
  return (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon)) || null;
}

function recomputeEquippedStoneItems(options = {}) {
  const stoneWeapon = getEquippedStoneWeapon();
  if (!stoneWeapon) return false;
  recomputeStoneItems(stoneWeapon, game.player, options);
  return true;
}

export function addStoneMaterial(key, amount = 1) {
  const material = findStoneMaterial(key);
  if (!material) return false;
  const inventory = ensureStoneMaterialInventory();
  inventory[key] = Math.max(0, (inventory[key] || 0) + amount);
  recomputeEquippedStoneItems({ gainedKey: key });
  return true;
}

export function canCraftStoneSpecial(key) {
  const special = findStoneSpecialItem(key);
  if (!special?.recipe?.length) return false;
  const inventory = ensureStoneMaterialInventory();
  const needs = recipeCounts(special.recipe);
  return Object.entries(needs).every(([materialKey, need]) => (inventory[materialKey] || 0) >= need);
}

export function craftStoneSpecial(key) {
  const special = findStoneSpecialItem(key);
  if (!special || !canCraftStoneSpecial(key)) return null;
  const inventory = ensureStoneMaterialInventory();
  Object.entries(recipeCounts(special.recipe)).forEach(([materialKey, need]) => {
    inventory[materialKey] = Math.max(0, (inventory[materialKey] || 0) - need);
  });
  recomputeEquippedStoneItems();
  return special;
}

export function stoneItemIcon(itemOrCategory) {
  const category = typeof itemOrCategory === "string" ? itemOrCategory : itemOrCategory?.category;
  const key = typeof itemOrCategory === "string" ? null : itemOrCategory?.key;
  const keyIcons = {
    powerMaterial: "力",
    frequencyMaterial: "速",
    durationMaterial: "時",
    speedMaterial: "弾",
    sizeMaterial: "大",
    hpMaterial: "HP",
  };
  if (key && keyIcons[key]) return keyIcons[key];
  const icons = {
    material: "●",
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

export function formatStoneItemEffectSummary(item) {
  if (!item) return "効果なし";
  const parts = [];
  const labels = {
    damage: "ダメージ",
    fireRate: "攻撃頻度",
    range: "射程",
    life: "持続",
    bulletSpeed: "弾速",
    radius: "サイズ",
    knockbackFlat: "ノックバック",
    explosionRadius: "爆発範囲",
    maxHpFlat: "最大HP",
    speed: "移動速度",
    pickupFlat: "回収範囲",
    armor: "防御",
    barrierMax: "バリア",
    weaponPowerBonus: "武器威力",
  };
  Object.entries(item.statBonus || {}).forEach(([stat, value]) => {
    const label = labels[stat] || stat;
    if (Math.abs(value) > 0 && Math.abs(value) < 1) parts.push(`${label}+${Math.round(value * 100)}%`);
    else parts.push(`${label}+${value}`);
  });
  const behaviorLabels = {
    ricochetCount: "跳弾",
    pierce: "貫通",
    explosionDamage: "爆発",
    returning: "帰還",
    rolling: "転がり",
    deployHazard: "設置",
    pullStrength: "引力",
    frost: "凍結",
    fuseTrail: "導火",
    orbit: "衛星",
    criticalChance: "会心",
    multishot: "多投",
    haste: "加速",
    heavy: "重量",
    lifesteal: "吸命",
    echo: "反響",
    sniper: "狙撃",
    barrier: "バリア",
  };
  if (item.behavior?.effect) parts.push(behaviorLabels[item.behavior.effect] || item.behavior.effect);
  return parts.length ? parts.join(" / ") : (item.description || "効果なし");
}

export function recipeCounts(recipe = []) {
  return recipe.reduce((counts, key) => {
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function recipeShortText(recipe = []) {
  return Object.entries(recipeCounts(recipe))
    .map(([key, count]) => `${findStoneItem(key)?.shortName || findStoneItem(key)?.name || key}${count > 1 ? `×${count}` : ""}`)
    .join(" + ");
}

export function missingRecipeText(recipe = []) {
  const inventory = ensureStoneMaterialInventory();
  const missing = Object.entries(recipeCounts(recipe))
    .filter(([key, need]) => (inventory[key] || 0) < need)
    .map(([key, need]) => `${findStoneItem(key)?.shortName || key} ${inventory[key] || 0}/${need}`);
  return missing.length ? missing.join("、") : "作成可能";
}

function applyStatBonus(weapon, player, statBonus = {}) {
  Object.entries(statBonus || {}).forEach(([stat, value]) => {
    const amount = Number(value) || 0;
    if (stat === "damage") weapon.damage *= 1 + amount;
    else if (stat === "fireRate") weapon.fireRate = Math.min(5.5, weapon.fireRate * (1 + amount));
    else if (stat === "range") weapon.range *= 1 + amount;
    else if (stat === "life") weapon.life *= 1 + amount;
    else if (stat === "bulletSpeed") weapon.bulletSpeed *= 1 + amount;
    else if (stat === "radius") weapon.radius *= 1 + amount;
    else if (stat === "knockbackFlat") weapon.knockback += amount;
    else if (stat === "explosionRadius") weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, (weapon.explosionRadius || 0) + amount);
    else if (stat === "maxHpFlat") player.maxHp += amount;
    else if (stat === "pickupFlat") player.pickup += amount;
  });
}

function applyStoneMaterialBonuses(weapon, player) {
  const inventory = ensureStoneMaterialInventory();
  STONE_MATERIALS.forEach((material) => {
    const owned = Math.max(0, Math.floor(inventory[material.key] || 0));
    for (let i = 0; i < owned; i += 1) {
      applyStatBonus(weapon, player, material.statBonus);
    }
  });
}

export function recomputeStoneItems(weapon, player = game.player, { gainedKey = null } = {}) {
  if (!weapon || !player) return;
  ensureStoneItemSlots(weapon);
  restoreWeaponBaseStats(weapon);
  ensureStoneItemSlots(weapon);
  restorePlayerBaseStats();
  const counts = countItemsByKey(weapon.items);

  applyStoneMaterialBonuses(weapon, player);

  weapon.items.forEach((item) => {
    const definition = findStoneItem(item?.key);
    if (definition?.statBonus) applyStatBonus(weapon, player, definition.statBonus);
  });

  applyStoneBehaviorItems(weapon, counts);

  if (gainedKey === "barrierStone") player.barrier = (player.barrier || 0) + 1;
  player.hp = Math.min(player.hp, player.maxHp);
  player.barrier = Math.min(player.barrier || 0, player.barrierMax || 0);

  checkStoneEvolution(weapon, counts);
}

function applyStoneBehaviorItems(weapon, counts) {
  weapon.projectiles = Math.min(7, weapon.projectiles + (counts.multiThrow || 0));
  weapon.pierce = Math.min(8, (weapon.pierce || 0) + (counts.piercingStone || 0));
  weapon.ricochetCount = Math.min(8, weapon.ricochetCount + (counts.bounceStone || 0));
  if ((counts.explosiveStone || 0) > 0) {
    weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 58 + 8 * ((counts.explosiveStone || 0) - 1));
    weapon.explosionDamage = weapon.damage * 0.35 * counts.explosiveStone;
  }
  weapon.burnDamage = weapon.damage * 0.2 * (counts.lavaStone || 0);
  weapon.freezeChance = Math.min(1, weapon.freezeChance + 0.12 * (counts.frostStone || 0));
  weapon.critChance = Math.min(1, weapon.critChance + 0.1 * (counts.critStone || 0));
  weapon.eliteBossBonus = (weapon.eliteBossBonus || 0) + 0.2 * (counts.sniperStone || 0);
  weapon.pullStrength = Math.min(8, (weapon.pullStrength || 0) + (counts.gravityStone || 0));
  weapon.lifeStealPerKill += counts.drainStone || 0;
  weapon.knockback += 6 * (counts.heavyStone || 0);
  if ((counts.heavyStone || 0) > 0) {
    weapon.stoneVisual = { ...(weapon.stoneVisual || {}), form: "heavy", hitEffect: "heavy" };
    weapon.bulletSprite = weapon.bulletSprite || "stoneHeavy";
  }
  if ((counts.barrierStone || 0) > 0) {
    game.player.barrierMax += counts.barrierStone || 0;
  }
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
  return stoneItemIcon(category);
}

export function formatStoneItemSummary(weapon) {
  const counts = countItemsByKey(weapon?.items || []);
  const entries = STONE_ITEMS.filter((item) => counts[item.key] > 0).map((item) => `${stoneItemCategoryIcon(item.category)}${item.name} x${counts[item.key]}`);
  return entries.length ? entries.join(" / ") : "アイテムなし";
}
