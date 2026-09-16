import { unitsOf, U, STRUCTURES, friendly } from './common.js';

export const isHuman = p => (typeof p?.type === 'function' ? p.type() : p?.type) === 'HUMAN';
export const isAI = p => ['BOT', 'NATION'].includes(typeof p?.type === 'function' ? p.type() : p?.type);
export function offensiveBusy(me) {
  return me.outgoingAttacks().length > 0 || unitsOf(me, U.transport).length > 0;
}
// Check actual tiles, including small lakes and borders missed by map sampling.
export function safePlacement(s, tile, type) {
  if (!STRUCTURES.includes(type)) return true;
  const g = s.game, own = s.me.smallID();
  if (g.ownerID(tile) !== own || !g.isLand(tile) || g.hasFallout?.(tile)) return false;
  const coastal = type === U.port;
  const border = type === U.defense ? 16 : 24, shore = coastal ? 0 : 18;
  const x0 = g.x(tile), y0 = g.y(tile), radius = Math.max(border, shore);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const d = dx * dx + dy * dy;
    if (d > radius * radius || !g.isValidCoord(x0 + dx, y0 + dy)) continue;
    const t = g.ref(x0 + dx, y0 + dy);
    if (d < shore * shore && !g.isLand(t)) return false;
    const id = g.ownerID(t);
    if (d < border * border && id !== 0 && id !== own) return false;
  }
  return true;
}
export function coastalTile(g, tile) {
  return g.isLand(tile) && g.neighbors(tile).some(t => !g.isLand(t) && !g.isImpassable?.(t));
}
// The native pathfinder controls the actual route. Only allow a direct open-water
// corridor; decline obstructed crossings rather than assuming a detour is safe.
export function safeCrossing(s, src, dst) {
  const g = s.game;
  if (!Number.isInteger(src) || !Number.isInteger(dst) || !coastalTile(g, dst)) return false;
  const ax = g.x(src), ay = g.y(src), bx = g.x(dst), by = g.y(dst);
  const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
  if (length < 3 || length > 260) return false;
  const ships = unitsOf(g, U.warship).filter(u => !friendly(s.me, u.owner()));
  const range = (s.config.warshipTargettingRange?.() ?? 130) + 25;
  for (const ship of ships) {
    const x = g.x(ship.tile()), y = g.y(ship.tile());
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (length * length)));
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= range) return false;
  }
  for (let i = 2; i < Math.ceil(length) - 1; i++) {
    const t = i / Math.ceil(length);
    for (const offset of [-3, 0, 3]) {
      const x = Math.round(ax + dx * t - dy / length * offset);
      const y = Math.round(ay + dy * t + dx / length * offset);
      if (!g.isValidCoord(x, y)) return false;
      const tile = g.ref(x, y);
      if (g.isLand(tile) || g.isImpassable?.(tile)) return false;
    }
  }
  return true;
}

export function lookupPlayer(s, id) {
  return s.players?.find(p => p.smallID() === id) ?? s.enemies?.find(e => e.id === id)
    ?? s.game.playerBySmallID?.(id);
}
export function humanAttacks(s) {
  return (s.incoming ?? []).filter(a => !a.retreating && !isAI(lookupPlayer(s, a.attackerID)));
}
export function structureThreatened(s, attackerID) {
  const g = s.game;
  if (!g.isValidCoord || !g.ref || !g.ownerID) return false;
  // Inspect current ownership around structures, not a stale sampled frontier.
  return (s.own ?? []).filter(u => STRUCTURES.includes(u.type)).some(u => {
    const x = g.x(u.tile), y = g.y(u.tile), radius = 28;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius || !g.isValidCoord(x + dx, y + dy)) continue;
      if (g.ownerID(g.ref(x + dx, y + dy)) === attackerID) return true;
    }
    return false;
  });
}
export const earlyCapacity = s => {
  const age = s.game.ticksSinceStart?.();
  return Number.isFinite(age) && age >= 0 && age < 6000 && s.troops / s.cap >= .85;
};
export function landFrontAllowed(s, targetID, reinforce = false) {
  const waves = s.allOutgoing ?? s.outgoing;
  if (waves.some(a => a.retreating) || s.own.some(u => u.type === U.transport)) return false;
  const ids = [...new Set(waves.map(a => a.targetID))];
  if (reinforce && !ids.includes(targetID)) return false;
  if (!reinforce && ids.includes(targetID)) return false;
  if (!ids.length) return !reinforce;
  if (ids.length === 1 && ids[0] === targetID) return true;
  // Two AI states only; wilderness, human conquests and transports don't get
  // this exception. Unknown owners fail closed until the next snapshot.
  return isAI(lookupPlayer(s, targetID)) && ids.every(id => isAI(lookupPlayer(s, id)))
    && new Set([...ids, targetID]).size <= 2;
}
export function defenseUseful(s, tile) {
  const range = s.config.defensePostRange?.() ?? 30;
  const attackers = new Set(humanAttacks(s).map(a => a.attackerID));
  return s.enemies.some(e => !isAI(e) && (!attackers.size || attackers.has(e.id)) && e.tiles.some(t => s.game.ownerID(t) === e.id
    && s.game.euclideanDistSquared(tile, t) <= range * range));
}

// Compare capacity and predicted post-send replenishment without mutating players.
export function growthAdvantage(s, enemy, budget) {
  try {
    const other = enemy.raw;
    if (!other || !s.config.troopIncreaseRate || !s.config.maxTroops) return false;
    const cap = s.config.maxTroops(s.me), enemyCap = s.config.maxTroops(other);
    if (!(cap >= enemyCap * 1.35 && budget >= enemy.troops * .85)) return false;
    const projected = Object.create(s.me);
    Object.defineProperty(projected, 'troops', { value: () => Math.max(0, s.me.troops() - budget) });
    const ours = s.config.troopIncreaseRate(projected), theirs = s.config.troopIncreaseRate(other);
    return Number.isFinite(ours) && Number.isFinite(theirs) && ours > theirs * 1.15
      && budget + Math.min(Math.max(0, ours - theirs) * 60, budget * .3) >= enemy.troops * 1.1;
  } catch { return false; }
}
