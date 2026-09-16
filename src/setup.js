export { validSpawn, spawnCandidates, spawnCrowding } from './strategy/spawn.js';

// Uses the homepage's normal join handler, including username, trust and update
// checks. No direct lobby requests and no bypass of the game's gates.
export class LobbyStarter {
  constructor(adapter, report, ready) {
    this.adapter = adapter;
    this.report = report;
    this.ready = ready;
    this.active = false;
    this.attempted = null;
  }
  start() {
    this.active = true;
    this.attempted = null;
  }
  stop() {
    this.active = false;
  }
  step() {
    if (!this.active) return;
    if (this.adapter.connect() && !this.adapter.game.gameOver?.()) {
      if (this.adapter.game.config().gameConfig?.().gameMode !== 'Free For All') {
        this.report({
          status: 'waiting',
          message: 'Waiting for a fully loaded FFA match. Pilot remains armed.',
        });
        return;
      }
      if (this.ready() !== false) this.active = false;
      return;
    }
    const selector = this.adapter.document.querySelector('game-mode-selector');
    if (!selector || selector.inLobby || this.attempted) {
      this.report({
        status: 'waiting',
        message: this.attempted
          ? 'Waiting for the FFA lobby and map to load.'
          : 'Waiting for the OpenFront homepage.',
      });
      return;
    }
    const lobby = selector.lobbies?.games?.ffa?.find(
      (l) =>
        l.gameConfig?.gameMode === 'Free For All' &&
        (!l.gameConfig.maxPlayers || l.numClients < l.gameConfig.maxPlayers) &&
        (!l.gameConfig.trusted || selector.viewerTrusted),
    );
    if (!lobby) {
      this.report({
        status: 'waiting',
        message: 'Waiting for an available public Free For All lobby.',
      });
      return;
    }
    if (typeof selector.validateAndJoin !== 'function') {
      this.report({
        status: 'waiting',
        message: 'FFA selection unavailable; join through the game menu. Pilot remains armed.',
      });
      return;
    }
    this.attempted = lobby.gameID;
    selector.validateAndJoin(lobby);
    this.report({
      status: 'waiting',
      message:
        'FFA join requested. Waiting for connection and map loading; complete any prompt shown by the game.',
    });
  }
}
