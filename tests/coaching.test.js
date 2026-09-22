import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingState, lesson, coachedTuning, prefersSaving } from '../src/coaching.js';
import { LearningStore, VARIANTS, contextKey, validateModel } from '../src/learning.js';
import { MatchLearning } from '../src/match-learning.js';
import { PilotController } from '../src/controller.js';
import { Strategy, DEFAULTS } from '../src/strategy.js';
import { GameAdapter } from '../src/adapter.js';
import { EventBridge } from '../src/events.js';
import { U } from '../src/common.js';

function memory() { const m = new Map(); return { getItem: k => m.get(k), setItem: (k,v) => m.set(k,v) }; }
class Attack { constructor(targetID, troops) { this.targetID = targetID; this.troops = troops; } }
class Build { constructor(unit, tile, rocketDirectionUp, amount) { Object.assign(this, {}); this.unit = unit; this.tile = tile; this.rocketDirectionUp = rocketDirectionUp; this.amount = amount; } }
function fixture() {
  let tick = 0;
  const me = { isAlive: () => true, gold: () => 2000000, troops: () => 80000,
    units: () => [], incomingAttacks: () => [], clientID: () => 'client' };
  const game = { myPlayer: () => me, ticksSinceStart: () => tick, ticks: () => tick,
    gameID: () => 'game', config: () => ({ maxTroops: () => 100000, gameConfig: () => ({}) }),
    inSpawnPhase: () => false, update() {}, gameOver: () => false };
  const bus = { listeners: new Map([[Attack, []], [Build, []]]), emit: () => 42 };
  const bridge = new EventBridge(bus), store = new LearningStore(memory()), learning = new MatchLearning(store);
  const adapter = { game, bridge, sameGame: g => g === game, connect: () => true };
  const controller = new PilotController(adapter, () => {}, {}, learning);
  return { game, me, bus, bridge, store, learning, adapter, controller, tick: n => { tick = n; } };
}

test('native command observer ignores pilot events, preserves return values and restores the bus', () => {
  const f = fixture(), original = f.bus.emit, observed = [];
  const restore = f.bridge.observeManual((kind, e) => observed.push([kind, e]));
  f.bridge.emit('attack', [null, 1000]); assert.equal(observed.length, 0);
  const e = new Attack(null, 1000);
  assert.equal(f.bus.emit(e), 42); assert.deepEqual(observed, [['attack', e]]);
  restore(); assert.equal(f.bus.emit, original);
});

test('observer errors cannot interfere with native game commands', () => {
  const f = fixture(); f.bridge.observeManual(() => { throw Error('observer'); });
  assert.equal(f.bus.emit(new Build(U.city, 1)), 42);
});

test('manual choices train persistent bounded preferences but not unaided variant scores', async () => {
  const f = fixture(); f.controller.start();
  for (let i = 0; i < 3; i++) f.bus.emit(new Attack(null, 24000));
  await Promise.resolve();
  const row = f.store.data.coaching[0]; assert.equal(row.stats.neutral.count, 3);
  const tuning = coachedTuning(VARIANTS[0], row.stats);
  assert.ok(tuning.neutral > VARIANTS[0].neutral); assert.ok(tuning.neutral <= .29);
  assert.equal(f.store.data.total, 0);
  assert.deepEqual(validateModel(f.store.export()).coaching, f.store.data.coaching);
  assert.equal(f.store.select(contextKey(f.game, DEFAULTS)).id, 'baseline');
});

test('manual purchases teach both build balance and spending, even while bot spending is locked', async () => {
  const f = fixture(); f.controller.options.spending = false; f.controller.start();
  f.bus.emit(new Build(U.city, 1)); await Promise.resolve();
  assert.equal(f.store.data.coaching[0].stats.city.count, 1);
  assert.equal(f.store.data.coaching[0].stats.spend.count, 1);
  assert.equal(f.controller.options.spending, false);
});

test('learning off and emergency stop prevent new manual lessons', async () => {
  const f = fixture(); f.controller.start(); f.controller.options.learning = false;
  f.bus.emit(new Attack(null, 1000)); assert.equal(f.store.data.coaching.length, 0);
  f.controller.options.learning = true; f.controller.emergencyStop();
  f.bus.emit(new Attack(null, 1000)); assert.equal(f.store.data.coaching.length, 0);
});

test('Stop cancels a coaching write waiting for the storage lock', async () => {
  const f = fixture(); let commit;
  f.store.locks = { request: (_, fn) => new Promise(resolve => { commit = () => resolve(fn()); }) };
  f.controller.start(); f.controller.teach('save'); f.controller.emergencyStop();
  commit(); await Promise.resolve(); assert.equal(f.store.data.coaching.length, 0);
});

