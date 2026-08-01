import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { EMPTY_COVER_CATALOGUE, buildCoverCatalogue, type CpredCoverCatalogue } from '@vtt/shared';

/**
 * The cover catalogue (stage 16c): material × thickness, straight off the table
 * on s. 180, plus the presets the GM's tool palette offers.
 *
 * Loaded exactly like the status registry — one committed file under
 * `data/public/cpred/`, with `data/private/` allowed to replace it when a group
 * wants its own list. The file is what the *server* trusts: a placement names a
 * preset id and nothing else, so a client cannot type its own body points into
 * a car.
 *
 * A missing file is not fatal. It leaves the palette empty and every placement
 * refused, which reads as „no covers configured" rather than as a broken VTT.
 */
export async function loadCoverCatalogue(
  dataPublicDir: string,
  dataPrivateDir: string,
  log: FastifyBaseLogger,
): Promise<CpredCoverCatalogue> {
  // Private last so it wins; a missing private directory is the normal case.
  const paths = [
    join(dataPublicDir, 'cpred', 'covers.json'),
    join(dataPrivateDir, 'cpred', 'covers.json'),
  ];
  let loaded: unknown;
  for (const path of paths) {
    try {
      loaded = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ err: error, path }, 'cover catalogue file skipped');
      }
    }
  }
  if (loaded === undefined) {
    log.warn({ paths }, 'cover catalogue not found');
    return EMPTY_COVER_CATALOGUE;
  }
  const catalogue = buildCoverCatalogue(loaded);
  if (catalogue.presets.length === 0) log.warn('cover catalogue has no presets');
  return catalogue;
}
