import * as state from "./state.js";
import { game, resetWeaponId, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { EXIT_HOLD_SECONDS, INITIAL_WEAPON_ONLY_RUN, INTERACTION_HOLD_SECONDS, MAX_FRAME_DELTA_SECONDS, MAX_STORED_ATTACHMENTS, TARGET_FRAME_SECONDS, TILE_SIZE } from "./constants.js";
import { clamp, lerp } from "./utils/math.js";
import { autoShoot, getActiveWeapon, updateDroneWeapons, updateOrbitWeapons, updateWeaponTimers } from "./weapons.js";
import { snapshotPlayerBaseStats } from "./attachments.js";
import { pickStrongestEnemyTypeForCurrentWave, resetEnemySpawnTimer, spawnEnemies, spawnEnemy, spawnOpeningEnemies, updateEnemies } from "./enemies.js";
import {
  ROOM_COMBAT,
  COMBAT_ROOM_ELITE,
  createTreasureChestAt,
  generateDungeon,
  getDungeonRoomAtWorld,
  hasReachedCombatRoomSword,
  hasReachedDungeonExit,
  lockDungeonRoom,
  roomSpawnPoints,
  shortestDungeonDelta,
  unlockDungeonRoom,
  wrapDungeonPoint,
} from "./dungeon.js";
import { updateBullets } from "./bullets.js";
import { updateParticles } from "./effects.js";
import { updateEffects, updateEnemyProjectiles } from "./combat.js";
import { updateGoldDrops } from "./gold.js";
import { updateTreasureChests } from "./treasure.js";
import { updateMovement } from "./player.js";
import { pickStarterWeapon, prepareStarterPick, renderStarterPick } from "./shop.js";
import { enterUpgradeTree, hideSkillTree, initSkillProgress } from "./skillTree.js";
import { updateHud } from "./hud.js";
import { render } from "./render.js";
import { beginStoneItemReward, hideModdingPanel } from "./modding.js";
import { updateFacilities } from "./workbench.js";
import { findStoneMaterial } from "./data/stoneItems.js";

export function resetRun() {
  game.mode = "weaponSelect";
  game.debugSkillTreeMode = false;
  game.wave = 1;
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
  game.spawnedMilestones = {
    elite90: false,
    elite180: false,
    boss270: false,
    weaponLv2: false,
    weaponLv3: false,
    weaponLv4: false,
    weaponLv5: false,
    weaponLv6: false,
    weaponLv7: false,
    weaponLv8: false,
    weaponLv9: false,
  };
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
      storageAttachmentsMax: MAX_STORED_ATTACHMENTS,
    },
  };
  game.dungeon = generateDungeon(game.wave);
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
  hud.restart.textContent = "もう一度プレイ";
  hud.gameOver.classList.add("hidden");
  hud.pauseMenu.classList.add("hidden");
  hud.debugPanel?.classList.add("hidden");
  prepareStarterPick();
  if (INITIAL_WEAPON_ONLY_RUN) {
    pickStarterWeapon(0);
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
  game.spawnedMilestones = {
    elite90: false,
    elite180: false,
    boss270: false,
    weaponLv2: false,
    weaponLv3: false,
    weaponLv4: false,
    weaponLv5: false,
    weaponLv6: false,
    weaponLv7: false,
    weaponLv8: false,
    weaponLv9: false,
  };
  game.enemies = [];
  game.bullets = [];
  game.enemyProjectiles = [];
  game.particles = [];
  game.goldDrops = [];
  game.effects = [];
  game.treasureReward = null;
  game.pendingAttachmentReward = null;
  game.modeBeforeAttachmentReward = null;
  game.dungeon = generateDungeon(game.wave);
  game.player.x = game.dungeon.start.x;
  game.player.y = game.dungeon.start.y;
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  applyWaveStartRecovery();
  hideSkillTree();
  hud.shop?.classList.add("hidden");
  hud.treasureReward.classList.add("hidden");
  hud.workbenchPanel?.classList.add("hidden");
  resetEnemySpawnTimer();
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
  finishRun("dead");
}

