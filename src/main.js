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
const ATLAS_SIZE = 256;
const WORLD_SIZE = 3200;
const MAX_QUADS = 60000;
const DPR_LIMIT = 2;
const GRID_CELL_SIZE = 96;
const GRID_ROW_STRIDE = 1024;
const MAX_ENEMIES = 1400;
const PROJECTILE_QUERY_RADIUS = 36;

const keys = new Set();
const view = { width: 1, height: 1 };
const enemyGrid = new Map();

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
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

const spriteSources = {
  solid: makeSprite((ctx) => rect(ctx, 0, 0, TILE, TILE, '#ffffff')),
  player: makeSprite((ctx) => {
    rect(ctx, 6, 1, 4, 2, '#f7f1b7');
    rect(ctx, 4, 3, 8, 3, '#f7f1b7');
    rect(ctx, 5, 6, 6, 2, '#3558d4');
    rect(ctx, 4, 8, 8, 4, '#4267ff');
    rect(ctx, 3, 7, 2, 3, '#f7f1b7');
    rect(ctx, 11, 7, 2, 3, '#f7f1b7');
    rect(ctx, 5, 12, 2, 3, '#2b2b38');
    rect(ctx, 9, 12, 2, 3, '#2b2b38');
    rect(ctx, 6, 4, 1, 1, '#1b1e2f');
    rect(ctx, 9, 4, 1, 1, '#1b1e2f');
  }),
  slime: makeSprite((ctx) => {
    rect(ctx, 4, 4, 8, 2, '#193c35');
    rect(ctx, 3, 6, 10, 6, '#2ec27e');
    rect(ctx, 4, 12, 8, 2, '#1a7f54');
    rect(ctx, 5, 7, 2, 2, '#0d342a');
    rect(ctx, 10, 7, 2, 2, '#0d342a');
    rect(ctx, 7, 10, 3, 1, '#0d342a');
  }),
  bat: makeSprite((ctx) => {
    rect(ctx, 6, 5, 4, 5, '#4b244a');
    rect(ctx, 2, 6, 4, 2, '#7b3f78');
    rect(ctx, 10, 6, 4, 2, '#7b3f78');
    rect(ctx, 1, 8, 3, 2, '#5e315e');
    rect(ctx, 12, 8, 3, 2, '#5e315e');
    rect(ctx, 7, 6, 1, 1, '#f7f1b7');
    rect(ctx, 9, 6, 1, 1, '#f7f1b7');
  }),
  bolt: makeSprite((ctx) => {
    rect(ctx, 8, 1, 3, 5, '#fff6a8');
    rect(ctx, 6, 6, 5, 2, '#ffe047');
    rect(ctx, 5, 8, 4, 4, '#ffb000');
    rect(ctx, 4, 12, 2, 3, '#ff7b00');
  }),
  gem: makeSprite((ctx) => {
    rect(ctx, 7, 2, 2, 2, '#c3f3ff');
    rect(ctx, 5, 4, 6, 2, '#58d4ff');
    rect(ctx, 4, 6, 8, 3, '#1799dc');
    rect(ctx, 6, 9, 4, 3, '#0a5f9f');
    rect(ctx, 7, 12, 2, 2, '#063a62');
  }),
  grassA: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#1f6f3a');
    rect(ctx, 2, 11, 1, 3, '#2f8f4c');
    rect(ctx, 5, 9, 1, 4, '#2f8f4c');
    rect(ctx, 12, 10, 1, 3, '#2f8f4c');
    rect(ctx, 8, 12, 3, 1, '#15542b');
  }),
  grassB: makeSprite((ctx) => {
    rect(ctx, 0, 0, 16, 16, '#21693b');
    rect(ctx, 1, 4, 2, 1, '#15542b');
    rect(ctx, 7, 7, 1, 3, '#35a054');
    rect(ctx, 13, 3, 1, 4, '#35a054');
    rect(ctx, 10, 13, 4, 1, '#15542b');
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
  gl.clearColor(0.06, 0.12, 0.09, 1);
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

function distance(x, y) {
  return Math.hypot(x, y);
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
        if (enemy.dead) continue;
        if (overlaps(shot.x, shot.y, shot.r, enemy.x, enemy.y, enemy.r)) {
          return enemy;
        }
      }
    }
  }

  return null;
}

