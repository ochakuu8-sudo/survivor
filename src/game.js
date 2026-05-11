import * as state from "./state.js";
import { game, resetWeaponId, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { BOSS_WAVE_INTERVAL, WAVE_DURATION_SECONDS } from "./constants.js";
import { clamp, lerp } from "./utils/math.js";
import { autoShoot, updateOrbitWeapons, updateWeaponTimers } from "./weapons.js";
import { snapshotPlayerBaseStats } from "./attachments.js";
import { spawnEnemies, spawnEnemy, updateEnemies } from "./enemies.js";
import { generateArenaDungeon } from "./dungeon.js";
import { updateBullets } from "./bullets.js";
import { updateParticles } from "./effects.js";
import { updateEffects, updateEnemyProjectiles } from "./combat.js";
import { updateGoldDrops } from "./gold.js";
import { updateTreasureChests } from "./treasure.js";
import { updateMovement } from "./player.js";
import { prepareStarterPick, renderStarterPick } from "./shop.js";
import { enterUpgradeTree, hideSkillTree, initSkillProgress } from "./skillTree.js";
import { updateHud } from "./hud.js";
import { render } from "./render.js";

export function resetRun() {
  game.mode = "weaponSelect";
  game.wave = 1;
  game.elapsed = 0;
  game.floorElapsed = 0;
  game.waveTimeLeft = WAVE_DURATION_SECONDS;
  game.waveClearCount = 0;
  game.eliteSpawned = false;
  game.selectedWeapon = null;
  game.totalKills = 0;
  game.waveKills = 0;
  game.gold = 0;
  game.goldGainBonus = 0;
  game.waveStartHealBonus = 0;
  game.spawnClock = 0;
  game.shake = 0;
  game.damageFlash = 0;
  game.camera.x = 0;
  game.camera.y = 0;
  resetWeaponId();
  game.player = {
    x: 0,
    y: 0,
    radius: 18,
    hp: 30,
    maxHp: 30,
    speed: 215,
    pickup: 150,
    armor: 0,
    barrier: 0,
    barrierMax: 0,
    invulnerableTimer: 0,
    weaponPowerBonus: 0,
    moveX: 0,
    moveY: 0,
    facingX: 1,
    facingY: 0,
    walkTime: 0,
    walkDustTimer: 0,
    gear: {
      weapons: [],
      activeWeaponIndex: 0,
      attachments: [],
      storageWeapons: [],
      storageAttachments: [],
    },
  };
  game.dungeon = generateArenaDungeon(game.wave);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.player.invulnerableTimer = 0;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.offers = [];
  game.pendingAttachmentChoice = null;
  game.shopTab = "shop";
  game.shopRerollsUsed = 0;
  game.starterChoices = [];
  game.treasureReward = null;
  initSkillProgress();
  game.player.baseStats = snapshotPlayerBaseStats(game.player);
  hud.shop?.classList.add("hidden");
  hideSkillTree();
  hud.treasureReward.classList.add("hidden");
  hud.gameOver.classList.add("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
  prepareStarterPick();
  renderStarterPick();
  updateHud();
}

export function startArenaWithSelectedWeapon() {
  game.mode = "arena";
  game.floorElapsed = 0;
  game.waveTimeLeft = WAVE_DURATION_SECONDS;
  game.waveKills = 0;
  game.spawnClock = 0;
  game.eliteSpawned = false;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.treasureReward = null;
  game.dungeon = generateArenaDungeon(game.wave);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  applyWaveStartRecovery();
  hideSkillTree();
  hud.shop?.classList.add("hidden");
  hud.treasureReward.classList.add("hidden");
  updateHud();
}

export function startNextWave() {
  game.wave += 1;
  startArenaWithSelectedWeapon();
}

function applyWaveStartRecovery() {
  const p = game.player;
  const healRatio = Math.max(0, game.waveStartHealBonus || 0);
  if (healRatio > 0) p.hp = clamp(p.hp + p.maxHp * healRatio, 0, p.maxHp);
  if ((p.barrierMax || 0) > 0) p.barrier = p.barrierMax;
}

export function enterShop() {
  enterUpgradeTree();
}

export function endRun() {
  game.mode = "over";
  hud.result.textContent = `Wave ${game.wave}、撃破数 ${game.totalKills}、ゴールド ${game.gold}。`;
  hud.gameOver.classList.remove("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
  hideSkillTree();
}

export function pauseGame() {
  if (game.mode !== "arena") return;
  game.mode = "pause";
  hud.pauseMenu.classList.remove("hidden");
}

export function resumeGame() {
  if (game.mode !== "pause") return;
  game.mode = "arena";
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
}

function update(dt) {
  game.elapsed += dt;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.4);
  game.shake = Math.max(0, game.shake - dt * 45);

  if (game.mode !== "arena") {
    updateCamera(dt);
    updateHud();
    return;
  }

  game.floorElapsed += dt;
  game.waveTimeLeft = Math.max(0, WAVE_DURATION_SECONDS - game.floorElapsed);
  const p = game.player;
  p.invulnerableTimer = Math.max(0, (p.invulnerableTimer || 0) - dt);

  updateMovement(dt);
  updateTreasureChests(dt);
  updateWeaponTimers(p, dt);

  spawnEnemies(dt);
  updateWaveEvents();
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyProjectiles(dt);
  updateParticles(dt);
  updateGoldDrops(dt);
  updateEffects(dt);
  autoShoot();
  updateOrbitWeapons(dt);
  updateCamera(dt);

  if (p.hp <= 0) {
    endRun();
  } else if (game.floorElapsed >= WAVE_DURATION_SECONDS) {
    enterUpgradeTree();
  }

  updateHud();
}

function updateWaveEvents() {
  if (game.eliteSpawned || game.floorElapsed < 45) return;
  game.eliteSpawned = true;
  const bossWave = game.wave % BOSS_WAVE_INTERVAL === 0;
  spawnEnemy("orc", { elite: true, boss: bossWave });
}

function updateCamera(dt) {
  const p = game.player;
  if (!p) return;
  game.camera.x = lerp(game.camera.x, p.x, clamp(dt * 8, 0, 1));
  game.camera.y = lerp(game.camera.y, p.y, clamp(dt * 8, 0, 1));
}

export function measureCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  return {
    dpr,
    width: Math.max(320, Math.floor(rect.width * dpr)),
    height: Math.max(240, Math.floor(rect.height * dpr)),
  };
}

export function prepareCanvas() {
  const size = measureCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  return size.dpr;
}

export function resize() {
  const size = measureCanvas();
  state.renderer.resize(size.width, size.height, size.dpr);
}

export function frame(now) {
  const dt = clamp((now - timing.lastFrame) / 1000, 0, 0.033);
  timing.lastFrame = now;
  resize();
  update(dt);
  render();
  requestAnimationFrame(frame);
}
