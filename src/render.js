import {
  BACKGROUND_CACHE_LIMIT,
  EXIT_HOLD_SECONDS,
  INTERACTION_HOLD_SECONDS,
  MOBILE_CAMERA_ZOOM,
  TAU,
  TILE_SIZE,
  TOUCH_TABLET_CAMERA_ZOOM,
} from "./constants.js";
import * as state from "./state.js";
import { game, backgroundTileCache } from "./state.js";
import { canvas, hud, worldLabels } from "./dom.js";
import { clamp, gridKey, hash2, mod } from "./utils/math.js";
import {
  DUNGEON_EXIT,
  DUNGEON_WALL,
  ROOM_COMBAT,
  COMBAT_ROOM_ELITE,
  ROOM_START,
  ROOM_STAIRS,
  ROOM_TREASURE,
  ROOM_WORKBENCH,
  combatRoomSwordPosition,
  dungeonFloorSprite,
  dungeonVisualTileCoords,
  getDungeonRoomAt,
  getDungeonTile,
  isWalkableTile,
  nearestDungeonPoint,
} from "./dungeon.js";
import { findStoneMaterial } from "./data/stoneItems.js";

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
  updateWorldLabels(view, camX, camY, zoom);
  state.renderer.flush();
  publishRenderStats();
}


function updateWorldLabels(view, camX, camY, zoom) {
  if (!worldLabels) return;
  const treasureVaults = (game.dungeon?.facilities || [])
    .filter((facility) => facility.type === "treasureVault" && !facility.opened && Number.isFinite(facility.cost))
    .filter((facility) => {
      const pos = visiblePositionForDraw(facility, camX, camY);
      return isVisibleWorld(pos.x, pos.y, facility.radius * 2.8, view, camX, camY, zoom);
    });

  while (worldLabels.children.length > treasureVaults.length) {
    worldLabels.removeChild(worldLabels.lastElementChild);
  }
  while (worldLabels.children.length < treasureVaults.length) {
    const label = document.createElement("div");
    label.className = "world-label";
    worldLabels.append(label);
  }

  treasureVaults.forEach((facility, index) => {
    const label = worldLabels.children[index];
    const pos = visiblePositionForDraw(facility, camX, camY);
    const screen = worldToScreen(pos.x, pos.y - 58, view, camX, camY, zoom);
    label.textContent = `${facility.cost}G`;
    label.style.transform = `translate(${Math.round(screen.x)}px, ${Math.round(screen.y)}px) translate(-50%, -50%)`;
    label.classList.remove("hidden");
  });
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

      const room = getDungeonRoomAt(dungeon, tx, ty);
      const style = dungeonRoomFloorStyle(room, tx, ty, tile);
      state.renderer.draw(dungeonFloorSprite(tx, ty, dungeon), screen.x, screen.y, size, size, {
        tint: style.baseTint,
      });
      state.renderer.draw("white", screen.x, screen.y, size, size, {
        tint: style.overlayTint,
        alpha: style.overlayAlpha,
      });
      drawDungeonRoomFloorMark(style, tx, ty, screen, size, zoom);

      if (tile !== DUNGEON_EXIT) {
        const visual = dungeonVisualTileCoords(dungeon, tx, ty);
        const propRoll = hash2(visual.tx, visual.ty, dungeon.seed);
        if (propRoll < 0.035) drawProp("trash", tx, ty, view, camX, camY, zoom, hash2(visual.tx, visual.ty, 7), hash2(visual.tx, visual.ty, 17), dungeon.offsetX, dungeon.offsetY);
        else if (propRoll < 0.055) drawProp("sign", tx, ty, view, camX, camY, zoom, hash2(visual.tx, visual.ty, 11), hash2(visual.tx, visual.ty, 19), dungeon.offsetX, dungeon.offsetY);
      }
    }
  }
}

