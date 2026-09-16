import { DEFENSE, COOLDOWNS, NUCLEAR } from '../rules.js';
import { factoryConnections, cityFactoryConnections, terrainRank } from '../opportunities.js';
import { isAI, humanAttacks, safePlacement, defenseUseful, earlyCapacity } from '../safety.js';
import { unitsOf, U, STRUCTURES, sample, number } from '../common.js';

export function updateNuclearThreat(strategy, state) {
  if (!state.hostileUnits.some((unit) => unit.type === U.silo)) {
    strategy.firstNuclearThreatTick = null;
    return false;
  }
  strategy.firstNuclearThreatTick ??= state.tick;
  // Use game time so background-tab delays cannot skip the waiting period.
  return state.tick - strategy.firstNuclearThreatTick >= NUCLEAR.samDelayTicks;
}

export async function chooseInvestment(strategy, state, reserve, active, defensiveOnly = false) {
  if (state.gold < 100000 || state.tiles < 250) return null;
  const count = (type) =>
    state.own.filter((unit) => unit.type === type).reduce((a, unit) => a + unit.level, 0);
  const cities = count(U.city),
    economy = count(U.port) + count(U.factory);
  const nuclearThreat = strategy.samReady(state);
  const threatened = humanAttacks(state).length > 0;
  const humanPressure = humanAttacks(state).reduce((n, a) => n + a.troops, 0);
  const huge =
    humanPressure >=
    Math.max(
      DEFENSE.hugeAttackTroops,
      state.cap * DEFENSE.hugeAttackCapacityShare,
      state.troops * DEFENSE.hugeAttackArmyShare,
    );
  const preferCity =
    cities + economy === 0 || cities / (cities + economy) < (strategy.tuning.city ?? 0.6);
  const types = [];
  if (
    humanPressure >=
      Math.max(DEFENSE.minimumIncomingTroops, state.cap * DEFENSE.minimumCapacityShare) &&
    count(U.defense) < (huge ? DEFENSE.emergencyPostLevels : DEFENSE.normalPostLevels) &&
    !strategy.cooldown(
      U.defense,
      state.tick,
      huge ? COOLDOWNS.emergencyBuildingType : COOLDOWNS.defensePost,
    )
  )
    types.push([U.defense, 150]);
  if (nuclearThreat && cities >= 2 && count(U.sam) < Math.max(2, Math.ceil(cities / 3)))
    types.push([U.sam, 110]);
  types.push([U.city, earlyCapacity(state) || huge ? 120 : preferCity ? 100 : 65]);
  if (state.map.shores.length) types.push([U.port, preferCity ? 65 : 100]);
  types.push([U.factory, state.map.shores.length ? 32 : preferCity ? 65 : 100]);
  if (
    strategy.options.navy &&
    count(U.port) &&
    state.gold > 450000 &&
    count(U.warship) < Math.min(3, count(U.port))
  ) {
    types.push([U.warship, state.hostileUnits.some((unit) => unit.type === U.transport) ? 95 : 48]);
  }
  if (
    strategy.options.nukes &&
    economy >= 3 &&
    cities >= 3 &&
    !count(U.silo) &&
    state.gold >= NUCLEAR.siloSavings
  )
    types.push([U.silo, 78]);
  const savingHydrogen =
    !threatened && !earlyCapacity(state) && strategy.hydrogenCandidate(state) !== null;
  const savingSilo =
    !threatened &&
    !earlyCapacity(state) &&
    strategy.nuclearEstablished(state) &&
    !state.own.some((unit) => unit.type === U.silo && !unit.building);
  const nuclearFund = savingHydrogen
    ? NUCLEAR.hydrogenSavings
    : savingSilo
      ? NUCLEAR.siloSavings
      : 0;
  const bank = huge ? 0 : nuclearThreat && !count(U.sam) ? 100000 : threatened ? 50000 : 0;
  for (const [type] of types.sort((a, b) => b[1] - a[1])) {
    if ((defensiveOnly || huge) && type !== U.defense && !(huge && type === U.city)) continue;
    if (!active()) return null;
    if (
      strategy.cooldown(
        type,
        state.tick,
        huge ? COOLDOWNS.emergencyBuildingType : COOLDOWNS.buildingType,
      ) ||
      state.config.isUnitDisabled?.(type)
    )
      continue;
    // Allow at most one unfinished building of each type.
    if (state.own.some((unit) => unit.type === type && unit.building)) continue;
    const sites = strategy.sites(state, type);
    for (const tile of sites.slice(0, 16)) {
      if (!active()) return null;
      if (type === U.factory && factoryConnections(state, tile) === 0) continue;
      const option = await strategy.adapter.buildOption(state, type, tile);
      if (
        !option ||
        number(option.cost) +
          (nuclearFund && type !== U.silo ? Math.max(bank, nuclearFund) : bank) >
          state.gold
      )
        continue;
      const upgrading = option.canUpgrade !== false;
      const actualTile = upgrading ? state.game.unit(option.canUpgrade)?.tile() : option.canBuild;
      if (actualTile === false || actualTile === undefined) continue;
      if (
        !safePlacement(state, actualTile, type) ||
        (type === U.defense && !defenseUseful(state, actualTile)) ||
        (type === U.factory && factoryConnections(state, actualTile) === 0)
      )
        continue;
      return {
        kind: 'build',
        unit: type,
        tile,
        goldReserve: bank,
        reason: `${upgrading ? 'Upgrade' : 'Build'} ${type.toLowerCase()}${type === U.city ? ' to raise troop capacity' : type === U.port || type === U.factory ? ' to grow income' : ' to protect the position'}.`,
      };
    }
  }
  return null;
}

