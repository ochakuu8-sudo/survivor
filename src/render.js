import {
  BACKGROUND_CACHE_LIMIT,
  MOBILE_CAMERA_ZOOM,
  TAU,
  TILE_SIZE,
  TOUCH_TABLET_CAMERA_ZOOM,
} from "./constants.js";
import * as state from "./state.js";
import { game, backgroundTileCache } from "./state.js";
import { canvas } from "./dom.js";
import { clamp, gridKey, hash2, mod } from "./utils/math.js";

export function render() {
  const view = viewSize();
  const zoom = cameraZoom(view);
  const shakeX = (Math.random() - 0.5) * game.shake;
  const shakeY = (Math.random() - 0.5) * game.shake;
  const camX = game.camera.x + shakeX;
  const camY = game.camera.y + shakeY;

  state.renderer.clear();
  state.renderer.begin();
  drawBackground(view, camX, camY, zoom);
  drawBackgroundDepth(view);
  drawWorld(view, camX, camY, zoom);
  state.renderer.flush();
}

function drawBackgroundDepth(view) {
  state.renderer.draw("white", view.w / 2, view.h / 2, view.w + 4, view.h + 4, {
    tint: [0.06, 0.07, 0.19],
    alpha: 0.14,
  });
}

function drawBackground(view, camX, camY, zoom) {
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const startX = Math.floor((camX - visibleW / 2) / TILE_SIZE) - 1;
  const endX = Math.floor((camX + visibleW / 2) / TILE_SIZE) + 1;
  const startY = Math.floor((camY - visibleH / 2) / TILE_SIZE) - 1;
  const endY = Math.floor((camY + visibleH / 2) / TILE_SIZE) + 1;

  for (let ty = startY; ty <= endY; ty += 1) {
    for (let tx = startX; tx <= endX; tx += 1) {
      const tile = getBackgroundTile(tx, ty);
      const type = tile.type;
      const worldX = tx * TILE_SIZE + TILE_SIZE / 2;
      const worldY = ty * TILE_SIZE + TILE_SIZE / 2;
      const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
      state.renderer.draw(type, screen.x, screen.y, (TILE_SIZE + 2) * zoom, (TILE_SIZE + 2) * zoom);

      if (tile.prop) {
        drawProp(tile.prop, tx, ty, view, camX, camY, zoom, tile.propOffset, tile.propY);
      }
    }
  }
}

function getBackgroundTile(tx, ty) {
  const key = gridKey(tx, ty);
  const cached = backgroundTileCache.get(key);
  if (cached) return cached;

  const type = tileSprite(tx, ty);
  const propRoll = hash2(tx, ty, 5);
  let prop = "";
  let propOffset = 0;

  if (type !== "road" && type !== "lane" && type !== "crosswalk") {
    if (propRoll < 0.045) {
      prop = "sign";
      propOffset = hash2(tx, ty, 7);
    } else if (propRoll < 0.085) {
      prop = "trash";
      propOffset = hash2(tx, ty, 9);
    }
  } else if (propRoll < 0.02) {
    prop = "car";
    propOffset = hash2(tx, ty, 11);
  }

  const tile = {
    type,
    prop,
    propOffset,
    propY: prop ? hash2(tx, ty, 17) : 0,
  };
  backgroundTileCache.set(key, tile);
  trimBackgroundTileCache();
  return tile;
}

function trimBackgroundTileCache() {
  if (backgroundTileCache.size <= BACKGROUND_CACHE_LIMIT) return;
  let removed = 0;
  for (const key of backgroundTileCache.keys()) {
    backgroundTileCache.delete(key);
    removed += 1;
    if (removed >= 512) break;
  }
}

function tileSprite(tx, ty) {
  const avenue = mod(tx, 7) <= 1;
  const street = mod(ty, 6) <= 1;
  const cross = avenue && street && (mod(tx, 7) === 1 || mod(ty, 6) === 1);
  if (cross) return "crosswalk";
  if (avenue || street) {
    return mod(tx + ty, 3) === 0 ? "lane" : "road";
  }
  if (mod(tx, 7) === 2 || mod(tx, 7) === 6 || mod(ty, 6) === 2 || mod(ty, 6) === 5) {
    return "sidewalk";
  }
  return "pavement";
}

