import { t } from "./i18n.js";
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
  return t(`category.${category}`) || t("category.default");
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
    name: t("attachment.powerCore.name"), nameKey: "attachment.powerCore.name",
    stars: 1,
    category: "stat",
    text: t("attachment.powerCore.text"), textKey: "attachment.powerCore.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.15);
    },
  },
  {
    key: "rapidMechanism",
    name: t("attachment.rapidMechanism.name"), nameKey: "attachment.rapidMechanism.name",
    stars: 1,
    category: "stat",
    text: t("attachment.rapidMechanism.text"), textKey: "attachment.rapidMechanism.text",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.13, { min: 0.15 });
    },
  },
  {
    key: "rangeTube",
    name: t("attachment.rangeTube.name"), nameKey: "attachment.rangeTube.name",
    stars: 1,
    category: "stat",
    text: t("attachment.rangeTube.text"), textKey: "attachment.rangeTube.text",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.13);
    },
  },
  {
    key: "areaLens",
    name: t("attachment.areaLens.name"), nameKey: "attachment.areaLens.name",
    stars: 1,
    category: "stat",
    text: t("attachment.areaLens.text"), textKey: "attachment.areaLens.text",
    attach: (weapon) => {
      expandWeaponArea(weapon, 1);
    },
  },
  {
    key: "stableGrip",
    name: t("attachment.stableGrip.name"), nameKey: "attachment.stableGrip.name",
    stars: 1,
    category: "stat",
    text: t("attachment.stableGrip.text"), textKey: "attachment.stableGrip.text",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.22, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.3, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.08, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.05);
    },
  },
  {
    key: "vitalityCharm",
    name: t("attachment.vitalityCharm.name"), nameKey: "attachment.vitalityCharm.name",
    stars: 1,
    category: "support",
    text: t("attachment.vitalityCharm.text"), textKey: "attachment.vitalityCharm.text",
    attach: () => {
      increasePlayerMaxHp(10);
    },
  },
  {
    key: "guardBadge",
    name: t("attachment.guardBadge.name"), nameKey: "attachment.guardBadge.name",
    stars: 1,
    category: "support",
    text: t("attachment.guardBadge.text"), textKey: "attachment.guardBadge.text",
    attach: () => {
      game.player.armor += 4;
    },
  },
  {
    key: "scrapMagnet",
    name: t("attachment.scrapMagnet.name"), nameKey: "attachment.scrapMagnet.name",
    stars: 1,
    category: "support",
    text: t("attachment.scrapMagnet.text"), textKey: "attachment.scrapMagnet.text",
    attach: () => {
      game.player.pickup += 36;
    },
  },
  {
    key: "lightSneaker",
    name: t("attachment.lightSneaker.name"), nameKey: "attachment.lightSneaker.name",
    stars: 1,
    category: "support",
    text: t("attachment.lightSneaker.text"), textKey: "attachment.lightSneaker.text",
    attach: () => {
      game.player.speed += 26;
    },
  },
  {
    key: "speedCore",
    name: t("attachment.speedCore.name"), nameKey: "attachment.speedCore.name",
    stars: 1,
    category: "stat",
    text: t("attachment.speedCore.text"), textKey: "attachment.speedCore.text",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.15);
    },
  },
  {
    key: "powerCore2",
    name: t("attachment.powerCore2.name"), nameKey: "attachment.powerCore2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.powerCore2.text"), textKey: "attachment.powerCore2.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.3);
    },
  },
  {
    key: "powerCore3",
    name: t("attachment.powerCore3.name"), nameKey: "attachment.powerCore3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.powerCore3.text"), textKey: "attachment.powerCore3.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.5);
    },
  },
  {
    key: "powerCore4",
    name: t("attachment.powerCore4.name"), nameKey: "attachment.powerCore4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.powerCore4.text"), textKey: "attachment.powerCore4.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.75);
    },
  },
  {
    key: "powerCore5",
    name: t("attachment.powerCore5.name"), nameKey: "attachment.powerCore5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.powerCore5.text"), textKey: "attachment.powerCore5.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 1.1);
    },
  },
  {
    key: "rapidMechanism2",
    name: t("attachment.rapidMechanism2.name"), nameKey: "attachment.rapidMechanism2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.rapidMechanism2.text"), textKey: "attachment.rapidMechanism2.text",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.22, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism3",
    name: t("attachment.rapidMechanism3.name"), nameKey: "attachment.rapidMechanism3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.rapidMechanism3.text"), textKey: "attachment.rapidMechanism3.text",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.34, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism4",
    name: t("attachment.rapidMechanism4.name"), nameKey: "attachment.rapidMechanism4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.rapidMechanism4.text"), textKey: "attachment.rapidMechanism4.text",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.48, { min: 0.15 });
    },
  },
  {
    key: "rapidMechanism5",
    name: t("attachment.rapidMechanism5.name"), nameKey: "attachment.rapidMechanism5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.rapidMechanism5.text"), textKey: "attachment.rapidMechanism5.text",
    attach: (weapon) => {
      addWeaponBasePercent(weapon, "fireRate", 0.65, { min: 0.15 });
    },
  },
  {
    key: "rangeTube2",
    name: t("attachment.rangeTube2.name"), nameKey: "attachment.rangeTube2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.rangeTube2.text"), textKey: "attachment.rangeTube2.text",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.22);
    },
  },
  {
    key: "rangeTube3",
    name: t("attachment.rangeTube3.name"), nameKey: "attachment.rangeTube3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.rangeTube3.text"), textKey: "attachment.rangeTube3.text",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.36);
    },
  },
  {
    key: "rangeTube4",
    name: t("attachment.rangeTube4.name"), nameKey: "attachment.rangeTube4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.rangeTube4.text"), textKey: "attachment.rangeTube4.text",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.52);
    },
  },
  {
    key: "rangeTube5",
    name: t("attachment.rangeTube5.name"), nameKey: "attachment.rangeTube5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.rangeTube5.text"), textKey: "attachment.rangeTube5.text",
    attach: (weapon) => {
      extendWeaponReach(weapon, 1.72);
    },
  },
  {
    key: "areaLens2",
    name: t("attachment.areaLens2.name"), nameKey: "attachment.areaLens2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.areaLens2.text"), textKey: "attachment.areaLens2.text",
    attach: (weapon) => {
      expandWeaponArea(weapon, 2);
    },
  },
  {
    key: "areaLens3",
    name: t("attachment.areaLens3.name"), nameKey: "attachment.areaLens3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.areaLens3.text"), textKey: "attachment.areaLens3.text",
    attach: (weapon) => {
      expandWeaponArea(weapon, 3);
    },
  },
  {
    key: "areaLens4",
    name: t("attachment.areaLens4.name"), nameKey: "attachment.areaLens4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.areaLens4.text"), textKey: "attachment.areaLens4.text",
    attach: (weapon) => {
      expandWeaponArea(weapon, 4.5);
    },
  },
  {
    key: "areaLens5",
    name: t("attachment.areaLens5.name"), nameKey: "attachment.areaLens5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.areaLens5.text"), textKey: "attachment.areaLens5.text",
    attach: (weapon) => {
      expandWeaponArea(weapon, 6.5);
    },
  },
  {
    key: "stableGrip2",
    name: t("attachment.stableGrip2.name"), nameKey: "attachment.stableGrip2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.stableGrip2.text"), textKey: "attachment.stableGrip2.text",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.35, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.45, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.12, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.1);
    },
  },
  {
    key: "stableGrip3",
    name: t("attachment.stableGrip3.name"), nameKey: "attachment.stableGrip3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.stableGrip3.text"), textKey: "attachment.stableGrip3.text",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.5, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.6, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.16, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.16);
    },
  },
  {
    key: "stableGrip4",
    name: t("attachment.stableGrip4.name"), nameKey: "attachment.stableGrip4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.stableGrip4.text"), textKey: "attachment.stableGrip4.text",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.65, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.72, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.22, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.24);
    },
  },
  {
    key: "stableGrip5",
    name: t("attachment.stableGrip5.name"), nameKey: "attachment.stableGrip5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.stableGrip5.text"), textKey: "attachment.stableGrip5.text",
    attach: (weapon) => {
      reduceWeaponBasePercent(weapon, "spread", 0.75, { min: 0.02 });
      reduceWeaponBasePercent(weapon, "jitter", 0.82, { min: 0 });
      if (weapon.bulletSpeed > 1) addWeaponBasePercent(weapon, "bulletSpeed", 0.32, { min: 1 });
      boostWeaponImpactPercent(weapon, 0.35);
    },
  },
  {
    key: "vitalityCharm3",
    name: t("attachment.vitalityCharm3.name"), nameKey: "attachment.vitalityCharm3.name",
    stars: 3,
    category: "support",
    text: t("attachment.vitalityCharm3.text"), textKey: "attachment.vitalityCharm3.text",
    attach: () => {
      increasePlayerMaxHp(20);
    },
  },
  {
    key: "vitalityCharm5",
    name: t("attachment.vitalityCharm5.name"), nameKey: "attachment.vitalityCharm5.name",
    stars: 5,
    category: "support",
    text: t("attachment.vitalityCharm5.text"), textKey: "attachment.vitalityCharm5.text",
    attach: () => {
      increasePlayerMaxHp(30);
    },
  },
  {
    key: "guardBadge2",
    name: t("attachment.guardBadge2.name"), nameKey: "attachment.guardBadge2.name",
    stars: 2,
    category: "support",
    text: t("attachment.guardBadge2.text"), textKey: "attachment.guardBadge2.text",
    attach: () => {
      game.player.armor += 7;
    },
  },
  {
    key: "guardBadge3",
    name: t("attachment.guardBadge3.name"), nameKey: "attachment.guardBadge3.name",
    stars: 3,
    category: "support",
    text: t("attachment.guardBadge3.text"), textKey: "attachment.guardBadge3.text",
    attach: () => {
      game.player.armor += 11;
    },
  },
  {
    key: "guardBadge4",
    name: t("attachment.guardBadge4.name"), nameKey: "attachment.guardBadge4.name",
    stars: 4,
    category: "support",
    text: t("attachment.guardBadge4.text"), textKey: "attachment.guardBadge4.text",
    attach: () => {
      game.player.armor += 16;
    },
  },
  {
    key: "guardBadge5",
    name: t("attachment.guardBadge5.name"), nameKey: "attachment.guardBadge5.name",
    stars: 5,
    category: "support",
    text: t("attachment.guardBadge5.text"), textKey: "attachment.guardBadge5.text",
    attach: () => {
      game.player.armor += 24;
    },
  },
  {
    key: "scrapMagnet2",
    name: t("attachment.scrapMagnet2.name"), nameKey: "attachment.scrapMagnet2.name",
    stars: 2,
    category: "support",
    text: t("attachment.scrapMagnet2.text"), textKey: "attachment.scrapMagnet2.text",
    attach: () => {
      game.player.pickup += 64;
    },
  },
  {
    key: "scrapMagnet3",
    name: t("attachment.scrapMagnet3.name"), nameKey: "attachment.scrapMagnet3.name",
    stars: 3,
    category: "support",
    text: t("attachment.scrapMagnet3.text"), textKey: "attachment.scrapMagnet3.text",
    attach: () => {
      game.player.pickup += 96;
    },
  },
  {
    key: "scrapMagnet4",
    name: t("attachment.scrapMagnet4.name"), nameKey: "attachment.scrapMagnet4.name",
    stars: 4,
    category: "support",
    text: t("attachment.scrapMagnet4.text"), textKey: "attachment.scrapMagnet4.text",
    attach: () => {
      game.player.pickup += 140;
    },
  },
  {
    key: "scrapMagnet5",
    name: t("attachment.scrapMagnet5.name"), nameKey: "attachment.scrapMagnet5.name",
    stars: 5,
    category: "support",
    text: t("attachment.scrapMagnet5.text"), textKey: "attachment.scrapMagnet5.text",
    attach: () => {
      game.player.pickup += 200;
    },
  },
  {
    key: "lightSneaker2",
    name: t("attachment.lightSneaker2.name"), nameKey: "attachment.lightSneaker2.name",
    stars: 2,
    category: "support",
    text: t("attachment.lightSneaker2.text"), textKey: "attachment.lightSneaker2.text",
    attach: () => {
      game.player.speed += 45;
    },
  },
  {
    key: "speedCore2",
    name: t("attachment.speedCore2.name"), nameKey: "attachment.speedCore2.name",
    stars: 2,
    category: "stat",
    text: t("attachment.speedCore2.text"), textKey: "attachment.speedCore2.text",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.25);
    },
  },
  {
    key: "lightSneaker3",
    name: t("attachment.lightSneaker3.name"), nameKey: "attachment.lightSneaker3.name",
    stars: 3,
    category: "support",
    text: t("attachment.lightSneaker3.text"), textKey: "attachment.lightSneaker3.text",
    attach: () => {
      game.player.speed += 70;
    },
  },
  {
    key: "speedCore3",
    name: t("attachment.speedCore3.name"), nameKey: "attachment.speedCore3.name",
    stars: 3,
    category: "stat",
    text: t("attachment.speedCore3.text"), textKey: "attachment.speedCore3.text",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.4);
    },
  },
  {
    key: "lightSneaker4",
    name: t("attachment.lightSneaker4.name"), nameKey: "attachment.lightSneaker4.name",
    stars: 4,
    category: "support",
    text: t("attachment.lightSneaker4.text"), textKey: "attachment.lightSneaker4.text",
    attach: () => {
      game.player.speed += 105;
    },
  },
  {
    key: "speedCore4",
    name: t("attachment.speedCore4.name"), nameKey: "attachment.speedCore4.name",
    stars: 4,
    category: "stat",
    text: t("attachment.speedCore4.text"), textKey: "attachment.speedCore4.text",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.6);
    },
  },
  {
    key: "lightSneaker5",
    name: t("attachment.lightSneaker5.name"), nameKey: "attachment.lightSneaker5.name",
    stars: 5,
    category: "support",
    text: t("attachment.lightSneaker5.text"), textKey: "attachment.lightSneaker5.text",
    attach: () => {
      game.player.speed += 150;
    },
  },
  {
    key: "speedCore5",
    name: t("attachment.speedCore5.name"), nameKey: "attachment.speedCore5.name",
    stars: 5,
    category: "stat",
    text: t("attachment.speedCore5.text"), textKey: "attachment.speedCore5.text",
    attach: (weapon) => {
      boostWeaponAttackSpeed(weapon, 0.85);
    },
  },
  {
    key: "splitChamber",
    name: t("attachment.splitChamber.name"), nameKey: "attachment.splitChamber.name",
    stars: 3,
    category: "special",
    text: t("attachment.splitChamber.text"), textKey: "attachment.splitChamber.text",
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
    name: t("attachment.sustainEmitter.name"), nameKey: "attachment.sustainEmitter.name",
    stars: 2,
    category: "stat",
    text: t("attachment.sustainEmitter.text"), textKey: "attachment.sustainEmitter.text",
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
    name: t("attachment.looseBattery.name"), nameKey: "attachment.looseBattery.name",
    stars: 2,
    category: "support",
    text: t("attachment.looseBattery.text"), textKey: "attachment.looseBattery.text",
    attach: () => {
      game.player.weaponPowerBonus += 14;
      game.player.armor -= 3;
    },
  },
  {
    key: "ricochetCore",
    name: t("attachment.ricochetCore.name"), nameKey: "attachment.ricochetCore.name",
    stars: 3,
    category: "special",
    compatibleWeapons: ["stone"],
    text: t("attachment.ricochetCore.text"), textKey: "attachment.ricochetCore.text",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 1;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 230);
    },
  },
  {
    key: "criticalLens",
    name: t("attachment.criticalLens.name"), nameKey: "attachment.criticalLens.name",
    stars: 3,
    category: "special",
    text: t("attachment.criticalLens.text"), textKey: "attachment.criticalLens.text",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.12;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 1.8);
    },
  },
  {
    key: "frostPowder",
    name: t("attachment.frostPowder.name"), nameKey: "attachment.frostPowder.name",
    stars: 3,
    category: "special",
    text: t("attachment.frostPowder.text"), textKey: "attachment.frostPowder.text",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.22;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.62);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 1.6);
    },
  },
  {
    key: "lifeDrain",
    name: t("attachment.lifeDrain.name"), nameKey: "attachment.lifeDrain.name",
    stars: 3,
    category: "special",
    text: t("attachment.lifeDrain.text"), textKey: "attachment.lifeDrain.text",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 1;
    },
  },
  {
    key: "barrierEmitter",
    name: t("attachment.barrierEmitter.name"), nameKey: "attachment.barrierEmitter.name",
    stars: 3,
    category: "support",
    barrierGain: 1,
    text: t("attachment.barrierEmitter.text"), textKey: "attachment.barrierEmitter.text",
    attach: () => {
      game.player.barrierMax += 1;
    },
  },
  {
    key: "piercer",
    name: t("attachment.piercer.name"), nameKey: "attachment.piercer.name",
    stars: 3,
    category: "special",
    text: t("attachment.piercer.text"), textKey: "attachment.piercer.text",
    attach: (weapon) => {
      addWeaponPierce(weapon, 1);
    },
  },
  {
    key: "knockbackBooster",
    name: t("attachment.knockbackBooster.name"), nameKey: "attachment.knockbackBooster.name",
    stars: 3,
    category: "special",
    text: t("attachment.knockbackBooster.text"), textKey: "attachment.knockbackBooster.text",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 8;
    },
  },
  {
    key: "overdriveCore",
    name: t("attachment.overdriveCore.name"), nameKey: "attachment.overdriveCore.name",
    stars: 3,
    category: "special",
    text: t("attachment.overdriveCore.text"), textKey: "attachment.overdriveCore.text",
    attach: (weapon) => {
      boostWeaponImpactPercent(weapon, 0.45);
      addWeaponBasePercent(weapon, "fireRate", 0.08, { min: 0.15 });
    },
  },
  {
    key: "multiForge",
    name: t("attachment.multiForge.name"), nameKey: "attachment.multiForge.name",
    stars: 4,
    category: "special",
    text: t("attachment.multiForge.text"), textKey: "attachment.multiForge.text",
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
    name: t("attachment.deepPiercer.name"), nameKey: "attachment.deepPiercer.name",
    stars: 4,
    category: "special",
    text: t("attachment.deepPiercer.text"), textKey: "attachment.deepPiercer.text",
    attach: (weapon) => {
      addWeaponPierce(weapon, 2);
    },
  },
  {
    key: "cryoEngine",
    name: t("attachment.cryoEngine.name"), nameKey: "attachment.cryoEngine.name",
    stars: 4,
    category: "special",
    text: t("attachment.cryoEngine.text"), textKey: "attachment.cryoEngine.text",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.35;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.55);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 2.2);
    },
  },
  {
    key: "lifeDrain2",
    name: t("attachment.lifeDrain2.name"), nameKey: "attachment.lifeDrain2.name",
    stars: 4,
    category: "special",
    text: t("attachment.lifeDrain2.text"), textKey: "attachment.lifeDrain2.text",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 2;
    },
  },
  {
    key: "safetyField",
    name: t("attachment.safetyField.name"), nameKey: "attachment.safetyField.name",
    stars: 4,
    category: "support",
    barrierGain: 2,
    text: t("attachment.safetyField.text"), textKey: "attachment.safetyField.text",
    attach: () => {
      game.player.barrierMax += 2;
      game.player.pickup += 24;
    },
  },
  {
    key: "ricochetCore2",
    name: t("attachment.ricochetCore2.name"), nameKey: "attachment.ricochetCore2.name",
    stars: 4,
    category: "special",
    compatibleWeapons: ["stone"],
    text: t("attachment.ricochetCore2.text"), textKey: "attachment.ricochetCore2.text",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 2;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 260);
    },
  },
  {
    key: "ricochetCore3",
    name: t("attachment.ricochetCore3.name"), nameKey: "attachment.ricochetCore3.name",
    stars: 5,
    category: "special",
    compatibleWeapons: ["stone"],
    text: t("attachment.ricochetCore3.text"), textKey: "attachment.ricochetCore3.text",
    attach: (weapon) => {
      weapon.ricochetCount = (weapon.ricochetCount || 0) + 3;
      weapon.ricochetRange = Math.max(weapon.ricochetRange || 0, 300);
    },
  },
  {
    key: "criticalLens2",
    name: t("attachment.criticalLens2.name"), nameKey: "attachment.criticalLens2.name",
    stars: 4,
    category: "special",
    text: t("attachment.criticalLens2.text"), textKey: "attachment.criticalLens2.text",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.25;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 2);
    },
  },
  {
    key: "criticalLens3",
    name: t("attachment.criticalLens3.name"), nameKey: "attachment.criticalLens3.name",
    stars: 5,
    category: "special",
    text: t("attachment.criticalLens3.text"), textKey: "attachment.criticalLens3.text",
    attach: (weapon) => {
      weapon.critChance = (weapon.critChance || 0) + 0.4;
      weapon.critMultiplier = Math.max(weapon.critMultiplier || 1.75, 2.25);
    },
  },
  {
    key: "frostPowder3",
    name: t("attachment.frostPowder3.name"), nameKey: "attachment.frostPowder3.name",
    stars: 5,
    category: "special",
    text: t("attachment.frostPowder3.text"), textKey: "attachment.frostPowder3.text",
    attach: (weapon) => {
      weapon.freezeChance = (weapon.freezeChance || 0) + 0.5;
      weapon.freezeSlow = Math.min(weapon.freezeSlow || 1, 0.45);
      weapon.freezeDuration = Math.max(weapon.freezeDuration || 0, 2.8);
    },
  },
  {
    key: "lifeDrain3",
    name: t("attachment.lifeDrain3.name"), nameKey: "attachment.lifeDrain3.name",
    stars: 5,
    category: "special",
    text: t("attachment.lifeDrain3.text"), textKey: "attachment.lifeDrain3.text",
    attach: (weapon) => {
      weapon.lifeStealPerKill = (weapon.lifeStealPerKill || 0) + 5;
    },
  },
  {
    key: "barrierEmitter3",
    name: t("attachment.barrierEmitter3.name"), nameKey: "attachment.barrierEmitter3.name",
    stars: 5,
    category: "support",
    barrierGain: 3,
    text: t("attachment.barrierEmitter3.text"), textKey: "attachment.barrierEmitter3.text",
    attach: () => {
      game.player.barrierMax += 3;
    },
  },
  {
    key: "piercer3",
    name: t("attachment.piercer3.name"), nameKey: "attachment.piercer3.name",
    stars: 5,
    category: "special",
    text: t("attachment.piercer3.text"), textKey: "attachment.piercer3.text",
    attach: (weapon) => {
      addWeaponPierce(weapon, 3);
    },
  },
  {
    key: "knockbackBooster2",
    name: t("attachment.knockbackBooster2.name"), nameKey: "attachment.knockbackBooster2.name",
    stars: 4,
    category: "special",
    text: t("attachment.knockbackBooster2.text"), textKey: "attachment.knockbackBooster2.text",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 14;
    },
  },
  {
    key: "knockbackBooster3",
    name: t("attachment.knockbackBooster3.name"), nameKey: "attachment.knockbackBooster3.name",
    stars: 5,
    category: "special",
    text: t("attachment.knockbackBooster3.text"), textKey: "attachment.knockbackBooster3.text",
    attach: (weapon) => {
      weapon.knockback = (weapon.knockback || 0) + 22;
    },
  },
  {
    key: "multiForge3",
    name: t("attachment.multiForge3.name"), nameKey: "attachment.multiForge3.name",
    stars: 5,
    category: "special",
    text: t("attachment.multiForge3.text"), textKey: "attachment.multiForge3.text",
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
    name: t("attachment.safetyField3.name"), nameKey: "attachment.safetyField3.name",
    stars: 5,
    category: "support",
    barrierGain: 3,
    text: t("attachment.safetyField3.text"), textKey: "attachment.safetyField3.text",
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
