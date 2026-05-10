import { TAU, WEAPON_STAT_KEYS } from "./constants.js";
import { game, nextWeaponId } from "./state.js";
import { distanceToSegmentSq, distSq } from "./utils/math.js";
import { addEffect, addSparks } from "./effects.js";
import {
  damageEnemy,
  damageEnemiesInCone,
  damageEnemiesInLine,
  damageEnemiesInRadius,
  findNearestEnemyFrom,
  removeDeadEnemies,
} from "./combat.js";

export function snapshotWeaponStats(weapon) {
  const stats = {};
  WEAPON_STAT_KEYS.forEach((key) => {
    const value = weapon[key];
    stats[key] = Array.isArray(value) ? [...value] : value;
  });
  return stats;
}

export function restoreWeaponBaseStats(weapon) {
  Object.entries(weapon.baseStats || snapshotWeaponStats(weapon)).forEach(([key, value]) => {
    weapon[key] = Array.isArray(value) ? [...value] : value;
  });
}

export function createWeapon(template) {
  const bulletSpeed = template.bulletSpeed ?? 690;
  const life = template.life || 0.72;
  const weapon = {
    id: nextWeaponId(),
    name: template.name,
    kind: template.kind || "projectile",
    damage: template.damage,
    fireRate: template.fireRate,
    bulletSpeed,
    projectiles: template.projectiles || 1,
    pierce: template.pierce || 0,
    knockback: template.knockback || 0,
    spread: template.spread ?? 0.18,
    life,
    range: template.range || bulletSpeed * life,
    cone: template.cone ?? 0.5,
    lineWidth: template.lineWidth || 18,
    explosionRadius: template.explosionRadius || 0,
    explosionDamage: template.explosionDamage || template.damage,
    chainCount: template.chainCount || 0,
    chainRange: template.chainRange || 170,
    duration: template.duration || 0,
    tickRate: template.tickRate || 0,
    fuse: template.fuse || life,
    areaRadius: template.areaRadius || 0,
    orbitRadius: template.orbitRadius || 0,
    orbitSpeed: template.orbitSpeed || 4.2,
    radius: template.radius || 9,
    jitter: template.jitter || 0,
    kick: template.kick || 1.8,
    bulletTint: template.bulletTint ? [...template.bulletTint] : [1, 1, 1],
    bulletGlow: template.bulletGlow || "glowAmber",
    effectTint: template.effectTint ? [...template.effectTint] : [1, 1, 1],
    effectGlow: template.effectGlow || "glowAmber",
    bulletSprite: template.bulletSprite || null,
    shootTimer: template.shootTimer ?? 0.45,
    attachments: [],
  };
  weapon.baseStats = snapshotWeaponStats(weapon);
  return weapon;
}

export function findWeapon(id) {
  return game.player.gear.weapons.find((weapon) => weapon.id === id) || null;
}

export function weaponKindLabel(weapon) {
  const labels = {
    projectile: "投射",
    flame: "火炎",
    laser: "レーザー",
    sustainedLaser: "設置レーザー",
    bomb: "爆発",
    timedBomb: "時限爆弾",
    chain: "電撃",
    orbit: "回転",
    sword: "斬撃",
  };
  return labels[weapon.kind] || "武器";
}

export function updateWeaponTimers(player, dt) {
  for (const weapon of player.gear.weapons) {
    weapon.shootTimer = Math.max(0, weapon.shootTimer - dt);
  }
}

export function boostWeaponImpact(weapon, amount) {
  weapon.damage += amount;
  if (weapon.explosionRadius > 0) weapon.explosionDamage += amount * 1.35;
}

export function extendWeaponReach(weapon, multiplier) {
  weapon.range *= multiplier;
  if (weapon.bulletSpeed > 1) {
    weapon.bulletSpeed *= multiplier;
    weapon.life *= 1 + (multiplier - 1) * 0.45;
  }
  if (weapon.kind === "sustainedLaser") weapon.duration *= 1 + (multiplier - 1) * 0.75;
  if (weapon.orbitRadius > 0) weapon.orbitRadius *= 1 + (multiplier - 1) * 0.65;
  if (weapon.kind === "chain") weapon.chainRange *= 1 + (multiplier - 1) * 0.7;
}

