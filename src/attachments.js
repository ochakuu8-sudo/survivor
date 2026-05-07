import {
  ATTACHMENT_RARITIES,
  ATTACHMENT_RARITY_TABLES,
  ATTACHMENT_REROLL_SLOT_COSTS,
  MAX_WEAPON_ATTACHMENTS,
  RARITY_ORDER,
} from "./constants.js";
import { game } from "./state.js";
import { clamp } from "./utils/math.js";
import {
  addWeaponPierce,
  boostWeaponImpact,
  expandWeaponArea,
  extendWeaponReach,
  findWeapon,
  restoreWeaponBaseStats,
} from "./weapons.js";

export function rarityRank(rarity) {
  return Math.max(0, RARITY_ORDER.indexOf(rarity));
}

export function rarityPower(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.power || ATTACHMENT_RARITIES.normal.power;
}

export function rarityLabel(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.label || ATTACHMENT_RARITIES.normal.label;
}

export function rarityShortLabel(rarity) {
  return ATTACHMENT_RARITIES[rarity]?.short || ATTACHMENT_RARITIES.normal.short;
}

export function hasWeaponAttachment(weapon, key) {
  return weapon.attachments.some((attachment) => attachment.key === key);
}

export function slotIndexForAttachment(index) {
  return clamp(index, 0, MAX_WEAPON_ATTACHMENTS - 1);
}

export function rarityTableForSlot(slotIndex) {
  return ATTACHMENT_RARITY_TABLES[slotIndexForAttachment(slotIndex)];
}

export function attachmentCategoryLabel(category) {
  const labels = {
    stat: "ステータス",
    special: "特殊効果",
    synergy: "シナジー",
    legend: "伝説効果",
    support: "プレイヤー強化",
  };
  return labels[category] || "効果";
}

export function attachmentMinimumRarityLabel(definition) {
  return rarityLabel(definition?.minRarity || "normal");
}

export function attachmentEffectSummary(definition, rarity) {
  if (!definition) return "";
  const power = rarityPower(rarity);
  if (definition.category === "stat") {
    return `効果量 ${power.toFixed(2)}倍`;
  }
  if (definition.category === "special") {
    return `特殊効果量 ${power.toFixed(2)}倍`;
  }
  if (definition.category === "synergy") {
    return `既存アタッチメントとの連動量 ${power.toFixed(2)}倍`;
  }
  if (definition.category === "support") {
    return `プレイヤー強化量 ${power.toFixed(2)}倍`;
  }
  return `総合強化 ${power.toFixed(2)}倍`;
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
      rarity: attachment.rarity,
      rarityLabel: rarityLabel(attachment.rarity),
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
      if (definition) definition.attach(weapon, rarityPower(attachment.rarity), attachment);
    });
  });
  syncGearAttachments();
  if (game.player.hp > game.player.maxHp) game.player.hp = game.player.maxHp;
}

export function getSelectedAttachmentInfo() {
  const selected = game.selectedAttachment;
  if (!selected) return null;
  const weapon = findWeapon(selected.weaponId);
  if (!weapon) {
    game.selectedAttachment = null;
    return null;
  }
  const attachment = weapon.attachments[selected.attachmentIndex];
  if (!attachment) {
    game.selectedAttachment = null;
    return null;
  }
  const definition = findAttachmentDefinition(attachment.key);
  return {
    weapon,
    attachment,
    definition,
    attachmentIndex: selected.attachmentIndex,
  };
}

