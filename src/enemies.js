import { TAU } from "./constants.js";
import { game, nextEnemyId } from "./state.js";
import { distanceToSegmentSq, normalize } from "./utils/math.js";
import { damagePlayer } from "./player.js";
import { addEffect, addSparks, addTelegraphLine } from "./effects.js";
import { viewSize, cameraZoom } from "./render.js";
import { moveActorWithDungeonCollision, pickDungeonSpawnPoint } from "./dungeon.js";

const BASE_ENEMY_CAP = 65;
const ENEMY_CAP_PER_WAVE = 10;
const HARD_ENEMY_CAP = 220;
const MAX_SPAWNS_PER_FRAME = 3;
const FLOOR_SPEED_START = 0.48;
const FLOOR_SPEED_STEP_SECONDS = 12;
const FLOOR_SPEED_STEP_GAIN = 0.2;
const FLOOR_SPEED_MAX = 1.85;
const FLOOR_SPAWN_BASE_PRESSURE = 0.45;
const FLOOR_SPAWN_STEP_SECONDS = 12;
const FLOOR_SPAWN_STEP_GAIN = 0.2;
const FLOOR_HEALTH_STEP_SECONDS = 60;
const FLOOR_HEALTH_STEP_GAIN = 0.5;

export function enemyFloorSpeedMultiplier(elapsed = game.floorElapsed || 0) {
  return Math.min(FLOOR_SPEED_MAX, FLOOR_SPEED_START * enemyFloorStepMultiplier(elapsed, FLOOR_SPEED_STEP_SECONDS, FLOOR_SPEED_STEP_GAIN));
}

export function enemyFloorSpawnPressure(elapsed = game.floorElapsed || 0) {
  return FLOOR_SPAWN_BASE_PRESSURE * enemyFloorStepMultiplier(elapsed, FLOOR_SPAWN_STEP_SECONDS, FLOOR_SPAWN_STEP_GAIN);
}

export function enemyFloorHealthMultiplier(elapsed = game.floorElapsed || 0) {
  return 1 + floorStep(elapsed, FLOOR_HEALTH_STEP_SECONDS) * FLOOR_HEALTH_STEP_GAIN;
}

function floorStep(elapsed, seconds) {
  return Math.floor(Math.max(0, elapsed) / seconds);
}

function enemyFloorStepMultiplier(elapsed, seconds, gain) {
  return 1 + floorStep(elapsed, seconds) * gain;
}

function enemyCapForWave(elapsed = game.floorElapsed || 0) {
  const baseCap = BASE_ENEMY_CAP + game.wave * ENEMY_CAP_PER_WAVE;
  const pressure = enemyFloorSpawnPressure(elapsed);
  return Math.min(HARD_ENEMY_CAP, Math.max(8 + game.wave * 2, Math.ceil(baseCap * pressure)));
}

function spawnIntervalForWave(elapsed = game.floorElapsed || 0) {
  const baseInterval = Math.max(0.16, 0.72 - (game.wave - 1) * 0.045);
  return Math.max(0.11, baseInterval / enemyFloorSpawnPressure(elapsed));
}

export function spawnEnemies(dt) {
  const elapsed = game.floorElapsed || 0;
  const cap = enemyCapForWave(elapsed);
  const interval = spawnIntervalForWave(elapsed);

  if (game.enemies.length >= cap) {
    game.spawnClock = Math.min(game.spawnClock, interval * 0.5);
    return;
  }

  game.spawnClock -= dt;
  let spawned = 0;
  while (game.spawnClock <= 0 && game.enemies.length < cap && spawned < MAX_SPAWNS_PER_FRAME) {
    spawnEnemy();
    game.spawnClock += interval * (0.75 + Math.random() * 0.65);
    spawned += 1;
  }

  if (spawned >= MAX_SPAWNS_PER_FRAME && game.spawnClock <= 0) {
    game.spawnClock = interval * 0.5;
  }
}

