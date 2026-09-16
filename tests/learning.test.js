import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningStore, LEARNING_KEY, LIMITS, VARIANTS, contextKey } from '../src/learning.js';
import { MatchLearning, observeUpdates, resultFor } from '../src/match-learning.js';
import { Strategy, DEFAULTS } from '../src/strategy.js';
import { PilotController } from '../src/controller.js';

function memory() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
const summary = (id, variant = 'baseline', win = true, context = 'test') => ({
  id, context, variant, win, ticks: 1000, commands: 20, coverage: 1
});
function fixture(overrides = {}) {
  const state = { tick: 0, alive: true, ended: false, updates: null, team: null, ...overrides };
  const me = { id: () => 'different-player-id', clientID: () => 'client', team: () => state.team, isAlive: () => state.alive };
  const game = {
    gameID: () => 'game', ticks: () => state.tick, ticksSinceStart: () => state.tick,
    myPlayer: () => me, config: () => ({ gameConfig: () => ({ gameType: 'Singleplayer', gameMode: state.team ? 'Team' : 'FFA', difficulty: 'Medium' }) }),
    gameOver: () => state.ended, updatesSinceLastTick: () => state.updates,
    update(update) { state.tick = update.tick; state.updates = update.updates;
      if (update.alive !== undefined) state.alive = update.alive;
      if (update.end) state.ended = true;
      return 'original-result';
    }
  };
  const store = new LearningStore(memory()), learner = new MatchLearning(store);
  const snapshot = () => ({ game, me, tick: state.tick });
  const begin = () => learner.begin(snapshot(), DEFAULTS);
  const tick = (n, extra = {}) => game.update({ tick: n, updates: {}, ...extra });
  const end = (winner, at = 1000) => tick(at, { end: true, updates: { 12: [{ type: 12, winner, allPlayersStats: {} }] } });
  return { state, me, game, store, learner, snapshot, begin, tick, end };
}

