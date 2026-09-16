import test from 'node:test';
import assert from 'node:assert/strict';
import { Strategy } from '../src/strategy.js';
import { cityFactoryConnections, factoryConnections } from '../src/opportunities.js';
import { U } from '../src/common.js';

const player = (id) => ({
  id: () => String(id), smallID: () => id, type: () => 'HUMAN',
  name: () => String(id), troops: () => 30000, isPlayer: () => true,
  isAlive: () => true, isAlliedWith: () => false, isOnSameTeam: () => false,
});
function fixture() {
  const me = player(1);
  const g = {
    x: t => t % 400, y: t => Math.floor(t / 400), ref: (x,y) => y * 400 + x,
    isValidCoord: (x,y) => x >= 0 && y >= 0 && x < 400 && y < 400,
    ownerID: () => 1, isLand: () => true, terrainType: () => 0, units: () => [],
    euclideanDistSquared: (a,b) => (g.x(a)-g.x(b)) ** 2 + (g.y(a)-g.y(b)) ** 2,
  };
  const s = { game: g, me, config: { maxTroops: () => 200000 }, tick: 10000,
    troops: 80000, cap: 100000, own: [], hostileUnits: [], enemies: [], players: [me],
    incoming: [], outgoing: [], map: { fronts: [], sites: [], shores: [] } };
  const bot = new Strategy({ bridge: { supports: () => true } });
  return { s, g, me, bot };
}

test('soonest useful renewal beats incoming rejection spam and a recent new offer', () => {
  const { s, me, bot } = fixture();
  const a = player(2), b = player(3), spam = player(4);
  spam.isRequestingAllianceWith = () => true;
  me.isAlliedWith = p => [2,3].includes(p.smallID());
  me.alliances = () => [{ other: '2', expiresAt: 10200 }, { other: '3', expiresAt: 10020 }];
  s.players.push(a,b,spam);
  s.map.fronts = [2,3].map(id => ({ id, count: 20, tiles: [id] }));
  bot.last.set('alliance', s.tick - 1);
  const action = bot.diplomacy(s);
  assert.equal(action.kind, 'extend'); assert.equal(action.targetID, '3');
  bot.record(action, s.tick);
  assert.notEqual(bot.diplomacy(s)?.kind, 'extend');
  s.tick += 25;
  assert.equal(bot.diplomacy(s).targetID, '2');
});

test('renewal still excludes expired, distant, and campaign-target alliances', () => {
  const { s, me, bot } = fixture();
  s.players.push(player(2),player(3),player(4));
  me.isAlliedWith = () => true;
  me.alliances = () => [
    { other: '2', expiresAt: 9999 }, { other: '3', expiresAt: 10020 },
    { other: '4', expiresAt: 10010 },
  ];
  s.map.fronts = [2,3].map(id => ({ id, count: 20, tiles: [id] }));
  bot.focus = '3';
  assert.equal(bot.diplomacy(s), null);
  s.config.disableAlliances = () => true;
  assert.equal(bot.diplomacy(s), null);
});

test('city network opportunity needs a finished own factory and an owned land corridor', () => {
  const { s, g } = fixture(), tile = g.ref(100,100);
  s.own = [{ type: U.factory, tile: g.ref(180,100), level: 2 }];
  assert.equal(cityFactoryConnections(s,tile), 2);
  assert.equal(factoryConnections(s,tile), 0);
  s.own[0].building = true; assert.equal(cityFactoryConnections(s,tile), 0);
  s.own[0].building = false;
  g.ownerID = t => g.x(t) === 140 ? 2 : 1;
  assert.equal(cityFactoryConnections(s,tile), 0);
  g.ownerID = () => 1; g.isLand = t => g.x(t) !== 140;
  assert.equal(cityFactoryConnections(s,tile), 0);
  g.isLand = () => true; s.config.trainStationMaxRange = () => 60;
  assert.equal(cityFactoryConnections(s,tile), 0);
});

test('equally safe city sites prefer extending an own factory network without forcing stacking', () => {
  const { s, g, bot } = fixture();
  const disconnected = g.ref(40,100), connected = g.ref(180,100);
  s.own = [{ type: U.factory, tile: g.ref(280,100), level: 2 }];
  s.map.sites = [disconnected, connected];
  assert.equal(bot.sites(s,U.city)[0], connected);
  s.own[0].building = true;
  assert.equal(bot.sites(s,U.city)[0], disconnected);
});

function landingFixture(defended = false) {
  const f = fixture(), { s, g, me, bot } = f;
  const target = defended ? player(2) : { id: () => null, smallID: () => 0, isPlayer: () => false };
  const shore = g.ref(80,150);
  g.isLand = t => g.x(t) <= 80 || g.x(t) >= 100;
  g.owner = t => g.x(t) <= 80 ? me : target;
  g.ownerID = t => g.owner(t).smallID();
  g.neighbors = t => [t-1,t+1,t-400,t+400];
  s.map.shores = [shore];
  bot.adapter.buildOption = async () => ({ canBuild: shore });
  return f;
}

test('wilderness landings use a small foothold, bounded by available reserves', async () => {
  const { s, bot } = landingFixture();
  assert.equal((await bot.landing(s,30000,()=>true)).troops, 8000);
  assert.equal((await bot.landing(s,79500,()=>true)).troops, 500);
  assert.equal(await bot.landing(s,79950,()=>true), null);
  assert.equal(await bot.landing(s,30000,()=>false), null);
});

test('defended landings retain their concentrated invasion force', async () => {
  const { s, bot } = landingFixture(true);
  const action = await bot.landing(s,20000,()=>true);
  assert.ok(action); assert.equal(action.troops, Math.floor(Math.min(60000,80000 * bot.tuning.attack)));
});

test('small transports still refuse hostile warship coverage and blocked crossings', async () => {
  const { s, g, bot } = landingFixture();
  g.units = () => [{ isActive: () => true, type: () => U.warship, tile: () => g.ref(90,150), owner: () => player(2) }];
  assert.equal(await bot.landing(s,30000,()=>true), null);
  g.units = () => []; g.isLand = () => true;
  assert.equal(await bot.landing(s,30000,()=>true), null);
});
