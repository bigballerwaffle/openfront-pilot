import {
  STRUCTURE_DANGER_RADIUS,
  EARLY_GAME_TICKS,
  EARLY_CAPACITY_THRESHOLD,
  DEFENSE,
} from './rules.js';
import { unitsOf, U, STRUCTURES, friendly } from './common.js';

export const isHuman = (player) =>
  (typeof player?.type === 'function' ? player.type() : player?.type) === 'HUMAN';
export const isAI = (player) =>
  ['BOT', 'NATION'].includes(typeof player?.type === 'function' ? player.type() : player?.type);
export function offensiveBusy(ourPlayer) {
  return ourPlayer.outgoingAttacks().length > 0 || unitsOf(ourPlayer, U.transport).length > 0;
}
// Check actual tiles, including small lakes and borders missed by map sampling.
export function safePlacement(state, tile, type) {
  if (!STRUCTURES.includes(type)) return true;
  const game = state.game,
    own = state.me.smallID();
  if (game.ownerID(tile) !== own || !game.isLand(tile) || game.hasFallout?.(tile)) return false;
  const coastal = type === U.port;
  const border =
      type === U.defense ? DEFENSE.postBorderClearance : DEFENSE.structureBorderClearance,
    shore = coastal ? 0 : DEFENSE.inlandWaterClearance;
  const x0 = game.x(tile),
    y0 = game.y(tile),
    radius = Math.max(border, shore);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dy * dy;
      if (d > radius * radius || !game.isValidCoord(x0 + dx, y0 + dy)) continue;
      const t = game.ref(x0 + dx, y0 + dy);
      if (d < shore * shore && !game.isLand(t)) return false;
      const id = game.ownerID(t);
      if (d < border * border && id !== 0 && id !== own) return false;
    }
  return true;
}
export function coastalTile(game, tile) {
  return (
    game.isLand(tile) &&
    game.neighbors(tile).some((t) => !game.isLand(t) && !game.isImpassable?.(t))
  );
}
// The native pathfinder controls the actual route. Only allow a direct open-water
// corridor; decline obstructed crossings rather than assuming a detour is safe.
export function safeCrossing(state, src, dst) {
  const game = state.game;
  if (!Number.isInteger(src) || !Number.isInteger(dst) || !coastalTile(game, dst)) return false;
  const ax = game.x(src),
    ay = game.y(src),
    bx = game.x(dst),
    by = game.y(dst);
  const dx = bx - ax,
    dy = by - ay,
    length = Math.hypot(dx, dy);
  if (length < 3 || length > 260) return false;
  const ships = unitsOf(game, U.warship).filter((unit) => !friendly(state.me, unit.owner()));
  const range = (state.config.warshipTargettingRange?.() ?? 130) + 25;
  for (const ship of ships) {
    const x = game.x(ship.tile()),
      y = game.y(ship.tile());
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (length * length)));
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= range) return false;
  }
  for (let i = 2; i < Math.ceil(length) - 1; i++) {
    const t = i / Math.ceil(length);
    for (const offset of [-3, 0, 3]) {
      const x = Math.round(ax + dx * t - (dy / length) * offset);
      const y = Math.round(ay + dy * t + (dx / length) * offset);
      if (!game.isValidCoord(x, y)) return false;
      const tile = game.ref(x, y);
      if (game.isLand(tile) || game.isImpassable?.(tile)) return false;
    }
  }
  return true;
}

export function lookupPlayer(state, id) {
  return (
    state.players?.find((player) => player.smallID() === id) ??
    state.enemies?.find((enemy) => enemy.id === id) ??
    state.game.playerBySmallID?.(id)
  );
}
export function humanAttacks(state) {
  return (state.incoming ?? []).filter(
    (a) => !a.retreating && !isAI(lookupPlayer(state, a.attackerID)),
  );
}
export function structureThreatened(state, attackerID) {
  const game = state.game;
  if (!game.isValidCoord || !game.ref || !game.ownerID) return false;
  // Inspect current ownership around structures, not a stale sampled frontier.
  return (state.own ?? [])
    .filter((unit) => STRUCTURES.includes(unit.type))
    .some((unit) => {
      const x = game.x(unit.tile),
        y = game.y(unit.tile),
        radius = STRUCTURE_DANGER_RADIUS;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius || !game.isValidCoord(x + dx, y + dy)) continue;
          if (game.ownerID(game.ref(x + dx, y + dy)) === attackerID) return true;
        }
      return false;
    });
}
export const earlyCapacity = (state) => {
  const age = state.game.ticksSinceStart?.();
  return (
    Number.isFinite(age) &&
    age >= 0 &&
    age < EARLY_GAME_TICKS &&
    state.troops / state.cap >= EARLY_CAPACITY_THRESHOLD
  );
};
export function landFrontAllowed(state, targetID, reinforce = false) {
  const waves = state.allOutgoing ?? state.outgoing;
  if (waves.some((a) => a.retreating) || state.own.some((unit) => unit.type === U.transport))
    return false;
  const ids = [...new Set(waves.map((a) => a.targetID))];
  if (reinforce && !ids.includes(targetID)) return false;
  if (!reinforce && ids.includes(targetID)) return false;
  if (!ids.length) return !reinforce;
  if (ids.length === 1 && ids[0] === targetID) return true;
  // Two AI states only; wilderness, human conquests and transports don't get
  // this exception. Unknown owners fail closed until the next snapshot.
  return (
    isAI(lookupPlayer(state, targetID)) &&
    ids.every((id) => isAI(lookupPlayer(state, id))) &&
    new Set([...ids, targetID]).size <= 2
  );
}
export function defenseUseful(state, tile) {
  const range = state.config.defensePostRange?.() ?? DEFENSE.defaultPostRange;
  const attackers = new Set(humanAttacks(state).map((a) => a.attackerID));
  return state.enemies.some(
    (enemy) =>
      !isAI(enemy) &&
      (!attackers.size || attackers.has(enemy.id)) &&
      enemy.tiles.some(
        (t) =>
          state.game.ownerID(t) === enemy.id &&
          state.game.euclideanDistSquared(tile, t) <= range * range,
      ),
  );
}

// Compare capacity and predicted post-send replenishment without mutating players.
export function growthAdvantage(state, enemy, budget) {
  try {
    const other = enemy.raw;
    if (!other || !state.config.troopIncreaseRate || !state.config.maxTroops) return false;
    const cap = state.config.maxTroops(state.me),
      enemyCap = state.config.maxTroops(other);
    if (!(cap >= enemyCap * 1.35 && budget >= enemy.troops * 0.85)) return false;
    const projected = Object.create(state.me);
    Object.defineProperty(projected, 'troops', {
      value: () => Math.max(0, state.me.troops() - budget),
    });
    const ours = state.config.troopIncreaseRate(projected),
      theirs = state.config.troopIncreaseRate(other);
    return (
      Number.isFinite(ours) &&
      Number.isFinite(theirs) &&
      ours > theirs * 1.15 &&
      budget + Math.min(Math.max(0, ours - theirs) * 60, budget * 0.3) >= enemy.troops * 1.1
    );
  } catch {
    return false;
  }
}
