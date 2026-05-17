import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { t } from "./i18n.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { addEffect, addSparks } from "./effects.js";
import { updateHud } from "./hud.js";
import { beginStoneItemChoiceReward } from "./modding.js";
import { pickStoneItemChoices, pickStoneSpecialItemChoices } from "./stoneItems.js";
import { STONE_MATERIALS } from "./data/stoneItems.js";

export function treasureRerollPrice() {
  return 0;
}

export function updateTreasureChests(dt = 0) {
  const player = game.player;
  const chests = game.dungeon?.chests || [];
  if (!player || chests.length === 0 || game.mode !== "arena") return;

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
  const reward = chooseTreasureReward(chest);
  chest.rewardName = reward.name;

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

  if (reward.stoneChoices?.length) {
    beginStoneItemChoiceReward(reward.stoneChoices, { source: "chest", allowDiscard: true });
  } else {
    game.treasureReward = { chest, reward, rerollsUsed: 0 };
    game.modeBeforeTreasure = game.mode;
    game.mode = "treasure";
    renderTreasureReward();
  }
  updateHud();
}

export function rerollTreasureReward() {
  // MVP: treasure rewards are immediate attachment decisions and cannot be rerolled.
}

export function claimTreasureReward() {
  game.treasureReward = null;
  game.mode = game.modeBeforeTreasure || "arena";
  game.modeBeforeTreasure = null;
  hud.treasureReward?.classList.add("hidden");
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
  hud.treasureReroll.textContent = t("modding.noReroll");
  hud.treasureReroll.disabled = true;
  hud.treasureTake.textContent = t("treasure.close");
  hud.treasureReward.classList.remove("hidden");
}

function chooseTreasureReward(chest = null) {
  const baseMaterialChoice = chest?.rewardKind === "baseMaterialChoice";
  const specialOnly = chest?.rewardKind === "synthesizedStoneItem";
  const choices = baseMaterialChoice ? [...STONE_MATERIALS] : specialOnly ? pickStoneSpecialItemChoices(3) : pickStoneItemChoices(3);
  if (choices.length > 0) {
    return {
      type: "stoneItemChoice",
      name: baseMaterialChoice ? t("treasure.stoneMaterialChoice.name") : specialOnly ? t("treasure.specialChoice.name") : t("treasure.initialMaterial.name"),
      text: baseMaterialChoice
        ? t("treasure.stoneMaterialChoice.text")
        : specialOnly
          ? t("treasure.specialChoice.text")
          : t("treasure.initialMaterial.text"),
      meta: baseMaterialChoice ? t("treasure.baseMeta") : specialOnly ? t("treasure.specialMeta") : t("treasure.initialMeta"),
      icon: baseMaterialChoice ? "●" : specialOnly ? "★" : "●",
      stoneChoices: choices,
    };
  }

  return {
    type: "empty",
    name: t("treasure.empty.name"),
    text: t("treasure.empty.text"),
    meta: t("treasure.empty.meta"),
    icon: "×",
    stoneChoices: [],
  };
}
