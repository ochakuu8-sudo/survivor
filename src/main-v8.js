import './styles.css';
import './shop.css';

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
const MAX_SCRAP_GEMS = 900;
const MAX_WEAPONS = 3;

const keys = new Set();
const view = { width: 1, height: 1 };
const enemyGrid = new Map();
let nextEnemyId = 1;

let state = 'wave';
let wave = 1;
let waveTime = 0;
let waveDuration = 22;
let scrap = 0;
let runKills = 0;
let message = 'Survive the wave. Collect Scrap. Buy upgrades in the shop.';
let messageTimer = 5;

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
  scrap: makeSprite((ctx) => { rect(ctx, 6, 3, 4, 2, '#e8e0b0'); rect(ctx, 4, 5, 8, 5, '#9fa6a8'); rect(ctx, 5, 10, 6, 2, '#626b70'); rect(ctx, 7, 6, 2, 2, '#ffe27a'); }),
  roadA: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#2d3035'); rect(ctx, 1, 2, 2, 1, '#393d44'); rect(ctx, 10, 5, 3, 1, '#3d4147'); rect(ctx, 6, 13, 2, 1, '#202328'); }),
  roadB: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#30343a'); rect(ctx, 4, 3, 1, 2, '#23262b'); rect(ctx, 12, 10, 2, 1, '#40444b'); rect(ctx, 8, 8, 3, 1, '#25292f'); }),
  sidewalkA: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#5a5f67'); rect(ctx, 0, 7, 16, 1, '#737983'); rect(ctx, 7, 0, 1, 16, '#737983'); rect(ctx, 2, 2, 1, 1, '#4c5058'); }),
  sidewalkB: makeSprite((ctx) => { rect(ctx, 0, 0, 16, 16, '#616772'); rect(ctx, 0, 7, 16, 1, '#757c86'); rect(ctx, 7, 0, 1, 16, '#757c86'); rect(ctx, 3, 10, 2, 1, '#52565f'); }),
  blood: makeSprite((ctx) => { rect(ctx, 5, 6, 5, 3, '#5f0d14'); rect(ctx, 4, 7, 7, 2, '#7f101a'); rect(ctx, 10, 8, 2, 1, '#48080d'); }),
  debris: makeSprite((ctx) => { rect(ctx, 5, 5, 6, 5, '#7e633f'); rect(ctx, 4, 6, 2, 3, '#4d3a26'); rect(ctx, 10, 6, 2, 3, '#4d3a26'); rect(ctx, 6, 10, 4, 2, '#2a2d31'); }),
  barricade: makeSprite((ctx) => { rect(ctx, 2, 8, 12, 2, '#9e6e32'); rect(ctx, 4, 5, 2, 8, '#7d4e24'); rect(ctx, 10, 5, 2, 8, '#7d4e24'); }),
  shadow: makeSprite((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(8, 10, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }),
};

