import { COLLISION_CELL_SIZE } from "./constants.js";
import { game } from "./state.js";
import { distSq, gridKey } from "./utils/math.js";
import { buildEnemyGrid, damageEnemy, explodeBullet, removeDeadEnemies } from "./combat.js";
import { addEffect, addSparks } from "./effects.js";
import { canStandAt, shortestDungeonDelta, shortestDungeonDistanceSq, wrapDungeonPoint } from "./dungeon.js";

function addPoisonPool(bullet) {
  addEffect({
    type: "poisonPool",
    x: bullet.x,
    y: bullet.y,
    radius: bullet.areaRadius || 96,
    damage: bullet.poolDamage || bullet.damage || 1,
    tickRate: bullet.tickRate || 3,
    tickTimer: 0,
    critChance: bullet.critChance || 0,
    critMultiplier: bullet.critMultiplier || 1.75,
    freezeChance: bullet.freezeChance || 0,
    freezeSlow: bullet.freezeSlow || 0.82,
    freezeDuration: bullet.freezeDuration || 0.65,
    lifeStealPerKill: bullet.lifeStealPerKill || 0,
    life: bullet.duration || 4,
    maxLife: bullet.duration || 4,
    glow: bullet.effectGlow || "glowCyan",
    tint: bullet.effectTint || [0.38, 1, 0.42],
  });
  addSparks(bullet.x, bullet.y, 5, 90, "spark");
}

