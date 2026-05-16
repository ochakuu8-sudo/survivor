import { TILE_SIZE } from "./constants.js";
import { game } from "./state.js";
import { clamp, hash2, makeRng } from "./utils/math.js";

export const DUNGEON_WALL = 0;
export const DUNGEON_FLOOR = 1;
export const DUNGEON_EXIT = 2;

const ROOM_MARGIN = 1;
const OBSTACLE_TYPES = [
  { sprite: "fieldTree", radius: 24, clearance: 40, scale: 0.95 },
  { sprite: "fieldBoulder", radius: 24, clearance: 30, scale: 1 },
  { sprite: "fieldLog", radius: 22, clearance: 34, scale: 1 },
  { sprite: "fieldBush", radius: 20, clearance: 30, scale: 1 },
  { sprite: "fieldFence", radius: 18, clearance: 34, scale: 1 },
  { sprite: "fieldFlowers", radius: 0, clearance: 24, scale: 1 },
];
const EXIT_INTERACTION_RADIUS = TILE_SIZE * 0.42;
const DUNGEON_WIDTH_BASE = 48;
const DUNGEON_WIDTH_PER_WAVE = 2.4;
const DUNGEON_WIDTH_MAX = 84;
const DUNGEON_HEIGHT_BASE = 36;
const DUNGEON_HEIGHT_PER_WAVE = 2.2;
const DUNGEON_HEIGHT_MAX = 62;
const ARENA_WIDTH_BASE = 36;
const ARENA_WIDTH_PER_WAVE = 1.2;
const ARENA_WIDTH_MAX = 50;
const ARENA_HEIGHT_BASE = 26;
const ARENA_HEIGHT_PER_WAVE = 0.75;
const ARENA_HEIGHT_MAX = 38;

export function generateDungeon(wave) {
  const seed = ((Date.now() & 0xfffffff) ^ Math.floor(Math.random() * 0x7fffffff) ^ (wave * 2654435761)) >>> 0;
  const rng = makeRng(seed);
  const width = Math.floor(clamp(DUNGEON_WIDTH_BASE + wave * DUNGEON_WIDTH_PER_WAVE, DUNGEON_WIDTH_BASE, DUNGEON_WIDTH_MAX));
  const height = Math.floor(clamp(DUNGEON_HEIGHT_BASE + wave * DUNGEON_HEIGHT_PER_WAVE, DUNGEON_HEIGHT_BASE, DUNGEON_HEIGHT_MAX));
  const tiles = new Array(width * height).fill(DUNGEON_WALL);
  const rooms = [];

  const firstRoom = {
    x: Math.floor(width / 2) - 3,
    y: Math.floor(height / 2) - 3,
    w: 7,
    h: 7,
  };
  carveRoom(tiles, width, height, firstRoom);
  rooms.push(toRoomInfo(firstRoom));

  const targetRooms = clamp(9 + Math.floor(wave * 0.9), 9, 22);
  const attempts = targetRooms * 18;
  for (let i = 0; i < attempts && rooms.length < targetRooms; i += 1) {
    const room = {
      w: randInt(rng, 5, 9),
      h: randInt(rng, 5, 9),
      x: randInt(rng, 2, width - 11),
      y: randInt(rng, 2, height - 11),
    };
    room.x = Math.min(room.x, width - room.w - 2);
    room.y = Math.min(room.y, height - room.h - 2);
    if (rooms.some((placed) => roomsOverlap(room, placed, ROOM_MARGIN))) continue;

    const previous = rooms[rooms.length - 1];
    const info = toRoomInfo(room);
    carveRoom(tiles, width, height, room);
    if (rng() < 0.5) {
      carveCorridor(tiles, width, height, previous.cx, previous.cy, info.cx, previous.cy);
      carveCorridor(tiles, width, height, info.cx, previous.cy, info.cx, info.cy);
    } else {
      carveCorridor(tiles, width, height, previous.cx, previous.cy, previous.cx, info.cy);
      carveCorridor(tiles, width, height, previous.cx, info.cy, info.cx, info.cy);
    }
    rooms.push(info);
  }

  const startRoom = rooms[0];
  const exitRoom = rooms.reduce((best, room) => {
    const bestDist = distanceSq(best.cx, best.cy, startRoom.cx, startRoom.cy);
    const roomDist = distanceSq(room.cx, room.cy, startRoom.cx, startRoom.cy);
    return roomDist > bestDist ? room : best;
  }, rooms[0]);

  const dungeon = {
    seed,
    width,
    height,
    tiles,
    rooms,
    offsetX: -width * TILE_SIZE * 0.5,
    offsetY: -height * TILE_SIZE * 0.5,
    start: tileCenter(width, height, startRoom.cx, startRoom.cy),
    exit: { ...tileCenter(width, height, exitRoom.cx, exitRoom.cy), tx: exitRoom.cx, ty: exitRoom.cy },
    obstacles: [],
    chests: [],
    facilities: [],
  };

  setDungeonTile(dungeon, exitRoom.cx, exitRoom.cy, DUNGEON_EXIT);
  dungeon.obstacles = generateObstacles(dungeon, rng, startRoom, exitRoom);
  dungeon.chests = generateChests(dungeon, rng, startRoom, exitRoom, wave);
  dungeon.facilities = generateFacilities(dungeon, rng, startRoom, exitRoom, wave);
  return dungeon;
}

