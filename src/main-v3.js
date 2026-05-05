import './styles.css';

const canvas = document.querySelector('#game');
const gl = canvas.getContext('webgl', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
});

if (!gl) {
  throw new Error('WebGL is not supported by this browser.');
}

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const TILE = 16;
const ATLAS_SIZE = 512;
const WORLD_SIZE = 3200;
const MAX_QUADS = 76000;
const DPR_LIMIT = 2;
const GRID_CELL_SIZE = 96;
const GRID_ROW_STRIDE = 2048;
const MAX_ENEMIES = 1400;
const PROJECTILE_QUERY_RADIUS = 48;

const keys = new Set();
const view = { width: 1, height: 1 };
const enemyGrid = new Map();
let nextEnemyId = 1;
let skillTreeOpen = false;

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 't') {
    toggleSkillTree();
    event.preventDefault();
    return;
  }
  if (key === 'escape' && skillTreeOpen) {
    closeSkillTree();
    event.preventDefault();
    return;
  }
  keys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;

uniform vec2 u_resolution;
uniform vec2 u_camera;

varying vec2 v_uv;
varying vec4 v_color;

void main() {
  vec2 screen = a_position - u_camera;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_color;

void main() {
  vec4 texel = texture2D(u_texture, v_uv);
  if (texel.a < 0.05) discard;
  gl_FragColor = texel * v_color;
}
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

function makeSprite(draw) {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function drawZombieWalker(ctx) {
  rect(ctx, 6, 1, 4, 1, '#33402f');
  rect(ctx, 5, 2, 6, 2, '#6f805f');
  rect(ctx, 4, 3, 7, 2, '#8b9c78');
  rect(ctx, 8, 3, 3, 1, '#53614b');
  rect(ctx, 5, 5, 5, 1, '#67745a');
  rect(ctx, 6, 4, 1, 1, '#1b120f');
  rect(ctx, 9, 4, 1, 1, '#b3121d');
  rect(ctx, 7, 6, 3, 1, '#2b1715');
  rect(ctx, 10, 5, 1, 2, '#5a120f');
  rect(ctx, 4, 6, 8, 2, '#383d3e');
  rect(ctx, 3, 8, 10, 3, '#2e3335');
  rect(ctx, 8, 8, 1, 3, '#9b8a67');
  rect(ctx, 10, 8, 1, 2, '#9b8a67');
  rect(ctx, 7, 9, 4, 1, '#3d1717');
  rect(ctx, 2, 7, 2, 4, '#718460');
  rect(ctx, 1, 10, 2, 2, '#566549');
  rect(ctx, 12, 8, 2, 2, '#7c8e69');
  rect(ctx, 13, 10, 1, 3, '#46513e');
  rect(ctx, 5, 11, 2, 4, '#2d2424');
  rect(ctx, 8, 11, 2, 3, '#221c1d');
  rect(ctx, 9, 14, 3, 1, '#151617');
  rect(ctx, 4, 14, 2, 1, '#151617');
}

function drawZombieRunner(ctx) {
  rect(ctx, 7, 1, 4, 1, '#34402e');
  rect(ctx, 6, 2, 5, 2, '#708262');
  rect(ctx, 5, 3, 5, 2, '#8fa47a');
  rect(ctx, 9, 3, 3, 1, '#52604a');
  rect(ctx, 7, 4, 1, 1, '#d11d25');
  rect(ctx, 10, 4, 1, 1, '#261411');
  rect(ctx, 8, 5, 3, 1, '#3d1715');
  rect(ctx, 4, 6, 8, 2, '#6f2028');
  rect(ctx, 3, 8, 9, 2, '#561a22');
  rect(ctx, 6, 7, 2, 1, '#a34b3e');
  rect(ctx, 2, 6, 3, 1, '#7b8f66');
  rect(ctx, 1, 7, 2, 2, '#5d6b50');
  rect(ctx, 12, 7, 2, 3, '#7f946d');
  rect(ctx, 13, 10, 2, 1, '#556447');
  rect(ctx, 5, 10, 2, 5, '#202328');
  rect(ctx, 8, 10, 2, 3, '#2b2e34');
  rect(ctx, 10, 12, 2, 3, '#1c1d22');
  rect(ctx, 4, 14, 3, 1, '#111317');
  rect(ctx, 10, 14, 3, 1, '#111317');
}

function drawCrawler(ctx) {
  rect(ctx, 4, 6, 5, 2, '#718560');
  rect(ctx, 3, 7, 6, 2, '#8ca276');
  rect(ctx, 5, 7, 1, 1, '#a9151d');
  rect(ctx, 8, 7, 1, 1, '#24120f');
  rect(ctx, 6, 8, 3, 1, '#3e1715');
  rect(ctx, 6, 9, 8, 2, '#303537');
  rect(ctx, 4, 10, 10, 2, '#252a2d');
  rect(ctx, 7, 10, 1, 2, '#9b8a67');
  rect(ctx, 9, 10, 1, 2, '#9b8a67');
  rect(ctx, 11, 11, 2, 1, '#5e1719');
  rect(ctx, 2, 9, 3, 1, '#6d805f');
  rect(ctx, 1, 10, 2, 2, '#536348');
  rect(ctx, 12, 8, 2, 1, '#7d9169');
  rect(ctx, 14, 8, 1, 3, '#4e5e45');
  rect(ctx, 5, 12, 2, 2, '#291f20');
  rect(ctx, 8, 12, 3, 1, '#181a1d');
  rect(ctx, 11, 13, 3, 1, '#151618');
}

const spriteSources = {
  solid: makeSprite((ctx) => rect(ctx, 0, 0, TILE, TILE, '#ffffff')),
  penguin: makeSprite((ctx) => {
    rect(ctx, 6, 1, 4, 1, '#ffd86f');
    rect(ctx, 5, 2, 6, 2, '#0d1820');
    rect(ctx, 4, 4, 8, 6, '#111d26');
    rect(ctx, 5, 5, 6, 4, '#e8f2f6');
    rect(ctx, 3, 6, 2, 3, '#111d26');
    rect(ctx, 11, 6, 2, 3, '#111d26');
    rect(ctx, 12, 5, 3, 2, '#5d6a72');
    rect(ctx, 14, 6, 2, 1, '#2a3238');
    rect(ctx, 5, 12, 2, 2, '#ff9e43');
    rect(ctx, 9, 12, 2, 2, '#ff9e43');
    rect(ctx, 6, 3, 1, 1, '#0b0b0b');
    rect(ctx, 9, 3, 1, 1, '#0b0b0b');
    rect(ctx, 7, 5, 2, 1, '#ffb347');
  }),
  zombieWalker: makeSprite(drawZombieWalker),
  zombieRunner: makeSprite(drawZombieRunner),
  crawler: makeSprite(drawCrawler),
  bullet: makeSprite((ctx) => {
    rect(ctx, 8, 5, 5, 2, '#f8e38a');
    rect(ctx, 6, 6, 3, 2, '#f0c452');
    rect(ctx, 12, 5, 2, 2, '#fff5c5');
    rect(ctx, 5, 6, 1, 1, '#ff8e3c');
  }),
  roadA: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#2d3035');
    rect(ctx, 1, 2, 2, 1, '#393d44');
    rect(ctx, 10, 5, 3, 1, '#3d4147');
    rect(ctx, 6, 13, 2, 1, '#202328');
  }),
  roadB: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#30343a');
    rect(ctx, 4, 3, 1, 2, '#23262b');
    rect(ctx, 12, 10, 2, 1, '#40444b');
    rect(ctx, 8, 8, 3, 1, '#25292f');
  }),
  sidewalkA: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#5a5f67');
    rect(ctx, 0, 7, 16, 1, '#737983');
    rect(ctx, 7, 0, 1, 16, '#737983');
    rect(ctx, 2, 2, 1, 1, '#4c5058');
    rect(ctx, 12, 12, 1, 1, '#4c5058');
  }),
  sidewalkB: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#616772');
    rect(ctx, 0, 7, 16, 1, '#757c86');
    rect(ctx, 7, 0, 1, 16, '#757c86');
    rect(ctx, 3, 10, 2, 1, '#52565f');
    rect(ctx, 11, 4, 1, 2, '#52565f');
  }),
  blood: makeSprite((ctx) => {
    rect(ctx, 5, 6, 5, 3, '#5f0d14');
    rect(ctx, 4, 7, 7, 2, '#7f101a');
    rect(ctx, 6, 5, 2, 1, '#8b111b');
    rect(ctx, 10, 8, 2, 1, '#48080d');
  }),
  debris: makeSprite((ctx) => {
    rect(ctx, 5, 5, 6, 5, '#7e633f');
    rect(ctx, 4, 6, 2, 3, '#4d3a26');
    rect(ctx, 10, 6, 2, 3, '#4d3a26');
    rect(ctx, 6, 10, 4, 2, '#2a2d31');
  }),
  barricade: makeSprite((ctx) => {
    rect(ctx, 2, 8, 12, 2, '#9e6e32');
    rect(ctx, 4, 5, 2, 8, '#7d4e24');
    rect(ctx, 10, 5, 2, 8, '#7d4e24');
    rect(ctx, 2, 6, 12, 1, '#c88f46');
  }),
  shadow: makeSprite((ctx) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(8, 10, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }),
};

