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
const CELL = 96;
const ROW = 2048;
const MAX_ENEMIES = 1200;
const keys = new Set();
const view = { width: 1, height: 1 };
const grid = new Map();
let nextEnemyId = 1;
let state = 'wave';
let waveTime = 22;
let spawnTimer = 0;
let kills = 0;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const vs = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform vec2 u_camera;
varying vec2 v_uv;
varying vec4 v_color;
void main(){
  vec2 p=a_position-u_camera;
  vec2 c=(p/u_resolution)*2.0-1.0;
  gl_Position=vec4(c.x,-c.y,0.0,1.0);
  v_uv=a_uv;
  v_color=a_color;
}`;
const fs = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_color;
void main(){
  vec4 t=texture2D(u_texture,v_uv);
  if(t.a<0.05) discard;
  gl_FragColor=t*v_color;
}`;

function shader(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(v, f) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, v));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, f));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function sprite(draw) {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}
function r(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mod(n, m) { return ((n % m) + m) % m; }

const sources = {
  solid: sprite((ctx) => r(ctx, 0, 0, 16, 16, '#fff')),
  penguin: sprite((ctx) => {
    r(ctx, 5, 2, 6, 2, '#0d1820'); r(ctx, 4, 4, 8, 6, '#111d26'); r(ctx, 5, 5, 6, 4, '#e8f2f6');
    r(ctx, 3, 6, 2, 3, '#111d26'); r(ctx, 11, 6, 2, 3, '#111d26'); r(ctx, 12, 5, 4, 2, '#5d6a72');
    r(ctx, 5, 12, 2, 2, '#ff9e43'); r(ctx, 9, 12, 2, 2, '#ff9e43'); r(ctx, 6, 3, 1, 1, '#000'); r(ctx, 9, 3, 1, 1, '#000'); r(ctx, 7, 5, 2, 1, '#ffb347');
  }),
  zombie: sprite((ctx) => {
    r(ctx, 5, 2, 6, 3, '#748762'); r(ctx, 4, 5, 8, 3, '#8fa47a'); r(ctx, 6, 4, 1, 1, '#220'); r(ctx, 9, 4, 1, 1, '#b3121d');
    r(ctx, 4, 8, 8, 3, '#313638'); r(ctx, 2, 8, 2, 4, '#718460'); r(ctx, 12, 8, 2, 3, '#7c8e69');
    r(ctx, 5, 11, 2, 4, '#2d2424'); r(ctx, 9, 11, 2, 4, '#221c1d'); r(ctx, 4, 14, 3, 1, '#151617'); r(ctx, 9, 14, 3, 1, '#151617');
  }),
  runner: sprite((ctx) => {
    r(ctx, 6, 2, 5, 3, '#708262'); r(ctx, 7, 4, 1, 1, '#d11d25'); r(ctx, 4, 6, 8, 4, '#6f2028');
    r(ctx, 1, 7, 2, 2, '#5d6b50'); r(ctx, 12, 7, 2, 3, '#7f946d'); r(ctx, 5, 10, 2, 5, '#202328'); r(ctx, 9, 10, 2, 5, '#1c1d22');
  }),
  crawler: sprite((ctx) => {
    r(ctx, 3, 7, 6, 2, '#8ca276'); r(ctx, 5, 7, 1, 1, '#a9151d'); r(ctx, 6, 9, 8, 2, '#303537'); r(ctx, 4, 10, 10, 2, '#252a2d');
    r(ctx, 1, 10, 2, 2, '#536348'); r(ctx, 12, 8, 2, 1, '#7d9169'); r(ctx, 11, 13, 3, 1, '#151618');
  }),
  bullet: sprite((ctx) => { r(ctx, 8, 5, 5, 2, '#f8e38a'); r(ctx, 6, 6, 3, 2, '#f0c452'); r(ctx, 12, 5, 2, 2, '#fff5c5'); }),
  scrap: sprite((ctx) => { r(ctx, 6, 3, 4, 2, '#e8e0b0'); r(ctx, 4, 5, 8, 5, '#9fa6a8'); r(ctx, 5, 10, 6, 2, '#626b70'); r(ctx, 7, 6, 2, 2, '#ffe27a'); }),
  roadA: sprite((ctx) => { r(ctx, 0, 0, 16, 16, '#2d3035'); r(ctx, 2, 3, 2, 1, '#393d44'); r(ctx, 10, 12, 3, 1, '#202328'); }),
  roadB: sprite((ctx) => { r(ctx, 0, 0, 16, 16, '#30343a'); r(ctx, 4, 3, 1, 2, '#23262b'); r(ctx, 12, 10, 2, 1, '#40444b'); }),
  walkA: sprite((ctx) => { r(ctx, 0, 0, 16, 16, '#5a5f67'); r(ctx, 0, 7, 16, 1, '#737983'); r(ctx, 7, 0, 1, 16, '#737983'); }),
  walkB: sprite((ctx) => { r(ctx, 0, 0, 16, 16, '#616772'); r(ctx, 0, 7, 16, 1, '#757c86'); r(ctx, 7, 0, 1, 16, '#757c86'); }),
  blood: sprite((ctx) => { r(ctx, 5, 6, 5, 3, '#5f0d14'); r(ctx, 4, 7, 7, 2, '#7f101a'); }),
  shadow: sprite((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(8, 10, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); }),
};

function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_SIZE;
  c.height = ATLAS_SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = {};
  let x = 1, y = 1, row = 0;
  for (const [name, img] of Object.entries(sources)) {
    if (x + img.width + 1 > ATLAS_SIZE) { x = 1; y += row + 1; row = 0; }
    ctx.drawImage(img, x, y);
    sprites[name] = { u0: x / ATLAS_SIZE, v0: y / ATLAS_SIZE, u1: (x + img.width) / ATLAS_SIZE, v1: (y + img.height) / ATLAS_SIZE };
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
const prog = program(vs, fs);
const loc = { pos: gl.getAttribLocation(prog, 'a_position'), uv: gl.getAttribLocation(prog, 'a_uv'), col: gl.getAttribLocation(prog, 'a_color'), res: gl.getUniformLocation(prog, 'u_resolution'), cam: gl.getUniformLocation(prog, 'u_camera'), tex: gl.getUniformLocation(prog, 'u_texture') };
const data = new Float32Array(MAX_QUADS * 6 * 8);
const buffer = gl.createBuffer();
let quads = 0;

function quad(name, x, y, w, h, color = [1, 1, 1, 1], flip = false) {
  if (quads >= MAX_QUADS) return;
  const s = atlas.sprites[name];
  const u0 = flip ? s.u1 : s.u0, u1 = flip ? s.u0 : s.u1, v0 = s.v0, v1 = s.v1;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.floor(x + w), y1 = Math.floor(y + h);
  const [r, g, b, a] = color;
  data.set([x0,y0,u0,v0,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x0,y1,u0,v1,r,g,b,a, x1,y0,u1,v0,r,g,b,a, x1,y1,u1,v1,r,g,b,a], quads * 48);
  quads += 1;
}
function draw(cameraX, cameraY) {
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
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, quads * 48), gl.DYNAMIC_DRAW);
  const stride = 32;
  gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(loc.col); gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, stride, 16);
  gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
}

