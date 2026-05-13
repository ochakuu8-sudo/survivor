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

export function rerollPendingAttachment() {
  const pending = game.pendingMod;
  if (!pending) return;
  const weapon = findWeapon(pending.weaponId);
  if (!weapon || weapon.attachments[pending.slotIndex]?.locked) return;
  const cost = getModRerollCost(pending);
  if (cost > 0 && (game.gold || 0) < cost) return;
  if (cost > 0) game.gold -= cost;
  else pending.freeRerolls = Math.max(0, (pending.freeRerolls || 0) - 1);
  pending.rerollsUsed += 1;
  const next = rollAttachmentForWeapon(weapon, { weaponLevel: weapon.level, excludeKey: weapon.attachments[pending.slotIndex]?.key });
  if (!next) return;
  weapon.attachments[pending.slotIndex] = next;
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

export function renderModdingPanel() {
  if (!hud.moddingPanel) return;
  const pending = game.pendingMod;
  const weapon = pending ? findWeapon(pending.weaponId) : null;
  if (!pending || !weapon) {
    hideModdingPanel();
    return;
  }
  const attachment = weapon.attachments[pending.slotIndex] || pending.attachment;
  const definition = findAttachmentDefinition(attachment?.key) || attachment || {};
  hud.moddingWeaponName.textContent = weapon.name;
  hud.moddingWeaponLevel.textContent = `Lv ${weapon.level}/${MAX_WEAPON_LEVEL}・枠 ${maxAttachmentSlotsForWeapon(weapon)}/${MAX_ATTACHMENTS}`;
  hud.moddingGold.textContent = `${game.gold || 0}G`;
  hud.moddingAttachmentName.textContent = attachment?.name || definition.name || "アタッチメント";
  hud.moddingAttachmentMeta.textContent = `${starsLabel(attachment?.stars || definition.stars || 1)} / ${attachmentCategoryLabel(attachment?.category || definition.category)}`;
  hud.moddingAttachmentText.textContent = definition.text || "このラン中だけ武器性能に反映されます。";
  hud.moddingSlots.replaceChildren();
  for (let index = 0; index < MAX_ATTACHMENTS; index += 1) {
    const item = document.createElement("li");
    const owned = weapon.attachments[index];
    item.className = `mod-slot${index === pending.slotIndex ? " active" : ""}${owned?.locked ? " locked" : ""}`;
    item.textContent = owned ? `${index + 1}. ${owned.name} ${starsLabel(owned.stars)}${owned.locked ? " 🔒" : ""}` : `${index + 1}. 未解放`;
    hud.moddingSlots.append(item);
  }
  const cost = getModRerollCost(pending);
  hud.moddingReroll.textContent = cost === 0 ? "無料リロール" : `リロール ${cost}G`;
  hud.moddingReroll.disabled = !!attachment?.locked || (cost > 0 && (game.gold || 0) < cost);
  hud.moddingTake.disabled = false;
  hud.moddingPanel.classList.remove("hidden");
}

export function hideModdingPanel() {
  hud.moddingPanel?.classList.add("hidden");
}
