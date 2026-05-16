import { COLLISION_CELL_SIZE, ENEMY_SPEED_RAMP_SECONDS, TAU } from "./constants.js";
import { enemyCollisionGrid, game, nextEnemyId } from "./state.js";
import { distanceToSegmentSq, gridKey, normalize } from "./utils/math.js";
import { damagePlayer } from "./player.js";
import { addEffect, addSparks, addTelegraphLine } from "./effects.js";
import { viewSize, cameraZoom } from "./render.js";
import { moveActorWithDungeonCollision, pickDungeonSpawnPoint, shortestDungeonDelta } from "./dungeon.js";

const SPAWN_BATCH_INTERVAL_MIN = 2.4;
const SPAWN_BATCH_INTERVAL_MAX = 5.2;
const SPAWN_BATCH_SIZE_MIN = 2;
const SPAWN_BATCH_SIZE_MAX = 32;
const OPENING_ENEMY_COUNT = 10;
const MOBILE_SCREEN_ASPECT = 9 / 16;
const OFFSCREEN_SPAWN_MARGIN = 72;
const OFFSCREEN_SPAWN_NEAR_BAND = 360;
const SAFETY_ENEMY_CAP = 3000;
const ENEMY_PUSH_RADIUS_SCALE = 1.0;
const ENEMY_PUSH_STRENGTH = 0.42;
const ENEMY_PUSH_MAX_STEP = 5.5;

function runProgress(elapsed = game.floorElapsed || 0) {
  return Math.min(1, Math.max(0, elapsed / ENEMY_SPEED_RAMP_SECONDS));
}

export function enemyRunSpeedMultiplier(elapsed = game.floorElapsed || 0) {
  return 1 + runProgress(elapsed);
}

function enemyResidentSeconds(enemy) {
  return Math.max(0, (game.floorElapsed || 0) - (enemy.spawnedAt ?? game.floorElapsed ?? 0));
}

function mobileScreenWorldSize(view, zoom) {
  const visibleH = view.h / zoom;
  return {
    w: visibleH * MOBILE_SCREEN_ASPECT,
    h: visibleH,
  };
}

function pickEnemyTypeByTime(elapsed) {
  const roll = Math.random();

  if (elapsed < 30) return "walker";

  if (elapsed < 60) return roll < 0.25 ? "runner" : "walker";

  if (elapsed < 105) {
    if (roll < 0.22) return "runner";
    if (roll < 0.38) return "archer";
    return "walker";
  }

  if (elapsed < 180) {
    if (roll < 0.24) return "runner";
    if (roll < 0.42) return "archer";
    if (roll < 0.52) return "orc";
    return "walker";
  }

  if (elapsed < 255) {
    if (roll < 0.28) return "runner";
    if (roll < 0.48) return "archer";
    if (roll < 0.62) return "orc";
    return "walker";
  }

  if (roll < 0.35) return "runner";
  if (roll < 0.55) return "archer";
  if (roll < 0.72) return "orc";
  return "walker";
}

