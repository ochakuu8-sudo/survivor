import './styles.css';
import './level-up.css';
import './loot.css';

const canvas = document.querySelector('#game');
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
if (!gl) throw new Error('WebGL is not supported by this browser.');

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const TILE = 16;
const ATLAS_SIZE = 512;
const WORLD_SIZE = 3200;
const MAX_QUADS = 85000;
const DPR_LIMIT = 2;
const GRID_CELL_SIZE = 96;
const GRID_ROW_STRIDE = 2048;
const MAX_ENEMIES = 1400;
const PROJECTILE_QUERY_RADIUS = 52;
const MAX_GEMS = 900;
const MAX_CHESTS = 4;
const MAX_WEAPONS = 3;

const keys = new Set();
const view = { width: 1, height: 1 };
const enemyGrid = new Map();
let nextEnemyId = 1;
let levelUpOpen = false;
let queuedLevelUps = 0;
let chestOpen = false;
let chestSpawnTimer = 7;
let currentChest = null;
let offeredWeapon = null;

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
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
}`;

const fragmentShaderSource = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec4 texel = texture2D(u_texture, v_uv);
  if (texel.a < 0.05) discard;
  gl_FragColor = texel * v_color;
}`;

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
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mod(n, m) { return ((n % m) + m) % m; }

