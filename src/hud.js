import { t } from "./i18n.js";
import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { getActiveWeapon } from "./weapons.js";
import { countItemsByKey, ensureStoneMaterialInventory, formatStoneItemSummary, stoneEvolutionProgress, stoneItemIcon } from "./stoneItems.js";
import { STONE_MATERIALS } from "./data/stoneItems.js";
import { COMBAT_ROOM_ELITE, ROOM_COMBAT, ROOM_START, ROOM_STAIRS, ROOM_TREASURE, ROOM_WORKBENCH, getDungeonRoomAtWorld } from "./dungeon.js";

export function updateHud() {
  hud.wave.textContent = "Run";
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold || 0);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold || 0);
  hud.kills.textContent = String(game.totalKills || 0);
  renderHpGauge();
  renderWeaponSwitch();
  renderCraftTreeButton();
  renderPauseStoneItems();
  renderMaterialHud();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "arena");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "weaponSelect") return t("hud.objective.weaponSelect");
  if (game.mode === "upgradeTree") return t("debug.skillTree");
  if (game.mode === "treasure") return t("treasure.label");
  if (game.mode === "modding") return t("modding.label");
  if (game.mode === "workbench") return t("workbench.label");
  if (game.mode === "pause") return t("pause.label");
  if (game.mode === "result") return game.runResult?.result === "clear" ? t("result.clear") : t("gameOver.kicker");
  if (game.mode === "over") return t("gameOver.kicker");
  if (game.mode === "arena") {
    const elapsed = Math.max(0, Math.floor(game.floorElapsed || 0));
    const m = Math.floor(elapsed / 60);
    const sec = String(elapsed % 60).padStart(2, "0");
    const weapon = getActiveWeapon();
    const floor = game.wave || 1;
    return t("hud.objective.dungeon", { floor, objective: currentRoomObjective(), time: `${m}:${sec}`, weapon: weapon?.name || t("skill.weaponFallback") });
  }
  return t("hud.objective.preparing");
}

function currentRoomObjective() {
  const room = getDungeonRoomAtWorld(game.dungeon, game.player?.x || 0, game.player?.y || 0);
  if (!room) return t("hud.room.path");
  if (room.type === ROOM_COMBAT) {
    const label = room.combatKind === COMBAT_ROOM_ELITE ? t("hud.room.combat.elite") : t("hud.room.combat.normal");
    if (room.locked) return t("hud.room.combat.locked", { label });
    return room.cleared ? t("hud.room.combat.cleared", { label }) : t("hud.room.combat.ready", { label });
  }
  if (room.type === ROOM_TREASURE) return t("hud.room.treasure");
  if (room.type === ROOM_WORKBENCH) return t("hud.room.workbench");
  if (room.type === ROOM_STAIRS) return t("hud.room.stairs");
  if (room.type === ROOM_START) return t("hud.room.start");
  return t("hud.room.explore");
}

function renderHpGauge() {
  if (!hud.hpText || !game.player) return;
  const hp = Math.max(0, Math.ceil(game.player.hp));
  const maxHp = Math.max(1, Math.ceil(game.player.maxHp));
  const barrier = Math.max(0, Math.ceil(game.player.barrier || 0));
  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const barrierRatio = Math.max(0, Math.min(1, barrier / maxHp));

  hud.hpText.textContent = barrier > 0 ? `${hp}/${maxHp} ◆${barrier}` : `${hp}/${maxHp}`;
  if (hud.hpGaugeFill) hud.hpGaugeFill.style.width = `${Math.round(hpRatio * 1000) / 10}%`;
  if (hud.hpBarrierFill) {
    hud.hpBarrierFill.style.width = `${Math.round(barrierRatio * 1000) / 10}%`;
    hud.hpBarrierFill.classList.toggle("hidden", barrier <= 0);
  }
  if (hud.hpGauge) {
    hud.hpGauge.setAttribute("aria-valuemax", String(maxHp));
    hud.hpGauge.setAttribute("aria-valuenow", String(hp));
    hud.hpGauge.classList.toggle("hp-gauge-low", hpRatio <= 0.3);
    hud.hpGauge.classList.toggle("hp-gauge-critical", hpRatio <= 0.15);
    hud.hpGauge.classList.toggle("hp-gauge-barrier", barrier > 0);
  }
}


function renderMaterialHud() {
  if (!hud.materialHud) return;
  const isArena = game.mode === "arena";
  hud.materialHud.classList.toggle("hidden", !isArena);
  if (!isArena) return;
  const inventory = ensureStoneMaterialInventory();
  hud.materialHud.innerHTML = STONE_MATERIALS.map((item) => `<div class="material-hud-chip" title="${item.name}"><strong>${Math.max(0, Math.floor(inventory[item.key] || 0))}</strong><span aria-hidden="true">${stoneItemIcon(item)}</span></div>`).join("");
}

function renderPauseStoneItems() {
  if (!hud.pauseStoneItems) return;
  const weapon = getActiveWeapon();
  const progress = stoneEvolutionProgress(weapon)
    .map((evolution) => `${evolution.complete ? "✓ " : ""}${evolution.name}: ${evolution.requirements.map((req) => req.type === "equipped" ? `${req.name} ${req.equipped ? t("workbench.equipped") : t("workbench.requiresEquipped")}` : `${req.name} ${Math.min(req.count, req.need)}/${req.need}`).join(" + ")}`)
    .join("<br>");
  const materials = ensureStoneMaterialInventory();
  const materialText = STONE_MATERIALS.map((item) => `${stoneItemIcon(item)} ${item.shortName || item.name}×${materials[item.key] || 0}`).join(" / ");
  hud.pauseStoneItems.innerHTML = `<strong>${t("pause.materials")}</strong><p>${materialText}</p><strong>${t("pause.items")}</strong><p>${formatStoneItemSummary(weapon)}</p><strong>${t("pause.evolution")}</strong><p>${progress}</p>`;
}

function renderCraftTreeButton() {
  if (!hud.craftTreeBtn) return;
  const isArena = game.mode === "arena";
  hud.craftTreeBtn.classList.toggle("hidden", !isArena);
  hud.craftTreeBtn.disabled = !isArena;
  hud.craftTreeBtn.title = t("workbench.craftTreeButton");
  hud.craftTreeBtn.setAttribute("aria-label", t("workbench.craftTreeButton"));
}

function renderWeaponSwitch() {
  if (!hud.weaponSwitch) return;
  const gear = game.player?.gear;
  const weapon = getActiveWeapon();
  const isArena = game.mode === "arena";
  const canSwitch = isArena && !!weapon && (gear?.weapons?.length || 0) >= 2;
  hud.weaponSwitch.classList.toggle("hidden", !canSwitch);
  hud.weaponSwitch.disabled = !canSwitch;
  hud.weaponSwitch.title = t("weapon.switchTitle");
  hud.weaponSwitch.setAttribute("aria-label", t("weapon.switchTitle"));
  if (!weapon || !gear) {
    hud.weaponSwitch.textContent = t("weapon.switch");
    return;
  }
  const labels = (gear.weapons || []).map((item, index) => {
    const active = index === (gear.activeWeaponIndex || 0) ? "▶" : "";
    return `${active}${index === 0 ? "A" : "B"}:${item.name}(${item.attachments?.length || 0}/${item.unlockedSlots || 2})`;
  });
  hud.weaponSwitch.textContent = labels.join(" | ");
}


export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isArena = game.mode === "arena";
  hud.touchControls.classList.toggle("disabled", !isArena);
  if (!isArena && pointer.down) resetVirtualMove();
}
