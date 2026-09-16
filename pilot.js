// OpenFront Pilot 0.12.0 — locally running strategy bot. See README.md.
(() => {
  // src/panel.js
  function createPanel(document2) {
    const host = document2.createElement("openfront-pilot");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = /* HTML */
    ` <style>
      :host {
        all: initial;
        position: fixed;
        top: 82px;
        right: 14px;
        z-index: 2147483000;
        font:
          13px/1.45 system-ui,
          sans-serif;
        color: #eef3f4;
        display: block;
        width: 290px;
        max-width: calc(100vw - 28px);
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      .panel {
        background: #10191ff2;
        border: 1px solid #344951;
        border-radius: 16px;
        box-shadow: 0 12px 40px #0006;
        overflow: hidden;
        backdrop-filter: blur(12px);
      }
      header {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 14px 15px;
        border-bottom: 1px solid #2b3a42;
        cursor: move;
        touch-action: none;
      }
      .mark {
        width: 27px;
        height: 27px;
        border-radius: 8px;
        background: #8aecd1;
        color: #102721;
        display: grid;
        place-items: center;
        font-size: 17px;
        font-weight: 800;
      }
      h1 {
        font-size: 14px;
        margin: 0;
        letter-spacing: 0.2px;
      }
      .version {
        font-size: 10px;
        color: #849ba6;
      }
      .spacer {
        flex: 1;
      }
      button,
      select {
        font: inherit;
        border: 1px solid #3a4c55;
        border-radius: 8px;
        padding: 8px;
        cursor: pointer;
        color: inherit;
        background: #1c2a32;
      }
      button:hover {
        filter: brightness(1.17);
      }
      button:focus-visible,
      select:focus-visible {
        outline: 2px solid #8aecd1;
        outline-offset: 2px;
      }
      .icon {
        padding: 1px 8px;
        font-size: 19px;
      }
      .body {
        padding: 14px;
      }
      .state {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #9aabb4;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #94a3b8;
      }
      .dot.running {
        background: #8aecd1;
      }
      .dot.waiting {
        background: #ffd28b;
      }
      .message {
        color: #d6e3e8;
        min-height: 52px;
        margin: 9px 0 12px;
      }
      .body {
        max-height: calc(100vh - 165px);
        overflow-y: auto;
      }
      .controls {
        display: flex;
        gap: 8px;
      }
      .controls button {
        flex: 1;
        font-weight: 650;
      }
      .start {
        background: #8aecd1;
        color: #102721;
        border-color: #8aecd1;
      }
      .pause {
        background: #273b47;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin: 14px 0;
      }
      .stat {
        padding: 9px 7px;
        background: #19252c;
        border-radius: 8px;
      }
      .stat span {
        display: block;
        color: #91a8b3;
        font-size: 10px;
      }
      .stat strong {
        font-size: 15px;
        font-weight: 600;
      }
      .bar {
        height: 5px;
        background: #24343d;
        border-radius: 8px;
        overflow: hidden;
        margin-top: 5px;
      }
      .fill {
        height: 100%;
        width: 0;
        background: #8aecd1;
      }
      .ratio {
        display: flex;
        justify-content: space-between;
        color: #91a8b3;
        font-size: 11px;
      }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        gap: 10px;
      }
      select {
        padding: 5px 7px;
        font-size: 12px;
      }
      input {
        accent-color: #8aecd1;
      }
      label {
        cursor: pointer;
        color: #c9d8df;
      }
      details {
        border-top: 1px solid #293b45;
        margin-top: 13px;
        padding-top: 11px;
      }
      summary {
        cursor: pointer;
        color: #9eb2bd;
        font-size: 12px;
      }
      .log {
        max-height: 170px;
        overflow: auto;
        padding: 0;
        list-style: none;
        margin: 8px 0 0;
      }
      .log li {
        padding: 6px 0;
        border-bottom: 1px solid #23343d;
        font-size: 11px;
        color: #a9bec7;
        overflow-wrap: anywhere;
      }
      .learning-copy {
        font-size: 11px;
        color: #a9bec7;
        margin: 8px 0;
        overflow-wrap: anywhere;
      }
      .learning-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .learning-actions button {
        font-size: 11px;
        padding: 5px 7px;
      }
      .learning-table {
        width: 100%;
        font-size: 10px;
        border-collapse: collapse;
        margin: 9px 0;
      }
      .learning-table th,
      .learning-table td {
        text-align: left;
        padding: 4px 2px;
        border-bottom: 1px solid #293b45;
      }
      .learning-table th {
        color: #91a8b3;
      }
      .warning {
        color: #ffd28b;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        margin-top: 13px;
        color: #6f8b97;
        font-size: 10px;
      }
      .collapsed .body {
        display: none;
      }
      .collapsed header {
        border-bottom: 0;
      }
      @media (max-height: 680px) {
        :host {
          top: 14px;
        }
        .body {
          max-height: 75vh;
          overflow: auto;
        }
      }
    </style>
    <section class="panel" aria-label="OpenFront Pilot">
      <header>
        <div class="mark">P</div>
        <div>
          <h1>OpenFront Pilot</h1>
          <div class="version">LOCAL STRATEGY BOT \xB7 v0.12.0</div>
        </div>
        <div class="spacer"></div>
        <button class="icon collapse" aria-label="Collapse panel" title="Collapse">\u2212</button>
      </header>
      <div class="body">
        <div class="state"><i class="dot"></i><span id="state">Paused</span></div>
        <p class="message" id="message" role="status">
          Press Start to join public Free For All, choose a starting point, and play. In an existing
          match, Start takes over your position.
        </p>
        <p class="learning-copy warning" id="compatibility"></p>
        <div class="controls">
          <button class="start">Start</button
          ><button class="stop" title="Stop bot and learning">Stop all</button>
        </div>
        <div class="stats">
          <div class="stat"><span>TROOPS</span><strong id="troops">\u2014</strong></div>
          <div class="stat"><span>GOLD</span><strong id="gold">\u2014</strong></div>
          <div class="stat"><span>LAND</span><strong id="land">\u2014</strong></div>
        </div>
        <div class="ratio"><span>Troop capacity</span><span id="ratio">\u2014</span></div>
        <div class="bar"><div class="fill"></div></div>
        <div class="setting">
          <label for="profile">Play style</label
          ><select id="profile">
            <option value="cautious">Cautious</option>
            <option value="balanced" selected>Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div class="setting">
          <label for="economy">Build & upgrade</label><input type="checkbox" id="economy" checked />
        </div>
        <div class="setting">
          <label for="navy">Naval expansion</label><input type="checkbox" id="navy" checked />
        </div>
        <div class="setting">
          <label for="nukes">Nuclear strategy</label><input type="checkbox" id="nukes" checked />
        </div>
        <div class="setting">
          <label for="diplomacy">Protect flanks with alliances</label
          ><input type="checkbox" id="diplomacy" checked />
        </div>
        <div class="setting">
          <label for="learning">Learn across games</label
          ><input type="checkbox" id="learning" checked />
        </div>
        <div class="setting">
          <label for="win-window">Win rate \xB7 last games</label
          ><input
            id="win-window"
            type="number"
            min="1"
            max="1000"
            value="20"
            style="width:65px"
            aria-label="Number of recent games"
          />
        </div>
        <p class="learning-copy">
          <strong id="win-rate">\u2014</strong> \xB7 <span id="win-detail">No recorded results</span>
        </p>
        <p class="learning-copy">
          Counts completed matches recorded by learning. Up to 1,000 win/loss flags; no recordings.
        </p>
        <details class="learning-details" open>
          <summary>Learning \xB7 <span id="learn-count">0</span> games</summary>
          <p class="learning-copy" id="learn-message" role="status"></p>
          <p class="learning-copy" id="learn-current"></p>
          <p class="learning-copy" id="learn-memory"></p>
          <p class="learning-copy">
            Reward: 70% win + 20% peak map share + 10% average map share while playing. No bonus for
            simply waiting.
          </p>
          <p class="learning-copy" id="learn-reward"></p>
          <p class="learning-copy warning" id="learn-warning"></p>
          <table class="learning-table">
            <thead>
              <tr>
                <th>Current match type</th>
                <th>Wins</th>
                <th>Games</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody id="learn-rows"></tbody>
          </table>
          <div class="learning-actions">
            <button id="learn-export">Export backup</button
            ><button id="learn-import">Import backup</button
            ><button id="learn-reset">Reset learning</button>
          </div>
          <input type="file" id="learn-file" accept="application/json,.json" hidden />
        </details>
        <details>
          <summary>Decision log</summary>
          <ol class="log"></ol>
        </details>
        <div class="foot">
          <span>O: start \xB7 Esc: stop all</span><span id="commands">0 commands</span>
        </div>
      </div>
    </section>`;
    document2.documentElement.append(host);
    return { host, root };
  }

  // src/requeue.js
  var REQUEUE_KEY = "openfront-pilot-requeue-v1";
  function consumeRequeue(storage, now = Date.now()) {
    try {
      const raw = storage.getItem(REQUEUE_KEY);
      storage.removeItem(REQUEUE_KEY);
      const data = JSON.parse(raw);
      return data?.expires > now && data.expires <= now + 12e4;
    } catch {
      return false;
    }
  }
  var AutoRequeue = class {
    constructor(adapter, storage, finish, navigate) {
      Object.assign(this, { adapter, storage, finish, navigate });
      this.busy = false;
      this.navigating = false;
      this.epoch = 0;
    }
    stop() {
      this.epoch++;
      this.navigating = false;
      this.unspawnable = null;
      try {
        this.storage.removeItem(REQUEUE_KEY);
      } catch {
      }
    }
    recover(active) {
      if (!active() || this.navigating) return;
      this.storage.setItem(REQUEUE_KEY, JSON.stringify({ expires: Date.now() + 12e4 }));
      this.navigating = true;
      try {
        this.navigate("/");
      } catch (error) {
        this.navigating = false;
        this.storage.removeItem(REQUEUE_KEY);
        throw error;
      }
    }
    async step(active, now = Date.now()) {
      if (this.busy || this.navigating) return this.busy || this.navigating;
      const g = this.adapter.game, me = g?.myPlayer(), config = g?.config();
      if (!active() || !g || config?.isReplay?.() || g.isCatchingUp?.() || g.inSpawnPhase() && !config?.isIntentionalSpectator?.()) {
        this.unspawnable = null;
        return false;
      }
      const spectator = config?.isIntentionalSpectator?.() || !me || me.hasSpawned?.() === false;
      if (spectator) {
        if (this.unspawnable?.game !== g) this.unspawnable = { game: g, since: now };
      } else this.unspawnable = null;
      const stranded = this.unspawnable && now - this.unspawnable.since >= 15e3;
      if (!g.gameOver?.() && !(me?.hasSpawned?.() && !me.isAlive()) && !stranded) return false;
      this.busy = true;
      const epoch = this.epoch;
      try {
        let timer;
        try {
          await Promise.race([
            this.finish(),
            new Promise((resolve) => {
              timer = setTimeout(resolve, 1500);
            })
          ]);
        } finally {
          clearTimeout(timer);
        }
        if (!active() || this.epoch !== epoch || !this.adapter.sameGame(g)) return true;
        this.recover(active);
        return true;
      } finally {
        this.busy = false;
      }
    }
  };

  // src/rules.js
  var DEFAULTS = Object.freeze({
    profile: "balanced",
    economy: true,
    navy: true,
    nukes: true,
    learning: true,
    diplomacy: true
  });
  var PROFILES = Object.freeze({
    cautious: { reserve: 0.38, advantage: 1.85 },
    balanced: { reserve: 0.3, advantage: 1.67 },
    aggressive: { reserve: 0.24, advantage: 1.67 }
  });
  var EARLY_GAME_TICKS = 6e3;
  var EARLY_CAPACITY_THRESHOLD = 0.85;
  var NEAR_CAPACITY_THRESHOLD = 0.92;
  var STRUCTURE_DANGER_RADIUS = 28;
  var MIN_HUMAN_ATTACK_RATIO = 1.67;
  var MIN_AI_ATTACK_RATIO = 1.3;
  var MAX_TROOP_SEND_FRACTION = 0.72;
  var NAVAL = Object.freeze({ wildernessShare: 0.1, wildernessMinimum: 1e3 });
  var COOLDOWNS = Object.freeze({
    attack: 12,
    counter: 12,
    recall: 20,
    reinforcement: 20,
    emergencyBuild: 10,
    routineBuild: 25,
    buildingType: 40,
    emergencyBuildingType: 30,
    defensePost: 300,
    navalLanding: 180,
    nuclearRecheck: 150,
    nuclearStrike: 1200,
    diplomacy: 25,
    allianceResponse: 80,
    allianceRenewal: 120,
    allianceOffer: 300
  });
  var DEFENSE = Object.freeze({
    minimumIncomingTroops: 2e3,
    minimumCapacityShare: 0.03,
    hugeAttackTroops: 1e4,
    hugeAttackCapacityShare: 0.2,
    hugeAttackArmyShare: 0.45,
    normalPostLevels: 2,
    emergencyPostLevels: 6,
    defaultPostRange: 30,
    postBorderClearance: 16,
    structureBorderClearance: 24,
    inlandWaterClearance: 18
  });
  var NUCLEAR = Object.freeze({
    samDelayTicks: 900,
    economyMinimumAgeTicks: 1800,
    missileObservationTicks: 40,
    siloSavings: 19e5,
    hydrogenSavings: 5e6,
    defaultSamRange: 150,
    samSafetyMargin: 15
  });
  var SPAWN = Object.freeze({
    patchRadius: 4,
    recheckTicks: 20,
    crowdingRadius: 100,
    crowdingWeight: 220,
    nearbyPlayerLimit: 2,
    crowdingThreshold: 130,
    relocationImprovement: 50
  });
  var COMMAND_CONFIRMATION_TICKS = 65;
  var STALLED_CLOCK_WARNING_MS = 1e4;
  var MAP_REFRESH_TICKS = 15;
  var STRONGER_NEIGHBOR_CAPACITY_RATIO = 1.1;

  // src/common.js
  var U = Object.freeze({
    city: "City",
    port: "Port",
    factory: "Factory",
    defense: "Defense Post",
    sam: "SAM Launcher",
    silo: "Missile Silo",
    warship: "Warship",
    transport: "Transport",
    atom: "Atom Bomb",
    hydrogen: "Hydrogen Bomb",
    mirv: "MIRV"
  });
  var unitsOf = (view, ...types) => view.units(...types).filter((u) => types.includes(u.type?.()) && (!u.isActive || u.isActive()));
  var STRUCTURES = [U.city, U.port, U.factory, U.defense, U.sam, U.silo];
  var clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function sample(values, max) {
    const a = Array.isArray(values) ? values : Array.from(values);
    if (a.length <= max) return a;
    return Array.from({ length: max }, (_, i) => a[Math.floor(i * a.length / max)]);
  }
  var number = (x) => Number(x ?? 0);
  function finite(x, label) {
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`Invalid ${label}; client compatibility check failed.`);
    return n;
  }
  async function deadline(promise, ms = 2500) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("The game stopped answering state requests.")),
            ms
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  function friendly(me, other) {
    if (!other?.isPlayer?.()) return false;
    return other.id() === me.id() || me.isAlliedWith(other) || me.isOnSameTeam(other);
  }
  function unitData(u) {
    return {
      id: u.id(),
      type: u.type(),
      tile: u.tile(),
      level: u.level(),
      building: u.isUnderConstruction?.() ?? false,
      owner: u.owner().smallID(),
      raw: u
    };
  }

  // src/opportunities.js
  function terrainRank(value) {
    if (value === 0 || String(value).toLowerCase() === "plains") return 0;
    if (value === 1 || /^highlands?$/i.test(String(value))) return 1;
    if (value === 2 || /^mountains?$/i.test(String(value))) return 2;
    return null;
  }
  function captureValue(state, enemy, forecast) {
    const weights = {
      [U.city]: 24,
      [U.port]: 20,
      [U.factory]: 16,
      [U.silo]: 12,
      [U.defense]: 4,
      [U.sam]: 8
    };
    const structures = state.hostileUnits.filter(
      (unit) => unit.owner === enemy.id && weights[unit.type] && !unit.building
    );
    const fraction = clamp(forecast.gain / Math.max(1, enemy.area), 0, 1);
    const value = structures.reduce((sum, unit) => {
      const distance = Math.sqrt(
        Math.min(...enemy.tiles.map((t) => state.game.euclideanDistSquared(t, unit.tile)))
      );
      return sum + weights[unit.type] * Math.min(5, unit.level ?? 1) / (1 + distance / 60);
    }, 0);
    return Math.min(90, value * fraction);
  }
  function factoryConnections(state, tile) {
    return ownedRailConnections(state, tile, [U.city, U.port]);
  }
  function cityFactoryConnections(state, tile) {
    return ownedRailConnections(state, tile, [U.factory]);
  }
  function ownedRailConnections(state, tile, types) {
    const game = state.game, range = state.config.trainStationMaxRange?.() ?? 110;
    if (!game.x || !game.y || !game.ref || !game.isValidCoord) return 0;
    return state.own.filter(
      (unit) => types.includes(unit.type) && !unit.building && Number.isInteger(unit.tile) && unit.tile !== tile && game.ownerID(unit.tile) === state.me.smallID() && game.euclideanDistSquared(tile, unit.tile) <= range * range
    ).reduce((sum, unit) => {
      const dx = game.x(unit.tile) - game.x(tile), dy = game.y(unit.tile) - game.y(tile), steps = Math.ceil(Math.hypot(dx, dy));
      for (let i = 1; i < steps; i++) {
        const x = Math.round(game.x(tile) + dx * i / steps), y = Math.round(game.y(tile) + dy * i / steps);
        if (!game.isValidCoord(x, y)) return sum;
        const t = game.ref(x, y);
        if (!game.isLand(t) || game.isImpassable?.(t) || game.ownerID(t) !== state.me.smallID())
          return sum;
      }
      return sum + Math.min(3, unit.level ?? 1);
    }, 0);
  }
  function strikeValue(state, tile, target) {
    const game = state.game, radii = state.config.nukeMagnitudes?.(U.hydrogen) ?? { inner: 80, outer: 100 };
    let land = 0;
    if (game.x && game.y && game.ref && game.isValidCoord) {
      for (const r of [0, radii.inner / 2, radii.inner, radii.outer]) {
        const count = r === 0 ? 1 : 16;
        for (let i = 0; i < count; i++) {
          const x = Math.round(game.x(tile) + r * Math.cos(i * 2 * Math.PI / count));
          const y = Math.round(game.y(tile) + r * Math.sin(i * 2 * Math.PI / count));
          if (!game.isValidCoord(x, y)) continue;
          const t = game.ref(x, y);
          if (game.isLand(t) && !game.hasFallout?.(t) && game.ownerID(t) === target.id) land++;
        }
      }
    }
    const weights = {
      [U.city]: 12,
      [U.silo]: 16,
      [U.factory]: 8,
      [U.port]: 8,
      [U.defense]: 5,
      [U.sam]: 10
    };
    const value = sample(state.hostileUnits, 2e3).reduce((sum, unit) => {
      if (unit.owner !== target.id || unit.building || !weights[unit.type]) return sum;
      const d = game.euclideanDistSquared(tile, unit.tile);
      if (d > radii.outer ** 2) return sum;
      return sum + weights[unit.type] * Math.min(20, unit.level ?? 1) * (d <= radii.inner ** 2 ? 1 : 0.4);
    }, 0);
    return land * 3 + value;
  }

  // src/safety.js
  var isHuman = (player) => (typeof player?.type === "function" ? player.type() : player?.type) === "HUMAN";
  var isAI = (player) => ["BOT", "NATION"].includes(typeof player?.type === "function" ? player.type() : player?.type);
  function offensiveBusy(ourPlayer) {
    return ourPlayer.outgoingAttacks().length > 0 || unitsOf(ourPlayer, U.transport).length > 0;
  }
  function safePlacement(state, tile, type) {
    if (!STRUCTURES.includes(type)) return true;
    const game = state.game, own = state.me.smallID();
    if (game.ownerID(tile) !== own || !game.isLand(tile) || game.hasFallout?.(tile)) return false;
    const coastal = type === U.port;
    const border = type === U.defense ? DEFENSE.postBorderClearance : DEFENSE.structureBorderClearance, shore = coastal ? 0 : DEFENSE.inlandWaterClearance;
    const x0 = game.x(tile), y0 = game.y(tile), radius = Math.max(border, shore);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d = dx * dx + dy * dy;
        if (d > radius * radius || !game.isValidCoord(x0 + dx, y0 + dy)) continue;
        const t = game.ref(x0 + dx, y0 + dy);
        if (d < shore * shore && !game.isLand(t)) return false;
        const id = game.ownerID(t);
        if (d < border * border && id !== 0 && id !== own) return false;
      }
    return true;
  }
  function coastalTile(game, tile) {
    return game.isLand(tile) && game.neighbors(tile).some((t) => !game.isLand(t) && !game.isImpassable?.(t));
  }
  function safeCrossing(state, src, dst) {
    const game = state.game;
    if (!Number.isInteger(src) || !Number.isInteger(dst) || !coastalTile(game, dst)) return false;
    const ax = game.x(src), ay = game.y(src), bx = game.x(dst), by = game.y(dst);
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length < 3 || length > 260) return false;
    const ships = unitsOf(game, U.warship).filter((unit) => !friendly(state.me, unit.owner()));
    const range = (state.config.warshipTargettingRange?.() ?? 130) + 25;
    for (const ship of ships) {
      const x = game.x(ship.tile()), y = game.y(ship.tile());
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (length * length)));
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= range) return false;
    }
    for (let i = 2; i < Math.ceil(length) - 1; i++) {
      const t = i / Math.ceil(length);
      for (const offset of [-3, 0, 3]) {
        const x = Math.round(ax + dx * t - dy / length * offset);
        const y = Math.round(ay + dy * t + dx / length * offset);
        if (!game.isValidCoord(x, y)) return false;
        const tile = game.ref(x, y);
        if (game.isLand(tile) || game.isImpassable?.(tile)) return false;
      }
    }
    return true;
  }
  function lookupPlayer(state, id) {
    return state.players?.find((player) => player.smallID() === id) ?? state.enemies?.find((enemy) => enemy.id === id) ?? state.game.playerBySmallID?.(id);
  }
  function humanAttacks(state) {
    return (state.incoming ?? []).filter(
      (a) => !a.retreating && !isAI(lookupPlayer(state, a.attackerID))
    );
  }
  function structureThreatened(state, attackerID) {
    const game = state.game;
    if (!game.isValidCoord || !game.ref || !game.ownerID) return false;
    return (state.own ?? []).filter((unit) => STRUCTURES.includes(unit.type)).some((unit) => {
      const x = game.x(unit.tile), y = game.y(unit.tile), radius = STRUCTURE_DANGER_RADIUS;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius || !game.isValidCoord(x + dx, y + dy)) continue;
          if (game.ownerID(game.ref(x + dx, y + dy)) === attackerID) return true;
        }
      return false;
    });
  }
  var earlyCapacity = (state) => {
    const age = state.game.ticksSinceStart?.();
    return Number.isFinite(age) && age >= 0 && age < EARLY_GAME_TICKS && state.troops / state.cap >= EARLY_CAPACITY_THRESHOLD;
  };
  function landFrontAllowed(state, targetID, reinforce = false) {
    const waves = state.allOutgoing ?? state.outgoing;
    if (waves.some((a) => a.retreating) || state.own.some((unit) => unit.type === U.transport))
      return false;
    const ids = [...new Set(waves.map((a) => a.targetID))];
    if (reinforce && !ids.includes(targetID)) return false;
    if (!reinforce && ids.includes(targetID)) return false;
    if (!ids.length) return !reinforce;
    if (ids.length === 1 && ids[0] === targetID) return true;
    return isAI(lookupPlayer(state, targetID)) && ids.every((id) => isAI(lookupPlayer(state, id))) && (/* @__PURE__ */ new Set([...ids, targetID])).size <= 2;
  }
  function defenseUseful(state, tile) {
    const range = state.config.defensePostRange?.() ?? DEFENSE.defaultPostRange;
    const attackers = new Set(humanAttacks(state).map((a) => a.attackerID));
    return state.enemies.some(
      (enemy) => !isAI(enemy) && (!attackers.size || attackers.has(enemy.id)) && enemy.tiles.some(
        (t) => state.game.ownerID(t) === enemy.id && state.game.euclideanDistSquared(tile, t) <= range * range
      )
    );
  }
  function growthAdvantage(state, enemy, budget) {
    try {
      const other = enemy.raw;
      if (!other || !state.config.troopIncreaseRate || !state.config.maxTroops) return false;
      const cap = state.config.maxTroops(state.me), enemyCap = state.config.maxTroops(other);
      if (!(cap >= enemyCap * 1.35 && budget >= enemy.troops * 0.85)) return false;
      const projected = Object.create(state.me);
      Object.defineProperty(projected, "troops", {
        value: () => Math.max(0, state.me.troops() - budget)
      });
      const ours = state.config.troopIncreaseRate(projected), theirs = state.config.troopIncreaseRate(other);
      return Number.isFinite(ours) && Number.isFinite(theirs) && ours > theirs * 1.15 && budget + Math.min(Math.max(0, ours - theirs) * 60, budget * 0.3) >= enemy.troops * 1.1;
    } catch {
      return false;
    }
  }

  // src/strategy/spawn.js
  function validSpawn(game, tile) {
    if (!Number.isInteger(tile) || game.isValidRef && !game.isValidRef(tile)) return false;
    const x = game.x(tile), y = game.y(tile);
    const radius = SPAWN.patchRadius;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (!game.isValidCoord(x + dx, y + dy)) return false;
        const t = game.ref(x + dx, y + dy);
        if (!game.isLand(t) || game.isImpassable?.(t) || game.ownerID(t) !== 0) return false;
      }
    return true;
  }
  function spawnCandidates(game) {
    const step = Math.max(6, Math.ceil(Math.sqrt(game.width() * game.height() / 700)));
    const seed = [...String(game.gameID?.() ?? "")].reduce(
      (n, c) => n * 31 + c.charCodeAt(0) >>> 0,
      0
    );
    const candidates = [];
    const margin = SPAWN.patchRadius;
    for (let y = margin + seed % step; y < game.height() - margin; y += step) {
      for (let x = margin + (seed >>> 8) % step; x < game.width() - margin; x += step) {
        const tile = game.ref(x, y);
        if (!validSpawn(game, tile)) continue;
        let score = 0, nearWater = 0, coastWater = 0;
        for (const radius of [12, 24, 48, 80])
          for (let i = 0; i < 16; i++) {
            const a = i * Math.PI / 8, px = Math.round(x + Math.cos(a) * radius), py = Math.round(y + Math.sin(a) * radius);
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
              score += isAI(player) ? radius >= 48 ? 3 : -3 : -(200 / radius);
            }
          }
        if (coastWater >= 2 && coastWater <= 7 && nearWater <= 2) score += 110;
        score -= spawnCrowding(game, tile).penalty;
        candidates.push({ tile, score });
      }
    }
    return candidates.sort((a, b) => b.score - a.score).map((c) => c.tile);
  }
  function spawnCrowding(game, tile) {
    const ourPlayer = game.myPlayer?.(), x = game.x(tile), y = game.y(tile);
    let count = 0, penalty = 0;
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

  // src/setup.js
  var LobbyStarter = class {
    constructor(adapter, report, ready, recover = () => {
    }) {
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
        if (this.adapter.game.config().gameConfig?.().gameMode !== "Free For All") {
          this.report({
            status: "waiting",
            message: "Waiting for a fully loaded FFA match. Pilot remains armed."
          });
          return;
        }
        if (this.ready() !== false) this.active = false;
        return;
      }
      const selector = this.adapter.document.querySelector("game-mode-selector");
      if (this.waitSince !== null && now - this.waitSince >= 9e4) {
        this.epoch++;
        this.failedLobby = this.attempted;
        this.waitSince = null;
        this.attempted = null;
        this.retryAt = now + 5e3;
        this.report({
          status: "waiting",
          message: "Lobby loading timed out. Recovering the next FFA entry."
        });
        if (!selector || selector.inLobby) return this.recover();
      }
      if (now < this.retryAt) return;
      if (!selector || selector.inLobby || this.attempted) {
        this.waitSince ??= now;
        this.report({
          status: "waiting",
          message: this.attempted ? "Waiting for the FFA lobby and map to load." : "Waiting for the OpenFront homepage."
        });
        return;
      }
      const eligible = selector.lobbies?.games?.ffa?.filter(
        (l) => l.gameConfig?.gameMode === "Free For All" && (!l.gameConfig.maxPlayers || l.numClients < l.gameConfig.maxPlayers) && (!l.gameConfig.trusted || selector.viewerTrusted)
      );
      const lobby = eligible?.find((l) => l.gameID !== this.failedLobby) ?? eligible?.[0];
      if (!lobby) {
        this.report({
          status: "waiting",
          message: "Waiting for an available public Free For All lobby."
        });
        return;
      }
      if (typeof selector.validateAndJoin !== "function") {
        this.report({
          status: "waiting",
          message: "FFA selection unavailable; join through the game menu. Pilot remains armed."
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
        this.retryAt = Date.now() + 5e3;
        this.report({
          status: "waiting",
          message: "Lobby join failed. Retrying through the normal game menu shortly."
        });
      };
      this.report({
        status: "waiting",
        message: "FFA join requested. Waiting for connection and map loading; complete any prompt shown by the game."
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
  };

  // src/commands.js
  async function executeAttack(adapter, state, action, ourPlayer, valid) {
    const game = state.game;
    const target = game.owner(action.tile);
    if (friendly(ourPlayer, target) || target.id() !== action.targetID) return null;
    const troops = Math.floor(Math.min(action.troops, ourPlayer.troops() - action.reserve));
    if (!Number.isFinite(troops) || troops < 100 || troops > ourPlayer.troops() * MAX_TROOP_SEND_FRACTION)
      return null;
    const can = await deadline(
      ourPlayer.actions(action.tile, action.kind === "boat" ? [U.transport] : [])
    );
    if (!valid() || game.owner(action.tile).id() !== action.targetID || friendly(ourPlayer, game.owner(action.tile)))
      return null;
    if (action.kind === "attack" && !can.canAttack) return null;
    if (action.kind === "boat" && !can.buildableUnits.some((b) => b.type === U.transport && b.canBuild !== false))
      return null;
    let latestTroops = Math.floor(Math.min(troops, ourPlayer.troops() - action.reserve));
    if (latestTroops < 100) return null;
    const waves = ourPlayer.outgoingAttacks();
    const fresh = {
      ...state,
      me: ourPlayer,
      game,
      config: game.config?.() ?? state.config,
      players: game.players?.() ?? [...state.players ?? [], target],
      incoming: ourPlayer.incomingAttacks?.() ?? [],
      allOutgoing: waves,
      outgoing: waves.filter((a) => !a.retreating),
      troops: ourPlayer.troops(),
      cap: (game.config?.() ?? state.config)?.maxTroops?.(ourPlayer) ?? state.cap,
      own: ourPlayer.units().map(unitData)
    };
    const incoming = humanAttacks(fresh);
    let counterIncoming = 0;
    if (action.counter) {
      if (action.kind !== "attack" || isAI(target)) return null;
      if (!structureThreatened(fresh, target.smallID())) return null;
      counterIncoming = incoming.filter((a) => a.attackerID === target.smallID()).reduce((n, a) => n + a.troops, 0);
      if (!counterIncoming) return null;
      const others = incoming.filter((a) => a.attackerID !== target.smallID()).reduce((n, a) => n + a.troops, 0);
      const reserve = Math.max(
        action.reserve,
        fresh.config.maxTroops(ourPlayer) * 0.18,
        others * 1.15
      );
      latestTroops = Math.floor(
        Math.min(latestTroops, counterIncoming, ourPlayer.troops() - reserve)
      );
      if (latestTroops < 100) return null;
    } else if (action.reinforce) {
      if (action.kind !== "attack" || !landFrontAllowed(fresh, target.smallID(), true)) return null;
      if (incoming.length && ourPlayer.troops() - latestTroops < fresh.config.maxTroops(ourPlayer) * 0.25 + incoming.reduce((n, a) => n + a.troops, 0) * 1.25)
        return null;
    } else {
      if (incoming.length) return null;
      if (action.kind === "boat" ? offensiveBusy(ourPlayer) : !landFrontAllowed(fresh, target.smallID()))
        return null;
      if (waves.length) {
        for (const id of new Set(waves.map((a) => a.targetID))) {
          const player = lookupPlayer(fresh, id);
          const defenders = typeof player?.troops === "function" ? player.troops() : player?.troops;
          if (!Number.isFinite(defenders) || waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0) < defenders * MIN_AI_ATTACK_RATIO)
            return null;
        }
      }
      if (target.isPlayer() && latestTroops < target.troops() * (action.minRatio ?? MIN_HUMAN_ATTACK_RATIO))
        return null;
      if (action.growth && !growthAdvantage(fresh, { raw: target, troops: target.troops() }, latestTroops))
        return null;
      if (!action.growth && (action.minRatio ?? MIN_HUMAN_ATTACK_RATIO) < (isAI(target) ? MIN_AI_ATTACK_RATIO : MIN_HUMAN_ATTACK_RATIO) && ourPlayer.troops() / fresh.config.maxTroops(ourPlayer) < NEAR_CAPACITY_THRESHOLD && !earlyCapacity(fresh))
        return null;
    }
    if (action.kind === "boat") {
      const spawn = can.buildableUnits.find((b) => b.type === U.transport)?.canBuild;
      if (!safeCrossing({ ...state, me: ourPlayer, config: game.config() }, spawn, action.tile))
        return null;
    }
    const before = adapter.checkpoint(ourPlayer);
    adapter.bridge.emit(
      action.kind,
      action.kind === "attack" ? [target.id(), latestTroops] : [action.tile, latestTroops]
    );
    return {
      ...action,
      counterIncoming,
      troops: latestTroops,
      before,
      at: game.ticks(),
      targetSmallID: target.smallID()
    };
  }
  async function executeBuild(adapter, state, action, ourPlayer, valid) {
    const game = state.game;
    const b = await adapter.buildOption(state, action.unit, action.tile);
    if (!b || !valid() || number(ourPlayer.gold()) < number(b.cost) + (action.goldReserve ?? 0))
      return null;
    const upgrade = b.canUpgrade !== false;
    const destination = upgrade ? game.unit(b.canUpgrade)?.tile() : b.canBuild;
    if (destination === void 0 || destination === false) return null;
    if (!safePlacement({ ...state, me: ourPlayer }, destination, action.unit) || action.unit === U.defense && !defenseUseful({ ...state, me: ourPlayer }, destination) || action.unit === U.factory && factoryConnections(
      {
        ...state,
        me: ourPlayer,
        own: ourPlayer.units().filter((unit) => !unit.isActive || unit.isActive()).map(unitData)
      },
      destination
    ) === 0)
      return null;
    if ([U.atom, U.hydrogen, U.mirv].includes(action.unit) && !adapter.nukeSafe(state, action.tile, action.unit))
      return null;
    if (action.unit === U.hydrogen && unitsOf(game, U.sam).some(
      (unit) => !friendly(ourPlayer, unit.owner()) && !unit.isUnderConstruction?.() && game.euclideanDistSquared(action.tile, unit.tile()) <= ((game.config().samRange?.(unit.level()) ?? NUCLEAR.defaultSamRange) + NUCLEAR.samSafetyMargin) ** 2
    ))
      return null;
    const before = adapter.checkpoint(ourPlayer);
    if (upgrade) adapter.bridge.emit("upgrade", [b.canUpgrade, b.type, 1]);
    else
      adapter.bridge.emit("build", [
        b.type,
        [U.atom, U.hydrogen, U.mirv].includes(b.type) ? action.tile : b.canBuild,
        void 0,
        1
      ]);
    return {
      ...action,
      tile: destination,
      upgradeID: upgrade ? b.canUpgrade : null,
      before,
      at: game.ticks()
    };
  }
  async function executeDiplomacy(adapter, state, action, ourPlayer, valid) {
    const game = state.game;
    const target = game.players().find((player) => player.id() === action.targetID);
    if (!target?.isAlive() || target === ourPlayer || action.kind !== "reject" && !isHuman(target))
      return null;
    if (action.kind === "reject") {
      if (!target.isRequestingAllianceWith?.(ourPlayer)) return null;
    } else {
      const { borderTiles } = await deadline(target.borderTiles());
      if (!valid()) return null;
      const tile = [...borderTiles].find((t) => game.ownerID(t) === target.smallID());
      if (tile === void 0) return null;
      const can = await deadline(ourPlayer.actions(tile, []));
      if (!valid() || game.ownerID(tile) !== target.smallID() || !target.isAlive()) return null;
      if (action.kind === "alliance" && !can.interaction?.canSendAllianceRequest) return null;
      if (action.kind === "extend" && !can.interaction?.allianceInfo?.canExtend) return null;
    }
    if (!valid()) return null;
    adapter.bridge.emit(action.kind, action.kind === "alliance" ? [ourPlayer, target] : [target]);
    return { ...action, at: game.ticks(), diplomatic: true };
  }
  async function executeRecall(adapter, state, action, ourPlayer, valid) {
    const game = state.game;
    if (!ourPlayer.outgoingAttacks().some((a) => a.id === action.attackID && !a.retreating))
      return null;
    const before = adapter.checkpoint(ourPlayer);
    adapter.bridge.emit("cancel", [action.attackID]);
    return { ...action, before, at: game.ticks() };
  }

  // src/geometry.js
  function sampleRegions(game) {
    const step = Math.max(1, Math.ceil(Math.sqrt(game.width() * game.height() / 12e3)));
    const regions = /* @__PURE__ */ new Map();
    for (let y = Math.floor(step / 2); y < game.height(); y += step) {
      for (let x = Math.floor(step / 2); x < game.width(); x += step) {
        const tile = game.ref(x, y), id = game.ownerID(tile);
        if (!id || !game.isLand(tile)) continue;
        const r = regions.get(id) ?? { n: 0, x: 0, y: 0, moment: 0 };
        r.n++;
        r.x += x;
        r.y += y;
        r.moment += x * x + y * y;
        regions.set(id, r);
      }
    }
    for (const r of regions.values()) {
      r.x /= r.n;
      r.y /= r.n;
      r.moment = Math.max(0, r.moment / r.n - r.x * r.x - r.y * r.y);
    }
    return regions;
  }
  function compactnessScore(state, enemy) {
    const frontage = Number.isFinite(enemy.count) && enemy.area > 0 ? clamp(45 * (enemy.count / Math.sqrt(enemy.area) - 0.75), -35, 75) : 0;
    const own = state.map.regions?.get(state.me.smallID()), next = state.map.regions?.get(enemy.id);
    if (!own || !next || own.n < 3 || next.n < 3 || state.tiles <= 0 || enemy.area <= 0)
      return frontage;
    const total = state.tiles + enemy.area, a = state.tiles / total, b = enemy.area / total;
    const distance2 = (own.x - next.x) ** 2 + (own.y - next.y) ** 2;
    const merged = a * own.moment + b * next.moment + a * b * distance2;
    return clamp(
      60 * 2 * Math.PI * (own.moment / state.tiles - merged / total) + frontage,
      -100,
      100
    );
  }

  // src/events.js
  var SPECS = {
    alliance: ["SendAllianceRequestIntentEvent", ["requestor", "recipient"], "onSendAllianceRequest"],
    reject: ["SendAllianceRejectIntentEvent", ["requestor"], "onAllianceRejectUIEvent"],
    extend: ["SendAllianceExtensionIntentEvent", ["recipient"], "onSendAllianceExtensionIntent"],
    attack: ["SendAttackIntentEvent", ["targetID", "troops"]],
    boat: ["SendBoatAttackIntentEvent", ["dst", "troops"]],
    build: ["BuildUnitIntentEvent", ["unit", "tile", "rocketDirectionUp", "amount"]],
    upgrade: ["SendUpgradeStructureIntentEvent", ["unitId", "unitType", "amount"]],
    cancel: ["CancelAttackIntentEvent", ["attackID"]],
    move: ["MoveWarshipIntentEvent", ["unitIds", "tile"]],
    spawn: ["SendSpawnIntentEvent", ["tile"]]
  };
  function assignmentFields(Ctor) {
    const src = Function.prototype.toString.call(Ctor);
    const fields = [...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]);
    return [...new Set(fields)].sort();
  }
  var EventBridge = class {
    constructor(bus) {
      if (!(bus?.listeners instanceof Map) || typeof bus.emit !== "function") {
        throw new Error("OpenFront event system is incompatible with this version.");
      }
      this.bus = bus;
      this.events = {};
      const constructors = [...bus.listeners.keys()].filter((c) => typeof c === "function");
      for (const [key, [name, fields, handler]] of Object.entries(SPECS)) {
        const variants = [fields];
        if (key === "build") variants.push(["unit", "tile", "rocketDirectionUp"]);
        if (key === "upgrade") variants.push(["unitId", "unitType"]);
        let matches = constructors.filter((c) => c.name === name);
        if (!matches.length) {
          matches = constructors.filter((c) => {
            const found = assignmentFields(c).join(",");
            return variants.some((v) => [...v].sort().join(",") === found);
          });
        }
        if (handler && !matches.some((c) => c.name === name)) {
          matches = matches.filter(
            (c) => (bus.listeners.get(c) ?? []).some(
              (fn) => typeof fn === "function" && Function.prototype.toString.call(fn).includes("." + handler + "(")
            )
          );
        }
        if (matches.length === 1) this.events[key] = matches[0];
      }
      for (const required of ["attack", "build"]) {
        if (!this.events[required])
          throw new Error(`Cannot identify the game's ${required} command. No actions sent.`);
      }
    }
    supports(key) {
      return Boolean(this.events[key]);
    }
    emit(key, args) {
      const Ctor = this.events[key];
      if (!Ctor) throw new Error(`The ${key} command is unavailable in this client.`);
      this.bus.emit(Reflect.construct(Ctor, args));
    }
  };

  // src/adapter.js
  var GameAdapter = class {
    constructor(document2) {
      this.document = document2;
      this.game = null;
      this.lastMap = null;
    }
    connect() {
      const panel = this.document.querySelector("control-panel");
      const game = panel?.game;
      if (!game || typeof game.myPlayer !== "function") return false;
      if (game === this.game && panel.eventBus === this.bus) return true;
      for (const fn of [
        "config",
        "ticks",
        "ownerID",
        "owner",
        "neighbors",
        "players",
        "units",
        "ref",
        "isLand",
        "width",
        "height"
      ]) {
        if (typeof game[fn] !== "function")
          throw new Error(`Unsupported game client: missing ${fn}().`);
      }
      this.bridge = new EventBridge(panel.eventBus);
      this.panel = panel;
      this.game = game;
      this.bus = panel.eventBus;
      this.lastMap = null;
      return true;
    }
    sameGame(game) {
      return this.game === game && this.document.querySelector("control-panel")?.game === game;
    }
    autoSpawn(active) {
      const game = this.game, ourPlayer = game.myPlayer(), config = game.config();
      if (!active() || !this.sameGame(game) || !game.inSpawnPhase()) return "Waiting for the match.";
      if (config.isReplay?.() || config.isIntentionalSpectator?.())
        return "Replay or spectator mode: no spawn sent.";
      if (config.isRandomSpawn?.()) return "This lobby assigns random spawns; waiting for the game.";
      if (!this.bridge.supports("spawn"))
        return "Automatic spawn unavailable in this client; choose a starting point manually.";
      if (!this.spawnState || this.spawnState.game !== game)
        this.spawnState = { game, last: -Infinity };
      const state = this.spawnState;
      if (game.ticks() - state.last < SPAWN.recheckTicks)
        return "Monitoring the selected spawn while players join.";
      state.last = game.ticks();
      const current = ourPlayer?.spawnTile?.() ?? state.tile;
      const relocating = Boolean(ourPlayer?.hasSpawned?.());
      if (relocating && !Number.isInteger(current))
        return "Starting point confirmed; waiting for spawn coordinates.";
      const crowd = relocating ? spawnCrowding(game, current) : null;
      if (crowd && crowd.count < SPAWN.nearbyPlayerLimit && crowd.penalty < SPAWN.crowdingThreshold)
        return "Starting area has room; monitoring nearby players.";
      const tile = spawnCandidates(game).find(
        (t) => !crowd || spawnCrowding(game, t).count < crowd.count && spawnCrowding(game, t).penalty + SPAWN.relocationImprovement < crowd.penalty
      );
      if (tile === void 0) return "No suitable starting patch found; waiting for a valid spawn.";
      if (!active() || !this.sameGame(game) || !game.inSpawnPhase() || config.isRandomSpawn?.() || !validSpawn(game, tile))
        return "Spawn state changed; reconsidering.";
      state.tile = tile;
      this.bridge.emit("spawn", [tile]);
      return relocating ? "Moved to a less crowded starting area; continuing to monitor arrivals." : "Selected a starting point with expansion room and nearby port access.";
    }
    async snapshot() {
      const game = this.game, ourPlayer = game.myPlayer(), config = game.config();
      if (config.isReplay?.() || config.isIntentionalSpectator?.())
        return { inactive: "Replay or spectator mode", game };
      if (game.gameOver?.()) return { inactive: "Match finished", game };
      if (game.inSpawnPhase())
        return {
          inactive: "Choose your spawn; waiting for the match to start",
          waiting: true,
          game
        };
      if (!ourPlayer || !ourPlayer.isAlive() || ourPlayer.hasSpawned && !ourPlayer.hasSpawned())
        return { inactive: "No living player in this match", game };
      if (game.isCatchingUp?.())
        return { inactive: "Waiting for the game to catch up", waiting: true, game };
      const ticks = finite(game.ticks(), "game tick");
      if (!this.lastMap || ticks - this.lastMap.tick >= MAP_REFRESH_TICKS) {
        const { borderTiles } = await deadline(ourPlayer.borderTiles());
        if (!borderTiles || typeof borderTiles[Symbol.iterator] !== "function")
          throw new Error("Unsupported border data.");
        if (!this.sameGame(game)) throw new Error("The match changed while reading the map.");
        this.lastMap = this.mapSummary(game, ourPlayer, borderTiles, ticks);
      }
      const incoming = ourPlayer.incomingAttacks().filter((a) => !a.retreating);
      const outgoing = ourPlayer.outgoingAttacks().filter((a) => !a.retreating);
      const allUnits = unitsOf(
        game,
        ...STRUCTURES,
        U.warship,
        U.transport,
        U.atom,
        U.hydrogen,
        U.mirv
      );
      const own = ourPlayer.units().filter((unit) => !unit.isActive || unit.isActive()).map(unitData);
      const enemies = this.lastMap.fronts.filter((f) => f.id !== 0).flatMap((f) => {
        const player = game.playerBySmallID(f.id);
        if (!player?.isPlayer?.() || !player.isAlive() || friendly(ourPlayer, player)) return [];
        return [
          {
            ...f,
            raw: player,
            playerID: player.id(),
            name: player.name(),
            troops: finite(player.troops(), "enemy troops"),
            area: finite(player.numTilesOwned(), "enemy territory"),
            type: player.type(),
            traitor: player.isTraitor?.() ?? false
          }
        ];
      });
      const hostileUnits = allUnits.filter((unit) => !friendly(ourPlayer, unit.owner())).map(unitData);
      return {
        game,
        me: ourPlayer,
        config,
        tick: ticks,
        troops: finite(ourPlayer.troops(), "troops"),
        cap: Math.max(1, finite(config.maxTroops(ourPlayer), "troop capacity")),
        gold: finite(ourPlayer.gold(), "gold"),
        tiles: finite(ourPlayer.numTilesOwned(), "territory"),
        own,
        hostileUnits,
        enemies,
        incoming,
        outgoing,
        allOutgoing: ourPlayer.outgoingAttacks(),
        map: this.lastMap,
        players: game.players(),
        immunized: game.isSpawnImmunityActive?.() ?? false
      };
    }
    mapSummary(game, ourPlayer, borders, tick) {
      const ownID = ourPlayer.smallID(), points = sample(borders, 6e3);
      const fronts = /* @__PURE__ */ new Map(), shores = [], sites = /* @__PURE__ */ new Set();
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      for (const tile of points) {
        if (game.ownerID(tile) !== ownID) continue;
        const x = game.x(tile), y = game.y(tile);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const n of game.neighbors(tile)) {
          if (!game.isLand(n)) {
            if (!game.isImpassable?.(n)) shores.push(tile);
            continue;
          }
          const id = game.ownerID(n);
          if (id === ownID) continue;
          if (!fronts.has(id)) fronts.set(id, { id, tiles: [], border: [] });
          const f = fronts.get(id);
          f.tiles.push(n);
          f.border.push(tile);
        }
      }
      for (const borderTile of sample(points, 65)) {
        sites.add(borderTile);
        for (const d of [8, 24, 48, 80])
          for (const [dx, dy] of [
            [d, 0],
            [-d, 0],
            [0, d],
            [0, -d]
          ]) {
            const x = game.x(borderTile) + dx, y = game.y(borderTile) + dy;
            if (!game.isValidCoord(x, y)) continue;
            const t = game.ref(x, y);
            if (game.ownerID(t) === ownID && game.isLand(t)) sites.add(t);
          }
      }
      if (Number.isFinite(minX)) {
        const step = Math.max(5, Math.ceil(Math.sqrt((maxX - minX + 1) * (maxY - minY + 1) / 250)));
        for (let y = minY; y <= maxY; y += step)
          for (let x = minX; x <= maxX; x += step) {
            const t = game.ref(x, y);
            if (game.ownerID(t) === ownID && game.isLand(t)) sites.add(t);
          }
      }
      for (const unit of unitsOf(ourPlayer, ...STRUCTURES)) sites.add(unit.tile());
      return {
        tick,
        regions: sampleRegions(game),
        center: Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null,
        fronts: [...fronts.values()].map((f) => ({
          ...f,
          count: f.tiles.length,
          tiles: sample(new Set(f.tiles), 64),
          border: sample(new Set(f.border), 64)
        })),
        shores: sample(new Set(shores), 120),
        sites: sample(sites, 360)
      };
    }
    async buildOption(state, type, tile) {
      if (state.config.isUnitDisabled?.(type)) return null;
      const options = await deadline(state.me.buildables(tile, [type]));
      const b = options.find((b2) => b2.type === type);
      if (!b || !Number.isFinite(number(b.cost)) || number(b.cost) > number(state.me.gold()))
        return null;
      if (!((b.canBuild === false || Number.isInteger(b.canBuild)) && (b.canUpgrade === false || Number.isInteger(b.canUpgrade))))
        throw new Error("Unsupported build validation response.");
      if (b.canBuild === false && b.canUpgrade === false) return null;
      if (b.canUpgrade !== false && !this.bridge.supports("upgrade")) return null;
      return b;
    }
    // Revalidate against current state after asynchronous planning and before send.
    async execute(state, action, stillRunning) {
      const game = state.game, ourPlayer = game.myPlayer();
      const valid = () => stillRunning() && this.sameGame(game) && ourPlayer === game.myPlayer() && ourPlayer.isAlive() && !game.inSpawnPhase() && !game.gameOver?.() && !game.isCatchingUp?.();
      if (!valid()) return null;
      if (action.kind === "attack" || action.kind === "boat") {
        return executeAttack(this, state, action, ourPlayer, valid);
      }
      if (action.kind === "build") {
        return executeBuild(this, state, action, ourPlayer, valid);
      }
      if (["alliance", "reject", "extend"].includes(action.kind) && this.bridge.supports(action.kind)) {
        return executeDiplomacy(this, state, action, ourPlayer, valid);
      }
      if (action.kind === "cancel" && this.bridge.supports("cancel")) {
        return executeRecall(this, state, action, ourPlayer, valid);
      }
      return null;
    }
    checkpoint(ourPlayer) {
      return {
        tiles: ourPlayer.numTilesOwned(),
        troops: ourPlayer.troops(),
        units: new Map(ourPlayer.units().map((unit) => [unit.id(), unit.level()])),
        attacks: new Set(ourPlayer.outgoingAttacks().map((a) => a.id))
      };
    }
    confirmed(state, pending) {
      if (pending.diplomatic) return true;
      if (pending.counter)
        return state.incoming.filter((a) => !a.retreating && a.attackerID === pending.targetSmallID).reduce((n, a) => n + a.troops, 0) <= pending.counterIncoming - pending.troops * 0.5;
      if (pending.kind === "attack")
        return state.outgoing.some(
          (a) => a.targetID === pending.targetSmallID && (!pending.before.attacks.has(a.id) || state.troops < pending.before.troops - pending.troops * 0.5)
        ) || state.tiles > pending.before.tiles;
      if (pending.kind === "boat")
        return state.own.some(
          (unit) => unit.type === U.transport && !pending.before.units.has(unit.id)
        );
      if (pending.kind === "cancel") return !state.outgoing.some((a) => a.id === pending.attackID);
      return state.own.some(
        (unit) => unit.type === pending.unit && (pending.upgradeID !== null ? unit.id === pending.upgradeID && unit.level > pending.before.units.get(unit.id) : !pending.before.units.has(unit.id))
      );
    }
    nukeSafe(state, tile, type) {
      const owner = state.game.owner(tile);
      if (!owner.isPlayer?.() || friendly(state.me, owner)) return false;
      const radius = state.config.nukeMagnitudes?.(type)?.outer;
      if (!Number.isFinite(radius)) return false;
      const game = state.game, x0 = game.x(tile), y0 = game.y(tile);
      for (let y = Math.max(0, y0 - radius); y <= Math.min(game.height() - 1, y0 + radius); y++) {
        for (let x = Math.max(0, x0 - radius); x <= Math.min(game.width() - 1, x0 + radius); x++) {
          if ((x - x0) ** 2 + (y - y0) ** 2 > radius ** 2) continue;
          const player = game.owner(game.ref(x, y));
          if (friendly(state.me, player)) return false;
        }
      }
      return true;
    }
  };

  // src/strategy/nuclear.js
  function isNuclearEconomyReady(strategy, state) {
    const levels = (types) => state.own.filter((unit) => types.includes(unit.type) && !unit.building).reduce((n, unit) => n + unit.level, 0);
    return strategy.options.nukes && (state.game.ticksSinceStart?.() ?? 0) >= NUCLEAR.economyMinimumAgeTicks && levels([U.city]) >= 4 && levels([U.port, U.factory]) >= 3 && state.enemies.some((enemy) => !isAI(enemy)) && !state.enemies.some(isAI);
  }
  function findHydrogenTarget(strategy, state) {
    if (!strategy.nuclearEstablished(state) || !state.own.some((unit) => unit.type === U.silo && !unit.building) || (state.allOutgoing ?? state.outgoing).length || state.own.some((unit) => unit.type === U.transport) || strategy.cooldown("nuke", state.tick, COOLDOWNS.nuclearStrike) || state.config.isUnitDisabled?.(U.hydrogen))
      return null;
    const target = state.enemies.find((enemy) => enemy.playerID === strategy.focus) ?? [...state.enemies].sort((a, b) => a.troops - b.troops)[0];
    if (!target || isAI(target)) return null;
    const game = state.game, tiles = new Set(
      state.hostileUnits.filter((unit) => unit.owner === target.id).map((unit) => unit.tile)
    );
    const step = Math.max(12, Math.ceil(Math.sqrt(game.width() * game.height() / 700)));
    for (let y = step / 2 | 0; y < game.height(); y += step)
      for (let x = step / 2 | 0; x < game.width(); x += step) {
        const tile = game.ref(x, y);
        if (game.ownerID(tile) === target.id && game.isLand(tile)) tiles.add(tile);
      }
    const sams = state.hostileUnits.filter((unit) => unit.type === U.sam && !unit.building);
    const ranked = sample(tiles, 128).map((tile) => ({ tile, score: strikeValue(state, tile, target) })).sort((a, b) => b.score - a.score);
    for (const { tile } of ranked) {
      if (game.ownerID(tile) !== target.id || sams.some(
        (unit) => game.euclideanDistSquared(tile, unit.tile) <= ((state.config.samRange?.(unit.level) ?? NUCLEAR.defaultSamRange) + NUCLEAR.samSafetyMargin) ** 2
      ))
        continue;
      if (strategy.adapter.nukeSafe(state, tile, U.hydrogen))
        return { tile, targetID: target.playerID };
    }
    return null;
  }
  async function chooseNuclearStrike(strategy, state, active) {
    if (state.gold < NUCLEAR.hydrogenSavings) return null;
    const candidate = strategy.hydrogenCandidate(state);
    if (!candidate || !active()) return null;
    const option = await strategy.adapter.buildOption(state, U.hydrogen, candidate.tile);
    if (!active() || !option || option.canBuild === false) return null;
    return {
      kind: "build",
      unit: U.hydrogen,
      ...candidate,
      goldReserve: 0,
      reason: "Hydrogen strike at valuable enemy land and infrastructure outside known SAM coverage; reassess after impact, then invade."
    };
  }

  // src/strategy/naval.js
  async function chooseLanding(strategy, state, reserve, active) {
    if (!state.map.shores.length) return null;
    const game = state.game, candidates = /* @__PURE__ */ new Set();
    for (const shore of sample(state.map.shores, 16)) {
      for (const distance of [20, 45, 85, 150, 230])
        for (let angle = 0; angle < 12; angle++) {
          const x = Math.round(game.x(shore) + Math.cos(angle * Math.PI / 6) * distance);
          const y = Math.round(game.y(shore) + Math.sin(angle * Math.PI / 6) * distance);
          if (!game.isValidCoord(x, y)) continue;
          const tile = game.ref(x, y);
          if (coastalTile(game, tile) && game.ownerID(tile) !== state.me.smallID() && !friendly(state.me, game.owner(tile)))
            candidates.add(tile);
        }
    }
    const budget = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
    if (!Number.isFinite(budget) || budget < 100) return null;
    const nearbyAI = [...candidates].some((t) => {
      const player = game.owner(t);
      return player.isPlayer() && isAI(player);
    });
    const ranked = [...candidates].map((tile) => {
      const player = game.owner(tile);
      if (strategy.focus && player.id() !== strategy.focus) return null;
      if (!strategy.focus && nearbyAI && player.isPlayer() && !isAI(player)) return null;
      if (player.isPlayer() && budget < player.troops() * strategy.strengthRatio()) return null;
      if (state.enemies.some((enemy) => enemy.id === player.smallID())) return null;
      const nearest = Math.min(
        ...sample(state.map.shores, 30).map((t) => game.euclideanDistSquared(tile, t))
      );
      return {
        tile,
        owner: player,
        score: (player.isPlayer() ? isAI(player) ? 100 : 0 : 200) - Math.sqrt(nearest) / 15
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    for (const c of ranked.slice(0, 5)) {
      if (!active()) return null;
      const option = await strategy.adapter.buildOption(state, U.transport, c.tile);
      if (option && option.canBuild !== false && safeCrossing(state, option.canBuild, c.tile))
        return {
          kind: "boat",
          targetID: c.owner.id(),
          tile: c.tile,
          // Empty land needs a foothold, not the entire invasion budget. Keep
          // defended landings concentrated and never relax the crossing checks.
          troops: Math.floor(
            c.owner.isPlayer() ? budget : Math.min(
              budget,
              Math.max(NAVAL.wildernessMinimum, state.troops * NAVAL.wildernessShare)
            )
          ),
          reserve,
          minRatio: strategy.strengthRatio(),
          reason: c.owner.isPlayer() ? "Concentrated landing: direct water corridor clear of current hostile warship range." : "Small wilderness foothold: preserve troops at home while crossing a clear water corridor."
        };
    }
    return null;
  }

  // src/strategy/construction.js
  function updateNuclearThreat(strategy, state) {
    if (!state.hostileUnits.some((unit) => unit.type === U.silo)) {
      strategy.firstNuclearThreatTick = null;
      return false;
    }
    strategy.firstNuclearThreatTick ??= state.tick;
    return state.tick - strategy.firstNuclearThreatTick >= NUCLEAR.samDelayTicks;
  }
  async function chooseInvestment(strategy, state, reserve, active, defensiveOnly = false) {
    if (state.gold < 1e5 || state.tiles < 250) return null;
    const count = (type) => state.own.filter((unit) => unit.type === type).reduce((a, unit) => a + unit.level, 0);
    const cities = count(U.city), economy = count(U.port) + count(U.factory);
    const nuclearThreat = strategy.samReady(state);
    const threatened = humanAttacks(state).length > 0;
    const humanPressure = humanAttacks(state).reduce((n, a) => n + a.troops, 0);
    const huge = humanPressure >= Math.max(
      DEFENSE.hugeAttackTroops,
      state.cap * DEFENSE.hugeAttackCapacityShare,
      state.troops * DEFENSE.hugeAttackArmyShare
    );
    const preferCity = cities + economy === 0 || cities / (cities + economy) < (strategy.tuning.city ?? 0.6);
    const types = [];
    if (humanPressure >= Math.max(DEFENSE.minimumIncomingTroops, state.cap * DEFENSE.minimumCapacityShare) && count(U.defense) < (huge ? DEFENSE.emergencyPostLevels : DEFENSE.normalPostLevels) && !strategy.cooldown(
      U.defense,
      state.tick,
      huge ? COOLDOWNS.emergencyBuildingType : COOLDOWNS.defensePost
    ))
      types.push([U.defense, 150]);
    if (nuclearThreat && cities >= 2 && count(U.sam) < Math.max(2, Math.ceil(cities / 3)))
      types.push([U.sam, 110]);
    types.push([U.city, earlyCapacity(state) || huge ? 120 : preferCity ? 100 : 65]);
    if (state.map.shores.length) types.push([U.port, preferCity ? 65 : 100]);
    types.push([U.factory, state.map.shores.length ? 32 : preferCity ? 65 : 100]);
    if (strategy.options.navy && count(U.port) && state.gold > 45e4 && count(U.warship) < Math.min(3, count(U.port))) {
      types.push([U.warship, state.hostileUnits.some((unit) => unit.type === U.transport) ? 95 : 48]);
    }
    if (strategy.options.nukes && economy >= 3 && cities >= 3 && !count(U.silo) && state.gold >= NUCLEAR.siloSavings)
      types.push([U.silo, 78]);
    const savingHydrogen = !threatened && !earlyCapacity(state) && strategy.hydrogenCandidate(state) !== null;
    const savingSilo = !threatened && !earlyCapacity(state) && strategy.nuclearEstablished(state) && !state.own.some((unit) => unit.type === U.silo && !unit.building);
    const nuclearFund = savingHydrogen ? NUCLEAR.hydrogenSavings : savingSilo ? NUCLEAR.siloSavings : 0;
    const bank = huge ? 0 : nuclearThreat && !count(U.sam) ? 1e5 : threatened ? 5e4 : 0;
    for (const [type] of types.sort((a, b) => b[1] - a[1])) {
      if ((defensiveOnly || huge) && type !== U.defense && !(huge && type === U.city)) continue;
      if (!active()) return null;
      if (strategy.cooldown(
        type,
        state.tick,
        huge ? COOLDOWNS.emergencyBuildingType : COOLDOWNS.buildingType
      ) || state.config.isUnitDisabled?.(type))
        continue;
      if (state.own.some((unit) => unit.type === type && unit.building)) continue;
      const sites = strategy.sites(state, type);
      for (const tile of sites.slice(0, 16)) {
        if (!active()) return null;
        if (type === U.factory && factoryConnections(state, tile) === 0) continue;
        const option = await strategy.adapter.buildOption(state, type, tile);
        if (!option || number(option.cost) + (nuclearFund && type !== U.silo ? Math.max(bank, nuclearFund) : bank) > state.gold)
          continue;
        const upgrading = option.canUpgrade !== false;
        const actualTile = upgrading ? state.game.unit(option.canUpgrade)?.tile() : option.canBuild;
        if (actualTile === false || actualTile === void 0) continue;
        if (!safePlacement(state, actualTile, type) || type === U.defense && !defenseUseful(state, actualTile) || type === U.factory && factoryConnections(state, actualTile) === 0)
          continue;
        return {
          kind: "build",
          unit: type,
          tile,
          goldReserve: bank,
          reason: `${upgrading ? "Upgrade" : "Build"} ${type.toLowerCase()}${type === U.city ? " to raise troop capacity" : type === U.port || type === U.factory ? " to grow income" : " to protect the position"}.`
        };
      }
    }
    return null;
  }
  function distanceToEnemyBorder(strategy, state, tile, humansOnly = false) {
    let dist = 1e9;
    for (const enemy of state.enemies.filter((enemy2) => !humansOnly || !isAI(enemy2)))
      for (const b of sample(enemy.border, 16)) {
        dist = Math.min(dist, Math.sqrt(state.game.euclideanDistSquared(tile, b)));
      }
    return dist;
  }
  function rankBuildingSites(strategy, state, type) {
    const game = state.game, existing = state.own.filter((unit) => STRUCTURES.includes(unit.type));
    let tiles = type === U.port || type === U.warship ? state.map.shores : state.map.sites;
    tiles = [
      .../* @__PURE__ */ new Set([
        ...tiles,
        ...state.own.filter((unit) => unit.type === type && !unit.building).map((unit) => unit.tile)
      ])
    ];
    const border = state.enemies.filter((enemy) => type !== U.defense || !isAI(enemy)).flatMap((enemy) => sample(enemy.border, 12));
    if (type === U.defense) {
      const setback = [];
      for (const t of border)
        for (let a = 0; a < 12; a++)
          for (const r of [18, 23]) {
            const x = Math.round(game.x(t) + Math.cos(a * Math.PI / 6) * r);
            const y = Math.round(game.y(t) + Math.sin(a * Math.PI / 6) * r);
            if (game.isValidCoord(x, y)) setback.push(game.ref(x, y));
          }
      tiles = [.../* @__PURE__ */ new Set([...setback, ...tiles])].filter(
        (t) => safePlacement(state, t, type) && defenseUseful(state, t)
      );
    }
    const score = (t) => {
      const danger = strategy.danger(state, t, type === U.defense);
      const shore = Math.min(
        110,
        ...state.map.shores.map((b) => Math.sqrt(game.euclideanDistSquared(t, b)))
      );
      const near = existing.length ? Math.min(...existing.map((unit) => Math.sqrt(game.euclideanDistSquared(t, unit.tile)))) : 80;
      const same = state.own.find((unit) => unit.type === type && unit.tile === t);
      if (type === U.defense) {
        const covered = state.own.some(
          (unit) => unit.type === U.defense && game.euclideanDistSquared(t, unit.tile) < 25 ** 2
        );
        return 100 + Math.min(shore, 30) - Math.abs(danger - 23) - (covered ? 100 : 0);
      }
      if (type === U.factory) {
        const links = factoryConnections(state, t);
        return Math.min(danger, 110) + shore + Math.min(near, 75) + Math.min(links, 8) * 22 - (same ? same.level * 12 : 0);
      }
      if (type === U.sam) {
        const value = existing.filter(
          (unit) => [U.city, U.port, U.factory].includes(unit.type) && game.euclideanDistSquared(t, unit.tile) < 70 ** 2
        ).length * 15;
        const covered = state.own.some(
          (unit) => unit.type === U.sam && !unit.building && game.euclideanDistSquared(t, unit.tile) < 65 ** 2
        );
        return value + Math.min(danger, 60) - (covered ? 100 : 0);
      }
      if (type === U.port) {
        const others = unitsOf(state.game, U.port).filter(
          (unit) => unit.owner().smallID() !== state.me.smallID() && !state.me.hasEmbargo?.(unit.owner())
        );
        const route = others.length ? Math.max(
          ...sample(others, 30).map(
            (unit) => Math.sqrt(game.euclideanDistSquared(t, unit.tile()))
          )
        ) : 0;
        return Math.min(danger, 90) + Math.min(near, 65) + Math.min(route / 12, 60) - (same ? same.level * 10 : 0);
      }
      return Math.min(danger, 110) + shore + Math.min(near, 75) + (type === U.city ? Math.min(3, cityFactoryConnections(state, t)) * 15 : 0) + (terrainRank(game.terrainType?.(t)) ?? 0) * 12 - (same ? same.level * 12 : 0);
    };
    return tiles.filter(
      (t) => game.ownerID(t) === state.me.smallID() && game.isLand(t) && !game.hasFallout?.(t)
    ).map((tile) => ({ tile, score: score(tile) })).sort((a, b) => b.score - a.score).map((x) => x.tile);
  }

  // src/strategy/diplomacy.js
  function chooseDiplomacy(strategy, state, proposed) {
    if (state.config.disableAlliances?.()) return null;
    const fronts = state.map.fronts.filter((f) => f.id !== 0);
    const humans = state.players.filter(
      (player2) => isHuman(player2) && player2.id() !== state.me.id() && player2.isAlive() && (fronts.some((f) => f.id === player2.smallID()) || state.enemies.some((enemy) => enemy.playerID === player2.id()))
    );
    const target = strategy.focus ?? proposed ?? strategy.targetPool(state).filter(isAI).sort((a, b) => a.troops - b.troops)[0]?.playerID;
    const stronger = (player2) => {
      try {
        return state.config.maxTroops(player2) > state.cap * STRONGER_NEIGHBOR_CAPACITY_RATIO;
      } catch {
        return false;
      }
    };
    const humanTarget = humans.some((player2) => player2.id() === target);
    const future = humanTarget ? null : humans.filter(
      (player2) => player2.id() !== target && !friendly(state.me, player2) && !stronger(player2) && !state.me.isRequestingAllianceWith?.(player2)
    ).sort((a, b) => a.troops() - b.troops())[0];
    strategy.futureOpponent = future?.id() ?? null;
    const focus = state.enemies.find((enemy) => enemy.playerID === target), center = state.map.center;
    const offAxis = (player2) => {
      const front = state.enemies.find((enemy) => enemy.playerID === player2.id()) ?? fronts.find((f) => f.id === player2.smallID());
      if (!focus || !front || !center) return 0;
      const vector = (f) => {
        const points = f.border?.length ? f.border : f.tiles;
        return {
          x: points.reduce((n, t) => n + state.game.x(t), 0) / points.length - center.x,
          y: points.reduce((n, t) => n + state.game.y(t), 0) / points.length - center.y
        };
      };
      const a = vector(focus), b = vector(front);
      return 1 - (a.x * b.x + a.y * b.y) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
    };
    const limit = Math.max(0, humans.length - (humanTarget || future ? 1 : 0));
    const eligible = humans.filter(
      (player2) => player2.id() !== target && player2.id() !== strategy.futureOpponent && (stronger(player2) || humanTarget || !focus || offAxis(player2) >= 0.35) && (stronger(player2) || player2.troops() >= state.troops * 0.15 || (fronts.find((f) => f.id === player2.smallID())?.count ?? state.enemies.find((enemy) => enemy.playerID === player2.id())?.count ?? 0) >= 6)
    ).sort(
      (a, b) => Number(stronger(b)) - Number(stronger(a)) || offAxis(b) - offAxis(a) || b.troops() - a.troops()
    ).slice(0, limit);
    const wanted = new Set(eligible.map((player2) => player2.id()));
    const occupied = humans.filter(
      (player2) => player2.id() !== target && (friendly(state.me, player2) || state.me.isRequestingAllianceWith?.(player2))
    ).length;
    const room = (player2) => friendly(state.me, player2) || state.me.isRequestingAllianceWith?.(player2) || occupied < limit;
    if (strategy.adapter.bridge.supports("extend") && !strategy.cooldown("extend", state.tick, COOLDOWNS.diplomacy)) {
      const renewal = [...state.me.alliances?.() ?? []].filter(
        (a) => wanted.has(a.other) && a.expiresAt > state.tick && a.expiresAt - state.tick <= (state.config.allianceExtensionPromptOffset?.() ?? 300) && !strategy.cooldown(`diplomacy:${a.other}`, state.tick, COOLDOWNS.allianceRenewal)
      ).sort((a, b) => a.expiresAt - b.expiresAt)[0];
      if (renewal)
        return {
          kind: "extend",
          targetID: renewal.other,
          reason: "Renew the soonest-expiring useful flank before handling new offers."
        };
    }
    for (const player2 of state.players) {
      if (!player2.isRequestingAllianceWith?.(state.me) || strategy.cooldown(`diplomacy:${player2.id()}`, state.tick, COOLDOWNS.allianceResponse))
        continue;
      const kind = wanted.has(player2.id()) && room(player2) ? "alliance" : "reject";
      if (strategy.adapter.bridge.supports(kind))
        return {
          kind,
          targetID: player2.id(),
          reason: kind === "reject" ? `Decline ${player2.name()}: preserve expansion options and limit alliances.` : `Accept ${player2.name()}: useful protection on another flank.`
        };
    }
    if (strategy.cooldown("alliance", state.tick, COOLDOWNS.diplomacy) || strategy.cooldown("extend", state.tick, COOLDOWNS.diplomacy))
      return null;
    if (!strategy.adapter.bridge.supports("alliance") || occupied >= limit) return null;
    const player = eligible.find(
      (player2) => !friendly(state.me, player2) && !state.me.isRequestingAllianceWith?.(player2) && !strategy.cooldown(`diplomacy:${player2.id()}`, state.tick, COOLDOWNS.allianceOffer)
    );
    return player ? {
      kind: "alliance",
      targetID: player.id(),
      reason: `Offer ${player.name()} a flank alliance while preserving a future opponent.`
    } : null;
  }

  // src/strategy/combat.js
  function chooseLandAttack(strategy, state, reserve) {
    if (humanAttacks(state).length || state.own.some((unit) => unit.type === U.transport))
      return null;
    const budget = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
    const neutral = state.map.fronts.find((f) => f.id === 0);
    if ((!strategy.focus || earlyCapacity(state)) && neutral && landFrontAllowed(state, 0) && budget > Math.max(1200, state.cap * 0.035)) {
      const troops = Math.floor(Math.min(budget, state.troops * strategy.tuning.neutral));
      return {
        kind: "attack",
        targetID: null,
        tile: neutral.tiles[0],
        troops,
        reserve,
        reason: "Opening expansion: capture wilderness before starting the next conquest."
      };
    }
    const candidates = [];
    for (const enemy of strategy.targetPool(state)) {
      if (!landFrontAllowed(state, enemy.id)) continue;
      const waves = state.allOutgoing ?? state.outgoing;
      if (waves.some((a) => {
        const other = state.enemies.find((enemy2) => enemy2.id === a.targetID);
        return !other || a.troops < other.troops * MIN_AI_ATTACK_RATIO;
      }))
        continue;
      const ideal = isAI(enemy) ? MIN_AI_ATTACK_RATIO : strategy.strengthRatio();
      if (budget < 2500) continue;
      const forecast = strategy.forecast(state, enemy, budget);
      let minRatio = ideal;
      if ((state.troops / state.cap >= NEAR_CAPACITY_THRESHOLD || earlyCapacity(state)) && forecast && forecast.gain >= Math.min(enemy.area, Math.max(120, enemy.area * 0.35)))
        minRatio = isAI(enemy) ? 0.9 : 1.05;
      const growth = !isAI(enemy) && forecast && forecast.gain >= Math.min(enemy.area, 120) && growthAdvantage(state, enemy, budget);
      if (growth) minRatio = Math.min(minRatio, 0.85);
      if (budget < enemy.troops * minRatio) continue;
      if (!forecast || forecast.gain < Math.min(60, enemy.area * 0.2)) continue;
      const finish = forecast.gain >= enemy.area ? 3 : 1;
      const score = forecast.gain / Math.max(100, forecast.loss) * 2500 * finish + (enemy.traitor ? 12 : 0) + compactnessScore(state, enemy) * 3 + captureValue(state, enemy, forecast);
      let troops = budget;
      if (isAI(enemy) && state.enemies.filter(isAI).length >= 2 && forecast.gain > 0) {
        troops = Math.min(
          budget,
          Math.max(
            2500,
            enemy.troops * minRatio,
            enemy.area * forecast.loss / forecast.gain / 0.55
          )
        );
      }
      candidates.push({
        kind: "attack",
        targetID: enemy.playerID,
        tile: enemy.tiles[0],
        troops: Math.min(Math.floor(budget), Math.ceil(troops)),
        reserve,
        minRatio,
        score,
        growth: Boolean(growth),
        aiPolicy: isAI(enemy),
        secondary: waves.length > 0,
        reason: `${waves.length ? "Second AI conquest" : strategy.focus ? "Finish" : "Conquer"} ${enemy.name}: ${(troops / Math.max(1, enemy.troops)).toFixed(1)}\xD7 defending troops; preserve reserves.`
      });
    }
    return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  }
  function chooseCounterattack(strategy, state) {
    if (state.immunized) return null;
    const attacks = humanAttacks(state), totals = /* @__PURE__ */ new Map();
    for (const a of attacks) totals.set(a.attackerID, (totals.get(a.attackerID) ?? 0) + a.troops);
    for (const [id, incoming] of [...totals].sort((a, b) => b[1] - a[1])) {
      const enemy = state.enemies.find((enemy2) => enemy2.id === id);
      if (!enemy || isAI(enemy) || !enemy.tiles.length) continue;
      if (!structureThreatened(state, id)) continue;
      const other = attacks.filter((a) => a.attackerID !== id).reduce((n, a) => n + a.troops, 0);
      const reserve = Math.max(state.cap * 0.18, other * 1.15);
      const troops = Math.floor(
        Math.min(incoming, state.troops * MAX_TROOP_SEND_FRACTION, state.troops - reserve)
      );
      if (!Number.isFinite(troops) || troops < 100) continue;
      return {
        kind: "attack",
        targetID: enemy.playerID,
        tile: enemy.tiles[0],
        troops,
        reserve,
        counter: true,
        minRatio: 0,
        reason: `Counter ${enemy.name}: cancel up to ${troops.toLocaleString()} incoming troops${troops < incoming ? "; partial cancellation" : ""}.`
      };
    }
    return null;
  }
  function chooseReinforcement(strategy, state, reserve) {
    const waves = state.allOutgoing ?? state.outgoing;
    const ids = [...new Set(waves.map((a) => a.targetID))];
    const choices = ids.map((id) => {
      if (!landFrontAllowed(state, id, true)) return null;
      const enemy2 = state.enemies.find((enemy3) => enemy3.id === id);
      const neutral2 = id === 0 ? state.map.fronts.find((f) => f.id === 0) : null;
      if (!enemy2 && !neutral2) return null;
      const committed2 = waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0);
      let ideal2 = enemy2 ? enemy2.troops * (isAI(enemy2) ? MIN_AI_ATTACK_RATIO : strategy.strengthRatio()) : state.cap * 0.15;
      if (enemy2 && isAI(enemy2)) {
        const estimate = strategy.forecast(
          state,
          enemy2,
          Math.max(committed2, state.troops - reserve)
        );
        if (estimate?.gain > 0)
          ideal2 = Math.max(ideal2, enemy2.area * estimate.loss / estimate.gain / 0.65);
      }
      return { enemy: enemy2, neutral: neutral2, committed: committed2, ideal: ideal2, deficit: ideal2 - committed2 };
    }).filter(Boolean).sort((a, b) => b.deficit - a.deficit);
    const choice = choices[0];
    if (!choice) return null;
    const { enemy, neutral, ideal, committed } = choice, capped = state.troops / state.cap >= NEAR_CAPACITY_THRESHOLD || earlyCapacity(state);
    if (!capped && committed >= ideal) return null;
    const incoming = humanAttacks(state).reduce((n, a) => n + a.troops, 0);
    reserve = Math.max(reserve, incoming ? state.cap * 0.25 + incoming * 1.25 : 0);
    const available = Math.min(state.troops - reserve, state.troops * strategy.tuning.attack);
    const troops = Math.floor(
      Math.min(available, Math.max(ideal - committed, capped ? state.troops * 0.25 : 0))
    );
    if (!Number.isFinite(troops) || troops < Math.max(200, state.cap * 5e-3)) return null;
    return {
      kind: "attack",
      targetID: enemy?.playerID ?? null,
      tile: (enemy ?? neutral).tiles[0],
      troops,
      reserve,
      reinforce: true,
      minRatio: 0,
      secondary: enemy && strategy.focus !== enemy.playerID,
      reason: `Reinforce ${enemy?.name ?? "wilderness expansion"} with ${troops.toLocaleString()} troops.`
    };
  }
  function forecastConquest(strategy, state, enemy, budget) {
    const game = state.game;
    const defenses = state.hostileUnits.filter(
      (unit) => unit.owner === enemy.id && unit.type === U.defense && !unit.building
    );
    const radius = state.config.defensePostRange?.() ?? DEFENSE.defaultPostRange;
    let totalLoss = 0, fraction = 0, n = 0;
    for (const tile of sample(enemy.tiles, 8)) {
      const defended = defenses.some(
        (unit) => game.euclideanDistSquared(tile, unit.tile) <= radius * radius
      );
      let loss2, f;
      if (state.config.attackLogic?.length === 1) {
        const result = state.config.attackLogic({
          terrain: game.terrainType(tile),
          attackTroops: budget,
          attacker: { type: state.me.type(), numTiles: state.tiles },
          defender: {
            type: enemy.type,
            numTiles: Math.max(1, enemy.area),
            troops: enemy.troops,
            isTraitor: enemy.traitor,
            isDisconnectedTeammate: false
          },
          defenderHasDefensePost: defended,
          falloutRatio: game.hasFallout?.(tile) ? 0 : null,
          borderSize: Math.max(1, enemy.count)
        });
        loss2 = result.attackerTroopLoss;
        f = result.tickFraction;
      } else {
        const terrain = terrainRank(game.terrainType?.(tile));
        const rough = terrain === 2 ? 1.6 : terrain === 1 ? 1.3 : 1;
        loss2 = (20 + enemy.troops / Math.max(1, enemy.area) * 1.5) * rough * (defended ? 5 : 1) * clamp(enemy.troops / budget, 0.6, 2) * (enemy.type === "BOT" ? 0.5 : 1);
        f = 0.3 * rough * (defended ? 3 : 1) / Math.max(1, enemy.count);
      }
      if (!Number.isFinite(loss2) || !Number.isFinite(f) || loss2 < 0 || f <= 0) return null;
      totalLoss += loss2;
      fraction += f;
      n++;
    }
    if (!n) return null;
    const loss = totalLoss / n, tickFraction = fraction / n;
    const gain = Math.min(enemy.area, budget * 0.7 / Math.max(1, loss));
    return { gain, loss: gain * loss };
  }

  // src/learning.js
  var LEARNING_KEY = "openfront-pilot-learning-v1";
  var LIMITS = Object.freeze({
    contexts: 12,
    history: 24,
    seen: 128,
    outcomes: 1e3,
    bytes: 65536
  });
  var VARIANTS = Object.freeze(
    [
      {
        id: "baseline",
        name: "Original balance",
        reserve: 0,
        advantage: 1,
        neutral: 0.22,
        attack: 0.7,
        city: 0.6
      },
      {
        id: "guarded",
        name: "Larger reserves",
        reserve: 0.05,
        advantage: 1.1,
        neutral: 0.2,
        attack: 0.66,
        city: 0.6
      },
      {
        id: "opportunist",
        name: "Earlier attacks",
        reserve: -0.04,
        advantage: 0.9,
        neutral: 0.22,
        attack: 0.7,
        city: 0.6
      },
      {
        id: "expander",
        name: "Faster expansion",
        reserve: 0,
        advantage: 1,
        neutral: 0.29,
        attack: 0.72,
        city: 0.6
      },
      {
        id: "measured",
        name: "Smaller troop sends",
        reserve: 0,
        advantage: 1,
        neutral: 0.16,
        attack: 0.64,
        city: 0.6
      },
      {
        id: "cities",
        name: "Earlier city growth",
        reserve: 0,
        advantage: 1,
        neutral: 0.22,
        attack: 0.7,
        city: 0.64
      },
      {
        id: "income",
        name: "Income before cities",
        reserve: 0,
        advantage: 1,
        neutral: 0.22,
        attack: 0.7,
        city: 0.56
      }
    ].map(Object.freeze)
  );
  var empty = () => ({
    version: 1,
    total: 0,
    wins: 0,
    contexts: [],
    history: [],
    seen: [],
    outcomes: []
  });
  var arm = () => ({ games: 0, wins: 0, weight: 0, reward: 0 });
  var bounded = (n, max = 1e9) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
  var text = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max;
  function validateModel(raw) {
    if (typeof raw !== "string" || raw.length * 2 > LIMITS.bytes)
      throw new Error("Learning file exceeds 64 KiB.");
    const d = JSON.parse(raw);
    if (d?.version !== 1 || !Number.isInteger(d.total) || !bounded(d.total) || !Number.isInteger(d.wins) || !bounded(d.wins, d.total) || !Array.isArray(d.contexts) || d.contexts.length > LIMITS.contexts || !Array.isArray(d.history) || d.history.length > LIMITS.history || !Array.isArray(d.seen) || d.seen.length > LIMITS.seen)
      throw new Error("Unsupported learning file.");
    const contexts = d.contexts.map((c) => {
      if (!text(c.key, 180) || !bounded(c.used) || !Array.isArray(c.arms) || c.arms.length !== VARIANTS.length)
        throw new Error("Invalid strategy statistics.");
      const arms = c.arms.map((a) => {
        if (!Number.isInteger(a.games) || !bounded(a.games) || !Number.isInteger(a.wins) || !bounded(a.wins, a.games) || !bounded(a.weight, 51) || !bounded(a.reward, a.weight + 1e-9))
          throw new Error("Invalid strategy scores.");
        return { games: a.games, wins: a.wins, weight: a.weight, reward: a.reward };
      });
      return { key: c.key, used: c.used, arms };
    });
    if (new Set(contexts.map((c) => c.key)).size !== contexts.length)
      throw new Error("Duplicate learning contexts.");
    const history = d.history.map((h) => {
      if (!text(h.id, 100) || !text(h.context, 180) || !VARIANTS.some((v) => v.id === h.variant) || typeof h.win !== "boolean" || !bounded(h.ticks) || !bounded(h.commands) || !bounded(h.coverage, 1) || !bounded(h.date, 1e15))
        throw new Error("Invalid match summary.");
      const reward = h.reward ?? Number(h.win);
      if (!bounded(reward, 1)) throw new Error("Invalid match reward.");
      let territory = null;
      if (h.territory != null) {
        const t = h.territory;
        if (!bounded(t.peakShare, 1) || !bounded(t.averageShare, t.peakShare + 1e-9) || !bounded(t.observedTicks, h.ticks))
          throw new Error("Invalid territory summary.");
        territory = {
          peakShare: t.peakShare,
          averageShare: t.averageShare,
          observedTicks: t.observedTicks
        };
      }
      return {
        reward,
        territory,
        id: h.id,
        context: h.context,
        variant: h.variant,
        win: h.win,
        ticks: h.ticks,
        commands: h.commands,
        coverage: h.coverage,
        date: h.date
      };
    });
    if (d.seen.some((s) => !text(s, 100))) throw new Error("Invalid match identifiers.");
    const outcomes = d.outcomes ?? history.map((h) => h.win);
    if (!Array.isArray(outcomes) || outcomes.length > Math.min(d.total, LIMITS.outcomes) || outcomes.some((w) => typeof w !== "boolean"))
      throw new Error("Invalid recent outcomes.");
    return {
      version: 1,
      total: d.total,
      wins: d.wins,
      contexts,
      history,
      seen: [...new Set(d.seen)],
      outcomes
    };
  }
  function contextKey(game, options) {
    const config = game.config().gameConfig?.() ?? {};
    const part = (x) => String(x ?? "unknown").replace(/[|]/g, "_").slice(0, 24);
    const custom = Boolean(config.infiniteGold || config.infiniteTroops || config.instantBuild);
    return [
      "conquest-v12-early-navy",
      config.gameType,
      config.gameMode,
      config.difficulty,
      custom ? "custom" : "normal",
      options.profile,
      `${+options.economy}${+options.navy}${+options.nukes}${+(options.diplomacy !== false)}`
    ].map(part).join("|");
  }
  var optionsKey = (o) => JSON.stringify([o.profile, o.economy, o.navy, o.nukes, o.learning, o.diplomacy !== false]);
  var LearningStore = class {
    constructor(storage = null, locks = null) {
      this.storage = storage;
      this.locks = locks;
      this.data = empty();
      this.warning = "";
      this.dirty = false;
      this.reload();
    }
    reload() {
      if (this.dirty) return;
      if (!this.storage) {
        this.warning = "Storage unavailable: learning lasts only in this tab.";
        return;
      }
      try {
        const raw = this.storage.getItem(LEARNING_KEY);
        this.data = raw ? validateModel(raw) : empty();
        this.warning = "";
      } catch {
        this.warning = "Saved learning could not be read; using the current in-memory model.";
      }
    }
    persist() {
      const raw = JSON.stringify(this.data);
      if (raw.length * 2 > LIMITS.bytes) throw new Error("Learning memory exceeded its size limit.");
      try {
        if (!this.storage) throw new Error("no storage");
        this.storage.setItem(LEARNING_KEY, raw);
        this.warning = "";
        this.dirty = false;
      } catch {
        this.dirty = true;
        this.warning = "Could not save learning: changes last only in this tab. Export a backup.";
      }
    }
    context(key, create = false) {
      let c = this.data.contexts.find((c2) => c2.key === key);
      if (!c && create) {
        if (this.data.contexts.length >= LIMITS.contexts) {
          this.data.contexts.sort((a, b) => a.used - b.used).shift();
        }
        c = { key, used: this.data.total, arms: VARIANTS.map(arm) };
        this.data.contexts.push(c);
      }
      return c;
    }
    select(key) {
      this.reload();
      const c = this.context(key), stats = c?.arms ?? VARIANTS.map(arm);
      const untried = stats.findIndex((a) => a.games === 0);
      let index = untried;
      if (index < 0) {
        const total = stats.reduce((s, a) => s + a.weight, 0);
        const score = (a) => (a.reward + 1) / (a.weight + 2) + 0.35 * Math.sqrt(Math.log(total + 1) / (a.weight + 1));
        index = stats.reduce((best, a, i) => score(a) > score(stats[best]) ? i : best, 0);
      }
      return VARIANTS[index];
    }
    async record(summary, accept = () => true) {
      const commit = () => {
        if (!accept()) return false;
        this.reload();
        if (this.data.seen.includes(summary.id)) return false;
        const index = VARIANTS.findIndex((v) => v.id === summary.variant);
        if (index < 0 || typeof summary.win !== "boolean" || !text(summary.id, 100) || !text(summary.context, 180))
          throw new Error("Invalid learning result.");
        const reward = summary.reward ?? Number(summary.win);
        if (!bounded(reward, 1)) throw new Error("Invalid match reward.");
        const next = structuredClone(this.data);
        const old = this.data;
        this.data = next;
        try {
          const c = this.context(summary.context, true);
          for (const a2 of c.arms) {
            a2.weight *= 0.98;
            a2.reward *= 0.98;
          }
          const a = c.arms[index];
          a.games++;
          a.wins += +summary.win;
          a.weight++;
          a.reward += reward;
          this.data.outcomes = [...this.data.outcomes, summary.win].slice(-LIMITS.outcomes);
          this.data.total++;
          this.data.wins += +summary.win;
          c.used = this.data.total;
          this.data.history.push({ ...summary, date: Date.now() });
          this.data.history = this.data.history.slice(-LIMITS.history);
          this.data.seen = [...this.data.seen, summary.id].slice(-LIMITS.seen);
          this.data = validateModel(JSON.stringify(this.data));
          this.persist();
          return true;
        } catch (error) {
          this.data = old;
          throw error;
        }
      };
      return this.locks?.request ? this.locks.request(LEARNING_KEY, commit) : commit();
    }
    async reset(accept = () => true) {
      const reset = () => {
        if (!accept()) return;
        this.data = empty();
        this.persist();
      };
      return this.locks?.request ? this.locks.request(LEARNING_KEY, reset) : reset();
    }
    async import(raw, accept = () => true) {
      const data = validateModel(raw);
      const save = () => {
        if (!accept()) return;
        this.data = data;
        this.persist();
      };
      return this.locks?.request ? this.locks.request(LEARNING_KEY, save) : save();
    }
    export() {
      return JSON.stringify(this.data);
    }
    winRate(window = 20) {
      const requested = Number.isFinite(Number(window)) ? Math.max(1, Math.min(LIMITS.outcomes, Math.floor(Number(window)))) : 20;
      const outcomes = this.data.outcomes.slice(-requested), games = outcomes.length;
      const wins = outcomes.filter(Boolean).length;
      return { requested, games, wins, percent: games ? wins / games * 100 : null };
    }
    summary(key) {
      const context = this.context(key);
      const rows = context?.arms.map((a, i) => ({ ...a, name: VARIANTS[i].name })) ?? [];
      return {
        total: this.data.total,
        wins: this.data.wins,
        bytes: JSON.stringify(this.data).length * 2,
        contexts: this.data.contexts.length,
        warning: this.warning,
        rows,
        recent: this.data.history.slice(-8).reverse()
      };
    }
  };

  // src/strategy.js
  var Strategy = class {
    constructor(adapter, options = {}, tuning = VARIANTS[0]) {
      this.adapter = adapter;
      this.options = { ...DEFAULTS, ...options };
      this.last = /* @__PURE__ */ new Map();
      this.tuning = tuning;
      this.focus = null;
      this.futureOpponent = null;
      this.blast = null;
      this.firstNuclearThreatTick = null;
    }
    // Action history and campaign state persist between decisions in one match.
    cooldown(key, tick, duration) {
      return tick - (this.last.get(key) ?? -1e9) < duration;
    }
    record(a, tick) {
      this.last.set(a.kind, tick);
      if (a.unit === U.hydrogen && a.targetID) {
        this.focus = a.targetID;
        this.blast = { targetID: a.targetID, tick };
      }
      if (a.counter) this.last.set("counter", tick);
      if (["attack", "boat"].includes(a.kind) && a.targetID != null && !a.counter && !a.secondary)
        this.focus = a.targetID;
      if (["alliance", "reject", "extend"].includes(a.kind))
        this.last.set(`diplomacy:${a.targetID}`, tick);
      if (a.unit) this.last.set(a.unit, tick);
      if (a.targetID != null) this.last.set(`target:${a.targetID}`, tick);
    }
    reserves(state) {
      const profile = PROFILES[this.options.profile] ?? PROFILES.balanced;
      const nonBots = state.enemies.filter((enemy) => !isAI(enemy) && enemy.playerID !== this.focus);
      const strongest = Math.max(0, ...nonBots.map((enemy) => enemy.troops));
      const incoming = humanAttacks(state).reduce((sum, a) => sum + a.troops, 0);
      const ratio = clamp(profile.reserve + this.tuning.reserve - (nonBots.length ? 0 : 0.06), 0.2, 0.5) + (nonBots.length > 1 ? 0.07 : 0) + (incoming ? 0.12 : 0);
      return Math.min(
        state.cap * 0.82,
        Math.max(state.cap * ratio, strongest * 0.28, incoming * 0.95)
      );
    }
    syncFocus(state) {
      if (this.focus) {
        const player = state.players.find((player2) => player2.id() === this.focus);
        if (player && (!player.isAlive() || friendly(state.me, player))) this.focus = null;
      }
      if (!this.focus) {
        const wave = (state.allOutgoing ?? state.outgoing).find((a) => a.targetID !== 0);
        const enemy = wave && state.enemies.find((enemy2) => enemy2.id === wave.targetID);
        if (enemy) this.focus = enemy.playerID;
      }
    }
    targetPool(state) {
      if (this.focus) {
        const primary = state.enemies.find((enemy) => enemy.playerID === this.focus);
        const waves = state.allOutgoing ?? state.outgoing;
        if (primary && isAI(primary) && waves.some((a) => a.targetID === primary.id))
          return state.enemies.filter(isAI);
        return primary ? [primary] : [];
      }
      const ai = state.enemies.filter(isAI);
      return ai.length ? ai : state.enemies;
    }
    strengthRatio() {
      return Math.max(
        MIN_HUMAN_ATTACK_RATIO,
        (PROFILES[this.options.profile] ?? PROFILES.balanced).advantage * this.tuning.advantage
      );
    }
    async choose(state, active = () => true) {
      this.syncFocus(state);
      this.samReady(state);
      const reserve = this.reserves(state), ratio = state.troops / state.cap;
      const humanIncoming = humanAttacks(state);
      const counter = this.counterattack(state);
      if (counter && !this.cooldown("counter", state.tick, COOLDOWNS.counter)) return counter;
      if (humanIncoming.length && state.troops < reserve * 0.65 && this.adapter.bridge.supports("cancel")) {
        const retreat = [...state.outgoing].sort((a, b) => b.troops - a.troops)[0];
        if (retreat && !this.cooldown("cancel", state.tick, COOLDOWNS.recall))
          return {
            kind: "cancel",
            attackID: retreat.id,
            reason: "Recall troops: reserve is critically low under attack."
          };
      }
      const reinforcement = this.reinforce(state, reserve);
      const attack = humanIncoming.length ? null : this.attack(state, reserve);
      if (this.options.economy && humanIncoming.length && !this.cooldown("build", state.tick, COOLDOWNS.emergencyBuild)) {
        const defense = await this.investment(state, reserve, active, true);
        if (!active()) return null;
        if (defense) return defense;
      }
      if (this.options.diplomacy) {
        const diplomatic = this.diplomacy(state, attack?.targetID);
        if (diplomatic) return diplomatic;
      }
      if (!humanIncoming.length && earlyCapacity(state) && !state.immunized) {
        if (reinforcement && !this.cooldown("attack", state.tick, COOLDOWNS.attack))
          return reinforcement;
        if (attack && !this.cooldown("attack", state.tick, COOLDOWNS.attack)) return attack;
      }
      if (reinforcement && !this.cooldown("attack", state.tick, COOLDOWNS.reinforcement))
        return reinforcement;
      if (attack && attack.targetID === this.focus && isAI(state.enemies.find((enemy) => enemy.playerID === this.focus)) && !state.immunized && !this.cooldown("attack", state.tick, COOLDOWNS.attack))
        return attack;
      if (!humanIncoming.length && this.options.nukes && !state.immunized) {
        if (this.blast && (state.own.some((unit) => unit.type === U.hydrogen) || state.tick - this.blast.tick < NUCLEAR.missileObservationTicks))
          return this.wait("Hydrogen strike in flight; wait before committing the invasion.");
        if (this.blast) this.blast = null;
        const strike = await this.nuclear(state, active);
        if (!active()) return null;
        if (strike) return strike;
      }
      const age = state.game.ticksSinceStart?.();
      if (Number.isFinite(age) && age >= 0 && age < EARLY_GAME_TICKS && this.options.navy && !humanIncoming.length && !state.immunized && this.adapter.bridge.supports("boat") && !this.cooldown("boat", state.tick, COOLDOWNS.navalLanding) && !(state.allOutgoing ?? state.outgoing).length && !state.own.some((unit) => unit.type === U.transport) && state.troops > reserve + 1e3) {
        const boat = await this.landing(state, reserve, active);
        if (!active()) return null;
        if (boat) return boat;
      }
      if (this.options.economy && !this.cooldown("build", state.tick, COOLDOWNS.routineBuild)) {
        const build = await this.investment(state, reserve, active);
        if (!active()) return null;
        if (build) return build;
      }
      if (reinforcement && !this.cooldown("attack", state.tick, COOLDOWNS.reinforcement))
        return reinforcement;
      if (humanIncoming.length)
        return this.wait(
          "Human attack: hold against the push and build useful defenses; counter immediately only to protect structures."
        );
      if (attack && !state.immunized && !this.cooldown("attack", state.tick, COOLDOWNS.attack))
        return attack;
      const busy = (state.allOutgoing ?? state.outgoing).length > 0 || state.own.some((unit) => unit.type === U.transport);
      if (busy)
        return this.wait(
          "Maintain the current target; reinforce when useful without opening a second front."
        );
      if (state.troops <= reserve + 1e3)
        return this.wait(`Rebuilding a concentrated army: ${Math.round(ratio * 100)}% of capacity.`);
      if (state.immunized) return this.wait("Waiting for spawn immunity to end.");
      if (attack && !this.cooldown("attack", state.tick, COOLDOWNS.attack)) return attack;
      if (this.options.navy && this.adapter.bridge.supports("boat") && !this.cooldown("boat", state.tick, COOLDOWNS.navalLanding) && (this.focus || !state.enemies.length) && !state.map.fronts.some((f) => f.id === 0)) {
        const boat = await this.landing(state, reserve, active);
        if (!active()) return null;
        if (boat) return boat;
      }
      if (this.focus && this.options.nukes && !this.cooldown("nuke", state.tick, COOLDOWNS.nuclearRecheck)) {
        const nuke = await this.nuclear(state, active);
        if (nuke) return nuke;
      }
      if (ratio >= NEAR_CAPACITY_THRESHOLD)
        return this.wait(
          "Army near capacity: no cost-effective attack or safe route found; prioritize capacity and defenses."
        );
      return this.wait(
        this.focus ? "Keep the conquest target: gathering a larger force or waiting for a safe route." : "Waiting for enough troops to overwhelm a nearby tribe or nation before targeting players."
      );
    }
    wait(reason) {
      return { kind: "wait", reason };
    }
    // Stable entry points for the controller, other policies, and regression tests.
    // The actual decisions live in the named strategy modules imported above.
    attack(state, reserve) {
      return chooseLandAttack(this, state, reserve);
    }
    counterattack(state) {
      return chooseCounterattack(this, state);
    }
    reinforce(state, reserve) {
      return chooseReinforcement(this, state, reserve);
    }
    diplomacy(state, proposed) {
      return chooseDiplomacy(this, state, proposed);
    }
    forecast(state, enemy, budget) {
      return forecastConquest(this, state, enemy, budget);
    }
    samReady(state) {
      return updateNuclearThreat(this, state);
    }
    investment(state, reserve, active, defensiveOnly = false) {
      return chooseInvestment(this, state, reserve, active, defensiveOnly);
    }
    danger(state, tile, humansOnly = false) {
      return distanceToEnemyBorder(this, state, tile, humansOnly);
    }
    sites(state, type) {
      return rankBuildingSites(this, state, type);
    }
    landing(state, reserve, active) {
      return chooseLanding(this, state, reserve, active);
    }
    nuclearEstablished(state) {
      return isNuclearEconomyReady(this, state);
    }
    hydrogenCandidate(state) {
      return findHydrogenTarget(this, state);
    }
    nuclear(state, active) {
      return chooseNuclearStrike(this, state, active);
    }
  };

  // src/controller.js
  var PilotController = class {
    constructor(adapter, report = () => {
    }, options = {}, learning = null) {
      this.adapter = adapter;
      this.report = report;
      this.options = { ...DEFAULTS, ...options };
      this.running = false;
      this.epoch = 0;
      this.pending = null;
      this.busy = false;
      this.lastTick = null;
      this.tickTime = 0;
      this.commands = 0;
      this.learning = learning;
      this.stopped = false;
    }
    start({ explicit = false } = {}) {
      if (this.stopped && !explicit) return;
      if (this.running) return;
      if (!this.adapter.connect()) {
        this.report({
          status: "waiting",
          message: "Join a match, choose a spawn, then press Start."
        });
        return;
      }
      const same = this.game === this.adapter.game;
      this.game = this.adapter.game;
      this.epoch++;
      this.running = true;
      this.stopped = false;
      this.pending = null;
      this.lastTick = null;
      if (!same || !this.strategy) this.strategy = new Strategy(this.adapter, this.options);
      this.learning?.control(true);
      this.report({ status: "running", message: "Pilot started. Waiting for fresh game state." });
    }
    pause(message = "Paused. You have control.", interrupted = false) {
      if (this.stopped) return;
      this.learning?.control(false);
      if (interrupted) this.learning?.invalidate(message);
      this.running = false;
      this.epoch++;
      this.pending = null;
      this.report({ status: "paused", message });
    }
    emergencyStop(message = "Emergency stop: bot and learning halted. Click Start to resume.") {
      this.running = false;
      this.stopped = true;
      this.epoch++;
      this.pending = null;
      try {
        this.learning?.abort();
      } catch {
      }
      this.report({ status: "stopped", message });
    }
    async step(now = Date.now()) {
      if (this.stopped) return;
      try {
        this.learning?.poll(this.game, this.running, this.options, this.adapter.sameGame(this.game));
      } catch {
        this.learning?.invalidate("Learning could not read the match state.");
      }
      if (this.busy || !this.running) return;
      this.busy = true;
      const epoch = this.epoch, active = () => this.running && this.epoch === epoch && this.adapter.sameGame(this.game);
      try {
        if (!this.adapter.sameGame(this.game)) {
          if (this.adapter.connect() && this.adapter.game !== this.game) {
            this.game = this.adapter.game;
            this.epoch++;
            this.pending = null;
            this.lastTick = null;
            this.strategy = new Strategy(this.adapter, this.options);
            this.report({
              status: "waiting",
              message: "New match detected; attaching automatically."
            });
          } else
            this.report({
              status: "waiting",
              message: "Waiting for the game connection. Pilot remains armed."
            });
          return;
        }
        if (this.game.inSpawnPhase?.()) {
          const message = this.adapter.autoSpawn(active);
          if (active()) this.report({ status: "waiting", message });
          return;
        }
        const state = await this.adapter.snapshot();
        if (!active()) return;
        if (state.inactive) {
          this.report({ status: "waiting", message: state.inactive + ". Pilot remains armed." });
          return;
        }
        if (state.tick !== this.lastTick) {
          this.lastTick = state.tick;
          this.tickTime = now;
        } else {
          if (this.adapter.document?.hidden) {
            this.tickTime = now;
            this.report({
              status: "waiting",
              message: "Running in background; waiting for fresh game updates."
            });
            return;
          }
          if (now - this.tickTime > STALLED_CLOCK_WARNING_MS)
            this.report({
              status: "waiting",
              message: "Waiting for the game clock to resume. Pilot remains armed."
            });
          return;
        }
        this.report({ status: "running", snapshot: state, commands: this.commands });
        if (this.learning) this.strategy.tuning = this.learning.begin(state, this.options);
        if (this.pending) {
          if (this.adapter.confirmed(state, this.pending)) {
            this.report({
              status: "running",
              message: "Confirmed: " + this.pending.reason,
              log: true
            });
            this.pending = null;
          } else if (state.tick - this.pending.at > COMMAND_CONFIRMATION_TICKS) {
            const expired = this.pending;
            this.pending = null;
            this.strategy.record(expired, state.tick);
            this.adapter.lastMap = null;
            this.report({
              status: "waiting",
              message: "Command unconfirmed. Refreshing the position and replanning after cooldown; still running.",
              log: true
            });
            return;
          } else return;
        }
        this.strategy.options = { ...this.options };
        const action = await this.strategy.choose(state, active);
        if (!active() || !action) return;
        if (action.kind === "wait") {
          this.report({ status: "running", message: action.reason });
          return;
        }
        const sent = await this.adapter.execute(state, action, active);
        if (!active()) return;
        if (sent) {
          this.pending = sent;
          this.commands++;
          this.learning?.command();
          this.strategy.record(action, state.tick);
          if ([U.atom, U.hydrogen, U.mirv].includes(action.unit))
            this.strategy.last.set("nuke", state.tick);
          this.report({
            status: "running",
            message: action.reason,
            log: true,
            commands: this.commands
          });
        } else {
          if (["alliance", "reject", "extend"].includes(action.kind))
            this.strategy.record(action, state.tick);
          this.report({
            status: "running",
            message: "Position changed or request unavailable; reconsidering."
          });
        }
      } catch (error) {
        if (this.epoch === epoch) {
          this.learning?.invalidate("Client state temporarily unavailable.");
          this.report({
            status: "waiting",
            message: (error.message || String(error)) + " Retrying state checks; pilot remains armed."
          });
        }
      } finally {
        this.busy = false;
      }
    }
  };

  // src/reward.js
  function matchReward(win, territory = null) {
    return 0.7 * Number(win) + 0.2 * (territory?.peakShare ?? 0) + 0.1 * (territory?.averageShare ?? 0);
  }
  var TerritoryReward = class {
    constructor(game, player) {
      this.land = Number(game.numLandTiles?.());
      this.valid = Number.isFinite(this.land) && this.land > 0;
      this.peak = 0;
      this.integral = 0;
      this.ticks = 0;
      this.last = this.read(player);
    }
    read(player) {
      const tiles = Number(player?.numTilesOwned?.());
      if (!Number.isFinite(tiles) || tiles < 0) {
        this.valid = false;
        return 0;
      }
      return Math.max(0, Math.min(1, tiles / this.land));
    }
    observe(player, delta, controlled) {
      if (!this.valid) return;
      const current = player ? this.read(player) : 0;
      if (!this.valid) return;
      if (controlled) {
        this.integral += this.last * delta;
        this.ticks += delta;
        this.peak = Math.max(this.peak, this.last, current);
      }
      this.last = current;
    }
    summary() {
      if (!this.valid || this.ticks <= 0) return null;
      return {
        peakShare: this.peak,
        averageShare: this.integral / this.ticks,
        observedTicks: this.ticks
      };
    }
  };

  // src/match-learning.js
  function resultFor(winner, identity) {
    if (!Array.isArray(winner) || winner.length < 2 || typeof winner[1] !== "string") return null;
    if (winner[0] === "player") return winner[1] === identity.clientID;
    if (winner[0] === "team") return winner.slice(2).includes(identity.clientID);
    if (winner[0] === "nation") return false;
    return null;
  }
  function winnerUpdate(updates) {
    if (!updates || typeof updates !== "object") return null;
    for (const group of Object.values(updates)) {
      if (!Array.isArray(group)) continue;
      for (const update of group) {
        if (update && Object.hasOwn(update, "winner") && Object.hasOwn(update, "allPlayersStats"))
          return update;
      }
    }
    return null;
  }
  function observeUpdates(game, callback) {
    if (typeof game.update !== "function") return null;
    const descriptor = Object.getOwnPropertyDescriptor(game, "update");
    const original = game.update;
    function wrapped(...args) {
      const result = Reflect.apply(original, this, args);
      try {
        callback(args[0]);
      } catch {
      }
      return result;
    }
    try {
      game.update = wrapped;
    } catch {
      return null;
    }
    if (game.update !== wrapped) return null;
    return () => {
      if (game.update !== wrapped) return;
      if (descriptor) Object.defineProperty(game, "update", descriptor);
      else delete game.update;
    };
  }
  var MatchLearning = class {
    constructor(store, onChange = () => {
    }) {
      this.store = store;
      this.onChange = onChange;
      this.run = null;
      this.seenGames = /* @__PURE__ */ new WeakSet();
      this.message = "Learning is ready. Start a match to collect a result.";
      this.lastSave = Promise.resolve();
      this.generation = 0;
    }
    info() {
      return {
        ...this.store.summary(this.run?.context),
        message: this.message,
        variant: this.run?.variant.name ?? null,
        active: Boolean(this.run && !this.run.done)
      };
    }
    notify(message) {
      if (message) this.message = message;
      this.onChange(this.info());
    }
    begin(s, options) {
      if (this.run?.game === s.game) return options.learning ? this.run.variant : VARIANTS[0];
      if (this.run && !this.run.done) this.finish(null, "Match left before a result was observed.");
      if (!options.learning || this.seenGames.has(s.game)) return VARIANTS[0];
      const g = s.game, me = s.me;
      const gameID = g.gameID?.(), clientID = me.clientID?.();
      if (typeof gameID !== "string" || typeof clientID !== "string" || !Number.isFinite(g.ticksSinceStart?.())) {
        this.notify("Learning unavailable: this client does not expose match identity and timing.");
        return VARIANTS[0];
      }
      const context = contextKey(g, options), variant = this.store.select(context);
      const run = {
        game: g,
        context,
        variant,
        id: `${gameID}:${clientID}`,
        identity: { clientID, team: me.team?.() ?? null },
        options: optionsKey(options),
        lastTick: s.tick,
        totalTicks: Math.max(0, g.ticksSinceStart()),
        territory: new TerritoryReward(g, me),
        botTicks: 0,
        commands: 0,
        wasAlive: true,
        running: true,
        done: false,
        excluded: "",
        restore: null
      };
      if (run.id.length > 100) {
        this.notify("Learning unavailable: unsupported match identifier.");
        return VARIANTS[0];
      }
      this.run = run;
      this.seenGames.add(g);
      run.restore = observeUpdates(g, (update) => this.inspect(update));
      if (!run.restore) run.excluded = "Cannot observe the match result reliably in this client.";
      this.notify(
        run.excluded || `Trying ${variant.name.toLowerCase()}. Learning updates when the result is known.`
      );
      return variant;
    }
    advance() {
      const r = this.run;
      if (!r || r.done) return;
      const tick = r.game.ticks();
      if (!Number.isFinite(tick) || tick < r.lastTick) {
        this.invalidate("Game clock changed unexpectedly.");
        return;
      }
      const delta = tick - r.lastTick;
      r.territory.observe(r.game.myPlayer(), delta, r.running && r.wasAlive);
      if (r.wasAlive) {
        r.totalTicks += delta;
        if (r.running) r.botTicks += delta;
      }
      r.lastTick = tick;
      r.wasAlive = Boolean(r.game.myPlayer()?.isAlive());
    }
    inspect(update) {
      const r = this.run;
      if (!r || r.done) return;
      try {
        this.advance();
        if (r.game.gameOver?.()) {
          const win = winnerUpdate(update?.updates ?? r.game.updatesSinceLastTick?.());
          this.finish(
            win ? resultFor(win.winner, r.identity) : null,
            win ? "The game ended without a recognized winner." : "The final result was unavailable."
          );
        } else if (!r.wasAlive && r.identity.team === null) {
          this.finish(false);
        }
      } catch {
        this.invalidate("Could not read the match result.");
      }
    }
    poll(game, running, options, sameGame = true) {
      const r = this.run;
      if (!r || r.done) return;
      this.inspect();
      if (r.done) return;
      if (!sameGame || game !== r.game) {
        this.finish(null, "Match left before a result was observed.");
        return;
      }
      if (optionsKey(options) !== r.options) this.invalidate("Settings changed during this match.");
      r.running = running;
    }
    control(running) {
      this.advance();
      if (this.run && !this.run.done) this.run.running = running;
    }
    command() {
      if (this.run && !this.run.done) this.run.commands++;
    }
    invalidate(reason) {
      if (!this.run || this.run.done || this.run.excluded) return;
      this.run.excluded = reason;
      this.notify(`This match will be skipped: ${reason}`);
    }
    finish(win, reason = "No reliable result was observed.") {
      const r = this.run;
      if (!r || r.done) return this.lastSave;
      r.done = true;
      r.restore?.();
      const coverage = Math.min(1, r.botTicks / Math.max(1, r.totalTicks));
      const excluded = r.excluded || (win === null ? reason : "") || (r.botTicks < 30 || r.commands < 1 ? "Not enough bot play to evaluate." : "") || (coverage < 0.8 ? "The bot controlled less than 80% of your time alive." : "");
      if (excluded) {
        this.notify(`No learning update: ${excluded}`);
        return this.lastSave;
      }
      const territory = r.territory.summary();
      const reward = matchReward(win, territory);
      const summary = {
        reward,
        territory,
        id: r.id,
        context: r.context,
        variant: r.variant.id,
        win,
        ticks: r.totalTicks,
        commands: r.commands,
        coverage
      };
      const generation = this.generation;
      const accept = () => this.generation === generation;
      this.lastSave = this.store.record(summary, accept).then((saved) => {
        if (!accept()) return;
        this.notify(
          saved ? `${win ? "Win" : "Loss"} learned \xB7 reward ${(reward * 100).toFixed(1)}/100${territory ? ` \xB7 peak land ${(territory.peakShare * 100).toFixed(1)}%` : " \xB7 territory unavailable"}.` : "This match was already learned; it was not counted twice."
        );
      }).catch(() => {
        if (accept()) this.notify("The result could not be saved. Previous learning is preserved.");
      });
      return this.lastSave;
    }
    abort() {
      this.generation++;
      const r = this.run;
      if (r) {
        r.done = true;
        r.running = false;
        r.excluded = "Emergency stop.";
        r.restore?.();
        r.restore = null;
      }
      this.notify("Learning stopped. This match will not produce another learning update.");
    }
    close() {
      this.inspect();
      return this.finish(null, "Page closed before the result was observed.");
    }
  };

  // src/main.js
  var KEY = "openfront-pilot-options-v1";
  if (!document.querySelector("openfront-pilot")) boot();
  function boot() {
    const { host, root } = createPanel(document);
    const $ = (s) => root.querySelector(s);
    const format = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    let options = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (["cautious", "balanced", "aggressive"].includes(saved.profile))
        options.profile = saved.profile;
      for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"])
        if (typeof saved[k] === "boolean") options[k] = saved[k];
    } catch {
    }
    let storage = null;
    try {
      storage = localStorage;
    } catch {
    }
    const learningStore = new LearningStore(storage, navigator.locks);
    let winWindow = 20;
    try {
      const saved = Number(storage?.getItem("openfront-pilot-win-window-v1"));
      if (saved >= 1 && saved <= 1e3) winWindow = Math.floor(saved);
    } catch {
    }
    $("#win-window").value = winWindow;
    function renderWinRate() {
      const rate = learningStore.winRate(winWindow);
      $("#win-rate").textContent = rate.percent === null ? "\u2014" : rate.percent.toFixed(1) + "%";
      $("#win-detail").textContent = `${rate.wins} wins / ${rate.games} recorded games`;
    }
    $("#win-window").addEventListener("change", () => {
      winWindow = learningStore.winRate($("#win-window").value).requested;
      $("#win-window").value = winWindow;
      try {
        storage?.setItem("openfront-pilot-win-window-v1", String(winWindow));
      } catch {
      }
      renderWinRate();
    });
    const learning = new MatchLearning(learningStore, (info) => {
      renderWinRate();
      $("#learn-count").textContent = info.total;
      $("#learn-message").textContent = info.message;
      $("#learn-current").textContent = info.variant ? "Match trial: " + info.variant : "Seven strategy variants; no game recordings.";
      $("#learn-memory").textContent = `${info.wins} wins learned \xB7 ${(info.bytes / 1024).toFixed(1)} / 64 KiB \xB7 ${info.contexts} match types`;
      const recent = info.recent[0];
      $("#learn-reward").textContent = recent ? `Last match score: ${(recent.reward * 100).toFixed(1)}/100${recent.territory ? ` \xB7 peak ${(recent.territory.peakShare * 100).toFixed(1)}% \xB7 average ${(recent.territory.averageShare * 100).toFixed(1)}% land` : " \xB7 no territory data"}` : "";
      $("#learn-warning").textContent = info.warning;
      $("#learn-rows").replaceChildren();
      for (const row of info.rows) {
        const tr = document.createElement("tr");
        for (const value of [
          row.name,
          row.wins,
          row.games,
          row.weight ? (100 * row.reward / row.weight).toFixed(1) : "\u2014"
        ]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        $("#learn-rows").append(tr);
      }
    });
    const controller = new PilotController(
      new GameAdapter(document),
      (update) => {
        $("#state").textContent = update.status;
        $(".dot").className = "dot " + update.status;
        if (update.message) $("#message").textContent = update.message;
        if (update.snapshot) {
          const s = update.snapshot;
          $("#compatibility").textContent = controller.options.diplomacy && !controller.adapter.bridge.supports("alliance") ? "Alliance automation is unavailable in this game client. Handle requests manually." : "";
          $("#troops").textContent = format(s.troops);
          $("#gold").textContent = format(s.gold);
          $("#land").textContent = format(s.tiles);
          $("#ratio").textContent = Math.round(100 * s.troops / s.cap) + "%";
          $(".fill").style.width = Math.min(100, 100 * s.troops / s.cap) + "%";
        }
        if (update.commands != null) $("#commands").textContent = update.commands + " commands";
        if (update.log || update.status === "paused") {
          const li = document.createElement("li");
          li.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }) + " \xB7 " + update.message;
          $(".log").prepend(li);
          while ($(".log").children.length > 50) $(".log").lastElementChild.remove();
        }
      },
      options,
      learning
    );
    let timer = null, stopGeneration = 0;
    const starter = new LobbyStarter(
      controller.adapter,
      (update) => {
        $("#state").textContent = update.status;
        $("#message").textContent = update.message;
      },
      () => {
        controller.start({ explicit: true });
        return controller.running;
      },
      () => requeue.recover(() => starter.active && !controller.stopped)
    );
    const requeue = new AutoRequeue(
      controller.adapter,
      sessionStorage,
      async () => {
        learning.inspect();
        await learning.finish(null, "Leaving after elimination before a team result.");
      },
      (path) => {
        location.assign(path);
      }
    );
    const tick = async () => {
      try {
        if (starter.active) await starter.step();
        else if (controller.running && await requeue.step(() => controller.running && !controller.stopped))
          return;
        else await controller.step();
      } catch (error) {
        $("#state").textContent = "waiting";
        $("#message").textContent = error.message + " Retrying connection checks.";
      }
    };
    learning.notify();
    $("#profile").value = options.profile;
    for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"])
      $("#" + k).checked = options[k];
    const save = (event) => {
      if (!["profile", "economy", "navy", "nukes", "learning", "diplomacy"].includes(event.target.id))
        return;
      controller.options.profile = $("#profile").value;
      for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"])
        controller.options[k] = $("#" + k).checked;
      learning.invalidate("Settings changed during this match.");
      if (!controller.options.learning)
        learning.notify("Learning is off. The original strategy is used; saved scores are retained.");
      try {
        localStorage.setItem(KEY, JSON.stringify(controller.options));
      } catch {
      }
    };
    root.addEventListener("change", save);
    $("#learn-export").addEventListener("click", () => {
      const url = URL.createObjectURL(
        new Blob([learningStore.export()], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "openfront-pilot-learning.json";
      root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    $("#learn-import").addEventListener("click", () => $("#learn-file").click());
    $("#learn-file").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      const generation = stopGeneration, accept = () => generation === stopGeneration;
      try {
        if (!file) return;
        if (file.size > LIMITS.bytes) throw new Error("Backup exceeds 64 KiB.");
        const raw = await file.text();
        if (!accept()) return;
        await learningStore.import(raw, accept);
        if (!accept()) return;
        learning.invalidate("A learning backup was imported during this match.");
        learning.notify("Backup imported. Updated scores apply to your next match.");
      } catch (error) {
        if (accept()) learning.notify("Import failed: " + error.message);
      } finally {
        event.target.value = "";
      }
    });
    $("#learn-reset").addEventListener("click", async () => {
      const generation = stopGeneration, accept = () => generation === stopGeneration;
      if (!confirm(
        "Reset the bot\u2019s learned strategy scores? Export a backup first if you want to keep them."
      ))
        return;
      if (!accept()) return;
      learning.invalidate("Learning was reset during this match.");
      await learningStore.reset(accept);
      if (accept())
        learning.notify("Learning reset. Your next match starts with the original balance.");
    });
    const start = (explicit = false) => {
      try {
        if (controller.stopped && !explicit) return;
        if (explicit) controller.stopped = false;
        if (!controller.adapter.connect() || controller.adapter.game.gameOver?.()) {
          controller.stopped = false;
          starter.start();
          starter.step();
        } else {
          starter.stop();
          controller.start({ explicit });
        }
        if ((controller.running || starter.active) && timer === null) timer = setInterval(tick, 500);
      } catch (e) {
        if (!controller.running) starter.start();
        if (timer === null) timer = setInterval(tick, 500);
        $("#state").textContent = "waiting";
        $("#message").textContent = e.message + " Retrying connection checks.";
      }
    };
    function stopEverything(message) {
      stopGeneration++;
      requeue.stop();
      starter.stop();
      clearInterval(timer);
      timer = null;
      controller.emergencyStop(message);
    }
    $(".start").addEventListener("click", () => start(true));
    $(".stop").addEventListener("click", () => stopEverything());
    $(".collapse").addEventListener("click", () => {
      const collapsed = $(".panel").classList.toggle("collapsed");
      $(".collapse").textContent = collapsed ? "+" : "\u2212";
      $(".collapse").setAttribute("aria-label", collapsed ? "Expand panel" : "Collapse panel");
    });
    for (const event of [
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "wheel",
      "contextmenu",
      "keydown"
    ]) {
      host.addEventListener(event, (e) => e.stopPropagation());
    }
    let toggleKeyHeld = false;
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          toggleKeyHeld = false;
          if (!controller.stopped) stopEverything();
          return;
        }
        if (e.code !== "KeyO" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (e.composedPath().some(
          (el) => ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable
        ))
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat || toggleKeyHeld) return;
        toggleKeyHeld = true;
        if (!controller.running && !starter.active) start();
      },
      true
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Escape" && controller.stopped) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (e.code !== "KeyO" || !toggleKeyHeld) return;
        toggleKeyHeld = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true
    );
    addEventListener("blur", () => {
      toggleKeyHeld = false;
    });
    let drag = null;
    $("header").addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      const r = host.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      $("header").setPointerCapture(e.pointerId);
    });
    $("header").addEventListener("pointermove", (e) => {
      if (!drag) return;
      host.style.right = "auto";
      host.style.left = Math.max(0, Math.min(innerWidth - host.offsetWidth, e.clientX - drag.x)) + "px";
      host.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - drag.y)) + "px";
    });
    $("header").addEventListener("pointerup", () => {
      drag = null;
    });
    $("header").addEventListener("pointercancel", () => {
      drag = null;
    });
    addEventListener("pagehide", () => {
      if (requeue.navigating) {
        clearInterval(timer);
        controller.emergencyStop("Loading the next match.");
      } else stopEverything("Page closed. All bot activity stopped.");
    });
    if (consumeRequeue(sessionStorage)) {
      const generation = stopGeneration;
      setTimeout(() => {
        if (generation === stopGeneration && !controller.stopped) start(true);
      }, 0);
    }
  }
})();
