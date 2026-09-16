// Wins dominate: even the best losing game scores below any winning game.
export function matchReward(win, territory = null) {
  return .70 * Number(win) + .20 * (territory?.peakShare ?? 0) + .10 * (territory?.averageShare ?? 0);
}

// Constant memory. Use original map land, so fallout cannot inflate the share.
export class TerritoryReward {
  constructor(game, player) {
    this.land = Number(game.numLandTiles?.());
    this.valid = Number.isFinite(this.land) && this.land > 0;
    this.peak = 0; this.integral = 0; this.ticks = 0;
    this.last = this.read(player);
  }
  read(player) {
    const tiles = Number(player?.numTilesOwned?.());
    if (!Number.isFinite(tiles) || tiles < 0) { this.valid = false; return 0; }
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
}
