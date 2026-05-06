const TAU = Math.PI * 2;
const TILE_SIZE = 96;
const WAVE_SECONDS = 45;
const COLLISION_CELL_SIZE = 128;
const BACKGROUND_CACHE_LIMIT = 4096;
const MOBILE_CAMERA_ZOOM = 0.5;
const TOUCH_TABLET_CAMERA_ZOOM = 0.82;

const canvas = document.querySelector("#game");
const hud = {
  wave: document.querySelector("#waveText"),
  time: document.querySelector("#timeText"),
  hp: document.querySelector("#hpFill"),
  hpText: document.querySelector("#hpText"),
  cash: document.querySelector("#cashText"),
  kills: document.querySelector("#killText"),
  hitFlash: document.querySelector("#hitFlash"),
  shop: document.querySelector("#shop"),
  offers: document.querySelector("#offers"),
  shopCash: document.querySelector("#shopCash"),
  gearInventory: document.querySelector("#gearInventory"),
  reroll: document.querySelector("#rerollBtn"),
  nextWave: document.querySelector("#nextWaveBtn"),
  gameOver: document.querySelector("#gameOver"),
  result: document.querySelector("#resultText"),
  restart: document.querySelector("#restartBtn"),
  touchControls: document.querySelector("#touchControls"),
  moveStick: document.querySelector("#moveStick"),
  moveThumb: document.querySelector("#moveThumb"),
};

const keys = new Set();
const pointer = {
  down: false,
  activeId: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  moveX: 0,
  moveY: 0,
  strength: 0,
};

let renderer;
let atlas;
let enemyId = 1;
let weaponId = 1;
let lastFrame = performance.now();
const enemyCollisionGrid = new Map();
const backgroundTileCache = new Map();

const game = {
  mode: "fight",
  wave: 1,
  timeLeft: WAVE_SECONDS,
  elapsed: 0,
  money: 0,
  totalKills: 0,
  waveKills: 0,
  rerolls: 0,
  spawnClock: 0,
  shake: 0,
  damageFlash: 0,
  camera: { x: 0, y: 0 },
  player: null,
  enemies: [],
  bullets: [],
  pickups: [],
  particles: [],
  effects: [],
  offers: [],
  selectedAttachment: null,
};

const OFFER_TYPE_LABELS = {
  weapon: "武器",
  attachment: "アタッチメント",
  relic: "レリック",
};

const MAX_WEAPONS = 3;
const MAX_WEAPON_ATTACHMENTS = 5;
const WEAPON_UPGRADE_SLOT_COSTS = [11, 21, 35, 54, 78];
const ATTACHMENT_REROLL_SLOT_COSTS = [8, 17, 30, 47, 68];
const RARITY_ORDER = ["normal", "rare", "epic", "legend"];
const ATTACHMENT_RARITIES = {
  normal: { label: "ノーマル", short: "N", power: 1 },
  rare: { label: "レア", short: "R", power: 1.65 },
  epic: { label: "エピック", short: "E", power: 2.4 },
  legend: { label: "レジェンド", short: "L", power: 3.4 },
};
const ATTACHMENT_RARITY_TABLES = [
  { normal: 80, rare: 20, epic: 0, legend: 0 },
  { normal: 65, rare: 30, epic: 5, legend: 0 },
  { normal: 50, rare: 38, epic: 12, legend: 0 },
  { normal: 35, rare: 45, epic: 20, legend: 0 },
  { normal: 20, rare: 40, epic: 30, legend: 10 },
];
const WEAPON_STAT_KEYS = [
  "damage",
  "fireRate",
  "bulletSpeed",
  "projectiles",
  "pierce",
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) return distSq(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return distSq(px, py, x, y);
}

function angleDelta(a, b) {
  let delta = (a - b) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function hash2(x, y, salt = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createWeapon(template) {
  const bulletSpeed = template.bulletSpeed ?? 690;
  const life = template.life || 0.72;
  const weapon = {
    id: nextWeaponId(),
    name: template.name,
    kind: template.kind || "projectile",
    damage: template.damage,
    fireRate: template.fireRate,
    bulletSpeed,
    projectiles: template.projectiles || 1,
    pierce: template.pierce || 0,
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
    bulletTint: template.bulletTint ? [...template.bulletTint] : [1, 1, 1],
    bulletGlow: template.bulletGlow || "glowAmber",
    effectTint: template.effectTint ? [...template.effectTint] : [1, 1, 1],
    effectGlow: template.effectGlow || "glowAmber",
    shootTimer: template.shootTimer ?? 0.45,
    attachments: [],
  };
  weapon.baseStats = snapshotWeaponStats(weapon);
  return weapon;
}

function nextWeaponId() {
  weaponId += 1;
  return weaponId - 1;
}

function snapshotWeaponStats(weapon) {
  const stats = {};
  WEAPON_STAT_KEYS.forEach((key) => {
    const value = weapon[key];
    stats[key] = Array.isArray(value) ? [...value] : value;
  });
  return stats;
}

function restoreWeaponBaseStats(weapon) {
  Object.entries(weapon.baseStats || snapshotWeaponStats(weapon)).forEach(([key, value]) => {
    weapon[key] = Array.isArray(value) ? [...value] : value;
  });
}

function findAttachmentDefinition(key) {
  return ACTIVE_ATTACHMENTS.find((attachment) => attachment.key === key) || null;
}

function syncGearAttachments() {
  if (!game.player?.gear) return;
  game.player.gear.attachments = game.player.gear.weapons.flatMap((weapon) =>
    weapon.attachments.map((attachment) => ({
      key: attachment.key,
      name: attachment.name,
      rarity: attachment.rarity,
      rarityLabel: rarityLabel(attachment.rarity),
      weaponId: weapon.id,
      weaponName: weapon.name,
    })),
  );
}

function recomputeWeaponAttachments(weapon) {
  restoreWeaponBaseStats(weapon);
  weapon.attachments.forEach((attachment) => {
    const definition = findAttachmentDefinition(attachment.key);
    if (definition) definition.attach(weapon, rarityPower(attachment.rarity), attachment);
  });
  syncGearAttachments();
}

function buildAtlas() {
  const specs = [];
  const add = (name, width, height, draw) => specs.push({ name, width, height, draw });

  add("white", 4, 4, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  });

  add("shadow", 72, 36, (ctx, w, h) => {
    ctx.fillStyle = "rgba(17, 12, 43, 0.42)";
    ctx.fillRect(12, 14, w - 24, 10);
    ctx.fillStyle = "rgba(17, 12, 43, 0.32)";
    ctx.fillRect(4, 18, w - 8, 8);
    ctx.fillStyle = "rgba(17, 12, 43, 0.2)";
    ctx.fillRect(18, 8, w - 36, 4);
  });

  add("glowCyan", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "85, 246, 199"));
  add("glowRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 93, 150"));
  add("glowEnemyRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 42, 42"));
  add("glowAmber", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 228, 107"));

  add("road", 96, 96, (ctx, w, h) => {
    const rng = makeRng(31);
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2f3e91";
    for (let y = 0; y < h; y += 24) ctx.fillRect(0, y + 20, w, 4);
    ctx.fillStyle = "#4e60c7";
    for (let i = 0; i < 34; i += 1) {
      ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 4, 4);
    }
    ctx.fillStyle = "#263376";
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, h - 4, w, 4);
  });

  add("lane", 96, 96, (ctx, w, h) => {
    const rng = makeRng(44);
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#4e60c7";
    for (let i = 0; i < 24; i += 1) ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 4, 4);
    ctx.fillStyle = "#e8ce56";
    ctx.fillRect(w / 2 - 4, 8, 8, 24);
    ctx.fillRect(w / 2 - 4, 56, 8, 24);
    ctx.fillStyle = "#f6e9a6";
    ctx.fillRect(w / 2 - 4, 8, 8, 4);
    ctx.fillRect(w / 2 - 4, 56, 8, 4);
  });

  add("sidewalk", 96, 96, (ctx, w, h) => {
    ctx.fillStyle = "#6768cf";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#7d7ee2";
    for (let x = 0; x < w; x += 32) ctx.fillRect(x + 2, 0, 4, h);
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y + 2, w, 4);
    ctx.fillStyle = "#5657b8";
    ctx.fillRect(0, 0, w, 5);
    ctx.fillRect(0, h - 5, w, 5);
  });

  add("pavement", 96, 96, (ctx, w, h) => {
    const rng = makeRng(73);
    ctx.fillStyle = "#202d78";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1a2564";
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = "#2d3f95";
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(Math.floor(rng() * 11) * 8, Math.floor(rng() * 11) * 8, 8, 4);
    }
  });

  add("crosswalk", 96, 96, (ctx, w, h) => {
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#efe4aa";
    for (let y = 8; y < h; y += 20) ctx.fillRect(8, y, w - 16, 10);
    ctx.fillStyle = "#c3e7ed";
    for (let y = 8; y < h; y += 20) ctx.fillRect(8, y, w - 16, 3);
  });

  add("trash", 48, 48, (ctx, w, h) => {
    drawPixelTrash(ctx, w, h);
  });

  add("sign", 72, 72, (ctx, w, h) => {
    drawPixelSign(ctx, w, h);
  });

  add("car", 96, 72, (ctx, w, h) => {
    drawPixelCar(ctx, w, h);
  });

  add("player", 72, 72, (ctx, w, h) => {
    drawPixelPlayer(ctx, w, h);
  });
  add("playerReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelPlayer, 1, "rgba(17, 12, 43, 0.58)");
  });
  add("playerWalkAReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelPlayer(target, width, height, -1), 1, "rgba(17, 12, 43, 0.58)");
  });
  add("playerWalkBReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelPlayer(target, width, height, 1), 1, "rgba(17, 12, 43, 0.58)");
  });

  add("zombieA", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#98f06e", "#5131a8", "#ff7a5c"));
  add("zombieB", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#c5ff6b", "#f04d8b", "#ffe46b"));
  add("zombieBig", 96, 96, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#a6f771", "#7946d9", "#ff7a5c", 1.32));
  add("zombieAReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#98f06e", "#5131a8", "#ff7a5c"), 2, "rgba(222, 28, 45, 0.78)");
  });
  add("zombieBReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#c5ff6b", "#f04d8b", "#ffe46b"), 2, "rgba(235, 34, 48, 0.8)");
  });
  add("zombieBigReadable", 96, 96, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#a6f771", "#7946d9", "#ff7a5c", 1.32), 2, "rgba(245, 38, 50, 0.84)");
  });

  add("bullet", 48, 20, (ctx, w, h) => {
    drawPixelBullet(ctx, w, h);
  });
  add("bulletReadable", 48, 20, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelBullet, 1, "rgba(17, 12, 43, 0.48)");
  });

  add("cash", 44, 44, (ctx, w, h) => {
    drawPixelCash(ctx, w, h);
  });
  add("cashReadable", 44, 44, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelCash, 1, "rgba(17, 12, 43, 0.5)");
  });

  add("walkDust", 34, 22, (ctx, w, h) => {
    drawPixelWalkDust(ctx, w, h);
  });

  add("spark", 40, 40, (ctx, w, h) => {
    ctx.fillStyle = "rgba(255, 228, 107, 0.3)";
    ctx.fillRect(12, 8, 16, 24);
    ctx.fillRect(8, 12, 24, 16);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(16, 12, 8, 16);
    ctx.fillRect(12, 16, 16, 8);
    ctx.fillStyle = "#ff7a5c";
    ctx.fillRect(18, 18, 4, 4);
  });

  const size = 1024;
  const pad = 3;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = size;
  atlasCanvas.height = size;
  const atlasCtx = atlasCanvas.getContext("2d");
  atlasCtx.imageSmoothingEnabled = false;
  atlasCtx.clearRect(0, 0, size, size);

  let x = pad;
  let y = pad;
  let rowHeight = 0;
  const sprites = {};

  for (const spec of specs) {
    if (x + spec.width + pad > size) {
      x = pad;
      y += rowHeight + pad;
      rowHeight = 0;
    }
    if (y + spec.height + pad > size) {
      throw new Error("Texture atlas overflow");
    }

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spec.width;
    spriteCanvas.height = spec.height;
    const spriteCtx = spriteCanvas.getContext("2d");
    spriteCtx.imageSmoothingEnabled = false;
    spec.draw(spriteCtx, spec.width, spec.height);
    atlasCtx.drawImage(spriteCanvas, x, y);

    sprites[spec.name] = {
      x,
      y,
      w: spec.width,
      h: spec.height,
      u0: x / size,
      v0: y / size,
      u1: (x + spec.width) / size,
      v1: (y + spec.height) / size,
    };

    x += spec.width + pad;
    rowHeight = Math.max(rowHeight, spec.height);
  }

  return { canvas: atlasCanvas, sprites };
}

