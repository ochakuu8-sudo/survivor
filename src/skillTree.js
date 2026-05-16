import { WAVE_NODE_PRICE_BASE } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { ACTIVE_ATTACHMENTS, findAttachmentDefinition, recomputeAllAttachments } from "./attachments.js";
import {
  addWeaponBasePercent,
  addWeaponPierce,
  boostWeaponImpactPercent,
  getActiveWeapon,
  weaponStatusLabel,
  weaponMetaLabel,
} from "./weapons.js";
import { applyStoneEvolutionByName } from "./stoneItems.js";
import { updateHud } from "./hud.js";

const selectedSkillNodes = { weapon: null };

const weaponNode = (id, tier, title, text, cost, requires = [], effect = {}) => ({
  scope: "weapon",
  id,
  tier,
  title,
  text,
  cost,
  requires,
  ...effect,
});


export const WEAPON_SKILL_TREES = {
  石: [
    weaponNode("stone_bounce", 1, "跳ね石", "命中した石が近くの別敵へ1回跳ねる。黄色い反射線と短い残像が出る。", 50, [], { custom: (weapon) => { weapon.ricochetCount += 1; weapon.ricochetSpeedScale = Math.max(weapon.ricochetSpeedScale || 1, 1.1); setStoneVisual(weapon, { trail: "yellow", hitEffect: "bounce" }); setStoneFlag(weapon, "bounce"); } }),
    weaponNode("stone_reflect", 2, "反射する石", "跳弾 +1。敵へ強く誘導され、橙色の少し大きい石になる。", 110, ["stone_bounce"], { custom: (weapon) => { weapon.ricochetCount += 1; weapon.ricochetRange = Math.max(weapon.ricochetRange || 220, 280); addWeaponBasePercent(weapon, "radius", 0.1, { min: 2 }); boostWeaponImpactPercent(weapon, 0.1); setStoneVisual(weapon, { form: "bouncy", trail: "orange", hitEffect: "bounce", sizeScale: 1.1 }); weapon.bulletTint = [1, 0.72, 0.25]; weapon.bulletGlow = "glowAmber"; } }),
    weaponNode("stone_split_bounce", 3, "割れ跳ね", "跳弾時に短射程の小石を1個飛ばす。本体は欠けた見た目になる。", 220, ["stone_reflect"], { custom: (weapon) => { weapon.splitShardCount = (weapon.splitShardCount || 0) + 1; setStoneVisual(weapon, { form: "cracked", trail: "orange", hitEffect: "shatter" }); setStoneFlag(weapon, "splitBounce"); } }),
    weaponNode("stone_elastic_core", 4, "弾む核", "跳弾するたび最大3回まで石が膨らみ、威力も上がる。", 360, ["stone_split_bounce"], { custom: (weapon) => { weapon.elasticGrowth = { size: 0.08, damage: 0.08, max: 3 }; setStoneVisual(weapon, { form: "bouncy", trail: "orange", hitEffect: "bounce" }); setStoneFlag(weapon, "elasticCore"); } }),
    weaponNode("stone_evolve_rubber", 5, "進化：ゴムボール", "跳弾時に2つへ分裂するゴムボール化。1投あたり最大10弾まで。", 600, ["stone_elastic_core"], { evolveTo: "ゴムボール" }),

    weaponNode("stone_cracked", 1, "ひび割れ石", "命中時に小範囲へ破砕ダメージ。ひび割れた大きめの石になる。", 50, [], { custom: (weapon) => { weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 36); weapon.explosionDamage = Math.max(weapon.explosionDamage || 0, weapon.damage * 0.3); addWeaponBasePercent(weapon, "radius", 0.08, { min: 2 }); boostWeaponImpactPercent(weapon, 0.08); setStoneVisual(weapon, { form: "cracked", hitEffect: "shatter", sizeScale: 1.08 }); setStoneFlag(weapon, "cracked"); weapon.bulletSprite = "stoneCracked"; } }),
    weaponNode("stone_shrapnel", 2, "破片弾", "命中時に3方向へ短射程の破片を飛ばす。鋭い形の石になる。", 110, ["stone_cracked"], { custom: (weapon) => { weapon.hitShardCount = (weapon.hitShardCount || 0) + 3; addWeaponBasePercent(weapon, "radius", 0.1, { min: 2 }); boostWeaponImpactPercent(weapon, 0.1); setStoneVisual(weapon, { form: "sharp", trail: "yellow", hitEffect: "shatter", sizeScale: 1.1 }); weapon.bulletSprite = "stoneSharp"; } }),
    weaponNode("stone_blast", 3, "爆ぜ石", "着弾時の爆発が大きくなり、中心が赤く光る大型石になる。", 220, ["stone_shrapnel"], { custom: (weapon) => { addWeaponBasePercent(weapon, "explosionRadius", 0.35, { min: 36 }); addWeaponBasePercent(weapon, "explosionDamage", 0.3, { min: 0 }); boostWeaponImpactPercent(weapon, 0.1); addWeaponBasePercent(weapon, "radius", 0.15, { min: 2 }); setStoneVisual(weapon, { form: "cracked", trail: "red", hitEffect: "explosion", sizeScale: 1.15 }); weapon.bulletTint = [1, 0.46, 0.32]; weapon.effectTint = [0.76, 0.48, 0.28]; weapon.effectGlow = "glowRed"; } }),
    weaponNode("stone_chain_shatter", 4, "連鎖破砕", "爆発で倒した敵の地点に35%で小さな二次破砕が発生する。", 360, ["stone_blast"], { custom: (weapon) => { weapon.chainShatterChance = Math.max(weapon.chainShatterChance || 0, 0.35); weapon.chainShatterRadiusScale = 0.6; weapon.chainShatterDamageScale = 0.45; setStoneVisual(weapon, { form: "cracked", trail: "red", hitEffect: "explosion" }); setStoneFlag(weapon, "chainShatter"); } }),
    weaponNode("stone_evolve_meteor", 5, "進化：隕石核", "黒赤い隕石核化。大爆発と6個の破片を放つが攻撃頻度は少し低下。", 600, ["stone_chain_shatter"], { evolveTo: "隕石核" }),

    weaponNode("stone_heavy", 1, "重石", "大きく重い石。威力とノックバックが上がるが投げ間隔は少し長い。", 50, [], { custom: (weapon) => { addWeaponBasePercent(weapon, "radius", 0.2, { min: 2 }); boostWeaponImpactPercent(weapon, 0.25); weapon.knockback += 8; addWeaponBasePercent(weapon, "fireRate", -0.05, { min: 0.15 }); setStoneVisual(weapon, { form: "heavy", hitEffect: "heavy", sizeScale: 1.2 }); weapon.bulletSprite = "stoneHeavy"; } }),
    weaponNode("stone_piercing", 2, "貫き石", "貫通 +1。ばらつきが減り、鋭い石がまっすぐ速く飛ぶ。", 110, ["stone_heavy"], { custom: (weapon) => { addWeaponPierce(weapon, 1); weapon.spread = Math.max(0.03, weapon.spread * 0.7); addWeaponBasePercent(weapon, "bulletSpeed", 0.15, { min: 1 }); boostWeaponImpactPercent(weapon, 0.1); addWeaponBasePercent(weapon, "radius", 0.1, { min: 2 }); setStoneVisual(weapon, { form: "sharp", trail: "white", hitEffect: "pierce", sizeScale: 1.1 }); weapon.bulletSprite = "stoneSharp"; } }),
    weaponNode("stone_critical_throw", 3, "会心投げ", "4投に1回、白く光る巨大な確定会心石を投げる。", 220, ["stone_piercing"], { custom: (weapon) => { weapon.criticalThrowEvery = 4; weapon.criticalThrowDamageScale = 1.5; weapon.criticalThrowSizeScale = 1.35; weapon.critChance += 0.1; setStoneVisual(weapon, { form: "sharp", trail: "white", hitEffect: "critical" }); setStoneFlag(weapon, "criticalThrow"); } }),
    weaponNode("stone_boulder", 4, "巨岩投げ", "岩サイズの石で敵を押し潰す。さらに大きく強いが遅くなる。", 360, ["stone_critical_throw"], { custom: (weapon) => { addWeaponBasePercent(weapon, "radius", 0.3, { min: 2 }); boostWeaponImpactPercent(weapon, 0.35); weapon.knockback += 15; addWeaponBasePercent(weapon, "bulletSpeed", -0.08, { min: 1 }); addWeaponBasePercent(weapon, "fireRate", -0.08, { min: 0.15 }); setStoneVisual(weapon, { form: "heavy", hitEffect: "heavy", sizeScale: 1.3 }); weapon.bulletSprite = "stoneHeavy"; } }),
    weaponNode("stone_evolve_master", 5, "進化：名人の一石", "2.5秒ごとに最もHPの高い敵へ、白く光る巨大な精密投石を放つ。", 600, ["stone_boulder"], { evolveTo: "名人の一石" }),
  ],
};


