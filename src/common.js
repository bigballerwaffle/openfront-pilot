export const U = Object.freeze({
  city: 'City',
  port: 'Port',
  factory: 'Factory',
  defense: 'Defense Post',
  sam: 'SAM Launcher',
  silo: 'Missile Silo',
  warship: 'Warship',
  transport: 'Transport',
  atom: 'Atom Bomb',
  hydrogen: 'Hydrogen Bomb',
  mirv: 'MIRV',
});
// Validate each returned type even if a client ignores the requested filter.
export const unitsOf = (view, ...types) =>
  view.units(...types).filter((u) => types.includes(u.type?.()) && (!u.isActive || u.isActive()));
export const STRUCTURES = [U.city, U.port, U.factory, U.defense, U.sam, U.silo];
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function sample(values, max) {
  const a = Array.isArray(values) ? values : Array.from(values);
  if (a.length <= max) return a;
  return Array.from({ length: max }, (_, i) => a[Math.floor((i * a.length) / max)]);
}
export const number = (x) => Number(x ?? 0);
export function finite(x, label) {
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`Invalid ${label}; client compatibility check failed.`);
  return n;
}
export async function deadline(promise, ms = 2500) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('The game stopped answering state requests.')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function friendly(me, other) {
  if (!other?.isPlayer?.()) return false;
  return other.id() === me.id() || me.isAlliedWith(other) || me.isOnSameTeam(other);
}
export function unitData(u) {
  return {
    id: u.id(),
    type: u.type(),
    tile: u.tile(),
    level: u.level(),
    building: u.isUnderConstruction?.() ?? false,
    owner: u.owner().smallID(),
    raw: u,
  };
}