function drawPixelGlow(ctx, w, h, rgb) {
  ctx.fillStyle = `rgba(${rgb}, 0.08)`;
  ctx.fillRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = `rgba(${rgb}, 0.14)`;
  ctx.fillRect(18, 18, w - 36, h - 36);
  ctx.fillStyle = `rgba(${rgb}, 0.22)`;
  ctx.fillRect(30, 30, w - 60, h - 60);
}

function drawOutlinedSprite(ctx, w, h, draw, outline, outlineColor) {
  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  draw(sourceCtx, w, h);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const maskCtx = mask.getContext("2d");
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(source, 0, 0);
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = outlineColor;
  maskCtx.fillRect(0, 0, w, h);

  ctx.drawImage(mask, -outline, 0);
  ctx.drawImage(mask, outline, 0);
  ctx.drawImage(mask, 0, -outline);
  ctx.drawImage(mask, 0, outline);
  ctx.drawImage(source, 0, 0);
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelBullet(ctx) {
  ctx.fillStyle = "rgba(255, 228, 107, 0.28)";
  ctx.fillRect(0, 6, 18, 8);
  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(16, 4, 24, 12);
  ctx.fillStyle = "#ff7a5c";
  ctx.fillRect(36, 6, 8, 8);
  ctx.fillStyle = "#ff5d96";
  ctx.fillRect(42, 8, 4, 4);
}

function drawPixelWalkDust(ctx, w, h) {
  ctx.fillStyle = "rgba(35, 25, 76, 0.22)";
  ctx.fillRect(6, 13, 22, 5);
  ctx.fillStyle = "rgba(157, 247, 255, 0.24)";
  ctx.fillRect(8, 10, 8, 4);
  ctx.fillRect(19, 9, 7, 4);
  ctx.fillStyle = "rgba(255, 243, 196, 0.22)";
  ctx.fillRect(14, 7, 8, 4);
}

function drawPixelCash(ctx) {
  ctx.fillStyle = "rgba(35, 25, 76, 0.28)";
  ctx.beginPath();
  ctx.ellipse(22, 35, 12, 4, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#7d4a18";
  ctx.beginPath();
  ctx.arc(22, 21, 15, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#ffe46b";
  ctx.beginPath();
  ctx.arc(22, 21, 12, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#f4a83f";
  ctx.lineWidth = 3;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = i * (TAU / 6);
    const hx = 22 + Math.cos(angle) * 8;
    const hy = 21 + Math.sin(angle) * 8;
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(15, 13, 9, 3);
  ctx.fillRect(13, 16, 5, 3);
}

function drawPixelTrash(ctx, w, h) {
  const x = w / 2 - 14;
  const y = h / 2 - 16;
  px(ctx, x + 2, y + 28, 28, 6, "rgba(35, 25, 76, 0.28)");
  px(ctx, x, y + 4, 28, 28, "#162b59");
  px(ctx, x + 4, y, 20, 6, "#55f6c7");
  px(ctx, x + 4, y + 10, 20, 4, "#2844a0");
  px(ctx, x + 7, y + 18, 14, 3, "#8fd4ff");
  px(ctx, x + 22, y + 6, 4, 24, "#0e1c42");
}

function drawPixelSign(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 21, y + 22, 42, 8, "rgba(35, 25, 76, 0.32)");
  px(ctx, x - 4, y - 6, 8, 30, "#201653");
  px(ctx, x - 28, y - 30, 56, 24, "#201653");
  px(ctx, x - 24, y - 26, 48, 16, "#ff5d96");
  px(ctx, x - 19, y - 21, 38, 4, "#ffe46b");
  px(ctx, x - 24, y - 10, 48, 4, "#b82f78");
}

function drawPixelCar(ctx, w, h) {
  const x = w / 2 - 38;
  const y = h / 2 - 18;
  px(ctx, x + 4, y + 39, 72, 8, "rgba(35, 25, 76, 0.32)");
  px(ctx, x, y + 10, 76, 24, "#5a2fc8");
  px(ctx, x + 8, y + 2, 52, 18, "#ff5d96");
  px(ctx, x + 15, y + 6, 36, 10, "#9df7ff");
  px(ctx, x + 8, y + 30, 14, 8, "#201653");
  px(ctx, x + 54, y + 30, 14, 8, "#201653");
  px(ctx, x + 63, y + 16, 8, 8, "#ffe46b");
  px(ctx, x + 2, y + 18, 8, 8, "#ff7a5c");
}

function drawPixelPlayer(ctx, w, h, step = 0) {
  const x = w / 2 - 20;
  const y = h / 2 - 30 + (step === 0 ? 0 : -1);
  const leftLift = step < 0 ? -1 : step > 0 ? 2 : 0;
  const rightLift = step > 0 ? -1 : step < 0 ? 2 : 0;
  const leftShift = step < 0 ? -2 : step > 0 ? 1 : 0;
  const rightShift = step > 0 ? 2 : step < 0 ? -1 : 0;
  const leftArmLift = step < 0 ? 2 : step > 0 ? -2 : 0;
  const rightArmLift = step > 0 ? 2 : step < 0 ? -2 : 0;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 5, y + 9, 30, 22, "#f4bf91");
  px(ctx, x + 3, y + 3, 30, 9, "#2b184c");
  px(ctx, x + 8, y - 1, 19, 7, "#2b184c");
  px(ctx, x + 4, y + 10, 8, 9, "#2b184c");
  px(ctx, x + 24, y + 9, 11, 6, "#2b184c");
  px(ctx, x + 9, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 24, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 10, y + 18, 4, 4, "#201653");
  px(ctx, x + 26, y + 18, 4, 4, "#201653");
  px(ctx, x + 19, y + 20, 3, 5, "#c78163");
  px(ctx, x + 15, y + 27, 10, 2, "#7c4b37");
  px(ctx, x + 5, y + 31, 30, 27, "#a94424");
  px(ctx, x + 9, y + 31, 22, 25, "#e17332");
  px(ctx, x + 13, y + 31, 14, 24, "#d8d0b0");
  px(ctx, x + 5, y + 39, 30, 6, "#742f27");
  px(ctx, x + 9, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 26, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 16, y + 35, 8, 5, "#fff3c4");
  px(ctx, x + 15, y + 45, 4, 4, "#5a2825");
  px(ctx, x + 23, y + 50, 5, 3, "#8b5a1f");
  px(ctx, x + 0, y + 33 + leftArmLift, 8, 21, "#a94424");
  px(ctx, x + 32, y + 33 + rightArmLift, 8, 21, "#a94424");
  px(ctx, x + 1, y + 51 + leftArmLift, 7, 3, "#d8d0b0");
  px(ctx, x + 32, y + 51 + rightArmLift, 7, 3, "#d8d0b0");
  px(ctx, x + 1, y + 54 + leftArmLift, 7, 4, "#f4bf91");
  px(ctx, x + 32, y + 54 + rightArmLift, 7, 4, "#f4bf91");
  px(ctx, x + 33, y + 45, 5, 8, "#742f27");
  px(ctx, x + 9 + leftShift, y + 56 + leftLift, 9, 13, "#26345f");
  px(ctx, x + 23 + rightShift, y + 56 + rightLift, 9, 13, "#26345f");
  px(ctx, x + 7 + leftShift, y + 66 + leftLift, 13, 4, "#2a2336");
  px(ctx, x + 21 + rightShift, y + 66 + rightLift, 13, 4, "#2a2336");
  px(ctx, x + 17, y + 47, 7, 5, "#3b2f3d");
}

function drawPixelZombie(ctx, w, h, skin, clothes, accent, scale = 1) {
  ctx.save();
  ctx.translate(w / 2, h / 2 + (scale - 1) * 12);
  ctx.scale(scale, scale);
  const x = -20;
  const y = -30;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 4, y + 9, 32, 22, skin);
  px(ctx, x + 0, y + 0, 20, 8, "#31461e");
  px(ctx, x + 8, y + 16, 6, 5, "#243012");
  px(ctx, x + 26, y + 16, 6, 5, "#243012");
  px(ctx, x + 14, y + 25, 18, 4, "#243012");
  px(ctx, x + 5, y + 31, 30, 27, clothes);
  px(ctx, x + 5, y + 40, 30, 7, accent);
  px(ctx, x - 10, y + 31, 13, 8, skin);
  px(ctx, x + 37, y + 35, 13, 8, skin);
  px(ctx, x + 9, y + 56, 9, 13, "#223064");
  px(ctx, x + 23, y + 56, 9, 13, "#223064");
  px(ctx, x + 6, y + 31, 6, 27, "#3f2a99");
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

class SpriteRenderer {
  constructor(targetCanvas, atlasData) {
    this.canvas = targetCanvas;
    this.atlas = atlasData;
    this.gl = targetCanvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!this.gl) {
      throw new Error("WebGL is not available in this browser");
    }

    this.maxQuads = 12000;
    this.stride = 8;
    this.vertices = new Float32Array(this.maxQuads * 6 * this.stride);
    this.vertexCount = 0;
    this.dpr = 1;
    this.program = this.createProgram();
    this.buffer = this.gl.createBuffer();
    this.texture = this.createTexture(atlasData.canvas);
    this.bindState();
  }

  createProgram() {
    const vertex = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clip = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
        v_uv = a_uv;
        v_color = a_color;
      }
    `;

    const fragment = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        gl_FragColor = texture2D(u_texture, v_uv) * v_color;
      }
    `;

    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vertex);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program");
    }
    return program;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile shader");
    }
    return shader;
  }

  createTexture(source) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  bindState() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const strideBytes = this.stride * 4;
    const pos = gl.getAttribLocation(this.program, "a_position");
    const uv = gl.getAttribLocation(this.program, "a_uv");
    const color = gl.getAttribLocation(this.program, "a_color");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, strideBytes, 2 * 4);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 4, gl.FLOAT, false, strideBytes, 4 * 4);
    this.resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
    gl.uniform1i(gl.getUniformLocation(this.program, "u_texture"), 0);
  }

  resize(width, height, dpr) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.resolutionLocation, width, height);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0.12, 0.18, 0.44, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  begin() {
    this.vertexCount = 0;
  }

  draw(name, x, y, width, height, options = {}) {
    const sprite = this.atlas.sprites[name];
    if (!sprite) return;

    if (this.vertexCount + 6 >= this.maxQuads * 6) {
      this.flush();
    }

    const scale = this.dpr;
    const cx = x * scale;
    const cy = y * scale;
    const hw = (width * scale) / 2;
    const hh = (height * scale) / 2;
    const rotation = options.rotation || 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const tint = options.tint || [1, 1, 1];
    const alpha = options.alpha ?? 1;

    const corners = [
      [-hw, -hh, sprite.u0, sprite.v0],
      [hw, -hh, sprite.u1, sprite.v0],
      [hw, hh, sprite.u1, sprite.v1],
      [-hw, -hh, sprite.u0, sprite.v0],
      [hw, hh, sprite.u1, sprite.v1],
      [-hw, hh, sprite.u0, sprite.v1],
    ];

    let offset = this.vertexCount * this.stride;
    for (const corner of corners) {
      const px = corner[0] * cos - corner[1] * sin + cx;
      const py = corner[0] * sin + corner[1] * cos + cy;
      this.vertices[offset] = px;
      this.vertices[offset + 1] = py;
      this.vertices[offset + 2] = corner[2];
      this.vertices[offset + 3] = corner[3];
      this.vertices[offset + 4] = tint[0];
      this.vertices[offset + 5] = tint[1];
      this.vertices[offset + 6] = tint[2];
      this.vertices[offset + 7] = alpha;
      offset += this.stride;
    }
    this.vertexCount += 6;
  }

  flush() {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.vertexCount * this.stride), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.vertexCount = 0;
  }
}

