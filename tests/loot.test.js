import test from "node:test";
import assert from "node:assert/strict";
import {
  WEAPONS,
  AFFIXES,
  WEAPON_MAP,
  newLoot,
  addStarter,
  createWeapon,
  profile,
  syncLootBuild,
  equipped,
  awardKill,
  levelInfo,
  xpNeeded,
  slotCount,
  weaponSlots,
  equipWeapon,
  startReroll,
  chooseReroll,
  rerollPrice,
  sellWeapon,
  saleValue,
  receiveWeapon,
  claimInbox,
  collectWeaponDrops,
  beginBossOffer,
  claimBossWeapon,
  validAffix,
  rollRank,
} from "../src/lootModel.js";
import { readProgress, saveProgress, SAVE_KEY } from "../src/progression.js";
import { BuildCombat } from "../src/buildCombat.js";
const rng = () => {
  let seed = 831;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};
function state() {
  const g = {
    mode: "weaponSelect",
    runElapsed: 0,
    wave: 1,
    gold: 1000,
    loot: newLoot(),
    enemies: [],
    enemyProjectiles: [],
    player: {
      x: 0,
      y: 0,
      hp: 30,
      maxHp: 30,
      barrier: 0,
      moveX: 0,
      moveY: 0,
      facingX: 1,
      radius: 18,
    },
  };
  addStarter(g.loot);
  syncLootBuild(g);
  return g;
}
const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
};
const xpAt = (level) =>
  Array.from({ length: level - 1 }, (_, i) => xpNeeded(i + 1)).reduce(
    (a, b) => a + b,
    0,
  );
