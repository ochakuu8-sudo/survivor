import { INTERACTION_HOLD_SECONDS, MAX_STORED_ATTACHMENTS, getWeaponMaxAttachments } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import {
  addAttachmentToWeapon,
  attachmentCategoryLabel,
  canAttachToWeapon,
  findAttachmentDefinition,
  recomputeAllAttachments,
  removeAttachmentFromStorage,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";

let selectedStorageIndex = null;
let activeFacility = null;
let statusText = "所持アタッチメントを選び、空きスロットを押してください。";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  activeFacility = facility;
  selectedStorageIndex = null;
  statusText = "所持アタッチメントを選び、空きスロットを押してください。";
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  renderWorkbenchPanel();
  updateHud();
}

export function closeWorkbench() {
  hud.workbenchPanel?.classList.add("hidden");
  selectedStorageIndex = null;
  activeFacility = null;
  game.mode = "arena";
  game.modeBeforeWorkbench = null;
  updateHud();
}

export function updateFacilities(dt = 0) {
  const player = game.player;
  const facilities = game.dungeon?.facilities || [];
  if (!player || facilities.length === 0 || game.mode !== "arena") return;
  for (const facility of facilities) {
    if (facility.type !== "workbench") continue;
    const reach = player.radius + facility.radius + 20;
    if (Math.hypot(player.x - facility.x, player.y - facility.y) > reach) {
      facility.holdTimer = 0;
      continue;
    }
    facility.holdTimer = Math.min(INTERACTION_HOLD_SECONDS, (facility.holdTimer || 0) + dt);
    if (facility.holdTimer >= INTERACTION_HOLD_SECONDS) {
      facility.holdTimer = INTERACTION_HOLD_SECONDS;
      openWorkbench(facility);
      break;
    }
  }
}