function resetRun() {
  game.mode = "fight";
  game.wave = 1;
  game.timeLeft = WAVE_SECONDS;
  game.elapsed = 0;
  game.money = 0;
  game.totalKills = 0;
  game.waveKills = 0;
  game.rerolls = 0;
  game.spawnClock = 0;
  game.shake = 0;
  game.damageFlash = 0;
  game.camera.x = 0;
  game.camera.y = 0;
  weaponId = 1;
  game.player = {
    x: 0,
    y: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    speed: 215,
    pickup: 150,
    armor: 0,
    regen: 0,
    weaponPowerBonus: 0,
    moveX: 0,
    moveY: 0,
    walkTime: 0,
    walkDustTimer: 0,
    gear: {
      weapons: [
        createWeapon({
          name: "石",
          damage: 40,
          fireRate: 0.72,
          bulletSpeed: 560,
          life: 0.78,
          radius: 12,
          kick: 2.8,
          bulletTint: [0.88, 0.84, 0.74],
          bulletGlow: "glowAmber",
        }),
      ],
      attachments: [],
      relics: [],
    },
  };
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.offers = [];
  game.selectedAttachment = null;
  hud.shop.classList.add("hidden");
  hud.gameOver.classList.add("hidden");
  updateHud();
}

function startNextWave() {
  game.mode = "fight";
  game.wave += 1;
  game.timeLeft = WAVE_SECONDS;
  game.waveKills = 0;
  game.rerolls = 0;
  game.spawnClock = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.28, 1, game.player.maxHp);
  hud.shop.classList.add("hidden");
  updateHud();
}

function enterShop() {
  game.mode = "shop";
  game.rerolls = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.2, 1, game.player.maxHp);
  generateOffers();
  renderShop();
  hud.shop.classList.remove("hidden");
}

function endRun() {
  game.mode = "over";
  hud.result.textContent = `第${game.wave}夜、撃破数 ${game.totalKills}、残りコイン ${game.money}枚。`;
  hud.gameOver.classList.remove("hidden");
}

function boostWeaponImpact(weapon, amount) {
  weapon.damage += amount;
  if (weapon.explosionRadius > 0) weapon.explosionDamage += amount * 1.35;
}

function extendWeaponReach(weapon, multiplier) {
  weapon.range *= multiplier;
  if (weapon.bulletSpeed > 1) {
    weapon.bulletSpeed *= multiplier;
    weapon.life *= 1 + (multiplier - 1) * 0.45;
  }
  if (weapon.kind === "sustainedLaser") weapon.duration *= 1 + (multiplier - 1) * 0.75;
  if (weapon.orbitRadius > 0) weapon.orbitRadius *= 1 + (multiplier - 1) * 0.65;
  if (weapon.kind === "chain") weapon.chainRange *= 1 + (multiplier - 1) * 0.7;
}

function addWeaponPierce(weapon, amount = 1) {
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

function expandWeaponArea(weapon, power) {
  const areaBoost = 1 + 0.08 * power;
  if (weapon.explosionRadius > 0) weapon.explosionRadius *= areaBoost;
  if (weapon.areaRadius > 0) weapon.areaRadius *= areaBoost;
  if (weapon.kind === "laser" || weapon.kind === "sustainedLaser") weapon.lineWidth *= areaBoost;
  if (weapon.kind === "flame" || weapon.kind === "sword") weapon.cone = Math.min(1.08, weapon.cone + 0.05 * power);
  if (weapon.radius > 0) weapon.radius += power;
}

function rarityRank(rarity) {
  return Math.max(0, RARITY_ORDER.indexOf(rarity));
}

function rarityPower(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.power || ATTACHMENT_RARITIES.normal.power;
}

function rarityLabel(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.label || ATTACHMENT_RARITIES.normal.label;
}

function rarityShortLabel(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.short || ATTACHMENT_RARITIES.normal.short;
}

function hasWeaponAttachment(weapon, key) {
  return weapon.attachments.some((attachment) => attachment.key === key);
}

function slotIndexForAttachment(index) {
  return clamp(index, 0, MAX_WEAPON_ATTACHMENTS - 1);
}

function rarityTableForSlot(slotIndex) {
  return ATTACHMENT_RARITY_TABLES[slotIndexForAttachment(slotIndex)];
}

function formatRarityOdds(slotIndex) {
  const table = rarityTableForSlot(slotIndex);
  return RARITY_ORDER
    .filter((rarity) => table[rarity] > 0)
    .map((rarity) => `${rarityShortLabel(rarity)}${table[rarity]}%`)
    .join(" / ");
}

function attachmentCategoryLabel(category) {
  const labels = {
    stat: "ステータス",
    special: "特殊効果",
    synergy: "シナジー",
    legend: "伝説効果",
  };
  return labels[category] || "効果";
}

function attachmentMinimumRarityLabel(definition) {
  return rarityLabel(definition?.minRarity || "normal");
}

function attachmentEffectSummary(definition, rarity) {
  if (!definition) return "";
  const power = rarityPower(rarity);
  if (definition.category === "stat") {
    return `効果量 ${power.toFixed(2)}倍`;
  }
  if (definition.category === "special") {
    return `特殊効果量 ${power.toFixed(2)}倍`;
  }
  if (definition.category === "synergy") {
    return `既存アタッチメントとの連動量 ${power.toFixed(2)}倍`;
  }
  return `総合強化 ${power.toFixed(2)}倍`;
}

function getSelectedAttachmentInfo() {
  const selected = game.selectedAttachment;
  if (!selected) return null;
  const weapon = findWeapon(selected.weaponId);
  if (!weapon) {
    game.selectedAttachment = null;
    return null;
  }
  const attachment = weapon.attachments[selected.attachmentIndex];
  if (!attachment) {
    game.selectedAttachment = null;
    return null;
  }
  const definition = findAttachmentDefinition(attachment.key);
  return {
    weapon,
    attachment,
    definition,
    attachmentIndex: selected.attachmentIndex,
  };
}

const ACTIVE_ATTACHMENTS = [
  {
    key: "powerCore",
    name: "威力コア",
    minRarity: "normal",
    category: "stat",
    text: "武器の基礎ダメージを上げる。爆発武器は爆風威力も上がる。",
    attach: (weapon, power) => {
      boostWeaponImpact(weapon, Math.round(4 * power));
    },
  },
  {
    key: "rapidMechanism",
    name: "高速機構",
    minRarity: "normal",
    category: "stat",
    text: "武器の攻撃頻度を上げる。設置武器は置き直しが早くなる。",
    attach: (weapon, power) => {
      weapon.fireRate *= 1 + 0.1 * power;
    },
  },
  {
    key: "rangeTube",
    name: "射程チューブ",
    minRarity: "normal",
    category: "stat",
    text: "弾、炎、斬撃、設置攻撃の届く距離を広げる。",
    attach: (weapon, power) => {
      extendWeaponReach(weapon, 1 + 0.1 * power);
    },
  },
  {
    key: "areaLens",
    name: "範囲レンズ",
    minRarity: "normal",
    category: "stat",
    text: "武器の当たり幅や巻き込み範囲を広げる。",
    attach: (weapon, power) => {
      addWeaponPierce(weapon, 0.8 + power * 0.35);
      expandWeaponArea(weapon, power);
    },
  },
  {
    key: "stableGrip",
    name: "安定グリップ",
    minRarity: "normal",
    category: "stat",
    text: "武器のブレを抑え、弾速と手応えを少し上げる。",
    attach: (weapon, power) => {
      weapon.spread *= Math.max(0.55, 1 - 0.08 * power);
      weapon.jitter *= Math.max(0.45, 1 - 0.12 * power);
      if (weapon.bulletSpeed > 1) weapon.bulletSpeed *= 1 + 0.07 * power;
      boostWeaponImpact(weapon, Math.round(1.5 * power));
    },
  },
  {
    key: "splitChamber",
    name: "分裂チャンバー",
    minRarity: "rare",
    category: "special",
    text: "弾数や攻撃幅を増やす特殊改造。レア以上で出現する。",
    attach: (weapon, power) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.12, weapon.cone + 0.07 * power);
      } else if (weapon.kind === "orbit") {
        weapon.areaRadius += 7 * power;
        weapon.orbitSpeed *= 1 + 0.05 * power;
      } else {
        weapon.projectiles += Math.max(1, Math.floor(power));
        weapon.spread += 0.025 * power;
      }
    },
  },
  {
    key: "blastPrimer",
    name: "爆裂プライマー",
    minRarity: "rare",
    category: "special",
    text: "着弾や設置攻撃に小さな爆発性を持たせる。レア以上で出現する。",
    attach: (weapon, power) => {
      const radius = 44 + 18 * power;
      weapon.explosionRadius = Math.max(weapon.explosionRadius, radius);
      weapon.explosionDamage = Math.max(weapon.explosionDamage, weapon.damage * (0.45 + 0.11 * power));
      if (weapon.kind === "timedBomb") weapon.fuse = Math.max(0.75, weapon.fuse - 0.12 * power);
    },
  },
  {
    key: "sustainEmitter",
    name: "持続エミッター",
    minRarity: "rare",
    category: "special",
    text: "炎、レーザー、回転武器の持続と当たり続ける力を伸ばす。",
    attach: (weapon, power) => {
      weapon.duration *= 1 + 0.14 * power;
      if (weapon.tickRate > 0) weapon.tickRate *= 1 + 0.12 * power;
      if (weapon.kind === "flame" || weapon.kind === "sustainedLaser") weapon.fireRate *= 1 + 0.05 * power;
      if (weapon.kind === "orbit") weapon.orbitRadius *= 1 + 0.07 * power;
    },
  },
  {
    key: "overclockLink",
    name: "過給リンク",
    minRarity: "epic",
    category: "synergy",
    text: "威力コアや高速機構と噛み合うシナジー改造。エピック以上で出現する。",
    attach: (weapon, power) => {
      const hasPower = hasWeaponAttachment(weapon, "powerCore");
      const hasRapid = hasWeaponAttachment(weapon, "rapidMechanism");
      if (hasPower) boostWeaponImpact(weapon, Math.round(2.5 * power));
      if (hasRapid) weapon.fireRate *= 1 + 0.08 * power;
      if (!hasPower && !hasRapid) {
        boostWeaponImpact(weapon, Math.round(1.5 * power));
        weapon.fireRate *= 1 + 0.04 * power;
      }
    },
  },
  {
    key: "focusPrism",
    name: "収束プリズム",
    minRarity: "epic",
    category: "synergy",
    text: "射程チューブや範囲レンズと噛み合うシナジー改造。エピック以上で出現する。",
    attach: (weapon, power) => {
      const hasRange = hasWeaponAttachment(weapon, "rangeTube");
      const hasArea = hasWeaponAttachment(weapon, "areaLens");
      if (hasRange) extendWeaponReach(weapon, 1 + 0.055 * power);
      if (hasArea) expandWeaponArea(weapon, power * 0.7);
      if (hasRange && hasArea) boostWeaponImpact(weapon, Math.round(2 * power));
    },
  },
  {
    key: "nightLegend",
    name: "夜街の伝説",
    minRarity: "legend",
    category: "legend",
    text: "5枠目でだけ出る伝説級改造。武器全体を大きく底上げする。",
    attach: (weapon, power) => {
      boostWeaponImpact(weapon, Math.round(4 * power));
      weapon.fireRate *= 1 + 0.07 * power;
      extendWeaponReach(weapon, 1 + 0.06 * power);
      expandWeaponArea(weapon, power);
      if (weapon.kind !== "flame" && weapon.kind !== "sword" && weapon.kind !== "orbit") {
        weapon.projectiles += 1;
      }
    },
  },
];

