import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { resetVirtualMove } from "./input.js";
import { clampActiveWeaponIndex, weaponAmmoLabel } from "./weapons.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold);
  hud.kills.textContent = String(game.waveKills);
  renderHpText();
  renderWeaponSwitch();
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "fight");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "starterPick") return "武器選択";
  if (game.mode === "shop") return "装備整理";
  if (game.mode === "treasure") return "宝箱報酬";
  if (game.mode === "pause") return "一時停止";
  if (game.mode === "over") return "探索終了";
  return "出口を探せ";
}

function renderHpText() {
  if (!hud.hpText) return;
  const hp = Math.max(0, Math.ceil(game.player.hp));
  const maxHp = Math.max(1, Math.ceil(game.player.maxHp));
  const barrier = Math.max(0, Math.ceil(game.player.barrier || 0));
  hud.hpText.textContent = barrier > 0 ? `${hp}/${maxHp} ◆${barrier}` : `${hp}/${maxHp}`;
}

function renderWeaponSwitch() {
  if (!hud.weaponSwitch || !game.player?.gear) return;
  const gear = game.player.gear;
  const weapon = gear.weapons?.[clampActiveWeaponIndex(gear)];
  const isFighting = game.mode === "fight";
  hud.weaponSwitch.classList.toggle("hidden", !isFighting || !weapon);
  hud.weaponSwitch.disabled = !isFighting || !weapon || gear.weapons.length <= 1;
  hud.weaponSwitch.title = "クリック / Q / Tab で武器切替";
  hud.weaponSwitch.setAttribute("aria-label", "武器切替");
  if (!weapon) {
    hud.weaponSwitch.textContent = "武器";
    return;
  }
  const prefix = gear.weapons.length > 1 ? "切替" : "武器";
  hud.weaponSwitch.textContent = `${prefix}: ${weapon.name} / ${weaponAmmoLabel(weapon)}`;
}

export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}
