import { SKILLS, NODE_MAP, closure } from "./buildModel.js";
export const CAPACITY = 96;
const names = [
  ["貫通", "拡散", "連射"],
  ["跳弾", "帰還", "命中爆発"],
  ["公転", "衝撃殻", "引力"],
  ["定着砲芯", "埋設", "震域"],
  ["追尾", "護衛", "亡響"],
  ["燃焼", "蓄熱", "炎の軌跡"],
  ["冷却", "冷気波", "氷追尾"],
  ["雷芯", "帯電", "会心"],
  ["呪い", "毒", "侵食"],
  ["再生", "防壁", "血の契約"],
  ["走行", "停止", "無傷"],
  ["回収", "蓄財", "賞金"],
];
export const AFFIXES = [..."ABCDEFGHIJKL"].flatMap((f, i) =>
  names[i].map((name, j) => ({
    id: f + "0" + (j + 1),
    name,
    family: f,
    tiers: [1, 2, 3].map((rank) =>
      Array.from(
        { length: rank },
        (_, k) => f + String(j + 1 + k * 3).padStart(2, "0"),
      ),
    ),
  })),
);
export const AFFIX_MAP = new Map(AFFIXES.map((a) => [a.id, a]));
const extra = { B10: ["B03"], F12: ["C01"], I12: ["I01", "I02"], K11: ["J02"] };
export const WEAPONS = SKILLS.filter((n) => n.special).map((n) => {
  const branch = Number(n.id.slice(1)) - 9;
  const innate =
    n.family === "X" || n.family === "R"
      ? closure(n.requires_all)
      : closure([n.family + String(branch + 6).padStart(2, "0")]);
  return {
    id: n.id,
    name: n.name,
    family: n.family,
    effect:
      n.id === "B10"
        ? "跳ねるたびに爆風が拡大。最後の跳弾は大爆発。連射を追加して弾幕へ。"
        : n.effect,
    innate: [...new Set([...innate, ...(extra[n.id] || []), n.id])],
  };
});
export const WEAPON_MAP = new Map(
  [
    ...WEAPONS,
    {
      id: "starter",
      name: "原石",
      family: "A",
      effect: "素直な石ころ。アタッチメントで自由に組み立てられる。",
      innate: [],
    },
  ].map((w) => [w.id, w]),
);
export const RANK_WEIGHTS = [
  [80, 20, 0],
  [65, 30, 5],
  [45, 40, 15],
  [25, 45, 30],
  [15, 40, 45],
];
export function xpNeeded(level) {
  return Math.ceil(30 * 1.22 ** (level - 1));
}
export function levelInfo(xp = 0) {
  let level = 1,
    left = xp;
  while (level < 20 && left >= xpNeeded(level)) {
    left -= xpNeeded(level);
    level++;
  }
  return {
    level,
    current: level === 20 ? 0 : left,
    next: level === 20 ? 0 : xpNeeded(level),
  };
}
export function slotCount(level) {
  return 3 + [4, 8, 12, 16, 20].filter((n) => level >= n).length;
}
export function weaponSlots(w) {
  return slotCount(levelInfo(w.xp).level);
}
export function affixIds(a) {
  return (a && AFFIX_MAP.get(a.id)?.tiers[a.rank - 1]) || [];
}
export function profile(w) {
  const def = WEAPON_MAP.get(w.kind) || WEAPON_MAP.get("starter");
  const ids = [
    ...new Set([
      ...def.innate,
      ...w.affixes.slice(0, weaponSlots(w)).flatMap(affixIds),
    ]),
  ];
  return {
    ids,
    power: 10 * (w.quality / 100) * 1.12 ** (levelInfo(w.xp).level - 1),
    name: def.name,
  };
}
export function equipped(g) {
  return g.loot?.inventory.find((w) => w.uid === g.loot.equippedId);
}
export function syncLootBuild(g) {
  const w = equipped(g);
  if (!w) return;
  const p = profile(w);
  g.activeSkills = p.ids;
  g.weaponPower = p.power;
  g.equippedSpecial = w.kind === "starter" ? null : w.kind;
  g.masteryRank = 0;
}
export function canEdit(g) {
  return (
    ["weaponSelect", "bossReward", "result"].includes(g.mode) ||
    ["weaponSelect", "bossReward", "result"].includes(g.modeBeforeSkillTree) ||
    (g.runElapsed || 0) === 0
  );
}
export function newLoot() {
  return {
    inventory: [],
    equippedId: null,
    nextId: 1,
    inbox: [],
    worldDrops: [],
    bossOffer: null,
    reroll: null,
    highestTier: 1,
    firstDropKills: 0,
    hasFoundWeapon: false,
    debugFree: true,
  };
}
const pick = (list, rng) =>
  list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