function dungeonRoomFloorStyle(room, tx, ty, tile) {
  if (tile === DUNGEON_EXIT || room?.type === ROOM_STAIRS) {
    return { type: ROOM_STAIRS, baseTint: [1, 0.96, 0.68], overlayTint: [0.48, 0.36, 0.06], overlayAlpha: 0.1 };
  }
  if (!room) return { type: "corridor", baseTint: [1, 1, 0.94], overlayTint: [0.32, 0.27, 0.08], overlayAlpha: 0.04 };
  if (room.type === ROOM_COMBAT) return { type: ROOM_COMBAT, baseTint: [1, 0.82, 0.76], overlayTint: [0.58, 0.08, 0.05], overlayAlpha: room.cleared ? 0.07 : 0.13 };
  if (room.type === ROOM_TREASURE) return { type: ROOM_TREASURE, baseTint: [1, 0.95, 0.55], overlayTint: [0.72, 0.48, 0.04], overlayAlpha: 0.12 };
  if (room.type === ROOM_WORKBENCH) return { type: ROOM_WORKBENCH, baseTint: [0.72, 0.94, 1], overlayTint: [0.04, 0.36, 0.56], overlayAlpha: 0.11 };
  if (room.type === ROOM_START) return { type: ROOM_START, baseTint: [0.82, 1, 0.78], overlayTint: [0.08, 0.44, 0.12], overlayAlpha: 0.08 };
  return { type: "corridor", baseTint: [1, 1, 0.94], overlayTint: [0.32, 0.27, 0.08], overlayAlpha: 0.04 };
}

