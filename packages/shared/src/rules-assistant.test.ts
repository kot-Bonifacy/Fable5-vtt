import { describe, expect, it } from 'vitest';
import {
  RULES_PASSAGE_MAX_CHARS,
  buildRulesSystemPrompt,
  buildRulesUserPrompt,
  citationOf,
  emptyRulesIndexStatus,
  type RulesPassage,
} from './rules-assistant.js';

function passage(overrides: Partial<RulesPassage> = {}): RulesPassage {
  return {
    chunkId: 1,
    text: 'Treść wymyślonego fragmentu o zasadach.',
    source: '01-zasady.md',
    chapter: 'Rozdział Testowy',
    section: 'Sekcja Testowa',
    page: 12,
    pageEnd: 12,
    score: 0.5,
    denseRank: 1,
    keywordRank: 2,
    ...overrides,
  };
}

describe('citationOf', () => {
  it('składa rozdział, sekcję i stronę', () => {
    expect(citationOf(passage())).toBe('Rozdział Testowy › Sekcja Testowa, s. 12');
  });

  it('pokazuje zakres stron, gdy fragment przechodzi na następną', () => {
    expect(citationOf(passage({ pageEnd: 13 }))).toBe(
      'Rozdział Testowy › Sekcja Testowa, s. 12–13',
    );
  });

  it('radzi sobie bez numeru strony i bez sekcji', () => {
    expect(citationOf(passage({ page: null, pageEnd: null, section: '' }))).toBe(
      'Rozdział Testowy',
    );
  });
});

describe('buildRulesUserPrompt', () => {
  it('numeruje fragmenty i stawia pytanie na końcu', () => {
    const prompt = buildRulesUserPrompt('Jak działa pancerz?', [
      passage({ section: 'Pierwsza' }),
      passage({ chunkId: 2, section: 'Druga', page: 20, pageEnd: 20 }),
    ]);

    expect(prompt).toContain('[1] Rozdział Testowy › Pierwsza, s. 12');
    expect(prompt).toContain('[2] Rozdział Testowy › Druga, s. 20');
    // Model 9B odpowiada na to, co jest na końcu kontekstu — pytanie musi tam być.
    expect(prompt.trimEnd().endsWith('Pytanie Mistrza Gry: Jak działa pancerz?')).toBe(true);
  });

  it('przycina fragment, który sam zjadłby cały prompt', () => {
    const huge = 'x'.repeat(RULES_PASSAGE_MAX_CHARS * 2);
    const prompt = buildRulesUserPrompt('Pytanie?', [passage({ text: huge })]);

    expect(prompt).toContain('…');
    expect(prompt.length).toBeLessThan(huge.length);
  });

  it('bez fragmentów każe powiedzieć wprost, że nic nie znaleziono', () => {
    const prompt = buildRulesUserPrompt('Cokolwiek?', []);
    expect(prompt).toContain('nie ma nic na ten temat');
    expect(prompt).toContain('Cokolwiek?');
  });
});

describe('buildRulesSystemPrompt', () => {
  it('zakazuje dopowiadania z pamięci i wymaga numerów fragmentów', () => {
    const prompt = buildRulesSystemPrompt();
    expect(prompt).toContain('TYLKO na podanych fragmentach');
    expect(prompt).toContain('[2]');
    // „Nie wiem" musi być jawnie dozwolone — inaczej model 9B zmyśla zasadę.
    expect(prompt).toContain('Nie ma tego w podanych fragmentach');
  });
});

describe('emptyRulesIndexStatus', () => {
  it('startuje jako niegotowy, żeby UI nie obiecywał odpowiedzi', () => {
    const status = emptyRulesIndexStatus();
    expect(status.enabled).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.chunks).toBe(0);
  });
});