export function renderWorkbenchPanel() {
  if (!hud.workbenchPanel) return;
  const gear = game.player?.gear;
  const weaponsRoot = hud.workbenchWeapons;
  const storageRoot = hud.workbenchStorage;
  if (!gear || !weaponsRoot || !storageRoot) return;

  hud.workbenchStatus.textContent = statusText;
  weaponsRoot.replaceChildren();
  storageRoot.replaceChildren();

  gear.weapons.forEach((weapon, weaponIndex) => {
    weaponsRoot.append(renderWeaponWorkbenchCard(weapon, weaponIndex));
  });

  if ((gear.storageAttachments || []).length === 0) {
    const empty = document.createElement("p");
    empty.className = "workbench-empty";
    empty.textContent = "所持アタッチメントなし。宝箱を探そう。";
    storageRoot.append(empty);
  }

  (gear.storageAttachments || []).forEach((attachment, index) => {
    const definition = findAttachmentDefinition(attachment.key) || attachment;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workbench-storage-item${selectedStorageIndex === index ? " selected" : ""}`;
    button.innerHTML = `<strong>${attachment.cursed ? "☠ " : ""}${attachment.name}</strong><small>${starsLabel(attachment.stars)} / ${attachmentCategoryLabel(attachment.category)}</small><span>${definition.text || "装着で効果発動"}</span>`;
    button.addEventListener("click", () => {
      selectedStorageIndex = selectedStorageIndex === index ? null : index;
      statusText = selectedStorageIndex === null ? "選択解除しました。" : `${attachment.name} を選択中。空きスロットを押してください。`;
      renderWorkbenchPanel();
    });
    storageRoot.append(button);
  });

  hud.workbenchStorageCount.textContent = `${(gear.storageAttachments || []).length}/${gear.storageAttachmentsMax || MAX_STORED_ATTACHMENTS}`;
}

function renderWeaponWorkbenchCard(weapon, weaponIndex) {
  const card = document.createElement("article");
  card.className = "workbench-weapon-card";
  const active = game.player.gear.activeWeaponIndex === weaponIndex ? " / ACTIVE" : "";
  const title = document.createElement("h2");
  title.textContent = `武器${weaponIndex + 1}: ${weapon.name}${active}`;
  const meta = document.createElement("small");
  meta.textContent = `スロット ${weapon.attachments.length}/${getWeaponMaxAttachments(weapon)}`;
  const slots = document.createElement("div");
  slots.className = "workbench-slots";
  const maxSlots = getWeaponMaxAttachments(weapon);
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
    slots.append(renderSlotButton(weapon, slotIndex));
  }
  card.append(title, meta, slots);
  return card;
}

function renderSlotButton(weapon, slotIndex) {
  const attachment = weapon.attachments[slotIndex];
  const button = document.createElement("button");
  button.type = "button";
  button.className = `workbench-slot${attachment ? " filled" : " empty"}`;
  if (attachment) {
    button.innerHTML = `<strong>${attachment.locked ? "🔒 " : ""}${attachment.cursed ? "☠ " : ""}${attachment.name}</strong><small>${starsLabel(attachment.stars)} / ${attachmentCategoryLabel(attachment.category)}</small>`;
    button.addEventListener("click", () => detachWeaponAttachment(weapon.id, slotIndex));
  } else {
    button.innerHTML = `<strong>空き</strong><small>クリックで装着</small>`;
    button.addEventListener("click", () => attachStoredAttachment(selectedStorageIndex, weapon.id));
  }
  return button;
}

export function attachStoredAttachment(storageIndex, weaponId) {
  const gear = game.player?.gear;
  const weapon = gear?.weapons.find((item) => item.id === weaponId);
  if (!gear || !weapon) return false;
  if (!Number.isInteger(storageIndex)) {
    statusText = "先に所持アタッチメントを選んでください。";
    renderWorkbenchPanel();
    return false;
  }
  const attachment = gear.storageAttachments[storageIndex];
  const definition = findAttachmentDefinition(attachment?.key) || attachment;
  if (!attachment || !definition) return false;
  if (weapon.attachments.length >= getWeaponMaxAttachments(weapon)) {
    statusText = "この武器のスロットは満杯です。";
    renderWorkbenchPanel();
    return false;
  }
  if (!canAttachToWeapon(definition, weapon)) {
    statusText = "この武器には装着できません。";
    renderWorkbenchPanel();
    return false;
  }
  const removed = removeAttachmentFromStorage(storageIndex, gear);
  if (!removed) return false;
  if (!addAttachmentToWeapon(weapon, { ...removed, definition })) {
    gear.storageAttachments.splice(storageIndex, 0, removed);
    statusText = "装着できませんでした。";
    renderWorkbenchPanel();
    return false;
  }
  selectedStorageIndex = null;
  statusText = `${weapon.name} に ${removed.name} を装着しました。`;
  recomputeAllAttachments();
  renderWorkbenchPanel();
  updateHud();
  return true;
}

export function detachWeaponAttachment(weaponId, slotIndex) {
  const gear = game.player?.gear;
  const weapon = gear?.weapons.find((item) => item.id === weaponId);
  if (!gear || !weapon) return false;
  const attachment = weapon.attachments[slotIndex];
  if (!attachment) return false;
  if (attachment.locked || attachment.cursed) {
    statusText = attachment.cursed ? "呪い付きアタッチメントは外せません。" : "このアタッチメントは外せません。";
    renderWorkbenchPanel();
    return false;
  }
  if ((gear.storageAttachments || []).length >= (gear.storageAttachmentsMax || MAX_STORED_ATTACHMENTS)) {
    statusText = "所持欄が満杯で外せません。";
    renderWorkbenchPanel();
    return false;
  }
  weapon.attachments.splice(slotIndex, 1);
  gear.storageAttachments.push(attachment);
  statusText = `${attachment.name} を外して所持欄に戻しました。`;
  recomputeAllAttachments();
  renderWorkbenchPanel();
  updateHud();
  return true;
}
