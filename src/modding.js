import { MAX_ATTACHMENTS, MAX_WEAPON_LEVEL } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { recomputeAllAttachments, starsLabel, attachmentCategoryLabel, findAttachmentDefinition } from "./attachments.js";
import { rollAttachmentForWeapon } from "./attachmentRolls.js";
import { tryEvolveWeapon } from "./evolution.js";
import { updateHud } from "./hud.js";
import { findWeapon, getActiveWeapon } from "./weapons.js";

const REROLL_COSTS = [0, 10, 20, 35, 55];

export function maxAttachmentSlotsForWeapon(weapon) {
  return Math.min(MAX_ATTACHMENTS, Math.max(0, (weapon?.level || 1) - 1));
}

function firstEquippedSlotWithinLevel(weapon) {
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  for (let index = 0; index < maxSlots; index += 1) {
    if (weapon.attachments[index]) return index;
  }
  return -1;
}

export function levelUpWeapon(weapon = getActiveWeapon()) {
  if (!weapon || weapon.level >= MAX_WEAPON_LEVEL) return false;
  weapon.level += 1;
  const slotIndex = weapon.level - 2;
  const attachment = rollAttachmentForWeapon(weapon, { weaponLevel: weapon.level });
  if (!attachment) return false;
  weapon.attachments[slotIndex] = attachment;
  recomputeAllAttachments();
  game.pendingMod = { weaponId: weapon.id, slotIndex, attachment, previousAttachment: null, rerollsUsed: 0, freeRerolls: 1, source: "weaponLevelUp" };
  game.mode = "modding";
  renderModdingPanel();
  updateHud();
  return true;
}

export function getModRerollCost(pending = game.pendingMod) {
  if (!pending || (pending.freeRerolls || 0) > 0) return 0;
  const paidIndex = Math.max(1, pending.rerollsUsed || 0);
  return REROLL_COSTS[Math.min(paidIndex, REROLL_COSTS.length - 1)];
}

export function selectPendingAttachmentSlot(slotIndex) {
  const pending = game.pendingMod;
  if (!pending) return;
  const weapon = findWeapon(pending.weaponId);
  if (!weapon) return;
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots || !weapon.attachments[slotIndex]) return;
  pending.slotIndex = slotIndex;
  pending.attachment = weapon.attachments[slotIndex];
  renderModdingPanel();
}

export function rerollPendingAttachment(slotIndex = game.pendingMod?.slotIndex) {
  const pending = game.pendingMod;
  if (!pending) return;
  const weapon = findWeapon(pending.weaponId);
  if (!weapon) return;
  if (Number.isInteger(slotIndex)) selectPendingAttachmentSlot(slotIndex);
  const selectedIndex = pending.slotIndex;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= maxAttachmentSlotsForWeapon(weapon)) return;
  if (!weapon.attachments[selectedIndex] || weapon.attachments[selectedIndex]?.locked) return;
  const cost = getModRerollCost(pending);
  if (cost > 0 && (game.gold || 0) < cost) return;
  if (cost > 0) game.gold -= cost;
  else pending.freeRerolls = Math.max(0, (pending.freeRerolls || 0) - 1);
  pending.rerollsUsed += 1;
  const next = rollAttachmentForWeapon(weapon, { weaponLevel: weapon.level, excludeKey: weapon.attachments[selectedIndex]?.key });
  if (!next) return;
  weapon.attachments[selectedIndex] = next;
  pending.attachment = next;
  recomputeAllAttachments();
  renderModdingPanel();
  updateHud();
}

export function claimPendingAttachment() {
  const pending = game.pendingMod;
  if (!pending) return;
  const weapon = findWeapon(pending.weaponId);
  game.pendingMod = null;
  hideModdingPanel();
  if (weapon?.level >= MAX_WEAPON_LEVEL) tryEvolveWeapon(weapon);
  game.mode = "arena";
  updateHud();
}

function moddingAttachmentIcon(category, stars = 1) {
  const categoryIcons = {
    stat: "◆",
    elemental: "✦",
    behavior: "↯",
    support: "✚",
    utility: "◈",
  };
  return `${categoryIcons[category] || "★"}${Math.max(1, stars)}`;
}