const spriteSources = {
  solid: makeSprite((ctx) => rect(ctx, 0, 0, TILE, TILE, '#ffffff')),
  penguin: makeSprite((ctx) => {
    rect(ctx, 6, 1, 4, 1, '#ffd86f'); rect(ctx, 5, 2, 6, 2, '#0d1820');
    rect(ctx, 4, 4, 8, 6, '#111d26'); rect(ctx, 5, 5, 6, 4, '#e8f2f6');
    rect(ctx, 3, 6, 2, 3, '#111d26'); rect(ctx, 11, 6, 2, 3, '#111d26');
    rect(ctx, 12, 5, 3, 2, '#5d6a72'); rect(ctx, 14, 6, 2, 1, '#2a3238');
    rect(ctx, 5, 12, 2, 2, '#ff9e43'); rect(ctx, 9, 12, 2, 2, '#ff9e43');
    rect(ctx, 6, 3, 1, 1, '#0b0b0b'); rect(ctx, 9, 3, 1, 1, '#0b0b0b'); rect(ctx, 7, 5, 2, 1, '#ffb347');
  }),
  zombieWalker: makeSprite((ctx) => {
    rect(ctx, 6, 1, 4, 1, '#33402f'); rect(ctx, 5, 2, 6, 2, '#6f805f'); rect(ctx, 4, 3, 7, 2, '#8b9c78'); rect(ctx, 9, 4, 1, 1, '#b3121d');
    rect(ctx, 7, 6, 3, 1, '#2b1715'); rect(ctx, 4, 6, 8, 2, '#383d3e'); rect(ctx, 3, 8, 10, 3, '#2e3335');
    rect(ctx, 2, 7, 2, 4, '#718460'); rect(ctx, 12, 8, 2, 2, '#7c8e69'); rect(ctx, 5, 11, 2, 4, '#2d2424'); rect(ctx, 8, 11, 2, 3, '#221c1d');
    rect(ctx, 9, 14, 3, 1, '#151617'); rect(ctx, 4, 14, 2, 1, '#151617');
  }),
  zombieRunner: makeSprite((ctx) => {
    rect(ctx, 7, 1, 4, 1, '#34402e'); rect(ctx, 6, 2, 5, 2, '#708262'); rect(ctx, 5, 3, 5, 2, '#8fa47a'); rect(ctx, 7, 4, 1, 1, '#d11d25');
    rect(ctx, 4, 6, 8, 2, '#6f2028'); rect(ctx, 3, 8, 9, 2, '#561a22'); rect(ctx, 1, 7, 2, 2, '#5d6b50'); rect(ctx, 12, 7, 2, 3, '#7f946d');
    rect(ctx, 5, 10, 2, 5, '#202328'); rect(ctx, 8, 10, 2, 3, '#2b2e34'); rect(ctx, 10, 12, 2, 3, '#1c1d22');
    rect(ctx, 4, 14, 3, 1, '#111317'); rect(ctx, 10, 14, 3, 1, '#111317');
  }),
  crawler: makeSprite((ctx) => {
    rect(ctx, 4, 6, 5, 2, '#718560'); rect(ctx, 3, 7, 6, 2, '#8ca276'); rect(ctx, 5, 7, 1, 1, '#a9151d');
    rect(ctx, 6, 9, 8, 2, '#303537'); rect(ctx, 4, 10, 10, 2, '#252a2d'); rect(ctx, 7, 10, 1, 2, '#9b8a67'); rect(ctx, 9, 10, 1, 2, '#9b8a67');
    rect(ctx, 1, 10, 2, 2, '#536348'); rect(ctx, 12, 8, 2, 1, '#7d9169'); rect(ctx, 14, 8, 1, 3, '#4e5e45'); rect(ctx, 11, 13, 3, 1, '#151618');
  }),
  bullet: makeSprite((ctx) => { rect(ctx, 8, 5, 5, 2, '#f8e38a'); rect(ctx, 6, 6, 3, 2, '#f0c452'); rect(ctx, 12, 5, 2, 2, '#fff5c5'); rect(ctx, 5, 6, 1, 1, '#ff8e3c'); }),
  xpGem: makeSprite((ctx) => { rect(ctx, 7, 2, 2, 2, '#d9fbff'); rect(ctx, 5, 4, 6, 2, '#78e6ff'); rect(ctx, 4, 6, 8, 3, '#26aeea'); rect(ctx, 6, 9, 4, 3, '#126fae'); rect(ctx, 7, 12, 2, 2, '#073b68'); }),
  chest: makeSprite((ctx) => { rect(ctx, 3, 6, 10, 7, '#7b4a21'); rect(ctx, 4, 4, 8, 3, '#b06d2a'); rect(ctx, 7, 4, 2, 9, '#e0bc58'); rect(ctx, 6, 8, 4, 2, '#2d1c12'); rect(ctx, 1, 12, 14, 2, '#20130c'); }),
  roadA: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#2d3035'); rect(ctx, 1, 2, 2, 1, '#393d44'); rect(ctx, 10, 5, 3, 1, '#3d4147'); rect(ctx, 6, 13, 2, 1, '#202328'); }),
  roadB: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#30343a'); rect(ctx, 4, 3, 1, 2, '#23262b'); rect(ctx, 12, 10, 2, 1, '#40444b'); rect(ctx, 8, 8, 3, 1, '#25292f'); }),
  sidewalkA: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#5a5f67'); rect(ctx, 0, 7, 16, 1, '#737983'); rect(ctx, 7, 0, 1, 16, '#737983'); rect(ctx, 2, 2, 1, 1, '#4c5058'); }),
  sidewalkB: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#616772'); rect(ctx, 0, 7, 16, 1, '#757c86'); rect(ctx, 7, 0, 1, 16, '#757c86'); rect(ctx, 3, 10, 2, 1, '#52565f'); }),
  blood: makeSprite((ctx) => { rect(ctx, 5, 6, 5, 3, '#5f0d14'); rect(ctx, 4, 7, 7, 2, '#7f101a'); rect(ctx, 10, 8, 2, 1, '#48080d'); }),
  debris: makeSprite((ctx) => { rect(ctx, 5, 5, 6, 5, '#7e633f'); rect(ctx, 4, 6, 2, 3, '#4d3a26'); rect(ctx, 10, 6, 2, 3, '#4d3a26'); rect(ctx, 6, 10, 4, 2, '#2a2d31'); }),
  barricade: makeSprite((ctx) => { rect(ctx, 2, 8, 12, 2, '#9e6e32'); rect(ctx, 4, 5, 2, 8, '#7d4e24'); rect(ctx, 10, 5, 2, 8, '#7d4e24'); }),
  shadow: makeSprite((ctx) => { ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; ctx.beginPath(); ctx.ellipse(8, 10, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }),
};

function buildRuntimeAtlas(sources) {
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_SIZE;
  atlasCanvas.height = ATLAS_SIZE;
  const ctx = atlasCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = {};
  const margin = 1;
  let x = margin;
  let y = margin;
  let rowHeight = 0;
  for (const [name, source] of Object.entries(sources)) {
    if (x + source.width + margin > ATLAS_SIZE) { x = margin; y += rowHeight + margin; rowHeight = 0; }
    if (y + source.height + margin > ATLAS_SIZE) throw new Error('Runtime atlas is full. Increase ATLAS_SIZE.');
    ctx.drawImage(source, x, y);
    sprites[name] = { x, y, w: source.width, h: source.height, u0: x / ATLAS_SIZE, v0: y / ATLAS_SIZE, u1: (x + source.width) / ATLAS_SIZE, v1: (y + source.height) / ATLAS_SIZE };
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
const locations = { position: gl.getAttribLocation(program, 'a_position'), uv: gl.getAttribLocation(program, 'a_uv'), color: gl.getAttribLocation(program, 'a_color'), resolution: gl.getUniformLocation(program, 'u_resolution'), camera: gl.getUniformLocation(program, 'u_camera'), texture: gl.getUniformLocation(program, 'u_texture') };
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
  vertexData.set([x0,y0,u0,v0,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x1,y1,u1,v1,r,g,b,a], offset);
  quadCount += 1;
}
function beginRender() { quadCount = 0; }
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

function rand(min, max) { return Math.random() * (max - min) + min; }
function distance(x, y) { return Math.hypot(x, y); }
function distanceSq(x, y) { return x * x + y * y; }
function overlaps(x1, y1, r1, x2, y2, r2) { const radius = r1 + r2; return distanceSq(x1 - x2, y1 - y2) < radius * radius; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function normalize(x, y) { const len = Math.hypot(x, y) || 1; return { x: x / len, y: y / len }; }
function gridKey(cellX, cellY) { return cellX + cellY * GRID_ROW_STRIDE; }
function gridCell(value) { return Math.floor(value / GRID_CELL_SIZE); }
function addEnemyToGrid(enemy) { const key = gridKey(gridCell(enemy.x), gridCell(enemy.y)); let bucket = enemyGrid.get(key); if (!bucket) { bucket = []; enemyGrid.set(key, bucket); } bucket.push(enemy); }
function rebuildEnemyGrid() { enemyGrid.clear(); for (const enemy of enemies) if (!enemy.dead) addEnemyToGrid(enemy); }
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
function compactDeadEnemies() { let write = 0; for (let read = 0; read < enemies.length; read += 1) if (!enemies[read].dead) enemies[write++] = enemies[read]; enemies.length = write; }
function getGroundSprite(tx, ty) { const mx = mod(tx, 8); const my = mod(ty, 8); const road = mx === 3 || mx === 4 || my === 3 || my === 4; const h = hash2(tx, ty); return road ? ((h & 1) === 0 ? 'roadA' : 'roadB') : ((h & 1) === 0 ? 'sidewalkA' : 'sidewalkB'); }
function isRoadTile(tx, ty) { const mx = mod(tx, 8); const my = mod(ty, 8); return mx === 3 || mx === 4 || my === 3 || my === 4; }
function drawCityDecals(tx, ty) { const h = hash2(tx, ty); if (isRoadTile(tx, ty)) { if (h % 27 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1,1,1,0.8]); else if (h % 61 === 0) pushQuad('barricade', tx * TILE, ty * TILE, TILE, TILE); } else if (h % 17 === 0) pushQuad('debris', tx * TILE, ty * TILE, TILE, TILE); else if (h % 41 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1,1,1,0.85]); }

const weaponDefs = {
  rifle: { name: 'Penguin Rifle', damage: 9, fireRate: 0.92, speed: 500, shots: 1, pierce: 0, spread: 0.0 },
  smg: { name: 'Snow SMG', damage: 5, fireRate: 0.34, speed: 460, shots: 1, pierce: 0, spread: 0.0 },
  shotgun: { name: 'Fishbone Shotgun', damage: 7, fireRate: 1.35, speed: 430, shots: 4, pierce: 0, spread: 0.72 },
  sniper: { name: 'Harpoon Rifle', damage: 18, fireRate: 1.65, speed: 720, shots: 1, pierce: 1, spread: 0.0 },
  burst: { name: 'Burst Carbine', damage: 7, fireRate: 0.78, speed: 560, shots: 2, pierce: 0, spread: 0.22 },
};
function createWeapon(id) { const def = weaponDefs[id]; return { id, name: def.name, level: 1, damage: def.damage, fireRate: def.fireRate, speed: def.speed, shots: def.shots, pierce: def.pierce, spread: def.spread, cooldown: rand(0, def.fireRate) }; }
const player = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: 12, hp: 100, maxHp: 100, speed: 180, xp: 0, nextXp: 9, level: 1, pickupRange: 96, facing: 1, invuln: 0, weapons: [createWeapon('rifle')] };
const enemies = [], projectiles = [], xpGems = [], chests = [];
let elapsed = 0, spawnTimer = 0, score = 0, gameOver = false, messageTimer = 4;
let message = 'Defeat zombies, collect XP, and level up your equipped weapons.';