export const ACTIVE_ATTACHMENTS = [
  {
    key: "powerCore",
    name: "威力コア",
    minRarity: "normal",
    category: "stat",
    text: "武器の基礎ダメージを上げる。爆発武器は爆風威力も上がる。",
    attach: (weapon, power) => {
      boostWeaponImpact(weapon, Math.round(4 * power));
    },
  },
  {
    key: "rapidMechanism",
    name: "高速機構",
    minRarity: "normal",
    category: "stat",
    text: "武器の攻撃頻度を上げる。設置武器は置き直しが早くなる。",
    attach: (weapon, power) => {
      weapon.fireRate *= 1 + 0.1 * power;
    },
  },
  {
    key: "rangeTube",
    name: "射程チューブ",
    minRarity: "normal",
    category: "stat",
    text: "弾、炎、斬撃、設置攻撃の届く距離を広げる。",
    attach: (weapon, power) => {
      extendWeaponReach(weapon, 1 + 0.1 * power);
    },
  },
  {
    key: "areaLens",
    name: "範囲レンズ",
    minRarity: "normal",
    category: "stat",
    text: "武器の当たり幅や巻き込み範囲を広げる。",
    attach: (weapon, power) => {
      addWeaponPierce(weapon, 0.8 + power * 0.35);
      expandWeaponArea(weapon, power);
    },
  },
  {
    key: "stableGrip",
    name: "安定グリップ",
    minRarity: "normal",
    category: "stat",
    text: "武器のブレを抑え、弾速と手応えを少し上げる。",
    attach: (weapon, power) => {
      weapon.spread *= Math.max(0.55, 1 - 0.08 * power);
      weapon.jitter *= Math.max(0.45, 1 - 0.12 * power);
      if (weapon.bulletSpeed > 1) weapon.bulletSpeed *= 1 + 0.07 * power;
      boostWeaponImpact(weapon, Math.round(1.5 * power));
    },
  },
  {
    key: "splitChamber",
    name: "分裂チャンバー",
    minRarity: "rare",
    category: "special",
    text: "弾数や攻撃幅を増やす特殊改造。レア以上で出現する。",
    attach: (weapon, power) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.12, weapon.cone + 0.07 * power);
      } else if (weapon.kind === "orbit") {
        weapon.areaRadius += 7 * power;
        weapon.orbitSpeed *= 1 + 0.05 * power;
      } else {
        weapon.projectiles += Math.max(1, Math.floor(power));
        weapon.spread += 0.025 * power;
      }
    },
  },
  {
    key: "blastPrimer",
    name: "爆裂プライマー",
    minRarity: "rare",
    category: "special",
    text: "着弾や設置攻撃に小さな爆発性を持たせる。レア以上で出現する。",
    attach: (weapon, power) => {
      const radius = 44 + 18 * power;
      weapon.explosionRadius = Math.max(weapon.explosionRadius, radius);
      weapon.explosionDamage = Math.max(weapon.explosionDamage, weapon.damage * (0.45 + 0.11 * power));
      if (weapon.kind === "timedBomb") weapon.fuse = Math.max(0.75, weapon.fuse - 0.12 * power);
    },
  },
  {
    key: "sustainEmitter",
    name: "持続エミッター",
    minRarity: "rare",
    category: "special",
    text: "炎、レーザー、回転武器の持続と当たり続ける力を伸ばす。",
    attach: (weapon, power) => {
      weapon.duration *= 1 + 0.14 * power;
      if (weapon.tickRate > 0) weapon.tickRate *= 1 + 0.12 * power;
      if (weapon.kind === "flame" || weapon.kind === "sustainedLaser") weapon.fireRate *= 1 + 0.05 * power;
      if (weapon.kind === "orbit") weapon.orbitRadius *= 1 + 0.07 * power;
    },
  },
  {
    key: "overclockLink",
    name: "過給リンク",
    minRarity: "epic",
    category: "synergy",
    text: "威力コアや高速機構と噛み合うシナジー改造。エピック以上で出現する。",
    attach: (weapon, power) => {
      const hasPower = hasWeaponAttachment(weapon, "powerCore");
      const hasRapid = hasWeaponAttachment(weapon, "rapidMechanism");
      if (hasPower) boostWeaponImpact(weapon, Math.round(2.5 * power));
      if (hasRapid) weapon.fireRate *= 1 + 0.08 * power;
      if (!hasPower && !hasRapid) {
        boostWeaponImpact(weapon, Math.round(1.5 * power));
        weapon.fireRate *= 1 + 0.04 * power;
      }
    },
  },
  {
    key: "focusPrism",
    name: "収束プリズム",
    minRarity: "epic",
    category: "synergy",
    text: "射程チューブや範囲レンズと噛み合うシナジー改造。エピック以上で出現する。",
    attach: (weapon, power) => {
      const hasRange = hasWeaponAttachment(weapon, "rangeTube");
      const hasArea = hasWeaponAttachment(weapon, "areaLens");
      if (hasRange) extendWeaponReach(weapon, 1 + 0.055 * power);
      if (hasArea) expandWeaponArea(weapon, power * 0.7);
      if (hasRange && hasArea) boostWeaponImpact(weapon, Math.round(2 * power));
    },
  },
  {
    key: "nightLegend",
    name: "夜街の伝説",
    minRarity: "legend",
    category: "legend",
    text: "5枠目でだけ出る伝説級改造。武器全体を大きく底上げする。",
    attach: (weapon, power) => {
      boostWeaponImpact(weapon, Math.round(4 * power));
      weapon.fireRate *= 1 + 0.07 * power;
      extendWeaponReach(weapon, 1 + 0.06 * power);
      expandWeaponArea(weapon, power);
      if (weapon.kind !== "flame" && weapon.kind !== "sword" && weapon.kind !== "orbit") {
        weapon.projectiles += 1;
      }
    },
  },
  {
    key: "vitalityCharm",
    name: "守りのお守り",
    minRarity: "normal",
    category: "support",
    text: "最大体力を底上げする。倒れにくい体になる。",
    attach: (_weapon, power) => {
      game.player.maxHp += Math.round(22 * power);
    },
  },
  {
    key: "guardBadge",
    name: "古い防犯バッジ",
    minRarity: "normal",
    category: "support",
    text: "被ダメージ軽減の値を上げる。",
    attach: (_weapon, power) => {
      game.player.armor += Math.round(3 * power);
    },
  },
  {
    key: "fieldTape",
    name: "応急テープ",
    minRarity: "normal",
    category: "support",
    text: "戦闘中の自然回復量を底上げする。",
    attach: (_weapon, power) => {
      game.player.regen += 0.7 * power;
    },
  },
  {
    key: "scrapMagnet",
    name: "スクラップ磁石",
    minRarity: "normal",
    category: "support",
    text: "コインの磁力範囲を広げる。",
    attach: (_weapon, power) => {
      game.player.pickup += Math.round(34 * power);
    },
  },
  {
    key: "lightSneaker",
    name: "軽量スニーカー",
    minRarity: "normal",
    category: "support",
    text: "移動速度を上げて立ち回りやすくする。",
    attach: (_weapon, power) => {
      game.player.speed += Math.round(22 * power);
    },
  },
  {
    key: "looseBattery",
    name: "ジャンク電池",
    minRarity: "rare",
    category: "support",
    text: "武器威力ボーナスを大きく上げるが、被ダメージ軽減は少し失う。",
    attach: (_weapon, power) => {
      game.player.weaponPowerBonus += Math.round(8 * power);
      game.player.armor -= Math.round(2 * power);
    },
  },
];