function ensureStoneState(weapon) {
  if (!weapon) return;
  weapon.stoneVisual = {
    form: "normal",
    sizeScale: 1,
    trail: "none",
    hitEffect: "normal",
    ...(weapon.stoneVisual || {}),
  };
  weapon.stoneFlags = { ...(weapon.stoneFlags || {}) };
}

function setStoneVisual(weapon, visual = {}) {
  ensureStoneState(weapon);
  weapon.stoneVisual = { ...weapon.stoneVisual, ...visual };
}

function setStoneFlag(weapon, flag) {
  ensureStoneState(weapon);
  if (flag) weapon.stoneFlags[flag] = true;
}

function treeForWeapon(weapon = getActiveWeapon()) {
  const key = weapon?.baseName || weapon?.name || "石";
  return WEAPON_SKILL_TREES[key] || WEAPON_SKILL_TREES.石;
}

export function initSkillProgress() {
  if (!game.treePurchases) game.treePurchases = { weapon: {} };
  if (!game.treePurchases.weapon) game.treePurchases.weapon = {};
  game.freeNodeCredits = { weapon: 0 };
  game.evolutionMaterials = 0;
  game.nextWaveBuff = null;
}

export function enterUpgradeTree() {
  game.debugSkillTreeMode = false;
  game.mode = "upgradeTree";
  selectedSkillNodes.weapon = null;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  renderSkillTree();
  hud.skillTree?.classList.remove("hidden");
  updateHud();
}

export function enterDebugSkillTree() {
  if (!game.player?.gear?.weapons?.length) return;
  game.debugSkillTreeMode = true;
  game.mode = "debugSkillTree";
  selectedSkillNodes.weapon = null;
  hud.pauseMenu?.classList.add("hidden");
  renderSkillTree();
  hud.skillTree?.classList.remove("hidden");
  updateHud();
}

