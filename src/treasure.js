import { INTERACTION_HOLD_SECONDS, MAX_STORED_ATTACHMENTS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { updateHud } from "./hud.js";
import { addAttachmentToStorage, pickShopAttachment, starsLabel } from "./attachments.js";

export function treasureRerollPrice() {
  return 0;
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
  if (!reward || reward.type !== "attachment") return false;
  const stored = addAttachmentToStorage(reward.attachment);
  if (!stored) {
    const storageLimit = game.player?.gear?.storageAttachmentsMax || MAX_STORED_ATTACHMENTS;
    game.treasureRewardMessage = `所持上限 ${storageLimit} 個のため取得できませんでした。`;
    return false;
  }
  game.treasureRewardMessage = `${reward.name} を所持欄に入れました。作業台で装着できます。`;
  return true;
}

function renderTreasureReward() {
  const treasure = game.treasureReward;
  if (!treasure) return;
  const reward = treasure.reward;
  hud.treasureRewardIcon.textContent = reward.icon;
  hud.treasureRewardName.textContent = reward.name;
  hud.treasureRewardText.textContent = reward.text;
  hud.treasureRewardMeta.textContent = reward.meta;
  const gear = game.player?.gear;
  const storageLimit = gear?.storageAttachmentsMax || MAX_STORED_ATTACHMENTS;
  const storageFull = (gear?.storageAttachments || []).length >= storageLimit;
  hud.treasureRewardMeta.textContent = storageFull
    ? `${reward.meta} / 所持欄満杯: 受け取ると捨てます`
    : reward.meta;
  hud.treasureReroll.textContent = "リロールなし";
  hud.treasureReroll.disabled = true;
  hud.treasureTake.textContent = storageFull ? "捨てて閉じる" : "所持する";
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward() {
  const attachmentRoll = pickShopAttachment(game.wave || 1);
  if (attachmentRoll?.definition) {
    const def = attachmentRoll.definition;
    return {
      type: "attachment",
      name: def.name,
      text: def.text || "作業台で武器に装着できる。",
      meta: `所持品に追加 / ${starsLabel(attachmentRoll.stars || def.stars || 1)} / ${(def.category || "stat")}`,
      icon: "★",
      attachment: { definition: def, stars: attachmentRoll.stars || def.stars || 1 },
    };
  }

  return {
    type: "attachment",
    name: "空の宝箱",
    text: "今回は使えるアタッチメントが見つからなかった。",
    meta: "取得なし",
    icon: "×",
    attachment: null,
  };
}
