import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import { resetVirtualMove } from "./input.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = formatTime(game.timeLeft);
  hud.kills.textContent = String(game.waveKills);
  hud.hp.style.width = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  if (hud.hpText) hud.hpText.textContent = `${Math.ceil(game.player.hp)}/${Math.ceil(game.player.maxHp)}`;
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "fight");
  syncTouchControls();
}

export function formatTime(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}
