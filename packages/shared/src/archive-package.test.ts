import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_APP,
  ARCHIVE_PACKAGE_DATA,
  ARCHIVE_PACKAGE_MANIFEST,
  ARCHIVE_PACKAGE_VERSION,
  ARCHIVE_VERSION,
  type ArchivePackageEntry,
  type ArchivePackageListing,
  archiveListingRefusal,
  archivePackagePath,
  archivePackageRefusal,
  archiveRefusal,
  isSafeArchivePath,
} from './archive.js';

const SHA = 'a'.repeat(64);
const MAP_URL = '/uploads/campaigns/cmp1/maps/brama.webp';

function entry(patch: Partial<ArchivePackageEntry> = {}): ArchivePackageEntry {
  return { path: 'files/maps/brama.webp', url: MAP_URL, bytes: 1000, sha256: SHA, ...patch };
}

function head(entries: unknown[] = [entry()], patch: Record<string, unknown> = {}) {
  return {
    app: ARCHIVE_APP,
    kind: 'scene',
    version: ARCHIVE_VERSION,
    exportedAt: '2026-10-22T10:00:00.000Z',
    campaignName: 'Nocna zmiana',
    counts: {},
    omitted: [],
    files: [MAP_URL],
    package: ARCHIVE_PACKAGE_VERSION,
    entries,
    ...patch,
  };
}

const base: ArchivePackageListing[] = [
  { path: ARCHIVE_PACKAGE_MANIFEST, bytes: 400 },
  { path: ARCHIVE_PACKAGE_DATA, bytes: 9000 },
];
const limits = { maxBytes: 1_000_000, maxEntries: 10 };

describe('archivePackagePath', () => {
  it('plik kampanii i płaski stary dostają tę samą ścieżkę w paczce', () => {
    expect(archivePackagePath(MAP_URL)).toBe('files/maps/brama.webp');
    expect(archivePackagePath('/uploads/maps/brama.webp')).toBe('files/maps/brama.webp');
    expect(archivePackagePath('/uploads/campaigns/x/portraits/p_1.webp')).toBe(
      'files/portraits/p_1.webp',
    );
  });

  it('pliki wspólne, dane publiczne i śmieci nie jadą', () => {
    expect(archivePackagePath('/uploads/art/welcome.webp')).toBeNull();
    expect(archivePackagePath('/public/icons/x.svg')).toBeNull();
    expect(archivePackagePath('/uploads/campaigns/x/maps/../../etc/passwd')).toBeNull();
    expect(archivePackagePath('https://example.com/a.png')).toBeNull();
  });
});

describe('isSafeArchivePath (zip slip)', () => {
  it.each([
    ARCHIVE_PACKAGE_MANIFEST,
    ARCHIVE_PACKAGE_DATA,
    'files/maps/a.webp',
    'files/music/t-1.mp3',
  ])('przepuszcza %s', (path) => expect(isSafeArchivePath(path)).toBe(true));

  it.each([
    '../manifest.json',
    'files/maps/../../../evil.js',
    '/etc/passwd',
    'C:/Windows/evil.dll',
    'files\\maps\\a.webp',
    'files/maps/',
    'files/maps/a',
    'files/maps/sub/a.webp',
    'files/scripts/a.js',
    'files//a.webp',
    'readme.txt',
  ])('odmawia %s', (path) => expect(isSafeArchivePath(path)).toBe(false));
});

