import { setAtlas, setRenderer, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { buildAtlas } from "./sprites.js";
import { SpriteRenderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { frame, pauseGame, prepareCanvas, resetRun, resize, resumeGame, startNextWave } from "./game.js";
import { openDebugPanel, setupDebug } from "./debug.js";

hud.restart.addEventListener("click", resetRun);

hud.pauseBtn.addEventListener("click", pauseGame);
hud.resumeBtn.addEventListener("click", resumeGame);
hud.pauseDebugBtn.addEventListener("click", () => {
  hud.pauseMenu.classList.add("hidden");
  openDebugPanel();
});
hud.pauseRestartBtn.addEventListener("click", resetRun);
if (hud.shopContinue) hud.shopContinue.addEventListener("click", startNextWave);

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
