import { SKILLS, RECIPES } from "./skillCatalog.js";
import { DEBUG_FREE_SKILLS } from "./buildSettings.js";
export { SKILLS, RECIPES };
export const NODE_MAP = new Map(SKILLS.map((n) => [n.id, n]));
export const FAMILIES = [
  "投射・射撃周期",
  "反射・帰還・破砕",
  "周回・近接・重力",
  "砲台・罠・領域",
  "召喚・護衛・消費",
  "燃焼・蓄熱・爆燃",
  "冷却・凍結・破砕",
  "放電・命中・会心",
  "呪い・毒・弱体",
  "生命・防壁・反撃",
  "移動・停止・無傷",
  "回収・蓄財・報酬",
  "領域をつなぐ反応",
  "特殊ルール",
];
export const FAMILY_IDS = [..."ABCDEFGHIJKL", "X", "R"];
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
    return "前提ノードを有効にしてください";
  if (ids.length > 20) return "有効ノードは20個までです";
  if (ids.filter((id) => NODE_MAP.get(id).major).length > 4)
    return "大ノードは4個までです";
  if (ids.filter((id) => id.startsWith("R")).length > 1)
    return "特殊ルールは1個までです";
  const weapons = ids.filter((id) => WEAPON_NODES.has(id)).length;
  if (!s.has("R03") && weapons > (s.has("R01") ? 1 : 3))
    return s.has("R01") ? "一器入魂では武装は1個までです" : "武装は3個までです";
  return "";
}
export function emptyProgress() {
  return {
    gold: 0,
    purchased: {},
    active: [],
    paid: {},
    rank: 0,
    freeClaimed: false,
    presets: Array(6).fill(null),
  };
}
export function ensureBuild(g) {
  g.activeSkills ??= [];
  g.skillPaid ??= {};
  g.masteryRank ??= 0;
  g.buildPresets ??= Array(6).fill(null);
}
export function canRespec(g) {
  return (
    ["bossReward", "result", "weaponSelect"].includes(g.mode) ||
    ["bossReward", "result", "weaponSelect"].includes(g.modeBeforeSkillTree) ||
    (g.runElapsed || 0) === 0
  );
}
export function costFor(g, n) {
  return (g.debugFreeSkills ?? DEBUG_FREE_SKILLS) ||
    (!g.freeSkillClaimed && !n.requires_all.length && !n.major)
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
  if (!n || owned[id] || n.requires_all.some((p) => !owned[p])) return false;
  const cost = costFor(g, n);
  if (g.gold < cost) return false;
  g.gold -= cost;
  owned[id] = true;
  g.skillPaid[id] = cost;
  if (cost === 0) g.freeSkillClaimed = true;
  const next = closure([...g.activeSkills, id]);
  if (!validateBuild(next) && (!["R11", "L12"].includes(id) || canRespec(g)))
    g.activeSkills = next;
  return true;
}
export function setBuild(g, ids) {
  ensureBuild(g);
  if (!canRespec(g)) return "構成変更は出撃前・ボス撃破後・結果画面で行えます";
  const error = validateBuild(ids);
  if (error) return error;
  if (ids.some((id) => !g.treePurchases.weapon[id]))
    return "未購入のノードがあります";
  g.activeSkills = [...ids];
  return "";
}
export function activateNode(g, id) {
  ensureBuild(g);
  if (["R11", "L12"].includes(id) && !canRespec(g))
    return "契約は難易度開始前に選択してください";
  const next = closure([...g.activeSkills, id]);
  const err = validateBuild(next);
  if (err) return err;
  if (next.some((n) => !g.treePurchases.weapon[n]))
    return "前提を購入してください";
  g.activeSkills = next;
  return "";
}
export function refundNode(g, id) {
  if (!canRespec(g)) return false;
  const remove = Object.keys(g.treePurchases.weapon).filter((n) =>
    closure([n]).includes(id),
  );
  for (const n of remove) {
    g.gold += g.skillPaid[n] || 0;
    delete g.skillPaid[n];
    delete g.treePurchases.weapon[n];
  }
  g.activeSkills = g.activeSkills.filter((n) => !remove.includes(n));
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
    if (owned[id]) continue;
    const n = NODE_MAP.get(id);
    costs[id] =
      (g.debugFreeSkills ?? DEBUG_FREE_SKILLS) ||
      (free && !n.requires_all.length && !n.major)
        ? 0
        : n.cost;
    if (costs[id] === 0) free = false;
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
    purchased[id] = true;
    paid[id] = g.treePurchases.weapon[id] ? g.skillPaid[id] || 0 : q.costs[id];
  }
  g.gold = q.balance;
  g.treePurchases.weapon = purchased;
  g.skillPaid = paid;
  g.activeSkills = q.ids;
  g.freeSkillClaimed ||= Object.values(q.costs).includes(0);
  return "";
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
