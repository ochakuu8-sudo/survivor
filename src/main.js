const TAU = Math.PI * 2;
const TILE_SIZE = 96;
const WAVE_SECONDS = 45;
const COLLISION_CELL_SIZE = 128;
const BACKGROUND_CACHE_LIMIT = 4096;
const MOBILE_CAMERA_ZOOM = 0.55;
const TOUCH_TABLET_CAMERA_ZOOM = 0.82;

const canvas = document.querySelector("#game");
const hud = {
  wave: document.querySelector("#waveText"),
  time: document.querySelector("#timeText"),
  hp: document.querySelector("#hpFill"),
  cash: document.querySelector("#cashText"),
  kills: document.querySelector("#killText"),
  hitFlash: document.querySelector("#hitFlash"),
  shop: document.querySelector("#shop"),
  offers: document.querySelector("#offers"),
  shopCash: document.querySelector("#shopCash"),
  stats: document.querySelector("#stats"),
  reroll: document.querySelector("#rerollBtn"),
  nextWave: document.querySelector("#nextWaveBtn"),
  gameOver: document.querySelector("#gameOver"),
  result: document.querySelector("#resultText"),
  restart: document.querySelector("#restartBtn"),
  touchControls: document.querySelector("#touchControls"),
  moveStick: document.querySelector("#moveStick"),
  moveThumb: document.querySelector("#moveThumb"),
};

const keys = new Set();
const pointer = {
  down: false,
  activeId: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  moveX: 0,
  moveY: 0,
  strength: 0,
};

let renderer;
let atlas;
let enemyId = 1;
let lastFrame = performance.now();
const enemyCollisionGrid = new Map();
const backgroundTileCache = new Map();

const game = {
  mode: "fight",
  wave: 1,
  timeLeft: WAVE_SECONDS,
  elapsed: 0,
  money: 0,
  totalKills: 0,
  waveKills: 0,
  rerolls: 0,
  spawnClock: 0,
  shake: 0,
  damageFlash: 0,
  camera: { x: 0, y: 0 },
  player: null,
  enemies: [],
  bullets: [],
  pickups: [],
  particles: [],
  offers: [],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function hash2(x, y, salt = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAtlas() {
  const specs = [];
  const add = (name, width, height, draw) => specs.push({ name, width, height, draw });

  add("white", 4, 4, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  });

  add("shadow", 72, 36, (ctx, w, h) => {
    ctx.fillStyle = "rgba(17, 12, 43, 0.42)";
    ctx.fillRect(12, 14, w - 24, 10);
    ctx.fillStyle = "rgba(17, 12, 43, 0.32)";
    ctx.fillRect(4, 18, w - 8, 8);
    ctx.fillStyle = "rgba(17, 12, 43, 0.2)";
    ctx.fillRect(18, 8, w - 36, 4);
  });

  add("glowCyan", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "85, 246, 199"));
  add("glowRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 93, 150"));
  add("glowEnemyRed", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 42, 42"));
  add("glowAmber", 96, 96, (ctx, w, h) => drawPixelGlow(ctx, w, h, "255, 228, 107"));

  add("road", 96, 96, (ctx, w, h) => {
    const rng = makeRng(31);
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2f3e91";
    for (let y = 0; y < h; y += 24) ctx.fillRect(0, y + 20, w, 4);
    ctx.fillStyle = "#4e60c7";
    for (let i = 0; i < 34; i += 1) {
      ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 4, 4);
    }
    ctx.fillStyle = "#263376";
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, h - 4, w, 4);
  });

  add("lane", 96, 96, (ctx, w, h) => {
    const rng = makeRng(44);
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#4e60c7";
    for (let i = 0; i < 24; i += 1) ctx.fillRect(Math.floor(rng() * 12) * 8, Math.floor(rng() * 12) * 8, 4, 4);
    ctx.fillStyle = "#e8ce56";
    ctx.fillRect(w / 2 - 4, 8, 8, 24);
    ctx.fillRect(w / 2 - 4, 56, 8, 24);
    ctx.fillStyle = "#f6e9a6";
    ctx.fillRect(w / 2 - 4, 8, 8, 4);
    ctx.fillRect(w / 2 - 4, 56, 8, 4);
  });

  add("sidewalk", 96, 96, (ctx, w, h) => {
    ctx.fillStyle = "#6768cf";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#7d7ee2";
    for (let x = 0; x < w; x += 32) ctx.fillRect(x + 2, 0, 4, h);
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y + 2, w, 4);
    ctx.fillStyle = "#5657b8";
    ctx.fillRect(0, 0, w, 5);
    ctx.fillRect(0, h - 5, w, 5);
  });

  add("pavement", 96, 96, (ctx, w, h) => {
    const rng = makeRng(73);
    ctx.fillStyle = "#202d78";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1a2564";
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 2, h);
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = "#2d3f95";
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(Math.floor(rng() * 11) * 8, Math.floor(rng() * 11) * 8, 8, 4);
    }
  });

  add("crosswalk", 96, 96, (ctx, w, h) => {
    ctx.fillStyle = "#394aa6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#efe4aa";
    for (let y = 8; y < h; y += 20) ctx.fillRect(8, y, w - 16, 10);
    ctx.fillStyle = "#c3e7ed";
    for (let y = 8; y < h; y += 20) ctx.fillRect(8, y, w - 16, 3);
  });

  add("trash", 48, 48, (ctx, w, h) => {
    drawPixelTrash(ctx, w, h);
  });

  add("sign", 72, 72, (ctx, w, h) => {
    drawPixelSign(ctx, w, h);
  });

  add("car", 96, 72, (ctx, w, h) => {
    drawPixelCar(ctx, w, h);
  });

  add("player", 72, 72, (ctx, w, h) => {
    drawPixelPlayer(ctx, w, h);
  });
  add("playerReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelPlayer, 1, "rgba(17, 12, 43, 0.58)");
  });

  add("zombieA", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#98f06e", "#5131a8", "#ff7a5c"));
  add("zombieB", 72, 72, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#c5ff6b", "#f04d8b", "#ffe46b"));
  add("zombieBig", 96, 96, (ctx, w, h) => drawPixelZombie(ctx, w, h, "#a6f771", "#7946d9", "#ff7a5c", 1.32));
  add("zombieAReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#98f06e", "#5131a8", "#ff7a5c"), 2, "rgba(222, 28, 45, 0.78)");
  });
  add("zombieBReadable", 72, 72, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#c5ff6b", "#f04d8b", "#ffe46b"), 2, "rgba(235, 34, 48, 0.8)");
  });
  add("zombieBigReadable", 96, 96, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, (target, width, height) => drawPixelZombie(target, width, height, "#a6f771", "#7946d9", "#ff7a5c", 1.32), 2, "rgba(245, 38, 50, 0.84)");
  });

  add("bullet", 48, 20, (ctx, w, h) => {
    drawPixelBullet(ctx, w, h);
  });
  add("bulletReadable", 48, 20, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelBullet, 1, "rgba(17, 12, 43, 0.48)");
  });

  add("cash", 44, 44, (ctx, w, h) => {
    drawPixelCash(ctx, w, h);
  });
  add("cashReadable", 44, 44, (ctx, w, h) => {
    drawOutlinedSprite(ctx, w, h, drawPixelCash, 1, "rgba(17, 12, 43, 0.5)");
  });

  add("spark", 40, 40, (ctx, w, h) => {
    ctx.fillStyle = "rgba(255, 228, 107, 0.3)";
    ctx.fillRect(12, 8, 16, 24);
    ctx.fillRect(8, 12, 24, 16);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(16, 12, 8, 16);
    ctx.fillRect(12, 16, 16, 8);
    ctx.fillStyle = "#ff7a5c";
    ctx.fillRect(18, 18, 4, 4);
  });

  const size = 1024;
  const pad = 3;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = size;
  atlasCanvas.height = size;
  const atlasCtx = atlasCanvas.getContext("2d");
  atlasCtx.imageSmoothingEnabled = false;
  atlasCtx.clearRect(0, 0, size, size);

  let x = pad;
  let y = pad;
  let rowHeight = 0;
  const sprites = {};

  for (const spec of specs) {
    if (x + spec.width + pad > size) {
      x = pad;
      y += rowHeight + pad;
      rowHeight = 0;
    }
    if (y + spec.height + pad > size) {
      throw new Error("Texture atlas overflow");
    }

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spec.width;
    spriteCanvas.height = spec.height;
    const spriteCtx = spriteCanvas.getContext("2d");
    spriteCtx.imageSmoothingEnabled = false;
    spec.draw(spriteCtx, spec.width, spec.height);
    atlasCtx.drawImage(spriteCanvas, x, y);

    sprites[spec.name] = {
      x,
      y,
      w: spec.width,
      h: spec.height,
      u0: x / size,
      v0: y / size,
      u1: (x + spec.width) / size,
      v1: (y + spec.height) / size,
    };

    x += spec.width + pad;
    rowHeight = Math.max(rowHeight, spec.height);
  }

  return { canvas: atlasCanvas, sprites };
}

