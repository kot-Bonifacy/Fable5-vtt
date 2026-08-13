import { describe, expect, it } from 'vitest';
import { validateHandout } from './handouts.js';
import {
  DEFAULT_SCREAMSHEET_DATELINE,
  DEFAULT_SCREAMSHEET_OUTLET,
  SCREAMSHEET_LEAD_MAX_LENGTH,
  buildScreamsheetPrompt,
  normalizeScreamsheetMeta,
  parseHandoutKind,
  parseScreamsheetDraft,
  screamsheetErrorText,
} from './screamsheets.js';

describe('parseScreamsheetDraft', () => {
  it('rozbiera odpowiedź w formacie, o który prosi prompt', () => {
    const draft = parseScreamsheetDraft(
      [
        'NAGŁÓWEK: Krwawa noc w Kabuki',
        'LEAD: Trzech martwych przed klubem Megabuilding H7.',
        'TREŚĆ:',
        'NCPD zamknęło ulicę na cztery godziny.',
        '',
        'Świadkowie mówią o czerwonym Quadrze.',
      ].join('\n'),
    );
    expect(draft.headline).toBe('Krwawa noc w Kabuki');
    expect(draft.lead).toBe('Trzech martwych przed klubem Megabuilding H7.');
    expect(draft.body).toBe(
      'NCPD zamknęło ulicę na cztery godziny.\n\nŚwiadkowie mówią o czerwonym Quadrze.',
    );
  });

  it('zdejmuje ozdobniki, którymi model obudowuje etykiety', () => {
    const draft = parseScreamsheetDraft(
      [
        '**NAGŁÓWEK:** „Ogień w Watson"',
        '**LEAD:** Spłonął magazyn.',
        '**TREŚĆ:**',
        'Akapit.',
      ].join('\n'),
    );
    expect(draft.headline).toBe('Ogień w Watson');
    expect(draft.lead).toBe('Spłonął magazyn.');
    expect(draft.body).toBe('Akapit.');
  });

  it('czyta lead z linii pod etykietą, gdy model przeniósł go niżej', () => {
    const draft = parseScreamsheetDraft(
      ['NAGŁÓWEK: Cisza w Pacifice', 'LEAD:', 'Nikt nie odbiera telefonów.', '', 'Akapit.'].join(
        '\n',
      ),
    );
    expect(draft.lead).toBe('Nikt nie odbiera telefonów.');
    expect(draft.body).toBe('Akapit.');
  });

  it('bez żadnej etykiety bierze pierwsze linie po kolei', () => {
    const draft = parseScreamsheetDraft(
      ['Strzelanina w Kabuki', 'Zginęło trzech ludzi.', 'Reszta artykułu.'].join('\n'),
    );
    expect(draft).toEqual({
      headline: 'Strzelanina w Kabuki',
      lead: 'Zginęło trzech ludzi.',
      body: 'Reszta artykułu.',
    });
  });

  it('nie gubi treści, gdy model podał sam nagłówek', () => {
    const draft = parseScreamsheetDraft('NAGŁÓWEK: Nalot\n\nNCPD weszło o świcie.');
    expect(draft.headline).toBe('Nalot');
    expect(draft.lead).toBe('');
    expect(draft.body).toBe('NCPD weszło o świcie.');
  });

  it('przycina lead do limitu pola', () => {
    const draft = parseScreamsheetDraft(`LEAD: ${'a'.repeat(SCREAMSHEET_LEAD_MAX_LENGTH + 50)}`);
    expect(draft.lead).toHaveLength(SCREAMSHEET_LEAD_MAX_LENGTH);
  });

  it('z pustej odpowiedzi robi pusty szkic, a nie wyjątek', () => {
    expect(parseScreamsheetDraft('   \n\n ')).toEqual({ headline: '', lead: '', body: '' });
  });
});

describe('buildScreamsheetPrompt', () => {
  it('wkłada hasło MG i winietę do promptu', () => {
    const { system, user } = buildScreamsheetPrompt({
      topic: 'strzelanina w Kabuki',
      outlet: 'NET-54',
      campaignName: 'Poligon bojowy',
    });
    expect(system).toContain('NET-54');
    expect(system).toContain('Poligon bojowy');
    expect(system).toContain('NAGŁÓWEK:');
    expect(user).toContain('strzelanina w Kabuki');
  });

  it('bez nazwy kampanii nie zostawia dziury w zdaniu', () => {
    const { system } = buildScreamsheetPrompt({ topic: 'nalot', outlet: 'NET-54' });
    expect(system).toContain('Cyberpunk RED.');
  });
});

describe('normalizeScreamsheetMeta', () => {
  it('uzupełnia puste meble wartościami domyślnymi', () => {
    expect(normalizeScreamsheetMeta({ lead: '  ', outlet: '', dateline: null })).toEqual({
      lead: '',
      outlet: DEFAULT_SCREAMSHEET_OUTLET,
      dateline: DEFAULT_SCREAMSHEET_DATELINE,
    });
  });

  it('zwija białe znaki i przycina do limitów', () => {
    const meta = normalizeScreamsheetMeta({
      lead: 'Trzech\n  martwych.',
      outlet: 'X'.repeat(200),
      dateline: 'Night City, 2045',
    });
    expect(meta.lead).toBe('Trzech martwych.');
    expect(meta.outlet).toHaveLength(60);
    expect(meta.dateline).toBe('Night City, 2045');
  });
});

describe('parseHandoutKind', () => {
  it('zna dwa rodzaje i nie wierzy w trzeci', () => {
    expect(parseHandoutKind('screamsheet')).toBe('screamsheet');
    expect(parseHandoutKind('note')).toBe('note');
    expect(parseHandoutKind('gazeta')).toBe('note');
    expect(parseHandoutKind(undefined)).toBe('note');
  });
});

describe('validateHandout dla screamsheetu', () => {
  it('zapisuje meble gazety razem z treścią', () => {
    const result = validateHandout({
      title: 'Krwawa noc w Kabuki',
      body: 'NCPD milczy.',
      image: null,
      kind: 'screamsheet',
      screamsheet: { lead: 'Trzech martwych.', outlet: 'NET-54', dateline: 'Night City, 2045' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handout.kind).toBe('screamsheet');
      expect(result.handout.screamsheet).toEqual({
        lead: 'Trzech martwych.',
        outlet: 'NET-54',
        dateline: 'Night City, 2045',
      });
    }
  });

  it('odrzuca gazetę bez artykułu, choćby miała grafikę', () => {
    const result = validateHandout({
      title: 'Pierwsza strona',
      body: '   ',
      image: { url: '/uploads/handouts/abc.png', width: 800, height: 600 },
      kind: 'screamsheet',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe('Screamsheet musi mieć treść artykułu.');
    }
  });

  it('nie zostawia mebli gazety na zwykłej notatce', () => {
    const result = validateHandout({
      title: 'Notatka fixera',
      body: 'Spotkanie o 22:00.',
      image: null,
      kind: 'note',
      screamsheet: { lead: 'zostało po gazecie', outlet: 'NET-54', dateline: '2045' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.handout.screamsheet).toBeNull();
  });
});

describe('screamsheetErrorText', () => {
  it('tłumaczy odmowy na polski', () => {
    expect(screamsheetErrorText('AI_UNAVAILABLE')).toContain('AI Gateway');
    expect(screamsheetErrorText('AI_ERROR', 'pusta odpowiedź')).toContain('pusta odpowiedź');
    expect(screamsheetErrorText('COŚ_INNEGO')).toBe('Nie udało się napisać screamsheetu.');
  });
});