test('coaching schema migrates old backups and rejects invalid labels or values', () => {
  const store = new LearningStore(); const old = JSON.parse(store.export()); delete old.coaching;
  assert.deepEqual(validateModel(JSON.stringify(old)).coaching, []);
  for (const stats of [{ hacked: { count: 1, sum: 1 } }, { save: { count: 1, sum: 2 } }]) {
    assert.throws(() => validateModel(JSON.stringify({ ...old, coaching: [{ key: 'x', stats }] })));
  }
});

test('coaching storage, export and reset remain bounded', async () => {
  const store = new LearningStore(memory());
  for (let i = 0; i < 40; i++) await store.teach('context' + i, { label: 'save', value: 1 });
  assert.equal(store.data.coaching.length, 24);
  for (let i = 0; i < 150; i++) await store.teach('context39', { label: 'save', value: 1 });
  assert.equal(store.data.coaching.at(-1).stats.save.count, 100);
  assert.ok(store.export().length * 2 < 65536);
  await store.reset(); assert.deepEqual(store.data.coaching, []);
});

test('saving needs repeated consistent examples; spending examples can reverse it', () => {
  assert.equal(prefersSaving({ save: { count: 2 } }), false);
  assert.equal(prefersSaving({ save: { count: 3 } }), true);
  assert.equal(prefersSaving({ save: { count: 3 }, spend: { count: 2 } }), false);
  assert.deepEqual(coachedTuning(VARIANTS[0], { attack: { count: 2, sum: 2 } }), VARIANTS[0]);
});

test('manual gold lock excludes routine, emergency and nuclear planning', async () => {
  const bot = new Strategy({}, { spending: false });
  assert.equal(await bot.investment({}, 0, () => true), null);
  assert.equal(await bot.investment({}, 0, () => true, true), null);
  assert.equal(await bot.nuclear({}, () => true), null);
  assert.equal(bot.options.spending, false);
});

test('gold lock is rechecked after a pending native purchase validation', async () => {
  const f = fixture();
  const adapter = new GameAdapter({ querySelector: () => ({ game: f.game }) }); adapter.game = f.game;
  let release, allowed = true;
  adapter.spendingAllowed = () => allowed;
  adapter.buildOption = () => new Promise(resolve => { release = resolve; });
  adapter.bridge = { emit: () => assert.fail('gold spent') };
  const pending = adapter.execute({ game: f.game }, { kind: 'build', unit: U.city, tile: 1 }, () => true);
  allowed = false; release({ canBuild: 1, canUpgrade: false, cost: 100 });
  assert.equal(await pending, null);
});

test('assisted results are retained separately from autonomous trial scores', async () => {
  const f = fixture();
  const base = contextKey(f.game, DEFAULTS);
  f.learning.begin({ game: f.game, me: f.me, tick: 0 }, DEFAULTS);
  f.learning.assist(f.game); f.learning.command(); f.tick(100); f.learning.advance();
  await f.learning.finish(true);
  assert.equal(f.store.data.history[0].assisted, true);
  assert.equal(f.store.data.history[0].context, base + '|assisted');
  assert.equal(f.store.context(base), undefined);
});

test('missing telemetry skips coaching without stopping normal play', () => {
  assert.equal(coachingState({ myPlayer: () => ({ isAlive: () => true }) }), null);
  assert.equal(lesson('attack', { troops: Infinity }, { troops: 1000 }), null);
});

test('manual actions outside the imitation model still mark the match assisted', () => {
  const f = fixture(); f.controller.start(); f.controller.teach('alliance', {});
  assert.equal(f.learning.assistedGames.has(f.game), true);
  assert.equal(f.store.data.coaching.length, 0);
});

test('learned saving affects planning for a bounded period without enabling the manual switch', async () => {
  const f = fixture(); f.controller.start();
  const state = { game: f.game, me: f.me, tick: 0 };
  f.adapter.snapshot = async () => ({ ...state });
  f.controller.strategy.choose = async () => ({ kind: 'wait', reason: 'test' });
  const key = contextKey(f.game, DEFAULTS) + ':' + coachingState(f.game).key;
  for (let i = 0; i < 3; i++) await f.store.teach(key, { label: 'save', value: 1 });
  f.controller.options.spending = false;
  await f.controller.step(); assert.equal(f.controller.strategy.saveGold, true);
  assert.equal(f.controller.options.spending, false);
  state.tick = 301; f.tick(301); await f.controller.step();
  assert.equal(f.controller.strategy.saveGold, false);
  assert.equal(f.controller.options.spending, false);
});
