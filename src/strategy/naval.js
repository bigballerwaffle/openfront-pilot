import { isAI, coastalTile, safeCrossing } from '../safety.js';
import { U, sample, friendly } from '../common.js';

export async function chooseLanding(strategy, state, reserve, active) {
  if (!state.map.shores.length) return null;
  const game = state.game,
    candidates = new Set();
  for (const shore of sample(state.map.shores, 16)) {
    for (const distance of [20, 45, 85, 150, 230])
      for (let angle = 0; angle < 12; angle++) {
        const x = Math.round(game.x(shore) + Math.cos((angle * Math.PI) / 6) * distance);
        const y = Math.round(game.y(shore) + Math.sin((angle * Math.PI) / 6) * distance);
        if (!game.isValidCoord(x, y)) continue;
        const tile = game.ref(x, y);
        if (
          coastalTile(game, tile) &&
          game.ownerID(tile) !== state.me.smallID() &&
          !friendly(state.me, game.owner(tile))
        )
          candidates.add(tile);
      }
  }
  const budget = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
  const nearbyAI = [...candidates].some((t) => {
    const player = game.owner(t);
    return player.isPlayer() && isAI(player);
  });
  const ranked = [...candidates]
    .map((tile) => {
      const player = game.owner(tile);
      if (strategy.focus && player.id() !== strategy.focus) return null;
      if (!strategy.focus && nearbyAI && player.isPlayer() && !isAI(player)) return null;
      if (player.isPlayer() && budget < player.troops() * strategy.strengthRatio()) return null;
      if (state.enemies.some((enemy) => enemy.id === player.smallID())) return null;
      const nearest = Math.min(
        ...sample(state.map.shores, 30).map((t) => game.euclideanDistSquared(tile, t)),
      );

      return {
        tile,
        owner: player,
        score: (player.isPlayer() ? (isAI(player) ? 100 : 0) : 200) - Math.sqrt(nearest) / 15,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  for (const c of ranked.slice(0, 5)) {
    if (!active()) return null;
    const option = await strategy.adapter.buildOption(state, U.transport, c.tile);
    if (option && option.canBuild !== false && safeCrossing(state, option.canBuild, c.tile))
      return {
        kind: 'boat',
        targetID: c.owner.id(),
        tile: c.tile,
        troops: Math.floor(budget),
        reserve,
        minRatio: strategy.strengthRatio(),
        reason:
          'Concentrated landing: direct water corridor clear of current hostile warship range.',
      };
  }
  return null;
}