function buildRuntimeAtlas(sources) {
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_SIZE;
  atlasCanvas.height = ATLAS_SIZE;
  const ctx = atlasCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  const sprites = {};
  const margin = 1;
  let x = margin;
  let y = margin;
  let rowHeight = 0;

  for (const [name, source] of Object.entries(sources)) {
    if (x + source.width + margin > ATLAS_SIZE) {
      x = margin;
      y += rowHeight + margin;
      rowHeight = 0;
    }
    if (y + source.height + margin > ATLAS_SIZE) {
      throw new Error('Runtime atlas is full. Increase ATLAS_SIZE.');
    }
    ctx.drawImage(source, x, y);
    sprites[name] = {
      x,
      y,
      w: source.width,
      h: source.height,
      u0: x / ATLAS_SIZE,
      v0: y / ATLAS_SIZE,
      u1: (x + source.width) / ATLAS_SIZE,
      v1: (y + source.height) / ATLAS_SIZE,
    };
    x += source.width + margin;
    rowHeight = Math.max(rowHeight, source.height);
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { canvas: atlasCanvas, texture, sprites };
}

const atlas = buildRuntimeAtlas(spriteSources);
const program = createProgram(vertexShaderSource, fragmentShaderSource);
const locations = {
  position: gl.getAttribLocation(program, 'a_position'),
  uv: gl.getAttribLocation(program, 'a_uv'),
  color: gl.getAttribLocation(program, 'a_color'),
  resolution: gl.getUniformLocation(program, 'u_resolution'),
  camera: gl.getUniformLocation(program, 'u_camera'),
  texture: gl.getUniformLocation(program, 'u_texture'),
};

const floatsPerVertex = 8;
const verticesPerQuad = 6;
const vertexData = new Float32Array(MAX_QUADS * verticesPerQuad * floatsPerVertex);
const vertexBuffer = gl.createBuffer();
let quadCount = 0;

function pushQuad(spriteName, x, y, w, h, color = [1, 1, 1, 1], flipX = false) {
  if (quadCount >= MAX_QUADS) return;
  const sprite = atlas.sprites[spriteName];
  const u0 = flipX ? sprite.u1 : sprite.u0;
  const u1 = flipX ? sprite.u0 : sprite.u1;
  const v0 = sprite.v0;
  const v1 = sprite.v1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.floor(x + w);
  const y1 = Math.floor(y + h);
  const [r, g, b, a] = color;
  const offset = quadCount * verticesPerQuad * floatsPerVertex;
  vertexData.set([
    x0, y0, u0, v0, r, g, b, a,
    x1, y0, u1, v0, r, g, b, a,
    x0, y1, u0, v1, r, g, b, a,
    x0, y1, u0, v1, r, g, b, a,
    x1, y0, u1, v0, r, g, b, a,
    x1, y1, u1, v1, r, g, b, a,
  ], offset);
  quadCount += 1;
}

function beginRender() {
  quadCount = 0;
}

function flush(cameraX, cameraY) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.05, 0.06, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(locations.resolution, view.width, view.height);
  gl.uniform2f(locations.camera, cameraX, cameraY);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
  gl.uniform1i(locations.texture, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertexData.subarray(0, quadCount * verticesPerQuad * floatsPerVertex), gl.DYNAMIC_DRAW);

  const stride = floatsPerVertex * 4;
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.uv);
  gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(locations.color);
  gl.vertexAttribPointer(locations.color, 4, gl.FLOAT, false, stride, 4 * 4);

  gl.drawArrays(gl.TRIANGLES, 0, quadCount * verticesPerQuad);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function distanceSq(x, y) {
  return x * x + y * y;
}

