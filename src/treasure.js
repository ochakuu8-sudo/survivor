import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { renderSkillTree } from "./skillTree.js";
import { updateHud } from "./hud.js";

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
  if ((game.runPoints || 0) < price) return;
  if (price > 0) game.runPoints -= price;
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
  game.mode = game.modeBeforeTreasure === "arena" ? "arena" : "upgradeTree";
  game.modeBeforeTreasure = null;
  hud.treasureReward.classList.add("hidden");
  renderSkillTree();
  updateHud();
}

function applyTreasureReward(reward) {
  const p = game.player;
  if (reward.type === "points") {
    game.runPoints = (game.runPoints || 0) + reward.amount;
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
  hud.treasureReroll.textContent = free ? "リロール 無料" : `リロール ${price}pt`;
  hud.treasureReroll.disabled = !free && (game.runPoints || 0) < price;
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward(excludeType = "") {
  const rewards = [
    {
      type: "points",
      name: "+20pt",
      text: "このランの回収ポイントを20pt増やす。死亡しても持ち帰れる。",
      meta: "ポイント報酬",
      icon: "P",
      amount: 20,
      weight: 24,
    },
    {
      type: "damageBuff",
      name: "攻撃力 +20%相当",
      text: "このラン中だけ基礎ダメージを底上げする。",
      meta: "ラン中限定",
      icon: "⚔",
      amount: Math.max(3, Math.round((game.player?.gear?.weapons?.[0]?.damage || 15) * 0.2)),
      weight: 22,
    },
    {
      type: "speedBuff",
      name: "移動速度 +15%",
      text: "このラン中だけ移動速度が上がる。",
      meta: "ラン中限定",
      icon: "➤",
      multiplier: 1.15,
      weight: 18,
    },
    {
      type: "pickupBuff",
      name: "吸引範囲 +50",
      text: "このラン中だけポイント欠片を集めやすくなる。",
      meta: "ラン中限定",
      icon: "◎",
      amount: 50,
      weight: 16,
    },
    {
      type: "hpBuff",
      name: "最大HP +10",
      text: "このラン中だけ最大HPと現在HPが増える。",
      meta: "ラン中限定",
      icon: "+",
      amount: 10,
      weight: 14,
    },
    {
      type: "pointBoost",
      name: "ポイント取得量 +50%",
      text: "このラン中、ポイント欠片の取得量が増える。",
      meta: "ラン中限定",
      icon: "✦",
      amount: 0.5,
      weight: 12,
    },
  ].filter((reward) => reward.type !== excludeType);
  const total = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  let roll = Math.random() * total;
  for (const reward of rewards) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }
  return rewards[0];
}
