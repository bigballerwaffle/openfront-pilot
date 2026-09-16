import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningStore, validateModel } from '../src/learning.js';
import { unitsOf, U } from '../src/common.js';
import { offensiveBusy } from '../src/safety.js';
import { Strategy } from '../src/strategy.js';
import { GameAdapter } from '../src/adapter.js';
import { sampleRegions, compactnessScore } from '../src/geometry.js';

test('trade ships never count as warships or active troop transports even with an ignored client filter', () => {
  const trade = { type: () => 'Trade Ship' }, warship = { type: () => U.warship }, transport = { type: () => U.transport };
  const view = { units: () => [trade, warship, transport], outgoingAttacks: () => [] };
  assert.deepEqual(unitsOf(view, U.warship), [warship]);
  view.units = () => [trade, warship]; assert.equal(offensiveBusy(view), false);
  view.units = () => [trade, transport]; assert.equal(offensiveBusy(view), true);
});
test('SAM eligibility waits 90 game-clock seconds after a silo threat, resets when gone', () => {
  const bot = new Strategy({}), s = { tick: 100, hostileUnits: [{ type: U.silo }] };
  assert.equal(bot.samReady(s), false);
  s.tick = 999; assert.equal(bot.samReady(s), false);
  s.tick = 1000; assert.equal(bot.samReady(s), true);
  s.hostileUnits = []; assert.equal(bot.samReady(s), false);
  s.hostileUnits = [{ type: U.silo }]; assert.equal(bot.samReady(s), false);
});
test('dispatch refuses to accept or renew alliances with AI or unknown player types', async () => {
  for (const type of ['BOT', 'NATION', 'UNKNOWN']) for (const kind of ['alliance', 'extend']) {
    const me = { isAlive: () => true }, target = { id: () => 'enemy', isAlive: () => true, type: () => type };
    const game = { myPlayer: () => me, players: () => [target], inSpawnPhase: () => false };
    const adapter = new GameAdapter({ querySelector: () => ({ game }) }); adapter.game = game;
    adapter.bridge = { supports: () => true, emit: () => assert.fail('AI alliance emitted') };
    assert.equal(await adapter.execute({ game }, { kind, targetID: 'enemy' }, () => true), null);
  }
});
test('shape scoring prefers filling a concavity over extending a long tail', () => {
  const s = { tiles: 100, me: { smallID: () => 1 }, map: { regions: new Map([
    [1, { n: 100, x: 10, y: 10, moment: 30 }],
    [2, { n: 20, x: 11, y: 10, moment: 4 }],
    [3, { n: 20, x: 30, y: 10, moment: 20 }]
  ]) } };
  assert.ok(compactnessScore(s, { id: 2, area: 20 }) > compactnessScore(s, { id: 3, area: 20 }));
  assert.equal(compactnessScore(s, { id: 4, area: 20 }), 0);
  const g = { width: () => 10, height: () => 10, ref: (x,y) => y*10+x, ownerID: () => 1, isLand: () => true };
  const r = sampleRegions(g).get(1); assert.equal(r.n, 100); assert.equal(r.x, 4.5); assert.equal(r.y, 4.5);
});
test('recent win rate uses actual sample size, migrates old backups, and stays bounded', async () => {
  const store = new LearningStore(); assert.equal(store.winRate(20).percent, null);
  for (let i = 0; i < 1005; i++) await store.record({ id: 'game'+i, context: 'test', variant: 'baseline', win: i % 2 === 0, ticks: 1000, commands: 20, coverage: 1 });
  assert.deepEqual(store.winRate(3), { requested: 3, games: 3, wins: 2, percent: 2/3*100 });
  assert.equal(store.winRate(1000).games, 1000); assert.ok(store.export().length * 2 < 65536);
  const old = JSON.parse(store.export()); delete old.outcomes;
  const migrated = validateModel(JSON.stringify(old)); assert.equal(migrated.outcomes.length, 24);
  await store.import(JSON.stringify(old)); assert.equal(store.winRate(100).games, 24);
});
