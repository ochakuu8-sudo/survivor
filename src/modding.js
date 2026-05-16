import { getWeaponMaxAttachments } from "./constants.js";
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
  addStoneItemToWeapon,
  addStoneMaterial,
  countItemsByKey,
  ensureStoneItemSlots,
  formatStoneItemSummary,
  isStoneWeapon,
  stoneEvolutionProgress,
  stoneItemCapacity,
  pickStoneItemChoices,
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
  const choices = (rawChoices || []).map(normalizePendingStoneItem).filter(Boolean);
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

export function beginStoneItemReward(rawItem, { source = "reward", allowDiscard = true } = {}) {
  const item = normalizePendingStoneItem(rawItem);
  if (!item) return false;
  game.pendingAttachmentReward = {
    stoneItem: item,
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
  discardPendingAttachment();
}

export function discardPendingAttachment() {
  if (!game.pendingAttachmentReward) return;
  finishAttachmentReward();
}

export function applyPendingStoneItemToSlot(weaponId, slotIndex) {
  const pending = game.pendingAttachmentReward;
  if (!pending?.stoneItem) return false;
  const weapon = findWeapon(weaponId);
  if (!weapon || !isStoneWeapon(weapon)) return false;
  ensureStoneItemSlots(weapon);
  const maxSlots = stoneItemCapacity(weapon);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) return false;
  const current = weapon.items[slotIndex] || null;
  const currentDefinition = findStoneItem(current?.key) || current;
  if (currentDefinition && typeof window !== "undefined" && typeof window.confirm === "function") {
    const ok = window.confirm(`「${currentDefinition.name}」を「${pending.stoneItem.name}」で入れ替えますか？
外したアイテムは破棄されます。`);
    if (!ok) return false;
  }
  addStoneItemToWeapon(weapon, pending.stoneItem.key, slotIndex);
  finishAttachmentReward();
  return true;
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
    const ok = window.confirm(`「${current.name}」を「${pending.attachment.name}」で上書きしますか？\n上書きされたアタッチメントは消えます。`);
    if (!ok) return false;
  }

  weapon.attachments[slotIndex] = createAttachmentInstance(definition, pending.attachment);
  recomputeAllAttachments();
  finishAttachmentReward();
  return true;
}

function sourceLabel(source) {
  const labels = {
    chest: "宝箱",
    workbench: "作業台",
    debugLevelUp: "デバッグ強化",
    reward: "報酬",
  };
  return labels[source] || "報酬";
}

function setModdingPanelVariant(variant = "default") {
  if (!hud.moddingPanel) return;
  hud.moddingPanel.classList.toggle("stone-choice-only", variant === "stoneChoice");
  hud.moddingPanel.classList.toggle("stone-equip-simple", variant === "stoneEquip");
}