export function calculateRunBonus(result) {
  const t = game.floorElapsed || 0;
  let bonus = 0;
  if (t >= 60) bonus += 10;
  if (t >= 120) bonus += 15;
  if (t >= 180) bonus += 20;
  if (t >= 240) bonus += 25;
  if (result === "clear") bonus += 50;
  return bonus;
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const sec = String(safe % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

export function finishRun(result) {
  if (game.mode === "result") return;
  const survivalTime = game.floorElapsed || 0;
  const bonusPoints = calculateRunBonus(result);
  const totalEarnedPoints = (game.runPoints || 0) + bonusPoints;

  game.mode = "result";
  game.runResult = {
    result,
    survivalTime,
    kills: game.totalKills,
    waveKills: game.waveKills,
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
  hud.result.textContent =
    `${r?.result === "clear" ? "探索クリア！" : "探索はここまで"}\n` +
    `探索時間 ${time} / 最高 ${best}\n` +
    `撃破数 ${r?.kills || 0}\n` +
    `回収 ${r?.runPoints || 0}pt / ボーナス ${r?.bonusPoints || 0}pt\n` +
    `ラン中ビルドはリセットされます`;
  hud.restart.textContent = "もう一度プレイ";
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
  const p = game.player;
  p.invulnerableTimer = Math.max(0, (p.invulnerableTimer || 0) - dt);

  updateMovement(dt);
  updateTreasureChests(dt);
  updateFacilities(dt);
  updateDungeonExit(dt);
  updateWeaponTimers(p, dt);

  updateDungeonRoomEvents(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyProjectiles(dt);
  updateParticles(dt);
  updateGoldDrops(dt);
  updateEffects(dt);
  autoShoot();
  updateOrbitWeapons(dt);
  updateDroneWeapons(dt);
  updateCamera(dt);

  if (p.hp <= 0) {
    finishRun("dead");
  }

  updateHud();
}

function updateDungeonRoomEvents(dt) {
  const dungeon = game.dungeon;
  const player = game.player;
  if (!dungeon || !player || dungeon.arena) {
    spawnEnemies(dt);
    updateRunEvents();
    return;
  }

  const room = getDungeonRoomAtWorld(dungeon, player.x, player.y);
  if (room?.type === ROOM_COMBAT && !room.cleared && !room.entered) {
    updateCombatRoomSwordTrigger(dungeon, room, player, dt);
  } else {
    resetCombatRoomSwordTrigger(dungeon);
  }

  const activeRoom = dungeon.rooms?.find((entry) => entry.id === dungeon.activeRoomId);
  if (activeRoom?.type === ROOM_COMBAT && activeRoom.locked) {
    const alive = game.enemies.some((enemy) => !enemy.dead && enemy.roomId === activeRoom.id);
    if (!alive) clearCombatRoom(dungeon, activeRoom);
  }
}

function resetCombatRoomSwordTrigger(dungeon) {
  const previousRoom = dungeon?.rooms?.find((entry) => entry.id === dungeon.combatSwordHoldRoomId);
  if (previousRoom) previousRoom.swordHoldTimer = 0;
  if (dungeon) dungeon.combatSwordHoldRoomId = null;
}

function updateCombatRoomSwordTrigger(dungeon, room, player, dt) {
  if (dungeon.combatSwordHoldRoomId !== room.id) resetCombatRoomSwordTrigger(dungeon);
  dungeon.combatSwordHoldRoomId = room.id;

  if (!hasReachedCombatRoomSword(dungeon, room, player)) {
    resetCombatRoomSwordTrigger(dungeon);
    return;
  }

  room.swordHoldTimer = Math.min(INTERACTION_HOLD_SECONDS, (room.swordHoldTimer || 0) + dt);
  if (room.swordHoldTimer >= INTERACTION_HOLD_SECONDS) {
    resetCombatRoomSwordTrigger(dungeon);
    startCombatRoom(dungeon, room);
  }
}

function startCombatRoom(dungeon, room) {
  room.entered = true;
  room.cleared = false;
  dungeon.activeRoomId = room.id;
  lockDungeonRoom(dungeon, room);
  const isElite = room.combatKind === COMBAT_ROOM_ELITE;
  const count = Math.max(4, Math.min(isElite ? 12 : 14, 3 + game.wave + Math.floor(room.w * room.h / 14)));
  const points = roomSpawnPoints(dungeon, room, count + (isElite ? 1 : 0), isElite ? 28 : 22);
  if (isElite && points.length > 0) {
    const bossPoint = points.shift();
    const boss = spawnEnemy("bigZombie", { position: bossPoint, offscreen: false, noDeathChest: true });
    if (boss) boss.roomId = room.id;
  }
  const roomTypes = ["walker", "archer", "runner"];
  for (let i = 0; i < points.length && i < count; i += 1) {
    const enemyType = roomTypes[(room.id + i + (game.wave || 1)) % roomTypes.length];
    const enemy = spawnEnemy(enemyType, { position: points[i], offscreen: false });
    if (enemy) enemy.roomId = room.id;
  }
  game.shake = Math.max(game.shake, isElite ? 5 : 3);
}

function clearCombatRoom(dungeon, room) {
  room.cleared = true;
  dungeon.activeRoomId = null;
  unlockDungeonRoom(dungeon, room);
  if (room.combatKind === COMBAT_ROOM_ELITE) {
    const chest = createTreasureChestAt(
      dungeon.offsetX + (room.cx + 0.5) * TILE_SIZE,
      dungeon.offsetY + (room.cy + 0.5) * TILE_SIZE,
      "精鋭戦闘報酬",
      { rewardKind: "baseMaterialChoice" },
    );
    if (chest) chest.roomId = room.id;
  } else if (room.fixedRewardKey) {
    beginStoneItemReward({ key: room.fixedRewardKey }, { source: "combatRoom" });
    const material = findStoneMaterial(room.fixedRewardKey);
    room.rewardClaimed = true;
    room.rewardName = material?.name || "固定素材";
  }
  game.shake = Math.max(game.shake, 4);
}

function updateDungeonExit(dt) {
  const p = game.player;
  if (!p || !game.dungeon?.exit) return;
  if (!hasReachedDungeonExit(p)) {
    game.exitHoldTimer = 0;
    return;
  }
  game.exitHoldTimer = Math.min(EXIT_HOLD_SECONDS, (game.exitHoldTimer || 0) + dt);
  if (game.exitHoldTimer >= EXIT_HOLD_SECONDS) {
    game.exitHoldTimer = 0;
    startNextWave();
  }
}

function updateRunEvents() {
  const t = game.floorElapsed || 0;
  const m = game.spawnedMilestones || (game.spawnedMilestones = { elite90: false, elite180: false, boss270: false });
  const eliteType = pickStrongestEnemyTypeForCurrentWave();

  if (!m.elite90 && t >= 90) {
    m.elite90 = true;
    spawnEnemy(eliteType, { elite: true });
  }

  if (!m.elite180 && t >= 180) {
    m.elite180 = true;
    spawnEnemy(eliteType, { elite: true });
  }

  if (!m.boss270 && t >= 270) {
    m.boss270 = true;
    spawnEnemy(eliteType, { elite: true, boss: true });
  }
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