function overlaps(x1, y1, r1, x2, y2, r2) {
  const radius = r1 + r2;
  return distanceSq(x1 - x2, y1 - y2) < radius * radius;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function gridKey(cellX, cellY) {
  return cellX + cellY * GRID_ROW_STRIDE;
}

function gridCell(value) {
  return Math.floor(value / GRID_CELL_SIZE);
}

function addEnemyToGrid(enemy) {
  const key = gridKey(gridCell(enemy.x), gridCell(enemy.y));
  let bucket = enemyGrid.get(key);
  if (!bucket) {
    bucket = [];
    enemyGrid.set(key, bucket);
  }
  bucket.push(enemy);
}

function rebuildEnemyGrid() {
  enemyGrid.clear();
  for (const enemy of enemies) {
    if (!enemy.dead) addEnemyToGrid(enemy);
  }
}

function findProjectileHit(shot) {
  const minCellX = gridCell(shot.x - PROJECTILE_QUERY_RADIUS);
  const maxCellX = gridCell(shot.x + PROJECTILE_QUERY_RADIUS);
  const minCellY = gridCell(shot.y - PROJECTILE_QUERY_RADIUS);
  const maxCellY = gridCell(shot.y + PROJECTILE_QUERY_RADIUS);

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const bucket = enemyGrid.get(gridKey(cellX, cellY));
      if (!bucket) continue;
      for (const enemy of bucket) {
        if (enemy.dead || shot.hit.has(enemy.id)) continue;
        if (overlaps(shot.x, shot.y, shot.r, enemy.x, enemy.y, enemy.r)) return enemy;
      }
    }
  }
  return null;
}