export function rollAttachmentRarity(slotIndex) {
  const table = rarityTableForSlot(slotIndex);
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rarity of RARITY_ORDER) {
    cursor += table[rarity] || 0;
    if (roll < cursor) return rarity;
  }
  return "normal";
}

export function attachmentCanAppear(attachment, rarity) {
  return rarityRank(rarity) >= rarityRank(attachment.minRarity || "normal");
}

export function pickRandomAttachment(slotIndex) {
  const rarity = rollAttachmentRarity(slotIndex);
  const candidates = ACTIVE_ATTACHMENTS.filter((attachment) => attachmentCanAppear(attachment, rarity));
  if (candidates.length === 0) return null;
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  return { definition, rarity };
}

export function addAttachmentToWeapon(weapon, attachment) {
  if (!weapon || !attachment || weapon.attachments.length >= MAX_WEAPON_ATTACHMENTS) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  if (!definition?.key) return false;
  const rarity = attachment.rarity || "normal";
  weapon.attachments.push({
    key: definition.key,
    name: definition.name,
    rarity,
    category: definition.category || "stat",
  });
  recomputeAllAttachments();
  return true;
}

export function shopRarityTableForWave(wave) {
  const tier = clamp(Math.floor((Math.max(1, wave) - 1) / 2), 0, ATTACHMENT_RARITY_TABLES.length - 1);
  return ATTACHMENT_RARITY_TABLES[tier];
}

export function rollShopAttachmentRarity(wave) {
  const table = shopRarityTableForWave(wave);
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rarity of RARITY_ORDER) {
    cursor += table[rarity] || 0;
    if (roll < cursor) return rarity;
  }
  return "normal";
}

export function pickShopAttachment(wave) {
  const rarity = rollShopAttachmentRarity(wave);
  const candidates = ACTIVE_ATTACHMENTS.filter((attachment) => attachmentCanAppear(attachment, rarity));
  if (candidates.length === 0) return null;
  const definition = candidates[Math.floor(Math.random() * candidates.length)];
  return { definition, rarity };
}

export function attachmentRerollCost(weapon, attachmentIndex = 0) {
  const slotIndex = slotIndexForAttachment(attachmentIndex);
  return Math.floor(ATTACHMENT_REROLL_SLOT_COSTS[slotIndex] + game.wave * (1.1 + slotIndex * 0.55));
}
