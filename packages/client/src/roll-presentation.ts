/** Ordered delivery to the UI. Socket traffic continues while dice settle. */
export class RollPresentation {
  private pending: { run: () => void; discard?: () => void; at: number; roll: boolean }[] = [];
  private holds = 0;
  private draining = false;
  private generation = 0;
  /** Arrival time of the action being run right now; null between actions. */
  private deliveringAt: number | null = null;
  private rollWaiters: (() => void)[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * `roll` marks a live roll — the dice of the one on the table cut their
   * pause short for it (#48, `untilRollWaiting`).
   */
  deliver(action: () => void, discard?: () => void, roll = false): void {
    this.pending.push({ run: action, discard, at: this.now(), roll });
    if (roll) for (const wake of this.rollWaiters.splice(0)) wake();
    this.flush();
  }

  hold(until: Promise<unknown>, onSettled: () => void = () => {}): void {
    const generation = this.generation;
    this.holds++;
    const release = () => {
      if (generation !== this.generation) return;
      try {
        onSettled();
      } finally {
        this.holds--;
        this.flush();
      }
    };
    void until.then(release, release);
  }

  /**
   * How long the action now being delivered waited behind the dice (#48).
   * Zero outside a delivery — a fresh action never waited.
   */
  lagMs(): number {
    return this.deliveringAt === null ? 0 : this.now() - this.deliveringAt;
  }

  /** Resolves once a live roll queues behind the current one (at once if one does). */
  untilRollWaiting(): Promise<void> {
    if (this.pending.some((item) => item.roll)) return Promise.resolve();
    return new Promise((resolve) => this.rollWaiters.push(resolve));
  }

  clear(): void {
    this.generation++;
    const pending = this.pending.splice(0);
    this.holds = 0;
    for (const action of pending) action.discard?.();
    for (const wake of this.rollWaiters.splice(0)) wake();
  }

  private flush(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.holds && this.pending.length) {
        const item = this.pending.shift()!;
        this.deliveringAt = item.at;
        try {
          item.run();
        } finally {
          this.deliveringAt = null;
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

export const rollPresentation = new RollPresentation();