function drawPixelGlow(ctx, w, h, rgb) {
  ctx.fillStyle = `rgba(${rgb}, 0.08)`;
  ctx.fillRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = `rgba(${rgb}, 0.14)`;
  ctx.fillRect(18, 18, w - 36, h - 36);
  ctx.fillStyle = `rgba(${rgb}, 0.22)`;
  ctx.fillRect(30, 30, w - 60, h - 60);
}

function drawOutlinedSprite(ctx, w, h, draw, outline, outlineColor) {
  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  draw(sourceCtx, w, h);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const maskCtx = mask.getContext("2d");
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(source, 0, 0);
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = outlineColor;
  maskCtx.fillRect(0, 0, w, h);

  ctx.drawImage(mask, -outline, 0);
  ctx.drawImage(mask, outline, 0);
  ctx.drawImage(mask, 0, -outline);
  ctx.drawImage(mask, 0, outline);
  ctx.drawImage(source, 0, 0);
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelBullet(ctx) {
  ctx.fillStyle = "rgba(255, 228, 107, 0.28)";
  ctx.fillRect(0, 6, 18, 8);
  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(16, 4, 24, 12);
  ctx.fillStyle = "#ff7a5c";
  ctx.fillRect(36, 6, 8, 8);
  ctx.fillStyle = "#ff5d96";
  ctx.fillRect(42, 8, 4, 4);
}

function drawPixelCash(ctx) {
  ctx.fillStyle = "rgba(35, 25, 76, 0.28)";
  ctx.beginPath();
  ctx.ellipse(22, 35, 12, 4, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#7d4a18";
  ctx.beginPath();
  ctx.arc(22, 21, 15, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#ffe46b";
  ctx.beginPath();
  ctx.arc(22, 21, 12, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#f4a83f";
  ctx.lineWidth = 3;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = i * (TAU / 6);
    const hx = 22 + Math.cos(angle) * 8;
    const hy = 21 + Math.sin(angle) * 8;
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(15, 13, 9, 3);
  ctx.fillRect(13, 16, 5, 3);
}

function drawPixelTrash(ctx, w, h) {
  const x = w / 2 - 14;
  const y = h / 2 - 16;
  px(ctx, x + 2, y + 28, 28, 6, "rgba(35, 25, 76, 0.28)");
  px(ctx, x, y + 4, 28, 28, "#162b59");
  px(ctx, x + 4, y, 20, 6, "#55f6c7");
  px(ctx, x + 4, y + 10, 20, 4, "#2844a0");
  px(ctx, x + 7, y + 18, 14, 3, "#8fd4ff");
  px(ctx, x + 22, y + 6, 4, 24, "#0e1c42");
}

function drawPixelSign(ctx, w, h) {
  const x = w / 2;
  const y = h / 2;
  px(ctx, x - 21, y + 22, 42, 8, "rgba(35, 25, 76, 0.32)");
  px(ctx, x - 4, y - 6, 8, 30, "#201653");
  px(ctx, x - 28, y - 30, 56, 24, "#201653");
  px(ctx, x - 24, y - 26, 48, 16, "#ff5d96");
  px(ctx, x - 19, y - 21, 38, 4, "#ffe46b");
  px(ctx, x - 24, y - 10, 48, 4, "#b82f78");
}

function drawPixelCar(ctx, w, h) {
  const x = w / 2 - 38;
  const y = h / 2 - 18;
  px(ctx, x + 4, y + 39, 72, 8, "rgba(35, 25, 76, 0.32)");
  px(ctx, x, y + 10, 76, 24, "#5a2fc8");
  px(ctx, x + 8, y + 2, 52, 18, "#ff5d96");
  px(ctx, x + 15, y + 6, 36, 10, "#9df7ff");
  px(ctx, x + 8, y + 30, 14, 8, "#201653");
  px(ctx, x + 54, y + 30, 14, 8, "#201653");
  px(ctx, x + 63, y + 16, 8, 8, "#ffe46b");
  px(ctx, x + 2, y + 18, 8, 8, "#ff7a5c");
}

function drawPixelPlayer(ctx, w, h) {
  const x = w / 2 - 20;
  const y = h / 2 - 30;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 5, y + 9, 30, 22, "#f4bf91");
  px(ctx, x + 3, y + 3, 30, 9, "#2b184c");
  px(ctx, x + 8, y - 1, 19, 7, "#2b184c");
  px(ctx, x + 4, y + 10, 8, 9, "#2b184c");
  px(ctx, x + 24, y + 9, 11, 6, "#2b184c");
  px(ctx, x + 9, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 24, y + 15, 7, 2, "#5b3761");
  px(ctx, x + 10, y + 18, 4, 4, "#201653");
  px(ctx, x + 26, y + 18, 4, 4, "#201653");
  px(ctx, x + 19, y + 20, 3, 5, "#c78163");
  px(ctx, x + 15, y + 27, 10, 2, "#7c4b37");
  px(ctx, x + 5, y + 31, 30, 27, "#a94424");
  px(ctx, x + 9, y + 31, 22, 25, "#e17332");
  px(ctx, x + 13, y + 31, 14, 24, "#d8d0b0");
  px(ctx, x + 5, y + 39, 30, 6, "#742f27");
  px(ctx, x + 9, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 26, y + 35, 5, 19, "#5a2825");
  px(ctx, x + 16, y + 35, 8, 5, "#fff3c4");
  px(ctx, x + 15, y + 45, 4, 4, "#5a2825");
  px(ctx, x + 23, y + 50, 5, 3, "#8b5a1f");
  px(ctx, x + 0, y + 33, 8, 21, "#a94424");
  px(ctx, x + 32, y + 33, 8, 21, "#a94424");
  px(ctx, x + 1, y + 51, 7, 3, "#d8d0b0");
  px(ctx, x + 32, y + 51, 7, 3, "#d8d0b0");
  px(ctx, x + 1, y + 54, 7, 4, "#f4bf91");
  px(ctx, x + 32, y + 54, 7, 4, "#f4bf91");
  px(ctx, x + 33, y + 45, 5, 8, "#742f27");
  px(ctx, x + 9, y + 56, 9, 13, "#26345f");
  px(ctx, x + 23, y + 56, 9, 13, "#26345f");
  px(ctx, x + 7, y + 66, 13, 4, "#2a2336");
  px(ctx, x + 21, y + 66, 13, 4, "#2a2336");
  px(ctx, x + 17, y + 47, 7, 5, "#3b2f3d");
}

function drawPixelZombie(ctx, w, h, skin, clothes, accent, scale = 1) {
  ctx.save();
  ctx.translate(w / 2, h / 2 + (scale - 1) * 12);
  ctx.scale(scale, scale);
  const x = -20;
  const y = -30;
  px(ctx, x + 2, y + 56, 36, 7, "rgba(35, 25, 76, 0.26)");
  px(ctx, x + 4, y + 9, 32, 22, skin);
  px(ctx, x + 0, y + 0, 20, 8, "#31461e");
  px(ctx, x + 8, y + 16, 6, 5, "#243012");
  px(ctx, x + 26, y + 16, 6, 5, "#243012");
  px(ctx, x + 14, y + 25, 18, 4, "#243012");
  px(ctx, x + 5, y + 31, 30, 27, clothes);
  px(ctx, x + 5, y + 40, 30, 7, accent);
  px(ctx, x - 10, y + 31, 13, 8, skin);
  px(ctx, x + 37, y + 35, 13, 8, skin);
  px(ctx, x + 9, y + 56, 9, 13, "#223064");
  px(ctx, x + 23, y + 56, 9, 13, "#223064");
  px(ctx, x + 6, y + 31, 6, 27, "#3f2a99");
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

class SpriteRenderer {
  constructor(targetCanvas, atlasData) {
    this.canvas = targetCanvas;
    this.atlas = atlasData;
    this.gl = targetCanvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!this.gl) {
      throw new Error("WebGL is not available in this browser");
    }

    this.maxQuads = 12000;
    this.stride = 8;
    this.vertices = new Float32Array(this.maxQuads * 6 * this.stride);
    this.vertexCount = 0;
    this.dpr = 1;
    this.program = this.createProgram();
    this.buffer = this.gl.createBuffer();
    this.texture = this.createTexture(atlasData.canvas);
    this.bindState();
  }

  createProgram() {
    const vertex = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clip = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
        v_uv = a_uv;
        v_color = a_color;
      }
    `;

    const fragment = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_uv;
      varying vec4 v_color;
      void main() {
        gl_FragColor = texture2D(u_texture, v_uv) * v_color;
      }
    `;

    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vertex);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program");
    }
    return program;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile shader");
    }
    return shader;
  }

  createTexture(source) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  bindState() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const strideBytes = this.stride * 4;
    const pos = gl.getAttribLocation(this.program, "a_position");
    const uv = gl.getAttribLocation(this.program, "a_uv");
    const color = gl.getAttribLocation(this.program, "a_color");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, strideBytes, 2 * 4);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 4, gl.FLOAT, false, strideBytes, 4 * 4);
    this.resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
    gl.uniform1i(gl.getUniformLocation(this.program, "u_texture"), 0);
  }

  resize(width, height, dpr) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.resolutionLocation, width, height);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0.12, 0.18, 0.44, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  begin() {
    this.vertexCount = 0;
  }

  draw(name, x, y, width, height, options = {}) {
    const sprite = this.atlas.sprites[name];
    if (!sprite) return;

    if (this.vertexCount + 6 >= this.maxQuads * 6) {
      this.flush();
    }

    const scale = this.dpr;
    const cx = x * scale;
    const cy = y * scale;
    const hw = (width * scale) / 2;
    const hh = (height * scale) / 2;
    const rotation = options.rotation || 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const tint = options.tint || [1, 1, 1];
    const alpha = options.alpha ?? 1;

    const corners = [
      [-hw, -hh, sprite.u0, sprite.v0],
      [hw, -hh, sprite.u1, sprite.v0],
      [hw, hh, sprite.u1, sprite.v1],
      [-hw, -hh, sprite.u0, sprite.v0],
      [hw, hh, sprite.u1, sprite.v1],
      [-hw, hh, sprite.u0, sprite.v1],
    ];

    let offset = this.vertexCount * this.stride;
    for (const corner of corners) {
      const px = corner[0] * cos - corner[1] * sin + cx;
      const py = corner[0] * sin + corner[1] * cos + cy;
      this.vertices[offset] = px;
      this.vertices[offset + 1] = py;
      this.vertices[offset + 2] = corner[2];
      this.vertices[offset + 3] = corner[3];
      this.vertices[offset + 4] = tint[0];
      this.vertices[offset + 5] = tint[1];
      this.vertices[offset + 6] = tint[2];
      this.vertices[offset + 7] = alpha;
      offset += this.stride;
    }
    this.vertexCount += 6;
  }

  flush() {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.vertexCount * this.stride), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.vertexCount = 0;
  }
}

