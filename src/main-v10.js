import './styles.css';
import './shop.css';

const canvas = document.querySelector('#game');
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
if (!gl) throw new Error('WebGL is not supported by this browser.');

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const TILE = 16;
const ATLAS_SIZE = 256;
const WORLD_SIZE = 3200;
const MAX_QUADS = 90000;
const DPR_LIMIT = 2;
const MAX_ENEMIES = 1000;
const MAX_SCRAP = 700;

const keys = new Set();
const view = { width: 1, height: 1 };
let nextEnemyId = 1;
let mode = 'wave';
let waveTimer = 22;
let spawnClock = 0;
let waveKills = 0;

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

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'Shader compile failed');
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || 'Program link failed');
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

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

const spriteSources = {
  solid: makeSprite((ctx) => px(ctx, 0, 0, 16, 16, '#ffffff')),
  penguin: makeSprite((ctx) => {
    px(ctx, 5, 2, 6, 2, '#0d1820');
    px(ctx, 4, 4, 8, 6, '#111d26');
    px(ctx, 5, 5, 6, 4, '#e8f2f6');
    px(ctx, 3, 6, 2, 3, '#111d26');
    px(ctx, 11, 6, 2, 3, '#111d26');
    px(ctx, 12, 5, 4, 2, '#5d6a72');
    px(ctx, 5, 12, 2, 2, '#ff9e43');
    px(ctx, 9, 12, 2, 2, '#ff9e43');
    px(ctx, 6, 3, 1, 1, '#000000');
    px(ctx, 9, 3, 1, 1, '#000000');
    px(ctx, 7, 5, 2, 1, '#ffb347');
  }),
  zombie: makeSprite((ctx) => {
    px(ctx, 5, 2, 6, 3, '#748762');
    px(ctx, 4, 5, 8, 3, '#8fa47a');
    px(ctx, 9, 4, 1, 1, '#b3121d');
    px(ctx, 4, 8, 8, 3, '#313638');
    px(ctx, 2, 8, 2, 4, '#718460');
    px(ctx, 12, 8, 2, 3, '#7c8e69');
    px(ctx, 5, 11, 2, 4, '#2d2424');
    px(ctx, 9, 11, 2, 4, '#221c1d');
  }),
  runner: makeSprite((ctx) => {
    px(ctx, 6, 2, 5, 3, '#708262');
    px(ctx, 7, 4, 1, 1, '#d11d25');
    px(ctx, 4, 6, 8, 4, '#6f2028');
    px(ctx, 1, 7, 2, 2, '#5d6b50');
    px(ctx, 12, 7, 2, 3, '#7f946d');
    px(ctx, 5, 10, 2, 5, '#202328');
    px(ctx, 9, 10, 2, 5, '#1c1d22');
  }),
  crawler: makeSprite((ctx) => {
    px(ctx, 3, 7, 6, 2, '#8ca276');
    px(ctx, 5, 7, 1, 1, '#a9151d');
    px(ctx, 6, 9, 8, 2, '#303537');
    px(ctx, 4, 10, 10, 2, '#252a2d');
    px(ctx, 1, 10, 2, 2, '#536348');
    px(ctx, 11, 13, 3, 1, '#151618');
  }),
  bullet: makeSprite((ctx) => {
    px(ctx, 8, 5, 5, 2, '#f8e38a');
    px(ctx, 6, 6, 3, 2, '#f0c452');
    px(ctx, 12, 5, 2, 2, '#fff5c5');
  }),
  scrap: makeSprite((ctx) => {
    px(ctx, 6, 3, 4, 2, '#e8e0b0');
    px(ctx, 4, 5, 8, 5, '#9fa6a8');
    px(ctx, 5, 10, 6, 2, '#626b70');
    px(ctx, 7, 6, 2, 2, '#ffe27a');
  }),
  roadA: makeSprite((ctx) => {
    px(ctx, 0, 0, 16, 16, '#2d3035');
    px(ctx, 2, 3, 2, 1, '#393d44');
    px(ctx, 10, 12, 3, 1, '#202328');
  }),
  roadB: makeSprite((ctx) => {
    px(ctx, 0, 0, 16, 16, '#30343a');
    px(ctx, 4, 3, 1, 2, '#23262b');
    px(ctx, 12, 10, 2, 1, '#40444b');
  }),
  walkA: makeSprite((ctx) => {
    px(ctx, 0, 0, 16, 16, '#5a5f67');
    px(ctx, 0, 7, 16, 1, '#737983');
    px(ctx, 7, 0, 1, 16, '#737983');
  }),
  walkB: makeSprite((ctx) => {
    px(ctx, 0, 0, 16, 16, '#616772');
    px(ctx, 0, 7, 16, 1, '#757c86');
    px(ctx, 7, 0, 1, 16, '#757c86');
  }),
  blood: makeSprite((ctx) => {
    px(ctx, 5, 6, 5, 3, '#5f0d14');
    px(ctx, 4, 7, 7, 2, '#7f101a');
  }),
  shadow: makeSprite((ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(8, 10, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }),
};

function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_SIZE;
  c.height = ATLAS_SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = {};
  let x = 1;
  let y = 1;
  let row = 0;
  for (const [name, img] of Object.entries(spriteSources)) {
    if (x + img.width + 1 > ATLAS_SIZE) {
      x = 1;
      y += row + 1;
      row = 0;
    }
    ctx.drawImage(img, x, y);
    sprites[name] = {
      u0: x / ATLAS_SIZE,
      v0: y / ATLAS_SIZE,
      u1: (x + img.width) / ATLAS_SIZE,
      v1: (y + img.height) / ATLAS_SIZE,
    };
    x += img.width + 1;
    row = Math.max(row, img.height);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { tex, sprites, canvas: c };
}

const atlas = buildAtlas();
const prog = createProgram();
const loc = {
  pos: gl.getAttribLocation(prog, 'a_position'),
  uv: gl.getAttribLocation(prog, 'a_uv'),
  col: gl.getAttribLocation(prog, 'a_color'),
  res: gl.getUniformLocation(prog, 'u_resolution'),
  cam: gl.getUniformLocation(prog, 'u_camera'),
  tex: gl.getUniformLocation(prog, 'u_texture'),
};
const buffer = gl.createBuffer();
const data = new Float32Array(MAX_QUADS * 6 * 8);
let quadCount = 0;

function quad(name, x, y, w, h, color = [1, 1, 1, 1], flip = false) {
  if (quadCount >= MAX_QUADS) return;
  const s = atlas.sprites[name];
  const u0 = flip ? s.u1 : s.u0;
  const u1 = flip ? s.u0 : s.u1;
  const v0 = s.v0;
  const v1 = s.v1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.floor(x + w);
  const y1 = Math.floor(y + h);
  const [r, g, b, a] = color;
  data.set([
    x0,y0,u0,v0,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x0,y1,u0,v1,r,g,b,a,
    x0,y1,u0,v1,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x1,y1,u1,v1,r,g,b,a,
  ], quadCount * 48);
  quadCount += 1;
}

function flush(cameraX, cameraY) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.05, 0.06, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniform2f(loc.res, view.width, view.height);
  gl.uniform2f(loc.cam, cameraX, cameraY);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
  gl.uniform1i(loc.tex, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, quadCount * 48), gl.DYNAMIC_DRAW);
  const stride = 32;
  gl.enableVertexAttribArray(loc.pos);
  gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(loc.uv);
  gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(loc.col);
  gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, stride, 16);
  gl.drawArrays(gl.TRIANGLES, 0, quadCount * 6);
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function length(x, y) { return Math.hypot(x, y); }
function norm(x, y) { const l = length(x, y) || 1; return { x: x / l, y: y / l }; }
function distSq(x, y) { return x * x + y * y; }
function isHit(a, b, r) { return distSq(a.x - b.x, a.y - b.y) < r * r; }
function waveDuration(w) { return Math.min(60, 18 + w * 4); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const player = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: 12, hp: 100, maxHp: 100, speed: 180, pickup: 92, inv: 0, facing: 1 };
const stats = { damage: 9, fireRate: 0.92, bulletSpeed: 500, bullets: 1, pierce: 0, cooldown: 0 };
const enemies = [];
const bullets = [];
const scraps = [];
const shop = { wave: 1, scrap: 0, rerollCost: 5, offers: [] };
let waveTimer = waveDuration(shop.wave);
let waveKills = 0;

