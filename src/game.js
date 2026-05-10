import * as state from "./state.js";
import { game, resetWeaponId, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { INTERACTION_HOLD_SECONDS } from "./constants.js";
import { clamp, lerp } from "./utils/math.js";
import { autoShoot, createWeapon, updateOrbitWeapons, updateWeaponTimers } from "./weapons.js";
import { snapshotPlayerBaseStats } from "./attachments.js";
import { spawnEnemies, updateEnemies } from "./enemies.js";
import { generateDungeon, hasReachedDungeonExit } from "./dungeon.js";
import { updateBullets } from "./bullets.js";
import { updateParticles } from "./effects.js";
import { updateEffects, updateEnemyProjectiles } from "./combat.js";
import { updateGoldDrops } from "./gold.js";
import { updateTreasureChests } from "./treasure.js";
import { updateMovement } from "./player.js";
import { generateOffers, renderShop, WEAPON_POOL } from "./shop.js";
import { updateHud } from "./hud.js";
import { render } from "./render.js";

export function resetRun() {
  game.mode = "fight";
  game.wave = 1;
  game.elapsed = 0;
  game.floorElapsed = 0;
  game.exitHoldTimer = 0;
  game.totalKills = 0;
  game.waveKills = 0;
  game.gold = 0;
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
    hp: 3,
    maxHp: 3,
    speed: 215,
    pickup: 150,
    armor: 0,
    barrier: 0,
    barrierMax: 0,
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
  game.dungeon = generateDungeon(game.wave);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.offers = [];
  game.shopTab = "shop";
  game.shopRerollsUsed = 0;
  game.starterChoices = [];
  game.treasureReward = null;
  game.player.baseStats = snapshotPlayerBaseStats(game.player);
  const stoneTemplate = WEAPON_POOL.find((template) => template.name === "石ころ") || WEAPON_POOL[0];
  if (stoneTemplate) {
    game.player.gear.weapons = [
      createWeapon({ name: stoneTemplate.name, ...stoneTemplate.weapon }),
    ];
  }
  game.starterChoices = [];
  hud.shop.classList.add("hidden");
  hud.starterPick.classList.add("hidden");
  hud.treasureReward.classList.add("hidden");
  hud.gameOver.classList.add("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel.classList.add("hidden");
  updateHud();
}

export function startNextWave() {
  game.mode = "fight";
  game.wave += 1;
  game.floorElapsed = 0;
  game.exitHoldTimer = 0;
  game.waveKills = 0;
  game.spawnClock = 0;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.shopRerollsUsed = 0;
  game.treasureReward = null;
  game.dungeon = generateDungeon(game.wave);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  hud.shop.classList.add("hidden");
  hud.treasureReward.classList.add("hidden");
  updateHud();
}

export function enterShop() {
  game.mode = "shop";
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.shopRerollsUsed = 0;
  game.shopTab = "shop";
  game.treasureReward = null;
  hud.treasureReward.classList.add("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel.classList.add("hidden");
  generateOffers();
  renderShop();
  hud.shop.classList.remove("hidden");
}

export function endRun() {
  game.mode = "over";
  hud.result.textContent = `第${game.wave}階層、撃破数 ${game.totalKills}、ゴールド ${game.gold}。`;
  hud.gameOver.classList.remove("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel.classList.add("hidden");
}

export function pauseGame() {
  if (game.mode !== "fight") return;
  game.mode = "pause";
  hud.pauseMenu.classList.remove("hidden");
}

export function resumeGame() {
  if (game.mode !== "pause") return;
  game.mode = "fight";
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel.classList.add("hidden");
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

  game.floorElapsed += dt;
  const p = game.player;

  updateMovement(dt);
  updateTreasureChests(dt);
  updateWeaponTimers(p, dt);

  spawnEnemies(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyProjectiles(dt);
  updateParticles(dt);
  updateGoldDrops(dt);
  updateEffects(dt);
  autoShoot();
  updateOrbitWeapons(dt);
  updateCamera(dt);

  const exitReady = updateExitHold(p, dt);
  if (p.hp <= 0) {
    endRun();
  } else if (exitReady) {
    enterShop();
  }

  updateHud();
}

function updateExitHold(player, dt) {
  if (!hasReachedDungeonExit(player)) {
    game.exitHoldTimer = 0;
    return false;
  }
  game.exitHoldTimer = Math.min(INTERACTION_HOLD_SECONDS, (game.exitHoldTimer || 0) + dt);
  return game.exitHoldTimer >= INTERACTION_HOLD_SECONDS;
}

function updateCamera(dt) {
  const p = game.player;
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
