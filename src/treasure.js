import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { grantFreeNode, grantRandomAffordableNode, renderSkillTree } from "./skillTree.js";
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
  if (game.gold < price) return;
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
  game.mode = game.modeBeforeTreasure === "arena" ? "arena" : "upgradeTree";
  game.modeBeforeTreasure = null;
  hud.treasureReward.classList.add("hidden");
  renderSkillTree();
  updateHud();
}

function applyTreasureReward(reward) {
  if (reward.type === "gold") {
    game.gold += reward.amount;
  } else if (reward.type === "freeWeapon") {
    grantFreeNode("weapon", 1);
  } else if (reward.type === "freeCommon") {
    grantFreeNode("common", 1);
  } else if (reward.type === "instantWeapon") {
    grantRandomAffordableNode("weapon");
  } else if (reward.type === "evolution") {
    game.evolutionMaterials = (game.evolutionMaterials || 0) + 1;
    grantFreeNode("weapon", 1);
  } else if (reward.type === "nextBuff") {
    game.nextWaveBuff = { damage: 0.18 };
    grantFreeNode("weapon", 1);
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
  hud.treasureReroll.disabled = !free && game.gold < price;
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward(excludeType = "") {
  const rewards = [
    {
      type: "instantWeapon",
      name: "即時改造ノード",
      text: "現在武器の購入可能ノードを1つ無料で解放する。",
      meta: "現在武器強化",
      icon: "★",
      weight: 28,
    },
    {
      type: "freeWeapon",
      name: "武器ノード無料権",
      text: "Wave後の武器ツリーで好きな購入可能ノードを1つ無料解放できる。",
      meta: "武器ツリー",
      icon: "W",
      weight: 26,
    },
    {
      type: "freeCommon",
      name: "共通強化無料権",
      text: "共通ツリーの購入可能ノードを1つ無料で取得できる。",
      meta: "共通ツリー",
      icon: "+",
      weight: 16,
    },
    {
      type: "evolution",
      name: "進化素材",
      text: "進化ノードに近づく素材。おまけで武器ノード無料権も得る。",
      meta: "進化支援",
      icon: "E",
      weight: game.wave >= 3 ? 16 : 6,
    },
    {
      type: "gold",
      name: `${treasureGoldAmount()}G`,
      text: "大量のゴールド。Wave後のスキルツリー購入に使える。",
      meta: "通貨",
      icon: "G",
      amount: treasureGoldAmount(),
      weight: 18,
    },
    {
      type: "nextBuff",
      name: "次Wave限定バフ",
      text: "次の改造候補を広げるため、武器ノード無料権を得る。",
      meta: "短期強化",
      icon: "B",
      weight: 10,
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

function treasureGoldAmount() {
  return 45 + game.wave * 12;
}
