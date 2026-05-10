import { game, setAtlas, setRenderer, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { buildAtlas } from "./sprites.js";
import { SpriteRenderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { frame, pauseGame, prepareCanvas, resetRun, resize, resumeGame, startNextWave } from "./game.js";
import { openDebugPanel, setupDebug } from "./debug.js";
import { isShopTabStorage, rerollShopOffers, setShopTab } from "./shop.js";
import { claimTreasureReward, rerollTreasureReward } from "./treasure.js";

hud.restart.addEventListener("click", resetRun);

hud.pauseBtn.addEventListener("click", pauseGame);
hud.resumeBtn.addEventListener("click", resumeGame);
hud.pauseDebugBtn.addEventListener("click", () => {
  hud.pauseMenu.classList.add("hidden");
  openDebugPanel();
});
hud.pauseRestartBtn.addEventListener("click", resetRun);
if (hud.shopReroll) hud.shopReroll.addEventListener("click", rerollShopOffers);
if (hud.shopTabShop) hud.shopTabShop.addEventListener("click", () => setShopTab("shop"));
if (hud.shopTabStorage) hud.shopTabStorage.addEventListener("click", () => setShopTab("storage"));
if (hud.shopContinue) {
  hud.shopContinue.addEventListener("click", () => {
    if (game.mode === "shop" && !isShopTabStorage()) {
      setShopTab("storage");
      return;
    }
    startNextWave();
  });
}
if (hud.treasureReroll) hud.treasureReroll.addEventListener("click", rerollTreasureReward);
if (hud.treasureTake) hud.treasureTake.addEventListener("click", claimTreasureReward);

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
