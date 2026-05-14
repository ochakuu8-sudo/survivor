import { INTERACTION_HOLD_SECONDS, getWeaponMaxAttachments } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import {
  attachmentCategoryLabel,
  findAttachmentDefinition,
  pickShopAttachment,
  starsLabel,
} from "./attachments.js";
import { updateHud } from "./hud.js";
import { beginAttachmentReward } from "./modding.js";

let statusText = "作業台はアタッチメント報酬を生成します。装着しなければ消えます。";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  const roll = pickShopAttachment((game.wave || 1) + 1);
  if (roll?.definition) {
    beginAttachmentReward({ definition: roll.definition, stars: roll.stars || roll.definition.stars || 1 }, { source: "workbench", allowDiscard: true });
    updateHud();
    return;
  }
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = "作業台から使えるアタッチメントは出ませんでした。";
  renderWorkbenchPanel();
  updateHud();
}

export function closeWorkbench() {
  hud.workbenchPanel?.classList.add("hidden");
  game.mode = "arena";
  game.modeBeforeWorkbench = null;
  updateHud();
}

export function updateFacilities(dt = 0) {
  const player = game.player;
  const facilities = game.dungeon?.facilities || [];
  if (!player || facilities.length === 0 || game.mode !== "arena") return;
  for (const facility of facilities) {
    if (facility.type !== "workbench" || facility.used) continue;
    const reach = player.radius + facility.radius + 20;
    if (Math.hypot(player.x - facility.x, player.y - facility.y) > reach) {
      facility.holdTimer = 0;
      continue;
    }
    facility.holdTimer = Math.min(INTERACTION_HOLD_SECONDS, (facility.holdTimer || 0) + dt);
    if (facility.holdTimer >= INTERACTION_HOLD_SECONDS) {
      facility.holdTimer = INTERACTION_HOLD_SECONDS;
      facility.used = true;
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

  const empty = document.createElement("p");
  empty.className = "workbench-empty";
  empty.textContent = "アタッチメント所持欄はありません。作業台・宝箱の報酬は、その場で装着するか捨てます。";
  storageRoot.append(empty);

  if (hud.workbenchStorageCount) hud.workbenchStorageCount.textContent = "非所持制";
}

function renderWeaponWorkbenchCard(weapon, weaponIndex) {
  const card = document.createElement("article");
  card.className = "workbench-weapon-card";
  const active = game.player.gear.activeWeaponIndex === weaponIndex ? " / ACTIVE" : "";
  const title = document.createElement("h2");
  title.textContent = `武器${weaponIndex + 1}: ${weapon.name}${active}`;
  const meta = document.createElement("small");
  meta.textContent = `スロット ${filledSlots(weapon)}/${getWeaponMaxAttachments(weapon)} / 外せません・通常枠は報酬で上書き`;
  const slots = document.createElement("div");
  slots.className = "workbench-slots";
  const maxSlots = getWeaponMaxAttachments(weapon);
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
    slots.append(renderSlotReadout(weapon, slotIndex));
  }
  card.append(title, meta, slots);
  return card;
}

function filledSlots(weapon) {
  let count = 0;
  for (let index = 0; index < getWeaponMaxAttachments(weapon); index += 1) {
    if (weapon.attachments[index]) count += 1;
  }
  return count;
}

function renderSlotReadout(weapon, slotIndex) {
  const attachment = weapon.attachments[slotIndex];
  const button = document.createElement("button");
  button.type = "button";
  button.className = `workbench-slot${attachment ? " filled" : " empty"}`;
  button.disabled = true;
  if (attachment) {
    const definition = findAttachmentDefinition(attachment.key) || attachment;
    button.innerHTML = `<strong>${attachment.locked ? "🔒 " : ""}${attachment.cursed ? "☠ " : ""}${attachment.name}</strong><small>${starsLabel(attachment.stars)} / ${attachmentCategoryLabel(attachment.category || definition.category)} / ${attachment.locked ? "上書き不可" : "上書き可"}</small>`;
  } else {
    button.innerHTML = `<strong>空き</strong><small>次の報酬をノーリスク装着</small>`;
  }
  return button;
}
