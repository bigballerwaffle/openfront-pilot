import { U, clamp, sample } from './common.js';

// TerrainType is a numeric enum in the current client; accept named older views.
export function terrainRank(value) {
  if (value === 0 || String(value).toLowerCase() === 'plains') return 0;
  if (value === 1 || /^highlands?$/i.test(String(value))) return 1;
  if (value === 2 || /^mountains?$/i.test(String(value))) return 2;
  return null;
}

// Value accessible infrastructure without diverting a committed conquest.
export function captureValue(s, enemy, forecast) {
  const weights = { [U.city]: 24, [U.port]: 20, [U.factory]: 16, [U.silo]: 12, [U.defense]: 4, [U.sam]: 8 };
  const structures = s.hostileUnits.filter(u => u.owner === enemy.id && weights[u.type] && !u.building);
  const fraction = clamp(forecast.gain / Math.max(1, enemy.area), 0, 1);
  const value = structures.reduce((sum, u) => {
    const distance = Math.sqrt(Math.min(...enemy.tiles.map(t => s.game.euclideanDistSquared(t, u.tile))));
    // Deep buildings are less likely to be won before a third party captures them.
    return sum + weights[u.type] * Math.min(5, u.level ?? 1) / (1 + distance / 60);
  }, 0);
  return Math.min(90, value * fraction);
}

// A conservative local railway opportunity: own stations within the native
// range, with a continuous owned land corridor. Native build validation remains
// authoritative; this does not claim to simulate the railroad pathfinder.
export function factoryConnections(s, tile) {
  const g = s.game, range = s.config.trainStationMaxRange?.() ?? 110;
  if (!g.x || !g.y || !g.ref || !g.isValidCoord) return 0;
  return s.own.filter(u => [U.city, U.port].includes(u.type) && !u.building && u.tile !== tile
    && g.ownerID(u.tile) === s.me.smallID() && g.euclideanDistSquared(tile, u.tile) <= range * range).reduce((sum, u) => {
      const dx = g.x(u.tile) - g.x(tile), dy = g.y(u.tile) - g.y(tile), steps = Math.ceil(Math.hypot(dx, dy));
      for (let i = 1; i < steps; i++) {
        const x = Math.round(g.x(tile) + dx * i / steps), y = Math.round(g.y(tile) + dy * i / steps);
        if (!g.isValidCoord(x, y)) return sum;
        const t = g.ref(x, y);
        if (!g.isLand(t) || g.isImpassable?.(t) || g.ownerID(t) !== s.me.smallID()) return sum;
      }
      return sum + Math.min(3, u.level ?? 1);
    }, 0);
}

// Score actual enemy land in a strike footprint and completed infrastructure.
// Keep this separate from SAM/friendly-fire validity, which is checked before use.
export function strikeValue(s, tile, target) {
  const g = s.game, radii = s.config.nukeMagnitudes?.(U.hydrogen) ?? { inner: 80, outer: 100 };
  let land = 0;
  if (g.x && g.y && g.ref && g.isValidCoord) {
    for (const r of [0, radii.inner / 2, radii.inner, radii.outer]) {
      const count = r === 0 ? 1 : 16;
      for (let i = 0; i < count; i++) {
        const x = Math.round(g.x(tile) + r * Math.cos(i * 2 * Math.PI / count));
        const y = Math.round(g.y(tile) + r * Math.sin(i * 2 * Math.PI / count));
        if (!g.isValidCoord(x, y)) continue;
        const t = g.ref(x, y);
        if (g.isLand(t) && !g.hasFallout?.(t) && g.ownerID(t) === target.id) land++;
      }
    }
  }
  const weights = { [U.city]: 12, [U.silo]: 16, [U.factory]: 8, [U.port]: 8, [U.defense]: 5, [U.sam]: 10 };
  const value = sample(s.hostileUnits, 2000).reduce((sum, u) => {
    if (u.owner !== target.id || u.building || !weights[u.type]) return sum;
    const d = g.euclideanDistSquared(tile, u.tile);
    if (d > radii.outer ** 2) return sum;
    return sum + weights[u.type] * Math.min(20, u.level ?? 1) * (d <= radii.inner ** 2 ? 1 : .4);
  }, 0);
  return land * 3 + value;
}
