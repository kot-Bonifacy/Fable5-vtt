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

export function deferView(
  deps: RealtimeDeps,
  emit: (ready: RealtimeDeps) => Promise<void> | void,
): boolean {
  if (!deps.presentation) return false;
  const { presentation, ...ready } = deps;
  presentation.push(() => emit(ready));
  return true;
}
