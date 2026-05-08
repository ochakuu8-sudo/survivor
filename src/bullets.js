import { COLLISION_CELL_SIZE } from "./constants.js";
import { game } from "./state.js";
import { distSq, gridKey } from "./utils/math.js";
import { buildEnemyGrid, damageEnemy, explodeBullet, findNearestEnemyFrom, removeDeadEnemies } from "./combat.js";

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
          damageEnemy(enemy, bullet.damage, bullet.x, bullet.y, 3, 90);
          if (bullet.explosionRadius > 0) {
            explodeBullet(bullet);
            if (bullet.ricochet > 0 && redirectRicochet(bullet)) {
              bullet.ricochet -= 1;
              bullet.pierce = 0;
              break nearbyCells;
            }
            keep = false;
            break nearbyCells;
          }
          bullet.pierce -= 1;
          if (bullet.pierce < 0) {
            if (bullet.ricochet > 0 && redirectRicochet(bullet)) {
              bullet.ricochet -= 1;
              bullet.pierce = 0;
              break nearbyCells;
            }
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

function redirectRicochet(bullet) {
  const primary = findNearestEnemyFrom(bullet.x, bullet.y, 360, bullet.hitIds);
  if (!primary) return false;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const dxP = primary.x - bullet.x;
  const dyP = primary.y - bullet.y;
  const lenP = Math.hypot(dxP, dyP) || 1;
  bullet.vx = (dxP / lenP) * speed;
  bullet.vy = (dyP / lenP) * speed;
  bullet.angle = Math.atan2(bullet.vy, bullet.vx);

  if (bullet.splitOnRicochet) {
    const blocked = new Set(bullet.hitIds);
    blocked.add(primary.id);
    let secondary = findNearestEnemyFrom(bullet.x, bullet.y, 360, blocked);
    if (!secondary) secondary = primary;
    const dxS = secondary.x - bullet.x;
    const dyS = secondary.y - bullet.y;
    const lenS = Math.hypot(dxS, dyS) || 1;
    game.bullets.push({
      ...bullet,
      vx: (dxS / lenS) * speed,
      vy: (dyS / lenS) * speed,
      angle: Math.atan2(dyS, dxS),
      ricochet: Math.max(0, bullet.ricochet - 1),
      hitIds: new Set(bullet.hitIds),
      spinSeed: Math.random() * (Math.PI * 2),
      spinRate: 5 + Math.random() * 4,
    });
  }
  return true;
}