function compactDeadEnemies() {
  let write = 0;
  for (let read = 0; read < enemies.length; read += 1) {
    if (!enemies[read].dead) enemies[write++] = enemies[read];
  }
  enemies.length = write;
}

function getGroundSprite(tx, ty) {
  const mx = mod(tx, 8);
  const my = mod(ty, 8);
  const road = mx === 3 || mx === 4 || my === 3 || my === 4;
  const h = hash2(tx, ty);
  if (road) return (h & 1) === 0 ? 'roadA' : 'roadB';
  return (h & 1) === 0 ? 'sidewalkA' : 'sidewalkB';
}

function isRoadTile(tx, ty) {
  const mx = mod(tx, 8);
  const my = mod(ty, 8);
  return mx === 3 || mx === 4 || my === 3 || my === 4;
}

function drawCityDecals(tx, ty) {
  const h = hash2(tx, ty);
  if (isRoadTile(tx, ty)) {
    if (h % 27 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1, 1, 1, 0.8]);
    else if (h % 61 === 0) pushQuad('barricade', tx * TILE, ty * TILE, TILE, TILE);
  } else if (h % 17 === 0) pushQuad('debris', tx * TILE, ty * TILE, TILE, TILE);
  else if (h % 41 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1, 1, 1, 0.85]);
}