function drawProp(name, tx, ty, view, camX, camY, zoom, roll, yRoll) {
  const worldX = tx * TILE_SIZE + 24 + roll * 48;
  const worldY = ty * TILE_SIZE + 18 + yRoll * 54;
  const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
  if (name === "sign") state.renderer.draw("glowRed", screen.x, screen.y - 18 * zoom, 110 * zoom, 90 * zoom, { alpha: 0.55 });
  if (name === "car") state.renderer.draw("glowAmber", screen.x + 12 * zoom, screen.y, 120 * zoom, 70 * zoom, { alpha: 0.24 });
  state.renderer.draw(name, screen.x, screen.y, state.atlas.sprites[name].w * zoom, state.atlas.sprites[name].h * zoom, {
    rotation: (roll - 0.5) * 0.6,
  });
}

function drawWorld(view, camX, camY, zoom) {
  for (const pickup of game.pickups) {
    const screen = worldToScreen(pickup.x, pickup.y + Math.sin(pickup.bob) * 4, view, camX, camY, zoom);
    state.renderer.draw("shadow", screen.x, screen.y + 13 * zoom, 36 * zoom, 14 * zoom, { alpha: 0.55 });
    state.renderer.draw("glowAmber", screen.x, screen.y, 42 * zoom, 42 * zoom, { alpha: 0.2 });
    state.renderer.draw("cashReadable", screen.x, screen.y, 25 * zoom, 25 * zoom, { rotation: Math.sin(pickup.bob) * 0.15 });
  }

  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    const screen = worldToScreen(particle.x, particle.y, view, camX, camY, zoom);
    const size = particle.size * (1.2 - alpha * 0.2) * zoom;
    state.renderer.draw(particle.sprite, screen.x, screen.y, size, size, {
      alpha,
      tint: particle.tint,
    });
  }

  const actors = game.enemies.map((enemy) => ({ kind: "enemy", y: enemy.y, item: enemy }));
  actors.push({ kind: "player", y: game.player.y, item: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const actor of actors) {
    if (actor.kind === "player") drawPlayer(actor.item, view, camX, camY, zoom);
    else drawEnemy(actor.item, view, camX, camY, zoom);
  }

  drawOrbitWeapons(view, camX, camY, zoom);
  drawEffects(view, camX, camY, zoom);

  for (const bullet of game.bullets) {
    const screen = worldToScreen(bullet.x, bullet.y, view, camX, camY, zoom);
    if (bullet.kind === "timedBomb" || bullet.kind === "pulseBomb") {
      let fuseAlpha;
      if (bullet.kind === "pulseBomb") {
        const interval = bullet.pulseInterval || 1;
        fuseAlpha = clamp(bullet.pulseTimer / interval, 0, 1);
      } else {
        fuseAlpha = clamp(bullet.life / (bullet.maxLife || bullet.life), 0, 1);
      }
      const blink = Math.sin(game.elapsed * (10 + (1 - fuseAlpha) * 18)) > 0 ? 1 : 0.45;
      state.renderer.draw(bullet.bulletGlow || "glowRed", screen.x, screen.y, 52 * zoom, 52 * zoom, { alpha: 0.22 + (1 - fuseAlpha) * 0.22 });
      state.renderer.draw("shadow", screen.x, screen.y + 11 * zoom, 34 * zoom, 13 * zoom, { alpha: 0.58 });
      state.renderer.draw("white", screen.x, screen.y, bullet.radius * 2.2 * zoom, bullet.radius * 2.2 * zoom, {
        rotation: game.elapsed * 0.7,
        tint: bullet.bulletTint || [1, 0.75, 0.35],
        alpha: 0.92,
      });
      state.renderer.draw("white", screen.x, screen.y - bullet.radius * 1.35 * zoom, 7 * zoom, 7 * zoom, {
        tint: [1, 0.22, 0.16],
        alpha: blink,
      });
    } else if (bullet.bulletSprite) {
      const stoneSize = bullet.radius * 2.4 * zoom;
      const lifeFrac = bullet.maxLife ? clamp(bullet.life / bullet.maxLife, 0, 1) : 1;
      const arc = Math.sin((1 - lifeFrac) * Math.PI);
      const arcOffset = arc * 32 * zoom;
      state.renderer.draw("shadow", screen.x, screen.y + stoneSize * 0.4, stoneSize * (1.05 - arc * 0.32), stoneSize * 0.4 * (1 - arc * 0.45), { alpha: 0.6 - arc * 0.32 });
      state.renderer.draw(bullet.bulletGlow || "glowAmber", screen.x, screen.y - arcOffset, stoneSize * 1.4, stoneSize * 1.4, { alpha: 0.18 + arc * 0.1 });
      state.renderer.draw(bullet.bulletSprite, screen.x, screen.y - arcOffset, stoneSize, stoneSize * 0.78, {
        rotation: bullet.spinSeed + game.elapsed * bullet.spinRate,
        tint: bullet.bulletTint || [1, 1, 1],
      });
    } else {
      state.renderer.draw(bullet.bulletGlow || "glowAmber", screen.x, screen.y, 42 * zoom, 30 * zoom, { alpha: 0.32 });
      state.renderer.draw("bulletReadable", screen.x, screen.y, bullet.radius * 4.2 * zoom, bullet.radius * 1.55 * zoom, {
        rotation: bullet.angle,
        tint: bullet.bulletTint || [1, 1, 1],
      });
    }
  }
}

