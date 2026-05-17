import { COLLISION_CELL_SIZE, ENEMY_SPEED_RAMP_SECONDS, TAU, TILE_SIZE } from "./constants.js";
import { enemyCollisionGrid, game, nextEnemyId } from "./state.js";
import { distanceToSegmentSq, gridKey, normalize } from "./utils/math.js";
import { damagePlayer } from "./player.js";
import { addEffect, addSparks, addTelegraphLine } from "./effects.js";
import { viewSize, cameraZoom } from "./render.js";
import { canStandAt, dungeonTileWorldCenter, isWalkableTile, moveActorWithDungeonCollision, shortestDungeonDelta, worldToDungeonTile } from "./dungeon.js";

const SPAWN_BATCH_INTERVAL_MIN = 2.4;
const SPAWN_BATCH_INTERVAL_MAX = 5.2;
const SPAWN_BATCH_SIZE_MIN = 2;
const SPAWN_BATCH_SIZE_MAX = 32;
const OPENING_ENEMY_DENSITY_TILES = 18;
const OPENING_ENEMY_MIN_COUNT = 36;
const OPENING_ENEMY_MAX_COUNT = 160;
const OPENING_SPAWN_SAFE_RADIUS = TILE_SIZE * 3.2;
const OPENING_SPAWN_GRID_SIZE = TILE_SIZE * 4;
const ENEMY_AGGRO_RANGE = TILE_SIZE * 9;
const MOBILE_SCREEN_ASPECT = 9 / 16;
const OFFSCREEN_SPAWN_MARGIN = 72;
const OFFSCREEN_SPAWN_NEAR_BAND = 360;
const OFFSCREEN_SPAWN_ATTEMPTS = 96;
const SAFETY_ENEMY_CAP = 3000;
const ENEMY_PUSH_RADIUS_SCALE = 1.0;
const ENEMY_PUSH_STRENGTH = 0.42;
const ENEMY_PUSH_MAX_STEP = 5.5;
const ENEMY_HP_PER_FLOOR_MULTIPLIER = 0.18;

function runProgress(elapsed = game.floorElapsed || 0) {
  return Math.min(1, Math.max(0, elapsed / ENEMY_SPEED_RAMP_SECONDS));
}

export function enemyRunSpeedMultiplier(elapsed = game.floorElapsed || 0) {
  return 1 + runProgress(elapsed);
}

function mobileScreenWorldSize(view, zoom) {
  const visibleH = view.h / zoom;
  return {
    w: visibleH * MOBILE_SCREEN_ASPECT,
    h: visibleH,
  };
}

const ENEMY_TYPE_UNLOCKS = [
  { wave: 1, type: "walker", weight: 1 },
  { wave: 2, type: "runner", weight: 0.28 },
  { wave: 3, type: "archer", weight: 0.22 },
  { wave: 4, type: "orc", weight: 0.16 },
];

function unlockedEnemyTypesForWave(wave = game.wave || 1) {
  return ENEMY_TYPE_UNLOCKS.filter((entry) => wave >= entry.wave);
}

function pickEnemyTypeByWave(wave = game.wave || 1) {
  const unlockedTypes = unlockedEnemyTypesForWave(wave);
  const totalWeight = unlockedTypes.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of unlockedTypes) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }

  return "walker";
}

export function pickStrongestEnemyTypeForCurrentWave() {
  const unlockedTypes = unlockedEnemyTypesForWave();
  return unlockedTypes[unlockedTypes.length - 1]?.type || "walker";
}

function enemySpawnRamp(elapsed = game.floorElapsed || 0) {
  return Math.min(1, Math.max(0, elapsed / ENEMY_SPEED_RAMP_SECONDS));
}

function enemyFloorHpMultiplier(wave = game.wave || 1) {
  const floor = Math.max(1, Math.floor(wave || 1));
  return 1 + (floor - 1) * ENEMY_HP_PER_FLOOR_MULTIPLIER;
}

function currentSpawnPlan(elapsed = game.floorElapsed || 0) {
  const ramp = enemySpawnRamp(elapsed);
  const pressure = Math.pow(ramp, 1.35);
  return {
    interval: SPAWN_BATCH_INTERVAL_MAX - (SPAWN_BATCH_INTERVAL_MAX - SPAWN_BATCH_INTERVAL_MIN) * pressure,
    batchSize: Math.round(SPAWN_BATCH_SIZE_MIN + (SPAWN_BATCH_SIZE_MAX - SPAWN_BATCH_SIZE_MIN) * pressure),
  };
}