const upgradeTemplates = [
  { label: 'Damage +3', apply: (w) => { w.damage += 3; } },
  { label: 'Fire Rate +10%', apply: (w) => { w.fireRate = Math.max(0.12, w.fireRate * 0.9); } },
  { label: 'Bullet Speed +35', apply: (w) => { w.speed += 35; } },
  { label: 'Pierce +1', apply: (w) => { w.pierce += 1; } },
  { label: 'Volley +1', apply: (w) => { w.shots = Math.min(8, w.shots + 1); w.spread = Math.max(w.spread, 0.18 * (w.shots - 1)); } },
];
function randomWeaponId() { const ids = Object.keys(weaponDefs); return ids[Math.floor(Math.random() * ids.length)]; }

function createLevelUpUI() { const overlay = document.createElement('div'); overlay.className = 'level-up hidden'; overlay.innerHTML = `<div class="level-up-panel"><div class="level-up-kicker">LEVEL UP</div><div class="level-up-title">Choose weapon upgrade</div><div class="level-up-subtitle">Stats are applied to the selected weapon.</div><div class="level-up-options"></div></div>`; document.body.appendChild(overlay); return { overlay, options: overlay.querySelector('.level-up-options') }; }
function createChestUI() { const overlay = document.createElement('div'); overlay.className = 'loot-choice hidden'; overlay.innerHTML = `<div class="loot-panel"><div class="loot-kicker">WEAPON CHEST</div><div class="loot-title"></div><div class="loot-detail"></div><div class="loot-slots"></div><button class="loot-discard" type="button">Discard</button></div>`; document.body.appendChild(overlay); overlay.querySelector('.loot-discard').addEventListener('click', discardChestWeapon); return { overlay, title: overlay.querySelector('.loot-title'), detail: overlay.querySelector('.loot-detail'), slots: overlay.querySelector('.loot-slots') }; }
const levelUpUI = createLevelUpUI();
const chestUI = createChestUI();

