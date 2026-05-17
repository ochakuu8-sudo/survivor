import { game } from "./state.js";
import { MAX_STORED_ATTACHMENTS, getWeaponMaxAttachments } from "./constants.js";
import {
  addWeaponBasePercent,
  addWeaponPierce,
  boostWeaponImpactPercent,
  expandWeaponArea,
  extendWeaponReach,
  reduceWeaponBasePercent,
  restoreWeaponBaseStats,
} from "./weapons.js";
import { tagsForAttachment } from "./data/attachmentTags.js";
import { isStoneWeapon, recomputeStoneItems } from "./stoneItems.js";

const STAR_LABELS = { 1: "★", 2: "★★", 3: "★★★", 4: "★★★★", 5: "★★★★★" };

function increasePlayerMaxHp(amount) {
  if (!game.player || amount <= 0) return;
  game.player.maxHp += amount;
  game.player.hp = Math.min(game.player.maxHp, (game.player.hp || 0) + amount);
}

export function starsLabel(stars) {
  return STAR_LABELS[stars] || STAR_LABELS[1];
}

export function attachmentCategoryLabel(category) {
  const labels = {
    stat: "ステータス",
    special: "特殊効果",
    support: "プレイヤー強化",
    trajectory: "軌道変化",
    deploy: "設置",
    shatter: "破砕",
    element: "属性",
    control: "制御",
    delayed: "遅延",
    defense: "防御",
    growth: "成長",
    throwStyle: "投げ方",
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

export function restorePlayerBaseStats() {
  const player = game.player;
  if (!player?.baseStats) return;
  PLAYER_BASE_STAT_KEYS.forEach((key) => {
    if (player.baseStats[key] !== undefined) player[key] = player.baseStats[key];
  });
}

function boostWeaponAttackSpeed(weapon, percent) {
  addWeaponBasePercent(weapon, "fireRate", percent, { min: 0.15 });
}

export function recomputeAllAttachments() {
  if (!game.player?.gear) return;
  const activeStone = game.player.gear.weapons.find((weapon) => isStoneWeapon(weapon) && Array.isArray(weapon.items));
  if (activeStone) {
    recomputeStoneItems(activeStone, game.player);
    syncGearAttachments();
    return;
  }
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
        attachment.locked = !!attachment.locked;
        attachment.tags = attachment.tags || tagsForAttachment(definition);
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
    name: "ダメージ+15%",
    stars: 1,
    category: "stat",
    text: "基礎ダメージ +15%。爆発武器は基礎爆風ダメージも +15%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.15);
    },
  },
  {
    key: "rapidMechanism",
    name: "攻撃頻度+13%",
    stars: 1,
    category: "stat",
    text: "攻撃頻度 +13%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.13, { min: 0.15 });
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
    text: "爆発半径・線幅・コーン範囲・命中幅 +8%（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 1);
    },
  },
  {
    key: "stableGrip",
    name: "ばらつき-22%",
    stars: 1,
    category: "stat",
    text: "ばらつき −22%、ぶれ −30%、弾速 +8%、ダメージ +5%。",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.22, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.3, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.08, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.05);
    },
  },
  {
    key: "vitalityCharm",
    name: "最大HP+10",
    stars: 1,
    category: "support",
    text: "最大HP +10。",
    attach: () => {
      increasePlayerMaxHp(10);
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
    key: "speedCore",
    name: "攻撃頻度+15%",
    stars: 1,
    category: "stat",
    text: "攻撃頻度 +15%。",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.15);
    },
  },
  {
    key: "powerCore2",
    name: "ダメージ+30%",
    stars: 2,
    category: "stat",
    text: "基礎ダメージ +30%。爆発武器は基礎爆風ダメージも +30%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.3);
    },
  },
  {
    key: "powerCore3",
    name: "ダメージ+50%",
    stars: 3,
    category: "stat",
    text: "基礎ダメージ +50%。爆発武器は基礎爆風ダメージも +50%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.5);
    },
  },
  {
    key: "powerCore4",
    name: "ダメージ+75%",
    stars: 4,
    category: "stat",
    text: "基礎ダメージ +75%。爆発武器は基礎爆風ダメージも +75%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.75);
    },
  },
  {
    key: "powerCore5",
    name: "ダメージ+110%",
    stars: 5,
    category: "stat",
    text: "基礎ダメージ +110%。爆発武器は基礎爆風ダメージも +110%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 1.1);
    },
  },
  {
    key: "rapidMechanism2",
    name: "攻撃頻度+22%",
    stars: 2,
    category: "stat",
    text: "攻撃頻度 +22%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.22, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism3",
    name: "攻撃頻度+34%",
    stars: 3,
    category: "stat",
    text: "攻撃頻度 +34%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.34, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism4",
    name: "攻撃頻度+48%",
    stars: 4,
    category: "stat",
    text: "攻撃頻度 +48%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.48, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism5",
    name: "攻撃頻度+65%",
    stars: 5,
    category: "stat",
    text: "攻撃頻度 +65%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.65, { min: 0.15 });
    },
  },
  {
    key: "rangeTube2",
    name: "射程+22%",
    stars: 2,
    category: "stat",
    text: "射程 +22%、弾速 +22%、滞空 +10%、軌道半径 +14%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.22);
    },
  },
  {
    key: "rangeTube3",
    name: "射程+36%",
    stars: 3,
    category: "stat",
    text: "射程 +36%、弾速 +36%、滞空 +16%、軌道半径 +23%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.36);
    },
  },
  {
    key: "rangeTube4",
    name: "射程+52%",
    stars: 4,
    category: "stat",
    text: "射程 +52%、弾速 +52%、滞空 +23%、軌道半径 +34%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.52);
    },
  },
  {
    key: "rangeTube5",
    name: "射程+72%",
    stars: 5,
    category: "stat",
    text: "射程 +72%、弾速 +72%、滞空 +32%、軌道半径 +47%（武器に応じて）。",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.72);
    },
  },
  {
    key: "areaLens2",
    name: "範囲+16%",
    stars: 2,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲・命中幅 +16%（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 2);
    },
  },
  {
    key: "areaLens3",
    name: "範囲+24%",
    stars: 3,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲・命中幅 +24%（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 3);
    },
  },
  {
    key: "areaLens4",
    name: "範囲+36%",
    stars: 4,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲・命中幅 +36%（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 4.5);
    },
  },
  {
    key: "areaLens5",
    name: "範囲+52%",
    stars: 5,
    category: "stat",
    text: "爆発半径・線幅・コーン範囲・命中幅 +52%（武器に応じて）。",
    attach: (weapon) => {
      expandWeaponArea(weapon, 6.5);
    },
  },
  {
    key: "stableGrip2",
    name: "ばらつき-35%",
    stars: 2,
    category: "stat",
    text: "ばらつき −35%、ぶれ −45%、弾速 +12%、ダメージ +10%。",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.35, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.45, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.12, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.1);
    },
  },
  {
    key: "stableGrip3",
    name: "ばらつき-50%",
    stars: 3,
    category: "stat",
    text: "ばらつき −50%、ぶれ −60%、弾速 +16%、ダメージ +16%。",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.5, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.6, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.16, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.16);
    },
  },
  {
    key: "stableGrip4",
    name: "ばらつき-65%",
    stars: 4,
    category: "stat",
    text: "ばらつき −65%、ぶれ −72%、弾速 +22%、ダメージ +24%。",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.65, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.72, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.22, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.24);
    },
  },
  {
    key: "stableGrip5",
    name: "ばらつき-75%",
    stars: 5,
    category: "stat",
    text: "ばらつき −75%、ぶれ −82%、弾速 +32%、ダメージ +35%。",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.75, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.82, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.32, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.35);
    },
  },
  {
    key: "vitalityCharm3",
    name: "最大HP+20",
    stars: 3,
    category: "support",
    text: "最大HP +20。",
    attach: () => {
      increasePlayerMaxHp(20);
    },
  },
  {
    key: "vitalityCharm5",
    name: "最大HP+30",
    stars: 5,
    category: "support",
    text: "最大HP +30。",
    attach: () => {
      increasePlayerMaxHp(30);
    },
  },
  {
    key: "guardBadge2",
    name: "被ダメ軽減+7",
    stars: 2,
    category: "support",
    text: "被ダメージ軽減 +7。",
    attach: () => {
      game.player.armor += 7;
    },
  },
  {
    key: "guardBadge3",
    name: "被ダメ軽減+11",
    stars: 3,
    category: "support",
    text: "被ダメージ軽減 +11。",
    attach: () => {
      game.player.armor += 11;
    },
  },
  {
    key: "guardBadge4",
    name: "被ダメ軽減+16",
    stars: 4,
    category: "support",
    text: "被ダメージ軽減 +16。",
    attach: () => {
      game.player.armor += 16;
    },
  },
  {
    key: "guardBadge5",
    name: "被ダメ軽減+24",
    stars: 5,
    category: "support",
    text: "被ダメージ軽減 +24。",
    attach: () => {
      game.player.armor += 24;
    },
  },
  {
    key: "scrapMagnet2",
    name: "吸引範囲+64",
    stars: 2,
    category: "support",
    text: "ゴールド吸引範囲 +64。",
    attach: () => {
      game.player.pickup += 64;
    },
  },
  {
    key: "scrapMagnet3",
    name: "吸引範囲+96",
    stars: 3,
    category: "support",
    text: "ゴールド吸引範囲 +96。",
    attach: () => {
      game.player.pickup += 96;
    },
  },
  {
    key: "scrapMagnet4",
    name: "吸引範囲+140",
    stars: 4,
    category: "support",
    text: "ゴールド吸引範囲 +140。",
    attach: () => {
      game.player.pickup += 140;
    },
  },
  {
    key: "scrapMagnet5",
    name: "吸引範囲+200",
    stars: 5,
    category: "support",
    text: "ゴールド吸引範囲 +200。",
    attach: () => {
      game.player.pickup += 200;
    },
  },
  {
    key: "lightSneaker2",
    name: "移動速度+45",
    stars: 2,
    category: "support",
    text: "移動速度 +45。",
    attach: () => {
      game.player.speed += 45;
    },
  },
  {
    key: "speedCore2",
    name: "攻撃頻度+25%",
    stars: 2,
    category: "stat",
    text: "攻撃頻度 +25%。",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.25);
    },
  },
  {
    key: "lightSneaker3",
    name: "移動速度+70",
    stars: 3,
    category: "support",
    text: "移動速度 +70。",
    attach: () => {
      game.player.speed += 70;
    },
  },
  {
    key: "speedCore3",
    name: "攻撃頻度+40%",
    stars: 3,
    category: "stat",
    text: "攻撃頻度 +40%。",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.4);
    },
  },
  {
    key: "lightSneaker4",
    name: "移動速度+105",
    stars: 4,
    category: "support",
    text: "移動速度 +105。",
    attach: () => {
      game.player.speed += 105;
    },
  },
  {
    key: "speedCore4",
    name: "攻撃頻度+60%",
    stars: 4,
    category: "stat",
    text: "攻撃頻度 +60%。",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.6);
    },
  },
  {
    key: "lightSneaker5",
    name: "移動速度+150",
    stars: 5,
    category: "support",
    text: "移動速度 +150。",
    attach: () => {
      game.player.speed += 150;
    },
  },
  {
    key: "speedCore5",
    name: "攻撃頻度+85%",
    stars: 5,
    category: "stat",
    text: "攻撃頻度 +85%。",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.85);
    },
  },
  {
    key: "splitChamber",
    name: "同時攻撃数+1",
    stars: 3,
    category: "special",
    text: "同時攻撃数 +1。通常射撃は弾が増え、回転武器は回る攻撃が増える。炎・剣は攻撃範囲が広がる。",
    attach: (weapon) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.12, weapon.cone + 0.12);
      } else if (weapon.kind === "orbit") {
        weapon.orbitCount = (weapon.orbitCount || 1) + 1;
        weapon.areaRadius += 6;
        weapon.orbitSpeed *= 1.1;
      } else if (weapon.kind === "drone") {
        weapon.droneCount = (weapon.droneCount || 1) + 1;
      } else if (weapon.kind === "mine") {
        weapon.projectiles = (weapon.projectiles || 1) + 1;
        weapon.maxMines = (weapon.maxMines || 8) + 2;
      } else {
        weapon.projectiles += 1;
      }
    },
  },
  {
    key: "sustainEmitter",
    name: "持続時間+25%",
    stars: 2,
    category: "stat",
    text: "持続時間 +25%、ティック頻度 +20%、炎・設置レーザーの発射 +8%、回転半径 +10%。",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "duration", 0.25, { min: 0 });
      if (weapon.tickRate > 0) addWeaponBasePercent(weapon, "tickRate", 0.2, { min: 0 });
      if (weapon.kind === "flame" || weapon.kind === "sustainedLaser") {
        addWeaponBasePercent(weapon, "fireRate", 0.08, { min: 0.15 });
      }
      if (weapon.kind === "orbit" || weapon.kind === "drone") addWeaponBasePercent(weapon, "orbitRadius", 0.1, { min: 0 });
      if (weapon.kind === "mine" || weapon.kind === "poisonBottle") addWeaponBasePercent(weapon, "life", 0.2, { min: 0.05 });
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
    stars: 3,
    category: "special",
    compatibleWeapons: ["石"],
    text: "通常弾が命中後、近くの別の敵へ1回跳ねる。",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 1;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 230);
    },
  },
  {
    key: "criticalLens",
    name: "クリティカル+12%",
    stars: 3,
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
    stars: 3,
    category: "special",
    text: "命中時に22%で敵の移動速度を1.6秒間38%低下させる。",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.22;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.62);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 1.6);
    },
  },
  {
    key: "lifeDrain",
    name: "吸血+1",
    stars: 3,
    category: "special",
    text: "この武器で敵を倒すたび、倒した数 × 1 HP回復する。",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 1;
    },
  },
  {
    key: "barrierEmitter",
    name: "バリア+1",
    stars: 3,
    category: "support",
    barrierGain: 1,
    text: "バリア +1。バリアは被ダメージを1回だけ無効化する。",
    attach: () => {
      game.player.barrierMax += 1;
    },
  },
  {
    key: "piercer",
    name: "貫通+1",
    stars: 3,
    category: "special",
    text: "貫通 +1。武器に応じて爆発半径・線幅・コーン範囲・命中幅も追加で広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 1);
    },
  },
  {
    key: "knockbackBooster",
    name: "ノックバック+8",
    stars: 3,
    category: "special",
    text: "弾の与えるノックバック +8。",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 8;
    },
  },
  {
    key: "overdriveCore",
    name: "ダメージ+45%/頻度+8%",
    stars: 3,
    category: "special",
    text: "基礎ダメージ +45%。攻撃頻度 +8%。",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.45);
      addWeaponBasePercent(weapon, "fireRate", 0.08, { min: 0.15 });
    },
  },
  {
    key: "multiForge",
    name: "同時攻撃数+2",
    stars: 4,
    category: "special",
    text: "同時攻撃数 +2。通常射撃は弾が増え、回転武器は回る攻撃が増える。炎・剣は攻撃範囲が広がる。",
    attach: (weapon) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.2, weapon.cone + 0.18);
      } else if (weapon.kind === "orbit") {
        weapon.orbitCount = (weapon.orbitCount || 1) + 2;
        weapon.areaRadius += 8;
      } else if (weapon.kind === "drone") {
        weapon.droneCount = (weapon.droneCount || 1) + 2;
      } else if (weapon.kind === "mine") {
        weapon.projectiles = (weapon.projectiles || 1) + 2;
        weapon.maxMines = (weapon.maxMines || 8) + 4;
      } else {
        weapon.projectiles += 2;
      }
    },
  },
  {
    key: "deepPiercer",
    name: "貫通+2",
    stars: 4,
    category: "special",
    text: "貫通 +2。武器に応じて爆発・線幅・コーン・命中幅も大きく広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 2);
    },
  },
  {
    key: "cryoEngine",
    name: "氷結+35%",
    stars: 4,
    category: "special",
    text: "命中時に35%で敵の移動速度を2.2秒間45%低下させる。",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.35;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.55);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 2.2);
    },
  },
  {
    key: "lifeDrain2",
    name: "吸血+2",
    stars: 4,
    category: "special",
    text: "この武器で敵を倒すたび、倒した数 × 2 HP回復する。",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 2;
    },
  },
  {
    key: "safetyField",
    name: "バリア+2/吸引+24",
    stars: 4,
    category: "support",
    barrierGain: 2,
    text: "バリア +2。ゴールド吸引範囲 +24。",
    attach: () => {
      game.player.barrierMax += 2;
      game.player.pickup += 24;
    },
  },
  {
    key: "ricochetCore2",
    name: "跳弾+2",
    stars: 4,
    category: "special",
    compatibleWeapons: ["石"],
    text: "通常弾が命中後、近くの敵へ2回跳ねる。跳弾距離も少し伸びる。",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 2;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 260);
    },
  },
  {
    key: "ricochetCore3",
    name: "跳弾+3",
    stars: 5,
    category: "special",
    compatibleWeapons: ["石"],
    text: "通常弾が命中後、近くの敵へ3回跳ねる。跳弾距離も大きく伸びる。",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 3;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 300);
    },
  },
  {
    key: "criticalLens2",
    name: "クリティカル+25%",
    stars: 4,
    category: "special",
    text: "命中時に25%でクリティカル。クリティカルダメージは2倍。",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.25;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 2);
    },
  },
  {
    key: "criticalLens3",
    name: "クリティカル+40%",
    stars: 5,
    category: "special",
    text: "命中時に40%でクリティカル。クリティカルダメージは2.25倍。",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.4;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 2.25);
    },
  },
  {
    key: "frostPowder3",
    name: "氷結+50%",
    stars: 5,
    category: "special",
    text: "命中時に50%で敵の移動速度を2.8秒間55%低下させる。",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.5;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.45);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 2.8);
    },
  },
  {
    key: "lifeDrain3",
    name: "吸血+5",
    stars: 5,
    category: "special",
    text: "この武器で敵を倒すたび、倒した数 × 5 HP回復する。",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 5;
    },
  },
  {
    key: "barrierEmitter3",
    name: "バリア+3",
    stars: 5,
    category: "support",
    barrierGain: 3,
    text: "バリア +3。バリアは被ダメージを1回だけ無効化する。",
    attach: () => {
      game.player.barrierMax += 3;
    },
  },
  {
    key: "piercer3",
    name: "貫通+3",
    stars: 5,
    category: "special",
    text: "貫通 +3。武器に応じて爆発・線幅・コーン・命中幅も大きく広がる。",
    attach: (weapon) => {
      addWeaponPierce(weapon, 3);
    },
  },
  {
    key: "knockbackBooster2",
    name: "ノックバック+14",
    stars: 4,
    category: "special",
    text: "弾の与えるノックバック +14。",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 14;
    },
  },
  {
    key: "knockbackBooster3",
    name: "ノックバック+22",
    stars: 5,
    category: "special",
    text: "弾の与えるノックバック +22。",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 22;
    },
  },
  {
    key: "multiForge3",
    name: "同時攻撃数+3",
    stars: 5,
    category: "special",
    text: "同時攻撃数 +3。通常射撃は弾が増え、回転武器は回る攻撃が増える。炎・剣は攻撃範囲が広がる。",
    attach: (weapon) => {
      if (weapon.kind === "flame" || weapon.kind === "sword") {
        weapon.cone = Math.min(1.28, weapon.cone + 0.26);
      } else if (weapon.kind === "orbit") {
        weapon.orbitCount = (weapon.orbitCount || 1) + 3;
        weapon.areaRadius += 12;
      } else {
        weapon.projectiles += 3;
      }
    },
  },
  {
    key: "safetyField3",
    name: "バリア+3/吸引+80",
    stars: 5,
    category: "support",
    barrierGain: 3,
    text: "バリア +3。ゴールド吸引範囲 +80。",
    attach: () => {
      game.player.barrierMax += 3;
      game.player.pickup += 80;
    },
  },
];

