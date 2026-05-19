import { t } from "./i18n.js";
import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { updateHud } from "./hud.js";
import { beginStoneItemChoiceReward } from "./modding.js";
import {
  canCraftStoneSpecial,
  ensureStoneMaterialInventory,
  isStoneWeapon,
  isStoneSpecialUnlocked,
  missingRecipeText,
  pickStoneSpecialItemChoices,
  recipeCounts,
  stoneItemIcon,
  formatStoneItemEffectSummary,
  countItemsByKey,
  equipStoneSpecial,
  unequipStoneSpecial,
  stoneSpecialRank,
  romanRank,
  stoneSpecialSlotCapacity,
  stoneEvolutionProgress,
  STONE_EVOLUTIONS,
} from "./stoneItems.js";
import { STONE_MATERIALS, STONE_SPECIAL_ITEMS, findStoneItem } from "./data/stoneItems.js";

let statusText = t("workbench.status");
let workbenchReadOnly = false;
let selectedCraftItemKey = null;
let pendingReplaceItemKey = null;
let craftTreeViewportState = { left: 0, top: 0 };
let workbenchInfoSlot = null;
const MOBILE_WORKBENCH_MEDIA = "(max-width: 760px), (max-height: 640px)";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  workbenchReadOnly = false;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = facility ? t("workbench.facilityStatus") : t("workbench.status");
  ensureStoneMaterialInventory();
  document.body.classList.add("workbench-tree-open");
  if (!selectedCraftItemKey) selectedCraftItemKey = STONE_SPECIAL_ITEMS[0]?.key || null;
  renderWorkbenchPanel();
  updateHud();
}

export function openCraftTreeReference() {
  if (!game.player?.gear || game.mode !== "arena") return;
  workbenchReadOnly = true;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = t("workbench.referenceStatus");
  ensureStoneMaterialInventory();
  document.body.classList.add("workbench-tree-open");
  if (!selectedCraftItemKey) selectedCraftItemKey = STONE_SPECIAL_ITEMS[0]?.key || null;
  renderWorkbenchPanel();
  updateHud();
}

export function closeWorkbench() {
  hud.workbenchPanel?.classList.add("hidden");
  game.mode = game.modeBeforeWorkbench || "arena";
  game.modeBeforeWorkbench = null;
  workbenchReadOnly = false;
  pendingReplaceItemKey = null;
  document.body.classList.remove("workbench-tree-open");
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
  let choices = pickStoneSpecialItemChoices(6).filter((item) => isStoneSpecialUnlocked(item.key)).slice(0, 3);
  if (choices.length === 0) choices = STONE_MATERIALS.slice(0, 3);
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

  const stoneWeapon = getStoneWeapon();
  const mobileTreeMode = window.matchMedia(MOBILE_WORKBENCH_MEDIA).matches;

  if (mobileTreeMode) {
    storageRoot.append(renderCompactMaterialBar());
    const treeStage = document.createElement("div");
    treeStage.className = "workbench-tree-stage";
    treeStage.append(renderModuleEvolutionTree());
    storageRoot.append(treeStage);

    const equippedSlot = document.createElement("div");
    equippedSlot.className = "workbench-equipped-slot";
    equippedSlot.append(renderEquippedStoneItemsCompact(stoneWeapon));
    storageRoot.append(equippedSlot);
    
    workbenchInfoSlot = document.createElement("div");
    workbenchInfoSlot.id = "workbenchInfoSlot";
    workbenchInfoSlot.className = "workbench-info-slot";
    storageRoot.append(workbenchInfoSlot);
  } else {
    const inventory = ensureStoneMaterialInventory();
    const materialCard = document.createElement("article");
    materialCard.className = "workbench-weapon-card workbench-materials";
    const materialTitle = document.createElement("h2");
    materialTitle.textContent = t("workbench.materials");
    const materialList = document.createElement("div");
    materialList.className = "workbench-material-grid";
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
    weaponsRoot.append(renderEquippedStoneItems(stoneWeapon));
    storageRoot.append(renderSpecialItemList(stoneWeapon));
    storageRoot.append(renderModuleEvolutionTree());
  }

  if (!mobileTreeMode) {
    workbenchInfoSlot = document.createElement("div");
    workbenchInfoSlot.id = "workbenchInfoSlot";
    workbenchInfoSlot.className = "workbench-info-slot";
    storageRoot.append(workbenchInfoSlot);
  }
  updateCraftSelectionUi();
  updateWorkbenchInfoPanel();

  if (hud.workbenchStorageCount) {
    if (mobileTreeMode) {
      hud.workbenchStorageCount.textContent = "";
      return;
    }
    const unlocked = STONE_SPECIAL_ITEMS.filter((item) => isStoneSpecialUnlocked(item.key)).length;
    const completed = stoneEvolutionProgress(stoneWeapon).filter((evolution) => evolution.complete).length;
    hud.workbenchStorageCount.textContent = t("workbench.storageCount", { craftable: unlocked, total: STONE_SPECIAL_ITEMS.length, completed, evolutionTotal: STONE_EVOLUTIONS.length });
  }
}