export function generateArenaDungeon(wave) {
  const seed = ((Date.now() & 0xfffffff) ^ Math.floor(Math.random() * 0x7fffffff) ^ (wave * 2246822519)) >>> 0;
  const rng = makeRng(seed);
  const width = Math.floor(clamp(ARENA_WIDTH_BASE + wave * ARENA_WIDTH_PER_WAVE, ARENA_WIDTH_BASE, ARENA_WIDTH_MAX));
  const height = Math.floor(clamp(ARENA_HEIGHT_BASE + wave * ARENA_HEIGHT_PER_WAVE, ARENA_HEIGHT_BASE, ARENA_HEIGHT_MAX));
  const tiles = new Array(width * height).fill(DUNGEON_FLOOR);
  const startRoom = { x: Math.floor(width / 2) - 3, y: Math.floor(height / 2) - 3, w: 7, h: 7, cx: Math.floor(width / 2), cy: Math.floor(height / 2) };
  const rooms = [
    { x: 2, y: 2, w: width - 4, h: height - 4, cx: Math.floor(width / 2), cy: Math.floor(height / 2) },
  ];
  const dungeon = {
    seed,
    width,
    height,
    tiles,
    rooms,
    offsetX: -width * TILE_SIZE * 0.5,
    offsetY: -height * TILE_SIZE * 0.5,
    start: tileCenter(width, height, startRoom.cx, startRoom.cy),
    exit: null,
    obstacles: [],
    chests: [],
    facilities: [],
    arena: true,
    wrapEdges: true,
  };
  dungeon.obstacles = generateArenaObstacles(dungeon, rng);
  return dungeon;
}


function generateFacilities(dungeon, rng, startRoom, exitRoom, wave) {
  const facilities = [];
  const candidates = dungeon.rooms.filter((room) => room !== startRoom && room !== exitRoom);
  const count = clamp(1 + Math.floor((wave || 1) / 3), 1, 3);
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  for (const room of shuffled) {
    if (facilities.length >= count) break;
    const point = dungeonTileWorldCenter(dungeon, room.cx, room.cy);
    if (dungeon.chests?.some((chest) => distanceSq(point.x, point.y, chest.x, chest.y) < TILE_SIZE * TILE_SIZE)) continue;
    facilities.push({
      type: "workbench",
      x: point.x,
      y: point.y,
      radius: 30,
      used: false,
      holdTimer: 0,
    });
  }
  return facilities;
}

function generateArenaObstacles(dungeon, rng) {
  const obstacles = [];
  const count = clamp(10 + Math.floor(dungeon.width * dungeon.height / 180), 10, 22);
  for (let i = 0; i < count; i += 1) {
    const type = OBSTACLE_TYPES[Math.floor(rng() * (OBSTACLE_TYPES.length - 1))];
    const tx = randInt(rng, 3, dungeon.width - 4);
    const ty = randInt(rng, 3, dungeon.height - 4);
    const point = dungeonTileWorldCenter(dungeon, tx, ty);
    if (distanceSq(point.x, point.y, dungeon.start.x, dungeon.start.y) < TILE_SIZE * TILE_SIZE * 6) continue;
    obstacles.push({
      x: point.x + (rng() - 0.5) * TILE_SIZE * 0.34,
      y: point.y + (rng() - 0.5) * TILE_SIZE * 0.34,
      radius: type.radius,
      sprite: type.sprite,
      scale: type.scale,
      bob: rng() * Math.PI * 2,
    });
  }
  return obstacles;
}

