// Replaces the three zombie sprite canvases with more detailed, asymmetrical outbreak-style pixel art
// while keeping the existing runtime atlas pipeline intact.

const SPRITE_SIZE = 16;
const TARGETS = new Map([
  [2, drawZombieWalker],
  [3, drawZombieRunner],
  [4, drawCrawler],
]);

let spriteCanvasIndex = 0;
const originalCreateElement = Document.prototype.createElement;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

Document.prototype.createElement = function patchedCreateElement(tagName, options) {
  const element = originalCreateElement.call(this, tagName, options);

  if (String(tagName).toLowerCase() === 'canvas') {
    element.__runtimeSpriteDetailTagged = false;
  }

  return element;
};

HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, options) {
  const context = originalGetContext.call(this, type, options);

  if (
    type === '2d'
    && this.width === SPRITE_SIZE
    && this.height === SPRITE_SIZE
    && !this.__runtimeSpriteDetailTagged
  ) {
    this.__runtimeSpriteDetailTagged = true;
    this.__runtimeSpriteIndex = spriteCanvasIndex;
    spriteCanvasIndex += 1;
  }

  return context;
};

CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(image, ...args) {
  const replacement = TARGETS.get(image?.__runtimeSpriteIndex);

  if (replacement && args.length >= 2) {
    const dx = Number(args[0]) || 0;
    const dy = Number(args[1]) || 0;
    this.save();
    this.clearRect(dx, dy, SPRITE_SIZE, SPRITE_SIZE);
    replacement(this, dx, dy);
    this.restore();
    return undefined;
  }

  return originalDrawImage.call(this, image, ...args);
};

function px(ctx, ox, oy, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + x, oy + y, w, h);
}

function drawZombieWalker(ctx, ox, oy) {
  // Heavy, slumped walker: broken jaw, exposed ribs, torn coat, one dragging arm.
  px(ctx, ox, oy, 6, 1, 4, 1, '#33402f');
  px(ctx, ox, oy, 5, 2, 6, 2, '#6f805f');
  px(ctx, ox, oy, 4, 3, 7, 2, '#8b9c78');
  px(ctx, ox, oy, 8, 3, 3, 1, '#53614b');
  px(ctx, ox, oy, 5, 5, 5, 1, '#67745a');
  px(ctx, ox, oy, 6, 4, 1, 1, '#1b120f');
  px(ctx, ox, oy, 9, 4, 1, 1, '#b3121d');
  px(ctx, ox, oy, 7, 6, 3, 1, '#2b1715');
  px(ctx, ox, oy, 10, 5, 1, 2, '#5a120f');

  px(ctx, ox, oy, 4, 6, 8, 2, '#383d3e');
  px(ctx, ox, oy, 3, 8, 10, 3, '#2e3335');
  px(ctx, ox, oy, 5, 7, 2, 1, '#5e6d55');
  px(ctx, ox, oy, 8, 8, 1, 3, '#9b8a67');
  px(ctx, ox, oy, 10, 8, 1, 2, '#9b8a67');
  px(ctx, ox, oy, 7, 9, 4, 1, '#3d1717');
  px(ctx, ox, oy, 4, 10, 2, 2, '#572024');

  px(ctx, ox, oy, 2, 7, 2, 4, '#718460');
  px(ctx, ox, oy, 1, 10, 2, 2, '#566549');
  px(ctx, ox, oy, 12, 8, 2, 2, '#7c8e69');
  px(ctx, ox, oy, 13, 10, 1, 3, '#46513e');

  px(ctx, ox, oy, 5, 11, 2, 4, '#2d2424');
  px(ctx, ox, oy, 8, 11, 2, 3, '#221c1d');
  px(ctx, ox, oy, 9, 14, 3, 1, '#151617');
  px(ctx, ox, oy, 4, 14, 2, 1, '#151617');
  px(ctx, ox, oy, 11, 11, 1, 1, '#7f1018');
}

function drawZombieRunner(ctx, ox, oy) {
  // Lean, faster infected: forward head, torn red shirt, long limbs, glowing eye.
  px(ctx, ox, oy, 7, 1, 4, 1, '#34402e');
  px(ctx, ox, oy, 6, 2, 5, 2, '#708262');
  px(ctx, ox, oy, 5, 3, 5, 2, '#8fa47a');
  px(ctx, ox, oy, 9, 3, 3, 1, '#52604a');
  px(ctx, ox, oy, 7, 4, 1, 1, '#d11d25');
  px(ctx, ox, oy, 10, 4, 1, 1, '#261411');
  px(ctx, ox, oy, 8, 5, 3, 1, '#3d1715');

  px(ctx, ox, oy, 4, 6, 8, 2, '#6f2028');
  px(ctx, ox, oy, 3, 8, 9, 2, '#561a22');
  px(ctx, ox, oy, 6, 7, 2, 1, '#a34b3e');
  px(ctx, ox, oy, 9, 8, 2, 1, '#2a2225');
  px(ctx, ox, oy, 11, 9, 2, 1, '#7c8f68');

  px(ctx, ox, oy, 2, 6, 3, 1, '#7b8f66');
  px(ctx, ox, oy, 1, 7, 2, 2, '#5d6b50');
  px(ctx, ox, oy, 12, 7, 2, 3, '#7f946d');
  px(ctx, ox, oy, 13, 10, 2, 1, '#556447');

  px(ctx, ox, oy, 5, 10, 2, 5, '#202328');
  px(ctx, ox, oy, 8, 10, 2, 3, '#2b2e34');
  px(ctx, ox, oy, 10, 12, 2, 3, '#1c1d22');
  px(ctx, ox, oy, 4, 14, 3, 1, '#111317');
  px(ctx, ox, oy, 10, 14, 3, 1, '#111317');
  px(ctx, ox, oy, 5, 11, 1, 2, '#6b1118');
}

function drawCrawler(ctx, ox, oy) {
  // Low crawling infected: dragged torso, exposed spine, broken arms.
  px(ctx, ox, oy, 4, 6, 5, 2, '#718560');
  px(ctx, ox, oy, 3, 7, 6, 2, '#8ca276');
  px(ctx, ox, oy, 5, 7, 1, 1, '#a9151d');
  px(ctx, ox, oy, 8, 7, 1, 1, '#24120f');
  px(ctx, ox, oy, 6, 8, 3, 1, '#3e1715');

  px(ctx, ox, oy, 6, 9, 8, 2, '#303537');
  px(ctx, ox, oy, 4, 10, 10, 2, '#252a2d');
  px(ctx, ox, oy, 7, 10, 1, 2, '#9b8a67');
  px(ctx, ox, oy, 9, 10, 1, 2, '#9b8a67');
  px(ctx, ox, oy, 11, 11, 2, 1, '#5e1719');

  px(ctx, ox, oy, 2, 9, 3, 1, '#6d805f');
  px(ctx, ox, oy, 1, 10, 2, 2, '#536348');
  px(ctx, ox, oy, 12, 8, 2, 1, '#7d9169');
  px(ctx, ox, oy, 14, 8, 1, 3, '#4e5e45');

  px(ctx, ox, oy, 5, 12, 2, 2, '#291f20');
  px(ctx, ox, oy, 8, 12, 3, 1, '#181a1d');
  px(ctx, ox, oy, 11, 13, 3, 1, '#151618');
  px(ctx, ox, oy, 3, 12, 2, 1, '#7f1018');
  px(ctx, ox, oy, 13, 11, 1, 1, '#81131a');
}