const player = {
  x: WORLD_SIZE / 2,
  y: WORLD_SIZE / 2,
  r: 12,
  hp: 100,
  maxHp: 100,
  speed: 180,
  skillPoints: 0,
  totalSkillPoints: 0,
  fireCooldown: 0,
  fireRate: 0.38,
  projectileDamage: 15,
  projectileSpeed: 540,
  shotCount: 1,
  pierce: 0,
  facing: 1,
  invuln: 0,
};

const enemies = [];
const projectiles = [];
let elapsed = 0;
let spawnTimer = 0;
let score = 0;
let gameOver = false;
let messageTimer = 4;
let message = 'Kill zombies to earn skill points. Open Skill Tree with T.';

const skillNodes = [
  { id: 'damage1', branch: 'ATK', name: 'Rifled Barrel I', desc: 'Damage +5', cost: 1, req: [], apply: () => { player.projectileDamage += 5; } },
  { id: 'damage2', branch: 'ATK', name: 'Rifled Barrel II', desc: 'Damage +7', cost: 2, req: ['damage1'], apply: () => { player.projectileDamage += 7; } },
  { id: 'damage3', branch: 'ATK', name: 'Heavy Rounds', desc: 'Damage +10', cost: 3, req: ['damage2'], apply: () => { player.projectileDamage += 10; } },
  { id: 'speed1', branch: 'SPD', name: 'Hair Trigger I', desc: 'Fire interval -12%', cost: 1, req: [], apply: () => { player.fireRate = Math.max(0.1, player.fireRate * 0.88); } },
  { id: 'speed2', branch: 'SPD', name: 'Hair Trigger II', desc: 'Fire interval -14%', cost: 2, req: ['speed1'], apply: () => { player.fireRate = Math.max(0.1, player.fireRate * 0.86); } },
  { id: 'speed3', branch: 'SPD', name: 'Auto Sear', desc: 'Fire interval -16%', cost: 3, req: ['speed2'], apply: () => { player.fireRate = Math.max(0.08, player.fireRate * 0.84); } },
  { id: 'bullets1', branch: 'AMMO', name: 'Side Magazine I', desc: 'Bullets +1', cost: 2, req: [], apply: () => { player.shotCount += 1; } },
  { id: 'bullets2', branch: 'AMMO', name: 'Side Magazine II', desc: 'Bullets +1', cost: 3, req: ['bullets1'], apply: () => { player.shotCount += 1; } },
  { id: 'bullets3', branch: 'AMMO', name: 'Wide Volley', desc: 'Bullets +1', cost: 4, req: ['bullets2', 'speed2'], apply: () => { player.shotCount += 1; } },
  { id: 'pierce1', branch: 'CORE', name: 'Piercing Tips', desc: 'Pierce +1', cost: 3, req: ['damage2', 'bullets1'], apply: () => { player.pierce += 1; } },
  { id: 'pierce2', branch: 'CORE', name: 'Hardened Core', desc: 'Pierce +1, Speed +40', cost: 4, req: ['pierce1'], apply: () => { player.pierce += 1; player.projectileSpeed += 40; } },
];
const unlockedSkills = new Set();

function canUnlockSkill(skill) {
  return !unlockedSkills.has(skill.id)
    && player.skillPoints >= skill.cost
    && skill.req.every((id) => unlockedSkills.has(id));
}

function unlockSkill(id) {
  const skill = skillNodes.find((node) => node.id === id);
  if (!skill || !canUnlockSkill(skill)) return;
  player.skillPoints -= skill.cost;
  unlockedSkills.add(skill.id);
  skill.apply();
  message = `${skill.name} unlocked: ${skill.desc}`;
  messageTimer = 3;
  renderSkillTree();
}

