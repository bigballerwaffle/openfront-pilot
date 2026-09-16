// Small, persistent contextual bandit. Only aggregate results are retained.
export const LEARNING_KEY = 'openfront-pilot-learning-v1';
export const LIMITS = Object.freeze({ contexts: 12, history: 24, seen: 128, outcomes: 1000, bytes: 65536 });
export const VARIANTS = Object.freeze([
  { id: 'baseline', name: 'Original balance', reserve: 0, advantage: 1, neutral: .22, attack: .70, city: .60 },
  { id: 'guarded', name: 'Larger reserves', reserve: .05, advantage: 1.1, neutral: .20, attack: .66, city: .60 },
  { id: 'opportunist', name: 'Earlier attacks', reserve: -.04, advantage: .9, neutral: .22, attack: .70, city: .60 },
  { id: 'expander', name: 'Faster expansion', reserve: 0, advantage: 1, neutral: .29, attack: .72, city: .60 },
  { id: 'measured', name: 'Smaller troop sends', reserve: 0, advantage: 1, neutral: .16, attack: .64, city: .60 },
  { id: 'cities', name: 'Earlier city growth', reserve: 0, advantage: 1, neutral: .22, attack: .70, city: .64 },
  { id: 'income', name: 'Income before cities', reserve: 0, advantage: 1, neutral: .22, attack: .70, city: .56 }
].map(Object.freeze));
const empty = () => ({ version: 1, total: 0, wins: 0, contexts: [], history: [], seen: [], outcomes: [] });
const arm = () => ({ games: 0, wins: 0, weight: 0, reward: 0 });
const bounded = (n, max = 1e9) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;

export function validateModel(raw) {
  if (typeof raw !== 'string' || raw.length * 2 > LIMITS.bytes) throw new Error('Learning file exceeds 64 KiB.');
  const d = JSON.parse(raw);
  if (d?.version !== 1 || !Number.isInteger(d.total) || !bounded(d.total) || !Number.isInteger(d.wins)
    || !bounded(d.wins, d.total) || !Array.isArray(d.contexts) || d.contexts.length > LIMITS.contexts
    || !Array.isArray(d.history) || d.history.length > LIMITS.history || !Array.isArray(d.seen)
    || d.seen.length > LIMITS.seen) throw new Error('Unsupported learning file.');
  const contexts = d.contexts.map(c => {
    if (!text(c.key, 180) || !bounded(c.used) || !Array.isArray(c.arms) || c.arms.length !== VARIANTS.length) throw new Error('Invalid strategy statistics.');
    const arms = c.arms.map(a => {
      if (!Number.isInteger(a.games) || !bounded(a.games) || !Number.isInteger(a.wins) || !bounded(a.wins, a.games)
        || !bounded(a.weight, 51) || !bounded(a.reward, a.weight + 1e-9)) throw new Error('Invalid strategy scores.');
      return { games: a.games, wins: a.wins, weight: a.weight, reward: a.reward };
    });
    return { key: c.key, used: c.used, arms };
  });
  if (new Set(contexts.map(c => c.key)).size !== contexts.length) throw new Error('Duplicate learning contexts.');
  const history = d.history.map(h => {
    if (!text(h.id, 100) || !text(h.context, 180) || !VARIANTS.some(v => v.id === h.variant)
      || typeof h.win !== 'boolean' || !bounded(h.ticks) || !bounded(h.commands) || !bounded(h.coverage, 1)
      || !bounded(h.date, 1e15)) throw new Error('Invalid match summary.');
    const reward = h.reward ?? Number(h.win);
    if (!bounded(reward, 1)) throw new Error('Invalid match reward.');
    let territory = null;
    if (h.territory != null) {
      const t = h.territory;
      if (!bounded(t.peakShare, 1) || !bounded(t.averageShare, t.peakShare + 1e-9)
        || !bounded(t.observedTicks, h.ticks)) throw new Error('Invalid territory summary.');
      territory = { peakShare: t.peakShare, averageShare: t.averageShare, observedTicks: t.observedTicks };
    }
    return { reward, territory, id: h.id, context: h.context, variant: h.variant, win: h.win, ticks: h.ticks,
      commands: h.commands, coverage: h.coverage, date: h.date };
  });
  if (d.seen.some(s => !text(s, 100))) throw new Error('Invalid match identifiers.');
  const outcomes = d.outcomes ?? history.map(h => h.win);
  if (!Array.isArray(outcomes) || outcomes.length > Math.min(d.total, LIMITS.outcomes)
    || outcomes.some(w => typeof w !== 'boolean')) throw new Error('Invalid recent outcomes.');
  return { version: 1, total: d.total, wins: d.wins, contexts, history, seen: [...new Set(d.seen)], outcomes };
}

export function contextKey(game, options) {
  const config = game.config().gameConfig?.() ?? {};
  // Exact map names deliberately share experience; mode, difficulty, rules, and
  // enabled bot features do not. LRU limits total retained contexts.
  const part = x => String(x ?? 'unknown').replace(/[|]/g, '_').slice(0, 24);
  const custom = Boolean(config.infiniteGold || config.infiniteTroops || config.instantBuild);
  return ['conquest-v10-flanks', config.gameType, config.gameMode, config.difficulty, custom ? 'custom' : 'normal',
    options.profile, `${+options.economy}${+options.navy}${+options.nukes}${+(options.diplomacy !== false)}`].map(part).join('|');
}
export const optionsKey = o => JSON.stringify([o.profile, o.economy, o.navy, o.nukes, o.learning, o.diplomacy !== false]);