const items = [
  { name: 'Hollow Point', desc: '+4 Damage', base: 18, buy: () => { stats.damage += 4; } },
  { name: 'Quick Trigger', desc: '-10% Fire Interval', base: 20, buy: () => { stats.fireRate = Math.max(0.15, stats.fireRate * 0.9); } },
  { name: 'Extra Magazine', desc: '+1 Bullet', base: 32, buy: () => { stats.bullets = Math.min(8, stats.bullets + 1); } },
  { name: 'Piercing Rounds', desc: '+1 Pierce', base: 28, buy: () => { stats.pierce += 1; } },
  { name: 'Hot Load Ammo', desc: '+45 Bullet Speed', base: 16, buy: () => { stats.bulletSpeed += 45; } },
  { name: 'Street Sense', desc: '+28 Pickup Range', base: 14, buy: () => { player.pickup += 28; } },
  { name: 'Emergency Ration', desc: '+15 Max HP, Heal 35', base: 22, buy: () => { player.maxHp += 15; player.hp = Math.min(player.maxHp, player.hp + 35); } },
  { name: 'Running Shoes', desc: '+8 Move Speed', base: 18, buy: () => { player.speed += 8; } },
];

function createShop() {
  const el = document.createElement('div');
  el.className = 'shop-screen hidden';
  el.innerHTML = '<div class="shop-panel"><div class="shop-header"><div><div class="shop-kicker">WAVE COMPLETE</div><div class="shop-title">Scrap Shop</div></div><div class="shop-wallet"></div></div><div class="shop-summary"></div><div class="shop-offers"></div><div class="shop-actions"><button class="shop-reroll" type="button">Reroll</button><button class="shop-next" type="button">Next Wave</button></div></div>';
  document.body.appendChild(el);
  const ui = {
    el,
    wallet: el.querySelector('.shop-wallet'),
    summary: el.querySelector('.shop-summary'),
    offers: el.querySelector('.shop-offers'),
    reroll: el.querySelector('.shop-reroll'),
    next: el.querySelector('.shop-next'),
  };
  ui.reroll.addEventListener('click', rerollShop);
  ui.next.addEventListener('click', nextWave);
  return ui;
}
const shopUi = createShop();