export function spawnEnemy(forceType) {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const margin = 95;
  let x = game.player.x;
  let y = game.player.y;
  const dungeonSpawn = pickDungeonSpawnPoint(
    game.player.x,
    game.player.y,
    Math.min(visibleW, visibleH) * 0.48,
    Math.max(visibleW, visibleH) * 1.15 + margin,
  );
  if (dungeonSpawn) {
    x = dungeonSpawn.x;
    y = dungeonSpawn.y;
  } else {
    const side = Math.floor(Math.random() * 4);

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
  }

  const roll = Math.random();
  const wave = game.wave;
  let type = forceType || "walker";
  if (!forceType) {
    if (wave >= 3 && roll < 0.12) type = "orc";
    else if (wave >= 2 && roll < 0.34) type = "runner";
    else if (wave >= 2 && roll < 0.48) type = "archer";
  }

  const baseHp = 28 + wave * 8;
  const enemy = {
    id: nextEnemyId(),
    kind: "melee",
    x,
    y,
    radius: 18,
    hp: baseHp,
    maxHp: baseHp,
    speed: 78 + wave * 3,
    attackDamage: Math.round(9 + wave * 0.8),
    attackCooldown: Math.max(0.74, 1.08 - wave * 0.012),
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
    enemy.speed = 122 + wave * 4;
    enemy.attackDamage = Math.round(7 + wave * 0.65);
    enemy.attackCooldown = Math.max(0.52, 0.76 - wave * 0.008);
    enemy.sprite = "zombieB";
    enemy.readableSprite = "zombieBReadable";
  } else if (type === "orc") {
    enemy.kind = "orc";
    enemy.radius = 27;
    enemy.hp = Math.round(baseHp * 2.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 58 + wave * 2.4;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "orc";
    enemy.readableSprite = "orcReadable";
    enemy.orcState = "idle";
    enemy.chargeTimer = 0;
    enemy.chargeDuration = Math.max(0.7, 0.95 - wave * 0.02);
    enemy.chargeCooldown = 1.6;
    enemy.chargeCooldownLeft = 0.6 + Math.random() * 0.6;
    enemy.attackRange = 130;
    enemy.swingRange = 150;
    enemy.swingWidth = 110;
    enemy.swingTargetX = 0;
    enemy.swingTargetY = 0;
    enemy.slamDamage = Math.round(28 + wave * 1.5);
  } else if (type === "archer") {
    enemy.kind = "archer";
    enemy.radius = 17;
    enemy.hp = Math.round(baseHp * 0.85);
    enemy.maxHp = enemy.hp;
    enemy.speed = 92 + wave * 2.4;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.sprite = "skeletonArcher";
    enemy.readableSprite = "skeletonArcherReadable";
    enemy.shotCooldown = 0.6 + Math.random() * 0.6;
    enemy.shotInterval = Math.max(1.4, 2.4 - wave * 0.05);
    enemy.shotDamage = Math.round(16 + wave * 1.4);
    enemy.shootRange = 320;
    enemy.preferredDistance = 220;
  }

  applyEnemyHealthMultiplier(enemy, enemyFloorHealthMultiplier());
  enemy.baseSpeed = enemy.speed;
  enemy.speed = enemy.baseSpeed * enemyFloorSpeedMultiplier();
  game.enemies.push(enemy);
}

export function updateEnemies(dt) {
  const p = game.player;
  const floorSpeed = enemyFloorSpeedMultiplier();
  const floorHealth = enemyFloorHealthMultiplier();
  for (const enemy of game.enemies) {
    if (enemy.baseSpeed == null) enemy.baseSpeed = enemy.speed;
    enemy.speed = enemy.baseSpeed * floorSpeed;
    applyEnemyHealthMultiplier(enemy, floorHealth);
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    if (enemy.kind === "archer") {
      updateArcher(enemy, p, dt);
    } else if (enemy.kind === "orc") {
      updateOrc(enemy, p, dt);
    } else {
      updateMeleeEnemy(enemy, p, dt);
    }
  }
}

function applyEnemyHealthMultiplier(enemy, multiplier) {
  const previousMaxHp = Math.max(1, enemy.maxHp || enemy.hp || 1);
  if (enemy.baseMaxHp == null) enemy.baseMaxHp = previousMaxHp;
  if (enemy.healthMultiplier === multiplier) return;

  const healthRatio = Math.max(0, enemy.hp || 0) / previousMaxHp;
  enemy.maxHp = Math.max(1, Math.round(enemy.baseMaxHp * multiplier));
  enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * healthRatio));
  enemy.healthMultiplier = multiplier;
}

function updateMeleeEnemy(enemy, p, dt) {
  enemy.attackTimer = Math.max(0, (enemy.attackTimer ?? 0) - dt);
  if (enemy.attackTimer < 0.0001) enemy.attackTimer = 0;
  const dir = normalize(p.x - enemy.x, p.y - enemy.y);
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

  const dx = p.x - enemy.x;
  const dy = p.y - enemy.y;
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

  const dx = p.x - enemy.x;
  const dy = p.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  if (distance > enemy.attackRange) {
    moveActorWithDungeonCollision(enemy, (dx / distance) * enemy.speed * dt, (dy / distance) * enemy.speed * dt);
  }

  if (enemy.chargeCooldownLeft <= 0 && distance <= enemy.attackRange) {
    enemy.orcState = "charging";
    enemy.chargeTimer = enemy.chargeDuration;
    enemy.swingTargetX = p.x;
    enemy.swingTargetY = p.y;
    const swingX = enemy.x + (dx / distance) * enemy.swingRange;
    const swingY = enemy.y + (dy / distance) * enemy.swingRange;
    addTelegraphLine(enemy.x, enemy.y, swingX, swingY, enemy.swingWidth, enemy.chargeDuration);
  }
}