function generateOffers() {
  const pool = [
    {
      type: "weapon",
      name: "路地裏ピストル",
      text: "扱いやすい武器。弾の手応えが少し重くなる。",
      baseCost: 12,
      weapon: {
        damage: 24,
        fireRate: 1.45,
        bulletSpeed: 700,
      },
    },
    {
      type: "weapon",
      name: "釘打ち銃",
      text: "連射寄りの武器。短い間隔で弾を撃てる。",
      baseCost: 13,
      weapon: {
        damage: 13,
        fireRate: 2.5,
        bulletSpeed: 650,
      },
    },
    {
      type: "weapon",
      name: "二連バレル",
      text: "散らして撃つ武器。弾数は増えるが、一発は少し軽くなる。",
      baseCost: 24,
      weapon: {
        damage: 14,
        fireRate: 1.18,
        bulletSpeed: 620,
        projectiles: 2,
        spread: 0.2,
      },
    },
    {
      type: "weapon",
      name: "貫通ライフル",
      text: "列を抜く武器。弾が敵を貫きやすくなる。",
      baseCost: 18,
      weapon: {
        damage: 27,
        fireRate: 0.95,
        bulletSpeed: 760,
        pierce: 1,
        life: 0.82,
      },
    },
    {
      type: "weapon",
      name: "サブマシンガン",
      text: "近い敵へ細かい弾幕を浴びせる。狙いは少し暴れるが、群れを削り続ける。",
      baseCost: 19,
      weapon: {
        damage: 8,
        fireRate: 6.2,
        bulletSpeed: 730,
        life: 0.48,
        spread: 0.05,
        jitter: 0.24,
        kick: 1.0,
      },
    },
    {
      type: "weapon",
      name: "火炎放射器",
      text: "前方を炎でなぎ払う。近くの群れにまとめて火をつける。",
      baseCost: 22,
      weapon: {
        kind: "flame",
        damage: 7,
        fireRate: 5.4,
        bulletSpeed: 1,
        range: 185,
        cone: 0.58,
        kick: 1.2,
        effectTint: [1, 0.52, 0.2],
        effectGlow: "glowRed",
      },
    },
    {
      type: "weapon",
      name: "レーザー照射器",
      text: "一直線に焼き切る。列になった敵をまとめて貫く。",
      baseCost: 26,
      weapon: {
        kind: "laser",
        damage: 32,
        fireRate: 0.78,
        bulletSpeed: 1,
        range: 640,
        pierce: 8,
        lineWidth: 22,
        kick: 2.2,
        effectTint: [0.48, 1, 1],
        effectGlow: "glowCyan",
      },
    },
    {
      type: "weapon",
      name: "次元爆弾",
      text: "着弾すると空間が弾ける。爆心の周囲をまとめて巻き込む。",
      baseCost: 28,
      weapon: {
        kind: "bomb",
        damage: 8,
        explosionDamage: 44,
        fireRate: 0.55,
        bulletSpeed: 380,
        life: 0.92,
        range: 420,
        radius: 12,
        explosionRadius: 132,
        kick: 3.4,
        bulletTint: [0.75, 0.78, 1],
        bulletGlow: "glowCyan",
        effectTint: [0.84, 0.58, 1],
        effectGlow: "glowRed",
      },
    },
    {
      type: "weapon",
      name: "テスラコイル",
      text: "青い火花が敵から敵へ跳ねる。散った群れにも手が届く。",
      baseCost: 23,
      weapon: {
        kind: "chain",
        damage: 17,
        fireRate: 1.15,
        bulletSpeed: 1,
        range: 430,
        chainCount: 3,
        chainRange: 190,
        kick: 1.7,
        effectTint: [0.45, 0.95, 1],
        effectGlow: "glowCyan",
      },
    },
    {
      type: "weapon",
      name: "回転ノコギリ",
      text: "重い刃を投げる。遅いが敵の列を削りながら進む。",
      baseCost: 21,
      weapon: {
        damage: 20,
        fireRate: 1.0,
        bulletSpeed: 500,
        life: 0.9,
        radius: 13,
        pierce: 3,
        kick: 2.4,
        bulletTint: [0.8, 0.95, 1],
        bulletGlow: "glowCyan",
      },
    },
    {
      type: "attachment",
      name: "改造トリガー",
      text: "引き金を短くし、武器の手数を増やす。",
      baseCost: 13,
      attach: (weapon) => {
        weapon.fireRate *= 1.18;
      },
    },
    {
      type: "attachment",
      name: "密輸弾薬",
      text: "弾薬の質を上げ、着弾の勢いを強める。",
      baseCost: 16,
      attach: (weapon) => {
        boostWeaponImpact(weapon, 5);
        weapon.bulletSpeed *= 1.12;
      },
    },
    {
      type: "attachment",
      name: "貫通クリップ",
      text: "弾が敵の群れを抜けやすくなる。",
      baseCost: 17,
      attach: (weapon) => {
        addWeaponPierce(weapon);
      },
    },
    {
      type: "attachment",
      name: "ロングバレル",
      text: "遠くの敵まで弾が届きやすくなる。",
      baseCost: 14,
      attach: (weapon) => {
        extendWeaponReach(weapon, 1.18);
      },
    },
    {
      type: "relic",
      name: "錆びた守り札",
      text: "倒れにくくなる古いお守り。傷も少し塞がる。",
      baseCost: 14,
      apply: () => {
        game.player.maxHp += 22;
        game.player.hp = clamp(game.player.hp + 22, 1, game.player.maxHp);
      },
    },
    {
      type: "relic",
      name: "割れた防犯バッジ",
      text: "噛まれた時の痛みを和らげる。",
      baseCost: 11,
      apply: () => {
        game.player.armor += 3;
      },
    },
    {
      type: "relic",
      name: "応急テープ",
      text: "戦闘中に少しずつ傷を塞ぐ。",
      baseCost: 18,
      apply: () => {
        game.player.regen += 0.7;
      },
    },
    {
      type: "relic",
      name: "壊れかけの電池",
      text: "危ない力を引き出すが、身を守りにくくなる。",
      baseCost: 15,
      apply: () => {
        game.player.weaponPowerBonus += 8;
        game.player.armor -= 2;
      },
    },
    {
      type: "relic",
      name: "スクラップ磁石",
      text: "落ちたコインがこちらへ寄りやすくなる。",
      baseCost: 9,
      apply: () => {
        game.player.pickup += 34;
      },
    },
    {
      type: "relic",
      name: "軽量スニーカー",
      text: "足回りを軽くして、逃げ回りやすくする。",
      baseCost: 10,
      apply: () => {
        game.player.speed += 22;
      },
    },
  ];

  const activeWeapons = [
    {
      type: "weapon",
      name: "豆鉄砲",
      text: "短射程のマシンガン。軽い弾を近距離にばらまく。",
      baseCost: 14,
      weapon: {
        damage: 5,
        fireRate: 8.2,
        bulletSpeed: 620,
        life: 0.34,
        range: 220,
        radius: 7,
        jitter: 0.2,
        kick: 0.8,
        bulletTint: [1, 0.92, 0.55],
        bulletGlow: "glowAmber",
      },
    },
    {
      type: "weapon",
      name: "火炎放射器",
      text: "前方に炎を吹きつける。近くの群れをまとめて焼く。",
      baseCost: 22,
      weapon: {
        kind: "flame",
        damage: 6,
        fireRate: 5.5,
        bulletSpeed: 1,
        range: 195,
        cone: 0.62,
        kick: 1.2,
        effectTint: [1, 0.42, 0.12],
        effectGlow: "glowRed",
      },
    },
    {
      type: "weapon",
      name: "時限爆弾",
      text: "その場に爆弾を置く。数秒後に広い範囲を爆破する。",
      baseCost: 25,
      weapon: {
        kind: "timedBomb",
        damage: 0,
        explosionDamage: 54,
        fireRate: 0.42,
        bulletSpeed: 0,
        fuse: 2.2,
        life: 2.2,
        range: 260,
        radius: 15,
        explosionRadius: 150,
        kick: 3.4,
        bulletTint: [0.95, 0.72, 0.34],
        bulletGlow: "glowRed",
        effectTint: [1, 0.52, 0.16],
        effectGlow: "glowRed",
      },
    },
    {
      type: "weapon",
      name: "レーザー",
      text: "設置した光線がしばらく残り、触れた敵を連続で焼く。",
      baseCost: 27,
      weapon: {
        kind: "sustainedLaser",
        damage: 18,
        fireRate: 0.48,
        bulletSpeed: 1,
        range: 560,
        lineWidth: 18,
        duration: 1.35,
        tickRate: 8,
        pierce: 8,
        kick: 2.0,
        effectTint: [0.48, 1, 1],
        effectGlow: "glowCyan",
      },
    },
    {
      type: "weapon",
      name: "モーニングスター",
      text: "自分の周囲を回る鉄球で、近くの敵を巻き込む。",
      baseCost: 21,
      weapon: {
        kind: "orbit",
        damage: 20,
        fireRate: 2.6,
        bulletSpeed: 1,
        range: 145,
        areaRadius: 38,
        orbitRadius: 82,
        orbitSpeed: 4.6,
        kick: 1.5,
        effectTint: [0.84, 0.88, 1],
        effectGlow: "glowCyan",
      },
    },
    {
      type: "weapon",
      name: "ソード",
      text: "自身の前方を扇形に斬る。近距離の敵をまとめて払う。",
      baseCost: 18,
      weapon: {
        kind: "sword",
        damage: 24,
        fireRate: 1.35,
        bulletSpeed: 1,
        range: 135,
        cone: 0.66,
        kick: 2.1,
        effectTint: [0.74, 0.96, 1],
        effectGlow: "glowCyan",
      },
    },
  ];

  const activePool = [
    ...activeWeapons,
    ...pool.filter((item) => item.type === "relic"),
  ];

  const picks = [];
  const used = new Set();
  for (const type of game.player.gear.weapons.length < MAX_WEAPONS ? ["weapon", "relic"] : ["relic"]) {
    addOfferPick(activePool, picks, used, type);
  }
  let guard = 0;
  while (picks.length < 4 && guard < 40) {
    addOfferPick(activePool, picks, used);
    guard += 1;
  }
  game.offers = shuffle(picks);
}

function addOfferPick(pool, picks, used, type = "") {
  const candidates = [];
  pool.forEach((offer, index) => {
    if (used.has(index)) return;
    if (type && offer.type !== type) return;
    if (offer.type === "weapon" && game.player.gear.weapons.length >= MAX_WEAPONS) return;
    if (offer.type === "weapon" && game.player.gear.weapons.some((weapon) => weapon.name === offer.name)) return;
    if (offer.type === "attachment" && game.player.gear.weapons.length === 0) return;
    candidates.push(index);
  });
  if (candidates.length === 0) return;

  const index = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(index);
  const template = pool[index];
  const offer = {
    ...template,
    cost: Math.max(4, Math.round(template.baseCost * (1 + game.wave * 0.14) + Math.random() * 4)),
    bought: false,
    choosing: false,
  };
  picks.push(offer);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function rerollCost() {
  return Math.floor(4 + game.wave * 1.5 + game.rerolls * 3);
}

function weaponUpgradeCost(weapon) {
  const slotIndex = slotIndexForAttachment(weapon?.attachments.length || 0);
  return Math.floor(WEAPON_UPGRADE_SLOT_COSTS[slotIndex] + game.wave * (1.4 + slotIndex * 0.7));
}

function attachmentRerollCost(weapon, attachmentIndex = 0) {
  const slotIndex = slotIndexForAttachment(attachmentIndex);
  return Math.floor(ATTACHMENT_REROLL_SLOT_COSTS[slotIndex] + game.wave * (1.1 + slotIndex * 0.55));
}

function rollAttachmentRarity(slotIndex) {
  const table = rarityTableForSlot(slotIndex);
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rarity of RARITY_ORDER) {
    cursor += table[rarity] || 0;
    if (roll < cursor) return rarity;
  }
  return "normal";
}

function attachmentCanAppear(attachment, rarity) {
  return rarityRank(rarity) >= rarityRank(attachment.minRarity || "normal");
}

function pickRandomAttachment(slotIndex) {
  const rarity = rollAttachmentRarity(slotIndex);
  const candidates = ACTIVE_ATTACHMENTS.filter((attachment) => attachmentCanAppear(attachment, rarity));
  if (candidates.length === 0) return null;
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  return { definition, rarity };
}

