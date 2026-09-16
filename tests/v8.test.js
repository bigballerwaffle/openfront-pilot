import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainRank, factoryConnections, captureValue, strikeValue } from '../src/opportunities.js';
import { Strategy } from '../src/strategy.js';
import { spawnCandidates } from '../src/setup.js';
import { U } from '../src/common.js';

function map() {
  return { width: () => 400, height: () => 400,
    x: t => t % 400, y: t => Math.floor(t / 400), ref: (x, y) => y * 400 + x,
    isValidCoord: (x,y) => x >= 0 && y >= 0 && x < 400 && y < 400,
    isLand: () => true, ownerID: () => 1,
    terrainType: () => 0,
    euclideanDistSquared(a,b) { return (this.x(a)-this.x(b)) ** 2 + (this.y(a)-this.y(b)) ** 2; } };
}
function state(g = map()) {
  return { game: g, tick: 3000, troops: 100000, cap: 100000, tiles: 1000, gold: 1000000,
    me: { id: () => 'me', smallID: () => 1, type: () => 'HUMAN' },
    config: {}, own: [], hostileUnits: [], enemies: [], players: [], incoming: [], outgoing: [],
    map: { fronts: [], shores: [], sites: [] } };
}
function enemy(id, g) { return { id, playerID: String(id), type: 'NATION', name: String(id), troops: 1000, area: 100,
  count: 10, tiles: [g.ref(100,100)], border: [g.ref(99,100)] }; }

test('named and numeric terrain agree, and an otherwise equivalent plains spawn beats mountains', () => {
  assert.equal(terrainRank(0), terrainRank('Plains')); assert.equal(terrainRank(2), terrainRank('Mountain'));
  const g = map(); g.ownerID = () => 0; g.terrainType = t => g.x(t) < 200 ? 2 : 0;
  const best = spawnCandidates(g)[0]; assert.ok(g.x(best) > 220);
});
test('capture value tips comparable conquests toward infrastructure without abandoning the current nation', () => {
  const s = state(), a = enemy(2, s.game), b = enemy(3, s.game);
  s.enemies = [a,b]; s.hostileUnits = [{ type: U.city, owner: 3, tile: b.tiles[0], level: 3 }];
  const bot = new Strategy({}, { economy: false, navy: false, nukes: false, diplomacy: false });
  assert.ok(captureValue(s,b,{gain:100}) > captureValue(s,a,{gain:100}));
  assert.equal(bot.attack(s, 20000).targetID, '3');
  bot.focus = '2'; assert.equal(bot.attack(s, 20000).targetID, '2');
});
test('factory connections require completed own stations, range, and continuous land', () => {
  const s = state(), g = s.game, tile = g.ref(100,100);
  s.own = [{ type: U.city, level: 2, tile: g.ref(150,100) }];
  assert.equal(factoryConnections(s,tile), 2);
  g.isLand = t => g.x(t) !== 125; assert.equal(factoryConnections(s,tile), 0);
  g.isLand = () => true; g.ownerID = t => g.x(t) === 125 ? 2 : 1; assert.equal(factoryConnections(s,tile), 0);
  g.ownerID = () => 1; s.own[0].building = true; assert.equal(factoryConnections(s,tile), 0);
  s.own[0].building = false; s.config.trainStationMaxRange = () => 40; assert.equal(factoryConnections(s,tile), 0);
});
test('isolated factories are skipped for cities rather than stalling construction', async () => {
  const s = state(), g = s.game;
  s.own = [{ type: U.city, level: 3, tile: g.ref(10,10) }];
  const bot = new Strategy({ buildOption: async (s,type,tile) => ({ type, cost: 100000, canBuild: tile, canUpgrade: false }) }, { nukes: false, navy: false });
  bot.sites = () => [g.ref(200,200)];
  assert.equal((await bot.investment(s,20000,()=>true)).unit, U.city);
});
test('hydrogen chooses a valuable cluster but rejects it if SAM protection appears', () => {
  const s = state(), g = s.game; g.ownerID = () => 2; g.ticksSinceStart = () => 3000;
  const e = { ...enemy(2,g), type: 'HUMAN' }; s.enemies = [e];
  s.own = [{ type: U.city, level: 4 }, { type: U.factory, level: 3 }, { type: U.silo, level: 1 }];
  const weak = g.ref(50,50), rich = g.ref(280,280);
  s.hostileUnits = [{ type: U.defense, tile: weak, owner: 2, level: 1 },
    { type: U.city, tile: rich, owner: 2, level: 10 }, { type: U.factory, tile: rich+1, owner: 2, level: 3 }];
  const bot = new Strategy({ nukeSafe: () => true });
  assert.ok(strikeValue(s,rich,e) > strikeValue(s,weak,e));
  assert.ok(g.euclideanDistSquared(bot.hydrogenCandidate(s).tile,rich) <= 80 ** 2);
  s.hostileUnits.push({ type: U.sam, tile: rich, level: 1, owner: 2 });
  assert.ok(g.euclideanDistSquared(bot.hydrogenCandidate(s).tile,rich) > 165 ** 2);
  bot.adapter.nukeSafe = () => false; assert.equal(bot.hydrogenCandidate(s), null);
});

test('factory dispatch rechecks the station after the game validates the build', async () => {
  const { GameAdapter } = await import('../src/adapter.js');
  const s = state(), g = s.game, station = g.ref(150,100), tile = g.ref(100,100);
  let captured = false;
  const city = { id: () => 9, type: () => U.city, tile: () => station, level: () => 1, owner: () => s.me };
  Object.assign(s.me, { isAlive: () => true, gold: () => 1000000, units: () => [city] });
  Object.assign(g, { myPlayer: () => s.me, inSpawnPhase: () => false, ownerID: t => captured && t === station ? 2 : 1 });
  const adapter = new GameAdapter({ querySelector: () => ({ game: g }) }); adapter.game = g;
  adapter.bridge = { supports: () => true, emit: () => assert.fail('Disconnected factory dispatched') };
  adapter.buildOption = async () => { captured = true; return { type: U.factory, canBuild: tile, canUpgrade: false, cost: 100000 }; };
  assert.equal(await adapter.execute(s, { kind: 'build', unit: U.factory, tile }, () => true), null);
});
