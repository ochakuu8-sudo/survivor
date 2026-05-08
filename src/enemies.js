import { TAU } from "./constants.js";
import { game, nextEnemyId } from "./state.js";
import { normalize } from "./utils/math.js";
import { damagePlayer } from "./player.js";
import { addEffect, addSparks } from "./effects.js";
import { viewSize, cameraZoom } from "./render.js";

export function spawnEnemies(dt) {
  if (game.enemies.length > 75 + game.wave * 9) return;

  const interval = Math.max(0.16, 0.7 - game.wave * 0.045);
  game.spawnClock -= dt;
  while (game.spawnClock <= 0) {
    spawnEnemy();
    game.spawnClock += interval * (0.75 + Math.random() * 0.65);
  }
}

export function spawnEnemy(forceType) {
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
  let type = forceType || "walker";
  if (!forceType) {
    if (wave >= 3 && roll < 0.12) type = "brute";
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
    value: 2 + Math.floor(wave / 2),
    sprite: "zombieA",
    readableSprite: "zombieAReadable",
    hit: 0,
    wobble: Math.random() * TAU,
  };

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
  } else if (type === "archer") {
    enemy.kind = "archer";
    enemy.radius = 17;
    enemy.hp = baseHp * 0.85;
    enemy.maxHp = enemy.hp;
    enemy.speed = 92 + wave * 2.4;
    enemy.attackDamage = 0;
    enemy.attackCooldown = 9999;
    enemy.value = 3 + Math.floor(wave / 2);
    enemy.sprite = "skeletonArcher";
    enemy.readableSprite = "skeletonArcherReadable";
    enemy.archerState = "idle";
    enemy.telegraphTimer = 0;
    enemy.telegraphDuration = Math.max(0.55, 0.9 - wave * 0.02);
    enemy.telegraphX = 0;
    enemy.telegraphY = 0;
    enemy.shotCooldown = 0.6 + Math.random() * 0.6;
    enemy.shotInterval = Math.max(1.4, 2.4 - wave * 0.05);
    enemy.shotDamage = Math.round(16 + wave * 1.4);
    enemy.shotRadius = 60;
    enemy.shootRange = 320;
    enemy.preferredDistance = 220;
  }

  game.enemies.push(enemy);
}

export function updateEnemies(dt) {
  const p = game.player;
  for (const enemy of game.enemies) {
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    if (enemy.kind === "archer") {
      updateArcher(enemy, p, dt);
    } else {
      updateMeleeEnemy(enemy, p, dt);
    }
  }
}

function updateMeleeEnemy(enemy, p, dt) {
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

function updateArcher(enemy, p, dt) {
  enemy.shotCooldown = Math.max(0, (enemy.shotCooldown ?? 0) - dt);

  const dx = p.x - enemy.x;
  const dy = p.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 0.0001;

  if (enemy.archerState === "telegraph") {
    enemy.telegraphTimer -= dt;
    if (enemy.telegraphTimer <= 0) {
      const aimX = enemy.telegraphX;
      const aimY = enemy.telegraphY;
      const lineDx = aimX - enemy.x;
      const lineDy = aimY - enemy.y;
      const lineLen = Math.hypot(lineDx, lineDy) || 0.0001;
      const speed = 360;
      const life = Math.max(0.6, lineLen / speed + 0.4);
      game.enemyProjectiles.push({
        x: enemy.x,
        y: enemy.y - 6,
        vx: (lineDx / lineLen) * speed,
        vy: (lineDy / lineLen) * speed,
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
      enemy.archerState = "idle";
      enemy.shotCooldown = enemy.shotInterval;
    }
    return;
  }

  if (distance > enemy.shootRange) {
    const speed = enemy.speed;
    enemy.x += (dx / distance) * speed * dt;
    enemy.y += (dy / distance) * speed * dt;
  } else if (distance < enemy.preferredDistance - 30) {
    const speed = enemy.speed * 0.65;
    enemy.x -= (dx / distance) * speed * dt;
    enemy.y -= (dy / distance) * speed * dt;
  }

  if (enemy.shotCooldown <= 0 && distance <= enemy.shootRange) {
    enemy.archerState = "telegraph";
    enemy.telegraphTimer = enemy.telegraphDuration;
    enemy.telegraphX = p.x;
    enemy.telegraphY = p.y;
    addEffect({
      type: "telegraphLine",
      x1: enemy.x,
      y1: enemy.y,
      x2: enemy.telegraphX,
      y2: enemy.telegraphY,
      width: 18,
      life: enemy.telegraphDuration,
      maxLife: enemy.telegraphDuration,
      tint: [1, 0.55, 0.18],
    });
  }
}