function addAttachmentToWeapon(weapon, attachment) {
  if (!weapon || !attachment || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  if (!definition?.key) return false;
  const rarity = attachment.rarity || "normal";
  weapon.attachments.push({
    key: definition.key,
    name: definition.name,
    rarity,
    category: definition.category || "stat",
  });
  recomputeWeaponAttachments(weapon);
  return true;
}

function upgradeWeaponAttachment(weaponId) {
  const weapon = findWeapon(weaponId);
  if (!weapon || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return;
  const cost = weaponUpgradeCost(weapon);
  if (game.money < cost) return;

  const attachment = pickRandomAttachment(weapon.attachments.length);
  const attachmentIndex = weapon.attachments.length;
  if (!addAttachmentToWeapon(weapon, attachment)) return;

  game.money -= cost;
  game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

function rerollWeaponAttachment(weaponId, attachmentIndex) {
  const weapon = findWeapon(weaponId);
  if (!weapon || !weapon.attachments[attachmentIndex]) return;
  const cost = attachmentRerollCost(weapon);
  if (game.money < cost) return;

  const replacement = pickRandomAttachment(attachmentIndex);
  if (!replacement) return;
  weapon.attachments[attachmentIndex] = {
    key: replacement.definition.key,
    name: replacement.definition.name,
    rarity: replacement.rarity,
    category: replacement.definition.category || "stat",
  };
  recomputeWeaponAttachments(weapon);

  game.money -= cost;
  game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

function buyOffer(index) {
  const offer = game.offers[index];
  if (!offer || !canBuyOffer(offer)) return;

  game.money -= offer.cost;
  offer.bought = true;
  applyOffer(offer);
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

function canBuyOffer(offer) {
  if (!offer || offer.bought || game.money < offer.cost) return false;
  if (offer.type === "weapon") return game.player.gear.weapons.length < MAX_WEAPONS;
  if (offer.type === "attachment") return false;
  return true;
}

function applyOffer(offer, targetWeapon = null) {
  if (offer.type === "weapon") {
    game.player.gear.weapons.push(createWeapon({ name: offer.name, ...offer.weapon }));
    return;
  }

  if (offer.type === "attachment") {
    const weapon = targetWeapon || findWeapon(offer.targetWeaponId);
    if (!weapon) return;
    addAttachmentToWeapon(weapon, offer);
    return;
  }

  offer.apply();
  game.player.gear.relics.push(offer.name);
}

function findWeapon(id) {
  return game.player.gear.weapons.find((weapon) => weapon.id === id) || null;
}

function weaponKindLabel(weapon) {
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

function renderShop() {
  hud.shopCash.textContent = String(game.money);
  hud.offers.replaceChildren();

  game.offers.forEach((offer, index) => {
    const card = document.createElement("article");
    card.className = `offer offer-${offer.type}`;

    const type = document.createElement("span");
    type.className = `offer-type offer-type-${offer.type}`;
    type.textContent = OFFER_TYPE_LABELS[offer.type] || "装備";

    const title = document.createElement("h2");
    title.textContent = offer.name;

    const body = document.createElement("p");
    body.textContent = offer.text;

    const meta = document.createElement("small");
    meta.className = "offer-meta";
    meta.textContent = offer.type === "weapon"
      ? `武器スロット ${game.player.gear.weapons.length}/${MAX_WEAPONS}`
      : "プレイヤーが所持";

    const price = document.createElement("div");
    price.className = "price";

    const cost = document.createElement("strong");
    cost.textContent = offer.bought ? "売切" : `${offer.cost}枚`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = offer.bought ? "購入済み" : "購入";
    button.disabled = !canBuyOffer(offer);
    button.addEventListener("click", () => buyOffer(index));

    price.append(cost, button);
    card.append(type, title, body, meta, price);
    hud.offers.append(card);
  });

  renderGearInventory();

  const cost = rerollCost();
  hud.reroll.textContent = `リロール ${cost}枚`;
  hud.reroll.disabled = game.money < cost;
  hud.nextWave.disabled = false;
}

function createAttachmentInfoPanel() {
  const info = getSelectedAttachmentInfo();
  if (!info) return null;

  const { weapon, attachment, definition, attachmentIndex } = info;
  const panel = document.createElement("aside");
  panel.className = `attachment-info-panel attach-rarity-${attachment.rarity || "normal"}`;

  const head = document.createElement("div");
  head.className = "attachment-info-head";

  const titleBlock = document.createElement("div");
  titleBlock.className = "attachment-info-title";

  const rarity = document.createElement("span");
  rarity.className = "attach-rarity-label";
  rarity.textContent = rarityLabel(attachment.rarity);

  const title = document.createElement("strong");
  title.textContent = attachment.name;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "attachment-info-close";
  close.textContent = "閉じる";
  close.addEventListener("click", () => {
    game.selectedAttachment = null;
    renderGearInventory();
  });

  titleBlock.append(rarity, title);
  head.append(titleBlock, close);

  const meta = document.createElement("div");
  meta.className = "attachment-info-meta";
  const slot = document.createElement("span");
  slot.textContent = `${weapon.name} / ${attachmentIndex + 1}枠目`;
  const category = document.createElement("span");
  category.textContent = attachmentCategoryLabel(attachment.category);
  const minimum = document.createElement("span");
  minimum.textContent = `出現: ${attachmentMinimumRarityLabel(definition)}以上`;
  meta.append(slot, category, minimum);

  const text = document.createElement("p");
  text.textContent = definition?.text || "効果情報がまだ設定されていません。";

  const summary = document.createElement("strong");
  summary.className = "attachment-info-summary";
  summary.textContent = attachmentEffectSummary(definition, attachment.rarity);

  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.className = "attachment-info-reroll";
  const cost = attachmentRerollCost(weapon, attachmentIndex);
  reroll.textContent = `この枠を入替 ${cost}枚`;
  reroll.disabled = game.money < cost;
  reroll.addEventListener("click", () => rerollWeaponAttachment(weapon.id, attachmentIndex));

  panel.append(head, meta, text, summary, reroll);
  return panel;
}

function renderGearInventory() {
  hud.gearInventory.replaceChildren();
  const gear = game.player.gear;

  const board = document.createElement("div");
  board.className = "loadout-board";

  for (let index = 0; index < MAX_WEAPONS; index += 1) {
    const weapon = gear.weapons[index];
    const slot = document.createElement("article");
    slot.className = `weapon-slot ${weapon ? "weapon-slot-filled" : "weapon-slot-empty"}`;

    const top = document.createElement("div");
    top.className = "weapon-slot-top";

    const label = document.createElement("span");
    label.className = "slot-index";
    label.textContent = `武器 ${index + 1}`;

    const status = document.createElement("span");
    status.className = `slot-status ${weapon ? "slot-status-equipped" : "slot-status-empty"}`;
    status.textContent = weapon ? "装備中" : "空き";

    top.append(label, status);

    const name = document.createElement("strong");
    name.className = "weapon-slot-name";
    name.textContent = weapon ? weapon.name : "未装備";

    const kind = document.createElement("small");
    kind.className = "weapon-slot-kind";
    kind.textContent = weapon ? weaponKindLabel(weapon) : "武器スロット";

    const attachmentTrack = document.createElement("div");
    attachmentTrack.className = "attachment-track";

    const attachmentTitle = document.createElement("span");
    attachmentTitle.className = "attachment-title";
    attachmentTitle.textContent = weapon
      ? `アタッチメント ${weapon.attachments.length}/${MAX_WEAPON_ATTACHMENTS}`
      : "アタッチメント";

    const attachmentList = document.createElement("div");
    attachmentList.className = "attachment-list";

    const attachments = weapon?.attachments || [];
    if (attachments.length > 0) {
      attachments.forEach((attachment, attachmentIndex) => {
        const row = document.createElement("div");
        row.className = "attachment-row";

        const isSelected = game.selectedAttachment?.weaponId === weapon.id
          && game.selectedAttachment?.attachmentIndex === attachmentIndex;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `attach-chip attach-info-button attach-rarity-${attachment.rarity || "normal"} ${isSelected ? "attach-chip-selected" : ""}`;
        chip.addEventListener("click", () => {
          game.selectedAttachment = { weaponId: weapon.id, attachmentIndex };
          renderGearInventory();
        });

        const rarity = document.createElement("span");
        rarity.className = "attach-rarity-label";
        rarity.textContent = rarityLabel(attachment.rarity);

        const attachmentName = document.createElement("span");
        attachmentName.className = "attach-name";
        attachmentName.textContent = attachment.name;

        chip.append(rarity, attachmentName);

        const rerollButton = document.createElement("button");
        rerollButton.type = "button";
        rerollButton.className = "attachment-reroll";
        const cost = attachmentRerollCost(weapon, attachmentIndex);
        rerollButton.textContent = `入替 ${cost}枚`;
        rerollButton.disabled = game.money < cost;
        rerollButton.addEventListener("click", () => rerollWeaponAttachment(weapon.id, attachmentIndex));

        row.append(chip, rerollButton);
        attachmentList.append(row);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "attach-chip attach-chip-empty";
      empty.textContent = weapon ? "空き" : "未装着";
      attachmentList.append(empty);
    }

    attachmentTrack.append(attachmentTitle, attachmentList);
    if (weapon) {
      const upgradeActions = document.createElement("div");
      upgradeActions.className = "weapon-upgrade-actions";

      const upgradeButton = document.createElement("button");
      upgradeButton.type = "button";
      upgradeButton.className = "weapon-upgrade-button";
      const upgradeCost = weaponUpgradeCost(weapon);
      upgradeButton.textContent = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS
        ? "強化上限"
        : `強化 ${upgradeCost}枚`;
      upgradeButton.disabled = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS || game.money < upgradeCost;
      upgradeButton.addEventListener("click", () => upgradeWeaponAttachment(weapon.id));

      const upgradeNote = document.createElement("small");
      upgradeNote.className = "weapon-upgrade-note";
      upgradeNote.textContent = weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS
        ? "装着枠が満杯"
        : `次枠: ${formatRarityOdds(weapon.attachments.length)}`;

      upgradeActions.append(upgradeButton, upgradeNote);
      attachmentTrack.append(upgradeActions);
    }

    slot.append(top, name, kind, attachmentTrack);
    board.append(slot);
  }

  const relicShelf = document.createElement("div");
  relicShelf.className = "relic-shelf";
  const relicLabel = document.createElement("span");
  relicLabel.textContent = "レリック";
  const relicCount = document.createElement("strong");
  relicCount.textContent = `${gear.relics.length}`;
  const relicList = document.createElement("small");
  relicList.textContent = gear.relics.length > 0 ? gear.relics.slice(-5).join(" / ") : "未所持";
  relicShelf.append(relicLabel, relicCount, relicList);

  const attachmentInfoPanel = createAttachmentInfoPanel();
  hud.gearInventory.append(board);
  if (attachmentInfoPanel) hud.gearInventory.append(attachmentInfoPanel);
  hud.gearInventory.append(relicShelf);
}

function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = formatTime(game.timeLeft);
  hud.cash.textContent = String(game.money);
  hud.kills.textContent = String(game.waveKills);
  hud.hp.style.width = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  if (hud.hpText) hud.hpText.textContent = `${Math.ceil(game.player.hp)}/${Math.ceil(game.player.maxHp)}`;
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  syncTouchControls();
}

function formatTime(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function update(dt) {
  game.elapsed += dt;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.4);
  game.shake = Math.max(0, game.shake - dt * 45);

  if (game.mode !== "fight") {
    updateCamera(dt);
    updateHud();
    return;
  }

  const p = game.player;
  game.timeLeft -= dt;

  updateMovement(dt);
  p.hp = clamp(p.hp + p.regen * dt, 0, p.maxHp);
  updateWeaponTimers(p, dt);

  spawnEnemies(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateEffects(dt);
  autoShoot();
  updateCamera(dt);

  if (p.hp <= 0) {
    endRun();
  } else if (game.timeLeft <= 0) {
    enterShop();
  }

  updateHud();
}

function updateWeaponTimers(player, dt) {
  for (const weapon of player.gear.weapons) {
    weapon.shootTimer = Math.max(0, weapon.shootTimer - dt);
  }
}

function updateMovement(dt) {
  const p = game.player;
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  const hasKeyboardInput = x !== 0 || y !== 0;

  if (!hasKeyboardInput && pointer.down) {
    x = pointer.moveX;
    y = pointer.moveY;
  }

  const move = normalize(x, y);
  const speedScale = hasKeyboardInput ? 1 : clamp(pointer.strength, 0, 1);
  p.moveX = move.x;
  p.moveY = move.y;
  p.x += move.x * p.speed * speedScale * dt;
  p.y += move.y * p.speed * speedScale * dt;
  if (move.len > 0 && speedScale > 0.05) {
    p.walkTime = (p.walkTime + dt * (1.45 + speedScale * 1.1)) % 1;
    p.walkDustTimer -= dt;
    if (p.walkDustTimer <= 0) {
      addWalkDust(p.x - move.x * 15, p.y + 24 - move.y * 8, move.x, move.y);
      p.walkDustTimer = 0.18;
    }
  } else {
    p.walkTime = 0;
    p.walkDustTimer = 0;
  }
}

function updateCamera(dt) {
  const p = game.player;
  game.camera.x = lerp(game.camera.x, p.x, clamp(dt * 8, 0, 1));
  game.camera.y = lerp(game.camera.y, p.y, clamp(dt * 8, 0, 1));
}

function spawnEnemies(dt) {
  if (game.enemies.length > 75 + game.wave * 9) return;

  const interval = Math.max(0.16, 0.7 - game.wave * 0.045);
  game.spawnClock -= dt;
  while (game.spawnClock <= 0) {
    spawnEnemy();
    game.spawnClock += interval * (0.75 + Math.random() * 0.65);
  }
}

function spawnEnemy() {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const margin = 95;
  const side = Math.floor(Math.random() * 4);
  let x = game.player.x;
  let y = game.player.y;

  if (side === 0) {
    x += (Math.random() - 0.5) * (visibleW + margin * 2);
    y -= visibleH / 2 + margin;
  } else if (side === 1) {
    x += visibleW / 2 + margin;
    y += (Math.random() - 0.5) * (visibleH + margin * 2);
  } else if (side === 2) {
    x += (Math.random() - 0.5) * (visibleW + margin * 2);
    y += visibleH / 2 + margin;
  } else {
    x -= visibleW / 2 + margin;
    y += (Math.random() - 0.5) * (visibleH + margin * 2);
  }

  const roll = Math.random();
  const wave = game.wave;
  let type = "walker";
  if (wave >= 3 && roll < 0.14) type = "brute";
  else if (wave >= 2 && roll < 0.42) type = "runner";

  const baseHp = 28 + wave * 8;
  const enemy = {
    id: enemyId,
    x,
    y,
    radius: 18,
    hp: baseHp,
    maxHp: baseHp,
    speed: 78 + wave * 3,
    attackDamage: Math.round(9 + wave * 0.8),
    attackCooldown: Math.max(0.74, 1.08 - wave * 0.012),
    attackTimer: 0,
    value: 2 + Math.floor(wave / 2),
    sprite: "zombieA",
    readableSprite: "zombieAReadable",
    hit: 0,
    wobble: Math.random() * TAU,
  };
  enemyId += 1;

  if (type === "runner") {
    enemy.radius = 16;
    enemy.hp = baseHp * 0.72;
    enemy.maxHp = enemy.hp;
    enemy.speed = 122 + wave * 4;
    enemy.attackDamage = Math.round(7 + wave * 0.65);
    enemy.attackCooldown = Math.max(0.52, 0.76 - wave * 0.008);
    enemy.value = 2 + Math.floor(wave / 3);
    enemy.sprite = "zombieB";
    enemy.readableSprite = "zombieBReadable";
  } else if (type === "brute") {
    enemy.radius = 27;
    enemy.hp = baseHp * 2.85;
    enemy.maxHp = enemy.hp;
    enemy.speed = 58 + wave * 2.4;
    enemy.attackDamage = Math.round(18 + wave * 1.1);
    enemy.attackCooldown = Math.max(1.0, 1.36 - wave * 0.012);
    enemy.value = 6 + wave;
    enemy.sprite = "zombieBig";
    enemy.readableSprite = "zombieBigReadable";
  }

  game.enemies.push(enemy);
}

function updateEnemies(dt) {
  const p = game.player;
  for (const enemy of game.enemies) {
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    enemy.attackTimer = Math.max(0, (enemy.attackTimer ?? 0) - dt);
    if (enemy.attackTimer < 0.0001) enemy.attackTimer = 0;
    const dir = normalize(p.x - enemy.x, p.y - enemy.y);
    enemy.x += dir.x * enemy.speed * dt;
    enemy.y += dir.y * enemy.speed * dt;

    const minDist = p.radius + enemy.radius;
    if (dir.len < minDist) {
      if (dir.len > 0.01) {
        const push = (minDist - dir.len) * 0.5;
        enemy.x -= dir.x * push;
        enemy.y -= dir.y * push;
        p.x += dir.x * push * 0.18;
        p.y += dir.y * push * 0.18;
      }
      if (enemy.attackTimer <= 0) {
        damagePlayer(enemy.attackDamage ?? enemy.damage ?? 1);
        enemy.attackTimer = enemy.attackCooldown ?? 1;
      }
    }
  }
}

function updateBullets(dt) {
  const enemyGrid = buildEnemyGrid();
  const next = [];
  for (const bullet of game.bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.life <= 0) {
      if (bullet.explosionRadius > 0) explodeBullet(bullet);
      continue;
    }
    if (bullet.collides === false) {
      next.push(bullet);
      continue;
    }

    let keep = true;
    const bulletCellX = Math.floor(bullet.x / COLLISION_CELL_SIZE);
    const bulletCellY = Math.floor(bullet.y / COLLISION_CELL_SIZE);
    nearbyCells: for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const cell = enemyGrid.get(gridKey(bulletCellX + xOffset, bulletCellY + yOffset));
        if (!cell) continue;

        for (const enemy of cell) {
          if (enemy.dead) continue;
          if (bullet.hitIds.has(enemy.id)) continue;
          const range = enemy.radius + bullet.radius;
          if (distSq(bullet.x, bullet.y, enemy.x, enemy.y) > range * range) continue;

          bullet.hitIds.add(enemy.id);
          damageEnemy(enemy, bullet.damage, bullet.x, bullet.y, 3, 90);
          if (bullet.explosionRadius > 0) {
            explodeBullet(bullet);
            keep = false;
            break nearbyCells;
          }
          bullet.pierce -= 1;
          if (bullet.pierce < 0) {
            keep = false;
            break nearbyCells;
          }
        }
      }
    }
    if (keep) next.push(bullet);
  }
  removeDeadEnemies();
  game.bullets = next;
}

function damageEnemy(enemy, amount, impactX = enemy.x, impactY = enemy.y, sparkCount = 3, sparkSpeed = 90) {
  if (!enemy || enemy.dead) return false;
  enemy.hp -= amount;
  enemy.hit = 1;
  if (sparkCount > 0) addSparks(impactX, impactY, sparkCount, sparkSpeed);
  if (enemy.hp <= 0) {
    killEnemy(enemy);
    return true;
  }
  return false;
}

function explodeBullet(bullet) {
  const radius = bullet.explosionRadius || 0;
  if (radius <= 0) return;
  addEffect({
    type: "burst",
    x: bullet.x,
    y: bullet.y,
    radius,
    life: 0.42,
    maxLife: 0.42,
    glow: bullet.effectGlow || "glowRed",
    tint: bullet.effectTint || [1, 0.56, 0.18],
  });
  addSparks(bullet.x, bullet.y, 9, 150);
  damageEnemiesInRadius(bullet.x, bullet.y, radius, bullet.explosionDamage || bullet.damage, 0.58);
  game.shake = Math.max(game.shake, 5);
}

function damageEnemiesInRadius(x, y, radius, amount, edgeScale = 0.65) {
  let hits = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance > radius + enemy.radius) continue;
    const centerFactor = 1 - clamp((distance - enemy.radius) / Math.max(1, radius), 0, 1);
    const damage = amount * (edgeScale + (1 - edgeScale) * centerFactor);
    damageEnemy(enemy, damage, enemy.x, enemy.y, 2, 80);
    hits += 1;
  }
  if (hits > 0) removeDeadEnemies();
  return hits;
}

function damageEnemiesInLine(x1, y1, x2, y2, halfWidth, amount, maxHits = Infinity, sparkCount = 2, sparkSpeed = 110) {
  const hits = [];
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const range = enemy.radius + halfWidth;
    if (distanceToSegmentSq(enemy.x, enemy.y, x1, y1, x2, y2) > range * range) continue;
    hits.push({
      enemy,
      distance: distSq(x1, y1, enemy.x, enemy.y),
    });
  }

  hits.sort((a, b) => a.distance - b.distance);
  const limit = Math.min(hits.length, maxHits);
  for (let i = 0; i < limit; i += 1) {
    const hit = hits[i];
    const falloff = Math.max(0.72, 1 - i * 0.04);
    damageEnemy(hit.enemy, amount * falloff, hit.enemy.x, hit.enemy.y, sparkCount, sparkSpeed);
  }
  if (limit > 0) removeDeadEnemies();
  return limit;
}

function damageEnemiesInCone(x, y, angle, range, halfAngle, amount) {
  let hits = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance > range + enemy.radius) continue;
    if (Math.abs(angleDelta(Math.atan2(dy, dx), angle)) > halfAngle) continue;
    const nearFactor = 1 - clamp(distance / Math.max(1, range), 0, 1);
    damageEnemy(enemy, amount * (0.78 + nearFactor * 0.32), enemy.x, enemy.y, 2, 85);
    hits += 1;
  }
  if (hits > 0) removeDeadEnemies();
  return hits;
}

