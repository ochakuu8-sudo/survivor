import { t } from "./i18n.js";

export const TAU = Math.PI * 2;
export const TILE_SIZE = 96;
export const COLLISION_CELL_SIZE = 128;
export const BACKGROUND_CACHE_LIMIT = 4096;
export const MOBILE_CAMERA_ZOOM = 0.56;
export const TOUCH_TABLET_CAMERA_ZOOM = 0.82;
export const INTERACTION_HOLD_SECONDS = 1;
export const EXIT_HOLD_SECONDS = 1;
export const TARGET_FRAME_RATE = 60;
export const TARGET_FRAME_SECONDS = 1 / TARGET_FRAME_RATE;
export const MAX_FRAME_DELTA_SECONDS = TARGET_FRAME_SECONDS * 4;
export const WAVE_DURATION_SECONDS = 40;
export const ENEMY_SPEED_RAMP_SECONDS = 300;
export const FINAL_RUSH_SECONDS = 30;
export const ELITE_SPAWN_SECONDS = Math.max(0, WAVE_DURATION_SECONDS - 15);
export const BOSS_WAVE_INTERVAL = 3;
export const WAVE_NODE_PRICE_BASE = 24;
export const WAVE_NODE_PRICE_SCALE = 0.08;
export const STONE_INITIAL_DAMAGE = 42;
export const ENEMY_HP_PER_FLOOR_MULTIPLIER = 1.25;

export const OFFER_TYPE_LABELS = {
  weapon: t("offer.type.weapon"),
  attachment: t("offer.type.attachment"),
  relic: t("offer.type.relic"),
};

export const INITIAL_WEAPON_ONLY_RUN = true;
export const STARTER_WEAPON_KEY = "stone";
export const STARTER_WEAPON_NAME = t("weapon.stone.name");
export const MAX_WEAPONS = INITIAL_WEAPON_ONLY_RUN ? 1 : 2;
export const MAX_WEAPON_LEVEL = 9;
export const INITIAL_WEAPON_ATTACHMENT_SLOTS = 2;
export const INITIAL_STONE_ITEM_SLOTS = 5;
export const MAX_ATTACHMENTS_PER_WEAPON = 3;
export const MAX_ATTACHMENTS = MAX_ATTACHMENTS_PER_WEAPON;
export const MAX_STORED_ATTACHMENTS = 12;
export const DEFAULT_WEAPON_LIMITS = { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS_PER_WEAPON };
export const WEAPON_RARITY_LIMITS = {
  normal: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS_PER_WEAPON },
  rare: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS_PER_WEAPON },
  epic: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS_PER_WEAPON },
  legend: { maxLevel: MAX_WEAPON_LEVEL, maxAttachments: MAX_ATTACHMENTS_PER_WEAPON },
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
  return Math.min(MAX_ATTACHMENTS_PER_WEAPON, Math.max(0, unlocked));
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
  "droneCount",
  "maxMines",
  "armingTime",
  "returnTime",
  "radius",
  "jitter",
  "kick",
  "critChance",
  "critMultiplier",
  "freezeChance",
  "freezeSlow",
  "freezeDuration",
  "lifeStealPerKill",
  "burnDamage",
  "pullStrength",
  "eliteBossBonus",
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
