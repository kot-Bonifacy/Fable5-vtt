import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_APP,
  ARCHIVE_VERSION,
  ARCHIVE_DOWNLOAD_PATHS,
  CARD_SUBMISSION_PATHS,
  archiveNameKey,
  archiveRefusal,
  archiveRefusalText,
  cardSubmissionHeadline,
  cardSubmissionLabel,
  cardSubmissionStatus,
  isArchiveKind,
  isCardSubmissionOpen,
  matchArchiveName,
} from './archive.js';
import { chatCategoryOf } from './chat.js';

/** Pojedyncze rzeczy i karta gracza (etap 57c) — czysta część. */

const head = (kind: string) => ({
  manifest: {
    app: ARCHIVE_APP,
    kind,
    version: ARCHIVE_VERSION,
    exportedAt: '2026-10-22T10:00:00.000Z',
    campaignName: 'Nocna zmiana',
    counts: {},
    omitted: [],
    files: [],
  },
});

describe('nowe rodzaje paczek', () => {
  it('sklep, bot i karty graczy to rodzaje pliku wymiany', () => {
    for (const kind of ['characters', 'shop', 'bot']) {
      expect(isArchiveKind(kind)).toBe(true);
      expect(archiveRefusal(head(kind))).toBeNull();
    }
    expect(isArchiveKind('npc')).toBe(false);
    expect(archiveRefusal(head('npc'))).toBe('ARCHIVE_WRONG_KIND');
  });

  it('gracz wczytuje wyłącznie kartę — inny rodzaj to odmowa z nazwą oczekiwanego', () => {
    expect(archiveRefusal(head('shop'), 'character')).toBe('ARCHIVE_WRONG_KIND');
    expect(archiveRefusalText('ARCHIVE_WRONG_KIND', 'character')).toContain('kartę postaci');
    expect(archiveRefusalText('ARCHIVE_WRONG_KIND', 'bot')).toContain('profil bota');
  });

  it('adresy pobrania kodują id', () => {
    expect(ARCHIVE_DOWNLOAD_PATHS.shop('a/b')).toBe('/api/archive/shop/a%2Fb');
    expect(ARCHIVE_DOWNLOAD_PATHS.bot('x')).toBe('/api/archive/bot/x');
    expect(ARCHIVE_DOWNLOAD_PATHS.players).toBe('/api/archive/players');
    expect(CARD_SUBMISSION_PATHS.respond(42)).toBe('/api/archive/submissions/42/respond');
  });
});

describe('matchArchiveName', () => {
  const rows = [
    { id: '1', name: 'Kira' },
    { id: '2', name: 'Tony  Bezpański' },
    { id: '3', name: 'Zbir' },
    { id: '4', name: 'zbir' },
  ];

  it('dopasowuje bez wielkości liter i nadmiarowych spacji', () => {
    expect(archiveNameKey('  Tony   Bezpański ')).toBe('tony bezpański');
    expect(matchArchiveName(rows, 'KIRA')?.id).toBe('1');
    expect(matchArchiveName(rows, 'tony bezpański')?.id).toBe('2');
  });

  it('dwie karty o tym imieniu albo żadna — brak dopasowania', () => {
    expect(matchArchiveName(rows, 'Zbir')).toBeNull();
    expect(matchArchiveName(rows, 'Vex')).toBeNull();
    expect(matchArchiveName(rows, '   ')).toBeNull();
  });
});

describe('zgłoszenie karty', () => {
  const entry = {
    userName: 'Rogue',
    name: 'Kira',
    roleName: 'Solo',
    roleRank: 4,
    status: 'open' as const,
    expiresAt: '2026-10-25T10:00:00.000Z',
  };
  const before = Date.parse('2026-10-24T10:00:00.000Z');
  const after = Date.parse('2026-10-25T10:00:00.000Z');

  it('otwarte do terminu, potem wygasłe; rozstrzygnięte zostaje rozstrzygnięte', () => {
    expect(cardSubmissionStatus(entry, before)).toBe('open');
    expect(isCardSubmissionOpen(entry, before)).toBe(true);
    expect(cardSubmissionStatus(entry, after)).toBe('expired');
    expect(isCardSubmissionOpen(entry, after)).toBe(false);
    expect(cardSubmissionStatus({ ...entry, status: 'accepted' }, after)).toBe('accepted');
  });

  it('podgląd i nagłówek mówią imię, Rolę, Poziom i gracza', () => {
    expect(cardSubmissionLabel(entry)).toBe('Kira — Solo 4');
    expect(cardSubmissionLabel({ ...entry, roleName: null })).toBe('Kira');
    expect(cardSubmissionHeadline(entry)).toBe('Rogue zgłasza kartę „Kira” do wczytania');
  });

  it('karta czatu siedzi w rubryce papierów', () => {
    expect(chatCategoryOf('cardsubmission')).toBe('table');
  });
});