test('training shifts future selections toward the repeatedly successful variant', async () => {
  const store = new LearningStore(memory());
  const selections = [];
  for (let i = 0; i < 160; i++) {
    const selected = store.select('test'); selections.push(selected.id);
    await store.record(summary(`g${i}`, selected.id, selected.id === 'cities'));
  }
  assert.deepEqual(selections.slice(0, 7), VARIANTS.map(v => v.id));
  assert.ok(selections.slice(-60).filter(v => v === 'cities').length >= 45);
  assert.equal(store.select('test').id, 'cities');
});
test('discounted evidence responds when the previously successful strategy stops winning', async () => {
  const store = new LearningStore(memory()); const late = [];
  for (let i = 0; i < 400; i++) {
    const v = store.select('test');
    await store.record(summary(`g${i}`, v.id, v.id === (i < 150 ? 'cities' : 'guarded')));
    if (i >= 340) late.push(v.id);
  }
  assert.ok(late.filter(v => v === 'guarded').length >= 40);
});
test('learning survives a browser-style restart and duplicate results are ignored', async () => {
  const storage = memory(), first = new LearningStore(storage);
  await first.record(summary('g1'));
  const second = new LearningStore(storage);
  assert.equal(second.data.total, 1);
  assert.equal(second.select('test').id, 'guarded');
  assert.equal(await second.record(summary('g1')), false);
  assert.equal(second.data.total, 1);
});
test('bounded storage retains summaries rather than growing with game count', async () => {
  const storage = memory(), store = new LearningStore(storage);
  for (let i = 0; i < 1500; i++) await store.record(summary(`g${i}`, 'baseline', i % 2 === 0, `context${i % 30}`));
  assert.equal(store.data.total, 1500);
  assert.equal(store.data.history.length, LIMITS.history);
  assert.equal(store.data.seen.length, LIMITS.seen);
  assert.equal(store.data.contexts.length, LIMITS.contexts);
  assert.ok(storage.getItem(LEARNING_KEY).length * 2 <= LIMITS.bytes);
  const copy = new LearningStore(memory()); await copy.import(store.export());
  assert.deepEqual(copy.data, store.data);
});
test('a storage failure preserves new learning in memory across subsequent selections', async () => {
  const store = new LearningStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  await store.record(summary('g1')); store.select('test'); await store.record(summary('g2'));
  assert.equal(store.data.total, 2); assert.match(store.warning, /Could not save/);
});
test('invalid or oversized imports leave existing learning unchanged', async () => {
  const store = new LearningStore(memory()); await store.record(summary('g1'));
  const before = store.export();
  await assert.rejects(store.import('{broken'));
  await assert.rejects(store.import('x'.repeat(LIMITS.bytes)));
  const bad = JSON.parse(before); bad.contexts[0].arms[0].reward = 99;
  await assert.rejects(store.import(JSON.stringify(bad)));
  assert.equal(store.export(), before);
});
test('corrupt saved data does not prevent playing with the initial strategy', () => {
  const storage = memory(); storage.setItem(LEARNING_KEY, '{broken');
  const store = new LearningStore(storage);
  assert.equal(store.select('test').id, 'baseline'); assert.ok(store.warning);
});
test('cross-tab records merge under an origin-wide lock', async () => {
  let tail = Promise.resolve();
  const locks = { request(name, fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; } };
  const storage = memory(), a = new LearningStore(storage, locks), b = new LearningStore(storage, locks);
  await Promise.all([a.record(summary('one')), b.record(summary('two'))]);
  const c = new LearningStore(storage); assert.equal(c.data.total, 2);
});
test('match types and user play styles keep separate strategy evidence', () => {
  const f = fixture();
  const base = contextKey(f.game, DEFAULTS);
  assert.notEqual(base, contextKey(f.game, { ...DEFAULTS, profile: 'cautious' }));
  assert.notEqual(base, contextKey(f.game, { ...DEFAULTS, nukes: false }));
  f.state.team = 'blue'; assert.notEqual(base, contextKey(f.game, DEFAULTS));
});
test('native winner interpretation uses client IDs and eligible team members', () => {
  const identity = { clientID: 'client', team: 'blue' };
  assert.equal(resultFor(['player', 'client'], identity), true);
  assert.equal(resultFor(['player', 'different-player-id'], identity), false);
  assert.equal(resultFor(['team', 'blue', 'other', 'client'], identity), true);
  assert.equal(resultFor(['team', 'blue', 'other'], identity), false);
  assert.equal(resultFor(['nation', 'Botland'], identity), false);
  assert.equal(resultFor(undefined, identity), null);
});
test('an ephemeral native win is captured once and the original method is restored', async () => {
  const f = fixture(), original = f.game.update;
  f.begin(); f.learner.command(); f.tick(999);
  assert.equal(f.end(['player', 'client']), 'original-result');
  // This erases the one-tick WinUpdate before the next controller poll.
  f.tick(1001); f.learner.inspect(); await f.learner.lastSave;
  assert.equal(f.store.data.total, 1); assert.equal(f.store.data.wins, 1);
  assert.equal(f.game.update, original);
});
test('FFA elimination trains a loss, but team elimination waits for the team result', async () => {
  const ffa = fixture(); ffa.begin(); ffa.learner.command(); ffa.tick(500, { alive: false });
  await ffa.learner.lastSave; assert.equal(ffa.store.data.total, 1); assert.equal(ffa.store.data.wins, 0);
  const team = fixture({ team: 'blue' }); team.begin(); team.learner.command(); team.tick(500, { alive: false });
  assert.equal(team.store.data.total, 0); team.learner.control(false);
  team.end(['team', 'blue', 'client'], 2000); await team.learner.lastSave;
  assert.equal(team.store.data.total, 1); assert.equal(team.store.data.wins, 1);
  assert.equal(team.store.data.history[0].coverage, 1);
});
test('brief pauses keep the same trial and final results are still observed while paused', async () => {
  const f = fixture(); const choice = f.begin(); f.learner.command(); f.tick(900);
  f.learner.control(false); f.tick(950);
  assert.equal(f.begin(), choice);
  f.end(['player', 'client']); await f.learner.lastSave;
  assert.equal(f.store.data.total, 1);
  assert.equal(f.store.data.history[0].coverage, .9);
});
test('substantial manual play and late takeovers do not train misleading results', async () => {
  const f = fixture(); f.begin(); f.learner.command(); f.tick(100); f.learner.control(false);
  f.end(['player', 'client']); await f.learner.lastSave;
  assert.equal(f.store.data.total, 0); assert.match(f.learner.message, /80%/);
  const late = fixture({ tick: 800 }); late.begin(); late.learner.command(); late.end(['player', 'client']);
  await late.learner.lastSave; assert.equal(late.store.data.total, 0);
});
test('cancelled games, early exits, and changed settings do not update the model', async () => {
  for (const mode of ['cancel', 'leave', 'settings']) {
    const f = fixture(); f.begin(); f.learner.command(); f.tick(900);
    if (mode === 'cancel') f.end(undefined);
    if (mode === 'leave') f.learner.close();
    if (mode === 'settings') {
      f.learner.poll(f.game, true, { ...DEFAULTS, profile: 'aggressive' }); f.end(['player', 'client']);
    }
    await f.learner.lastSave; assert.equal(f.store.data.total, 0, mode);
  }
});
test('observer errors do not alter the game method return value or original exceptions', () => {
  const game = { update(x) { if (x === 'bad') throw new Error('original'); return x; } };
  const restore = observeUpdates(game, () => { throw new Error('observer'); });
  assert.equal(game.update(42), 42); assert.throws(() => game.update('bad'), /original/); restore();
});
test('turning learning off uses the unchanged base tuning and retains saved scores', async () => {
  const f = fixture(); await f.store.record(summary('previous'));
  assert.equal(f.learner.begin(f.snapshot(), { ...DEFAULTS, learning: false }).id, 'baseline');
  assert.equal(f.learner.run, null); assert.equal(f.store.data.total, 1);
});
test('learned variants change actual attack decisions while respecting troop reserves', () => {
  const s = { tick: 100, cap: 100000, troops: 90000, incoming: [], enemies: [], outgoing: [], own: [],
    map: { fronts: [{ id: 0, tiles: [50] }] } };
  const adapter = {};
  const baseline = new Strategy(adapter), fast = new Strategy(adapter, DEFAULTS, VARIANTS.find(v => v.id === 'expander'));
  const guarded = new Strategy(adapter, DEFAULTS, VARIANTS.find(v => v.id === 'guarded'));
  assert.ok(guarded.reserves(s) > baseline.reserves(s));
  assert.ok(fast.attack(s, fast.reserves(s)).troops > baseline.attack(s, baseline.reserves(s)).troops);
  for (const tuning of VARIANTS) {
    const p = new Strategy(adapter, DEFAULTS, tuning), action = p.attack(s, p.reserves(s));
    assert.ok(s.troops - action.troops >= action.reserve);
    assert.ok(action.troops <= s.troops * .72);
  }
});

