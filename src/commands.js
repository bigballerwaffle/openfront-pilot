// Dispatch boundary: reread live state after awaits before emitting native events.
// Strategy modules propose actions; these functions can still refuse them.
import { factoryConnections } from './opportunities.js';
import {
  safePlacement,
  safeCrossing,
  offensiveBusy,
  isAI,
  isHuman,
  humanAttacks,
  lookupPlayer,
  landFrontAllowed,
  defenseUseful,
  growthAdvantage,
  structureThreatened,
  earlyCapacity,
} from './safety.js';
import { unitsOf, U, number, deadline, friendly, unitData } from './common.js';
import {
  MAX_TROOP_SEND_FRACTION,
  MIN_AI_ATTACK_RATIO,
  MIN_HUMAN_ATTACK_RATIO,
  NEAR_CAPACITY_THRESHOLD,
  NUCLEAR,
} from './rules.js';

export async function executeAttack(adapter, state, action, ourPlayer, valid) {
  const game = state.game;
  const target = game.owner(action.tile);
  if (friendly(ourPlayer, target) || target.id() !== action.targetID) return null;
  const troops = Math.floor(Math.min(action.troops, ourPlayer.troops() - action.reserve));
  if (
    !Number.isFinite(troops) ||
    troops < 100 ||
    troops > ourPlayer.troops() * MAX_TROOP_SEND_FRACTION
  )
    return null;
  const can = await deadline(
    ourPlayer.actions(action.tile, action.kind === 'boat' ? [U.transport] : []),
  );
  if (
    !valid() ||
    game.owner(action.tile).id() !== action.targetID ||
    friendly(ourPlayer, game.owner(action.tile))
  )
    return null;
  if (action.kind === 'attack' && !can.canAttack) return null;
  if (
    action.kind === 'boat' &&
    adapter.spendingAllowed?.() === false &&
    can.buildableUnits.some((b) => b.type === U.transport && number(b.cost) > 0)
  )
    return null;
  if (
    action.kind === 'boat' &&
    !can.buildableUnits.some((b) => b.type === U.transport && b.canBuild !== false)
  )
    return null;
  let latestTroops = Math.floor(Math.min(troops, ourPlayer.troops() - action.reserve));
  if (latestTroops < 100) return null;
  const waves = ourPlayer.outgoingAttacks();
  const fresh = {
    ...state,
    me: ourPlayer,
    game: game,
    config: game.config?.() ?? state.config,
    players: game.players?.() ?? [...(state.players ?? []), target],
    incoming: ourPlayer.incomingAttacks?.() ?? [],
    allOutgoing: waves,
    outgoing: waves.filter((a) => !a.retreating),
    troops: ourPlayer.troops(),
    cap: (game.config?.() ?? state.config)?.maxTroops?.(ourPlayer) ?? state.cap,
    own: ourPlayer.units().map(unitData),
  };
  const incoming = humanAttacks(fresh);
  let counterIncoming = 0;
  if (action.counter) {
    if (action.kind !== 'attack' || isAI(target)) return null;
    if (!structureThreatened(fresh, target.smallID())) return null;
    counterIncoming = incoming
      .filter((a) => a.attackerID === target.smallID())
      .reduce((n, a) => n + a.troops, 0);
    if (!counterIncoming) return null;
    const others = incoming
      .filter((a) => a.attackerID !== target.smallID())
      .reduce((n, a) => n + a.troops, 0);
    const reserve = Math.max(
      action.reserve,
      fresh.config.maxTroops(ourPlayer) * 0.18,
      others * 1.15,
    );
    latestTroops = Math.floor(
      Math.min(latestTroops, counterIncoming, ourPlayer.troops() - reserve),
    );
    if (latestTroops < 100) return null;
  } else if (action.reinforce) {
    if (action.kind !== 'attack' || !landFrontAllowed(fresh, target.smallID(), true)) return null;
    if (
      incoming.length &&
      ourPlayer.troops() - latestTroops <
        fresh.config.maxTroops(ourPlayer) * 0.25 + incoming.reduce((n, a) => n + a.troops, 0) * 1.25
    )
      return null;
  } else {
    if (incoming.length) return null;
    if (
      action.kind === 'boat' ? offensiveBusy(ourPlayer) : !landFrontAllowed(fresh, target.smallID())
    )
      return null;
    if (waves.length) {
      for (const id of new Set(waves.map((a) => a.targetID))) {
        const player = lookupPlayer(fresh, id);
        const defenders = typeof player?.troops === 'function' ? player.troops() : player?.troops;
        if (
          !Number.isFinite(defenders) ||
          waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0) <
            defenders * MIN_AI_ATTACK_RATIO
        )
          return null;
      }
    }
    if (
      target.isPlayer() &&
      latestTroops < target.troops() * (action.minRatio ?? MIN_HUMAN_ATTACK_RATIO)
    )
      return null;
    if (
      action.growth &&
      !growthAdvantage(fresh, { raw: target, troops: target.troops() }, latestTroops)
    )
      return null;
    if (
      !action.growth &&
      (action.minRatio ?? MIN_HUMAN_ATTACK_RATIO) <
        (isAI(target) ? MIN_AI_ATTACK_RATIO : MIN_HUMAN_ATTACK_RATIO) &&
      ourPlayer.troops() / fresh.config.maxTroops(ourPlayer) < NEAR_CAPACITY_THRESHOLD &&
      !earlyCapacity(fresh)
    )
      return null;
  }
  if (action.kind === 'boat') {
    const spawn = can.buildableUnits.find((b) => b.type === U.transport)?.canBuild;
    if (!safeCrossing({ ...state, me: ourPlayer, config: game.config() }, spawn, action.tile))
      return null;
  }
  const before = adapter.checkpoint(ourPlayer);
  adapter.bridge.emit(
    action.kind,
    action.kind === 'attack' ? [target.id(), latestTroops] : [action.tile, latestTroops],
  );
  return {
    ...action,
    counterIncoming,
    troops: latestTroops,
    before,
    at: game.ticks(),
    targetSmallID: target.smallID(),
  };
}

