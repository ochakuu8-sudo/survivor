import { TAU, COLLISION_CELL_SIZE } from "./constants.js";
import { game, enemyCollisionGrid } from "./state.js";
import { angleDelta, clamp, distSq, distanceToSegmentSq, gridKey } from "./utils/math.js";
import { addEffect, addSparks } from "./effects.js";

export function damageEnemy(enemy, amount, impactX = enemy.x, impactY = enemy.y, sparkCount = 3, sparkSpeed = 90) {
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

export function damageEnemiesInRadius(x, y, radius, amount, edgeScale = 0.65) {
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

export function damageEnemiesInLine(x1, y1, x2, y2, halfWidth, amount, maxHits = Infinity, sparkCount = 2, sparkSpeed = 110) {
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

export function damageEnemiesInCone(x, y, angle, range, halfAngle, amount) {
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

export function findNearestEnemyFrom(x, y, range, blocked = new Set()) {
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

export function buildEnemyGrid() {
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

export function killEnemy(enemy) {
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

export function removeDeadEnemies() {
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

export function explodeBullet(bullet) {
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

export function updateEffects(dt) {
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