const LEVEL_ATTACHMENT_RARITY_WEIGHTS = {
  2: [[1, 80], [2, 20], [3, 0], [4, 0], [5, 0]],
  3: [[1, 60], [2, 30], [3, 10], [4, 0], [5, 0]],
  4: [[1, 40], [2, 40], [3, 20], [4, 0], [5, 0]],
  5: [[1, 0], [2, 50], [3, 40], [4, 10], [5, 0]],
  6: [[1, 0], [2, 35], [3, 45], [4, 20], [5, 0]],
  7: [[1, 0], [2, 0], [3, 55], [4, 35], [5, 10]],
  8: [[1, 0], [2, 0], [3, 35], [4, 45], [5, 20]],
  9: [[1, 0], [2, 0], [3, 0], [4, 65], [5, 35]],
};

function attachmentRarityWeightsForLevel(level) {
  const clampedLevel = Math.min(9, Math.max(2, level || 2));
  return LEVEL_ATTACHMENT_RARITY_WEIGHTS[clampedLevel] || LEVEL_ATTACHMENT_RARITY_WEIGHTS[2];
}

export function pickShopAttachment(wave) {
  const stars = pickStarsForWave(wave);
  return pickAttachmentByStars(stars);
}

export function attachmentRarityChanceText(level) {
  return attachmentRarityWeightsForLevel(level)
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
  const weights = attachmentRarityWeightsForLevel(level);
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
  let weights = [[1, 80], [2, 20], [3, 0], [4, 0], [5, 0]];
  if (w >= 3) {
    weights = [[1, 58], [2, 32], [3, 10], [4, 0], [5, 0]];
  }
  if (w >= 5) {
    weights = [[1, 42], [2, 34], [3, 20], [4, 4], [5, 0]];
  }
  if (w >= 7) {
    weights = [[1, 28], [2, 34], [3, 26], [4, 10], [5, 2]];
  }
  if (w >= 10) {
    weights = [[1, 18], [2, 28], [3, 32], [4, 17], [5, 5]];
  }
  const r = Math.random() * 100;
  let cursor = 0;
  for (const [stars, weight] of weights) {
    cursor += weight;
    if (r < cursor) return stars;
  }
  return 1;
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


export function createAttachmentInstance(definition, overrides = {}) {
  if (!definition?.key) return null;
  return {
    key: definition.key,
    name: definition.name,
    stars: overrides.stars || definition.stars || 1,
    category: definition.category || "stat",
    locked: !!(overrides.locked ?? definition.locked),
    cursed: !!(overrides.cursed ?? definition.cursed),
    tags: overrides.tags || tagsForAttachment(definition),
  };
}

export function canStoreAttachment(gear = game.player?.gear) {
  if (!gear) return false;
  if (!Array.isArray(gear.storageAttachments)) gear.storageAttachments = [];
  return gear.storageAttachments.length < (gear.storageAttachmentsMax || MAX_STORED_ATTACHMENTS);
}

export function addAttachmentToStorage(attachment, gear = game.player?.gear) {
  if (!gear || !attachment || !canStoreAttachment(gear)) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  const instance = createAttachmentInstance(definition, attachment);
  if (!instance) return false;
  gear.storageAttachments.push(instance);
  return true;
}

export function removeAttachmentFromStorage(index, gear = game.player?.gear) {
  if (!gear || !Array.isArray(gear.storageAttachments)) return null;
  if (!Number.isInteger(index) || index < 0 || index >= gear.storageAttachments.length) return null;
  return gear.storageAttachments.splice(index, 1)[0] || null;
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
  if ((weapon.attachments?.length || 0) >= getWeaponMaxAttachments(weapon)) return false;
  const definition = attachment.definition || findAttachmentDefinition(attachment.key) || attachment;
  if (!definition?.key) return false;
  const weaponName = weapon.baseName || weapon.name;
  if (definition.compatibleWeapons && !definition.compatibleWeapons.includes(weaponName)) {
    return false;
  }
  const stars = attachment.stars || definition.stars || 1;
  weapon.attachments.push(createAttachmentInstance(definition, { ...attachment, stars }));
  recomputeAllAttachments();
  if (definition.barrierGain > 0) {
    const barrierGain = definition.barrierGain;
    game.player.barrier = Math.min(game.player.barrierMax || 0, (game.player.barrier || 0) + barrierGain);
  }
  return true;
}
