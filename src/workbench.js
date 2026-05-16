import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { updateHud } from "./hud.js";
import { beginStoneItemReward } from "./modding.js";
import {
  canCraftStoneSpecial,
  countItemsByKey,
  craftStoneSpecial,
  ensureStoneItemSlots,
  ensureStoneMaterialInventory,
  formatStoneItemSummary,
  isStoneWeapon,
  missingRecipeText,
  recipeShortText,
  stoneEvolutionProgress,
  stoneItemCapacity,
} from "./stoneItems.js";
import { STONE_MATERIALS, STONE_SPECIAL_ITEMS, findStoneItem } from "./data/stoneItems.js";

let statusText = "素材を確認し、作成可能な特殊アイテムを合成して石ころに装備できます。";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = facility ? "作業台: 初期素材 → 特殊アイテム → 石ころ装備 → 武器進化。" : statusText;
  ensureStoneMaterialInventory();
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

  const heading = hud.workbenchPanel.querySelector("h1");
  if (heading) heading.textContent = "石ころクラフト作業台";
  hud.workbenchStatus.textContent = statusText;
  weaponsRoot.replaceChildren();
  storageRoot.replaceChildren();

  const materialCard = document.createElement("article");
  materialCard.className = "workbench-weapon-card workbench-materials";
  const materialTitle = document.createElement("h2");
  materialTitle.textContent = "所持素材";
  const materialList = document.createElement("div");
  materialList.className = "workbench-material-grid";
  const inventory = ensureStoneMaterialInventory();
  STONE_MATERIALS.forEach((material) => {
    const row = document.createElement("div");
    row.className = "workbench-material-chip";
    row.innerHTML = `<strong>${material.shortName || material.name} ×${inventory[material.key] || 0}</strong><small>${material.description}</small>`;
    materialList.append(row);
  });
  materialCard.append(materialTitle, materialList);
  weaponsRoot.append(materialCard);

  const stoneWeapon = (gear.weapons || []).find((weapon) => isStoneWeapon(weapon));
  if (stoneWeapon) weaponsRoot.append(renderStoneWeaponCard(stoneWeapon));

  STONE_SPECIAL_ITEMS.forEach((item) => storageRoot.append(renderRecipeCard(item)));

  if (hud.workbenchStorageCount) {
    const craftable = STONE_SPECIAL_ITEMS.filter((item) => canCraftStoneSpecial(item.key)).length;
    hud.workbenchStorageCount.textContent = `${craftable}/${STONE_SPECIAL_ITEMS.length} 作成可能`;
  }
}

function renderStoneWeaponCard(weapon) {
  ensureStoneItemSlots(weapon);
  const card = document.createElement("article");
  card.className = "workbench-weapon-card";
  const counts = countItemsByKey(weapon.items || []);
  const progress = stoneEvolutionProgress(counts)
    .map((evolution) => `${evolution.complete ? "✓" : "…"} ${evolution.name}: ${evolution.requirements.map((req) => `${req.name} ${Math.min(req.count, req.need)}/${req.need}`).join(" + ")}`)
    .join("<br>");
  const title = document.createElement("h2");
  title.textContent = `${weapon.name} 装備スロット`;
  const meta = document.createElement("small");
  meta.innerHTML = `特殊アイテム ${weapon.items.length}/${stoneItemCapacity(weapon)}<br>${formatStoneItemSummary(weapon)}<br><strong>進化候補</strong><br>${progress}`;
  const slots = document.createElement("div");
  slots.className = "workbench-slots";
  for (let index = 0; index < stoneItemCapacity(weapon); index += 1) {
    const current = weapon.items[index];
    const definition = findStoneItem(current?.key);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `workbench-slot${current ? " filled" : " empty"}`;
    slot.disabled = true;
    slot.innerHTML = current
      ? `<strong>${definition?.name || current.key}</strong><small>${definition?.description || "効果"}</small>`
      : `<strong>空き</strong><small>作成した特殊アイテムをここへ装備</small>`;
    slots.append(slot);
  }
  card.append(title, meta, slots);
  return card;
}

function renderRecipeCard(item) {
  const craftable = canCraftStoneSpecial(item.key);
  const card = document.createElement("article");
  card.className = `workbench-storage-item${craftable ? " selected" : ""}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "workbench-craft-button";
  button.disabled = !craftable;
  button.addEventListener("click", () => craftAndEquip(item.key));
  button.innerHTML = `<strong>${item.name}</strong><small>レシピ: ${recipeShortText(item.recipe)}</small><span>${item.description}</span><small>${craftable ? "作成して装備先を選択" : `不足: ${missingRecipeText(item.recipe)}`}</small>`;
  card.append(button);
  return card;
}

function craftAndEquip(key) {
  const crafted = craftStoneSpecial(key);
  if (!crafted) {
    statusText = "素材が足りません。";
    renderWorkbenchPanel();
    return;
  }
  statusText = `「${crafted.name}」を作成しました。装備先スロットを選んでください。`;
  beginStoneItemReward(crafted, { source: "workbench", allowDiscard: false });
}
