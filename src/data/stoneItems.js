import { t } from "../i18n.js";
export const STONE_MATERIALS = [
  {
    key: "powerMaterial",
    icon: "P",
    sprite: "materialPower",
    name: t("stone.item.powerMaterial.name"), nameKey: "stone.item.powerMaterial.name",
    shortName: t("stone.stats.damage"),
    description: t("stone.item.powerMaterial.description"), descriptionKey: "stone.item.powerMaterial.description",
    category: "material",
    tags: ["material", "damage", "explosion", "critical", "elite"],
    statBonus: { damage: 0.3 },
    behavior: null,
    uses: [t("stone.item.piercingStone.name"), t("stone.item.explosiveStone.name"), t("stone.item.critStone.name"), t("stone.item.heavyStone.name"), t("stone.item.drainStone.name"), t("stone.item.sniperStone.name"), t("stone.item.gravityStone.name")],
    weight: 1,
  },
  {
    key: "frequencyMaterial",
    icon: "F",
    sprite: "materialFrequency",
    name: t("stone.item.frequencyMaterial.name"), nameKey: "stone.item.frequencyMaterial.name",
    shortName: t("stone.stats.fireRate"),
    description: t("stone.item.frequencyMaterial.description"), descriptionKey: "stone.item.frequencyMaterial.description",
    category: "material",
    tags: ["material", "fireRate", "multi", "trail", "orbit"],
    statBonus: { fireRate: 0.3 },
    behavior: null,
    uses: [t("stone.item.fuseStone.name"), t("stone.item.satelliteStone.name"), t("stone.item.critStone.name"), t("stone.item.multiThrow.name"), t("stone.item.acceleratingStone.name")],
    weight: 1,
  },
  {
    key: "durationMaterial",
    icon: "T",
    sprite: "materialDuration",
    name: t("stone.item.durationMaterial.name"), nameKey: "stone.item.durationMaterial.name",
    shortName: t("stone.stats.life"),
    description: t("stone.item.durationMaterial.description"), descriptionKey: "stone.item.durationMaterial.description",
    category: "material",
    tags: ["material", "duration", "range", "deploy", "return"],
    statBonus: { life: 0.3, range: 0.3 },
    behavior: null,
    uses: [t("stone.item.bounceStone.name"), t("stone.item.returningStone.name"), t("stone.item.rollingStone.name"), t("stone.item.placedStone.name"), t("stone.item.frostStone.name"), t("stone.item.fuseStone.name"), t("stone.item.satelliteStone.name"), t("stone.item.echoStone.name")],
    weight: 1,
  },
  {
    key: "speedMaterial",
    icon: "S",
    sprite: "materialSpeed",
    name: t("stone.item.speedMaterial.name"), nameKey: "stone.item.speedMaterial.name",
    shortName: t("stone.stats.bulletSpeed"),
    description: t("stone.item.speedMaterial.description"), descriptionKey: "stone.item.speedMaterial.description",
    category: "material",
    tags: ["material", "speed", "pierce", "bounce", "return"],
    statBonus: { bulletSpeed: 0.3 },
    behavior: null,
    uses: [t("stone.item.bounceStone.name"), t("stone.item.piercingStone.name"), t("stone.item.returningStone.name"), t("stone.item.acceleratingStone.name"), t("stone.item.echoStone.name"), t("stone.item.sniperStone.name")],
    weight: 1,
  },
  {
    key: "sizeMaterial",
    icon: "Z",
    sprite: "materialSize",
    name: t("stone.item.sizeMaterial.name"), nameKey: "stone.item.sizeMaterial.name",
    shortName: t("stone.stats.radius"),
    description: t("stone.item.sizeMaterial.description"), descriptionKey: "stone.item.sizeMaterial.description",
    category: "material",
    tags: ["material", "size", "knockback", "area", "rolling"],
    statBonus: { radius: 0.3, knockbackFlat: 14 },
    behavior: null,
    uses: [t("stone.item.explosiveStone.name"), t("stone.item.rollingStone.name"), t("stone.item.placedStone.name"), t("stone.item.gravityStone.name"), t("stone.item.multiThrow.name"), t("stone.item.heavyStone.name"), t("stone.item.echoStone.name")],
    weight: 1,
  },
  {
    key: "hpMaterial",
    icon: "HP",
    sprite: "materialHp",
    name: t("stone.item.hpMaterial.name"), nameKey: "stone.item.hpMaterial.name",
    shortName: "HP",
    description: t("stone.item.hpMaterial.description"), descriptionKey: "stone.item.hpMaterial.description",
    category: "material",
    tags: ["material", "hp", "defense", "heal", "guard"],
    statBonus: { maxHpFlat: 18 },
    behavior: null,
    uses: [t("stone.item.returningStone.name"), t("stone.item.placedStone.name"), t("stone.item.frostStone.name"), t("stone.item.satelliteStone.name"), t("stone.item.drainStone.name"), t("stone.item.barrierStone.name")],
    weight: 1,
  },
];

