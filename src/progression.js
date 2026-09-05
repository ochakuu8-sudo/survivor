import { NODE_MAP, emptyProgress, validateBuild } from "./buildModel.js";
// Fresh debug economy. The old v1 save remains untouched; no legacy points are imported.
export const SAVE_KEY = "survivor.progression.v2.zero-start";
export function floorMultiplier(floor = 1) {
  return Math.pow(1.6, Math.min(29, Math.max(0, Math.floor(floor) - 1)));
}
export function rewardForFloor(base, floor = 1) {
  return Math.max(0, Math.round(base * floorMultiplier(floor)));
}
export function readProgress(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage?.getItem(SAVE_KEY) || "null");
    if (!data || data.version !== 2) return emptyProgress();
    const purchased = {},
      paid = {};
    for (let pass = 0; pass < 6; pass++)
      for (const n of NODE_MAP.values())
        if (
          data.purchased?.[n.id] === true &&
          n.requires_all.every((id) => purchased[id])
        ) {
          purchased[n.id] = true;
          paid[n.id] = Number.isSafeInteger(data.paid?.[n.id])
            ? Math.max(0, Math.min(n.cost, data.paid[n.id]))
            : 0;
        }
    const active =
      Array.isArray(data.active) &&
      !validateBuild(data.active) &&
      data.active.every((id) => purchased[id])
        ? data.active
        : [];
    const rank = Number.isInteger(data.rank)
      ? Math.min(30, Math.max(0, data.rank))
      : 0;
    const presets = Array.from({ length: 6 }, (_, i) => {
      const p = data.presets?.[i];
      return p && Array.isArray(p.core) && !validateBuild(p.core)
        ? { name: String(p.name || "構成").slice(0, 40), core: p.core }
        : null;
    });
    return {
      gold:
        Number.isSafeInteger(data.gold) && data.gold >= 0
          ? Math.min(data.gold, 1e12)
          : 0,
      purchased,
      active,
      paid,
      rank,
      presets,
      freeClaimed: !!data.freeClaimed,
    };
  } catch {
    return emptyProgress();
  }
}
export function saveProgress(game, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (!storage) throw new Error("Storage unavailable");
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        gold: game.gold,
        purchased: game.treePurchases.weapon,
        active: game.activeSkills || [],
        paid: game.skillPaid || {},
        rank: game.masteryRank || 0,
        presets: game.buildPresets || [],
        freeClaimed: !!game.freeSkillClaimed,
      }),
    );
    game.saveFailed = false;
    return true;
  } catch {
    game.saveFailed = true;
    return false;
  }
}