function resetRun() {
  game.mode = "fight";
  game.wave = 1;
  game.timeLeft = WAVE_SECONDS;
  game.elapsed = 0;
  game.money = 0;
  game.totalKills = 0;
  game.waveKills = 0;
  game.rerolls = 0;
  game.spawnClock = 0;
  game.shake = 0;
  game.damageFlash = 0;
  game.camera.x = 0;
  game.camera.y = 0;
  game.player = {
    x: 0,
    y: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    speed: 215,
    damage: 18,
    fireRate: 1.65,
    bulletSpeed: 690,
    pickup: 150,
    armor: 0,
    projectiles: 1,
    pierce: 0,
    regen: 0,
    shootTimer: 0.45,
    moveX: 0,
    moveY: 0,
  };
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.offers = [];
  hud.shop.classList.add("hidden");
  hud.gameOver.classList.add("hidden");
  updateHud();
}

function startNextWave() {
  game.mode = "fight";
  game.wave += 1;
  game.timeLeft = WAVE_SECONDS;
  game.waveKills = 0;
  game.rerolls = 0;
  game.spawnClock = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.28, 1, game.player.maxHp);
  hud.shop.classList.add("hidden");
  updateHud();
}

function enterShop() {
  game.mode = "shop";
  game.rerolls = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.2, 1, game.player.maxHp);
  generateOffers();
  renderShop();
  hud.shop.classList.remove("hidden");
}