function openLevelUp() { levelUpOpen = true; levelUpUI.options.innerHTML = ''; const choices = []; for (let i = 0; i < 12 && choices.length < 3; i += 1) { const weapon = player.weapons[Math.floor(Math.random() * player.weapons.length)]; const template = upgradeTemplates[Math.floor(Math.random() * upgradeTemplates.length)]; const key = `${weapon.name}-${template.label}`; if (!choices.some((choice) => choice.key === key)) choices.push({ key, weapon, template }); } while (choices.length < 3) { const weapon = player.weapons[choices.length % player.weapons.length]; const template = upgradeTemplates[choices.length % upgradeTemplates.length]; choices.push({ key: `${weapon.name}-${template.label}-${choices.length}`, weapon, template }); } for (const choice of choices) { const button = document.createElement('button'); button.type = 'button'; button.className = 'level-up-card weapon-upgrade'; button.innerHTML = `<span class="level-up-card-name">${choice.weapon.name}</span><span class="level-up-card-desc">${choice.template.label}</span><span class="level-up-card-detail">Current Lv.${choice.weapon.level}. This upgrade levels this weapon only.</span>`; button.addEventListener('click', () => chooseWeaponUpgrade(choice)); levelUpUI.options.appendChild(button); } levelUpUI.overlay.classList.remove('hidden'); }
function closeLevelUp() { levelUpOpen = false; levelUpUI.overlay.classList.add('hidden'); }
function chooseWeaponUpgrade(choice) { choice.template.apply(choice.weapon); choice.weapon.level += 1; message = `${choice.weapon.name} Lv.${choice.weapon.level}: ${choice.template.label}`; messageTimer = 3; closeLevelUp(); if (queuedLevelUps > 0) { queuedLevelUps -= 1; requestAnimationFrame(openLevelUp); } }
function gainXp(amount) { player.xp += amount; while (player.xp >= player.nextXp) { player.xp -= player.nextXp; player.level += 1; player.nextXp = Math.floor(player.nextXp * 1.28 + 7); queuedLevelUps += 1; } if (queuedLevelUps > 0 && !levelUpOpen && !chestOpen) { queuedLevelUps -= 1; openLevelUp(); } }