export function moveActorWithDungeonCollision(actor, dx, dy) {
  if (!game.dungeon) {
    actor.x += dx;
    actor.y += dy;
    return;
  }

  if (dx !== 0) {
    const nextX = actor.x + dx;
    if (canStandAt(game.dungeon, nextX, actor.y, actor.radius * 0.72)) actor.x = wrapDungeonX(game.dungeon, nextX);
  }

  if (dy !== 0) {
    const nextY = actor.y + dy;
    if (canStandAt(game.dungeon, actor.x, nextY, actor.radius * 0.72)) actor.y = wrapDungeonY(game.dungeon, nextY);
  }
}

export function wrapDungeonPoint(dungeon, point) {
  if (!dungeon?.wrapEdges || !point) return point;
  point.x = wrapDungeonX(dungeon, point.x);
  point.y = wrapDungeonY(dungeon, point.y);
  return point;
}

export function shortestDungeonDelta(dungeon, fromX, fromY, toX, toY) {
  let dx = toX - fromX;
  let dy = toY - fromY;
  if (dungeon?.wrapEdges) {
    const worldWidth = dungeonWorldWidth(dungeon);
    const worldHeight = dungeonWorldHeight(dungeon);
    if (Math.abs(dx) > worldWidth / 2) dx -= Math.sign(dx) * worldWidth;
    if (Math.abs(dy) > worldHeight / 2) dy -= Math.sign(dy) * worldHeight;
  }
  return { dx, dy };
}

export function shortestDungeonDistanceSq(dungeon, ax, ay, bx, by) {
  const delta = shortestDungeonDelta(dungeon, ax, ay, bx, by);
  return delta.dx * delta.dx + delta.dy * delta.dy;
}

export function nearestDungeonPoint(dungeon, x, y, originX, originY) {
  if (!dungeon?.wrapEdges) return { x, y };
  const delta = shortestDungeonDelta(dungeon, originX, originY, x, y);
  return { x: originX + delta.dx, y: originY + delta.dy };
}

export function wrapDungeonX(dungeon, x) {
  if (!dungeon?.wrapEdges) return x;
  return wrapValue(x, dungeon.offsetX, dungeonWorldWidth(dungeon));
}

export function wrapDungeonY(dungeon, y) {
  if (!dungeon?.wrapEdges) return y;
  return wrapValue(y, dungeon.offsetY, dungeonWorldHeight(dungeon));
}

function dungeonWorldWidth(dungeon) {
  return dungeon.width * TILE_SIZE;
}

function dungeonWorldHeight(dungeon) {
  return dungeon.height * TILE_SIZE;
}

function wrapValue(value, min, size) {
  if (size <= 0) return value;
  return ((((value - min) % size) + size) % size) + min;
}