export function renderSkillTree() {
  if (!hud.skillTree || !hud.skillTreeWeaponNodes) return;
  const weapon = getActiveWeapon();
  hud.skillTreeWeaponName.textContent = weapon?.name || "武器未選択";
  hud.skillTreeWeaponMeta.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponStatusLabel(weapon)}` : "";
  hud.skillTreeGold.textContent = game.debugSkillTreeMode ? "∞" : String(game.totalSkillPoints || 0);
  hud.skillTreeWave.textContent = game.debugSkillTreeMode ? "DEBUG" : "ラン外成長";
  hud.skillTreeFree.textContent = game.debugSkillTreeMode ? "無制限ON/OFF" : freeCreditText();
  const fullscreenPreferred = isMobileSkillTreeFullscreenPreferred();
  setMobileSkillTreeFullscreen(fullscreenPreferred);
  const currentSkillPoints = game.totalSkillPoints || 0;
  const title = hud.skillTree.querySelector(".panel-head h1");
  if (title) {
    title.textContent = game.debugSkillTreeMode
      ? "DEBUG：スキルツリー無制限ON/OFF"
      : fullscreenPreferred
        ? `スキルツリー（所持${currentSkillPoints}SP）`
        : "SPで武器を恒久強化";
  }
  const footerHint = hud.skillTree.querySelector(".skill-tree-footer p");
  if (footerHint) {
    footerHint.textContent = game.debugSkillTreeMode
      ? "DEBUG中はSPと前提条件を無視して、取得状態を何度でもON/OFFできます。"
      : "スマホ側と同じノードマップです。ドラッグで移動し、タップ／クリックで詳細を確認できます。";
  }
  if (hud.skillTreeContinue) {
    hud.skillTreeContinue.textContent = game.debugSkillTreeMode ? "一時停止へ戻る" : "再挑戦へ";
  }
  hud.skillTreeWeaponNodes.replaceChildren(renderNodeMap(treeForWeapon(weapon), weapon));
}

function renderNodeMap(nodes, weapon) {
  return renderMobileSkillTree(nodes, weapon);
}


function isMobileSkillTreeFullscreenPreferred() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 720px)").matches || window.matchMedia("(pointer: coarse)").matches;
}

function renderMobileSkillTree(nodes, weapon, scope = nodes[0]?.scope || "weapon") {
  const selectedNode = mobileSelectedNodeForScope(nodes, scope);
  const hadSelection = !!selectedNode;
  const layout = layoutMobileSkillNodes(nodes);
  const gridMeta = layout.gridMeta || { tiers: 1, mapWidth: 400, mapHeight: 920, hub: { x: 200, y: 64, unit: "px" } };

  const wrapper = document.createElement("div");
  wrapper.className = "mobile-skill-tree";

  const viewport = document.createElement("div");
  viewport.className = "mobile-skill-tree-viewport skill-node-map-scroller";
  viewport.setAttribute("aria-label", "スマホ向けスキルツリーマップ。ドラッグで移動し、タップで詳細を確認できます。");

  const map = document.createElement("div");
  map.className = "skill-node-map mobile-skill-node-map";
  map.dataset.baseWidth = String(gridMeta.mapWidth);
  map.dataset.baseHeight = String(gridMeta.mapHeight);
  map.style.setProperty("--skill-grid-size", `${gridMeta.cellSize || 140}px`);
  map.style.width = `${gridMeta.mapWidth}px`;
  map.style.height = `${gridMeta.mapHeight}px`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("skill-node-links", "mobile-skill-node-links");
  svg.setAttribute("viewBox", `0 0 ${gridMeta.mapWidth} ${gridMeta.mapHeight}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");

  for (const node of nodes) {
    const requirements = node.requires?.length ? node.requires : [null];
    for (const requiredId of requirements) {
      const from = requiredId ? layout.get(requiredId) : gridMeta.hub;
      const to = layout.get(node.id);
      if (!from || !to) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", straightLinkPath(from, to));
      path.classList.add("skill-link", requiredId ? linkStatus(requiredId, node.scope) : "skill-link-root", ...selectedLinkClasses(requiredId, node, selectedNode, nodes));
      svg.appendChild(path);
    }
  }

  map.appendChild(renderSkillGridLabels(gridMeta));
  map.appendChild(svg);
  map.appendChild(renderSkillHub(weapon, gridMeta.hub));
  for (const node of nodes) {
    const position = layout.get(node.id);
    map.appendChild(renderNodeButton(node, weapon, position, selectedNode?.id === node.id));
  }

  viewport.appendChild(map);
  wrapper.append(viewport);
  if (selectedNode) wrapper.appendChild(renderMobileSkillBottomSheet(selectedNode, scope));
  requestAnimationFrame(() => setupMobileSkillViewport(viewport, map, hadSelection ? layout.get(selectedNode?.id) : null, gridMeta.hub));
  return wrapper;
}

function renderMobileSkillBottomSheet(node, scope) {
  const detail = renderNodeDetail(node, scope, { detailedRequirements: true });
  detail.classList.add("mobile-skill-bottom-sheet", `mobile-skill-bottom-sheet-${nodeStatus(node)}`);
  return detail;
}

function mobileSelectedNodeForScope(nodes, scope) {
  const selectedId = selectedSkillNodes[scope];
  return nodes.find((node) => node.id === selectedId) || null;
}

function setMobileSkillTreeFullscreen(enabled) {
  document.body?.classList.toggle("mobile-skill-tree-open", !!enabled);
}

function layoutMobileSkillNodes(nodes) {
  const viewportWidth = typeof window === "undefined" ? 400 : window.innerWidth || 400;
  const viewportHeight = typeof window === "undefined" ? 700 : window.innerHeight || 700;
  const columnGap = viewportWidth <= 370 ? 118 : 132;
  const rowGap = viewportWidth <= 370 ? 92 : 98;
  const nodeSize = viewportWidth <= 370 ? 38 : 42;
  const bottomPanelClearance = Math.round(clamp(viewportHeight * 0.34, 210, 300));
  return buildColumnSkillLayout(nodes, {
    columnGap,
    rowGap,
    paddingX: Math.max(72, Math.round(columnGap * 0.64)),
    paddingY: 58,
    paddingBottom: bottomPanelClearance,
    nodeWidth: nodeSize,
    nodeHeight: nodeSize,
    hubSize: nodeSize + 6,
  });
}

function selectedLinkClasses(requiredId, node, selectedNode, nodes) {
  if (!selectedNode || !requiredId) return [];
  const selectedId = selectedNode.id;
  const classes = [];
  if (node.id === selectedId || isAncestorNode(node.id, selectedId, nodes)) classes.push("skill-link-selected-prereq");
  if (requiredId === selectedId || isAncestorNode(selectedId, requiredId, nodes)) classes.push("skill-link-selected-branch");
  return classes;
}

function isAncestorNode(ancestorId, nodeId, nodes, seen = new Set()) {
  if (!ancestorId || !nodeId || seen.has(nodeId)) return false;
  seen.add(nodeId);
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node?.requires?.length) return false;
  if (node.requires.includes(ancestorId)) return true;
  return node.requires.some((id) => isAncestorNode(ancestorId, id, nodes, seen));
}

function setupMobileSkillViewport(viewport, map, selectedPosition, hubPosition) {
  if (!viewport || !map) return;
  const baseWidth = Number(map.dataset.baseWidth) || map.offsetWidth;
  const baseHeight = Number(map.dataset.baseHeight) || map.offsetHeight;
  map.dataset.scale = "1";
  map.style.width = `${baseWidth}px`;
  map.style.height = `${baseHeight}px`;
  centerSkillMapOnNode(viewport, selectedPosition || hubPosition || { x: baseWidth / 2, y: baseHeight / 2, unit: "px" });
  enableMobileMapGestures(viewport, map, baseWidth, baseHeight, 1);
}

function applyMobileMapScale(map, baseWidth, baseHeight, scale) {
  const nextScale = clamp(scale, 1, 1);
  map.dataset.scale = String(nextScale);
  map.style.width = `${Math.round(baseWidth * nextScale)}px`;
  map.style.height = `${Math.round(baseHeight * nextScale)}px`;
}