function buildRuntimeAtlas(sources) {
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_SIZE;
  atlasCanvas.height = ATLAS_SIZE;
  const ctx = atlasCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = {};
  let x = 1, y = 1, rowHeight = 0;
  for (const [name, source] of Object.entries(sources)) {
    if (x + source.width + 1 > ATLAS_SIZE) { x = 1; y += rowHeight + 1; rowHeight = 0; }
    if (y + source.height + 1 > ATLAS_SIZE) throw new Error('Runtime atlas is full. Increase ATLAS_SIZE.');
    ctx.drawImage(source, x, y);
    sprites[name] = { x, y, w: source.width, h: source.height, u0: x / ATLAS_SIZE, v0: y / ATLAS_SIZE, u1: (x + source.width) / ATLAS_SIZE, v1: (y + source.height) / ATLAS_SIZE };
    x += source.width + 1;
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
const floatsPerVertex = 8, verticesPerQuad = 6;
const vertexData = new Float32Array(MAX_QUADS * verticesPerQuad * floatsPerVertex);
const vertexBuffer = gl.createBuffer();
let quadCount = 0;
function pushQuad(spriteName, x, y, w, h, color = [1,1,1,1], flipX = false) {
  if (quadCount >= MAX_QUADS) return;
  const sprite = atlas.sprites[spriteName];
  const u0 = flipX ? sprite.u1 : sprite.u0, u1 = flipX ? sprite.u0 : sprite.u1;
  const v0 = sprite.v0, v1 = sprite.v1;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.floor(x + w), y1 = Math.floor(y + h);
  const [r,g,b,a] = color;
  const offset = quadCount * verticesPerQuad * floatsPerVertex;
  vertexData.set([x0,y0,u0,v0,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x1,y1,u1,v1,r,g,b,a], offset);
  quadCount += 1;
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
  gl.enableVertexAttribArray(locations.position); gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.uv); gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(locations.color); gl.vertexAttribPointer(locations.color, 4, gl.FLOAT, false, stride, 4 * 4);
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
  const minCellX = gridCell(shot.x - PROJECTILE_QUERY_RADIUS), maxCellX = gridCell(shot.x + PROJECTILE_QUERY_RADIUS);
  const minCellY = gridCell(shot.y - PROJECTILE_QUERY_RADIUS), maxCellY = gridCell(shot.y + PROJECTILE_QUERY_RADIUS);
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    const bucket = enemyGrid.get(gridKey(cellX, cellY));
    if (!bucket) continue;
    for (const enemy of bucket) if (!enemy.dead && overlaps(shot.x, shot.y, shot.r, enemy.x, enemy.y, enemy.r)) return enemy;
  }
  return null;
}
function compactDeadEnemies() { let write = 0; for (let read = 0; read < enemies.length; read += 1) if (!enemies[read].dead) enemies[write++] = enemies[read]; enemies.length = write; }
function getGroundSprite(tx, ty) { const mx = mod(tx, 8), my = mod(ty, 8), road = mx === 3 || mx === 4 || my === 3 || my === 4, h = hash2(tx, ty); return road ? ((h & 1) === 0 ? 'roadA' : 'roadB') : ((h & 1) === 0 ? 'sidewalkA' : 'sidewalkB'); }
function isRoadTile(tx, ty) { const mx = mod(tx, 8), my = mod(ty, 8); return mx === 3 || mx === 4 || my === 3 || my === 4; }
function drawCityDecals(tx, ty) { const h = hash2(tx, ty); if (isRoadTile(tx, ty)) { if (h % 27 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1,1,1,0.8]); else if (h % 61 === 0) pushQuad('barricade', tx * TILE, ty * TILE, TILE, TILE); } else if (h % 17 === 0) pushQuad('debris', tx * TILE, ty * TILE, TILE, TILE); else if (h % 41 === 0) pushQuad('blood', tx * TILE, ty * TILE, TILE, TILE, [1,1,1,0.85]); }

const player = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: 12, hp: 100, maxHp: 100, speed: 180, pickupRange: 92, facing: 1, invuln: 0 };
const stats = { damage: 9, fireRate: 0.92, bulletSpeed: 500, bullets: 1, pierce: 0 };
const enemies = [], projectiles = [], scrapGems = [];
let waveTimer = 0, spawnTimer = 0, waveKills = 0, nextEnemyId = 1;

const shop = {
  wave: 1,
  scrap: 0,
  rerollCost: 5,
  offers: [],
};

const shopItems = [
  { name: 'Hollow Point', desc: '+4 Damage', baseCost: 18, buy: () => { stats.damage += 4; } },
  { name: 'Quick Trigger', desc: '-10% Fire Interval', baseCost: 20, buy: () => { stats.fireRate = Math.max(0.15, stats.fireRate * 0.9); } },
  { name: 'Extra Magazine', desc: '+1 Bullet', baseCost: 32, buy: () => { stats.bullets = Math.min(8, stats.bullets + 1); } },
  { name: 'Piercing Rounds', desc: '+1 Pierce', baseCost: 28, buy: () => { stats.pierce += 1; } },
  { name: 'Hot Load Ammo', desc: '+45 Bullet Speed', baseCost: 16, buy: () => { stats.bulletSpeed += 45; } },
  { name: 'Street Sense', desc: '+28 Pickup Range', baseCost: 14, buy: () => { player.pickupRange += 28; } },
  { name: 'Emergency Ration', desc: '+15 Max HP, Heal 35', baseCost: 22, buy: () => { player.maxHp += 15; player.hp = Math.min(player.maxHp, player.hp + 35); } },
  { name: 'Running Shoes', desc: '+8 Move Speed', baseCost: 18, buy: () => { player.speed += 8; } },
];

