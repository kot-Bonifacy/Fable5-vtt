/**
 * Instancja E2E trzymana przy życiu przez ten proces — do oględzin MCP z narzędzi,
 * które zamykają całe drzewo procesów po powrocie polecenia (Windows, powłoka agenta).
 * Ctrl+C albo zabicie procesu gasi instancję.
 *
 *   E2E_GM_PASSWORD=… node instance/hold.ts [--skip-build]
 */
import { buildAll, startInstance, stopInstance } from './instance.ts';
import { BASE_URL } from './paths.ts';

if (!process.argv.includes('--skip-build')) buildAll();
await startInstance();
console.log(`Instancja E2E: ${BASE_URL} (proces trzyma ją przy życiu)`);
const stop = () => void stopInstance().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 60_000);