function renderEquippedStoneItemsCompact(stoneWeapon) {
  const card = document.createElement("section");
  card.className = "workbench-equipped-compact";
  const title = document.createElement("h2");
  title.textContent = t("workbench.equippedItems");
  const list = document.createElement("div");
  list.className = "workbench-equipped-compact-list";
  const capacity = stoneSpecialSlotCapacity(stoneWeapon);
  for (let index = 0; index < capacity; index += 1) {
    const equipped = stoneWeapon?.items?.[index] || null;
    const item = equipped ? STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === equipped.key) : null;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `workbench-equipped-chip${item ? " filled" : " empty"}`;
    chip.innerHTML = `
      <span class="workbench-item-icon">${item ? stoneItemIcon(item) : "+"}</span>
      <strong>${item ? item.name : t("workbench.emptySlot")}</strong>
      <small>${item ? romanRank(stoneSpecialRank(item.key)) : ""}</small>
    `;
    if (item) chip.addEventListener("click", () => selectCraftItem(item.key));
    list.append(chip);
  }
  card.append(title, list);
  return card;
}

function updateEquippedModulesPanel() {
  const slot = hud.workbenchStorage?.querySelector(".workbench-equipped-slot");
  if (!slot) return;
  slot.replaceChildren(renderEquippedStoneItemsCompact(getStoneWeapon()));
}

function renderCompactMaterialBar() {
  const inventory = ensureStoneMaterialInventory();
  const bar = document.createElement("div");
  bar.className = "workbench-material-bar";
  STONE_MATERIALS.forEach((material) => {
    const chip = document.createElement("div");
    chip.className = "workbench-material-bar-chip";
    chip.title = material.name;
    chip.innerHTML = `<span class="workbench-item-icon">${stoneItemIcon(material)}</span><strong>${inventory[material.key] || 0}</strong>`;
    bar.append(chip);
  });
  return bar;
}

function getStoneWeapon() {
  return (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon)) || null;
}

function renderEquippedStoneItems(stoneWeapon) {
  const card = document.createElement("article");
  card.className = "workbench-weapon-card workbench-equipped-items";
  const title = document.createElement("h2");
  title.textContent = t("workbench.equippedItems");
  const list = document.createElement("div");
  list.className = "workbench-material-grid";
  const capacity = stoneSpecialSlotCapacity(stoneWeapon);
  for (let index = 0; index < capacity; index += 1) {
    const equipped = stoneWeapon?.items?.[index] || null;
    const item = equipped ? STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === equipped.key) : null;
    const row = document.createElement("div");
    row.className = "workbench-material-chip";
    row.innerHTML = `<span class="workbench-item-icon">${item ? stoneItemIcon(item) : "+"}</span><strong>${item ? `${item.name} ${romanRank(stoneSpecialRank(item.key))}` : t("workbench.emptySlot")}</strong>`;
    if (item && !workbenchReadOnly) {
      const button = document.createElement("button");
      button.type = "button";
      if (pendingReplaceItemKey) {
        const replacement = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === pendingReplaceItemKey);
        button.textContent = t("workbench.replaceWith", { item: replacement?.name || pendingReplaceItemKey });
        button.addEventListener("click", () => replacePendingModule(stoneWeapon, index));
      } else {
        button.textContent = t("workbench.unequip");
        button.addEventListener("click", () => {
          unequipStoneSpecial(stoneWeapon, index);
          statusText = t("workbench.unequipped", { item: item.name });
          renderWorkbenchPanel();
          updateHud();
        });
      }
      row.append(button);
    }
    list.append(row);
  }
  if (pendingReplaceItemKey && !workbenchReadOnly) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "workbench-cancel-replace";
    cancel.textContent = t("workbench.cancelReplace");
    cancel.addEventListener("click", cancelPendingReplace);
    card.append(title, list, cancel);
    return card;
  }
  card.append(title, list);
  return card;
}