function createShopUI() {
  const overlay = document.createElement('div');
  overlay.className = 'shop-screen hidden';
  overlay.innerHTML = `
    <div class="shop-panel">
      <div class="shop-header">
        <div>
          <div class="shop-kicker">WAVE COMPLETE</div>
          <div class="shop-title">Scrap Shop</div>
        </div>
        <div class="shop-wallet"></div>
      </div>
      <div class="shop-summary"></div>
      <div class="shop-offers"></div>
      <div class="shop-actions">
        <button class="shop-reroll" type="button">Reroll</button>
        <button class="shop-next" type="button">Next Wave</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.shop-reroll').addEventListener('click', rerollShop);
  overlay.querySelector('.shop-next').addEventListener('click', startNextWave);
  return { overlay, wallet: overlay.querySelector('.shop-wallet'), summary: overlay.querySelector('.shop-summary'), offers: overlay.querySelector('.shop-offers'), reroll: overlay.querySelector('.shop-reroll') };
}
const shopUI = createShopUI();

function waveDurationFor(wave) { return Math.min(60, 18 + wave * 4); }
function rollShop() {
  shop.offers = [...shopItems].sort(() => Math.random() - 0.5).slice(0, 4).map((item) => ({ ...item, cost: Math.floor(item.baseCost * (1 + shop.wave * 0.08)) }));
}
function renderShop() {
  shopUI.wallet.textContent = `Scrap ${shop.scrap}`;
  shopUI.summary.textContent = `Wave ${shop.wave} cleared · Kills ${waveKills} · HP ${Math.ceil(player.hp)}/${player.maxHp}`;
  shopUI.offers.innerHTML = '';
  for (const offer of shop.offers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shop-card ${shop.scrap >= offer.cost ? 'affordable' : 'expensive'}`;
    button.innerHTML = `<strong>${offer.name}</strong><span>${offer.desc}</span><em>${offer.cost} Scrap</em>`;
    button.disabled = shop.scrap < offer.cost;
    button.addEventListener('click', () => buyOffer(offer));
    shopUI.offers.appendChild(button);
  }
  shopUI.reroll.textContent = `Reroll (${shop.rerollCost})`;
  shopUI.reroll.disabled = shop.scrap < shop.rerollCost;
}
function openShop() { state = 'shop'; rollShop(); renderShop(); shopUI.overlay.classList.remove('hidden'); }
function closeShop() { shopUI.overlay.classList.add('hidden'); }
function buyOffer(offer) { if (shop.scrap < offer.cost) return; shop.scrap -= offer.cost; offer.buy(); shop.offers = shop.offers.filter((item) => item !== offer); renderShop(); }
function rerollShop() { if (shop.scrap < shop.rerollCost) return; shop.scrap -= shop.rerollCost; shop.rerollCost += 2; rollShop(); renderShop(); }
function startNextWave() { closeShop(); shop.wave += 1; shop.rerollCost = 5 + Math.floor(shop.wave / 2); waveKills = 0; projectiles.length = 0; scrapGems.length = 0; waveTimer = waveDurationFor(shop.wave); state = 'wave'; }

