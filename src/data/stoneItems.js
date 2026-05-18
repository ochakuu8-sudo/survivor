import { t } from "../i18n.js";
export const STONE_MATERIAL_ALIASES = {
  speedMaterial: "frequencyMaterial",
  rangeMaterial: "durationMaterial",
  rengeMaterial: "durationMaterial",
  sizeMaterial: "hpMaterial",
};

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
    statBonus: { damage: 0.08 },
    behavior: null,
    uses: [t("stone.item.critStone.name"), t("stone.item.explosiveStone.name"), t("stone.item.laserStone.name"), t("stone.item.multiThrow.name")],
    weight: 1,
  },
  {
    key: "frequencyMaterial",
    icon: "F",
    sprite: "materialFrequency",
    name: t("stone.item.frequencyMaterial.name"), nameKey: "stone.item.frequencyMaterial.name",
    shortName: `${t("stone.stats.fireRate")} / ${t("stone.stats.bulletSpeed")}`,
    description: t("stone.item.frequencyMaterial.description"), descriptionKey: "stone.item.frequencyMaterial.description",
    category: "material",
    tags: ["material", "fireRate", "speed", "multi", "trail", "orbit", "pierce", "bounce", "return"],
    statBonus: { fireRate: 0.08, bulletSpeed: 0.08 },
    behavior: null,
    uses: [t("stone.item.machineGunStone.name"), t("stone.item.multiThrow.name"), t("stone.item.satelliteStone.name"), t("stone.item.piercingStone.name")],
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
    statBonus: { life: 0.08, range: 0.08 },
    behavior: null,
    uses: [t("stone.item.bounceStone.name"), t("stone.item.flameStone.name"), t("stone.item.laserStone.name"), t("stone.item.piercingStone.name")],
    weight: 1,
  },
  {
    key: "hpMaterial",
    icon: "HP",
    sprite: "materialHp",
    name: t("stone.item.hpMaterial.name"), nameKey: "stone.item.hpMaterial.name",
    shortName: `HP / ${t("stone.stats.radius")}`,
    description: t("stone.item.hpMaterial.description"), descriptionKey: "stone.item.hpMaterial.description",
    category: "material",
    tags: ["material", "hp", "size", "knockback", "area", "rolling", "defense", "heal", "guard"],
    statBonus: { maxHpFlat: 5, radius: 0.08, knockbackFlat: 4 },
    behavior: null,
    uses: [t("stone.item.heavyStone.name"), t("stone.item.explosiveStone.name"), t("stone.item.flameStone.name"), t("stone.item.satelliteStone.name")],
    weight: 1,
  },
];