export const STONE_SPECIAL_ITEMS = [
  { key: "bounceStone", name: t("stone.item.bounceStone.name"), nameKey: "stone.item.bounceStone.name", description: t("stone.item.bounceStone.description"), descriptionKey: "stone.item.bounceStone.description", category: "special", tags: ["ricochet", "targeting"], recipe: ["speedMaterial", "durationMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.2 }, behavior: { effect: "ricochetCount", value: 1 }, weight: 0.06 },
  { key: "piercingStone", name: t("stone.item.piercingStone.name"), nameKey: "stone.item.piercingStone.name", description: t("stone.item.piercingStone.description"), descriptionKey: "stone.item.piercingStone.description", category: "special", tags: ["pierce", "line", "damage"], recipe: ["powerMaterial", "speedMaterial"], statBonus: { damage: 0.2, bulletSpeed: 0.2 }, behavior: { effect: "pierce", value: 1 }, weight: 0.04 },
  { key: "explosiveStone", name: t("stone.item.explosiveStone.name"), nameKey: "stone.item.explosiveStone.name", description: t("stone.item.explosiveStone.description"), descriptionKey: "stone.item.explosiveStone.description", category: "special", tags: ["explosion", "area"], recipe: ["powerMaterial", "sizeMaterial"], statBonus: { damage: 0.2, explosionRadius: 18 }, behavior: { effect: "explosionDamage", value: 0.35 }, weight: 0.05 },
  { key: "returningStone", name: t("stone.item.returningStone.name"), nameKey: "stone.item.returningStone.name", description: t("stone.item.returningStone.description"), descriptionKey: "stone.item.returningStone.description", category: "special", tags: ["return", "boomerang", "pierce"], recipe: ["speedMaterial", "durationMaterial", "hpMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.22 }, behavior: { effect: "returning", value: 1 }, weight: 0.03 },
  { key: "rollingStone", name: t("stone.item.rollingStone.name"), nameKey: "stone.item.rollingStone.name", description: t("stone.item.rollingStone.description"), descriptionKey: "stone.item.rollingStone.description", category: "special", tags: ["rolling", "multiHit", "knockback"], recipe: ["sizeMaterial", "durationMaterial"], statBonus: { radius: 0.2, knockbackFlat: 18 }, behavior: { effect: "rolling", value: 1 }, weight: 0.03 },
  { key: "placedStone", name: t("stone.item.placedStone.name"), nameKey: "stone.item.placedStone.name", description: t("stone.item.placedStone.description"), descriptionKey: "stone.item.placedStone.description", category: "special", tags: ["trap", "lane", "defense"], recipe: ["sizeMaterial", "hpMaterial", "durationMaterial"], statBonus: { radius: 0.2, life: 0.2 }, behavior: { effect: "deployHazard", value: 1 }, weight: 0.03 },
  { key: "gravityStone", name: t("stone.item.gravityStone.name"), nameKey: "stone.item.gravityStone.name", description: t("stone.item.gravityStone.description"), descriptionKey: "stone.item.gravityStone.description", category: "special", tags: ["pull", "area", "control"], recipe: ["sizeMaterial", "durationMaterial", "powerMaterial"], statBonus: { damage: 0.2, radius: 0.2 }, behavior: { effect: "pullStrength", value: 1 }, weight: 0.03 },
  { key: "frostStone", name: t("stone.item.frostStone.name"), nameKey: "stone.item.frostStone.name", description: t("stone.item.frostStone.description"), descriptionKey: "stone.item.frostStone.description", category: "special", tags: ["ice", "slow", "defense"], recipe: ["durationMaterial", "hpMaterial"], statBonus: { life: 0.2, maxHpFlat: 18 }, behavior: { effect: "slow", value: 0.12 }, weight: 0.04 },
  { key: "fuseStone", name: t("stone.item.fuseStone.name"), nameKey: "stone.item.fuseStone.name", description: t("stone.item.fuseStone.description"), descriptionKey: "stone.item.fuseStone.description", category: "special", tags: ["trail", "line", "corridor"], recipe: ["frequencyMaterial", "durationMaterial"], statBonus: { fireRate: 0.18, life: 0.2 }, behavior: { effect: "damageTrail", value: 1 }, weight: 0.03 },
  { key: "satelliteStone", name: t("stone.item.satelliteStone.name"), nameKey: "stone.item.satelliteStone.name", description: t("stone.item.satelliteStone.description"), descriptionKey: "stone.item.satelliteStone.description", category: "special", tags: ["orbit", "guard", "hp"], recipe: ["frequencyMaterial", "durationMaterial", "hpMaterial"], statBonus: { fireRate: 0.18, maxHpFlat: 18 }, behavior: { effect: "satellite", value: 1 }, weight: 0.025 },
  { key: "critStone", name: t("stone.item.critStone.name"), nameKey: "stone.item.critStone.name", description: t("stone.item.critStone.description"), descriptionKey: "stone.item.critStone.description", category: "special", tags: ["critical", "damage"], recipe: ["powerMaterial", "frequencyMaterial"], statBonus: { damage: 0.2, fireRate: 0.18 }, behavior: { effect: "critChance", value: 0.1 }, weight: 0.04 },
  { key: "multiThrow", name: t("stone.item.multiThrow.name"), nameKey: "stone.item.multiThrow.name", description: t("stone.item.multiThrow.description"), descriptionKey: "stone.item.multiThrow.description", category: "special", tags: ["multi", "projectileCount"], recipe: ["frequencyMaterial", "sizeMaterial"], statBonus: { fireRate: 0.18, radius: 0.2 }, behavior: { effect: "projectileCount", value: 1 }, weight: 0.04 },
  { key: "heavyStone", name: t("stone.item.heavyStone.name"), nameKey: "stone.item.heavyStone.name", description: t("stone.item.heavyStone.description"), descriptionKey: "stone.item.heavyStone.description", category: "special", tags: ["knockback", "heavy", "damage"], recipe: ["sizeMaterial", "powerMaterial"], statBonus: { radius: 0.2, knockbackFlat: 22, damage: 0.18 }, behavior: { effect: "heavyHit", value: 1 }, weight: 0.04 },
  { key: "drainStone", name: t("stone.item.drainStone.name"), nameKey: "stone.item.drainStone.name", description: t("stone.item.drainStone.description"), descriptionKey: "stone.item.drainStone.description", category: "special", tags: ["heal", "kill", "hp"], recipe: ["hpMaterial", "powerMaterial"], statBonus: { maxHpFlat: 18, damage: 0.18 }, behavior: { effect: "healOnKill", value: 1 }, weight: 0.04 },
  { key: "acceleratingStone", name: t("stone.item.acceleratingStone.name"), nameKey: "stone.item.acceleratingStone.name", description: t("stone.item.acceleratingStone.description"), descriptionKey: "stone.item.acceleratingStone.description", category: "special", tags: ["speed", "growth", "damage"], recipe: ["speedMaterial", "frequencyMaterial"], statBonus: { bulletSpeed: 0.2, fireRate: 0.18 }, behavior: { effect: "flightGrowth", value: 1 }, weight: 0.03 },
  { key: "echoStone", name: t("stone.item.echoStone.name"), nameKey: "stone.item.echoStone.name", description: t("stone.item.echoStone.description"), descriptionKey: "stone.item.echoStone.description", category: "special", tags: ["wall", "bounce", "dungeon"], recipe: ["speedMaterial", "sizeMaterial", "durationMaterial"], statBonus: { bulletSpeed: 0.2, life: 0.2 }, behavior: { effect: "wallBounce", value: 1 }, weight: 0.03 },
  { key: "sniperStone", name: t("stone.item.sniperStone.name"), nameKey: "stone.item.sniperStone.name", description: t("stone.item.sniperStone.description"), descriptionKey: "stone.item.sniperStone.description", category: "special", tags: ["elite", "boss", "damage"], recipe: ["powerMaterial", "speedMaterial", "powerMaterial"], statBonus: { damage: 0.24, bulletSpeed: 0.2 }, behavior: { effect: "eliteBossDamage", value: 0.2 }, weight: 0.025 },
  { key: "shatterStone", name: t("stone.item.shatterStone.name"), nameKey: "stone.item.shatterStone.name", description: t("stone.item.shatterStone.description"), descriptionKey: "stone.item.shatterStone.description", category: "special", tags: ["shard", "multi", "critical"], recipe: ["powerMaterial", "frequencyMaterial", "sizeMaterial"], statBonus: { damage: 0.18, fireRate: 0.18 }, behavior: { effect: "hitShards", value: 3 }, weight: 0.03 },
  { key: "stuckStone", name: t("stone.item.stuckStone.name"), nameKey: "stone.item.stuckStone.name", description: t("stone.item.stuckStone.description"), descriptionKey: "stone.item.stuckStone.description", category: "special", tags: ["delayed", "elite", "boss"], recipe: ["powerMaterial", "durationMaterial", "speedMaterial"], statBonus: { damage: 0.18, life: 0.2 }, behavior: { effect: "delayedDamage", value: 1 }, weight: 0.025 },
  { key: "lavaStone", name: t("stone.item.lavaStone.name"), nameKey: "stone.item.lavaStone.name", description: t("stone.item.lavaStone.description"), descriptionKey: "stone.item.lavaStone.description", category: "special", tags: ["fire", "dot", "trail"], recipe: ["powerMaterial", "durationMaterial", "frequencyMaterial"], statBonus: { damage: 0.18, life: 0.2 }, behavior: { effect: "burnDamage", value: 0.2 }, weight: 0.025 },
  { key: "barrierStone", name: t("stone.item.barrierStone.name"), nameKey: "stone.item.barrierStone.name", description: t("stone.item.barrierStone.description"), descriptionKey: "stone.item.barrierStone.description", category: "special", tags: ["guard", "barrier", "hp"], recipe: ["hpMaterial", "hpMaterial", "sizeMaterial"], statBonus: { maxHpFlat: 24 }, behavior: { effect: "barrier", value: 1 }, weight: 0.025 },
];

export const STONE_ITEMS = [...STONE_MATERIALS, ...STONE_SPECIAL_ITEMS];

export function findStoneItem(key) {
  return STONE_ITEMS.find((item) => item.key === key) || null;
}

export function findStoneMaterial(key) {
  return STONE_MATERIALS.find((item) => item.key === key) || null;
}

export function findStoneSpecialItem(key) {
  return STONE_SPECIAL_ITEMS.find((item) => item.key === key) || null;
}
