import { COLLISION_CELL_SIZE } from "./constants.js";
import { game, enemyCollisionGrid } from "./state.js";
import { angleDelta, clamp, distSq, distanceToSegmentSq, gridKey } from "./utils/math.js";
import { addEffect, addSparks } from "./effects.js";
import { damagePlayer } from "./player.js";
import { dropGold } from "./gold.js";
import { createTreasureChestAt, shortestDungeonDistanceSq, wrapDungeonPoint } from "./dungeon.js";

export function damageEnemy(enemy, amount, impactX = enemy.x, impactY = enemy.y, sparkCount = 3, sparkSpeed = 90, source = null) {
  if (!enemy || enemy.dead) return false;
  const eliteBossScale = source?.eliteBossBonus && (enemy.elite || enemy.boss) ? 1 + source.eliteBossBonus : 1;
  const scaledAmount = amount * eliteBossScale;
  const crit = source?.critChance > 0 && Math.random() < source.critChance;
  const damage = crit ? scaledAmount * (source.critMultiplier || 1.75) : scaledAmount;
  enemy.hp -= damage;
  enemy.hit = 1;
  if (source?.freezeChance > 0 && Math.random() < source.freezeChance) {
    applyEnemySlow(enemy, source.freezeSlow || 0.62, source.freezeDuration || 1.6);
    addEffect({
      type: "burst",
      x: enemy.x,
      y: enemy.y,
      radius: enemy.radius * 1.5,
      life: 0.2,
      maxLife: 0.2,
      glow: "glowCyan",
      tint: [0.52, 0.9, 1],
    });
  }
  if (crit) {
    addEffect({
      type: "burst",
      x: impactX,
      y: impactY,
      radius: enemy.radius * 1.8,
      life: 0.18,
      maxLife: 0.18,
      glow: "glowAmber",
      tint: [1, 0.92, 0.35],
    });
  }
  if (sparkCount > 0) addSparks(impactX, impactY, sparkCount + (crit ? 2 : 0), sparkSpeed + (crit ? 60 : 0));
  if (enemy.hp <= 0) {
    killEnemy(enemy, source);
    return true;
  }
  return false;
}

export function applyEnemySlow(enemy, multiplier = 0.62, duration = 1.6) {
  if (!enemy || enemy.dead) return;
  enemy.slowTimer = Math.max(enemy.slowTimer || 0, duration);
  enemy.slowMultiplier = Math.min(enemy.slowMultiplier || 1, multiplier);
}

export function damageEnemiesInRadius(x, y, radius, amount, edgeScale = 0.65, source = null) {
  let hits = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = Math.sqrt(shortestDungeonDistanceSq(game.dungeon, x, y, enemy.x, enemy.y));
    if (distance > radius + enemy.radius) continue;
    const centerFactor = 1 - clamp((distance - enemy.radius) / Math.max(1, radius), 0, 1);
    const damage = amount * (edgeScale + (1 - edgeScale) * centerFactor);
    damageEnemy(enemy, damage, enemy.x, enemy.y, 2, 80, source);
    hits += 1;
  }
  if (hits > 0) removeDeadEnemies();
  return hits;
}

export function damageEnemiesInLine(x1, y1, x2, y2, halfWidth, amount, maxHits = Infinity, sparkCount = 2, sparkSpeed = 110, source = null) {
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
    damageEnemy(hit.enemy, amount * falloff, hit.enemy.x, hit.enemy.y, sparkCount, sparkSpeed, source);
  }
  if (limit > 0) removeDeadEnemies();
  return limit;
}

export function damageEnemiesInCone(x, y, angle, range, halfAngle, amount, source = null) {
  let hits = 0;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance > range + enemy.radius) continue;
    if (Math.abs(angleDelta(Math.atan2(dy, dx), angle)) > halfAngle) continue;
    const nearFactor = 1 - clamp(distance / Math.max(1, range), 0, 1);
    damageEnemy(enemy, amount * (0.78 + nearFactor * 0.32), enemy.x, enemy.y, 2, 85, source);
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
    const distance = shortestDungeonDistanceSq(game.dungeon, x, y, enemy.x, enemy.y);
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

export function killEnemy(enemy, source = null) {
  if (!enemy || enemy.dead) return;
  enemy.dead = true;
  game.totalKills += 1;
  game.waveKills += 1;
  dropGold(enemy);
  healPlayerFromKill(source);
  if ((enemy.elite || enemy.boss) && !enemy.noDeathChest) createTreasureChestAt(enemy.x, enemy.y, enemy.boss ? "ボス宝箱" : "エリート宝箱");
  if (enemy.radius > 22) {
    addSparks(enemy.x, enemy.y, 6, 110);
    game.shake = Math.max(game.shake, 4);
  }
}

