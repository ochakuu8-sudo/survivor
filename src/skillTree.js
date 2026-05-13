import { WAVE_NODE_PRICE_BASE } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { ACTIVE_ATTACHMENTS, findAttachmentDefinition, recomputeAllAttachments } from "./attachments.js";
import {
  addWeaponBasePercent,
  addWeaponPierce,
  boostWeaponImpactPercent,
  createWeapon,
  expandWeaponArea,
  extendWeaponReach,
  getActiveWeapon,
  weaponStatusLabel,
  weaponMetaLabel,
} from "./weapons.js";
import { WEAPON_POOL } from "./shop.js";
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
    weaponNode("stone_power", 1, "重い握り", "威力 +20%。", 24, [], { attachment: "powerCore" }),
    weaponNode("stone_range", 1, "遠投フォーム", "射程 +15%。", 22, [], { custom: (weapon) => extendWeaponReach(weapon, 1.15) }),
    weaponNode("stone_rapid", 1, "投げ慣れ", "攻撃頻度 +13%。", 24, [], { attachment: "rapidMechanism" }),
    weaponNode("stone_pace", 1, "握り込み", "攻撃頻度 +12%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.12, { min: 0.15 }) }),
    weaponNode("stone_knock", 2, "芯当て", "ノックバック +8、威力も少し上昇。", 34, ["stone_power"], { custom: (weapon) => { weapon.knockback += 8; boostWeaponImpactPercent(weapon, 0.08); } }),
    weaponNode("stone_speed", 2, "高速スナップ", "弾速 +16%、射程も少し上昇。", 36, ["stone_range"], { custom: (weapon) => { addWeaponBasePercent(weapon, "bulletSpeed", 0.16, { min: 1 }); extendWeaponReach(weapon, 1.06); } }),
    weaponNode("stone_reload", 2, "拾い投げ", "攻撃頻度 +16%。", 38, ["stone_rapid"], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.16, { min: 0.15 }) }),
    weaponNode("stone_focus", 2, "投擲の構え", "ばらつきを抑え、クリティカル率 +5%。", 34, ["stone_pace"], { custom: (weapon) => { weapon.spread = Math.max(0.04, weapon.spread - 0.06); weapon.critChance += 0.05; } }),
    weaponNode("stone_ricochet", 3, "跳ね石", "跳弾 +1。", 48, ["stone_speed"], { attachment: "ricochetCore" }),
    weaponNode("stone_pierce", 3, "貫き石", "貫通 +1、弾が少し大きくなる。", 46, ["stone_knock", "stone_focus"], { custom: (weapon) => addWeaponPierce(weapon, 1) }),
    weaponNode("stone_multi", 3, "両手投げ", "同時投擲 +1、ばらつき少し増加。", 56, ["stone_reload", "stone_focus"], { custom: (weapon) => { weapon.projectiles += 1; weapon.spread += 0.16; } }),
    weaponNode("stone_shards", 3, "破片弾", "着弾時に破片ダメージの小爆発。", 62, ["stone_knock"], { custom: (weapon) => { weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 42); weapon.explosionDamage = Math.max(weapon.explosionDamage || 0, weapon.damage * 0.55); } }),
    weaponNode("stone_critical", 4, "急所狙い", "クリティカル率 +10%、倍率 +20%。", 64, ["stone_pierce"], { custom: (weapon) => { weapon.critChance += 0.1; weapon.critMultiplier += 0.2; } }),
    weaponNode("stone_barrage", 4, "石つぶて連打", "攻撃頻度 +18%、弾速 +8%。", 70, ["stone_multi", "stone_reload"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.18, { min: 0.15 }); addWeaponBasePercent(weapon, "bulletSpeed", 0.08, { min: 1 }); } }),
    weaponNode("stone_fragstorm", 4, "破砕嵐", "爆発範囲 +24%、爆発威力 +18%。", 72, ["stone_shards", "stone_ricochet"], { custom: (weapon) => { expandWeaponArea(weapon, 3); addWeaponBasePercent(weapon, "explosionDamage", 0.18, { min: 0 }); } }),
    weaponNode("stone_heavy_arc", 4, "山なり豪投", "威力 +22%、射程 +10%、攻撃頻度 -6%。", 68, ["stone_speed", "stone_power"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.22); extendWeaponReach(weapon, 1.1); addWeaponBasePercent(weapon, "fireRate", -0.06, { min: 0.15 }); } }),
    weaponNode("stone_split", 5, "割れ散る軌道", "跳弾分裂 +1、ばらつき増加。", 84, ["stone_ricochet", "stone_barrage"], { custom: (weapon) => { weapon.ricochetSplitCount += 1; weapon.spread += 0.08; } }),
    weaponNode("stone_guard", 5, "守り投げ", "ノックバック +12、敵を押し返しやすくなる。", 76, ["stone_heavy_arc", "stone_critical"], { custom: (weapon) => { weapon.knockback += 12; weapon.kick += 0.4; } }),
    weaponNode("stone_cluster", 5, "礫クラスター", "同時投擲 +1、爆発範囲 +12%。", 92, ["stone_multi", "stone_fragstorm"], { custom: (weapon) => { weapon.projectiles += 1; expandWeaponArea(weapon, 1.5); } }),
    weaponNode("stone_precision", 5, "職人の握り", "クリティカル率 +8%、ばらつき低下。", 78, ["stone_focus", "stone_barrage"], { custom: (weapon) => { weapon.critChance += 0.08; weapon.spread = Math.max(0.03, weapon.spread - 0.08); } }),
    weaponNode("stone_avalanche", 6, "落石連鎖", "跳弾 +1、跳弾距離 +20%。", 102, ["stone_split", "stone_cluster"], { custom: (weapon) => { weapon.ricochetCount += 1; addWeaponBasePercent(weapon, "ricochetRange", 0.2, { min: 0 }); } }),
    weaponNode("stone_meteor", 6, "隕石核", "威力 +28%、爆発威力 +28%。", 108, ["stone_guard", "stone_fragstorm"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.28); addWeaponBasePercent(weapon, "explosionDamage", 0.28, { min: 0 }); } }),
    weaponNode("stone_evolve", 7, "進化：ゴムボール", "跳弾時に弾が増える伝説形態へ進化。", 130, ["stone_avalanche", "stone_meteor", "stone_precision"], { evolveTo: "ゴムボール" }),
  ],
  火炎放射器: [
    weaponNode("flame_power", 1, "高温燃焼", "ダメージ +15%。", 24, [], { attachment: "powerCore" }),
    weaponNode("flame_pressure", 1, "高圧タンク", "攻撃頻度 +12%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.12, { min: 0.15 }) }),
    weaponNode("flame_range", 1, "加圧ノズル", "射程 +15%。", 26, [], { custom: (weapon) => extendWeaponReach(weapon, 1.15) }),
    weaponNode("flame_cone", 1, "ワイドコーン", "コーン範囲 +20%。", 30, [], { custom: (weapon) => addWeaponBasePercent(weapon, "cone", 0.2, { min: 0.1, max: 1.4 }) }),
    weaponNode("flame_stability", 2, "圧力安定", "射程 +12%。", 42, ["flame_pressure"], { custom: (weapon) => extendWeaponReach(weapon, 1.12) }),
    weaponNode("flame_slow", 2, "粘着炎", "炎に鈍足効果を付与。", 46, ["flame_range"], { custom: (weapon) => { weapon.freezeChance += 0.28; weapon.freezeSlow = Math.min(weapon.freezeSlow || 0.62, 0.55); weapon.freezeDuration = Math.max(weapon.freezeDuration || 1.6, 1.8); } }),
    weaponNode("flame_focus", 2, "狭角高火力", "範囲を絞ってダメージ +35%。", 58, ["flame_power"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.35); weapon.cone = Math.max(0.28, weapon.cone * 0.78); } }),
    weaponNode("flame_wall", 2, "火炎壁", "範囲と持続感を強化。", 56, ["flame_cone"], { custom: (weapon) => expandWeaponArea(weapon, 2) }),
    weaponNode("flame_fuel", 3, "増設燃料槽", "持続感と射程 +10%。", 52, ["flame_stability", "flame_range"], { custom: (weapon) => { addWeaponBasePercent(weapon, "duration", 0.1, { min: 0 }); extendWeaponReach(weapon, 1.1); } }),
    weaponNode("flame_ignition", 3, "点火予熱", "攻撃頻度 +18%。", 62, ["flame_pressure", "flame_focus"], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.18, { min: 0.15 }) }),
    weaponNode("flame_tar", 3, "タール噴射", "鈍足時間 +45%、ノックバック +4。", 60, ["flame_slow"], { custom: (weapon) => { weapon.freezeDuration += 0.7; weapon.knockback += 4; } }),
    weaponNode("flame_sweep", 3, "扇状掃射", "コーン範囲 +18%、射程 +6%。", 58, ["flame_wall"], { custom: (weapon) => { addWeaponBasePercent(weapon, "cone", 0.18, { min: 0.1, max: 1.4 }); extendWeaponReach(weapon, 1.06); } }),
    weaponNode("flame_blue", 4, "青炎化", "ダメージ +24%、鈍足率 +10%。", 76, ["flame_focus", "flame_tar"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.24); weapon.freezeChance += 0.1; } }),
    weaponNode("flame_pulse", 4, "脈動噴射", "攻撃頻度 +16%、ノックバック +5。", 72, ["flame_ignition"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.16, { min: 0.15 }); weapon.knockback += 5; } }),
    weaponNode("flame_perimeter", 4, "防火帯", "コーン範囲 +22%、攻撃範囲 +12%。", 76, ["flame_sweep", "flame_fuel"], { custom: (weapon) => { addWeaponBasePercent(weapon, "cone", 0.22, { min: 0.1, max: 1.4 }); expandWeaponArea(weapon, 1.5); } }),
    weaponNode("flame_drill", 4, "貫炎ドリル", "射程 +18%、炎の芯の威力 +12%。", 80, ["flame_stability", "flame_blue"], { custom: (weapon) => { extendWeaponReach(weapon, 1.18); boostWeaponImpactPercent(weapon, 0.12); } }),
    weaponNode("flame_overheat", 5, "安全弁解除", "ダメージ +30%、攻撃頻度 -7%。", 92, ["flame_blue", "flame_pulse"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.3); addWeaponBasePercent(weapon, "fireRate", -0.07, { min: 0.15 }); } }),
    weaponNode("flame_ring", 5, "旋回ノズル", "範囲 +18%、全周攻撃への布石。", 88, ["flame_perimeter"], { custom: (weapon) => expandWeaponArea(weapon, 2.25) }),
    weaponNode("flame_afterburn", 5, "残り火", "持続時間 +18%、鈍足率 +8%。", 82, ["flame_tar", "flame_fuel"], { custom: (weapon) => { addWeaponBasePercent(weapon, "duration", 0.18, { min: 0 }); weapon.freezeChance += 0.08; } }),
    weaponNode("flame_dual", 5, "二連バルブ", "攻撃頻度 +22%、コーン範囲 +8%。", 96, ["flame_pulse", "flame_sweep"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.22, { min: 0.15 }); addWeaponBasePercent(weapon, "cone", 0.08, { min: 0.1, max: 1.4 }); } }),
    weaponNode("flame_inferno", 6, "業火炉心", "ダメージ +26%、射程 +16%。", 112, ["flame_overheat", "flame_drill"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.26); extendWeaponReach(weapon, 1.16); } }),
    weaponNode("flame_whiteout", 6, "白熱地帯", "攻撃頻度 +16%、範囲 +16%。", 108, ["flame_ring", "flame_dual", "flame_afterburn"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.16, { min: 0.15 }); expandWeaponArea(weapon, 2); } }),
    weaponNode("flame_evolve", 7, "進化：フレア", "全方位に炎を放つ。", 130, ["flame_inferno", "flame_whiteout"], { evolveTo: "フレア" }),
  ],
  モーニングスター: [
    weaponNode("star_power", 1, "重い星", "ダメージ +15%。", 24, [], { attachment: "powerCore" }),
    weaponNode("star_radius", 1, "長い鎖", "回転半径 +15%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "orbitRadius", 0.15, { min: 0 }) }),
    weaponNode("star_area", 1, "大きな棘", "攻撃範囲 +10%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "radius", 0.1, { min: 2 }) }),
    weaponNode("star_speed", 1, "高速回転", "回転速度 +15%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "orbitSpeed", 0.15, { min: 0.1 }) }),
    weaponNode("star_count", 2, "二連星", "回転数 +1。", 52, ["star_speed", "star_radius"], { custom: (weapon) => { weapon.orbitCount += 1; } }),
    weaponNode("star_knock", 2, "吹き飛ばし", "ノックバック +12。", 42, ["star_power"], { custom: (weapon) => { weapon.knockback += 12; } }),
    weaponNode("star_chain", 2, "鎖延長", "回転半径 +14%、射程 +8%。", 40, ["star_radius"], { custom: (weapon) => { addWeaponBasePercent(weapon, "orbitRadius", 0.14, { min: 0 }); extendWeaponReach(weapon, 1.08); } }),
    weaponNode("star_barbs", 2, "返し棘", "攻撃範囲 +14%、威力 +8%。", 42, ["star_area"], { custom: (weapon) => { addWeaponBasePercent(weapon, "radius", 0.14, { min: 2 }); boostWeaponImpactPercent(weapon, 0.08); } }),
    weaponNode("star_push", 3, "敵押し出し", "接触した敵を強く押し戻す。", 56, ["star_knock"], { custom: (weapon) => { weapon.orbitPushOut += 22; } }),
    weaponNode("star_grinder", 3, "粉砕回転", "攻撃頻度と範囲をさらに強化。", 60, ["star_area", "star_count"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.18, { min: 0.15 }); addWeaponBasePercent(weapon, "radius", 0.16, { min: 2 }); } }),
    weaponNode("star_anchor", 3, "重錨スイング", "威力 +20%、回転速度 -5%。", 58, ["star_power", "star_chain"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.2); addWeaponBasePercent(weapon, "orbitSpeed", -0.05, { min: 0.1 }); } }),
    weaponNode("star_whirl", 3, "旋風ステップ", "回転速度 +20%、攻撃頻度 +8%。", 62, ["star_speed", "star_barbs"], { custom: (weapon) => { addWeaponBasePercent(weapon, "orbitSpeed", 0.2, { min: 0.1 }); addWeaponBasePercent(weapon, "fireRate", 0.08, { min: 0.15 }); } }),
    weaponNode("star_outer", 4, "外周制圧", "回転半径 +18%、押し出し +10。", 72, ["star_chain", "star_push"], { custom: (weapon) => { addWeaponBasePercent(weapon, "orbitRadius", 0.18, { min: 0 }); weapon.orbitPushOut += 10; } }),
    weaponNode("star_crush", 4, "粉砕点", "威力 +24%、ノックバック +8。", 76, ["star_anchor", "star_knock"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.24); weapon.knockback += 8; } }),
    weaponNode("star_satellite", 4, "衛星軌道", "回転数 +1、範囲少し低下。", 86, ["star_count", "star_whirl"], { custom: (weapon) => { weapon.orbitCount += 1; addWeaponBasePercent(weapon, "radius", -0.04, { min: 2 }); } }),
    weaponNode("star_saw", 4, "鋸刃化", "攻撃範囲 +18%、攻撃頻度 +12%。", 74, ["star_grinder", "star_barbs"], { custom: (weapon) => { addWeaponBasePercent(weapon, "radius", 0.18, { min: 2 }); addWeaponBasePercent(weapon, "fireRate", 0.12, { min: 0.15 }); } }),
    weaponNode("star_bulwark", 5, "鉄壁回転", "押し出し +18、回転半径 +10%。", 88, ["star_outer", "star_crush"], { custom: (weapon) => { weapon.orbitPushOut += 18; addWeaponBasePercent(weapon, "orbitRadius", 0.1, { min: 0 }); } }),
    weaponNode("star_cyclone", 5, "大旋風", "回転速度 +22%、攻撃範囲 +12%。", 92, ["star_whirl", "star_saw"], { custom: (weapon) => { addWeaponBasePercent(weapon, "orbitSpeed", 0.22, { min: 0.1 }); addWeaponBasePercent(weapon, "radius", 0.12, { min: 2 }); } }),
    weaponNode("star_triple", 5, "三連軌道", "回転数 +1。", 102, ["star_satellite"], { custom: (weapon) => { weapon.orbitCount += 1; } }),
    weaponNode("star_execution", 5, "処刑棘", "クリティカル率 +12%、威力 +12%。", 88, ["star_crush", "star_saw"], { custom: (weapon) => { weapon.critChance += 0.12; boostWeaponImpactPercent(weapon, 0.12); } }),
    weaponNode("star_singularity", 6, "重力鎖", "押し出し +24、回転半径 +16%。", 112, ["star_bulwark", "star_triple"], { custom: (weapon) => { weapon.orbitPushOut += 24; addWeaponBasePercent(weapon, "orbitRadius", 0.16, { min: 0 }); } }),
    weaponNode("star_blender", 6, "星砕き", "攻撃頻度 +24%、威力 +20%。", 112, ["star_cyclone", "star_execution"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.24, { min: 0.15 }); boostWeaponImpactPercent(weapon, 0.2); } }),
    weaponNode("star_evolve", 7, "進化：3つ星", "3つの星が高速回転する。", 130, ["star_singularity", "star_blender"], { evolveTo: "3つ星" }),
  ],
};


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