function spawnEnemy() {
  const angle = rand(0, Math.PI * 2), spawnRadius = Math.max(view.width, view.height) * 0.72 + rand(100, 320);
  let type = 'zombieWalker'; const roll = Math.random(); if (roll > 0.82) type = 'zombieRunner'; if (roll > 0.94) type = 'crawler';
  const waveScale = 1 + shop.wave * 0.12;
  const defs = { zombieWalker: { r: 11, hp: 24, speed: rand(42, 60), damage: 10, scrap: 3 }, zombieRunner: { r: 9, hp: 16, speed: rand(86, 108), damage: 8, scrap: 4 }, crawler: { r: 8, hp: 19, speed: rand(56, 72), damage: 11, scrap: 5 } };
  const def = defs[type];
  enemies.push({ id: nextEnemyId++, x: clamp(player.x + Math.cos(angle) * spawnRadius, 32, WORLD_SIZE - 32), y: clamp(player.y + Math.sin(angle) * spawnRadius, 32, WORLD_SIZE - 32), r: def.r, hp: def.hp * waveScale, maxHp: def.hp * waveScale, speed: def.speed * (1 + shop.wave / 30), damage: def.damage, scrap: def.scrap, sprite: type, dead: false });
}
function fireWeapon() {
  let nearest = null, nearestDistance = Infinity;
  for (const enemy of enemies) { if (enemy.dead) continue; const d = distanceSq(enemy.x - player.x, enemy.y - player.y); if (d < nearestDistance) { nearest = enemy; nearestDistance = d; } }
  if (!nearest) return;
  const base = Math.atan2(nearest.y - player.y, nearest.x - player.x), count = stats.bullets, spread = count === 1 ? 0 : Math.min(0.9, 0.16 * (count - 1));
  for (let i = 0; i < count; i += 1) { const t = count === 1 ? 0 : i / (count - 1) - 0.5, angle = base + t * spread; projectiles.push({ x: player.x + Math.cos(angle) * 10, y: player.y - 14 + Math.sin(angle) * 4, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, r: 6, damage: stats.damage, pierce: stats.pierce, hit: new Set(), life: 1.0 }); }
}
function dropScrap(enemy) { if (scrapGems.length > MAX_SCRAP_GEMS) scrapGems.shift(); scrapGems.push({ x: enemy.x, y: enemy.y, value: enemy.scrap, r: 7 }); }
function collectAllScrap() { for (const gem of scrapGems) shop.scrap += gem.value; scrapGems.length = 0; }