function len(x, y) { return Math.hypot(x, y); }
function norm(x, y) { const l = len(x, y) || 1; return { x: x / l, y: y / l }; }
function dist2(x, y) { return x * x + y * y; }
function hit(a, b, r) { return dist2(a.x - b.x, a.y - b.y) < r * r; }
function cell(v) { return Math.floor(v / CELL); }
function key(cx, cy) { return cx + cy * ROW; }
function rebuildGrid() { grid.clear(); for (const e of enemies) { if (e.dead) continue; const k = key(cell(e.x), cell(e.y)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); } }
function nearestEnemy() { let best = null, d = Infinity; for (const e of enemies) { if (e.dead) continue; const dd = dist2(e.x - player.x, e.y - player.y); if (dd < d) { best = e; d = dd; } } return best; }
function bulletHit(b) { for (let cy = cell(b.y - 50); cy <= cell(b.y + 50); cy++) for (let cx = cell(b.x - 50); cx <= cell(b.x + 50); cx++) { const bucket = grid.get(key(cx, cy)); if (!bucket) continue; for (const e of bucket) if (!e.dead && !b.hit.has(e.id) && hit(b, e, b.r + e.r)) return e; } return null; }

const player = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: 12, hp: 100, maxHp: 100, speed: 180, pickup: 92, inv: 0, facing: 1 };
const stats = { damage: 9, fireRate: 0.92, bulletSpeed: 500, bullets: 1, pierce: 0, cooldown: 0 };
const enemies = [], bullets = [], scraps = [];
const shop = { wave: 1, scrap: 0, rerollCost: 5, offers: [] };
let waveTimer = waveDuration(shop.wave), spawnTimer = 0, waveKills = 0;

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
function waveDuration(w) { return Math.min(60, 18 + w * 4); }
function createShop() {
  const el = document.createElement('div');
  el.className = 'shop-screen hidden';
  el.innerHTML = '<div class="shop-panel"><div class="shop-header"><div><div class="shop-kicker">WAVE COMPLETE</div><div class="shop-title">Scrap Shop</div></div><div class="shop-wallet"></div></div><div class="shop-summary"></div><div class="shop-offers"></div><div class="shop-actions"><button class="shop-reroll" type="button">Reroll</button><button class="shop-next" type="button">Next Wave</button></div></div>';
  document.body.appendChild(el);
  const ui = { el, wallet: el.querySelector('.shop-wallet'), summary: el.querySelector('.shop-summary'), offers: el.querySelector('.shop-offers'), reroll: el.querySelector('.shop-reroll'), next: el.querySelector('.shop-next') };
  ui.reroll.addEventListener('click', () => reroll());
  ui.next.addEventListener('click', () => nextWave());
  return ui;
}
const ui = createShop();
function rollShop() { shop.offers = [...items].sort(() => Math.random() - 0.5).slice(0, 4).map(i => ({ ...i, cost: Math.floor(i.base * (1 + shop.wave * 0.08)) })); }
function renderShop() { ui.wallet.textContent = `Scrap ${shop.scrap}`; ui.summary.textContent = `Wave ${shop.wave} cleared · Kills ${waveKills} · HP ${Math.ceil(player.hp)}/${player.maxHp}`; ui.offers.innerHTML = ''; for (const offer of shop.offers) { const b = document.createElement('button'); b.className = `shop-card ${shop.scrap >= offer.cost ? 'affordable' : 'expensive'}`; b.disabled = shop.scrap < offer.cost; b.innerHTML = `<strong>${offer.name}</strong><span>${offer.desc}</span><em>${offer.cost} Scrap</em>`; b.onclick = () => { if (shop.scrap < offer.cost) return; shop.scrap -= offer.cost; offer.buy(); shop.offers = shop.offers.filter(o => o !== offer); renderShop(); }; ui.offers.appendChild(b); } ui.reroll.textContent = `Reroll (${shop.rerollCost})`; ui.reroll.disabled = shop.scrap < shop.rerollCost; }
function openShop() { state = 'shop'; rollShop(); renderShop(); ui.el.classList.remove('hidden'); }
function reroll() { if (shop.scrap < shop.rerollCost) return; shop.scrap -= shop.rerollCost; shop.rerollCost += 2; rollShop(); renderShop(); }
function nextWave() { ui.el.classList.add('hidden'); state = 'wave'; shop.wave += 1; shop.rerollCost = 5 + Math.floor(shop.wave / 2); waveKills = 0; bullets.length = 0; scraps.length = 0; waveTimer = waveDuration(shop.wave); }

