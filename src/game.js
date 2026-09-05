import { receiveWeapon,collectWeaponDrops } from './lootModel.js';
import { saveProgress } from './progression.js';
import { resetArenaProgress, updateArenaProgress, spawnArenaHorde, advanceDifficulty } from './arena.js';
import * as state from "./state.js";
import { game, resetWeaponId, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { INITIAL_WEAPON_ONLY_RUN, MAX_FRAME_DELTA_SECONDS, MAX_STORED_ATTACHMENTS, TARGET_FRAME_SECONDS } from "./constants.js";
import { clamp, lerp } from "./utils/math.js";
import { autoShoot, updateDroneWeapons, updateOrbitWeapons, updateWeaponTimers } from "./weapons.js";
import { snapshotPlayerBaseStats } from "./attachments.js";
import { resetEnemySpawnTimer, spawnOpeningEnemies, updateEnemies } from "./enemies.js";
import { generateArenaDungeon, shortestDungeonDelta, wrapDungeonPoint } from './dungeon.js';
import { updateBullets } from "./bullets.js";
import { updateParticles } from "./effects.js";
import { updateEffects, updateEnemyProjectiles } from "./combat.js";
import { updateGoldDrops } from "./gold.js";
import { updateMovement } from "./player.js";
import { pickStarterWeapon, prepareStarterPick, renderStarterPick } from "./shop.js";
import { enterUpgradeTree, hideSkillTree, initSkillProgress, applyPurchasedSkillTreeToActiveWeapon } from "./skillTree.js";
import { updateHud } from "./hud.js";
import { render } from "./render.js";
import { hideModdingPanel } from "./modding.js";
import { t } from "./i18n.js";

export function resetRun() {
  game.mode = "weaponSelect";
  game.debugSkillTreeMode = false;
  game.wave = 1;
  resetArenaProgress();
  state.keys.clear();
  game.exitHoldTimer = 0;
  game.elapsed = 0;
  game.floorElapsed = 0;
  game.waveClearCount = 0;
  game.eliteSpawned = false;
  game.selectedWeapon = null;
  game.totalKills = 0;
  game.waveKills = 0;
  game.runPoints = 0;
  game.runResult = null;
  game.runPhase = 1;
  game.gold = 0;
  game.goldGainBonus = 0;
  game.waveStartHealBonus = 0;
  game.spawnClock = 0;
  game.spawnBatchSize = 0;
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
    pickup: 280,
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
      storageAttachmentsMax: MAX_STORED_ATTACHMENTS,
    },
  };
  game.dungeon = generateArenaDungeon(1);
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
  game.pendingAttachmentReward = null;
  game.modeBeforeAttachmentReward = null;
  game.pendingMod = null;
  game.modding = { rerollBaseCost: 10 };
  game.shopTab = "shop";
  game.shopRerollsUsed = 0;
  game.starterChoices = [];
  game.treasureReward = null;
  game.stoneMaterials = {};
  initSkillProgress();
  game.player.baseStats = snapshotPlayerBaseStats(game.player);
  hud.shop?.classList.add("hidden");
  hideSkillTree();
  hud.treasureReward.classList.add("hidden");
  hud.workbenchPanel?.classList.add("hidden");
  hideModdingPanel();
  hud.restart.textContent = t("gameOver.restart");
  hud.gameOver.classList.add("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
  prepareStarterPick();
  if (INITIAL_WEAPON_ONLY_RUN) {
    pickStarterWeapon(0);
    applyPurchasedSkillTreeToActiveWeapon();
    updateHud();
  } else {
    renderStarterPick();
    updateHud();
  }
}

export function startArenaWithSelectedWeapon() {
  game.mode = "arena";
  game.floorElapsed = 0;
  game.waveKills = 0;
  game.spawnClock = 0;
  game.spawnBatchSize = 0;
  game.eliteSpawned = false;
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.treasureReward = null;
  game.pendingAttachmentReward = null;
  game.modeBeforeAttachmentReward = null;
  game.dungeon = generateArenaDungeon(1);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  spawnOpeningEnemies();
  applyWaveStartRecovery();
  hideSkillTree();
  hud.shop?.classList.add("hidden");
  hud.treasureReward.classList.add("hidden");
  hud.workbenchPanel?.classList.add("hidden");
  resetEnemySpawnTimer();
  updateHud();
}

