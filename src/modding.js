import { getWeaponMaxAttachments } from "./constants.js";
import { t } from "./i18n.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import {
  attachmentCategoryLabel,
  canAttachToWeapon,
  createAttachmentInstance,
  findAttachmentDefinition,
  recomputeAllAttachments,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";
import { findWeapon, getActiveWeapon } from "./weapons.js";
import {
  addStoneMaterial,
  countItemsByKey,
  equipStoneSpecial,
  isStoneSpecialUnlocked,
  isStoneWeapon,
  pickStoneItemChoices,
  stoneItemIcon,
  formatStoneItemEffectSummary,
  stoneSpecialSlotCapacity,
  romanRank,
  stoneSpecialRank,
} from "./stoneItems.js";
import { findStoneItem, findStoneMaterial } from "./data/stoneItems.js";

export function maxAttachmentSlotsForWeapon(weapon) {
  return getWeaponMaxAttachments(weapon);
}

function modeAfterReward() {
  return game.modeBeforeAttachmentReward || game.modeBeforeTreasure || game.modeBeforeWorkbench || "arena";
}

function attachmentIcon(category, stars = 1) {
  const categoryIcons = {
    stat: "◆",
    elemental: "✦",
    behavior: "↯",
    trajectory: "↻",
    deploy: "▣",
    shatter: "✹",
    element: "✦",
    control: "◎",
    delayed: "⌛",
    defense: "✚",
    growth: "▲",
    throwStyle: "⇉",
    special: "↯",
    support: "✚",
    unique: "◈",
    utility: "◈",
  };
  return `${categoryIcons[category] || "★"}${Math.max(1, stars)}`;
}

function normalizePendingAttachment(raw) {
  const definition = raw?.definition || findAttachmentDefinition(raw?.key) || raw;
  if (!definition?.key) return null;
  return createAttachmentInstance(definition, raw) || null;
}

function normalizePendingStoneItem(raw) {
  const definition = findStoneItem(raw?.key) || raw;
  if (!definition?.key) return null;
  return { key: definition.key, name: definition.name, description: definition.description };
}

function getStoneWeapon() {
  return (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon)) || null;
}

function equipOrPromptStoneSpecial(stoneWeapon, key) {
  if (!stoneWeapon) return false;
  return equipStoneSpecial(stoneWeapon, key);
}

export function beginAttachmentReward(rawAttachment, { source = "reward", allowDiscard = true } = {}) {
  const attachment = normalizePendingAttachment(rawAttachment);
  if (!attachment) return false;
  game.pendingAttachmentReward = {
    attachment,
    source,
    rerollsUsed: 0,
    allowDiscard,
  };
  game.pendingMod = null;
  game.modeBeforeAttachmentReward = game.mode === "attachmentReward" ? modeAfterReward() : game.mode;
  game.mode = "attachmentReward";
  renderModdingPanel();
  updateHud();
  return true;
}

export function beginStoneItemChoiceReward(rawChoices, { source = "reward", allowDiscard = true } = {}) {
  const choices = (rawChoices || []).map(normalizePendingStoneItem).filter((item) => item && (findStoneMaterial(item.key) || isStoneSpecialUnlocked(item.key)));
  if (choices.length === 0) return false;
  game.pendingAttachmentReward = {
    stoneChoices: choices,
    source,
    rerollsUsed: 0,
    allowDiscard,
  };
  game.pendingMod = null;
  game.modeBeforeAttachmentReward = game.mode === "attachmentReward" ? modeAfterReward() : game.mode;
  game.mode = "attachmentReward";
  renderModdingPanel();
  updateHud();
  return true;
}

export function beginStoneItemReward(rawItem) {
  const item = normalizePendingStoneItem(rawItem);
  if (!item) return false;
  if (findStoneMaterial(item.key)) {
    addStoneMaterial(item.key, 1);
    updateHud();
    return true;
  }
  const stoneWeapon = getStoneWeapon();
  if (!stoneWeapon) return false;
  if (!isStoneSpecialUnlocked(item.key)) return false;
  if (!equipOrPromptStoneSpecial(stoneWeapon, item.key)) {
    return beginStoneItemChoiceReward([item], { source: "reward", allowDiscard: true });
  }
  updateHud();
  return true;
}

export function levelUpWeapon(weapon = getActiveWeapon()) {
  if (!weapon) return false;
  const item = pickStoneItemChoices(1)[0];
  if (!item) return false;
  return beginStoneItemReward(item, { source: "debugLevelUp", allowDiscard: true });
}

export function getModRerollCost() {
  return 0;
}

export function selectPendingAttachmentSlot() {
  // Slot selection now happens by directly pressing a weapon slot in the reward panel.
}

export function rerollPendingAttachment() {
  // MVP: reward rerolls are intentionally disabled so the pickup decision stays immediate.
}