function createSkillTreeUI() {
  const toggle = document.createElement('button');
  toggle.className = 'skill-tree-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Skill Tree';
  toggle.addEventListener('click', () => toggleSkillTree());
  document.body.appendChild(toggle);

  const overlay = document.createElement('div');
  overlay.className = 'skill-tree hidden';
  overlay.innerHTML = `
    <div class="skill-tree-panel">
      <div class="skill-tree-header">
        <div>
          <div class="skill-tree-title">Penguin Skill Tree</div>
          <div class="skill-tree-points"></div>
        </div>
        <button class="skill-tree-close" type="button">×</button>
      </div>
      <div class="skill-tree-grid"></div>
      <div class="skill-tree-footer">Kill zombies to earn points. Unlock connected nodes. Press T to close.</div>
    </div>
  `;
  overlay.querySelector('.skill-tree-close').addEventListener('click', closeSkillTree);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeSkillTree();
  });
  document.body.appendChild(overlay);
  return { overlay, grid: overlay.querySelector('.skill-tree-grid'), points: overlay.querySelector('.skill-tree-points'), toggle };
}

const skillTreeUI = createSkillTreeUI();

function openSkillTree() {
  skillTreeOpen = true;
  skillTreeUI.overlay.classList.remove('hidden');
  renderSkillTree();
}

function closeSkillTree() {
  skillTreeOpen = false;
  skillTreeUI.overlay.classList.add('hidden');
}

function toggleSkillTree() {
  if (skillTreeOpen) closeSkillTree();
  else openSkillTree();
}

function renderSkillTree() {
  skillTreeUI.points.textContent = `Skill Points: ${player.skillPoints} / Total Earned: ${player.totalSkillPoints}`;
  skillTreeUI.grid.innerHTML = '';

  const branches = ['ATK', 'SPD', 'AMMO', 'CORE'];
  for (const branch of branches) {
    const column = document.createElement('div');
    column.className = 'skill-tree-branch';
    column.innerHTML = `<div class="skill-tree-branch-title">${branch}</div>`;
    for (const skill of skillNodes.filter((node) => node.branch === branch)) {
      const unlocked = unlockedSkills.has(skill.id);
      const available = canUnlockSkill(skill);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `skill-node ${unlocked ? 'unlocked' : available ? 'available' : 'locked'}`;
      button.disabled = unlocked || !available;
      button.innerHTML = `
        <span class="skill-node-name">${skill.name}</span>
        <span class="skill-node-desc">${skill.desc}</span>
        <span class="skill-node-cost">Cost ${skill.cost}${skill.req.length ? ` · Req ${skill.req.length}` : ''}</span>
      `;
      button.addEventListener('click', () => unlockSkill(skill.id));
      column.appendChild(button);
    }
    skillTreeUI.grid.appendChild(column);
  }
}

function spawnEnemy() {
  const angle = rand(0, Math.PI * 2);
  const spawnRadius = Math.max(view.width, view.height) * 0.72 + rand(100, 320);
  let type = 'zombieWalker';
  const roll = Math.random();
  if (roll > 0.82) type = 'zombieRunner';
  if (roll > 0.94) type = 'crawler';

  const waveScale = 1 + elapsed / 180;
  const defs = {
    zombieWalker: { r: 11, hp: 28, speed: rand(42, 60), damage: 10, points: 1 },
    zombieRunner: { r: 9, hp: 18, speed: rand(86, 108), damage: 8, points: 1 },
    crawler: { r: 8, hp: 22, speed: rand(56, 72), damage: 11, points: 2 },
  };
  const def = defs[type];
  enemies.push({
    id: nextEnemyId++,
    x: clamp(player.x + Math.cos(angle) * spawnRadius, 32, WORLD_SIZE - 32),
    y: clamp(player.y + Math.sin(angle) * spawnRadius, 32, WORLD_SIZE - 32),
    r: def.r,
    hp: def.hp * waveScale,
    maxHp: def.hp * waveScale,
    speed: def.speed * (1 + elapsed / 420),
    damage: def.damage,
    points: def.points,
    sprite: type,
    dead: false,
  });
}

