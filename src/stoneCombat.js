// A single launcher, with composable flight and impact phases. Impact never consumes flight traits.
export function composeStone(ids) {
  const h = (id) => ids.includes(id);
  return {
    count: h("R02") ? 5 : h("A02") ? 3 : 1,
    interval:
      (h("A03") ? 0.15 : 0.65) *
      (h("A10") ? 1.7 : 1) *
      (h("E11") ? 1.7 : 1) *
      (h("R01") ? 1.6 : 1) *
      (h("R06") ? 1.5 : h("R07") ? 0.6 : 1),
    damage:
      (h("A03") ? 0.45 : 1) *
      (h("A02") ? 0.55 : 1) *
      (h("A10") ? 2.8 : 1) *
      (h("E11") ? 2.2 : 1),
    pierces: h("A01") ? 2 : 0,
    bounces: h("B01") ? (h("B07") ? 4 : 2) : 0,
    blast: h("B03"),
    returning: !h("E10") && (h("B02") || h("E07")),
    homing: h("E01") || h("G03"),
    speed: h("G03") ? 230 : 350,
    orbit: h("C01") ? (h("C10") ? 1.4 : 0.7) : 0,
    radius: h("E11") ? 25 : h("A10") ? 17 : 8,
    heavy: h("A01") || h("B03") || h("E11"),
    cold: h("G03") ? 2 : 0,
    poison: h("I02") ? 1 : 0,
  };
}
export function stoneSummary(ids) {
  const traits = [
    ["A03", "連射"],
    ["A01", "貫通"],
    ["A02", "拡散"],
    ["B01", "跳弾"],
    ["B02", "帰還"],
    ["B03", "爆発"],
    ["C01", "公転"],
    ["C02", "衝撃殻"],
    ["C03", "引力"],
    ["D01", "定着砲芯"],
    ["D02", "埋設"],
    ["D03", "震域"],
    ["E01", "追尾"],
    ["E02", "護衛"],
    ["F01", "燃焼"],
    ["F02", "蓄熱"],
    ["F03", "炎の軌跡"],
    ["G01", "冷却"],
    ["G02", "冷気波"],
    ["G03", "氷追尾"],
    ["H01", "雷撃"],
    ["H03", "会心"],
    ["I01", "呪い"],
    ["I02", "毒"],
  ]
    .filter(([id]) => ids.includes(id))
    .map(([, name]) => name);
  return traits.length ? traits.join(" ＋ ") : "まっすぐ飛ぶ石ころ";
}
export function emitStone(c, at, target, extra = {}) {
  if (!target) return;
  const spec = composeStone([...c.ids]);
  const root = extra.root || ++c.serial;
  const orbit = extra.child ? 0 : spec.orbit * c.lifetime();
  const life = (spec.returning ? 3 : 2) * c.lifetime() + orbit;
  c.bullet(at, target, c.power * spec.damage * (extra.factor ?? 1), "A00", {
    ...spec,
    stone: true,
    weapon: true,
    life,
    orbit,
    bounces: spec.bounces,
    pierces: spec.pierces,
    bounceRange: c.has("B04") ? 260 : 150,
    homing: spec.homing ? target : null,
    root,
    child: !!extra.child,
    hitTimes: new Map(),
    launchAngle: Math.atan2(c.delta(at, target).dy, c.delta(at, target).dx),
    tint: c.has("B10")
      ? [1, 0.55, 0.12]
      : c.has("F01")
        ? [1, 0.4, 0.2]
        : c.has("G01")
          ? [0.4, 0.9, 1]
          : undefined,
    ...extra,
  });
  c.event("stoneFired");
}
export function castStone(c, dt) {
  const h = (id) => c.has(id),
    p = c.p,
    spec = composeStone([...c.ids]);
  const stopped = c.still > 0.35;
  if (stopped) c.lastStop = c.time;
  const steady = stopped || (h("K08") && c.time - (c.lastStop || 0) < 0.6);
  let rate =
    (c.haste > c.time ? 1.4 : 1) * (h("R02") ? 1.4 : 1) * (h("G11") ? 0.75 : 1);
  if (h("H11")) rate *= 1 + c.charge * 0.5;
  if (h("K02") && steady) rate *= 1.15;
  if (h("K05") && steady) rate *= 1.35;
  if (h("J03") && p.hp > 4) rate *= 1.15;
  if (h("F02") && !c.target(p, 180))
    c.heat = Math.min(5, c.heat + dt / (h("R08") ? 1.5 : 1));
  if (h("R03") || (h("K05") && !steady)) return;
  let target = c.target(
    p,
    700,
    h("E04") || h("X18") || h("L03") ? "strong" : "near",
  );
  if (h("H07"))
    target =
      c.g.enemies.find((e) => !e.dead && e.buildStatus?.lightMark > 0) ||
      target;
  if (h("G06"))
    target =
      c
        .near(p, 700)
        .sort(
          (a, b) => (b.buildStatus?.cold || 0) - (a.buildStatus?.cold || 0),
        )[0] || target;
  if (h("A04") && !h("X18") && !h("L03")) {
    let score = -1;
    const nearby = c.near(p, 650);
    for (const candidate of nearby.slice(0, 24)) {
      const d = c.delta(p, candidate),
        l = Math.hypot(d.dx, d.dy) || 1;
      const count = nearby.filter((e) => {
        const q = c.delta(p, e);
        return (
          q.dx * d.dx + q.dy * d.dy > 0 &&
          Math.abs(q.dx * d.dy - q.dy * d.dx) / l < 30
        );
      }).length;
      if (count > score) {
        score = count;
        target = candidate;
      }
    }
  }
  let reloaded = false;
  if (c.reload > 0) {
    c.reload -= dt;
    if (c.reload > 0) return;
    c.ammo = h("A09") ? 1 : 6;
    reloaded = true;
  }
  if (!target || !c.ready("stone", spec.interval / rate)) return;
  c.ammo = Math.min(c.ammo, h("A09") ? 1 : 6);
  const last = h("A03") && c.ammo <= 1;
  const heat = h("F02") ? c.heat : 0;
  for (let i = 0; i < spec.count; i++)
    emitStone(c, p, target, {
      angle:
        (i - (spec.count - 1) / 2) * (h("A08") ? 0.08 : 0.21) +
        (h("A05") && i === 0 ? Math.PI : 0),
      factor: (reloaded && h("A12") ? 3 : 1) * (1 + heat * 0.6),
      heated: heat >= 4,
      lastRound: last && h("A06"),
      radius: last && h("A06") ? spec.radius + 4 : spec.radius,
      pierces: spec.pierces + (h("K02") && steady ? 1 : 0),
    });
  if (reloaded && h("A12")) c.event("A12");
  if (last && h("A06")) c.event("A06");
  if (h("F02")) c.heat = h("F05") ? heat * 0.25 : 0;
  if (h("A03") && --c.ammo <= 0) {
    c.reload = h("A09") ? 0.45 : 1.1;
    if (h("X14")) c.gravity(c.power * 0.4, "X14");
  }
}
function aim(c, o, target, speed = o.speed) {
  const d = c.delta(o, target),
    l = Math.hypot(d.dx, d.dy) || 1;
  o.vx = (d.dx / l) * speed;
  o.vy = (d.dy / l) * speed;
}
function attributes(c, e, o) {
  const s = (e.buildStatus ??= {});
  if (c.has("F01")) c.burn(e);
  if (c.has("G01") || o.cold) c.cold(e, (c.has("G01") ? 1 : 0) + o.cold);
  if (o.poison) {
    s.poison = Math.min(c.has("I08") ? 18 : 6, (s.poison || 0) + o.poison);
    s.poisonLeft = 6;
  }
  if (c.has("I01") && !s.curse) {
    s.curse = 1;
    s.curseLeft = (c.has("I07") ? 4 : 2) * (c.has("R08") ? 1.5 : 1);
    s.curseAge = 0;
  }
}
function impact(c, o, e) {
  const h = (id) => c.has(id),
    s = (e.buildStatus ??= {});
  const frozen = s.frozen > 0;
  let damage = o.damage * (o.returnPhase && h("B05") ? 1.6 : 1);
  if (h("A07") && c.near(e, 100).length <= 1) damage *= 1.6;
  if (h("A11") && c.distance(c.p, e) < 120) {
    damage *= 1.5;
    s.fragile = Math.min(8, (s.fragile || 0) + 1);
  }
  if (h("C08") && c.distance(c.p, e) < 150) {
    s.pressure = Math.min(1, (s.pressure || 0) + 0.12);
    damage *= 1 + s.pressure;
  }
  c.hit(e, damage, "A00", true, 0, o.heavy);
  // hit() applies the basic weapon attributes; add projectile-specific attributes here.
  if (o.cold) c.cold(e, o.cold);
  if (o.poison) {
    s.poison = Math.min(h("I08") ? 18 : 6, (s.poison || 0) + o.poison);
    s.poisonLeft = 6;
  }
  if (h("C05")) s.bleedLeft = 2;
  if (h("H01") && c.ready("stoneLightning:" + e.id, 0.4))
    c.lightning(e, c.power * 0.7);
  if (h("G02") && c.ready("stoneFrost", 0.6)) {
    for (const t of c.near(e, 100)) c.cold(t, 2);
    c.effect("G02", e.x, e.y, 100);
    if (h("G05")) c.zone(e, 85, 2.5, "G05", "ice");
  }
  if (h("C03") && c.ready("stoneGravity", 0.7))
    c.gravity(c.power * 0.5, "C03", e);
  if (o.lastRound) {
    c.area(e, 70, o.damage * 0.7, "A06");
    o.lastRound = false;
  }
  if (o.heated && (h("F08") || h("F11"))) {
    c.area(e, h("F11") ? 210 : 110, o.damage, "F02");
    o.heated = false;
  }
  if (o.blast) {
    const radius =
      (h("B09") ? 100 : 65) + (h("B10") ? (o.bounceCount || 0) * 18 : 0);
    const amount = o.damage * (h("B10") ? 1.25 : 0.8);
    if (h("B09"))
      c.spawn("delay", e, h("R08") ? 1.2 : 0.65, "B09", {
        radius,
        damage: amount,
        stonePayload: { ...o, child: true },
      });
    else stoneBlast(c, e, radius, amount, "B03", o);
    c.event("stoneBlast");
  }
  if (h("X24") && e.dead && o.homing && c.ready("remotePoison", 0.5))
    c.zone(e, 65, 3, "X24", "poison");
  // The original frozen snapshot is used only for diagnostics; reactions consume it in hit().
  if (frozen) c.event("stoneFrozenHit");
}
export function stoneBlast(c, at, radius, damage, id, o) {
  // Secondary damage carries attributes, but never re-enters impact: no explosion recursion.
  const targets = c.near(at, radius);
  for (const e of targets) attributes(c, e, o);
  c.area(at, radius, damage, id);
}
export function finishStone(c, o, caught = false) {
  if (o.finished) return;
  o.finished = true;
  o.life = 0;
  const h = (id) => c.has(id);
  if (caught) {
    if (h("B08")) c.timers.stone = c.time + 0.08;
    if (h("X13")) c.ammo = Math.min(h("A09") ? 1 : 6, c.ammo + 2);
    if (h("E07")) c.p.barrier = Math.min(12, (c.p.barrier || 0) + 0.3);
    if (h("B11") && !o.child)
      for (let i = 0; i < 5; i++)
        emitStone(
          c,
          o,
          {
            x: o.x + Math.cos((i * Math.PI * 2) / 5),
            y: o.y + Math.sin((i * Math.PI * 2) / 5),
          },
          {
            child: true,
            root: o.root,
            factor: 0.4,
            returning: false,
            life: 0.5,
          },
        );
  }
  if (h("E10")) stoneBlast(c, o, 130, o.damage * 2, "E10", o);
  if (o.child) return;
  if (h("D01") && c.ready("stoneAnchor", 1.2 * c.summonRate()))
    c.spawn("turret", o, 4, "D01", { stoneAnchor: true, root: o.root });
  if (h("D02") && c.ready("stoneMine", 0.55 * c.summonRate()))
    c.spawn("mine", o, 8, "D02", { root: o.root });
  if (h("D03") && c.ready("stoneZone", 1.2 * c.summonRate()))
    c.zone(o, 95, 4, "D03", "quake");
}
export function stepStone(c, o, dt) {
  const h = (id) => c.has(id),
    prev = { x: o.x, y: o.y };
  if (o.life <= 0) {
    finishStone(c, o);
    return;
  }
  const orbit = o.age < o.orbit;
  if (orbit) {
    const ring = h("C10") && o.age > o.orbit / 2 ? 1 : 0;
    if (ring && !o.secondOrbit) {
      o.secondOrbit = true;
      o.seen.clear();
      o.hitTimes.clear();
    }
    const angle =
      o.launchAngle +
      (o.age / 0.7) *
        Math.PI *
        2 *
        (ring ? -1 : 1) *
        (c.fastOrbit > c.time ? 1.5 : 1);
    const radius =
      (h("C04") ? 170 : 95) * (h("C07") ? 1 + 0.28 * Math.sin(c.time * 2) : 1);
    o.x = c.p.x + Math.cos(angle) * radius;
    o.y = c.p.y + Math.sin(angle) * radius;
  } else {
    if (o.orbit && !o.launched) {
      o.launched = true;
      o.seen.clear();
      o.hitTimes.clear();
      const t = c.target(o);
      if (t) aim(c, o, t);
      if (h("F12")) c.zone(c.p, 150, 2, "F12", "fire");
      if (h("X09") && !o.child && c.ready("orbitalAnchor", 1.2))
        c.spawn("turret", o, 2, "D01", { stoneAnchor: true, root: o.root });
    }
    if (o.returning && o.life < (o.maxLife - o.orbit) * 0.5) {
      if (!o.returnPhase) {
        o.returnPhase = true;
        o.seen.clear();
        o.hitTimes.clear();
      }
      if (c.distance(o, c.p) < 25) {
        finishStone(c, o, true);
        return;
      }
      aim(c, o, c.p, 390);
    } else if (o.revisit && c.time >= o.revisitAt) {
      o.homing = o.revisit;
      o.seen.delete(o.revisit.id);
      o.revisit = null;
    }
    if (!o.returnPhase && o.homing && !o.revisit) {
      if (o.homing.dead)
        o.homing = c.near(o, 700).find((e) => !o.seen.has(e.id));
      if (o.homing) aim(c, o, o.homing, o.rush ? 440 : o.speed);
    }
    o.x += o.vx * dt;
    o.y += o.vy * dt;
  }
  c.io.wrap?.(o);
  if (
    (h("E02") && c.distance(o, c.p) < 180) ||
    (h("E10") && o.life < 0.8) ||
    (h("X19") && orbit)
  ) {
    c.g.enemyProjectiles = c.g.enemyProjectiles.filter((b) => {
      if (
        c.distance(o, b) > (h("E11") ? 55 : 26) ||
        (o.guardUsed && !(h("X19") && c.p.barrier >= 0.2))
      )
        return true;
      if (h("X19") && o.guardUsed) c.p.barrier -= 0.2;
      o.guardUsed = true;
      return false;
    });
  }
  if (h("F03") && !o.child && c.ready("stoneTrail", 0.3))
    c.zone(o, 42, 2, "F03", "fire");
  if (h("C02") && c.ready("stoneShell", 0.3))
    c.area(o, c.armorBurst > c.time ? 90 : 35, c.power * 0.25, "C02");
  const delta = c.delta(prev, o),
    length = Math.hypot(delta.dx, delta.dy);
  for (const e of c.near(prev, length + o.radius + 25)) {
    if (o.seen.has(e.id) || (o.hitTimes.get(e.id) ?? -10) + 0.28 > c.time)
      continue;
    const q = c.delta(prev, e),
      u = Math.max(
        0,
        Math.min(
          1,
          (q.dx * delta.dx + q.dy * delta.dy) / (length * length || 1),
        ),
      );
    if (
      Math.hypot(q.dx - u * delta.dx, q.dy - u * delta.dy) >
      o.radius + (e.radius || 15)
    )
      continue;
    o.seen.add(e.id);
    o.hitTimes.set(e.id, c.time);
    impact(c, o, e);
    if (orbit || o.returnPhase) continue;
    if (o.bounces > 0) {
      o.bounces--;
      o.bounceCount = (o.bounceCount || 0) + 1;
      const t = c.near(e, o.bounceRange).find((t) => !o.seen.has(t.id));
      if (t) {
        aim(c, o, t);
        if (o.homing) o.homing = t;
      } else if (h("B07") && !e.dead) {
        o.vx = -o.vx;
        o.vy = -o.vy;
        o.revisit = e;
        o.revisitAt = c.time + 0.3;
      }
      c.event("stoneBounce");
      if (h("B10") && o.bounces === 0)
        stoneBlast(c, e, 140, o.damage * 2, "B10", o);
      if (t || o.revisit) break;
    }
    if (o.pierces > 0) {
      o.pierces--;
      continue;
    }
    if (!o.returning) finishStone(c, o);
    break;
  }
}
