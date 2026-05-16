import { getActiveWeapon } from "./weapons.js";
import { checkStoneEvolution, countItemsByKey, isStoneWeapon, recomputeStoneItems } from "./stoneItems.js";

export function tryEvolveWeapon(weapon = getActiveWeapon()) {
  if (!weapon || !isStoneWeapon(weapon)) return false;
  const before = weapon.evolvedStoneKey || null;
  const counts = countItemsByKey(weapon.items || []);
  const evolved = checkStoneEvolution(weapon, counts);
  if (evolved || before !== (weapon.evolvedStoneKey || null)) {
    recomputeStoneItems(weapon);
    return true;
  }
  return false;
}
