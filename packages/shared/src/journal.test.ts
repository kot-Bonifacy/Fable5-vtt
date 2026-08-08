import { describe, expect, it } from 'vitest';
import {
  JOURNAL_TITLE_MAX_LENGTH,
  buildRelationPrompt,
  buildSummaryMapPrompt,
  buildSummaryReducePrompt,
  fallbackTitle,
  journalCollection,
  journalDigest,
  journalDocumentText,
  journalSource,
  matchName,
  normalizeSessionDate,
  parseRelationLines,
  planBatches,
  renderTranscriptLine,
  splitSummaryDraft,
  transcriptBudget,
  validateJournalEntry,
} from './journal.js';
import { estimatePromptTokens } from './bots/prompt.js';

const ENTRY = {
  title: 'Napad na skład Militechu',
  body: 'Ekipa weszła bocznym wejściem i wyszła z dwoma skrzyniami.',
  sessionDate: '2026-08-08',
  tags: ['sesje'],
  visibility: 'gm' as const,
};

describe('kolekcja i dokument', () => {
  it('trzyma dziennik w osobnej kolekcji niż baza wiedzy', () => {
    // Bot bez zaznaczonego „Dziennik" nie ma jej nawet przeszukiwać.
    expect(journalCollection('kampania1')).toBe('journal:kampania1');
    expect(journalSource('wpis1')).toBe('session:wpis1');
  });

  it('wkleja tytuł jako nagłówek, żeby chunker powtórzył go w każdym fragmencie', () => {
    const text = journalDocumentText(ENTRY);
    expect(text.startsWith('# Napad na skład Militechu')).toBe(true);
    expect(text).toContain('Sesja z 2026-08-08.');
  });

  it('odcisk zmienia się przy każdej zmianie treści, tagów i widoczności', () => {
    const base = journalDigest(ENTRY);
    expect(journalDigest({ ...ENTRY })).toBe(base);
    expect(journalDigest({ ...ENTRY, body: `${ENTRY.body}!` })).not.toBe(base);
    expect(journalDigest({ ...ENTRY, visibility: 'bots' })).not.toBe(base);
    expect(journalDigest({ ...ENTRY, tags: ['sesje', 'militech'] })).not.toBe(base);
    // Kolejność tagów nie jest treścią — reindeks po przestawieniu byłby zmarnowany.
    expect(journalDigest({ ...ENTRY, tags: ['militech', 'sesje'] })).toBe(
      journalDigest({ ...ENTRY, tags: ['sesje', 'militech'] }),
    );
  });
});

