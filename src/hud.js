import { RUN_DURATION_SECONDS } from "./constants.js";
import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { getActiveWeapon, weaponStatusLabel } from "./weapons.js";

export function updateHud() {
  hud.wave.textContent = "Run";
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold || 0);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold || 0);
  hud.kills.textContent = String(game.totalKills || 0);
  renderHpGauge();
  renderWeaponSwitch();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "arena");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "weaponSelect") return "武器選択";
  if (game.mode === "upgradeTree") return "スキルツリー";
  if (game.mode === "treasure") return "宝箱報酬";
  if (game.mode === "modding") return "武器改造";
  if (game.mode === "pause") return "一時停止";
  if (game.mode === "result") return game.runResult?.result === "clear" ? "クリア" : "ラン終了";
  if (game.mode === "over") return "ラン終了";
  if (game.mode === "arena") {
    const left = Math.max(0, Math.ceil(RUN_DURATION_SECONDS - (game.floorElapsed || 0)));
    const m = Math.floor(left / 60);
    const sec = String(left % 60).padStart(2, "0");
    const weapon = getActiveWeapon();
    const level = weapon ? ` Lv${weapon.level || 1}` : "";
    return `${m}:${sec} / ${weapon?.name || "武器"}${level}`;
  }
  return "準備中";
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

function renderWeaponSwitch() {
  if (!hud.weaponSwitch) return;
  const weapon = getActiveWeapon();
  const isArena = game.mode === "arena";
  hud.weaponSwitch.classList.toggle("hidden", !isArena || !weapon);
  hud.weaponSwitch.disabled = true;
  hud.weaponSwitch.title = "1ラン1武器制";
  hud.weaponSwitch.setAttribute("aria-label", "現在武器");
  hud.weaponSwitch.textContent = weapon ? `${weapon.name} / ${weaponStatusLabel(weapon)}` : "武器";
}


export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isArena = game.mode === "arena";
  hud.touchControls.classList.toggle("disabled", !isArena);
  if (!isArena && pointer.down) resetVirtualMove();
}