export function addWeaponPierce(weapon, amount = 1) {
  const rounded = Math.max(1, Math.round(amount));
  weapon.pierce += rounded;
  if (weapon.kind === "laser") weapon.lineWidth += 3 + rounded;
  if (weapon.kind === "sustainedLaser") weapon.lineWidth += 4 + rounded;
  if (weapon.kind === "flame") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "sword") weapon.cone = Math.min(1.05, weapon.cone + 0.06 + rounded * 0.015);
  if (weapon.kind === "chain") weapon.chainCount += rounded;
  if (weapon.explosionRadius > 0) weapon.explosionRadius += 12 + rounded * 6;
  if (weapon.areaRadius > 0) weapon.areaRadius += 8 + rounded * 4;
  if (weapon.kind === "projectile") weapon.radius += Math.max(1, Math.round(rounded * 0.65));
}

export function expandWeaponArea(weapon, power) {
  const areaBoost = 1 + 0.08 * power;
  if (weapon.explosionRadius > 0) weapon.explosionRadius *= areaBoost;
  if (weapon.areaRadius > 0) weapon.areaRadius *= areaBoost;
  if (weapon.kind === "laser" || weapon.kind === "sustainedLaser") weapon.lineWidth *= areaBoost;
  if (weapon.kind === "flame" || weapon.kind === "sword") weapon.cone = Math.min(1.08, weapon.cone + 0.05 * power);
  if (weapon.radius > 0) weapon.radius += power;
}

const TARGETLESS_KINDS = new Set(["flame", "sword"]);

export function autoShoot() {
  const p = game.player;

  for (const weapon of p.gear.weapons) {
    if (weapon.kind === "orbit") continue;
    if (weapon.shootTimer > 0) continue;

    let target = null;
    if (TARGETLESS_KINDS.has(weapon.kind)) {
      // Always fire on cooldown; direction comes from facing or self-position.
    } else {
      if (game.enemies.length === 0) continue;
      target = findTargetForWeapon(p, weapon);
      if (!target) continue;
    }

    fireWeapon(weapon, target);
    weapon.shootTimer = 1 / weapon.fireRate;
    game.shake = Math.max(game.shake, weapon.kick);
  }
}

export function updateOrbitWeapons(dt) {
  const p = game.player;
  if (!p?.gear) return;
  for (const weapon of p.gear.weapons) {
    if (weapon.kind !== "orbit") continue;

    const orbitSpeed = weapon.orbitSpeed || 4.2;
    const orbitRadius = weapon.orbitRadius || 78;
    const areaRadius = weapon.areaRadius || 34;

    const currSpin = game.elapsed * orbitSpeed + weapon.id * 1.73;
    const prevSpin = (game.elapsed - dt) * orbitSpeed + weapon.id * 1.73;
    const cx = p.x + Math.cos(currSpin) * orbitRadius;
    const cy = p.y + Math.sin(currSpin) * orbitRadius;
    const px = p.x + Math.cos(prevSpin) * orbitRadius;
    const py = p.y + Math.sin(prevSpin) * orbitRadius;

    if (!weapon.hitCooldowns) weapon.hitCooldowns = new Map();
    for (const [id, cd] of weapon.hitCooldowns) {
      const next = cd - dt;
      if (next <= 0) weapon.hitCooldowns.delete(id);
      else weapon.hitCooldowns.set(id, next);
    }

    const cooldownPerEnemy = 1 / Math.max(0.5, weapon.fireRate);
    const damage = weapon.damage + p.weaponPowerBonus;
    let hits = 0;

    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      if (weapon.hitCooldowns.has(enemy.id)) continue;
      const range = enemy.radius + areaRadius;
      if (distanceToSegmentSq(enemy.x, enemy.y, px, py, cx, cy) > range * range) continue;
      damageEnemy(enemy, damage, enemy.x, enemy.y, 2, 90);
      weapon.hitCooldowns.set(enemy.id, cooldownPerEnemy);
      hits += 1;
    }

    if (hits > 0) {
      addEffect({
        type: "burst",
        x: cx,
        y: cy,
        radius: areaRadius * 0.95,
        life: 0.2,
        maxLife: 0.2,
        glow: weapon.effectGlow,
        tint: weapon.effectTint,
      });
      game.shake = Math.max(game.shake, (weapon.kick || 1.5) * 0.5);
    }
  }
}

