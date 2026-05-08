import { game, setAtlas, setRenderer, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { buildAtlas } from "./sprites.js";
import { SpriteRenderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { generateOffers, renderShop, rerollCost } from "./shop.js";
import { updateHud } from "./hud.js";
import { frame, pauseGame, prepareCanvas, resetRun, resize, resumeGame, startNextWave } from "./game.js";
import { openDebugPanel, setupDebug } from "./debug.js";

hud.reroll.addEventListener("click", () => {
  const cost = rerollCost();
  if (game.money < cost) return;
  game.money -= cost;
  game.rerolls += 1;
  generateOffers();
  renderShop();
  updateHud();
});

hud.nextWave.addEventListener("click", startNextWave);
hud.restart.addEventListener("click", resetRun);

hud.pauseBtn.addEventListener("click", pauseGame);
hud.resumeBtn.addEventListener("click", resumeGame);
hud.pauseDebugBtn.addEventListener("click", () => {
  hud.pauseMenu.classList.add("hidden");
  openDebugPanel();
});
hud.pauseRestartBtn.addEventListener("click", resetRun);

const atlas = buildAtlas();
setAtlas(atlas);
const initialDpr = prepareCanvas();
const renderer = new SpriteRenderer(canvas, atlas);
setRenderer(renderer);
renderer.resize(canvas.width, canvas.height, initialDpr);
bindInput();
setupDebug();
resetRun();
resize();
timing.lastFrame = performance.now();
requestAnimationFrame(frame);
