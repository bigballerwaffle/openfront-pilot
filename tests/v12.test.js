import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyStarter } from '../src/setup.js';
import { AutoRequeue, consumeRequeue } from '../src/requeue.js';
import { Strategy } from '../src/strategy.js';
import { U } from '../src/common.js';

function lobbyFixture(join = () => {}) {
  let recovered = 0, joins = 0;
  const selector = { inLobby: false, lobbies: { games: { ffa: [
    { gameID: 'ffa', gameConfig: { gameMode: 'Free For All' } },
  ] } }, validateAndJoin: () => { joins++; return join(); } };
  const adapter = { connect: () => false, document: { querySelector: () => selector } };
  const bot = new LobbyStarter(adapter, () => {}, () => {}, () => { recovered++; });
  bot.start();
  return { bot, selector, counts: () => ({ recovered, joins }) };
}

test('unacknowledged joins time out and retry without flooding requests', () => {
  const f = lobbyFixture();
  f.bot.step(0); f.bot.step(89999);
  assert.equal(f.counts().joins, 1);
  f.bot.step(90000); f.bot.step(94999);
  assert.equal(f.counts().joins, 1);
  f.bot.step(95000); assert.equal(f.counts().joins, 2);
});

test('stuck lobby flags recover home after the loading deadline', () => {
  const f = lobbyFixture(); f.bot.step(0); f.selector.inLobby = true;
  f.bot.step(90000); assert.equal(f.counts().recovered, 1);
  f.bot.stop(); f.bot.step(200000); assert.equal(f.counts().recovered, 1);
});

test('failed joins prefer another eligible lobby', () => {
  const f = lobbyFixture(() => false);
  f.selector.lobbies.games.ffa.push({ gameID: 'other', gameConfig: { gameMode: 'Free For All' } });
  f.bot.step();
  let selected;
  f.selector.validateAndJoin = lobby => { selected = lobby.gameID; };
  f.bot.step(f.bot.retryAt);
  assert.equal(selected, 'other');
});

test('thrown, refused and rejected joins are retried after backoff', async () => {
  for (const join of [() => { throw Error('offline'); }, () => false, () => Promise.reject(Error('offline'))]) {
    const f = lobbyFixture(join); f.bot.step(); await Promise.resolve();
    assert.equal(f.bot.attempted, null);
    f.bot.step(f.bot.retryAt - 1); assert.equal(f.counts().joins, 1);
    f.bot.step(f.bot.retryAt); assert.equal(f.counts().joins, 2);
    await Promise.resolve(); f.bot.stop();
  }
});

test('late join rejection cannot modify a restarted or stopped attempt', async () => {
  let reject;
  const f = lobbyFixture(() => new Promise((_, no) => { reject = no; }));
  f.bot.step(); const oldReject = reject;
  f.bot.stop(); f.bot.start(); f.bot.step();
  oldReject(Error('old')); await Promise.resolve();
  assert.equal(f.bot.attempted, 'ffa');
  f.bot.stop(); reject(Error('stopped')); await Promise.resolve();
  assert.equal(f.bot.active, false);
});

