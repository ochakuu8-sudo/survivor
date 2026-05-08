import { MAX_WEAPON_ATTACHMENTS } from "./constants.js";
import { game } from "./state.js";
import {
  addWeaponPierce,
  boostWeaponImpact,
  expandWeaponArea,
  extendWeaponReach,
  restoreWeaponBaseStats,
} from "./weapons.js";

const STAR_LABELS = { 1: "★", 2: "★★", 3: "★★★" };

export function starsLabel(stars) {
  return STAR_LABELS[stars] || STAR_LABELS[1];
}

export function attachmentCategoryLabel(category) {
  const labels = {
    stat: "ステータス",
    special: "特殊効果",
    synergy: "シナジー",
    support: "プレイヤー強化",
    unique: "ユニーク効果",
  };
  return labels[category] || "効果";
}

export function hasWeaponAttachment(weapon, key) {
  return weapon.attachments.some((attachment) => attachment.key === key);
}

export function findAttachmentDefinition(key) {
  return ACTIVE_ATTACHMENTS.find((attachment) => attachment.key === key) || null;
}

export function syncGearAttachments() {
  if (!game.player?.gear) return;
  game.player.gear.attachments = game.player.gear.weapons.flatMap((weapon) =>
    weapon.attachments.map((attachment) => ({
      key: attachment.key,
      name: attachment.name,
      stars: attachment.stars,
      starsLabel: starsLabel(attachment.stars),
      weaponId: weapon.id,
      weaponName: weapon.name,
    })),
  );
}

const PLAYER_BASE_STAT_KEYS = [
  "maxHp",
  "speed",
  "pickup",
  "armor",
  "regen",
  "weaponPowerBonus",
];

export function snapshotPlayerBaseStats(player) {
  const stats = {};
  PLAYER_BASE_STAT_KEYS.forEach((key) => {
    stats[key] = player[key];
  });
  return stats;
}

function restorePlayerBaseStats() {
  const player = game.player;
  if (!player?.baseStats) return;
  PLAYER_BASE_STAT_KEYS.forEach((key) => {
    if (player.baseStats[key] !== undefined) player[key] = player.baseStats[key];
  });
}

export function recomputeAllAttachments() {
  if (!game.player?.gear) return;
  restorePlayerBaseStats();
  game.player.gear.weapons.forEach((weapon) => {
    restoreWeaponBaseStats(weapon);
  });
  game.player.gear.weapons.forEach((weapon) => {
    weapon.attachments.forEach((attachment) => {
      const definition = findAttachmentDefinition(attachment.key);
      if (definition) definition.attach(weapon, attachment);
    });
  });
  syncGearAttachments();
  if (game.player.hp > game.player.maxHp) game.player.hp = game.player.maxHp;
}