function renderStoneItemSlot(weapon, slotIndex) {
  ensureStoneItemSlots(weapon);
  const current = weapon.items[slotIndex] || null;
  const definition = findStoneItem(current?.key) || current;

  const item = document.createElement("li");
  item.className = `mod-slot${current ? " filled" : " empty"}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mod-slot-select";
  button.addEventListener("click", () => applyPendingStoneItemToSlot(weapon.id, slotIndex));

  const icon = document.createElement("span");
  icon.className = "mod-slot-icon";
  icon.textContent = current ? "●" : "+";

  const copy = document.createElement("span");
  copy.className = "mod-slot-copy";

  const name = document.createElement("strong");
  name.textContent = definition?.name || "空きスロット";

  const meta = document.createElement("small");
  meta.textContent = current ? `${definition?.description || "効果"} → 入れ替え` : "ここに装備";

  copy.append(name, meta);
  button.append(icon, copy);
  item.append(button);
  return item;
}

function renderStoneItemRewardSlots(weapon) {
  const group = document.createElement("li");
  group.className = "mod-weapon-group";

  const counts = countItemsByKey(weapon.items || []);
  const progress = stoneEvolutionProgress(counts)
    .map((evolution) => `${evolution.name}: ${evolution.requirements.map((req) => `${req.name} ${Math.min(req.count, req.need)}/${req.need}`).join(" + ")}`)
    .join(" / ");

  const heading = document.createElement("div");
  heading.className = "mod-weapon-heading";
  heading.innerHTML = `<strong>特殊アイテムを選んで装備</strong><small>${weapon.name}: ${weapon.items.length}/${stoneItemCapacity(weapon)}<br>${formatStoneItemSummary(weapon)}<br>${progress}</small>`;

  const slots = document.createElement("ol");
  slots.className = "modding-slots modding-slots-nested";
  for (let slotIndex = 0; slotIndex < stoneItemCapacity(weapon); slotIndex += 1) {
    slots.append(renderStoneItemSlot(weapon, slotIndex));
  }

  group.append(heading, slots);
  return group;
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
  name.textContent = current ? current.name || currentDefinition.name || "アタッチメント" : "空きスロット";

  const meta = document.createElement("small");
  if (locked) meta.textContent = "上書き不可";
  else if (!compatible) meta.textContent = "この武器には装着不可";
  else if (current) meta.textContent = `${starsLabel(currentStars)} / ${attachmentCategoryLabel(currentCategory)} → 上書き`;
  else meta.textContent = `武器${weaponIndex + 1}へ装着`;

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
  const active = game.player?.gear?.activeWeaponIndex === weaponIndex ? " / 使用中" : " / 控え";
  heading.innerHTML = `<strong>武器${weaponIndex + 1}: ${weapon.name}${active}</strong><small>スロット ${getFilledSlotCount(weapon)}/${maxAttachmentSlotsForWeapon(weapon)}</small>`;

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
    renderStoneItemPanel(pending);
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
  if (heading) heading.textContent = "今つけるか、捨てるか";

  hud.moddingWeaponName.textContent = "新アタッチメント";
  hud.moddingWeaponLevel.textContent = "装着しなければ消えます";
  hud.moddingGold.textContent = "非所持";
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = `treasure-icon modding-main-icon attach-stars-${stars}`;
    treasureIcon.textContent = attachmentIcon(category, stars);
  }
  hud.moddingAttachmentName.textContent = attachment.name || definition.name || "アタッチメント";
  hud.moddingAttachmentMeta.textContent = `${starsLabel(stars)} / ${attachmentCategoryLabel(category)}`;
  hud.moddingAttachmentText.textContent = definition.text || "選んだ武器スロットへ即時装着。既存枠は上書きされ、古いアタッチメントは消えます。";

  hud.moddingSlots.replaceChildren();
  (game.player?.gear?.weapons || []).forEach((weapon, weaponIndex) => {
    hud.moddingSlots.append(renderRewardWeaponGroup(weapon, weaponIndex, attachment));
  });

  hud.moddingReroll.textContent = "リロールなし";
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = pending.allowDiscard === false ? "装着先を選択" : "捨てる";
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
  game.pendingAttachmentReward = {
    stoneItem: item,
    source: pending.source,
    rerollsUsed: pending.rerollsUsed || 0,
    allowDiscard: pending.allowDiscard,
  };
  renderModdingPanel();
}

function renderStoneItemChoicePanel(pending) {
  setModdingPanelVariant("stoneChoice");
  const weapon = getActiveWeapon();
  const counts = countItemsByKey(weapon?.items || []);
  const kicker = hud.moddingPanel.querySelector(".panel-kicker");
  const heading = hud.moddingPanel.querySelector("h1");
  if (kicker) kicker.textContent = sourceLabel(pending.source);
  if (heading) heading.textContent = "アイテムを選ぶ";

  hud.moddingWeaponName.textContent = "素材3択報酬";
  hud.moddingWeaponLevel.textContent = "素材は所持欄へ、レア特殊アイテムは装備先を指定";
  hud.moddingGold.textContent = "選択待ち";
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = "treasure-icon modding-main-icon";
    treasureIcon.textContent = "●";
  }
  hud.moddingAttachmentName.textContent = "素材を集めて作業台で合成";
  hud.moddingAttachmentMeta.textContent = "初期素材 / クラフト用";
  hud.moddingAttachmentText.textContent = "初期素材は作業台で特殊アイテムへ合成します。レア特殊アイテムを引いた場合だけ、その場で石ころに装備できます。";

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
    icon.textContent = "●";
    const copy = document.createElement("span");
    copy.className = "mod-slot-copy";
    const name = document.createElement("strong");
    name.textContent = definition.name;
    const meta = document.createElement("small");
    meta.textContent = material ? `${definition.description} / 素材所持 ${owned}→${owned + 1} / 用途: ${(definition.uses || []).slice(0, 3).join("・")}` : `${definition.description} / 装備数 ${owned}→${owned + 1}`;
    copy.append(name, meta);
    button.append(icon, copy);
    card.append(button);
    hud.moddingSlots.append(card);
  });

  hud.moddingReroll.textContent = "リロールなし";
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = pending.allowDiscard === false ? "アイテムを選択" : "破棄";
  hud.moddingTake.disabled = pending.allowDiscard === false;
  hud.moddingPanel.classList.remove("hidden");
}

function renderStoneItemPanel(pending) {
  setModdingPanelVariant("stoneEquip");
  const item = pending.stoneItem;
  const definition = findStoneItem(item.key) || item;
  const weapon = getActiveWeapon();
  const counts = countItemsByKey(weapon?.items || []);
  const owned = counts[item.key] || 0;

  const kicker = hud.moddingPanel.querySelector(".panel-kicker");
  const heading = hud.moddingPanel.querySelector("h1");
  if (kicker) kicker.textContent = sourceLabel(pending.source);
  if (heading) heading.textContent = "特殊アイテムを選んで装備";

  hud.moddingWeaponName.textContent = "選択したアイテム";
  hud.moddingWeaponLevel.textContent = "装備先を選んでください";
  hud.moddingGold.textContent = `所持 ${owned} → ${owned + 1}`;
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = "treasure-icon modding-main-icon";
    treasureIcon.textContent = "●";
  }
  hud.moddingAttachmentName.textContent = definition.name || "石ころアイテム";
  hud.moddingAttachmentMeta.textContent = `所持: ${owned} → ${owned + 1}`;
  hud.moddingAttachmentText.textContent = definition.description || "石ころを強化する。";

  hud.moddingSlots.replaceChildren();
  const stoneWeapon = (game.player?.gear?.weapons || []).find((candidate) => isStoneWeapon(candidate));
  if (stoneWeapon) hud.moddingSlots.append(renderStoneItemRewardSlots(stoneWeapon));

  hud.moddingReroll.textContent = "リロールなし";
  hud.moddingReroll.disabled = true;
  hud.moddingTake.textContent = pending.allowDiscard === false ? "装着先を選択" : "破棄";
  hud.moddingTake.disabled = pending.allowDiscard === false;
  hud.moddingPanel.classList.remove("hidden");
}

export function hideModdingPanel() {
  setModdingPanelVariant();
  hud.moddingPanel?.classList.add("hidden");
}
