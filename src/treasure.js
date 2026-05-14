import { INTERACTION_HOLD_SECONDS, MAX_STORED_ATTACHMENTS, MAX_WEAPONS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { updateHud } from "./hud.js";
import { addAttachmentToStorage, pickShopAttachment, starsLabel } from "./attachments.js";
import { createWeapon } from "./weapons.js";
import { WEAPON_POOL } from "./shop.js";

export function treasureRerollPrice() {
  const used = game.treasureReward?.rerollsUsed || 0;
  if (used === 0) return 0;
  return 5 + used * 5;
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
  game.modeBeforeTreasure = game.mode;
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
  if ((game.gold || 0) < price) return;
  if (price > 0) game.gold -= price;
  treasure.rerollsUsed += 1;
  treasure.reward = chooseTreasureReward(treasure.reward.type);
  treasure.chest.rewardName = treasure.reward.name;
  renderTreasureReward();
  updateHud();
}

export function claimTreasureReward() {
  const treasure = game.treasureReward;
  if (!treasure) return;
  applyTreasureReward(treasure.reward);
  game.treasureReward = null;
  game.mode = "arena";
  game.modeBeforeTreasure = null;
  hud.treasureReward.classList.add("hidden");
  updateHud();
}

function applyTreasureReward(reward) {
  const p = game.player;
  if (!reward) return;
  if (reward.type === "attachment") {
    const stored = addAttachmentToStorage(reward.attachment);
    if (!stored) {
      game.treasureRewardMessage = `所持上限 ${MAX_STORED_ATTACHMENTS} 個のため取得できませんでした`;
    }
  } else if (reward.type === "weapon") {
    const weapon = createWeapon({ name: reward.template.name, ...reward.template.weapon }, { rollVariant: true, floor: game.wave });
    if ((p.gear.weapons?.length || 0) < MAX_WEAPONS) {
      p.gear.weapons.push(weapon);
    } else {
      p.gear.storageWeapons.push(weapon);
    }
  } else if (reward.type === "slotUnlock") {
    const weapon = p.gear.weapons[reward.weaponIndex];
    if (weapon) weapon.unlockedSlots = Math.max(weapon.unlockedSlots || 2, reward.slots);
  } else if (reward.type === "points") {
    game.runPoints = (game.runPoints || 0) + reward.amount;
    game.gold = (game.gold || 0) + reward.amount;
  } else if (reward.type === "damageBuff") {
    p.weaponPowerBonus = (p.weaponPowerBonus || 0) + reward.amount;
  } else if (reward.type === "speedBuff") {
    p.speed *= reward.multiplier;
  } else if (reward.type === "pickupBuff") {
    p.pickup += reward.amount;
  } else if (reward.type === "hpBuff") {
    p.maxHp += reward.amount;
    p.hp = Math.min(p.maxHp, p.hp + reward.amount);
  } else if (reward.type === "pointBoost") {
    game.goldGainBonus = Math.max(game.goldGainBonus || 0, reward.amount);
  }
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
  hud.treasureReroll.disabled = !free && (game.gold || 0) < price;
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward(excludeType = "") {
  const p = game.player;
  const gear = p?.gear;
  const rewards = [];

  const attachmentRoll = pickShopAttachment(game.wave || 1);
  if (attachmentRoll?.definition) {
    const def = attachmentRoll.definition;
    rewards.push({
      type: "attachment",
      name: def.name,
      text: def.text || "作業台で武器に装着できる。",
      meta: `所持品に追加 / ${starsLabel(attachmentRoll.stars || def.stars || 1)} / ${(def.category || "stat")}`,
      icon: "★",
      attachment: { definition: def, stars: attachmentRoll.stars || def.stars || 1 },
      weight: 70,
    });
  }

  const template = WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
  if (template) {
    const goesTo = (gear?.weapons?.length || 0) < MAX_WEAPONS ? "装備枠" : "倉庫";
    rewards.push({
      type: "weapon",
      name: template.name,
      text: template.text || "新しい武器。2本目として切り替え可能。",
      meta: `武器 / ${goesTo}へ追加`,
      icon: "W",
      template,
      weight: 15,
    });
  }

  const slotTargets = (gear?.weapons || []).map((weapon, index) => ({ weapon, index })).filter(({ weapon }) => (weapon.unlockedSlots || 2) < 3);
  if (slotTargets.length > 0) {
    const target = slotTargets[Math.floor(Math.random() * slotTargets.length)];
    rewards.push({
      type: "slotUnlock",
      name: `${target.weapon.name} スロット+1`,
      text: "この武器のアタッチメント枠を3つに増やす。",
      meta: `武器${target.index + 1} / 最大3枠`,
      icon: "+",
      weaponIndex: target.index,
      slots: 3,
      weight: 10,
    });
  }

  rewards.push({
    type: "points",
    name: "+20pt",
    text: "探索中の予備ポイントを20増やす。",
    meta: "低確率の補給",
    icon: "P",
    amount: 20,
    weight: 5,
  });

  const filtered = rewards.filter((reward) => reward.type !== excludeType);
  const pool = filtered.length > 0 ? filtered : rewards;
  const total = pool.reduce((sum, reward) => sum + reward.weight, 0);
  let roll = Math.random() * total;
  for (const reward of pool) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }
  return pool[0];
}