function enableMobileMapGestures(viewport, map, baseWidth, baseHeight, minScale) {
  if (viewport.dataset.gesturesReady === "true") return;
  viewport.dataset.gesturesReady = "true";
  let lastTouch = null;
  let pinchStart = null;
  let pointerDrag = null;
  let suppressNextClick = false;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    pointerDrag = { x: event.clientX, y: event.clientY, moved: false };
    viewport.setPointerCapture?.(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pointerDrag || event.pointerType === "touch") return;
    const dx = event.clientX - pointerDrag.x;
    const dy = event.clientY - pointerDrag.y;
    viewport.scrollLeft -= dx;
    viewport.scrollTop -= dy;
    pointerDrag.moved = pointerDrag.moved || Math.abs(dx) + Math.abs(dy) > 5;
    pointerDrag.x = event.clientX;
    pointerDrag.y = event.clientY;
  });

  const endPointerDrag = (event) => {
    if (!pointerDrag || event.pointerType === "touch") return;
    viewport.releasePointerCapture?.(event.pointerId);
    suppressNextClick = pointerDrag.moved;
    pointerDrag = null;
  };
  viewport.addEventListener("pointerup", endPointerDrag);
  viewport.addEventListener("pointercancel", endPointerDrag);
  viewport.addEventListener("pointerleave", endPointerDrag);
  viewport.addEventListener("click", (event) => {
    if (!suppressNextClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextClick = false;
  }, true);

  viewport.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      lastTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY, moved: false };
      pinchStart = null;
    } else if (event.touches.length === 2) {
      const distance = touchDistance(event.touches);
      pinchStart = { distance, scale: Number(map.dataset.scale) || 1 };
      lastTouch = null;
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", (event) => {
    if (event.touches.length === 2 && pinchStart) {
      event.preventDefault();
      const before = mapPointAtViewportCenter(viewport);
      const scale = pinchStart.scale * (touchDistance(event.touches) / Math.max(1, pinchStart.distance));
      applyMobileMapScale(map, baseWidth, baseHeight, clamp(scale, minScale, 1.45));
      restoreMapPointAtViewportCenter(viewport, before);
      return;
    }
    if (event.touches.length === 1 && lastTouch) {
      const touch = event.touches[0];
      const dx = touch.clientX - lastTouch.x;
      const dy = touch.clientY - lastTouch.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) {
        event.preventDefault();
        viewport.scrollLeft -= dx;
        viewport.scrollTop -= dy;
        lastTouch.moved = true;
      }
      lastTouch.x = touch.clientX;
      lastTouch.y = touch.clientY;
    }
  }, { passive: false });

  viewport.addEventListener("touchend", (event) => {
    if (!event.touches.length) {
      lastTouch = null;
      pinchStart = null;
    }
  }, { passive: true });
}

function touchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function mapPointAtViewportCenter(viewport) {
  return {
    x: viewport.scrollLeft + viewport.clientWidth / 2,
    y: viewport.scrollTop + viewport.clientHeight / 2,
  };
}

