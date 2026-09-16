import { clamp } from './common.js';

// Bounded sampling of public land ownership. Moments estimate the shape of a
// complete conquest, including extensions beyond the shared border.
export function sampleRegions(game) {
  const step = Math.max(1, Math.ceil(Math.sqrt((game.width() * game.height()) / 12000)));
  const regions = new Map();
  for (let y = Math.floor(step / 2); y < game.height(); y += step) {
    for (let x = Math.floor(step / 2); x < game.width(); x += step) {
      const tile = game.ref(x, y),
        id = game.ownerID(tile);
      if (!id || !game.isLand(tile)) continue;
      const r = regions.get(id) ?? { n: 0, x: 0, y: 0, moment: 0 };
      r.n++;
      r.x += x;
      r.y += y;
      r.moment += x * x + y * y;
      regions.set(id, r);
    }
  }
  for (const r of regions.values()) {
    r.x /= r.n;
    r.y /= r.n;
    r.moment = Math.max(0, r.moment / r.n - r.x * r.x - r.y * r.y);
  }
  return regions;
}
export function compactnessScore(state, enemy) {
  // Shared frontage also works for tiny opening territories missed by the
  // global region sample. Broad contact favors filling gaps over long tendrils.
  const frontage =
    Number.isFinite(enemy.count) && enemy.area > 0
      ? clamp(45 * (enemy.count / Math.sqrt(enemy.area) - 0.75), -35, 75)
      : 0;
  const own = state.map.regions?.get(state.me.smallID()),
    next = state.map.regions?.get(enemy.id);
  if (!own || !next || own.n < 3 || next.n < 3 || state.tiles <= 0 || enemy.area <= 0)
    return frontage;
  const total = state.tiles + enemy.area,
    a = state.tiles / total,
    b = enemy.area / total;
  const distance2 = (own.x - next.x) ** 2 + (own.y - next.y) ** 2;
  const merged = a * own.moment + b * next.moment + a * b * distance2;
  // A disk has mean squared radius = area/(2*pi). Reward improvement in this
  // normalized measure; cap the bonus so affordability remains decisive.
  return clamp(
    60 * 2 * Math.PI * (own.moment / state.tiles - merged / total) + frontage,
    -100,
    100,
  );
}