export const STONE_SPECIAL_ITEMS = [
  { key: "heavyStone", name: t("stone.item.heavyStone.name"), nameKey: "stone.item.heavyStone.name", description: t("stone.item.heavyStone.description"), descriptionKey: "stone.item.heavyStone.description", category: "special", tags: ["hp", "boulder", "knockback"], recipe: ["hpMaterial", "hpMaterial"], statBonus: { radius: 0.32, knockbackFlat: 28 }, behavior: { effect: "heavy", value: 1 }, weight: 0.05 },
  { key: "critStone", name: t("stone.item.critStone.name"), nameKey: "stone.item.critStone.name", description: t("stone.item.critStone.description"), descriptionKey: "stone.item.critStone.description", category: "special", tags: ["critical", "damage"], recipe: ["powerMaterial", "powerMaterial"], statBonus: { damage: 0.16 }, behavior: { effect: "criticalChance", value: 0.25 }, weight: 0.05 },
  { key: "bounceStone", name: t("stone.item.bounceStone.name"), nameKey: "stone.item.bounceStone.name", description: t("stone.item.bounceStone.description"), descriptionKey: "stone.item.bounceStone.description", category: "special", tags: ["range", "ricochet", "targeting"], recipe: ["durationMaterial", "durationMaterial"], statBonus: { life: 0.22, range: 0.12 }, behavior: { effect: "ricochetCount", value: 1 }, weight: 0.05 },
  { key: "machineGunStone", name: t("stone.item.machineGunStone.name"), nameKey: "stone.item.machineGunStone.name", description: t("stone.item.machineGunStone.description"), descriptionKey: "stone.item.machineGunStone.description", category: "special", tags: ["speed", "fireRate", "damage"], recipe: ["frequencyMaterial", "frequencyMaterial"], statBonus: { damage: -0.2, fireRate: 0.5 }, behavior: { effect: "machineGun", value: 1 }, weight: 0.05 },
  { key: "explosiveStone", name: t("stone.item.explosiveStone.name"), nameKey: "stone.item.explosiveStone.name", description: t("stone.item.explosiveStone.description"), descriptionKey: "stone.item.explosiveStone.description", category: "special", tags: ["hp", "power", "explosion", "area"], recipe: ["hpMaterial", "powerMaterial"], statBonus: { damage: 0.16, explosionRadius: 18 }, behavior: { effect: "explosionDamage", value: 0.35 }, weight: 0.05 },
  { key: "flameStone", name: t("stone.item.flameStone.name"), nameKey: "stone.item.flameStone.name", description: t("stone.item.flameStone.description"), descriptionKey: "stone.item.flameStone.description", category: "special", tags: ["hp", "range", "fire", "trail"], recipe: ["hpMaterial", "durationMaterial"], statBonus: { life: 0.16, radius: 0.12 }, behavior: { effect: "damageTrail", value: 1 }, weight: 0.05 },
  { key: "satelliteStone", name: t("stone.item.satelliteStone.name"), nameKey: "stone.item.satelliteStone.name", description: t("stone.item.satelliteStone.description"), descriptionKey: "stone.item.satelliteStone.description", category: "special", tags: ["hp", "speed", "orbit"], recipe: ["hpMaterial", "frequencyMaterial"], statBonus: { fireRate: 0.12, maxHpFlat: 12 }, behavior: { effect: "satellite", value: 1 }, weight: 0.05 },
  { key: "laserStone", name: t("stone.item.laserStone.name"), nameKey: "stone.item.laserStone.name", description: t("stone.item.laserStone.description"), descriptionKey: "stone.item.laserStone.description", category: "special", tags: ["power", "range", "laser", "line"], recipe: ["powerMaterial", "durationMaterial"], statBonus: { damage: 0.14, life: 0.14 }, behavior: { effect: "playerBeam", value: 1 }, weight: 0.05 },
  { key: "multiThrow", name: t("stone.item.multiThrow.name"), nameKey: "stone.item.multiThrow.name", description: t("stone.item.multiThrow.description"), descriptionKey: "stone.item.multiThrow.description", category: "special", tags: ["power", "speed", "projectileCount"], recipe: ["powerMaterial", "frequencyMaterial"], statBonus: { damage: 0.1, fireRate: 0.1 }, behavior: { effect: "projectileCount", value: 1 }, weight: 0.05 },
  { key: "piercingStone", name: t("stone.item.piercingStone.name"), nameKey: "stone.item.piercingStone.name", description: t("stone.item.piercingStone.description"), descriptionKey: "stone.item.piercingStone.description", category: "special", tags: ["range", "speed", "pierce", "wallBounce"], recipe: ["durationMaterial", "frequencyMaterial"], statBonus: { bulletSpeed: 0.14, life: 0.14 }, behavior: { effect: "pierce", value: 1 }, weight: 0.05 },
];

export const STONE_ITEMS = [...STONE_MATERIALS, ...STONE_SPECIAL_ITEMS];

export function canonicalStoneMaterialKey(key) {
  return STONE_MATERIAL_ALIASES[key] || key;
}

export function findStoneItem(key) {
  const canonicalKey = canonicalStoneMaterialKey(key);
  return STONE_ITEMS.find((item) => item.key === canonicalKey) || null;
}

export function findStoneMaterial(key) {
  const canonicalKey = canonicalStoneMaterialKey(key);
  return STONE_MATERIALS.find((item) => item.key === canonicalKey) || null;
}

export function findStoneSpecialItem(key) {
  return STONE_SPECIAL_ITEMS.find((item) => item.key === key) || null;
}
