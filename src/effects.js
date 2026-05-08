import { TAU } from "./constants.js";
import { game } from "./state.js";

export function addEffect(effect) {
  const life = effect.life || 0.18;
  game.effects.push({
    ...effect,
    life,
    maxLife: effect.maxLife || life,
  });
  if (game.effects.length > 90) {
    game.effects.splice(0, game.effects.length - 90);
  }
}

const DEFAULT_TELEGRAPH_TINT = [0.86, 0.2, 0.18];

export function addTelegraphCircle(x, y, radius, duration, tint = DEFAULT_TELEGRAPH_TINT) {
  addEffect({
    type: "telegraph",
    x,
    y,
    radius,
    life: duration,
    maxLife: duration,
    tint,
  });
}

export function addTelegraphLine(x1, y1, x2, y2, width, duration, tint = DEFAULT_TELEGRAPH_TINT) {
  addEffect({
    type: "telegraphLine",
    x1,
    y1,
    x2,
    y2,
    width,
    life: duration,
    maxLife: duration,
    tint,
  });
}

export function addSparks(x, y, count, speed, sprite = "spark") {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const force = speed * (0.25 + Math.random() * 0.75);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 0.22 + Math.random() * 0.18,
      maxLife: 0.4,
      size: 18 + Math.random() * 18,
      sprite,
    });
  }
}

export function addWalkDust(x, y, moveX, moveY) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const sideX = -moveY * side;
  const sideY = moveX * side;
  game.particles.push({
    x: x + sideX * 7,
    y: y + sideY * 5,
    vx: -moveX * (26 + Math.random() * 18) + sideX * 12,
    vy: -moveY * (18 + Math.random() * 14) + sideY * 8,
    life: 0.2,
    maxLife: 0.2,
    size: 18 + Math.random() * 8,
    sprite: "walkDust",
  });
}

export function updateParticles(dt) {
  const kept = [];
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.9;
    particle.vy *= 0.9;
    if (particle.life > 0) kept.push(particle);
  }
  game.particles = kept;
}
