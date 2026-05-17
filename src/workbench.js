import { t } from "./i18n.js";
import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { updateHud } from "./hud.js";
import { beginStoneItemChoiceReward } from "./modding.js";
import {
  canCraftStoneSpecial,
  craftStoneSpecial,
  addStoneItemToWeapon,
  addStoneMaterial,
  ensureStoneMaterialInventory,
  isStoneWeapon,
  missingRecipeText,
  pickStoneSpecialItemChoices,
  recipeShortText,
  stoneItemIcon,
  formatStoneItemEffectSummary,
  countItemsByKey,
  STONE_EVOLUTIONS,
} from "./stoneItems.js";
import { STONE_MATERIALS, STONE_SPECIAL_ITEMS } from "./data/stoneItems.js";

let statusText = t("workbench.status");

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = facility ? t("workbench.facilityStatus") : statusText;
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
    if ((facility.type !== "workbench" && facility.type !== "treasureVault") || facility.used || facility.opened) continue;
    const reach = player.radius + facility.radius + 20;
    if (Math.hypot(player.x - facility.x, player.y - facility.y) > reach) {
      facility.holdTimer = 0;
      continue;
    }
    facility.holdTimer = Math.min(INTERACTION_HOLD_SECONDS, (facility.holdTimer || 0) + dt);
    if (facility.holdTimer < INTERACTION_HOLD_SECONDS) continue;
    facility.holdTimer = INTERACTION_HOLD_SECONDS;
    if (facility.type === "workbench") {
      facility.used = true;
      openWorkbench(facility);
      break;
    }
    openTreasureVault(facility);
    break;
  }
}

function openTreasureVault(facility) {
  const cost = Math.max(0, facility.cost || 0);
  if ((game.gold || 0) < cost) {
    statusText = t("workbench.vaultCost", { cost, gold: game.gold || 0 });
    facility.holdTimer = 0;
    updateHud();
    return false;
  }
  game.gold = Math.max(0, (game.gold || 0) - cost);
  facility.opened = true;
  const choices = pickStoneSpecialItemChoices(3);
  statusText = t("workbench.vaultOpen");
  beginStoneItemChoiceReward(choices, { source: "treasureVault", allowDiscard: false });
  updateHud();
  return true;
}


export function renderWorkbenchPanel() {
  if (!hud.workbenchPanel) return;
  const gear = game.player?.gear;
  const weaponsRoot = hud.workbenchWeapons;
  const storageRoot = hud.workbenchStorage;
  if (!gear || !weaponsRoot || !storageRoot) return;

  const heading = hud.workbenchPanel.querySelector("h1");
  if (heading) heading.textContent = t("workbench.craftingTitle");
  hud.workbenchStatus.textContent = statusText;
  weaponsRoot.replaceChildren();
  storageRoot.replaceChildren();

  const materialCard = document.createElement("article");
  materialCard.className = "workbench-weapon-card workbench-materials";
  const materialTitle = document.createElement("h2");
  materialTitle.textContent = t("workbench.materials");
  const materialList = document.createElement("div");
  materialList.className = "workbench-material-grid";
  const inventory = ensureStoneMaterialInventory();
  STONE_MATERIALS.forEach((material) => {
    const row = document.createElement("div");
    row.className = "workbench-material-chip";
    row.title = `${material.name}: ${formatStoneItemEffectSummary(material)}`;
    row.setAttribute("aria-label", t("workbench.materialAria", { name: material.name, count: inventory[material.key] || 0, summary: formatStoneItemEffectSummary(material) }));
    row.innerHTML = `<span class="workbench-item-icon">${stoneItemIcon(material)}</span><strong>×${inventory[material.key] || 0}</strong>`;
    materialList.append(row);
  });
  materialCard.append(materialTitle, materialList);
  weaponsRoot.append(materialCard);

  storageRoot.append(renderCraftEvolutionTree());

  if (hud.workbenchStorageCount) {
    const craftable = STONE_SPECIAL_ITEMS.filter((item) => canCraftStoneSpecial(item.key)).length;
    const completed = STONE_EVOLUTIONS.filter((evolution) => evolution.when(currentStoneItemCounts())).length;
    hud.workbenchStorageCount.textContent = t("workbench.storageCount", { craftable, total: STONE_SPECIAL_ITEMS.length, completed, evolutionTotal: STONE_EVOLUTIONS.length });
  }
}

