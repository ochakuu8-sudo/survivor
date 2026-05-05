import './chest-indicator.css';

const chestTargets = new Set();
const uniformNames = new WeakMap();
const camera = { x: 0, y: 0 };
const resolution = { width: window.innerWidth, height: window.innerHeight };

const indicator = document.createElement('div');
indicator.className = 'chest-indicator hidden';
indicator.innerHTML = '<span class="chest-indicator-arrow">➤</span><span class="chest-indicator-label">CHEST</span>';
document.body.appendChild(indicator);

const arrow = indicator.querySelector('.chest-indicator-arrow');

function isChestLike(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && value.r === 18
    && Object.keys(value).length === 3
  );
}

const originalArrayPush = Array.prototype.push;
Array.prototype.push = function patchedPush(...items) {
  for (const item of items) {
    if (isChestLike(item)) {
      item.__chestIndicatorTarget = true;
      chestTargets.add(item);
    }
  }
  return originalArrayPush.apply(this, items);
};

const originalArraySplice = Array.prototype.splice;
Array.prototype.splice = function patchedSplice(start, deleteCount, ...items) {
  const removed = originalArraySplice.call(this, start, deleteCount, ...items);
  for (const item of removed) {
    if (item?.__chestIndicatorTarget) chestTargets.delete(item);
  }
  for (const item of items) {
    if (isChestLike(item)) {
      item.__chestIndicatorTarget = true;
      chestTargets.add(item);
    }
  }
  return removed;
};

const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
WebGLRenderingContext.prototype.getUniformLocation = function patchedGetUniformLocation(program, name) {
  const location = originalGetUniformLocation.call(this, program, name);
  if (location) uniformNames.set(location, name);
  return location;
};

const originalUniform2f = WebGLRenderingContext.prototype.uniform2f;
WebGLRenderingContext.prototype.uniform2f = function patchedUniform2f(location, x, y) {
  const name = uniformNames.get(location);
  if (name === 'u_camera') {
    camera.x = x;
    camera.y = y;
  } else if (name === 'u_resolution') {
    resolution.width = x;
    resolution.height = y;
  }
  return originalUniform2f.call(this, location, x, y);
};

function getNearestChest() {
  let nearest = null;
  let nearestDistance = Infinity;
  const playerX = camera.x + resolution.width / 2;
  const playerY = camera.y + resolution.height / 2;

  for (const chest of chestTargets) {
    const dx = chest.x - playerX;
    const dy = chest.y - playerY;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = chest;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function updateIndicator() {
  const chest = getNearestChest();
  if (!chest) {
    indicator.classList.add('hidden');
    requestAnimationFrame(updateIndicator);
    return;
  }

  const screenX = chest.x - camera.x;
  const screenY = chest.y - camera.y;
  const visibleMargin = 34;
  const isVisible = screenX >= -visibleMargin
    && screenX <= resolution.width + visibleMargin
    && screenY >= -visibleMargin
    && screenY <= resolution.height + visibleMargin;

  if (isVisible) {
    indicator.classList.add('hidden');
    requestAnimationFrame(updateIndicator);
    return;
  }

  const centerX = resolution.width / 2;
  const centerY = resolution.height / 2;
  const dx = screenX - centerX;
  const dy = screenY - centerY;
  const angle = Math.atan2(dy, dx);

  const edgePadding = 42;
  const radiusX = Math.max(1, centerX - edgePadding);
  const radiusY = Math.max(1, centerY - edgePadding);
  const scale = 1 / Math.max(Math.abs(Math.cos(angle)) / radiusX, Math.abs(Math.sin(angle)) / radiusY);
  const x = centerX + Math.cos(angle) * scale;
  const y = centerY + Math.sin(angle) * scale;

  indicator.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
  arrow.style.transform = `rotate(${angle}rad)`;
  indicator.classList.remove('hidden');

  requestAnimationFrame(updateIndicator);
}

requestAnimationFrame(updateIndicator);
