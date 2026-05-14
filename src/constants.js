export const TAU = Math.PI * 2;
export const TILE_SIZE = 96;
export const COLLISION_CELL_SIZE = 128;
export const BACKGROUND_CACHE_LIMIT = 4096;
export const MOBILE_CAMERA_ZOOM = 0.56;
export const TOUCH_TABLET_CAMERA_ZOOM = 0.82;
export const INTERACTION_HOLD_SECONDS = 3;
export const TARGET_FRAME_RATE = 60;
export const TARGET_FRAME_SECONDS = 1 / TARGET_FRAME_RATE;
export const MAX_FRAME_DELTA_SECONDS = TARGET_FRAME_SECONDS * 4;
export const WAVE_DURATION_SECONDS = 40;
export const RUN_DURATION_SECONDS = 300;
export const FINAL_RUSH_SECONDS = 30;
export const ELITE_SPAWN_SECONDS = Math.max(0, WAVE_DURATION_SECONDS - 15);
export const BOSS_WAVE_INTERVAL = 3;
export const WAVE_NODE_PRICE_BASE = 24;
export const WAVE_NODE_PRICE_SCALE = 0.08;

export const OFFER_TYPE_LABELS = {
  weapon: "武器",
  attachment: "アタッチメント",
  relic: "レリック",
};

export const MAX_WEAPONS = 2;
export const MAX_WEAPON_LEVEL = 9;
export const INITIAL_WEAPON_ATTACHMENT_SLOTS = 2;
export const MAX_ATTACHMENTS = 3;
export const MAX_STORED_ATTACHMENTS = 12;
export const DEFAULT_WEAPON_LIMITS = { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS };
export const WEAPON_RARITY_LIMITS = {
  normal: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS },
  rare: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS },
  epic: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS },
  legend: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS },
};
export const PLAYER_INVULNERABLE_SECONDS = 0.5;

export function getWeaponRarityLimits(weapon) {
  return WEAPON_RARITY_LIMITS[weapon?.rarity] || DEFAULT_WEAPON_LIMITS;
}

export function getWeaponMaxLevel(weapon) {
  return getWeaponRarityLimits(weapon).maxLevel;
}

export function getWeaponMaxAttachments(weapon) {
  const unlocked = Number.isFinite(weapon?.unlockedSlots) ? weapon.unlockedSlots : INITIAL_WEAPON_ATTACHMENT_SLOTS;
  return Math.min(MAX_ATTACHMENTS, Math.max(0, unlocked));
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
  "critChance",
  "critMultiplier",
  "freezeChance",
  "freezeSlow",
  "freezeDuration",
  "lifeStealPerKill",
  "ricochetCount",
  "ricochetRange",
  "ricochetSplitCount",
  "ricochetSpeedScale",
  "splitShardCount",
  "hitShardCount",
  "splitSpawnLimit",
  "chainShatterChance",
  "chainShatterRadiusScale",
  "chainShatterDamageScale",
  "criticalThrowEvery",
  "criticalThrowDamageScale",
  "criticalThrowSizeScale",
  "masterStoneInterval",
  "masterStoneDamageScale",
  "masterStoneEliteBossBonus",
  "bulletTint",
  "bulletGlow",
  "effectTint",
  "effectGlow",
];
