import { describe, expect, it, vi } from 'vitest';
import type { RealtimeDeps } from './realtime/registry.js';
import { deferView, withPresentation } from './realtime/presentation.js';

describe('roll view delivery', () => {
  it('publishes the dice before earlier result-dependent views, without delaying mutations', async () => {
    const deps = {} as RealtimeDeps;
    const seen: string[] = [];
    await withPresentation(deps, async (scoped) => {
      seen.push('save death result');
      deferView(scoped, () => {
        seen.push('character');
      });
      deferView(scoped, () => {
        seen.push('dead token');
      });
      expect(seen).toEqual(['save death result']);
      seen.push('roll');
    });
    expect(seen).toEqual(['save death result', 'roll', 'character', 'dead token']);
  });

  it('nested actions share the boundary and delivery cannot recursively defer itself', async () => {
    const seen: string[] = [];
    await withPresentation({} as RealtimeDeps, async (outer) => {
      await withPresentation(outer, async (inner) => {
        expect(inner).toBe(outer);
        deferView(inner, (ready) => {
          expect(deferView(ready, vi.fn())).toBe(false);
          seen.push('view');
        });
      });
      expect(seen).toEqual([]);
      seen.push('roll');
    });
    expect(seen).toEqual(['roll', 'view']);
  });

  it('flushes saved state on error and does not retain subsequent background emissions', async () => {
    const emit = vi.fn();
    let retained!: RealtimeDeps;
    await expect(
      withPresentation({} as RealtimeDeps, async (scoped) => {
        retained = scoped;
        deferView(scoped, emit);
        throw new Error('failed after mutation');
      }),
    ).rejects.toThrow('failed after mutation');
    expect(emit).toHaveBeenCalledOnce();
    expect(deferView(retained, emit)).toBe(false);
  });

  it('concurrent requests cannot flush one another’s pending views', async () => {
    const seen: string[] = [];
    const deps = {} as RealtimeDeps;
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const first = withPresentation(deps, async (scoped) => {
      deferView(scoped, () => {
        seen.push('first');
      });
      await waiting;
    });
    await withPresentation(deps, (scoped) => {
      deferView(scoped, () => {
        seen.push('second');
      });
    });
    expect(seen).toEqual(['second']);
    finish();
    await first;
    expect(seen).toEqual(['second', 'first']);
  });
});
