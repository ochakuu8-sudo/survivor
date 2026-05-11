import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { getActiveWeapon, weaponStatusLabel } from "./weapons.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold);
  hud.kills.textContent = String(game.waveKills);
  renderHpText();
  renderWeaponSwitch();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "arena");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "weaponSelect") return "武器選択";
  if (game.mode === "upgradeTree") return "Wave Clear / 改造";
  if (game.mode === "treasure") return "宝箱報酬";
  if (game.mode === "pause") return "一時停止";
  if (game.mode === "over") return "ラン終了";
  if (game.mode === "arena") return `${Math.ceil(game.waveTimeLeft || 0)}秒 / ${getActiveWeapon()?.name || "武器"}`;
  return "準備中";
}

function renderHpText() {
  if (!hud.hpText) return;
  const hp = Math.max(0, Math.ceil(game.player.hp));
  const maxHp = Math.max(1, Math.ceil(game.player.maxHp));
  const barrier = Math.max(0, Math.ceil(game.player.barrier || 0));
  hud.hpText.textContent = barrier > 0 ? `${hp}/${maxHp} ◆${barrier}` : `${hp}/${maxHp}`;
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