function openChest(chest) { currentChest = chest; offeredWeapon = createWeapon(randomWeaponId()); chestOpen = true; chestUI.title.textContent = offeredWeapon.name; chestUI.detail.textContent = `Lv.${offeredWeapon.level} · DMG ${offeredWeapon.damage} · Fire ${offeredWeapon.fireRate.toFixed(2)}s · Shots ${offeredWeapon.shots} · Pierce ${offeredWeapon.pierce}`; renderChestSlots(); chestUI.overlay.classList.remove('hidden'); }
function closeChest() { chestOpen = false; chestUI.overlay.classList.add('hidden'); currentChest = null; offeredWeapon = null; if (queuedLevelUps > 0 && !levelUpOpen) { queuedLevelUps -= 1; requestAnimationFrame(openLevelUp); } }
function removeCurrentChest() { if (!currentChest) return; const index = chests.indexOf(currentChest); if (index >= 0) chests.splice(index, 1); }
function renderChestSlots() { chestUI.slots.innerHTML = ''; for (let i = 0; i < MAX_WEAPONS; i += 1) { const existing = player.weapons[i]; const button = document.createElement('button'); button.type = 'button'; button.className = `loot-slot ${existing ? 'replace' : 'empty'}`; button.innerHTML = existing ? `<span>Replace Slot ${i + 1}</span><strong>${existing.name}</strong><em>Lv.${existing.level}</em>` : `<span>Equip Slot ${i + 1}</span><strong>Empty</strong><em>New weapon</em>`; button.addEventListener('click', () => equipOfferedWeapon(i)); chestUI.slots.appendChild(button); } }
function equipOfferedWeapon(slotIndex) { if (!offeredWeapon) return; player.weapons[slotIndex] = offeredWeapon; message = `Equipped ${offeredWeapon.name}.`; messageTimer = 3; removeCurrentChest(); closeChest(); }
function discardChestWeapon() { message = `${offeredWeapon?.name || 'Weapon'} discarded.`; messageTimer = 2; removeCurrentChest(); closeChest(); }
function spawnChest(forceNear = false) { if (chests.length >= MAX_CHESTS) return; const angle = rand(0, Math.PI * 2); const radius = forceNear ? rand(300, 520) : rand(520, 980); chests.push({ x: clamp(player.x + Math.cos(angle) * radius, 48, WORLD_SIZE - 48), y: clamp(player.y + Math.sin(angle) * radius, 48, WORLD_SIZE - 48), r: 18 }); }
function spawnEnemy() { const angle = rand(0, Math.PI * 2), spawnRadius = Math.max(view.width, view.height) * 0.72 + rand(100, 320); let type = 'zombieWalker'; const roll = Math.random(); if (roll > 0.82) type = 'zombieRunner'; if (roll > 0.94) type = 'crawler'; const waveScale = 1 + elapsed / 180; const defs = { zombieWalker: { r: 11, hp: 28, speed: rand(42, 60), damage: 10, xp: 3 }, zombieRunner: { r: 9, hp: 18, speed: rand(86, 108), damage: 8, xp: 4 }, crawler: { r: 8, hp: 22, speed: rand(56, 72), damage: 11, xp: 5 } }; const def = defs[type]; enemies.push({ id: nextEnemyId++, x: clamp(player.x + Math.cos(angle) * spawnRadius, 32, WORLD_SIZE - 32), y: clamp(player.y + Math.sin(angle) * spawnRadius, 32, WORLD_SIZE - 32), r: def.r, hp: def.hp * waveScale, maxHp: def.hp * waveScale, speed: def.speed * (1 + elapsed / 420), damage: def.damage, xp: def.xp, sprite: type, dead: false }); }
function findNearestEnemy() { let nearest = null, nearestDistance = Infinity; for (const enemy of enemies) { if (enemy.dead) continue; const d = distanceSq(enemy.x - player.x, enemy.y - player.y); if (d < nearestDistance) { nearest = enemy; nearestDistance = d; } } return nearest; }
function fireWeapon(weapon) { const nearest = findNearestEnemy(); if (!nearest) return; const base = Math.atan2(nearest.y - player.y, nearest.x - player.x); const count = weapon.shots; const spread = count === 1 ? 0 : Math.max(weapon.spread, 0.16 * (count - 1)); for (let i = 0; i < count; i += 1) { const t = count === 1 ? 0 : i / (count - 1) - 0.5; const angle = base + t * spread; projectiles.push({ x: player.x + Math.cos(angle) * 10, y: player.y - 14 + Math.sin(angle) * 4, vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed, r: 6, damage: weapon.damage, pierce: weapon.pierce, hit: new Set(), life: 1.0 }); } }
function dropXpGem(enemy) { if (xpGems.length > MAX_GEMS) xpGems.shift(); xpGems.push({ x: enemy.x, y: enemy.y, value: enemy.xp, r: 7 }); }