function finishAttachmentReward() {
  const pendingSource = game.pendingAttachmentReward?.source;
  const nextMode = pendingSource === "workbench" ? (game.modeBeforeWorkbench || "arena") : modeAfterReward();
  game.pendingAttachmentReward = null;
  game.pendingMod = null;
  game.treasureReward = null;
  hideModdingPanel();
  hud.treasureReward?.classList.add("hidden");
  hud.workbenchPanel?.classList.add("hidden");
  game.mode = nextMode;
  game.modeBeforeAttachmentReward = null;
  game.modeBeforeTreasure = null;
  game.modeBeforeWorkbench = null;
  updateHud();
}

export function claimPendingAttachment() {
  if (game.pendingAttachmentReward?.stoneReplaceKey) {
    game.pendingAttachmentReward.stoneReplaceKey = null;
    renderModdingPanel();
    return;
  }
  discardPendingAttachment();
}

export function discardPendingAttachment() {
  if (!game.pendingAttachmentReward) return;
  finishAttachmentReward();
}

export function applyPendingAttachmentToSlot(weaponId, slotIndex) {
  const pending = game.pendingAttachmentReward;
  if (!pending?.attachment) return false;
  const weapon = findWeapon(weaponId);
  if (!weapon) return false;
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) return false;

  const definition = findAttachmentDefinition(pending.attachment.key) || pending.attachment;
  if (!canAttachToWeapon(definition, weapon)) return false;

  const current = weapon.attachments[slotIndex] || null;
  if (current?.locked) return false;
  if (current && typeof window !== "undefined" && typeof window.confirm === "function") {
    const ok = window.confirm(t("modding.overwriteConfirm", { current: current.name, next: pending.attachment.name }));
    if (!ok) return false;
  }

  weapon.attachments[slotIndex] = createAttachmentInstance(definition, pending.attachment);
  recomputeAllAttachments();
  finishAttachmentReward();
  return true;
}

function sourceLabel(source) {
  const labels = {
    chest: t("modding.source.chest"),
    treasureVault: t("modding.source.treasureVault"),
    combatRoom: t("modding.source.combatRoom"),
    workbench: t("modding.source.workbench"),
    debugLevelUp: t("modding.source.debugLevelUp"),
    reward: t("modding.source.reward"),
  };
  return labels[source] || t("modding.source.reward");
}

function setModdingPanelVariant(variant = "default") {
  if (!hud.moddingPanel) return;
  hud.moddingPanel.classList.toggle("stone-choice-only", variant === "stoneChoice");
  hud.moddingPanel.classList.toggle("stone-equip-simple", false);
}

