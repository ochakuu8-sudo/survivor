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
  reduceWeaponBasePercent,
  weaponAmmoLabel,
  weaponMetaLabel,
} from "./weapons.js";
import { WEAPON_POOL } from "./shop.js";
import { updateHud } from "./hud.js";

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
    weaponNode("stone_ammo", 1, "石袋", "弾薬容量 +25%。", 26, [], { custom: (weapon) => addWeaponBasePercent(weapon, "ammoCapacity", 0.25, { min: 1 }) }),
    weaponNode("stone_knock", 2, "芯当て", "ノックバック +8、威力も少し上昇。", 34, ["stone_power"], { custom: (weapon) => { weapon.knockback += 8; boostWeaponImpactPercent(weapon, 0.08); } }),
    weaponNode("stone_ricochet", 2, "跳ね石", "跳弾 +1。", 42, ["stone_range"], { attachment: "ricochetCore" }),
    weaponNode("stone_multi", 3, "両手投げ", "同時投擲 +1、ばらつき少し増加。", 56, ["stone_rapid", "stone_ammo"], { custom: (weapon) => { weapon.projectiles += 1; weapon.spread += 0.16; } }),
    weaponNode("stone_shards", 3, "破片弾", "着弾時に破片ダメージの小爆発。", 62, ["stone_knock"], { custom: (weapon) => { weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 42); weapon.explosionDamage = Math.max(weapon.explosionDamage || 0, weapon.damage * 0.55); } }),
    weaponNode("stone_evolve", 4, "進化：ゴムボール", "跳弾時に弾が増える伝説形態へ進化。", 110, ["stone_ricochet", "stone_multi", "stone_shards"], { evolveTo: "ゴムボール" }),
  ],
  豆鉄砲: [
    weaponNode("pea_rapid", 1, "連射機構", "攻撃頻度 +15%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "fireRate", 0.15, { min: 0.15 }) }),
    weaponNode("pea_ammo", 1, "拡張マガジン", "弾薬容量 +25%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "ammoCapacity", 0.25, { min: 1 }) }),
    weaponNode("pea_stable", 1, "安定グリップ", "ばらつき -25%。", 22, [], { custom: (weapon) => reduceWeaponBasePercent(weapon, "jitter", 0.25, { min: 0 }) }),
    weaponNode("pea_range", 1, "ロングバレル", "射程 +15%。", 26, [], { custom: (weapon) => extendWeaponReach(weapon, 1.15) }),
    weaponNode("pea_pierce", 2, "鋼芯弾", "貫通 +1。", 42, ["pea_range"], { custom: (weapon) => addWeaponPierce(weapon, 1) }),
    weaponNode("pea_burst", 2, "炸裂豆", "着弾時に小爆発。", 48, ["pea_rapid"], { custom: (weapon) => { weapon.explosionRadius = Math.max(weapon.explosionRadius || 0, 38); weapon.explosionDamage = Math.max(weapon.explosionDamage || 0, weapon.damage * 1.6); } }),
    weaponNode("pea_reload", 3, "高速リロード", "実質弾切れ時間を短縮する容量追加。", 54, ["pea_ammo"], { custom: (weapon) => addWeaponBasePercent(weapon, "ammoCapacity", 0.35, { min: 1 }) }),
    weaponNode("pea_crit", 3, "弱点狙い", "クリティカル率 +18%。", 56, ["pea_stable", "pea_pierce"], { custom: (weapon) => { weapon.critChance += 0.18; weapon.critMultiplier += 0.25; } }),
    weaponNode("pea_evolve", 4, "進化：流星群", "連射弾が着弾時に爆発する。", 110, ["pea_burst", "pea_reload", "pea_crit"], { evolveTo: "流星群" }),
  ],
  火炎放射器: [
    weaponNode("flame_power", 1, "高温燃焼", "ダメージ +15%。", 24, [], { attachment: "powerCore" }),
    weaponNode("flame_fuel", 1, "大型タンク", "燃料容量 +25%。", 24, [], { custom: (weapon) => addWeaponBasePercent(weapon, "ammoCapacity", 0.25, { min: 0.5 }) }),
    weaponNode("flame_range", 1, "加圧ノズル", "射程 +15%。", 26, [], { custom: (weapon) => extendWeaponReach(weapon, 1.15) }),
    weaponNode("flame_cone", 1, "ワイドコーン", "コーン範囲 +20%。", 30, [], { custom: (weapon) => addWeaponBasePercent(weapon, "cone", 0.2, { min: 0.1, max: 1.4 }) }),
    weaponNode("flame_economy", 2, "燃費改善", "燃料容量 +35%。", 42, ["flame_fuel"], { custom: (weapon) => addWeaponBasePercent(weapon, "ammoCapacity", 0.35, { min: 0.5 }) }),
    weaponNode("flame_slow", 2, "粘着炎", "炎に鈍足効果を付与。", 46, ["flame_range"], { custom: (weapon) => { weapon.freezeChance += 0.28; weapon.freezeSlow = Math.min(weapon.freezeSlow || 0.62, 0.55); weapon.freezeDuration = Math.max(weapon.freezeDuration || 1.6, 1.8); } }),
    weaponNode("flame_focus", 3, "狭角高火力", "範囲を絞ってダメージ +35%。", 58, ["flame_power"], { custom: (weapon) => { boostWeaponImpactPercent(weapon, 0.35); weapon.cone = Math.max(0.28, weapon.cone * 0.78); } }),
    weaponNode("flame_wall", 3, "火炎壁", "範囲と持続感を強化。", 56, ["flame_cone", "flame_economy"], { custom: (weapon) => expandWeaponArea(weapon, 2) }),
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
  hud.skillTreeWeaponMeta.textContent = weapon ? `${weaponMetaLabel(weapon)} / ${weaponAmmoLabel(weapon)}` : "";
  hud.skillTreeGold.textContent = String(game.gold);
  hud.skillTreeWave.textContent = `Wave ${game.wave} Clear`;
  hud.skillTreeFree.textContent = freeCreditText();
  hud.skillTreeWeaponNodes.replaceChildren(...treeForWeapon(weapon).map((node) => renderNodeButton(node, weapon)));
  hud.skillTreeCommonNodes.replaceChildren(...COMMON_SKILL_TREE.map((node) => renderNodeButton(node, weapon)));
}

function renderNodeButton(node, weapon) {
  const button = document.createElement("button");
  button.type = "button";
  const status = nodeStatus(node);
  button.className = `skill-node skill-node-${status} tier-${node.tier}`;
  button.disabled = status === "locked" || status === "owned" || (status === "costly" && freeCredits(node.scope) <= 0);
  button.innerHTML = `
    <span class="skill-node-tier">T${node.tier}</span>
    <strong>${node.title}</strong>
    <span>${node.text}</span>
    <small>${nodeCost(node)}G${node.requires?.length ? ` / 必要: ${node.requires.length}` : ""}</small>
  `;
  button.addEventListener("click", () => purchaseNode(node.id, node.scope));
  return button;
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
  if (weapon?.usesAmmo) weapon.ammo = Math.min(weapon.ammoCapacity, Math.max(weapon.ammo || 0, weapon.ammoCapacity));
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