function update(dt) { if (gameOver || levelUpOpen || chestOpen) return; elapsed += dt; messageTimer = Math.max(0, messageTimer - dt); player.invuln = Math.max(0, player.invuln - dt); let mx = 0, my = 0; if (keys.has('w') || keys.has('arrowup')) my -= 1; if (keys.has('s') || keys.has('arrowdown')) my += 1; if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1; const movement = normalize(mx, my); if (mx !== 0 || my !== 0) { player.x += movement.x * player.speed * dt; player.y += movement.y * player.speed * dt; player.facing = movement.x < 0 ? -1 : movement.x > 0 ? 1 : player.facing; } player.x = clamp(player.x, 24, WORLD_SIZE - 24); player.y = clamp(player.y, 24, WORLD_SIZE - 24); spawnTimer -= dt; const spawnInterval = Math.max(0.1, 0.72 - elapsed / 240); if (spawnTimer <= 0 && enemies.length < MAX_ENEMIES) { spawnTimer = spawnInterval; const count = elapsed > 120 ? 5 : elapsed > 75 ? 4 : elapsed > 35 ? 2 : 1; for (let i = 0; i < count && enemies.length < MAX_ENEMIES; i += 1) spawnEnemy(); } chestSpawnTimer -= dt; if (chestSpawnTimer <= 0) { chestSpawnTimer = rand(14, 26); spawnChest(false); } if (chests.length === 0 && elapsed > 8) spawnChest(true); for (const chest of chests) if (overlaps(player.x, player.y - 8, player.r + 10, chest.x, chest.y, chest.r)) { openChest(chest); break; } for (const weapon of player.weapons) { weapon.cooldown -= dt; if (weapon.cooldown <= 0) { weapon.cooldown = weapon.fireRate; fireWeapon(weapon); } } for (const enemy of enemies) { if (enemy.dead) continue; const dir = normalize(player.x - enemy.x, player.y - enemy.y); enemy.x += dir.x * enemy.speed * dt; enemy.y += dir.y * enemy.speed * dt; if (overlaps(player.x, player.y, player.r, enemy.x, enemy.y, enemy.r) && player.invuln <= 0) { player.hp -= enemy.damage; player.invuln = 0.42; if (player.hp <= 0) { player.hp = 0; gameOver = true; message = 'Game Over - refresh to restart the penguin.'; messageTimer = 999; } } } rebuildEnemyGrid(); let killedEnemy = false; for (let i = projectiles.length - 1; i >= 0; i -= 1) { const shot = projectiles[i]; shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; let consumed = shot.life <= 0; if (!consumed) { const enemy = findProjectileHit(shot); if (enemy) { enemy.hp -= shot.damage; shot.hit.add(enemy.id); if (enemy.hp <= 0) { enemy.dead = true; killedEnemy = true; score += 1; dropXpGem(enemy); } if (shot.pierce > 0) shot.pierce -= 1; else consumed = true; } } if (consumed) projectiles.splice(i, 1); } if (killedEnemy) compactDeadEnemies(); for (let i = xpGems.length - 1; i >= 0; i -= 1) { const gem = xpGems[i], d = distance(player.x - gem.x, player.y - gem.y); if (d < player.pickupRange) { const dir = normalize(player.x - gem.x, player.y - gem.y); const pull = 1200 / Math.max(28, d); gem.x += dir.x * pull * 96 * dt; gem.y += dir.y * pull * 96 * dt; } if (d < player.r + gem.r) { gainXp(gem.value); xpGems.splice(i, 1); } } }
function drawBar(x, y, w, h, value, backColor, fillColor) { pushQuad('solid', x, y, w, h, backColor); pushQuad('solid', x, y, Math.max(1, w * clamp(value, 0, 1)), h, fillColor); }
function drawGroundedSprite(sprite, x, footY, size, color = [1, 1, 1, 1], flipX = false) { pushQuad(sprite, x - size / 2, footY - size, size, size, color, flipX); }
function render() { const cameraX = Math.floor(player.x - view.width / 2), cameraY = Math.floor(player.y - view.height / 2); beginRender(); const startTileX = Math.floor(cameraX / TILE) - 1, startTileY = Math.floor(cameraY / TILE) - 1, endTileX = Math.ceil((cameraX + view.width) / TILE) + 1, endTileY = Math.ceil((cameraY + view.height) / TILE) + 1; for (let ty = startTileY; ty <= endTileY; ty += 1) for (let tx = startTileX; tx <= endTileX; tx += 1) { pushQuad(getGroundSprite(tx, ty), tx * TILE, ty * TILE, TILE, TILE); drawCityDecals(tx, ty); } for (const chest of chests) { pushQuad('shadow', chest.x - 13, chest.y - 5, 26, 10, [1,1,1,0.32]); pushQuad('chest', chest.x - 14, chest.y - 24, 28, 28); } for (const gem of xpGems) { pushQuad('shadow', gem.x - 10, gem.y - 4, 20, 8, [1,1,1,0.28]); pushQuad('xpGem', gem.x - 8, gem.y - 18, 16, 16); } for (const shot of projectiles) pushQuad('bullet', shot.x - 8, shot.y - 8, 16, 16); const actors = [...enemies, player].sort((a, b) => a.y - b.y); for (const actor of actors) { const isPlayer = actor === player, size = isPlayer ? 30 : actor.sprite === 'zombieRunner' ? 24 : actor.sprite === 'crawler' ? 22 : 28; pushQuad('shadow', actor.x - size * 0.42, actor.y - size * 0.12, size * 0.84, size * 0.28, [1,1,1,0.42]); const tint = isPlayer && player.invuln > 0 ? [1,0.55,0.55,1] : [1,1,1,1]; drawGroundedSprite(isPlayer ? 'penguin' : actor.sprite, actor.x, actor.y, size, tint, isPlayer && player.facing < 0); } const uiX = cameraX + 18, uiY = cameraY + 18; drawBar(uiX, uiY, 190, 9, player.hp / player.maxHp, [0.15,0.03,0.03,1], [0.92,0.16,0.18,1]); drawBar(uiX, uiY + 14, 190, 7, player.xp / player.nextXp, [0.05,0.08,0.15,1], [0.18,0.78,1,1]); flush(cameraX, cameraY); }
function resize() { const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT); view.width = window.innerWidth; view.height = window.innerHeight; const width = Math.floor(view.width * dpr), height = Math.floor(view.height * dpr); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`; } }
const atlasPreview = document.createElement('details'); atlasPreview.className = 'atlas-preview'; atlasPreview.innerHTML = '<summary>runtime atlas</summary>'; atlasPreview.appendChild(atlas.canvas); document.body.appendChild(atlasPreview);
window.addEventListener('resize', resize); resize();
let lastTime = performance.now();
function frame(now) { const dt = Math.min(0.033, (now - lastTime) / 1000); lastTime = now; resize(); update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
