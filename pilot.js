// OpenFront Pilot 0.10.0 — locally running strategy bot. See README.md.
(() => {
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
      try {
        this.storage.removeItem(REQUEUE_KEY);
      } catch {
      }
    }
    async step(active) {
      if (this.busy || this.navigating) return this.busy || this.navigating;
      const g = this.adapter.game, me = g?.myPlayer(), config = g?.config();
      if (!active() || !g || config.isReplay?.() || config.isIntentionalSpectator?.() || g.inSpawnPhase()) return false;
      if (!g.gameOver?.() && !(me?.hasSpawned?.() && !me.isAlive())) return false;
      this.busy = true;
      const epoch = this.epoch;
      try {
        let timer;
        try {
          await Promise.race([this.finish(), new Promise((resolve) => {
            timer = setTimeout(resolve, 1500);
          })]);
        } finally {
          clearTimeout(timer);
        }
        if (!active() || this.epoch !== epoch || !this.adapter.sameGame(g)) return true;
        this.storage.setItem(REQUEUE_KEY, JSON.stringify({ expires: Date.now() + 12e4 }));
        this.navigating = true;
        this.navigate("/");
        return true;
      } finally {
        this.busy = false;
      }
    }
  };

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
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${label}; client compatibility check failed.`);
    return n;
  }
  async function deadline(promise, ms = 2500) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("The game stopped answering state requests.")), ms);
      })]);
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
  function captureValue(s, enemy, forecast) {
    const weights = { [U.city]: 24, [U.port]: 20, [U.factory]: 16, [U.silo]: 12, [U.defense]: 4, [U.sam]: 8 };
    const structures = s.hostileUnits.filter((u) => u.owner === enemy.id && weights[u.type] && !u.building);
    const fraction = clamp(forecast.gain / Math.max(1, enemy.area), 0, 1);
    const value = structures.reduce((sum, u) => {
      const distance = Math.sqrt(Math.min(...enemy.tiles.map((t) => s.game.euclideanDistSquared(t, u.tile))));
      return sum + weights[u.type] * Math.min(5, u.level ?? 1) / (1 + distance / 60);
    }, 0);
    return Math.min(90, value * fraction);
  }
  function factoryConnections(s, tile) {
    const g = s.game, range = s.config.trainStationMaxRange?.() ?? 110;
    if (!g.x || !g.y || !g.ref || !g.isValidCoord) return 0;
    return s.own.filter((u) => [U.city, U.port].includes(u.type) && !u.building && u.tile !== tile && g.ownerID(u.tile) === s.me.smallID() && g.euclideanDistSquared(tile, u.tile) <= range * range).reduce((sum, u) => {
      const dx = g.x(u.tile) - g.x(tile), dy = g.y(u.tile) - g.y(tile), steps = Math.ceil(Math.hypot(dx, dy));
      for (let i = 1; i < steps; i++) {
        const x = Math.round(g.x(tile) + dx * i / steps), y = Math.round(g.y(tile) + dy * i / steps);
        if (!g.isValidCoord(x, y)) return sum;
        const t = g.ref(x, y);
        if (!g.isLand(t) || g.isImpassable?.(t) || g.ownerID(t) !== s.me.smallID()) return sum;
      }
      return sum + Math.min(3, u.level ?? 1);
    }, 0);
  }
  function strikeValue(s, tile, target) {
    const g = s.game, radii = s.config.nukeMagnitudes?.(U.hydrogen) ?? { inner: 80, outer: 100 };
    let land = 0;
    if (g.x && g.y && g.ref && g.isValidCoord) {
      for (const r of [0, radii.inner / 2, radii.inner, radii.outer]) {
        const count = r === 0 ? 1 : 16;
        for (let i = 0; i < count; i++) {
          const x = Math.round(g.x(tile) + r * Math.cos(i * 2 * Math.PI / count));
          const y = Math.round(g.y(tile) + r * Math.sin(i * 2 * Math.PI / count));
          if (!g.isValidCoord(x, y)) continue;
          const t = g.ref(x, y);
          if (g.isLand(t) && !g.hasFallout?.(t) && g.ownerID(t) === target.id) land++;
        }
      }
    }
    const weights = { [U.city]: 12, [U.silo]: 16, [U.factory]: 8, [U.port]: 8, [U.defense]: 5, [U.sam]: 10 };
    const value = sample(s.hostileUnits, 2e3).reduce((sum, u) => {
      if (u.owner !== target.id || u.building || !weights[u.type]) return sum;
      const d = g.euclideanDistSquared(tile, u.tile);
      if (d > radii.outer ** 2) return sum;
      return sum + weights[u.type] * Math.min(20, u.level ?? 1) * (d <= radii.inner ** 2 ? 1 : 0.4);
    }, 0);
    return land * 3 + value;
  }

  // src/safety.js
  var isHuman = (p) => (typeof p?.type === "function" ? p.type() : p?.type) === "HUMAN";
  var isAI = (p) => ["BOT", "NATION"].includes(typeof p?.type === "function" ? p.type() : p?.type);
  function offensiveBusy(me) {
    return me.outgoingAttacks().length > 0 || unitsOf(me, U.transport).length > 0;
  }
  function safePlacement(s, tile, type) {
    if (!STRUCTURES.includes(type)) return true;
    const g = s.game, own = s.me.smallID();
    if (g.ownerID(tile) !== own || !g.isLand(tile) || g.hasFallout?.(tile)) return false;
    const coastal = type === U.port;
    const border = type === U.defense ? 16 : 24, shore = coastal ? 0 : 18;
    const x0 = g.x(tile), y0 = g.y(tile), radius = Math.max(border, shore);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dy * dy;
      if (d > radius * radius || !g.isValidCoord(x0 + dx, y0 + dy)) continue;
      const t = g.ref(x0 + dx, y0 + dy);
      if (d < shore * shore && !g.isLand(t)) return false;
      const id = g.ownerID(t);
      if (d < border * border && id !== 0 && id !== own) return false;
    }
    return true;
  }
  function coastalTile(g, tile) {
    return g.isLand(tile) && g.neighbors(tile).some((t) => !g.isLand(t) && !g.isImpassable?.(t));
  }
  function safeCrossing(s, src, dst) {
    const g = s.game;
    if (!Number.isInteger(src) || !Number.isInteger(dst) || !coastalTile(g, dst)) return false;
    const ax = g.x(src), ay = g.y(src), bx = g.x(dst), by = g.y(dst);
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length < 3 || length > 260) return false;
    const ships = unitsOf(g, U.warship).filter((u) => !friendly(s.me, u.owner()));
    const range = (s.config.warshipTargettingRange?.() ?? 130) + 25;
    for (const ship of ships) {
      const x = g.x(ship.tile()), y = g.y(ship.tile());
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (length * length)));
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= range) return false;
    }
    for (let i = 2; i < Math.ceil(length) - 1; i++) {
      const t = i / Math.ceil(length);
      for (const offset of [-3, 0, 3]) {
        const x = Math.round(ax + dx * t - dy / length * offset);
        const y = Math.round(ay + dy * t + dx / length * offset);
        if (!g.isValidCoord(x, y)) return false;
        const tile = g.ref(x, y);
        if (g.isLand(tile) || g.isImpassable?.(tile)) return false;
      }
    }
    return true;
  }
  function lookupPlayer(s, id) {
    return s.players?.find((p) => p.smallID() === id) ?? s.enemies?.find((e) => e.id === id) ?? s.game.playerBySmallID?.(id);
  }
  function humanAttacks(s) {
    return (s.incoming ?? []).filter((a) => !a.retreating && !isAI(lookupPlayer(s, a.attackerID)));
  }
  function structureThreatened(s, attackerID) {
    const g = s.game;
    if (!g.isValidCoord || !g.ref || !g.ownerID) return false;
    return (s.own ?? []).filter((u) => STRUCTURES.includes(u.type)).some((u) => {
      const x = g.x(u.tile), y = g.y(u.tile), radius = 28;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius || !g.isValidCoord(x + dx, y + dy)) continue;
        if (g.ownerID(g.ref(x + dx, y + dy)) === attackerID) return true;
      }
      return false;
    });
  }
  var earlyCapacity = (s) => {
    const age = s.game.ticksSinceStart?.();
    return Number.isFinite(age) && age >= 0 && age < 6e3 && s.troops / s.cap >= 0.85;
  };
  function landFrontAllowed(s, targetID, reinforce = false) {
    const waves = s.allOutgoing ?? s.outgoing;
    if (waves.some((a) => a.retreating) || s.own.some((u) => u.type === U.transport)) return false;
    const ids = [...new Set(waves.map((a) => a.targetID))];
    if (reinforce && !ids.includes(targetID)) return false;
    if (!reinforce && ids.includes(targetID)) return false;
    if (!ids.length) return !reinforce;
    if (ids.length === 1 && ids[0] === targetID) return true;
    return isAI(lookupPlayer(s, targetID)) && ids.every((id) => isAI(lookupPlayer(s, id))) && (/* @__PURE__ */ new Set([...ids, targetID])).size <= 2;
  }
  function defenseUseful(s, tile) {
    const range = s.config.defensePostRange?.() ?? 30;
    const attackers = new Set(humanAttacks(s).map((a) => a.attackerID));
    return s.enemies.some((e) => !isAI(e) && (!attackers.size || attackers.has(e.id)) && e.tiles.some((t) => s.game.ownerID(t) === e.id && s.game.euclideanDistSquared(tile, t) <= range * range));
  }
  function growthAdvantage(s, enemy, budget) {
    try {
      const other = enemy.raw;
      if (!other || !s.config.troopIncreaseRate || !s.config.maxTroops) return false;
      const cap = s.config.maxTroops(s.me), enemyCap = s.config.maxTroops(other);
      if (!(cap >= enemyCap * 1.35 && budget >= enemy.troops * 0.85)) return false;
      const projected = Object.create(s.me);
      Object.defineProperty(projected, "troops", { value: () => Math.max(0, s.me.troops() - budget) });
      const ours = s.config.troopIncreaseRate(projected), theirs = s.config.troopIncreaseRate(other);
      return Number.isFinite(ours) && Number.isFinite(theirs) && ours > theirs * 1.15 && budget + Math.min(Math.max(0, ours - theirs) * 60, budget * 0.3) >= enemy.troops * 1.1;
    } catch {
      return false;
    }
  }

  // src/setup.js
  var LobbyStarter = class {
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
        if (this.adapter.game.config().gameConfig?.().gameMode !== "Free For All") {
          this.report({ status: "waiting", message: "Waiting for a fully loaded FFA match. Pilot remains armed." });
          return;
        }
        if (this.ready() !== false) this.active = false;
        return;
      }
      const selector = this.adapter.document.querySelector("game-mode-selector");
      if (!selector || selector.inLobby || this.attempted) {
        this.report({ status: "waiting", message: this.attempted ? "Waiting for the FFA lobby and map to load." : "Waiting for the OpenFront homepage." });
        return;
      }
      const lobby = selector.lobbies?.games?.ffa?.find((l) => l.gameConfig?.gameMode === "Free For All" && (!l.gameConfig.maxPlayers || l.numClients < l.gameConfig.maxPlayers) && (!l.gameConfig.trusted || selector.viewerTrusted));
      if (!lobby) {
        this.report({ status: "waiting", message: "Waiting for an available public Free For All lobby." });
        return;
      }
      if (typeof selector.validateAndJoin !== "function") {
        this.report({ status: "waiting", message: "FFA selection unavailable; join through the game menu. Pilot remains armed." });
        return;
      }
      this.attempted = lobby.gameID;
      selector.validateAndJoin(lobby);
      this.report({ status: "waiting", message: "FFA join requested. Waiting for connection and map loading; complete any prompt shown by the game." });
    }
  };
  function validSpawn(g, tile) {
    if (!Number.isInteger(tile) || g.isValidRef && !g.isValidRef(tile)) return false;
    const x = g.x(tile), y = g.y(tile);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > 16) continue;
      if (!g.isValidCoord(x + dx, y + dy)) return false;
      const t = g.ref(x + dx, y + dy);
      if (!g.isLand(t) || g.isImpassable?.(t) || g.ownerID(t) !== 0) return false;
    }
    return true;
  }
  function spawnCandidates(g) {
    const step = Math.max(6, Math.ceil(Math.sqrt(g.width() * g.height() / 700)));
    const seed = [...String(g.gameID?.() ?? "")].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 0);
    const candidates = [];
    for (let y = 4 + seed % step; y < g.height() - 4; y += step) {
      for (let x = 4 + (seed >>> 8) % step; x < g.width() - 4; x += step) {
        const tile = g.ref(x, y);
        if (!validSpawn(g, tile)) continue;
        let score = 0, nearWater = 0, coastWater = 0;
        for (const radius of [12, 24, 48, 80]) for (let i = 0; i < 16; i++) {
          const a = i * Math.PI / 8, px = Math.round(x + Math.cos(a) * radius), py = Math.round(y + Math.sin(a) * radius);
          if (!g.isValidCoord(px, py)) {
            score -= 4;
            continue;
          }
          const t = g.ref(px, py);
          if (!g.isLand(t) || g.isImpassable?.(t)) {
            if (!g.isLand(t) && !g.isImpassable?.(t)) {
              if (radius === 12) nearWater++;
              if (radius === 24) coastWater++;
            }
            score -= radius <= 24 ? 8 : 2;
            continue;
          }
          if (g.ownerID(t) === 0) {
            const rank = terrainRank(g.terrainType?.(t));
            score += radius <= 24 ? 4 - (rank ?? 0) * 2 : 2 - (rank ?? 0);
          } else {
            const p = g.owner(t);
            score += isAI(p) ? radius >= 48 ? 3 : -3 : -(200 / radius);
          }
        }
        if (coastWater >= 2 && coastWater <= 7 && nearWater <= 2) score += 110;
        score -= spawnCrowding(g, tile).penalty;
        candidates.push({ tile, score });
      }
    }
    return candidates.sort((a, b) => b.score - a.score).map((c) => c.tile);
  }
  function spawnCrowding(g, tile) {
    const me = g.myPlayer?.(), x = g.x(tile), y = g.y(tile);
    let count = 0, penalty = 0;
    for (const p of g.players?.() ?? []) {
      if (!isHuman(p) || p.smallID() === me?.smallID?.() || !p.hasSpawned?.()) continue;
      const t = p.spawnTile?.();
      if (!Number.isInteger(t)) continue;
      const distance = Math.hypot(g.x(t) - x, g.y(t) - y);
      if (distance < 100) {
        count++;
        penalty += 220 * (1 - distance / 100);
      }
    }
    return { count, penalty };
  }

  // src/geometry.js
  function sampleRegions(g) {
    const step = Math.max(1, Math.ceil(Math.sqrt(g.width() * g.height() / 12e3)));
    const regions = /* @__PURE__ */ new Map();
    for (let y = Math.floor(step / 2); y < g.height(); y += step) {
      for (let x = Math.floor(step / 2); x < g.width(); x += step) {
        const tile = g.ref(x, y), id = g.ownerID(tile);
        if (!id || !g.isLand(tile)) continue;
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
  function compactnessScore(s, enemy) {
    const frontage = Number.isFinite(enemy.count) && enemy.area > 0 ? clamp(45 * (enemy.count / Math.sqrt(enemy.area) - 0.75), -35, 75) : 0;
    const own = s.map.regions?.get(s.me.smallID()), next = s.map.regions?.get(enemy.id);
    if (!own || !next || own.n < 3 || next.n < 3 || s.tiles <= 0 || enemy.area <= 0) return frontage;
    const total = s.tiles + enemy.area, a = s.tiles / total, b = enemy.area / total;
    const distance2 = (own.x - next.x) ** 2 + (own.y - next.y) ** 2;
    const merged = a * own.moment + b * next.moment + a * b * distance2;
    return clamp(60 * 2 * Math.PI * (own.moment / s.tiles - merged / total) + frontage, -100, 100);
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
          matches = matches.filter((c) => (bus.listeners.get(c) ?? []).some((fn) => typeof fn === "function" && Function.prototype.toString.call(fn).includes("." + handler + "(")));
        }
        if (matches.length === 1) this.events[key] = matches[0];
      }
      for (const required of ["attack", "build"]) {
        if (!this.events[required]) throw new Error(`Cannot identify the game's ${required} command. No actions sent.`);
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
      for (const fn of ["config", "ticks", "ownerID", "owner", "neighbors", "players", "units", "ref", "isLand", "width", "height"]) {
        if (typeof game[fn] !== "function") throw new Error(`Unsupported game client: missing ${fn}().`);
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
      const g = this.game, me = g.myPlayer(), config = g.config();
      if (!active() || !this.sameGame(g) || !g.inSpawnPhase()) return "Waiting for the match.";
      if (config.isReplay?.() || config.isIntentionalSpectator?.()) return "Replay or spectator mode: no spawn sent.";
      if (config.isRandomSpawn?.()) return "This lobby assigns random spawns; waiting for the game.";
      if (!this.bridge.supports("spawn")) return "Automatic spawn unavailable in this client; choose a starting point manually.";
      if (!this.spawnState || this.spawnState.game !== g) this.spawnState = { game: g, last: -Infinity };
      const state = this.spawnState;
      if (g.ticks() - state.last < 20) return "Monitoring the selected spawn while players join.";
      state.last = g.ticks();
      const current = me?.spawnTile?.() ?? state.tile;
      const relocating = Boolean(me?.hasSpawned?.());
      if (relocating && !Number.isInteger(current)) return "Starting point confirmed; waiting for spawn coordinates.";
      const crowd = relocating ? spawnCrowding(g, current) : null;
      if (crowd && crowd.count < 2 && crowd.penalty < 130) return "Starting area has room; monitoring nearby players.";
      const tile = spawnCandidates(g).find((t) => !crowd || spawnCrowding(g, t).count < crowd.count && spawnCrowding(g, t).penalty + 50 < crowd.penalty);
      if (tile === void 0) return "No suitable starting patch found; waiting for a valid spawn.";
      if (!active() || !this.sameGame(g) || !g.inSpawnPhase() || config.isRandomSpawn?.() || !validSpawn(g, tile)) return "Spawn state changed; reconsidering.";
      state.tile = tile;
      this.bridge.emit("spawn", [tile]);
      return relocating ? "Moved to a less crowded starting area; continuing to monitor arrivals." : "Selected a starting point with expansion room and nearby port access.";
    }
    async snapshot() {
      const g = this.game, me = g.myPlayer(), config = g.config();
      if (config.isReplay?.() || config.isIntentionalSpectator?.()) return { inactive: "Replay or spectator mode", game: g };
      if (g.gameOver?.()) return { inactive: "Match finished", game: g };
      if (g.inSpawnPhase()) return { inactive: "Choose your spawn; waiting for the match to start", waiting: true, game: g };
      if (!me || !me.isAlive() || me.hasSpawned && !me.hasSpawned()) return { inactive: "No living player in this match", game: g };
      if (g.isCatchingUp?.()) return { inactive: "Waiting for the game to catch up", waiting: true, game: g };
      const ticks = finite(g.ticks(), "game tick");
      if (!this.lastMap || ticks - this.lastMap.tick >= 15) {
        const { borderTiles } = await deadline(me.borderTiles());
        if (!borderTiles || typeof borderTiles[Symbol.iterator] !== "function") throw new Error("Unsupported border data.");
        if (!this.sameGame(g)) throw new Error("The match changed while reading the map.");
        this.lastMap = this.mapSummary(g, me, borderTiles, ticks);
      }
      const incoming = me.incomingAttacks().filter((a) => !a.retreating);
      const outgoing = me.outgoingAttacks().filter((a) => !a.retreating);
      const allUnits = unitsOf(g, ...STRUCTURES, U.warship, U.transport, U.atom, U.hydrogen, U.mirv);
      const own = me.units().filter((u) => !u.isActive || u.isActive()).map(unitData);
      const enemies = this.lastMap.fronts.filter((f) => f.id !== 0).flatMap((f) => {
        const p = g.playerBySmallID(f.id);
        if (!p?.isPlayer?.() || !p.isAlive() || friendly(me, p)) return [];
        return [{
          ...f,
          raw: p,
          playerID: p.id(),
          name: p.name(),
          troops: finite(p.troops(), "enemy troops"),
          area: finite(p.numTilesOwned(), "enemy territory"),
          type: p.type(),
          traitor: p.isTraitor?.() ?? false
        }];
      });
      const hostileUnits = allUnits.filter((u) => !friendly(me, u.owner())).map(unitData);
      return {
        game: g,
        me,
        config,
        tick: ticks,
        troops: finite(me.troops(), "troops"),
        cap: Math.max(1, finite(config.maxTroops(me), "troop capacity")),
        gold: finite(me.gold(), "gold"),
        tiles: finite(me.numTilesOwned(), "territory"),
        own,
        hostileUnits,
        enemies,
        incoming,
        outgoing,
        allOutgoing: me.outgoingAttacks(),
        map: this.lastMap,
        players: g.players(),
        immunized: g.isSpawnImmunityActive?.() ?? false
      };
    }
    mapSummary(g, me, borders, tick) {
      const ownID = me.smallID(), points = sample(borders, 6e3);
      const fronts = /* @__PURE__ */ new Map(), shores = [], sites = /* @__PURE__ */ new Set();
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      for (const tile of points) {
        if (g.ownerID(tile) !== ownID) continue;
        const x = g.x(tile), y = g.y(tile);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const n of g.neighbors(tile)) {
          if (!g.isLand(n)) {
            if (!g.isImpassable?.(n)) shores.push(tile);
            continue;
          }
          const id = g.ownerID(n);
          if (id === ownID) continue;
          if (!fronts.has(id)) fronts.set(id, { id, tiles: [], border: [] });
          const f = fronts.get(id);
          f.tiles.push(n);
          f.border.push(tile);
        }
      }
      for (const p of sample(points, 65)) {
        sites.add(p);
        for (const d of [8, 24, 48, 80]) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
          const x = g.x(p) + dx, y = g.y(p) + dy;
          if (!g.isValidCoord(x, y)) continue;
          const t = g.ref(x, y);
          if (g.ownerID(t) === ownID && g.isLand(t)) sites.add(t);
        }
      }
      if (Number.isFinite(minX)) {
        const step = Math.max(5, Math.ceil(Math.sqrt((maxX - minX + 1) * (maxY - minY + 1) / 250)));
        for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
          const t = g.ref(x, y);
          if (g.ownerID(t) === ownID && g.isLand(t)) sites.add(t);
        }
      }
      for (const u of unitsOf(me, ...STRUCTURES)) sites.add(u.tile());
      return {
        tick,
        regions: sampleRegions(g),
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
    async buildOption(s, type, tile) {
      if (s.config.isUnitDisabled?.(type)) return null;
      const options = await deadline(s.me.buildables(tile, [type]));
      const b = options.find((b2) => b2.type === type);
      if (!b || !Number.isFinite(number(b.cost)) || number(b.cost) > number(s.me.gold())) return null;
      if (!((b.canBuild === false || Number.isInteger(b.canBuild)) && (b.canUpgrade === false || Number.isInteger(b.canUpgrade)))) throw new Error("Unsupported build validation response.");
      if (b.canBuild === false && b.canUpgrade === false) return null;
      if (b.canUpgrade !== false && !this.bridge.supports("upgrade")) return null;
      return b;
    }
    // Revalidate against current state after asynchronous planning and before send.
    async execute(s, action, stillRunning) {
      const g = s.game, me = g.myPlayer();
      const valid = () => stillRunning() && this.sameGame(g) && me === g.myPlayer() && me.isAlive() && !g.inSpawnPhase() && !g.gameOver?.() && !g.isCatchingUp?.();
      if (!valid()) return null;
      if (action.kind === "attack" || action.kind === "boat") {
        const target = g.owner(action.tile);
        if (friendly(me, target) || target.id() !== action.targetID) return null;
        const troops = Math.floor(Math.min(action.troops, me.troops() - action.reserve));
        if (!Number.isFinite(troops) || troops < 100 || troops > me.troops() * 0.72) return null;
        const can = await deadline(me.actions(action.tile, action.kind === "boat" ? [U.transport] : []));
        if (!valid() || g.owner(action.tile).id() !== action.targetID || friendly(me, g.owner(action.tile))) return null;
        if (action.kind === "attack" && !can.canAttack) return null;
        if (action.kind === "boat" && !can.buildableUnits.some((b) => b.type === U.transport && b.canBuild !== false)) return null;
        let latestTroops = Math.floor(Math.min(troops, me.troops() - action.reserve));
        if (latestTroops < 100) return null;
        const waves = me.outgoingAttacks();
        const fresh = {
          ...s,
          me,
          game: g,
          config: g.config?.() ?? s.config,
          players: g.players?.() ?? [...s.players ?? [], target],
          incoming: me.incomingAttacks?.() ?? [],
          allOutgoing: waves,
          outgoing: waves.filter((a) => !a.retreating),
          troops: me.troops(),
          cap: (g.config?.() ?? s.config)?.maxTroops?.(me) ?? s.cap,
          own: me.units().map(unitData)
        };
        const incoming = humanAttacks(fresh);
        let counterIncoming = 0;
        if (action.counter) {
          if (action.kind !== "attack" || isAI(target)) return null;
          if (!structureThreatened(fresh, target.smallID())) return null;
          counterIncoming = incoming.filter((a) => a.attackerID === target.smallID()).reduce((n, a) => n + a.troops, 0);
          if (!counterIncoming) return null;
          const others = incoming.filter((a) => a.attackerID !== target.smallID()).reduce((n, a) => n + a.troops, 0);
          const reserve = Math.max(action.reserve, fresh.config.maxTroops(me) * 0.18, others * 1.15);
          latestTroops = Math.floor(Math.min(latestTroops, counterIncoming, me.troops() - reserve));
          if (latestTroops < 100) return null;
        } else if (action.reinforce) {
          if (action.kind !== "attack" || !landFrontAllowed(fresh, target.smallID(), true)) return null;
          if (incoming.length && me.troops() - latestTroops < fresh.config.maxTroops(me) * 0.25 + incoming.reduce((n, a) => n + a.troops, 0) * 1.25) return null;
        } else {
          if (incoming.length) return null;
          if (action.kind === "boat" ? offensiveBusy(me) : !landFrontAllowed(fresh, target.smallID())) return null;
          if (waves.length) {
            for (const id of new Set(waves.map((a) => a.targetID))) {
              const p = lookupPlayer(fresh, id);
              const defenders = typeof p?.troops === "function" ? p.troops() : p?.troops;
              if (!Number.isFinite(defenders) || waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0) < defenders * 1.3) return null;
            }
          }
          if (target.isPlayer() && latestTroops < target.troops() * (action.minRatio ?? 1.67)) return null;
          if (action.growth && !growthAdvantage(fresh, { raw: target, troops: target.troops() }, latestTroops)) return null;
          if (!action.growth && (action.minRatio ?? 1.67) < (isAI(target) ? 1.3 : 1.67) && me.troops() / fresh.config.maxTroops(me) < 0.92 && !earlyCapacity(fresh)) return null;
        }
        if (action.kind === "boat") {
          const spawn = can.buildableUnits.find((b) => b.type === U.transport)?.canBuild;
          if (!safeCrossing({ ...s, me, config: g.config() }, spawn, action.tile)) return null;
        }
        const before = this.checkpoint(me);
        this.bridge.emit(action.kind, action.kind === "attack" ? [target.id(), latestTroops] : [action.tile, latestTroops]);
        return { ...action, counterIncoming, troops: latestTroops, before, at: g.ticks(), targetSmallID: target.smallID() };
      }
      if (action.kind === "build") {
        const b = await this.buildOption(s, action.unit, action.tile);
        if (!b || !valid() || number(me.gold()) < number(b.cost) + (action.goldReserve ?? 0)) return null;
        const upgrade = b.canUpgrade !== false;
        const destination = upgrade ? g.unit(b.canUpgrade)?.tile() : b.canBuild;
        if (destination === void 0 || destination === false) return null;
        if (!safePlacement({ ...s, me }, destination, action.unit) || action.unit === U.defense && !defenseUseful({ ...s, me }, destination) || action.unit === U.factory && factoryConnections({ ...s, me, own: me.units().filter((u) => !u.isActive || u.isActive()).map(unitData) }, destination) === 0) return null;
        if ([U.atom, U.hydrogen, U.mirv].includes(action.unit) && !this.nukeSafe(s, action.tile, action.unit)) return null;
        if (action.unit === U.hydrogen && unitsOf(g, U.sam).some((u) => !friendly(me, u.owner()) && !u.isUnderConstruction?.() && g.euclideanDistSquared(action.tile, u.tile()) <= ((g.config().samRange?.(u.level()) ?? 150) + 15) ** 2)) return null;
        const before = this.checkpoint(me);
        if (upgrade) this.bridge.emit("upgrade", [b.canUpgrade, b.type, 1]);
        else this.bridge.emit("build", [b.type, [U.atom, U.hydrogen, U.mirv].includes(b.type) ? action.tile : b.canBuild, void 0, 1]);
        return { ...action, tile: destination, upgradeID: upgrade ? b.canUpgrade : null, before, at: g.ticks() };
      }
      if (["alliance", "reject", "extend"].includes(action.kind) && this.bridge.supports(action.kind)) {
        const target = g.players().find((p) => p.id() === action.targetID);
        if (!target?.isAlive() || target === me || action.kind !== "reject" && !isHuman(target)) return null;
        if (action.kind === "reject") {
          if (!target.isRequestingAllianceWith?.(me)) return null;
        } else {
          const { borderTiles } = await deadline(target.borderTiles());
          if (!valid()) return null;
          const tile = [...borderTiles].find((t) => g.ownerID(t) === target.smallID());
          if (tile === void 0) return null;
          const can = await deadline(me.actions(tile, []));
          if (!valid() || g.ownerID(tile) !== target.smallID() || !target.isAlive()) return null;
          if (action.kind === "alliance" && !can.interaction?.canSendAllianceRequest) return null;
          if (action.kind === "extend" && !can.interaction?.allianceInfo?.canExtend) return null;
        }
        if (!valid()) return null;
        this.bridge.emit(action.kind, action.kind === "alliance" ? [me, target] : [target]);
        return { ...action, at: g.ticks(), diplomatic: true };
      }
      if (action.kind === "cancel" && this.bridge.supports("cancel")) {
        if (!me.outgoingAttacks().some((a) => a.id === action.attackID && !a.retreating)) return null;
        const before = this.checkpoint(me);
        this.bridge.emit("cancel", [action.attackID]);
        return { ...action, before, at: g.ticks() };
      }
      return null;
    }
    checkpoint(me) {
      return {
        tiles: me.numTilesOwned(),
        troops: me.troops(),
        units: new Map(me.units().map((u) => [u.id(), u.level()])),
        attacks: new Set(me.outgoingAttacks().map((a) => a.id))
      };
    }
    confirmed(s, pending) {
      if (pending.diplomatic) return true;
      if (pending.counter) return s.incoming.filter((a) => !a.retreating && a.attackerID === pending.targetSmallID).reduce((n, a) => n + a.troops, 0) <= pending.counterIncoming - pending.troops * 0.5;
      if (pending.kind === "attack") return s.outgoing.some((a) => a.targetID === pending.targetSmallID && (!pending.before.attacks.has(a.id) || s.troops < pending.before.troops - pending.troops * 0.5)) || s.tiles > pending.before.tiles;
      if (pending.kind === "boat") return s.own.some((u) => u.type === U.transport && !pending.before.units.has(u.id));
      if (pending.kind === "cancel") return !s.outgoing.some((a) => a.id === pending.attackID);
      return s.own.some((u) => u.type === pending.unit && (pending.upgradeID !== null ? u.id === pending.upgradeID && u.level > pending.before.units.get(u.id) : !pending.before.units.has(u.id)));
    }
    nukeSafe(s, tile, type) {
      const owner = s.game.owner(tile);
      if (!owner.isPlayer?.() || friendly(s.me, owner)) return false;
      const radius = s.config.nukeMagnitudes?.(type)?.outer;
      if (!Number.isFinite(radius)) return false;
      const g = s.game, x0 = g.x(tile), y0 = g.y(tile);
      for (let y = Math.max(0, y0 - radius); y <= Math.min(g.height() - 1, y0 + radius); y++) {
        for (let x = Math.max(0, x0 - radius); x <= Math.min(g.width() - 1, x0 + radius); x++) {
          if ((x - x0) ** 2 + (y - y0) ** 2 > radius ** 2) continue;
          const p = g.owner(g.ref(x, y));
          if (friendly(s.me, p)) return false;
        }
      }
      return true;
    }
  };

  // src/learning.js
  var LEARNING_KEY = "openfront-pilot-learning-v1";
  var LIMITS = Object.freeze({ contexts: 12, history: 24, seen: 128, outcomes: 1e3, bytes: 65536 });
  var VARIANTS = Object.freeze([
    { id: "baseline", name: "Original balance", reserve: 0, advantage: 1, neutral: 0.22, attack: 0.7, city: 0.6 },
    { id: "guarded", name: "Larger reserves", reserve: 0.05, advantage: 1.1, neutral: 0.2, attack: 0.66, city: 0.6 },
    { id: "opportunist", name: "Earlier attacks", reserve: -0.04, advantage: 0.9, neutral: 0.22, attack: 0.7, city: 0.6 },
    { id: "expander", name: "Faster expansion", reserve: 0, advantage: 1, neutral: 0.29, attack: 0.72, city: 0.6 },
    { id: "measured", name: "Smaller troop sends", reserve: 0, advantage: 1, neutral: 0.16, attack: 0.64, city: 0.6 },
    { id: "cities", name: "Earlier city growth", reserve: 0, advantage: 1, neutral: 0.22, attack: 0.7, city: 0.64 },
    { id: "income", name: "Income before cities", reserve: 0, advantage: 1, neutral: 0.22, attack: 0.7, city: 0.56 }
  ].map(Object.freeze));
  var empty = () => ({ version: 1, total: 0, wins: 0, contexts: [], history: [], seen: [], outcomes: [] });
  var arm = () => ({ games: 0, wins: 0, weight: 0, reward: 0 });
  var bounded = (n, max = 1e9) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
  var text = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max;
  function validateModel(raw) {
    if (typeof raw !== "string" || raw.length * 2 > LIMITS.bytes) throw new Error("Learning file exceeds 64 KiB.");
    const d = JSON.parse(raw);
    if (d?.version !== 1 || !Number.isInteger(d.total) || !bounded(d.total) || !Number.isInteger(d.wins) || !bounded(d.wins, d.total) || !Array.isArray(d.contexts) || d.contexts.length > LIMITS.contexts || !Array.isArray(d.history) || d.history.length > LIMITS.history || !Array.isArray(d.seen) || d.seen.length > LIMITS.seen) throw new Error("Unsupported learning file.");
    const contexts = d.contexts.map((c) => {
      if (!text(c.key, 180) || !bounded(c.used) || !Array.isArray(c.arms) || c.arms.length !== VARIANTS.length) throw new Error("Invalid strategy statistics.");
      const arms = c.arms.map((a) => {
        if (!Number.isInteger(a.games) || !bounded(a.games) || !Number.isInteger(a.wins) || !bounded(a.wins, a.games) || !bounded(a.weight, 51) || !bounded(a.reward, a.weight + 1e-9)) throw new Error("Invalid strategy scores.");
        return { games: a.games, wins: a.wins, weight: a.weight, reward: a.reward };
      });
      return { key: c.key, used: c.used, arms };
    });
    if (new Set(contexts.map((c) => c.key)).size !== contexts.length) throw new Error("Duplicate learning contexts.");
    const history = d.history.map((h) => {
      if (!text(h.id, 100) || !text(h.context, 180) || !VARIANTS.some((v) => v.id === h.variant) || typeof h.win !== "boolean" || !bounded(h.ticks) || !bounded(h.commands) || !bounded(h.coverage, 1) || !bounded(h.date, 1e15)) throw new Error("Invalid match summary.");
      const reward = h.reward ?? Number(h.win);
      if (!bounded(reward, 1)) throw new Error("Invalid match reward.");
      let territory = null;
      if (h.territory != null) {
        const t = h.territory;
        if (!bounded(t.peakShare, 1) || !bounded(t.averageShare, t.peakShare + 1e-9) || !bounded(t.observedTicks, h.ticks)) throw new Error("Invalid territory summary.");
        territory = { peakShare: t.peakShare, averageShare: t.averageShare, observedTicks: t.observedTicks };
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
    if (!Array.isArray(outcomes) || outcomes.length > Math.min(d.total, LIMITS.outcomes) || outcomes.some((w) => typeof w !== "boolean")) throw new Error("Invalid recent outcomes.");
    return { version: 1, total: d.total, wins: d.wins, contexts, history, seen: [...new Set(d.seen)], outcomes };
  }
  function contextKey(game, options) {
    const config = game.config().gameConfig?.() ?? {};
    const part = (x) => String(x ?? "unknown").replace(/[|]/g, "_").slice(0, 24);
    const custom = Boolean(config.infiniteGold || config.infiniteTroops || config.instantBuild);
    return [
      "conquest-v10-flanks",
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
        if (index < 0 || typeof summary.win !== "boolean" || !text(summary.id, 100) || !text(summary.context, 180)) throw new Error("Invalid learning result.");
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
  var DEFAULTS = Object.freeze({ profile: "balanced", economy: true, navy: true, nukes: true, learning: true, diplomacy: true });
  var PROFILES = {
    cautious: { reserve: 0.38, advantage: 1.85 },
    balanced: { reserve: 0.3, advantage: 1.67 },
    aggressive: { reserve: 0.24, advantage: 1.67 }
  };
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
      if (["attack", "boat"].includes(a.kind) && a.targetID != null && !a.counter && !a.secondary) this.focus = a.targetID;
      if (["alliance", "reject", "extend"].includes(a.kind)) this.last.set(`diplomacy:${a.targetID}`, tick);
      if (a.unit) this.last.set(a.unit, tick);
      if (a.targetID != null) this.last.set(`target:${a.targetID}`, tick);
    }
    reserves(s) {
      const p = PROFILES[this.options.profile] ?? PROFILES.balanced;
      const nonBots = s.enemies.filter((e) => !isAI(e) && e.playerID !== this.focus);
      const strongest = Math.max(0, ...nonBots.map((e) => e.troops));
      const incoming = humanAttacks(s).reduce((sum, a) => sum + a.troops, 0);
      const ratio = clamp(p.reserve + this.tuning.reserve - (nonBots.length ? 0 : 0.06), 0.2, 0.5) + (nonBots.length > 1 ? 0.07 : 0) + (incoming ? 0.12 : 0);
      return Math.min(s.cap * 0.82, Math.max(s.cap * ratio, strongest * 0.28, incoming * 0.95));
    }
    syncFocus(s) {
      if (this.focus) {
        const p = s.players.find((p2) => p2.id() === this.focus);
        if (p && (!p.isAlive() || friendly(s.me, p))) this.focus = null;
      }
      if (!this.focus) {
        const wave = (s.allOutgoing ?? s.outgoing).find((a) => a.targetID !== 0);
        const e = wave && s.enemies.find((e2) => e2.id === wave.targetID);
        if (e) this.focus = e.playerID;
      }
    }
    targetPool(s) {
      if (this.focus) {
        const primary = s.enemies.find((e) => e.playerID === this.focus);
        const waves = s.allOutgoing ?? s.outgoing;
        if (primary && isAI(primary) && waves.some((a) => a.targetID === primary.id)) return s.enemies.filter(isAI);
        return primary ? [primary] : [];
      }
      const ai = s.enemies.filter(isAI);
      return ai.length ? ai : s.enemies;
    }
    strengthRatio() {
      return Math.max(1.67, (PROFILES[this.options.profile] ?? PROFILES.balanced).advantage * this.tuning.advantage);
    }
    async choose(s, active = () => true) {
      this.syncFocus(s);
      this.samReady(s);
      const reserve = this.reserves(s), ratio = s.troops / s.cap;
      const humanIncoming = humanAttacks(s);
      const counter = this.counterattack(s);
      if (counter && !this.cooldown("counter", s.tick, 12)) return counter;
      if (humanIncoming.length && s.troops < reserve * 0.65 && this.adapter.bridge.supports("cancel")) {
        const retreat = [...s.outgoing].sort((a, b) => b.troops - a.troops)[0];
        if (retreat && !this.cooldown("cancel", s.tick, 20)) return {
          kind: "cancel",
          attackID: retreat.id,
          reason: "Recall troops: reserve is critically low under attack."
        };
      }
      const reinforcement = this.reinforce(s, reserve);
      const attack = humanIncoming.length ? null : this.attack(s, reserve);
      if (this.options.economy && humanIncoming.length && !this.cooldown("build", s.tick, 10)) {
        const defense = await this.investment(s, reserve, active, true);
        if (!active()) return null;
        if (defense) return defense;
      }
      if (this.options.diplomacy) {
        const diplomatic = this.diplomacy(s, attack?.targetID);
        if (diplomatic) return diplomatic;
      }
      if (!humanIncoming.length && earlyCapacity(s) && !s.immunized) {
        if (reinforcement && !this.cooldown("attack", s.tick, 12)) return reinforcement;
        if (attack && !this.cooldown("attack", s.tick, 12)) return attack;
      }
      if (reinforcement && !this.cooldown("attack", s.tick, 20)) return reinforcement;
      if (attack && attack.targetID === this.focus && isAI(s.enemies.find((e) => e.playerID === this.focus)) && !s.immunized && !this.cooldown("attack", s.tick, 12)) return attack;
      if (!humanIncoming.length && this.options.nukes && !s.immunized) {
        if (this.blast && (s.own.some((u) => u.type === U.hydrogen) || s.tick - this.blast.tick < 40))
          return this.wait("Hydrogen strike in flight; wait before committing the invasion.");
        if (this.blast) this.blast = null;
        const strike = await this.nuclear(s, active);
        if (!active()) return null;
        if (strike) return strike;
      }
      if (this.options.economy && !this.cooldown("build", s.tick, 25)) {
        const build = await this.investment(s, reserve, active);
        if (!active()) return null;
        if (build) return build;
      }
      if (reinforcement && !this.cooldown("attack", s.tick, 20)) return reinforcement;
      if (humanIncoming.length) return this.wait("Human attack: hold against the push and build useful defenses; counter immediately only to protect structures.");
      if (attack && !s.immunized && !this.cooldown("attack", s.tick, 12)) return attack;
      const busy = (s.allOutgoing ?? s.outgoing).length > 0 || s.own.some((u) => u.type === U.transport);
      if (busy) return this.wait("Maintain the current target; reinforce when useful without opening a second front.");
      if (s.troops <= reserve + 1e3) return this.wait(`Rebuilding a concentrated army: ${Math.round(ratio * 100)}% of capacity.`);
      if (s.immunized) return this.wait("Waiting for spawn immunity to end.");
      if (attack && !this.cooldown("attack", s.tick, 12)) return attack;
      if (this.options.navy && this.adapter.bridge.supports("boat") && !this.cooldown("boat", s.tick, 180) && (this.focus || !s.enemies.length) && !s.map.fronts.some((f) => f.id === 0)) {
        const boat = await this.landing(s, reserve, active);
        if (!active()) return null;
        if (boat) return boat;
      }
      if (this.focus && this.options.nukes && !this.cooldown("nuke", s.tick, 150)) {
        const nuke = await this.nuclear(s, active);
        if (nuke) return nuke;
      }
      if (ratio >= 0.92) return this.wait("Army near capacity: no cost-effective attack or safe route found; prioritize capacity and defenses.");
      return this.wait(this.focus ? "Keep the conquest target: gathering a larger force or waiting for a safe route." : "Waiting for enough troops to overwhelm a nearby tribe or nation before targeting players.");
    }
    wait(reason) {
      return { kind: "wait", reason };
    }
    attack(s, reserve) {
      if (humanAttacks(s).length || s.own.some((u) => u.type === U.transport)) return null;
      const budget = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
      const neutral = s.map.fronts.find((f) => f.id === 0);
      if ((!this.focus || earlyCapacity(s)) && neutral && landFrontAllowed(s, 0) && budget > Math.max(1200, s.cap * 0.035)) {
        const troops = Math.floor(Math.min(budget, s.troops * this.tuning.neutral));
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
      for (const e of this.targetPool(s)) {
        if (!landFrontAllowed(s, e.id)) continue;
        const waves = s.allOutgoing ?? s.outgoing;
        if (waves.some((a) => {
          const other = s.enemies.find((e2) => e2.id === a.targetID);
          return !other || a.troops < other.troops * 1.3;
        })) continue;
        const ideal = isAI(e) ? 1.3 : this.strengthRatio();
        if (budget < 2500) continue;
        const forecast = this.forecast(s, e, budget);
        let minRatio = ideal;
        if ((s.troops / s.cap >= 0.92 || earlyCapacity(s)) && forecast && forecast.gain >= Math.min(e.area, Math.max(120, e.area * 0.35))) minRatio = isAI(e) ? 0.9 : 1.05;
        const growth = !isAI(e) && forecast && forecast.gain >= Math.min(e.area, 120) && growthAdvantage(s, e, budget);
        if (growth) minRatio = Math.min(minRatio, 0.85);
        if (budget < e.troops * minRatio) continue;
        if (!forecast || forecast.gain < Math.min(60, e.area * 0.2)) continue;
        const finish = forecast.gain >= e.area ? 3 : 1;
        const score = forecast.gain / Math.max(100, forecast.loss) * 2500 * finish + (e.traitor ? 12 : 0) + compactnessScore(s, e) * 3 + captureValue(s, e, forecast);
        let troops = budget;
        if (isAI(e) && s.enemies.filter(isAI).length >= 2 && forecast.gain > 0) {
          troops = Math.min(budget, Math.max(2500, e.troops * minRatio, e.area * forecast.loss / forecast.gain / 0.55));
        }
        candidates.push({
          kind: "attack",
          targetID: e.playerID,
          tile: e.tiles[0],
          troops: Math.min(Math.floor(budget), Math.ceil(troops)),
          reserve,
          minRatio,
          score,
          growth: Boolean(growth),
          aiPolicy: isAI(e),
          secondary: waves.length > 0,
          reason: `${waves.length ? "Second AI conquest" : this.focus ? "Finish" : "Conquer"} ${e.name}: ${(troops / Math.max(1, e.troops)).toFixed(1)}\xD7 defending troops; preserve reserves.`
        });
      }
      return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
    }
    counterattack(s) {
      if (s.immunized) return null;
      const attacks = humanAttacks(s), totals = /* @__PURE__ */ new Map();
      for (const a of attacks) totals.set(a.attackerID, (totals.get(a.attackerID) ?? 0) + a.troops);
      for (const [id, incoming] of [...totals].sort((a, b) => b[1] - a[1])) {
        const enemy = s.enemies.find((e) => e.id === id);
        if (!enemy || isAI(enemy) || !enemy.tiles.length) continue;
        if (!structureThreatened(s, id)) continue;
        const other = attacks.filter((a) => a.attackerID !== id).reduce((n, a) => n + a.troops, 0);
        const reserve = Math.max(s.cap * 0.18, other * 1.15);
        const troops = Math.floor(Math.min(incoming, s.troops * 0.72, s.troops - reserve));
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
    reinforce(s, reserve) {
      const waves = s.allOutgoing ?? s.outgoing;
      const ids = [...new Set(waves.map((a) => a.targetID))];
      const choices = ids.map((id) => {
        if (!landFrontAllowed(s, id, true)) return null;
        const enemy2 = s.enemies.find((e) => e.id === id);
        const neutral2 = id === 0 ? s.map.fronts.find((f) => f.id === 0) : null;
        if (!enemy2 && !neutral2) return null;
        const committed2 = waves.filter((a) => a.targetID === id).reduce((n, a) => n + a.troops, 0);
        let ideal2 = enemy2 ? enemy2.troops * (isAI(enemy2) ? 1.3 : this.strengthRatio()) : s.cap * 0.15;
        if (enemy2 && isAI(enemy2)) {
          const estimate = this.forecast(s, enemy2, Math.max(committed2, s.troops - reserve));
          if (estimate?.gain > 0) ideal2 = Math.max(ideal2, enemy2.area * estimate.loss / estimate.gain / 0.65);
        }
        return { enemy: enemy2, neutral: neutral2, committed: committed2, ideal: ideal2, deficit: ideal2 - committed2 };
      }).filter(Boolean).sort((a, b) => b.deficit - a.deficit);
      const choice = choices[0];
      if (!choice) return null;
      const { enemy, neutral, ideal, committed } = choice, capped = s.troops / s.cap >= 0.92 || earlyCapacity(s);
      if (!capped && committed >= ideal) return null;
      const incoming = humanAttacks(s).reduce((n, a) => n + a.troops, 0);
      reserve = Math.max(reserve, incoming ? s.cap * 0.25 + incoming * 1.25 : 0);
      const available = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
      const troops = Math.floor(Math.min(available, Math.max(ideal - committed, capped ? s.troops * 0.25 : 0)));
      if (!Number.isFinite(troops) || troops < Math.max(200, s.cap * 5e-3)) return null;
      return {
        kind: "attack",
        targetID: enemy?.playerID ?? null,
        tile: (enemy ?? neutral).tiles[0],
        troops,
        reserve,
        reinforce: true,
        minRatio: 0,
        secondary: enemy && this.focus !== enemy.playerID,
        reason: `Reinforce ${enemy?.name ?? "wilderness expansion"} with ${troops.toLocaleString()} troops.`
      };
    }
    diplomacy(s, proposed) {
      if (s.config.disableAlliances?.()) return null;
      const fronts = s.map.fronts.filter((f) => f.id !== 0);
      const humans = s.players.filter((p2) => isHuman(p2) && p2.id() !== s.me.id() && p2.isAlive() && (fronts.some((f) => f.id === p2.smallID()) || s.enemies.some((e) => e.playerID === p2.id())));
      const target = this.focus ?? proposed ?? this.targetPool(s).filter(isAI).sort((a, b) => a.troops - b.troops)[0]?.playerID;
      const stronger = (p2) => {
        try {
          return s.config.maxTroops(p2) > s.cap * 1.1;
        } catch {
          return false;
        }
      };
      const humanTarget = humans.some((p2) => p2.id() === target);
      const future = humanTarget ? null : humans.filter((p2) => p2.id() !== target && !friendly(s.me, p2) && !stronger(p2) && !s.me.isRequestingAllianceWith?.(p2)).sort((a, b) => a.troops() - b.troops())[0];
      this.futureOpponent = future?.id() ?? null;
      const focus = s.enemies.find((e) => e.playerID === target), center = s.map.center;
      const offAxis = (p2) => {
        const front = s.enemies.find((e) => e.playerID === p2.id()) ?? fronts.find((f) => f.id === p2.smallID());
        if (!focus || !front || !center) return 0;
        const vector = (f) => {
          const points = f.border?.length ? f.border : f.tiles;
          return {
            x: points.reduce((n, t) => n + s.game.x(t), 0) / points.length - center.x,
            y: points.reduce((n, t) => n + s.game.y(t), 0) / points.length - center.y
          };
        };
        const a = vector(focus), b = vector(front);
        return 1 - (a.x * b.x + a.y * b.y) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
      };
      const limit = Math.max(0, humans.length - (humanTarget || future ? 1 : 0));
      const eligible = humans.filter((p2) => p2.id() !== target && p2.id() !== this.futureOpponent && (stronger(p2) || humanTarget || !focus || offAxis(p2) >= 0.35) && (stronger(p2) || p2.troops() >= s.troops * 0.15 || (fronts.find((f) => f.id === p2.smallID())?.count ?? s.enemies.find((e) => e.playerID === p2.id())?.count ?? 0) >= 6)).sort((a, b) => Number(stronger(b)) - Number(stronger(a)) || offAxis(b) - offAxis(a) || b.troops() - a.troops()).slice(0, limit);
      const wanted = new Set(eligible.map((p2) => p2.id()));
      const occupied = humans.filter((p2) => p2.id() !== target && (friendly(s.me, p2) || s.me.isRequestingAllianceWith?.(p2))).length;
      const room = (p2) => friendly(s.me, p2) || s.me.isRequestingAllianceWith?.(p2) || occupied < limit;
      for (const p2 of s.players) {
        if (!p2.isRequestingAllianceWith?.(s.me) || this.cooldown(`diplomacy:${p2.id()}`, s.tick, 80)) continue;
        const kind = wanted.has(p2.id()) && room(p2) ? "alliance" : "reject";
        if (this.adapter.bridge.supports(kind)) return {
          kind,
          targetID: p2.id(),
          reason: kind === "reject" ? `Decline ${p2.name()}: preserve expansion options and limit alliances.` : `Accept ${p2.name()}: useful protection on another flank.`
        };
      }
      if (this.cooldown("alliance", s.tick, 25) || this.cooldown("extend", s.tick, 25)) return null;
      if (this.adapter.bridge.supports("extend")) for (const a of s.me.alliances?.() ?? []) {
        if (!wanted.has(a.other) || a.expiresAt - s.tick > (s.config.allianceExtensionPromptOffset?.() ?? 300) || this.cooldown(`diplomacy:${a.other}`, s.tick, 120)) continue;
        return { kind: "extend", targetID: a.other, reason: "Extend a useful flank alliance; let unnecessary alliances expire." };
      }
      if (!this.adapter.bridge.supports("alliance") || occupied >= limit) return null;
      const p = eligible.find((p2) => !friendly(s.me, p2) && !s.me.isRequestingAllianceWith?.(p2) && !this.cooldown(`diplomacy:${p2.id()}`, s.tick, 300));
      return p ? { kind: "alliance", targetID: p.id(), reason: `Offer ${p.name()} a flank alliance while preserving a future opponent.` } : null;
    }
    forecast(s, enemy, budget) {
      const g = s.game;
      const defenses = s.hostileUnits.filter((u) => u.owner === enemy.id && u.type === U.defense && !u.building);
      const radius = s.config.defensePostRange?.() ?? 30;
      let totalLoss = 0, fraction = 0, n = 0;
      for (const tile of sample(enemy.tiles, 8)) {
        const defended = defenses.some((u) => g.euclideanDistSquared(tile, u.tile) <= radius * radius);
        let loss2, f;
        if (s.config.attackLogic?.length === 1) {
          const result = s.config.attackLogic({
            terrain: g.terrainType(tile),
            attackTroops: budget,
            attacker: { type: s.me.type(), numTiles: s.tiles },
            defender: {
              type: enemy.type,
              numTiles: Math.max(1, enemy.area),
              troops: enemy.troops,
              isTraitor: enemy.traitor,
              isDisconnectedTeammate: false
            },
            defenderHasDefensePost: defended,
            falloutRatio: g.hasFallout?.(tile) ? 0 : null,
            borderSize: Math.max(1, enemy.count)
          });
          loss2 = result.attackerTroopLoss;
          f = result.tickFraction;
        } else {
          const terrain = terrainRank(g.terrainType?.(tile));
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
    samReady(s) {
      if (!s.hostileUnits.some((u) => u.type === U.silo)) {
        this.firstNuclearThreatTick = null;
        return false;
      }
      this.firstNuclearThreatTick ??= s.tick;
      return s.tick - this.firstNuclearThreatTick >= 900;
    }
    async investment(s, reserve, active, defensiveOnly = false) {
      if (s.gold < 1e5 || s.tiles < 250) return null;
      const count = (type) => s.own.filter((u) => u.type === type).reduce((a, u) => a + u.level, 0);
      const cities = count(U.city), economy = count(U.port) + count(U.factory);
      const nuclearThreat = this.samReady(s);
      const threatened = humanAttacks(s).length > 0;
      const humanPressure = humanAttacks(s).reduce((n, a) => n + a.troops, 0);
      const huge = humanPressure >= Math.max(1e4, s.cap * 0.2, s.troops * 0.45);
      const preferCity = cities + economy === 0 || cities / (cities + economy) < (this.tuning.city ?? 0.6);
      const types = [];
      if (humanPressure >= Math.max(2e3, s.cap * 0.03) && count(U.defense) < (huge ? 6 : 2) && !this.cooldown(U.defense, s.tick, huge ? 30 : 300)) types.push([U.defense, 150]);
      if (nuclearThreat && cities >= 2 && count(U.sam) < Math.max(2, Math.ceil(cities / 3))) types.push([U.sam, 110]);
      types.push([U.city, earlyCapacity(s) || huge ? 120 : preferCity ? 100 : 65]);
      if (s.map.shores.length) types.push([U.port, preferCity ? 65 : 100]);
      types.push([U.factory, s.map.shores.length ? 32 : preferCity ? 65 : 100]);
      if (this.options.navy && count(U.port) && s.gold > 45e4 && count(U.warship) < Math.min(3, count(U.port))) {
        types.push([U.warship, s.hostileUnits.some((u) => u.type === U.transport) ? 95 : 48]);
      }
      if (this.options.nukes && economy >= 3 && cities >= 3 && !count(U.silo) && s.gold >= 19e5) types.push([U.silo, 78]);
      const savingHydrogen = !threatened && !earlyCapacity(s) && this.hydrogenCandidate(s) !== null;
      const savingSilo = !threatened && !earlyCapacity(s) && this.nuclearEstablished(s) && !s.own.some((u) => u.type === U.silo && !u.building);
      const nuclearFund = savingHydrogen ? 5e6 : savingSilo ? 19e5 : 0;
      const bank = huge ? 0 : nuclearThreat && !count(U.sam) ? 1e5 : threatened ? 5e4 : 0;
      for (const [type] of types.sort((a, b) => b[1] - a[1])) {
        if ((defensiveOnly || huge) && type !== U.defense && !(huge && type === U.city)) continue;
        if (!active()) return null;
        if (this.cooldown(type, s.tick, huge ? 30 : 40) || s.config.isUnitDisabled?.(type)) continue;
        if (s.own.some((u) => u.type === type && u.building)) continue;
        const sites = this.sites(s, type);
        for (const tile of sites.slice(0, 16)) {
          if (!active()) return null;
          if (type === U.factory && factoryConnections(s, tile) === 0) continue;
          const option = await this.adapter.buildOption(s, type, tile);
          if (!option || number(option.cost) + (nuclearFund && type !== U.silo ? Math.max(bank, nuclearFund) : bank) > s.gold) continue;
          const upgrading = option.canUpgrade !== false;
          const actualTile = upgrading ? s.game.unit(option.canUpgrade)?.tile() : option.canBuild;
          if (actualTile === false || actualTile === void 0) continue;
          if (!safePlacement(s, actualTile, type) || type === U.defense && !defenseUseful(s, actualTile) || type === U.factory && factoryConnections(s, actualTile) === 0) continue;
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
    danger(s, tile, humansOnly = false) {
      let dist = 1e9;
      for (const e of s.enemies.filter((e2) => !humansOnly || !isAI(e2))) for (const b of sample(e.border, 16)) {
        dist = Math.min(dist, Math.sqrt(s.game.euclideanDistSquared(tile, b)));
      }
      return dist;
    }
    sites(s, type) {
      const g = s.game, existing = s.own.filter((u) => STRUCTURES.includes(u.type));
      let tiles = type === U.port || type === U.warship ? s.map.shores : s.map.sites;
      tiles = [.../* @__PURE__ */ new Set([...tiles, ...s.own.filter((u) => u.type === type && !u.building).map((u) => u.tile)])];
      const border = s.enemies.filter((e) => type !== U.defense || !isAI(e)).flatMap((e) => sample(e.border, 12));
      if (type === U.defense) {
        const setback = [];
        for (const t of border) for (let a = 0; a < 12; a++) for (const r of [18, 23]) {
          const x = Math.round(g.x(t) + Math.cos(a * Math.PI / 6) * r);
          const y = Math.round(g.y(t) + Math.sin(a * Math.PI / 6) * r);
          if (g.isValidCoord(x, y)) setback.push(g.ref(x, y));
        }
        tiles = [.../* @__PURE__ */ new Set([...setback, ...tiles])].filter((t) => safePlacement(s, t, type) && defenseUseful(s, t));
      }
      const score = (t) => {
        const danger = this.danger(s, t, type === U.defense);
        const shore = Math.min(110, ...s.map.shores.map((b) => Math.sqrt(g.euclideanDistSquared(t, b))));
        const near = existing.length ? Math.min(...existing.map((u) => Math.sqrt(g.euclideanDistSquared(t, u.tile)))) : 80;
        const same = s.own.find((u) => u.type === type && u.tile === t);
        if (type === U.defense) {
          const covered = s.own.some((u) => u.type === U.defense && g.euclideanDistSquared(t, u.tile) < 25 ** 2);
          return 100 + Math.min(shore, 30) - Math.abs(danger - 23) - (covered ? 100 : 0);
        }
        if (type === U.factory) {
          const links = factoryConnections(s, t);
          return Math.min(danger, 110) + shore + Math.min(near, 75) + Math.min(links, 8) * 22 - (same ? same.level * 12 : 0);
        }
        if (type === U.sam) {
          const value = existing.filter((u) => [U.city, U.port, U.factory].includes(u.type) && g.euclideanDistSquared(t, u.tile) < 70 ** 2).length * 15;
          const covered = s.own.some((u) => u.type === U.sam && !u.building && g.euclideanDistSquared(t, u.tile) < 65 ** 2);
          return value + Math.min(danger, 60) - (covered ? 100 : 0);
        }
        if (type === U.port) {
          const others = unitsOf(s.game, U.port).filter((u) => u.owner().smallID() !== s.me.smallID() && !s.me.hasEmbargo?.(u.owner()));
          const route = others.length ? Math.max(...sample(others, 30).map((u) => Math.sqrt(g.euclideanDistSquared(t, u.tile())))) : 0;
          return Math.min(danger, 90) + Math.min(near, 65) + Math.min(route / 12, 60) - (same ? same.level * 10 : 0);
        }
        return Math.min(danger, 110) + shore + Math.min(near, 75) + (terrainRank(g.terrainType?.(t)) ?? 0) * 12 - (same ? same.level * 12 : 0);
      };
      return tiles.filter((t) => g.ownerID(t) === s.me.smallID() && g.isLand(t) && !g.hasFallout?.(t)).map((tile) => ({ tile, score: score(tile) })).sort((a, b) => b.score - a.score).map((x) => x.tile);
    }
    async landing(s, reserve, active) {
      if (!s.map.shores.length) return null;
      const g = s.game, candidates = /* @__PURE__ */ new Set();
      for (const shore of sample(s.map.shores, 16)) {
        for (const distance of [20, 45, 85, 150, 230]) for (let angle = 0; angle < 12; angle++) {
          const x = Math.round(g.x(shore) + Math.cos(angle * Math.PI / 6) * distance);
          const y = Math.round(g.y(shore) + Math.sin(angle * Math.PI / 6) * distance);
          if (!g.isValidCoord(x, y)) continue;
          const tile = g.ref(x, y);
          if (coastalTile(g, tile) && g.ownerID(tile) !== s.me.smallID() && !friendly(s.me, g.owner(tile))) candidates.add(tile);
        }
      }
      const budget = Math.min(s.troops - reserve, s.troops * this.tuning.attack);
      const nearbyAI = [...candidates].some((t) => {
        const p = g.owner(t);
        return p.isPlayer() && isAI(p);
      });
      const ranked = [...candidates].map((tile) => {
        const p = g.owner(tile);
        if (this.focus && p.id() !== this.focus) return null;
        if (!this.focus && nearbyAI && p.isPlayer() && !isAI(p)) return null;
        if (p.isPlayer() && budget < p.troops() * this.strengthRatio()) return null;
        if (s.enemies.some((e) => e.id === p.smallID())) return null;
        const nearest = Math.min(...sample(s.map.shores, 30).map((t) => g.euclideanDistSquared(tile, t)));
        return { tile, owner: p, score: (p.isPlayer() ? isAI(p) ? 100 : 0 : 200) - Math.sqrt(nearest) / 15 };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      for (const c of ranked.slice(0, 5)) {
        if (!active()) return null;
        const option = await this.adapter.buildOption(s, U.transport, c.tile);
        if (option && option.canBuild !== false && safeCrossing(s, option.canBuild, c.tile)) return {
          kind: "boat",
          targetID: c.owner.id(),
          tile: c.tile,
          troops: Math.floor(budget),
          reserve,
          minRatio: this.strengthRatio(),
          reason: "Concentrated landing: direct water corridor clear of current hostile warship range."
        };
      }
      return null;
    }
    nuclearEstablished(s) {
      const levels = (types) => s.own.filter((u) => types.includes(u.type) && !u.building).reduce((n, u) => n + u.level, 0);
      return this.options.nukes && (s.game.ticksSinceStart?.() ?? 0) >= 1800 && levels([U.city]) >= 4 && levels([U.port, U.factory]) >= 3 && s.enemies.some((e) => !isAI(e)) && !s.enemies.some(isAI);
    }
    hydrogenCandidate(s) {
      if (!this.nuclearEstablished(s) || !s.own.some((u) => u.type === U.silo && !u.building) || (s.allOutgoing ?? s.outgoing).length || s.own.some((u) => u.type === U.transport) || this.cooldown("nuke", s.tick, 1200) || s.config.isUnitDisabled?.(U.hydrogen)) return null;
      const target = s.enemies.find((e) => e.playerID === this.focus) ?? [...s.enemies].sort((a, b) => a.troops - b.troops)[0];
      if (!target || isAI(target)) return null;
      const g = s.game, tiles = new Set(s.hostileUnits.filter((u) => u.owner === target.id).map((u) => u.tile));
      const step = Math.max(12, Math.ceil(Math.sqrt(g.width() * g.height() / 700)));
      for (let y = step / 2 | 0; y < g.height(); y += step) for (let x = step / 2 | 0; x < g.width(); x += step) {
        const tile = g.ref(x, y);
        if (g.ownerID(tile) === target.id && g.isLand(tile)) tiles.add(tile);
      }
      const sams = s.hostileUnits.filter((u) => u.type === U.sam && !u.building);
      const ranked = sample(tiles, 128).map((tile) => ({ tile, score: strikeValue(s, tile, target) })).sort((a, b) => b.score - a.score);
      for (const { tile } of ranked) {
        if (g.ownerID(tile) !== target.id || sams.some((u) => g.euclideanDistSquared(tile, u.tile) <= ((s.config.samRange?.(u.level) ?? 150) + 15) ** 2)) continue;
        if (this.adapter.nukeSafe(s, tile, U.hydrogen)) return { tile, targetID: target.playerID };
      }
      return null;
    }
    async nuclear(s, active) {
      if (s.gold < 5e6) return null;
      const candidate = this.hydrogenCandidate(s);
      if (!candidate || !active()) return null;
      const option = await this.adapter.buildOption(s, U.hydrogen, candidate.tile);
      if (!active() || !option || option.canBuild === false) return null;
      return {
        kind: "build",
        unit: U.hydrogen,
        ...candidate,
        goldReserve: 0,
        reason: "Hydrogen strike at valuable enemy land and infrastructure outside known SAM coverage; reassess after impact, then invade."
      };
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
        this.report({ status: "waiting", message: "Join a match, choose a spawn, then press Start." });
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
            this.report({ status: "waiting", message: "New match detected; attaching automatically." });
          } else this.report({ status: "waiting", message: "Waiting for the game connection. Pilot remains armed." });
          return;
        }
        if (this.game.inSpawnPhase?.()) {
          const message = this.adapter.autoSpawn(active);
          if (active()) this.report({ status: "waiting", message });
          return;
        }
        const s = await this.adapter.snapshot();
        if (!active()) return;
        if (s.inactive) {
          this.report({ status: "waiting", message: s.inactive + ". Pilot remains armed." });
          return;
        }
        if (s.tick !== this.lastTick) {
          this.lastTick = s.tick;
          this.tickTime = now;
        } else {
          if (this.adapter.document?.hidden) {
            this.tickTime = now;
            this.report({ status: "waiting", message: "Running in background; waiting for fresh game updates." });
            return;
          }
          if (now - this.tickTime > 1e4) this.report({ status: "waiting", message: "Waiting for the game clock to resume. Pilot remains armed." });
          return;
        }
        this.report({ status: "running", snapshot: s, commands: this.commands });
        if (this.learning) this.strategy.tuning = this.learning.begin(s, this.options);
        if (this.pending) {
          if (this.adapter.confirmed(s, this.pending)) {
            this.report({ status: "running", message: "Confirmed: " + this.pending.reason, log: true });
            this.pending = null;
          } else if (s.tick - this.pending.at > 65) {
            const expired = this.pending;
            this.pending = null;
            this.strategy.record(expired, s.tick);
            this.adapter.lastMap = null;
            this.report({ status: "waiting", message: "Command unconfirmed. Refreshing the position and replanning after cooldown; still running.", log: true });
            return;
          } else return;
        }
        this.strategy.options = { ...this.options };
        const action = await this.strategy.choose(s, active);
        if (!active() || !action) return;
        if (action.kind === "wait") {
          this.report({ status: "running", message: action.reason });
          return;
        }
        const sent = await this.adapter.execute(s, action, active);
        if (!active()) return;
        if (sent) {
          this.pending = sent;
          this.commands++;
          this.learning?.command();
          this.strategy.record(action, s.tick);
          if ([U.atom, U.hydrogen, U.mirv].includes(action.unit)) this.strategy.last.set("nuke", s.tick);
          this.report({ status: "running", message: action.reason, log: true, commands: this.commands });
        } else {
          if (["alliance", "reject", "extend"].includes(action.kind)) this.strategy.record(action, s.tick);
          this.report({ status: "running", message: "Position changed or request unavailable; reconsidering." });
        }
      } catch (error) {
        if (this.epoch === epoch) {
          this.learning?.invalidate("Client state temporarily unavailable.");
          this.report({ status: "waiting", message: (error.message || String(error)) + " Retrying state checks; pilot remains armed." });
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
      return { peakShare: this.peak, averageShare: this.integral / this.ticks, observedTicks: this.ticks };
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
        if (update && Object.hasOwn(update, "winner") && Object.hasOwn(update, "allPlayersStats")) return update;
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
      this.notify(run.excluded || `Trying ${variant.name.toLowerCase()}. Learning updates when the result is known.`);
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
        this.notify(saved ? `${win ? "Win" : "Loss"} learned \xB7 reward ${(reward * 100).toFixed(1)}/100${territory ? ` \xB7 peak land ${(territory.peakShare * 100).toFixed(1)}%` : " \xB7 territory unavailable"}.` : "This match was already learned; it was not counted twice.");
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
    const host = document.createElement("openfront-pilot");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
    <style>
      :host{all:initial;position:fixed;top:82px;right:14px;z-index:2147483000;font:13px/1.45 system-ui,sans-serif;color:#eef3f4;display:block;width:290px;max-width:calc(100vw - 28px);color-scheme:dark}
      *{box-sizing:border-box} .panel{background:#10191ff2;border:1px solid #344951;border-radius:16px;box-shadow:0 12px 40px #0006;overflow:hidden;backdrop-filter:blur(12px)}
      header{display:flex;align-items:center;gap:9px;padding:14px 15px;border-bottom:1px solid #2b3a42;cursor:move;touch-action:none}
      .mark{width:27px;height:27px;border-radius:8px;background:#8aecd1;color:#102721;display:grid;place-items:center;font-size:17px;font-weight:800}
      h1{font-size:14px;margin:0;letter-spacing:.2px} .version{font-size:10px;color:#849ba6} .spacer{flex:1}
      button,select{font:inherit;border:1px solid #3a4c55;border-radius:8px;padding:8px;cursor:pointer;color:inherit;background:#1c2a32}button:hover{filter:brightness(1.17)}button:focus-visible,select:focus-visible{outline:2px solid #8aecd1;outline-offset:2px}
      .icon{padding:1px 8px;font-size:19px} .body{padding:14px} .state{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9aabb4;display:flex;align-items:center;gap:7px}
      .dot{width:7px;height:7px;border-radius:50%;background:#94a3b8}.dot.running{background:#8aecd1}.dot.waiting{background:#ffd28b}
      .message{color:#d6e3e8;min-height:52px;margin:9px 0 12px}.body{max-height:calc(100vh - 165px);overflow-y:auto} .controls{display:flex;gap:8px}.controls button{flex:1;font-weight:650}.start{background:#8aecd1;color:#102721;border-color:#8aecd1}.pause{background:#273b47}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0}.stat{padding:9px 7px;background:#19252c;border-radius:8px}.stat span{display:block;color:#91a8b3;font-size:10px}.stat strong{font-size:15px;font-weight:600}
      .bar{height:5px;background:#24343d;border-radius:8px;overflow:hidden;margin-top:5px}.fill{height:100%;width:0;background:#8aecd1}.ratio{display:flex;justify-content:space-between;color:#91a8b3;font-size:11px}
      .setting{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:10px} select{padding:5px 7px;font-size:12px}input{accent-color:#8aecd1}label{cursor:pointer;color:#c9d8df}
      details{border-top:1px solid #293b45;margin-top:13px;padding-top:11px}summary{cursor:pointer;color:#9eb2bd;font-size:12px}.log{max-height:170px;overflow:auto;padding:0;list-style:none;margin:8px 0 0}.log li{padding:6px 0;border-bottom:1px solid #23343d;font-size:11px;color:#a9bec7;overflow-wrap:anywhere}
      .learning-copy{font-size:11px;color:#a9bec7;margin:8px 0;overflow-wrap:anywhere}.learning-actions{display:flex;flex-wrap:wrap;gap:5px}.learning-actions button{font-size:11px;padding:5px 7px}.learning-table{width:100%;font-size:10px;border-collapse:collapse;margin:9px 0}.learning-table th,.learning-table td{text-align:left;padding:4px 2px;border-bottom:1px solid #293b45}.learning-table th{color:#91a8b3}.warning{color:#ffd28b}
      .foot{display:flex;justify-content:space-between;margin-top:13px;color:#6f8b97;font-size:10px}.collapsed .body{display:none}.collapsed header{border-bottom:0}
      @media(max-height:680px){:host{top:14px}.body{max-height:75vh;overflow:auto}}
    </style>
    <section class="panel" aria-label="OpenFront Pilot">
      <header><div class="mark">P</div><div><h1>OpenFront Pilot</h1><div class="version">LOCAL STRATEGY BOT \xB7 v0.10.0</div></div><div class="spacer"></div><button class="icon collapse" aria-label="Collapse panel" title="Collapse">\u2212</button></header>
      <div class="body">
        <div class="state"><i class="dot"></i><span id="state">Paused</span></div>
        <p class="message" id="message" role="status">Press Start to join public Free For All, choose a starting point, and play. In an existing match, Start takes over your position.</p>
        <p class="learning-copy warning" id="compatibility"></p>
        <div class="controls"><button class="start">Start</button><button class="stop" title="Stop bot and learning">Stop all</button></div>
        <div class="stats"><div class="stat"><span>TROOPS</span><strong id="troops">\u2014</strong></div><div class="stat"><span>GOLD</span><strong id="gold">\u2014</strong></div><div class="stat"><span>LAND</span><strong id="land">\u2014</strong></div></div>
        <div class="ratio"><span>Troop capacity</span><span id="ratio">\u2014</span></div><div class="bar"><div class="fill"></div></div>
        <div class="setting"><label for="profile">Play style</label><select id="profile"><option value="cautious">Cautious</option><option value="balanced" selected>Balanced</option><option value="aggressive">Aggressive</option></select></div>
        <div class="setting"><label for="economy">Build & upgrade</label><input type="checkbox" id="economy" checked></div>
        <div class="setting"><label for="navy">Naval expansion</label><input type="checkbox" id="navy" checked></div>
        <div class="setting"><label for="nukes">Nuclear strategy</label><input type="checkbox" id="nukes" checked></div>
        <div class="setting"><label for="diplomacy">Protect flanks with alliances</label><input type="checkbox" id="diplomacy" checked></div>
        <div class="setting"><label for="learning">Learn across games</label><input type="checkbox" id="learning" checked></div>
        <div class="setting"><label for="win-window">Win rate \xB7 last games</label><input id="win-window" type="number" min="1" max="1000" value="20" style="width:65px" aria-label="Number of recent games"></div>
        <p class="learning-copy"><strong id="win-rate">\u2014</strong> \xB7 <span id="win-detail">No recorded results</span></p>
        <p class="learning-copy">Counts completed matches recorded by learning. Up to 1,000 win/loss flags; no recordings.</p>
        <details class="learning-details" open><summary>Learning \xB7 <span id="learn-count">0</span> games</summary>
          <p class="learning-copy" id="learn-message" role="status"></p>
          <p class="learning-copy" id="learn-current"></p>
          <p class="learning-copy" id="learn-memory"></p>
          <p class="learning-copy">Reward: 70% win + 20% peak map share + 10% average map share while playing. No bonus for simply waiting.</p>
          <p class="learning-copy" id="learn-reward"></p>
          <p class="learning-copy warning" id="learn-warning"></p>
          <table class="learning-table"><thead><tr><th>Current match type</th><th>Wins</th><th>Games</th><th>Score</th></tr></thead><tbody id="learn-rows"></tbody></table>
          <div class="learning-actions"><button id="learn-export">Export backup</button><button id="learn-import">Import backup</button><button id="learn-reset">Reset learning</button></div>
          <input type="file" id="learn-file" accept="application/json,.json" hidden>
        </details>
        <details><summary>Decision log</summary><ol class="log"></ol></details>
        <div class="foot"><span>O: start \xB7 Esc: stop all</span><span id="commands">0 commands</span></div>
      </div>
    </section>`;
    document.documentElement.append(host);
    const $ = (s) => root.querySelector(s);
    const format = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    let options = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (["cautious", "balanced", "aggressive"].includes(saved.profile)) options.profile = saved.profile;
      for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"]) if (typeof saved[k] === "boolean") options[k] = saved[k];
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
        for (const value of [row.name, row.wins, row.games, row.weight ? (100 * row.reward / row.weight).toFixed(1) : "\u2014"]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        $("#learn-rows").append(tr);
      }
    });
    const controller = new PilotController(new GameAdapter(document), (update) => {
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
        li.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " \xB7 " + update.message;
        $(".log").prepend(li);
        while ($(".log").children.length > 50) $(".log").lastElementChild.remove();
      }
    }, options, learning);
    let timer = null, stopGeneration = 0;
    const starter = new LobbyStarter(controller.adapter, (update) => {
      $("#state").textContent = update.status;
      $("#message").textContent = update.message;
    }, () => {
      controller.start({ explicit: true });
      return controller.running;
    });
    const requeue = new AutoRequeue(controller.adapter, sessionStorage, async () => {
      learning.inspect();
      await learning.finish(null, "Leaving after elimination before a team result.");
    }, (path) => {
      location.assign(path);
    });
    const tick = async () => {
      try {
        if (starter.active) starter.step();
        else if (controller.running && await requeue.step(() => controller.running && !controller.stopped)) return;
        else await controller.step();
      } catch (error) {
        $("#state").textContent = "waiting";
        $("#message").textContent = error.message + " Retrying connection checks.";
      }
    };
    learning.notify();
    $("#profile").value = options.profile;
    for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"]) $("#" + k).checked = options[k];
    const save = (event) => {
      if (!["profile", "economy", "navy", "nukes", "learning", "diplomacy"].includes(event.target.id)) return;
      controller.options.profile = $("#profile").value;
      for (const k of ["economy", "navy", "nukes", "learning", "diplomacy"]) controller.options[k] = $("#" + k).checked;
      learning.invalidate("Settings changed during this match.");
      if (!controller.options.learning) learning.notify("Learning is off. The original strategy is used; saved scores are retained.");
      try {
        localStorage.setItem(KEY, JSON.stringify(controller.options));
      } catch {
      }
    };
    root.addEventListener("change", save);
    $("#learn-export").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([learningStore.export()], { type: "application/json" }));
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
      if (!confirm("Reset the bot\u2019s learned strategy scores? Export a backup first if you want to keep them.")) return;
      if (!accept()) return;
      learning.invalidate("Learning was reset during this match.");
      await learningStore.reset(accept);
      if (accept()) learning.notify("Learning reset. Your next match starts with the original balance.");
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
    for (const event of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "wheel", "contextmenu", "keydown"]) {
      host.addEventListener(event, (e) => e.stopPropagation());
    }
    let toggleKeyHeld = false;
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleKeyHeld = false;
        if (!controller.stopped) stopEverything();
        return;
      }
      if (e.code !== "KeyO" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.composedPath().some((el) => ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || toggleKeyHeld) return;
      toggleKeyHeld = true;
      if (!controller.running && !starter.active) start();
    }, true);
    document.addEventListener("keyup", (e) => {
      if (e.code === "Escape" && controller.stopped) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.code !== "KeyO" || !toggleKeyHeld) return;
      toggleKeyHeld = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
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
