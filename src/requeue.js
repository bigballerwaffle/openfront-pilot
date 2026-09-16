export const REQUEUE_KEY = 'openfront-pilot-requeue-v1';
export function consumeRequeue(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(REQUEUE_KEY);
    storage.removeItem(REQUEUE_KEY);
    const data = JSON.parse(raw);
    return data?.expires > now && data.expires <= now + 120000;
  } catch {
    return false;
  }
}
export class AutoRequeue {
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
    } catch {}
  }
  recover(active) {
    if (!active() || this.navigating) return;
    this.storage.setItem(REQUEUE_KEY, JSON.stringify({ expires: Date.now() + 120000 }));
    this.navigating = true;
    try {
      this.navigate('/');
    } catch (error) {
      this.navigating = false;
      this.storage.removeItem(REQUEUE_KEY);
      throw error;
    }
  }
  async step(active, now = Date.now()) {
    if (this.busy || this.navigating) return this.busy || this.navigating;
    const g = this.adapter.game,
      me = g?.myPlayer(),
      config = g?.config();
    if (
      !active() ||
      !g ||
      config?.isReplay?.() ||
      g.isCatchingUp?.() ||
      (g.inSpawnPhase() && !config?.isIntentionalSpectator?.())
    ) {
      this.unspawnable = null;
      return false;
    }
    const spectator = config?.isIntentionalSpectator?.() || !me || me.hasSpawned?.() === false;
    if (spectator) {
      if (this.unspawnable?.game !== g) this.unspawnable = { game: g, since: now };
    } else this.unspawnable = null;
    const stranded = this.unspawnable && now - this.unspawnable.since >= 15000;
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
          }),
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
}
