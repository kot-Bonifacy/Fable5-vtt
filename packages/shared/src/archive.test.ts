import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_APP,
  ARCHIVE_VERSION,
  type ArchiveManifest,
  archiveRefusal,
  archiveRefusalText,
  formatArchiveBytes,
  planSnapshotRotation,
  SNAPSHOT_RULES_DEFAULT,
  snapshotDateOf,
  snapshotDayOf,
  snapshotName,
} from './archive.js';

function manifest(patch: Partial<ArchiveManifest> = {}): { manifest: ArchiveManifest } {
  return {
    manifest: {
      app: ARCHIVE_APP,
      kind: 'character',
      version: ARCHIVE_VERSION,
      exportedAt: '2026-09-05T10:00:00.000Z',
      campaignName: 'Poligon bojowy',
      counts: {},
      omitted: [],
      files: [],
      ...patch,
    } as ArchiveManifest,
  };
}

describe('archiveRefusal', () => {
  it('przepuszcza plik tej wersji i tego rodzaju', () => {
    expect(archiveRefusal(manifest(), 'character')).toBeNull();
  });

  it('przepuszcza plik STARSZY, bo czyta go ten sam kod', () => {
    expect(archiveRefusal(manifest({ version: ARCHIVE_VERSION - 1 }), 'character')).toBeNull();
  });

  it('odmawia pliku z przyszłej wersji schematu', () => {
    expect(archiveRefusal(manifest({ version: ARCHIVE_VERSION + 1 }), 'character')).toBe(
      'ARCHIVE_TOO_NEW',
    );
  });

  it('odmawia pliku innego rodzaju i mówi, czego się spodziewa', () => {
    const code = archiveRefusal(manifest({ kind: 'scene' }), 'character');
    expect(code).toBe('ARCHIVE_WRONG_KIND');
    expect(archiveRefusalText(code!, 'character')).toContain('kartę postaci');
  });

  it('odmawia pliku obcego programu', () => {
    expect(archiveRefusal(manifest({ app: 'foundry' as never }), 'character')).toBe(
      'ARCHIVE_FOREIGN',
    );
  });

  it.each([null, 42, 'tekst', {}, { manifest: null }, { manifest: { app: ARCHIVE_APP } }])(
    'odmawia czegoś, co nie jest plikiem wymiany: %s',
    (value) => {
      expect(archiveRefusal(value, 'character')).toBe('ARCHIVE_MALFORMED');
    },
  );
});

describe('nazwa snapshotu', () => {
  it('niesie dobę i godzinę czasu lokalnego', () => {
    expect(snapshotName(new Date(2026, 8, 5, 14, 30))).toBe('snapshot-2026-09-05-1430');
  });

  it('daje się przeczytać z powrotem', () => {
    const name = snapshotName(new Date(2026, 0, 2, 3, 4));
    expect(name).toBe('snapshot-2026-01-02-0304');
    expect(snapshotDayOf(name)).toBe('2026-01-02');
    expect(snapshotDateOf(name)?.getHours()).toBe(3);
  });

  it('nie rozpoznaje nazwy przemianowanej ręką', () => {
    expect(snapshotDayOf('przed-refaktorem')).toBeNull();
    expect(snapshotDateOf('snapshot-2026-09-05')).toBeNull();
  });

  it('sortuje się leksykalnie tak samo jak chronologicznie', () => {
    const names = [
      snapshotName(new Date(2026, 8, 5, 9, 0)),
      snapshotName(new Date(2026, 8, 5, 10, 0)),
      snapshotName(new Date(2026, 11, 31, 23, 59)),
    ];
    expect([...names].sort()).toEqual(names);
  });
});

describe('planSnapshotRotation', () => {
  /** `n` kopii co godzinę wstecz od podanej chwili, od najstarszej. */
  function hourly(count: number, from = new Date(2026, 8, 5, 12, 0)): string[] {
    return Array.from({ length: count }, (_, i) =>
      snapshotName(new Date(from.getTime() - (count - 1 - i) * 60 * 60 * 1000)),
    );
  }

  it('nic nie kasuje, dopóki kopii jest mniej niż okno godzinowe', () => {
    const plan = planSnapshotRotation(hourly(10), SNAPSHOT_RULES_DEFAULT);
    expect(plan.drop).toEqual([]);
    expect(plan.keep).toHaveLength(10);
  });

  it('zostawia najświeższe okno godzinowe i po jednej kopii na dobę wstecz', () => {
    // 72 kopie co godzinę = trzy pełne doby.
    const plan = planSnapshotRotation(hourly(72), { keepHourly: 24, keepDaily: 14 });
    // 24 godzinowe + po jednej z każdej doby, która w reszcie została.
    expect(plan.keep).toHaveLength(24 + 3);
    expect(plan.drop).toHaveLength(72 - 27);
  });

  it('kasuje od najstarszej — w tej kolejności trzeba usuwać pliki', () => {
    const names = hourly(30);
    const plan = planSnapshotRotation(names, { keepHourly: 24, keepDaily: 0 });
    expect(plan.drop[0]).toBe(names[0]);
    expect(plan.drop.at(-1)).toBe(names[5]);
  });

  it('z doby zostawia kopię najświeższą, nie pierwszą', () => {
    const names = [
      'snapshot-2026-09-01-0800',
      'snapshot-2026-09-01-2300',
      'snapshot-2026-09-05-1200',
    ];
    const plan = planSnapshotRotation(names, { keepHourly: 1, keepDaily: 1 });
    expect(plan.keep).toEqual(['snapshot-2026-09-05-1200', 'snapshot-2026-09-01-2300']);
    expect(plan.drop).toEqual(['snapshot-2026-09-01-0800']);
  });

  it('liczy doby z tego, co na dysku, a nie z kalendarza', () => {
    // Serwer stał wyłączony pół roku; dwie doby kopii mają przeżyć obie.
    const names = ['snapshot-2026-03-01-1200', 'snapshot-2026-09-05-1200'];
    const plan = planSnapshotRotation(names, { keepHourly: 0, keepDaily: 2 });
    expect(plan.drop).toEqual([]);
  });

  it('nigdy nie kasuje kopii przemianowanej ręką', () => {
    const names = [...hourly(30), 'przed-refaktorem', 'dev.db.bak-20260731-16b'];
    const plan = planSnapshotRotation(names, { keepHourly: 1, keepDaily: 0 });
    expect(plan.ignored).toEqual(['przed-refaktorem', 'dev.db.bak-20260731-16b']);
    expect(plan.drop).not.toContain('przed-refaktorem');
  });

  it('zerowa rotacja kasuje wszystko poza nierozpoznanym', () => {
    const plan = planSnapshotRotation([...hourly(3), 'moja-kopia'], {
      keepHourly: 0,
      keepDaily: 0,
    });
    expect(plan.keep).toEqual([]);
    expect(plan.drop).toHaveLength(3);
    expect(plan.ignored).toEqual(['moja-kopia']);
  });
});

describe('formatArchiveBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 kB'],
    [1_159_168, '1,1 MB'],
  ])('%i → %s', (bytes, text) => {
    expect(formatArchiveBytes(bytes)).toBe(text);
  });
});