function sessionFixture() {
  const data = new Map(); let departures = 0;
  const storage = { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  const g = { config: () => ({}), inSpawnPhase: () => false, myPlayer: () => null };
  const bot = new AutoRequeue({ game: g, sameGame: game => game === g }, storage, async () => {}, () => { departures++; });
  return { g, bot, storage, departures: () => departures };
}

test('unspawnable sessions leave after a grace period and resume once', async () => {
  for (const type of ['missing', 'unspawned', 'spectator']) {
    const f = sessionFixture();
    if (type === 'unspawned') f.g.myPlayer = () => ({ hasSpawned: () => false });
    if (type === 'spectator') {
      f.g.config = () => ({ isIntentionalSpectator: () => true });
      f.g.inSpawnPhase = () => true;
    }
    assert.equal(await f.bot.step(() => true, 0), false);
    assert.equal(await f.bot.step(() => true, 14999), false);
    assert.equal(await f.bot.step(() => true, 15000), true);
    await f.bot.step(() => true, 16000);
    assert.equal(f.departures(), 1);
    assert.equal(consumeRequeue(f.storage), true);
    assert.equal(consumeRequeue(f.storage), false);
  }
});

test('spawn loading, catching up, replay and Stop do not cause departure', async () => {
  for (const mode of ['spawn', 'catchup', 'replay', 'stop']) {
    const f = sessionFixture();
    if (mode === 'spawn') f.g.inSpawnPhase = () => true;
    if (mode === 'catchup') f.g.isCatchingUp = () => true;
    if (mode === 'replay') f.g.config = () => ({ isReplay: () => true });
    await f.bot.step(() => mode !== 'stop', 0);
    await f.bot.step(() => mode !== 'stop', 999999);
    assert.equal(f.departures(), 0);
  }
});

test('player appearing during grace clears spectator timeout', async () => {
  const f = sessionFixture(); await f.bot.step(() => true, 0);
  f.g.myPlayer = () => ({ hasSpawned: () => true, isAlive: () => true });
  await f.bot.step(() => true, 15000); assert.equal(f.departures(), 0);
  f.g.myPlayer = () => null;
  await f.bot.step(() => true, 16000); assert.equal(f.departures(), 0);
});

test('Stop while finalizing a stranded session prevents departure', async () => {
  const f = sessionFixture(); let release;
  f.bot.finish = () => new Promise(resolve => { release = resolve; });
  await f.bot.step(() => true, 0);
  const pending = f.bot.step(() => true, 15000);
  f.bot.stop(); release(); await pending;
  assert.equal(f.departures(), 0);
  assert.equal(consumeRequeue(f.storage), false);
});

function navalFixture() {
  const state = { tick: 100, game: { ticksSinceStart: () => 100 }, cap: 100000, troops: 70000,
    enemies: [], players: [], incoming: [], outgoing: [], own: [], immunized: false,
    map: { fronts: [{ id: 0 }], shores: [1] } };
  const bot = new Strategy({ bridge: { supports: () => true } }, { diplomacy: false, nukes: false });
  bot.samReady = () => {}; bot.counterattack = () => null; bot.reinforce = () => null;
  bot.attack = () => ({ kind: 'attack', targetID: null });
  bot.investment = async () => ({ kind: 'build' });
  bot.landing = async () => ({ kind: 'boat' });
  return { state, bot };
}

test('early naval opportunity beats routine building despite an open land frontier', async () => {
  const { state, bot } = navalFixture();
  assert.equal((await bot.choose(state)).kind, 'boat');
  bot.options.economy = false;
  assert.equal((await bot.choose(state)).kind, 'boat');
});

test('early naval priority retains immunity, reserves, cooldown and single-front guards', async () => {
  for (const mode of ['disabled', 'immune', 'wave', 'transport', 'reserve', 'cooldown', 'late']) {
    const { state, bot } = navalFixture();
    if (mode === 'disabled') bot.options.navy = false;
    if (mode === 'immune') state.immunized = true;
    if (mode === 'wave') state.outgoing = [{ targetID: 0 }];
    if (mode === 'transport') state.own = [{ type: U.transport }];
    if (mode === 'reserve') state.troops = 1000;
    if (mode === 'cooldown') bot.last.set('boat', state.tick);
    if (mode === 'late') state.game.ticksSinceStart = () => 6000;
    assert.notEqual((await bot.choose(state)).kind, 'boat', mode);
  }
});

test('cancelled asynchronous naval planning cannot return an action', async () => {
  const { state, bot } = navalFixture(); let active = true;
  bot.landing = async () => { active = false; return { kind: 'boat' }; };
  assert.equal(await bot.choose(state, () => active), null);
});
