import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  SKILLS,
  RECIPES,
  closure,
  validateBuild,
  buyNode,
  refundNode,
  applyRecipe,
  activateNode,
  masteryCost,
  buyMastery,
} from "../src/buildModel.js";
import { BuildCombat } from "../src/buildCombat.js";
import { readProgress, saveProgress, SAVE_KEY } from "../src/progression.js";
const state = () => ({
  debugFreeSkills: false,
  mode: "weaponSelect",
  runElapsed: 0,
  gold: 0,
  treePurchases: { weapon: {} },
  skillPaid: {},
  activeSkills: [],
  masteryRank: 0,
  buildPresets: [],
  wave: 1,
  enemies: [],
  enemyProjectiles: [],
  player: {
    x: 0,
    y: 0,
    hp: 30,
    maxHp: 30,
    barrier: 0,
    radius: 18,
    moveX: 0,
    moveY: 0,
    facingX: 1,
    facingY: 0,
  },
});
test("180 unique nodes have reachable prerequisites and every recipe respects all capacity limits", () => {
  assert.equal(SKILLS.length, 180);
  assert.equal(new Set(SKILLS.map((n) => n.id)).size, 180);
  assert.equal(RECIPES.length, 60);
  for (const n of SKILLS) assert.ok(closure([n.id]).includes(n.id));
  for (const r of RECIPES)
    assert.equal(validateBuild(closure(r.core)), "", r.name);
});
test("debug mode purchases all 180 nodes for zero, and all 60 recipes are free", () => {
  const g = state();
  g.debugFreeSkills = true;
  for (const n of SKILLS) assert.equal(buyNode(g, n.id), true, n.id);
  assert.equal(Object.keys(g.treePurchases.weapon).length, 180);
  assert.equal(g.gold, 0);
  assert.ok(Object.values(g.skillPaid).every((v) => v === 0));
  assert.equal(validateBuild(g.activeSkills), "");
  for (const recipe of RECIPES) {
    assert.equal(applyRecipe(g, recipe), "", recipe.id);
    assert.equal(g.gold, 0);
  }
});
test("zero start, one free entry, real payment refunds and no duplicate purchase", () => {
  const g = state();
  assert.equal(buyNode(g, "A04"), false);
  assert.equal(buyNode(g, "A01"), true);
  assert.equal(g.gold, 0);
  assert.equal(g.skillPaid.A01, 0);
  assert.equal(buyNode(g, "B01"), false);
  g.gold = 100;
  assert.equal(buyNode(g, "A04"), true);
  assert.equal(g.gold, 75);
  assert.equal(buyNode(g, "A04"), false);
  assert.equal(refundNode(g, "A01"), true);
  assert.equal(g.gold, 100);
  assert.deepEqual(g.activeSkills, []);
  assert.equal(buyNode(g, "A01"), true);
  assert.equal(g.gold, 90);
});
test("recipe changes are atomic, restricted during combat, retain purchased progress across saves", () => {
  const g = state();
  g.gold = 1500;
  assert.equal(applyRecipe(g, RECIPES[4]), "");
  const before = JSON.stringify(g);
  g.mode = "arena";
  g.runElapsed = 10;
  const combatBefore = JSON.stringify(g);
  assert.notEqual(applyRecipe(g, RECIPES[22]), "");
  assert.equal(JSON.stringify(g), combatBefore);
  g.mode = "bossReward";
  g.gold = 0;
  const low = JSON.stringify(g);
  const costly = { core: ["A10", "B12", "C10", "D11"] };
  assert.notEqual(applyRecipe(g, costly), "");
  assert.equal(JSON.stringify(g), low);
  assert.ok(before);
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  assert.equal(saveProgress(g, storage), true);
  const loaded = readProgress(storage);
  assert.deepEqual(loaded.active, g.activeSkills);
  assert.deepEqual(loaded.paid, g.skillPaid);
});
test("old save does not grant debug skills or currency; corrupt saves are sanitized", () => {
  const values = new Map([
      [
        "survivor.progression.v1",
        JSON.stringify({ version: 1, gold: 99999, purchased: { rapid: true } }),
      ],
    ]),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  assert.equal(readProgress(storage).gold, 0);
  assert.deepEqual(readProgress(storage).purchased, {});
  assert.ok(values.has("survivor.progression.v1"));
  values.set(
    SAVE_KEY,
    JSON.stringify({
      version: 2,
      gold: -10,
      rank: Infinity,
      purchased: { A10: true, A01: true, bad: true },
      active: ["A10"],
      paid: { A01: 9999 },
    }),
  );
  const p = readProgress(storage);
  assert.equal(p.gold, 0);
  assert.deepEqual(p.active, []);
  assert.deepEqual(p.purchased, { A01: true });
  assert.equal(p.paid.A01, 10);
  assert.equal(
    saveProgress(state(), {
      setItem() {
        throw new Error("quota");
      },
    }),
    false,
  );
});
test("prerequisites, rule exclusivity and mastery economy enforce constraints", () => {
  assert.notEqual(validateBuild(["A10"]), "");
  assert.notEqual(validateBuild(["R01", "R02"]), "");
  assert.notEqual(validateBuild(closure(["R01", "A01", "B01"])), "");
  const g = state();
  assert.equal(masteryCost(g), 60);
  g.gold = 60;
  assert.equal(buyMastery(g), true);
  assert.equal(g.masteryRank, 1);
  assert.equal(masteryCost(g), 132);
});
function enemy(id, x = 90, y = 0, hp = 300) {
  return { id, x, y, hp, maxHp: hp, radius: 18, boss: false };
}
test("all 60 recipes cause finite damage under movement, stationary, recovery and boss scenarios", () => {
  for (const r of RECIPES) {
    const g = state();
    g.gold = 2000;
    assert.equal(applyRecipe(g, r), "", r.name);
    g.mode = "arena";
    g.enemies = Array.from({ length: 16 }, (_, i) =>
      enemy(i, 80 + Math.cos(i) * 75, Math.sin(i) * 75),
    );
    g.enemies.push({ ...enemy(99, 120, 0, 20000), boss: true });
    const c = new BuildCombat(g, { random: () => 0.1 });
    for (let step = 0; step < 720; step++) {
      const t = step / 30;
      g.player.moveX = t % 8 < 4 ? 1 : 0;
      g.player.moveY = t % 8 < 4 ? Math.sin(t) : 0;
      if (g.player.moveX) {
        g.player.x = Math.cos(t * 0.5) * 60;
        g.player.y = Math.sin(t * 0.5) * 60;
      }
      if (step % 60 === 0) {
        g.player.hp = Math.max(5, g.player.hp - c.playerDamage(4));
        c.gold(12);
      }
      c.update(1 / 30);
      for (const e of g.enemies)
        if (e.dead) {
          e.dead = false;
          e.hp = e.maxHp;
          e.buildDeathHandled = false;
        }
    }
    const total = Object.values(c.stats.damage).reduce((s, n) => s + n, 0);
    assert.ok(
      Number.isFinite(total) && total > 0,
      `${r.id} ${r.name}: ${total}`,
    );
    assert.ok(c.objects.length < 200, r.name);
    assert.ok(Number.isFinite(g.player.hp), r.name);
  }
});
test("healing procs at full HP, shields absorb damage, self damage cannot kill", () => {
  const g = state();
  g.activeSkills = closure(["J07", "J05", "J03"]);
  g.enemies = [enemy(1)];
  const c = new BuildCombat(g);
  c.heal(4);
  c.drain();
  assert.ok(g.enemies[0].hp < 300);
  assert.equal(g.player.hp, 30);
  assert.equal(g.player.barrier, 2);
  assert.equal(c.playerDamage(5), 3);
  g.player.hp = 3;
  c.hit(g.enemies[0], 1, "A00", true);
  assert.equal(g.player.hp, 3);
});
test("freeze reacts with heat, boss cold cannot permanently lock movement, poison expires", () => {
  const g = state();
  g.activeSkills = closure(["X02", "G10"]);
  const e = enemy(1);
  g.enemies = [e];
  const c = new BuildCombat(g);
  c.cold(e, 5);
  assert.ok(e.buildStatus.frozen > 0);
  c.burn(e);
  c.drain();
  assert.equal(e.buildStatus.frozen, 0);
  assert.ok(e.hp < 300);
  const boss = { ...enemy(2), boss: true };
  g.enemies = [boss];
  c.cold(boss, 5);
  assert.ok(boss.buildStatus.frozen <= 0.7);
  assert.notEqual(boss.slowMultiplier, 0.05);
  boss.buildStatus.poison = 5;
  boss.buildStatus.poisonLeft = 0.1;
  c.updateStatus(boss, 0.2);
  assert.equal(boss.buildStatus.poison, 0);
});
test("small magazine reloads more often; supply does not reset reload timer", () => {
  const run = (ids) => {
    const g = state();
    g.activeSkills = closure(ids);
    g.enemies = [enemy(1, 100, 0, 99999)];
    const c = new BuildCombat(g);
    for (let i = 0; i < 300; i++) c.update(1 / 30);
    return c;
  };
  const fast = run(["A12"]),
    normal = run(["A06"]);
  assert.ok((fast.stats.events.A06 || 0) > (normal.stats.events.A06 || 0));
  fast.g.activeSkills = closure(["A12", "H05"]);
  fast.configure();
  fast.reload = 0.4;
  fast.lightning(fast.g.enemies[0], 1, "H02");
  assert.equal(fast.reload, 0.4);
});
test("late contracts cannot activate after combat starts and delayed mines honor their fuse", () => {
  const g = state();
  g.debugFreeSkills = true;
  buyNode(g, "A01");
  g.mode = "arena";
  g.runElapsed = 10;
  assert.equal(buyNode(g, "R11"), true);
  assert.ok(!g.activeSkills.includes("R11"));
  assert.notEqual(activateNode(g, "R11"), "");
  const c = new BuildCombat(g);
  g.enemies = [enemy(1, 0, 0)];
  const mine = c.spawn("mine", g.player, 5, "D02", { age: 1, fuse: 0.5 });
  c.updateObjects(0.1);
  assert.equal(g.enemies[0].hp, 300);
  c.updateObjects(0.5);
  assert.ok(g.enemies[0].hp < 300);
  assert.equal(mine.life, 0);
});
test("gold spent on respec never counts as combat pickup, expired cosmetic visuals cannot remove hazards", () => {
  const g = state();
  g.debugFreeSkills = true;
  applyRecipe(g, RECIPES[55]);
  g.enemies = [enemy(1)];
  const c = new BuildCombat(g);
  c.gold(11);
  c.drain();
  const first = c.stats.events.L07 || 0;
  applyRecipe(g, RECIPES[55]);
  c.configure();
  c.drain();
  assert.equal(c.stats.events.L07 || 0, first);
  const zone = c.zone(g.player, 100, 3, "D03", "quake");
  for (let i = 0; i < 200; i++) c.effect("A01", 0, 0);
  assert.ok(c.objects.includes(zone));
  c.gold(1);
  c.drain();
  assert.ok(c.stats.events.L07 > first);
});
test("loop-space bullets hit across seams and returning blades reach player", () => {
  const g = state();
  g.activeSkills = ["B02"];
  g.player.x = 990;
  g.enemies = [enemy(1, 20)];
  const delta = (a, b) => {
    let dx = b.x - a.x;
    dx -= Math.round(dx / 1000) * 1000;
    return { dx, dy: b.y - a.y };
  };
  const c = new BuildCombat(g, {
    delta,
    wrap: (o) => {
      o.x = (o.x + 1000) % 1000;
    },
  });
  for (let i = 0; i < 150; i++) c.update(1 / 30);
  assert.ok(g.enemies[0].hp < 300);
  assert.ok(c.objects.every((o) => Number.isFinite(o.x)));
});
test("runtime covers all node identifiers, including bridge and special rule endpoints", () => {
  const text =
    readFileSync(new URL("../src/buildCombat.js", import.meta.url), "utf8") +
    readFileSync(new URL("../src/skillTree.js", import.meta.url), "utf8");
  const missing = SKILLS.filter(
    (n) => !new RegExp(`["']${n.id}["']`).test(text),
  );
  assert.deepEqual(
    missing.map((n) => n.id),
    [],
  );
});