export function resetEnemySpawnTimer() {
  const plan = currentSpawnPlan();
  game.spawnClock = plan.interval;
  game.spawnBatchSize = plan.batchSize;
}

export function spawnOpeningEnemies() {
  const positions = pickDistributedOpeningSpawnPoints(openingEnemyCount());

  for (const position of positions) {
    spawnEnemy(undefined, { position, offscreen: false });
  }
}

function openingEnemyCount() {
  const dungeon = game.dungeon;
  if (!dungeon) return OPENING_ENEMY_MIN_COUNT;

  let walkableTiles = 0;
  for (let ty = 0; ty < dungeon.height; ty += 1) {
    for (let tx = 0; tx < dungeon.width; tx += 1) {
      if (isWalkableTile(dungeon, tx, ty)) walkableTiles += 1;
    }
  }

  return Math.min(
    OPENING_ENEMY_MAX_COUNT,
    Math.max(OPENING_ENEMY_MIN_COUNT, Math.round(walkableTiles / OPENING_ENEMY_DENSITY_TILES)),
  );
}

function pickDistributedOpeningSpawnPoints(count) {
  const dungeon = game.dungeon;
  if (!dungeon || count <= 0) return [];

  const candidates = collectOpeningSpawnCandidates(dungeon);
  return pickDensityBalancedOpeningSpawns(candidates, count);
}

function collectOpeningSpawnCandidates(dungeon) {
  const candidates = [];
  for (let ty = 0; ty < dungeon.height; ty += 1) {
    for (let tx = 0; tx < dungeon.width; tx += 1) {
      if (!isWalkableTile(dungeon, tx, ty)) continue;
      const point = dungeonTileWorldCenter(dungeon, tx, ty);
      const jitter = TILE_SIZE * 0.28;
      point.x += (Math.random() - 0.5) * jitter;
      point.y += (Math.random() - 0.5) * jitter;
      if (!canStandAt(dungeon, point.x, point.y, 22)) continue;
      const playerDistance = Math.hypot(point.x - game.player.x, point.y - game.player.y);
      if (playerDistance < OPENING_SPAWN_SAFE_RADIUS) continue;
      candidates.push(point);
    }
  }
  return candidates;
}

function pickDensityBalancedOpeningSpawns(candidates, count) {
  if (candidates.length <= count) return shuffle(candidates);

  const cells = new Map();
  for (const point of candidates) {
    const cellX = Math.floor(point.x / OPENING_SPAWN_GRID_SIZE);
    const cellY = Math.floor(point.y / OPENING_SPAWN_GRID_SIZE);
    const key = gridKey(cellX, cellY);
    let cell = cells.get(key);
    if (!cell) {
      cell = { points: [], quota: 0, remainder: 0 };
      cells.set(key, cell);
    }
    cell.points.push(point);
  }

  const chosen = [];
  const cellList = [...cells.values()];
  for (const cell of cellList) {
    shuffleInPlace(cell.points);
    const exactQuota = (cell.points.length / candidates.length) * count;
    cell.quota = Math.floor(exactQuota);
    cell.remainder = exactQuota - cell.quota;
    appendCellSpawns(chosen, cell, cell.quota, count);
  }

  cellList.sort((a, b) => b.remainder - a.remainder || Math.random() - 0.5);
  for (const cell of cellList) {
    if (chosen.length >= count) break;
    appendCellSpawns(chosen, cell, 1, count);
  }

  while (chosen.length < count) {
    const cell = cellList.find((entry) => entry.points.length > 0);
    if (!cell) break;
    appendCellSpawns(chosen, cell, 1, count);
  }

  return shuffle(chosen);
}

function appendCellSpawns(chosen, cell, amount, count) {
  for (let i = 0; i < amount && chosen.length < count && cell.points.length > 0; i += 1) {
    chosen.push(cell.points.pop());
  }
}

function shuffle(points) {
  const shuffled = [...points];
  shuffleInPlace(shuffled);
  return shuffled;
}

function shuffleInPlace(points) {
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  return points;
}

