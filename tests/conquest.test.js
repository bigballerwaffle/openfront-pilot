import test from 'node:test';
import assert from 'node:assert/strict';
import { Strategy } from '../src/strategy.js';
import { VARIANTS } from '../src/learning.js';
import { EventBridge } from '../src/events.js';
import { GameAdapter } from '../src/adapter.js';
import { PilotController } from '../src/controller.js';
import { safePlacement, safeCrossing } from '../src/safety.js';
import { U } from '../src/common.js';
const player = (id, type = 'HUMAN', troops = 10000) => ({ id: () => id, smallID: () => +id,
  type: () => type, troops: () => troops, name: () => id, isAlive: () => true, isPlayer: () => true });
const enemy = (id, type = 'BOT', troops = 10000) => ({ id: +id, playerID: id, name: id,
  type, troops, area: 500, count: 20, tiles: [+id], border: [+id], raw: player(id, type, troops) });
function state(overrides = {}) {
  return { tick: 200, troops: 100000, cap: 100000, gold: 0, tiles: 1000,
    incoming: [], outgoing: [], own: [], hostileUnits: [], enemies: [], players: [],
    map: { fronts: [], sites: [], shores: [] },
    me: { ...player('1'), isAlliedWith: () => false, isOnSameTeam: () => false },
    config: {}, game: { terrainType: () => 'Plains', euclideanDistSquared: (a, b) => (a - b) ** 2 }, ...overrides };
}
const strategy = (diplomacy = false) => new Strategy({ bridge: { supports: () => true } },
  { economy: false, navy: false, nukes: false, diplomacy });

