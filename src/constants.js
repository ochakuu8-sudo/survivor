export const TAU = Math.PI * 2;
export const TILE_SIZE = 96;
export const COLLISION_CELL_SIZE = 128;
export const BACKGROUND_CACHE_LIMIT = 4096;
export const MOBILE_CAMERA_ZOOM = 0.5;
export const TOUCH_TABLET_CAMERA_ZOOM = 0.82;
export const INTERACTION_HOLD_SECONDS = 3;

export const OFFER_TYPE_LABELS = {
  weapon: "武器",
  attachment: "アタッチメント",
  relic: "レリック",
};

export const MAX_WEAPONS = 2;
export const DEFAULT_WEAPON_LIMITS = { maxLevel: 5, maxAttachments: 4 };
export const WEAPON_RARITY_LIMITS = {
  normal: { maxLevel: 5, maxAttachments: 4 },
  rare: { maxLevel: 7, maxAttachments: 6 },
  epic: { maxLevel: 7, maxAttachments: 6 },
  legend: { maxLevel: 9, maxAttachments: 8 },
};
export const MAX_ATTACHMENTS = WEAPON_RARITY_LIMITS.legend.maxAttachments;
export const MAX_WEAPON_LEVEL = WEAPON_RARITY_LIMITS.legend.maxLevel;
export const FIXED_RELOAD_SECONDS = 2.5;
export const PLAYER_INVULNERABLE_SECONDS = 2.5;

export function getWeaponRarityLimits(weapon) {
  return WEAPON_RARITY_LIMITS[weapon?.rarity] || DEFAULT_WEAPON_LIMITS;
}

export function getWeaponMaxLevel(weapon) {
  return getWeaponRarityLimits(weapon).maxLevel;
}

export function getWeaponMaxAttachments(weapon) {
  return getWeaponRarityLimits(weapon).maxAttachments;
}
export const WEAPON_STAT_KEYS = [
  "damage",
  "fireRate",
  "bulletSpeed",
  "projectiles",
  "pierce",
  "knockback",
  "spread",
  "life",
  "range",
  "cone",
  "lineWidth",
  "explosionRadius",
  "explosionDamage",
  "chainCount",
  "chainRange",
  "duration",
  "tickRate",
  "fuse",
  "areaRadius",
  "orbitRadius",
  "orbitSpeed",
  "orbitCount",
  "radius",
  "jitter",
  "kick",
  "ammoCapacity",
  "reloadTime",
  "critChance",
  "critMultiplier",
  "freezeChance",
  "freezeSlow",
  "freezeDuration",
  "lifeStealPerKill",
  "ricochetCount",
  "ricochetRange",
  "bulletTint",
  "bulletGlow",
  "effectTint",
  "effectGlow",
];