function findTargetForWeapon(player, weapon) {
  let best = null;
  let bestDistance = Math.pow(weapon.range || (weapon.bulletSpeed || 690) * (weapon.life || 0.72), 2);
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const distance = distSq(player.x, player.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function fireWeapon(weapon, target) {
  const p = game.player;
  const usesFacing = weapon.kind === "flame" || weapon.kind === "sword";
  const angle = usesFacing
    ? Math.atan2(p.facingY ?? 0, p.facingX ?? 1)
    : target
      ? Math.atan2(target.y - p.y, target.x - p.x)
      : 0;
  if (weapon.kind === "flame") {
    fireFlame(weapon, angle);
    return;
  }
  if (weapon.kind === "laser") {
    fireLaser(weapon, angle);
    return;
  }
  if (weapon.kind === "sustainedLaser") {
    fireSustainedLaser(weapon, angle);
    return;
  }
  if (weapon.kind === "timedBomb") {
    fireTimedBomb(weapon, angle);
    return;
  }
  if (weapon.kind === "pulseBomb") {
    firePulseBomb(weapon);
    return;
  }
  if (weapon.kind === "orbit") {
    fireOrbit(weapon);
    return;
  }
  if (weapon.kind === "sword") {
    fireSword(weapon, angle);
    return;
  }
  if (weapon.kind === "chain") {
    fireChain(weapon, target);
    return;
  }
  fireProjectileWeapon(weapon, angle);
}

function fireProjectileWeapon(weapon, angle) {
  const spread = weapon.projectiles === 1 ? 0 : weapon.spread;
  for (let i = 0; i < weapon.projectiles; i += 1) {
    const offset = (i - (weapon.projectiles - 1) / 2) * spread;
    const jitter = weapon.jitter > 0 ? (Math.random() - 0.5) * weapon.jitter : 0;
    fireBullet(angle + offset + jitter, weapon);
  }
}

function fireBullet(angle, weapon) {
  const p = game.player;
  const speed = weapon.bulletSpeed;
  const bonus = p.weaponPowerBonus;
  const tumbles = !!weapon.bulletSprite;
  game.bullets.push({
    kind: "projectile",
    x: p.x + Math.cos(angle) * 25,
    y: p.y + Math.sin(angle) * 25,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: weapon.radius,
    damage: weapon.damage + bonus,
    life: weapon.life,
    maxLife: weapon.life,
    pierce: weapon.pierce,
    knockback: weapon.knockback || 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + bonus,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    bulletSprite: weapon.bulletSprite || null,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    spinSeed: tumbles ? Math.random() * TAU : 0,
    spinRate: tumbles ? 1.8 + Math.random() * 1.6 : 0,
    hitIds: new Set(),
  });
  addSparks(p.x + Math.cos(angle) * 28, p.y + Math.sin(angle) * 28, 1, 40);
}

function fireFlame(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 20;
  const originY = p.y + Math.sin(angle) * 20;
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus);

  const baseTint = weapon.effectTint || [1, 0.42, 0.12];
  const glow = weapon.effectGlow || "glowRed";

  const billowCount = 16;
  for (let i = 0; i < billowCount; i += 1) {
    const t = (i + Math.random()) / billowCount;
    const distance = weapon.range * (0.08 + t * 0.86);
    const fan = (Math.random() - 0.5) * weapon.cone * 1.9;
    const flameAngle = angle + fan;
    const px = originX + Math.cos(flameAngle) * distance;
    const py = originY + Math.sin(flameAngle) * distance;
    const heat = 1 - t;

    let tint;
    if (heat > 0.7) {
      tint = [1, 0.95 - (1 - heat) * 0.4, 0.55 - (1 - heat) * 0.6];
    } else if (heat > 0.4) {
      tint = [1, 0.6 + heat * 0.22, 0.2];
    } else {
      tint = [baseTint[0] * 0.92, baseTint[1] * 0.65, baseTint[2] * 0.55];
    }

    const radius = 22 + heat * 16 + Math.random() * 14;
    const life = 0.18 + Math.random() * 0.14 + heat * 0.05;
    addEffect({
      type: "burst",
      x: px,
      y: py,
      radius,
      life,
      maxLife: life,
      glow,
      tint,
    });
  }

  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 22,
    y: originY + Math.sin(angle) * 22,
    radius: 44,
    life: 0.16,
    maxLife: 0.16,
    glow: "glowAmber",
    tint: [1, 0.94, 0.6],
  });
  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 10,
    y: originY + Math.sin(angle) * 10,
    radius: 30,
    life: 0.12,
    maxLife: 0.12,
    glow: "glowAmber",
    tint: [1, 1, 0.86],
  });

  const emberCount = 9;
  for (let i = 0; i < emberCount; i += 1) {
    const fan = (Math.random() - 0.5) * weapon.cone * 1.7;
    const dir = angle + fan;
    const speed = 180 + Math.random() * 200;
    const heatColor = Math.random();
    game.particles.push({
      x: originX + Math.cos(dir) * 8,
      y: originY + Math.sin(dir) * 8,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      life: 0.32 + Math.random() * 0.28,
      maxLife: 0.6,
      size: 10 + Math.random() * 10,
      sprite: "spark",
      tint: heatColor > 0.7 ? [1, 0.92, 0.5] : heatColor > 0.35 ? [1, 0.55, 0.18] : [0.85, 0.3, 0.1],
    });
  }
}

