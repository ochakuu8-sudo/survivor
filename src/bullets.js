import { COLLISION_CELL_SIZE } from "./constants.js";
import { game } from "./state.js";
import { distSq, gridKey } from "./utils/math.js";
import { buildEnemyGrid, damageEnemy, explodeBullet, findNearestEnemyFrom, removeDeadEnemies } from "./combat.js";
import { addEffect } from "./effects.js";

export function updateBullets(dt) {
  const enemyGrid = buildEnemyGrid();
  const next = [];
  for (const bullet of game.bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.life <= 0) {
      if (bullet.kind === "pulseBomb") continue;
      if (bullet.explosionRadius > 0) explodeBullet(bullet);
      continue;
    }
    if (bullet.kind === "pulseBomb") {
      bullet.pulseTimer -= dt;
      while (bullet.pulseTimer <= 0) {
        explodeBullet(bullet);
        bullet.pulseTimer += bullet.pulseInterval;
      }
      next.push(bullet);
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
          damageEnemy(enemy, bullet.damage, bullet.x, bullet.y, 3, 90, bullet);
          if (bullet.knockback > 0) {
            const moveSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
            enemy.x += (bullet.vx / moveSpeed) * bullet.knockback;
            enemy.y += (bullet.vy / moveSpeed) * bullet.knockback;
          }
          if (bullet.explosionRadius > 0) {
            explodeBullet(bullet);
            keep = false;
            break nearbyCells;
          }
          if ((bullet.ricochetCount || 0) > 0) {
            const nextTarget = findNearestEnemyFrom(enemy.x, enemy.y, bullet.ricochetRange || 220, bullet.hitIds);
            if (nextTarget) {
              const dx = nextTarget.x - bullet.x;
              const dy = nextTarget.y - bullet.y;
              const len = Math.hypot(dx, dy) || 1;
              const speed = Math.hypot(bullet.vx, bullet.vy) || 360;
              bullet.vx = (dx / len) * speed;
              bullet.vy = (dy / len) * speed;
              bullet.angle = Math.atan2(dy, dx);
              bullet.life = Math.max(bullet.life, 0.18);
              bullet.ricochetCount -= 1;
              addEffect({
                type: "line",
                x1: enemy.x,
                y1: enemy.y,
                x2: nextTarget.x,
                y2: nextTarget.y,
                width: Math.max(4, bullet.radius * 0.45),
                life: 0.16,
                maxLife: 0.16,
                glow: bullet.bulletGlow || "glowAmber",
                tint: bullet.bulletTint || [1, 1, 1],
              });
              keep = true;
              break nearbyCells;
            }
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