export function updateBullets(dt) {
  const enemyGrid = buildEnemyGrid();
  const next = [];
  const spawnCounts = new Map();
  for (const bullet of game.bullets) {
    const previousLife = bullet.life;
    bullet.life -= dt;
    bullet.age = (bullet.age || 0) + dt;
    if (bullet.kind === "satelliteStone" && bullet.satelliteOrbit) {
      const orbit = bullet.satelliteOrbit;
      const orbitAngle = orbit.phase + bullet.age * orbit.speed;
      bullet.x = game.player.x + Math.cos(orbitAngle) * orbit.radius;
      bullet.y = game.player.y + Math.sin(orbitAngle) * orbit.radius * 0.72;
      bullet.vx = -Math.sin(orbitAngle) * orbit.radius * orbit.speed;
      bullet.vy = Math.cos(orbitAngle) * orbit.radius * 0.72 * orbit.speed;
      bullet.angle = orbitAngle + Math.PI / 2;
    } else if (bullet.kind === "boomerang" && bullet.age >= (bullet.returnTime || 0.9)) {
      const dx = game.player.x - bullet.x;
      const dy = game.player.y - bullet.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(bullet.vx, bullet.vy) || 520;
      bullet.vx = (dx / len) * speed;
      bullet.vy = (dy / len) * speed;
      bullet.angle = Math.atan2(dy, dx);
      if (len <= game.player.radius + bullet.radius + 8 && previousLife < (bullet.maxLife || 1) - 0.12) continue;
    }
    const previousX = bullet.x;
    const previousY = bullet.y;
    if (bullet.kind !== "satelliteStone") {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    if (bullet.flightGrowth) applyFlightGrowth(bullet, dt);
    if (bullet.damageTrail && bullet.kind !== "satelliteStone") addDamageTrailSegment(bullet, previousX, previousY);
    if (game.dungeon && bullet.wallBounceCount > 0 && bullet.kind !== "satelliteStone" && !canStandAt(game.dungeon, bullet.x, bullet.y, bullet.radius * 0.55)) {
      reflectBulletFromDungeon(bullet, previousX, previousY);
    }
    if (bullet.kind === "timedBomb") {
      bullet.vx *= Math.pow(0.08, dt);
      bullet.vy *= Math.pow(0.08, dt);
    }
    addBulletTrail(bullet, dt);
    wrapDungeonPoint(game.dungeon, bullet);
    if (bullet.life <= 0) {
      if (bullet.kind === "pulseBomb") continue;
      if (bullet.kind === "poisonBottle") addPoisonPool(bullet);
      else {
        deployStoneHazard(bullet);
        if (bullet.explosionRadius > 0) explodeBullet(bullet);
      }
      continue;
    }
    if (bullet.kind === "mine") {
      const armed = (bullet.maxLife || 0) - bullet.life >= (bullet.armingTime || 0.35);
      let triggered = false;
      if (armed) {
        const triggerRadius = bullet.radius + 18;
        for (const enemy of game.enemies) {
          if (enemy.dead) continue;
          const range = enemy.radius + triggerRadius;
          if (shortestDungeonDistanceSq(game.dungeon, bullet.x, bullet.y, enemy.x, enemy.y) <= range * range) {
            triggered = true;
            break;
          }
        }
      }
      if (triggered) {
        explodeBullet(bullet);
        continue;
      }
      next.push(bullet);
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

    const originId = bullet.originId || bullet.id || `${bullet.x}:${bullet.y}`;
    spawnCounts.set(originId, Math.max(spawnCounts.get(originId) || 0, bullet.spawnedFromOrigin || 1));

    let keep = true;
    const bulletCellX = Math.floor(bullet.x / COLLISION_CELL_SIZE);
    const bulletCellY = Math.floor(bullet.y / COLLISION_CELL_SIZE);
    nearbyCells: for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const cell = enemyGrid.get(gridKey(bulletCellX + xOffset, bulletCellY + yOffset));
        if (!cell) continue;

        for (const enemy of cell) {
          if (enemy.dead) continue;
          if (enemy.id === bullet.lastHitId && !allowsRepeatHits(bullet)) continue;
          if (allowsRepeatHits(bullet) && bullet.hitCooldowns?.has(enemy.id)) continue;
          const range = enemy.radius + bullet.radius;
          if (distSq(bullet.x, bullet.y, enemy.x, enemy.y) > range * range) continue;

          bullet.hitIds.add(enemy.id);
          const killed = damageEnemy(enemy, bullet.damage, bullet.x, bullet.y, bullet.isMasterStone ? 6 : 3, bullet.isMasterStone ? 180 : 90, bullet);
          addStoneHitEffect(bullet, enemy, killed);
          applyStoneItemHitEffects(bullet, enemy);
          spawnHitShards(bullet, enemy, next, originId, spawnCounts);
          if (bullet.knockback > 0) {
            const moveSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
            enemy.x += (bullet.vx / moveSpeed) * bullet.knockback;
            enemy.y += (bullet.vy / moveSpeed) * bullet.knockback;
          }

          // 貫通が先、跳弾が後。貫通が残っている間は跳弾しない。
          if (bullet.kind === "poisonBottle") {
            addPoisonPool(bullet);
            keep = false;
            break nearbyCells;
          }

          if (allowsRepeatHits(bullet)) {
            bullet.hitCooldowns.set(enemy.id, bullet.kind === "rollingStone" ? 0.22 : 0.28);
            keep = true;
            break nearbyCells;
          }

          if ((bullet.pierce || 0) > 0) {
            bullet.pierce -= 1;
            bullet.lastHitId = enemy.id;
            keep = true;
            break nearbyCells;
          }

          if (bullet.explosionRadius > 0) {
            deployStoneHazard(bullet);
            explodeBullet(bullet);
            keep = false;
            break nearbyCells;
          }

          if ((bullet.ricochetCount || 0) > 0) {
            const splitCount = Math.max(1, Math.round(bullet.ricochetSplitCount || 1));
            const targets = findRicochetTargets(enemy.x, enemy.y, bullet.ricochetRange || 220, splitCount, bullet, enemy.id);
            if (targets.length > 0) {
              const speed = (Math.hypot(bullet.vx, bullet.vy) || 360) * (bullet.ricochetSpeedScale || 1);
              bullet.ricochetCount -= 1;
              applyElasticGrowth(bullet);
              spawnBounceShards(bullet, enemy, next, originId, spawnCounts);
              const canSplit = splitCount > 1 && reserveOriginSlots(originId, splitCount - 1, bullet.splitSpawnLimit || 10, spawnCounts) > 0;
              retargetRicochetBullet(bullet, targets[0], speed, enemy.id);
              if (canSplit) {
                for (let i = 1; i < targets.length; i += 1) {
                  const splitBullet = cloneSplitBullet(bullet, enemy.id);
                  retargetRicochetBullet(splitBullet, targets[i], speed, enemy.id);
                  next.push(splitBullet);
                }
              }
              targets.forEach((target) => addRicochetLine(enemy, target, bullet));
              keep = true;
              break nearbyCells;
            }
          }

          bullet.lastHitId = enemy.id;
          deployStoneHazard(bullet);
          keep = false;
          break nearbyCells;
        }
      }
    }
    if (allowsRepeatHits(bullet) && bullet.hitCooldowns) {
      for (const [id, cd] of bullet.hitCooldowns) {
        const nextCd = cd - dt;
        if (nextCd <= 0) bullet.hitCooldowns.delete(id);
        else bullet.hitCooldowns.set(id, nextCd);
      }
    }
    if (keep) next.push(bullet);
  }
  removeDeadEnemies();
  game.bullets = next;
}