export function spawnEnemies(dt) {
  if (game.enemies.length >= SAFETY_ENEMY_CAP) {
    game.spawnClock = Math.min(game.spawnClock, currentSpawnPlan().interval * 0.5);
    return;
  }

  game.spawnClock -= dt;
  if (game.spawnClock > 0) return;

  const plan = currentSpawnPlan();
  game.spawnBatchSize = plan.batchSize;
  const spawnCount = Math.min(plan.batchSize, SAFETY_ENEMY_CAP - game.enemies.length);
  for (let i = 0; i < spawnCount; i += 1) {
    spawnEnemy(undefined, { offscreen: true });
  }

  game.spawnClock += plan.interval;
  if (game.spawnClock <= 0) game.spawnClock = plan.interval;
}

function pickOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, standRadius) {
  if (game.dungeon) return pickDungeonOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, standRadius);
  return pickWorldOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin);
}

function pickWorldOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin) {
  const side = Math.floor(Math.random() * 4);
  return pointOnOffscreenSide(side, camX, camY, visibleW, visibleH, margin, OFFSCREEN_SPAWN_NEAR_BAND);
}

function pickDungeonOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, standRadius) {
  for (let i = 0; i < OFFSCREEN_SPAWN_ATTEMPTS; i += 1) {
    const side = Math.floor(Math.random() * 4);
    const point = pointOnOffscreenSide(side, camX, camY, visibleW, visibleH, margin, OFFSCREEN_SPAWN_NEAR_BAND);
    if (isDungeonSpawnPointValid(point, true, camX, camY, visibleW, visibleH, margin, standRadius)) return point;
  }

  return findNearestDungeonOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, standRadius);
}

function pointOnOffscreenSide(side, camX, camY, visibleW, visibleH, margin, band) {
  const left = camX - visibleW / 2;
  const right = camX + visibleW / 2;
  const top = camY - visibleH / 2;
  const bottom = camY + visibleH / 2;
  const distance = margin + Math.random() * band;

  if (side === 0) {
    return { x: left - margin + Math.random() * (visibleW + margin * 2), y: top - distance };
  }
  if (side === 1) {
    return { x: right + distance, y: top - margin + Math.random() * (visibleH + margin * 2) };
  }
  if (side === 2) {
    return { x: left - margin + Math.random() * (visibleW + margin * 2), y: bottom + distance };
  }
  return { x: left - distance, y: top - margin + Math.random() * (visibleH + margin * 2) };
}

function isDungeonSpawnPointValid(point, requireOffscreen, camX, camY, visibleW, visibleH, margin, standRadius = 22) {
  const dungeon = game.dungeon;
  if (!dungeon) return true;
  if (requireOffscreen && !isPointOffscreen(point, camX, camY, visibleW, visibleH, margin)) return false;
  const { tx, ty } = worldToDungeonTile(dungeon, point.x, point.y);
  return isWalkableTile(dungeon, tx, ty) && canStandAt(dungeon, point.x, point.y, standRadius);
}

function isPointOffscreen(point, camX, camY, visibleW, visibleH, margin) {
  return point.x < camX - visibleW / 2 - margin ||
    point.x > camX + visibleW / 2 + margin ||
    point.y < camY - visibleH / 2 - margin ||
    point.y > camY + visibleH / 2 + margin;
}

function findNearestDungeonOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, standRadius) {
  const dungeon = game.dungeon;
  if (!dungeon) return null;

  let best = null;
  let bestDistance = Infinity;
  for (let ty = 0; ty < dungeon.height; ty += 1) {
    for (let tx = 0; tx < dungeon.width; tx += 1) {
      if (!isWalkableTile(dungeon, tx, ty)) continue;
      const point = dungeonTileWorldCenter(dungeon, tx, ty);
      if (!isDungeonSpawnPointValid(point, true, camX, camY, visibleW, visibleH, margin, standRadius)) continue;
      const distance = distanceToViewportEdge(point, camX, camY, visibleW, visibleH);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function distanceToViewportEdge(point, camX, camY, visibleW, visibleH) {
  const dx = Math.max(Math.abs(point.x - camX) - visibleW / 2, 0);
  const dy = Math.max(Math.abs(point.y - camY) - visibleH / 2, 0);
  return Math.hypot(dx, dy);
}

function pickAnyDungeonSpawnPoint(standRadius = 22) {
  const dungeon = game.dungeon;
  if (!dungeon) return null;
  const candidates = collectOpeningSpawnCandidates(dungeon).filter((point) =>
    canStandAt(dungeon, point.x, point.y, standRadius));
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function enemySpawnStandRadius(type, options = {}) {
  let radius = 18;
  if (type === "runner") radius = 16;
  else if (type === "archer") radius = 17;
  else if (type === "orc") radius = 27;
  else if (type === "bigZombie") radius = 33;
  if (options.boss) return radius * 1.35;
  if (options.elite) return radius * 1.18;
  return radius;
}

export function spawnEnemy(forceType, options = {}) {
  if (game.enemies.length >= SAFETY_ENEMY_CAP) return null;

  const type = forceType || pickEnemyTypeByWave();
  const spawnStandRadius = enemySpawnStandRadius(type, options);
  const view = viewSize();
  const zoom = cameraZoom(view);
  const spawnScreen = mobileScreenWorldSize(view, zoom);
  const visibleW = spawnScreen.w;
  const visibleH = spawnScreen.h;
  const margin = OFFSCREEN_SPAWN_MARGIN;
  const camX = game.camera?.x ?? game.player.x;
  const camY = game.camera?.y ?? game.player.y;
  const requireOffscreen = options.offscreen !== false && !options.position;

  let x = options.position?.x ?? game.player.x;
  let y = options.position?.y ?? game.player.y;
  if (!options.position && requireOffscreen) {
    const spawnPoint = pickOffscreenSpawnPoint(camX, camY, visibleW, visibleH, margin, spawnStandRadius);
    if (!spawnPoint) return null;
    x = spawnPoint.x;
    y = spawnPoint.y;
  } else if (!options.position && game.dungeon) {
    const spawnPoint = pickAnyDungeonSpawnPoint(spawnStandRadius);
    if (!spawnPoint) return null;
    x = spawnPoint.x;
    y = spawnPoint.y;
  }

  const baseHp = Math.round(28 * (options.boss ? 3.8 : options.elite ? 2.25 : 1));
  const enemy = {
    id: nextEnemyId(),
    kind: "melee",
    x,
    y,
    radius: 18,
    hp: baseHp,
    maxHp: baseHp,
    speed: 78,
    attackDamage: 9,
    attackCooldown: 1.08,
    attackTimer: 0,
    sprite: "zombieA",
    readableSprite: "zombieAReadable",
    hit: 0,
    wobble: Math.random() * TAU,
  };

  if (type === "runner") {
    enemy.radius = 16;
    enemy.hp = Math.round(baseHp * 0.72);
    enemy.maxHp = enemy.hp;
    enemy.speed = 122;
    enemy.attackDamage = 7;
    enemy.attackCooldown = 0.76;
    enemy.sprite = "zombieB";
    enemy.readableSprite = "zombieBReadable";
  } else if (type === "bigZombie") {
    enemy.kind = "bigZombie";
    enemy.radius = 33;
    enemy.hp = Math.round(baseHp * 5.4);
    enemy.maxHp = enemy.hp;
    enemy.speed = 54;
    enemy.attackDamage = 18;
    enemy.attackCooldown = 1.1;
    enemy.sprite = "bigZombie";
    enemy.readableSprite = "bigZombieReadable";
    enemy.bigZombieState = "chase";
    enemy.chargeRange = 260;
    enemy.chargeWidth = 82;
    enemy.chargeWindup = 0.72;
    enemy.chargeDuration = 0.42;
    enemy.chargeCooldown = 1.8;
    enemy.chargeCooldownLeft = 0.6 + Math.random() * 0.6;
    enemy.chargeTimer = 0;
    enemy.chargeSpeed = 760;
    enemy.chargeDirX = 0;
    enemy.chargeDirY = 0;
    enemy.chargeDamage = 24;
    enemy.chargeHitIds = new Set();
  } else if (type === "orc") {
    enemy.kind = "orc";
    enemy.radius = 27;
    enemy.hp = Math.round(baseHp * 2.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 58;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "orc";
    enemy.readableSprite = "orcReadable";
    enemy.orcState = "idle";
    enemy.chargeTimer = 0;
    enemy.chargeDuration = 0.95;
    enemy.chargeCooldown = 1.6;
    enemy.chargeCooldownLeft = 0.6 + Math.random() * 0.6;
    enemy.attackRange = 130;
    enemy.swingRange = 150;
    enemy.swingWidth = 110;
    enemy.swingTargetX = 0;
    enemy.swingTargetY = 0;
    enemy.slamDamage = 28;
  } else if (type === "archer") {
    enemy.kind = "archer";
    enemy.radius = 17;
    enemy.hp = Math.round(baseHp * 0.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 92;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "skeletonArcher";
    enemy.readableSprite = "skeletonArcherReadable";
    enemy.shotCooldown = 0.6 + Math.random() * 0.6;
    enemy.shotInterval = 2.4;
    enemy.shotDamage = 16;
    enemy.shootRange = 320;
    enemy.preferredDistance = 220;
  }

  if (options.noDeathChest) enemy.noDeathChest = true;

  const floorHpMultiplier = enemyFloorHpMultiplier();
  enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * floorHpMultiplier));
  enemy.hp = enemy.maxHp;

  if (options.elite || options.boss) {
    enemy.elite = true;
    enemy.boss = !!options.boss;
    enemy.goldCoins = options.boss ? 28 : 14;
    enemy.radius *= options.boss ? 1.35 : 1.18;
    enemy.maxHp = Math.round(enemy.maxHp * (options.boss ? 2.1 : 1.45));
    enemy.hp = enemy.maxHp;
    enemy.baseSpeed = enemy.speed * (options.boss ? 0.78 : 0.9);
  }

  enemy.baseMaxHp = enemy.maxHp;
  enemy.baseSpeed = enemy.baseSpeed || enemy.speed;
  enemy.speed = enemy.baseSpeed * enemyRunSpeedMultiplier();
  game.enemies.push(enemy);
  return enemy;
}

export function updateEnemies(dt) {
  const p = game.player;
  const floorSpeed = enemyRunSpeedMultiplier();
  for (const enemy of game.enemies) {
    if (enemy.baseSpeed == null) enemy.baseSpeed = enemy.speed;
    if ((enemy.slowTimer || 0) > 0) {
      enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    } else {
      enemy.slowMultiplier = 1;
    }
    enemy.speed = enemy.baseSpeed * floorSpeed * (enemy.slowMultiplier || 1);
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    if (!shouldEnemyChase(enemy, p)) continue;
    if (enemy.kind === "archer") {
      updateArcher(enemy, p, dt);
    } else if (enemy.kind === "orc") {
      updateOrc(enemy, p, dt);
    } else if (enemy.kind === "bigZombie") {
      updateBigZombie(enemy, p, dt);
    } else {
      updateMeleeEnemy(enemy, p, dt);
    }
  }

  resolveEnemySeparation();
}

function shouldEnemyChase(enemy, p) {
  if (enemy.boss || enemy.elite || enemy.roomId === game.dungeon?.activeRoomId) return true;
  const delta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
  return delta.dx * delta.dx + delta.dy * delta.dy <= ENEMY_AGGRO_RANGE * ENEMY_AGGRO_RANGE;
}

function enemyPushRadius(enemy) {
  return Math.max(7, enemy.radius * ENEMY_PUSH_RADIUS_SCALE);
}

function buildEnemySeparationGrid() {
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

function resolveEnemySeparation() {
  if (game.enemies.length < 2) return;

  const grid = buildEnemySeparationGrid();
  for (const [key, cell] of grid) {
    const [cellXText, cellYText] = key.split(":");
    const cellX = Number(cellXText);
    const cellY = Number(cellYText);

    for (const enemy of cell) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          const otherCell = grid.get(gridKey(cellX + xOffset, cellY + yOffset));
          if (!otherCell) continue;

          for (const other of otherCell) {
            if (other === enemy || other.id <= enemy.id) continue;
            separateEnemyPair(enemy, other);
          }
        }
      }
    }
  }
}

function separateEnemyPair(a, b) {
  const delta = shortestDungeonDelta(game.dungeon, a.x, a.y, b.x, b.y);
  const minDist = enemyPushRadius(a) + enemyPushRadius(b);
  const distSq = delta.dx * delta.dx + delta.dy * delta.dy;
  if (distSq >= minDist * minDist) return;

  const distance = Math.sqrt(distSq);
  const nx = distance > 0.0001 ? delta.dx / distance : Math.cos((a.id * 12.9898 + b.id * 78.233) % TAU);
  const ny = distance > 0.0001 ? delta.dy / distance : Math.sin((a.id * 12.9898 + b.id * 78.233) % TAU);
  const overlap = minDist - distance;
  const step = Math.min(ENEMY_PUSH_MAX_STEP, overlap * ENEMY_PUSH_STRENGTH * 0.5);
  if (step <= 0.001) return;

  moveActorWithDungeonCollision(a, -nx * step, -ny * step);
  moveActorWithDungeonCollision(b, nx * step, ny * step);
}

function updateMeleeEnemy(enemy, p, dt) {
  enemy.attackTimer = Math.max(0, (enemy.attackTimer ?? 0) - dt);
  if (enemy.attackTimer < 0.0001) enemy.attackTimer = 0;
  const chaseDelta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
  const dir = normalize(chaseDelta.dx, chaseDelta.dy);
  moveActorWithDungeonCollision(enemy, dir.x * enemy.speed * dt, dir.y * enemy.speed * dt);

  const minDist = p.radius + enemy.radius;
  if (dir.len < minDist) {
    if (dir.len > 0.01) {
      const push = (minDist - dir.len) * 0.5;
      moveActorWithDungeonCollision(enemy, -dir.x * push, -dir.y * push);
      moveActorWithDungeonCollision(p, dir.x * push * 0.18, dir.y * push * 0.18);
    }
    if (enemy.attackTimer <= 0) {
      damagePlayer(enemy.attackDamage ?? enemy.damage ?? 1);
      enemy.attackTimer = enemy.attackCooldown ?? 1;
    }
  }
}

function updateArcher(enemy, p, dt) {
  enemy.shotCooldown = Math.max(0, (enemy.shotCooldown ?? 0) - dt);

  const delta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
  const dx = delta.dx;
  const dy = delta.dy;
  const distance = Math.hypot(dx, dy) || 0.0001;

  if (distance > enemy.shootRange) {
    const speed = enemy.speed;
    moveActorWithDungeonCollision(enemy, (dx / distance) * speed * dt, (dy / distance) * speed * dt);
  } else if (distance < enemy.preferredDistance - 30) {
    const speed = enemy.speed * 0.65;
    moveActorWithDungeonCollision(enemy, -(dx / distance) * speed * dt, -(dy / distance) * speed * dt);
  }

  if (enemy.shotCooldown <= 0 && distance <= enemy.shootRange) {
    const speed = 320;
    const life = Math.max(0.6, distance / speed + 0.4);
    game.enemyProjectiles.push({
      x: enemy.x,
      y: enemy.y - 6,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      radius: 8,
      damage: enemy.shotDamage,
      life,
      spinSeed: Math.random() * TAU,
      spinRate: 7 + Math.random() * 5,
    });
    addEffect({
      type: "burst",
      x: enemy.x,
      y: enemy.y - 6,
      radius: 18,
      life: 0.14,
      maxLife: 0.14,
      glow: "glowAmber",
      tint: [1, 0.85, 0.5],
    });
    addSparks(enemy.x, enemy.y - 6, 3, 110);
    enemy.shotCooldown = enemy.shotInterval;
  }
}

function updateBigZombie(enemy, p, dt) {
  enemy.chargeCooldownLeft = Math.max(0, (enemy.chargeCooldownLeft ?? 0) - dt);
  enemy.attackTimer = Math.max(0, (enemy.attackTimer ?? 0) - dt);

  if (enemy.bigZombieState === "windup") {
    enemy.chargeTimer -= dt;
    if (enemy.chargeTimer <= 0) {
      enemy.bigZombieState = "dashing";
      enemy.chargeTimer = enemy.chargeDuration;
      enemy.chargeHitIds = new Set();
      game.shake = Math.max(game.shake, 3);
    }
    return;
  }

  if (enemy.bigZombieState === "dashing") {
    enemy.chargeTimer -= dt;
    moveActorWithDungeonCollision(enemy, enemy.chargeDirX * enemy.chargeSpeed * dt, enemy.chargeDirY * enemy.chargeSpeed * dt);
    const delta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
    const hitRange = enemy.radius + p.radius;
    if (delta.dx * delta.dx + delta.dy * delta.dy <= hitRange * hitRange && !enemy.chargeHitIds?.has("player")) {
      damagePlayer(enemy.chargeDamage);
      enemy.chargeHitIds?.add("player");
      game.shake = Math.max(game.shake, 7);
    }
    if (enemy.chargeTimer <= 0) {
      enemy.bigZombieState = "recover";
      enemy.chargeTimer = 0.34;
      enemy.chargeCooldownLeft = enemy.chargeCooldown;
    }
    return;
  }

  if (enemy.bigZombieState === "recover") {
    enemy.chargeTimer -= dt;
    if (enemy.chargeTimer <= 0) enemy.bigZombieState = "chase";
    return;
  }

  const delta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
  const distance = Math.hypot(delta.dx, delta.dy) || 0.0001;
  if (distance > enemy.chargeRange * 0.72) {
    moveActorWithDungeonCollision(enemy, (delta.dx / distance) * enemy.speed * dt, (delta.dy / distance) * enemy.speed * dt);
  }

  const minDist = p.radius + enemy.radius;
  if (distance < minDist && enemy.attackTimer <= 0) {
    damagePlayer(enemy.attackDamage);
    enemy.attackTimer = enemy.attackCooldown;
  }

  if (enemy.chargeCooldownLeft <= 0 && distance <= enemy.chargeRange) {
    enemy.bigZombieState = "windup";
    enemy.chargeTimer = enemy.chargeWindup;
    enemy.chargeDirX = delta.dx / distance;
    enemy.chargeDirY = delta.dy / distance;
    const reachX = enemy.x + enemy.chargeDirX * enemy.chargeRange;
    const reachY = enemy.y + enemy.chargeDirY * enemy.chargeRange;
    addTelegraphLine(enemy.x, enemy.y, reachX, reachY, enemy.chargeWidth, enemy.chargeWindup);
  }
}

function updateOrc(enemy, p, dt) {
  enemy.chargeCooldownLeft = Math.max(0, (enemy.chargeCooldownLeft ?? 0) - dt);

  if (enemy.orcState === "charging") {
    enemy.chargeTimer -= dt;
    if (enemy.chargeTimer <= 0) {
      const dx = enemy.swingTargetX - enemy.x;
      const dy = enemy.swingTargetY - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      const reachX = enemy.x + (dx / len) * enemy.swingRange;
      const reachY = enemy.y + (dy / len) * enemy.swingRange;
      const halfWidth = enemy.swingWidth * 0.5;
      const reach = halfWidth + p.radius;
      const inRange = distanceToSegmentSq(p.x, p.y, enemy.x, enemy.y, reachX, reachY) <= reach * reach;
      if (inRange) damagePlayer(enemy.slamDamage);
      addEffect({
        type: "line",
        x1: enemy.x,
        y1: enemy.y,
        x2: reachX,
        y2: reachY,
        width: enemy.swingWidth,
        life: 0.18,
        maxLife: 0.18,
        glow: "glowRed",
        tint: [1, 0.4, 0.22],
      });
      addEffect({
        type: "burst",
        x: reachX,
        y: reachY,
        radius: enemy.swingWidth * 0.55,
        life: 0.36,
        maxLife: 0.36,
        glow: "glowRed",
        tint: [1, 0.4, 0.22],
      });
      addSparks(reachX, reachY, 12, 220);
      game.shake = Math.max(game.shake, 8);
      enemy.orcState = "idle";
      enemy.chargeCooldownLeft = enemy.chargeCooldown;
    }
    return;
  }

  const delta = shortestDungeonDelta(game.dungeon, enemy.x, enemy.y, p.x, p.y);
  const dx = delta.dx;
  const dy = delta.dy;
  const distance = Math.hypot(dx, dy) || 0.0001;
  if (distance > enemy.attackRange) {
    moveActorWithDungeonCollision(enemy, (dx / distance) * enemy.speed * dt, (dy / distance) * enemy.speed * dt);
  }

  if (enemy.chargeCooldownLeft <= 0 && distance <= enemy.attackRange) {
    enemy.orcState = "charging";
    enemy.chargeTimer = enemy.chargeDuration;
    enemy.swingTargetX = enemy.x + dx;
    enemy.swingTargetY = enemy.y + dy;
    const swingX = enemy.x + (dx / distance) * enemy.swingRange;
    const swingY = enemy.y + (dy / distance) * enemy.swingRange;
    addTelegraphLine(enemy.x, enemy.y, swingX, swingY, enemy.swingWidth, enemy.chargeDuration);
  }
}