function fireProjectile() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const d = distanceSq(enemy.x - player.x, enemy.y - player.y);
    if (d < nearestDistance) {
      nearest = enemy;
      nearestDistance = d;
    }
  }
  if (!nearest) return;

  const base = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  const count = player.shotCount;
  const spread = count === 1 ? 0 : Math.min(0.82, 0.16 * (count - 1));

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = base + t * spread;
    const vx = Math.cos(angle) * player.projectileSpeed;
    const vy = Math.sin(angle) * player.projectileSpeed;
    projectiles.push({
      x: player.x + Math.cos(angle) * 10,
      y: player.y - 14 + Math.sin(angle) * 4,
      vx,
      vy,
      r: 6,
      damage: player.projectileDamage,
      pierce: player.pierce,
      hit: new Set(),
      life: 1.0,
    });
  }
}

function awardSkillPoints(enemy) {
  const points = enemy.points || 1;
  player.skillPoints += points;
  player.totalSkillPoints += points;
  message = `Skill point +${points}. Press T to unlock upgrades.`;
  messageTimer = 2.3;
  renderSkillTree();
}

function update(dt) {
  if (gameOver || skillTreeOpen) return;
  elapsed += dt;
  messageTimer = Math.max(0, messageTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  let mx = 0;
  let my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  const movement = normalize(mx, my);
  if (mx !== 0 || my !== 0) {
    player.x += movement.x * player.speed * dt;
    player.y += movement.y * player.speed * dt;
    player.facing = movement.x < 0 ? -1 : movement.x > 0 ? 1 : player.facing;
  }
  player.x = clamp(player.x, 24, WORLD_SIZE - 24);
  player.y = clamp(player.y, 24, WORLD_SIZE - 24);

  spawnTimer -= dt;
  const spawnInterval = Math.max(0.1, 0.72 - elapsed / 240);
  if (spawnTimer <= 0 && enemies.length < MAX_ENEMIES) {
    spawnTimer = spawnInterval;
    const count = elapsed > 120 ? 5 : elapsed > 75 ? 4 : elapsed > 35 ? 2 : 1;
    for (let i = 0; i < count && enemies.length < MAX_ENEMIES; i += 1) spawnEnemy();
  }

  player.fireCooldown -= dt;
  if (player.fireCooldown <= 0) {
    player.fireCooldown = player.fireRate;
    fireProjectile();
  }

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.x += dir.x * enemy.speed * dt;
    enemy.y += dir.y * enemy.speed * dt;
    if (overlaps(player.x, player.y, player.r, enemy.x, enemy.y, enemy.r) && player.invuln <= 0) {
      player.hp -= enemy.damage;
      player.invuln = 0.42;
      if (player.hp <= 0) {
        player.hp = 0;
        gameOver = true;
        message = 'Game Over - refresh to restart the penguin.';
        messageTimer = 999;
      }
    }
  }

  rebuildEnemyGrid();
  let killedEnemy = false;
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const shot = projectiles[i];
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    let consumed = shot.life <= 0;
    if (!consumed) {
      const enemy = findProjectileHit(shot);
      if (enemy) {
        enemy.hp -= shot.damage;
        shot.hit.add(enemy.id);
        if (enemy.hp <= 0) {
          enemy.dead = true;
          killedEnemy = true;
          score += 1;
          awardSkillPoints(enemy);
        }
        if (shot.pierce > 0) shot.pierce -= 1;
        else consumed = true;
      }
    }
    if (consumed) projectiles.splice(i, 1);
  }
  if (killedEnemy) compactDeadEnemies();
}

