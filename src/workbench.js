import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { updateHud } from "./hud.js";
import {
  canCraftStoneSpecial,
  craftStoneSpecial,
  addStoneItemToWeapon,
  addStoneMaterial,
  ensureStoneMaterialInventory,
  isStoneWeapon,
  missingRecipeText,
  pickStoneItemChoices,
  recipeShortText,
  stoneItemIcon,
  formatStoneItemEffectSummary,
  countItemsByKey,
  STONE_EVOLUTIONS,
} from "./stoneItems.js";
import { STONE_MATERIALS, STONE_SPECIAL_ITEMS, findStoneMaterial } from "./data/stoneItems.js";

let statusText = "素材を確認し、作成可能な特殊アイテムを合成できます。所持素材と所持アイテムの効果は自動で発動します。";

export function openWorkbench(facility = null) {
  if (!game.player?.gear) return;
  game.modeBeforeWorkbench = game.mode;
  game.mode = "workbench";
  hud.workbenchPanel?.classList.remove("hidden");
  statusText = facility ? "作業台: 初期素材 → 特殊アイテム。素材の効果は所持中に発動し、作成後は特殊アイテムの効果に置き換わります。" : statusText;
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
    statusText = `宝物庫: ${cost}G 必要です（現在 ${game.gold || 0}G）。`;
    facility.holdTimer = 0;
    updateHud();
    return false;
  }
  game.gold = Math.max(0, (game.gold || 0) - cost);
  facility.opened = true;
  const rewards = pickStoneItemChoices(3, { includeRareSpecial: true });
  const stoneWeapon = (game.player?.gear?.weapons || []).find((weapon) => isStoneWeapon(weapon));
  rewards.forEach((item) => {
    if (findStoneMaterial(item.key)) addStoneMaterial(item.key, 1);
    else if (stoneWeapon) addStoneItemToWeapon(stoneWeapon, item.key);
  });
  statusText = `宝物庫を開放: ${rewards.map((item) => item.name).join("・")} を獲得。`;
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
    row.title = `${material.name}: ${formatStoneItemEffectSummary(material)}`;
    row.setAttribute("aria-label", `${material.name} ${inventory[material.key] || 0}個 ${formatStoneItemEffectSummary(material)}`);
    row.innerHTML = `<span class="workbench-item-icon">${stoneItemIcon(material)}</span><strong>×${inventory[material.key] || 0}</strong>`;
    materialList.append(row);
  });
  materialCard.append(materialTitle, materialList);
  weaponsRoot.append(materialCard);

  storageRoot.append(renderCraftEvolutionTree());

  if (hud.workbenchStorageCount) {
    const craftable = STONE_SPECIAL_ITEMS.filter((item) => canCraftStoneSpecial(item.key)).length;
    const completed = STONE_EVOLUTIONS.filter((evolution) => evolution.when(currentStoneItemCounts())).length;
    hud.workbenchStorageCount.textContent = `${craftable}/${STONE_SPECIAL_ITEMS.length} 作成可能 · 進化 ${completed}/${STONE_EVOLUTIONS.length}`;
  }
}

function renderCraftEvolutionTree() {
  const wrapper = document.createElement("div");
  wrapper.className = "workbench-craft-tree skill-node-map-wrap";

  const header = document.createElement("div");
  header.className = "workbench-craft-tree-legend";
  header.innerHTML = `
    <span><strong>素材</strong>を集めて特殊アイテムを作成</span>
    <span><strong>特殊アイテム</strong>の所持数が条件を満たすと進化アイテムへ到達</span>
  `;

  const viewport = document.createElement("div");
  viewport.className = "workbench-craft-tree-viewport skill-node-map-scroller";
  viewport.setAttribute("aria-label", "特殊アイテムの組み合わせで進化アイテムができるクラフトツリー");

  const mapWidth = 1180;
  const rowHeight = 138;
  const mapHeight = Math.max(620, STONE_EVOLUTIONS.length * rowHeight + 72);
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
    const y = 74 + rowIndex * rowHeight;
    const evolutionX = 980;
    const completed = evolution.when(counts);
    const requirements = evolution.progress || [];
    requirements.forEach((requirement, requirementIndex) => {
      const item = STONE_SPECIAL_ITEMS.find((candidate) => candidate.key === requirement.key);
      const x = 190 + requirementIndex * 250;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x + 78} ${y} C ${x + 170} ${y}, ${evolutionX - 150} ${y}, ${evolutionX - 72} ${y}`);
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
    viewport.scrollLeft = Math.max(0, mapWidth - viewport.clientWidth - 24);
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
  node.setAttribute("aria-label", `${item?.name || requirement.key} ${owned}/${requirement.need}、${craftable ? "作成可能" : missingRecipeText(item?.recipe || [])}`);
  node.innerHTML = `
    <span class="workbench-node-icon">${stoneItemIcon(item)}</span>
    <span class="workbench-node-copy">
      <strong>${item?.name || requirement.key}</strong>
      <small>所持 ${owned}/${requirement.need}</small>
      <em>${item ? recipeShortText(item.recipe) : "レシピ不明"}</em>
      <span>${craftable ? "タップで作成" : `不足: ${item ? missingRecipeText(item.recipe) : "-"}`}</span>
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
      <small>進化アイテム</small>
      <em>${requirementText}</em>
      <span>${completed ? "条件達成済み" : "特殊アイテムの組み合わせで進化"}</span>
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
