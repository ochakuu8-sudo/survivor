import { game } from "./state.js";
import { recomputeAllAttachments } from "./attachments.js";
import { tagsForAttachment } from "./data/attachmentTags.js";
import { createWeapon, getActiveWeapon } from "./weapons.js";
import { WEAPON_POOL } from "./shop.js";

const STONE_EVOLUTIONS = { rubber: "ゴムボール", meteor: "隕石核", master: "名人の一石" };

export function tryEvolveWeapon(weapon = getActiveWeapon()) {
  if (!weapon || weapon.evolved || (weapon.baseName || weapon.name) !== "石") return false;
  const scores = {
    rubber: countTags(weapon.attachments || [], ["ricochet", "split", "bounce"]),
    meteor: countTags(weapon.attachments || [], ["explosion", "area", "damage"]),
    master: countTags(weapon.attachments || [], ["pierce", "crit", "range"]),
  };
  const bestScore = Math.max(scores.rubber, scores.meteor, scores.master);
  if (bestScore <= 0) return false;
  const winner = ["rubber", "meteor", "master"].find((key) => scores[key] === bestScore) || "rubber";
  return evolveActiveWeaponTo(STONE_EVOLUTIONS[winner]);
}

function countTags(attachments, tags) {
  const wanted = new Set(tags);
  return attachments.reduce((sum, attachment) => sum + tagsForAttachment(attachment).filter((tag) => wanted.has(tag)).length, 0);
}

function evolveActiveWeaponTo(templateName) {
  const gear = game.player?.gear;
  const oldWeapon = getActiveWeapon();
  const template = WEAPON_POOL.find((candidate) => candidate.name === templateName);
  if (!gear || !oldWeapon || !template) return false;
  const evolved = createWeapon({ name: template.name, ...template.weapon });
  evolved.id = oldWeapon.id;
  evolved.level = oldWeapon.level;
  evolved.attachments = [...(oldWeapon.attachments || [])];
  evolved.evolved = true;
  gear.weapons[gear.activeWeaponIndex || 0] = evolved;
  game.selectedWeapon = evolved.baseName || evolved.name;
  recomputeAllAttachments();
  return true;
}
