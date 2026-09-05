import { SKILLS, RECIPES } from "./skillCatalog.js";
import { DEBUG_FREE_SKILLS } from "./buildSettings.js";
export { SKILLS, RECIPES };
export const NODE_MAP = new Map(SKILLS.map((n) => [n.id, n]));
export const FAMILIES = [
  "投射・射撃周期",
  "反射・帰還・破砕",
  "周回・近接・重力",
  "定着・罠・領域",
  "追尾・護衛・継承",
  "燃焼・蓄熱・爆燃",
  "冷却・凍結・破砕",
  "放電・命中・会心",
  "呪い・毒・弱体",
  "生命・防壁・反撃",
  "移動・停止・無傷",
  "回収・蓄財・報酬",
  "複合特殊石",
  "誓約の特殊石",
];
export const FAMILY_IDS = [..."ABCDEFGHIJKL", "X", "R"];
// These are trajectory/payload traits, never independent weapon slots.
export const WEAPON_NODES = new Set([
  "A01",
  "A02",
  "A03",
  "B01",
  "B02",
  "B03",
  "C01",
  "C02",
  "C03",
  "D01",
  "D02",
  "D03",
  "E01",
  "E02",
  "F02",
  "F03",
  "G02",
  "G03",
  "H01",
  "I02",
]);
export function closure(ids) {
  const found = new Set();
  const visit = (id) => {
    const n = NODE_MAP.get(id);
    if (!n || found.has(id)) return;
    found.add(id);
    n.requires_all.forEach(visit);
  };
  ids.forEach(visit);
  return [...found];
}
export function validateBuild(ids) {
  if (
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !NODE_MAP.has(id))
  )
    return "不明または重複したノードです";
  const s = new Set(ids);
  if (ids.some((id) => NODE_MAP.get(id).requires_all.some((p) => !s.has(p))))
    return "必要な特性ノードをすべて習得してください";
  if (ids.filter((id) => NODE_MAP.get(id).special).length > 1)
    return "装備できる特殊石は1個までです";
  return "";
}
export function emptyProgress() {
  return {
    gold: 0,
    purchased: {},
    active: [],
    equippedSpecial: null,
    paid: {},
    rank: 0,
    freeClaimed: false,
    presets: Array(6).fill(null),
  };
}
export function ensureBuild(g) {
  g.treePurchases ??= { weapon: {} };
  g.treePurchases.weapon ??= {};
  g.activeSkills ??= [];
  g.skillPaid ??= {};
  g.masteryRank ??= 0;
  g.buildPresets ??= Array(6).fill(null);
  if (g.equippedSpecial === undefined)
    g.equippedSpecial =
      g.activeSkills.find((id) => NODE_MAP.get(id)?.special) || null;
}
// Purchased ordinary traits are permanent and always applied. Special stones are derived unlocks.
export function syncBuild(g) {
  ensureBuild(g);
  const owned = g.treePurchases.weapon;
  for (const n of SKILLS.filter((n) => n.special)) {
    if (n.requires_all.every((id) => owned[id])) owned[n.id] = true;
    else delete owned[n.id];
  }
  if (!NODE_MAP.get(g.equippedSpecial)?.special || !owned[g.equippedSpecial])
    g.equippedSpecial = null;
  g.activeSkills = SKILLS.filter((n) => owned[n.id] && !n.special).map(
    (n) => n.id,
  );
  if (g.equippedSpecial) g.activeSkills.push(g.equippedSpecial);
  return g.activeSkills;
}
export function canRespec(g) {
  return (
    ["bossReward", "result", "weaponSelect"].includes(g.mode) ||
    ["bossReward", "result", "weaponSelect"].includes(g.modeBeforeSkillTree) ||
    (g.runElapsed || 0) === 0
  );
}
export function costFor(g, n) {
  return n.special ||
    (g.debugFreeSkills ?? DEBUG_FREE_SKILLS) ||
    (!g.freeSkillClaimed && !n.requires_all.length)
    ? 0
    : n.cost;
}
export function skillStatus(n, purchased, gold) {
  return purchased[n.id]
    ? "owned"
    : n.requires_all.some((id) => !purchased[id])
      ? "locked"
      : gold >= n.cost
        ? "available"
        : "costly";
}
export function buyNode(g, id) {
  ensureBuild(g);
  const n = NODE_MAP.get(id),
    owned = g.treePurchases.weapon;
  if (!n || n.special || owned[id] || n.requires_all.some((p) => !owned[p]))
    return false;
  const cost = costFor(g, n);
  if (g.gold < cost) return false;
  g.gold -= cost;
  owned[id] = true;
  g.skillPaid[id] = cost;
  g.freeSkillClaimed = true;
  syncBuild(g);
  return true;
}
export function equipSpecial(g, id) {
  ensureBuild(g);
  if (!canRespec(g))
    return "特殊石の交換は出撃前・ボス撃破後・結果画面で行えます";
  if (
    id !== null &&
    (!NODE_MAP.get(id)?.special || !g.treePurchases.weapon[id])
  )
    return "必要な特性ノードをすべて習得すると解放されます";
  g.equippedSpecial = id;
  syncBuild(g);
  return "";
}
export function activateNode(g, id) {
  return equipSpecial(g, id);
}
export function setBuild(g, ids) {
  const error = validateBuild(ids);
  if (error) return error;
  return equipSpecial(g, ids.find((id) => NODE_MAP.get(id).special) || null);
}
export function refundNode(g, id) {
  ensureBuild(g);
  if (!canRespec(g) || !g.treePurchases.weapon[id] || NODE_MAP.get(id)?.special)
    return false;
  const remove = Object.keys(g.treePurchases.weapon).filter((n) =>
    closure([n]).includes(id),
  );
  for (const n of remove) {
    g.gold += g.skillPaid[n] || 0;
    delete g.skillPaid[n];
    delete g.treePurchases.weapon[n];
  }
  syncBuild(g);
  return true;
}
export function quoteRecipe(g, recipe) {
  const ids = closure(recipe.core || recipe.active_nodes || []),
    owned = g.treePurchases.weapon;
  const refund = Object.keys(owned)
    .filter((id) => !ids.includes(id))
    .reduce((s, id) => s + (g.skillPaid[id] || 0), 0);
  let free = !g.freeSkillClaimed;
  const costs = {};
  for (const id of ids) {
    const n = NODE_MAP.get(id);
    if (owned[id] || n.special) continue;
    costs[id] =
      (g.debugFreeSkills ?? DEBUG_FREE_SKILLS) ||
      (free && !n.requires_all.length)
        ? 0
        : n.cost;
    if (!n.requires_all.length) free = false;
  }
  const cost = Object.values(costs).reduce((s, n) => s + n, 0);
  return {
    ids,
    costs,
    cost,
    refund,
    balance: g.gold + refund - cost,
    error: validateBuild(ids),
  };
}
export function applyRecipe(g, recipe) {
  ensureBuild(g);
  if (!canRespec(g)) return "振り直しは出撃前・ボス撃破後・結果画面で行えます";
  const q = quoteRecipe(g, recipe);
  if (q.error) return q.error;
  if (q.balance < 0) return `あと${-q.balance} G必要です`;
  const paid = {},
    purchased = {};
  for (const id of q.ids) {
    if (NODE_MAP.get(id).special) continue;
    purchased[id] = true;
    paid[id] = g.treePurchases.weapon[id] ? g.skillPaid[id] || 0 : q.costs[id];
  }
  g.gold = q.balance;
  g.treePurchases.weapon = purchased;
  g.skillPaid = paid;
  g.equippedSpecial = q.ids.find((id) => NODE_MAP.get(id).special) || null;
  g.freeSkillClaimed ||= Object.values(q.costs).includes(0);
  syncBuild(g);
  return "";
}
// Add the missing prerequisites without discarding the player's existing traits.
export function unlockSpecial(g, id) {
  ensureBuild(g);
  const n = NODE_MAP.get(id);
  if (!n?.special) return "特殊石を選んでください";
  const wanted = closure([id]).filter((id) => !NODE_MAP.get(id).special);
  const q = quoteRecipe(g, {
    core: [
      ...g.activeSkills.filter((id) => !NODE_MAP.get(id).special),
      ...wanted,
    ],
  });
  if (q.balance < 0) return `あと${-q.balance} G必要です`;
  // Normal prerequisites are at most three levels deep; topological purchase order.
  for (let pass = 0; pass < 4; pass++)
    for (const key of wanted) if (!g.treePurchases.weapon[key]) buyNode(g, key);
  return g.treePurchases.weapon[id] ? "" : "前提を習得できませんでした";
}
export function masteryCost(g) {
  return Math.round(60 * 2.2 ** Math.min(30, g.masteryRank || 0));
}
export function buyMastery(g) {
  const cost = masteryCost(g);
  if (g.gold < cost || (g.masteryRank || 0) >= 30) return false;
  g.gold -= cost;
  g.masteryRank = (g.masteryRank || 0) + 1;
  return true;
}
