/** Monotonic active time, independent of explanation reading and hidden tabs. */
export class RecallClock {
  private elapsed = 0;
  private since: number | null = null;
  constructor(private readonly now: () => number, elapsed = 0) { this.elapsed = elapsed; }
  setRunning(running: boolean): void {
    if (running === (this.since !== null)) return;
    if (running) this.since = this.now();
    else { this.elapsed = this.read(); this.since = null; }
  }
  read(): number { return Math.max(0, Math.round(this.elapsed + (this.since === null ? 0 : this.now() - this.since))); }
}