export async function executeBuild(adapter, state, action, ourPlayer, valid) {
  const game = state.game;
  const b = await adapter.buildOption(state, action.unit, action.tile);
  if (!b || !valid() || number(ourPlayer.gold()) < number(b.cost) + (action.goldReserve ?? 0))
    return null;
  const upgrade = b.canUpgrade !== false;
  const destination = upgrade ? game.unit(b.canUpgrade)?.tile() : b.canBuild;
  if (destination === undefined || destination === false) return null;
  if (
    !safePlacement({ ...state, me: ourPlayer }, destination, action.unit) ||
    (action.unit === U.defense && !defenseUseful({ ...state, me: ourPlayer }, destination)) ||
    (action.unit === U.factory &&
      factoryConnections(
        {
          ...state,
          me: ourPlayer,
          own: ourPlayer
            .units()
            .filter((unit) => !unit.isActive || unit.isActive())
            .map(unitData),
        },
        destination,
      ) === 0)
  )
    return null;
  if (
    [U.atom, U.hydrogen, U.mirv].includes(action.unit) &&
    !adapter.nukeSafe(state, action.tile, action.unit)
  )
    return null;
  if (
    action.unit === U.hydrogen &&
    unitsOf(game, U.sam).some(
      (unit) =>
        !friendly(ourPlayer, unit.owner()) &&
        !unit.isUnderConstruction?.() &&
        game.euclideanDistSquared(action.tile, unit.tile()) <=
          ((game.config().samRange?.(unit.level()) ?? NUCLEAR.defaultSamRange) +
            NUCLEAR.samSafetyMargin) **
            2,
    )
  )
    return null;
  const before = adapter.checkpoint(ourPlayer);
  if (upgrade) adapter.bridge.emit('upgrade', [b.canUpgrade, b.type, 1]);
  else
    adapter.bridge.emit('build', [
      b.type,
      [U.atom, U.hydrogen, U.mirv].includes(b.type) ? action.tile : b.canBuild,
      undefined,
      1,
    ]);
  return {
    ...action,
    tile: destination,
    upgradeID: upgrade ? b.canUpgrade : null,
    before,
    at: game.ticks(),
  };
}

export async function executeDiplomacy(adapter, state, action, ourPlayer, valid) {
  const game = state.game;
  const target = game.players().find((player) => player.id() === action.targetID);
  if (!target?.isAlive() || target === ourPlayer || (action.kind !== 'reject' && !isHuman(target)))
    return null;
  if (action.kind === 'reject') {
    if (!target.isRequestingAllianceWith?.(ourPlayer)) return null;
  } else {
    const { borderTiles } = await deadline(target.borderTiles());
    if (!valid()) return null;
    const tile = [...borderTiles].find((t) => game.ownerID(t) === target.smallID());
    if (tile === undefined) return null;
    const can = await deadline(ourPlayer.actions(tile, []));
    if (!valid() || game.ownerID(tile) !== target.smallID() || !target.isAlive()) return null;
    if (action.kind === 'alliance' && !can.interaction?.canSendAllianceRequest) return null;
    if (action.kind === 'extend' && !can.interaction?.allianceInfo?.canExtend) return null;
  }
  if (!valid()) return null;
  adapter.bridge.emit(action.kind, action.kind === 'alliance' ? [ourPlayer, target] : [target]);
  return { ...action, at: game.ticks(), diplomatic: true };
}

export async function executeRecall(adapter, state, action, ourPlayer, valid) {
  const game = state.game;
  if (!ourPlayer.outgoingAttacks().some((a) => a.id === action.attackID && !a.retreating))
    return null;
  const before = adapter.checkpoint(ourPlayer);
  adapter.bridge.emit('cancel', [action.attackID]);
  return { ...action, before, at: game.ticks() };
}
