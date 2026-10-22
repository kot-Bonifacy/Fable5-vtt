import { readFileSync } from 'node:fs';
import yauzl from 'yauzl';

/**
 * Paczka ZIP z „Kopii” (etap 57a) w E2E: manifest, dane i lista plików.
 * Czyta się całą do pamięci — paczki w suicie mają po kilka MB.
 */
export interface ArchivePackage<T = Record<string, unknown>> {
  manifest: {
    app: string;
    kind: 'character' | 'scene' | 'campaign';
    campaignName: string;
    counts: Record<string, number>;
    omitted: string[];
    files: string[];
    entries: { path: string; url: string; bytes: number; sha256: string }[];
  };
  payload: T;
  /** Ścieżki plików w paczce (`files/<katalog>/<plik>`). */
  files: string[];
}

export function readPackage<T = Record<string, unknown>>(path: string): Promise<ArchivePackage<T>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(readFileSync(path), { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const texts = new Map<string, string>();
      const files: string[] = [];
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName.startsWith('files/')) {
          files.push(entry.fileName);
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            texts.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () =>
        resolve({
          manifest: JSON.parse(texts.get('manifest.json') ?? 'null') as ArchivePackage['manifest'],
          payload: JSON.parse(texts.get('data.json') ?? 'null') as T,
          files,
        }),
      );
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}