function drawOrbitWeapons(view, camX, camY, zoom) {
  const player = game.player;
  if (!player?.gear) return;
  for (const weapon of player.gear.weapons) {
    if (weapon.kind !== "orbit") continue;
    const spin = game.elapsed * (weapon.orbitSpeed || 4.2) + weapon.id * 1.73;
    const orbitRadius = weapon.orbitRadius || 78;
    const x = player.x + Math.cos(spin) * orbitRadius;
    const y = player.y + Math.sin(spin) * orbitRadius;
    const headRadius = (weapon.areaRadius || 34) * 0.55;
    const tint = weapon.effectTint || [0.84, 0.88, 1];
    const glow = weapon.effectGlow || "glowCyan";

    const linkCount = 5;
    for (let i = 1; i <= linkCount; i += 1) {
      const t = i / (linkCount + 1);
      const lx = player.x + (x - player.x) * t;
      const ly = player.y + (y - player.y) * t;
      const ls = worldToScreen(lx, ly, view, camX, camY, zoom);
      const linkSize = (5 - Math.abs(i - (linkCount + 1) / 2) * 0.4) * zoom;
      state.renderer.draw("white", ls.x, ls.y + 2 * zoom, linkSize, linkSize, {
        tint: [0.18, 0.18, 0.24],
        alpha: 0.42,
      });
      state.renderer.draw("white", ls.x, ls.y, linkSize, linkSize, {
        tint: [0.55, 0.58, 0.68],
        alpha: 0.95,
        rotation: Math.PI / 4,
      });
    }

    const screen = worldToScreen(x, y, view, camX, camY, zoom);
    state.renderer.draw("shadow", screen.x, screen.y + headRadius * 0.6 * zoom, headRadius * 1.85 * zoom, headRadius * 0.7 * zoom, {
      alpha: 0.74,
    });
    state.renderer.draw(glow, screen.x, screen.y, headRadius * 4.4 * zoom, headRadius * 4.4 * zoom, {
      alpha: 0.34,
      tint,
    });

    const spikeCount = 4;
    const spikeSize = headRadius * 0.55 * zoom;
    for (let i = 0; i < spikeCount; i += 1) {
      const a = spin * 1.6 + (i / spikeCount) * (Math.PI * 2);
      const sx = x + Math.cos(a) * headRadius * 1.0;
      const sy = y + Math.sin(a) * headRadius * 1.0;
      const ss = worldToScreen(sx, sy, view, camX, camY, zoom);
      state.renderer.draw("white", ss.x, ss.y, spikeSize, spikeSize, {
        tint: [0.5, 0.54, 0.66],
        rotation: a + Math.PI / 4,
      });
    }

    state.renderer.draw("white", screen.x, screen.y, headRadius * 1.9 * zoom, headRadius * 1.9 * zoom, {
      tint: [0.78, 0.82, 0.92],
      rotation: spin * 1.6,
    });
    state.renderer.draw("white", screen.x - headRadius * 0.42 * zoom, screen.y - headRadius * 0.42 * zoom, headRadius * 0.55 * zoom, headRadius * 0.55 * zoom, {
      tint: [1, 1, 1],
      alpha: 0.72,
    });
  }
}

function drawEffects(view, camX, camY, zoom) {
  for (const effect of game.effects) {
    const alpha = clamp(effect.life / effect.maxLife, 0, 1);
    if (effect.type === "line" || effect.type === "damageLine") {
      const pulse = effect.type === "damageLine" ? 1 + Math.sin(game.elapsed * 26) * 0.12 : 1;
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * 1.9, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * (effect.type === "damageLine" ? 0.42 : 0.3),
      });
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * pulse, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.9,
      });
    } else if (effect.type === "burst") {
      const screen = worldToScreen(effect.x, effect.y, view, camX, camY, zoom);
      const pulse = 1 + (1 - alpha) * 0.55;
      const size = effect.radius * 2 * pulse * zoom;
      state.renderer.draw(effect.glow || "glowAmber", screen.x, screen.y, size, size, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.68,
      });
      state.renderer.draw("white", screen.x, screen.y, effect.radius * 1.2 * zoom, effect.radius * 1.2 * zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.16,
      });
    }
  }
}

