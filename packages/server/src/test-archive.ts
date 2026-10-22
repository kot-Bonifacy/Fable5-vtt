import { randomBytes } from 'node:crypto';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { ArchiveFile, ArchivePackageManifest } from '@vtt/shared';
import { ARCHIVE_IMPORT_PATH } from '@vtt/shared';
import type { BuiltApp } from './app.js';

/**
 * Paczki ZIP w testach dymnych (etap 57a): rozpakowanie pobranej paczki,
 * złożenie własnej (także złośliwej) i wczytanie trasą `POST /api/archive/import`.
 */

export interface ReadPackage<T> extends ArchiveFile<T> {
  manifest: ArchivePackageManifest;
  /** Pliki z `files/…` po ścieżce w paczce. */
  files: Map<string, Buffer>;
  /** Kolejność wpisów w ZIP-ie — manifest ma być pierwszy. */
  order: string[];
}

export function readPackage<T>(zip: Buffer): Promise<ReadPackage<T>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zip, { lazyEntries: true }, (error, file) => {
      if (error) return reject(error);
      const entries = new Map<string, Buffer>();
      const order: string[] = [];
      file.on('entry', (entry: yauzl.Entry) => {
        order.push(entry.fileName);
        file.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            file.readEntry();
          });
        });
      });
      file.on('end', () => {
        const manifest = JSON.parse(String(entries.get('manifest.json'))) as ArchivePackageManifest;
        const payload = JSON.parse(String(entries.get('data.json'))) as T;
        const files = new Map([...entries].filter(([path]) => path.startsWith('files/')));
        resolve({ manifest, payload, files, order });
      });
      file.on('error', reject);
      file.readEntry();
    });
  });
}

/** ZIP z podanych wpisów — po kolei, bez kompresji. */
export function zipOf(entries: { path: string; data: Buffer | string }[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    zip.addBuffer(Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data), entry.path);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

/** Paczka z gotowego pliku wymiany i plików (ścieżka w paczce → zawartość). */
export function repack<T>(file: ReadPackage<T>, payload: unknown = file.payload): Promise<Buffer> {
  return zipOf([
    { path: 'manifest.json', data: JSON.stringify(file.manifest) },
    { path: 'data.json', data: JSON.stringify(payload) },
    ...[...file.files].map(([path, data]) => ({ path, data })),
  ]);
}

export function multipartFile(
  filename: string,
  content: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----vtt${randomBytes(8).toString('hex')}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** „Wczytaj z pliku…” — paczka (Buffer) albo stary plik JSON (obiekt). */
export async function importArchive(
  built: BuiltApp,
  cookie: string,
  content: Buffer | object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(JSON.stringify(content));
  const { payload, headers } = multipartFile(
    Buffer.isBuffer(content) ? 'paczka.zip' : 'plik.json',
    buffer,
  );
  const res = await built.app.inject({
    method: 'POST',
    url: ARCHIVE_IMPORT_PATH,
    headers: { ...headers, cookie },
    payload,
  });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

/** Pobranie paczki trasą eksportu. */
export async function downloadPackage<T>(
  built: BuiltApp,
  url: string,
  cookie: string,
): Promise<ReadPackage<T>> {
  const res = await built.app.inject({ method: 'GET', url, headers: { cookie } });
  if (res.statusCode !== 200) throw new Error(`${url}: ${res.statusCode} ${res.body}`);
  return readPackage<T>(res.rawPayload);
}
