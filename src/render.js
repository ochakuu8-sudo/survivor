import {
  BACKGROUND_CACHE_LIMIT,
  INTERACTION_HOLD_SECONDS,
  MOBILE_CAMERA_ZOOM,
  TAU,
  TILE_SIZE,
  TOUCH_TABLET_CAMERA_ZOOM,
} from "./constants.js";
import * as state from "./state.js";
import { game, backgroundTileCache } from "./state.js";
import { canvas } from "./dom.js";
import { clamp, gridKey, hash2, mod } from "./utils/math.js";
import {
  DUNGEON_EXIT,
  DUNGEON_WALL,
  dungeonFloorSprite,
  dungeonVisualTileCoords,
  getDungeonTile,
  isWalkableTile,
  nearestDungeonPoint,
} from "./dungeon.js";

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
    tint: [0.94, 1, 0.72],
    alpha: 0.09,
  });
}

function drawBackground(view, camX, camY, zoom) {
  if (game.dungeon) {
    drawDungeonBackground(game.dungeon, view, camX, camY, zoom);
    return;
  }

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

function drawDungeonBackground(dungeon, view, camX, camY, zoom) {
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  const startX = Math.floor((camX - visibleW / 2 - dungeon.offsetX) / TILE_SIZE) - 1;
  const endX = Math.floor((camX + visibleW / 2 - dungeon.offsetX) / TILE_SIZE) + 1;
  const startY = Math.floor((camY - visibleH / 2 - dungeon.offsetY) / TILE_SIZE) - 1;
  const endY = Math.floor((camY + visibleH / 2 - dungeon.offsetY) / TILE_SIZE) + 1;

  for (let ty = startY; ty <= endY; ty += 1) {
    for (let tx = startX; tx <= endX; tx += 1) {
      const tile = getDungeonTile(dungeon, tx, ty);
      const worldX = dungeon.offsetX + tx * TILE_SIZE + TILE_SIZE / 2;
      const worldY = dungeon.offsetY + ty * TILE_SIZE + TILE_SIZE / 2;
      const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
      const size = (TILE_SIZE + 2) * zoom;

      if (tile === DUNGEON_WALL) {
        state.renderer.draw("white", screen.x, screen.y, size, size, {
          tint: [0.14, 0.31, 0.12],
          alpha: 1,
        });
        drawDungeonWallEdges(dungeon, tx, ty, screen, zoom);
        continue;
      }

      state.renderer.draw(dungeonFloorSprite(tx, ty, dungeon), screen.x, screen.y, size, size, {
        tint: tile === DUNGEON_EXIT ? [1, 0.96, 0.68] : [1, 1, 0.94],
      });
      state.renderer.draw("white", screen.x, screen.y, size, size, {
        tint: tile === DUNGEON_EXIT ? [0.48, 0.36, 0.06] : [0.32, 0.27, 0.08],
        alpha: tile === DUNGEON_EXIT ? 0.08 : 0.04,
      });

      if (tile !== DUNGEON_EXIT) {
        const visual = dungeonVisualTileCoords(dungeon, tx, ty);
        const propRoll = hash2(visual.tx, visual.ty, dungeon.seed);
        if (propRoll < 0.035) drawProp("trash", tx, ty, view, camX, camY, zoom, hash2(visual.tx, visual.ty, 7), hash2(visual.tx, visual.ty, 17), dungeon.offsetX, dungeon.offsetY);
        else if (propRoll < 0.055) drawProp("sign", tx, ty, view, camX, camY, zoom, hash2(visual.tx, visual.ty, 11), hash2(visual.tx, visual.ty, 19), dungeon.offsetX, dungeon.offsetY);
      }
    }
  }
}

function drawDungeonWallEdges(dungeon, tx, ty, screen, zoom) {
  const edgeTint = [0.47, 0.73, 0.25];
  const edgeAlpha = 0.78;
  const edge = Math.max(2, 5 * zoom);
  const size = TILE_SIZE * zoom;
  if (isWalkableTile(dungeon, tx, ty - 1)) {
    state.renderer.draw("white", screen.x, screen.y - size / 2 + edge / 2, size, edge, { tint: edgeTint, alpha: edgeAlpha });
  }
  if (isWalkableTile(dungeon, tx, ty + 1)) {
    state.renderer.draw("white", screen.x, screen.y + size / 2 - edge / 2, size, edge, { tint: edgeTint, alpha: edgeAlpha });
  }
  if (isWalkableTile(dungeon, tx - 1, ty)) {
    state.renderer.draw("white", screen.x - size / 2 + edge / 2, screen.y, edge, size, { tint: edgeTint, alpha: edgeAlpha });
  }
  if (isWalkableTile(dungeon, tx + 1, ty)) {
    state.renderer.draw("white", screen.x + size / 2 - edge / 2, screen.y, edge, size, { tint: edgeTint, alpha: edgeAlpha });
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

function drawProp(name, tx, ty, view, camX, camY, zoom, roll, yRoll, offsetX = 0, offsetY = 0) {
  const worldX = offsetX + tx * TILE_SIZE + 24 + roll * 48;
  const worldY = offsetY + ty * TILE_SIZE + 18 + yRoll * 54;
  const screen = worldToScreen(worldX, worldY, view, camX, camY, zoom);
  if (name === "sign") state.renderer.draw("glowAmber", screen.x, screen.y - 8 * zoom, 110 * zoom, 82 * zoom, { alpha: 0.16 });
  if (name === "car") state.renderer.draw("glowAmber", screen.x + 12 * zoom, screen.y, 120 * zoom, 70 * zoom, { alpha: 0.1 });
  state.renderer.draw(name, screen.x, screen.y, state.atlas.sprites[name].w * zoom, state.atlas.sprites[name].h * zoom, {
    rotation: (roll - 0.5) * 0.6,
  });
}

function drawWorld(view, camX, camY, zoom) {
  if (!game.dungeon?.arena) drawDungeonExit(view, camX, camY, zoom);

  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    const screen = worldToScreen(particle.x, particle.y, view, camX, camY, zoom);
    const size = particle.size * (1.2 - alpha * 0.2) * zoom;
    state.renderer.draw(particle.sprite, screen.x, screen.y, size, size, {
      alpha,
      tint: particle.tint,
    });
  }

  drawGoldDrops(view, camX, camY, zoom);

  const actors = (game.dungeon?.obstacles || []).map((obstacle) => ({
    kind: "obstacle",
    y: obstacle.y + (obstacle.radius || 10) * 0.45,
    item: obstacle,
  }));
  actors.push(...(game.dungeon?.chests || []).map((chest) => ({
    kind: "chest",
    y: chest.y + chest.radius * 0.55,
    item: chest,
  })));
  actors.push(...game.enemies.map((enemy) => ({ kind: "enemy", y: enemy.y, item: enemy })));
  actors.push({ kind: "player", y: game.player.y, item: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const actor of actors) {
    if (actor.kind === "player") drawPlayer(actor.item, view, camX, camY, zoom);
    else if (actor.kind === "obstacle") drawSceneryObstacle(actor.item, view, camX, camY, zoom);
    else if (actor.kind === "chest") drawTreasureChest(actor.item, view, camX, camY, zoom);
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

  for (const proj of game.enemyProjectiles) {
    const screen = worldToScreen(proj.x, proj.y, view, camX, camY, zoom);
    const size = (proj.radius || 8) * zoom;
    state.renderer.draw("glowAmber", screen.x, screen.y, size * 6, size * 6, { alpha: 0.18 });
    state.renderer.draw("shadow", screen.x, screen.y + size * 1.6, size * 4, size * 1.4, { alpha: 0.5 });
    state.renderer.draw("boneReadable", screen.x, screen.y, size * 4.5, size * 2, {
      rotation: (proj.spinSeed || 0) + game.elapsed * (proj.spinRate || 8),
      tint: [1, 1, 1],
    });
  }
}

function drawDungeonExit(view, camX, camY, zoom) {
  const exit = game.dungeon?.exit;
  if (!exit) return;
  const screen = worldToScreen(exit.x, exit.y, view, camX, camY, zoom);
  const pulse = 1 + Math.sin(game.elapsed * 4) * 0.08;
  state.renderer.draw("glowAmber", screen.x, screen.y, 190 * pulse * zoom, 190 * pulse * zoom, { alpha: 0.34 });
  state.renderer.draw("white", screen.x, screen.y, 70 * zoom, 70 * zoom, {
    tint: [0.96, 0.76, 0.26],
    alpha: 0.88,
    rotation: Math.PI / 4,
  });
  state.renderer.draw("white", screen.x, screen.y, 42 * zoom, 42 * zoom, {
    tint: [0.92, 1, 0.62],
    alpha: 0.88,
  });
  state.renderer.draw("white", screen.x, screen.y - 4 * zoom, 18 * zoom, 54 * zoom, {
    tint: [0.3, 0.18, 0.08],
    alpha: 0.85,
  });
  drawHoldProgress(screen.x, screen.y + 50 * zoom, game.exitHoldTimer / INTERACTION_HOLD_SECONDS, 72 * zoom, zoom, [0.92, 1, 0.62]);
}

function drawOrbitWeapons(view, camX, camY, zoom) {
  const player = game.player;
  if (!player?.gear) return;
  const activeIndex = Math.min(
    Math.max(player.gear.activeWeaponIndex || 0, 0),
    Math.max(0, player.gear.weapons.length - 1),
  );
  const weapon = player.gear.weapons[activeIndex];
  if (!weapon || weapon.kind !== "orbit") return;

  const orbitCount = Math.max(1, Math.round(weapon.orbitCount || 1));
  for (let orbitIndex = 0; orbitIndex < orbitCount; orbitIndex += 1) {
    const phase = (orbitIndex / orbitCount) * TAU;
    const spin = game.elapsed * (weapon.orbitSpeed || 4.2) + weapon.id * 1.73 + phase;
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
    } else if (effect.type === "telegraph") {
      const screen = worldToScreen(effect.x, effect.y, view, camX, camY, zoom);
      const t = clamp(1 - alpha, 0, 1);
      const size = effect.radius * 2 * zoom;
      state.renderer.draw(effect.glow || "glowRed", screen.x, screen.y, size, size, {
        tint: effect.tint || [0.86, 0.2, 0.18],
        alpha: 0.18 + t * 0.26,
      });
    } else if (effect.type === "telegraphLine") {
      const t = clamp(1 - alpha, 0, 1);
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width, view, camX, camY, zoom, {
        tint: effect.tint || [0.86, 0.2, 0.18],
        alpha: 0.18 + t * 0.26,
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
  const invulnerable = (player.invulnerableTimer || 0) > 0;
  const blink = invulnerable && Math.sin(game.elapsed * 34) > 0;
  state.renderer.draw("glowCyan", screen.x, screen.y + 4 * zoom, 94 * zoom, 82 * zoom, {
    alpha: invulnerable ? 0.34 : 0.2,
  });
  state.renderer.draw("shadow", screen.x, screen.y + 25 * zoom, 72 * (1 + Math.abs(walkPulse) * 0.08) * zoom, 32 * zoom, { alpha: 0.82 });
  state.renderer.draw(sprite, screen.x, screen.y + (-3 + (moving ? walkPulse * 1.2 : 0)) * zoom, 62 * zoom, 62 * zoom, {
    alpha: blink ? 0.5 : 1,
    rotation: lean,
    tint: invulnerable ? [0.72, 1, 1] : [1, 1, 1],
  });
}

function drawEnemy(enemy, view, camX, camY, zoom) {
  const screen = worldToScreen(enemy.x, enemy.y, view, camX, camY, zoom);
  const isLarge = enemy.kind === "orc";
  const size = enemy.radius * (isLarge ? 3.0 : 2.7) * zoom;
  const wobble = Math.sin(game.elapsed * 7 + enemy.wobble) * 0.08;
  const tint = enemy.hit > 0 ? [1, 0.52, 0.52] : [1, 1, 1];
  state.renderer.draw("glowEnemyRed", screen.x, screen.y - enemy.radius * 0.12 * zoom, size * 1.15, size * 1.05, {
    alpha: isLarge ? 0.13 : 0.09,
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

function drawGoldDrops(view, camX, camY, zoom) {
  for (const drop of game.goldDrops) {
    const screen = worldToScreen(drop.x, drop.y, view, camX, camY, zoom);
    const bob = Math.sin(game.elapsed * 8 + drop.bob) * 1.5 * zoom;
    const size = 23 * zoom;
    if (screen.x < -size || screen.x > view.w + size || screen.y < -size || screen.y > view.h + size) continue;
    const magnetized = drop.age >= drop.magnetDelay;
    state.renderer.draw("shadow", screen.x, screen.y + 9 * zoom, 24 * zoom, 9 * zoom, { alpha: 0.42 });
    if (magnetized) {
      state.renderer.draw("glowAmber", screen.x, screen.y + bob, 42 * zoom, 42 * zoom, { alpha: 0.14 });
    }
    state.renderer.draw("goldCoin", screen.x, screen.y + bob, size, size, {
      rotation: Math.sin(game.elapsed * 4 + drop.spin) * 0.1,
    });
  }
}

function drawTreasureChest(chest, view, camX, camY, zoom) {
  const screen = worldToScreen(chest.x, chest.y, view, camX, camY, zoom);
  const spriteName = chest.opened ? "treasureChestOpen" : "treasureChest";
  const bob = chest.opened ? 0 : Math.sin(game.elapsed * 3 + chest.bob) * 1.6 * zoom;
  const width = 54 * zoom;
  const height = 48 * zoom;
  state.renderer.draw("shadow", screen.x, screen.y + 16 * zoom, 52 * zoom, 16 * zoom, { alpha: 0.58 });
  if (!chest.opened) {
    state.renderer.draw("glowAmber", screen.x, screen.y + bob, 88 * zoom, 70 * zoom, { alpha: 0.18 });
    drawHoldProgress(screen.x, screen.y + 44 * zoom, chest.holdTimer / INTERACTION_HOLD_SECONDS, 56 * zoom, zoom, [1, 0.86, 0.28]);
  }
  state.renderer.draw(spriteName, screen.x, screen.y + bob, width, height);
}

function drawHoldProgress(x, y, progress, width, zoom, tint) {
  const value = clamp(progress || 0, 0, 1);
  if (value <= 0) return;
  const height = Math.max(4, 5 * zoom);
  state.renderer.draw("white", x, y, width, height + 3 * zoom, { tint: [0.1, 0.12, 0.14], alpha: 0.7 });
  state.renderer.draw("white", x - width * (1 - value) * 0.5, y, width * value, height, {
    tint,
    alpha: 0.96,
  });
}

function drawSceneryObstacle(obstacle, view, camX, camY, zoom) {
  const sprite = state.atlas.sprites[obstacle.sprite];
  if (!sprite) return;
  const screen = worldToScreen(obstacle.x, obstacle.y, view, camX, camY, zoom);
  const scale = obstacle.scale || 1;
  const width = sprite.w * scale * zoom;
  const height = sprite.h * scale * zoom;
  if (screen.x < -width || screen.x > view.w + width || screen.y < -height || screen.y > view.h + height) return;

  const solid = obstacle.radius > 0;
  state.renderer.draw("shadow", screen.x, screen.y + height * 0.28, width * (solid ? 0.78 : 0.56), Math.max(10, height * 0.22), {
    alpha: solid ? 0.58 : 0.24,
  });
  state.renderer.draw(obstacle.sprite, screen.x, screen.y, width, height, {
    rotation: obstacle.rotation || 0,
  });
}

export function worldToScreen(x, y, view, camX, camY, zoom = 1) {
  const point = nearestDungeonPoint(game.dungeon, x, y, camX, camY);
  return {
    x: (point.x - camX) * zoom + view.w / 2,
    y: (point.y - camY) * zoom + view.h / 2,
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
