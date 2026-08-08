import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_BODY_MAX_LENGTH,
  KNOWLEDGE_TAGS_MAX,
  knowledgeCollection,
  knowledgeDigest,
  knowledgeDocumentText,
  knowledgeSource,
  normalizeKnowledgeTag,
  normalizeKnowledgeTags,
  validateKnowledgeEntry,
} from './knowledge.js';

const ENTRY = {
  title: 'Klub Afterlife',
  body: 'Bar w centrum, w którym solówki szukają zleceń.',
  type: 'place' as const,
  tags: ['miejsca'],
  visibility: 'bots' as const,
};

describe('tagi', () => {
  it('sprowadza zapis do postaci porównywalnej', () => {
    // Po drugiej stronie stoi `t.tag IN (…)` w SQLite — dopasowanie jest dosłowne,
    // więc „Gangi Watson" na profilu bota musi trafić w to samo co na wpisie.
    expect(normalizeKnowledgeTag('  Gangi Watson ')).toBe('gangi-watson');
    expect(normalizeKnowledgeTag('MIEJSCA')).toBe('miejsca');
    expect(normalizeKnowledgeTag('ważne!!!')).toBe('ważne');
  });

  it('odrzuca puste i duplikaty, przycina do limitu', () => {
    expect(normalizeKnowledgeTags(['a', 'A', '  ', 'b'])).toEqual(['a', 'b']);
    expect(normalizeKnowledgeTags(['!!!', '???'])).toEqual([]);
    const many = Array.from({ length: 30 }, (_, index) => `tag${index}`);
    expect(normalizeKnowledgeTags(many)).toHaveLength(KNOWLEDGE_TAGS_MAX);
  });

  it('nie wywraca się na śmieciach', () => {
    expect(normalizeKnowledgeTags(null)).toEqual([]);
    expect(normalizeKnowledgeTags([1, {}, 'ok'])).toEqual(['ok']);
  });
});

describe('walidacja wpisu', () => {
  it('przepuszcza poprawny wpis i normalizuje tagi', () => {
    const result = validateKnowledgeEntry({ ...ENTRY, tags: ['Miejsca', 'miejsca'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.tags).toEqual(['miejsca']);
    expect(result.entry.title).toBe('Klub Afterlife');
  });

  it('wymaga tytułu i treści', () => {
    const empty = validateKnowledgeEntry({ ...ENTRY, title: '  ', body: '' });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.issues.map((entry) => entry.field)).toEqual(['title', 'body']);
  });

  it('pilnuje limitu długości treści', () => {
    const result = validateKnowledgeEntry({
      ...ENTRY,
      body: 'x'.repeat(KNOWLEDGE_BODY_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
  });

  it('nieznany typ i widoczność spadają na bezpieczne wartości', () => {
    const result = validateKnowledgeEntry({ ...ENTRY, type: 'wymyślony', visibility: 'players' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.type).toBe('note');
    // „Boty z uprawnieniem" jest domyślne, ale nieznana wartość nie może odsłonić
    // wpisu oznaczonego przez MG jako sekret — dlatego widoczność `gm` przechodzi.
    expect(result.entry.visibility).toBe('bots');
    expect(validateKnowledgeEntry({ ...ENTRY, visibility: 'gm' })).toMatchObject({
      entry: { visibility: 'gm' },
    });
  });
});

describe('dokument do indeksu', () => {
  it('niesie tytuł jako nagłówek, żeby chunker wkleił go do każdego fragmentu', () => {
    const text = knowledgeDocumentText(ENTRY);
    expect(text.startsWith('# Klub Afterlife')).toBe(true);
    expect(text).toContain('Miejsce.');
    expect(text).toContain(ENTRY.body);
  });

  it('nazwa dokumentu i kolekcji jest stabilna', () => {
    expect(knowledgeSource('abc')).toBe('entry:abc');
    expect(knowledgeCollection('kamp1')).toBe('campaign:kamp1');
  });
});

describe('odcisk treści', () => {
  it('zmienia się przy każdej zmianie wpisu', () => {
    const base = knowledgeDigest(ENTRY);
    expect(knowledgeDigest({ ...ENTRY, body: `${ENTRY.body} ` })).not.toBe(base);
    expect(knowledgeDigest({ ...ENTRY, title: 'Inny klub' })).not.toBe(base);
    expect(knowledgeDigest({ ...ENTRY, visibility: 'gm' })).not.toBe(base);
    expect(knowledgeDigest({ ...ENTRY, tags: ['gangi'] })).not.toBe(base);
  });

  it('nie zależy od kolejności tagów', () => {
    expect(knowledgeDigest({ ...ENTRY, tags: ['a', 'b'] })).toBe(
      knowledgeDigest({ ...ENTRY, tags: ['b', 'a'] }),
    );
  });
});
