import type { RealtimeDeps } from './registry.js';

/** Defer view emissions, never mutations, until a handler has published its rolls.
 * Sequence numbers and visibility filtering still run at actual delivery time.
 */
export async function withPresentation<T>(
  deps: RealtimeDeps,
  run: (scoped: RealtimeDeps) => Promise<T> | T,
): Promise<T> {
  if (deps.presentation) return run(deps);
  const presentation: (() => Promise<void> | void)[] = [];
  const scoped: RealtimeDeps = { ...deps, presentation };
  try {
    return await run(scoped);
  } finally {
    delete scoped.presentation;
    for (const emit of presentation) await emit();
  }
}

/**
 * Sends every view deferred so far, now, in order (etap 70e).
 *
 * For a handler that goes on to roll for somebody else — the Net's defence
 * answering a netrunner's move, a Black ICE playing its seat in the queue. The
 * rolls published so far are already on the wire, so their views may follow;
 * what the next roll changes is deferred behind *it* again. Without this the
 * table would see the move and the ICE's attack in the wrong order: the attack's
 * dice first, the netrunner arriving on the floor after them.
 */
export async function flushPresentation(deps: RealtimeDeps): Promise<void> {
  const due = deps.presentation?.splice(0) ?? [];
  for (const emit of due) await emit();
}

export function deferView(
  deps: RealtimeDeps,
  emit: (ready: RealtimeDeps) => Promise<void> | void,
): boolean {
  if (!deps.presentation) return false;
  const { presentation, ...ready } = deps;
  presentation.push(() => emit(ready));
  return true;
}