function compactDeadEnemies() {
  let write = 0;
  for (let read = 0; read < enemies.length; read += 1) {
    if (!enemies[read].dead) {
      enemies[write] = enemies[read];
      write += 1;
    }
  }
  enemies.length = write;
}

const player = {
  x: WORLD_SIZE / 2,
  y: WORLD_SIZE / 2,
  r: 12,
  hp: 100,
  maxHp: 100,
  speed: 180,
  level: 1,
  xp: 0,
  nextXp: 8,
  fireCooldown: 0,
  fireRate: 0.45,
  projectileDamage: 14,
  projectileSpeed: 500,
  magnet: 82,
  facing: 1,
  invuln: 0,
};

const enemies = [];
const projectiles = [];
const gems = [];
let elapsed = 0;
let spawnTimer = 0;
let score = 0;
let gameOver = false;
let messageTimer = 4;
let message = 'WASD / Arrow keys / floating touch stick to move. Attacks are automatic.';

function spawnEnemy() {
  const angle = rand(0, Math.PI * 2);
  const spawnRadius = Math.max(view.width, view.height) * 0.65 + rand(80, 260);
  const type = Math.random() < 0.72 ? 'slime' : 'bat';
  const waveScale = 1 + elapsed / 180;
  const maxHp = (type === 'slime' ? 26 : 18) * waveScale;
  enemies.push({
    x: clamp(player.x + Math.cos(angle) * spawnRadius, 32, WORLD_SIZE - 32),
    y: clamp(player.y + Math.sin(angle) * spawnRadius, 32, WORLD_SIZE - 32),
    r: type === 'slime' ? 11 : 9,
    hp: maxHp,
    maxHp,
    speed: (type === 'slime' ? rand(44, 62) : rand(76, 98)) * (1 + elapsed / 420),
    damage: type === 'slime' ? 10 : 7,
    sprite: type,
    wobble: rand(0, Math.PI * 2),
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
  const dir = normalize(nearest.x - player.x, nearest.y - player.y);
  projectiles.push({
    x: player.x,
    y: player.y,
    vx: dir.x * player.projectileSpeed,
    vy: dir.y * player.projectileSpeed,
    r: 6,
    damage: player.projectileDamage,
    life: 1.2,
  });
}

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.level += 1;
    player.nextXp = Math.floor(player.nextXp * 1.32 + 6);
    player.projectileDamage += 4;
    player.fireRate = Math.max(0.16, player.fireRate * 0.91);
    player.magnet += 8;
    player.maxHp += 5;
    player.hp = Math.min(player.maxHp, player.hp + 18);
    message = `LEVEL UP! Lv.${player.level}: damage, fire rate, magnet and HP improved.`;
    messageTimer = 3.0;
  }
}

