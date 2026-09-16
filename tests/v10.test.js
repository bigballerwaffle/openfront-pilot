import test from 'node:test';
import assert from 'node:assert/strict';
import { Strategy } from '../src/strategy.js';
import { GameAdapter } from '../src/adapter.js';
import { U } from '../src/common.js';
import { spawnCrowding } from '../src/setup.js';

const player = (id, type = 'HUMAN', troops = 30000) => ({
  id: () => String(id), smallID: () => id, type: () => type, troops: () => troops,
  name: () => String(id), isPlayer: () => true, isAlive: () => true,
  isAlliedWith: () => false, isOnSameTeam: () => false
});
function fixture() {
  const me = player(1), human = player(2), ai = player(3, 'NATION', 10000);
  const g = { x: t => t % 400, y: t => Math.floor(t / 400), ref: (x, y) => y * 400 + x,
    width: () => 400, height: () => 240, isValidCoord: (x, y) => x >= 0 && y >= 0 && x < 400 && y < 240,
    ownerID: t => t % 400 >= 200 ? 2 : 1, isLand: () => true, terrainType: () => 'Plains',
    ticksSinceStart: () => 1000, units: () => [],
    euclideanDistSquared: (a, b) => (g.x(a) - g.x(b)) ** 2 + (g.y(a) - g.y(b)) ** 2 };
  const enemy = p => ({ id: p.smallID(), playerID: p.id(), raw: p, type: p.type(), name: p.name(),
    troops: p.troops(), area: 500, count: 20, tiles: [g.ref(200, 100)], border: [g.ref(199, 100)] });
  const s = { game: g, config: { maxTroops: p => p === me ? 100000 : 180000 }, me,
    troops: 80000, cap: 100000, gold: 1000000, tiles: 2000, tick: 1000,
    enemies: [enemy(human), enemy(ai)], players: [me, human, ai], own: [], hostileUnits: [], incoming: [], outgoing: [],
    map: { fronts: [], sites: [g.ref(100, 100)], shores: [], center: { x: 100, y: 100 } } };
  const adapter = { bridge: { supports: () => true }, buildOption: async (_, type, tile) => ({
    type, cost: 100000, canBuild: tile, canUpgrade: false }) };
  const bot = new Strategy(adapter, { diplomacy: false, navy: false, nukes: false });
  return { s, g, me, human, ai, enemy, bot };
}
test('human pushes get defense posts; only structure danger triggers immediate counters', async () => {
  const { s, g, bot } = fixture();
  s.incoming = [{ attackerID: 2, troops: 12000 }];
  assert.equal((await bot.choose(s)).unit, U.defense);
  s.own = [{ type: U.city, tile: g.ref(100, 100) }];
  assert.equal(bot.counterattack(s), null);
  s.own[0].tile = g.ref(175, 100);
  assert.equal((await bot.choose(s)).counter, true);
  s.incoming = [{ attackerID: 3, troops: 12000 }];
  assert.equal(bot.counterattack(s), null);
});
test('a huge push can fund more than two post levels and release the entire gold balance', async () => {
  const { s, g, bot } = fixture();
  s.incoming = [{ attackerID: 2, troops: 60000 }];
  s.gold = 100000;
  s.own = [{ type: U.defense, level: 2, tile: g.ref(80, 180) }];
  bot.last.set(U.defense, s.tick - 50);
  const action = await bot.choose(s);
  assert.equal(action.unit, U.defense); assert.equal(action.goldReserve, 0);
  assert.ok(g.x(action.tile) < 185 && g.x(action.tile) >= 170);
});
test('opening capacity pressure takes affordable expansion before routine purchases', async () => {
  const { s, bot } = fixture();
  s.troops = 87000; s.enemies = []; s.players = [];
  s.map.fronts = [{ id: 0, tiles: [0] }];
  bot.focus = 'old-unreachable-target';
  const action = await bot.choose(s);
  assert.equal(action.kind, 'attack'); assert.equal(action.targetID, null);
  assert.ok(action.troops <= s.troops - action.reserve);
  s.game.ticksSinceStart = () => 6000;
  assert.equal((await bot.choose(s)).kind, 'build');
});
test('early reinforcement releases capacity before the old 92 percent threshold', () => {
  const { s, bot } = fixture();
  s.troops = 87000; s.enemies = []; s.map.fronts = [{ id: 0, tiles: [0] }];
  s.outgoing = [{ targetID: 0, troops: 20000 }];
  assert.ok(bot.reinforce(s, 30000)?.troops > 0);
  s.game.ticksSinceStart = () => 6000;
  assert.equal(bot.reinforce(s, 30000), null);
});
test('opening conquests prefer broad contact even before region sampling resolves tiny states', () => {
  const { s, bot, enemy } = fixture();
  s.enemies = [enemy(player(3, 'NATION', 10000)), enemy(player(4, 'NATION', 10000))];
  s.enemies[0].count = 4; s.enemies[1].count = 35;
  assert.equal(bot.attack(s, 30000).targetID, '4');
});
test('a stronger sole human neighbor can be offered an alliance without a conquest target', () => {
  const { s, bot } = fixture(); bot.options.diplomacy = true;
  s.enemies = [s.enemies[0]];
  const a = bot.diplomacy(s);
  assert.equal(a.kind, 'alliance'); assert.equal(a.targetID, '2');
});
test('diplomacy continues during reinforcement and renews useful late-game allies', async () => {
  const { s, bot } = fixture(); bot.options.diplomacy = true; bot.focus = '3';
  s.outgoing = [{ targetID: 3, troops: 1000 }];
  s.tick = 10000;
  assert.equal((await bot.choose(s)).kind, 'alliance');
  s.me.isAlliedWith = p => p.id() === '2';
  s.me.alliances = () => [{ other: '2', expiresAt: 10050 }];
  assert.equal((await bot.choose(s)).kind, 'extend');
});
test('attacking one human leaves all other meaningful neighboring flanks eligible', () => {
  const { s, bot, enemy } = fixture(); bot.focus = '2';
  s.players = [s.me, ...[2, 4, 5, 6, 7].map(id => player(id))];
  s.enemies = s.players.slice(1).map(enemy);
  const requested = new Set(); s.me.isRequestingAllianceWith = p => requested.has(p.id());
  for (let i = 0; i < 4; i++) {
    const a = bot.diplomacy(s); assert.equal(a.kind, 'alliance'); assert.notEqual(a.targetID, '2');
    requested.add(a.targetID); bot.record(a, s.tick); s.tick += 30;
  }
  assert.equal(requested.size, 4); assert.equal(bot.diplomacy(s), null);
});
test('crowding can trigger more than three spawn relocations and stops at phase end', () => {
  const { g, me } = fixture(); let tile = g.ref(200, 120), tick = 0, phase = true, sent = 0;
  const neighbors = [];
  me.hasSpawned = () => true; me.spawnTile = () => tile;
  Object.assign(g, { ownerID: () => 0, myPlayer: () => me, players: () => [me, ...neighbors],
    ticks: () => tick, config: () => ({}), inSpawnPhase: () => phase, gameID: () => 'dynamic' });
  const adapter = new GameAdapter({ querySelector: () => ({ game: g }) }); adapter.game = g;
  adapter.bridge = { supports: () => true, emit: (_, args) => { tile = args[0]; sent++; } };
  for (let i = 0; i < 5; i++) {
    neighbors.length = 0;
    for (const id of [2, 3]) { const p = player(id); p.hasSpawned = () => true; const near = tile + id; p.spawnTile = () => near; neighbors.push(p); }
    assert.equal(spawnCrowding(g, tile).count, 2);
    tick += 25; adapter.autoSpawn(() => true);
    assert.equal(sent, i + 1);
    assert.equal(spawnCrowding(g, tile).count, 0);
  }
  phase = false; tick += 25; adapter.autoSpawn(() => true); assert.equal(sent, 5);
  phase = true; tick += 25; adapter.autoSpawn(() => false); assert.equal(sent, 5);
});
test('counter dispatch cancels if structures are no longer threatened after validation', async () => {
  const { s, g, me, human } = fixture();
  Object.assign(me, { units: () => [{ id: () => 1, type: () => U.city, tile: () => g.ref(100, 100), level: () => 1, owner: () => me }],
    outgoingAttacks: () => [], incomingAttacks: () => [{ attackerID: 2, troops: 10000 }], actions: async () => ({ canAttack: true }) });
  Object.assign(g, { myPlayer: () => me, owner: () => human, players: () => s.players, config: () => s.config,
    inSpawnPhase: () => false });
  const adapter = new GameAdapter({ querySelector: () => ({ game: g }) }); adapter.game = g;
  adapter.bridge = { emit: () => assert.fail('should not counter') };
  assert.equal(await adapter.execute(s, { kind: 'attack', counter: true, targetID: '2', tile: g.ref(200, 100), troops: 10000, reserve: 10000 }, () => true), null);
});
