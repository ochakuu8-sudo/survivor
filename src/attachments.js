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
  "barrierMax",
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
      if (definition) {
        attachment.name = definition.name;
        attachment.category = definition.category || attachment.category;
        attachment.stars = attachment.stars || definition.stars || 1;
        definition.attach(weapon, attachment);
      }
    });
  });
  syncGearAttachments();
  if (game.player.hp > game.player.maxHp) game.player.hp = game.player.maxHp;
  game.player.barrier = Math.min(game.player.barrier || 0, game.player.barrierMax || 0);
}

export const ACTIVE_ATTACHMENTS = [
  {
    key: "powerCore",
    name: "ダメージ+6",
    stars: 1,
    category: "stat",
    text: "ダメージ +6。爆発武器は爆風ダメージも +8（×1.35）。",
    attach: (weapon) => {
      boostWeaponImpact(weapon, 6);
    },
  },
  {
    key: "rapidMechanism",
    name: "攻撃頻度+13%",
    stars: 1,
    category: "stat",
    text: "攻撃頻度 +13%。",
    attach: (weapon) => {
      weapon.fireRate *= 1.13;
    },
  },
  {
    key: "rangeTube",
    name: "射程+13%",
    stars: 1,
    category: "stat",
    text: "射程 +13%、弾速 +13%、滞空 +6%、軌道半径 +8%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.13);
    },
  },
  {
    key: "areaLens",
    name: "範囲+8%",
    stars: 1,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲 +8%、命中幅 +1（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 1);
    },
  },
  {
    key: "stableGrip",
    name: "ばらつき-22%",
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
    name: "最大ハート+1",
    stars: 1,
    category: "support",
    text: "最大ハート +1。",
    attach: () => {
      game.player.maxHp += 1;
    },
  },
  {
    key: "guardBadge",
    name: "被ダメ軽減+4",
    stars: 1,
    category: "support",
    text: "被ダメージ軽減 +4。",
    attach: () => {
      game.player.armor += 4;
    },
  },
  {
    key: "scrapMagnet",
    name: "吸引範囲+36",
    stars: 1,
    category: "support",
    text: "ゴールド吸引範囲 +36。",
    attach: () => {
      game.player.pickup += 36;
    },
  },
  {
    key: "lightSneaker",
    name: "移動速度+26",
    stars: 1,
    category: "support",
    text: "移動速度 +26。",
    attach: () => {
      game.player.speed += 26;
    },
  },
  {
    key: "splitChamber",
    name: "弾数+1",
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
    key: "sustainEmitter",
    name: "持続時間+25%",
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
    name: "威力+14/防御-3",
    stars: 2,
    category: "support",
    text: "武器威力ボーナス +14、被ダメージ軽減 −3。",
    attach: () => {
      game.player.weaponPowerBonus += 14;
      game.player.armor -= 3;
    },
  },
  {
    key: "ricochetCore",
    name: "跳弾+1",
    stars: 2,
    category: "special",
    compatibleWeapons: ["石", "豆鉄砲"],
    text: "通常弾が命中後、近くの別の敵へ1回跳ねる。",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 1;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 230);
    },
  },
  {
    key: "criticalLens",
    name: "クリティカル+12%",
    stars: 2,
    category: "special",
    text: "命中時に12%でクリティカル。クリティカルダメージは1.8倍。",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.12;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 1.8);
    },
  },
  {
    key: "frostPowder",
    name: "氷結+22%",
    stars: 2,
    category: "special",
    text: "命中時に22%で敵の移動速度を1.6秒間38%低下させる。",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.22;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.62);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 1.6);
    },
  },
  {
    key: "barrierEmitter",
    name: "バリア+1",
    stars: 2,
    category: "support",
    text: "バリア +1。バリアは被ダメージを1回だけ無効化する。",
    attach: () => {
      game.player.barrierMax += 1;
    },
  },
  {
    key: "piercer",
    name: "貫通+1",
    stars: 2,
    category: "special",
    text: "貫通 +1。武器に応じて爆発半径・線幅・コーン範囲・命中幅も追加で広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 1);
    },
  },
  {
    key: "knockbackBooster",
    name: "ノックバック+8",
    stars: 2,
    category: "special",
    text: "弾の与えるノックバック +8。",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 8;
    },
  },
  {
    key: "overdriveCore",
    name: "ダメージ+18/頻度+8%",
    stars: 3,
    category: "special",
    text: "ダメージ +18。攻撃頻度 +8%。",
    attach: (weapon) => {
      boostWeaponImpact(weapon, 18);
      weapon.fireRate *= 1.08;
    },
  },
  {
    key: "multiForge",
    name: "弾数+2/個数+1",
    stars: 3,
    category: "special",
    text: "通常弾は弾数 +2。炎は角度 +0.18。回転武器は個数 +1、範囲 +8。",
    attach: (weapon) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.2, weapon.cone + 0.18);
      } else if (weapon.kind === "orbit") {
        weapon.orbitCount = (weapon.orbitCount || 1) + 1;
        weapon.areaRadius += 8;
      } else {
        weapon.projectiles += 2;
        weapon.spread += 0.08;
      }
    },
  },
  {
    key: "deepPiercer",
    name: "貫通+2",
    stars: 3,
    category: "special",
    text: "貫通 +2。武器に応じて爆発・線幅・コーン・命中幅も大きく広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 2);
    },
  },
  {
    key: "cryoEngine",
    name: "氷結+35%",
    stars: 3,
    category: "special",
    text: "命中時に35%で敵の移動速度を2.2秒間45%低下させる。",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.35;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.55);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 2.2);
    },
  },
  {
    key: "safetyField",
    name: "バリア+2/吸引+24",
    stars: 3,
    category: "support",
    text: "バリア +2。ゴールド吸引範囲 +24。",
    attach: () => {
      game.player.barrierMax += 2;
      game.player.pickup += 24;
    },
  },
];