function healPlayerFromKill(source) {
  const heal = Math.max(0, Math.round(source?.lifeStealPerKill || 0));
  const player = game.player;
  if (!player || heal <= 0 || player.hp >= player.maxHp) return;
  const before = player.hp;
  player.hp = clamp(player.hp + heal, 0, player.maxHp);
  if (player.hp <= before) return;
  addEffect({
    type: "burst",
    x: player.x,
    y: player.y,
    radius: 24,
    life: 0.2,
    maxLife: 0.2,
    glow: "glowCyan",
    tint: [0.55, 1, 0.62],
  });
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
  addSparks(bullet.x, bullet.y, 9, 150, bullet.visualForm === "meteor" ? "spark" : "spark");

  let hits = 0;
  const amount = bullet.explosionDamage || bullet.damage;
  const edgeScale = bullet.visualForm === "meteor" ? 0.38 : 0.58;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = Math.sqrt(shortestDungeonDistanceSq(game.dungeon, bullet.x, bullet.y, enemy.x, enemy.y));
    if (distance > radius + enemy.radius) continue;
    const centerFactor = 1 - clamp((distance - enemy.radius) / Math.max(1, radius), 0, 1);
    const damage = bullet.visualForm === "meteor"
      ? amount * (0.6 + centerFactor)
      : amount * (edgeScale + (1 - edgeScale) * centerFactor);
    const killed = damageEnemy(enemy, damage, enemy.x, enemy.y, 2, 80, bullet);
    hits += 1;
    if (killed && bullet.chainShatterChance > 0 && Math.random() < bullet.chainShatterChance) {
      addEffect({
        type: "burst",
        x: enemy.x,
        y: enemy.y,
        radius: radius * (bullet.chainShatterRadiusScale || 0.6),
        life: 0.28,
        maxLife: 0.28,
        glow: bullet.effectGlow || "glowAmber",
        tint: bullet.effectTint || [0.72, 0.48, 0.28],
      });
      damageEnemiesInRadius(
        enemy.x,
        enemy.y,
        radius * (bullet.chainShatterRadiusScale || 0.6),
        amount * (bullet.chainShatterDamageScale || 0.45),
        0.55,
        { ...bullet, chainShatterChance: 0 },
      );
    }
  }
  if (hits > 0) removeDeadEnemies();
  game.shake = Math.max(game.shake, bullet.visualForm === "meteor" ? 8 : 5);
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
          effect,
        );
        effect.tickTimer += tickInterval;
      }
    } else if (effect.type === "delayedStone") {
      const target = effect.target && !effect.target.dead ? effect.target : game.enemies.find((enemy) => enemy.id === effect.targetId && !enemy.dead);
      if (target) {
        effect.x = target.x;
        effect.y = target.y;
      }
      if (effect.life <= 0 && target) {
        damageEnemy(target, effect.damage || 1, target.x, target.y, 5, 130, effect);
        kept.push({
          type: "burst",
          x: target.x,
          y: target.y,
          radius: effect.radius || Math.max(24, target.radius * 1.5),
          life: 0.22,
          maxLife: 0.22,
          glow: effect.glow || "glowAmber",
          tint: effect.tint || [1, 0.86, 0.42],
        });
      }
    } else if (effect.type === "poisonPool" && effect.life > 0) {
      const tickRate = effect.tickRate || 3;
      const tickInterval = 1 / tickRate;
      effect.tickTimer = (effect.tickTimer ?? 0) - dt;
      while (effect.tickTimer <= 0) {
        damageEnemiesInRadius(
          effect.x,
          effect.y,
          effect.radius || 90,
          (effect.damage || 1) / tickRate,
          0.82,
          effect,
        );
        effect.tickTimer += tickInterval;
      }
    }
    if (effect.life > 0) kept.push(effect);
  }
  game.effects = kept;
}

export function updateEnemyProjectiles(dt) {
  const p = game.player;
  if (!p) return;
  const next = [];
  for (const proj of game.enemyProjectiles) {
    proj.life -= dt;
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    wrapDungeonPoint(game.dungeon, proj);
    if (proj.life <= 0) continue;
    const reach = (proj.radius || 8) + p.radius;
    if (shortestDungeonDistanceSq(game.dungeon, p.x, p.y, proj.x, proj.y) <= reach * reach) {
      damagePlayer(proj.damage);
      addEffect({
        type: "burst",
        x: proj.x,
        y: proj.y,
        radius: 16,
        life: 0.18,
        maxLife: 0.18,
        glow: "glowAmber",
        tint: [1, 0.7, 0.32],
      });
      addSparks(proj.x, proj.y, 4, 130);
      continue;
    }
    next.push(proj);
  }
  game.enemyProjectiles = next;
}
