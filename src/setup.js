export { validSpawn, spawnCandidates, spawnCrowding } from './strategy/spawn.js';

// Uses the homepage's normal join handler, including username, trust and update
// checks. No direct lobby requests and no bypass of the game's gates.
export class LobbyStarter {
  constructor(adapter, report, ready, recover = () => {}) {
    this.adapter = adapter;
    this.report = report;
    this.ready = ready;
    this.recover = recover;
    this.epoch = 0;
    this.active = false;
    this.attempted = null;
    this.waitSince = null;
    this.retryAt = 0;
    this.failedLobby = null;
  }
  start() {
    this.epoch++;
    this.active = true;
    this.attempted = null;
    this.waitSince = null;
    this.retryAt = 0;
    this.failedLobby = null;
  }
  stop() {
    this.epoch++;
    this.active = false;
  }
  step(now = Date.now()) {
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
    if (this.waitSince !== null && now - this.waitSince >= 90000) {
      this.epoch++;
      this.failedLobby = this.attempted;
      this.waitSince = null;
      this.attempted = null;
      this.retryAt = now + 5000;
      this.report({
        status: 'waiting',
        message: 'Lobby loading timed out. Recovering the next FFA entry.',
      });
      if (!selector || selector.inLobby) return this.recover();
    }
    if (now < this.retryAt) return;
    if (!selector || selector.inLobby || this.attempted) {
      this.waitSince ??= now;
      this.report({
        status: 'waiting',
        message: this.attempted
          ? 'Waiting for the FFA lobby and map to load.'
          : 'Waiting for the OpenFront homepage.',
      });
      return;
    }
    const eligible = selector.lobbies?.games?.ffa?.filter(
      (l) =>
        l.gameConfig?.gameMode === 'Free For All' &&
        (!l.gameConfig.maxPlayers || l.numClients < l.gameConfig.maxPlayers) &&
        (!l.gameConfig.trusted || selector.viewerTrusted),
    );
    const lobby = eligible?.find((l) => l.gameID !== this.failedLobby) ?? eligible?.[0];
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
    this.waitSince = now;
    const epoch = ++this.epoch;
    const failed = () => {
      if (!this.active || this.epoch !== epoch) return;
      this.failedLobby = lobby.gameID;
      this.attempted = null;
      this.retryAt = Date.now() + 5000;
      this.report({
        status: 'waiting',
        message: 'Lobby join failed. Retrying through the normal game menu shortly.',
      });
    };
    this.report({
      status: 'waiting',
      message:
        'FFA join requested. Waiting for connection and map loading; complete any prompt shown by the game.',
    });
    try {
      const result = selector.validateAndJoin(lobby);
      if (result === false) failed();
      else if (result?.then)
        Promise.resolve(result).then((value) => {
          if (value === false) failed();
        }, failed);
    } catch {
      failed();
    }
  }
}
