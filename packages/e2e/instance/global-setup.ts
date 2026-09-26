import {
  buildAll,
  ensureSecrets,
  prepareFresh,
  restoreCheckpoint,
  startInstance,
  stopInstance,
} from './instance.ts';

/**
 * Start przebiegu: build, świeża baza albo punkt kontrolny, instancja.
 *
 * - `E2E_FROM=po-T3` — start z punktu kontrolnego zamiast pustej bazy (4.4);
 * - `E2E_SKIP_BUILD=1` — bez buildu (kod się nie zmienił od ostatniego przebiegu).
 *
 * Zwrócona funkcja to sprzątanie: Playwright woła ją po wszystkich testach.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  ensureSecrets();
  if (!process.env.E2E_SKIP_BUILD) buildAll();
  const from = process.env.E2E_FROM;
  if (from) await restoreCheckpoint(from);
  else await prepareFresh();
  await startInstance();
  return stopInstance;
}
