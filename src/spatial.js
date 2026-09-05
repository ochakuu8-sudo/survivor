import { COLLISION_CELL_SIZE, TILE_SIZE } from './constants.js';
import { gridKey } from './utils/math.js';

// Seam images support maps whose dimensions are not cell multiples.
export function insertPeriodicEntity(grid, entity, dungeon) {
  const xs = [entity.x], ys = [entity.y];
  if (dungeon?.wrapEdges) {
    const w = dungeon.width * TILE_SIZE, h = dungeon.height * TILE_SIZE;
    const margin = COLLISION_CELL_SIZE * 2 + entity.radius;
    if (entity.x - dungeon.offsetX < margin) xs.push(entity.x + w);
    if (dungeon.offsetX + w - entity.x < margin) xs.push(entity.x - w);
    if (entity.y - dungeon.offsetY < margin) ys.push(entity.y + h);
    if (dungeon.offsetY + h - entity.y < margin) ys.push(entity.y - h);
  }
  for (const x of xs) for (const y of ys) {
    const key = gridKey(Math.floor(x / COLLISION_CELL_SIZE), Math.floor(y / COLLISION_CELL_SIZE));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(entity);
  }
}
