import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoRequeue, consumeRequeue, REQUEUE_KEY } from '../src/requeue.js';
import { growthAdvantage } from '../src/safety.js';
import { Strategy } from '../src/strategy.js';
import { U } from '../src/common.js';
function memory() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k) }; }
test('win and elimination navigate home and arm exactly one next-page start', async () => {
  for (const won of [false, true]) {
    const storage = memory(); let count = 0, finalized = 0;
    const game = { config: () => ({}), inSpawnPhase: () => false, gameOver: () => won,
      myPlayer: () => ({ hasSpawned: () => true, isAlive: () => won }) };
    const r = new AutoRequeue({ game, sameGame: () => true }, storage, async () => { finalized++; }, p => { assert.equal(p, '/'); count++; });
    assert.equal(await r.step(() => true), true); await r.step(() => true);
    assert.equal(count, 1); assert.equal(finalized, 1);
    assert.equal(consumeRequeue(storage), true); assert.equal(consumeRequeue(storage), false);
  }
});
test('Escape during result saving prevents automatic navigation and clears resume permission', async () => {
  const storage = memory(); let release, navigated = false;
  const game = { config: () => ({}), inSpawnPhase: () => false, gameOver: () => true, myPlayer: () => null };
  const r = new AutoRequeue({ game, sameGame: () => true }, storage, () => new Promise(resolve => { release = resolve; }), () => { navigated = true; });
  const pending = r.step(() => true); r.stop(); release(); await pending;
  assert.equal(navigated, false); assert.equal(storage.getItem(REQUEUE_KEY), null);
});
test('living players and spawn phase do not trigger automatic departure', async () => {
  for (const spawning of [false, true]) {
    const game = { config: () => ({}), inSpawnPhase: () => spawning, gameOver: () => false,
      myPlayer: () => ({ hasSpawned: () => !spawning, isAlive: () => !spawning }) };
    const r = new AutoRequeue({ game }, memory(), async () => {}, () => assert.fail('departure'));
    assert.equal(await r.step(() => true), false);
  }
});
test('replenishment advantage requires both larger capacity and sufficient projected recovery', () => {
  const me = { troops: () => 100000, cap: 200000 }, other = { troops: () => 70000, cap: 100000 };
  const s = { me, config: { maxTroops: p => p.cap, troopIncreaseRate: p => (p.cap - p.troops()) * .002 } };
  assert.equal(growthAdvantage(s, { raw: other, troops: 70000 }, 65000), true);
  assert.equal(me.troops(), 100000);
  me.cap = 110000; assert.equal(growthAdvantage(s, { raw: other, troops: 70000 }, 65000), false);
  me.cap = 200000; s.config.troopIncreaseRate = () => 0;
  assert.equal(growthAdvantage(s, { raw: other, troops: 70000 }, 65000), false);
});
function nuclearFixture() {
  const target = { id: 2, playerID: 'enemy', type: 'HUMAN', troops: 100000, tiles: [0] };
  const s = { tick: 3000, game: { ticksSinceStart: () => 2500, width: () => 300, height: () => 300,
      ref: (x,y) => y*300+x, ownerID: () => 2, isLand: () => true, euclideanDistSquared: () => 1000000 },
    config: {}, gold: 5000000, outgoing: [], enemies: [target], hostileUnits: [{ type: U.city, owner: 2, tile: 50 }],
    own: [{ type: U.city, level: 4 }, { type: U.factory, level: 3 }, { type: U.silo, level: 1 }] };
  const adapter = { nukeSafe: () => true, buildOption: async () => ({ canBuild: 100, canUpgrade: false, cost: 5000000 }) };
  const pilot = new Strategy(adapter); return { s, pilot, adapter };
}
test('hydrogen strategy requires an established late-game economy and five million gold', async () => {
  const { s, pilot } = nuclearFixture();
  assert.equal((await pilot.nuclear(s, () => true)).unit, U.hydrogen);
  s.gold = 4999999; assert.equal(await pilot.nuclear(s, () => true), null);
  s.gold = 5000000; s.game.ticksSinceStart = () => 100;
  assert.equal(pilot.hydrogenCandidate(s), null);
});
test('known SAM coverage, friendly blast areas and unfinished AI work prevent hydrogen planning', () => {
  const { s, pilot, adapter } = nuclearFixture();
  s.hostileUnits.push({ type: U.sam, owner: 3, tile: 100, level: 1 });
  s.game.euclideanDistSquared = () => 1; assert.equal(pilot.hydrogenCandidate(s), null);
  s.hostileUnits.pop(); adapter.nukeSafe = () => false; assert.equal(pilot.hydrogenCandidate(s), null);
  adapter.nukeSafe = () => true; s.enemies.push({ type: 'NATION' }); assert.equal(pilot.hydrogenCandidate(s), null);
});
test('a hydrogen command records a follow-up target and launch time', () => {
  const { pilot } = nuclearFixture(); pilot.record({ kind: 'build', unit: U.hydrogen, targetID: 'enemy' }, 3000);
  assert.equal(pilot.focus, 'enemy'); assert.equal(pilot.blast.tick, 3000);
});