function createSlotButton(weapon, pending, index, cost) {
  const owned = weapon.attachments[index];
  const definition = findAttachmentDefinition(owned?.key) || owned || {};
  const stars = owned?.stars || definition.stars || 1;
  const category = owned?.category || definition.category;
  const item = document.createElement("li");
  item.className = `mod-slot${index === pending.slotIndex ? " active" : ""}${owned?.locked ? " locked" : ""}`;

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "mod-slot-select";
  selectButton.setAttribute("aria-pressed", index === pending.slotIndex ? "true" : "false");
  selectButton.addEventListener("click", () => selectPendingAttachmentSlot(index));

  const icon = document.createElement("span");
  icon.className = `mod-slot-icon attach-stars-${stars}`;
  icon.textContent = moddingAttachmentIcon(category, stars);

  const copy = document.createElement("span");
  copy.className = "mod-slot-copy";

  const name = document.createElement("strong");
  name.textContent = owned ? owned.name || definition.name || "アタッチメント" : "空き枠";

  const meta = document.createElement("small");
  meta.textContent = owned
    ? `${starsLabel(stars)} / ${attachmentCategoryLabel(category)}${owned.locked ? " / ロック" : ""}`
    : "未装着";

  copy.append(name, meta);
  selectButton.append(icon, copy);

  const rerollButton = document.createElement("button");
  rerollButton.type = "button";
  rerollButton.className = "mod-slot-reroll";
  rerollButton.textContent = cost === 0 ? "⟳無料" : `⟳${cost}G`;
  rerollButton.disabled = !owned || !!owned.locked || (cost > 0 && (game.gold || 0) < cost);
  rerollButton.setAttribute("aria-label", `${owned?.name || index + 1 + "枠目"}をリロール`);
  rerollButton.addEventListener("click", () => rerollPendingAttachment(index));

  item.append(selectButton, rerollButton);
  return item;
}

export function renderModdingPanel() {
  if (!hud.moddingPanel) return;
  const pending = game.pendingMod;
  const weapon = pending ? findWeapon(pending.weaponId) : null;
  if (!pending || !weapon) {
    hideModdingPanel();
    return;
  }
  const maxSlots = maxAttachmentSlotsForWeapon(weapon);
  if (pending.slotIndex >= maxSlots || !weapon.attachments[pending.slotIndex]) {
    pending.slotIndex = firstEquippedSlotWithinLevel(weapon);
  }
  const attachment = weapon.attachments[pending.slotIndex] || pending.attachment;
  const definition = findAttachmentDefinition(attachment?.key) || attachment || {};
  const stars = attachment?.stars || definition.stars || 1;
  const category = attachment?.category || definition.category;
  hud.moddingWeaponName.textContent = weapon.name;
  hud.moddingWeaponLevel.textContent = `Lv ${weapon.level}/${MAX_WEAPON_LEVEL}・装着枠 ${maxSlots}/${MAX_ATTACHMENTS}`;
  hud.moddingGold.textContent = `${game.gold || 0}G`;
  const treasureIcon = hud.moddingPanel.querySelector(".treasure-icon");
  if (treasureIcon) {
    treasureIcon.className = `treasure-icon modding-main-icon attach-stars-${stars}`;
    treasureIcon.textContent = moddingAttachmentIcon(category, stars);
  }
  hud.moddingAttachmentName.textContent = attachment?.name || definition.name || "アタッチメント";
  hud.moddingAttachmentMeta.textContent = `${starsLabel(stars)} / ${attachmentCategoryLabel(category)}`;
  hud.moddingAttachmentText.textContent = definition.text || "このラン中だけ武器性能に反映されます。";
  hud.moddingSlots.replaceChildren();
  const cost = getModRerollCost(pending);
  for (let index = 0; index < maxSlots; index += 1) {
    hud.moddingSlots.append(createSlotButton(weapon, pending, index, cost));
  }
  hud.moddingReroll.textContent = cost === 0 ? "選択中を無料リロール" : `選択中をリロール ${cost}G`;
  hud.moddingReroll.disabled = !attachment || !!attachment?.locked || (cost > 0 && (game.gold || 0) < cost);
  hud.moddingTake.disabled = false;
  hud.moddingPanel.classList.remove("hidden");
}

export function hideModdingPanel() {
  hud.moddingPanel?.classList.add("hidden");
}
