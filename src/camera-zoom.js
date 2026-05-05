// Camera zoom-out shim.
// Instead of only widening the shader projection, this widens the virtual
// viewport that the game sees. That makes tile generation / runtime atlas draw
// preparation cover the larger visible area too.

const ZOOM_OUT = 1.35;
const realViewport = {
  get width() {
    return window.visualViewport?.width || document.documentElement.clientWidth || screen.width;
  },
  get height() {
    return window.visualViewport?.height || document.documentElement.clientHeight || screen.height;
  },
};

window.__GAME_VIEW_ZOOM__ = ZOOM_OUT;

function defineScaledViewportProperty(name, getValue) {
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => Math.round(getValue() * ZOOM_OUT),
    });
  } catch {
    // Some browsers may not allow overriding viewport properties. In that case
    // the game simply keeps the normal camera distance instead of crashing.
  }
}

defineScaledViewportProperty('innerWidth', () => realViewport.width);
defineScaledViewportProperty('innerHeight', () => realViewport.height);

const style = document.createElement('style');
style.textContent = `
  #game {
    width: 100vw !important;
    height: 100vh !important;
  }
`;
document.head.appendChild(style);
