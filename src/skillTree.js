import { WAVE_NODE_PRICE_BASE, WAVE_NODE_PRICE_SCALE } from "./constants.js";
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
  game.treePurchases = { weapon: {} };
  game.freeNodeCredits = { weapon: 0 };
  game.evolutionMaterials = 0;
  game.nextWaveBuff = null;
}

export function enterUpgradeTree() {
  game.mode = "upgradeTree";
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.waveClearCount = (game.waveClearCount || 0) + 1;
  renderSkillTree();
  hud.skillTree?.classList.remove("hidden");
  updateHud();
}

export function renderSkillTree() {
  if (!hud.skillTree || !hud.skillTreeWeaponNodes) return;
  const weapon = getActiveWeapon();
  hud.skillTreeWeaponName.textContent = weapon?.name || "武器未選択";
  hud.skillTreeWeaponMeta.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponStatusLabel(weapon)}` : "";
  hud.skillTreeGold.textContent = String(game.gold);
  hud.skillTreeWave.textContent = `Wave ${game.wave} Clear`;
  hud.skillTreeFree.textContent = freeCreditText();
  hud.skillTreeWeaponNodes.replaceChildren(renderNodeMap(treeForWeapon(weapon), weapon));
}

function renderNodeMap(nodes, weapon) {
  const wrapper = document.createElement("div");
  wrapper.className = "skill-node-map-wrap";

  const scroller = document.createElement("div");
  scroller.className = "skill-node-map-scroller";

  const map = document.createElement("div");
  map.className = "skill-node-map";

  const layout = layoutSkillNodes(nodes);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("skill-node-links");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  for (const node of nodes) {
    for (const requiredId of node.requires || []) {
      const from = layout.get(requiredId);
      const to = layout.get(node.id);
      if (!from || !to) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      line.classList.add("skill-link", linkStatus(requiredId, node.scope));
      svg.appendChild(line);
    }
  }

  const scope = nodes[0]?.scope || "weapon";
  const selectedNode = selectedNodeForScope(nodes, scope);
  map.appendChild(svg);
  for (const node of nodes) {
    const position = layout.get(node.id);
    map.appendChild(renderNodeButton(node, weapon, position, selectedNode?.id === node.id));
  }
  scroller.appendChild(map);
  requestAnimationFrame(() => centerSkillMapOnNode(scroller, layout.get(selectedNode?.id)));
  wrapper.append(scroller, renderNodeDetail(selectedNode, scope));
  return wrapper;
}

function layoutSkillNodes(nodes) {
  const tierById = new Map(nodes.map((node) => [node.id, visualTier(node, nodes)]));
  const maxTier = Math.max(...tierById.values(), 1);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const branchAngles = [-90, 0, 90, 180];
  const rootNodes = nodes.filter((node) => !node.requires?.length);
  const branchById = new Map(rootNodes.map((node, index) => [node.id, branchAngles[index % branchAngles.length]]));
  const layout = new Map();

  const resolveBranch = (node, seen = new Set()) => {
    if (branchById.has(node.id)) return branchById.get(node.id);
    if (!node.requires?.length || seen.has(node.id)) return branchAngles[branchById.size % branchAngles.length];
    seen.add(node.id);

    const vectors = node.requires
      .map((id) => nodeById.get(id))
      .filter(Boolean)
      .map((required) => angleToVector(resolveBranch(required, new Set(seen))));
    if (!vectors.length) return branchAngles[branchById.size % branchAngles.length];

    const vector = vectors.reduce((sum, current) => ({
      x: sum.x + current.x,
      y: sum.y + current.y,
    }), { x: 0, y: 0 });
    const angle = vectorToAngle(vector);
    branchById.set(node.id, angle);
    return angle;
  };

  for (const node of nodes) {
    resolveBranch(node);
  }

  const grouped = new Map();
  for (const node of nodes) {
    const tier = tierById.get(node.id) || 1;
    const angle = branchById.get(node.id) || 0;
    const key = `${tier}:${Math.round(angle / 45) * 45}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(node);
  }

  for (const group of grouped.values()) {
    group.sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b));
    group.forEach((node, index) => {
      const tier = tierById.get(node.id) || 1;
      const angle = branchById.get(node.id) || 0;
      const main = angleToVector(angle);
      const side = { x: -main.y, y: main.x };
      const radius = maxTier === 1 ? 0 : 5 + ((tier - 1) / (maxTier - 1)) * 39;
      const spread = (index - (group.length - 1) / 2) * 6.5;
      const x = clamp(50 + main.x * radius + side.x * spread, 6, 94);
      const y = clamp(50 + main.y * radius + side.y * spread, 6, 94);
      layout.set(node.id, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), tier });
    });
  }
  return layout;
}

