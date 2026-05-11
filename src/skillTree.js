import { WAVE_NODE_PRICE_BASE, WAVE_NODE_PRICE_SCALE } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { ACTIVE_ATTACHMENTS, findAttachmentDefinition, recomputeAllAttachments } from "./attachments.js";
import {
  addWeaponBasePercent,
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

const selectedSkillNodes = { weapon: null, common: null };

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

const commonNode = (id, title, text, cost, requires = [], effect = {}) => ({
  scope: "common",
  id,
  tier: 1,
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
    weaponNode("stone_ricochet", 2, "跳ね石", "跳弾 +1。", 42, ["stone_range"], { attachment: "ricochetCore" }),
    weaponNode("stone_multi", 3, "両手投げ", "同時投擲 +1、ばらつき少し増加。", 56, ["stone_rapid", "stone_pace"], { custom: (weapon) => { weapon.projectiles += 1; weapon.spread += 0.16; } }),
    weaponNode("stone_shards", 3, "破片弾", "着弾時に破片ダメージの小爆発。", 62, ["stone_knock"], { custom: (weapon) => { weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 42); weapon.explosionDamage = Math.max(weapon.explosionDamage || 0, weapon.damage * 0.55); } }),
    weaponNode("stone_evolve", 4, "進化：ゴムボール", "跳弾時に弾が増える伝説形態へ進化。", 110, ["stone_ricochet", "stone_multi", "stone_shards"], { evolveTo: "ゴムボール" }),
  ],
  火炎放射器: [
    weaponNode("flame_power", 1, "高温燃焼", "ダメージ +15%。", 24, [], { attachment: "powerCore" }),
    weaponNode("flame_pressure", 1, "高圧タンク", "攻撃頻度 +12%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.12, { min: 0.15 }) }),
    weaponNode("flame_range", 1, "加圧ノズル", "射程 +15%。", 26, [], { custom: (weapon) => extendWeaponReach(weapon, 1.15) }),
    weaponNode("flame_cone", 1, "ワイドコーン", "コーン範囲 +20%。", 30, [], { custom: (weapon) => addWeaponBasePercent(weapon, "cone", 0.2, { min: 0.1, max: 1.4 }) }),
    weaponNode("flame_stability", 2, "圧力安定", "射程 +12%。", 42, ["flame_pressure"], { custom: (weapon) => extendWeaponReach(weapon, 1.12) }),
    weaponNode("flame_slow", 2, "粘着炎", "炎に鈍足効果を付与。", 46, ["flame_range"], { custom: (weapon) => { weapon.freezeChance += 0.28; weapon.freezeSlow = Math.min(weapon.freezeSlow || 0.62, 0.55); weapon.freezeDuration = Math.max(weapon.freezeDuration || 1.6, 1.8); } }),
    weaponNode("flame_focus", 3, "狭角高火力", "範囲を絞ってダメージ +35%。", 58, ["flame_power"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.35); weapon.cone = Math.max(0.28, weapon.cone * 0.78); } }),
    weaponNode("flame_wall", 3, "火炎壁", "範囲と持続感を強化。", 56, ["flame_cone", "flame_stability"], { custom: (weapon) => expandWeaponArea(weapon, 2) }),
    weaponNode("flame_evolve", 4, "進化：フレア", "全方位に炎を放つ。", 110, ["flame_slow", "flame_focus", "flame_wall"], { evolveTo: "フレア" }),
  ],
  モーニングスター: [
    weaponNode("star_power", 1, "重い星", "ダメージ +15%。", 24, [], { attachment: "powerCore" }),
    weaponNode("star_radius", 1, "長い鎖", "回転半径 +15%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "orbitRadius", 0.15, { min: 0 }) }),
    weaponNode("star_area", 1, "大きな棘", "攻撃範囲 +10%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "radius", 0.1, { min: 2 }) }),
    weaponNode("star_speed", 1, "高速回転", "回転速度 +15%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "orbitSpeed", 0.15, { min: 0.1 }) }),
    weaponNode("star_count", 2, "二連星", "回転数 +1。", 52, ["star_speed", "star_radius"], { custom: (weapon) => { weapon.orbitCount += 1; } }),
    weaponNode("star_knock", 2, "吹き飛ばし", "ノックバック +12。", 42, ["star_power"], { custom: (weapon) => { weapon.knockback += 12; } }),
    weaponNode("star_push", 3, "敵押し出し", "接触した敵を強く押し戻す。", 56, ["star_knock"], { custom: (weapon) => { weapon.orbitPushOut += 22; } }),
    weaponNode("star_grinder", 3, "粉砕回転", "攻撃頻度と範囲をさらに強化。", 60, ["star_area", "star_count"], { custom: (weapon) => { addWeaponBasePercent(weapon, "fireRate", 0.18, { min: 0.15 }); addWeaponBasePercent(weapon, "radius", 0.16, { min: 2 }); } }),
    weaponNode("star_evolve", 4, "進化：3つ星", "3つの星が高速回転する。", 110, ["star_push", "star_grinder"], { evolveTo: "3つ星" }),
  ],
};

export const COMMON_SKILL_TREE = [
  commonNode("hp", "最大HP +10", "倒れにくくなる基礎体力。", 22, [], { custom: () => { game.player.maxHp += 10; game.player.hp += 10; } }),
  commonNode("speed", "移動速度 +20", "敵群の隙間を抜けやすくなる。", 24, [], { custom: () => { game.player.speed += 20; } }),
  commonNode("pickup", "吸引範囲 +40", "ゴールド回収が楽になる。", 24, [], { custom: () => { game.player.pickup += 40; } }),
  commonNode("armor", "被ダメ軽減 +4", "被弾時のダメージを抑える。", 30, ["hp"], { custom: () => { game.player.armor += 4; } }),
  commonNode("barrier", "バリア +1", "Wave開始時に1回分のバリアを得る。", 44, ["armor"], { custom: () => { game.player.barrierMax += 1; game.player.barrier = game.player.barrierMax; } }),
  commonNode("goldGain", "獲得ゴールド +10%", "購入ペースを上げる投資ノード。", 42, ["pickup"], { custom: () => { game.goldGainBonus = (game.goldGainBonus || 0) + 0.1; } }),
  commonNode("regen", "Wave開始時HP回復", "次Wave開始時に最大HPの20%を回復。", 50, ["hp", "speed"], { custom: () => { game.waveStartHealBonus = (game.waveStartHealBonus || 0) + 0.2; } }),
];

function treeForWeapon(weapon = getActiveWeapon()) {
  const key = weapon?.baseName || weapon?.name || "石";
  return WEAPON_SKILL_TREES[key] || WEAPON_SKILL_TREES.石;
}

export function initSkillProgress() {
  game.treePurchases = { weapon: {}, common: {} };
  game.freeNodeCredits = { weapon: 0, common: 0 };
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
  if (!hud.skillTree || !hud.skillTreeWeaponNodes || !hud.skillTreeCommonNodes) return;
  const weapon = getActiveWeapon();
  hud.skillTreeWeaponName.textContent = weapon?.name || "武器未選択";
  hud.skillTreeWeaponMeta.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponStatusLabel(weapon)}` : "";
  hud.skillTreeGold.textContent = String(game.gold);
  hud.skillTreeWave.textContent = `Wave ${game.wave} Clear`;
  hud.skillTreeFree.textContent = freeCreditText();
  hud.skillTreeWeaponNodes.replaceChildren(renderNodeMap(treeForWeapon(weapon), weapon));
  hud.skillTreeCommonNodes.replaceChildren(renderNodeMap(COMMON_SKILL_TREE, weapon));
}

function renderNodeMap(nodes, weapon) {
  const wrapper = document.createElement("div");
  wrapper.className = "skill-node-map-wrap";

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
  wrapper.append(map, renderNodeDetail(selectedNode, scope));
  return wrapper;
}

function layoutSkillNodes(nodes) {
  const tiers = new Map();
  for (const node of nodes) {
    const tier = visualTier(node, nodes);
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier).push(node);
  }

  const tierKeys = [...tiers.keys()].sort((a, b) => a - b);
  const maxTier = Math.max(...tierKeys, 1);
  const layout = new Map();
  for (const tier of tierKeys) {
    const tierNodes = tiers.get(tier);
    const x = maxTier === 1 ? 50 : 9 + ((tier - 1) / (maxTier - 1)) * 82;
    tierNodes.forEach((node, index) => {
      const y = tierNodes.length === 1 ? 50 : 11 + (index / (tierNodes.length - 1)) * 78;
      layout.set(node.id, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), tier });
    });
  }
  return layout;
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
  if (node.scope === "common") {
    if (node.id.includes("hp") || node.id.includes("regen")) return "♥";
    if (node.id.includes("speed")) return "➤";
    if (node.id.includes("pickup") || node.id.includes("gold")) return "◆";
    if (node.id.includes("armor") || node.id.includes("barrier")) return "⬟";
    return "✚";
  }
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
  const common = freeCredits("common");
  const parts = [];
  if (weapon) parts.push(`武器無料 ${weapon}`);
  if (common) parts.push(`共通無料 ${common}`);
  if (game.evolutionMaterials) parts.push(`進化素材 ${game.evolutionMaterials}`);
  return parts.length ? parts.join(" / ") : "無料解放なし";
}

export function purchaseNode(id, scope = "weapon") {
  const node = [...treeForWeapon(), ...COMMON_SKILL_TREE].find((candidate) => candidate.id === id && candidate.scope === scope);
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
  for (const node of COMMON_SKILL_TREE) {
    if (!isPurchased(node.id, "common")) continue;
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
  if (!game.freeNodeCredits) game.freeNodeCredits = { weapon: 0, common: 0 };
  game.freeNodeCredits[scope] = (game.freeNodeCredits[scope] || 0) + count;
}

export function grantRandomAffordableNode(scope = "weapon") {
  const nodes = scope === "common" ? COMMON_SKILL_TREE : treeForWeapon();
  const candidates = nodes.filter((node) => !isPurchased(node.id, scope) && isUnlocked(node));
  if (candidates.length === 0) return false;
  const node = candidates[Math.floor(Math.random() * candidates.length)];
  grantFreeNode(scope, 1);
  return purchaseNode(node.id, scope);
}

export function hideSkillTree() {
  hud.skillTree?.classList.add("hidden");
}

export function continueFromSkillTree() {
  hideSkillTree();
  window.dispatchEvent(new CustomEvent("skill-tree-continue"));
}
