import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBridge } from '../src/events.js';
import { Strategy } from '../src/strategy.js';
import { GameAdapter } from '../src/adapter.js';
import { PilotController } from '../src/controller.js';
import { U } from '../src/common.js';

class a { constructor(targetID, troops) { this.targetID = targetID; this.troops = troops; } }
class b { constructor(unit, tile, rocketDirectionUp, amount) { this.unit = unit; this.tile = tile; this.rocketDirectionUp = rocketDirectionUp; this.amount = amount; } }
class c { constructor(unitId, unitType, amount = 1) { this.unitId = unitId; this.unitType = unitType; this.amount = amount; } }
const bus = (...types) => ({ listeners: new Map(types.map(t => [t, []])), emit(e) { this.received = e; } });
const strategy = () => new Strategy({ bridge: { supports: () => false }, buildOption: async () => null }, { economy: false, navy: false, nukes: false });
function state(overrides = {}) {
  return { tick: 150, troops: 80000, cap: 100000, gold: 0, tiles: 1500,
    enemies: [], incoming: [], outgoing: [], own: [], hostileUnits: [], players: [],
    map: { fronts: [], sites: [], shores: [] },
    me: { type: () => 'HUMAN' },
    config: { attackLogic: () => ({ attackerTroopLoss: 10, tickFraction: .02 }) },
    game: { terrainType: () => 'Plains', hasFallout: () => false },
    ...overrides };
}

