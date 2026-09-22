/** Ordered delivery to the UI. Socket traffic continues while dice settle. */
export class RollPresentation {
  private pending: { run: () => void; discard?: () => void }[] = [];
  private holds = 0;
  private draining = false;
  private generation = 0;

  deliver(action: () => void, discard?: () => void): void {
    this.pending.push({ run: action, discard });
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

  clear(): void {
    this.generation++;
    const pending = this.pending.splice(0);
    this.holds = 0;
    for (const action of pending) action.discard?.();
  }

  private flush(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.holds && this.pending.length) this.pending.shift()!.run();
    } finally {
      this.draining = false;
    }
  }
}

export const rollPresentation = new RollPresentation();
