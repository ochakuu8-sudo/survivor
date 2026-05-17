import { ACTIVE_ATTACHMENTS, canAttachToWeapon } from "./attachments.js";
import { tagsForAttachment } from "./data/attachmentTags.js";

export const STAR_WEIGHTS_BY_WEAPON_LEVEL = {
  2: { 1: 80, 2: 18, 3: 2, 4: 0, 5: 0 },
  3: { 1: 70, 2: 24, 3: 6, 4: 0, 5: 0 },
  4: { 1: 58, 2: 30, 3: 10, 4: 2, 5: 0 },
  5: { 1: 48, 2: 32, 3: 16, 4: 4, 5: 0 },
  6: { 1: 36, 2: 34, 3: 22, 4: 7, 5: 1 },
  7: { 1: 25, 2: 32, 3: 28, 4: 12, 5: 3 },
  8: { 1: 15, 2: 28, 3: 34, 4: 18, 5: 5 },
  9: { 1: 8, 2: 22, 3: 38, 4: 24, 5: 8 },
};

export const WEAPON_ATTACHMENT_BIAS = {
  stone: { preferred: ["projectile", "ricochet", "pierce", "crit", "explosion"] },
  flamethrower: { preferred: ["area", "fireRate", "duration", "freeze"] },
  morningStar: { preferred: ["orbit", "area", "knockback", "defense"] },
};

export function normalizeRolledAttachment(definition) {
  return {
    key: definition.key,
    name: definition.name,
    stars: definition.stars || 1,
    category: definition.category || "stat",
    locked: false,
    tags: tagsForAttachment(definition),
  };
}

export function rollAttachmentForWeapon(weapon, options = {}) {
  if (!weapon) return null;
  const weaponLevel = Math.min(9, Math.max(2, options.weaponLevel || weapon.level || 2));
  const pool = ACTIVE_ATTACHMENTS
    .filter((attachment) => canAttachToWeapon(attachment, weapon))
    .filter((attachment) => attachment.key !== options.excludeKey)
    .filter((attachment) => starWeight(attachment, weaponLevel) > 0);
  const picked = weightedPick(pool, (attachment) => (
    starWeight(attachment, weaponLevel) * weaponBiasWeight(attachment, weapon) * duplicateWeight(attachment, weapon)
  ));
  return picked ? normalizeRolledAttachment(picked) : null;
}

function starWeight(attachment, weaponLevel) {
  const weights = STAR_WEIGHTS_BY_WEAPON_LEVEL[weaponLevel] || STAR_WEIGHTS_BY_WEAPON_LEVEL[2];
  return weights[attachment.stars || 1] || 0;
}

function weaponBiasWeight(attachment, weapon) {
  const bias = WEAPON_ATTACHMENT_BIAS[weapon.baseName || weapon.name];
  if (!bias?.preferred?.length) return 1;
  const tags = tagsForAttachment(attachment);
  if (weapon.kind) tags.push(weapon.kind === "projectile" ? "projectile" : weapon.kind);
  return tags.some((tag) => bias.preferred.includes(tag)) ? 1.6 : 1;
}

function duplicateWeight(attachment, weapon) {
  const duplicateCount = (weapon.attachments || []).filter((owned) => owned?.key === attachment.key).length;
  return duplicateCount === 0 ? 1 : Math.max(0.08, 0.32 / duplicateCount);
}

function weightedPick(pool, weightFor) {
  const weighted = pool.map((item) => ({ item, weight: Math.max(0, weightFor(item) || 0) })).filter((entry) => entry.weight > 0);
  if (weighted.length === 0) return pool[0] || null;
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item || null;
}
