import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

const saved = new Map();
globalThis.localStorage = { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) };
class Element {
  constructor() { this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {} }; this.children = []; this.width = 1280; this.height = 720; }
  appendChild(x) { this.children.push(x); } append(...x) { this.children.push(...x); } replaceChildren(...x) { this.children = x; }
  setAttribute() {} removeAttribute() {} addEventListener() {} querySelector() { return new Element(); }
  getBoundingClientRect() { return { width: 1280, height: 720, left: 0, top: 0 }; }
}
globalThis.document = { querySelector: () => new Element(), createElement: () => new Element(), createElementNS: () => new Element(), body: new Element() };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };

const { game, setRenderer } = await import('../src/state.js');
setRenderer({ dpr: 1 });
const { resetRun, update, finishRun } = await import('../src/game.js');
const { updateArenaProgress, advanceDifficulty } = await import('../src/arena.js');
const { difficulty } = await import('../src/difficulty.js');
const { spawnEnemy, spawnEnemies, enemyRunSpeedMultiplier, currentSpawnPlan, updateEnemies } = await import('../src/enemies.js');
const { killEnemy, updateEnemyProjectiles } = await import('../src/combat.js');
const { updateBullets } = await import('../src/bullets.js');
const { dropGold, collectAllGold, updateGoldDrops } = await import('../src/gold.js');
const { rewardForFloor, readProgress } = await import('../src/progression.js');
const { shortestDungeonDelta, wrapDungeonPoint, moveActorWithDungeonCollision } = await import('../src/dungeon.js');
const { enterUpgradeTree, continueFromSkillTree, purchaseNode } = await import('../src/skillTree.js');

beforeEach(() => { saved.clear(); resetRun(); });

function summonBoss() {
  game.enemies = [];
  for (let i = 0; i < difficulty(game.wave).kills; i += 1) {
    const enemy = spawnEnemy('walker', { position: { x: 500, y: 500 } });
    killEnemy(enemy);
    killEnemy(enemy); // duplicate callbacks must have no effect
  }
  game.enemies = [];
  updateArenaProgress(0);
  assert.equal(game.encounter.phase, 'warning');
  updateArenaProgress(2.1);
  assert.equal(game.encounter.phase, 'boss');
  return game.encounter.boss;
}

test('plain has no blockers or facilities and movement wraps continuously', () => {
  const d = game.dungeon, p = game.player;
  assert.equal(d.arena, true); assert.equal(d.wrapEdges, true);
  assert.equal(d.exit, null); assert.deepEqual(d.obstacles, []); assert.deepEqual(d.facilities, []);
  p.x = d.offsetX + d.width * 96 - 2;
  const start = { x: p.x, y: p.y };
  moveActorWithDungeonCollision(p, 5, 0);
  assert.equal(p.x, d.offsetX + 3);
  assert.equal(shortestDungeonDelta(d, start.x, start.y, p.x, p.y).dx, 5);
});

test('time alone neither summons bosses nor increases enemy speed or spawn pressure', () => {
  const plan = currentSpawnPlan(), speed = enemyRunSpeedMultiplier();
  game.floorElapsed = 100000;
  updateArenaProgress(100000);
  assert.equal(game.encounter.phase, 'horde'); assert.equal(game.wave, 1);
  assert.deepEqual(currentSpawnPlan(), plan); assert.equal(enemyRunSpeedMultiplier(), speed);
  assert.equal(advanceDifficulty(), false);
});

test('one boss per threshold, warning moves away from player, boss kills do not prefill next tier', () => {
  game.encounter.kills = 30;
  updateArenaProgress(0);
  const marker = { ...game.encounter.position };
  Object.assign(game.player, marker);
  updateArenaProgress(2.1);
  assert.equal(game.encounter.phase, 'warning');
  assert.notDeepEqual(game.encounter.position, marker);
  updateArenaProgress(1.1);
  const boss = game.encounter.boss;
  for (let i = 0; i < 40; i++) killEnemy(spawnEnemy('walker', { position: marker }));
  updateArenaProgress(5);
  assert.equal(game.encounter.boss, boss);
  assert.equal(game.wave, 1);
  killEnemy(boss); updateArenaProgress(0);
  assert.equal(advanceDifficulty(), true);
  assert.equal(game.encounter.kills, 0);
});

test('boss reward pays once, preserves position and map, pauses combat, and returns from skills', () => {
  const boss = summonBoss(), d = game.dungeon, pos = { x: game.player.x, y: game.player.y };
  game.player.hp = 1;
  killEnemy(boss); updateArenaProgress(0);
  assert.equal(game.mode, 'bossReward'); assert.equal(game.bossesDefeated, 1);
  assert.equal(game.gold, 30 + 45); assert.equal(game.player.hp, 10);
  assert.equal(game.enemies.length + game.bullets.length + game.enemyProjectiles.length + game.goldDrops.length, 0);
  const elapsed = game.runElapsed, gold = game.gold;
  update(10); updateArenaProgress(10);
  assert.equal(game.runElapsed, elapsed); assert.equal(game.gold, gold);
  enterUpgradeTree(); assert.equal(game.mode, 'upgradeTree');
  assert.equal(purchaseNode('rapid'), true);
  update(10); assert.equal(game.runElapsed, elapsed);
  continueFromSkillTree(); assert.equal(game.mode, 'bossReward');
  assert.equal(advanceDifficulty(), true); assert.equal(advanceDifficulty(), false);
  assert.equal(game.wave, 2); assert.equal(game.dungeon, d);
  assert.deepEqual({ x: game.player.x, y: game.player.y }, pos);
  assert.equal(game.treePurchases.weapon.rapid, true);
});

