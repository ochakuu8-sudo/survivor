import { game, pointer } from "./state.js";
import { hud } from "./dom.js";
import { clamp } from "./utils/math.js";
import { resetVirtualMove } from "./input.js";

export function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = objectiveText();
  if (hud.gold) hud.gold.textContent = String(game.gold);
  if (hud.shopGold) hud.shopGold.textContent = String(game.gold);
  hud.kills.textContent = String(game.waveKills);
  if (hud.hp) hud.hp.style.width = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  renderHearts();
  if (hud.hpText) hud.hpText.textContent = `${Math.ceil(game.player.hp)}/${Math.ceil(game.player.maxHp)}`;
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

function renderHearts() {
  if (!hud.hearts) return;
  const hp = Math.ceil(game.player.hp);
  const maxHp = Math.max(1, Math.ceil(game.player.maxHp));
  hud.hearts.replaceChildren();
  for (let i = 0; i < maxHp; i += 1) {
    const heart = document.createElement("span");
    heart.className = `heart ${i < hp ? "heart-full" : "heart-empty"}`;
    heart.textContent = "♥";
    hud.hearts.append(heart);
  }
  const barrier = Math.max(0, Math.ceil(game.player.barrier || 0));
  for (let i = 0; i < barrier; i += 1) {
    const shield = document.createElement("span");
    shield.className = "heart barrier-heart";
    shield.textContent = "◆";
    hud.hearts.append(shield);
  }
}

export function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}