function endRun() {
  game.mode = "over";
  hud.result.textContent = `第${game.wave}夜、撃破数 ${game.totalKills}、残りコイン ${game.money}枚。`;
  hud.gameOver.classList.remove("hidden");
}

function generateOffers() {
  const pool = [
    {
      name: "中空弾",
      text: "攻撃力 +6。",
      baseCost: 12,
      apply: () => {
        game.player.damage += 6;
      },
    },
    {
      name: "改造トリガー",
      text: "連射速度 +18%。",
      baseCost: 13,
      apply: () => {
        game.player.fireRate *= 1.18;
      },
    },
    {
      name: "軽いスニーカー",
      text: "移動速度 +22。",
      baseCost: 10,
      apply: () => {
        game.player.speed += 22;
      },
    },
    {
      name: "スクラップ磁石",
      text: "回収範囲 +34。",
      baseCost: 9,
      apply: () => {
        game.player.pickup += 34;
      },
    },
    {
      name: "補強パーカー",
      text: "最大体力 +22、体力を22回復。",
      baseCost: 14,
      apply: () => {
        game.player.maxHp += 22;
        game.player.hp = clamp(game.player.hp + 22, 1, game.player.maxHp);
      },
    },
    {
      name: "路上の防具板",
      text: "防御 +3。",
      baseCost: 11,
      apply: () => {
        game.player.armor += 3;
      },
    },
    {
      name: "二連バレル",
      text: "発射弾 +1、攻撃力 -8%。",
      baseCost: 24,
      apply: () => {
        game.player.projectiles += 1;
        game.player.damage *= 0.92;
      },
    },
    {
      name: "貫通クリップ",
      text: "弾の貫通 +1。",
      baseCost: 17,
      apply: () => {
        game.player.pierce += 1;
      },
    },
    {
      name: "苦いコーヒー",
      text: "移動速度 +15%、最大体力 -8。",
      baseCost: 8,
      apply: () => {
        game.player.speed *= 1.15;
        game.player.maxHp = Math.max(35, game.player.maxHp - 8);
        game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
      },
    },
    {
      name: "壊れかけの電池",
      text: "攻撃力 +10、防御 -2。",
      baseCost: 15,
      apply: () => {
        game.player.damage += 10;
        game.player.armor -= 2;
      },
    },
    {
      name: "応急テープ",
      text: "毎秒0.7体力を回復。",
      baseCost: 18,
      apply: () => {
        game.player.regen += 0.7;
      },
    },
    {
      name: "密輸弾薬",
      text: "弾速 +28%、攻撃力 +4。",
      baseCost: 16,
      apply: () => {
        game.player.bulletSpeed *= 1.28;
        game.player.damage += 4;
      },
    },
  ];

  const picks = [];
  const used = new Set();
  while (picks.length < 4) {
    const index = Math.floor(Math.random() * pool.length);
    if (used.has(index)) continue;
    used.add(index);
    const template = pool[index];
    picks.push({
      ...template,
      cost: Math.max(4, Math.round(template.baseCost * (1 + game.wave * 0.14) + Math.random() * 4)),
      bought: false,
    });
  }
  game.offers = picks;
}