function restoreMapPointAtViewportCenter(viewport, point) {
  viewport.scrollLeft = Math.max(0, point.x - viewport.clientWidth / 2);
  viewport.scrollTop = Math.max(0, point.y - viewport.clientHeight / 2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function renderCompactSkillTree(nodes, weapon, scope = nodes[0]?.scope || "weapon") {
  const wrapper = document.createElement("div");
  wrapper.className = "compact-skill-tree";

  const selectedNode = compactSelectedNodeForScope(nodes, scope);
  const list = document.createElement("div");
  list.className = "compact-skill-tree-list";

  const { tiers, evolution } = groupCompactNodes(nodes);
  const tierEntries = Array.from(tiers.entries()).sort(([a], [b]) => a - b);
  for (const [tier, group] of tierEntries) {
    list.appendChild(renderCompactSkillSection(tier, group, weapon, selectedNode));
  }
  if (evolution.length) {
    list.appendChild(renderCompactSkillSection(null, evolution, weapon, selectedNode, true));
  }

  const detail = renderCompactSkillDetail(selectedNode, scope);
  wrapper.append(list, detail);
  return wrapper;
}

function renderCompactSkillSection(tier, group, weapon, selectedNode, hasEvolution = false) {
  const section = document.createElement("section");
  section.className = `compact-skill-tier${hasEvolution ? " compact-skill-tier-evolution" : ""}`;
  section.setAttribute("aria-label", compactTierTitle(tier, hasEvolution));

  const heading = document.createElement("div");
  heading.className = "compact-skill-tier-heading";
  heading.innerHTML = `
    <span>${compactTierTitle(tier, hasEvolution)}</span>
    <small>${compactTierHint(group)}</small>
  `;
  section.appendChild(heading);

  for (const node of group) {
    section.appendChild(renderCompactSkillCard(node, weapon, selectedNode?.id === node.id));
  }
  return section;
}

function groupCompactNodes(nodes) {
  const tiers = new Map();
  const evolution = [];
  for (const node of nodes) {
    if (isEvolutionNode(node)) {
      evolution.push(node);
      continue;
    }
    const tier = visualTier(node, nodes);
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier).push(node);
  }
  for (const group of [...tiers.values(), evolution]) {
    group.sort((a, b) => compactNodePriority(a) - compactNodePriority(b) || nodes.indexOf(a) - nodes.indexOf(b));
  }
  return { tiers, evolution };
}

function compactNodePriority(node) {
  return { available: 0, costly: 1, locked: 2, owned: 3 }[nodeStatus(node)] ?? 4;
}

function compactSelectedNodeForScope(nodes, scope) {
  const selectedId = selectedSkillNodes[scope];
  return nodes.find((node) => node.id === selectedId) || null;
}

function renderCompactSkillCard(node, weapon, selected = false) {
  const status = nodeStatus(node);
  const card = document.createElement("button");
  card.type = "button";
  card.className = `compact-skill-card compact-skill-card-${status}${selected ? " compact-skill-card-selected" : ""}${isEvolutionNode(node) ? " compact-skill-card-evolution" : ""}`;
  card.setAttribute("aria-pressed", selected ? "true" : "false");
  card.setAttribute("aria-label", `${node.title}、${statusLabel(status)}、詳細を表示`);

  card.dataset.nodeId = node.id;
  card.innerHTML = `
    <span class="compact-skill-card-icon" aria-hidden="true">${nodeIcon(node, weapon)}</span>
    <span class="compact-skill-card-copy">
      <span class="compact-skill-card-title-row">
        <strong>${status === "owned" ? "✓ " : ""}${node.title}</strong>
        <span class="compact-skill-status">${statusLabel(status)}</span>
      </span>
      <span class="compact-skill-card-main-row">
        <span class="compact-skill-card-text">${node.text}</span>
        <span class="compact-skill-cost">${nodeCost(node)}SP</span>
      </span>
    </span>
  `;
  card.addEventListener("click", () => {
    selectedSkillNodes[node.scope] = node.id;
    updateCompactSkillSelection(node);
    updateCompactSkillDetail(node);
  });
  return card;
}

function updateCompactSkillSelection(node) {
  const tree = hud.skillTreeWeaponNodes?.querySelector(".compact-skill-tree");
  if (!tree) return;
  for (const card of tree.querySelectorAll(".compact-skill-card")) {
    const selected = card.dataset.nodeId === node.id;
    card.classList.toggle("compact-skill-card-selected", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function updateCompactSkillDetail(node) {
  const current = hud.skillTreeWeaponNodes?.querySelector(".compact-skill-detail-slot");
  if (!current) return;
  current.replaceWith(renderCompactSkillDetail(node, node.scope));
}

function renderCompactSkillDetail(node, scope) {
  const detail = node ? renderNodeDetail(node, scope, { detailedRequirements: true }) : renderCompactSkillHint();
  detail.classList.add("compact-skill-detail-slot");
  if (node) detail.classList.add("compact-skill-selected-detail");
  return detail;
}

function renderCompactSkillHint() {
  const hint = document.createElement("aside");
  hint.className = "compact-skill-detail-hint";
  hint.textContent = "気になるノードをタップすると、効果・コスト・前提ノードをここに表示します。";
  return hint;
}

function compactTierTitle(tier, hasEvolution = false) {
  return hasEvolution ? "進化ノード" : `Tier ${tier}`;
}

function compactTierHint(group) {
  if (group.some(isEvolutionNode)) return "最終進化への到達点";
  const available = group.filter((node) => nodeStatus(node) === "available").length;
  const owned = group.filter((node) => nodeStatus(node) === "owned").length;
  return `取得済み ${owned}/${group.length}${available ? ` / 開放可能 ${available}` : ""}`;
}

function isEvolutionNode(node) {
  return !!node.evolveTo || node.title.includes("進化");
}

function layoutSkillNodes(nodes) {
  return buildColumnSkillLayout(nodes, {
    columnGap: 180,
    rowGap: 116,
    paddingX: 92,
    paddingY: 76,
    hubSize: 70,
  });
}

const SKILL_TREE_COLUMNS = 3;
const SKILL_TREE_CENTER_COLUMN = Math.floor(SKILL_TREE_COLUMNS / 2);

function buildColumnSkillLayout(nodes, options = {}) {
  const tierById = new Map(nodes.map((node) => [node.id, visualTier(node, nodes)]));
  const maxTier = Math.max(...tierById.values(), 1);
  const layout = new Map();
  const columnById = new Map();
  const rowById = new Map();
  const occupied = new Set();
  const tierGroups = new Map();
  const tierStartRows = new Map();
  const tierRowCounts = new Map();

  for (const node of nodes) {
    const tier = tierById.get(node.id) || 1;
    if (!tierGroups.has(tier)) tierGroups.set(tier, []);
    tierGroups.get(tier).push(node);
  }

  let nextRow = 1;
  for (let tier = 1; tier <= maxTier; tier += 1) {
    const groupSize = tierGroups.get(tier)?.length || 0;
    const rowCount = Math.max(1, Math.ceil(groupSize / SKILL_TREE_COLUMNS));
    tierStartRows.set(tier, nextRow);
    tierRowCounts.set(tier, rowCount);
    nextRow += rowCount;
  }

  const roots = nodes.filter((node) => !(node.requires || []).length);
  roots.forEach((node, index) => columnById.set(node.id, rootColumn(index)));

  for (let tier = 1; tier <= maxTier; tier += 1) {
    const group = [...(tierGroups.get(tier) || [])];
    group.sort((a, b) => preferredColumn(a, columnById, nodes) - preferredColumn(b, columnById, nodes) || nodes.indexOf(a) - nodes.indexOf(b));

    for (const node of group) {
      const preferred = preferredColumn(node, columnById, nodes);
      const rowStart = tierStartRows.get(tier) || 1;
      const rowCount = tierRowCounts.get(tier) || 1;
      const cell = claimColumnCell(preferred, rowStart, rowCount, occupied);
      columnById.set(node.id, cell.column);
      rowById.set(node.id, cell.row);
      occupied.add(columnRowKey(cell.column, cell.row));
    }
  }

  const columnGap = options.columnGap || 180;
  const rowGap = options.rowGap || 116;
  const paddingX = options.paddingX || 92;
  const paddingY = options.paddingY || 76;
  const paddingBottom = options.paddingBottom ?? paddingY;
  const mapWidth = paddingX * 2 + (SKILL_TREE_COLUMNS - 1) * columnGap;
  const mapHeight = paddingY + paddingBottom + Math.max(1, nextRow) * rowGap;
  const toPixel = (column, row) => ({
    x: Math.round(paddingX + column * columnGap),
    y: Math.round(paddingY + row * rowGap),
  });
  const hubPoint = toPixel(SKILL_TREE_CENTER_COLUMN, 0);
  const hub = { ...hubPoint, column: SKILL_TREE_CENTER_COLUMN, row: 0, tier: 0, unit: "px", nodeWidth: options.hubSize, nodeHeight: options.hubSize };

  for (const node of nodes) {
    const column = columnById.get(node.id) ?? SKILL_TREE_CENTER_COLUMN;
    const row = rowById.get(node.id) ?? 1;
    const pixel = toPixel(column, row);
    layout.set(node.id, {
      ...pixel,
      column,
      row,
      tier: tierById.get(node.id) || 1,
      lane: column,
      unit: "px",
      nodeWidth: options.nodeWidth,
      nodeHeight: options.nodeHeight,
    });
  }

  layout.gridMeta = {
    layout: "columns",
    tiers: maxTier,
    rows: nextRow,
    lanes: SKILL_TREE_COLUMNS,
    unit: "px",
    cellSize: rowGap,
    columnGap,
    rowGap,
    paddingX,
    paddingY,
    paddingBottom,
    mapWidth,
    mapHeight,
    tierStartRows,
    tierRowCounts,
    hub,
  };
  return layout;
}

function rootColumn(index) {
  const order = [SKILL_TREE_CENTER_COLUMN, 0, 2];
  return order[index % order.length];
}

function preferredColumn(node, columnById, nodes) {
  const parentColumns = (node.requires || [])
    .map((id) => columnById.get(id))
    .filter((column) => Number.isFinite(column));
  if (parentColumns.length) return Math.round(parentColumns.reduce((sum, column) => sum + column, 0) / parentColumns.length);
  const rootIndex = nodes.filter((candidate) => !(candidate.requires || []).length).indexOf(node);
  return rootColumn(rootIndex >= 0 ? rootIndex : nodes.indexOf(node));
}

function claimColumnCell(preferredColumnIndex, rowStart, rowCount, occupied) {
  const clampedPreferred = clamp(preferredColumnIndex, 0, SKILL_TREE_COLUMNS - 1);
  const columnOrder = [clampedPreferred];
  for (let offset = 1; offset < SKILL_TREE_COLUMNS; offset += 1) {
    const left = clampedPreferred - offset;
    const right = clampedPreferred + offset;
    if (left >= 0) columnOrder.push(left);
    if (right < SKILL_TREE_COLUMNS) columnOrder.push(right);
  }

  for (let row = rowStart; row < rowStart + rowCount; row += 1) {
    for (const column of columnOrder) {
      if (!occupied.has(columnRowKey(column, row))) return { column, row };
    }
  }

  for (let row = rowStart; ; row += 1) {
    for (const column of columnOrder) {
      if (!occupied.has(columnRowKey(column, row))) return { column, row };
    }
  }
}

function columnRowKey(column, row) {
  return `${column},${row}`;
}

function renderSkillGridLabels({
  tiers,
  ringStep,
  unit,
  cellSize = 126,
  mapWidth = 1080,
  mapHeight = 1080,
  hub = { x: 540, y: 540 },
  gridRadius = tiers,
  layout = "rings",
  lanes = SKILL_TREE_COLUMNS,
  columnGap = 180,
  rowGap = 116,
  paddingX = 92,
  paddingY = 76,
  tierStartRows,
}) {
  const layer = document.createElement("div");
  layer.className = "skill-grid-labels";
  layer.setAttribute("aria-hidden", "true");

  if (layout === "columns" && unit === "px") {
    for (let column = 0; column < lanes; column += 1) {
      const lane = document.createElement("span");
      lane.className = "skill-grid-axis skill-grid-lane-line";
      lane.style.setProperty("--axis-x", `${paddingX + column * columnGap}px`);
      layer.appendChild(lane);
    }

    for (let tier = 1; tier <= tiers; tier += 1) {
      const y = paddingY + (tierStartRows?.get?.(tier) || tier) * rowGap;
      const line = document.createElement("span");
      line.className = "skill-grid-tier-line";
      line.style.setProperty("--grid-y", `${y}px`);
      layer.appendChild(line);

      const label = document.createElement("span");
      label.className = "skill-grid-tier-label";
      label.style.setProperty("--grid-x", `${Math.max(36, paddingX - 52)}px`);
      label.style.setProperty("--grid-y", `${y}px`);
      label.textContent = `T${tier}`;
      layer.appendChild(label);
    }

    return layer;
  }

  const horizontal = document.createElement("span");
  horizontal.className = "skill-grid-axis skill-grid-axis-horizontal";
  horizontal.style.setProperty("--axis-y", unit === "px" ? `${hub.y}px` : "50%");
  layer.appendChild(horizontal);

  const vertical = document.createElement("span");
  vertical.className = "skill-grid-axis skill-grid-axis-vertical";
  vertical.style.setProperty("--axis-x", unit === "px" ? `${hub.x}px` : "50%");
  layer.appendChild(vertical);

  const visibleRings = unit === "px" ? Math.min(tiers, gridRadius) : tiers;
  for (let tier = 1; tier <= visibleRings; tier += 1) {
    const ring = document.createElement("span");
    ring.className = `skill-grid-ring${unit === "px" ? " skill-grid-square-ring" : ""}`;
    if (unit === "px") {
      const radius = tier * cellSize;
      ring.style.setProperty("--ring-left", `${hub.x - radius}px`);
      ring.style.setProperty("--ring-top", `${hub.y - radius}px`);
      ring.style.setProperty("--ring-size", `${radius * 2}px`);
    } else {
      const radius = tier * ringStep;
      ring.style.setProperty("--ring-radius", `${radius}%`);
    }
    layer.appendChild(ring);

    const label = document.createElement("span");
    label.className = "skill-grid-tier-label";
    if (unit === "px") {
      label.style.setProperty("--grid-x", `${Math.min(mapWidth - 44, hub.x + tier * cellSize)}px`);
      label.style.setProperty("--grid-y", `${hub.y}px`);
    } else {
      const radius = tier * ringStep;
      label.style.setProperty("--grid-x", `${50 + radius}%`);
      label.style.setProperty("--grid-y", "50%");
    }
    label.textContent = `T${tier}`;
    layer.appendChild(label);
  }

  return layer;
}

function renderSkillHub(weapon, position = { x: 50, y: 50 }) {
  const hub = document.createElement("div");
  hub.className = "skill-node-hub";
  hub.style.setProperty("--node-x", position.unit === "px" ? `${position.x}px` : `${position.x}%`);
  hub.style.setProperty("--node-y", position.unit === "px" ? `${position.y}px` : `${position.y}%`);
  if (position.nodeWidth) hub.style.setProperty("--mobile-node-width", `${position.nodeWidth}px`);
  if (position.nodeHeight) hub.style.setProperty("--mobile-node-height", `${position.nodeHeight}px`);
  hub.innerHTML = `
    <span class="skill-node-hub-icon" aria-hidden="true">${weapon ? nodeIcon({ id: weapon.name, title: weapon.name, text: "" }, weapon) : "✦"}</span>
    <span class="skill-node-hub-label">中心</span>
  `;
  hub.setAttribute("aria-label", `${weapon?.name || "武器"}の中心ノード`);
  return hub;
}

function straightLinkPath(from, to) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function centerSkillMapOnNode(scroller, position = { x: 50, y: 50 }) {
  if (!scroller) return;
  const x = position.unit === "px" ? position.x : (position.x / 100) * scroller.scrollWidth;
  const y = position.unit === "px" ? position.y : (position.y / 100) * scroller.scrollHeight;
  scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
  scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 2);
}

function visualTier(node, nodes, seen = new Set()) {
  if (node.scope === "weapon") return node.tier;
  if (!node.requires?.length) return 1;
  if (seen.has(node.id)) return 1;
  seen.add(node.id);
  const requiredTiers = node.requires
    .map((id) => nodes.find((candidate) => candidate.id === id))
    .filter(Boolean)
    .map((required) => visualTier(required, nodes, new Set(seen)));
  return Math.max(1, ...requiredTiers) + 1;
}

function linkStatus(requiredId, scope) {
  return isPurchased(requiredId, scope) ? "skill-link-owned" : "skill-link-locked";
}

function selectedNodeForScope(nodes, scope) {
  if (!nodes.length) return null;
  const selectedId = selectedSkillNodes[scope];
  const selected = nodes.find((node) => node.id === selectedId);
  if (selected) return selected;
  const recommended = nodes.find((node) => nodeStatus(node) === "available")
    || nodes.find((node) => nodeStatus(node) === "costly")
    || nodes.find((node) => !isPurchased(node.id, node.scope))
    || nodes[0];
  selectedSkillNodes[scope] = recommended.id;
  return recommended;
}

function renderNodeButton(node, weapon, position = { x: 50, y: 50, tier: node.tier }, selected = false) {
  const button = document.createElement("button");
  button.type = "button";
  const status = nodeStatus(node);
  button.className = `skill-node skill-node-${status} tier-${node.tier}${selected ? " skill-node-selected" : ""}${isEvolutionNode(node) ? " skill-node-evolution" : ""}`;
  button.style.setProperty("--node-x", position.unit === "px" ? `${position.x}px` : `${position.x}%`);
  button.style.setProperty("--node-y", position.unit === "px" ? `${position.y}px` : `${position.y}%`);
  if (position.nodeWidth) button.style.setProperty("--mobile-node-width", `${position.nodeWidth}px`);
  if (position.nodeHeight) button.style.setProperty("--mobile-node-height", `${position.nodeHeight}px`);
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.setAttribute("aria-label", `${node.title}、${statusLabel(status)}、詳細を表示`);
  button.innerHTML = `
    <span class="skill-node-icon" aria-hidden="true">${nodeIcon(node, weapon)}</span>
    <span class="skill-node-copy">
      <span class="skill-node-name">${node.title}</span>
      <span class="skill-node-meta">${nodeCost(node)}SP · ${statusLabel(status)}</span>
    </span>
    <span class="skill-node-tier" aria-hidden="true">T${position.tier}</span>
  `;
  button.addEventListener("click", () => {
    selectedSkillNodes[node.scope] = node.id;
    renderSkillTree();
  });
  return button;
}

function renderNodeDetail(node, scope, { detailedRequirements = false } = {}) {
  const panel = document.createElement("article");
  panel.className = "skill-node-detail";
  if (!node) {
    panel.textContent = "ノードがありません。";
    return panel;
  }

  const status = nodeStatus(node);
  const cost = nodeCost(node);
  const free = freeCredits(scope) > 0;
  const canPurchase = game.debugSkillTreeMode || status === "available" || (status === "costly" && free);
  const usesFreeCredit = !game.debugSkillTreeMode && free && canPurchase;
  const requireText = requirementText(node, detailedRequirements);
  panel.innerHTML = `
    <div class="skill-node-detail-head">
      <span class="skill-node-detail-icon" aria-hidden="true">${nodeIcon(node)}</span>
      <div>
        <span class="panel-kicker">${statusLabel(status)}</span>
        <h3>${node.title}</h3>
      </div>
    </div>
    <p>${node.text}</p>
    <dl>
      <div><dt>コスト</dt><dd>${game.debugSkillTreeMode ? "DEBUG無制限" : usesFreeCredit ? "無料解放を使用" : `${cost}SP`}</dd></div>
      <div><dt>条件</dt><dd>${game.debugSkillTreeMode ? "DEBUG中は無視" : requireText}</dd></div>
    </dl>
  `;

  const unlock = document.createElement("button");
  unlock.type = "button";
  unlock.className = "primary skill-node-unlock";
  unlock.textContent = game.debugSkillTreeMode ? debugToggleButtonLabel(status) : unlockButtonLabel(status, free);
  unlock.disabled = !canPurchase;
  unlock.addEventListener("click", () => {
    if (game.debugSkillTreeMode) toggleDebugSkillNode(node.id, scope);
    else purchaseNode(node.id, scope);
  });
  panel.appendChild(unlock);
  return panel;
}

function requirementText(node, detailed = false) {
  if (!node.requires?.length) return "なし";
  const cleared = node.requires.filter((id) => isPurchased(id, node.scope)).length;
  if (!detailed) return `${cleared}/${node.requires.length} ノード開放`;
  const nodes = treeForWeapon();
  const requirements = node.requires.map((id) => {
    const required = nodes.find((candidate) => candidate.id === id);
    const mark = isPurchased(id, node.scope) ? "✓" : "未";
    return `${mark} ${required?.title || id}`;
  });
  return requirements.join(" / ");
}

function statusLabel(status) {
  return {
    available: "開放可能",
    costly: "SP不足",
    locked: "ロック中",
    owned: "取得済み",
  }[status] || "確認";
}

function debugToggleButtonLabel(status) {
  return status === "owned" ? "OFFにする" : "ONにする";
}

function unlockButtonLabel(status, free) {
  if (status === "owned") return "取得済み";
  if (status === "locked") return "条件未達成";
  if (status === "costly" && !free) return "SP不足";
  return free ? "無料で開放" : "開放";
}

function nodeIcon(node) {
  if (node.evolveTo || node.title.includes("進化")) return "🦋";
  const text = `${node.id} ${node.title} ${node.text}`;
  if (text.includes("範囲") || text.includes("爆発") || text.includes("破片")) return "💥";
  if (text.includes("速") || text.includes("頻度") || text.includes("連射")) return "⚡";
  if (text.includes("貫通")) return "🪡";
  if (text.includes("弾") || text.includes("投") || text.includes("射")) return "🎯";
  if (text.includes("重") || text.includes("威力") || text.includes("ダメージ")) return "💪";
  if (text.includes("クリティカル") || text.includes("急所")) return "⭐";
  if (text.includes("ノックバック") || text.includes("押し")) return "🛡️";
  return "✨";
}

function nodeStatus(node) {
  if (isPurchased(node.id, node.scope)) return "owned";
  if (game.debugSkillTreeMode) return "available";
  if (!isUnlocked(node)) return "locked";
  return (game.totalSkillPoints || 0) >= nodeCost(node) || freeCredits(node.scope) > 0 ? "available" : "costly";
}

function isUnlocked(node) {
  return (node.requires || []).every((id) => isPurchased(id, node.scope));
}

function isPurchased(id, scope) {
  return !!game.treePurchases?.[scope]?.[id];
}

function nodeCost(node) {
  return Math.round(node.cost || WAVE_NODE_PRICE_BASE);
}

function freeCredits(scope) {
  return Math.max(0, game.freeNodeCredits?.[scope] || 0);
}

function freeCreditText() {
  const weapon = freeCredits("weapon");
  const parts = [];
  if (weapon) parts.push(`武器無料 ${weapon}`);
  if (game.evolutionMaterials) parts.push(`進化素材 ${game.evolutionMaterials}`);
  return parts.length ? parts.join(" / ") : "無料解放なし";
}

export function purchaseNode(id, scope = "weapon") {
  if (scope !== "weapon") return false;
  const node = treeForWeapon().find((candidate) => candidate.id === id);
  if (!node || isPurchased(id, scope) || !isUnlocked(node)) return false;
  const cost = nodeCost(node);
  if (freeCredits(scope) > 0) {
    game.freeNodeCredits[scope] -= 1;
  } else {
    if ((game.totalSkillPoints || 0) < cost) return false;
    game.totalSkillPoints -= cost;
  }
  game.treePurchases[scope][id] = true;
  if (node.attachment) addAttachmentNode(getActiveWeapon(), node.attachment, node.id);
  if (node.evolveTo) evolveWeapon(node.evolveTo);
  recomputeAllAttachments();
  reapplyPurchasedCustomNodes();
  selectedSkillNodes[scope] = nextAvailableNodeAfterPurchase(node, scope)?.id || node.id;
  renderSkillTree();
  updateHud();
  return true;
}


export function toggleDebugSkillNode(id, scope = "weapon") {
  if (scope !== "weapon") return false;
  const node = treeForWeapon().find((candidate) => candidate.id === id);
  if (!node) return false;
  if (!game.treePurchases) game.treePurchases = { weapon: {} };
  if (!game.treePurchases[scope]) game.treePurchases[scope] = {};
  if (isPurchased(id, scope)) {
    delete game.treePurchases[scope][id];
  } else {
    game.treePurchases[scope][id] = true;
  }
  selectedSkillNodes[scope] = id;
  reapplyDebugSkillTreeEffects();
  renderSkillTree();
  updateHud();
  return true;
}

function reapplyDebugSkillTreeEffects() {
  const weapon = getActiveWeapon();
  if (!weapon) return;
  weapon.attachments = (weapon.attachments || []).filter((attachment) => attachment.source !== "skillNode");
  resetSkillNodeSideEffects(weapon);
  recomputeAllAttachments();
  const nodes = treeForWeapon(weapon).filter((node) => isPurchased(node.id, "weapon"));
  for (const node of nodes) {
    if (node.attachment) addAttachmentNode(weapon, node.attachment, node.id);
  }
  recomputeAllAttachments();
  resetSkillNodeSideEffects(weapon);
  for (const node of nodes) {
    if (!node.evolveTo && node.custom) node.custom(weapon);
  }
}

function resetSkillNodeSideEffects(weapon) {
  weapon.bulletSprite = null;
  weapon.elasticGrowth = null;
  weapon.orbitPushOut = 0;
  weapon.stoneVisual = { form: "normal", sizeScale: 1, trail: "none", hitEffect: "normal" };
  weapon.stoneFlags = {};
}

function nextAvailableNodeAfterPurchase(purchasedNode, scope) {
  const nodes = treeForWeapon();
  return nodes.find((node) =>
    !isPurchased(node.id, scope)
    && nodeStatus(node) === "available"
    && (node.requires || []).includes(purchasedNode.id)
  ) || nodes.find((node) => !isPurchased(node.id, scope) && nodeStatus(node) === "available") || null;
}

export function applyPurchasedSkillTreeToActiveWeapon() {
  const weapon = getActiveWeapon();
  if (!weapon) return;
  const nodes = treeForWeapon(weapon).filter((node) => isPurchased(node.id, "weapon"));
  weapon.attachments = (weapon.attachments || []).filter((attachment) => attachment.source !== "skillNode");
  for (const node of nodes) {
    if (node.attachment) addAttachmentNode(weapon, node.attachment, node.id);
    if (node.evolveTo) evolveWeapon(node.evolveTo);
  }
  recomputeAllAttachments();
  for (const node of nodes) {
    if (node.custom) node.custom(getActiveWeapon());
  }
}

function reapplyPurchasedCustomNodes() {
  game.goldGainBonus = 0;
  game.waveStartHealBonus = 0;
  const weapon = getActiveWeapon();
  for (const node of treeForWeapon(weapon)) {
    if (!isPurchased(node.id, "weapon")) continue;
    if (node.custom) node.custom(weapon);
  }
}

function addAttachmentNode(weapon, attachmentKey, nodeId) {
  const definition = findAttachmentDefinition(attachmentKey) || ACTIVE_ATTACHMENTS.find((attachment) => attachment.key === attachmentKey);
  if (!definition || !weapon) return;
  weapon.attachments.push({
    key: definition.key,
    name: definition.name,
    category: definition.category,
    stars: definition.stars || 1,
    source: "skillNode",
    nodeId,
  });
}

function evolveWeapon(evolutionName) {
  const weapon = getActiveWeapon();
  if (!applyStoneEvolutionByName(weapon, evolutionName)) return;
  game.selectedWeapon = weapon.baseName || weapon.name;
}

export function grantFreeNode(scope = "weapon", count = 1) {
  if (!game.freeNodeCredits) game.freeNodeCredits = { weapon: 0 };
  const targetScope = scope === "common" ? "weapon" : scope;
  game.freeNodeCredits[targetScope] = (game.freeNodeCredits[targetScope] || 0) + count;
}

export function grantRandomAffordableNode(scope = "weapon") {
  const targetScope = scope === "common" ? "weapon" : scope;
  const nodes = treeForWeapon();
  const candidates = nodes.filter((node) => !isPurchased(node.id, targetScope) && isUnlocked(node));
  if (candidates.length === 0) return false;
  const node = candidates[Math.floor(Math.random() * candidates.length)];
  grantFreeNode(scope, 1);
  return purchaseNode(node.id, targetScope);
}

export function hideSkillTree() {
  hud.skillTree?.classList.add("hidden");
  setMobileSkillTreeFullscreen(false);
}

export function continueFromSkillTree() {
  const wasDebugMode = game.debugSkillTreeMode;
  hideSkillTree();
  if (wasDebugMode) {
    game.debugSkillTreeMode = false;
    game.mode = "pause";
    hud.pauseMenu?.classList.remove("hidden");
    return;
  }
  window.dispatchEvent(new CustomEvent("skill-tree-continue"));
}