function findNearestEnemyFrom(x, y, range, blocked = new Set()) {
  let best = null;
  let bestDistance = range * range;
  for (const enemy of game.enemies) {
    if (enemy.dead || blocked.has(enemy.id)) continue;
    const distance = distSq(x, y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function buildEnemyGrid() {
  enemyCollisionGrid.clear();
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const cellX = Math.floor(enemy.x / COLLISION_CELL_SIZE);
    const cellY = Math.floor(enemy.y / COLLISION_CELL_SIZE);
    const key = gridKey(cellX, cellY);
    let cell = enemyCollisionGrid.get(key);
    if (!cell) {
      cell = [];
      enemyCollisionGrid.set(key, cell);
    }
    cell.push(enemy);
  }
  return enemyCollisionGrid;
}

function gridKey(x, y) {
  return `${x}:${y}`;
}

function updatePickups(dt) {
  const p = game.player;
  const kept = [];
  for (const pickup of game.pickups) {
    pickup.bob += dt * 5;
    const dx = p.x - pickup.x;
    const dy = p.y - pickup.y;
    const distance = Math.hypot(dx, dy);

    if (distance < p.pickup) {
      pickup.magnetized = true;
      pickup.magnetTime = (pickup.magnetTime || 0) + dt;
    }

    if (pickup.magnetized) {
      const directionX = dx / Math.max(1, distance);
      const directionY = dy / Math.max(1, distance);
      const proximity = 1 - clamp(distance / p.pickup, 0, 1);
      const suctionSpeed = 760 + proximity * 1600 + clamp(pickup.magnetTime || 0, 0, 0.18) * 4200;
      const step = Math.min(distance, suctionSpeed * dt);
      pickup.x += directionX * step;
      pickup.y += directionY * step;
      pickup.vx *= 0.35;
      pickup.vy *= 0.35;
    } else {
      pickup.vx *= 0.84;
      pickup.vy *= 0.84;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
    }

    const collectDistance = Math.hypot(p.x - pickup.x, p.y - pickup.y);
    if (collectDistance < p.radius + 18) {
      game.money += pickup.value;
      addSparks(pickup.x, pickup.y, 2, 60, "cash");
    } else {
      kept.push(pickup);
    }
  }
  game.pickups = kept;
}

function updateParticles(dt) {
  const kept = [];
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.9;
    particle.vy *= 0.9;
    if (particle.life > 0) kept.push(particle);
  }
  game.particles = kept;
}

function updateEffects(dt) {
  const kept = [];
  for (const effect of game.effects) {
    effect.life -= dt;
    if (effect.type === "damageLine" && effect.life > 0) {
      const tickRate = effect.tickRate || 8;
      const tickInterval = 1 / tickRate;
      effect.tickTimer = (effect.tickTimer ?? 0) - dt;
      while (effect.tickTimer <= 0) {
        damageEnemiesInLine(
          effect.x1,
          effect.y1,
          effect.x2,
          effect.y2,
          effect.width * 0.5,
          (effect.damage || 1) / tickRate,
          effect.maxHits || Infinity,
          0,
          0,
        );
        effect.tickTimer += tickInterval;
      }
    }
    if (effect.life > 0) kept.push(effect);
  }
  game.effects = kept;
}

function addEffect(effect) {
  const life = effect.life || 0.18;
  game.effects.push({
    ...effect,
    life,
    maxLife: effect.maxLife || life,
  });
  if (game.effects.length > 90) {
    game.effects.splice(0, game.effects.length - 90);
  }
}

function autoShoot() {
  const p = game.player;
  if (game.enemies.length === 0) return;

  for (const weapon of p.gear.weapons) {
    if (weapon.shootTimer > 0) continue;

    const best = findTargetForWeapon(p, weapon);
    if (!best) continue;

    fireWeapon(weapon, best);
    weapon.shootTimer = 1 / weapon.fireRate;
    game.shake = Math.max(game.shake, weapon.kick);
  }
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
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
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
  const spread = weapon.projectiles === 1 ? 0 : weapon.spread;
  for (let i = 0; i < weapon.projectiles; i += 1) {
    const offset = (i - (weapon.projectiles - 1) / 2) * spread;
    const jitter = weapon.jitter > 0 ? (Math.random() - 0.5) * weapon.jitter : 0;
    fireBullet(angle + offset + jitter, weapon);
  }
}

function fireBullet(angle, weapon) {
  const p = game.player;
  const speed = weapon.bulletSpeed;
  const bonus = p.weaponPowerBonus;
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
    pierce: weapon.pierce,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + bonus,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    hitIds: new Set(),
  });
  addSparks(p.x + Math.cos(angle) * 28, p.y + Math.sin(angle) * 28, 1, 40);
}