function drawBar(x, y, w, h, value, backColor, fillColor) {
  pushQuad('solid', x, y, w, h, backColor);
  pushQuad('solid', x, y, Math.max(1, w * clamp(value, 0, 1)), h, fillColor);
}

function drawGroundedSprite(sprite, x, footY, size, color = [1, 1, 1, 1], flipX = false) {
  pushQuad(sprite, x - size / 2, footY - size, size, size, color, flipX);
}

function render() {
  const cameraX = Math.floor(player.x - view.width / 2);
  const cameraY = Math.floor(player.y - view.height / 2);
  beginRender();

  const startTileX = Math.floor(cameraX / TILE) - 1;
  const startTileY = Math.floor(cameraY / TILE) - 1;
  const endTileX = Math.ceil((cameraX + view.width) / TILE) + 1;
  const endTileY = Math.ceil((cameraY + view.height) / TILE) + 1;
  for (let ty = startTileY; ty <= endTileY; ty += 1) {
    for (let tx = startTileX; tx <= endTileX; tx += 1) {
      pushQuad(getGroundSprite(tx, ty), tx * TILE, ty * TILE, TILE, TILE);
      drawCityDecals(tx, ty);
    }
  }

  for (const shot of projectiles) pushQuad('bullet', shot.x - 8, shot.y - 8, 16, 16);

  const actors = [...enemies, player].sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    const isPlayer = actor === player;
    const size = isPlayer ? 30 : actor.sprite === 'zombieRunner' ? 24 : actor.sprite === 'crawler' ? 22 : 28;
    pushQuad('shadow', actor.x - size * 0.42, actor.y - size * 0.12, size * 0.84, size * 0.28, [1, 1, 1, 0.42]);
    const tint = isPlayer && player.invuln > 0 ? [1, 0.55, 0.55, 1] : [1, 1, 1, 1];
    drawGroundedSprite(isPlayer ? 'penguin' : actor.sprite, actor.x, actor.y, size, tint, isPlayer && player.facing < 0);
    if (!isPlayer && actor.hp < actor.maxHp) {
      drawBar(actor.x - 11, actor.y - size - 5, 22, 3, actor.hp / actor.maxHp, [0.12, 0.04, 0.04, 1], [0.85, 0.14, 0.14, 1]);
    }
  }

  const uiX = cameraX + 18;
  const uiY = cameraY + 18;
  drawBar(uiX, uiY, 190, 9, player.hp / player.maxHp, [0.15, 0.03, 0.03, 1], [0.92, 0.16, 0.18, 1]);

  flush(cameraX, cameraY);

  hud.innerHTML = `
    <div class="hud-row"><strong>Penguin Outbreak</strong></div>
    <div>HP ${Math.ceil(player.hp)}/${player.maxHp} | SP ${player.skillPoints} | ATK ${player.projectileDamage} | Fire ${player.fireRate.toFixed(2)}s | Bullets x${player.shotCount} | Pierce ${player.pierce}</div>
    <div>Kills ${score} | Zombies ${enemies.length}/${MAX_ENEMIES} | Time ${Math.floor(elapsed)}s</div>
    <div class="hint ${messageTimer > 0 ? '' : 'hidden'}">${message}</div>
  `;
  skillTreeUI.toggle.textContent = `Skill Tree (${player.skillPoints})`;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  const width = Math.floor(view.width * dpr);
  const height = Math.floor(view.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
  }
}

const hud = document.createElement('div');
hud.className = 'hud';
document.body.appendChild(hud);

const atlasPreview = document.createElement('details');
atlasPreview.className = 'atlas-preview';
atlasPreview.innerHTML = '<summary>runtime atlas</summary>';
atlasPreview.appendChild(atlas.canvas);
document.body.appendChild(atlasPreview);

renderSkillTree();
window.addEventListener('resize', resize);
resize();

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  resize();
  update(dt);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
