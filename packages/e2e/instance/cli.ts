/**
 * Ręczne sterowanie instancją E2E — do oględzin MCP na instancji testowej i do
 * sprzątania po przerwanym przebiegu:
 *
 *   pnpm --filter @vtt/e2e instance stop
 *   pnpm --filter @vtt/e2e instance fresh      # pusta baza, bez startu
 *   pnpm --filter @vtt/e2e instance start      # build + start (hasło MG z E2E_GM_PASSWORD)
 *   pnpm --filter @vtt/e2e instance save <nazwa>
 *   pnpm --filter @vtt/e2e instance restore <nazwa>
 */
import {
  buildAll,
  prepareFresh,
  restoreCheckpoint,
  saveCheckpoint,
  startInstance,
  stopInstance,
} from './instance.ts';
import { BASE_URL } from './paths.ts';

const [command, name] = process.argv.slice(2);

switch (command) {
  case 'stop':
    await stopInstance();
    break;
  case 'fresh':
    await prepareFresh();
    break;
  case 'start':
    if (!process.env.E2E_GM_PASSWORD) {
      console.log('Brak E2E_GM_PASSWORD — hasło MG będzie losowe i nieznane.');
    }
    buildAll();
    await startInstance();
    console.log(`Instancja E2E: ${BASE_URL}`);
    break;
  case 'save':
    if (!name) throw new Error('Podaj nazwę punktu.');
    saveCheckpoint(name);
    break;
  case 'restore':
    if (!name) throw new Error('Podaj nazwę punktu.');
    await restoreCheckpoint(name);
    break;
  default:
    console.log('Komendy: stop | fresh | start | save <nazwa> | restore <nazwa>');
    process.exitCode = 1;
}