test("72 weapon definitions and 36 attachments with all 108 legacy traits", () => {
  assert.equal(WEAPONS.length, 72);
  assert.equal(AFFIXES.length, 36);
  assert.equal(new Set(AFFIXES.flatMap((a) => a.tiers[2])).size, 108);
  const b = WEAPON_MAP.get("B10");
  assert.ok(b.innate.includes("B03"));
  assert.ok(!b.innate.includes("A03"));
  for (const w of WEAPONS)
    assert.equal(w.innate.filter((id) => id === w.id).length, 1);
});
test("individual XP, exact slot thresholds, cap and duplicate death protection", () => {
  const g = state(),
    first = equipped(g),
    second = createWeapon(g.loot, "B10");
  g.loot.inventory.push(second);
  for (const [level, slots] of [
    [1, 3],
    [4, 4],
    [8, 5],
    [12, 6],
    [16, 7],
    [20, 8],
  ]) {
    first.xp = xpAt(level);
    assert.equal(levelInfo(first.xp).level, level);
    assert.equal(weaponSlots(first), slots);
  }
  first.xp = xpAt(4) - 1;
  const e = { x: 0, y: 0 };
  awardKill(g, e, () => 1);
  assert.equal(levelInfo(first.xp).level, 4);
  assert.equal(second.xp, 0);
  const xp = first.xp;
  awardKill(g, e);
  assert.equal(first.xp, xp);
  equipWeapon(g, second.uid);
  g.wave = 5;
  awardKill(g, { boss: true }, () => 1);
  assert.equal(second.xp, Math.round(20 * 1.6 ** 4));
  assert.equal(first.xp, xp);
  second.xp = 1e9;
  assert.equal(levelInfo(second.xp).level, 20);
});
test("first drop guarantee, regular/elite chances, collection and stable individual IDs", () => {
  const g = state();
  for (let i = 0; i < 9; i++) awardKill(g, { x: i, y: 0 }, () => 0.99);
  assert.equal(g.loot.worldDrops.length, 0);
  awardKill(g, { x: 10, y: 0 }, () => 0.99);
  assert.equal(g.loot.worldDrops.length, 1);
  const uid = g.loot.worldDrops[0].weapon.uid;
  collectWeaponDrops(g);
  assert.ok(g.loot.inventory.some((w) => w.uid === uid));
  collectWeaponDrops(g);
  assert.equal(g.loot.inventory.length, 2);
  awardKill(g, { elite: true, x: 0, y: 0 }, () => 0.19);
  assert.equal(g.loot.worldDrops.length, 1);
  awardKill(g, { elite: true, x: 0, y: 0 }, () => 0.21);
  assert.equal(g.loot.worldDrops.length, 1);
  awardKill(g, { x: 0, y: 0 }, () => 0.01);
  assert.equal(g.loot.worldDrops.length, 2);
  assert.equal(
    rollRank(1, () => 0.79),
    1,
  );
  assert.equal(
    rollRank(1, () => 0.81),
    2,
  );
  assert.equal(
    rollRank(5, () => 0.99),
    3,
  );
});
test("single-slot reroll charges once, persists choices and preserves other slots", () => {
  const g = state(),
    w = equipped(g),
    storage = memory();
  g.loot.debugFree = false;
  g.gold = 45;
  assert.equal(rerollPrice(g, w, 0), 15);
  assert.equal(startReroll(g, w.uid, 0, rng()), "");
  assert.equal(g.gold, 30);
  const choices = JSON.stringify(g.loot.reroll.choices);
  assert.equal(new Set(g.loot.reroll.choices.map((a) => a.id)).size, 3);
  assert.notEqual(startReroll(g, w.uid, 0), "");
  assert.equal(g.gold, 30);
  assert.ok(saveProgress(g, storage));
  const saved = readProgress(storage);
  assert.equal(JSON.stringify(saved.loot.reroll.choices), choices);
  assert.equal(saved.gold, 30);
  Object.assign(g, saved);
  const old = JSON.stringify(equipped(g).affixes.slice(1));
  assert.equal(chooseReroll(g, 0), "");
  assert.equal(JSON.stringify(equipped(g).affixes.slice(1)), old);
  assert.equal(g.gold, 30);
  assert.equal(chooseReroll(g, null), "候補がありません");
  for (let i = 0; i < 2; i++) {
    assert.equal(startReroll(g, w.uid, 0, rng()), "");
    chooseReroll(g, null);
  }
  assert.equal(g.gold, 0);
  assert.notEqual(startReroll(g, w.uid, 0), "");
});
test("blank first fill is free once; locked slots, duplicate/ineffective/incompatible affixes are excluded", () => {
  const g = state(),
    w = equipped(g);
  g.loot.debugFree = false;
  g.gold = 0;
  assert.equal(startReroll(g, w.uid, 1, rng()), "");
  chooseReroll(g, null);
  assert.notEqual(startReroll(g, w.uid, 1), "");
  assert.notEqual(startReroll(g, w.uid, 3), "");
  const selfDestruct = createWeapon(g.loot, "E10");
  selfDestruct.affixes.fill(null);
  assert.equal(validAffix(selfDestruct, 0, { id: "B02", rank: 1 }), false);
  const ricochet = createWeapon(g.loot, "B10");
  ricochet.affixes.fill(null);
  assert.equal(validAffix(ricochet, 0, { id: "B01", rank: 3 }), false);
  w.affixes[1] = { id: "B01", rank: 1 };
  assert.equal(validAffix(w, 2, { id: "B01", rank: 3 }), false);
  g.mode = "arena";
  g.runElapsed = 5;
  assert.notEqual(startReroll(g, w.uid, 0), "");
  assert.notEqual(equipWeapon(g, selfDestruct.uid), "");
});
test("boss choices are distinct, survive reload and are received exactly once", () => {
  const g = state(),
    storage = memory();
  beginBossOffer(g, rng());
  const offer = JSON.stringify(g.loot.bossOffer);
  beginBossOffer(g);
  assert.deepEqual(g.loot.bossOffer, JSON.parse(offer));
  assert.equal(new Set(g.loot.bossOffer.choices.map((w) => w.kind)).size, 3);
  saveProgress(g, storage);
  Object.assign(g, readProgress(storage));
  assert.deepEqual(g.loot.bossOffer, JSON.parse(offer));
  const uid = g.loot.bossOffer.choices[0].uid;
  assert.equal(claimBossWeapon(g, uid), "");
  assert.notEqual(claimBossWeapon(g, uid), "");
  assert.equal(g.loot.inventory.filter((w) => w.uid === uid).length, 1);
  saveProgress(g, storage);
  Object.assign(g, readProgress(storage));
  assert.equal(g.loot.bossOffer.selectedId, uid);
  assert.equal(g.loot.inventory.filter((w) => w.uid === uid).length, 1);
});
test("full inventory queues loot and selling only removes the selected unprotected individual", () => {
  const g = state();
  for (let i = 1; i < 96; i++)
    g.loot.inventory.push(createWeapon(g.loot, "A10"));
  const w = g.loot.inventory[1],
    pending = createWeapon(g.loot, "G10");
  receiveWeapon(g, pending);
  assert.equal(g.loot.inbox.length, 1);
  assert.equal(g.loot.inventory.length, 96);
  assert.notEqual(sellWeapon(g, g.loot.equippedId), "");
  w.protected = true;
  assert.notEqual(sellWeapon(g, w.uid), "");
  w.protected = false;
  const gold = g.gold,
    value = saleValue(w);
  assert.equal(sellWeapon(g, w.uid), "");
  assert.equal(g.gold, gold + value);
  assert.equal(g.loot.inventory.length, 96);
  assert.equal(g.loot.inbox.length, 0);
  assert.ok(g.loot.inventory.some((w) => w.uid === pending.uid));
  assert.ok(!g.loot.inventory.some((other) => other.uid === w.uid));
});
test("v3 migration preserves original, refunds real costs once, converts weapons and scales quality once", () => {
  const storage = memory(),
    old = {
      version: 3,
      gold: 10,
      rank: 2,
      equippedSpecial: "B10",
      purchased: {
        A03: true,
        B01: true,
        B04: true,
        B07: true,
        B03: true,
        B10: true,
      },
      paid: { B04: 25, B07: 60 },
      active: [],
    };
  storage.setItem(
    "survivor.progression.v3.composed-stone",
    JSON.stringify(old),
  );
  const s = readProgress(storage);
  assert.equal(s.gold, 10 + 25 + 60 + 60 + 132);
  assert.equal(s.loot.inventory.length, 1);
  assert.equal(s.loot.inventory[0].kind, "B10");
  assert.equal(s.loot.inventory[0].xp, 0);
  const g = { ...s };
  saveProgress(g, storage);
  assert.equal(readProgress(storage).gold, s.gold);
  assert.equal(
    storage.getItem("survivor.progression.v3.composed-stone"),
    JSON.stringify(old),
  );
  const w = s.loot.inventory[0];
  w.quality = 110;
  w.xp = xpAt(4);
  assert.ok(Math.abs(profile(w).power - 11 * 1.12 ** 3) < 1e-9);
  storage.setItem(
    SAVE_KEY,
    JSON.stringify({
      version: 4,
      gold: -4,
      loot: { inventory: [{ uid: "bad", kind: "bad" }] },
    }),
  );
  assert.equal(readProgress(storage).gold, 0);
  assert.equal(readProgress(storage).loot.inventory[0].kind, "starter");
});
test("all new weapon cores and all 108 attachment tiers execute finite bounded combat", () => {
  const scenarios = [
    ...WEAPONS.map((w) => ({ kind: w.id })),
    ...AFFIXES.flatMap((a) =>
      [1, 2, 3].map((rank) => ({ kind: "starter", affix: { id: a.id, rank } })),
    ),
  ];
  for (const scenario of scenarios) {
    const g = state(),
      w = createWeapon(g.loot, scenario.kind, 3, rng());
    w.affixes.fill(null);
    if (scenario.affix) w.affixes[0] = scenario.affix;
    g.loot.inventory = [w];
    g.loot.equippedId = w.uid;
    syncLootBuild(g);
    g.enemies = Array.from({ length: 12 }, (_, id) => ({
      id,
      x: 80 + Math.cos(id) * 50,
      y: Math.sin(id) * 60,
      hp: 100000,
      maxHp: 100000,
      radius: 18,
      boss: id === 0,
    }));
    const c = new BuildCombat(g, { random: () => 0.1 });
    for (let i = 0; i < 360; i++) {
      if (i % 60 === 0) {
        c.heal(4);
        c.playerDamage(4);
        c.gold(12);
      }
      c.update(1 / 30);
    }
    const damage = Object.values(c.stats.damage).reduce((s, n) => s + n, 0);
    assert.ok(Number.isFinite(damage) && damage > 0, JSON.stringify(scenario));
    assert.ok(c.objects.length < 320);
    assert.ok(Number.isFinite(g.player.hp));
  }
});