function addBulletTrail(bullet, dt) {
  if (!bullet.trail || bullet.trail === "none" || dt <= 0) return;
  const tint = trailTint(bullet.trail, bullet.bulletTint);
  const len = Math.hypot(bullet.vx, bullet.vy) * dt * 1.8;
  if (len <= 4) return;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  addEffect({
    type: "line",
    x1: bullet.x - (bullet.vx / speed) * len,
    y1: bullet.y - (bullet.vy / speed) * len,
    x2: bullet.x,
    y2: bullet.y,
    width: Math.max(3, bullet.radius * 0.28),
    life: 0.08,
    maxLife: 0.08,
    tint,
    glow: bullet.bulletGlow,
  });
}

function allowsRepeatHits(bullet) {
  return bullet.kind === "boomerang" || bullet.kind === "rollingStone" || bullet.kind === "satelliteStone";
}

function addStoneHitEffect(bullet, enemy, killed) {
  const effect = bullet.hitEffect || "normal";
  const radius = effect === "heavy" ? bullet.radius * 2.2 : effect === "critical" ? bullet.radius * 2.6 : bullet.radius * 1.6;
  if (effect !== "normal") {
    addEffect({
      type: "burst",
      x: bullet.x,
      y: bullet.y,
      radius,
      life: 0.18,
      maxLife: 0.18,
      glow: bullet.bulletGlow,
      tint: bullet.bulletTint,
    });
  }
  if (bullet.isMasterStone) {
    addEffect({
      type: "line",
      x1: enemy.x,
      y1: enemy.y - enemy.radius * 1.8,
      x2: enemy.x,
      y2: enemy.y + enemy.radius * 1.8,
      width: Math.max(8, bullet.radius * 0.8),
      life: 0.2,
      maxLife: 0.2,
      tint: [1, 1, 1],
      glow: "glowCyan",
    });
  }
  if (killed && bullet.chainShatterChance > 0 && Math.random() < bullet.chainShatterChance) {
    const chain = {
      ...bullet,
      x: enemy.x,
      y: enemy.y,
      explosionRadius: (bullet.explosionRadius || 36) * (bullet.chainShatterRadiusScale || 0.6),
      explosionDamage: (bullet.explosionDamage || bullet.damage) * (bullet.chainShatterDamageScale || 0.45),
      chainShatterChance: 0,
    };
    explodeBullet(chain);
  }
}