export function pickDungeonSpawnPoint(originX, originY, minDistance, maxDistance, options = {}) {
  const dungeon = game.dungeon;
  if (!dungeon) return null;
  const { fallbackToBest = true, fallbackMode = "farthest", predicate = null } = options;
  let best = null;
  let bestDistance = fallbackMode === "nearest" ? Infinity : 0;
  for (let i = 0; i < 120; i += 1) {
    const room = dungeon.rooms[Math.floor(Math.random() * dungeon.rooms.length)];
    const tx = randInt(Math.random, room.x + 1, room.x + room.w - 2);
    const ty = randInt(Math.random, room.y + 1, room.y + room.h - 2);
    if (!isWalkableTile(dungeon, tx, ty)) continue;
    const point = tileCenter(dungeon.width, dungeon.height, tx, ty);
    if (!canStandAt(dungeon, point.x, point.y, 22)) continue;
    if (predicate && !predicate(point)) continue;
    const distance = Math.hypot(point.x - originX, point.y - originY);
    if (distance >= minDistance && distance <= maxDistance) return point;
    if (fallbackMode === "nearest") {
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    } else if (distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return fallbackToBest ? best : null;
}

export function createTreasureChestAt(x, y, label = "改造宝箱") {
  if (!game.dungeon) return null;
  const chest = {
    x,
    y,
    radius: 26,
    opened: false,
    holdTimer: 0,
    bob: Math.random() * Math.PI * 2,
    rewardName: label,
  };
  if (!Array.isArray(game.dungeon.chests)) game.dungeon.chests = [];
  game.dungeon.chests.push(chest);
  return chest;
}

export function hasReachedDungeonExit(actor) {
  const exit = game.dungeon?.exit;
  if (!exit || !actor) return false;
  return Math.hypot(actor.x - exit.x, actor.y - exit.y) <= (actor.radius || 0) + EXIT_INTERACTION_RADIUS;
}

export function getDungeonTile(dungeon, tx, ty) {
  if (!dungeon) return DUNGEON_WALL;
  if (dungeon.wrapEdges) {
    const wrappedX = ((tx % dungeon.width) + dungeon.width) % dungeon.width;
    const wrappedY = ((ty % dungeon.height) + dungeon.height) % dungeon.height;
    return dungeon.tiles[wrappedY * dungeon.width + wrappedX];
  }
  if (tx < 0 || ty < 0 || tx >= dungeon.width || ty >= dungeon.height) return DUNGEON_WALL;
  return dungeon.tiles[ty * dungeon.width + tx];
}

export function isWalkableTile(dungeon, tx, ty) {
  const tile = getDungeonTile(dungeon, tx, ty);
  return tile === DUNGEON_FLOOR || tile === DUNGEON_EXIT;
}

export function worldToDungeonTile(dungeon, x, y) {
  return {
    tx: Math.floor((x - dungeon.offsetX) / TILE_SIZE),
    ty: Math.floor((y - dungeon.offsetY) / TILE_SIZE),
  };
}

export function dungeonTileWorldCenter(dungeon, tx, ty) {
  return {
    x: dungeon.offsetX + (tx + 0.5) * TILE_SIZE,
    y: dungeon.offsetY + (ty + 0.5) * TILE_SIZE,
  };
}

export function dungeonVisualTileCoords(dungeon, tx, ty) {
  if (!dungeon?.wrapEdges) return { tx, ty };
  return {
    tx: ((tx % dungeon.width) + dungeon.width) % dungeon.width,
    ty: ((ty % dungeon.height) + dungeon.height) % dungeon.height,
  };
}

export function dungeonFloorSprite(tx, ty, dungeon = null) {
  if (dungeon?.arena && dungeon.wrapEdges) return arenaWrapFloorSprite(tx, ty, dungeon);
  const visual = dungeonVisualTileCoords(dungeon, tx, ty);
  const roll = hash2(visual.tx, visual.ty, 23);
  if (roll < 0.14) return "lane";
  if (roll < 0.3) return "sidewalk";
  if (roll < 0.42) return "crosswalk";
  return "road";
}

function arenaWrapFloorSprite(tx, ty, dungeon) {
  const visual = dungeonVisualTileCoords(dungeon, tx, ty);
  const seamBand = 2;
  const nearHorizontalSeam = visual.tx < seamBand || visual.tx >= dungeon.width - seamBand;
  const nearVerticalSeam = visual.ty < seamBand || visual.ty >= dungeon.height - seamBand;

  // Keep the torus join calm and matching on both sides of the wrap, while
  // preserving varied plaza/trail patches away from the seam.
  if (nearHorizontalSeam || nearVerticalSeam) {
    const corner = nearHorizontalSeam && nearVerticalSeam;
    if (corner) return "sidewalk";
    const seamRoll = hash2(
      nearHorizontalSeam ? Math.min(visual.tx, dungeon.width - 1 - visual.tx) : Math.floor(visual.tx / 2),
      nearVerticalSeam ? Math.min(visual.ty, dungeon.height - 1 - visual.ty) : Math.floor(visual.ty / 2),
      dungeon.seed ^ 0x51eaf
    );
    return seamRoll < 0.28 ? "sidewalk" : "road";
  }

  const gardenPatch = periodicPatchValue(visual.tx, visual.ty, dungeon.width, dungeon.height, dungeon.seed ^ 0x8a31, 5);
  if (gardenPatch > 0.76) return "pavement";
  if (gardenPatch > 0.62) return "sidewalk";

  const pathPatch = periodicPatchValue(visual.tx, visual.ty, dungeon.width, dungeon.height, dungeon.seed ^ 0xc49d, 4);
  if (pathPatch > 0.78) return "crosswalk";
  if (pathPatch > 0.58) return "lane";

  return hash2(visual.tx, visual.ty, dungeon.seed ^ 0x2d17) < 0.18 ? "sidewalk" : "road";
}

function periodicPatchValue(tx, ty, width, height, seed, count) {
  let value = 0;
  for (let i = 0; i < count; i += 1) {
    const cx = Math.floor(hash2(i, seed, 11) * width);
    const cy = Math.floor(hash2(i, seed, 17) * height);
    const dx = torusTileDistance(tx, cx, width);
    const dy = torusTileDistance(ty, cy, height);
    const radius = 2.4 + hash2(i, seed, 23) * 3.8;
    value = Math.max(value, 1 - (dx * dx + dy * dy) / (radius * radius));
  }
  return clamp(value, 0, 1);
}

function torusTileDistance(a, b, size) {
  const direct = Math.abs(a - b);
  return Math.min(direct, size - direct);
}

export function canStandAt(dungeon, x, y, radius) {
  const min = worldToDungeonTile(dungeon, x - radius, y - radius);
  const max = worldToDungeonTile(dungeon, x + radius, y + radius);
  for (let ty = min.ty; ty <= max.ty; ty += 1) {
    for (let tx = min.tx; tx <= max.tx; tx += 1) {
      if (isWalkableTile(dungeon, tx, ty)) continue;
      if (circleOverlapsTile(dungeon, x, y, radius, tx, ty)) return false;
    }
  }
  for (const obstacle of dungeon.obstacles || []) {
    if (!obstacle.radius) continue;
    const range = radius + obstacle.radius;
    if (distanceSq(x, y, obstacle.x, obstacle.y) < range * range) return false;
  }
  for (const chest of dungeon.chests || []) {
    if (chest.opened) continue;
    const range = radius + chest.radius;
    if (distanceSq(x, y, chest.x, chest.y) < range * range) return false;
  }
  return true;
}

function generateObstacles(dungeon, rng, startRoom, exitRoom) {
  const obstacles = [];
  dungeon.obstacles = obstacles;
  dungeon.rooms.forEach((room, roomIndex) => {
    const isStart = roomIndex === 0;
    const isExit = room.cx === exitRoom.cx && room.cy === exitRoom.cy;
    const area = room.w * room.h;
    let count = randInt(rng, 1, Math.min(4, Math.max(1, Math.floor(area / 18))));
    if (isStart || isExit) count = rng() < 0.55 ? 1 : 0;
    if (rng() < 0.16) count = 0;

    for (let placed = 0, attempts = 0; placed < count && attempts < count * 16; attempts += 1) {
      const type = pickObstacleType(rng);
      const tx = randInt(rng, room.x + 1, room.x + room.w - 2);
      const ty = randInt(rng, room.y + 1, room.y + room.h - 2);
      if (!isWalkableTile(dungeon, tx, ty) || getDungeonTile(dungeon, tx, ty) === DUNGEON_EXIT) continue;

      const point = dungeonTileWorldCenter(dungeon, tx, ty);
      const x = point.x + (rng() - 0.5) * TILE_SIZE * 0.36;
      const y = point.y + (rng() - 0.5) * TILE_SIZE * 0.32;
      const startSafe = TILE_SIZE * (isStart ? 2.3 : 1.35);
      const exitSafe = TILE_SIZE * (isExit ? 2.15 : 1.25);
      if (distanceSq(x, y, dungeon.start.x, dungeon.start.y) < startSafe * startSafe) continue;
      if (distanceSq(x, y, dungeon.exit.x, dungeon.exit.y) < exitSafe * exitSafe) continue;
      if (!canStandAt(dungeon, x, y, type.clearance)) continue;

      obstacles.push({
        sprite: type.sprite,
        x,
        y,
        radius: type.radius,
        clearance: type.clearance,
        scale: type.scale * (0.9 + rng() * 0.18),
        rotation: (rng() - 0.5) * 0.28,
      });
      placed += 1;
    }
  });
  return obstacles;
}

function pickObstacleType(rng) {
  const roll = rng();
  if (roll < 0.18) return OBSTACLE_TYPES[0];
  if (roll < 0.39) return OBSTACLE_TYPES[1];
  if (roll < 0.6) return OBSTACLE_TYPES[2];
  if (roll < 0.78) return OBSTACLE_TYPES[3];
  if (roll < 0.93) return OBSTACLE_TYPES[4];
  return OBSTACLE_TYPES[5];
}

function generateChests(dungeon, rng, startRoom, exitRoom, wave) {
  const chests = [];
  dungeon.chests = chests;
  const count = clamp(3 + Math.floor((wave - 1) / 3), 3, 5);
  const candidateRooms = dungeon.rooms
    .filter((room) => room !== startRoom && !(room.cx === exitRoom.cx && room.cy === exitRoom.cy))
    .sort((a, b) => distanceSq(b.cx, b.cy, startRoom.cx, startRoom.cy) - distanceSq(a.cx, a.cy, startRoom.cx, startRoom.cy));

  const shuffledRooms = shuffleWithRng([...candidateRooms], rng);
  for (const room of shuffledRooms) {
    if (chests.length >= count) break;
    tryPlaceChestInRoom(dungeon, rng, room);
  }

  // If random room picks could not satisfy the floor minimum, retry across all
  // eligible rooms with more attempts so each dungeon reliably has 3+ chests.
  for (let pass = 0; pass < 4 && chests.length < count; pass += 1) {
    for (const room of shuffleWithRng([...candidateRooms], rng)) {
      if (chests.length >= count) break;
      tryPlaceChestInRoom(dungeon, rng, room, 48);
    }
  }

  return chests;
}

function tryPlaceChestInRoom(dungeon, rng, room, maxAttempts = 24) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tx = randInt(rng, room.x + 1, room.x + room.w - 2);
    const ty = randInt(rng, room.y + 1, room.y + room.h - 2);
    if (!isWalkableTile(dungeon, tx, ty) || getDungeonTile(dungeon, tx, ty) === DUNGEON_EXIT) continue;
    const point = dungeonTileWorldCenter(dungeon, tx, ty);
    const x = point.x + (rng() - 0.5) * TILE_SIZE * 0.28;
    const y = point.y + (rng() - 0.5) * TILE_SIZE * 0.22;
    const startSafe = TILE_SIZE * 2.5;
    const exitSafe = TILE_SIZE * 1.7;
    if (distanceSq(x, y, dungeon.start.x, dungeon.start.y) < startSafe * startSafe) continue;
    if (distanceSq(x, y, dungeon.exit.x, dungeon.exit.y) < exitSafe * exitSafe) continue;
    if (!canStandAt(dungeon, x, y, 42)) continue;

    dungeon.chests.push({
      x,
      y,
      radius: 21,
      opened: false,
      holdTimer: 0,
      rewardName: "",
      bob: rng() * Math.PI * 2,
    });
    return true;
  }
  return false;
}