function renderCraftEvolutionTree() {
  const wrapper = document.createElement("div");
  wrapper.className = "workbench-craft-tree skill-node-map-wrap";

  const header = document.createElement("div");
  header.className = "workbench-craft-tree-legend";
  header.innerHTML = t("workbench.treeHeader");

  const viewport = document.createElement("div");
  viewport.className = "workbench-craft-tree-viewport skill-node-map-scroller";
  viewport.setAttribute("aria-label", t("workbench.treeAria"));

  const mapWidth = 820;
  const rowHeight = 62;
  const mapHeight = Math.max(396, STONE_EVOLUTIONS.length * rowHeight + 24);
  const map = document.createElement("div");
  map.className = "workbench-craft-node-map skill-node-map";
  map.style.width = `${mapWidth}px`;
  map.style.height = `${mapHeight}px`;
  map.style.setProperty("--skill-grid-size", "92px");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("skill-node-links", "workbench-craft-links");
  svg.setAttribute("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  const counts = currentStoneItemCounts();
  STONE_EVOLUTIONS.forEach((evolution, rowIndex) => {
    const y = 42 + rowIndex * rowHeight;
    const evolutionX = 680;
    const completed = evolution.when(counts);
    const requirements = evolution.progress || [];
    requirements.forEach((requirement, requirementIndex) => {
      const item = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === requirement.key);
      const x = 180 + requirementIndex * 190;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x + 64} ${y} C ${x + 118} ${y}, ${evolutionX - 118} ${y}, ${evolutionX - 66} ${y}`);
      path.classList.add("skill-link", (counts[requirement.key] || 0) >= requirement.need ? "skill-link-owned" : "skill-link-locked");
      svg.appendChild(path);
      map.appendChild(renderSpecialRecipeNode(item, requirement, { x, y }));
    });
    map.appendChild(renderEvolutionResultNode(evolution, counts, { x: evolutionX, y }, completed));
  });

  map.appendChild(svg);
  viewport.appendChild(map);
  wrapper.append(header, viewport);
  requestAnimationFrame(() => {
    viewport.scrollLeft = 0;
  });
  return wrapper;
}

function renderSpecialRecipeNode(item, requirement, position) {
  const node = document.createElement("button");
  const craftable = item ? canCraftStoneSpecial(item.key) : false;
  const owned = currentStoneItemCounts()[requirement.key] || 0;
  const ready = owned >= requirement.need;
  node.type = "button";
  node.className = `workbench-craft-node workbench-special-node ${ready ? "workbench-node-owned" : craftable ? "workbench-node-available" : "workbench-node-locked"}`;
  node.style.setProperty("--node-x", `${position.x}px`);
  node.style.setProperty("--node-y", `${position.y}px`);
  node.disabled = !craftable;
  node.setAttribute("aria-label", t("workbench.nodeAria", { name: item?.name || requirement.key, owned, need: requirement.need, status: craftable ? t("stone.craftable") : missingRecipeText(item?.recipe || []) }));
  node.innerHTML = `
    <span class="workbench-node-icon">${stoneItemIcon(item)}</span>
    <span class="workbench-node-copy">
      <strong>${item?.name || requirement.key}</strong>
      <em>${item ? recipeShortText(item.recipe) : t("workbench.unknownRecipe")}</em>
      <small>${owned}/${requirement.need}</small>
    </span>
  `;
  if (item) node.addEventListener("click", () => craftAndStore(item.key));
  return node;
}

function renderEvolutionResultNode(evolution, counts, position, completed) {
  const node = document.createElement("article");
  node.className = `workbench-craft-node workbench-evolution-node ${completed ? "workbench-node-owned" : "workbench-node-evolution"}`;
  node.style.setProperty("--node-x", `${position.x}px`);
  node.style.setProperty("--node-y", `${position.y}px`);
  const requirementText = evolution.progress
    .map((requirement) => `${STONE_SPECIAL_ITEMS.find((item) => item.key === requirement.key)?.name || requirement.key} ${counts[requirement.key] || 0}/${requirement.need}`)
    .join(" + ");
  node.innerHTML = `
    <span class="workbench-node-icon">🦋</span>
    <span class="workbench-node-copy">
      <strong>${completed ? "✓ " : ""}${evolution.name}</strong>
      <em>${requirementText}</em>
      <small>${completed ? t("workbench.done") : t("workbench.evolution")}</small>
    </span>
  `;
  return node;
}

function currentStoneItemCounts() {
  const stoneWeapon = (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon));
  return countItemsByKey(stoneWeapon?.items || []);
}

function craftAndStore(key) {
  const stoneWeapon = (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon));
  if (!stoneWeapon) {
    statusText = t("workbench.noStoneWeapon");
    renderWorkbenchPanel();
    return;
  }

  const crafted = craftStoneSpecial(key);
  if (!crafted) {
    statusText = t("workbench.missingMaterials");
    renderWorkbenchPanel();
    return;
  }

  addStoneItemToWeapon(stoneWeapon, crafted.key);
  statusText = t("workbench.crafted", { item: crafted.name });
  renderWorkbenchPanel();
  updateHud();
}
