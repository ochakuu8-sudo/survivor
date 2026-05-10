import { INTERACTION_HOLD_SECONDS, MAX_WEAPONS } from "./constants.js";
import { game } from "./state.js";
import { addEffect, addSparks } from "./effects.js";
import { createWeapon } from "./weapons.js";
import { WEAPON_POOL } from "./shop.js";

export function updateTreasureChests(dt = 0) {
  const player = game.player;
  const chests = game.dungeon?.chests || [];
  if (!player || chests.length === 0) return;

  for (const chest of chests) {
    if (chest.opened) continue;
    const reach = player.radius + chest.radius + 18;
    if (Math.hypot(player.x - chest.x, player.y - chest.y) > reach) {
      chest.holdTimer = 0;
      continue;
    }
    chest.holdTimer = Math.min(INTERACTION_HOLD_SECONDS, (chest.holdTimer || 0) + dt);
    if (chest.holdTimer < INTERACTION_HOLD_SECONDS) continue;
    openTreasureChest(chest);
  }
}

function openTreasureChest(chest) {
  chest.opened = true;
  chest.holdTimer = INTERACTION_HOLD_SECONDS;
  const reward = chooseWeaponReward();
  if (reward && game.player.gear.weapons.length < MAX_WEAPONS) {
    game.player.gear.weapons.push(createWeapon({ name: reward.name, ...reward.weapon }));
    chest.rewardName = reward.name;
  } else {
    const gold = 18 + game.wave * 5;
    game.gold += gold;
    chest.rewardName = `${gold}G`;
  }

  addEffect({
    type: "burst",
    x: chest.x,
    y: chest.y,
    radius: 70,
    life: 0.32,
    maxLife: 0.32,
    glow: "glowAmber",
    tint: [1, 0.9, 0.28],
  });
  addSparks(chest.x, chest.y - 8, 12, 150, "goldCoin");
  game.shake = Math.max(game.shake, 2.5);
}

function chooseWeaponReward() {
  const owned = new Set(game.player.gear.weapons.map((weapon) => weapon.name));
  const candidates = WEAPON_POOL.filter((template) => template.name !== "石" && !owned.has(template.name));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