function rerollCost() {
  return Math.floor(4 + game.wave * 1.5 + game.rerolls * 3);
}

function buyOffer(index) {
  const offer = game.offers[index];
  if (!offer || offer.bought || game.money < offer.cost) return;
  game.money -= offer.cost;
  offer.bought = true;
  offer.apply();
  game.player.hp = clamp(game.player.hp, 1, game.player.maxHp);
  renderShop();
  updateHud();
}

function renderShop() {
  hud.shopCash.textContent = String(game.money);
  hud.offers.replaceChildren();

  game.offers.forEach((offer, index) => {
    const card = document.createElement("article");
    card.className = "offer";

    const title = document.createElement("h2");
    title.textContent = offer.name;

    const body = document.createElement("p");
    body.textContent = offer.text;

    const price = document.createElement("div");
    price.className = "price";

    const cost = document.createElement("strong");
    cost.textContent = offer.bought ? "売切" : `${offer.cost}枚`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = offer.bought ? "購入済み" : "購入";
    button.disabled = offer.bought || game.money < offer.cost;
    button.addEventListener("click", () => buyOffer(index));

    price.append(cost, button);
    card.append(title, body, price);
    hud.offers.append(card);
  });

  const stats = [
    ["攻撃力", game.player.damage.toFixed(1)],
    ["連射", `${game.player.fireRate.toFixed(2)}/秒`],
    ["移動", Math.round(game.player.speed)],
    ["最大体力", Math.round(game.player.maxHp)],
    ["防御", Math.round(game.player.armor)],
    ["回収範囲", Math.round(game.player.pickup)],
    ["弾数", game.player.projectiles],
    ["貫通", game.player.pierce],
  ];

  hud.stats.replaceChildren();
  stats.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "stat";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    item.append(span, strong);
    hud.stats.append(item);
  });

  const cost = rerollCost();
  hud.reroll.textContent = `リロール ${cost}枚`;
  hud.reroll.disabled = game.money < cost;
}

function updateHud() {
  hud.wave.textContent = String(game.wave);
  hud.time.textContent = formatTime(game.timeLeft);
  hud.cash.textContent = String(game.money);
  hud.kills.textContent = String(game.waveKills);
  hud.hp.style.width = `${clamp((game.player.hp / game.player.maxHp) * 100, 0, 100)}%`;
  hud.hitFlash.style.background = `rgba(255, 56, 77, ${game.damageFlash})`;
  syncTouchControls();
}

function formatTime(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function update(dt) {
  game.elapsed += dt;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.4);
  game.shake = Math.max(0, game.shake - dt * 45);

  if (game.mode !== "fight") {
    updateCamera(dt);
    updateHud();
    return;
  }

  const p = game.player;
  game.timeLeft -= dt;

  updateMovement(dt);
  p.hp = clamp(p.hp + p.regen * dt, 0, p.maxHp);
  p.shootTimer -= dt;

  spawnEnemies(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);
  autoShoot();
  updateCamera(dt);

  if (p.hp <= 0) {
    endRun();
  } else if (game.timeLeft <= 0) {
    enterShop();
  }

  updateHud();
}

function updateMovement(dt) {
  const p = game.player;
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  const hasKeyboardInput = x !== 0 || y !== 0;

  if (!hasKeyboardInput && pointer.down) {
    x = pointer.moveX;
    y = pointer.moveY;
  }

  const move = normalize(x, y);
  const speedScale = hasKeyboardInput ? 1 : clamp(pointer.strength, 0, 1);
  p.moveX = move.x;
  p.moveY = move.y;
  p.x += move.x * p.speed * speedScale * dt;
  p.y += move.y * p.speed * speedScale * dt;
}

function updateCamera(dt) {
  const p = game.player;
  game.camera.x = lerp(game.camera.x, p.x, clamp(dt * 8, 0, 1));
  game.camera.y = lerp(game.camera.y, p.y, clamp(dt * 8, 0, 1));
}

function spawnEnemies(dt) {
  if (game.enemies.length > 75 + game.wave * 9) return;

  const interval = Math.max(0.16, 0.7 - game.wave * 0.045);
  game.spawnClock -= dt;
  while (game.spawnClock <= 0) {
    spawnEnemy();
    game.spawnClock += interval * (0.75 + Math.random() * 0.65);
  }
}

function spawnEnemy() {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const margin = 95;
  const side = Math.floor(Math.random() * 4);
  let x = game.player.x;
  let y = game.player.y;

  if (side === 0) {
    x += (Math.random() - 0.5) * (visibleW + margin * 2);
    y -= visibleH / 2 + margin;
  } else if (side === 1) {
    x += visibleW / 2 + margin;
    y += (Math.random() - 0.5) * (visibleH + margin * 2);
  } else if (side === 2) {
    x += (Math.random() - 0.5) * (visibleW + margin * 2);
    y += visibleH / 2 + margin;
  } else {
    x -= visibleW / 2 + margin;
    y += (Math.random() - 0.5) * (visibleH + margin * 2);
  }

  const roll = Math.random();
  const wave = game.wave;
  let type = "walker";
  if (wave >= 3 && roll < 0.14) type = "brute";
  else if (wave >= 2 && roll < 0.42) type = "runner";

  const baseHp = 28 + wave * 8;
  const enemy = {
    id: enemyId,
    x,
    y,
    radius: 18,
    hp: baseHp,
    maxHp: baseHp,
    speed: 78 + wave * 3,
    damage: 13 + wave * 1.1,
    value: 2 + Math.floor(wave / 2),
    sprite: "zombieA",
    readableSprite: "zombieAReadable",
    hit: 0,
    wobble: Math.random() * TAU,
  };
  enemyId += 1;

  if (type === "runner") {
    enemy.radius = 16;
    enemy.hp = baseHp * 0.72;
    enemy.maxHp = enemy.hp;
    enemy.speed = 122 + wave * 4;
    enemy.damage = 10 + wave;
    enemy.value = 2 + Math.floor(wave / 3);
    enemy.sprite = "zombieB";
    enemy.readableSprite = "zombieBReadable";
  } else if (type === "brute") {
    enemy.radius = 27;
    enemy.hp = baseHp * 2.85;
    enemy.maxHp = enemy.hp;
    enemy.speed = 58 + wave * 2.4;
    enemy.damage = 23 + wave * 1.4;
    enemy.value = 6 + wave;
    enemy.sprite = "zombieBig";
    enemy.readableSprite = "zombieBigReadable";
  }

  game.enemies.push(enemy);
}

