import { executeAttack, executeBuild, executeDiplomacy, executeRecall } from './commands.js';
import { SPAWN, MAP_REFRESH_TICKS } from './rules.js';
import { sampleRegions } from './geometry.js';
import { spawnCandidates, validSpawn, spawnCrowding } from './setup.js';
import { EventBridge } from './events.js';
import {
  unitsOf,
  U,
  STRUCTURES,
  sample,
  finite,
  number,
  deadline,
  friendly,
  unitData,
} from './common.js';

export class GameAdapter {
  constructor(document) {
    this.document = document;
    this.game = null;
    this.lastMap = null;
  }
  connect() {
    const panel = this.document.querySelector('control-panel');
    const game = panel?.game;
    if (!game || typeof game.myPlayer !== 'function') return false;
    if (game === this.game && panel.eventBus === this.bus) return true;
    for (const fn of [
      'config',
      'ticks',
      'ownerID',
      'owner',
      'neighbors',
      'players',
      'units',
      'ref',
      'isLand',
      'width',
      'height',
    ]) {
      if (typeof game[fn] !== 'function')
        throw new Error(`Unsupported game client: missing ${fn}().`);
    }
    this.bridge = new EventBridge(panel.eventBus);
    this.panel = panel;
    this.game = game;
    this.bus = panel.eventBus;
    this.lastMap = null;
    return true;
  }
  sameGame(game) {
    return this.game === game && this.document.querySelector('control-panel')?.game === game;
  }
  autoSpawn(active) {
    const game = this.game,
      ourPlayer = game.myPlayer(),
      config = game.config();
    if (!active() || !this.sameGame(game) || !game.inSpawnPhase()) return 'Waiting for the match.';
    if (config.isReplay?.() || config.isIntentionalSpectator?.())
      return 'Replay or spectator mode: no spawn sent.';
    if (config.isRandomSpawn?.()) return 'This lobby assigns random spawns; waiting for the game.';
    if (!this.bridge.supports('spawn'))
      return 'Automatic spawn unavailable in this client; choose a starting point manually.';
    if (!this.spawnState || this.spawnState.game !== game)
      this.spawnState = { game: game, last: -Infinity };
    const state = this.spawnState;
    if (game.ticks() - state.last < SPAWN.recheckTicks)
      return 'Monitoring the selected spawn while players join.';
    state.last = game.ticks();
    const current = ourPlayer?.spawnTile?.() ?? state.tile;
    const relocating = Boolean(ourPlayer?.hasSpawned?.());
    if (relocating && !Number.isInteger(current))
      return 'Starting point confirmed; waiting for spawn coordinates.';
    const crowd = relocating ? spawnCrowding(game, current) : null;
    if (crowd && crowd.count < SPAWN.nearbyPlayerLimit && crowd.penalty < SPAWN.crowdingThreshold)
      return 'Starting area has room; monitoring nearby players.';
    const tile = spawnCandidates(game).find(
      (t) =>
        !crowd ||
        (spawnCrowding(game, t).count < crowd.count &&
          spawnCrowding(game, t).penalty + SPAWN.relocationImprovement < crowd.penalty),
    );
    if (tile === undefined) return 'No suitable starting patch found; waiting for a valid spawn.';
    if (
      !active() ||
      !this.sameGame(game) ||
      !game.inSpawnPhase() ||
      config.isRandomSpawn?.() ||
      !validSpawn(game, tile)
    )
      return 'Spawn state changed; reconsidering.';
    state.tile = tile;
    this.bridge.emit('spawn', [tile]);
    return relocating
      ? 'Moved to a less crowded starting area; continuing to monitor arrivals.'
      : 'Selected a starting point with expansion room and nearby port access.';
  }
  async snapshot() {
    const game = this.game,
      ourPlayer = game.myPlayer(),
      config = game.config();
    if (config.isReplay?.() || config.isIntentionalSpectator?.())
      return { inactive: 'Replay or spectator mode', game: game };
    if (game.gameOver?.()) return { inactive: 'Match finished', game: game };
    if (game.inSpawnPhase())
      return {
        inactive: 'Choose your spawn; waiting for the match to start',
        waiting: true,
        game: game,
      };
    if (!ourPlayer || !ourPlayer.isAlive() || (ourPlayer.hasSpawned && !ourPlayer.hasSpawned()))
      return { inactive: 'No living player in this match', game: game };
    if (game.isCatchingUp?.())
      return { inactive: 'Waiting for the game to catch up', waiting: true, game: game };
    const ticks = finite(game.ticks(), 'game tick');
    if (!this.lastMap || ticks - this.lastMap.tick >= MAP_REFRESH_TICKS) {
      const { borderTiles } = await deadline(ourPlayer.borderTiles());
      if (!borderTiles || typeof borderTiles[Symbol.iterator] !== 'function')
        throw new Error('Unsupported border data.');
      if (!this.sameGame(game)) throw new Error('The match changed while reading the map.');
      this.lastMap = this.mapSummary(game, ourPlayer, borderTiles, ticks);
    }
    const incoming = ourPlayer.incomingAttacks().filter((a) => !a.retreating);
    const outgoing = ourPlayer.outgoingAttacks().filter((a) => !a.retreating);
    const allUnits = unitsOf(
      game,
      ...STRUCTURES,
      U.warship,
      U.transport,
      U.atom,
      U.hydrogen,
      U.mirv,
    );
    const own = ourPlayer
      .units()
      .filter((unit) => !unit.isActive || unit.isActive())
      .map(unitData);
    const enemies = this.lastMap.fronts
      .filter((f) => f.id !== 0)
      .flatMap((f) => {
        const player = game.playerBySmallID(f.id);
        if (!player?.isPlayer?.() || !player.isAlive() || friendly(ourPlayer, player)) return [];
        return [
          {
            ...f,
            raw: player,
            playerID: player.id(),
            name: player.name(),
            troops: finite(player.troops(), 'enemy troops'),
            area: finite(player.numTilesOwned(), 'enemy territory'),
            type: player.type(),
            traitor: player.isTraitor?.() ?? false,
          },
        ];
      });
    const hostileUnits = allUnits
      .filter((unit) => !friendly(ourPlayer, unit.owner()))
      .map(unitData);
    return {
      game: game,
      me: ourPlayer,
      config,
      tick: ticks,
      troops: finite(ourPlayer.troops(), 'troops'),
      cap: Math.max(1, finite(config.maxTroops(ourPlayer), 'troop capacity')),
      gold: finite(ourPlayer.gold(), 'gold'),
      tiles: finite(ourPlayer.numTilesOwned(), 'territory'),
      own,
      hostileUnits,
      enemies,
      incoming,
      outgoing,
      allOutgoing: ourPlayer.outgoingAttacks(),
      map: this.lastMap,
      players: game.players(),
      immunized: game.isSpawnImmunityActive?.() ?? false,
    };
  }
  mapSummary(game, ourPlayer, borders, tick) {
    const ownID = ourPlayer.smallID(),
      points = sample(borders, 6000);
    const fronts = new Map(),
      shores = [],
      sites = new Set();
    let minX = Infinity,
      minY = Infinity,
      maxX = 0,
      maxY = 0;
    for (const tile of points) {
      if (game.ownerID(tile) !== ownID) continue;
      const x = game.x(tile),
        y = game.y(tile);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const n of game.neighbors(tile)) {
        if (!game.isLand(n)) {
          if (!game.isImpassable?.(n)) shores.push(tile);
          continue;
        }
        const id = game.ownerID(n);
        if (id === ownID) continue;
        if (!fronts.has(id)) fronts.set(id, { id, tiles: [], border: [] });
        const f = fronts.get(id);
        f.tiles.push(n);
        f.border.push(tile);
      }
    }
    for (const borderTile of sample(points, 65)) {
      sites.add(borderTile);
      for (const d of [8, 24, 48, 80])
        for (const [dx, dy] of [
          [d, 0],
          [-d, 0],
          [0, d],
          [0, -d],
        ]) {
          const x = game.x(borderTile) + dx,
            y = game.y(borderTile) + dy;
          if (!game.isValidCoord(x, y)) continue;
          const t = game.ref(x, y);
          if (game.ownerID(t) === ownID && game.isLand(t)) sites.add(t);
        }
    }
    if (Number.isFinite(minX)) {
      const step = Math.max(5, Math.ceil(Math.sqrt(((maxX - minX + 1) * (maxY - minY + 1)) / 250)));
      for (let y = minY; y <= maxY; y += step)
        for (let x = minX; x <= maxX; x += step) {
          const t = game.ref(x, y);
          if (game.ownerID(t) === ownID && game.isLand(t)) sites.add(t);
        }
    }
    for (const unit of unitsOf(ourPlayer, ...STRUCTURES)) sites.add(unit.tile());
    return {
      tick,
      regions: sampleRegions(game),
      center: Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null,
      fronts: [...fronts.values()].map((f) => ({
        ...f,
        count: f.tiles.length,
        tiles: sample(new Set(f.tiles), 64),
        border: sample(new Set(f.border), 64),
      })),
      shores: sample(new Set(shores), 120),
      sites: sample(sites, 360),
    };
  }
  async buildOption(state, type, tile) {
    if (state.config.isUnitDisabled?.(type)) return null;
    const options = await deadline(state.me.buildables(tile, [type]));
    const b = options.find((b) => b.type === type);
    if (!b || !Number.isFinite(number(b.cost)) || number(b.cost) > number(state.me.gold()))
      return null;
    if (
      !(
        (b.canBuild === false || Number.isInteger(b.canBuild)) &&
        (b.canUpgrade === false || Number.isInteger(b.canUpgrade))
      )
    )
      throw new Error('Unsupported build validation response.');
    if (b.canBuild === false && b.canUpgrade === false) return null;
    if (b.canUpgrade !== false && !this.bridge.supports('upgrade')) return null;
    return b;
  }
  // Revalidate against current state after asynchronous planning and before send.
  async execute(state, action, stillRunning) {
    const game = state.game,
      ourPlayer = game.myPlayer();
    const valid = () =>
      stillRunning() &&
      (action.kind !== 'build' || this.spendingAllowed?.() !== false) &&
      this.sameGame(game) &&
      ourPlayer === game.myPlayer() &&
      ourPlayer.isAlive() &&
      !game.inSpawnPhase() &&
      !game.gameOver?.() &&
      !game.isCatchingUp?.();
    if (!valid()) return null;
    if (action.kind === 'attack' || action.kind === 'boat') {
      return executeAttack(this, state, action, ourPlayer, valid);
    }
    if (action.kind === 'build') {
      return executeBuild(this, state, action, ourPlayer, valid);
    }
    if (
      ['alliance', 'reject', 'extend'].includes(action.kind) &&
      this.bridge.supports(action.kind)
    ) {
      return executeDiplomacy(this, state, action, ourPlayer, valid);
    }
    if (action.kind === 'cancel' && this.bridge.supports('cancel')) {
      return executeRecall(this, state, action, ourPlayer, valid);
    }
    return null;
  }
  checkpoint(ourPlayer) {
    return {
      tiles: ourPlayer.numTilesOwned(),
      troops: ourPlayer.troops(),
      units: new Map(ourPlayer.units().map((unit) => [unit.id(), unit.level()])),
      attacks: new Set(ourPlayer.outgoingAttacks().map((a) => a.id)),
    };
  }
  confirmed(state, pending) {
    // Diplomacy is rate-limited, never retried while waiting for acceptance.
    if (pending.diplomatic) return true;
    if (pending.counter)
      return (
        state.incoming
          .filter((a) => !a.retreating && a.attackerID === pending.targetSmallID)
          .reduce((n, a) => n + a.troops, 0) <=
        pending.counterIncoming - pending.troops * 0.5
      );
    if (pending.kind === 'attack')
      return (
        state.outgoing.some(
          (a) =>
            a.targetID === pending.targetSmallID &&
            (!pending.before.attacks.has(a.id) ||
              state.troops < pending.before.troops - pending.troops * 0.5),
        ) || state.tiles > pending.before.tiles
      );
    if (pending.kind === 'boat')
      return state.own.some(
        (unit) => unit.type === U.transport && !pending.before.units.has(unit.id),
      );
    if (pending.kind === 'cancel') return !state.outgoing.some((a) => a.id === pending.attackID);
    return state.own.some(
      (unit) =>
        unit.type === pending.unit &&
        (pending.upgradeID !== null
          ? unit.id === pending.upgradeID && unit.level > pending.before.units.get(unit.id)
          : !pending.before.units.has(unit.id)),
    );
  }
  nukeSafe(state, tile, type) {
    const owner = state.game.owner(tile);
    if (!owner.isPlayer?.() || friendly(state.me, owner)) return false;
    const radius = state.config.nukeMagnitudes?.(type)?.outer;
    if (!Number.isFinite(radius)) return false;
    const game = state.game,
      x0 = game.x(tile),
      y0 = game.y(tile);
    for (let y = Math.max(0, y0 - radius); y <= Math.min(game.height() - 1, y0 + radius); y++) {
      for (let x = Math.max(0, x0 - radius); x <= Math.min(game.width() - 1, x0 + radius); x++) {
        if ((x - x0) ** 2 + (y - y0) ** 2 > radius ** 2) continue;
        const player = game.owner(game.ref(x, y));
        if (friendly(state.me, player)) return false;
      }
    }
    return true;
  }
}
