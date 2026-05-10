import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import { resetVirtualMove } from "./input.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = objectiveText();
  hud.kills.textContent = String(game.waveKills);
  hud.hp.style.width = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  if (hud.hpText) hud.hpText.textContent = `${Math.ceil(game.player.hp)}/${Math.ceil(game.player.maxHp)}`;
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  if (hud.pauseBtn) hud.pauseBtn.classList.toggle("hidden", game.mode !== "fight");
  syncTouchControls();
}

function objectiveText() {
  if (game.mode === "starterPick") return "武器選択";
  if (game.mode === "shop") return "装備整理";
  if (game.mode === "pause") return "一時停止";
  if (game.mode === "over") return "探索終了";
  return "出口を探せ";
}

export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}
