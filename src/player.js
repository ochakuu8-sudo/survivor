import { game, keys, pointer } from "./state.js";
import { clamp, normalize } from "./utils/math.js";
import { addEffect, addSparks, addWalkDust } from "./effects.js";
import { moveActorWithDungeonCollision } from "./dungeon.js";

export function updateMovement(dt) {
  const p = game.player;
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  const hasKeyboardInput = x !== 0 || y !== 0;

  if (!hasKeyboardInput && pointer.down) {
    x = pointer.moveX;
    y = pointer.moveY;
  }

  const move = normalize(x, y);
  const speedScale = hasKeyboardInput ? 1 : clamp(pointer.strength, 0, 1);
  p.moveX = move.x;
  p.moveY = move.y;
  moveActorWithDungeonCollision(p, move.x * p.speed * speedScale * dt, move.y * p.speed * speedScale * dt);
  if (move.len > 0 && speedScale > 0.05) {
    p.facingX = move.x;
    p.facingY = move.y;
    p.walkTime = (p.walkTime + dt * (1.45 + speedScale * 1.1)) % 1;
    p.walkDustTimer -= dt;
    if (p.walkDustTimer <= 0) {
      addWalkDust(p.x - move.x * 15, p.y + 24 - move.y * 8, move.x, move.y);
      p.walkDustTimer = 0.18;
    }
  } else {
    p.walkTime = 0;
    p.walkDustTimer = 0;
  }
}

export function damagePlayer(amount) {
  if (game.debugInvincible) return 0;
  if ((game.player.barrier || 0) > 0) {
    game.player.barrier = Math.max(0, game.player.barrier - 1);
    addEffect({
      type: "burst",
      x: game.player.x,
      y: game.player.y,
      radius: 48,
      life: 0.28,
      maxLife: 0.28,
      glow: "glowCyan",
      tint: [0.46, 1, 0.95],
    });
    addSparks(game.player.x, game.player.y, 8, 160, "spark");
    game.shake = Math.max(game.shake, 3.5);
    return 0;
  }
  const reduction = 100 / (100 + Math.max(-20, game.player.armor) * 8);
  const damage = Math.max(1, Math.round((amount * reduction) / 18));
  game.player.hp = clamp(game.player.hp - damage, 0, game.player.maxHp);
  game.damageFlash = Math.max(game.damageFlash, clamp(damage / game.player.maxHp * 1.4, 0.24, 0.46));
  game.shake = Math.max(game.shake, 4 + damage * 0.6);
  return damage;
}
