import { game, keys, pointer } from "./state.js";
import { canvas, hud } from "./dom.js";
import { clamp, normalize } from "./utils/math.js";
import { startNextWave } from "./game.js";
import { isShopTabStorage, setShopTab } from "./shop.js";
import { cycleActiveWeapon } from "./weapons.js";

export function bindInput() {
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" && game.mode === "shop") {
      if (isShopTabStorage()) startNextWave();
      else setShopTab("storage");
    }
    if ((event.code === "KeyQ" || event.code === "Tab") && game.mode === "fight") {
      event.preventDefault();
      cycleActiveWeapon();
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));

  canvas.addEventListener("pointerdown", (event) => {
    beginVirtualMove(event);
  });
  canvas.addEventListener("pointermove", updateVirtualMove);

  window.addEventListener("pointerup", endVirtualMove);
  window.addEventListener("pointercancel", endVirtualMove);
  window.addEventListener("blur", resetVirtualMove);
}

function beginVirtualMove(event) {
  if (game.mode !== "fight") return;
  if (event.pointerType === "mouse") return;
  event.preventDefault();

  pointer.down = true;
  pointer.activeId = event.pointerId;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  showVirtualStick(pointer.startX, pointer.startY);

  if (event.currentTarget?.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  updateVirtualMove(event);
}

function showVirtualStick(x, y) {
  if (!hud.moveStick) return;
  hud.moveStick.style.left = `${x}px`;
  hud.moveStick.style.top = `${y}px`;
  hud.moveStick.classList.add("active");
}

function updateVirtualMove(event) {
  if (!pointer.down || event.pointerId !== pointer.activeId) return;
  event.preventDefault();

  pointer.x = event.clientX;
  pointer.y = event.clientY;

  const dx = pointer.x - pointer.startX;
  const dy = pointer.y - pointer.startY;
  const input = normalize(dx, dy);
  const stickSize = hud.moveStick ? hud.moveStick.getBoundingClientRect().width : 128;
  const radius = Math.max(34, stickSize * 0.34);
  const deadZone = radius * 0.18;
  const rawStrength = clamp((input.len - deadZone) / (radius - deadZone), 0, 1);

  pointer.strength = rawStrength;
  pointer.moveX = rawStrength > 0 ? input.x : 0;
  pointer.moveY = rawStrength > 0 ? input.y : 0;

  if (hud.moveThumb) {
    const distance = Math.min(input.len, radius);
    const thumbX = input.x * distance;
    const thumbY = input.y * distance;
    hud.moveThumb.style.transform = `translate(-50%, -50%) translate(${thumbX}px, ${thumbY}px)`;
  }
}

function endVirtualMove(event) {
  if (event && event.pointerId !== pointer.activeId) return;
  resetVirtualMove();
}

export function resetVirtualMove() {
  pointer.down = false;
  pointer.activeId = null;
  pointer.moveX = 0;
  pointer.moveY = 0;
  pointer.strength = 0;
  if (hud.moveStick) {
    hud.moveStick.classList.remove("active");
  }
  if (hud.moveThumb) {
    hud.moveThumb.style.transform = "translate(-50%, -50%)";
  }
}
