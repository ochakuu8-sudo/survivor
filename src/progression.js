import { readProgress as readLegacy } from "./legacyProgression.js";
import {
  newLoot,
  addStarter,
  WEAPON_MAP,
  WEAPONS,
  AFFIX_MAP,
  createWeapon,
  weaponSlots,
  profile,
  validAffix,
} from "./lootModel.js";
export { floorMultiplier, rewardForFloor } from "./legacyProgression.js";
export const SAVE_KEY = "survivor.progression.v4.weapon-loot";
const safe = (n, min, max, fallback = min) =>
  Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
function cleanWeapon(w) {
  if (!w || !WEAPON_MAP.has(w.kind) || !/^w[1-9][0-9]*$/.test(w.uid))
    return null;
  const result = {
    uid: w.uid,
    kind: w.kind,
    xp: safe(w.xp, 0, 1e9),
    quality: safe(w.quality, 90, 110, 100),
    tier: safe(w.tier, 1, 5),
    protected: !!w.protected,
    isNew: !!w.isNew,
    affixes: Array(8).fill(null),
    fillUsed: Array(8).fill(false),
  };
  const used = new Set();
  for (let i = 0; i < 8; i++) {
    const a = w.affixes?.[i];
    if (
      i < weaponSlots(result) &&
      a &&
      AFFIX_MAP.has(a.id) &&
      [1, 2, 3].includes(a.rank) &&
      !used.has(a.id)
    ) {
      result.affixes[i] = { id: a.id, rank: a.rank };
      used.add(a.id);
    }
    result.fillUsed[i] = !!w.fillUsed?.[i] || !!result.affixes[i];
  }
  return result;
}
function cleanLoot(data) {
  const loot = newLoot(),
    seen = new Set();
  const clean = (w) => {
    const v = cleanWeapon(w);
    if (!v || seen.has(v.uid)) return null;
    seen.add(v.uid);
    return v;
  };
  loot.inventory = (Array.isArray(data.inventory) ? data.inventory : [])
    .map(clean)
    .filter(Boolean);
  loot.inbox = [
    ...loot.inventory.splice(96),
    ...(Array.isArray(data.inbox) ? data.inbox : []).map(clean).filter(Boolean),
  ];
  loot.worldDrops = (
    Array.isArray(data.worldDrops) ? data.worldDrops : []
  ).flatMap((d) => {
    const weapon = clean(d.weapon);
    return weapon
      ? [
          {
            x: Number.isFinite(d.x) ? d.x : 0,
            y: Number.isFinite(d.y) ? d.y : 0,
            weapon,
          },
        ]
      : [];
  });
  loot.equippedId = loot.inventory.some((w) => w.uid === data.equippedId)
    ? data.equippedId
    : loot.inventory[0]?.uid;
  loot.highestTier = safe(data.highestTier, 1, 5);
  loot.firstDropKills = safe(data.firstDropKills, 0, 1e9);
  loot.hasFoundWeapon = !!data.hasFoundWeapon;
  loot.debugFree = data.debugFree !== false;
  const offer = data.bossOffer;
  if (offer && Array.isArray(offer.choices)) {
    // A claimed choice already exists in inventory; retain the claim receipt, not a second copy.
    const selected =
      typeof offer.selectedId === "string" ? offer.selectedId : null;
    const choices = selected ? [] : offer.choices.map(clean).filter(Boolean);
    if (selected || choices.length)
      loot.bossOffer = {
        tier: safe(offer.tier, 1, 5),
        selectedId: selected,
        choices,
      };
  }
  const r = data.reroll,
    w = loot.inventory.find((w) => w.uid === r?.uid);
  if (
    w &&
    Number.isInteger(r.slot) &&
    r.slot >= 0 &&
    r.slot < weaponSlots(w) &&
    Array.isArray(r.choices)
  ) {
    const choices = r.choices
      .filter((a) => AFFIX_MAP.has(a.id) && [1, 2, 3].includes(a.rank))
      .map((a) => ({ id: a.id, rank: a.rank }));
    if (choices.length)
      loot.reroll = {
        uid: w.uid,
        slot: r.slot,
        cost: safe(r.cost, 0, 1e12),
        choices,
      };
  }
  loot.nextId = Math.max(
    safe(data.nextId, 1, 1e12),
    ...Array.from(seen, (id) => Number(id.slice(1)) + 1),
    1,
  );
  if (!loot.inventory.length) addStarter(loot);
  return loot;
}
function migrate(storage) {
  const old = readLegacy(storage),
    loot = newLoot();
  let refund = Object.values(old.paid).reduce((s, n) => s + n, 0);
  for (let i = 0; i < old.rank; i++) refund += Math.round(60 * 2.2 ** i);
  for (const def of WEAPONS)
    if (old.purchased[def.id]) {
      const w = createWeapon(loot, def.id, 1, () => 0.5);
      w.quality = 100;
      w.affixes = Array(8).fill(null);
      w.fillUsed = Array(8).fill(false);
      const innate = new Set(profile(w).ids);
      const attachments = [...AFFIX_MAP.values()]
        .map((a) => ({
          id: a.id,
          rank:
            [3, 2, 1].find((rank) =>
              a.tiers[rank - 1].every((id) => old.purchased[id]),
            ) || 0,
        }))
        .filter(
          (a) =>
            a.rank &&
            AFFIX_MAP.get(a.id).tiers[a.rank - 1].some((id) => !innate.has(id)),
        )
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
      let slot = 0;
      for (const a of attachments) {
        if (slot >= 3) break;
        if (validAffix(w, slot, a)) {
          w.affixes[slot] = a;
          w.fillUsed[slot] = true;
          slot++;
        }
      }
      loot.inventory.push(w);
      if (def.id === old.equippedSpecial) loot.equippedId = w.uid;
    }
  if (!loot.inventory.length) addStarter(loot);
  loot.equippedId ||= loot.inventory[0].uid;
  return { gold: Math.min(1e12, old.gold + refund), loot };
}
export function readProgress(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version === 4)
        return {
          gold: safe(data.gold, 0, 1e12),
          loot: cleanLoot(data.loot || {}),
        };
    }
    return migrate(storage);
  } catch {
    const loot = newLoot();
    addStarter(loot);
    return { gold: 0, loot };
  }
}
export function saveProgress(g, storage = globalThis.localStorage) {
  try {
    if (!storage || !g.loot) throw Error("Storage unavailable");
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 4, gold: g.gold, loot: g.loot }),
    );
    g.saveFailed = false;
    return true;
  } catch {
    g.saveFailed = true;
    return false;
  }
}
