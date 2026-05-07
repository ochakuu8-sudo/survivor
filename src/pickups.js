import { game } from "./state.js";
import { clamp } from "./utils/math.js";
import { addSparks } from "./effects.js";

export function updatePickups(dt) {
  const p = game.player;
  const kept = [];
  for (const pickup of game.pickups) {
    pickup.bob += dt * 5;
    const dx = p.x - pickup.x;
    const dy = p.y - pickup.y;
    const distance = Math.hypot(dx, dy);

    if (distance < p.pickup) {
      pickup.magnetized = true;
      pickup.magnetTime = (pickup.magnetTime || 0) + dt;
    }

    if (pickup.magnetized) {
      const directionX = dx / Math.max(1, distance);
      const directionY = dy / Math.max(1, distance);
      const proximity = 1 - clamp(distance / p.pickup, 0, 1);
      const suctionSpeed = 760 + proximity * 1600 + clamp(pickup.magnetTime || 0, 0, 0.18) * 4200;
      const step = Math.min(distance, suctionSpeed * dt);
      pickup.x += directionX * step;
      pickup.y += directionY * step;
      pickup.vx *= 0.35;
      pickup.vy *= 0.35;
    } else {
      pickup.vx *= 0.84;
      pickup.vy *= 0.84;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
    }

    const collectDistance = Math.hypot(p.x - pickup.x, p.y - pickup.y);
    if (collectDistance < p.radius + 18) {
      game.money += pickup.value;
      addSparks(pickup.x, pickup.y, 2, 60, "cash");
    } else {
      kept.push(pickup);
    }
  }
  game.pickups = kept;
}