function renderSpecialItemList(stoneWeapon) {
  const wrapper = document.createElement("div");
  wrapper.className = "workbench-special-list workbench-craft-tree skill-node-map-wrap";
  const grid = document.createElement("div");
  grid.className = "workbench-material-grid";
  STONE_SPECIAL_ITEMS.forEach((item) => {
    const unlocked = isStoneSpecialUnlocked(item.key);
    const equippedIndex = stoneWeapon?.items?.findIndex((equipped) => equipped?.key === item.key) ?? -1;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `workbench-material-chip ${unlocked ? "workbench-node-available" : "workbench-node-locked"}`;
    card.dataset.craftItemKey = item.key;
    card.setAttribute("aria-disabled", unlocked ? "false" : "true");
    const rank = stoneSpecialRank(item.key);
    card.innerHTML = `<span class="workbench-item-icon">${stoneItemIcon(item)}</span><strong>${item.name} ${romanRank(rank)}</strong><small>${unlocked ? (equippedIndex >= 0 ? t("workbench.equipped") : t("workbench.unlocked")) : t("workbench.locked")}</small><em>${requirementText(item.recipe)}</em>`;
    card.addEventListener("click", () => selectCraftItem(item.key));
    grid.append(card);
  });
  wrapper.append(grid);
  return wrapper;
}

function renderModuleEvolutionTree() {
  const wrapper = document.createElement("div");
  wrapper.className = "workbench-craft-tree skill-node-map-wrap";

  const viewport = document.createElement("div");
  viewport.className = "workbench-craft-tree-viewport skill-node-map-scroller";
  viewport.setAttribute("aria-label", t("workbench.treeAria"));

  const stoneWeapon = getStoneWeapon();
  const progress = stoneEvolutionProgress(stoneWeapon);
  const specialX = 96;
  const materialStartX = 315;
  const requirementGap = 190;
  const rowHeight = 62;
  const topPadding = 42;
  const maxMaterialCount = Math.max(2, ...STONE_EVOLUTIONS.map((evolution) => (evolution.progress || []).filter((requirement) => findStoneItem(requirement.key)?.category !== "special").length));
  const evolutionX = materialStartX + maxMaterialCount * requirementGap + 95;
  const mapWidth = Math.max(930, evolutionX + 190);
  const mapHeight = Math.max(660, STONE_SPECIAL_ITEMS.length * rowHeight + 24, STONE_EVOLUTIONS.length * rowHeight + 24);
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

  const specialPositions = new Map();
  STONE_SPECIAL_ITEMS.forEach((item, index) => {
    const position = { x: specialX, y: topPadding + index * rowHeight };
    specialPositions.set(item.key, position);
    map.appendChild(renderSpecialCatalogNode(item, position, selectedCraftItemKey === item.key));
  });

  progress.forEach((evolution, rowIndex) => {
    const y = topPadding + rowIndex * rowHeight;
    const sourceEvolution = STONE_EVOLUTIONS[rowIndex];
    const requirements = evolution.requirements || [];
    const materialRequirements = [];
    const specialRequirements = [];

    requirements.forEach((requirement, requirementIndex) => {
      const item = findStoneItem((sourceEvolution.progress || [])[requirementIndex]?.key);
      if (item?.category === "special") specialRequirements.push({ item, requirement });
      else materialRequirements.push({ item, requirement });
    });

    specialRequirements.forEach(({ item, requirement }) => {
      const from = specialPositions.get(item.key);
      if (!from) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${from.x + 64} ${from.y} C ${materialStartX - 90} ${from.y}, ${evolutionX - 150} ${y}, ${evolutionX - 66} ${y}`);
      path.classList.add("skill-link", requirement.equipped ? "skill-link-owned" : "skill-link-locked");
      svg.appendChild(path);
    });

    materialRequirements.forEach(({ item, requirement }, materialIndex) => {
      const x = materialStartX + materialIndex * requirementGap;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x + 64} ${y} C ${x + 118} ${y}, ${evolutionX - 118} ${y}, ${evolutionX - 66} ${y}`);
      path.classList.add("skill-link", requirement.count >= requirement.need ? "skill-link-owned" : "skill-link-locked");
      svg.appendChild(path);
      map.appendChild(renderSpecialRecipeNode(item, requirement, { x, y }, selectedCraftItemKey === item?.key));
    });

    map.appendChild(renderEvolutionResultNode(evolution, {}, { x: evolutionX, y }, evolution.complete));
  });

  map.appendChild(svg);
  viewport.appendChild(map);
  viewport.scrollLeft = craftTreeViewportState.left || 0;
  viewport.scrollTop = craftTreeViewportState.top || 0;
  viewport.addEventListener("scroll", () => {
    craftTreeViewportState = { left: viewport.scrollLeft, top: viewport.scrollTop };
  }, { passive: true });
  wrapper.append(viewport);
  return wrapper;
}