function updateEnemies(dt) {
  const p = game.player;
  for (const enemy of game.enemies) {
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    const dir = normalize(p.x - enemy.x, p.y - enemy.y);
    enemy.x += dir.x * enemy.speed * dt;
    enemy.y += dir.y * enemy.speed * dt;

    const minDist = p.radius + enemy.radius;
    if (dir.len < minDist && dir.len > 0.01) {
      const push = (minDist - dir.len) * 0.5;
      enemy.x -= dir.x * push;
      enemy.y -= dir.y * push;
      p.x += dir.x * push * 0.18;
      p.y += dir.y * push * 0.18;
      damagePlayer(enemy.damage * dt);
    }
  }
}

function updateBullets(dt) {
  const enemyGrid = buildEnemyGrid();
  const next = [];
  for (const bullet of game.bullets) {
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.life <= 0) continue;

    let keep = true;
    const bulletCellX = Math.floor(bullet.x / COLLISION_CELL_SIZE);
    const bulletCellY = Math.floor(bullet.y / COLLISION_CELL_SIZE);
    nearbyCells: for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        const cell = enemyGrid.get(gridKey(bulletCellX + xOffset, bulletCellY + yOffset));
        if (!cell) continue;

        for (const enemy of cell) {
          if (enemy.dead) continue;
          if (bullet.hitIds.has(enemy.id)) continue;
          const range = enemy.radius + bullet.radius;
          if (distSq(bullet.x, bullet.y, enemy.x, enemy.y) > range * range) continue;

          bullet.hitIds.add(enemy.id);
          enemy.hp -= bullet.damage;
          enemy.hit = 1;
          addSparks(bullet.x, bullet.y, 3, 90);
          if (enemy.hp <= 0) {
            killEnemy(enemy);
          }
          bullet.pierce -= 1;
          if (bullet.pierce < 0) {
            keep = false;
            break nearbyCells;
          }
        }
      }
    }
    if (keep) next.push(bullet);
  }
  removeDeadEnemies();
  game.bullets = next;
}

function buildEnemyGrid() {
  enemyCollisionGrid.clear();
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const cellX = Math.floor(enemy.x / COLLISION_CELL_SIZE);
    const cellY = Math.floor(enemy.y / COLLISION_CELL_SIZE);
    const key = gridKey(cellX, cellY);
    let cell = enemyCollisionGrid.get(key);
    if (!cell) {
      cell = [];
      enemyCollisionGrid.set(key, cell);
    }
    cell.push(enemy);
  }
  return enemyCollisionGrid;
}

function gridKey(x, y) {
  return `${x}:${y}`;
}

function updatePickups(dt) {
  const p = game.player;
  const kept = [];
  for (const pickup of game.pickups) {
    pickup.bob += dt * 5;
    const dx = p.x - pickup.x;
    const dy = p.y - pickup.y;
    const distance = Math.hypot(dx, dy);

    if (distance < p.pickup) {
      pickup.magnetized = true;
      pickup.magnetTime = (pickup.magnetTime || 0) + dt;
    }

    if (pickup.magnetized) {
      const directionX = dx / Math.max(1, distance);
      const directionY = dy / Math.max(1, distance);
      const proximity = 1 - clamp(distance / p.pickup, 0, 1);
      const suctionSpeed = 760 + proximity * 1600 + clamp(pickup.magnetTime || 0, 0, 0.18) * 4200;
      const step = Math.min(distance, suctionSpeed * dt);
      pickup.x += directionX * step;
      pickup.y += directionY * step;
      pickup.vx *= 0.35;
      pickup.vy *= 0.35;
    } else {
      pickup.vx *= 0.84;
      pickup.vy *= 0.84;
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
    }

    const collectDistance = Math.hypot(p.x - pickup.x, p.y - pickup.y);
    if (collectDistance < p.radius + 18) {
      game.money += pickup.value;
      addSparks(pickup.x, pickup.y, 2, 60, "cash");
    } else {
      kept.push(pickup);
    }
  }
  game.pickups = kept;
}

function updateParticles(dt) {
  const kept = [];
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.9;
    particle.vy *= 0.9;
    if (particle.life > 0) kept.push(particle);
  }
  game.particles = kept;
}

function autoShoot() {
  const p = game.player;
  if (p.shootTimer > 0 || game.enemies.length === 0) return;

  let best = null;
  let bestDistance = 760 * 760;
  for (const enemy of game.enemies) {
    const distance = distSq(p.x, p.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }

  if (!best) return;

  const angle = Math.atan2(best.y - p.y, best.x - p.x);
  const spread = p.projectiles === 1 ? 0 : 0.18;
  for (let i = 0; i < p.projectiles; i += 1) {
    const offset = (i - (p.projectiles - 1) / 2) * spread;
    fireBullet(angle + offset);
  }
  p.shootTimer += 1 / p.fireRate;
  game.shake = Math.max(game.shake, 1.8);
}

function fireBullet(angle) {
  const p = game.player;
  const speed = p.bulletSpeed;
  game.bullets.push({
    x: p.x + Math.cos(angle) * 25,
    y: p.y + Math.sin(angle) * 25,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    radius: 9,
    damage: p.damage,
    life: 0.72,
    pierce: p.pierce,
    hitIds: new Set(),
  });
  addSparks(p.x + Math.cos(angle) * 28, p.y + Math.sin(angle) * 28, 1, 40);
}

function killEnemy(enemy) {
  if (!enemy || enemy.dead) return;
  enemy.dead = true;
  game.totalKills += 1;
  game.waveKills += 1;
  game.pickups.push({
    x: enemy.x,
    y: enemy.y,
    vx: (Math.random() - 0.5) * 60,
    vy: (Math.random() - 0.5) * 60,
    value: enemy.value,
    bob: Math.random() * TAU,
  });
  addSparks(enemy.x, enemy.y, enemy.radius > 22 ? 8 : 5, 110);
  game.shake = Math.max(game.shake, enemy.radius > 22 ? 5 : 2.4);
}

function removeDeadEnemies() {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < game.enemies.length; readIndex += 1) {
    const enemy = game.enemies[readIndex];
    if (!enemy.dead) {
      game.enemies[writeIndex] = enemy;
      writeIndex += 1;
    }
  }
  game.enemies.length = writeIndex;
}

