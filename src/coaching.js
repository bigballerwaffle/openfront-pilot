import { U, clamp, number } from './common.js';

// Small contextual imitation model. These are user intents, not proof that an
// action succeeded or caused a win. Never learn coordinates or copy raw packets.
const LABELS = ['attack', 'neutral', 'city', 'income', 'save', 'spend', 'nuke', 'boat', 'defense'];
export function coachingState(game) {
  try {
    const me = game?.myPlayer?.(),
      config = game?.config?.();
    if (
      !me?.isAlive?.() ||
      game.inSpawnPhase?.() ||
      config?.isReplay?.() ||
      config?.isIntentionalSpectator?.()
    )
      return null;
    const gold = number(me.gold()),
      troops = number(me.troops()),
      cap = number(config.maxTroops(me));
    const age = game.ticksSinceStart?.();
    if (![gold, troops, cap, age].every(Number.isFinite) || cap <= 0) return null;
    const units = me.units();
    return {
      game,
      me,
      gold,
      troops,
      cap,
      age,
      key: [
        age < 6000 ? 'early' : 'late',
        gold < 1000000 ? 'low' : gold < 5000000 ? 'mid' : 'high',
        units.some((u) => u.type() === U.silo) ? 'silo' : 'no-silo',
        me.incomingAttacks().length ? 'pressure' : 'calm',
        troops / cap >= 0.85 ? 'full' : 'growing',
      ].join(':'),
    };
  } catch {
    return null;
  }
}
export function lesson(kind, event, state) {
  if (kind === 'save' || kind === 'spend') return { label: kind, value: 1 };
  if (kind === 'attack') {
    const share = number(event.troops) / state.troops;
    if (!Number.isFinite(share) || share <= 0 || share > 1) return null;
    return {
      label: event.targetID == null || event.targetID === 0 ? 'neutral' : 'attack',
      value: share,
    };
  }
  if (kind === 'boat') return { label: 'boat', value: 1 };
  if (kind !== 'build' && kind !== 'upgrade') return null;
  const unit = event.unit ?? event.unitType;
  const label =
    unit === U.city
      ? 'city'
      : [U.port, U.factory].includes(unit)
        ? 'income'
        : [U.atom, U.hydrogen, U.mirv, U.silo].includes(unit)
          ? 'nuke'
          : [U.defense, U.sam, U.warship].includes(unit)
            ? 'defense'
            : null;
  return label ? { label, value: 1 } : null;
}
export function validateCoaching(raw = []) {
  if (!Array.isArray(raw) || raw.length > 24) throw Error('Invalid coaching memory.');
  const rows = raw.map((row) => {
    if (
      typeof row.key !== 'string' ||
      row.key.length > 240 ||
      !row.key ||
      !row.stats ||
      typeof row.stats !== 'object'
    )
      throw Error('Invalid coaching context.');
    const stats = {};
    for (const [label, s] of Object.entries(row.stats)) {
      if (
        !LABELS.includes(label) ||
        !Number.isInteger(s.count) ||
        s.count < 1 ||
        s.count > 100 ||
        !Number.isFinite(s.sum) ||
        s.sum < 0 ||
        s.sum > s.count
      )
        throw Error('Invalid coaching sample.');
      stats[label] = { count: s.count, sum: s.sum };
    }
    return { key: row.key, stats };
  });
  if (new Set(rows.map((r) => r.key)).size !== rows.length)
    throw Error('Duplicate coaching context.');
  return rows;
}
export function coachedTuning(base, stats = {}) {
  const next = { ...base };
  for (const [label, low, high] of [
    ['attack', 0.64, 0.72],
    ['neutral', 0.16, 0.29],
  ]) {
    const s = stats[label];
    if (s?.count >= 3) next[label] = clamp(base[label] * 0.5 + (s.sum / s.count) * 0.5, low, high);
  }
  const cities = stats.city?.count ?? 0,
    income = stats.income?.count ?? 0;
  if (cities + income >= 3)
    next.city = clamp(base.city * 0.5 + (cities / (cities + income)) * 0.5, 0.56, 0.64);
  return next;
}
export function prefersSaving(stats = {}) {
  const save = stats.save?.count ?? 0,
    spend = stats.spend?.count ?? 0;
  return save >= 3 && save / (save + spend) >= 0.75;
}
