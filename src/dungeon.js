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
const EXIT_INTERACTION_RADIUS_SCALE = 2;

export function generateDungeon(wave) {
  const seed = ((Date.now() & 0xfffffff) ^ Math.floor(Math.random() * 0x7fffffff) ^ (wave * 2654435761)) >>> 0;
  const rng = makeRng(seed);
  const width = clamp(42 + wave * 2, 42, 72);
  const height = clamp(32 + wave * 2, 32, 54);
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
    exit: tileCenter(width, height, exitRoom.cx, exitRoom.cy),
    obstacles: [],
    chests: [],
  };

  setDungeonTile(dungeon, exitRoom.cx, exitRoom.cy, DUNGEON_EXIT);
  dungeon.obstacles = generateObstacles(dungeon, rng, startRoom, exitRoom);
  dungeon.chests = generateChests(dungeon, rng, startRoom, exitRoom, wave);
  return dungeon;
}

export function moveActorWithDungeonCollision(actor, dx, dy) {
  if (!game.dungeon) {
    actor.x += dx;
    actor.y += dy;
    return;
  }

  if (dx !== 0) {
    const nextX = actor.x + dx;
    if (canStandAt(game.dungeon, nextX, actor.y, actor.radius * 0.72)) actor.x = nextX;
  }

  if (dy !== 0) {
    const nextY = actor.y + dy;
    if (canStandAt(game.dungeon, actor.x, nextY, actor.radius * 0.72)) actor.y = nextY;
  }
}

export function pickDungeonSpawnPoint(originX, originY, minDistance, maxDistance) {
  const dungeon = game.dungeon;
  if (!dungeon) return null;
  let best = null;
  let bestDistance = 0;
  for (let i = 0; i < 80; i += 1) {
    const room = dungeon.rooms[Math.floor(Math.random() * dungeon.rooms.length)];
    const tx = randInt(Math.random, room.x + 1, room.x + room.w - 2);
    const ty = randInt(Math.random, room.y + 1, room.y + room.h - 2);
    if (!isWalkableTile(dungeon, tx, ty)) continue;
    const point = tileCenter(dungeon.width, dungeon.height, tx, ty);
    if (!canStandAt(dungeon, point.x, point.y, 22)) continue;
    const distance = Math.hypot(point.x - originX, point.y - originY);
    if (distance >= minDistance && distance <= maxDistance) return point;
    if (distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

export function hasReachedDungeonExit(actor) {
  const exit = game.dungeon?.exit;
  if (!exit || !actor) return false;
  return Math.hypot(actor.x - exit.x, actor.y - exit.y) <= (actor.radius + TILE_SIZE * 0.34) * EXIT_INTERACTION_RADIUS_SCALE;
}

export function getDungeonTile(dungeon, tx, ty) {
  if (!dungeon || tx < 0 || ty < 0 || tx >= dungeon.width || ty >= dungeon.height) return DUNGEON_WALL;
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

export function dungeonFloorSprite(tx, ty) {
  const roll = hash2(tx, ty, 23);
  if (roll < 0.14) return "lane";
  if (roll < 0.3) return "sidewalk";
  if (roll < 0.42) return "crosswalk";
  return "road";
}

function canStandAt(dungeon, x, y, radius) {
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
  const count = clamp(1 + Math.floor((wave - 1) / 3), 1, 3);
  const candidateRooms = dungeon.rooms
    .filter((room) => room !== startRoom && !(room.cx === exitRoom.cx && room.cy === exitRoom.cy))
    .sort((a, b) => distanceSq(b.cx, b.cy, startRoom.cx, startRoom.cy) - distanceSq(a.cx, a.cy, startRoom.cx, startRoom.cy));

  for (let i = 0; i < candidateRooms.length && chests.length < count; i += 1) {
    const room = candidateRooms[(i + Math.floor(rng() * Math.max(1, candidateRooms.length))) % candidateRooms.length];
    for (let attempt = 0; attempt < 24; attempt += 1) {
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

      chests.push({
        x,
        y,
        radius: 21,
        opened: false,
        holdTimer: 0,
        rewardName: "",
        bob: rng() * Math.PI * 2,
      });
      break;
    }
  }

  return chests;
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
