import { SPAWN } from '../rules.js';
import { terrainRank } from '../opportunities.js';
import { isAI, isHuman } from '../safety.js';

export function validSpawn(game, tile) {
  if (!Number.isInteger(tile) || (game.isValidRef && !game.isValidRef(tile))) return false;
  const x = game.x(tile),
    y = game.y(tile);
  const radius = SPAWN.patchRadius;
  // A complete radius-four starting patch, rather than a partial coastal spawn.
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      if (!game.isValidCoord(x + dx, y + dy)) return false;
      const t = game.ref(x + dx, y + dy);
      if (!game.isLand(t) || game.isImpassable?.(t) || game.ownerID(t) !== 0) return false;
    }
  return true;
}
export function spawnCandidates(game) {
  const step = Math.max(6, Math.ceil(Math.sqrt((game.width() * game.height()) / 700)));
  const seed = [...String(game.gameID?.() ?? '')].reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  const candidates = [];
  const margin = SPAWN.patchRadius;
  for (let y = margin + (seed % step); y < game.height() - margin; y += step) {
    for (let x = margin + ((seed >>> 8) % step); x < game.width() - margin; x += step) {
      const tile = game.ref(x, y);
      if (!validSpawn(game, tile)) continue;
      let score = 0,
        nearWater = 0,
        coastWater = 0;
      for (const radius of [12, 24, 48, 80])
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8,
            px = Math.round(x + Math.cos(a) * radius),
            py = Math.round(y + Math.sin(a) * radius);
          if (!game.isValidCoord(px, py)) {
            score -= 4;
            continue;
          }
          const t = game.ref(px, py);
          if (!game.isLand(t) || game.isImpassable?.(t)) {
            if (!game.isLand(t) && !game.isImpassable?.(t)) {
              if (radius === 12) nearWater++;
              if (radius === 24) coastWater++;
            }
            score -= radius <= 24 ? 8 : 2;
            continue;
          }
          if (game.ownerID(t) === 0) {
            const rank = terrainRank(game.terrainType?.(t));
            score += radius <= 24 ? 4 - (rank ?? 0) * 2 : 2 - (rank ?? 0);
          } else {
            const player = game.owner(t);
            score += isAI(player) ? (radius >= 48 ? 3 : -3) : -(200 / radius);
          }
        }
      // Favor water within one early expansion, while leaving broad land around spawn.
      if (coastWater >= 2 && coastWater <= 7 && nearWater <= 2) score += 110;
      score -= spawnCrowding(game, tile).penalty;
      candidates.push({ tile, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).map((c) => c.tile);
}
export function spawnCrowding(game, tile) {
  const ourPlayer = game.myPlayer?.(),
    x = game.x(tile),
    y = game.y(tile);
  let count = 0,
    penalty = 0;
  for (const player of game.players?.() ?? []) {
    if (!isHuman(player) || player.smallID() === ourPlayer?.smallID?.() || !player.hasSpawned?.())
      continue;
    const t = player.spawnTile?.();
    if (!Number.isInteger(t)) continue;
    const distance = Math.hypot(game.x(t) - x, game.y(t) - y);
    if (distance < SPAWN.crowdingRadius) {
      count++;
      penalty += SPAWN.crowdingWeight * (1 - distance / SPAWN.crowdingRadius);
    }
  }
  return { count, penalty };
}