export function startNextWave() {
  return advanceDifficulty();
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
  finishRun("dead");
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const sec = String(safe % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

export function finishRun(result) {
  if (game.mode === "result") return;
  collectWeaponDrops(game);saveProgress(game);
  const survivalTime = game.runElapsed || 0;
  const bonusPoints = 0;
  const totalEarnedPoints = (game.runPoints || 0) + bonusPoints;

  game.mode = "result";
  game.runResult = {
    result,
    survivalTime,
    kills: game.totalKills,
    waveKills: game.waveKills,
    difficulty: game.wave,
    bosses: game.bossesDefeated,
    runPoints: game.runPoints || 0,
    bonusPoints,
    totalEarnedPoints,
  };
  game.bestSurvivalTime = Math.max(game.bestSurvivalTime || 0, survivalTime);

  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];

  showRunResult();
}

function showRunResult() {
  const r = game.runResult;
  const time = formatTime(r?.survivalTime || 0);
  const best = formatTime(game.bestSurvivalTime || 0);
  hud.result.textContent = t("result.summary", {
    result: r?.result === "clear" ? t("result.clear") : t("result.over"),
    time,
    best,
    difficulty: r?.difficulty || 1,
    bosses: r?.bosses || 0,
    kills: r?.kills || 0,
    runPoints: r?.runPoints || 0,
    bonusPoints: r?.bonusPoints || 0,
  });
  hud.restart.textContent = t("gameOver.restart");
  hud.gameOver.classList.remove("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
  hideSkillTree();
  hideModdingPanel();
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

export function update(dt) {
  if (game.mode === "upgradeTree") return;
  game.elapsed += dt;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 2.4);
  game.shake = Math.max(0, game.shake - dt * 45);

  if (game.mode !== "arena") {
    updateCamera(dt);
    updateHud();
    return;
  }

  game.floorElapsed += dt;
  game.runElapsed += dt;
  const p = game.player;
  p.invulnerableTimer = Math.max(0, (p.invulnerableTimer || 0) - dt);

  updateMovement(dt);

  updateWeaponTimers(p, dt);

  spawnArenaHorde(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyProjectiles(dt);
  updateParticles(dt);
  updateGoldDrops(dt);
  if(game.loot){const kept=[];let changed=false;for(const d of game.loot.worldDrops){const delta=shortestDungeonDelta(game.dungeon,d.x,d.y,p.x,p.y),distance=Math.hypot(delta.dx,delta.dy);if(distance<Math.max(90,p.pickup||150)){if(distance<600*dt+20){receiveWeapon(game,d.weapon);changed=true;continue;}d.x+=delta.dx/distance*600*dt;d.y+=delta.dy/distance*600*dt;wrapDungeonPoint(game.dungeon,d);}kept.push(d);}game.loot.worldDrops=kept;if(changed)saveProgress(game);}
  updateEffects(dt);
  if(game.buildCombat)game.buildCombat.update(dt);
  else {autoShoot(dt);updateOrbitWeapons(dt);updateDroneWeapons(dt);}
  updateCamera(dt);

  if (p.hp <= 0) {
    finishRun("dead");
  } else {
    updateArenaProgress(dt);
    if(game.mode==='arena'&&game.loot.inbox.length){game.inventoryOverflow=true;enterUpgradeTree();}
  }

  if(game.lootDirty){saveProgress(game);game.lootDirty=false;}
  updateHud();
}

function updateCamera(dt) {
  const p = game.player;
  if (!p) return;
  if (game.dungeon?.wrapEdges) {
    const t = clamp(dt * 8, 0, 1);
    const delta = shortestDungeonDelta(game.dungeon, game.camera.x, game.camera.y, p.x, p.y);
    game.camera.x += delta.dx * t;
    game.camera.y += delta.dy * t;
    wrapDungeonPoint(game.dungeon, game.camera);
    return;
  }
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

let lastCanvasSize = { width: 0, height: 0, dpr: 0 };

export function resize() {
  const size = measureCanvas();
  if (
    size.width === lastCanvasSize.width &&
    size.height === lastCanvasSize.height &&
    size.dpr === lastCanvasSize.dpr
  ) {
    return;
  }

  lastCanvasSize = size;
  state.renderer.resize(size.width, size.height, size.dpr);
}

export function frame(now) {
  const elapsed = clamp((now - timing.lastFrame) / 1000, 0, MAX_FRAME_DELTA_SECONDS);
  timing.lastFrame = now;
  resize();

  let remaining = elapsed;
  while (remaining > 0) {
    const dt = Math.min(TARGET_FRAME_SECONDS, remaining);
    update(dt);
    remaining -= dt;
  }

  render();
  requestAnimationFrame(frame);
}
