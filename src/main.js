import { game, setAtlas, setRenderer, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { buildAtlas } from "./sprites.js";
import { SpriteRenderer } from "./renderer.js";
import { bindInput } from "./input.js";
import { frame, pauseGame, prepareCanvas, resetRun, resize, resumeGame } from "./game.js";
import { openDebugPanel, setupDebug } from "./debug.js";
import { continueFromSkillTree, enterDebugSkillTree } from "./skillTree.js";
import { claimPendingAttachment, rerollPendingAttachment } from "./modding.js";
import { claimTreasureReward, rerollTreasureReward } from "./treasure.js";
import { cycleActiveWeapon } from "./weapons.js";
import { updateHud } from "./hud.js";
import { closeWorkbench } from "./workbench.js";

hud.restart.addEventListener("click", resetRun);

hud.pauseBtn.addEventListener("click", pauseGame);
hud.resumeBtn.addEventListener("click", resumeGame);
if (import.meta.env.DEV && hud.pauseSkillDebugBtn) {
  hud.pauseSkillDebugBtn.addEventListener("click", enterDebugSkillTree);
} else if (hud.pauseSkillDebugBtn) {
  hud.pauseSkillDebugBtn.classList.add("hidden");
}
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
if (hud.moddingReroll) hud.moddingReroll.addEventListener("click", rerollPendingAttachment);
if (hud.moddingTake) hud.moddingTake.addEventListener("click", claimPendingAttachment);
if (hud.treasureReroll) hud.treasureReroll.addEventListener("click", rerollTreasureReward);
if (hud.treasureTake) hud.treasureTake.addEventListener("click", claimTreasureReward);
if (hud.workbenchClose) hud.workbenchClose.addEventListener("click", closeWorkbench);
if (hud.weaponSwitch) {
  hud.weaponSwitch.addEventListener("click", (event) => {
    event.preventDefault();
    if (game.mode !== "arena") return;
    cycleActiveWeapon();
    updateHud();
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