function applyStoneItemHitEffects(bullet, enemy) {
  if ((bullet.burnDamage || 0) > 0) {
    addEffect({
      type: "poisonPool",
      x: enemy.x,
      y: enemy.y,
      radius: Math.max(34, enemy.radius * 1.6),
      damage: bullet.burnDamage,
      tickRate: 3,
      tickTimer: 0,
      life: 2.4,
      maxLife: 2.4,
      glow: "glowRed",
      tint: [1, 0.38, 0.12],
      lifeStealPerKill: bullet.lifeStealPerKill || 0,
    });
  }
  if (bullet.stuckStone) addDelayedStoneDamage(bullet, enemy);
  if ((bullet.pullStrength || 0) > 0) {
    const radius = 120 + Math.min(3, bullet.pullStrength) * 14;
    const strength = Math.min(8, bullet.pullStrength) * 6;
    for (const nearby of game.enemies) {
      if (nearby.dead || nearby.id === enemy.id) continue;
      const delta = shortestDungeonDelta(game.dungeon, nearby.x, nearby.y, enemy.x, enemy.y);
      const distance = Math.hypot(delta.dx, delta.dy);
      if (distance <= 1 || distance > radius + nearby.radius) continue;
      const pull = Math.min(strength, Math.max(0, distance - enemy.radius - nearby.radius - 8));
      nearby.x += (delta.dx / distance) * pull;
      nearby.y += (delta.dy / distance) * pull;
      wrapDungeonPoint(game.dungeon, nearby);
    }
    addEffect({
      type: "burst",
      x: enemy.x,
      y: enemy.y,
      radius: radius * 0.45,
      life: 0.16,
      maxLife: 0.16,
      glow: "glowCyan",
      tint: [0.6, 0.9, 1],
    });
  }
}

function addDelayedStoneDamage(bullet, enemy) {
  const config = bullet.stuckStone;
  addEffect({
    type: "delayedStone",
    target: enemy,
    targetId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    radius: Math.max(18, bullet.radius * 1.4),
    damage: bullet.damage * (config.damageScale || 0.5),
    critChance: bullet.critChance || 0,
    critMultiplier: bullet.critMultiplier || 1.75,
    eliteBossBonus: bullet.eliteBossBonus || 0,
    lifeStealPerKill: bullet.lifeStealPerKill || 0,
    life: config.delay || 1.6,
    maxLife: config.delay || 1.6,
    glow: bullet.bulletGlow || "glowAmber",
    tint: bullet.bulletTint || [1, 0.86, 0.42],
  });
}

function deployStoneHazard(bullet) {
  const config = bullet.deployStoneHazard;
  if (!config) return;
  const active = game.effects.filter((effect) => effect.type === "poisonPool" && effect.stoneHazard).length;
  if (active >= (config.maxActive || 14)) return;
  const duration = config.duration || 2.6;
  addEffect({
    type: "poisonPool",
    stoneHazard: true,
    x: bullet.x,
    y: bullet.y,
    radius: Math.max(26, bullet.radius * (config.radiusScale || 1.6)),
    damage: Math.max(1, bullet.damage * (config.damageScale || 0.22)),
    tickRate: 4,
    tickTimer: 0,
    critChance: bullet.critChance || 0,
    critMultiplier: bullet.critMultiplier || 1.75,
    freezeChance: bullet.freezeChance || 0,
    freezeSlow: bullet.freezeSlow || 0.72,
    freezeDuration: bullet.freezeDuration || 1,
    lifeStealPerKill: bullet.lifeStealPerKill || 0,
    life: duration,
    maxLife: duration,
    glow: bullet.effectGlow || "glowAmber",
    tint: bullet.effectTint || [0.78, 0.72, 0.62],
  });
}

function spawnHitShards(bullet, enemy, next, originId, spawnCounts) {
  const count = Math.min(6, Math.max(0, Math.round(bullet.hitShardCount || 0)) + (bullet.meteorFragments || 0));
  if (count <= 0) return;
  const reserved = reserveOriginSlots(originId, count, bullet.splitSpawnLimit || 10, spawnCounts);
  for (let i = 0; i < reserved; i += 1) {
    const angle = bullet.angle + (i - (reserved - 1) / 2) * 0.72 + (Math.random() - 0.5) * 0.22;
    next.push(createShardBullet(bullet, angle, enemy.id, bullet.meteorFragments ? 0.32 : 0.2));
  }
}

