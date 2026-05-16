import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { updateHud } from "./hud.js";
import {
  canCraftStoneSpecial,
  craftStoneSpecial,
  addStoneItemToWeapon,
  ensureStoneMaterialInventory,
  isStoneWeapon,
  missingRecipeText,
  recipeShortText,
} from "./stoneItems.js";
import { STONE_MATERIALS, STONE_SPECIAL_ITEMS } from "./data/stoneItems.js";

let statusText = "素材を確認し、作成可能な特殊アイテムを合成できます。所持アイテムの効果は自動で発動します。";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = facility ? "作業台: 初期素材 → 特殊アイテム。作成したアイテムは所持数として加算されます。" : statusText;
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
  if (heading) heading.textContent = "アイテムクラフト作業台";
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

  STONE_SPECIAL_ITEMS.forEach((item) => storageRoot.append(renderRecipeCard(item)));

  if (hud.workbenchStorageCount) {
    const craftable = STONE_SPECIAL_ITEMS.filter((item) => canCraftStoneSpecial(item.key)).length;
    hud.workbenchStorageCount.textContent = `${craftable}/${STONE_SPECIAL_ITEMS.length} 作成可能`;
  }
}

function renderRecipeCard(item) {
  const craftable = canCraftStoneSpecial(item.key);
  const card = document.createElement("article");
  card.className = `workbench-storage-item${craftable ? " selected" : ""}`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "workbench-craft-button";
  button.disabled = !craftable;
  button.addEventListener("click", () => craftAndStore(item.key));
  button.innerHTML = `<strong>${item.name}</strong><small>レシピ: ${recipeShortText(item.recipe)}</small><span>${item.description}</span><small>${craftable ? "作成して所持数に追加" : `不足: ${missingRecipeText(item.recipe)}`}</small>`;
  card.append(button);
  return card;
}

function craftAndStore(key) {
  const stoneWeapon = (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon));
  if (!stoneWeapon) {
    statusText = "石ころ武器がないためアイテムを作成できません。";
    renderWorkbenchPanel();
    return;
  }

  const crafted = craftStoneSpecial(key);
  if (!crafted) {
    statusText = "素材が足りません。";
    renderWorkbenchPanel();
    return;
  }

  addStoneItemToWeapon(stoneWeapon, crafted.key);
  statusText = `「${crafted.name}」を作成し、所持アイテムに追加しました。`;
  renderWorkbenchPanel();
  updateHud();
}