function fireFlame(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 20;
  const originY = p.y + Math.sin(angle) * 20;
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus);

  const flameCount = 17;
  for (let i = 0; i < flameCount; i += 1) {
    const fan = flameCount === 1 ? 0 : i / (flameCount - 1);
    const flameAngle = angle + (fan - 0.5) * weapon.cone * 2 + (Math.random() - 0.5) * 0.22;
    const start = weapon.range * (0.06 + Math.random() * 0.08);
    const length = weapon.range * (0.38 + Math.random() * 0.55);
    const startX = originX + Math.cos(flameAngle) * start;
    const startY = originY + Math.sin(flameAngle) * start;
    const endX = originX + Math.cos(flameAngle) * length;
    const endY = originY + Math.sin(flameAngle) * length;
    const hotTint = i % 3 === 0 ? [1, 0.86, 0.22] : [1, 0.42, 0.08];
    addEffect({
      type: "line",
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      width: 7 + Math.random() * 15,
      life: 0.13 + Math.random() * 0.05,
      maxLife: 0.18,
      glow: weapon.effectGlow,
      tint: hotTint,
    });
    addEffect({
      type: "burst",
      x: originX + Math.cos(flameAngle) * (length * (0.72 + Math.random() * 0.28)),
      y: originY + Math.sin(flameAngle) * (length * (0.72 + Math.random() * 0.28)),
      radius: 13 + Math.random() * 22,
      life: 0.14 + Math.random() * 0.08,
      maxLife: 0.22,
      glow: weapon.effectGlow,
      tint: hotTint,
    });
  }
  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 38,
    y: originY + Math.sin(angle) * 38,
    radius: 38,
    life: 0.16,
    maxLife: 0.16,
    glow: "glowAmber",
    tint: [1, 0.9, 0.34],
  });
  addSparks(originX + Math.cos(angle) * 36, originY + Math.sin(angle) * 36, 3, 100);
}

function fireLaser(weapon, angle) {
  const p = game.player;
  const startX = p.x + Math.cos(angle) * 26;
  const startY = p.y + Math.sin(angle) * 26;
  const endX = p.x + Math.cos(angle) * weapon.range;
  const endY = p.y + Math.sin(angle) * weapon.range;
  damageEnemiesInLine(startX, startY, endX, endY, weapon.lineWidth * 0.5, weapon.damage + p.weaponPowerBonus, weapon.pierce + 1);
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

function fireOrbit(weapon) {
  const p = game.player;
  const spin = game.elapsed * (weapon.orbitSpeed || 4.2) + weapon.id * 1.73;
  const orbitRadius = weapon.orbitRadius || 78;
  const areaRadius = weapon.areaRadius || 34;
  const x = p.x + Math.cos(spin) * orbitRadius;
  const y = p.y + Math.sin(spin) * orbitRadius;
  damageEnemiesInRadius(x, y, areaRadius, weapon.damage + p.weaponPowerBonus, 0.72);
  addEffect({
    type: "line",
    x1: p.x,
    y1: p.y,
    x2: x,
    y2: y,
    width: 6,
    life: 0.16,
    maxLife: 0.16,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
  addEffect({
    type: "burst",
    x,
    y,
    radius: areaRadius,
    life: 0.22,
    maxLife: 0.22,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function fireSword(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 14;
  const originY = p.y + Math.sin(angle) * 14;
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus);
  const slashCount = 5;
  for (let i = 0; i < slashCount; i += 1) {
    const t = slashCount === 1 ? 0 : i / (slashCount - 1);
    const slashAngle = angle + (t - 0.5) * weapon.cone * 1.75;
    const inner = weapon.range * 0.28;
    const outer = weapon.range * (0.9 + Math.random() * 0.12);
    addEffect({
      type: "line",
      x1: originX + Math.cos(slashAngle) * inner,
      y1: originY + Math.sin(slashAngle) * inner,
      x2: originX + Math.cos(slashAngle) * outer,
      y2: originY + Math.sin(slashAngle) * outer,
      width: 8 + i * 1.4,
      life: 0.16,
      maxLife: 0.16,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
  }
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
    damageEnemy(enemy, (weapon.damage + p.weaponPowerBonus) * falloff, enemy.x, enemy.y, 3, 120);
    blocked.add(enemy.id);
    fromX = enemy.x;
    fromY = enemy.y;
    enemy = findNearestEnemyFrom(fromX, fromY, weapon.chainRange, blocked);
    jumps += 1;
  }

  removeDeadEnemies();
}

function killEnemy(enemy) {
  if (!enemy || enemy.dead) return;
  enemy.dead = true;
  game.totalKills += 1;
  game.waveKills += 1;
  game.pickups.push({
    x: enemy.x,
    y: enemy.y,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    value: enemy.value,
    bob: Math.random() * TAU,
  });
  addSparks(enemy.x, enemy.y, enemy.radius > 22 ? 8 : 5, 110);
  game.shake = Math.max(game.shake, enemy.radius > 22 ? 5 : 2.4);
}

function removeDeadEnemies() {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < game.enemies.length; readIndex += 1) {
    const enemy = game.enemies[readIndex];
    if (!enemy.dead) {
      game.enemies[writeIndex] = enemy;
      writeIndex += 1;
    }
  }
  game.enemies.length = writeIndex;
}

function damagePlayer(amount) {
  const reduction = 100 / (100 + Math.max(-20, game.player.armor) * 8);
  const damage = Math.max(1, Math.round(amount * reduction));
  game.player.hp = clamp(game.player.hp - damage, 0, game.player.maxHp);
  game.damageFlash = Math.max(game.damageFlash, clamp(damage / game.player.maxHp * 3, 0.2, 0.42));
  game.shake = Math.max(game.shake, 3.5 + damage * 0.03);
  return damage;
}

function addSparks(x, y, count, speed, sprite = "spark") {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const force = speed * (0.25 + Math.random() * 0.75);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 0.22 + Math.random() * 0.18,
      maxLife: 0.4,
      size: 18 + Math.random() * 18,
      sprite,
    });
  }
}

function addWalkDust(x, y, moveX, moveY) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const sideX = -moveY * side;
  const sideY = moveX * side;
  game.particles.push({
    x: x + sideX * 7,
    y: y + sideY * 5,
    vx: -moveX * (26 + Math.random() * 18) + sideX * 12,
    vy: -moveY * (18 + Math.random() * 14) + sideY * 8,
    life: 0.2,
    maxLife: 0.2,
    size: 18 + Math.random() * 8,
    sprite: "walkDust",
  });
}

function render() {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const shakeX = (Math.random() - 0.5) * game.shake;
  const shakeY = (Math.random() - 0.5) * game.shake;
  const camX = game.camera.x + shakeX;
  const camY = game.camera.y + shakeY;

  renderer.clear();
  renderer.begin();
  drawBackground(view, camX, camY, zoom);
  drawBackgroundDepth(view);
  drawWorld(view, camX, camY, zoom);
  renderer.flush();
}

function drawBackgroundDepth(view) {
  renderer.draw("white", view.w / 2, view.h / 2, view.w + 4, view.h + 4, {
    tint: [0.06, 0.07, 0.19],
    alpha: 0.14,
  });
}

function drawBackground(view, camX, camY, zoom) {
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const startX = Math.floor((camX - visibleW / 2) / TILE_SIZE) - 1;
  const endX = Math.floor((camX + visibleW / 2) / TILE_SIZE) + 1;
  const startY = Math.floor((camY - visibleH / 2) / TILE_SIZE) - 1;
  const endY = Math.floor((camY + visibleH / 2) / TILE_SIZE) + 1;

  for (let ty = startY; ty <= endY; ty += 1) {
    for (let tx = startX; tx <= endX; tx += 1) {
      const tile = getBackgroundTile(tx, ty);
      const type = tile.type;
      const worldX = tx * TILE_SIZE + TILE_SIZE / 2;
      const worldY = ty * TILE_SIZE + TILE_SIZE / 2;
      const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
      renderer.draw(type, screen.x, screen.y, (TILE_SIZE + 2) * zoom, (TILE_SIZE + 2) * zoom);

      if (tile.prop) {
        drawProp(tile.prop, tx, ty, view, camX, camY, zoom, tile.propOffset, tile.propY);
      }
    }
  }
}

function getBackgroundTile(tx, ty) {
  const key = gridKey(tx, ty);
  const cached = backgroundTileCache.get(key);
  if (cached) return cached;

  const type = tileSprite(tx, ty);
  const propRoll = hash2(tx, ty, 5);
  let prop = "";
  let propOffset = 0;

  if (type !== "road" && type !== "lane" && type !== "crosswalk") {
    if (propRoll < 0.045) {
      prop = "sign";
      propOffset = hash2(tx, ty, 7);
    } else if (propRoll < 0.085) {
      prop = "trash";
      propOffset = hash2(tx, ty, 9);
    }
  } else if (propRoll < 0.02) {
    prop = "car";
    propOffset = hash2(tx, ty, 11);
  }

  const tile = {
    type,
    prop,
    propOffset,
    propY: prop ? hash2(tx, ty, 17) : 0,
  };
  backgroundTileCache.set(key, tile);
  trimBackgroundTileCache();
  return tile;
}

function trimBackgroundTileCache() {
  if (backgroundTileCache.size <= BACKGROUND_CACHE_LIMIT) return;
  let removed = 0;
  for (const key of backgroundTileCache.keys()) {
    backgroundTileCache.delete(key);
    removed += 1;
    if (removed >= 512) break;
  }
}

function tileSprite(tx, ty) {
  const avenue = mod(tx, 7) <= 1;
  const street = mod(ty, 6) <= 1;
  const cross = avenue && street && (mod(tx, 7) === 1 || mod(ty, 6) === 1);
  if (cross) return "crosswalk";
  if (avenue || street) {
    return mod(tx + ty, 3) === 0 ? "lane" : "road";
  }
  if (mod(tx, 7) === 2 || mod(tx, 7) === 6 || mod(ty, 6) === 2 || mod(ty, 6) === 5) {
    return "sidewalk";
  }
  return "pavement";
}

function drawProp(name, tx, ty, view, camX, camY, zoom, roll, yRoll) {
  const worldX = tx * TILE_SIZE + 24 + roll * 48;
  const worldY = ty * TILE_SIZE + 18 + yRoll * 54;
  const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
  if (name === "sign") renderer.draw("glowRed", screen.x, screen.y - 18 * zoom, 110 * zoom, 90 * zoom, { alpha: 0.55 });
  if (name === "car") renderer.draw("glowAmber", screen.x + 12 * zoom, screen.y, 120 * zoom, 70 * zoom, { alpha: 0.24 });
  renderer.draw(name, screen.x, screen.y, atlas.sprites[name].w * zoom, atlas.sprites[name].h * zoom, {
    rotation: (roll - 0.5) * 0.6,
  });
}

function drawWorld(view, camX, camY, zoom) {
  for (const pickup of game.pickups) {
    const screen = worldToScreen(pickup.x, pickup.y + Math.sin(pickup.bob) * 4, view, camX, camY, zoom);
    renderer.draw("shadow", screen.x, screen.y + 13 * zoom, 36 * zoom, 14 * zoom, { alpha: 0.55 });
    renderer.draw("glowAmber", screen.x, screen.y, 42 * zoom, 42 * zoom, { alpha: 0.2 });
    renderer.draw("cashReadable", screen.x, screen.y, 25 * zoom, 25 * zoom, { rotation: Math.sin(pickup.bob) * 0.15 });
  }

  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    const screen = worldToScreen(particle.x, particle.y, view, camX, camY, zoom);
    const size = particle.size * (1.2 - alpha * 0.2) * zoom;
    renderer.draw(particle.sprite, screen.x, screen.y, size, size, { alpha });
  }

  const actors = game.enemies.map((enemy) => ({ kind: "enemy", y: enemy.y, item: enemy }));
  actors.push({ kind: "player", y: game.player.y, item: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const actor of actors) {
    if (actor.kind === "player") drawPlayer(actor.item, view, camX, camY, zoom);
    else drawEnemy(actor.item, view, camX, camY, zoom);
  }

  drawEffects(view, camX, camY, zoom);

  for (const bullet of game.bullets) {
    const screen = worldToScreen(bullet.x, bullet.y, view, camX, camY, zoom);
    if (bullet.kind === "timedBomb") {
      const fuseAlpha = clamp(bullet.life / (bullet.maxLife || bullet.life), 0, 1);
      const blink = Math.sin(game.elapsed * (10 + (1 - fuseAlpha) * 18)) > 0 ? 1 : 0.45;
      renderer.draw(bullet.bulletGlow || "glowRed", screen.x, screen.y, 52 * zoom, 52 * zoom, { alpha: 0.22 + (1 - fuseAlpha) * 0.22 });
      renderer.draw("shadow", screen.x, screen.y + 11 * zoom, 34 * zoom, 13 * zoom, { alpha: 0.58 });
      renderer.draw("white", screen.x, screen.y, bullet.radius * 2.2 * zoom, bullet.radius * 2.2 * zoom, {
        rotation: game.elapsed * 0.7,
        tint: bullet.bulletTint || [1, 0.75, 0.35],
        alpha: 0.92,
      });
      renderer.draw("white", screen.x, screen.y - bullet.radius * 1.35 * zoom, 7 * zoom, 7 * zoom, {
        tint: [1, 0.22, 0.16],
        alpha: blink,
      });
    } else {
      renderer.draw(bullet.bulletGlow || "glowAmber", screen.x, screen.y, 42 * zoom, 30 * zoom, { alpha: 0.32 });
      renderer.draw("bulletReadable", screen.x, screen.y, bullet.radius * 4.2 * zoom, bullet.radius * 1.55 * zoom, {
        rotation: bullet.angle,
        tint: bullet.bulletTint || [1, 1, 1],
      });
    }
  }
}

function drawEffects(view, camX, camY, zoom) {
  for (const effect of game.effects) {
    const alpha = clamp(effect.life / effect.maxLife, 0, 1);
    if (effect.type === "line" || effect.type === "damageLine") {
      const pulse = effect.type === "damageLine" ? 1 + Math.sin(game.elapsed * 26) * 0.12 : 1;
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * 1.9, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * (effect.type === "damageLine" ? 0.42 : 0.3),
      });
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * pulse, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.9,
      });
    } else if (effect.type === "burst") {
      const screen = worldToScreen(effect.x, effect.y, view, camX, camY, zoom);
      const pulse = 1 + (1 - alpha) * 0.55;
      const size = effect.radius * 2 * pulse * zoom;
      renderer.draw(effect.glow || "glowAmber", screen.x, screen.y, size, size, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.68,
      });
      renderer.draw("white", screen.x, screen.y, effect.radius * 1.2 * zoom, effect.radius * 1.2 * zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.16,
      });
    }
  }
}