function rollShop() {
  shop.offers = [...items]
    .sort(() => Math.random() - 0.5)
    .slice(0, 4)
    .map((item) => ({ ...item, cost: Math.floor(item.base * (1 + shop.wave * 0.08)) }));
}
function renderShop() {
  shopUi.wallet.textContent = `Scrap ${shop.scrap}`;
  shopUi.summary.textContent = `Wave ${shop.wave} cleared · Kills ${waveKills} · HP ${Math.ceil(player.hp)}/${player.maxHp}`;
  shopUi.offers.innerHTML = '';
  for (const offer of shop.offers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shop-card ${shop.scrap >= offer.cost ? 'affordable' : 'expensive'}`;
    button.disabled = shop.scrap < offer.cost;
    button.innerHTML = `<strong>${offer.name}</strong><span>${offer.desc}</span><em>${offer.cost} Scrap</em>`;
    button.addEventListener('click', () => buyOffer(offer));
    shopUi.offers.appendChild(button);
  }
  shopUi.reroll.textContent = `Reroll (${shop.rerollCost})`;
  shopUi.reroll.disabled = shop.scrap < shop.rerollCost;
}
function openShop() {
  mode = 'shop';
  rollShop();
  renderShop();
  shopUi.el.classList.remove('hidden');
}
function buyOffer(offer) {
  if (shop.scrap < offer.cost) return;
  shop.scrap -= offer.cost;
  offer.buy();
  shop.offers = shop.offers.filter((item) => item !== offer);
  renderShop();
}
function rerollShop() {
  if (shop.scrap < shop.rerollCost) return;
  shop.scrap -= shop.rerollCost;
  shop.rerollCost += 2;
  rollShop();
  renderShop();
}
function nextWave() {
  shopUi.el.classList.add('hidden');
  mode = 'wave';
  shop.wave += 1;
  shop.rerollCost = 5 + Math.floor(shop.wave / 2);
  waveKills = 0;
  bullets.length = 0;
  scraps.length = 0;
  waveTimer = waveDuration(shop.wave);
  enemies.length = 0;
}

function spawnEnemy() {
  const angle = rand(0, Math.PI * 2);
  const radius = Math.max(view.width, view.height) * 0.72 + rand(100, 320);
  let type = 'zombie';
  const roll = Math.random();
  if (roll > 0.82) type = 'runner';
  if (roll > 0.94) type = 'crawler';
  const defs = {
    zombie: { sprite: 'zombie', r: 11, hp: 24, speed: rand(42, 60), damage: 10, scrap: 3 },
    runner: { sprite: 'runner', r: 9, hp: 16, speed: rand(86, 108), damage: 8, scrap: 4 },
    crawler: { sprite: 'crawler', r: 8, hp: 19, speed: rand(56, 72), damage: 11, scrap: 5 },
  };
  const def = defs[type];
  const scale = 1 + shop.wave * 0.12;
  enemies.push({
    id: nextEnemyId++,
    x: clamp(player.x + Math.cos(angle) * radius, 32, WORLD_SIZE - 32),
    y: clamp(player.y + Math.sin(angle) * radius, 32, WORLD_SIZE - 32),
    r: def.r,
    hp: def.hp * scale,
    speed: def.speed * (1 + shop.wave / 30),
    damage: def.damage,
    scrap: def.scrap,
    sprite: def.sprite,
    dead: false,
  });
}
function nearestEnemy() {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const d = distSq(enemy.x - player.x, enemy.y - player.y);
    if (d < bestDist) { best = enemy; bestDist = d; }
  }
  return best;
}
function shoot() {
  const target = nearestEnemy();
  if (!target) return;
  const base = Math.atan2(target.y - player.y, target.x - player.x);
  const count = stats.bullets;
  const spread = count === 1 ? 0 : Math.min(0.9, 0.16 * (count - 1));
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = base + t * spread;
    bullets.push({
      x: player.x + Math.cos(angle) * 10,
      y: player.y - 14 + Math.sin(angle) * 4,
      vx: Math.cos(angle) * stats.bulletSpeed,
      vy: Math.sin(angle) * stats.bulletSpeed,
      r: 6,
      damage: stats.damage,
      pierce: stats.pierce,
      hit: new Set(),
      life: 1,
    });
  }
}
function bulletHit(projectile) {
  for (const enemy of enemies) {
    if (enemy.dead || projectile.hit.has(enemy.id)) continue;
    if (isHit(projectile, enemy, projectile.r + enemy.r)) return enemy;
  }
  return null;
}
function dropScrap(enemy) {
  if (scraps.length > MAX_SCRAP) scraps.shift();
  scraps.push({ x: enemy.x, y: enemy.y, value: enemy.scrap, r: 7 });
}
function collectAllScrap() {
  for (const item of scraps) shop.scrap += item.value;
  scraps.length = 0;
}

function update(dt) {
  if (mode !== 'wave') return;
  waveTimer -= dt;
  if (waveTimer <= 0) { collectAllScrap(); openShop(); return; }
  player.inv = Math.max(0, player.inv - dt);

  let mx = 0;
  let my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  const move = norm(mx, my);
  if (mx || my) {
    player.x = clamp(player.x + move.x * player.speed * dt, 24, WORLD_SIZE - 24);
    player.y = clamp(player.y + move.y * player.speed * dt, 24, WORLD_SIZE - 24);
    player.facing = move.x < 0 ? -1 : move.x > 0 ? 1 : player.facing;
  }

  spawnClock -= dt;
  const spawnInterval = Math.max(0.12, 0.82 - shop.wave * 0.035);
  if (spawnClock <= 0 && enemies.length < MAX_ENEMIES) {
    spawnClock = spawnInterval;
    const count = shop.wave > 10 ? 4 : shop.wave > 5 ? 3 : shop.wave > 2 ? 2 : 1;
    for (let i = 0; i < count; i += 1) spawnEnemy();
  }

  stats.cooldown -= dt;
  if (stats.cooldown <= 0) { stats.cooldown = stats.fireRate; shoot(); }

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const dir = norm(player.x - enemy.x, player.y - enemy.y);
    enemy.x += dir.x * enemy.speed * dt;
    enemy.y += dir.y * enemy.speed * dt;
    if (isHit(player, enemy, player.r + enemy.r) && player.inv <= 0) {
      player.hp -= enemy.damage;
      player.inv = 0.42;
      if (player.hp <= 0) { player.hp = 0; collectAllScrap(); openShop(); return; }
    }
  }

  let killed = false;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let consumed = bullet.life <= 0;
    if (!consumed) {
      const enemy = bulletHit(bullet);
      if (enemy) {
        enemy.hp -= bullet.damage;
        bullet.hit.add(enemy.id);
        if (enemy.hp <= 0) { enemy.dead = true; killed = true; waveKills += 1; dropScrap(enemy); }
        if (bullet.pierce > 0) bullet.pierce -= 1; else consumed = true;
      }
    }
    if (consumed) bullets.splice(i, 1);
  }
  if (killed) {
    let write = 0;
    for (let read = 0; read < enemies.length; read += 1) if (!enemies[read].dead) enemies[write++] = enemies[read];
    enemies.length = write;
  }

  for (let i = scraps.length - 1; i >= 0; i -= 1) {
    const item = scraps[i];
    const d = length(player.x - item.x, player.y - item.y);
    if (d < player.pickup) {
      const dir = norm(player.x - item.x, player.y - item.y);
      const pull = 1200 / Math.max(28, d);
      item.x += dir.x * pull * 96 * dt;
      item.y += dir.y * pull * 96 * dt;
    }
    if (d < player.r + item.r) { shop.scrap += item.value; scraps.splice(i, 1); }
  }
}

function drawBar(x, y, w, h, value, bg, fg) {
  quad('solid', x, y, w, h, bg);
  quad('solid', x, y, Math.max(1, w * clamp(value, 0, 1)), h, fg);
}
function groundSprite(tx, ty) {
  const mx = mod(tx, 8);
  const my = mod(ty, 8);
  const isRoad = mx === 3 || mx === 4 || my === 3 || my === 4;
  const h = hash2(tx, ty);
  return isRoad ? ((h & 1) ? 'roadA' : 'roadB') : ((h & 1) ? 'walkA' : 'walkB');
}
function render() {
  const cameraX = Math.floor(player.x - view.width / 2);
  const cameraY = Math.floor(player.y - view.height / 2);
  quadCount = 0;
  for (let ty = Math.floor(cameraY / TILE) - 1; ty <= Math.ceil((cameraY + view.height) / TILE) + 1; ty += 1) {
    for (let tx = Math.floor(cameraX / TILE) - 1; tx <= Math.ceil((cameraX + view.width) / TILE) + 1; tx += 1) {
      quad(groundSprite(tx, ty), tx * TILE, ty * TILE, TILE, TILE);
      if (hash2(tx, ty) % 43 === 0) quad('blood', tx * TILE, ty * TILE, TILE, TILE, [1, 1, 1, 0.75]);
    }
  }
  for (const item of scraps) { quad('shadow', item.x - 10, item.y - 4, 20, 8, [1, 1, 1, 0.28]); quad('scrap', item.x - 8, item.y - 18, 16, 16); }
  for (const bullet of bullets) quad('bullet', bullet.x - 8, bullet.y - 8, 16, 16);
  const actors = [...enemies, player].sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    const isPlayer = actor === player;
    const size = isPlayer ? 30 : actor.sprite === 'runner' ? 24 : actor.sprite === 'crawler' ? 22 : 28;
    quad('shadow', actor.x - size * 0.42, actor.y - size * 0.12, size * 0.84, size * 0.28, [1, 1, 1, 0.42]);
    const tint = isPlayer && player.inv > 0 ? [1, 0.55, 0.55, 1] : [1, 1, 1, 1];
    quad(isPlayer ? 'penguin' : actor.sprite, actor.x - size / 2, actor.y - size, size, size, tint, isPlayer && player.facing < 0);
  }
  drawBar(cameraX + 18, cameraY + 18, 190, 9, player.hp / player.maxHp, [0.15, 0.03, 0.03, 1], [0.92, 0.16, 0.18, 1]);
  drawBar(cameraX + 18, cameraY + 31, 190, 5, waveTimer / waveDuration(shop.wave), [0.12, 0.1, 0.04, 1], [1, 0.78, 0.15, 1]);
  flush(cameraX, cameraY);
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  view.width = innerWidth;
  view.height = innerHeight;
  const w = Math.floor(view.width * dpr);
  const h = Math.floor(view.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`; }
}
window.addEventListener('resize', resize);
resize();
let last = performance.now();
function frame(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; resize(); update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