export function distanceToEnemyBorder(strategy, state, tile, humansOnly = false) {
  let dist = 1e9;
  for (const enemy of state.enemies.filter((enemy) => !humansOnly || !isAI(enemy)))
    for (const b of sample(enemy.border, 16)) {
      dist = Math.min(dist, Math.sqrt(state.game.euclideanDistSquared(tile, b)));
    }
  return dist;
}

export function rankBuildingSites(strategy, state, type) {
  const game = state.game,
    existing = state.own.filter((unit) => STRUCTURES.includes(unit.type));
  let tiles = type === U.port || type === U.warship ? state.map.shores : state.map.sites;
  tiles = [
    ...new Set([
      ...tiles,
      ...state.own.filter((unit) => unit.type === type && !unit.building).map((unit) => unit.tile),
    ]),
  ];
  const border = state.enemies
    .filter((enemy) => type !== U.defense || !isAI(enemy))
    .flatMap((enemy) => sample(enemy.border, 12));
  if (type === U.defense) {
    const setback = [];
    for (const t of border)
      for (let a = 0; a < 12; a++)
        for (const r of [18, 23]) {
          const x = Math.round(game.x(t) + Math.cos((a * Math.PI) / 6) * r);
          const y = Math.round(game.y(t) + Math.sin((a * Math.PI) / 6) * r);
          if (game.isValidCoord(x, y)) setback.push(game.ref(x, y));
        }
    tiles = [...new Set([...setback, ...tiles])].filter(
      (t) => safePlacement(state, t, type) && defenseUseful(state, t),
    );
  }
  const score = (t) => {
    const danger = strategy.danger(state, t, type === U.defense);
    const shore = Math.min(
      110,
      ...state.map.shores.map((b) => Math.sqrt(game.euclideanDistSquared(t, b))),
    );
    const near = existing.length
      ? Math.min(...existing.map((unit) => Math.sqrt(game.euclideanDistSquared(t, unit.tile))))
      : 80;
    const same = state.own.find((unit) => unit.type === type && unit.tile === t);
    if (type === U.defense) {
      const covered = state.own.some(
        (unit) => unit.type === U.defense && game.euclideanDistSquared(t, unit.tile) < 25 ** 2,
      );
      return 100 + Math.min(shore, 30) - Math.abs(danger - 23) - (covered ? 100 : 0);
    }
    if (type === U.factory) {
      const links = factoryConnections(state, t);
      return (
        Math.min(danger, 110) +
        shore +
        Math.min(near, 75) +
        Math.min(links, 8) * 22 -
        (same ? same.level * 12 : 0)
      );
    }
    if (type === U.sam) {
      const value =
        existing.filter(
          (unit) =>
            [U.city, U.port, U.factory].includes(unit.type) &&
            game.euclideanDistSquared(t, unit.tile) < 70 ** 2,
        ).length * 15;
      const covered = state.own.some(
        (unit) =>
          unit.type === U.sam &&
          !unit.building &&
          game.euclideanDistSquared(t, unit.tile) < 65 ** 2,
      );
      return value + Math.min(danger, 60) - (covered ? 100 : 0);
    }
    // A port needs a trading partner. Longer routes tend to be more valuable.
    if (type === U.port) {
      const others = unitsOf(state.game, U.port).filter(
        (unit) =>
          unit.owner().smallID() !== state.me.smallID() && !state.me.hasEmbargo?.(unit.owner()),
      );
      const route = others.length
        ? Math.max(
            ...sample(others, 30).map((unit) =>
              Math.sqrt(game.euclideanDistSquared(t, unit.tile())),
            ),
          )
        : 0;
      return (
        Math.min(danger, 90) +
        Math.min(near, 65) +
        Math.min(route / 12, 60) -
        (same ? same.level * 10 : 0)
      );
    }
    // Factories near city stations, cities spread across protected interior.
    return (
      Math.min(danger, 110) +
      shore +
      Math.min(near, 75) +
      (type === U.city ? Math.min(3, cityFactoryConnections(state, t)) * 15 : 0) +
      (terrainRank(game.terrainType?.(t)) ?? 0) * 12 -
      (same ? same.level * 12 : 0)
    );
  };
  return tiles
    .filter(
      (t) => game.ownerID(t) === state.me.smallID() && game.isLand(t) && !game.hasFallout?.(t),
    )
    .map((tile) => ({ tile, score: score(tile) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.tile);
}