export class LearningStore {
  constructor(storage = null, locks = null) {
    this.storage = storage; this.locks = locks; this.data = empty(); this.warning = ''; this.dirty = false;
    this.reload();
  }
  reload() {
    if (this.dirty) return;
    if (!this.storage) { this.warning = 'Storage unavailable: learning lasts only in this tab.'; return; }
    try {
      const raw = this.storage.getItem(LEARNING_KEY);
      this.data = raw ? validateModel(raw) : empty();
      this.warning = '';
    } catch { this.warning = 'Saved learning could not be read; using the current in-memory model.'; }
  }
  persist() {
    const raw = JSON.stringify(this.data);
    if (raw.length * 2 > LIMITS.bytes) throw new Error('Learning memory exceeded its size limit.');
    try {
      if (!this.storage) throw new Error('no storage');
      this.storage.setItem(LEARNING_KEY, raw); this.warning = ''; this.dirty = false;
    } catch { this.dirty = true; this.warning = 'Could not save learning: changes last only in this tab. Export a backup.'; }
  }
  context(key, create = false) {
    let c = this.data.contexts.find(c => c.key === key);
    if (!c && create) {
      if (this.data.contexts.length >= LIMITS.contexts) {
        this.data.contexts.sort((a, b) => a.used - b.used).shift();
      }
      c = { key, used: this.data.total, arms: VARIANTS.map(arm) }; this.data.contexts.push(c);
    }
    return c;
  }
  select(key) {
    this.reload();
    const c = this.context(key), stats = c?.arms ?? VARIANTS.map(arm);
    const untried = stats.findIndex(a => a.games === 0);
    let index = untried;
    if (index < 0) {
      const total = stats.reduce((s, a) => s + a.weight, 0);
      const score = a => (a.reward + 1) / (a.weight + 2) + .35 * Math.sqrt(Math.log(total + 1) / (a.weight + 1));
      index = stats.reduce((best, a, i) => score(a) > score(stats[best]) ? i : best, 0);
    }
    return VARIANTS[index];
  }
  async record(summary, accept = () => true) {
    const commit = () => {
      if (!accept()) return false;
      // Re-read under the origin-wide Web Lock so two tabs don't overwrite a result.
      this.reload();
      if (this.data.seen.includes(summary.id)) return false;
      const index = VARIANTS.findIndex(v => v.id === summary.variant);
      if (index < 0 || typeof summary.win !== 'boolean' || !text(summary.id, 100) || !text(summary.context, 180)) throw new Error('Invalid learning result.');
      const reward = summary.reward ?? Number(summary.win);
      if (!bounded(reward, 1)) throw new Error('Invalid match reward.');
      const next = structuredClone(this.data);
      const old = this.data; this.data = next;
      try {
        const c = this.context(summary.context, true);
        // Discount old evidence to adjust gradually when opponents or the game change.
        for (const a of c.arms) { a.weight *= .98; a.reward *= .98; }
        const a = c.arms[index]; a.games++; a.wins += +summary.win; a.weight++; a.reward += reward;
        this.data.outcomes = [...this.data.outcomes, summary.win].slice(-LIMITS.outcomes);
        this.data.total++; this.data.wins += +summary.win; c.used = this.data.total;
        this.data.history.push({ ...summary, date: Date.now() });
        this.data.history = this.data.history.slice(-LIMITS.history);
        this.data.seen = [...this.data.seen, summary.id].slice(-LIMITS.seen);
        this.data = validateModel(JSON.stringify(this.data));
        this.persist(); return true;
      } catch (error) { this.data = old; throw error; }
    };
    return this.locks?.request ? this.locks.request(LEARNING_KEY, commit) : commit();
  }
  async reset(accept = () => true) {
    const reset = () => { if (!accept()) return; this.data = empty(); this.persist(); };
    return this.locks?.request ? this.locks.request(LEARNING_KEY, reset) : reset();
  }
  async import(raw, accept = () => true) {
    const data = validateModel(raw);
    const save = () => { if (!accept()) return; this.data = data; this.persist(); };
    return this.locks?.request ? this.locks.request(LEARNING_KEY, save) : save();
  }
  export() { return JSON.stringify(this.data); }
  winRate(window = 20) {
    const requested = Number.isFinite(Number(window)) ? Math.max(1, Math.min(LIMITS.outcomes, Math.floor(Number(window)))) : 20;
    const outcomes = this.data.outcomes.slice(-requested), games = outcomes.length;
    const wins = outcomes.filter(Boolean).length;
    return { requested, games, wins, percent: games ? wins / games * 100 : null };
  }
  summary(key) {
    const context = this.context(key);
    const rows = context?.arms.map((a, i) => ({ ...a, name: VARIANTS[i].name })) ?? [];
    return { total: this.data.total, wins: this.data.wins, bytes: JSON.stringify(this.data).length * 2,
      contexts: this.data.contexts.length, warning: this.warning, rows,
      recent: this.data.history.slice(-8).reverse() };
  }
}
