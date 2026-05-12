import { TAU } from "./constants.js";
import { game } from "./state.js";
import { clamp } from "./utils/math.js";
import { addEffect } from "./effects.js";

const MAX_GOLD_DROPS = 260;

export function dropGold(enemy) {
  const pieces = pointCountForEnemy(enemy);

  for (let i = 0; i < pieces; i += 1) {
    const angle = Math.random() * TAU;
    const speed = 58 + Math.random() * 82;
    game.goldDrops.push({
      x: enemy.x + Math.cos(angle) * (enemy.radius * 0.28),
      y: enemy.y + Math.sin(angle) * (enemy.radius * 0.24),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      value: 1,
      radius: 10,
      age: 0,
      magnetDelay: 0.12 + Math.random() * 0.16,
      spin: Math.random() * TAU,
      bob: Math.random() * TAU,
    });
  }

  if (game.goldDrops.length > MAX_GOLD_DROPS) {
    game.goldDrops.splice(0, game.goldDrops.length - MAX_GOLD_DROPS);
  }
}

export function updateGoldDrops(dt) {
  const player = game.player;
  if (!player) return;
  const kept = [];
  const pickupRange = Math.max(90, player.pickup || 150);
  const pickupRangeSq = pickupRange * pickupRange;

  for (const drop of game.goldDrops) {
    drop.age += dt;
    const dx = player.x - drop.x;
    const dy = player.y - drop.y;
    const distanceSq = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSq) || 0.0001;
    const magnetized = drop.age >= drop.magnetDelay && distanceSq <= pickupRangeSq;

    if (magnetized) {
      const pull = 580 + clamp(1 - distance / pickupRange, 0, 1) * 760;
      drop.vx = (dx / distance) * pull;
      drop.vy = (dy / distance) * pull;
    }

    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.vx *= magnetized ? 0.92 : 0.82;
    drop.vy *= magnetized ? 0.92 : 0.82;

    if (distance <= player.radius + drop.radius + 4) {
      collectGold(drop);
      continue;
    }

    kept.push(drop);
  }

  game.goldDrops = kept;
}

function collectGold(drop) {
  game.runPoints = (game.runPoints || 0) + Math.max(1, Math.round(drop.value * (1 + (game.goldGainBonus || 0))));
  addEffect({
    type: "burst",
    x: drop.x,
    y: drop.y,
    radius: 18,
    life: 0.16,
    maxLife: 0.16,
    glow: "glowAmber",
    tint: [1, 0.9, 0.28],
  });
}

function pointCountForEnemy(enemy) {
  if (enemy.boss) return 25;
  if (enemy.elite) return 10;
  if (enemy.kind === "orc") return 4;
  if (enemy.kind === "archer" || enemy.readableSprite === "skeletonArcherReadable") return 2;
  if (enemy.readableSprite === "zombieBReadable") return 2;
  return 1;
}