function renderSpecialCatalogNode(item, position, selected = false) {
  const node = document.createElement("button");
  const unlocked = isStoneSpecialUnlocked(item.key);
  const counts = currentStoneItemCounts();
  const owned = counts[item.key] || 0;
  node.type = "button";
  node.className = `workbench-craft-node workbench-special-node workbench-special-catalog-node ${selected ? "workbench-node-selected" : ""} ${unlocked ? "workbench-node-available" : "workbench-node-locked"}`;
  node.dataset.craftItemKey = item.key;
  node.setAttribute("aria-disabled", unlocked ? "false" : "true");
  node.style.setProperty("--node-x", `${position.x}px`);
  node.style.setProperty("--node-y", `${position.y}px`);
  node.setAttribute("aria-label", t("workbench.nodeAria", { name: item.name, owned, need: 1, status: unlocked ? t("workbench.unlocked") : missingRecipeText(item.recipe) }));
  node.innerHTML = `
    <span class="workbench-node-icon">${stoneItemIcon(item)}</span>
    <span class="workbench-node-copy">
      <strong>${item.name}</strong>
      <span class="workbench-node-recipe">${recipeIconText(item.recipe)}</span>
      <small>${t("workbench.rank", { rank: romanRank(stoneSpecialRank(item.key)) })}</small>
    </span>
  `;
  node.addEventListener("click", () => selectCraftItem(item.key));
  return node;
}

function renderSpecialRecipeNode(item, requirement, position, selected = false) {
  const node = document.createElement("button");
  const craftable = item ? canCraftStoneSpecial(item.key) : false;
  const owned = requirement.count ?? currentStoneItemCounts()[requirement.key] ?? 0;
  const ready = requirement.type === "equipped" ? !!requirement.equipped : owned >= requirement.need;
  node.type = "button";
  node.className = `workbench-craft-node workbench-special-node ${selected ? "workbench-node-selected" : ""} ${ready ? "workbench-node-owned" : craftable ? "workbench-node-available" : "workbench-node-locked"}`;
  if (item?.category === "special") node.dataset.craftItemKey = item.key;
  node.style.setProperty("--node-x", `${position.x}px`);
  node.style.setProperty("--node-y", `${position.y}px`);
  node.setAttribute("aria-label", t("workbench.nodeAria", { name: item?.name || requirement.name || requirement.key, owned, need: requirement.need, status: ready ? t("workbench.unlocked") : (item?.recipe ? missingRecipeText(item.recipe) : t("workbench.locked")) }));
  node.innerHTML = `
    <span class="workbench-node-icon">${stoneItemIcon(item)}</span>
    <span class="workbench-node-copy">
      <strong>${item?.name || requirement.name || requirement.key}</strong>
      <span class="workbench-node-recipe">${item?.recipe ? recipeIconText(item.recipe) : (requirement.type === "equipped" ? t("workbench.requiresEquipped") : t("workbench.materials"))}</span>
      <small>${requirement.type === "equipped" ? (ready ? t("workbench.equipped") : t("workbench.requiresEquipped")) : `${owned}/${requirement.need}`}</small>
    </span>
  `;
  if (item?.category === "special") node.addEventListener("click", () => selectCraftItem(item.key));
  return node;
}