function spawnBounceShards(bullet, enemy, next, originId, spawnCounts) {
  const count = Math.max(0, Math.round(bullet.splitShardCount || 0));
  if (count <= 0) return;
  const reserved = reserveOriginSlots(originId, count, bullet.splitSpawnLimit || 10, spawnCounts);
  for (let i = 0; i < reserved; i += 1) {
    const angle = bullet.angle + Math.PI + (Math.random() - 0.5) * 1.4;
    next.push(createShardBullet(bullet, angle, enemy.id, 0.35));
  }
}

function createShardBullet(parent, angle, justHitId, damageScale) {
  const speed = Math.max(420, Math.hypot(parent.vx, parent.vy) * 1.15);
  return {
    ...parent,
    x: parent.x,
    y: parent.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: Math.max(4, parent.radius * 0.42),
    damage: parent.damage * damageScale,
    life: Math.min(parent.life, 0.34),
    maxLife: 0.34,
    pierce: 0,
    ricochetCount: 0,
    explosionRadius: 0,
    hitShardCount: 0,
    splitShardCount: 0,
    hitIds: new Set([justHitId]),
    lastHitId: justHitId,
    bulletSprite: "stoneSharp",
    trail: "yellow",
    bulletTint: parent.meteorFragments ? [1, 0.32, 0.22] : [0.92, 0.86, 0.72],
  };
}

function applyFlightGrowth(bullet, dt) {
  const growth = bullet.flightGrowth;
  const previousScale = bullet.flightGrowthScale || 1;
  const targetScale = Math.min(growth.maxScale || 1.8, 1 + (bullet.age || 0) * (growth.speedPerSecond || 0.4));
  if (targetScale > previousScale) {
    const ratio = targetScale / previousScale;
    bullet.vx *= ratio;
    bullet.vy *= ratio;
    bullet.flightGrowthScale = targetScale;
  }
  const damageScale = Math.min(growth.maxScale || 1.8, 1 + (bullet.age || 0) * (growth.damagePerSecond || 0.25));
  bullet.damage = (bullet.baseDamage || bullet.damage) * damageScale;
}

function addDamageTrailSegment(bullet, x1, y1) {
  if (Math.hypot(bullet.x - x1, bullet.y - y1) < 10) return;
  const config = bullet.damageTrail;
  const life = config.duration || 0.34;
  addEffect({
    type: "damageLine",
    x1,
    y1,
    x2: bullet.x,
    y2: bullet.y,
    width: Math.max(8, bullet.radius * (config.widthScale || 0.55)),
    damage: Math.max(1, bullet.damage * (config.damageScale || 0.18)),
    tickRate: 8,
    tickTimer: 0,
    maxHits: 8,
    critChance: bullet.critChance || 0,
    critMultiplier: bullet.critMultiplier || 1.75,
    eliteBossBonus: bullet.eliteBossBonus || 0,
    lifeStealPerKill: bullet.lifeStealPerKill || 0,
    life,
    maxLife: life,
    tint: bullet.effectTint || [1, 0.36, 0.12],
  });
}

function reflectBulletFromDungeon(bullet, previousX, previousY) {
  const canMoveX = !game.dungeon || canStandAt(game.dungeon, bullet.x, previousY, bullet.radius * 0.55);
  const canMoveY = !game.dungeon || canStandAt(game.dungeon, previousX, bullet.y, bullet.radius * 0.55);
  bullet.x = previousX;
  bullet.y = previousY;
  if (canMoveX && !canMoveY) bullet.vy *= -1;
  else if (!canMoveX && canMoveY) bullet.vx *= -1;
  else {
    bullet.vx *= -1;
    bullet.vy *= -1;
  }
  const scale = bullet.wallBounceSpeedScale || 1;
  bullet.vx *= scale;
  bullet.vy *= scale;
  bullet.angle = Math.atan2(bullet.vy, bullet.vx);
  bullet.wallBounceCount -= 1;
  bullet.life = Math.max(bullet.life, 0.18);
  addEffect({
    type: "burst",
    x: bullet.x,
    y: bullet.y,
    radius: Math.max(18, bullet.radius * 1.7),
    life: 0.14,
    maxLife: 0.14,
    glow: bullet.bulletGlow || "glowAmber",
    tint: bullet.bulletTint || [1, 0.78, 0.32],
  });
}