function angleToVector(angle) {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function vectorToAngle(vector) {
  if (Math.abs(vector.x) < 0.001 && Math.abs(vector.y) < 0.001) return 0;
  return (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
}

function centerSkillMapOnNode(scroller, position = { x: 50, y: 50 }) {
  if (!scroller) return;
  const x = (position.x / 100) * scroller.scrollWidth;
  const y = (position.y / 100) * scroller.scrollHeight;
  scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
  scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  button.className = `skill-node skill-node-${status} tier-${node.tier}${selected ? " skill-node-selected" : ""}`;
  button.style.setProperty("--node-x", `${position.x}%`);
  button.style.setProperty("--node-y", `${position.y}%`);
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.setAttribute("aria-label", `${node.title}、${statusLabel(status)}、詳細を表示`);
  button.innerHTML = `
    <span class="skill-node-icon" aria-hidden="true">${nodeIcon(node, weapon)}</span>
    <span class="skill-node-tier" aria-hidden="true">T${position.tier}</span>
  `;
  button.addEventListener("click", () => {
    selectedSkillNodes[node.scope] = node.id;
    renderSkillTree();
  });
  return button;
}

function renderNodeDetail(node, scope) {
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
  const requireText = requirementText(node);
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
      <div><dt>コスト</dt><dd>${usesFreeCredit ? "無料解放を使用" : `${cost}G`}</dd></div>
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

function requirementText(node) {
  if (!node.requires?.length) return "なし";
  const cleared = node.requires.filter((id) => isPurchased(id, node.scope)).length;
  return `${cleared}/${node.requires.length} ノード開放`;
}

function statusLabel(status) {
  return {
    available: "開放可能",
    costly: "ゴールド不足",
    locked: "ロック中",
    owned: "取得済み",
  }[status] || "確認";
}

function unlockButtonLabel(status, free) {
  if (status === "owned") return "取得済み";
  if (status === "locked") return "条件未達成";
  if (status === "costly" && !free) return "ゴールド不足";
  return free ? "無料で開放" : "開放";
}

function nodeIcon(node, weapon) {
  if (node.evolveTo || node.title.includes("進化")) return "✦";
  const text = `${node.id} ${node.title} ${node.text}`;
  if (text.includes("弾") || text.includes("投") || text.includes("射") || text.includes("貫通")) return "➹";
  if (text.includes("炎") || weapon?.baseName === "火炎放射器") return "♨";
  if (text.includes("範囲") || text.includes("爆発") || text.includes("破片")) return "✹";
  if (text.includes("速") || text.includes("頻度") || text.includes("連射")) return "⚡";
  if (text.includes("重") || text.includes("威力") || text.includes("ダメージ")) return "✦";
  return "●";
}

function nodeStatus(node) {
  if (isPurchased(node.id, node.scope)) return "owned";
  if (!isUnlocked(node)) return "locked";
  return game.gold >= nodeCost(node) || freeCredits(node.scope) > 0 ? "available" : "costly";
}

function isUnlocked(node) {
  return (node.requires || []).every((id) => isPurchased(id, node.scope));
}

function isPurchased(id, scope) {
  return !!game.treePurchases?.[scope]?.[id];
}

function nodeCost(node) {
  const scale = 1 + Math.max(0, game.wave - 1) * WAVE_NODE_PRICE_SCALE;
  return Math.round((node.cost || WAVE_NODE_PRICE_BASE) * scale);
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
    if (game.gold < cost) return false;
    game.gold -= cost;
  }
  game.treePurchases[scope][id] = true;
  if (node.attachment) addAttachmentNode(getActiveWeapon(), node.attachment, node.id);
  if (node.evolveTo) evolveWeapon(node.evolveTo);
  recomputeAllAttachments();
  reapplyPurchasedCustomNodes();
  renderSkillTree();
  updateHud();
  return true;
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
}

export function continueFromSkillTree() {
  hideSkillTree();
  window.dispatchEvent(new CustomEvent("skill-tree-continue"));
}