function drawDungeonRoomFloorMark(style, tx, ty, screen, size, zoom) {
  if (!style?.type || style.type === "corridor") return;
  const thin = Math.max(2, 3 * zoom);
  if (style.type === ROOM_COMBAT && (tx + ty) % 2 === 0) {
    state.renderer.draw("white", screen.x, screen.y, size * 0.78, thin, { tint: [0.78, 0.06, 0.04], alpha: 0.18, rotation: 0.78 });
    return;
  }
  if (style.type === ROOM_TREASURE) {
    state.renderer.draw("white", screen.x, screen.y, size * 0.52, thin, { tint: [1, 0.92, 0.28], alpha: 0.24 });
    state.renderer.draw("white", screen.x, screen.y, thin, size * 0.52, { tint: [1, 0.92, 0.28], alpha: 0.24 });
    return;
  }
  if (style.type === ROOM_WORKBENCH && tx % 2 === 0) {
    state.renderer.draw("white", screen.x, screen.y, thin, size * 0.72, { tint: [0.16, 0.68, 0.86], alpha: 0.18 });
    return;
  }
  if (style.type === ROOM_STAIRS) {
    state.renderer.draw("white", screen.x, screen.y, size * 0.62, thin, { tint: [0.58, 0.36, 0.04], alpha: 0.2 });
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

const DEFAULT_CULL_MARGIN = 96;
const MAX_RENDERED_ENEMIES = 900;

function createFrameRenderStats() {
  return {
    enemies: game.enemies.length,
    visibleEnemies: 0,
    renderedEnemies: 0,
    bullets: game.bullets.length,
    visibleBullets: 0,
    enemyProjectiles: game.enemyProjectiles.length,
    visibleEnemyProjectiles: 0,
    goldDrops: game.goldDrops.length,
    visibleGoldDrops: 0,
    effects: game.effects.length,
    visibleEffects: 0,
    particles: game.particles.length,
    visibleParticles: 0,
    quads: 0,
    drawCalls: 0,
    flushes: 0,
  };
}

function publishRenderStats() {
  const stats = game.renderStats || createFrameRenderStats();
  const rendererStats = state.renderer.stats || {};
  stats.quads = rendererStats.quads || 0;
  stats.drawCalls = rendererStats.drawCalls || 0;
  stats.flushes = rendererStats.flushes || 0;
  stats.maxVertices = rendererStats.maxVertices || 0;
  stats.skippedSprites = rendererStats.skippedSprites || 0;
  stats.frameBufferUploads = rendererStats.frameBufferUploads || 0;
  game.renderStats = stats;

  if (hud.debugStats && !hud.debugPanel?.classList.contains("hidden")) {
    hud.debugStats.textContent =
      `enemies ${stats.visibleEnemies}/${stats.enemies} rendered ${stats.renderedEnemies}\n` +
      `bullets ${stats.visibleBullets}/${stats.bullets} enemy ${stats.visibleEnemyProjectiles}/${stats.enemyProjectiles}\n` +
      `drops ${stats.visibleGoldDrops}/${stats.goldDrops} particles ${stats.visibleParticles}/${stats.particles} effects ${stats.visibleEffects}/${stats.effects}\n` +
      `quads ${stats.quads} drawCalls ${stats.drawCalls} flushes ${stats.flushes}`;
  }
}

function visiblePositionForDraw(item, camX, camY) {
  if (game.dungeon?.wrapEdges) {
    return nearestDungeonPoint(game.dungeon, item.x, item.y, camX, camY);
  }
  return { x: item.x, y: item.y };
}

function isVisibleWorld(x, y, radius, view, camX, camY, zoom, margin = DEFAULT_CULL_MARGIN) {
  const visibleW = view.w / zoom;
  const visibleH = view.h / zoom;
  return (
    x + radius >= camX - visibleW / 2 - margin &&
    x - radius <= camX + visibleW / 2 + margin &&
    y + radius >= camY - visibleH / 2 - margin &&
    y - radius <= camY + visibleH / 2 + margin
  );
}

function isVisibleLineWorld(x1, y1, x2, y2, width, view, camX, camY, zoom, margin = DEFAULT_CULL_MARGIN) {
  const start = game.dungeon?.wrapEdges ? nearestDungeonPoint(game.dungeon, x1, y1, camX, camY) : { x: x1, y: y1 };
  const end = game.dungeon?.wrapEdges ? nearestDungeonPoint(game.dungeon, x2, y2, start.x, start.y) : { x: x2, y: y2 };
  const cx = (start.x + end.x) * 0.5;
  const cy = (start.y + end.y) * 0.5;
  const radius = Math.hypot(end.x - start.x, end.y - start.y) * 0.5 + width;
  return isVisibleWorld(cx, cy, radius, view, camX, camY, zoom, margin);
}

function drawWorld(view, camX, camY, zoom) {
  const frameStats = createFrameRenderStats();

  if (!game.dungeon?.arena) drawDungeonStairs(view, camX, camY, zoom);

  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    const radius = Math.max(12, particle.size * 1.4);
    const pos = visiblePositionForDraw(particle, camX, camY);
    if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom, 64)) continue;
    frameStats.visibleParticles += 1;
    const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
    const size = particle.size * (1.2 - alpha * 0.2) * zoom;
    state.renderer.draw(particle.sprite, screen.x, screen.y, size, size, {
      alpha,
      tint: particle.tint,
    });
  }

  drawGoldDrops(view, camX, camY, zoom, frameStats);

  const actors = [];
  for (const obstacle of game.dungeon?.obstacles || []) {
    const sprite = state.atlas.sprites[obstacle.sprite];
    const scale = obstacle.scale || 1;
    const radius = Math.max(obstacle.radius || 10, sprite ? Math.max(sprite.w, sprite.h) * scale * 0.55 : 28);
    const pos = visiblePositionForDraw(obstacle, camX, camY);
    if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom)) continue;
    actors.push({
      kind: "obstacle",
      y: pos.y + (obstacle.radius || 10) * 0.45,
      item: obstacle,
      drawX: pos.x,
      drawY: pos.y,
    });
  }

  for (const chest of game.dungeon?.chests || []) {
    const pos = visiblePositionForDraw(chest, camX, camY);
    if (!isVisibleWorld(pos.x, pos.y, chest.radius * 2.2, view, camX, camY, zoom)) continue;
    actors.push({
      kind: "chest",
      y: pos.y + chest.radius * 0.55,
      item: chest,
      drawX: pos.x,
      drawY: pos.y,
    });
  }

  for (const facility of game.dungeon?.facilities || []) {
    const pos = visiblePositionForDraw(facility, camX, camY);
    if (!isVisibleWorld(pos.x, pos.y, facility.radius * 2.4, view, camX, camY, zoom)) continue;
    actors.push({
      kind: "facility",
      y: pos.y + facility.radius * 0.55,
      item: facility,
      drawX: pos.x,
      drawY: pos.y,
    });
  }

  for (const room of game.dungeon?.rooms || []) {
    if (room.type !== ROOM_COMBAT || room.cleared || room.entered) continue;
    const sword = combatRoomSwordPosition(game.dungeon, room);
    if (!isVisibleWorld(sword.x, sword.y, 72, view, camX, camY, zoom)) continue;
    actors.push({
      kind: "combatSword",
      y: sword.y + 26,
      item: room,
      drawX: sword.x,
      drawY: sword.y,
    });
  }

  const visibleEnemies = [];
  for (const enemy of game.enemies) {
    const pos = visiblePositionForDraw(enemy, camX, camY);
    const radius = enemy.radius * 3.2;
    if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom)) continue;
    const dx = pos.x - camX;
    const dy = pos.y - camY;
    visibleEnemies.push({
      kind: "enemy",
      y: pos.y,
      item: enemy,
      drawX: pos.x,
      drawY: pos.y,
      distanceSq: dx * dx + dy * dy,
    });
  }

  frameStats.visibleEnemies = visibleEnemies.length;
  if (visibleEnemies.length > MAX_RENDERED_ENEMIES) {
    visibleEnemies.sort((a, b) => a.distanceSq - b.distanceSq);
    visibleEnemies.length = MAX_RENDERED_ENEMIES;
  }
  frameStats.renderedEnemies = visibleEnemies.length;
  actors.push(...visibleEnemies);
  actors.push({ kind: "player", y: game.player.y, item: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const actor of actors) {
    if (actor.kind === "player") drawPlayer(actor.item, view, camX, camY, zoom);
    else if (actor.kind === "obstacle") drawSceneryObstacle(actor.item, view, camX, camY, zoom, actor.drawX, actor.drawY);
    else if (actor.kind === "chest") drawTreasureChest(actor.item, view, camX, camY, zoom, actor.drawX, actor.drawY);
    else if (actor.kind === "facility") drawFacility(actor.item, view, camX, camY, zoom, actor.drawX, actor.drawY);
    else if (actor.kind === "combatSword") drawCombatSword(actor.item, view, camX, camY, zoom, actor.drawX, actor.drawY);
    else drawEnemy(actor.item, view, camX, camY, zoom, actor.drawX, actor.drawY);
  }

  drawOrbitWeapons(view, camX, camY, zoom);
  drawDroneWeapons(view, camX, camY, zoom);
  drawEffects(view, camX, camY, zoom, frameStats);

  for (const bullet of game.bullets) {
    const pos = visiblePositionForDraw(bullet, camX, camY);
    const radius = Math.max(32, (bullet.radius || 8) * 4);
    if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom, 128)) continue;
    frameStats.visibleBullets += 1;
    const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
    if (bullet.kind === "mine") {
      const armed = (bullet.maxLife || 0) - bullet.life >= (bullet.armingTime || 0.35);
      const blink = armed ? 0.55 + Math.sin(game.elapsed * 10) * 0.35 : 0.35;
      state.renderer.draw(bullet.bulletGlow || "glowRed", screen.x, screen.y, 48 * zoom, 48 * zoom, { alpha: armed ? 0.28 : 0.12 });
      state.renderer.draw("shadow", screen.x, screen.y + 8 * zoom, 32 * zoom, 12 * zoom, { alpha: 0.62 });
      state.renderer.draw(bullet.bulletSprite || "mine", screen.x, screen.y, 28 * zoom, 22 * zoom, {
        tint: armed ? [1, 1, 1] : [0.52, 0.55, 0.58],
      });
      state.renderer.draw("white", screen.x, screen.y - 3 * zoom, 5 * zoom, 5 * zoom, { tint: [1, 0.18, 0.12], alpha: blink });
    } else if (bullet.kind === "timedBomb" || bullet.kind === "pulseBomb") {
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
      const bombSprite = bullet.bulletSprite && state.atlas.sprites[bullet.bulletSprite] ? bullet.bulletSprite : "white";
      state.renderer.draw(bombSprite, screen.x, screen.y, bullet.radius * 2.8 * zoom, bullet.radius * 2.4 * zoom, {
        rotation: (bullet.spinSeed || 0) + game.elapsed * (bullet.spinRate || 0.7),
        tint: bullet.bulletTint || [1, 0.75, 0.35],
        alpha: 0.92,
      });
      state.renderer.draw("white", screen.x, screen.y - bullet.radius * 1.35 * zoom, 7 * zoom, 7 * zoom, {
        tint: [1, 0.22, 0.16],
        alpha: blink,
      });
    } else if (bullet.visualForm === "miniBullet") {
      const bulletW = Math.max(18, bullet.radius * 4.8) * zoom;
      const bulletH = Math.max(7, bullet.radius * 1.85) * zoom;
      state.renderer.draw(bullet.bulletGlow || "glowAmber", screen.x, screen.y, bulletW * 1.8, bulletH * 2.6, {
        tint: bullet.bulletTint || [1, 0.82, 0.42],
        alpha: 0.18,
        rotation: bullet.angle,
      });
      state.renderer.draw(bullet.bulletSprite || "machineGunBullet", screen.x, screen.y, bulletW, bulletH, {
        rotation: bullet.angle,
        tint: bullet.bulletTint || [1, 0.82, 0.42],
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
    const pos = visiblePositionForDraw(proj, camX, camY);
    const radius = Math.max(36, (proj.radius || 8) * 5);
    if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom, 128)) continue;
    frameStats.visibleEnemyProjectiles += 1;
    const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
    const size = (proj.radius || 8) * zoom;
    state.renderer.draw("glowAmber", screen.x, screen.y, size * 6, size * 6, { alpha: 0.18 });
    state.renderer.draw("shadow", screen.x, screen.y + size * 1.6, size * 4, size * 1.4, { alpha: 0.5 });
    state.renderer.draw("boneReadable", screen.x, screen.y, size * 4.5, size * 2, {
      rotation: (proj.spinSeed || 0) + game.elapsed * (proj.spinRate || 8),
      tint: [1, 1, 1],
    });
  }

  game.renderStats = frameStats;
}


