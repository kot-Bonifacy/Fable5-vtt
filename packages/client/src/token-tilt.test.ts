import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TokenCondition } from '@vtt/shared';

/**
 * Strażnik przechylenia portretu figury, która leży (POMYSLY 21.08, sesja 04.09).
 *
 * Stan `down` czytał się na mapie gorzej niż `dead`: trup ma wielkie ✕, szary
 * portret i czarną podstawkę, a nieprzytomny — ciemnoczerwoną podstawkę
 * i naklejkę wielkości paznokcia. Od tej sesji obaj kładą portret na bok.
 *
 * Dwie rzeczy w tym łatwo zepsuć i żadnej nie widać w typach:
 *
 *  1. **Co się przechyla.** Obraca się wyłącznie portret — `image` i `initial`.
 *     Obrót całego kontenera (albo `nameText` czy `statusLayer` z osobna)
 *     przekrzywiłby imię i naklejki, czyli podpis i ikony, które mają być
 *     czytelne pod każdym kątem; obrót `ring`, `base` czy `hpArc` nie zrobiłby
 *     nic, bo to okręgi i elipsy wyśrodkowane na sobie.
 *  2. **Komplet stanów.** `CONDITION_TILT_DEG` musi znać każdy stan figury —
 *     `Record<TokenCondition, number>` pilnuje tego przy kompilacji, ale nowy
 *     stan łatwo dopisać z zerem „na później" i o nim zapomnieć; test mówi
 *     wtedy, że pole istnieje, a nie że ktoś je przemyślał.
 *
 * Test czyta plik jako tekst — z tego samego powodu, co `map-click.test.ts`:
 * `TokenNode` ciągnie za sobą całe Pixi, a sprawdzane jest jedno zdanie
 * o kształcie kodu, nie zachowanie renderera.
 */

const SOURCE = readFileSync(join(import.meta.dirname, 'map', 'TokenNode.ts'), 'utf8');

/** Ciało metody od nagłówka do klamry zamykającej, licząc zagnieżdżenia. */
function blockAfter(header: string): string {
  const start = SOURCE.indexOf(header);
  expect(start, `nie znalazłem w TokenNode.ts: ${header}`).toBeGreaterThan(0);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    else if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`niedomknięty blok: ${header}`);
}

describe('przechylenie portretu leżącej figury', () => {
  const table = SOURCE.slice(
    SOURCE.indexOf('const CONDITION_TILT_DEG'),
    SOURCE.indexOf('}', SOURCE.indexOf('const CONDITION_TILT_DEG')),
  );

  it('tabela kątów zna każdy stan figury', () => {
    expect(table).not.toBe('');
    // Cztery wartości `TokenCondition`; kompletu w tabeli pilnuje `Record<>`
    // przy kompilacji, a tu chodzi o to, żeby nowy stan nie wszedł z zerem
    // dopisanym bez zastanowienia.
    const conditions: TokenCondition[] = ['ok', 'wounded', 'down', 'dead'];
    for (const condition of conditions) {
      expect(table, `brak stanu „${condition}” w CONDITION_TILT_DEG`).toContain(`${condition}:`);
    }
  });

  it('leży ten, kto wypadł z walki — i tylko on', () => {
    const angleOf = (condition: string): number => {
      const match = new RegExp(`${condition}:\\s*(-?[0-9.]+)`).exec(table);
      expect(match, `nie odczytałem kąta dla „${condition}”`).not.toBeNull();
      return Number(match![1]);
    };
    expect(angleOf('ok')).toBe(0);
    expect(angleOf('wounded')).toBe(0);
    expect(angleOf('down')).toBeGreaterThan(0);
    expect(angleOf('dead')).toBeGreaterThan(0);
  });

  it('przechyla wyłącznie portret, nie podpis ani naklejki', () => {
    const body = blockAfter('private tiltPortrait(');
    const turned = [...body.matchAll(/this\.(\w+)\.rotation/g)].map((match) => match[1]);
    expect(new Set(turned)).toEqual(new Set(['image', 'initial']));
  });

  it('kąt zakłada się przy każdym odrysowaniu, nie tylko przy wczytaniu obrazka', () => {
    // `updateImage` dostaje teksturę kilka klatek później i sam ustawia kotwicę
    // oraz pozycję. Gdyby przechylenie siedziało tylko tam, figura bez portretu
    // nigdy by się nie położyła, a ta z portretem wstawałaby przy każdej
    // podmianie grafiki.
    expect(blockAfter('  update(token: TokenView')).toContain('this.tiltPortrait(condition)');
  });
});