describe('archiveListingRefusal', () => {
  const listing = [...base, { path: 'files/maps/brama.webp', bytes: 1000 }];

  it('przepuszcza poprawny katalog', () => {
    expect(archiveListingRefusal(listing, limits)).toBeNull();
  });

  it('ścieżka poza katalogiem paczki to zip slip', () => {
    expect(archiveListingRefusal([...base, { path: '../../x.webp', bytes: 1 }], limits)).toBe(
      'ARCHIVE_PACKAGE_UNSAFE_PATH',
    );
  });

  it('za dużo po rozpakowaniu albo za dużo plików — za duża (zip bomb)', () => {
    expect(
      archiveListingRefusal([...base, { path: 'files/maps/b.webp', bytes: 2_000_000 }], limits),
    ).toBe('ARCHIVE_PACKAGE_TOO_LARGE');
    const many = Array.from({ length: 11 }, (_, i) => ({
      path: `files/maps/m${i}.webp`,
      bytes: 1,
    }));
    expect(archiveListingRefusal([...base, ...many], limits)).toBe('ARCHIVE_PACKAGE_TOO_LARGE');
  });

  it('bez manifestu albo danych, z dublem — uszkodzona', () => {
    expect(archiveListingRefusal([base[1]!], limits)).toBe('ARCHIVE_PACKAGE_CORRUPT');
    expect(archiveListingRefusal([base[0]!], limits)).toBe('ARCHIVE_PACKAGE_CORRUPT');
    expect(archiveListingRefusal([...base, base[0]!], limits)).toBe('ARCHIVE_PACKAGE_CORRUPT');
  });
});

describe('archivePackageRefusal', () => {
  const listing = [...base, { path: 'files/maps/brama.webp', bytes: 1000 }];

  it('przepuszcza manifest zgodny z katalogiem', () => {
    expect(archivePackageRefusal(listing, head())).toBeNull();
    expect(archiveRefusal({ manifest: head() })).toBeNull();
  });

  it('plik spoza listy', () => {
    expect(
      archivePackageRefusal([...listing, { path: 'files/tokens/x.webp', bytes: 5 }], head()),
    ).toBe('ARCHIVE_PACKAGE_UNLISTED');
  });

  it('rozmiar inny niż na liście albo plik z listy, którego nie ma', () => {
    expect(
      archivePackageRefusal([...base, { path: 'files/maps/brama.webp', bytes: 999 }], head()),
    ).toBe('ARCHIVE_PACKAGE_CORRUPT');
    expect(archivePackageRefusal(base, head())).toBe('ARCHIVE_PACKAGE_CORRUPT');
  });

  it('wpis z adresem prowadzącym gdzie indziej niż jego ścieżka', () => {
    expect(
      archivePackageRefusal(
        listing,
        head([entry({ url: '/uploads/campaigns/c/tokens/brama.webp' })]),
      ),
    ).toBe('ARCHIVE_PACKAGE_UNSAFE_PATH');
    expect(archivePackageRefusal(listing, head([entry({ path: '../brama.webp' })]))).toBe(
      'ARCHIVE_PACKAGE_UNSAFE_PATH',
    );
  });

  it('manifest bez paczki, z zepsutym wpisem albo z nowszej wersji', () => {
    expect(archivePackageRefusal(listing, null)).toBe('ARCHIVE_MALFORMED');
    expect(archivePackageRefusal(listing, head(undefined, { package: undefined }))).toBe(
      'ARCHIVE_MALFORMED',
    );
    expect(archivePackageRefusal(listing, head([entry({ sha256: 'xyz' })]))).toBe(
      'ARCHIVE_MALFORMED',
    );
    expect(
      archivePackageRefusal(listing, head(undefined, { package: ARCHIVE_PACKAGE_VERSION + 1 })),
    ).toBe('ARCHIVE_TOO_NEW');
  });

  it('dwa adresy na jedną ścieżkę muszą nieść ten sam rozmiar', () => {
    const twin = entry({ url: '/uploads/maps/brama.webp' });
    expect(archivePackageRefusal(listing, head([entry(), twin]))).toBeNull();
    expect(archivePackageRefusal(listing, head([entry(), { ...twin, bytes: 3 }]))).toBe(
      'ARCHIVE_PACKAGE_CORRUPT',
    );
  });
});

describe('archiveRefusal bez oczekiwanego rodzaju', () => {
  it('rodzaj mówi plik, a nieznany rodzaj to zły rodzaj', () => {
    expect(archiveRefusal({ manifest: head(undefined, { kind: 'campaign' }) })).toBeNull();
    expect(archiveRefusal({ manifest: head(undefined, { kind: 'macro' }) })).toBe(
      'ARCHIVE_WRONG_KIND',
    );
  });
});
