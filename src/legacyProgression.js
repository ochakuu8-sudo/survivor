import {
  NODE_MAP,
  emptyProgress,
  validateBuild,
  syncBuild,
  closure,
} from "./buildModel.js";
// v2 purchases migrate once; the original save is left intact.
export const SAVE_KEY = "survivor.progression.v3.composed-stone";
export function floorMultiplier(floor = 1) {
  return Math.pow(1.6, Math.min(29, Math.max(0, Math.floor(floor) - 1)));
}
export function rewardForFloor(base, floor = 1) {
  return Math.max(0, Math.round(base * floorMultiplier(floor)));
}
export function readProgress(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(
      storage?.getItem(SAVE_KEY) ||
        storage?.getItem("survivor.progression.v2.zero-start") ||
        "null",
    );
    if (!data || ![2, 3].includes(data.version)) return emptyProgress();
    const purchased = {},
      paid = {};
    for (let pass = 0; pass < 6; pass++)
      for (const n of NODE_MAP.values())
        if (
          !n.special &&
          data.purchased?.[n.id] === true &&
          n.requires_all.every((id) => purchased[id])
        ) {
          purchased[n.id] = true;
          paid[n.id] = Number.isSafeInteger(data.paid?.[n.id])
            ? Math.max(0, Math.min(n.cost, data.paid[n.id]))
            : 0;
        }
    const migrated = {
      treePurchases: { weapon: purchased },
      activeSkills: [],
      equippedSpecial:
        data.version === 3
          ? data.equippedSpecial
          : Array.isArray(data.active)
            ? data.active.find(
                (id) =>
                  NODE_MAP.get(id)?.special &&
                  NODE_MAP.get(id).requires_all.every((p) => purchased[p]),
              )
            : null,
      skillPaid: paid,
    };
    syncBuild(migrated);
    const active = migrated.activeSkills;
    const legacyRefund =
      data.version === 2
        ? [...NODE_MAP.values()]
            .filter((n) => n.special && data.purchased?.[n.id])
            .reduce(
              (sum, n) =>
                sum +
                (Number.isSafeInteger(data.paid?.[n.id])
                  ? Math.max(
                      0,
                      Math.min(n.family === "X" ? 90 : 140, data.paid[n.id]),
                    )
                  : 0),
              0,
            )
        : 0;
    const rank = Number.isInteger(data.rank)
      ? Math.min(30, Math.max(0, data.rank))
      : 0;
    const presets = Array.from({ length: 6 }, (_, i) => {
      const p = data.presets?.[i];
      if (!p || !Array.isArray(p.core)) return null;
      const ordinary = p.core.filter(
        (id) => NODE_MAP.has(id) && !NODE_MAP.get(id).special,
      );
      const special = p.core.find((id) => NODE_MAP.get(id)?.special);
      const core = closure([...ordinary, ...(special ? [special] : [])]);
      return !validateBuild(core)
        ? { name: String(p.name || "構成").slice(0, 40), core }
        : null;
    });
    return {
      gold:
        Number.isSafeInteger(data.gold) && data.gold >= 0
          ? Math.min(data.gold + legacyRefund, 1e12)
          : 0,
      purchased,
      active,
      equippedSpecial: migrated.equippedSpecial,
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
        version: 3,
        gold: game.gold,
        purchased: game.treePurchases.weapon,
        active: game.activeSkills || [],
        equippedSpecial: game.equippedSpecial || null,
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