export function renderSkillTree() {
  if (!hud.skillTree || !hud.skillTreeWeaponNodes) return;
  const weapon = getActiveWeapon();
  hud.skillTreeWeaponName.textContent = weapon?.name || "武器未選択";
  hud.skillTreeWeaponMeta.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponStatusLabel(weapon)}` : "";
  hud.skillTreeGold.textContent = String(game.totalSkillPoints || 0);
  hud.skillTreeWave.textContent = "ラン外成長";
  hud.skillTreeFree.textContent = freeCreditText();
  const fullscreenPreferred = isMobileSkillTreeFullscreenPreferred();
  setMobileSkillTreeFullscreen(fullscreenPreferred);
  const title = hud.skillTree.querySelector(".panel-head h1");
  if (title) title.textContent = fullscreenPreferred ? "スキルツリー" : "SPで武器を恒久強化";
  const footerHint = hud.skillTree.querySelector(".skill-tree-footer p");
  if (footerHint) {
    footerHint.textContent = "スマホ側と同じノードマップです。ドラッグで移動し、タップ／クリックで詳細を確認できます。";
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
  const columnGap = viewportWidth <= 370 ? 118 : 132;
  const rowGap = viewportWidth <= 370 ? 92 : 98;
  const nodeSize = viewportWidth <= 370 ? 38 : 42;
  return buildColumnSkillLayout(nodes, {
    columnGap,
    rowGap,
    paddingX: Math.max(72, Math.round(columnGap * 0.64)),
    paddingY: 58,
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
  const mapWidth = paddingX * 2 + (SKILL_TREE_COLUMNS - 1) * columnGap;
  const mapHeight = paddingY * 2 + Math.max(1, nextRow) * rowGap;
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
  const canPurchase = status === "available" || (status === "costly" && free);
  const usesFreeCredit = free && canPurchase;
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
      <div><dt>コスト</dt><dd>${usesFreeCredit ? "無料解放を使用" : `${cost}SP`}</dd></div>
      <div><dt>条件</dt><dd>${requireText}</dd></div>
    </dl>
  `;

  const unlock = document.createElement("button");
  unlock.type = "button";
  unlock.className = "primary skill-node-unlock";
  unlock.textContent = unlockButtonLabel(status, free);
  unlock.disabled = !canPurchase;
  unlock.addEventListener("click", () => purchaseNode(node.id, scope));
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

function unlockButtonLabel(status, free) {
  if (status === "owned") return "取得済み";
  if (status === "locked") return "条件未達成";
  if (status === "costly" && !free) return "SP不足";
  return free ? "無料で開放" : "開放";
}

function nodeIcon(node, weapon) {
  if (node.evolveTo || node.title.includes("進化")) return "🦋";
  const text = `${node.id} ${node.title} ${node.text}`;
  if (text.includes("炎") || weapon?.baseName === "火炎放射器") return "🔥";
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

function evolveWeapon(templateName) {
  const template = WEAPON_POOL.find((candidate) => candidate.name === templateName);
  const gear = game.player.gear;
  if (!template || !gear?.weapons?.length) return;
  const oldWeapon = getActiveWeapon();
  const evolved = createWeapon({ name: template.name, ...template.weapon });
  evolved.attachments = [...(oldWeapon.attachments || [])];
  gear.weapons = [evolved];
  gear.activeWeaponIndex = 0;
  game.selectedWeapon = evolved.baseName || evolved.name;
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
  hideSkillTree();
  window.dispatchEvent(new CustomEvent("skill-tree-continue"));
}