function drawWorldLine(x1, y1, x2, y2, width, view, camX, camY, zoom, options = {}) {
  const start = worldToScreen(x1, y1, view, camX, camY, zoom);
  const end = worldToScreen(x2, y2, view, camX, camY, zoom);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.01) return;
  state.renderer.draw("white", (start.x + end.x) * 0.5, (start.y + end.y) * 0.5, length, Math.max(2, width * zoom), {
    rotation: Math.atan2(dy, dx),
    tint: options.tint || [1, 1, 1],
    alpha: options.alpha ?? 1,
  });
}

function drawPlayer(player, view, camX, camY, zoom) {
  const screen = worldToScreen(player.x, player.y, view, camX, camY, zoom);
  const moving = Math.hypot(player.moveX, player.moveY) > 0.05;
  const walkPulse = moving ? Math.sin(player.walkTime * TAU) : 0;
  const sprite = moving
    ? (Math.floor(player.walkTime * 2) % 2 === 0 ? "playerWalkAReadable" : "playerWalkBReadable")
    : "playerReadable";
  const lean = clamp(player.moveX, -1, 1) * 0.08;
  state.renderer.draw("glowCyan", screen.x, screen.y + 4 * zoom, 94 * zoom, 82 * zoom, { alpha: 0.2 });
  state.renderer.draw("shadow", screen.x, screen.y + 25 * zoom, 72 * (1 + Math.abs(walkPulse) * 0.08) * zoom, 32 * zoom, { alpha: 0.82 });
  state.renderer.draw(sprite, screen.x, screen.y + (-3 + (moving ? walkPulse * 1.2 : 0)) * zoom, 62 * zoom, 62 * zoom, { rotation: lean });
}

function drawEnemy(enemy, view, camX, camY, zoom) {
  const screen = worldToScreen(enemy.x, enemy.y, view, camX, camY, zoom);
  const size = enemy.radius * (enemy.sprite === "zombieBig" ? 3.0 : 2.7) * zoom;
  const wobble = Math.sin(game.elapsed * 7 + enemy.wobble) * 0.08;
  const tint = enemy.hit > 0 ? [1, 0.52, 0.52] : [1, 1, 1];
  state.renderer.draw("glowEnemyRed", screen.x, screen.y - enemy.radius * 0.12 * zoom, size * 1.15, size * 1.05, {
    alpha: enemy.sprite === "zombieBig" ? 0.13 : 0.09,
  });
  state.renderer.draw("shadow", screen.x, screen.y + enemy.radius * 0.8 * zoom, size * 1.02, size * 0.45, { alpha: 0.74 });
  state.renderer.draw(enemy.readableSprite, screen.x, screen.y - enemy.radius * 0.15 * zoom, size, size, {
    rotation: wobble,
    tint,
  });

  if (enemy.hp < enemy.maxHp) {
    const barW = enemy.radius * 2.2 * zoom;
    const y = screen.y - enemy.radius * 2.1 * zoom;
    state.renderer.draw("white", screen.x, y, barW, 5 * zoom, { tint: [0.12, 0.12, 0.15], alpha: 0.72 });
    state.renderer.draw("white", screen.x - barW * (1 - enemy.hp / enemy.maxHp) * 0.5, y, barW * enemy.hp / enemy.maxHp, 5 * zoom, {
      tint: [0.44, 0.96, 0.78],
      alpha: 0.9,
    });
  }
}

export function worldToScreen(x, y, view, camX, camY, zoom = 1) {
  return {
    x: (x - camX) * zoom + view.w / 2,
    y: (y - camY) * zoom + view.h / 2,
  };
}

export function viewSize() {
  return {
    w: canvas.width / state.renderer.dpr,
    h: canvas.height / state.renderer.dpr,
  };
}

export function cameraZoom(view) {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth <= 760;
  const shortSide = Math.min(view.w, view.h);
  if (coarsePointer || narrowViewport) {
    return shortSide <= 520 ? MOBILE_CAMERA_ZOOM : TOUCH_TABLET_CAMERA_ZOOM;
  }
  return 1;
}