function enemySpawnRamp(elapsed = game.floorElapsed || 0) {
  return Math.min(1, Math.max(0, elapsed / ENEMY_SPEED_RAMP_SECONDS));
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
  const count = OPENING_ENEMY_COUNT;
  let spawned = 0;
  for (let attempts = 0; spawned < count && attempts < count * 6; attempts += 1) {
    if (spawnEnemy("walker", { offscreen: true })) spawned += 1;
  }
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

export function spawnEnemy(forceType, options = {}) {
  if (game.enemies.length >= SAFETY_ENEMY_CAP) return null;

  const view = viewSize();
  const zoom = cameraZoom(view);
  const spawnScreen = mobileScreenWorldSize(view, zoom);
  const visibleW = spawnScreen.w;
  const visibleH = spawnScreen.h;
  const margin = OFFSCREEN_SPAWN_MARGIN;
  const nearMaxDistance = Math.hypot(visibleW, visibleH) * 0.5 + OFFSCREEN_SPAWN_NEAR_BAND;
  const camX = game.camera?.x ?? game.player.x;
  const camY = game.camera?.y ?? game.player.y;
  const requireOffscreen = options.offscreen !== false;
  const isOffscreen = (point) =>
    point.x < camX - visibleW / 2 - margin ||
    point.x > camX + visibleW / 2 + margin ||
    point.y < camY - visibleH / 2 - margin ||
    point.y > camY + visibleH / 2 + margin;

  let x = game.player.x;
  let y = game.player.y;
  const dungeonSpawn = pickDungeonSpawnPoint(
    camX,
    camY,
    requireOffscreen ? Math.min(visibleW, visibleH) * 0.5 : 0,
    requireOffscreen ? nearMaxDistance : Infinity,
    {
      fallbackToBest: true,
      fallbackMode: requireOffscreen ? "nearest" : "farthest",
      predicate: requireOffscreen ? isOffscreen : null,
    },
  );
  if (dungeonSpawn) {
    x = dungeonSpawn.x;
    y = dungeonSpawn.y;
  } else if (game.dungeon && requireOffscreen) {
    return null;
  } else {
    const side = Math.floor(Math.random() * 4);

    if (side === 0) {
      x = camX + (Math.random() - 0.5) * (visibleW + margin * 2);
      y = camY - visibleH / 2 - margin;
    } else if (side === 1) {
      x = camX + visibleW / 2 + margin;
      y = camY + (Math.random() - 0.5) * (visibleH + margin * 2);
    } else if (side === 2) {
      x = camX + (Math.random() - 0.5) * (visibleW + margin * 2);
      y = camY + visibleH / 2 + margin;
    } else {
      x = camX - visibleW / 2 - margin;
      y = camY + (Math.random() - 0.5) * (visibleH + margin * 2);
    }
  }

  const elapsed = game.floorElapsed || 0;
  let type = forceType || pickEnemyTypeByTime(elapsed);
  const progress = Math.min(1, Math.max(0, elapsed / ENEMY_SPEED_RAMP_SECONDS));

  const baseHp = Math.round((28 + progress * 34) * (options.boss ? 3.8 : options.elite ? 2.25 : 1));
  const enemy = {
    id: nextEnemyId(),
    kind: "melee",
    x,
    y,
    radius: 18,
    hp: baseHp,
    maxHp: baseHp,
    speed: 78 + progress * 16,
    attackDamage: Math.round(9 + progress * 4),
    attackCooldown: Math.max(0.74, 1.08 - progress * 0.18),
    attackTimer: 0,
    sprite: "zombieA",
    readableSprite: "zombieAReadable",
    hit: 0,
    wobble: Math.random() * TAU,
    spawnedAt: elapsed,
  };

  if (type === "runner") {
    enemy.radius = 16;
    enemy.hp = Math.round(baseHp * 0.72);
    enemy.maxHp = enemy.hp;
    enemy.speed = 122 + progress * 26;
    enemy.attackDamage = Math.round(7 + progress * 3);
    enemy.attackCooldown = Math.max(0.52, 0.76 - progress * 0.12);
    enemy.sprite = "zombieB";
    enemy.readableSprite = "zombieBReadable";
  } else if (type === "orc") {
    enemy.kind = "orc";
    enemy.radius = 27;
    enemy.hp = Math.round(baseHp * 2.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 58 + progress * 14;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "orc";
    enemy.readableSprite = "orcReadable";
    enemy.orcState = "idle";
    enemy.chargeTimer = 0;
    enemy.chargeDuration = Math.max(0.7, 0.95 - progress * 0.22);
    enemy.chargeCooldown = 1.6;
    enemy.chargeCooldownLeft = 0.6 + Math.random() * 0.6;
    enemy.attackRange = 130;
    enemy.swingRange = 150;
    enemy.swingWidth = 110;
    enemy.swingTargetX = 0;
    enemy.swingTargetY = 0;
    enemy.slamDamage = Math.round(28 + progress * 8);
  } else if (type === "archer") {
    enemy.kind = "archer";
    enemy.radius = 17;
    enemy.hp = Math.round(baseHp * 0.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 92 + progress * 18;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "skeletonArcher";
    enemy.readableSprite = "skeletonArcherReadable";
    enemy.shotCooldown = 0.6 + Math.random() * 0.6;
    enemy.shotInterval = Math.max(1.4, 2.4 - progress * 0.75);
    enemy.shotDamage = Math.round(16 + progress * 5);
    enemy.shootRange = 320;
    enemy.preferredDistance = 220;
  }

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
  enemy.speed = enemy.baseSpeed * enemyRunSpeedMultiplier(0);
  game.enemies.push(enemy);
  return enemy;
}

export function updateEnemies(dt) {
  const p = game.player;
  for (const enemy of game.enemies) {
    if (enemy.baseSpeed == null) enemy.baseSpeed = enemy.speed;
    if ((enemy.slowTimer || 0) > 0) {
      enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    } else {
      enemy.slowMultiplier = 1;
    }
    enemy.speed = enemy.baseSpeed * enemyRunSpeedMultiplier(enemyResidentSeconds(enemy)) * (enemy.slowMultiplier || 1);
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    if (enemy.kind === "archer") {
      updateArcher(enemy, p, dt);
    } else if (enemy.kind === "orc") {
      updateOrc(enemy, p, dt);
    } else {
      updateMeleeEnemy(enemy, p, dt);
    }
  }

  resolveEnemySeparation();
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
    const speed = 360;
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