describe('walidacja wpisu', () => {
  it('nowy wpis dziennika jest domyślnie tylko dla MG', () => {
    // Streszczenie zna całą sesję, także to, przy czym NPC-a nie było.
    const result = validateJournalEntry({ title: 'Sesja', body: 'Treść' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.visibility).toBe('gm');
  });

  it('przepuszcza „boty z uprawnieniem", gdy MG tak zdecyduje', () => {
    const result = validateJournalEntry({ title: 'Sesja', body: 'Treść', visibility: 'bots' });
    expect(result.ok && result.entry.visibility).toBe('bots');
  });

  it('odrzuca wpis bez tytułu i bez treści', () => {
    const result = validateJournalEntry({ title: '  ', body: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.field)).toEqual(['title', 'body']);
  });

  it('normalizuje datę sesji do samego dnia', () => {
    expect(normalizeSessionDate('2026-08-08')).toBe('2026-08-08');
    expect(normalizeSessionDate('2026-08-08T21:37:00.000Z')).toBe('2026-08-08');
    expect(normalizeSessionDate('bzdura')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('mapowanie-redukcja', () => {
  const line = (index: number) => renderTranscriptLine({ speaker: 'Vex', text: `zdanie ${index}` });

  it('mieści się w budżecie i nie gubi ani jednej linii', () => {
    const lines = Array.from({ length: 500 }, (_, index) => line(index));
    const batches = planBatches(lines, 200);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(lines);
    for (const batch of batches) {
      const cost = batch.reduce((sum, text) => sum + estimatePromptTokens(text) + 1, 0);
      expect(cost).toBeLessThanOrEqual(200);
    }
  });

  it('log dłuższy niż kontekst dzieli się, zamiast zostać obcięty', () => {
    // Kryterium etapu: streszczenie powstaje bez obcięcia. Log ~10× dłuższy niż
    // budżet ma dać ~10 porcji, a nie jedną i utratę reszty.
    const lines = Array.from({ length: 2000 }, (_, index) => line(index));
    const budget = transcriptBudget(8192, 900);
    const batches = planBatches(lines, budget);
    const all = batches.flat();
    expect(all).toHaveLength(2000);
    expect(all[1999]).toBe(line(1999));
  });

  it('pojedyncza wypowiedź większa od budżetu dostaje własną porcję', () => {
    const huge = 'a'.repeat(20_000);
    const batches = planBatches(['krótka', huge, 'druga'], 100);
    expect(batches).toEqual([['krótka'], [huge], ['druga']]);
  });

  it('pusty log to zero porcji', () => {
    expect(planBatches([], 500)).toEqual([]);
  });
});

describe('prompty streszczenia', () => {
  it('porcja zna swoje miejsce w całości', () => {
    const { user } = buildSummaryMapPrompt({ transcript: 'Vex: cześć', index: 2, total: 7 });
    expect(user).toContain('Fragment 2 z 7');
    expect(user).toContain('Vex: cześć');
  });

  it('składanie prosi o tytuł w pierwszej linii i przepuszcza życzenie MG', () => {
    const { system, user } = buildSummaryReducePrompt({
      notes: ['- weszli do składu'],
      campaignName: 'Poligon bojowy',
      hint: 'skup się na Militechu',
    });
    expect(system).toContain('Tytuł: ');
    expect(system).toContain('Poligon bojowy');
    expect(user).toContain('Mistrz Gry prosi: skup się na Militechu');
  });

  it('wyciąga tytuł z odpowiedzi modelu', () => {
    const draft = splitSummaryDraft('Tytuł: Skok na Militech\n\nEkipa weszła bocznym wejściem.');
    expect(draft.title).toBe('Skok na Militech');
    expect(draft.body).toBe('Ekipa weszła bocznym wejściem.');
  });

  it('radzi sobie z odpowiedzią bez tytułu', () => {
    const draft = splitSummaryDraft('Ekipa weszła bocznym wejściem. Wyszli z łupem.');
    expect(draft.title).toBe('');
    expect(fallbackTitle(draft.body, '2026-08-08')).toBe('Ekipa weszła bocznym wejściem.');
    expect(fallbackTitle('', '2026-08-08')).toBe('Sesja 2026-08-08');
    expect(fallbackTitle('x'.repeat(500), '2026-08-08').length).toBeLessThanOrEqual(
      JOURNAL_TITLE_MAX_LENGTH,
    );
  });
});

describe('propozycje relacji', () => {
  it('prompt wypisuje dzisiejsze nastawienia, żeby model podał stopień docelowy', () => {
    const { user } = buildRelationPrompt({
      summary: 'Vex okradł barmana.',
      bots: [{ name: 'Barman', relations: [{ characterName: 'Vex', value: 1 }] }],
      characters: ['Vex', 'Kaya'],
    });
    expect(user).toContain('- Barman (dziś: Vex +1)');
    expect(user).toContain('- Kaya');
  });

  it('czyta wiersze „NPC | postać | stopień | powód"', () => {
    const parsed = parseRelationLines(
      [
        'Barman | Vex | -2 | Okradł go przy wszystkich',
        '- Kaya | Rico | +1 | Opatrzyła mu ranę',
      ].join('\n'),
    );
    expect(parsed).toEqual([
      { botName: 'Barman', characterName: 'Vex', value: -2, note: 'Okradł go przy wszystkich' },
      { botName: 'Kaya', characterName: 'Rico', value: 1, note: 'Opatrzyła mu ranę' },
    ]);
  });

  it('przyjmuje minus typograficzny i nazwę stopnia zamiast liczby', () => {
    // Model 9B pisze „−2" i „wrogi" równie chętnie co „-2".
    const parsed = parseRelationLines('Barman | Vex | −2 | powód\nBarman | Kaya | wrogi | powód');
    expect(parsed.map((row) => row.value)).toEqual([-2, -2]);
  });

  it('pomija BRAK, wstęp modelu i wiersze bez stopnia', () => {
    const parsed = parseRelationLines(
      ['Oto zmiany:', 'BRAK', 'Barman | Vex | nie wiem | powód', 'Barman | Vex | 3'].join('\n'),
    );
    expect(parsed).toEqual([{ botName: 'Barman', characterName: 'Vex', value: 3, note: '' }]);
  });

  it('przycina stopień do skali', () => {
    expect(parseRelationLines('Barman | Vex | 9 | powód')[0]?.value).toBe(3);
    expect(parseRelationLines('Barman | Vex | -9 | powód')[0]?.value).toBe(-3);
  });

  it('dopasowuje odmienione imiona, ale nie skleja różnych osób', () => {
    const people = [
      { id: 'a', name: 'Vex' },
      { id: 'b', name: 'Rico' },
      { id: 'c', name: 'Ricardo' },
    ];
    expect(matchName(people, 'Vex')?.id).toBe('a');
    expect(matchName(people, 'Ricardowi')?.id).toBe('c');
    expect(matchName(people, 'Nikt Taki')).toBeNull();
    expect(matchName(people, '')).toBeNull();
  });
});