function damagePlayer(amount) {
  const reduction = 100 / (100 + Math.max(-20, game.player.armor) * 8);
  game.player.hp -= amount * reduction;
  game.damageFlash = Math.max(game.damageFlash, 0.2);
  game.shake = Math.max(game.shake, 3.5);
}

function addSparks(x, y, count, speed, sprite = "spark") {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const force = speed * (0.25 + Math.random() * 0.75);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 0.22 + Math.random() * 0.18,
      maxLife: 0.4,
      size: 18 + Math.random() * 18,
      sprite,
    });
  }
}

function render() {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const shakeX = (Math.random() - 0.5) * game.shake;
  const shakeY = (Math.random() - 0.5) * game.shake;
  const camX = game.camera.x + shakeX;
  const camY = game.camera.y + shakeY;

  renderer.clear();
  renderer.begin();
  drawBackground(view, camX, camY, zoom);
  drawBackgroundDepth(view);
  drawWorld(view, camX, camY, zoom);
  renderer.flush();
}

function drawBackgroundDepth(view) {
  renderer.draw("white", view.w / 2, view.h / 2, view.w + 4, view.h + 4, {
    tint: [0.06, 0.07, 0.19],
    alpha: 0.14,
  });
}

function drawBackground(view, camX, camY, zoom) {
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const startX = Math.floor((camX - visibleW / 2) / TILE_SIZE) - 1;
  const endX = Math.floor((camX + visibleW / 2) / TILE_SIZE) + 1;
  const startY = Math.floor((camY - visibleH / 2) / TILE_SIZE) - 1;
  const endY = Math.floor((camY + visibleH / 2) / TILE_SIZE) + 1;

  for (let ty = startY; ty <= endY; ty += 1) {
    for (let tx = startX; tx <= endX; tx += 1) {
      const tile = getBackgroundTile(tx, ty);
      const type = tile.type;
      const worldX = tx * TILE_SIZE + TILE_SIZE / 2;
      const worldY = ty * TILE_SIZE + TILE_SIZE / 2;
      const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
      renderer.draw(type, screen.x, screen.y, (TILE_SIZE + 2) * zoom, (TILE_SIZE + 2) * zoom);

      if (tile.prop) {
        drawProp(tile.prop, tx, ty, view, camX, camY, zoom, tile.propOffset, tile.propY);
      }
    }
  }
}

function getBackgroundTile(tx, ty) {
  const key = gridKey(tx, ty);
  const cached = backgroundTileCache.get(key);
  if (cached) return cached;

  const type = tileSprite(tx, ty);
  const propRoll = hash2(tx, ty, 5);
  let prop = "";
  let propOffset = 0;

  if (type !== "road" && type !== "lane" && type !== "crosswalk") {
    if (propRoll < 0.045) {
      prop = "sign";
      propOffset = hash2(tx, ty, 7);
    } else if (propRoll < 0.085) {
      prop = "trash";
      propOffset = hash2(tx, ty, 9);
    }
  } else if (propRoll < 0.02) {
    prop = "car";
    propOffset = hash2(tx, ty, 11);
  }

  const tile = {
    type,
    prop,
    propOffset,
    propY: prop ? hash2(tx, ty, 17) : 0,
  };
  backgroundTileCache.set(key, tile);
  trimBackgroundTileCache();
  return tile;
}

function trimBackgroundTileCache() {
  if (backgroundTileCache.size <= BACKGROUND_CACHE_LIMIT) return;
  let removed = 0;
  for (const key of backgroundTileCache.keys()) {
    backgroundTileCache.delete(key);
    removed += 1;
    if (removed >= 512) break;
  }
}

function tileSprite(tx, ty) {
  const avenue = mod(tx, 7) <= 1;
  const street = mod(ty, 6) <= 1;
  const cross = avenue && street && (mod(tx, 7) === 1 || mod(ty, 6) === 1);
  if (cross) return "crosswalk";
  if (avenue || street) {
    return mod(tx + ty, 3) === 0 ? "lane" : "road";
  }
  if (mod(tx, 7) === 2 || mod(tx, 7) === 6 || mod(ty, 6) === 2 || mod(ty, 6) === 5) {
    return "sidewalk";
  }
  return "pavement";
}

function drawProp(name, tx, ty, view, camX, camY, zoom, roll, yRoll) {
  const worldX = tx * TILE_SIZE + 24 + roll * 48;
  const worldY = ty * TILE_SIZE + 18 + yRoll * 54;
  const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
  if (name === "sign") renderer.draw("glowRed", screen.x, screen.y - 18 * zoom, 110 * zoom, 90 * zoom, { alpha: 0.55 });
  if (name === "car") renderer.draw("glowAmber", screen.x + 12 * zoom, screen.y, 120 * zoom, 70 * zoom, { alpha: 0.24 });
  renderer.draw(name, screen.x, screen.y, atlas.sprites[name].w * zoom, atlas.sprites[name].h * zoom, {
    rotation: (roll - 0.5) * 0.6,
  });
}