function drawDroneWeapons(view, camX, camY, zoom) {
  const player = game.player;
  if (!player?.gear) return;
  const activeIndex = Math.min(
    Math.max(player.gear.activeWeaponIndex || 0, 0),
    Math.max(0, player.gear.weapons.length - 1),
  );
  const weapon = player.gear.weapons[activeIndex];
  if (!weapon || weapon.kind !== "drone") return;
  const count = Math.max(1, Math.round(weapon.droneCount || 1));
  const radius = weapon.orbitRadius || 96;
  const speed = weapon.orbitSpeed || 2.6;
  for (let i = 0; i < count; i += 1) {
    const phase = (i / count) * TAU;
    const spin = game.elapsed * speed + weapon.id * 1.31 + phase;
    const x = player.x + Math.cos(spin) * radius;
    const y = player.y + Math.sin(spin) * radius;
    const screen = worldToScreen(x, y, view, camX, camY, zoom);
    state.renderer.draw("shadow", screen.x, screen.y + 13 * zoom, 30 * zoom, 11 * zoom, { alpha: 0.45 });
    state.renderer.draw(weapon.effectGlow || "glowCyan", screen.x, screen.y, 46 * zoom, 46 * zoom, { alpha: 0.18 });
    state.renderer.draw("drone", screen.x, screen.y + Math.sin(game.elapsed * 5 + i) * 2 * zoom, 34 * zoom, 26 * zoom, {
      rotation: Math.sin(game.elapsed * 2 + i) * 0.14,
      tint: weapon.effectTint || [0.7, 0.95, 1],
    });
  }
}