function update(dt) {
  if (gameOver) return;
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
  const spawnInterval = Math.max(0.11, 0.78 - elapsed / 210);
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
    enemy.wobble += dt * 5;
    const dir = normalize(player.x - enemy.x, player.y - enemy.y);
    enemy.x += dir.x * enemy.speed * dt;
    enemy.y += dir.y * enemy.speed * dt;

    if (overlaps(player.x, player.y, player.r, enemy.x, enemy.y, enemy.r) && player.invuln <= 0) {
      player.hp -= enemy.damage;
      player.invuln = 0.45;
      if (player.hp <= 0) {
        player.hp = 0;
        gameOver = true;
        message = 'Game Over — refresh to restart.';
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
        consumed = true;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          killedEnemy = true;
          score += 1;
          gems.push({ x: enemy.x, y: enemy.y, value: enemy.sprite === 'bat' ? 2 : 1, r: 7 });
        }
      }
    }

    if (consumed) projectiles.splice(i, 1);
  }

  if (killedEnemy) {
    compactDeadEnemies();
  }

  for (let i = gems.length - 1; i >= 0; i -= 1) {
    const gem = gems[i];
    const d = distance(player.x - gem.x, player.y - gem.y);
    if (d < player.magnet) {
      const dir = normalize(player.x - gem.x, player.y - gem.y);
      const pull = 1200 / Math.max(32, d);
      gem.x += dir.x * pull * 90 * dt;
      gem.y += dir.y * pull * 90 * dt;
    }
    if (d < player.r + gem.r) {
      gainXp(gem.value);
      gems.splice(i, 1);
    }
  }
}

function drawBar(x, y, w, h, value, backColor, fillColor) {
  pushQuad('solid', x, y, w, h, backColor);
  pushQuad('solid', x, y, Math.max(1, w * clamp(value, 0, 1)), h, fillColor);
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
      const hash = Math.abs((tx * 73856093) ^ (ty * 19349663));
      pushQuad(hash % 5 === 0 ? 'grassB' : 'grassA', tx * TILE, ty * TILE, TILE, TILE);
    }
  }

  for (const gem of gems) {
    pushQuad('shadow', gem.x - 10, gem.y + 5, 20, 10, [1, 1, 1, 0.35]);
    pushQuad('gem', gem.x - 8, gem.y - 12 + Math.sin(elapsed * 7 + gem.x) * 2, 16, 16);
  }

  for (const shot of projectiles) {
    pushQuad('bolt', shot.x - 8, shot.y - 8, 16, 16);
  }

  const actors = [...enemies, player].sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    const isPlayer = actor === player;
    const size = isPlayer ? 28 : actor.sprite === 'bat' ? 24 : 26;
    const bob = isPlayer ? Math.sin(elapsed * 10) * 1 : Math.sin(actor.wobble) * 2;
    pushQuad('shadow', actor.x - size * 0.42, actor.y + size * 0.28, size * 0.84, size * 0.35, [1, 1, 1, 0.45]);
    const tint = isPlayer && player.invuln > 0 ? [1, 0.55, 0.55, 1] : [1, 1, 1, 1];
    pushQuad(isPlayer ? 'player' : actor.sprite, actor.x - size / 2, actor.y - size + bob, size, size, tint, isPlayer && player.facing < 0);
    if (!isPlayer && actor.hp < actor.maxHp) {
      drawBar(actor.x - 11, actor.y - size - 5, 22, 3, actor.hp / actor.maxHp, [0.15, 0.05, 0.05, 1], [0.9, 0.08, 0.08, 1]);
    }
  }

  const uiX = cameraX + 18;
  const uiY = cameraY + 18;
  drawBar(uiX, uiY, 180, 9, player.hp / player.maxHp, [0.18, 0.04, 0.04, 1], [0.88, 0.12, 0.14, 1]);
  drawBar(uiX, uiY + 14, 180, 7, player.xp / player.nextXp, [0.04, 0.08, 0.18, 1], [0.2, 0.7, 1, 1]);

  flush(cameraX, cameraY);

  hud.innerHTML = `
    <div class="hud-row"><strong>Runtime Atlas Survivor</strong></div>
    <div>Lv. ${player.level} | HP ${Math.ceil(player.hp)}/${player.maxHp} | XP ${player.xp}/${player.nextXp}</div>
    <div>Kills ${score} | Enemies ${enemies.length}/${MAX_ENEMIES} | Grid cells ${enemyGrid.size} | Time ${Math.floor(elapsed)}s</div>
    <div class="hint ${messageTimer > 0 ? '' : 'hidden'}">${message}</div>
  `;
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