test('campaign takes wilderness, then a nation, stays with its remnants, then another AI before humans', async () => {
  const bot = strategy(), nation = enemy('2', 'NATION'), tribe = enemy('3'), human = enemy('4', 'HUMAN', 100);
  const s = state({ enemies: [nation, human], players: [nation.raw, tribe.raw, human.raw],
    map: { fronts: [{ id: 0, tiles: [0] }], shores: [] } });
  assert.equal((await bot.choose(s)).targetID, null);
  s.map.fronts = [];
  let action = await bot.choose(s); assert.equal(action.targetID, '2'); bot.record(action, s.tick);
  s.tick += 50; s.enemies.push(tribe); s.map.fronts = [{ id: 0, tiles: [0] }];
  action = await bot.choose(s); assert.equal(action.targetID, '2');
  nation.raw.isAlive = () => false; s.enemies = [tribe, human]; s.map.fronts = [];
  action = await bot.choose(s); assert.equal(action.targetID, '3'); bot.record(action, s.tick);
  tribe.raw.isAlive = () => false; s.enemies = [human]; s.tick += 50;
  assert.equal((await bot.choose(s)).targetID, '4');
});
test('a strong nearby AI prevents diverting to an easy human', async () => {
  const s = state({ enemies: [enemy('2', 'NATION', 100000), enemy('3', 'HUMAN', 100)] });
  assert.equal((await strategy().choose(s)).kind, 'wait');
});
test('every learned variant preserves a large numerical advantage', async () => {
  for (const tuning of VARIANTS) {
    const bot = strategy(); bot.tuning = tuning;
    const action = await bot.choose(state({ enemies: [enemy('2', 'BOT', 20000)] }));
    assert.equal(action.kind, 'attack'); assert.ok(action.troops >= 1.67 * 20000);
    assert.ok(action.troops <= 72000);
    assert.equal((await bot.choose(state({ troops: 80000, enemies: [enemy('2', 'BOT', 50000)] }))).kind, 'wait');
  }
});
test('active, returning, and seaborne offensives all prevent another attack', async () => {
  for (const data of [ { outgoing: [{ id: 'a', targetID: 2 }] },
    { allOutgoing: [{ id: 'a', targetID: 2, retreating: true }] }, { own: [{ type: U.transport }] } ]) {
    const action = await strategy().choose(state({ enemies: [enemy('3')], ...data }));
    assert.equal(action.kind, 'wait');
  }
});
test('rejects a distant unsolicited request and one from the conquest target', async () => {
  const bot = strategy(true), p = player('3'); p.isRequestingAllianceWith = () => true;
  let s = state({ players: [p], enemies: [enemy('2') ] });
  assert.equal((await bot.choose(s)).kind, 'reject');
  bot.focus = '3'; assert.equal((await bot.choose(s)).kind, 'reject');
});
test('offers alliances around the opposite flank before the same direction', async () => {
  const bot = strategy(true); bot.focus = '2';
  const coords = { 2: [0, -30], 3: [1, -25], 4: [0, 30] };
  const s = state({ enemies: [enemy('2'), enemy('3', 'HUMAN'), enemy('4', 'HUMAN')], players: [player('2', 'BOT'), player('3'), player('4')],
    map: { fronts: [], shores: [], center: { x: 0, y: 0 } },
    game: { x: t => coords[t][0], y: t => coords[t][1], terrainType: () => 'Plains' } });
  assert.equal(bot.diplomacy(s, '2').targetID, '4');
});
class Attack { constructor(targetID, troops) { this.targetID = targetID; this.troops = troops; } }
class Build { constructor(unit, tile, rocketDirectionUp, amount) { Object.assign(this, {}); this.unit = unit; this.tile = tile; this.rocketDirectionUp = rocketDirectionUp; this.amount = amount; } }
class Request { constructor(requestor, recipient) { this.requestor = requestor; this.recipient = recipient; } }
class Break { constructor(requestor, recipient) { this.requestor = requestor; this.recipient = recipient; } }
test('minified diplomacy distinguishes request from identical break-alliance signature', () => {
  const bus = { listeners: new Map([[Attack, []], [Build, []], [Request, [e => this.onSendAllianceRequest(e)]],
    [Break, [e => this.onBreakAllianceRequestUIEvent(e)]]]), emit(e) { this.sent = e; } };
  const b = new EventBridge(bus); b.emit('alliance', ['me', 'other']); assert.ok(bus.sent instanceof Request);
  bus.listeners.set(Request, [e => e]); assert.equal(new EventBridge(bus).supports('alliance'), false);
  bus.listeners.delete(Request); assert.equal(new EventBridge(bus).supports('alliance'), false);
});
function grid() {
  const land = new Set(), owners = new Map();
  const g = { x: t => t % 500, y: t => Math.floor(t / 500), ref: (x, y) => y * 500 + x,
    isValidCoord: (x, y) => x >= 0 && y >= 0 && x < 500 && y < 500,
    ownerID: t => owners.get(t) ?? 1, isLand: t => !land.has(t),
    neighbors: t => [t - 1, t + 1, t - 500, t + 500], units: () => [] };
  return { g, land, owners };
}
test('inland buildings reject nearby lakes and other players, including allied borders', () => {
  const { g, land, owners } = grid(), s = state({ game: g }), t = g.ref(100, 100);
  assert.equal(safePlacement(s, t, U.city), true);
  land.add(g.ref(100, 110)); assert.equal(safePlacement(s, t, U.city), false);
  assert.equal(safePlacement(s, t, U.defense), false);
  assert.equal(safePlacement(s, t, U.port), true);
  land.clear(); owners.set(g.ref(120, 100), 2);
  assert.equal(safePlacement(s, t, U.city), false);
  assert.equal(safePlacement(s, t, U.defense), true);
  owners.set(g.ref(115, 100), 2); assert.equal(safePlacement(s, t, U.defense), false);
});
test('transport checks a warship along the crossing and rejects land-obstructed routes', () => {
  const { g, land } = grid();
  for (let y = 0; y < 500; y++) for (let x = 51; x < 290; x++) land.add(g.ref(x, y));
  const s = state({ game: g, config: { warshipTargettingRange: () => 30 } });
  const src = g.ref(50, 250), dst = g.ref(290, 250);
  assert.equal(safeCrossing(s, src, dst), true);
  let shipType = 'Trade Ship';
  g.units = () => [{ type: () => shipType, tile: () => g.ref(170, 260), owner: () => player('2') }];
  assert.equal(safeCrossing(s, src, dst), true);
  shipType = U.warship;
  assert.equal(safeCrossing(s, src, dst), false);
  s.me.isAlliedWith = () => true; assert.equal(safeCrossing(s, src, dst), true);
  land.delete(g.ref(160, 250)); assert.equal(safeCrossing(s, src, dst), false);
});
test('execution rejects a newly active attack and a defender troop increase during validation', async () => {
  for (const scenario of ['attack', 'troops']) {
    let sent = 0, changed = false;
    const target = { ...player('2'), troops: () => changed && scenario === 'troops' ? 90000 : 1000 };
    const me = { ...state().me, troops: () => 100000, units: () => [],
      outgoingAttacks: () => changed && scenario === 'attack' ? [{ id: 'other' }] : [],
      actions: async () => { changed = true; return { canAttack: true }; } };
    const game = { myPlayer: () => me, owner: () => target, inSpawnPhase: () => false };
    const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
    adapter.bridge = { emit: () => { sent++; } };
    const result = await adapter.execute({ game }, { kind: 'attack', tile: 50, targetID: '2', troops: 70000, reserve: 30000 }, () => true);
    assert.equal(result, null); assert.equal(sent, 0);
  }
});
test('emergency stop revokes async work, halts learning, and requires explicit restart', async () => {
  let resolve, sent = 0, polls = 0, aborted = 0;
  const game = {}, adapter = { game, connect: () => true, sameGame: () => true,
    snapshot: () => new Promise(r => { resolve = r; }), execute: async () => { sent++; } };
  const learning = { poll: () => { polls++; }, control: () => {}, abort: () => { aborted++; } };
  const bot = new PilotController(adapter, () => {}, {}, learning);
  bot.start(); const pending = bot.step(); bot.emergencyStop(); resolve(state({ game })); await pending;
  await bot.step(); assert.equal(polls, 1); assert.equal(aborted, 1); assert.equal(sent, 0);
  bot.start(); assert.equal(bot.running, false);
  bot.start({ explicit: true }); assert.equal(bot.running, true);
});

