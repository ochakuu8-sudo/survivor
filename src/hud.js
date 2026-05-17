import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { getActiveWeapon } from "./weapons.js";
import { countItemsByKey, ensureStoneMaterialInventory, formatStoneItemSummary, stoneEvolutionProgress } from "./stoneItems.js";
import { STONE_MATERIALS } from "./data/stoneItems.js";
import { ROOM_COMBAT, ROOM_START, ROOM_STAIRS, ROOM_TREASURE, ROOM_WORKBENCH, getDungeonRoomAtWorld } from "./dungeon.js";

export function updateHud() {
  hud.wave.textContent = "Run";
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold || 0);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold || 0);
  hud.kills.textContent = String(game.totalKills || 0);
  renderHpGauge();
  renderWeaponSwitch();
  renderPauseStoneItems();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "arena");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "weaponSelect") return "武器選択";
  if (game.mode === "upgradeTree") return "スキルツリー";
  if (game.mode === "treasure") return "宝箱報酬";
  if (game.mode === "modding") return "武器改造";
  if (game.mode === "workbench") return "作業台";
  if (game.mode === "pause") return "一時停止";
  if (game.mode === "result") return game.runResult?.result === "clear" ? "クリア" : "ラン終了";
  if (game.mode === "over") return "ラン終了";
  if (game.mode === "arena") {
    const elapsed = Math.max(0, Math.floor(game.floorElapsed || 0));
    const m = Math.floor(elapsed / 60);
    const sec = String(elapsed % 60).padStart(2, "0");
    const weapon = getActiveWeapon();
    const floor = game.wave || 1;
    return `B${floor}F ${currentRoomObjective()} / 滞在 ${m}:${sec} / ${weapon?.name || "武器"}`;
  }
  return "準備中";
}

function currentRoomObjective() {
  const room = getDungeonRoomAtWorld(game.dungeon, game.player?.x || 0, game.player?.y || 0);
  if (!room) return "通路";
  if (room.type === ROOM_COMBAT) {
    if (room.locked) return "戦闘部屋: 敵を全滅";
    return room.cleared ? "戦闘部屋: 宝箱回収" : "戦闘部屋";
  }
  if (room.type === ROOM_TREASURE) return "宝物庫: ゴールドで開放";
  if (room.type === ROOM_WORKBENCH) return "作業台部屋";
  if (room.type === ROOM_STAIRS) return "階段部屋";
  if (room.type === ROOM_START) return "開始部屋";
  return "探索";
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

function renderPauseStoneItems() {
  if (!hud.pauseStoneItems) return;
  const weapon = getActiveWeapon();
  const counts = countItemsByKey(weapon?.items || []);
  const progress = stoneEvolutionProgress(counts)
    .map((evolution) => `${evolution.name}: ${evolution.requirements.map((req) => `${req.name} ${Math.min(req.count, req.need)}/${req.need}`).join(" + ")}`)
    .join("<br>");
  const materials = ensureStoneMaterialInventory();
  const materialText = STONE_MATERIALS.map((item) => `${item.shortName || item.name}×${materials[item.key] || 0}`).join(" / ");
  hud.pauseStoneItems.innerHTML = `<strong>所持素材</strong><p>${materialText}</p><strong>所持アイテム</strong><p>${formatStoneItemSummary(weapon)}</p><strong>進化進捗</strong><p>${progress}</p>`;
}

function renderWeaponSwitch() {
  if (!hud.weaponSwitch) return;
  const gear = game.player?.gear;
  const weapon = getActiveWeapon();
  const isArena = game.mode === "arena";
  const canSwitch = isArena && !!weapon && (gear?.weapons?.length || 0) >= 2;
  hud.weaponSwitch.classList.toggle("hidden", !canSwitch);
  hud.weaponSwitch.disabled = !canSwitch;
  hud.weaponSwitch.title = "Q / Tab で武器切り替え";
  hud.weaponSwitch.setAttribute("aria-label", "武器切り替え");
  if (!weapon || !gear) {
    hud.weaponSwitch.textContent = "武器";
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
