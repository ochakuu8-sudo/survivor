import { game, setAtlas, setRenderer, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { buildAtlas } from "./sprites.js";
import { SpriteRenderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { frame, pauseGame, prepareCanvas, resetRun, resize, resumeGame } from "./game.js";
import { openDebugPanel, setupDebug } from "./debug.js";
import { applyPurchasedSkillTreeToActiveWeapon, continueFromSkillTree, enterDebugSkillTree, enterUpgradeTree, renderSkillTree } from "./skillTree.js";
import { claimTreasureReward, rerollTreasureReward } from "./treasure.js";

hud.restart.addEventListener("click", enterUpgradeTree);

hud.pauseBtn.addEventListener("click", pauseGame);
hud.resumeBtn.addEventListener("click", resumeGame);
if (hud.pauseSkillDebugBtn) hud.pauseSkillDebugBtn.addEventListener("click", enterDebugSkillTree);
if (import.meta.env.DEV && hud.pauseDebugBtn) {
  hud.pauseDebugBtn.classList.remove("hidden");
  hud.pauseDebugBtn.addEventListener("click", () => {
    hud.pauseMenu.classList.add("hidden");
    openDebugPanel();
  });
} else if (hud.pauseDebugBtn) {
  hud.pauseDebugBtn.classList.add("hidden");
}
hud.pauseRestartBtn.addEventListener("click", resetRun);
if (hud.skillTreeContinue) hud.skillTreeContinue.addEventListener("click", continueFromSkillTree);
window.addEventListener("skill-tree-continue", () => resetRun());
window.addEventListener("starter-weapon-picked", () => applyPurchasedSkillTreeToActiveWeapon());
if (hud.treasureReroll) hud.treasureReroll.addEventListener("click", rerollTreasureReward);
if (hud.treasureTake) hud.treasureTake.addEventListener("click", claimTreasureReward);
if (hud.weaponSwitch) {
  hud.weaponSwitch.addEventListener("click", (event) => {
    event.preventDefault();
    renderSkillTree();
  });
}

const atlas = buildAtlas();
setAtlas(atlas);
const initialDpr = prepareCanvas();
const renderer = new SpriteRenderer(canvas, atlas);
setRenderer(renderer);
renderer.resize(canvas.width, canvas.height, initialDpr);
bindInput();
if (import.meta.env.DEV) setupDebug();
resetRun();
resize();
timing.lastFrame = performance.now();
requestAnimationFrame(frame);
