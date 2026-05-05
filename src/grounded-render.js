// Removes vertical hover/bob effects from actors so characters read as grounded.
// The main game keeps the same runtime atlas and game loop; this only neutralizes
// render-only sine offsets used for character float and supply bobbing.

const originalSin = Math.sin.bind(Math);
const TWO_PI = Math.PI * 2;

Math.sin = function groundedSin(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return originalSin(value);
  }

  // Gameplay spawn angles are generated in [0, 2π], so keep those intact.
  // Render bob inputs quickly exceed 2π; neutralize them without a stack check.
  if (value > TWO_PI || value < -TWO_PI) {
    return 0;
  }

  // New enemies can have small initial wobble values. Only suppress those when
  // they are used from render(), not during gameplay math such as spawning.
  const stack = new Error().stack || '';
  if (stack.includes('render')) {
    return 0;
  }

  return originalSin(value);
};