function update(dt) {
  if (state !== 'wave') return;
  waveTimer -= dt;
  if (waveTimer <= 0) { collectAllScrap(); openShop(); return; }
  player.invuln = Math.max(0, player.invuln - dt);
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1; if (keys.has('s') || keys.has('arrowdown')) my += 1; if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1;
  const movement = normalize(mx, my);
  if (mx || my) { player.x += movement.x * player.speed * dt; player.y += movement.y * player.speed * dt; player.facing = movement.x < 0 ? -1 : movement.x > 0 ? 1 : player.facing; }
  player.x = clamp(player.x, 24, WORLD_SIZE - 24); player.y = clamp(player.y, 24, WORLD_SIZE - 24);
  spawnTimer -= dt; const spawnInterval = Math.max(0.12, 0.82 - shop.wave * 0.035); if (spawnTimer <= 0 && enemies.length < MAX_ENEMIES) { spawnTimer = spawnInterval; const count = shop.wave > 10 ? 4 : shop.wave > 5 ? 3 : shop.wave > 2 ? 2 : 1; for (let i = 0; i < count; i += 1) spawnEnemy(); }
  stats.cooldown = (stats.cooldown || 0) - dt; if (stats.cooldown <= 0) { stats.cooldown = stats.fireRate; fireWeapon(); }
  for (const enemy of enemies) { if (enemy.dead) continue; const dir = normalize(player.x - enemy.x, player.y - enemy.y); enemy.x += dir.x * enemy.speed * dt; enemy.y += dir.y * enemy.speed * dt; if (overlaps(player.x, player.y, player.r, enemy.x, enemy.y, enemy.r) && player.invuln <= 0) { player.hp -= enemy.damage; player.invuln = 0.42; if (player.hp <= 0) { player.hp = 0; state = 'gameover'; collectAllScrap(); openShop(); } } }
  rebuildEnemyGrid(); let killedEnemy = false;
  for (let i = projectiles.length - 1; i >= 0; i -= 1) { const shot = projectiles[i]; shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; let consumed = shot.life <= 0; if (!consumed) { const enemy = findProjectileHit(shot); if (enemy) { enemy.hp -= shot.damage; shot.hit.add(enemy.id); if (enemy.hp <= 0) { enemy.dead = true; killedEnemy = true; waveKills += 1; dropScrap(enemy); } if (shot.pierce > 0) shot.pierce -= 1; else consumed = true; } } if (consumed) projectiles.splice(i, 1); }
  if (killedEnemy) compactDeadEnemies();
  for (let i = scrapGems.length - 1; i >= 0; i -= 1) { const gem = scrapGems[i], d = distance(player.x - gem.x, player.y - gem.y); if (d < player.pickupRange) { const dir = normalize(player.x - gem.x, player.y - gem.y), pull = 1200 / Math.max(28, d); gem.x += dir.x * pull * 96 * dt; gem.y += dir.y * pull * 96 * dt; } if (d < player.r + gem.r) { shop.scrap += gem.value; scrapGems.splice(i, 1); } }
}
function drawBar(x, y, w, h, value, backColor, fillColor) { pushQuad('solid', x, y, w, h, backColor); pushQuad('solid', x, y, Math.max(1, w * clamp(value, 0, 1)), h, fillColor); }
function drawGroundedSprite(sprite, x, footY, size, color = [1,1,1,1], flipX = false) { pushQuad(sprite, x - size / 2, footY - size, size, size, color, flipX); }
function render() { const cameraX = Math.floor(player.x - view.width / 2), cameraY = Math.floor(player.y - view.height / 2); quadCount = 0; const startTileX = Math.floor(cameraX / TILE) - 1, startTileY = Math.floor(cameraY / TILE) - 1, endTileX = Math.ceil((cameraX + view.width) / TILE) + 1, endTileY = Math.ceil((cameraY + view.height) / TILE) + 1; for (let ty = startTileY; ty <= endTileY; ty += 1) for (let tx = startTileX; tx <= endTileX; tx += 1) { pushQuad(getGroundSprite(tx, ty), tx * TILE, ty * TILE, TILE, TILE); drawCityDecals(tx, ty); } for (const gem of scrapGems) { pushQuad('shadow', gem.x - 10, gem.y - 4, 20, 8, [1,1,1,0.28]); pushQuad('scrap', gem.x - 8, gem.y - 18, 16, 16); } for (const shot of projectiles) pushQuad('bullet', shot.x - 8, shot.y - 8, 16, 16); const actors = [...enemies, player].sort((a, b) => a.y - b.y); for (const actor of actors) { const isPlayer = actor === player, size = isPlayer ? 30 : actor.sprite === 'zombieRunner' ? 24 : actor.sprite === 'crawler' ? 22 : 28; pushQuad('shadow', actor.x - size * 0.42, actor.y - size * 0.12, size * 0.84, size * 0.28, [1,1,1,0.42]); const tint = isPlayer && player.invuln > 0 ? [1,0.55,0.55,1] : [1,1,1,1]; drawGroundedSprite(isPlayer ? 'penguin' : actor.sprite, actor.x, actor.y, size, tint, isPlayer && player.facing < 0); } const uiX = cameraX + 18, uiY = cameraY + 18; drawBar(uiX, uiY, 190, 9, player.hp / player.maxHp, [0.15,0.03,0.03,1], [0.92,0.16,0.18,1]); drawBar(uiX, uiY + 14, 190, 5, waveTimer / waveDuration, [0.12,0.1,0.04,1], [1,0.78,0.15,1]); flush(cameraX, cameraY); }
function resize() { const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT); view.width = window.innerWidth; view.height = window.innerHeight; const width = Math.floor(view.width * dpr), height = Math.floor(view.height * dpr); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`; } }
waveDuration = waveDurationFor(shop.wave); waveTimer = waveDuration;
function waveDurationFor(w) { return Math.min(60, 18 + w * 4); }
window.addEventListener('resize', resize); resize();
let lastTime = performance.now();
function frame(now) { const dt = Math.min(0.033, (now - lastTime) / 1000); lastTime = now; resize(); update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