const LEVEL_ATTACHMENT_RARITY_WEIGHTS = {
  2: [[1, 80], [2, 20], [3, 0]],
  3: [[1, 60], [2, 35], [3, 5]],
  4: [[1, 40], [2, 45], [3, 15]],
  5: [[1, 25], [2, 45], [3, 30]],
};

export function pickShopAttachment(wave) {
  const stars = pickStarsForWave(wave);
  return pickAttachmentByStars(stars);
}

export function attachmentRarityChanceText(level) {
  return (LEVEL_ATTACHMENT_RARITY_WEIGHTS[level] || LEVEL_ATTACHMENT_RARITY_WEIGHTS[2])
    .filter(([, weight]) => weight > 0)
    .map(([stars, weight]) => `${starsLabel(stars)}${weight}%`)
    .join(" / ");
}

export function pickAttachmentChoicesForWeapon(weapon, targetLevel, count = 3) {
  if (!weapon) return [];
  const choices = [];
  const seen = new Set();
  let guard = 0;
  while (choices.length < count && guard < 120) {
    guard += 1;
    const stars = pickStarsForWeaponLevel(targetLevel);
    const choice = pickAttachmentForWeaponByStars(weapon, stars, seen);
    if (!choice) continue;
    seen.add(choice.definition.key);
    choices.push(choice);
  }
  if (choices.length < count) {
    ACTIVE_ATTACHMENTS.forEach((definition) => {
      if (choices.length >= count) return;
      if (seen.has(definition.key) || !canAttachToWeapon(definition, weapon)) return;
      seen.add(definition.key);
      choices.push({ definition, stars: definition.stars || 1 });
    });
  }
  return choices;
}

function pickStarsForWeaponLevel(level) {
  const weights = LEVEL_ATTACHMENT_RARITY_WEIGHTS[Math.min(5, Math.max(2, level))] || LEVEL_ATTACHMENT_RARITY_WEIGHTS[2];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [stars, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return stars;
  }
  return 1;
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
  gear.weapons.forEach((w) => ownedNames.add(w.baseName || w.name));
  (gear.storageWeapons || []).forEach((w) => ownedNames.add(w.baseName || w.name));

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
  const weaponName = weapon.baseName || weapon.name;
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weaponName)) {
    return false;
  }
  return true;
}

function pickAttachmentForWeaponByStars(weapon, stars, seen = new Set()) {
  const candidates = ACTIVE_ATTACHMENTS.filter((a) =>
    a.stars === stars && !seen.has(a.key) && canAttachToWeapon(a, weapon),
  );
  if (candidates.length === 0) {
    if (stars > 1) return pickAttachmentForWeaponByStars(weapon, stars - 1, seen);
    return null;
  }
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  return { definition, stars: definition.stars || stars };
}

export function addAttachmentToWeapon(weapon, attachment) {
  if (!weapon || !attachment) return false;
  if ((weapon.attachments?.length || 0) >= MAX_ATTACHMENTS) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  if (!definition?.key) return false;
  const weaponName = weapon.baseName || weapon.name;
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weaponName)) {
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
  if (definition.key === "barrierEmitter" || definition.key === "safetyField") {
    const barrierGain = definition.key === "safetyField" ? 2 : 1;
    game.player.barrier = Math.min(game.player.barrierMax || 0, (game.player.barrier || 0) + barrierGain);
  }
  return true;
}
