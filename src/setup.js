import { terrainRank } from './opportunities.js';
import { isAI, isHuman } from './safety.js';

// Uses the homepage's normal join handler, including username, trust and update
// checks. No direct lobby requests and no bypass of the game's gates.
export class LobbyStarter {
  constructor(adapter, report, ready) {
    this.adapter = adapter; this.report = report; this.ready = ready;
    this.active = false; this.attempted = null;
  }
  start() { this.active = true; this.attempted = null; }
  stop() { this.active = false; }
  step() {
    if (!this.active) return;
    if (this.adapter.connect() && !this.adapter.game.gameOver?.()) {
      if (this.adapter.game.config().gameConfig?.().gameMode !== 'Free For All') {
        this.report({ status: 'waiting', message: 'Waiting for a fully loaded FFA match. Pilot remains armed.' }); return;
      }
      if (this.ready() !== false) this.active = false;
      return;
    }
    const selector = this.adapter.document.querySelector('game-mode-selector');
    if (!selector || selector.inLobby || this.attempted) {
      this.report({ status: 'waiting', message: this.attempted ? 'Waiting for the FFA lobby and map to load.' : 'Waiting for the OpenFront homepage.' });
      return;
    }
    const lobby = selector.lobbies?.games?.ffa?.find(l => l.gameConfig?.gameMode === 'Free For All'
      && (!l.gameConfig.maxPlayers || l.numClients < l.gameConfig.maxPlayers)
      && (!l.gameConfig.trusted || selector.viewerTrusted));
    if (!lobby) { this.report({ status: 'waiting', message: 'Waiting for an available public Free For All lobby.' }); return; }
    if (typeof selector.validateAndJoin !== 'function') {
      this.report({ status: 'waiting', message: 'FFA selection unavailable; join through the game menu. Pilot remains armed.' }); return;
    }
    this.attempted = lobby.gameID;
    selector.validateAndJoin(lobby);
    this.report({ status: 'waiting', message: 'FFA join requested. Waiting for connection and map loading; complete any prompt shown by the game.' });
  }
}

export function validSpawn(g, tile) {
  if (!Number.isInteger(tile) || (g.isValidRef && !g.isValidRef(tile))) return false;
  const x = g.x(tile), y = g.y(tile);
  // A complete radius-four starting patch, rather than a partial coastal spawn.
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    if (dx * dx + dy * dy > 16) continue;
    if (!g.isValidCoord(x + dx, y + dy)) return false;
    const t = g.ref(x + dx, y + dy);
    if (!g.isLand(t) || g.isImpassable?.(t) || g.ownerID(t) !== 0) return false;
  }
  return true;
}
export function spawnCandidates(g) {
  const step = Math.max(6, Math.ceil(Math.sqrt(g.width() * g.height() / 700)));
  const seed = [...String(g.gameID?.() ?? '')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const candidates = [];
  for (let y = 4 + seed % step; y < g.height() - 4; y += step) {
    for (let x = 4 + (seed >>> 8) % step; x < g.width() - 4; x += step) {
      const tile = g.ref(x, y);
      if (!validSpawn(g, tile)) continue;
      let score = 0, nearWater = 0, coastWater = 0;
      for (const radius of [12, 24, 48, 80]) for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, px = Math.round(x + Math.cos(a) * radius), py = Math.round(y + Math.sin(a) * radius);
        if (!g.isValidCoord(px, py)) { score -= 4; continue; }
        const t = g.ref(px, py);
        if (!g.isLand(t) || g.isImpassable?.(t)) {
          if (!g.isLand(t) && !g.isImpassable?.(t)) {
            if (radius === 12) nearWater++;
            if (radius === 24) coastWater++;
          }
          score -= radius <= 24 ? 8 : 2; continue;
        }
        if (g.ownerID(t) === 0) {
          const rank = terrainRank(g.terrainType?.(t));
          score += radius <= 24 ? 4 - (rank ?? 0) * 2 : 2 - (rank ?? 0);
        }
        else {
          const p = g.owner(t);
          score += isAI(p) ? (radius >= 48 ? 3 : -3) : -(200 / radius);
        }
      }
      // Favor water within one early expansion, while leaving broad land around spawn.
      if (coastWater >= 2 && coastWater <= 7 && nearWater <= 2) score += 110;
      score -= spawnCrowding(g, tile).penalty;
      candidates.push({ tile, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).map(c => c.tile);
}
export function spawnCrowding(g, tile) {
  const me = g.myPlayer?.(), x = g.x(tile), y = g.y(tile);
  let count = 0, penalty = 0;
  for (const p of g.players?.() ?? []) {
    if (!isHuman(p) || p.smallID() === me?.smallID?.() || !p.hasSpawned?.()) continue;
    const t = p.spawnTile?.();
    if (!Number.isInteger(t)) continue;
    const distance = Math.hypot(g.x(t) - x, g.y(t) - y);
    if (distance < 100) { count++; penalty += 220 * (1 - distance / 100); }
  }
  return { count, penalty };
}