test('the real controller records commands, preserves a trial across pause, and learns the final result', async () => {
  const f = fixture();
  const adapter = { game: f.game, connect: () => true, sameGame: g => g === f.game,
    bridge: { supports: () => false }, confirmed: () => true,
    snapshot: async () => f.state.ended ? { inactive: 'Match finished' } : {
      ...f.snapshot(), troops: 80000, cap: 100000, gold: 0, tiles: 1500, config: f.game.config(),
      enemies: [], incoming: [], outgoing: [], own: [], hostileUnits: [], players: [],
      map: { fronts: [{ id: 0, tiles: [50] }], sites: [], shores: [] }
    }, execute: async (s, action) => ({ ...action, at: s.tick }) };
  const c = new PilotController(adapter, () => {}, { economy: false, navy: false, nukes: false }, f.learner);
  c.start(); await c.step(1000); const trial = f.learner.run;
  assert.equal(trial.commands, 1);
  f.tick(500); c.pause(); f.tick(600); c.start(); await c.step(2000);
  assert.equal(f.learner.run, trial); assert.equal(trial.commands, 2);
  f.end(['player', 'client']); await c.step(3000); await f.learner.lastSave;
  assert.equal(c.running, true); assert.equal(f.store.data.wins, 1);
  assert.equal(f.store.data.history[0].coverage, .9);
});

test('emergency stop detaches result observation and cancels a queued learning save', async () => {
  const f = fixture(); let commit;
  f.store.locks = { request: (name, fn) => new Promise(resolve => { commit = () => resolve(fn()); }) };
  const original = f.game.update;
  f.begin(); f.learner.command(); f.tick(100); f.end(['player', 'client']);
  assert.equal(typeof commit, 'function');
  f.learner.abort(); commit(); await f.learner.lastSave;
  assert.equal(f.store.data.total, 0); assert.equal(f.game.update, original);
  const g = fixture(); const update = g.game.update; g.begin(); g.learner.abort();
  assert.equal(g.game.update, update); g.end(['player', 'client']);
  assert.equal(g.store.data.total, 0);
});
