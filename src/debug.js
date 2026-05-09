import { MAX_WEAPONS } from "./constants.js";
import { game } from "./state.js";
import { hud } from "./dom.js";
import { ACTIVE_ATTACHMENTS, addAttachmentToWeapon, recomputeAllAttachments, starsLabel } from "./attachments.js";
import { createWeapon, findWeapon } from "./weapons.js";
import { spawnEnemy } from "./enemies.js";
import { killEnemy } from "./combat.js";
import { WEAPON_POOL } from "./shop.js";
import { enterShop, startNextWave } from "./game.js";
import { updateHud } from "./hud.js";

export function setupDebug() {
  populateWeaponSelect();
  populateAttachmentSelect();

  window.addEventListener("keydown", (event) => {
    if (event.code === "Backquote" || event.key === "~") {
      event.preventDefault();
      togglePanel();
    }
  });

  hud.dbgClose.addEventListener("click", closeDebugPanel);
  hud.dbgWeaponEquip.addEventListener("click", debugEquipWeapon);
  hud.dbgAttApply.addEventListener("click", debugApplyAttachment);
  hud.dbgEnemySpawn.addEventListener("click", debugSpawnEnemy);
  hud.dbgHeal.addEventListener("click", () => {
    if (game.player) game.player.hp = game.player.maxHp;
    updateHud();
  });
  hud.dbgKillAll.addEventListener("click", () => {
    for (const enemy of game.enemies) killEnemy(enemy);
  });
  hud.dbgInvuln.addEventListener("click", () => {
    game.debugInvincible = !game.debugInvincible;
    hud.dbgInvuln.textContent = `無敵 ${game.debugInvincible ? "ON" : "OFF"}`;
  });
  hud.dbgShop.addEventListener("click", () => {
    if (!game.player?.gear?.weapons?.length) return;
    enterShop();
  });
  hud.dbgNextWave.addEventListener("click", () => {
    if (!game.player?.gear?.weapons?.length) return;
    startNextWave();
  });
}

export function openDebugPanel() {
  hud.debugPanel.classList.remove("hidden");
  refreshWeaponTargets();
}

export function closeDebugPanel() {
  hud.debugPanel.classList.add("hidden");
  if (game.mode === "pause") {
    hud.pauseMenu.classList.remove("hidden");
  }
}

function togglePanel() {
  if (hud.debugPanel.classList.contains("hidden")) openDebugPanel();
  else closeDebugPanel();
}

function populateWeaponSelect() {
  hud.dbgWeaponSel.replaceChildren();
  WEAPON_POOL.forEach((template, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = template.name;
    hud.dbgWeaponSel.append(opt);
  });
}

function populateAttachmentSelect() {
  hud.dbgAttSel.replaceChildren();
  const sorted = [...ACTIVE_ATTACHMENTS].sort((a, b) => (a.stars || 1) - (b.stars || 1));
  sorted.forEach((definition) => {
    const opt = document.createElement("option");
    opt.value = definition.key;
    const stars = starsLabel(definition.stars);
    const compatibility = definition.compatibleWeapons
      ? ` (${definition.compatibleWeapons.join("/")}専用)`
      : "";
    opt.textContent = `${stars} ${definition.name}${compatibility}`;
    hud.dbgAttSel.append(opt);
  });
}

function refreshWeaponTargets() {
  hud.dbgAttWeapon.replaceChildren();
  const weapons = game.player?.gear?.weapons || [];
  if (weapons.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(武器なし)";
    hud.dbgAttWeapon.append(opt);
    return;
  }
  weapons.forEach((weapon) => {
    const opt = document.createElement("option");
    opt.value = String(weapon.id);
    opt.textContent = `${weapon.name} (${weapon.attachments.length})`;
    hud.dbgAttWeapon.append(opt);
  });
}

function debugEquipWeapon() {
  const index = Number(hud.dbgWeaponSel.value);
  const template = WEAPON_POOL[index];
  if (!template || !game.player) return;
  const weapon = createWeapon({ name: template.name, ...template.weapon });
  if (game.player.gear.weapons.length < MAX_WEAPONS) {
    game.player.gear.weapons.push(weapon);
  } else {
    game.player.gear.weapons[game.player.gear.weapons.length - 1] = weapon;
  }
  if (game.mode === "starterPick") {
    game.mode = "fight";
    game.starterChoices = [];
    hud.starterPick.classList.add("hidden");
  }
  recomputeAllAttachments();
  refreshWeaponTargets();
  updateHud();
}

function debugApplyAttachment() {
  const key = hud.dbgAttSel.value;
  const weaponId = Number(hud.dbgAttWeapon.value);
  if (!key || !weaponId) return;
  const definition = ACTIVE_ATTACHMENTS.find((entry) => entry.key === key);
  const weapon = findWeapon(weaponId);
  if (!definition || !weapon) return;
  const ok = addAttachmentToWeapon(weapon, { definition });
  if (!ok && definition.compatibleWeapons && !definition.compatibleWeapons.includes(weapon.name)) {
    hud.dbgAttApply.textContent = "互換なし";
    setTimeout(() => { hud.dbgAttApply.textContent = "装着"; }, 900);
    return;
  }
  refreshWeaponTargets();
  updateHud();
}

function debugSpawnEnemy() {
  if (!game.player) return;
  spawnEnemy(hud.dbgEnemySel.value);
}
