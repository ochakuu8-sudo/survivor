import { INTERACTION_HOLD_SECONDS, MAX_WEAPONS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { createWeapon, setActiveWeaponIndex, weaponAmmoLabel, weaponMetaLabel, weaponVariantText } from "./weapons.js";
import { weaponIcon, WEAPON_POOL } from "./shop.js";
import { updateHud } from "./hud.js";

export function treasureRerollPrice() {
  const used = game.treasureReward?.rerollsUsed || 0;
  if (used === 0) return 0;
  return 10 + game.wave * 5 + (used - 1) * 5;
}

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
  const reward = chooseTreasureReward();
  chest.rewardName = reward.name;
  game.mode = "treasure";
  game.treasureReward = {
    chest,
    reward,
    rerollsUsed: 0,
  };

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
  renderTreasureReward();
  updateHud();
}

export function rerollTreasureReward() {
  const treasure = game.treasureReward;
  if (!treasure) return;
  const price = treasureRerollPrice();
  if (game.gold < price) return;
  if (price > 0) game.gold -= price;
  treasure.rerollsUsed += 1;
  treasure.reward = chooseTreasureReward(treasure.reward.baseName);
  treasure.chest.rewardName = treasure.reward.name;
  renderTreasureReward();
  updateHud();
}

export function claimTreasureReward() {
  const treasure = game.treasureReward;
  if (!treasure) return;
  const reward = treasure.reward;
  if (reward.type === "weapon") {
    const gear = game.player.gear;
    if (!Array.isArray(gear.storageWeapons)) gear.storageWeapons = [];
    const weapon = reward.weapon;
    if (gear.weapons.length < MAX_WEAPONS) {
      gear.weapons.push(weapon);
      setActiveWeaponIndex(gear.weapons.length - 1);
    } else {
      gear.storageWeapons.push(weapon);
    }
  } else {
    game.gold += reward.amount || treasureGoldAmount();
  }
  game.treasureReward = null;
  game.mode = "fight";
  hud.treasureReward.classList.add("hidden");
  updateHud();
}

function renderTreasureReward() {
  const treasure = game.treasureReward;
  if (!treasure) return;
  const reward = treasure.reward;
  hud.treasureRewardIcon.textContent = reward.icon;
  hud.treasureRewardName.textContent = reward.name;
  hud.treasureRewardText.textContent = reward.text;
  hud.treasureRewardMeta.textContent = reward.meta;
  const price = treasureRerollPrice();
  const free = price === 0;
  hud.treasureReroll.textContent = free ? "リロール 無料" : `リロール ${price}G`;
  hud.treasureReroll.disabled = !free && game.gold < price;
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward(excludeName = "") {
  const allCandidates = WEAPON_POOL;
  const candidates = allCandidates.filter((template) => template.name !== excludeName);
  const pool = candidates.length > 0 ? candidates : allCandidates;
  if (pool.length === 0) return createGoldReward();
  const template = pickTreasureWeaponTemplate(pool);
  const weapon = createWeapon({ name: template.name, ...template.weapon }, {
    floor: game.wave,
    rollVariant: template.weapon?.rollVariant === true,
  });
  return {
    type: "weapon",
    name: weapon.name,
    baseName: template.name,
    text: `${template.text || ""} ${weaponVariantText(weapon)}`,
    meta: `${weaponMetaLabel(weapon)} / ${weaponAmmoLabel(weapon)}`,
    icon: weaponIcon(weapon),
    weapon,
  };
}

function pickTreasureWeaponTemplate(pool) {
  const floor = Math.max(1, game.wave || 1);
  const rarityWeights = floor >= 6
    ? { normal: 42, rare: 38, legend: 20 }
    : floor >= 3
      ? { normal: 56, rare: 34, legend: 10 }
      : { normal: 70, rare: 27, legend: 3 };
  const entries = pool.map((template) => ({
    template,
    weight: rarityWeights[template.rarity || template.weapon?.rarity || "normal"] || 1,
  }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.template;
  }
  return entries[0]?.template || pool[0];
}

function createGoldReward() {
  const amount = treasureGoldAmount();
  return {
    type: "gold",
    name: `${amount}G`,
    text: "武器枠が埋まっているため、宝箱の中身をゴールドとして回収する。",
    meta: "ゴールド",
    icon: "G",
    amount,
  };
}

function treasureGoldAmount() {
  return 18 + game.wave * 5;
}
