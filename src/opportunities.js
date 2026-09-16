import { U, clamp, sample } from './common.js';

// TerrainType is a numeric enum in the current client; accept named older views.
export function terrainRank(value) {
  if (value === 0 || String(value).toLowerCase() === 'plains') return 0;
  if (value === 1 || /^highlands?$/i.test(String(value))) return 1;
  if (value === 2 || /^mountains?$/i.test(String(value))) return 2;
  return null;
}

// Value accessible infrastructure without diverting a committed conquest.
export function captureValue(state, enemy, forecast) {
  const weights = {
    [U.city]: 24,
    [U.port]: 20,
    [U.factory]: 16,
    [U.silo]: 12,
    [U.defense]: 4,
    [U.sam]: 8,
  };
  const structures = state.hostileUnits.filter(
    (unit) => unit.owner === enemy.id && weights[unit.type] && !unit.building,
  );
  const fraction = clamp(forecast.gain / Math.max(1, enemy.area), 0, 1);
  const value = structures.reduce((sum, unit) => {
    const distance = Math.sqrt(
      Math.min(...enemy.tiles.map((t) => state.game.euclideanDistSquared(t, unit.tile))),
    );
    // Deep buildings are less likely to be won before a third party captures them.
    return sum + (weights[unit.type] * Math.min(5, unit.level ?? 1)) / (1 + distance / 60);
  }, 0);
  return Math.min(90, value * fraction);
}

// A conservative local railway opportunity: own stations within the native
// range, with a continuous owned land corridor. Native build validation remains
// authoritative; this does not claim to simulate the railroad pathfinder.
export function factoryConnections(state, tile) {
  const game = state.game,
    range = state.config.trainStationMaxRange?.() ?? 110;
  if (!game.x || !game.y || !game.ref || !game.isValidCoord) return 0;
  return state.own
    .filter(
      (unit) =>
        [U.city, U.port].includes(unit.type) &&
        !unit.building &&
        unit.tile !== tile &&
        game.ownerID(unit.tile) === state.me.smallID() &&
        game.euclideanDistSquared(tile, unit.tile) <= range * range,
    )
    .reduce((sum, unit) => {
      const dx = game.x(unit.tile) - game.x(tile),
        dy = game.y(unit.tile) - game.y(tile),
        steps = Math.ceil(Math.hypot(dx, dy));
      for (let i = 1; i < steps; i++) {
        const x = Math.round(game.x(tile) + (dx * i) / steps),
          y = Math.round(game.y(tile) + (dy * i) / steps);
        if (!game.isValidCoord(x, y)) return sum;
        const t = game.ref(x, y);
        if (!game.isLand(t) || game.isImpassable?.(t) || game.ownerID(t) !== state.me.smallID())
          return sum;
      }
      return sum + Math.min(3, unit.level ?? 1);
    }, 0);
}

// Score actual enemy land in a strike footprint and completed infrastructure.
// Keep this separate from SAM/friendly-fire validity, which is checked before use.
export function strikeValue(state, tile, target) {
  const game = state.game,
    radii = state.config.nukeMagnitudes?.(U.hydrogen) ?? { inner: 80, outer: 100 };
  let land = 0;
  if (game.x && game.y && game.ref && game.isValidCoord) {
    for (const r of [0, radii.inner / 2, radii.inner, radii.outer]) {
      const count = r === 0 ? 1 : 16;
      for (let i = 0; i < count; i++) {
        const x = Math.round(game.x(tile) + r * Math.cos((i * 2 * Math.PI) / count));
        const y = Math.round(game.y(tile) + r * Math.sin((i * 2 * Math.PI) / count));
        if (!game.isValidCoord(x, y)) continue;
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasFallout?.(t) && game.ownerID(t) === target.id) land++;
      }
    }
  }
  const weights = {
    [U.city]: 12,
    [U.silo]: 16,
    [U.factory]: 8,
    [U.port]: 8,
    [U.defense]: 5,
    [U.sam]: 10,
  };
  const value = sample(state.hostileUnits, 2000).reduce((sum, unit) => {
    if (unit.owner !== target.id || unit.building || !weights[unit.type]) return sum;
    const d = game.euclideanDistSquared(tile, unit.tile);
    if (d > radii.outer ** 2) return sum;
    return (
      sum + weights[unit.type] * Math.min(20, unit.level ?? 1) * (d <= radii.inner ** 2 ? 1 : 0.4)
    );
  }, 0);
  return land * 3 + value;
}