function renderRewardSlot(weapon, weaponIndex, slotIndex, pendingAttachment) {
  const current = weapon.attachments[slotIndex] || null;
  const currentDefinition = findAttachmentDefinition(current?.key) || current || {};
  const currentStars = current?.stars || currentDefinition.stars || 1;
  const currentCategory = current?.category || currentDefinition.category;
  const pendingDefinition = findAttachmentDefinition(pendingAttachment?.key) || pendingAttachment;
  const compatible = canAttachToWeapon(pendingDefinition, weapon);
  const locked = !!current?.locked;

  const item = document.createElement("li");
  item.className = `mod-slot${current ? " filled" : " empty"}${locked ? " locked" : ""}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mod-slot-select";
  button.disabled = locked || !compatible;
  button.addEventListener("click", () => applyPendingAttachmentToSlot(weapon.id, slotIndex));

  const icon = document.createElement("span");
  icon.className = `mod-slot-icon attach-stars-${currentStars}`;
  icon.textContent = current ? attachmentIcon(currentCategory, currentStars) : "+";

  const copy = document.createElement("span");
  copy.className = "mod-slot-copy";

  const name = document.createElement("strong");
  name.textContent = current ? current.name || currentDefinition.name || t("modding.attachmentFallback") : t("modding.emptySlot");

  const meta = document.createElement("small");
  if (locked) meta.textContent = t("modding.locked");
  else if (!compatible) meta.textContent = t("modding.incompatible");
  else if (current) meta.textContent = t("modding.overwrite", { stars: starsLabel(currentStars), category: attachmentCategoryLabel(currentCategory) });
  else meta.textContent = t("modding.attachToWeapon", { index: weaponIndex + 1 });

  copy.append(name, meta);
  button.append(icon, copy);
  item.append(button);
  return item;
}

function renderRewardWeaponGroup(weapon, weaponIndex, pendingAttachment) {
  const group = document.createElement("li");
  group.className = "mod-weapon-group";

  const heading = document.createElement("div");
  heading.className = "mod-weapon-heading";
  const active = game.player?.gear?.activeWeaponIndex === weaponIndex ? ` / ${t("modding.active")}` : ` / ${t("modding.reserve")}`;
  heading.innerHTML = `<strong>${t("modding.slotStatus", { index: weaponIndex + 1, weapon: weapon.name, active })}</strong><small>${t("modding.slotCount", { filled: getFilledSlotCount(weapon), max: maxAttachmentSlotsForWeapon(weapon) })}</small>`;

  const slots = document.createElement("ol");
  slots.className = "modding-slots modding-slots-nested";
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
    slots.append(renderRewardSlot(weapon, weaponIndex, slotIndex, pendingAttachment));
  }

  group.append(heading, slots);
  return group;
}

function getFilledSlotCount(weapon) {
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  let count = 0;
  for (let index = 0; index < maxSlots; index += 1) {
    if (weapon.attachments[index]) count += 1;
  }
  return count;
}

export function renderModdingPanel() {
  if (!hud.moddingPanel) return;
  const pending = game.pendingAttachmentReward;
  if (pending?.stoneChoices) {
    renderStoneItemChoicePanel(pending);
    return;
  }
  if (pending?.stoneItem) {
    if (findStoneMaterial(pending.stoneItem.key)) {
      addStoneMaterial(pending.stoneItem.key, 1);
    } else {
      const stoneWeapon = getStoneWeapon();
      if (stoneWeapon) equipOrPromptStoneSpecial(stoneWeapon, pending.stoneItem.key);
    }
    finishAttachmentReward();
    return;
  }
  setModdingPanelVariant();
  if (!pending?.attachment) {
    hideModdingPanel();
    return;
  }

  const attachment = pending.attachment;
  const definition = findAttachmentDefinition(attachment.key) || attachment;
  const stars = attachment.stars || definition.stars || 1;
  const category = attachment.category || definition.category;

  const kicker = hud.moddingPanel.querySelector(".panel-kicker");
  const heading = hud.moddingPanel.querySelector("h1");
  if (kicker) kicker.textContent = sourceLabel(pending.source);
  if (heading) heading.textContent = t("modding.title");

  hud.moddingWeaponName.textContent = t("modding.newAttachment");
  hud.moddingWeaponLevel.textContent = t("modding.mustAttach");
  hud.moddingGold.textContent = t("modding.notOwned");
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = `treasure-icon modding-main-icon attach-stars-${stars}`;
    treasureIcon.textContent = attachmentIcon(category, stars);
  }
  hud.moddingAttachmentName.textContent = attachment.name || definition.name || t("modding.attachmentFallback");
  hud.moddingAttachmentMeta.textContent = `${starsLabel(stars)} / ${attachmentCategoryLabel(category)}`;
  hud.moddingAttachmentText.textContent = definition.text || t("modding.defaultText");

  hud.moddingSlots.replaceChildren();
  (game.player?.gear?.weapons || []).forEach((weapon, weaponIndex) => {
    hud.moddingSlots.append(renderRewardWeaponGroup(weapon, weaponIndex, attachment));
  });

  hud.moddingReroll.textContent = t("modding.noReroll");
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = pending.allowDiscard === false ? t("modding.chooseTarget") : t("modding.discard");
  hud.moddingTake.disabled = pending.allowDiscard === false;
  hud.moddingPanel.classList.remove("hidden");
}

function choosePendingStoneItem(index) {
  const pending = game.pendingAttachmentReward;
  const item = pending?.stoneChoices?.[index];
  if (!item) return;
  if (findStoneMaterial(item.key)) {
    addStoneMaterial(item.key, 1);
    finishAttachmentReward();
    return;
  }
  const stoneWeapon = getStoneWeapon();
  if (!stoneWeapon) return;
  if (!isStoneSpecialUnlocked(item.key)) return;
  if (!equipOrPromptStoneSpecial(stoneWeapon, item.key)) {
    pending.stoneReplaceKey = item.key;
    renderModdingPanel();
    return;
  }
  finishAttachmentReward();
}

function renderStoneItemChoicePanel(pending) {
  setModdingPanelVariant("stoneChoice");
  const stoneWeapon = getStoneWeapon();
  if (pending.stoneReplaceKey) {
    renderStoneReplacePanel(pending, stoneWeapon);
    return;
  }
  const counts = countItemsByKey(stoneWeapon?.items || []);
  const allSpecialChoices = pending.stoneChoices.every((item) => !findStoneMaterial(item.key));
  const kicker = hud.moddingPanel.querySelector(".panel-kicker");
  const heading = hud.moddingPanel.querySelector("h1");
  if (kicker) kicker.textContent = sourceLabel(pending.source);
  if (heading) heading.textContent = t("modding.chooseItem");

  hud.moddingWeaponName.textContent = allSpecialChoices ? t("modding.specialChoices") : t("modding.materialChoices", { count: pending.stoneChoices.length });
  hud.moddingWeaponLevel.textContent = allSpecialChoices ? t("modding.addSpecial") : t("modding.addInventory");
  hud.moddingGold.textContent = t("modding.waiting");
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = "treasure-icon modding-main-icon";
    treasureIcon.textContent = allSpecialChoices ? "★" : "●";
  }
  hud.moddingAttachmentName.textContent = allSpecialChoices ? t("modding.specialDirect") : t("modding.materialWorkbench");
  hud.moddingAttachmentMeta.textContent = allSpecialChoices ? t("modding.specialMeta") : t("modding.materialMeta", { count: pending.stoneChoices.length });
  hud.moddingAttachmentText.textContent = allSpecialChoices
    ? t("modding.specialHelp")
    : t("modding.materialHelp");

  hud.moddingSlots.replaceChildren();
  pending.stoneChoices.forEach((item, index) => {
    const definition = findStoneItem(item.key) || item;
    const material = findStoneMaterial(item.key);
    const owned = material ? (game.stoneMaterials?.[item.key] || 0) : (counts[item.key] || 0);
    const card = document.createElement("li");
    card.className = "mod-slot active stone-choice-button";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mod-slot-select";
    button.addEventListener("click", () => choosePendingStoneItem(index));
    const icon = document.createElement("span");
    icon.className = "mod-slot-icon";
    icon.textContent = stoneItemIcon(definition);
    const copy = document.createElement("span");
    copy.className = "mod-slot-copy";
    const name = document.createElement("strong");
    name.textContent = definition.name;
    const meta = document.createElement("small");
    meta.textContent = formatStoneItemEffectSummary(definition);
    const count = document.createElement("span");
    count.className = "stone-choice-count";
    count.textContent = t("modding.count", { label: material ? t("modding.material") : t("modding.owned"), owned, next: owned + 1 });
    copy.append(name, meta, count);
    button.append(icon, copy);
    card.append(button);
    hud.moddingSlots.append(card);
  });

  hud.moddingReroll.textContent = t("modding.noReroll");
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = pending.allowDiscard === false ? t("modding.chooseItemAction") : t("modding.drop");
  hud.moddingTake.disabled = pending.allowDiscard === false;
  hud.moddingPanel.classList.remove("hidden");
}

function renderStoneReplacePanel(pending, stoneWeapon) {
  const item = findStoneItem(pending.stoneReplaceKey);
  const kicker = hud.moddingPanel.querySelector(".panel-kicker");
  const heading = hud.moddingPanel.querySelector("h1");
  if (kicker) kicker.textContent = sourceLabel(pending.source);
  if (heading) heading.textContent = t("workbench.replaceMode");
  hud.moddingWeaponName.textContent = t("workbench.noEmptySlot");
  hud.moddingWeaponLevel.textContent = t("workbench.replaceMode");
  hud.moddingGold.textContent = t("modding.waiting");
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = "treasure-icon modding-main-icon";
    treasureIcon.textContent = stoneItemIcon(item);
  }
  hud.moddingAttachmentName.textContent = item?.name || pending.stoneReplaceKey;
  hud.moddingAttachmentMeta.textContent = t("workbench.rank", { rank: romanRank(stoneSpecialRank(pending.stoneReplaceKey)) });
  hud.moddingAttachmentText.textContent = t("workbench.noSpendHint");
  hud.moddingSlots.replaceChildren();
  const capacity = stoneSpecialSlotCapacity(stoneWeapon);
  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const current = stoneWeapon?.items?.[slotIndex] || null;
    const currentDefinition = findStoneItem(current?.key);
    const card = document.createElement("li");
    card.className = `mod-slot ${current ? "filled" : "empty"}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mod-slot-select";
    button.addEventListener("click", () => {
      if (equipStoneSpecial(stoneWeapon, pending.stoneReplaceKey, slotIndex)) finishAttachmentReward();
    });
    const icon = document.createElement("span");
    icon.className = "mod-slot-icon";
    icon.textContent = currentDefinition ? stoneItemIcon(currentDefinition) : "+";
    const copy = document.createElement("span");
    copy.className = "mod-slot-copy";
    const name = document.createElement("strong");
    name.textContent = currentDefinition ? `${currentDefinition.name} ${romanRank(stoneSpecialRank(currentDefinition.key))}` : t("workbench.emptySlot");
    const meta = document.createElement("small");
    meta.textContent = t("workbench.replaceWith", { item: item?.name || pending.stoneReplaceKey });
    copy.append(name, meta);
    button.append(icon, copy);
    card.append(button);
    hud.moddingSlots.append(card);
  }
  hud.moddingReroll.textContent = t("modding.noReroll");
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = t("workbench.cancelReplace");
  hud.moddingTake.disabled = false;
  hud.moddingPanel.classList.remove("hidden");
}

export function hideModdingPanel() {
  setModdingPanelVariant();
  hud.moddingPanel?.classList.add("hidden");
}