function drawDungeonStairs(view, camX, camY, zoom) {
  const exit = game.dungeon?.exit;
  if (!exit) return;
  const screen = worldToScreen(exit.x, exit.y, view, camX, camY, zoom);
  const pulse = 1 + Math.sin(game.elapsed * 4) * 0.08;
  state.renderer.draw("glowAmber", screen.x, screen.y, 150 * pulse * zoom, 118 * pulse * zoom, { alpha: 0.24 });
  state.renderer.draw("shadow", screen.x, screen.y + 18 * zoom, 82 * zoom, 24 * zoom, { alpha: 0.56 });
  state.renderer.draw("stairsDown", screen.x, screen.y, 76 * zoom, 58 * zoom);
  drawHoldProgress(screen.x, screen.y + 48 * zoom, game.exitHoldTimer / EXIT_HOLD_SECONDS, 72 * zoom, zoom, [0.92, 1, 0.62]);
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

function drawEffects(view, camX, camY, zoom, frameStats) {
  for (const effect of game.effects) {
    const alpha = clamp(effect.life / effect.maxLife, 0, 1);
    if (effect.type === "line" || effect.type === "damageLine") {
      const pulse = effect.type === "damageLine" ? 1 + Math.sin(game.elapsed * 26) * 0.12 : 1;
      if (!isVisibleLineWorld(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * 2.2, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * 1.9, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * (effect.type === "damageLine" ? 0.42 : 0.3),
      });
      drawWorldLine(effect.x1, effect.y1, effect.x2, effect.y2, effect.width * pulse, view, camX, camY, zoom, {
        tint: effect.tint || [1, 1, 1],
        alpha: alpha * 0.9,
      });
    } else if (effect.type === "poisonPool") {
      const pos = visiblePositionForDraw(effect, camX, camY);
      const pulse = 1 + Math.sin(game.elapsed * 5) * 0.04;
      const radius = effect.radius * pulse;
      if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
      const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
      const size = effect.radius * 2 * pulse * zoom;
      state.renderer.draw(effect.glow || "glowCyan", screen.x, screen.y, size, size * 0.72, {
        tint: effect.tint || [0.38, 1, 0.42],
        alpha: alpha * 0.38,
      });
      state.renderer.draw("white", screen.x, screen.y, size * 0.82, size * 0.42, {
        tint: effect.tint || [0.38, 1, 0.42],
        alpha: alpha * 0.18,
      });
    } else if (effect.type === "slash") {
      const pos = visiblePositionForDraw(effect, camX, camY);
      const range = effect.range || 140;
      if (!isVisibleWorld(pos.x, pos.y, range, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
      const progress = clamp(1 - alpha, 0, 1);
      const swing = effect.swingDir || 1;
      const carve = Math.sin(progress * Math.PI);
      const tint = effect.tint || [1, 0.78, 0.36];
      const sweepAngle = effect.angle + swing * (0.46 - progress * 0.92);
      const rangeWidth = range * 1.08 * zoom;
      const coneHeight = range * Math.sin(effect.cone || 0.72) * 2.08 * zoom;
      const rangeCenterX = pos.x + Math.cos(effect.angle) * range * 0.54;
      const rangeCenterY = pos.y + Math.sin(effect.angle) * range * 0.54;
      const rangeScreen = worldToScreen(rangeCenterX, rangeCenterY, view, camX, camY, zoom);
      const rangeAlpha = alpha * (0.34 + carve * 0.18);
      state.renderer.draw("swordSlashRange", rangeScreen.x, rangeScreen.y, rangeWidth, coneHeight, {
        rotation: effect.angle,
        tint,
        alpha: rangeAlpha,
      });
      const reach = range * (0.48 + progress * 0.2);
      const centerX = pos.x + Math.cos(sweepAngle) * reach;
      const centerY = pos.y + Math.sin(sweepAngle) * reach;
      const screen = worldToScreen(centerX, centerY, view, camX, camY, zoom);
      const width = range * (0.92 + carve * 0.28) * zoom;
      const height = range * (0.54 + (effect.cone || 0.72) * 0.18 + carve * 0.06) * zoom;
      const rotation = sweepAngle - swing * 0.16;
      state.renderer.draw(effect.glow || "glowAmber", screen.x, screen.y, width * 1.16, height * 1.18, {
        tint,
        alpha: alpha * (0.18 + carve * 0.2),
        rotation,
      });
      state.renderer.draw("swordSlash", screen.x, screen.y, width, height, {
        rotation,
        tint,
        alpha: alpha * (0.9 + carve * 0.24),
      });
      const edgeX = screen.x + Math.cos(sweepAngle) * width * 0.18;
      const edgeY = screen.y + Math.sin(sweepAngle) * height * 0.18;
      state.renderer.draw("white", edgeX, edgeY, width * 0.12, height * 0.12, {
        tint: [1, 1, 1],
        alpha: alpha * carve * 0.55,
      });
    } else if (effect.type === "burst") {
      const pos = visiblePositionForDraw(effect, camX, camY);
      const pulse = 1 + (1 - alpha) * 0.55;
      const radius = effect.radius * pulse;
      if (!isVisibleWorld(pos.x, pos.y, radius, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
      const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
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
      const pos = visiblePositionForDraw(effect, camX, camY);
      if (!isVisibleWorld(pos.x, pos.y, effect.radius, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
      const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
      const t = clamp(1 - alpha, 0, 1);
      const size = effect.radius * 2 * zoom;
      state.renderer.draw(effect.glow || "glowRed", screen.x, screen.y, size, size, {
        tint: effect.tint || [0.86, 0.2, 0.18],
        alpha: 0.18 + t * 0.26,
      });
    } else if (effect.type === "telegraphLine") {
      if (!isVisibleLineWorld(effect.x1, effect.y1, effect.x2, effect.y2, effect.width, view, camX, camY, zoom, 128)) continue;
      frameStats.visibleEffects += 1;
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

function drawCombatSword(room, view, camX, camY, zoom, drawX, drawY) {
  const screen = worldToScreen(drawX, drawY, view, camX, camY, zoom);
  const progress = clamp((room.swordHoldTimer || 0) / INTERACTION_HOLD_SECONDS, 0, 1);
  const pulse = 1 + Math.sin(game.elapsed * 4.2) * 0.06;
  const isElite = room.combatKind === COMBAT_ROOM_ELITE;
  const glowAlpha = 0.22 + progress * 0.28 + Math.sin(game.elapsed * 3.4) * 0.04;

  state.renderer.draw("glowAmber", screen.x, screen.y - 8 * zoom, 96 * pulse * zoom, 96 * pulse * zoom, {
    alpha: glowAlpha,
    tint: isElite ? [1, 0.38, 0.24] : [1, 0.78, 0.28],
  });
  state.renderer.draw("shadow", screen.x, screen.y + 25 * zoom, 62 * zoom, 22 * zoom, { alpha: 0.66 });
  if (isElite) {
    state.renderer.draw("swordIcon", screen.x - 11 * zoom, screen.y - 12 * zoom, 40 * zoom, 62 * zoom, {
      rotation: -0.72 + Math.sin(game.elapsed * 2.2) * 0.035,
      tint: [1, 0.92, 0.82],
    });
    state.renderer.draw("swordIcon", screen.x + 11 * zoom, screen.y - 12 * zoom, 40 * zoom, 62 * zoom, {
      rotation: 0.72 - Math.sin(game.elapsed * 2.2) * 0.035,
      tint: [1, 0.92, 0.82],
    });
  } else {
    state.renderer.draw("swordIcon", screen.x, screen.y - 12 * zoom, 42 * zoom, 64 * zoom, {
      rotation: Math.sin(game.elapsed * 2.6) * 0.05,
      tint: [1, 0.96, 0.84],
    });
    const material = findStoneMaterial(room.fixedRewardKey);
    if (material?.sprite) {
      state.renderer.draw(material.sprite, screen.x, screen.y - 72 * zoom, 34 * zoom, 34 * zoom, {
        rotation: Math.sin(game.elapsed * 3.1) * 0.06,
      });
    }
  }

  const barW = 56 * zoom;
  const barH = 7 * zoom;
  const barY = screen.y - 58 * zoom;
  state.renderer.draw("white", screen.x, barY, barW, barH, { tint: [0.14, 0.09, 0.08], alpha: 0.62 });
  state.renderer.draw("white", screen.x - (barW * (1 - progress)) / 2, barY, barW * progress, barH, {
    tint: [1, 0.8, 0.24],
    alpha: progress > 0 ? 0.92 : 0.24,
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

function drawEnemy(enemy, view, camX, camY, zoom, drawX = enemy.x, drawY = enemy.y) {
  const screen = worldToScreen(drawX, drawY, view, camX, camY, zoom);
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

function drawGoldDrops(view, camX, camY, zoom, frameStats) {
  for (const drop of game.goldDrops) {
    const pos = visiblePositionForDraw(drop, camX, camY);
    if (!isVisibleWorld(pos.x, pos.y, 28, view, camX, camY, zoom, 80)) continue;
    frameStats.visibleGoldDrops += 1;
    const screen = worldToScreen(pos.x, pos.y, view, camX, camY, zoom);
    const bob = Math.sin(game.elapsed * 8 + drop.bob) * 1.5 * zoom;
    const size = 23 * zoom;
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

function drawTreasureChest(chest, view, camX, camY, zoom, drawX = chest.x, drawY = chest.y) {
  const screen = worldToScreen(drawX, drawY, view, camX, camY, zoom);
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

function drawFacility(facility, view, camX, camY, zoom, drawX = facility.x, drawY = facility.y) {
  const screen = worldToScreen(drawX, drawY, view, camX, camY, zoom);
  const bob = Math.sin(game.elapsed * 2.5 + (facility.x + facility.y) * 0.01) * 1.2 * zoom;
  if (facility.type === "treasureVault") {
    const opened = facility.opened;
    state.renderer.draw("shadow", screen.x, screen.y + 18 * zoom, 72 * zoom, 20 * zoom, { alpha: 0.58 });
    if (!opened) state.renderer.draw("glowAmber", screen.x, screen.y + bob, 104 * zoom, 82 * zoom, { alpha: 0.18 });
    state.renderer.draw("white", screen.x, screen.y + bob, 68 * zoom, 58 * zoom, { tint: opened ? [0.32, 0.26, 0.2] : [0.62, 0.38, 0.12], alpha: 0.98 });
    state.renderer.draw("white", screen.x, screen.y - 2 * zoom + bob, 44 * zoom, 36 * zoom, { tint: opened ? [0.12, 0.12, 0.12] : [0.95, 0.76, 0.2], alpha: opened ? 0.55 : 0.95 });
    if (!opened) drawHoldProgress(screen.x, screen.y + 50 * zoom, facility.holdTimer / INTERACTION_HOLD_SECONDS, 68 * zoom, zoom, [1, 0.86, 0.28]);
    return;
  }
  state.renderer.draw("shadow", screen.x, screen.y + 17 * zoom, 64 * zoom, 18 * zoom, { alpha: 0.55 });
  state.renderer.draw("glowCyan", screen.x, screen.y + bob, 92 * zoom, 72 * zoom, { alpha: 0.17 });
  state.renderer.draw("white", screen.x, screen.y + bob, 64 * zoom, 34 * zoom, { tint: [0.34, 0.22, 0.12], alpha: 0.96 });
  state.renderer.draw("white", screen.x, screen.y - 12 * zoom + bob, 48 * zoom, 12 * zoom, { tint: [0.72, 0.46, 0.24], alpha: 0.98 });
  state.renderer.draw("white", screen.x - 20 * zoom, screen.y + 16 * zoom + bob, 10 * zoom, 28 * zoom, { tint: [0.2, 0.14, 0.1], alpha: 0.96 });
  state.renderer.draw("white", screen.x + 20 * zoom, screen.y + 16 * zoom + bob, 10 * zoom, 28 * zoom, { tint: [0.2, 0.14, 0.1], alpha: 0.96 });
  drawHoldProgress(screen.x, screen.y + 46 * zoom, facility.holdTimer / INTERACTION_HOLD_SECONDS, 64 * zoom, zoom, [0.36, 0.92, 1]);
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

function drawSceneryObstacle(obstacle, view, camX, camY, zoom, drawX = obstacle.x, drawY = obstacle.y) {
  const sprite = state.atlas.sprites[obstacle.sprite];
  if (!sprite) return;
  const screen = worldToScreen(drawX, drawY, view, camX, camY, zoom);
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
