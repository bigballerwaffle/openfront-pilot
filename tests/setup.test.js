import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyStarter, spawnCandidates, validSpawn } from '../src/setup.js';
import { GameAdapter } from '../src/adapter.js';
import { PilotController } from '../src/controller.js';

function lobbyFixture() {
  let connected = false, ready = 0, joins = 0, last;
  const lobby = { gameID: 'ffa', numClients: 5, gameConfig: { gameMode: 'Free For All', maxPlayers: 20 } };
  const selector = { inLobby: false, viewerTrusted: false, lobbies: { games: { ffa: [lobby] } },
    validateAndJoin(l) { assert.equal(l, lobby); joins++; this.inLobby = true; } };
  const adapter = { document: { querySelector: () => selector }, connect: () => connected,
    game: { config: () => ({ gameConfig: () => ({ gameMode: 'Free For All' }) }) } };
  const bot = new LobbyStarter(adapter, u => { last = u; }, () => { ready++; });
  return { bot, selector, adapter, lobby, connect: () => { connected = true; },
    state: () => ({ ready, joins, last }) };
}
test('joins one available FFA through normal game validation and starts when its map loads', () => {
  const f = lobbyFixture(); f.bot.start(); f.bot.step(); f.bot.step();
  assert.equal(f.state().joins, 1); assert.equal(f.state().ready, 0);
  f.connect(); f.bot.step(); assert.equal(f.state().ready, 1); assert.equal(f.bot.active, false);
});
test('ignores full, team and trust-restricted lobbies', () => {
  for (const change of [{ maxPlayers: 5 }, { gameMode: 'Team' }, { trusted: true }]) {
    const f = lobbyFixture(); Object.assign(f.lobby.gameConfig, change); f.bot.start(); f.bot.step();
    assert.equal(f.state().joins, 0); assert.equal(f.bot.active, true);
  }
});
test('a pending native join stays armed without repeatedly dispatching the request', () => {
  const f = lobbyFixture(); let calls = 0;
  f.selector.validateAndJoin = () => { calls++; };
  f.bot.start(); f.bot.step(); f.bot.step();
  assert.equal(calls, 1); assert.equal(f.bot.active, true); assert.match(f.state().last.message, /Waiting/);
});
test('stop during lobby loading prevents automatic takeover', () => {
  const f = lobbyFixture(); f.bot.start(); f.bot.step(); f.bot.stop(); f.connect(); f.bot.step();
  assert.equal(f.state().ready, 0);
});
function spawnFixture() {
  let spawned = false, phase = true, tick = 0; const sent = [];
  const g = { width: () => 160, height: () => 120, x: t => t % 160, y: t => Math.floor(t / 160),
    ref: (x, y) => y * 160 + x, isValidCoord: (x, y) => x >= 0 && x < 160 && y >= 0 && y < 120,
    isLand: t => t % 160 >= 10, ownerID: () => 0, ticks: () => tick, gameID: () => 'spawn-test',
    myPlayer: () => ({ hasSpawned: () => spawned }), config: () => ({}), inSpawnPhase: () => phase };
  const adapter = new GameAdapter({ querySelector: () => ({ game: g }) }); adapter.game = g;
  adapter.bridge = { supports: () => true, emit: (kind, args) => sent.push({ kind, args }) };
  return { g, adapter, sent, spawn: () => { spawned = true; }, end: () => { phase = false; }, tick: n => { tick = n; } };
}
test('spawn selection favors port access with inland room and rejects occupied starting patches', () => {
  const { g } = spawnFixture();
  const best = spawnCandidates(g)[0]; assert.equal(validSpawn(g, best), true); assert.ok(g.x(best) >= 22 && g.x(best) <= 34);
  g.ownerID = () => 2; assert.equal(validSpawn(g, best), false); assert.deepEqual(spawnCandidates(g), []);
});
test('chooses once, waits for acknowledgement, and retains an uncrowded spawn', () => {
  const f = spawnFixture(); f.adapter.autoSpawn(() => true); f.adapter.autoSpawn(() => true);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].kind, 'spawn');
  f.spawn(); f.tick(100); f.adapter.autoSpawn(() => true); assert.equal(f.sent.length, 1);
});
test('spawn guards honor stop, phase end, random-spawn rules and spectator mode', () => {
  for (const mode of ['stop', 'ended', 'random', 'spectator']) {
    const f = spawnFixture();
    if (mode === 'ended') f.end();
    if (mode === 'random') f.g.config = () => ({ isRandomSpawn: () => true });
    if (mode === 'spectator') f.g.config = () => ({ isIntentionalSpectator: () => true });
    f.adapter.autoSpawn(() => mode !== 'stop'); assert.equal(f.sent.length, 0);
  }
});
test('background game-clock delays do not pause the controller', async () => {
  const game = {}, adapter = { document: { hidden: true }, game, connect: () => true, sameGame: () => true,
    snapshot: async () => ({ tick: 100 }) };
  const controller = new PilotController(adapter); controller.start(); controller.lastTick = 100; controller.tickTime = 0;
  await controller.step(60000); assert.equal(controller.running, true);
});