function shuffleWithRng(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function circleOverlapsTile(dungeon, x, y, radius, tx, ty) {
  const left = dungeon.offsetX + tx * TILE_SIZE;
  const top = dungeon.offsetY + ty * TILE_SIZE;
  const closestX = clamp(x, left, left + TILE_SIZE);
  const closestY = clamp(y, top, top + TILE_SIZE);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function setDungeonTile(dungeon, tx, ty, value) {
  if (tx < 0 || ty < 0 || tx >= dungeon.width || ty >= dungeon.height) return;
  dungeon.tiles[ty * dungeon.width + tx] = value;
}

function carveRoom(tiles, width, height, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        tiles[y * width + x] = DUNGEON_FLOOR;
      }
    }
  }
}

function carveCorridor(tiles, width, height, x1, y1, x2, y2) {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  while (x !== x2 || y !== y2) {
    carveWideTile(tiles, width, height, x, y);
    if (x !== x2) x += dx;
    else if (y !== y2) y += dy;
  }
  carveWideTile(tiles, width, height, x2, y2);
}

function carveWideTile(tiles, width, height, cx, cy) {
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) tiles[y * width + x] = DUNGEON_FLOOR;
    }
  }
}

function roomsOverlap(a, b, margin) {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

function toRoomInfo(room) {
  return {
    ...room,
    cx: Math.floor(room.x + room.w / 2),
    cy: Math.floor(room.y + room.h / 2),
  };
}

function tileCenter(width, height, tx, ty) {
  return {
    x: (tx - width / 2 + 0.5) * TILE_SIZE,
    y: (ty - height / 2 + 0.5) * TILE_SIZE,
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
