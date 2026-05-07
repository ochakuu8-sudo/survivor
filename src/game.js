import { WAVE_SECONDS } from "./constants.js";
import * as state from "./state.js";
import { game, resetWeaponId, timing } from "./state.js";
import { canvas, hud } from "./dom.js";
import { clamp, lerp } from "./utils/math.js";
import { autoShoot, createWeapon, updateWeaponTimers } from "./weapons.js";
import { spawnEnemies, updateEnemies } from "./enemies.js";
import { updateBullets } from "./bullets.js";
import { updatePickups } from "./pickups.js";
import { updateParticles } from "./effects.js";
import { updateEffects } from "./combat.js";
import { updateMovement } from "./player.js";
import { generateOffers, renderShop } from "./shop.js";
import { updateHud } from "./hud.js";
import { render } from "./render.js";

export function resetRun() {
  game.mode = "fight";
  game.wave = 1;
  game.timeLeft = WAVE_SECONDS;
  game.elapsed = 0;
  game.money = 0;
  game.totalKills = 0;
  game.waveKills = 0;
  game.rerolls = 0;
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
    hp: 100,
    maxHp: 100,
    speed: 215,
    pickup: 150,
    armor: 0,
    regen: 0,
    weaponPowerBonus: 0,
    moveX: 0,
    moveY: 0,
    walkTime: 0,
    walkDustTimer: 0,
    gear: {
      weapons: [
        createWeapon({
          name: "石",
          damage: 40,
          fireRate: 0.72,
          bulletSpeed: 560,
          life: 0.78,
          radius: 12,
          kick: 2.8,
          bulletTint: [0.88, 0.84, 0.74],
          bulletGlow: "glowAmber",
        }),
      ],
      attachments: [],
      relics: [],
    },
  };
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.offers = [];
  game.selectedAttachment = null;
  hud.shop.classList.add("hidden");
  hud.gameOver.classList.add("hidden");
  updateHud();
}

export function startNextWave() {
  game.mode = "fight";
  game.wave += 1;
  game.timeLeft = WAVE_SECONDS;
  game.waveKills = 0;
  game.rerolls = 0;
  game.spawnClock = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.28, 1, game.player.maxHp);
  hud.shop.classList.add("hidden");
  updateHud();
}

export function enterShop() {
  game.mode = "shop";
  game.rerolls = 0;
  game.enemies = [];
  game.bullets = [];
  game.pickups = [];
  game.particles = [];
  game.effects = [];
  game.player.hp = clamp(game.player.hp + game.player.maxHp * 0.2, 1, game.player.maxHp);
  generateOffers();
  renderShop();
  hud.shop.classList.remove("hidden");
}

export function endRun() {
  game.mode = "over";
  hud.result.textContent = `第${game.wave}夜、撃破数 ${game.totalKills}、残りコイン ${game.money}枚。`;
  hud.gameOver.classList.remove("hidden");
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

  const p = game.player;
  game.timeLeft -= dt;

  updateMovement(dt);
  p.hp = clamp(p.hp + p.regen * dt, 0, p.maxHp);
  updateWeaponTimers(p, dt);

  spawnEnemies(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateEffects(dt);
  autoShoot();
  updateCamera(dt);

  if (p.hp <= 0) {
    endRun();
  } else if (game.timeLeft <= 0) {
    enterShop();
  }

  updateHud();
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
