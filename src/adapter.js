import { factoryConnections } from './opportunities.js';
import { sampleRegions } from './geometry.js';
import { spawnCandidates, validSpawn, spawnCrowding } from './setup.js';
import { safePlacement, safeCrossing, offensiveBusy, isAI, isHuman, humanAttacks, lookupPlayer, landFrontAllowed, defenseUseful, growthAdvantage, structureThreatened, earlyCapacity } from './safety.js';
import { EventBridge } from './events.js';
import { unitsOf, U, STRUCTURES, sample, finite, number, deadline, friendly, unitData } from './common.js';

export class GameAdapter {
  constructor(document) { this.document = document; this.game = null; this.lastMap = null; }
  connect() {
    const panel = this.document.querySelector('control-panel');
    const game = panel?.game;
    if (!game || typeof game.myPlayer !== 'function') return false;
    if (game === this.game && panel.eventBus === this.bus) return true;
    for (const fn of ['config', 'ticks', 'ownerID', 'owner', 'neighbors', 'players', 'units', 'ref', 'isLand', 'width', 'height']) {
      if (typeof game[fn] !== 'function') throw new Error(`Unsupported game client: missing ${fn}().`);
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
    const g = this.game, me = g.myPlayer(), config = g.config();
    if (!active() || !this.sameGame(g) || !g.inSpawnPhase()) return 'Waiting for the match.';
    if (config.isReplay?.() || config.isIntentionalSpectator?.()) return 'Replay or spectator mode: no spawn sent.';
    if (config.isRandomSpawn?.()) return 'This lobby assigns random spawns; waiting for the game.';
    if (!this.bridge.supports('spawn')) return 'Automatic spawn unavailable in this client; choose a starting point manually.';
    if (!this.spawnState || this.spawnState.game !== g) this.spawnState = { game: g, last: -Infinity };
    const state = this.spawnState;
    if (g.ticks() - state.last < 20) return 'Monitoring the selected spawn while players join.';
    state.last = g.ticks();
    const current = me?.spawnTile?.() ?? state.tile;
    const relocating = Boolean(me?.hasSpawned?.());
    if (relocating && !Number.isInteger(current)) return 'Starting point confirmed; waiting for spawn coordinates.';
    const crowd = relocating ? spawnCrowding(g, current) : null;
    if (crowd && crowd.count < 2 && crowd.penalty < 130) return 'Starting area has room; monitoring nearby players.';
    const tile = spawnCandidates(g).find(t => !crowd || (spawnCrowding(g, t).count < crowd.count
      && spawnCrowding(g, t).penalty + 50 < crowd.penalty));
    if (tile === undefined) return 'No suitable starting patch found; waiting for a valid spawn.';
    if (!active() || !this.sameGame(g) || !g.inSpawnPhase() || config.isRandomSpawn?.() || !validSpawn(g, tile)) return 'Spawn state changed; reconsidering.';
    state.tile = tile;
    this.bridge.emit('spawn', [tile]);
    return relocating ? 'Moved to a less crowded starting area; continuing to monitor arrivals.'
      : 'Selected a starting point with expansion room and nearby port access.';
  }
  async snapshot() {
    const g = this.game, me = g.myPlayer(), config = g.config();
    if (config.isReplay?.() || config.isIntentionalSpectator?.()) return { inactive: 'Replay or spectator mode', game: g };
    if (g.gameOver?.()) return { inactive: 'Match finished', game: g };
    if (g.inSpawnPhase()) return { inactive: 'Choose your spawn; waiting for the match to start', waiting: true, game: g };
    if (!me || !me.isAlive() || (me.hasSpawned && !me.hasSpawned())) return { inactive: 'No living player in this match', game: g };
    if (g.isCatchingUp?.()) return { inactive: 'Waiting for the game to catch up', waiting: true, game: g };
    const ticks = finite(g.ticks(), 'game tick');
    if (!this.lastMap || ticks - this.lastMap.tick >= 15) {
      const { borderTiles } = await deadline(me.borderTiles());
      if (!borderTiles || typeof borderTiles[Symbol.iterator] !== 'function') throw new Error('Unsupported border data.');
      if (!this.sameGame(g)) throw new Error('The match changed while reading the map.');
      this.lastMap = this.mapSummary(g, me, borderTiles, ticks);
    }
    const incoming = me.incomingAttacks().filter(a => !a.retreating);
    const outgoing = me.outgoingAttacks().filter(a => !a.retreating);
    const allUnits = unitsOf(g, ...STRUCTURES, U.warship, U.transport, U.atom, U.hydrogen, U.mirv);
    const own = me.units().filter(u => !u.isActive || u.isActive()).map(unitData);
    const enemies = this.lastMap.fronts.filter(f => f.id !== 0).flatMap(f => {
      const p = g.playerBySmallID(f.id);
      if (!p?.isPlayer?.() || !p.isAlive() || friendly(me, p)) return [];
      return [{ ...f, raw: p, playerID: p.id(), name: p.name(), troops: finite(p.troops(), 'enemy troops'),
        area: finite(p.numTilesOwned(), 'enemy territory'), type: p.type(), traitor: p.isTraitor?.() ?? false }];
    });
    const hostileUnits = allUnits.filter(u => !friendly(me, u.owner())).map(unitData);
    return {
      game: g, me, config, tick: ticks, troops: finite(me.troops(), 'troops'),
      cap: Math.max(1, finite(config.maxTroops(me), 'troop capacity')),
      gold: finite(me.gold(), 'gold'), tiles: finite(me.numTilesOwned(), 'territory'),
      own, hostileUnits, enemies, incoming, outgoing, allOutgoing: me.outgoingAttacks(), map: this.lastMap,
      players: g.players(), immunized: g.isSpawnImmunityActive?.() ?? false
    };
  }
  mapSummary(g, me, borders, tick) {
    const ownID = me.smallID(), points = sample(borders, 6000);
    const fronts = new Map(), shores = [], sites = new Set();
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const tile of points) {
      if (g.ownerID(tile) !== ownID) continue;
      const x = g.x(tile), y = g.y(tile);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const n of g.neighbors(tile)) {
        if (!g.isLand(n)) { if (!g.isImpassable?.(n)) shores.push(tile); continue; }
        const id = g.ownerID(n);
        if (id === ownID) continue;
        if (!fronts.has(id)) fronts.set(id, { id, tiles: [], border: [] });
        const f = fronts.get(id); f.tiles.push(n); f.border.push(tile);
      }
    }
    for (const p of sample(points, 65)) {
      sites.add(p);
      for (const d of [8, 24, 48, 80]) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const x = g.x(p) + dx, y = g.y(p) + dy;
        if (!g.isValidCoord(x, y)) continue;
        const t = g.ref(x, y);
        if (g.ownerID(t) === ownID && g.isLand(t)) sites.add(t);
      }
    }
    if (Number.isFinite(minX)) {
      const step = Math.max(5, Math.ceil(Math.sqrt((maxX - minX + 1) * (maxY - minY + 1) / 250)));
      for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
        const t = g.ref(x, y);
        if (g.ownerID(t) === ownID && g.isLand(t)) sites.add(t);
      }
    }
    for (const u of unitsOf(me, ...STRUCTURES)) sites.add(u.tile());
    return { tick, regions: sampleRegions(g), center: Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null, fronts: [...fronts.values()].map(f => ({ ...f, count: f.tiles.length,
      tiles: sample(new Set(f.tiles), 64), border: sample(new Set(f.border), 64) })),
      shores: sample(new Set(shores), 120), sites: sample(sites, 360) };
  }
  async buildOption(s, type, tile) {
    if (s.config.isUnitDisabled?.(type)) return null;
    const options = await deadline(s.me.buildables(tile, [type]));
    const b = options.find(b => b.type === type);
    if (!b || !Number.isFinite(number(b.cost)) || number(b.cost) > number(s.me.gold())) return null;
    if (!((b.canBuild === false || Number.isInteger(b.canBuild))
      && (b.canUpgrade === false || Number.isInteger(b.canUpgrade)))) throw new Error('Unsupported build validation response.');
    if (b.canBuild === false && b.canUpgrade === false) return null;
    if (b.canUpgrade !== false && !this.bridge.supports('upgrade')) return null;
    return b;
  }
  // Revalidate against current state after asynchronous planning and before send.
  async execute(s, action, stillRunning) {
    const g = s.game, me = g.myPlayer();
    const valid = () => stillRunning() && this.sameGame(g) && me === g.myPlayer() && me.isAlive()
      && !g.inSpawnPhase() && !g.gameOver?.() && !g.isCatchingUp?.();
    if (!valid()) return null;
    if (action.kind === 'attack' || action.kind === 'boat') {
      const target = g.owner(action.tile);
      if (friendly(me, target) || target.id() !== action.targetID) return null;
      const troops = Math.floor(Math.min(action.troops, me.troops() - action.reserve));
      if (!Number.isFinite(troops) || troops < 100 || troops > me.troops() * 0.72) return null;
      const can = await deadline(me.actions(action.tile, action.kind === 'boat' ? [U.transport] : []));
      if (!valid() || g.owner(action.tile).id() !== action.targetID || friendly(me, g.owner(action.tile))) return null;
      if (action.kind === 'attack' && !can.canAttack) return null;
      if (action.kind === 'boat' && !can.buildableUnits.some(b => b.type === U.transport && b.canBuild !== false)) return null;
      let latestTroops = Math.floor(Math.min(troops, me.troops() - action.reserve));
      if (latestTroops < 100) return null;
      const waves = me.outgoingAttacks();
      const fresh = { ...s, me, game: g, config: g.config?.() ?? s.config,
        players: g.players?.() ?? [...(s.players ?? []), target],
        incoming: me.incomingAttacks?.() ?? [], allOutgoing: waves, outgoing: waves.filter(a => !a.retreating),
        troops: me.troops(), cap: (g.config?.() ?? s.config)?.maxTroops?.(me) ?? s.cap,
        own: me.units().map(unitData) };
      const incoming = humanAttacks(fresh);
      let counterIncoming = 0;
      if (action.counter) {
        if (action.kind !== 'attack' || isAI(target)) return null;
        if (!structureThreatened(fresh, target.smallID())) return null;
        counterIncoming = incoming.filter(a => a.attackerID === target.smallID()).reduce((n, a) => n + a.troops, 0);
        if (!counterIncoming) return null;
        const others = incoming.filter(a => a.attackerID !== target.smallID()).reduce((n, a) => n + a.troops, 0);
        const reserve = Math.max(action.reserve, fresh.config.maxTroops(me) * .18, others * 1.15);
        latestTroops = Math.floor(Math.min(latestTroops, counterIncoming, me.troops() - reserve));
        if (latestTroops < 100) return null;
      } else if (action.reinforce) {
        if (action.kind !== 'attack' || !landFrontAllowed(fresh, target.smallID(), true)) return null;
        if (incoming.length && me.troops() - latestTroops < fresh.config.maxTroops(me) * .25
          + incoming.reduce((n, a) => n + a.troops, 0) * 1.25) return null;
      } else {
        if (incoming.length) return null;
        if (action.kind === 'boat' ? offensiveBusy(me) : !landFrontAllowed(fresh, target.smallID())) return null;
        if (waves.length) {
          for (const id of new Set(waves.map(a => a.targetID))) {
            const p = lookupPlayer(fresh, id);
            const defenders = typeof p?.troops === 'function' ? p.troops() : p?.troops;
            if (!Number.isFinite(defenders) || waves.filter(a => a.targetID === id).reduce((n, a) => n + a.troops, 0) < defenders * 1.3) return null;
          }
        }
        if (target.isPlayer() && latestTroops < target.troops() * (action.minRatio ?? 1.67)) return null;
        if (action.growth && !growthAdvantage(fresh, { raw: target, troops: target.troops() }, latestTroops)) return null;
        if (!action.growth && (action.minRatio ?? 1.67) < (isAI(target) ? 1.3 : 1.67)
          && me.troops() / fresh.config.maxTroops(me) < .92 && !earlyCapacity(fresh)) return null;
      }
      if (action.kind === 'boat') {
        const spawn = can.buildableUnits.find(b => b.type === U.transport)?.canBuild;
        if (!safeCrossing({ ...s, me, config: g.config() }, spawn, action.tile)) return null;
      }
      const before = this.checkpoint(me);
      this.bridge.emit(action.kind, action.kind === 'attack' ? [target.id(), latestTroops] : [action.tile, latestTroops]);
      return { ...action, counterIncoming, troops: latestTroops, before, at: g.ticks(), targetSmallID: target.smallID() };
    }
    if (action.kind === 'build') {
      const b = await this.buildOption(s, action.unit, action.tile);
      if (!b || !valid() || number(me.gold()) < number(b.cost) + (action.goldReserve ?? 0)) return null;
      const upgrade = b.canUpgrade !== false;
      const destination = upgrade ? g.unit(b.canUpgrade)?.tile() : b.canBuild;
      if (destination === undefined || destination === false) return null;
      if (!safePlacement({ ...s, me }, destination, action.unit)
        || (action.unit === U.defense && !defenseUseful({ ...s, me }, destination))
        || (action.unit === U.factory && factoryConnections({ ...s, me, own: me.units().filter(u => !u.isActive || u.isActive()).map(unitData) }, destination) === 0)) return null;
      if ([U.atom, U.hydrogen, U.mirv].includes(action.unit) && !this.nukeSafe(s, action.tile, action.unit)) return null;
      if (action.unit === U.hydrogen && unitsOf(g, U.sam).some(u => !friendly(me, u.owner()) && !u.isUnderConstruction?.()
        && g.euclideanDistSquared(action.tile, u.tile()) <= ((g.config().samRange?.(u.level()) ?? 150) + 15) ** 2)) return null;
      const before = this.checkpoint(me);
      if (upgrade) this.bridge.emit('upgrade', [b.canUpgrade, b.type, 1]);
      else this.bridge.emit('build', [b.type, [U.atom, U.hydrogen, U.mirv].includes(b.type) ? action.tile : b.canBuild, undefined, 1]);
      return { ...action, tile: destination, upgradeID: upgrade ? b.canUpgrade : null, before, at: g.ticks() };
    }
    if (['alliance', 'reject', 'extend'].includes(action.kind) && this.bridge.supports(action.kind)) {
      const target = g.players().find(p => p.id() === action.targetID);
      if (!target?.isAlive() || target === me || (action.kind !== 'reject' && !isHuman(target))) return null;
      if (action.kind === 'reject') {
        if (!target.isRequestingAllianceWith?.(me)) return null;
      } else {
        const { borderTiles } = await deadline(target.borderTiles());
        if (!valid()) return null;
        const tile = [...borderTiles].find(t => g.ownerID(t) === target.smallID());
        if (tile === undefined) return null;
        const can = await deadline(me.actions(tile, []));
        if (!valid() || g.ownerID(tile) !== target.smallID() || !target.isAlive()) return null;
        if (action.kind === 'alliance' && !can.interaction?.canSendAllianceRequest) return null;
        if (action.kind === 'extend' && !can.interaction?.allianceInfo?.canExtend) return null;
      }
      if (!valid()) return null;
      this.bridge.emit(action.kind, action.kind === 'alliance' ? [me, target] : [target]);
      return { ...action, at: g.ticks(), diplomatic: true };
    }
    if (action.kind === 'cancel' && this.bridge.supports('cancel')) {
      if (!me.outgoingAttacks().some(a => a.id === action.attackID && !a.retreating)) return null;
      const before = this.checkpoint(me);
      this.bridge.emit('cancel', [action.attackID]);
      return { ...action, before, at: g.ticks() };
    }
    return null;
  }
  checkpoint(me) {
    return { tiles: me.numTilesOwned(), troops: me.troops(),
      units: new Map(me.units().map(u => [u.id(), u.level()])),
      attacks: new Set(me.outgoingAttacks().map(a => a.id)) };
  }
  confirmed(s, pending) {
    // Diplomacy is rate-limited, never retried while waiting for acceptance.
    if (pending.diplomatic) return true;
    if (pending.counter) return s.incoming.filter(a => !a.retreating && a.attackerID === pending.targetSmallID)
      .reduce((n, a) => n + a.troops, 0) <= pending.counterIncoming - pending.troops * .5;
    if (pending.kind === 'attack') return s.outgoing.some(a => a.targetID === pending.targetSmallID
      && (!pending.before.attacks.has(a.id) || s.troops < pending.before.troops - pending.troops * 0.5))
      || s.tiles > pending.before.tiles;
    if (pending.kind === 'boat') return s.own.some(u => u.type === U.transport && !pending.before.units.has(u.id));
    if (pending.kind === 'cancel') return !s.outgoing.some(a => a.id === pending.attackID);
    return s.own.some(u => u.type === pending.unit && (pending.upgradeID !== null
      ? u.id === pending.upgradeID && u.level > pending.before.units.get(u.id)
      : !pending.before.units.has(u.id)));
  }
  nukeSafe(s, tile, type) {
    const owner = s.game.owner(tile);
    if (!owner.isPlayer?.() || friendly(s.me, owner)) return false;
    const radius = s.config.nukeMagnitudes?.(type)?.outer;
    if (!Number.isFinite(radius)) return false;
    const g = s.game, x0 = g.x(tile), y0 = g.y(tile);
    for (let y = Math.max(0, y0 - radius); y <= Math.min(g.height() - 1, y0 + radius); y++) {
      for (let x = Math.max(0, x0 - radius); x <= Math.min(g.width() - 1, x0 + radius); x++) {
        if ((x - x0) ** 2 + (y - y0) ** 2 > radius ** 2) continue;
        const p = g.owner(g.ref(x, y));
        if (friendly(s.me, p)) return false;
      }
    }
    return true;
  }
}