test('five boss victories clear the run and retain gold and skills on restart', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const boss = summonBoss(); killEnemy(boss); updateArenaProgress(0);
    assert.equal(game.bossesDefeated, tier);
    if (tier < 5) assert.equal(advanceDifficulty(), true);
  }
  assert.equal(game.mode, 'result'); assert.equal(game.runResult.result, 'clear');
  assert.equal(game.runResult.bosses, 5); assert.equal(game.runResult.difficulty, 5);
  assert.equal(game.runResult.runPoints, game.gold);
  const gold = game.gold; updateArenaProgress(10); assert.equal(game.gold, gold);
  resetRun(); assert.equal(game.wave, 1); assert.equal(game.bossesDefeated, 0); assert.equal(game.gold, gold);
});

test('minted coins keep their value after tier changes and merging does not destroy money', () => {
  game.goldDrops = []; game.wave = 2;
  for (let i = 0; i < 300; i++) dropGold({ x: 0, y: 0, radius: 18 });
  assert.equal(game.goldDrops.length, 260);
  game.wave = 5;
  collectAllGold();
  assert.equal(game.gold, 300 * rewardForFloor(1, 2));
  assert.equal(readProgress().gold, game.gold);
});

test('gold, friendly projectiles, hostile projectiles and separation work across map seams', () => {
  const d = game.dungeon, p = game.player;
  p.x = d.offsetX + 8; p.y = 0;
  game.goldDrops = [{ x: d.offsetX + d.width * 96 - 8, y: 0, vx: 0, vy: 0, age: 0, radius: 10, magnetDelay: 0, value: 7, minted: true }];
  updateGoldDrops(.016); assert.equal(game.gold, 7);
  game.enemies = [];
  const enemy = spawnEnemy('walker', { position: { x: p.x, y: 150 } });
  game.bullets = [{ x: d.offsetX + d.width * 96 - 8, y: 150, vx: 0, vy: 0, life: 1, radius: 12, damage: 100, hitIds: new Set() }];
  updateBullets(.016); assert.equal(enemy.dead, true);
  game.enemyProjectiles = [{ x: d.offsetX + d.width * 96 - 8, y: 0, vx: 0, vy: 0, life: 1, radius: 8, damage: 3 }];
  updateEnemyProjectiles(.016); assert.equal(p.hp, 27);
  const a = spawnEnemy('walker', { position: { x: d.offsetX + 1, y: 300 } });
  const b = spawnEnemy('walker', { position: { x: d.offsetX + d.width * 96 - 1, y: 300 } });
  updateEnemies(0);
  assert.ok(Math.abs(shortestDungeonDelta(d, a.x, a.y, b.x, b.y).dx) > 2);
});

test('spawn caps are bounded and normal enemies spawn outside the actual desktop viewport', () => {
  game.enemies = []; game.wave = 5;
  for (let i = 0; i < 100; i++) spawnEnemies(10);
  assert.equal(game.enemies.length, difficulty(5).cap);
  for (const enemy of game.enemies) {
    const delta = shortestDungeonDelta(game.dungeon, game.camera.x, game.camera.y, enemy.x, enemy.y);
    // Desktop camera zoom is never greater than 1, so this is a lower bound.
    assert.ok(Math.abs(delta.dx) > 640 || Math.abs(delta.dy) > 360);
  }
});

test('death keeps collected currency, resets encounter, and grants no fictional time bonus', () => {
  game.gold = 9; game.runPoints = 9; game.runElapsed = 123;
  const { x, y } = game.player;
  game.goldDrops = [{ x, y, vx: 0, vy: 0, age: 0, radius: 10, magnetDelay: 0, value: 1, minted: true }];
  updateGoldDrops(.01); finishRun('dead');
  assert.equal(game.runResult.survivalTime, 123); assert.equal(game.runResult.bonusPoints, 0);
  resetRun(); assert.equal(game.gold, 10); assert.equal(game.encounter.kills, 0);
});

test('late boss volley is telegraphed and locks its aim before firing', () => {
  game.wave = 3;
  const boss = summonBoss();
  boss.x = game.player.x + 300; boss.y = game.player.y;
  boss.bigZombieState = 'chase'; boss.chargeCooldownLeft = 99;
  boss.volleyTimer = 0;
  updateEnemies(.016);
  assert.ok(boss.volleyWarning > 0);
  assert.equal(game.enemyProjectiles.length, 0);
  assert.equal(game.effects.filter(e => e.type === 'telegraphLine').length, 5);
  const angle = boss.volleyAngle;
  game.player.y += 300;
  updateEnemies(.9);
  assert.equal(game.enemyProjectiles.length, 5);
  const middle = game.enemyProjectiles[2];
  assert.ok(Math.abs(Math.atan2(middle.vy, middle.vx) - angle) < .00001);
});
