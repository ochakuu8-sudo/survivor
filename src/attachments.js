import { game } from "./state.js";
import { MAX_ATTACHMENTS } from "./constants.js";
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
    support: "プレイヤー強化",
    unique: "ユニーク効果",
  };
  return labels[category] || "効果";
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
    text: "ダメージ +6。爆発武器は爆風ダメージも +8（×1.35）。",
    attach: (weapon) => {
      boostWeaponImpact(weapon, 6);
    },
  },
  {
    key: "rapidMechanism",
    name: "高速機構",
    stars: 1,
    category: "stat",
    text: "攻撃頻度 +13%。",
    attach: (weapon) => {
      weapon.fireRate *= 1.13;
    },
  },
  {
    key: "rangeTube",
    name: "射程チューブ",
    stars: 1,
    category: "stat",
    text: "射程 +13%、弾速 +13%、滞空 +6%、軌道半径 +8%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.13);
    },
  },
  {
    key: "areaLens",
    name: "範囲レンズ",
    stars: 1,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲 +8%、命中幅 +1（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 1);
    },
  },
  {
    key: "stableGrip",
    name: "安定グリップ",
    stars: 1,
    category: "stat",
    text: "ばらつき −22%、ぶれ −30%、弾速 +8%、ダメージ +2。",
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
    text: "最大ハート +1。",
    attach: () => {
      game.player.maxHp += 1;
    },
  },
  {
    key: "guardBadge",
    name: "古い防犯バッジ",
    stars: 1,
    category: "support",
    text: "被ダメージ軽減 +4。",
    attach: () => {
      game.player.armor += 4;
    },
  },
  {
    key: "scrapMagnet",
    name: "金貨磁石",
    stars: 1,
    category: "support",
    text: "ゴールド吸引範囲 +36。",
    attach: () => {
      game.player.pickup += 36;
    },
  },
  {
    key: "lightSneaker",
    name: "軽量スニーカー",
    stars: 1,
    category: "support",
    text: "移動速度 +26。",
    attach: () => {
      game.player.speed += 26;
    },
  },
  {
    key: "splitChamber",
    name: "分裂チャンバー",
    stars: 2,
    category: "special",
    text: "通常射撃: 弾数 +1・spread +0.05 / 炎・剣: コーン +0.12 rad / 回転: 範囲 +14・速度 +10%。",
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
    text: "着弾時に半径64の爆発を付与（爆風 = ダメージ×60%）。時限爆弾はフューズ −0.2秒。",
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
    text: "持続時間 +25%、ティック頻度 +20%、炎・設置レーザーの発射 +8%、回転半径 +10%。",
    attach: (weapon) => {
      weapon.duration *= 1.25;
      if (weapon.tickRate > 0) weapon.tickRate *= 1.2;
      if (weapon.kind === "flame" || weapon.kind === "sustainedLaser") weapon.fireRate *= 1.08;
      if (weapon.kind === "orbit") weapon.orbitRadius *= 1.1;
    },
  },
  {
    key: "looseBattery",
    name: "ジャンク電池",
    stars: 2,
    category: "support",
    text: "武器威力ボーナス +14、被ダメージ軽減 −3。",
    attach: () => {
      game.player.weaponPowerBonus += 14;
      game.player.armor -= 3;
    },
  },
  {
    key: "piercer",
    name: "貫通改造",
    stars: 2,
    category: "special",
    text: "貫通 +1。武器に応じて爆発半径・線幅・コーン範囲・命中幅も追加で広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 1);
    },
  },
  {
    key: "knockbackBooster",
    name: "衝撃増幅",
    stars: 2,
    category: "special",
    text: "弾の与えるノックバック +8。",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 8;
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
  const gear = game.player.gear;
  gear.weapons.forEach((w) => ownedNames.add(w.name));
  (gear.storageWeapons || []).forEach((w) => ownedNames.add(w.name));

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
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weapon.name)) {
    return false;
  }
  return true;
}

export function addAttachmentToWeapon(weapon, attachment) {
  if (!weapon || !attachment) return false;
  if ((weapon.attachments?.length || 0) >= MAX_ATTACHMENTS) return false;
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
