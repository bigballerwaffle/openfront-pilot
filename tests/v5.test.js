import test from 'node:test';
import assert from 'node:assert/strict';
import { Strategy } from '../src/strategy.js';
import { PilotController } from '../src/controller.js';
import { GameAdapter } from '../src/adapter.js';
import { U } from '../src/common.js';
import { defenseUseful } from '../src/safety.js';
const p = (id, type = 'NATION', troops = 10000) => ({ id: () => String(id), smallID: () => id, type: () => type,
  troops: () => troops, name: () => String(id), isAlive: () => true, isPlayer: () => true });
const enemy = (id, type = 'NATION', troops = 10000) => ({ id, playerID: String(id), raw: p(id, type, troops),
  type, troops, name: String(id), area: 500, count: 20, tiles: [id], border: [id] });
function state(extra = {}) {
  return { game: { terrainType: () => 'Plains' }, config: {}, me: { ...p(1, 'HUMAN'), isAlliedWith: () => false, isOnSameTeam: () => false },
    tick: 200, troops: 80000, cap: 100000, gold: 0, tiles: 1000, incoming: [], outgoing: [], own: [],
    enemies: [], players: [], hostileUnits: [], map: { fronts: [], sites: [], shores: [] }, ...extra };
}
const bot = () => new Strategy({ bridge: { supports: () => true } }, { economy: false, diplomacy: false, navy: false, nukes: false });
test('minor attacks from both tribes and nations leave wilderness and AI expansion active', async () => {
  for (const type of ['BOT', 'NATION']) {
    const e = enemy(2, type), s = state({ enemies: [e, enemy(3)], players: [e.raw], incoming: [{ attackerID: 2, troops: 1000 }] });
    const a = await bot().choose(s); assert.equal(a.kind, 'attack'); assert.equal(a.counter, undefined);
    s.map.fronts = [{ id: 0, tiles: [0] }];
    assert.equal((await bot().choose(s)).targetID, null);
    const b = bot(); assert.equal(b.reserves(s), b.reserves({ ...s, incoming: [] }));
  }
});
test('opens an affordable second AI conquest while keeping the first target and a troop reserve', async () => {
  const a = enemy(2), b = enemy(3, 'BOT'), s = state({ enemies: [a, b], outgoing: [{ id: 'first', targetID: 2, troops: 40000 }] });
  const pilot = bot(); pilot.focus = '2';
  const action = await pilot.choose(s); assert.equal(action.targetID, '3'); assert.equal(action.secondary, true);
  assert.ok(action.troops <= s.troops - action.reserve); pilot.record(action, s.tick); assert.equal(pilot.focus, '2');
});
test('does not open a third AI front, mix a human conquest into two fronts, or neglect a weak first army', async () => {
  const a = enemy(2), b = enemy(3), c = enemy(4);
  const s = state({ enemies: [a, b, c], outgoing: [{ id: 'a', targetID: 2, troops: 30000 }, { id: 'b', targetID: 3, troops: 30000 }] });
  assert.equal((await bot().choose(s)).kind, 'wait');
  s.outgoing = [{ id: 'human', targetID: 5, troops: 30000 }]; s.enemies.push(enemy(5, 'HUMAN'));
  assert.equal((await bot().choose(s)).kind, 'wait');
  s.outgoing = [{ id: 'weak', targetID: 2, troops: 1000 }];
  const action = await bot().choose(s); assert.equal(action.reinforce, true); assert.equal(action.targetID, '2');
});
test('counterattacks cancel human pressure without changing the AI conquest objective', async () => {
  const human = enemy(4, 'HUMAN', 60000), pilot = bot(); pilot.focus = '2';
  const s = state({ enemies: [enemy(2), human], players: [human.raw], incoming: [{ attackerID: 4, troops: 12000 }] });
  s.own = [{ type: U.city, tile: 1 }];
  Object.assign(s.game, { x: () => 0, y: () => 0, ref: () => 1, isValidCoord: () => true, ownerID: () => 4 });
  const action = await pilot.choose(s); assert.equal(action.counter, true); assert.equal(action.targetID, '4');
  assert.equal(action.troops, 12000); pilot.record(action, s.tick); assert.equal(pilot.focus, '2');
});
function executionFixture({ counter = false, shrink = false, third = false, incomingAI = false } = {}) {
  let incoming = [{ attackerID: counter ? 4 : 2, troops: 12000 }], sent;
  const target = p(counter ? 4 : 3, counter ? 'HUMAN' : 'NATION');
  const me = { ...state().me, troops: () => 80000, numTilesOwned: () => 1000, units: () => [],
    outgoingAttacks: () => counter ? [] : [{ id: 'one', targetID: 2, troops: 30000 }, ...(third ? [{ id: 'two', targetID: 5, troops: 30000 }] : [])],
    incomingAttacks: () => counter || incomingAI ? incoming : [],
    actions: async () => { if (shrink) incoming = [{ attackerID: 4, troops: 4000 }]; return { canAttack: true }; } };
  const game = { myPlayer: () => me, owner: () => target, players: () => [me, p(2), p(3), p(4, 'HUMAN'), p(5)],
    inSpawnPhase: () => false, config: () => ({ maxTroops: () => 100000 }), ticks: () => 200 };
  const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
  adapter.bridge = { emit: (kind, args) => { sent = { kind, args }; } };
  const action = { kind: 'attack', targetID: target.id(), tile: target.smallID(), troops: counter ? 12000 : 15000,
    reserve: 24000, minRatio: counter ? 0 : 1.3, counter };
  if (counter) {
    me.units = () => [{ id: () => 1, type: () => U.city, tile: () => 1, level: () => 1, owner: () => me }];
    Object.assign(game, { x: () => 0, y: () => 0, ref: () => 1, isValidCoord: () => true, ownerID: () => 4 });
  }
  return { adapter, game, action, sent: () => sent };
}
test('dispatch allows the second AI front during an AI attack but blocks a third', async () => {
  for (const third of [false, true]) {
    const f = executionFixture({ third, incomingAI: true });
    const result = await f.adapter.execute({ game: f.game }, f.action, () => true);
    assert.equal(Boolean(result), !third); assert.equal(Boolean(f.sent()), !third);
  }
});
test('counterattack rechecks incoming strength and is confirmed even if no outgoing attack survives', async () => {
  const f = executionFixture({ counter: true, shrink: true });
  const pending = await f.adapter.execute({ game: f.game }, f.action, () => true);
  assert.equal(f.sent().args[1], 4000); assert.equal(pending.counterIncoming, 4000);
  assert.equal(f.adapter.confirmed({ incoming: [] }, pending), true);
});
test('unregistered commands are replanned after cooldown without disarming the controller', async () => {
  let tick = 100, sent = 0; const game = {};
  const adapter = { game, connect: () => true, sameGame: () => true, bridge: { supports: () => false }, confirmed: () => false,
    snapshot: async () => state({ game, tick, map: { fronts: [{ id: 0, tiles: [0] }], shores: [] } }),
    execute: async (s, a) => { sent++; return { ...a, at: s.tick }; } };
  const c = new PilotController(adapter, () => {}, { economy: false, diplomacy: false, navy: false, nukes: false });
  c.start(); c.pending = { kind: 'attack', at: 1, targetID: null }; await c.step();
  assert.equal(c.running, true); assert.equal(c.pending, null); assert.equal(sent, 0);
  tick = 120; await c.step(); assert.equal(sent, 1); assert.equal(c.running, true);
});
test('a temporary state-reading exception recovers on the next successful update', async () => {
  let fail = true; const game = {}, adapter = { game, connect: () => true, sameGame: () => true,
    bridge: { supports: () => false }, snapshot: async () => { if (fail) throw new Error('loading'); return state({ game, troops: 1000 }); } };
  const c = new PilotController(adapter, () => {}, { economy: false, diplomacy: false, navy: false, nukes: false });
  c.start(); await c.step(); assert.equal(c.running, true); fail = false; await c.step();
  assert.equal(c.lastTick, 200); assert.equal(c.running, true);
});
function economyFixture(type = null, postLevels = 0) {
  const g = { x: t => t % 300, y: t => Math.floor(t / 300), ref: (x, y) => y * 300 + x,
    isValidCoord: (x, y) => x >= 0 && y >= 0 && x < 300 && y < 300,
    ownerID: t => type && t % 300 >= 150 ? 2 : 1, isLand: () => true,
    euclideanDistSquared: (a, b) => (a % 300 - b % 300) ** 2 + (Math.floor(a / 300) - Math.floor(b / 300)) ** 2 };
  const e = enemy(2, type ?? 'NATION'); e.tiles = [g.ref(150, 100)]; e.border = [g.ref(149, 100)];
  const s = state({ game: g, gold: 1000000, enemies: type ? [e] : [],
    incoming: type ? [{ attackerID: 2, troops: 10000 }] : [],
    own: postLevels ? [{ id: 90, type: U.defense, level: postLevels, tile: g.ref(130, 100) }] : [] });
  const pilot = new Strategy({ bridge: { supports: () => true }, buildOption: async (s, unit, tile) => ({ type: unit, cost: 25000, canBuild: tile, canUpgrade: false }) },
    { navy: false, nukes: false, diplomacy: false });
  pilot.sites = (s, unit) => [g.ref(unit === U.defense ? 130 : unit === U.factory ? 110 : 80, 100)];
  return { pilot, s, e, g };
}
test('economic investment sequence targets six city levels and four income levels in ten choices', async () => {
  const { pilot, s } = economyFixture();
  for (let i = 0; i < 10; i++) {
    const a = await pilot.investment(s, 24000, () => true); assert.ok([U.city, U.factory].includes(a.unit));
    pilot.record(a, s.tick); s.own.push({ id: i, type: a.unit, level: 1, tile: a.tile }); s.tick += 400;
  }
  assert.equal(s.own.filter(u => u.type === U.city).length, 6);
  assert.equal(s.own.filter(u => u.type === U.factory).length, 4);
});
test('defense posts require actual human pressure and stop at two total levels', async () => {
  for (const [type, levels, expected] of [['BOT', 0, false], ['NATION', 0, false], ['HUMAN', 0, true], ['HUMAN', 2, false]]) {
    const { pilot, s } = economyFixture(type, levels);
    const a = await pilot.investment(s, 24000, () => true);
    assert.equal(a?.unit === U.defense, expected);
  }
  const { pilot, s } = economyFixture('HUMAN');
  const a = await pilot.investment(s, 24000, () => true); pilot.record(a, s.tick); s.tick += 100;
  assert.notEqual((await pilot.investment(s, 24000, () => true))?.unit, U.defense);
});
test('a defense post must cover the attacking human border, not just another frontier', () => {
  const { s, g } = economyFixture('HUMAN');
  assert.equal(defenseUseful(s, g.ref(130, 100)), true);
  assert.equal(defenseUseful(s, g.ref(80, 100)), false);
  s.incoming = [{ attackerID: 3, troops: 10000 }]; assert.equal(defenseUseful(s, g.ref(130, 100)), false);
});

test('SAM delay allows ordinary economy first, then offers SAM after 900 ticks', async () => {
  const { pilot, s } = economyFixture();
  s.own = [{ type: U.city, level: 2, tile: 100 }];
  s.hostileUnits = [{ type: U.silo }];
  const start = s.tick;
  assert.notEqual((await pilot.investment(s, 24000, () => true)).unit, U.sam);
  s.tick = start + 899;
  assert.notEqual((await pilot.investment(s, 24000, () => true)).unit, U.sam);
  s.tick = start + 900;
  assert.equal((await pilot.investment(s, 24000, () => true)).unit, U.sam);
});
