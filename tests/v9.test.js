import test from 'node:test';
import assert from 'node:assert/strict';
import { TerritoryReward, matchReward } from '../src/reward.js';
import { LearningStore, validateModel, VARIANTS } from '../src/learning.js';
import { MatchLearning } from '../src/match-learning.js';
import { DEFAULTS } from '../src/strategy.js';

test('territory rewards stronger losses, but every win outranks every loss', () => {
  const low = { peakShare: .05, averageShare: .03 }, high = { peakShare: .5, averageShare: .25 };
  assert.ok(matchReward(false, high) > matchReward(false, low));
  assert.ok(matchReward(true) > matchReward(false, { peakShare: 1, averageShare: 1 }));
  assert.equal(matchReward(true, { peakShare: 1, averageShare: 1 }), 0.9999999999999999);
});
test('time-weighted territory survives elimination and uses original land, with no duration bonus', () => {
  let tiles = 100, land = 1000;
  const player = { numTilesOwned: () => tiles }, r = new TerritoryReward({ numLandTiles: () => land }, player);
  tiles = 300; r.observe(player, 10, true);
  land = 500; r.observe(player, 30, true);
  assert.equal(r.summary().peakShare, .3); assert.equal(r.summary().averageShare, .25);
  tiles = 0; r.observe(player, 0, true);
  assert.equal(r.summary().peakShare, .3);
  const constant = new TerritoryReward({ numLandTiles: () => 1000 }, { numTilesOwned: () => 200 });
  constant.observe({ numTilesOwned: () => 200 }, 10, true); const before = matchReward(false, constant.summary());
  constant.observe({ numTilesOwned: () => 200 }, 10000, true); assert.equal(matchReward(false, constant.summary()), before);
});
test('paused intervals and missing telemetry do not manufacture territory reward', () => {
  const player = { numTilesOwned: () => 100 }, r = new TerritoryReward({ numLandTiles: () => 1000 }, player);
  r.observe(player, 50, true); r.observe({ numTilesOwned: () => 900 }, 500, false);
  assert.equal(r.summary().peakShare, .1); assert.equal(r.summary().observedTicks, 50);
  assert.equal(new TerritoryReward({},player).summary(), null);
});
test('partial reward changes strategy scores while wins and recent win rate stay factual', async () => {
  const store = new LearningStore();
  const summary = { id: 'loss', context: 'reward-test', variant: 'baseline', win: false, ticks: 100, commands: 2, coverage: 1,
    reward: .125, territory: { peakShare: .5, averageShare: .25, observedTicks: 100 } };
  await store.record(summary);
  assert.equal(store.data.contexts[0].arms[0].reward, .125);
  assert.equal(store.winRate(20).percent, 0); assert.equal(store.data.wins, 0);
  assert.deepEqual(validateModel(store.export()), store.data);
  const bad = JSON.parse(store.export()); bad.history[0].territory.averageShare = 2;
  assert.throws(() => validateModel(JSON.stringify(bad)));
  await assert.rejects(store.record({ ...summary, id: 'bad', reward: NaN }));
});
test('old backups retain outcomes and original rewards without invented territory', async () => {
  const store = new LearningStore();
  await store.record({ id: 'old', context: 'old', variant: 'baseline', win: true, ticks: 100, commands: 2, coverage: 1 });
  const old = JSON.parse(store.export()); delete old.history[0].reward; delete old.history[0].territory;
  const migrated = validateModel(JSON.stringify(old));
  assert.equal(migrated.history[0].reward, 1); assert.equal(migrated.history[0].territory, null);
  assert.equal(migrated.wins, 1);
});
test('completed losing match records pre-defeat land progress through the real observer', async () => {
  let tick = 0, tiles = 100, alive = true;
  const me = { clientID: () => 'c', numTilesOwned: () => tiles, isAlive: () => alive, team: () => null };
  const g = { gameID: () => 'g', myPlayer: () => me, ticks: () => tick, ticksSinceStart: () => tick,
    numLandTiles: () => 1000, config: () => ({ gameConfig: () => ({}) }), gameOver: () => false,
    update(v) { tick = v.tick; tiles = v.tiles; alive = v.alive; } };
  const store = new LearningStore(), learner = new MatchLearning(store);
  learner.begin({ game: g, me, tick }, DEFAULTS); learner.command();
  g.update({ tick: 50, tiles: 300, alive: true });
  g.update({ tick: 100, tiles: 0, alive: false }); await learner.lastSave;
  const h = store.data.history[0]; assert.equal(h.win, false); assert.equal(h.territory.peakShare, .3);
  assert.equal(h.territory.averageShare, .2); assert.ok(Math.abs(h.reward - .08) < 1e-10);
  assert.equal(store.winRate(10).wins, 0);
});

test('strategy selection learns from territory even when every training game is lost', async () => {
  const store = new LearningStore();
  for (let round = 0; round < 10; round++) {
    for (const variant of VARIANTS) {
      await store.record({ id: `${round}-${variant.id}`, context: 'territory-only', variant: variant.id,
        win: false, ticks: 100, commands: 2, coverage: 1, reward: variant.id === 'guarded' ? .2 : .01 });
    }
  }
  assert.equal(store.select('territory-only').id, 'guarded');
  assert.equal(store.data.wins, 0);
});