function spawnEnemy() { const a = rand(0, Math.PI * 2), rad = Math.max(view.width, view.height) * 0.72 + rand(100, 320); let type = 'zombie'; const roll = Math.random(); if (roll > 0.82) type = 'runner'; if (roll > 0.94) type = 'crawler'; const defs = { zombie: { sprite: 'zombie', r: 11, hp: 24, speed: rand(42, 60), dmg: 10, scrap: 3 }, runner: { sprite: 'runner', r: 9, hp: 16, speed: rand(86, 108), dmg: 8, scrap: 4 }, crawler: { sprite: 'crawler', r: 8, hp: 19, speed: rand(56, 72), dmg: 11, scrap: 5 } }; const d = defs[type], scale = 1 + shop.wave * 0.12; enemies.push({ id: nextEnemyId++, x: Math.max(32, Math.min(WORLD_SIZE - 32, player.x + Math.cos(a) * rad)), y: Math.max(32, Math.min(WORLD_SIZE - 32, player.y + Math.sin(a) * rad)), r: d.r, hp: d.hp * scale, speed: d.speed * (1 + shop.wave / 30), damage: d.dmg, scrap: d.scrap, sprite: d.sprite, dead: false }); }
function shoot() { const e = nearestEnemy(); if (!e) return; const base = Math.atan2(e.y - player.y, e.x - player.x), count = stats.bullets, spread = count === 1 ? 0 : Math.min(0.9, 0.16 * (count - 1)); for (let i = 0; i < count; i++) { const t = count === 1 ? 0 : i / (count - 1) - 0.5, a = base + t * spread; bullets.push({ x: player.x + Math.cos(a) * 10, y: player.y - 14 + Math.sin(a) * 4, vx: Math.cos(a) * stats.bulletSpeed, vy: Math.sin(a) * stats.bulletSpeed, r: 6, damage: stats.damage, pierce: stats.pierce, hit: new Set(), life: 1 }); } }
function collectAllScrap() { for (const s of scraps) shop.scrap += s.value; scraps.length = 0; }
function update(dt) { if (state !== 'wave') return; waveTimer -= dt; if (waveTimer <= 0) { collectAllScrap(); openShop(); return; } player.inv = Math.max(0, player.inv - dt); let mx = 0, my = 0; if (keys.has('w') || keys.has('arrowup')) my--; if (keys.has('s') || keys.has('arrowdown')) my++; if (keys.has('a') || keys.has('arrowleft')) mx--; if (keys.has('d') || keys.has('arrowright')) mx++; const mv = norm(mx, my); if (mx || my) { player.x = Math.max(24, Math.min(WORLD_SIZE - 24, player.x + mv.x * player.speed * dt)); player.y = Math.max(24, Math.min(WORLD_SIZE - 24, player.y + mv.y * player.speed * dt)); player.facing = mv.x < 0 ? -1 : mv.x > 0 ? 1 : player.facing; } spawnTimer -= dt; const interval = Math.max(0.12, 0.82 - shop.wave * 0.035); if (spawnTimer <= 0 && enemies.length < MAX_ENEMIES) { spawnTimer = interval; const count = shop.wave > 10 ? 4 : shop.wave > 5 ? 3 : shop.wave > 2 ? 2 : 1; for (let i = 0; i < count; i++) spawnEnemy(); } stats.cooldown -= dt; if (stats.cooldown <= 0) { stats.cooldown = stats.fireRate; shoot(); } for (const e of enemies) { if (e.dead) continue; const n = norm(player.x - e.x, player.y - e.y); e.x += n.x * e.speed * dt; e.y += n.y * e.speed * dt; if (hit(player, e, player.r + e.r) && player.inv <= 0) { player.hp -= e.damage; player.inv = 0.42; if (player.hp <= 0) { player.hp = 0; collectAllScrap(); openShop(); } } } rebuildGrid(); let killed = false; for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; let done = b.life <= 0; if (!done) { const e = bulletHit(b); if (e) { e.hp -= b.damage; b.hit.add(e.id); if (e.hp <= 0) { e.dead = true; killed = true; waveKills++; scraps.push({ x: e.x, y: e.y, value: e.scrap, r: 7 }); } if (b.pierce > 0) b.pierce--; else done = true; } } if (done) bullets.splice(i, 1); } if (killed) compactDeadEnemies(); for (let i = scraps.length - 1; i >= 0; i--) { const s = scraps[i], d = len(player.x - s.x, player.y - s.y); if (d < player.pickup) { const n = norm(player.x - s.x, player.y - s.y), pull = 1200 / Math.max(28, d); s.x += n.x * pull * 96 * dt; s.y += n.y * pull * 96 * dt; } if (d < player.r + s.r) { shop.scrap += s.value; scraps.splice(i, 1); } } }
function bar(x, y, w, h, v, bg, fg) { quad('solid', x, y, w, h, bg); quad('solid', x, y, Math.max(1, w * Math.max(0, Math.min(1, v))), h, fg); }
function render() { const cx = Math.floor(player.x - view.width / 2), cy = Math.floor(player.y - view.height / 2); quads = 0; for (let ty = Math.floor(cy / TILE) - 1; ty <= Math.ceil((cy + view.height) / TILE) + 1; ty++) for (let tx = Math.floor(cx / TILE) - 1; tx <= Math.ceil((cx + view.width) / TILE) + 1; tx++) { quad(getGroundSprite(tx, ty), tx * TILE, ty * TILE, TILE, TILE); if (hash(tx, ty) % 43 === 0) quad('blood', tx * TILE, ty * TILE, TILE, TILE, [1, 1, 1, 0.75]); } for (const s of scraps) { quad('shadow', s.x - 10, s.y - 4, 20, 8, [1, 1, 1, 0.28]); quad('scrap', s.x - 8, s.y - 18, 16, 16); } for (const b of bullets) quad('bullet', b.x - 8, b.y - 8, 16, 16); const actors = [...enemies, player].sort((a, b) => a.y - b.y); for (const a of actors) { const isP = a === player, size = isP ? 30 : a.sprite === 'runner' ? 24 : a.sprite === 'crawler' ? 22 : 28; quad('shadow', a.x - size * 0.42, a.y - size * 0.12, size * 0.84, size * 0.28, [1, 1, 1, 0.42]); quad(isP ? 'penguin' : a.sprite, a.x - size / 2, a.y - size, size, size, isP && player.inv > 0 ? [1, 0.55, 0.55, 1] : [1, 1, 1, 1], isP && player.facing < 0); } bar(cx + 18, cy + 18, 190, 9, player.hp / player.maxHp, [0.15, 0.03, 0.03, 1], [0.92, 0.16, 0.18, 1]); bar(cx + 18, cy + 31, 190, 5, waveTimer / waveDuration(shop.wave), [0.12, 0.1, 0.04, 1], [1, 0.78, 0.15, 1]); draw(cx, cy); }
function resize() { const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT); view.width = innerWidth; view.height = innerHeight; const w = Math.floor(view.width * dpr), h = Math.floor(view.height * dpr); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`; } }
window.addEventListener('resize', resize); resize();
let last = performance.now();
function frame(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; resize(); update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
