import { WEAPON_NODES } from "./buildModel.js";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const COLORS = {
  A: [0.9, 0.87, 0.72],
  B: [1, 0.68, 0.25],
  C: [0.55, 0.75, 1],
  D: [0.78, 0.65, 0.4],
  E: [0.55, 1, 0.8],
  F: [1, 0.3, 0.1],
  G: [0.35, 0.87, 1],
  H: [0.85, 0.65, 1],
  I: [0.6, 0.95, 0.25],
  J: [1, 0.45, 0.65],
  K: [0.55, 1, 1],
  L: [1, 0.82, 0.2],
};

// Combat state is independent of cosmetic effect caps. Callbacks are the only game integration.
export class BuildCombat {
  constructor(g, io = {}) {
    this.g = g;
    this.io = io;
    this.time = 0;
    this.timers = {};
    this.objects = [];
    this.visuals = [];
    this.queue = [];
    this.serial = 0;
    this.hits = 0;
    this.crits = 0;
    this.pain = 0;
    this.healBank = 0;
    this.walk = 0;
    this.still = 0;
    this.unhurt = 0;
    this.charge = 0;
    this.ammo = 6;
    this.reload = 0;
    this.heat = 0;
    this.goldMeter = 0;
    this.stats = { damage: {}, events: {}, limited: 0 };
    this.configure();
  }
  configure() {
    this.ids = new Set(this.g.activeSkills || []);
    this.weapons = [...this.ids].filter((id) => WEAPON_NODES.has(id));
    this.power = 10 * 1.25 ** (this.g.masteryRank || 0);
  }
  has(id) {
    return this.ids.has(id);
  }
  get p() {
    return this.g.player;
  }
  delta(a, b) {
    return this.io.delta
      ? this.io.delta(a, b)
      : { dx: b.x - a.x, dy: b.y - a.y };
  }
  distance(a, b) {
    const d = this.delta(a, b);
    return Math.hypot(d.dx, d.dy);
  }
  near(a, r = 700) {
    return this.g.enemies.filter(
      (e) => !e.dead && this.distance(a, e) < r + (e.radius || 0),
    );
  }
  target(a = this.p, range = 650, mode = "near") {
    return this.near(a, range).sort((a1, b) =>
      mode === "strong"
        ? (b.bounty ? 1e7 : b.hp) - (a1.bounty ? 1e7 : a1.hp)
        : this.distance(a, a1) - this.distance(a, b),
    )[0];
  }
  ready(id, interval) {
    if ((this.timers[id] || 0) > this.time) return false;
    this.timers[id] = this.time + Math.max(0.07, interval);
    return true;
  }
  event(id) {
    this.stats.events[id] = (this.stats.events[id] || 0) + 1;
  }
  effect(id, x, y, r = 35, life = 0.3, line = null) {
    this.visuals.push({
      id,
      x,
      y,
      radius: r,
      life,
      maxLife: life,
      tint: COLORS[id[0]] || COLORS.H,
      line,
    });
    if (this.visuals.length > 160) this.visuals.shift();
  }
  defer(id, fn, depth = 0) {
    if (depth > 4 || this.queue.length >= 256) {
      this.stats.limited++;
      return;
    }
    this.queue.push({ id, fn, depth });
  }
  drain() {
    let count = 0;
    while (this.queue.length && count++ < 256) {
      const q = this.queue.shift();
      this.event(q.id);
      q.fn(q.depth + 1);
    }
    if (this.queue.length) {
      this.stats.limited += this.queue.length;
      this.queue = [];
    }
  }
  scale(id, enemy, weapon) {
    let n = 1;
    const dist = this.distance(this.p, enemy),
      missing = 1 - this.p.hp / (this.p.buildOriginalMax || this.p.maxHp);
    if (this.has("R01") && weapon) n *= 1.75;
    if (this.has("R02") && weapon) n *= 0.68;
    if (this.has("R03") && id[0] === "J") n *= 1.8;
    if (this.has("R07") && "DE".includes(id[0])) n *= 0.8;
    if (this.has("J03") && weapon && this.p.hp > 4) n *= 1.25;
    if (this.has("R09")) n *= dist < 150 ? 1.65 : 0.6;
    if (this.has("R10")) n *= dist > 220 ? 1.6 : 0.65;
    if (this.has("R08"))
      n *= id.startsWith("I") || id === "F02" || id === "B09" ? 1.65 : 0.75;
    if (this.has("R12"))
      n *= this.still > 0.2 === (weapon && !"DE".includes(id[0])) ? 1.5 : 0.7;
    if (this.has("J09")) n *= 1 + Math.min(0.65, missing) * 1.5;
    if (this.has("J12")) n *= 1 + (this.bloodBuff || 0);
    if (this.has("K03"))
      n *=
        1 +
        Math.min(
          this.unhurt / (this.has("R05") ? 5 : 10),
          this.has("K09") && this.p.hp >= this.p.maxHp ? 0.6 : 0.3,
        );
    if (this.has("L05") && weapon) n *= 1 + this.wealth() * 0.6;
    if (this.has("L12") && enemy.boss) n *= 1.4;
    const s = enemy.buildStatus || {};
    if (s.fragile) n *= 1 + Math.min(0.6, s.fragile * 0.06);
    if (this.has("I09") && weapon)
      n *=
        1 +
        ["burn", "cold", "poison", "curse", "fragile"].filter((k) => s[k] > 0)
          .length *
          0.12;
    if (this.has("F07") && weapon && s.burnAge > 2) n *= 1.3;
    return n;
  }
  hit(e, amount, id, weapon = false, depth = 0, heavy = false) {
    if (!e || e.dead || depth > 4) return;
    let value = amount * this.scale(id, e, weapon),
      crit = false;
    if (weapon && this.has("H03")) {
      crit =
        (this.io.random?.() ?? Math.random()) <
        0.15 + (this.has("H06") ? (e.nonCrit || 0) * 0.07 : 0);
      e.nonCrit = crit ? 0 : Math.min(8, (e.nonCrit || 0) + 1);
      if (crit)
        value *= this.has("H12")
          ? (this.io.random?.() ?? Math.random()) < 0.3
            ? 5
            : 1.5
          : 1.8;
    }
    const s = (e.buildStatus ??= {});
    if (heavy && this.has("G07") && s.frozen > 0) value *= 1.5;
    const old = Math.max(0, e.hp);
    if (this.io.damage) this.io.damage(e, value, { build: true, id });
    else {
      e.hp -= value;
      if (e.hp <= 0) e.dead = true;
    }
    this.event(id);
    this.stats.damage[id] = (this.stats.damage[id] || 0) + Math.min(old, value);
    if (weapon) {
      this.hits++;
      this.lastHit = this.time;
      if (this.has("F01")) this.burn(e, 1, depth);
      if (this.has("G01")) this.cold(e, 1);
      if (this.has("I01") && !s.curse) {
        s.curse = 1;
        s.curseLeft = (this.has("I07") ? 4 : 2) * (this.has("R08") ? 1.5 : 1);
        s.curseAge = 0;
      }
      if (this.has("J06") && this.ready("leech", 0.2))
        this.heal(Math.min(1.5, value * 0.04), "J06");
      if (this.has("H02") && this.hits % 5 === 0)
        this.defer(
          "H02",
          (d) => this.lightning(e, this.power * 0.7, "H02", d),
          depth,
        );
      if (this.has("K01") && this.walk >= 180) {
        this.walk -= 180;
        this.defer("K01", (d) => this.area(e, 55, this.power, "K01", d), depth);
        if (this.has("K04")) this.spawn("clone", this.p, 3, "K04");
        if (this.has("X10")) this.fastOrbit = this.time + 2;
      }
      if (
        this.has("G10") &&
        heavy &&
        s.frozen > 0 &&
        this.ready("shatter:" + e.id, 0.7)
      ) {
        s.frozen = 0;
        this.defer(
          "G10",
          (d) => {
            this.area(e, 80, this.power * 1.8, "G10", d);
            this.radial(e, 5, this.power * 0.3, "G10");
          },
          depth,
        );
      }
      if (this.has("E03") && this.hits % 18 === 0) this.spirit(e, 0);
      if (this.has("J03") && this.ready("blood", 0.4) && this.p.hp > 4) {
        this.p.hp -= 0.6;
        this.pain += this.has("J08") ? 0.15 : 0;
        if (this.has("X08")) this.spawn("mine", this.p, 6, "D02");
      }
    }
    if (crit) {
      this.crits++;
      this.effect("H03", e.x, e.y, 28);
      if (this.has("H09") && this.crits % 3 === 0)
        this.defer(
          "H09",
          (d) => this.area(e, 42, this.power * 2, "H09", d),
          depth,
        );
      if (this.has("X06"))
        for (const o of this.objects.filter((o) => o.type === "minion")) {
          o.target = e;
          o.rush = 1;
        }
    }
    if (e.dead && !e.buildDeathHandled) {
      e.buildDeathHandled = true;
      this.killed(e, id, depth);
    }
  }
  area(at, r, amount, id, depth = 0, weapon = false) {
    this.effect(id, at.x, at.y, r);
    for (const e of this.near(at, r)) this.hit(e, amount, id, weapon, depth);
  }
  line(a, b, width, amount, id, weapon = true, heavy = false) {
    const d = this.delta(a, b),
      len = Math.hypot(d.dx, d.dy) || 1;
    this.effect(id, a.x, a.y, width, 0.24, { dx: d.dx, dy: d.dy });
    for (const e of this.near(a, len + width)) {
      const q = this.delta(a, e),
        u = clamp((q.dx * d.dx + q.dy * d.dy) / (len * len), 0, 1);
      if (
        Math.hypot(q.dx - u * d.dx, q.dy - u * d.dy) <
        (heavy && id === "A01" ? width * (0.5 + u) : width) + (e.radius || 15)
      )
        this.hit(e, amount, id, weapon, 0, heavy);
    }
  }
  bullet(at, target, damage, id, opts = {}) {
    if (this.objects.filter((o) => o.type === "bullet").length >= 160) {
      this.stats.limited++;
      return;
    }
    const d = this.delta(at, target),
      a = Math.atan2(d.dy, d.dx) + (opts.angle || 0);
    this.objects.push({
      type: "bullet",
      id,
      x: at.x,
      y: at.y,
      life: opts.life || 1.6,
      maxLife: opts.life || 1.6,
      vx: Math.cos(a) * (opts.speed || 350),
      vy: Math.sin(a) * (opts.speed || 350),
      damage,
      age: 0,
      radius: opts.radius || 8,
      seen: new Set(),
      ...opts,
    });
  }
  radial(at, count, damage, id) {
    for (let i = 0; i < count; i++)
      this.bullet(
        at,
        {
          x: at.x + Math.cos((i * TAU) / count),
          y: at.y + Math.sin((i * TAU) / count),
        },
        damage,
        id,
        { weapon: false, life: 0.55 },
      );
  }
  spawn(type, at, life, id, extra = {}) {
    const same = this.objects.filter((o) => o.type === type),
      limit = type === "spirit" ? 12 : type === "minion" ? 8 : 16;
    if (same.length >= limit) {
      if (type === "spirit" && this.has("E09")) {
        const o = same[0];
        o.strength = Math.min(8, (o.strength || 1) + 1);
        if (this.has("E12") && o.strength >= 4) o.king = true;
        return o;
      }
      same[0].life = Math.min(same[0].life, 0.02);
      if (same.length > limit + 2) return null;
    }
    const o = {
      type,
      id,
      x: at.x,
      y: at.y,
      life: life * (type === "delay" ? 1 : this.lifetime()),
      maxLife: life * (type === "delay" ? 1 : this.lifetime()),
      age: 0,
      tick: 0,
      serial: ++this.serial,
      ...extra,
    };
    this.objects.push(o);
    return o;
  }
  lifetime() {
    return this.has("R06") ? 1.7 : this.has("R07") ? 0.55 : 1;
  }
  summonRate() {
    return this.has("R06") ? 1.5 : this.has("R07") ? 0.6 : 1;
  }
  zone(at, r, life, id, kind) {
    return this.spawn("zone", at, life, id, { radius: r, kind });
  }
  burn(e, amount = 1, depth = 0) {
    const s = (e.buildStatus ??= {});
    s.burn = clamp((s.burn || 0) + amount, 0, 6);
    s.burnLeft = 4;
    if (this.has("X02") && s.frozen > 0 && this.ready("thermal:" + e.id, 1)) {
      s.frozen = 0;
      this.defer(
        "X02",
        (d) => this.area(e, 75, this.power * 1.6, "X02", d),
        depth,
      );
    }
    if (this.has("X04") && s.poison && this.ready("distill:" + e.id, 2))
      this.zone(e, 65, 2, "X04", "poison");
  }
  cold(e, amount) {
    const s = (e.buildStatus ??= {});
    s.cold = clamp((s.cold || 0) + amount, 0, 8);
    s.coldLeft = 4;
    e.slowTimer = Math.max(e.slowTimer || 0, 1);
    e.slowMultiplier = 0.8;
    if (this.has("G04") && s.cold >= 4 && (s.freezeLock || 0) <= this.time) {
      s.frozen = e.boss ? 0.7 : 2;
      s.freezeLock = this.time + 3;
      s.cold = 2;
      if (e.boss) this.hit(e, this.power * 0.5, "G04");
    }
    if (s.frozen > 0 && !e.boss) {
      e.slowTimer = Math.max(e.slowTimer, 0.2);
      e.slowMultiplier = 0.05;
    }
  }
  lightning(e, damage, id = "H01", depth = 0) {
    if (!e || e.dead) return;
    if (this.has("H11")) damage *= 1 + this.charge;
    this.hit(e, damage, id, false, depth);
    this.effect("H01", e.x, e.y, 24, 0.25, { dx: 15, dy: -160 });
    const s = (e.buildStatus ??= {});
    if (this.has("H07")) s.lightMark = 4;
    if (this.has("H04")) {
      const others = this.near(e, this.has("X03") ? 220 : 130)
        .filter((x) => x !== e)
        .sort(
          (a, b) => (b.buildStatus?.cold || 0) - (a.buildStatus?.cold || 0),
        );
      for (const x of others.slice(0, this.has("X03") ? 3 : 1))
        this.hit(x, damage * 0.5, "H04", false, depth + 1);
    }
    if (this.has("X01") && s.burn > 0 && this.ready("overload:" + e.id, 0.4)) {
      s.burn = Math.max(0, s.burn - 1);
      this.defer("X01", (d) => this.area(e, 75, this.power, "X01", d), depth);
    }
    if (id === "H02") {
      this.charge = Math.min(1, this.charge + 0.12);
      if (this.has("H05")) {
        this.ammo = Math.min(this.has("A09") ? 1 : 6, this.ammo + 1);
        if (!this.has("A03"))
          for (const key of ["A01", "A02", "B01", "B02", "B03", "basic"])
            this.timers[key] = Math.max(
              this.time,
              (this.timers[key] || this.time) - 0.1,
            );
      }
      if (this.has("H08")) this.haste = this.time + 2;
    }
  }
  spirit(at, generation = 0) {
    const s = this.spawn("spirit", at, 3, "E03", { generation, strength: 1 });
    if (s) this.event("E03");
  }
  killed(e, id, depth) {
    const s = e.buildStatus || {};
    if (this.has("E03") && (id !== "E03" || this.has("E06")) && depth < 3)
      this.defer("E03", () => this.spirit(e, depth + 1), depth);
    if (this.has("B06") && id.startsWith("B"))
      this.defer(
        "B06",
        () => this.radial(e, 4, this.power * 0.35, "B06"),
        depth,
      );
    if (this.has("F10") && s.burn > 0)
      this.defer(
        "F10",
        (d) => this.area(e, 85, this.power * 1.4, "F10", d),
        depth,
      );
    if (this.has("I05") && s.poison > 0) this.zone(e, 70, 4, "I05", "poison");
    if (this.has("I04") && id.startsWith("I") && s.curse && depth < 3)
      for (const other of this.near(e, 140).slice(0, 5)) {
        if (other === e) continue;
        const q = (other.buildStatus ??= {});
        if (!q.curse) {
          q.curse = 1;
          q.curseLeft = 1.5;
          q.curseAge = 0;
          if (this.has("I10"))
            this.defer(
              "I10",
              (d) => this.hit(other, this.power * 0.5, "I10", false, d),
              depth,
            );
        }
      }
    if (this.has("L03") && e.bounty) {
      const bonus =
        2 +
        (this.has("L06") ? 3 : 0) +
        (this.has("L09") ? Math.min(6, this.bountyChain || 0) : 0);
      this.io.reward?.(bonus);
      this.bountyChain = Math.min(6, (this.bountyChain || 0) + 1);
      this.timers.bounty = this.time + 0.1;
    }
    if (this.has("X24") && id === "E01") this.zone(e, 65, 3, "X24", "poison");
  }
  heal(amount, id = "J01") {
    if (!this.p || this.p.hp <= 0) return;
    const before = this.p.hp;
    this.p.hp = Math.min(this.p.maxHp, before + amount);
    const actual = this.p.hp - before,
      over = amount - actual;
    this.event(id);
    if (this.has("J04")) {
      const e = this.target(this.p, 400);
      if (e)
        this.defer("J04", (d) =>
          this.hit(e, this.power * 0.45, "J04", false, d),
        );
    }
    if (this.has("J07"))
      this.p.barrier = Math.min(12, (this.p.barrier || 0) + over * 0.5);
    if (this.has("J10")) {
      this.healBank += actual + over * 0.5;
      if (this.healBank >= 5) {
        this.healBank -= 5;
        this.defer("J10", (d) =>
          this.area(this.p, 145, this.power * 2.5, "J10", d),
        );
      }
    }
    if (
      this.has("J12") &&
      before / (this.p.buildOriginalMax || this.p.maxHp) < 0.5
    )
      this.bloodBuff = Math.min(0.6, (this.bloodBuff || 0) + amount * 0.04);
    if (this.has("X07")) {
      const o = this.objects.find((o) => o.type === "guardian");
      if (o)
        this.defer("X07", (d) => this.area(o, 90, this.power * 0.35, "X07", d));
    }
  }
  playerDamage(amount) {
    if (this.has("K06") && this.unhurt > 6 && this.ready("dodge", 10)) {
      this.unhurt = 0;
      if (this.has("K12")) {
        this.swift = this.time + 2;
        for (const e of this.near(this.p, 160)) this.cold(e, 2);
      }
      this.effect("K06", this.p.x, this.p.y, 60);
      return 0;
    }
    const guardian = this.objects.find(
      (o) => o.type === "guardian" && !o.used && this.distance(o, this.p) < 160,
    );
    if (this.has("E05") && guardian) {
      guardian.used = true;
      guardian.life -= 3;
      if (this.has("E08")) this.area(guardian, 110, this.power * 2, "E08");
      return 0;
    }
    const shield = Math.min(amount, this.p.barrier || 0);
    this.p.barrier = Math.max(0, (this.p.barrier || 0) - shield);
    if (shield > 0) {
      if (this.has("J05"))
        this.defer("J05", (d) =>
          this.area(this.p, 95, this.power * 0.9, "J05", d),
        );
      if (this.has("X22"))
        this.defer("X22", (d) =>
          this.area(this.p, 135, this.power * 0.8, "X22", d),
        );
      if (this.has("L08") && this.p.barrier <= 0)
        this.radial(this.p, 7, this.power * 0.5, "L08");
      if (this.has("C11") && this.p.barrier <= 0) {
        this.armorBurst = this.time + 2;
        for (const e of this.near(this.p, 130)) {
          const d = this.delta(this.p, e),
            l = Math.hypot(d.dx, d.dy) || 1;
          e.x += (d.dx / l) * 70;
          e.y += (d.dy / l) * 70;
          this.io.wrap?.(e);
        }
      }
    }
    const damage = amount - shield;
    if (damage > 0) {
      this.unhurt = 0;
      if (this.has("J08")) this.pain = Math.min(25, this.pain + damage);
    }
    return damage;
  }
  gold(amount) {
    if (amount <= 0) return;
    this.goldMeter = this.has("L07") ? this.goldMeter + amount : 0;
    if (this.has("L04")) this.haste = this.time + 1.4;
    if (this.has("L01")) {
      this.goldSpark = (this.goldSpark || 0) + amount;
      while (this.goldSpark >= 2) {
        this.goldSpark -= 2;
        const e = this.target();
        if (e)
          this.defer("L01", (d) =>
            this.hit(e, this.power * 0.3, "L01", false, d),
          );
        if (this.has("X17")) {
          this.hits++;
          if (this.hits % 5 === 0 && e)
            this.defer("X17", (d) =>
              this.lightning(e, this.power * 0.7, "H02", d),
            );
        }
      }
    }
    if (this.has("L07"))
      while (this.goldMeter >= 12) {
        this.goldMeter -= 12;
        this.defer("L07", (d) => this.area(this.p, 150, this.power, "L07", d));
        if (this.has("L10")) this.goldOrbit = this.time + 4;
      }
  }
  wealth() {
    return clamp(
      (this.g.gold || 0) / (80 * 1.6 ** ((this.g.wave || 1) - 1)),
      0,
      1,
    );
  }
  update(dt) {
    this.time += dt;
    this.configure();
    this.lastP ??= { x: this.p.x, y: this.p.y };
    const traveled = this.distance(this.lastP, this.p);
    this.lastP = { x: this.p.x, y: this.p.y };
    this.walk += Math.min(traveled, 20);
    this.still = traveled < 0.05 ? this.still + dt : 0;
    this.unhurt += dt;
    this.bloodBuff = Math.max(0, (this.bloodBuff || 0) - dt * 0.05);
    if (this.time - (this.lastHit || 0) > 2)
      this.charge = Math.max(0, this.charge - dt * 0.3);
    this.p.speed =
      215 *
      (1 +
        (this.has("K03") ? Math.min(0.3, this.unhurt / 40) : 0) +
        (this.swift > this.time ? 0.4 : 0));
    this.visuals = this.visuals.filter((v) => (v.life -= dt) > 0);
    for (const e of this.g.enemies) {
      if (e.dead) continue;
      if (!e.buildScaled) {
        e.buildScaled = true;
        e.buildRewardMultiplier = this.has("R11") ? 1.25 : 1;
        if (this.has("R11")) {
          e.hp *= 1.2;
          e.maxHp *= 1.2;
          e.attackDamage *= 1.15;
        }
        if (this.has("L12") && e.boss) {
          e.hp *= 1.25;
          e.maxHp *= 1.25;
        }
      }
      this.updateStatus(e, dt);
    }
    if (this.has("L03") && this.ready("bounty", 4)) {
      const e = this.target(this.p, 800, "strong");
      if (e) {
        e.bounty = true;
        if (this.has("L06") && !e.bountyBoost) {
          e.bountyBoost = true;
          e.hp *= 1.2;
          e.maxHp *= 1.2;
        }
        this.hit(e, this.power * 0.3, "L03");
      }
    }
    if (
      this.has("J01") &&
      this.ready("heal", this.has("X20") && this.still > 0.3 ? 1 : 2.5)
    )
      this.heal(this.has("X20") && this.still > 0.3 ? 0.5 : 1);
    if (
      this.has("J02") &&
      this.ready("barrier", this.has("K11") && this.still < 0.2 ? 2 : 4)
    )
      this.p.barrier = Math.min(12, (this.p.barrier || 0) + 3);
    if (this.has("L02") && this.ready("bank", 3))
      this.p.barrier = Math.min(12, (this.p.barrier || 0) + this.wealth() * 4);
    if (this.has("L11") && this.p.barrier > 0 && this.ready("bankAura", 1))
      this.area(this.p, 125, this.power * this.wealth(), "L11");
    if (this.has("J11") && this.pain > 0 && this.ready("pain", 2)) {
      this.area(this.p, 140, this.power * this.pain * 0.15, "J11");
      this.pain = 0;
    }
    if (this.has("K07")) {
      const angle = Math.atan2(this.p.moveY || 0, this.p.moveX || 1),
        diff = Math.abs(
          Math.atan2(
            Math.sin(angle - (this.lastAngle || angle)),
            Math.cos(angle - (this.lastAngle || angle)),
          ),
        );
      if (traveled > 0 && diff > 0.4 && this.ready("turn", 0.6))
        this.area(this.p, 90, this.power * 0.6, "K07");
      this.lastAngle = angle;
    }
    if (this.has("K10") && this.walk >= 180) {
      this.walk -= 180;
      const end = {
        x: this.p.x + (this.p.facingX || 1) * 140,
        y: this.p.y + (this.p.facingY || 0) * 140,
      };
      this.line(this.p, end, 30, this.power * 2, "K10", false);
      if (this.has("X10")) this.fastOrbit = this.time + 2;
      if (this.has("K04")) this.spawn("clone", this.p, 3, "K04");
    }
    if (this.has("I03") && this.ready("vision", 1)) {
      for (const e of this.near(this.p, 230)) {
        const s = (e.buildStatus ??= {});
        s.fragile = clamp((s.fragile || 0) + 1, 0, 6);
        this.hit(e, this.power * 0.15, "I03");
        if (this.has("X23")) this.burn(e, 0.5);
      }
    }
    if (this.has("H10") && this.ready("web", 1)) {
      const marked = this.g.enemies.filter(
        (e) => !e.dead && e.buildStatus?.lightMark > 0,
      );
      for (let i = 0; i < Math.min(marked.length, 8); i++) {
        const a = marked[i],
          b = marked[(i + 1) % marked.length];
        if (a === b) this.hit(a, this.power * 0.7, "H10");
        else if (this.distance(a, b) < 240)
          this.line(a, b, 10, this.power * 0.5, "H10", false);
      }
    }
    this.castWeapons(dt, traveled);
    this.updateObjects(dt);
    this.drain();
    this.objects = this.objects.filter((o) => o.life > 0);
  }
  updateStatus(e, dt) {
    const s = e.buildStatus;
    if (!s) return;
    for (const k of [
      "burnLeft",
      "coldLeft",
      "poisonLeft",
      "bleedLeft",
      "frozen",
      "lightMark",
    ])
      s[k] = Math.max(0, (s[k] || 0) - dt);
    if (!s.burnLeft) {
      s.burn = 0;
      s.burnAge = 0;
    } else s.burnAge = (s.burnAge || 0) + dt;
    if (!s.coldLeft) s.cold = 0;
    if (!s.poisonLeft) s.poison = 0;
    if (this.distance(this.p, e) > 90)
      s.pressure = Math.max(0, (s.pressure || 0) - dt);
    if (s.frozen > 0 && !e.boss) {
      e.slowTimer = 0.3;
      e.slowMultiplier = 0.05;
    }
    if (s.curse) {
      s.curseLeft -= dt;
      s.curseAge += dt;
      if (s.curseLeft <= 0) {
        const value =
          this.power * (this.has("I07") ? 2.7 : 1.8) +
          (this.has("X05") ? (s.poison || 0) * this.power * 0.25 : 0);
        this.hit(e, value, "I01");
        s.curse = 0;
      }
    }
    if (!this.ready("status:" + e.id, 0.5)) return;
    if (s.bleedLeft > 0) this.hit(e, this.power * 0.15, "C05");
    if (s.burn > 0) {
      this.hit(e, this.power * 0.12 * s.burn, "F01");
      if (this.has("F04") && this.ready("spread:" + e.id, 1.5))
        for (const other of this.near(e, 95).slice(0, 4))
          if (other !== e) this.burn(other, 0.5);
      if (e.boss && this.has("F10") && this.ready("bossBurn", 3))
        this.area(e, 65, this.power, "F10");
    }
    if (s.poison > 0) {
      this.hit(e, this.power * 0.1 * s.poison, "I02");
      if (this.has("I11") && this.ready("harvest:" + e.id, 4)) {
        this.hit(e, this.power * s.poison * 0.7, "I11");
        s.poison = 0;
      }
      if (e.boss && this.has("I05") && this.ready("bossPool", 4))
        this.zone(e, 65, 3, "I05", "poison");
    }
    if (this.has("G09") && s.cold >= 3) {
      s.frostAge = Math.min(8, (s.frostAge || 0) + 0.5);
      this.hit(
        e,
        this.power * 0.4 * (this.has("G12") ? 1 + s.frostAge * 0.15 : 1),
        "G09",
      );
    } else s.frostAge = 0;
    if (this.has("I06") && s.fragile && (s.burn || s.cold || s.poison))
      s.fragile = Math.min(8, s.fragile + 1);
    if (
      this.has("I12") &&
      ["burn", "cold", "poison", "curse", "fragile"].filter((k) => s[k] > 0)
        .length >= 3 &&
      this.ready("sentence:" + e.id, 2.5)
    )
      this.hit(e, this.power * 3, "I12", false, 0, true);
  }
  castWeapons(dt, traveled) {
    const p = this.p,
      has = (id) => this.has(id),
      P = this.power;
    let rate = (this.haste > this.time ? 1.4 : 1) * (has("R02") ? 1.4 : 1);
    if (has("H11")) rate *= 1 + this.charge * 0.5;
    if (has("G11")) rate *= 0.75;
    const stopped = this.still > 0.35,
      steady =
        stopped || (has("K08") && this.time - (this.lastStop || 0) < 0.6);
    if (stopped) this.lastStop = this.time;
    if (has("K02") && steady) rate *= 1.15;
    if (has("K05") && steady) rate *= 1.35;
    const shooting = !has("R03") && (!has("K05") || steady);
    const aim = has("X18") || has("L03") ? "strong" : "near";
    const target = this.target(p, 700, aim);
    if (has("J03") && p.hp > 4) rate *= 1.15;
    const enabled = (id) => this.weapons.includes(id);
    if (shooting) {
      const basicCount = this.weapons.length;
      if (
        (!basicCount ||
          (has("R02") && basicCount < 3) ||
          (!this.weapons.some((id) => ["A", "B", "G", "I"].includes(id[0])) &&
            (has("F01") || has("G01") || has("I01")) &&
            basicCount < 3)) &&
        target &&
        this.ready("basic", 0.65 / rate)
      )
        this.bullet(p, target, P, "A00", { weapon: true });
      if (
        enabled("A01") &&
        target &&
        this.ready("A01", (has("A10") ? 1.3 : 0.7) / rate)
      ) {
        let t = target;
        if (has("A04")) {
          let score = -1;
          for (const candidate of this.near(p, 650).slice(0, 24)) {
            const d = this.delta(p, candidate),
              l = Math.hypot(d.dx, d.dy) || 1;
            const n = this.near(p, 650).filter((e) => {
              const q = this.delta(p, e);
              return (
                q.dx * d.dx + q.dy * d.dy > 0 &&
                Math.abs(q.dx * d.dy - q.dy * d.dx) / l < 30
              );
            }).length;
            if (n > score) {
              score = n;
              t = candidate;
            }
          }
        }
        const d = this.delta(p, t),
          l = Math.hypot(d.dx, d.dy) || 1,
          end = { x: p.x + (d.dx / l) * 650, y: p.y + (d.dy / l) * 650 };
        let damage = P * (has("A10") ? 2.8 : 1.2);
        if (has("A07") && this.near(t, 100).length <= 1) damage *= 1.6;
        this.line(p, end, has("A10") ? 24 : 9, damage, "A01", true, has("A10"));
      }
      if (enabled("A02") && target && this.ready("A02", 0.85 / rate)) {
        const count = 5,
          spread = has("A08") ? 0.075 : 0.2;
        for (let i = 0; i < count; i++)
          this.bullet(p, target, P * 0.48, "A02", {
            angle: (i - 2) * spread + (has("A05") && i < 2 ? Math.PI : 0),
            weapon: true,
            scatter: has("A11"),
            life: 0.8,
          });
      }
      if (enabled("A03")) {
        if (this.reload > 0) {
          this.reload -= dt;
          if (this.reload <= 0) {
            this.ammo = has("A09") ? 1 : 6;
            if (has("A12") && target)
              this.line(p, target, 22, P * 2.5, "A12", true, true);
          }
        } else if (target && this.ready("A03", 0.15 / rate)) {
          this.bullet(p, target, P * 0.35, "A03", { weapon: true });
          this.ammo--;
          if (this.ammo <= 0) {
            this.reload = has("A09") ? 0.45 : 1.1;
            if (has("A06")) this.radial(p, 8, P * 0.3, "A06");
            if (has("X14")) this.gravity(P * 0.4, "X14");
          }
        }
      }
      if (enabled("B01") && target && this.ready("B01", 0.85 / rate))
        this.bullet(p, target, P, "B01", {
          weapon: true,
          bounces: has("B07") ? 4 : 2,
          bounceRange: has("B04") ? 260 : 150,
        });
      if (enabled("B02") && target && this.ready("B02", 1.3 / rate))
        this.bullet(p, target, P, "B02", {
          weapon: true,
          returning: true,
          life: 2.4,
        });
      if (enabled("B03") && target && this.ready("B03", 1 / rate))
        this.bullet(p, target, P * 0.6, "B03", {
          weapon: true,
          blast: true,
          heavy: true,
        });
      if (enabled("G03") && target && this.ready("G03", 0.5 / rate)) {
        const t = has("G06")
          ? this.near(p, 600).sort(
              (a, b) => (b.buildStatus?.cold || 0) - (a.buildStatus?.cold || 0),
            )[0] || target
          : target;
        this.bullet(p, t, P * 0.5, "G03", {
          weapon: true,
          homing: t,
          speed: 190,
          cold: 2,
        });
      }
      if (enabled("I02") && target && this.ready("I02", 0.4 / rate))
        this.bullet(p, target, P * 0.25, "I02", { weapon: true, poison: 1 });
    }
    // Non-projectile weapon channels retain their own clocks and spatial behavior.
    if (!has("R03")) {
      if (
        (enabled("C01") || this.goldOrbit > this.time) &&
        this.ready("orbit", 0.16)
      ) {
        const rings = has("C10") ? 2 : 1;
        for (let ring = 0; ring < rings; ring++)
          for (let i = 0; i < 3; i++) {
            const radius = ring ? 65 : has("C04") ? 180 : 110;
            const r =
                radius * (has("C07") ? 1 + 0.28 * Math.sin(this.time * 2) : 1),
              a =
                this.time *
                  (ring ? -2.7 : 2) *
                  (this.fastOrbit > this.time ? 1.7 : 1) +
                (i * TAU) / 3;
            const at = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
            this.effect("C01", at.x, at.y, 13, 0.2);
            for (const e of this.near(at, 15))
              this.hit(e, P * 0.25, "C01", true);
            if (
              has("X09") &&
              this.ready("satTurret:" + i, 0.8) &&
              this.objects.some(
                (o) => o.type === "turret" && this.distance(o, at) < 100,
              ) &&
              target
            )
              this.bullet(at, target, P * 0.35, "X09");
            if (has("X19") && p.barrier > 0)
              this.g.enemyProjectiles = this.g.enemyProjectiles.filter((b) => {
                if (this.distance(at, b) > 24) return true;
                p.barrier = Math.max(0, p.barrier - 0.2);
                return false;
              });
          }
      }
      if (enabled("C02") && this.ready("cloak", 0.55)) {
        const r = this.armorBurst > this.time ? 145 : 75;
        for (const e of this.near(p, r)) {
          const s = (e.buildStatus ??= {});
          s.pressure = has("C08") ? Math.min(1, (s.pressure || 0) + 0.12) : 0;
          this.hit(e, P * (0.55 + s.pressure), "C02", true);
          if (has("C05")) {
            s.bleedLeft = 2;
          }
        }
        this.effect("C02", p.x, p.y, r);
      }
      if (enabled("C03") && this.ready("gravity", 3)) this.gravity(P, "C03");
      if (
        enabled("D01") &&
        stopped &&
        this.ready("turret", 2.5 * this.summonRate())
      ) {
        const at = has("D10")
          ? { x: p.x + ((this.serial % 3) - 1) * 65, y: p.y - 40 }
          : p;
        this.spawn("turret", at, 8, "D01");
      }
      this.mineWalk = (this.mineWalk || 0) + traveled;
      if (enabled("D02") && this.mineWalk >= 95) {
        this.mineWalk -= 95;
        this.spawn("mine", p, 10, "D02");
      }
      if (enabled("D03") && this.ready("quake", 2.5 * this.summonRate()))
        this.zone(p, 95, 5, "D03", "quake");
      if (enabled("E01") && this.ready("minion", 2.2 * this.summonRate())) {
        this.spawn("minion", p, 5, "E01", {
          strength: 1,
          wardUntil: this.nextMinionWard ? this.time + 1.5 : 0,
        });
        this.nextMinionWard = false;
      }
      if (
        enabled("E02") &&
        this.ready("guardian", this.summonRate() * (has("E11") ? 7 : 4))
      ) {
        if (!has("E11") || !this.objects.some((o) => o.type === "guardian"))
          this.spawn("guardian", p, 10, "E02", { giant: has("E11") });
      }
      if (enabled("F02")) {
        const e = this.target(p, 140);
        if (!e)
          this.heat = Math.min(5, this.heat + dt / (has("R08") ? 1.5 : 1));
        else if (this.ready("heat", 1.2)) {
          let amount = P * (1 + this.heat * 0.6);
          if (has("F11") || (has("F08") && this.heat >= 4))
            this.area(p, has("F11") ? 210 : 140, amount, "F02", 0, true);
          else this.hit(e, amount, "F02", true, 0, true);
          this.heat = has("F05") ? this.heat * 0.25 : 0;
        }
      }
      this.fireWalk = (this.fireWalk || 0) + traveled;
      if (enabled("F03") && this.fireWalk >= 75) {
        this.fireWalk -= 75;
        this.zone(p, 48, 3, "F03", "fire");
        if (has("F12")) {
          this.path ??= [];
          this.path.push({ x: p.x, y: p.y });
          if (this.path.length > 32) this.path.shift();
          if (this.path.length > 10 && this.distance(this.path[0], p) < 100) {
            const origin = this.path[0],
              sum = this.path.reduce(
                (s, q) => {
                  const d = this.delta(origin, q);
                  s.x += d.dx;
                  s.y += d.dy;
                  return s;
                },
                { x: 0, y: 0 },
              );
            this.zone(
              {
                x: origin.x + sum.x / this.path.length,
                y: origin.y + sum.y / this.path.length,
              },
              160,
              2,
              "F12",
              "fire",
            );
            this.path = [];
          }
        }
      }
      if (enabled("G02") && this.ready("frost", 2)) {
        for (const e of this.near(p, 210)) {
          this.cold(e, 2);
          this.hit(e, P * 0.35, "G02");
        }
        this.effect("G02", p.x, p.y, 210, 0.5);
        if (has("G05")) this.zone(p, 170, 2.5, "G05", "ice");
      }
      if (enabled("H01") && this.ready("lightning", 1 / rate)) {
        const e = has("H07")
          ? this.g.enemies.find(
              (e) => !e.dead && e.buildStatus?.lightMark > 0,
            ) || target
          : target;
        if (e) this.lightning(e, P * 1.2);
      }
    }
  }
  gravity(damage, id) {
    const center = this.has("C06")
      ? this.target() || this.p
      : {
          x: this.p.x + (this.p.facingX || 1) * 80,
          y: this.p.y + (this.p.facingY || 0) * 80,
        };
    const count = this.near(center, 200).length;
    for (const e of this.near(center, 200)) {
      const d = this.delta(e, center);
      if (!e.boss) {
        e.x += d.dx * 0.65;
        e.y += d.dy * 0.65;
        this.io.wrap?.(e);
      }
      this.hit(
        e,
        damage * (this.has("C09") ? 1 + Math.min(8, count) * 0.15 : 1),
        id,
      );
    }
    this.effect("C03", center.x, center.y, 200, 0.6);
    if (this.has("C12"))
      this.spawn("delay", center, 0.65, "C12", {
        radius: 130,
        damage: damage * 1.6,
      });
    if (this.has("X12"))
      for (const o of this.objects.filter(
        (o) => o.type === "mine" && this.distance(o, center) < 200,
      ))
        o.fuse = 0.65;
  }
  updateObjects(dt) {
    const pending = [...this.objects];
    for (const o of pending) {
      if (o.life <= 0) continue;
      o.life -= dt;
      o.age += dt;
      o.tick -= dt;
      if (o.type === "bullet") {
        const prev = { x: o.x, y: o.y };
        if (o.returning && o.life < o.maxLife / 2) {
          if (!o.returnPhase) {
            o.returnPhase = true;
            o.seen.clear();
          }
          const d = this.delta(o, this.p),
            l = Math.hypot(d.dx, d.dy) || 1;
          o.vx = (d.dx / l) * 390;
          o.vy = (d.dy / l) * 390;
          if (l < 25) {
            o.life = 0;
            if (this.has("B08")) this.timers.B02 = this.time + 0.1;
            if (this.has("X13")) this.ammo = Math.min(6, this.ammo + 2);
            if (this.has("B11"))
              this.radial(this.p, 5, this.power * 0.4, "B11");
            continue;
          }
        }
        if (o.homing && !o.homing.dead) {
          const d = this.delta(o, o.homing),
            l = Math.hypot(d.dx, d.dy) || 1;
          o.vx = (d.dx / l) * 190;
          o.vy = (d.dy / l) * 190;
        }
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        this.io.wrap?.(o);
        for (const e of this.near(o, 35)) {
          if (o.seen.has(e.id)) continue;
          const d = this.delta(prev, o),
            q = this.delta(prev, e),
            u = clamp(
              (q.dx * d.dx + q.dy * d.dy) / (d.dx * d.dx + d.dy * d.dy || 1),
              0,
              1,
            );
          if (
            Math.hypot(q.dx - u * d.dx, q.dy - u * d.dy) >
            o.radius + (e.radius || 15)
          )
            continue;
          o.seen.add(e.id);
          let damage = o.damage;
          if (o.returnPhase && this.has("B05")) damage *= 1.6;
          if (o.scatter && this.distance(this.p, e) < 120) damage *= 1.5;
          this.hit(e, damage, o.id, !!o.weapon, 0, !!o.heavy);
          const s = (e.buildStatus ??= {});
          if (o.scatter && this.distance(this.p, e) < 120)
            s.fragile = Math.min(8, (s.fragile || 0) + 1);
          if (o.cold) this.cold(e, o.cold);
          if (o.poison) {
            s.poison = Math.min(
              this.has("I08") ? 18 : 6,
              (s.poison || 0) + o.poison,
            );
            s.poisonLeft = 6;
          }
          if (o.id === "B06" && this.has("X15") && !s.curse) {
            s.curse = 1;
            s.curseLeft = 2;
            s.curseAge = 0;
          }
          if (o.blast) {
            if (this.has("B09"))
              this.spawn("delay", e, this.has("R08") ? 1.2 : 0.65, "B09", {
                radius: 100,
                damage: this.power * 1.4,
              });
            else this.area(e, 65, this.power, "B03");
            o.life = 0;
          } else if (o.bounces > 0) {
            o.bounces--;
            let t = this.near(e, o.bounceRange).find((t) => !o.seen.has(t.id));
            if (!t && this.has("B07")) {
              t = e;
              o.seen.clear();
              o.seen.add(e.id);
            }
            if (t) {
              const d = this.delta(e, t);
              if (t === e) {
                o.vx = -o.vx;
                o.vy = -o.vy;
                o.revisit = e;
                o.revisitAt = this.time + 0.3;
              } else {
                const l = Math.hypot(d.dx, d.dy) || 1;
                o.vx = (d.dx / l) * 350;
                o.vy = (d.dy / l) * 350;
              }
            } else o.life = 0;
            if (!o.bounces && this.has("B10")) {
              this.area(e, 110, this.power * 1.5, "B10");
              o.life = 0;
            }
          } else if (!o.returning) o.life = 0;
          break;
        }
        if (o.revisit && this.time >= o.revisitAt) {
          o.homing = o.revisit;
          o.seen.clear();
          o.revisit = null;
        }
      } else if (o.type === "turret") {
        if (this.has("D07")) this.follow(o, this.p, 60, 110, dt);
        if (o.tick <= 0) {
          o.tick = 0.6;
          const target = this.target(
            o,
            430,
            this.has("D04") ? "strong" : "near",
          );
          if (target)
            this.bullet(o, target, this.power * 0.55, "D01", { weapon: true });
        }
      } else if (o.type === "mine") {
        if (o.fuse != null) o.fuse -= dt;
        if (o.fuse > 0) continue;
        if (o.age > 0.3 && (this.near(o, 45).length || o.fuse <= 0)) {
          const enemies = this.near(o, 110);
          if (this.has("X11") && !o.iced) {
            o.iced = true;
            for (const e of enemies) this.cold(e, 3);
            o.fuse = 0.3;
            continue;
          }
          const factor = this.has("D08") ? 1 + Math.min(2, o.age * 0.2) : 1;
          this.area(o, 100, this.power * 1.6 * factor, "D02", 0, true);
          if (this.has("X11")) for (const e of enemies) this.cold(e, 2);
          o.life = 0;
          if (
            this.has("D05") ||
            (this.has("D11") && enemies.some((e) => e.boss))
          )
            for (const mine of this.objects.filter(
              (q) =>
                q !== o &&
                q.type === "mine" &&
                this.distance(q, o) < (this.has("D11") ? 240 : 120),
            ))
              mine.fuse = Math.min(mine.fuse ?? 99, 0.15);
        }
      } else if (["minion", "guardian", "spirit"].includes(o.type)) {
        const guard = o.type === "guardian",
          e = this.target(
            o,
            this.has("E04") ? 800 : 450,
            this.has("E04") && !guard ? "strong" : "near",
          );
        const target = guard
          ? {
              x: this.p.x + (this.p.facingX || 1) * 65,
              y: this.p.y + (this.p.facingY || 0) * 65,
            }
          : o.target && !o.target.dead
            ? o.target
            : e || this.p;
        this.follow(
          o,
          target,
          o.rush ? 440 : guard ? 220 : 190,
          guard ? 15 : 18,
          dt,
        );
        o.rush = 0;
        if (o.tick <= 0) {
          o.tick = guard ? 0.8 : 0.45;
          this.area(
            o,
            guard ? (o.giant ? 100 : 65) : 32,
            this.power *
              (guard ? (o.giant ? 1.5 : 0.7) : 0.55) *
              (o.strength || 1),
            o.id,
            Math.min(3, o.generation || 0),
          );
          if (guard)
            for (const foe of this.near(o, o.giant ? 100 : 65)) {
              if (foe.boss) continue;
              const d = this.delta(o, foe),
                l = Math.hypot(d.dx, d.dy) || 1;
              foe.x += (d.dx / l) * 18;
              foe.y += (d.dy / l) * 18;
              this.io.wrap?.(foe);
            }
          if (this.has("X16") && o.type === "spirit")
            for (const e of this.near(o, 40))
              if (e.buildStatus?.curse) e.buildStatus.curseLeft -= 0.35;
        }
        if (o.type === "minion" && o.life < 1 && !this.has("E10")) {
          this.follow(o, this.p, 260, 15, dt);
          if (this.distance(o, this.p) < 30 && this.has("E07")) {
            o.life = 0;
            this.nextMinionWard = true;
          }
        }
        if (o.type === "minion" && this.has("E07")) {
          if (this.has("E10") && o.life < 1) o.wardUntil = this.time + 0.1;
          if (o.wardUntil > this.time)
            this.g.enemyProjectiles = this.g.enemyProjectiles.filter((b) => {
              if (this.distance(o, b) > 36) return true;
              o.wardUntil = 0;
              return false;
            });
        }
      } else if (o.type === "clone" && o.tick <= 0) {
        o.tick = 0.5;
        this.area(o, 70, this.power * 0.55, "K04");
        if (this.has("X21")) for (const e of this.near(o, 70)) this.burn(e, 1);
      } else if (o.type === "zone" && o.tick <= 0) {
        o.tick = 0.5;
        const enemies = this.near(o, o.radius);
        for (const e of enemies) {
          if (o.kind === "fire") {
            this.burn(e, 0.5);
            if (this.has("F06")) e.buildStatus.burnLeft = 4;
          }
          if (o.kind === "poison") {
            const s = (e.buildStatus ??= {});
            s.poison = Math.min(this.has("I08") ? 18 : 6, (s.poison || 0) + 1);
            s.poisonLeft = 5;
          }
          if (o.kind === "ice") {
            this.cold(e, 1);
            if (this.has("G08") && e.buildStatus.frozen > 0)
              e.buildStatus.frozen = Math.max(
                e.buildStatus.frozen,
                e.boss ? 0.2 : 1,
              );
            if (this.has("G11") && !e.boss) {
              e.slowTimer = 0.6;
              e.slowMultiplier = 0.08;
            }
          }
          if ((o.kind === "quake" && this.has("D06")) || o.kind === "ash") {
            e.slowTimer = 0.6;
            e.slowMultiplier = 0.6;
          }
          let damage = this.power * (o.kind === "quake" ? 0.5 : 0.15);
          if (
            this.has("D09") &&
            o.kind === "quake" &&
            this.objects.some(
              (q) =>
                q !== o &&
                q.type === "zone" &&
                q.kind === "quake" &&
                this.distance(q, e) < q.radius,
            )
          )
            damage *= 1.7;
          this.hit(e, damage, o.id);
        }
        if (this.has("D12") && o.kind === "quake") {
          const q = this.objects.find(
            (q) => q !== o && q.kind === "quake" && this.distance(q, o) < 350,
          );
          if (q) this.line(o, q, 12, this.power * 0.4, "D12", false);
        }
      }
      if (o.life <= 0 && !o.ended) {
        o.ended = true;
        if (o.type === "delay") {
          this.area(o, o.radius, o.damage, o.id);
          if (o.id === "B09" && this.has("B12"))
            this.spawn("delay", o, 0.8, "B12", {
              radius: o.radius,
              damage: o.damage * 0.7,
            });
        }
        if (o.type === "minion" && this.has("E10")) {
          this.area(o, 100, this.power * 1.5, "E10");
        }
        if (o.type === "zone" && o.kind === "fire" && this.has("F09"))
          this.zone(o, o.radius, 1.5, "F09", "ash");
        if (o.type === "clone" && this.has("X21"))
          this.zone(o, 65, 2, "X21", "fire");
      }
    }
  }
  follow(o, t, speed, stop, dt) {
    const d = this.delta(o, t),
      l = Math.hypot(d.dx, d.dy) || 1;
    if (l > stop) {
      const step = Math.min(l - stop, speed * dt);
      o.x += (d.dx / l) * step;
      o.y += (d.dy / l) * step;
      this.io.wrap?.(o);
    }
  }
}