function drawWorldLine(x1, y1, x2, y2, width, view, camX, camY, zoom, options = {}) {
  const start = worldToScreen(x1, y1, view, camX, camY, zoom);
  const end = worldToScreen(x2, y2, view, camX, camY, zoom);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.01) return;
  renderer.draw("white", (start.x + end.x) * 0.5, (start.y + end.y) * 0.5, length, Math.max(2, width * zoom), {
    rotation: Math.atan2(dy, dx),
    tint: options.tint || [1, 1, 1],
    alpha: options.alpha ?? 1,
  });
}

function drawPlayer(player, view, camX, camY, zoom) {
  const screen = worldToScreen(player.x, player.y, view, camX, camY, zoom);
  const moving = Math.hypot(player.moveX, player.moveY) > 0.05;
  const walkPulse = moving ? Math.sin(player.walkTime * TAU) : 0;
  const sprite = moving
    ? (Math.floor(player.walkTime * 2) % 2 === 0 ? "playerWalkAReadable" : "playerWalkBReadable")
    : "playerReadable";
  const lean = clamp(player.moveX, -1, 1) * 0.08;
  renderer.draw("glowCyan", screen.x, screen.y + 4 * zoom, 94 * zoom, 82 * zoom, { alpha: 0.2 });
  renderer.draw("shadow", screen.x, screen.y + 25 * zoom, 72 * (1 + Math.abs(walkPulse) * 0.08) * zoom, 32 * zoom, { alpha: 0.82 });
  renderer.draw(sprite, screen.x, screen.y + (-3 + (moving ? walkPulse * 1.2 : 0)) * zoom, 62 * zoom, 62 * zoom, { rotation: lean });
}

function drawEnemy(enemy, view, camX, camY, zoom) {
  const screen = worldToScreen(enemy.x, enemy.y, view, camX, camY, zoom);
  const size = enemy.radius * (enemy.sprite === "zombieBig" ? 3.0 : 2.7) * zoom;
  const wobble = Math.sin(game.elapsed * 7 + enemy.wobble) * 0.08;
  const tint = enemy.hit > 0 ? [1, 0.52, 0.52] : [1, 1, 1];
  renderer.draw("glowEnemyRed", screen.x, screen.y - enemy.radius * 0.12 * zoom, size * 1.15, size * 1.05, {
    alpha: enemy.sprite === "zombieBig" ? 0.13 : 0.09,
  });
  renderer.draw("shadow", screen.x, screen.y + enemy.radius * 0.8 * zoom, size * 1.02, size * 0.45, { alpha: 0.74 });
  renderer.draw(enemy.readableSprite, screen.x, screen.y - enemy.radius * 0.15 * zoom, size, size, {
    rotation: wobble,
    tint,
  });

  if (enemy.hp < enemy.maxHp) {
    const barW = enemy.radius * 2.2 * zoom;
    const y = screen.y - enemy.radius * 2.1 * zoom;
    renderer.draw("white", screen.x, y, barW, 5 * zoom, { tint: [0.12, 0.12, 0.15], alpha: 0.72 });
    renderer.draw("white", screen.x - barW * (1 - enemy.hp / enemy.maxHp) * 0.5, y, barW * enemy.hp / enemy.maxHp, 5 * zoom, {
      tint: [0.44, 0.96, 0.78],
      alpha: 0.9,
    });
  }
}

function worldToScreen(x, y, view, camX, camY, zoom = 1) {
  return {
    x: (x - camX) * zoom + view.w / 2,
    y: (y - camY) * zoom + view.h / 2,
  };
}

function viewSize() {
  return {
    w: canvas.width / renderer.dpr,
    h: canvas.height / renderer.dpr,
  };
}

function cameraZoom(view) {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth <= 760;
  const shortSide = Math.min(view.w, view.h);
  if (coarsePointer || narrowViewport) {
    return shortSide <= 520 ? MOBILE_CAMERA_ZOOM : TOUCH_TABLET_CAMERA_ZOOM;
  }
  return 1;
}

function measureCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  return {
    dpr,
    width: Math.max(320, Math.floor(rect.width * dpr)),
    height: Math.max(240, Math.floor(rect.height * dpr)),
  };
}

function prepareCanvas() {
  const size = measureCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  return size.dpr;
}

function resize() {
  const size = measureCanvas();
  renderer.resize(size.width, size.height, size.dpr);
}

function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}

function beginVirtualMove(event) {
  if (game.mode !== "fight") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();

  pointer.down = true;
  pointer.activeId = event.pointerId;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  showVirtualStick(pointer.startX, pointer.startY);

  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  updateVirtualMove(event);
}

function showVirtualStick(x, y) {
  if (!hud.moveStick) return;
  hud.moveStick.style.left = `${x}px`;
  hud.moveStick.style.top = `${y}px`;
  hud.moveStick.classList.add("active");
}

function updateVirtualMove(event) {
  if (!pointer.down || event.pointerId !== pointer.activeId) return;
  event.preventDefault();

  pointer.x = event.clientX;
  pointer.y = event.clientY;

  const dx = pointer.x - pointer.startX;
  const dy = pointer.y - pointer.startY;
  const input = normalize(dx, dy);
  const stickSize = hud.moveStick ? hud.moveStick.getBoundingClientRect().width : 128;
  const radius = Math.max(34, stickSize * 0.34);
  const deadZone = radius * 0.18;
  const rawStrength = clamp((input.len - deadZone) / (radius - deadZone), 0, 1);

  pointer.strength = rawStrength;
  pointer.moveX = rawStrength > 0 ? input.x : 0;
  pointer.moveY = rawStrength > 0 ? input.y : 0;

  if (hud.moveThumb) {
    const distance = Math.min(input.len, radius);
    const thumbX = input.x * distance;
    const thumbY = input.y * distance;
    hud.moveThumb.style.transform = `translate(-50%, -50%) translate(${thumbX}px, ${thumbY}px)`;
  }
}

function endVirtualMove(event) {
  if (event && event.pointerId !== pointer.activeId) return;
  resetVirtualMove();
}

function resetVirtualMove() {
  pointer.down = false;
  pointer.activeId = null;
  pointer.moveX = 0;
  pointer.moveY = 0;
  pointer.strength = 0;
  if (hud.moveStick) {
    hud.moveStick.classList.remove("active");
  }
  if (hud.moveThumb) {
    hud.moveThumb.style.transform = "translate(-50%, -50%)";
  }
}

function bindInput() {
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" && game.mode === "shop") startNextWave();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));

  canvas.addEventListener("pointerdown", (event) => {
    beginVirtualMove(event);
  });
  canvas.addEventListener("pointermove", updateVirtualMove);

  window.addEventListener("pointerup", endVirtualMove);
  window.addEventListener("pointercancel", endVirtualMove);
  window.addEventListener("blur", resetVirtualMove);
}

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.033);
  lastFrame = now;
  resize();
  update(dt);
  render();
  requestAnimationFrame(frame);
}

hud.reroll.addEventListener("click", () => {
  const cost = rerollCost();
  if (game.money < cost) return;
  game.money -= cost;
  game.rerolls += 1;
  generateOffers();
  renderShop();
  updateHud();
});

hud.nextWave.addEventListener("click", startNextWave);
hud.restart.addEventListener("click", resetRun);

atlas = buildAtlas();
const initialDpr = prepareCanvas();
renderer = new SpriteRenderer(canvas, atlas);
renderer.resize(canvas.width, canvas.height, initialDpr);
bindInput();
resetRun();
resize();
requestAnimationFrame(frame);
