// Small compatibility guard for browsers that expose PointerEvent capture differently.
// The game itself is in main.js; this keeps pointer capture from crashing the loop.
globalThis.event ??= { pointerId: -1 };

const originalSetPointerCapture = Element.prototype.setPointerCapture;
Element.prototype.setPointerCapture = function safeSetPointerCapture(pointerId) {
  if (typeof originalSetPointerCapture !== 'function') return undefined;
  if (!Number.isFinite(pointerId) || pointerId < 0) return undefined;
  try {
    return originalSetPointerCapture.call(this, pointerId);
  } catch {
    return undefined;
  }
};