function applyElasticGrowth(bullet) {
  const growth = bullet.elasticGrowth;
  if (!growth) return;
  const count = Math.min((bullet.elasticGrowthCount || 0) + 1, growth.max || 3);
  if (count <= (bullet.elasticGrowthCount || 0)) return;
  bullet.elasticGrowthCount = count;
  bullet.radius *= 1 + (growth.size || 0.08);
  bullet.damage *= 1 + (growth.damage || 0.08);
}

function reserveOriginSlots(originId, requested, limit, spawnCounts) {
  const current = spawnCounts.get(originId) || 1;
  const allowed = Math.max(0, Math.min(requested, limit - current));
  if (allowed > 0) spawnCounts.set(originId, current + allowed);
  return allowed;
}

function cloneSplitBullet(bullet, justHitId) {
  return {
    ...bullet,
    damage: bullet.damage * 0.65,
    ricochetCount: Math.max(0, (bullet.ricochetCount || 0) - 1),
    hitIds: new Set(bullet.hitIds),
    lastHitId: justHitId,
    spawnedFromSplit: true,
    spawnedFromOrigin: (bullet.spawnedFromOrigin || 1) + 1,
  };
}

function findRicochetTargets(x, y, range, count, bullet, justHitId) {
  const rangeSq = range * range;
  const candidates = [];
  for (const enemy of game.enemies) {
    if (enemy.dead || enemy.id === justHitId || enemy.id === bullet.lastHitId) continue;
    const distance = shortestDungeonDistanceSq(game.dungeon, x, y, enemy.x, enemy.y);
    if (distance > rangeSq) continue;
    candidates.push({
      enemy,
      distance,
      alreadyHit: bullet.hitIds?.has(enemy.id) || false,
    });
  }

  candidates.sort((a, b) => {
    if (a.alreadyHit !== b.alreadyHit) return a.alreadyHit ? 1 : -1;
    return a.distance - b.distance;
  });

  return candidates.slice(0, count).map((candidate) => candidate.enemy);
}

function retargetRicochetBullet(bullet, target, speed, justHitId) {
  const delta = shortestDungeonDelta(game.dungeon, bullet.x, bullet.y, target.x, target.y);
  const dx = delta.dx;
  const dy = delta.dy;
  const len = Math.hypot(dx, dy) || 1;
  bullet.vx = (dx / len) * speed;
  bullet.vy = (dy / len) * speed;
  bullet.angle = Math.atan2(dy, dx);
  bullet.life = Math.max(bullet.life, 0.18);
  bullet.lastHitId = justHitId;
  if (!bullet.hitIds) bullet.hitIds = new Set();
}

function addRicochetLine(from, target, bullet) {
  addEffect({
    type: "line",
    x1: from.x,
    y1: from.y,
    x2: target.x,
    y2: target.y,
    width: Math.max(4, bullet.radius * 0.45),
    life: 0.16,
    maxLife: 0.16,
    glow: bullet.bulletGlow || "glowAmber",
    tint: trailTint(bullet.trail, bullet.bulletTint),
  });
}

function trailTint(trail, fallback = [1, 1, 1]) {
  if (trail === "yellow") return [1, 0.92, 0.25];
  if (trail === "orange") return [1, 0.58, 0.18];
  if (trail === "red") return [1, 0.22, 0.16];
  if (trail === "white") return [1, 1, 1];
  return fallback || [1, 1, 1];
}
