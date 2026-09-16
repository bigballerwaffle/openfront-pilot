import { STRONGER_NEIGHBOR_CAPACITY_RATIO, COOLDOWNS } from '../rules.js';
import { isHuman, isAI } from '../safety.js';
import { friendly } from '../common.js';

export function chooseDiplomacy(strategy, state, proposed) {
  if (state.config.disableAlliances?.()) return null;
  const fronts = state.map.fronts.filter((f) => f.id !== 0);
  const humans = state.players.filter(
    (player) =>
      isHuman(player) &&
      player.id() !== state.me.id() &&
      player.isAlive() &&
      (fronts.some((f) => f.id === player.smallID()) ||
        state.enemies.some((enemy) => enemy.playerID === player.id())),
  );
  const target =
    strategy.focus ??
    proposed ??
    strategy
      .targetPool(state)
      .filter(isAI)
      .sort((a, b) => a.troops - b.troops)[0]?.playerID;
  const stronger = (player) => {
    try {
      return state.config.maxTroops(player) > state.cap * STRONGER_NEIGHBOR_CAPACITY_RATIO;
    } catch {
      return false;
    }
  };
  // The current human conquest already supplies an expansion route. While
  // fighting AI, keep a weaker human available only when one actually exists.
  const humanTarget = humans.some((player) => player.id() === target);
  const future = humanTarget
    ? null
    : humans
        .filter(
          (player) =>
            player.id() !== target &&
            !friendly(state.me, player) &&
            !stronger(player) &&
            !state.me.isRequestingAllianceWith?.(player),
        )
        .sort((a, b) => a.troops() - b.troops())[0];
  strategy.futureOpponent = future?.id() ?? null;
  const focus = state.enemies.find((enemy) => enemy.playerID === target),
    center = state.map.center;
  const offAxis = (player) => {
    const front =
      state.enemies.find((enemy) => enemy.playerID === player.id()) ??
      fronts.find((f) => f.id === player.smallID());
    if (!focus || !front || !center) return 0;
    const vector = (f) => {
      const points = f.border?.length ? f.border : f.tiles;
      return {
        x: points.reduce((n, t) => n + state.game.x(t), 0) / points.length - center.x,
        y: points.reduce((n, t) => n + state.game.y(t), 0) / points.length - center.y,
      };
    };
    const a = vector(focus),
      b = vector(front);
    return 1 - (a.x * b.x + a.y * b.y) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  };
  const limit = Math.max(0, humans.length - (humanTarget || future ? 1 : 0));
  const eligible = humans
    .filter(
      (player) =>
        player.id() !== target &&
        player.id() !== strategy.futureOpponent &&
        (stronger(player) || humanTarget || !focus || offAxis(player) >= 0.35) &&
        (stronger(player) ||
          player.troops() >= state.troops * 0.15 ||
          (fronts.find((f) => f.id === player.smallID())?.count ??
            state.enemies.find((enemy) => enemy.playerID === player.id())?.count ??
            0) >= 6),
    )
    .sort(
      (a, b) =>
        Number(stronger(b)) - Number(stronger(a)) ||
        offAxis(b) - offAxis(a) ||
        b.troops() - a.troops(),
    )
    .slice(0, limit);
  const wanted = new Set(eligible.map((player) => player.id()));
  const occupied = humans.filter(
    (player) =>
      player.id() !== target &&
      (friendly(state.me, player) || state.me.isRequestingAllianceWith?.(player)),
  ).length;
  const room = (player) =>
    friendly(state.me, player) || state.me.isRequestingAllianceWith?.(player) || occupied < limit;
  // Preserve an expiring flank before processing a queue of new offers (or
  // rejections). Renew the soonest expiry first, not the array's first ally.
  if (
    strategy.adapter.bridge.supports('extend') &&
    !strategy.cooldown('extend', state.tick, COOLDOWNS.diplomacy)
  ) {
    const renewal = [...(state.me.alliances?.() ?? [])]
      .filter(
        (a) =>
          wanted.has(a.other) &&
          a.expiresAt > state.tick &&
          a.expiresAt - state.tick <= (state.config.allianceExtensionPromptOffset?.() ?? 300) &&
          !strategy.cooldown(`diplomacy:${a.other}`, state.tick, COOLDOWNS.allianceRenewal),
      )
      .sort((a, b) => a.expiresAt - b.expiresAt)[0];
    if (renewal)
      return {
        kind: 'extend',
        targetID: renewal.other,
        reason: 'Renew the soonest-expiring useful flank before handling new offers.',
      };
  }
  for (const player of state.players) {
    if (
      !player.isRequestingAllianceWith?.(state.me) ||
      strategy.cooldown(`diplomacy:${player.id()}`, state.tick, COOLDOWNS.allianceResponse)
    )
      continue;
    const kind = wanted.has(player.id()) && room(player) ? 'alliance' : 'reject';
    if (strategy.adapter.bridge.supports(kind))
      return {
        kind,
        targetID: player.id(),
        reason:
          kind === 'reject'
            ? `Decline ${player.name()}: preserve expansion options and limit alliances.`
            : `Accept ${player.name()}: useful protection on another flank.`,
      };
  }
  if (
    strategy.cooldown('alliance', state.tick, COOLDOWNS.diplomacy) ||
    strategy.cooldown('extend', state.tick, COOLDOWNS.diplomacy)
  )
    return null;
  if (!strategy.adapter.bridge.supports('alliance') || occupied >= limit) return null;
  const player = eligible.find(
    (player) =>
      !friendly(state.me, player) &&
      !state.me.isRequestingAllianceWith?.(player) &&
      !strategy.cooldown(`diplomacy:${player.id()}`, state.tick, COOLDOWNS.allianceOffer),
  );
  return player
    ? {
        kind: 'alliance',
        targetID: player.id(),
        reason: `Offer ${player.name()} a flank alliance while preserving a future opponent.`,
      }
    : null;
}