test('alliance acceptance dispatches native player references after legality checks and stops during awaits', async () => {
  for (const stop of [false, true]) {
    let running = true, sent;
    const target = { ...player('2'), borderTiles: async () => ({ borderTiles: new Set([25]) }) };
    const me = { ...player('1'), actions: async () => {
      if (stop) running = false;
      return { interaction: { canSendAllianceRequest: true } };
    } };
    const game = { myPlayer: () => me, players: () => [me, target], ownerID: () => 2,
      inSpawnPhase: () => false, ticks: () => 100 };
    const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
    adapter.bridge = { supports: () => true, emit: (kind, args) => { sent = { kind, args }; } };
    const result = await adapter.execute({ game }, { kind: 'alliance', targetID: '2' }, () => running);
    if (stop) { assert.equal(result, null); assert.equal(sent, undefined); }
    else { assert.deepEqual(sent, { kind: 'alliance', args: [me, target] }); assert.equal(result.diplomatic, true); }
  }
});

test('near-capacity armies can attack an affordable AI without the ideal 1.67 ratio', async () => {
  const s = state({ enemies: [enemy('2', 'NATION', 60000)] });
  const a = await strategy().choose(s);
  assert.equal(a.kind, 'attack'); assert.ok(a.minRatio < 1.67); assert.ok(a.troops >= a.minRatio * 60000);
  s.troops = 85000; assert.equal((await strategy().choose(s)).kind, 'wait');
});
test('incoming attacks stop a new conquest even with a full army', async () => {
  const s = state({ enemies: [enemy('2')], incoming: [{ attackerID: 3, troops: 5000 }] });
  const a = await strategy().choose(s); assert.equal(a.kind, 'wait'); assert.match(a.reason, /Human attack/);
});
test('reinforces the existing target before its deployed troops run out', async () => {
  const s = state({ troops: 80000, enemies: [enemy('2', 'NATION', 40000), enemy('3')],
    outgoing: [{ id: 'wave', targetID: 2, troops: 20000 }] });
  const bot = strategy(), action = await bot.choose(s);
  assert.equal(action.kind, 'attack'); assert.equal(action.reinforce, true); assert.equal(action.targetID, '2');
  assert.ok(action.troops > 0 && s.troops - action.troops >= action.reserve);
});
test('reinforcement holds enough reserves for incoming forces', async () => {
  const s = state({ troops: 80000, enemies: [enemy('2', 'NATION', 40000)],
    outgoing: [{ id: 'wave', targetID: 2, troops: 20000 }], incoming: [{ troops: 60000, attackerID: 3 }] });
  assert.equal((await strategy().choose(s)).kind, 'wait');
});
test('adapter allows reinforcement on the same front and rejects a different active front', async () => {
  for (const targetID of [2, 3]) {
    let sent = 0;
    const target = player('2', 'NATION', 40000), me = { ...state().me, troops: () => 80000,
      outgoingAttacks: () => [{ id: 'wave', targetID, troops: 20000 }], incomingAttacks: () => [],
      units: () => [], numTilesOwned: () => 1000, actions: async () => ({ canAttack: true }) };
    const game = { myPlayer: () => me, owner: () => target, inSpawnPhase: () => false, ticks: () => 100 };
    const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
    adapter.bridge = { emit: () => { sent++; } };
    await adapter.execute({ game }, { kind: 'attack', targetID: '2', tile: 2, troops: 40000, reserve: 30000, reinforce: true }, () => true);
    assert.equal(sent, targetID === 2 ? 1 : 0);
  }
});
test('a newly arriving enemy attack cancels a planned new conquest before dispatch', async () => {
  let attacked = false, sent = 0;
  const target = player('2'), me = { ...state().me, troops: () => 100000, units: () => [], outgoingAttacks: () => [],
    incomingAttacks: () => attacked ? [{ troops: 1000, retreating: false }] : [],
    actions: async () => { attacked = true; return { canAttack: true }; } };
  const game = { myPlayer: () => me, owner: () => target, inSpawnPhase: () => false };
  const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
  adapter.bridge = { emit: () => { sent++; } };
  assert.equal(await adapter.execute({ game }, { kind: 'attack', targetID: '2', tile: 2, troops: 60000, reserve: 30000 }, () => true), null);
  assert.equal(sent, 0);
});
test('strategic alliance preserves a future opponent and covers additional exposed flanks', () => {
  const bot = strategy(true); bot.focus = '2';
  const e = [enemy('2'), enemy('3', 'HUMAN', 15000), enemy('4', 'HUMAN', 40000), enemy('5', 'HUMAN', 35000), enemy('6', 'HUMAN', 30000)];
  const coords = { 2: [0, -30], 3: [2, -30], 4: [0, 30], 5: [-30, 0], 6: [30, 0] };
  const s = state({ enemies: e, players: e.map(e => e.raw), map: { fronts: e, sites: [], shores: [], center: { x: 0, y: 0 } },
    game: { x: t => coords[t][0], y: t => coords[t][1] } });
  e[2].raw.isRequestingAllianceWith = () => true;
  let action = bot.diplomacy(s, '2'); assert.equal(action.kind, 'alliance'); assert.equal(action.targetID, '4');
  assert.equal(bot.futureOpponent, '3');
  e[2].raw.isRequestingAllianceWith = () => false; e[1].raw.isRequestingAllianceWith = () => true;
  assert.equal(bot.diplomacy(s, '2').kind, 'reject');
  e[1].raw.isRequestingAllianceWith = () => false;
  s.me.isAlliedWith = p => ['4', '5'].includes(p.id());
  e[4].raw.isRequestingAllianceWith = () => true;
  assert.equal(bot.diplomacy(s, '2').kind, 'alliance');
});