function renderEvolutionResultNode(evolution, counts, position, completed) {
  const node = document.createElement("article");
  node.className = `workbench-craft-node workbench-evolution-node ${completed ? "workbench-node-owned" : "workbench-node-evolution"}`;
  node.style.setProperty("--node-x", `${position.x}px`);
  node.style.setProperty("--node-y", `${position.y}px`);
  const requirementText = (evolution.requirements || [])
    .map((requirement) => requirement.type === "equipped" ? `${requirement.name}: ${requirement.equipped ? t("workbench.equipped") : t("workbench.requiresEquipped")}` : `${requirement.name} ${Math.min(requirement.count, requirement.need)}/${requirement.need}`)
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

function recipeIconText(recipe = []) {
  const entries = Object.entries(recipeCounts(recipe));
  if (entries.length === 0) return "";
  return entries
    .map(([key, count]) => {
      const material = findStoneItem(key);
      return `<span class="workbench-recipe-chip" title="${material?.name || key}"><span class="workbench-recipe-icon">${stoneItemIcon(material)}</span><b>×${count}</b></span>`;
    })
    .join("");
}

function renderModuleInfoPanel() {
  const item = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === selectedCraftItemKey) || STONE_SPECIAL_ITEMS[0];
  const panel = document.createElement("aside");
  panel.className = "workbench-info-panel";
  panel.setAttribute("aria-live", "polite");
  if (!item) {
    panel.textContent = t("workbench.selectPrompt");
    return panel;
  }

  const unlocked = isStoneSpecialUnlocked(item.key);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary workbench-info-craft";
  button.disabled = workbenchReadOnly || !unlocked;
  button.textContent = workbenchReadOnly ? t("workbench.referenceOnly") : unlocked ? t("workbench.craftButton") : t("workbench.needMaterials");
  button.addEventListener("click", () => equipSelectedModule(item.key));

  panel.innerHTML = `
    <div class="workbench-info-row">
      <div class="workbench-info-head">
        <span class="workbench-info-icon">${stoneItemIcon(item)}</span>
        <div>
          <strong>${item.name}</strong>
          <small>${formatStoneItemEffectSummary(item)}</small>
        </div>
      </div>
    </div>
  `;
  panel.querySelector(".workbench-info-row")?.append(button);
  return panel;
}

function selectCraftItem(key) {
  if (!key) return;
  selectedCraftItemKey = key;
  updateCraftSelectionUi();
  updateWorkbenchInfoPanel();
}

function updateWorkbenchInfoPanel() {
  if (!workbenchInfoSlot?.isConnected) return;
  workbenchInfoSlot.replaceChildren(renderModuleInfoPanel());
}

function updateCraftSelectionUi() {
  if (!hud.workbenchPanel) return;
  hud.workbenchPanel.querySelectorAll("[data-craft-item-key]").forEach((node) => {
    node.classList.toggle("workbench-node-selected", node.dataset.craftItemKey === selectedCraftItemKey);
  });
}

function scrollInfoPanelIntoView() {
  if (!workbenchInfoSlot?.isConnected) return;
  if (!window.matchMedia(MOBILE_WORKBENCH_MEDIA).matches) return;
  workbenchInfoSlot.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function currentStoneItemCounts() {
  const stoneWeapon = getStoneWeapon();
  return countItemsByKey(stoneWeapon?.items || []);
}

function equipSelectedItem(stoneWeapon, key) {
  if (workbenchReadOnly) {
    statusText = t("workbench.referenceStatus");
    renderWorkbenchPanel();
    return;
  }
  if (!stoneWeapon) {
    statusText = t("workbench.noStoneWeapon");
    renderWorkbenchPanel();
    return;
  }
  if (equipStoneSpecial(stoneWeapon, key)) {
    const item = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === key);
    statusText = t("workbench.equippedStatus", { item: item?.name || key });
    if (window.matchMedia(MOBILE_WORKBENCH_MEDIA).matches) {
      updateCraftSelectionUi();
      updateWorkbenchInfoPanel();
      updateEquippedModulesPanel();
    } else renderWorkbenchPanel();
    updateHud();
    return;
  }
  pendingReplaceItemKey = key;
  statusText = t("workbench.replaceMode");
  renderWorkbenchPanel();
  updateHud();
}

function requirementText(recipe = []) {
  const inventory = ensureStoneMaterialInventory();
  return Object.entries(recipeCounts(recipe))
    .map(([key, need]) => `${findStoneItem(key)?.shortName || key} ${Math.min(inventory[key] || 0, need)}/${need}`)
    .join(" + ");
}

function equipSelectedModule(key) {
  equipSelectedItem(getStoneWeapon(), key);
}

function replacePendingModule(stoneWeapon, slotIndex) {
  const key = pendingReplaceItemKey;
  if (!key || !stoneWeapon) return;
  const item = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === key);
  if (equipStoneSpecial(stoneWeapon, key, slotIndex)) {
    statusText = t("workbench.replacedStatus", { item: item?.name || key });
    pendingReplaceItemKey = null;
  } else {
    statusText = t("workbench.noEmptySlot");
  }
  if (window.matchMedia(MOBILE_WORKBENCH_MEDIA).matches) {
    updateCraftSelectionUi();
    updateWorkbenchInfoPanel();
    updateEquippedModulesPanel();
  } else renderWorkbenchPanel();
  updateHud();
}

function cancelPendingReplace() {
  pendingReplaceItemKey = null;
  statusText = t("workbench.status");
  renderWorkbenchPanel();
}