function drawWorld(view, camX, camY, zoom) {
  for (const pickup of game.pickups) {
    const screen = worldToScreen(pickup.x, pickup.y + Math.sin(pickup.bob) * 4, view, camX, camY, zoom);
    renderer.draw("shadow", screen.x, screen.y + 13 * zoom, 36 * zoom, 14 * zoom, { alpha: 0.55 });
    renderer.draw("glowAmber", screen.x, screen.y, 42 * zoom, 42 * zoom, { alpha: 0.2 });
    renderer.draw("cashReadable", screen.x, screen.y, 25 * zoom, 25 * zoom, { rotation: Math.sin(pickup.bob) * 0.15 });
  }

  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    const screen = worldToScreen(particle.x, particle.y, view, camX, camY, zoom);
    const size = particle.size * (1.2 - alpha * 0.2) * zoom;
    renderer.draw(particle.sprite, screen.x, screen.y, size, size, { alpha });
  }

  const actors = game.enemies.map((enemy) => ({ kind: "enemy", y: enemy.y, item: enemy }));
  actors.push({ kind: "player", y: game.player.y, item: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const actor of actors) {
    if (actor.kind === "player") drawPlayer(actor.item, view, camX, camY, zoom);
    else drawEnemy(actor.item, view, camX, camY, zoom);
  }

  for (const bullet of game.bullets) {
    const screen = worldToScreen(bullet.x, bullet.y, view, camX, camY, zoom);
    renderer.draw("glowAmber", screen.x, screen.y, 42 * zoom, 30 * zoom, { alpha: 0.32 });
    renderer.draw("bulletReadable", screen.x, screen.y, 38 * zoom, 14 * zoom, { rotation: bullet.angle });
  }
}

function drawPlayer(player, view, camX, camY, zoom) {
  const screen = worldToScreen(player.x, player.y, view, camX, camY, zoom);
  const lean = clamp(player.moveX, -1, 1) * 0.08;
  renderer.draw("glowCyan", screen.x, screen.y + 4 * zoom, 94 * zoom, 82 * zoom, { alpha: 0.2 });
  renderer.draw("shadow", screen.x, screen.y + 25 * zoom, 72 * zoom, 32 * zoom, { alpha: 0.82 });
  renderer.draw("playerReadable", screen.x, screen.y - 3 * zoom, 62 * zoom, 62 * zoom, { rotation: lean });
}

function drawEnemy(enemy, view, camX, camY, zoom) {
  const screen = worldToScreen(enemy.x, enemy.y, view, camX, camY, zoom);
  const size = enemy.radius * (enemy.sprite === "zombieBig" ? 3.0 : 2.7) * zoom;
  const wobble = Math.sin(game.elapsed * 7 + enemy.wobble) * 0.08;
  const tint = enemy.hit > 0 ? [1, 0.52, 0.52] : [1, 1, 1];
  renderer.draw("glowEnemyRed", screen.x, screen.y - enemy.radius * 0.12 * zoom, size * 1.15, size * 1.05, {
    alpha: enemy.sprite === "zombieBig" ? 0.13 : 0.09,
  });
  renderer.draw("shadow", screen.x, screen.y + enemy.radius * 0.8 * zoom, size * 1.02, size * 0.45, { alpha: 0.74 });
  renderer.draw(enemy.readableSprite, screen.x, screen.y - enemy.radius * 0.15 * zoom, size, size, {
    rotation: wobble,
    tint,
  });

  if (enemy.hp < enemy.maxHp) {
    const barW = enemy.radius * 2.2 * zoom;
    const y = screen.y - enemy.radius * 2.1 * zoom;
    renderer.draw("white", screen.x, y, barW, 5 * zoom, { tint: [0.12, 0.12, 0.15], alpha: 0.72 });
    renderer.draw("white", screen.x - barW * (1 - enemy.hp / enemy.maxHp) * 0.5, y, barW * enemy.hp / enemy.maxHp, 5 * zoom, {
      tint: [0.44, 0.96, 0.78],
      alpha: 0.9,
    });
  }
}

function worldToScreen(x, y, view, camX, camY, zoom = 1) {
  return {
    x: (x - camX) * zoom + view.w / 2,
    y: (y - camY) * zoom + view.h / 2,
  };
}

function viewSize() {
  return {
    w: canvas.width / renderer.dpr,
    h: canvas.height / renderer.dpr,
  };
}

function cameraZoom(view) {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth <= 760;
  const shortSide = Math.min(view.w, view.h);
  if (coarsePointer || narrowViewport) {
    return shortSide <= 520 ? MOBILE_CAMERA_ZOOM : TOUCH_TABLET_CAMERA_ZOOM;
  }
  return 1;
}

function measureCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  return {
    dpr,
    width: Math.max(320, Math.floor(rect.width * dpr)),
    height: Math.max(240, Math.floor(rect.height * dpr)),
  };
}

function prepareCanvas() {
  const size = measureCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  return size.dpr;
}

function resize() {
  const size = measureCanvas();
  renderer.resize(size.width, size.height, size.dpr);
}

function syncTouchControls() {
  if (!hud.touchControls) return;
  const isFighting = game.mode === "fight";
  hud.touchControls.classList.toggle("disabled", !isFighting);
  if (!isFighting && pointer.down) resetVirtualMove();
}

function beginVirtualMove(event) {
  if (game.mode !== "fight") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
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

function resetVirtualMove() {
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

function bindInput() {
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" && game.mode === "shop") startNextWave();
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

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.033);
  lastFrame = now;
  resize();
  update(dt);
  render();
  requestAnimationFrame(frame);
}

hud.reroll.addEventListener("click", () => {
  const cost = rerollCost();
  if (game.money < cost) return;
  game.money -= cost;
  game.rerolls += 1;
  generateOffers();
  renderShop();
  updateHud();
});

hud.nextWave.addEventListener("click", startNextWave);
hud.restart.addEventListener("click", resetRun);

atlas = buildAtlas();
const initialDpr = prepareCanvas();
renderer = new SpriteRenderer(canvas, atlas);
renderer.resize(canvas.width, canvas.height, initialDpr);
bindInput();
resetRun();
resize();
requestAnimationFrame(frame);
