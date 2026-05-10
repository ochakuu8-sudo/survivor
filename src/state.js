export const keys = new Set();

export const pointer = {
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

export const enemyCollisionGrid = new Map();
export const backgroundTileCache = new Map();

export const game = {
  mode: "fight",
  wave: 1,
  elapsed: 0,
  floorElapsed: 0,
  exitHoldTimer: 0,
  totalKills: 0,
  waveKills: 0,
  gold: 0,
  spawnClock: 0,
  shake: 0,
  damageFlash: 0,
  camera: { x: 0, y: 0 },
  player: null,
  enemies: [],
  bullets: [],
  enemyProjectiles: [],
  particles: [],
  goldDrops: [],
  effects: [],
  offers: [],
  shopRerollsUsed: 0,
  starterChoices: [],
  treasureReward: null,
  dungeon: null,
};

let enemyId = 1;
let weaponId = 1;

export function nextEnemyId() {
  const id = enemyId;
  enemyId += 1;
  return id;
}

export function nextWeaponId() {
  const id = weaponId;
  weaponId += 1;
  return id;
}

export function resetWeaponId() {
  weaponId = 1;
}

export function resetEnemyId() {
  enemyId = 1;
}

export let atlas = null;
export let renderer = null;

export function setAtlas(value) {
  atlas = value;
}

export function setRenderer(value) {
  renderer = value;
}

export const timing = {
  lastFrame: 0,
};