test('resolves minified event names by assignment shape and uses actual constructors', () => {
  const B = bus(a, b, c), bridge = new EventBridge(B);
  bridge.emit('attack', ['enemy', 500]);
  assert.ok(B.received instanceof a); assert.equal(B.received.troops, 500);
  bridge.emit('build', ['City', 0, undefined, 1]);
  assert.ok(B.received instanceof b); assert.equal(B.received.tile, 0);
});
test('ambiguous command signatures fail closed', () => {
  class d { constructor(targetID, troops) { this.targetID = targetID; this.troops = troops; } }
  assert.throws(() => new EventBridge(bus(a, b, d)), /Cannot identify/);
});
test('never invokes unrelated event constructors while resolving', () => {
  let invoked = false;
  class unrelated { constructor() { invoked = true; throw new Error(); } }
  new EventBridge(bus(a, b, unrelated)); assert.equal(invoked, false);
});
test('empty reserve waits even when there is neutral land', async () => {
  const s = state({ troops: 12000, map: { fronts: [{ id: 0, tiles: [45] }], shores: [] } });
  assert.equal((await strategy().choose(s)).kind, 'wait');
});
test('neutral expansion keeps the chosen troop reserve', async () => {
  const s = state({ map: { fronts: [{ id: 0, tiles: [45] }], shores: [] } });
  const action = await strategy().choose(s);
  assert.equal(action.kind, 'attack'); assert.equal(action.targetID, null);
  assert.ok(s.troops - action.troops >= action.reserve);
});
test('reinforces an existing neutral front without selecting a different target', async () => {
  const s = state({ map: { fronts: [{ id: 0, tiles: [45] }], shores: [] }, outgoing: [{ id: 'x', targetID: 0, troops: 10000 }] });
  const action = await strategy().choose(s);
  assert.equal(action.kind, 'attack'); assert.equal(action.reinforce, true); assert.equal(action.targetID, null);
});
test('attacks a weak bot using tile lists separately from its territory area', async () => {
  const s = state({ enemies: [{ id: 2, playerID: 'bot', name: 'Bot', type: 'BOT', troops: 10000, area: 700, count: 20, tiles: [45, 46] }] });
  const action = await strategy().choose(s);
  assert.equal(action.kind, 'attack'); assert.equal(action.targetID, 'bot'); assert.equal(action.tile, 45);
});
test('strong AI does not inflate defensive reserves or attract a hopeless attack', async () => {
  const s = state({ enemies: [{ id: 2, playerID: 'nation', name: 'Nation', type: 'NATION', troops: 180000, area: 3000, count: 20, tiles: [45] }] });
  const p = strategy(); assert.equal(p.reserves(s), p.reserves(state()));
  assert.equal((await p.choose(s)).kind, 'wait');
});
test('a defense post makes the forecast less attractive with the old-client fallback', () => {
  const e = { id: 2, type: 'BOT', troops: 10000, area: 10000, count: 20, tiles: [45] };
  const s = state({ config: {}, game: { terrainType: () => 'Plains', euclideanDistSquared: () => 1 } });
  const p = strategy(), clear = p.forecast(s, e, 30000);
  s.hostileUnits = [{ owner: 2, type: U.defense, tile: 46, building: false }];
  const defended = p.forecast(s, e, 30000); assert.ok(defended.gain < clear.gain);
});
test('build validation accepts tile zero and rejects malformed responses', async () => {
  const adapter = new GameAdapter({}); adapter.bridge = { supports: () => true };
  const s = { config: {}, me: { gold: () => 200000n, buildables: async () => [{ type: U.city, canBuild: 0, canUpgrade: false, cost: 125000n }] } };
  assert.equal((await adapter.buildOption(s, U.city, 0)).canBuild, 0);
  s.me.buildables = async () => [{ type: U.city, cost: 125000n }];
  await assert.rejects(adapter.buildOption(s, U.city, 0), /Unsupported/);
});
test('pause while awaiting state prevents a subsequent command', async () => {
  let resolve, sent = 0;
  const game = {}, adapter = { game, connect: () => true, sameGame: () => true,
    snapshot: () => new Promise(r => { resolve = r; }), execute: async () => { sent++; } };
  const c = new PilotController(adapter, () => {}, { economy: false, navy: false, nukes: false });
  c.start(); const step = c.step(1000); c.pause();
  resolve(state({ game })); await step; assert.equal(sent, 0); assert.equal(c.running, false);
});
test('temporary match detachment keeps the pilot armed', async () => {
  let same = true;
  const adapter = { game: {}, connect: () => true, sameGame: () => same };
  const c = new PilotController(adapter); c.start(); same = false; await c.step();
  assert.equal(c.running, true);
});
test('an unconfirmed command is retired for fresh planning without an immediate resend', async () => {
  let tick = 100, sent = 0;
  const game = {}, adapter = { game, connect: () => true, sameGame: () => true,
    snapshot: async () => state({ tick, game }), confirmed: () => false, execute: async () => { sent++; } };
  const c = new PilotController(adapter); c.start();
  c.pending = { at: 1, reason: 'test' }; await c.step();
  assert.equal(c.running, true); assert.equal(sent, 0);
});
test('a stalled game clock leaves the controller armed', async () => {
  const game = {}, adapter = { game, connect: () => true, sameGame: () => true,
    snapshot: async () => state({ game, troops: 1000 }) };
  const c = new PilotController(adapter, () => {}, { economy: false, navy: false, nukes: false });
  c.start(); await c.step(1000); await c.step(12000); assert.equal(c.running, true);
});
test('an alliance formed while validating an attack cancels that attack', async () => {
  let allied = false, sent = 0;
  const target = { id: () => 'enemy', smallID: () => 2, isPlayer: () => true };
  const me = { id: () => 'me', isAlive: () => true, troops: () => 80000,
    isAlliedWith: () => allied, isOnSameTeam: () => false,
    actions: async () => { allied = true; return { canAttack: true }; } };
  const game = { myPlayer: () => me, owner: () => target, inSpawnPhase: () => false };
  const panel = { game }, adapter = new GameAdapter({ querySelector: () => panel });
  adapter.game = game; adapter.bridge = { emit: () => { sent++; } };
  // Final relationship recheck is essential even if the worker result said yes.
  const result = await adapter.execute({ game }, { kind: 'attack', tile: 50, targetID: 'enemy', troops: 10000, reserve: 41000 }, () => true);
  assert.equal(result, null); assert.equal(sent, 0);
});

test('existing buildings remain eligible upgrade sites after snapshot normalization', () => {
  const s = state({ own: [{ id: 1, type: U.city, tile: 42, level: 1, building: false }],
    me: { smallID: () => 1 },
    game: { ownerID: () => 1, isLand: () => true, euclideanDistSquared: (a, b) => (a - b) ** 2 } });
  assert.deepEqual(strategy().sites(s, U.city), [42]);
});

test('a temporarily unspawned player waits through the spawn phase', async () => {
  const adapter = new GameAdapter({});
  adapter.game = { myPlayer: () => null, config: () => ({}),
    isSpectator: () => true, inSpawnPhase: () => true };
  const snapshot = await adapter.snapshot();
  assert.equal(snapshot.waiting, true);
  assert.match(snapshot.inactive, /spawn/);
});
