import './touch-stick.css';

const STICK_MAX_RADIUS = 48;
const DEAD_ZONE = 10;
const ACTIVE_KEYS = ['w', 'a', 's', 'd'];
const pressedKeys = new Set();

const state = {
  active: false,
  pointerId: null,
  originX: 0,
  originY: 0,
  moveX: 0,
  moveY: 0,
};

function isTouchPointer(event) {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

function emitKey(key, type) {
  window.dispatchEvent(new KeyboardEvent(type, {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
  }));
}

function setKey(key, isDown) {
  if (isDown && !pressedKeys.has(key)) {
    pressedKeys.add(key);
    emitKey(key, 'keydown');
    return;
  }

  if (!isDown && pressedKeys.has(key)) {
    pressedKeys.delete(key);
    emitKey(key, 'keyup');
  }
}

function releaseAllKeys() {
  for (const key of [...pressedKeys]) {
    setKey(key, false);
  }
}

function syncKeysFromStick() {
  setKey('w', state.moveY < -0.32);
  setKey('s', state.moveY > 0.32);
  setKey('a', state.moveX < -0.32);
  setKey('d', state.moveX > 0.32);
}

function createFloatingStick() {
  const stick = document.createElement('div');
  stick.className = 'touch-stick hidden';
  stick.setAttribute('aria-hidden', 'true');

  const base = document.createElement('div');
  base.className = 'touch-stick-base';

  const knob = document.createElement('div');
  knob.className = 'touch-stick-knob';

  base.appendChild(knob);
  stick.appendChild(base);
  document.body.appendChild(stick);

  return { stick, knob };
}

const floatingStick = createFloatingStick();

function showStick(event) {
  floatingStick.stick.classList.remove('hidden');
  floatingStick.stick.style.left = `${event.clientX}px`;
  floatingStick.stick.style.top = `${event.clientY}px`;
  floatingStick.knob.style.transform = 'translate(0px, 0px)';
}

function hideStick() {
  floatingStick.stick.classList.add('hidden');
  floatingStick.knob.style.transform = 'translate(0px, 0px)';
}

function beginStick(event) {
  if (!isTouchPointer(event)) return;
  if (state.active) return;
  if (event.target.closest('.hud') || event.target.closest('.atlas-preview')) return;

  event.preventDefault();
  state.active = true;
  state.pointerId = event.pointerId;
  state.originX = event.clientX;
  state.originY = event.clientY;
  state.moveX = 0;
  state.moveY = 0;

  showStick(event);
}

function updateStick(event) {
  if (!state.active || event.pointerId !== state.pointerId) return;

  event.preventDefault();
  const dx = event.clientX - state.originX;
  const dy = event.clientY - state.originY;
  const distance = Math.hypot(dx, dy);

  let knobX = dx;
  let knobY = dy;

  if (distance > STICK_MAX_RADIUS) {
    const scale = STICK_MAX_RADIUS / distance;
    knobX *= scale;
    knobY *= scale;
  }

  floatingStick.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;

  if (distance < DEAD_ZONE) {
    state.moveX = 0;
    state.moveY = 0;
  } else {
    state.moveX = knobX / STICK_MAX_RADIUS;
    state.moveY = knobY / STICK_MAX_RADIUS;
  }

  syncKeysFromStick();
}

function endStick(event) {
  if (!state.active || event.pointerId !== state.pointerId) return;

  event.preventDefault();
  state.active = false;
  state.pointerId = null;
  state.moveX = 0;
  state.moveY = 0;

  releaseAllKeys();
  hideStick();
}

window.addEventListener('pointerdown', beginStick, { passive: false });
window.addEventListener('pointermove', updateStick, { passive: false });
window.addEventListener('pointerup', endStick, { passive: false });
window.addEventListener('pointercancel', endStick, { passive: false });
window.addEventListener('blur', () => {
  state.active = false;
  state.pointerId = null;
  releaseAllKeys();
  hideStick();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.active = false;
    state.pointerId = null;
    releaseAllKeys();
    hideStick();
  }
});

for (const key of ACTIVE_KEYS) {
  window.addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() === key && pressedKeys.has(key)) {
      pressedKeys.delete(key);
    }
  });
}