function fireLaser(weapon, angle) {
  const p = game.player;
  const startX = p.x + Math.cos(angle) * 26;
  const startY = p.y + Math.sin(angle) * 26;
  const endX = p.x + Math.cos(angle) * weapon.range;
  const endY = p.y + Math.sin(angle) * weapon.range;
  damageEnemiesInLine(startX, startY, endX, endY, weapon.lineWidth * 0.5, weapon.damage + p.weaponPowerBonus, weapon.pierce + 1);
  addEffect({
    type: "line",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: weapon.lineWidth,
    life: 0.32,
    maxLife: 0.32,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
  addEffect({
    type: "line",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: Math.max(5, weapon.lineWidth * 0.28),
    life: 0.26,
    maxLife: 0.26,
    glow: "white",
    tint: [1, 1, 1],
  });
}

function fireSustainedLaser(weapon, angle) {
  const p = game.player;
  const startX = p.x + Math.cos(angle) * 28;
  const startY = p.y + Math.sin(angle) * 28;
  const endX = startX + Math.cos(angle) * weapon.range;
  const endY = startY + Math.sin(angle) * weapon.range;
  const duration = Math.max(0.35, weapon.duration || 1.2);
  addEffect({
    type: "damageLine",
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width: weapon.lineWidth,
    damage: weapon.damage + p.weaponPowerBonus,
    tickRate: weapon.tickRate || 8,
    tickTimer: 0,
    maxHits: weapon.pierce + 1,
    life: duration,
    maxLife: duration,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
  addEffect({
    type: "burst",
    x: startX,
    y: startY,
    radius: weapon.lineWidth * 1.45,
    life: 0.2,
    maxLife: 0.2,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function fireTimedBomb(weapon, angle) {
  const p = game.player;
  const placeX = p.x + Math.cos(angle) * 18;
  const placeY = p.y + Math.sin(angle) * 18;
  const fuse = Math.max(0.45, weapon.fuse || weapon.life || 2);
  game.bullets.push({
    kind: "timedBomb",
    x: placeX,
    y: placeY,
    vx: 0,
    vy: 0,
    angle: game.elapsed,
    radius: weapon.radius,
    damage: 0,
    life: fuse,
    maxLife: fuse,
    pierce: 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + p.weaponPowerBonus,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    collides: false,
    hitIds: new Set(),
  });
  addEffect({
    type: "burst",
    x: placeX,
    y: placeY,
    radius: 24,
    life: 0.18,
    maxLife: 0.18,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function firePulseBomb(weapon) {
  const p = game.player;
  const bonus = p.weaponPowerBonus;
  const duration = Math.max(0.6, weapon.duration || 4.5);
  const pulseInterval = weapon.tickRate > 0 ? 1 / weapon.tickRate : 1.0;
  const fuse = Math.max(0, weapon.fuse ?? 0.4);
  game.bullets.push({
    kind: "pulseBomb",
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    angle: game.elapsed,
    radius: weapon.radius,
    damage: 0,
    life: duration,
    maxLife: duration,
    pulseTimer: fuse,
    pulseInterval,
    pierce: 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: (weapon.explosionDamage || 0) + bonus,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    collides: false,
    hitIds: new Set(),
  });
  addEffect({
    type: "burst",
    x: p.x,
    y: p.y,
    radius: 28,
    life: 0.2,
    maxLife: 0.2,
    glow: weapon.effectGlow,
    tint: weapon.effectTint,
  });
}

function fireOrbit(weapon) {
  const p = game.player;
  const spin = game.elapsed * (weapon.orbitSpeed || 4.2) + weapon.id * 1.73;
  const orbitRadius = weapon.orbitRadius || 78;
  const areaRadius = weapon.areaRadius || 34;
  const x = p.x + Math.cos(spin) * orbitRadius;
  const y = p.y + Math.sin(spin) * orbitRadius;
  const hits = damageEnemiesInRadius(x, y, areaRadius, weapon.damage + p.weaponPowerBonus, 0.72);
  if (hits > 0) {
    addEffect({
      type: "burst",
      x,
      y,
      radius: areaRadius * 0.9,
      life: 0.22,
      maxLife: 0.22,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
    addSparks(x, y, 3, 130);
  }
}

function fireSword(weapon, angle) {
  const p = game.player;
  const originX = p.x + Math.cos(angle) * 14;
  const originY = p.y + Math.sin(angle) * 14;
  damageEnemiesInCone(originX, originY, angle, weapon.range, weapon.cone, weapon.damage + p.weaponPowerBonus);

  const cone = weapon.cone;
  const baseTint = weapon.effectTint || [0.74, 0.96, 1];
  const glow = weapon.effectGlow || "glowCyan";
  const segments = 10;
  weapon.swingCount = (weapon.swingCount || 0) + 1;
  const swingDir = weapon.swingCount % 2 === 0 ? 1 : -1;

  const drawArc = (radius, width, life, tint, glowName, lifeStagger = 0) => {
    for (let i = 0; i < segments; i += 1) {
      const tA = i / segments - 0.5;
      const tB = (i + 1) / segments - 0.5;
      const arcA = angle + tA * cone * 2;
      const arcB = angle + tB * cone * 2;
      const lead = swingDir > 0 ? i : segments - 1 - i;
      addEffect({
        type: "line",
        x1: originX + Math.cos(arcA) * radius,
        y1: originY + Math.sin(arcA) * radius,
        x2: originX + Math.cos(arcB) * radius,
        y2: originY + Math.sin(arcB) * radius,
        width,
        life: life + lead * lifeStagger,
        maxLife: life + lead * lifeStagger,
        glow: glowName || glow,
        tint,
      });
    }
  };

  drawArc(weapon.range * 0.96, 20, 0.18, [baseTint[0] * 0.7, baseTint[1] * 0.85, baseTint[2] * 0.95], glow, 0.005);
  drawArc(weapon.range * 0.84, 11, 0.16, baseTint, glow, 0.006);
  drawArc(weapon.range * 0.72, 4, 0.12, [0.96, 1, 1], "glowCyan", 0.006);

  const leadingT = swingDir > 0 ? 0.5 : -0.5;
  const leadingAngle = angle + leadingT * cone * 2;
  const tipX = originX + Math.cos(leadingAngle) * weapon.range;
  const tipY = originY + Math.sin(leadingAngle) * weapon.range;

  addEffect({
    type: "line",
    x1: originX,
    y1: originY,
    x2: tipX,
    y2: tipY,
    width: 5,
    life: 0.1,
    maxLife: 0.1,
    glow: "glowCyan",
    tint: [1, 1, 1],
  });
  addEffect({
    type: "burst",
    x: tipX,
    y: tipY,
    radius: 22,
    life: 0.18,
    maxLife: 0.18,
    glow,
    tint: baseTint,
  });
  addEffect({
    type: "burst",
    x: originX,
    y: originY,
    radius: 18,
    life: 0.12,
    maxLife: 0.12,
    glow: "glowCyan",
    tint: [1, 1, 1],
  });
  addSparks(tipX, tipY, 4, 140);
}

function fireChain(weapon, target) {
  const p = game.player;
  const blocked = new Set();
  let fromX = p.x;
  let fromY = p.y;
  let enemy = target;
  let jumps = 0;
  const maxJumps = weapon.chainCount + 1;

  while (enemy && jumps < maxJumps) {
    const falloff = Math.max(0.62, 1 - jumps * 0.12);
    addEffect({
      type: "line",
      x1: fromX,
      y1: fromY,
      x2: enemy.x,
      y2: enemy.y,
      width: 18,
      life: 0.34,
      maxLife: 0.34,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
    damageEnemy(enemy, (weapon.damage + p.weaponPowerBonus) * falloff, enemy.x, enemy.y, 3, 120);
    blocked.add(enemy.id);
    fromX = enemy.x;
    fromY = enemy.y;
    enemy = findNearestEnemyFrom(fromX, fromY, weapon.chainRange, blocked);
    jumps += 1;
  }

  removeDeadEnemies();
}
