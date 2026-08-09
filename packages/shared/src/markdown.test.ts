import { describe, expect, it } from 'vitest';
import {
  isSafeMarkdownHref,
  markdownToPlainText,
  parseMarkdown,
  parseMarkdownInline,
  type MarkdownInline,
} from './markdown.js';

/** Skrót do porównań: drzewo liniowe jako tekst z widocznymi znacznikami. */
function show(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'code':
          return `<code>${node.value}</code>`;
        case 'break':
          return '<br>';
        case 'link':
          return `<a ${node.href}>${show(node.children)}</a>`;
        case 'strong':
          return `<b>${show(node.children)}</b>`;
        case 'em':
          return `<i>${show(node.children)}</i>`;
      }
    })
    .join('');
}

describe('parseMarkdownInline', () => {
  it('czyta pogrubienie, kursywę i kod dosłowny', () => {
    expect(show(parseMarkdownInline('**mocno** i *lekko* i `kod`'))).toBe(
      '<b>mocno</b> i <i>lekko</i> i <code>kod</code>',
    );
  });

  it('gwiazdki wewnątrz kodu dosłownego są treścią, nie znacznikiem', () => {
    expect(show(parseMarkdownInline('`**to nie jest pogrubienie**`'))).toBe(
      '<code>**to nie jest pogrubienie**</code>',
    );
  });

  it('podkreślenia w środku wyrazu zostają podkreśleniami', () => {
    expect(show(parseMarkdownInline('plik snake_case_nazwa.txt'))).toBe(
      'plik snake_case_nazwa.txt',
    );
  });

  it('podkreślenie na granicy wyrazu robi kursywę', () => {
    expect(show(parseMarkdownInline('to _jest_ kursywa'))).toBe('to <i>jest</i> kursywa');
  });

  it('niedomknięty znacznik zostaje zwykłym znakiem', () => {
    expect(show(parseMarkdownInline('2 * 3 * 4 = 24'))).toBe('2 * 3 * 4 = 24');
    expect(show(parseMarkdownInline('**nigdy niedomknięte'))).toBe('**nigdy niedomknięte');
  });

  it('zagnieżdża kursywę w pogrubieniu', () => {
    expect(show(parseMarkdownInline('**mocno i *jeszcze mocniej***'))).toBe(
      '<b>mocno i <i>jeszcze mocniej</i></b>',
    );
  });

  it('ucieczka ukośnikiem wyłącza znacznik', () => {
    expect(show(parseMarkdownInline('cena to 5 \\* 3 \\*\\*ed\\*\\*'))).toBe(
      'cena to 5 * 3 **ed**',
    );
  });

  it('czyta odnośnik i zachowuje formatowanie etykiety', () => {
    expect(show(parseMarkdownInline('[**Afterlife**](https://nc.example/klub)'))).toBe(
      '<a https://nc.example/klub><b>Afterlife</b></a>',
    );
  });

  it('adres względny do uploadu jest odnośnikiem', () => {
    expect(show(parseMarkdownInline('[mapa](/uploads/handouts/abc.png)'))).toBe(
      '<a /uploads/handouts/abc.png>mapa</a>',
    );
  });
});

describe('isSafeMarkdownHref', () => {
  it('przepuszcza http, https, mailto i adres względny', () => {
    expect(isSafeMarkdownHref('https://example.com')).toBe(true);
    expect(isSafeMarkdownHref('http://example.com')).toBe(true);
    expect(isSafeMarkdownHref('mailto:fixer@nc.example')).toBe(true);
    expect(isSafeMarkdownHref('/uploads/handouts/a.png')).toBe(true);
  });

  it('odrzuca schematy wykonywalne i adres bezhostowy', () => {
    expect(isSafeMarkdownHref('javascript:alert(1)')).toBe(false);
    expect(isSafeMarkdownHref('JavaScript:alert(1)')).toBe(false);
    expect(isSafeMarkdownHref('data:text/html,<script>')).toBe(false);
    expect(isSafeMarkdownHref('//evil.example')).toBe(false);
    expect(isSafeMarkdownHref('   ')).toBe(false);
  });

  it('odnośnik z niebezpiecznym adresem zostaje tekstem', () => {
    // Kluczowy test etapu: treść handoutu nie może wykonać niczego u gracza.
    expect(show(parseMarkdownInline('[kliknij](javascript:alert(1))'))).toBe(
      '[kliknij](javascript:alert(1))',
    );
  });
});

describe('parseMarkdown', () => {
  it('czyta nagłówki i przycina poziom do trzech', () => {
    const blocks = parseMarkdown('# Jeden\n## Dwa\n##### Pięć');
    expect(blocks.map((block) => (block.type === 'heading' ? block.level : null))).toEqual([
      1, 2, 3,
    ]);
  });

  it('składa akapit z kolejnych wierszy, ze złamaniem między nimi', () => {
    const blocks = parseMarkdown('pierwszy wiersz\ndrugi wiersz\n\nnowy akapit');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe('paragraph');
    expect(show((blocks[0] as { children: MarkdownInline[] }).children)).toBe(
      'pierwszy wiersz<br>drugi wiersz',
    );
  });

  it('czyta listę wypunktowaną i numerowaną', () => {
    const blocks = parseMarkdown('- pierwszy\n- drugi\n\n1. raz\n2. dwa');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: false });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: true });
    expect((blocks[0] as { items: MarkdownInline[][] }).items).toHaveLength(2);
  });

  it('lista zaczyna się bez pustego wiersza po akapicie', () => {
    const blocks = parseMarkdown('Do zabrania:\n- pistolet\n- gotówka');
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list']);
  });

  it('czyta cytat złożony z kilku wierszy jako jeden blok', () => {
    const blocks = parseMarkdown('> pierwsza\n> druga\n\nzwykły');
    expect(blocks.map((block) => block.type)).toEqual(['quote', 'paragraph']);
  });

  it('czyta linię poziomą i blok kodu', () => {
    const blocks = parseMarkdown('---\n```\nlinia 1\nlinia 2\n```');
    expect(blocks[0]).toEqual({ type: 'rule' });
    expect(blocks[1]).toEqual({ type: 'code', value: 'linia 1\nlinia 2' });
  });

  it('niedomknięty płot kodu zjada resztę, zamiast się wywalić', () => {
    const blocks = parseMarkdown('```\nreszta tekstu');
    expect(blocks).toEqual([{ type: 'code', value: 'reszta tekstu' }]);
  });

  it('znacznik HTML zostaje tekstem — nigdy nie staje się znacznikiem', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '<script>alert(1)</script>' }] },
    ]);
  });

  it('pusty tekst daje pustą listę bloków', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n   \n')).toEqual([]);
  });

  it('radzi sobie z końcami wiersza z Windowsa', () => {
    expect(parseMarkdown('# Tytuł\r\n\r\ntreść')).toHaveLength(2);
  });
});

describe('markdownToPlainText', () => {
  it('zdejmuje formatowanie i skleja bloki w jedno zdanie', () => {
    expect(markdownToPlainText('# Tytuł\n\n**Mocno** i *lekko*.\n\n- raz\n- dwa')).toBe(
      'Tytuł Mocno i lekko. raz dwa',
    );
  });

  it('pomija linię poziomą i zachowuje tekst odnośnika', () => {
    expect(markdownToPlainText('---\n[Afterlife](https://nc.example)')).toBe('Afterlife');
  });
});
