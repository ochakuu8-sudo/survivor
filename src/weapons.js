import { TAU, WEAPON_STAT_KEYS } from "./constants.js";
import { game, nextWeaponId } from "./state.js";
import { distSq } from "./utils/math.js";
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
    ricochet: template.ricochet || 0,
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

export function autoShoot() {
  const p = game.player;
  if (game.enemies.length === 0) return;

  for (const weapon of p.gear.weapons) {
    if (weapon.shootTimer > 0) continue;

    const best = findTargetForWeapon(p, weapon);
    if (!best) continue;

    fireWeapon(weapon, best);
    weapon.shootTimer = 1 / weapon.fireRate;
    game.shake = Math.max(game.shake, weapon.kick);
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
  const angle = Math.atan2(target.y - p.y, target.x - p.x);
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
    pierce: weapon.pierce,
    ricochet: weapon.ricochet || 0,
    explosionRadius: weapon.explosionRadius,
    explosionDamage: weapon.explosionDamage + bonus,
    bulletTint: weapon.bulletTint,
    bulletGlow: weapon.bulletGlow,
    bulletSprite: weapon.bulletSprite || null,
    effectTint: weapon.effectTint,
    effectGlow: weapon.effectGlow,
    spinSeed: tumbles ? Math.random() * TAU : 0,
    spinRate: tumbles ? 5 + Math.random() * 4 : 0,
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
  const streamCount = 5;
  for (let i = 0; i < streamCount; i += 1) {
    const fan = streamCount === 1 ? 0 : i / (streamCount - 1) - 0.5;
    const flameAngle = angle + fan * weapon.cone * 2 + (Math.random() - 0.5) * 0.06;
    const length = weapon.range * (0.86 + Math.random() * 0.14);
    const tipX = originX + Math.cos(flameAngle) * length;
    const tipY = originY + Math.sin(flameAngle) * length;

    addEffect({
      type: "line",
      x1: originX,
      y1: originY,
      x2: tipX,
      y2: tipY,
      width: 22 + Math.random() * 6,
      life: 0.18,
      maxLife: 0.18,
      glow,
      tint: [baseTint[0] * 0.85, baseTint[1] * 0.45, baseTint[2] * 0.35],
    });
    addEffect({
      type: "line",
      x1: originX,
      y1: originY,
      x2: originX + Math.cos(flameAngle) * length * 0.86,
      y2: originY + Math.sin(flameAngle) * length * 0.86,
      width: 12,
      life: 0.16,
      maxLife: 0.16,
      glow,
      tint: baseTint,
    });
    addEffect({
      type: "line",
      x1: originX,
      y1: originY,
      x2: originX + Math.cos(flameAngle) * length * 0.62,
      y2: originY + Math.sin(flameAngle) * length * 0.62,
      width: 4,
      life: 0.13,
      maxLife: 0.13,
      glow: "glowAmber",
      tint: [1, 0.92, 0.5],
    });
  }

  for (let i = 0; i < 3; i += 1) {
    const fan = (Math.random() - 0.5) * weapon.cone * 1.8;
    const distance = weapon.range * (0.38 + Math.random() * 0.5);
    const puffAngle = angle + fan;
    addEffect({
      type: "burst",
      x: originX + Math.cos(puffAngle) * distance,
      y: originY + Math.sin(puffAngle) * distance,
      radius: 18 + Math.random() * 16,
      life: 0.18 + Math.random() * 0.08,
      maxLife: 0.26,
      glow,
      tint: [baseTint[0], baseTint[1] * 0.9, baseTint[2] * 0.65],
    });
  }

  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 18,
    y: originY + Math.sin(angle) * 18,
    radius: 36,
    life: 0.14,
    maxLife: 0.14,
    glow: "glowAmber",
    tint: [1, 0.96, 0.62],
  });
  addEffect({
    type: "burst",
    x: originX + Math.cos(angle) * 6,
    y: originY + Math.sin(angle) * 6,
    radius: 22,
    life: 0.1,
    maxLife: 0.1,
    glow: "glowAmber",
    tint: [1, 1, 0.88],
  });

  const emberCount = 6;
  for (let i = 0; i < emberCount; i += 1) {
    const fan = (Math.random() - 0.5) * weapon.cone * 1.6;
    const dir = angle + fan;
    const speed = 220 + Math.random() * 160;
    game.particles.push({
      x: originX + Math.cos(dir) * 6,
      y: originY + Math.sin(dir) * 6,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      life: 0.3 + Math.random() * 0.22,
      maxLife: 0.52,
      size: 9 + Math.random() * 7,
      sprite: "spark",
      tint: i % 3 === 0 ? [1, 0.9, 0.42] : [1, 0.5, 0.18],
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
  const slashCount = 5;
  for (let i = 0; i < slashCount; i += 1) {
    const t = slashCount === 1 ? 0 : i / (slashCount - 1);
    const slashAngle = angle + (t - 0.5) * weapon.cone * 1.75;
    const inner = weapon.range * 0.28;
    const outer = weapon.range * (0.9 + Math.random() * 0.12);
    addEffect({
      type: "line",
      x1: originX + Math.cos(slashAngle) * inner,
      y1: originY + Math.sin(slashAngle) * inner,
      x2: originX + Math.cos(slashAngle) * outer,
      y2: originY + Math.sin(slashAngle) * outer,
      width: 8 + i * 1.4,
      life: 0.16,
      maxLife: 0.16,
      glow: weapon.effectGlow,
      tint: weapon.effectTint,
    });
  }
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