export const ACTIVE_ATTACHMENTS = [
  {
    key: "powerCore",
    name: "威力コア",
    stars: 1,
    category: "stat",
    text: "武器の基礎ダメージを上げる。爆発武器は爆風威力も上がる。",
    attach: (weapon) => {
      boostWeaponImpact(weapon, 6);
    },
  },
  {
    key: "rapidMechanism",
    name: "高速機構",
    stars: 1,
    category: "stat",
    text: "武器の攻撃頻度を上げる。",
    attach: (weapon) => {
      weapon.fireRate *= 1.13;
    },
  },
  {
    key: "rangeTube",
    name: "射程チューブ",
    stars: 1,
    category: "stat",
    text: "弾、炎、斬撃、設置攻撃の届く距離を広げる。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.13);
    },
  },
  {
    key: "areaLens",
    name: "範囲レンズ",
    stars: 1,
    category: "stat",
    text: "武器の当たり幅や巻き込み範囲を広げる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 1);
      expandWeaponArea(weapon, 1);
    },
  },
  {
    key: "stableGrip",
    name: "安定グリップ",
    stars: 1,
    category: "stat",
    text: "武器のブレを抑え、弾速と手応えを少し上げる。",
    attach: (weapon) => {
      weapon.spread *= 0.78;
      weapon.jitter *= 0.7;
      if (weapon.bulletSpeed > 1) weapon.bulletSpeed *= 1.08;
      boostWeaponImpact(weapon, 2);
    },
  },
  {
    key: "vitalityCharm",
    name: "守りのお守り",
    stars: 1,
    category: "support",
    text: "最大体力を底上げする。",
    attach: () => {
      game.player.maxHp += 25;
    },
  },
  {
    key: "guardBadge",
    name: "古い防犯バッジ",
    stars: 1,
    category: "support",
    text: "被ダメージ軽減を上げる。",
    attach: () => {
      game.player.armor += 4;
    },
  },
  {
    key: "fieldTape",
    name: "応急テープ",
    stars: 1,
    category: "support",
    text: "戦闘中の自然回復量を底上げする。",
    attach: () => {
      game.player.regen += 0.85;
    },
  },
  {
    key: "scrapMagnet",
    name: "スクラップ磁石",
    stars: 1,
    category: "support",
    text: "コインの磁力範囲を広げる。",
    attach: () => {
      game.player.pickup += 36;
    },
  },
  {
    key: "lightSneaker",
    name: "軽量スニーカー",
    stars: 1,
    category: "support",
    text: "移動速度を上げる。",
    attach: () => {
      game.player.speed += 26;
    },
  },
  {
    key: "splitChamber",
    name: "分裂チャンバー",
    stars: 2,
    category: "special",
    text: "弾数や攻撃幅を増やす特殊改造。",
    attach: (weapon) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.12, weapon.cone + 0.12);
      } else if (weapon.kind === "orbit") {
        weapon.areaRadius += 14;
        weapon.orbitSpeed *= 1.1;
      } else {
        weapon.projectiles += 1;
        weapon.spread += 0.05;
      }
    },
  },
  {
    key: "blastPrimer",
    name: "爆裂プライマー",
    stars: 2,
    category: "special",
    text: "着弾や設置攻撃に小さな爆発性を持たせる。",
    attach: (weapon) => {
      const radius = 64;
      weapon.explosionRadius = Math.max(weapon.explosionRadius, radius);
      weapon.explosionDamage = Math.max(weapon.explosionDamage, weapon.damage * 0.6);
      if (weapon.kind === "timedBomb") weapon.fuse = Math.max(0.75, weapon.fuse - 0.2);
    },
  },
  {
    key: "sustainEmitter",
    name: "持続エミッター",
    stars: 2,
    category: "special",
    text: "炎、レーザー、回転武器の持続と当たり続ける力を伸ばす。",
    attach: (weapon) => {
      weapon.duration *= 1.25;
      if (weapon.tickRate > 0) weapon.tickRate *= 1.2;
      if (weapon.kind === "flame" || weapon.kind === "sustainedLaser") weapon.fireRate *= 1.08;
      if (weapon.kind === "orbit") weapon.orbitRadius *= 1.1;
    },
  },
  {
    key: "ricochetCoil",
    name: "跳弾コイル",
    stars: 2,
    category: "special",
    text: "通常弾が跳ね返って次の敵を狙う。",
    attach: (weapon) => {
      if (weapon.kind === "projectile") {
        weapon.ricochet = (weapon.ricochet || 0) + 1;
      }
    },
  },
  {
    key: "overclockLink",
    name: "過給リンク",
    stars: 2,
    category: "synergy",
    text: "威力コアや高速機構と噛み合うシナジー改造。",
    attach: (weapon) => {
      const hasPower = hasWeaponAttachment(weapon, "powerCore");
      const hasRapid = hasWeaponAttachment(weapon, "rapidMechanism");
      if (hasPower) boostWeaponImpact(weapon, 4);
      if (hasRapid) weapon.fireRate *= 1.12;
      if (!hasPower && !hasRapid) {
        boostWeaponImpact(weapon, 2);
        weapon.fireRate *= 1.06;
      }
    },
  },
  {
    key: "focusPrism",
    name: "収束プリズム",
    stars: 2,
    category: "synergy",
    text: "射程チューブや範囲レンズと噛み合うシナジー改造。",
    attach: (weapon) => {
      const hasRange = hasWeaponAttachment(weapon, "rangeTube");
      const hasArea = hasWeaponAttachment(weapon, "areaLens");
      if (hasRange) extendWeaponReach(weapon, 1.08);
      if (hasArea) expandWeaponArea(weapon, 1);
      if (hasRange && hasArea) boostWeaponImpact(weapon, 3);
    },
  },
  {
    key: "looseBattery",
    name: "ジャンク電池",
    stars: 2,
    category: "support",
    text: "武器威力ボーナスを大きく上げるが、被ダメージ軽減は失う。",
    attach: () => {
      game.player.weaponPowerBonus += 14;
      game.player.armor -= 3;
    },
  },
  {
    key: "stoneSplitter",
    name: "分裂の核",
    stars: 3,
    category: "unique",
    compatibleWeapons: ["石"],
    text: "石専用。跳弾するたびに石の数が倍になり、別々の敵を狙って飛ぶ。",
    attach: (weapon) => {
      weapon.splitOnRicochet = true;
    },
  },
];

export function pickShopAttachment(wave) {
  const stars = pickStarsForWave(wave);
  return pickAttachmentByStars(stars);
}

function pickStarsForWave(wave) {
  const w = Math.max(1, wave);
  let s1 = 80;
  let s2 = 20;
  let s3 = 0;
  if (w >= 3) {
    s1 = 60;
    s2 = 32;
    s3 = 8;
  }
  if (w >= 5) {
    s1 = 45;
    s2 = 38;
    s3 = 17;
  }
  if (w >= 7) {
    s1 = 32;
    s2 = 42;
    s3 = 26;
  }
  const r = Math.random() * 100;
  if (r < s1) return 1;
  if (r < s1 + s2) return 2;
  return 3;
}

function pickAttachmentByStars(stars) {
  const ownedNames = new Set();
  game.player.gear.weapons.forEach((w) => ownedNames.add(w.name));
  (game.player.inventory?.weapons || []).forEach((w) => ownedNames.add(w.name));

  const candidates = ACTIVE_ATTACHMENTS.filter((a) => {
    if (a.stars !== stars) return false;
    if (a.compatibleWeapons) {
      return a.compatibleWeapons.some((n) => ownedNames.has(n));
    }
    return true;
  });
  if (candidates.length === 0) {
    if (stars > 1) return pickAttachmentByStars(stars - 1);
    return null;
  }
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  return { definition, stars };
}

export function canAttachToWeapon(definition, weapon) {
  if (!definition || !weapon) return false;
  if (weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return false;
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weapon.name)) {
    return false;
  }
  return true;
}

export function addAttachmentToWeapon(weapon, attachment) {
  if (!weapon || !attachment || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  if (!definition?.key) return false;
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weapon.name)) {
    return false;
  }
  const stars = attachment.stars || definition.stars || 1;
  weapon.attachments.push({
    key: definition.key,
    name: definition.name,
    stars,
    category: definition.category || "stat",
  });
  recomputeAllAttachments();
  return true;
}