export function rollRank(tier, rng = Math.random) {
  const x = rng() * 100,
    w = RANK_WEIGHTS[Math.min(4, Math.max(0, tier - 1))];
  return x < w[0] ? 1 : x < w[0] + w[1] ? 2 : 3;
}
export function validAffix(w, slot, a) {
  if (w.affixes.some((other, i) => i !== slot && other?.id === a.id))
    return false;
  const without = {
      ...w,
      affixes: w.affixes.map((v, i) => (i === slot ? null : v)),
    },
    ids = new Set(profile(without).ids);
  if (ids.has("E10") && affixIds(a).some((id) => ["B02", "E07"].includes(id)))
    return false;
  if (ids.has("R03") && a.id === "K02") return false;
  if (
    !affixIds(a).some(
      (id) =>
        !ids.has(id) &&
        !(id === "B02" && ids.has("E07")) &&
        !(id === "E01" && ids.has("G03")),
    )
  )
    return false;
  const current = w.affixes[slot];
  return !current || a.id !== current.id || a.rank > current.rank;
}
export function rollAffixes(w, slot, tier, rng = Math.random, count = 3) {
  const pool = AFFIXES.map((a) => ({
    id: a.id,
    ranks: [1, 2, 3].filter(
      (rank) =>
        validAffix(w, slot, { id: a.id, rank }) &&
        RANK_WEIGHTS[Math.min(4, tier - 1)][rank - 1] > 0,
    ),
  })).filter((a) => a.ranks.length);
  const result = [];
  while (result.length < count && pool.length) {
    const selected = pick(pool, rng);
    pool.splice(pool.indexOf(selected), 1);
    const weights = RANK_WEIGHTS[Math.min(4, tier - 1)];
    let x = rng() * selected.ranks.reduce((s, r) => s + weights[r - 1], 0),
      rank = selected.ranks.at(-1);
    for (const r of selected.ranks) {
      x -= weights[r - 1];
      if (x < 0) {
        rank = r;
        break;
      }
    }
    result.push({ id: selected.id, rank });
  }
  return result;
}
export function createWeapon(
  loot,
  kind,
  tier = 1,
  rng = Math.random,
  { starter = false } = {},
) {
  const w = {
    uid: "w" + loot.nextId++,
    kind,
    xp: 0,
    quality: starter ? 100 : 90 + Math.min(20, Math.floor(rng() * 21)),
    tier,
    affixes: Array(8).fill(null),
    fillUsed: Array(8).fill(false),
    protected: false,
    isNew: true,
  };
  if (starter) w.affixes[0] = { id: "A03", rank: 1 };
  else
    for (let i = 0; i < 3; i++)
      w.affixes[i] = rollAffixes(w, i, tier, rng, 1)[0] || null;
  w.fillUsed = w.affixes.map(Boolean);
  return w;
}
export function addStarter(loot) {
  const w = createWeapon(loot, "starter", 1, Math.random, { starter: true });
  loot.inventory.push(w);
  loot.equippedId = w.uid;
  return w;
}
export function receiveWeapon(g, w) {
  if (g.loot.inventory.length < CAPACITY) g.loot.inventory.push(w);
  else g.loot.inbox.push(w);
  g.loot.hasFoundWeapon = true;
  g.lootNoticeAt = g.elapsed || 0;
  g.lootNotice = `獲得：${WEAPON_MAP.get(w.kind).name} / 品質 ${w.quality}%`;
}
export function collectWeaponDrops(g) {
  for (const d of g.loot.worldDrops) receiveWeapon(g, d.weapon);
  g.loot.worldDrops = [];
}
export function claimInbox(g) {
  while (g.loot.inbox.length && g.loot.inventory.length < CAPACITY)
    g.loot.inventory.push(g.loot.inbox.shift());
}
export function awardKill(g, e, rng = Math.random) {
  if (!g.loot || e.lootAwarded) return;
  e.lootAwarded = true;
  const w = equipped(g);
  if (w) {
    const before = levelInfo(w.xp).level;
    w.xp = Math.min(
      1e9,
      w.xp + Math.round((e.boss ? 20 : e.elite ? 5 : 1) * 1.6 ** (g.wave - 1)),
    );
    const after = levelInfo(w.xp).level;
    if (after > before) {
      g.lootNoticeAt = g.elapsed || 0;
      g.lootNotice = `${WEAPON_MAP.get(w.kind).name} Lv.${after}！${slotCount(after) > slotCount(before) ? " アタッチメント枠を解放" : ""}`;
    }
    syncLootBuild(g);
  }
  g.loot.highestTier = Math.max(g.loot.highestTier, g.wave);
  if (e.boss) return;
  g.loot.firstDropKills++;
  if (
    rng() < (e.elite ? 0.2 : 0.02) ||
    (!g.loot.hasFoundWeapon && g.loot.firstDropKills >= 10)
  ) {
    const weapon = createWeapon(g.loot, pick(WEAPONS, rng).id, g.wave, rng);
    g.loot.worldDrops.push({ x: e.x, y: e.y, weapon });
    g.loot.hasFoundWeapon = true;
  }
}
export function beginBossOffer(g, rng = Math.random) {
  if (g.loot.bossOffer && !g.loot.bossOffer.selectedId) return;
  const pool = [...WEAPONS],
    choices = [];
  for (let i = 0; i < 3; i++) {
    const def = pick(pool, rng);
    pool.splice(pool.indexOf(def), 1);
    choices.push(createWeapon(g.loot, def.id, g.wave, rng));
  }
  g.loot.bossOffer = { tier: g.wave, choices, selectedId: null };
}
export function claimBossWeapon(g, uid) {
  const o = g.loot.bossOffer;
  if (!o || o.selectedId) return "報酬は獲得済みです";
  const w = o.choices.find((w) => w.uid === uid);
  if (!w) return "武器を選んでください";
  receiveWeapon(g, w);
  o.selectedId = uid;
  return "";
}
export function equipWeapon(g, uid) {
  if (!canEdit(g)) return "武器交換は出撃前・ボス撃破後・結果画面で行えます";
  if (g.loot.inbox.length) return "受取待ちの武器を整理してください";
  const w = g.loot.inventory.find((w) => w.uid === uid);
  if (!w) return "武器がありません";
  g.loot.equippedId = uid;
  w.isNew = false;
  syncLootBuild(g);
  return "";
}
export function rerollPrice(g, w, slot) {
  return g.loot.debugFree || (!w.affixes[slot] && !w.fillUsed[slot])
    ? 0
    : Math.round(15 * 1.2 ** (levelInfo(w.xp).level - 1));
}
export function startReroll(g, uid, slot, rng = Math.random) {
  if (!canEdit(g)) return "リロールは出撃前・ボス撃破後・結果画面で行えます";
  if (g.loot.reroll) return "先に提示中の候補を選択してください";
  const w = g.loot.inventory.find((w) => w.uid === uid);
  if (!w || !Number.isInteger(slot) || slot < 0 || slot >= weaponSlots(w))
    return "未解放の枠です";
  const cost = rerollPrice(g, w, slot);
  if (g.gold < cost) return `あと${cost - g.gold} G必要です`;
  const choices = rollAffixes(w, slot, g.loot.highestTier, rng);
  if (!choices.length) return "有効な候補がありません";
  g.gold -= cost;
  w.fillUsed[slot] = true;
  g.loot.reroll = { uid, slot, cost, choices };
  return "";
}
export function chooseReroll(g, index) {
  if (!canEdit(g)) return "休憩中に選択してください";
  const r = g.loot.reroll;
  if (!r) return "候補がありません";
  const w = g.loot.inventory.find((w) => w.uid === r.uid);
  if (!w) return "武器がありません";
  if (index !== null) {
    const a = r.choices[index];
    if (!a || !validAffix(w, r.slot, a)) return "無効な候補です";
    w.affixes[r.slot] = a;
  }
  g.loot.reroll = null;
  syncLootBuild(g);
  return "";
}
export function saleValue(w) {
  return 8 * w.tier + 3 * w.affixes.reduce((s, a) => s + (a?.rank || 0), 0);
}
export function sellWeapon(g, uid) {
  if (!canEdit(g) && !g.inventoryOverflow) return "売却は休憩中に行えます";
  const w = g.loot.inventory.find((w) => w.uid === uid);
  if (
    !w ||
    w.uid === g.loot.equippedId ||
    w.protected ||
    g.loot.reroll?.uid === uid
  )
    return "装備中・保護中・リロール中の武器は売却できません";
  g.gold += saleValue(w);
  g.loot.inventory = g.loot.inventory.filter((other) => other !== w);
  claimInbox(g);
  return "";
}
