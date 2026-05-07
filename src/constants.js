export const TAU = Math.PI * 2;
export const TILE_SIZE = 96;
export const WAVE_SECONDS = 45;
export const COLLISION_CELL_SIZE = 128;
export const BACKGROUND_CACHE_LIMIT = 4096;
export const MOBILE_CAMERA_ZOOM = 0.5;
export const TOUCH_TABLET_CAMERA_ZOOM = 0.82;

export const OFFER_TYPE_LABELS = {
  weapon: "武器",
  attachment: "アタッチメント",
  relic: "レリック",
};

export const MAX_WEAPONS = 3;
export const MAX_WEAPON_ATTACHMENTS = 5;
export const RARITY_ORDER = ["normal", "rare", "epic", "legend"];
export const ATTACHMENT_RARITIES = {
  normal: { label: "ノーマル", short: "N", power: 1 },
  rare: { label: "レア", short: "R", power: 1.65 },
  epic: { label: "エピック", short: "E", power: 2.4 },
  legend: { label: "レジェンド", short: "L", power: 3.4 },
};
export const ATTACHMENT_RARITY_TABLES = [
  { normal: 80, rare: 20, epic: 0, legend: 0 },
  { normal: 65, rare: 30, epic: 5, legend: 0 },
  { normal: 50, rare: 38, epic: 12, legend: 0 },
  { normal: 35, rare: 45, epic: 20, legend: 0 },
  { normal: 20, rare: 40, epic: 30, legend: 10 },
];
export const WEAPON_STAT_KEYS = [
  "damage",
  "fireRate",
  "bulletSpeed",
  "projectiles",
  "pierce",
  "ricochet",
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
  "radius",
  "jitter",
  "kick",
  "bulletTint",
  "bulletGlow",
  "effectTint",
  "effectGlow",
];
