import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik śladu za idącą figurą (zlecenie MG, 12.09.2026).
 *
 * MG zażądał dwóch rzeczy naraz: **obie zielone kreski mają zniknąć** — ta
 * rysowana pod idącą figurą i ta pod ciągniętą myszą — a w ich miejsce mają
 * zostawać **szare odciski butów**, te same, którymi rysuje się trasa
 * planowana. Drugie zdanie zlecenia jest o kolorze: „ślady powinny być
 * zabarwiane na czerwono w trybie turowym, aby gracz wiedział, jak daleko
 * dojdzie jego postać w danej turze".
 *
 * Trzy rzeczy w tym łatwo zepsuć i żadnej nie widać w typach:
 *
 *  1. **Powrót kreski.** `.stroke(` w rysunku śladu wraca przy pierwszym
 *     „dorysuję jeszcze cienką linię pod spodem" — a to jest dokładnie to,
 *     co MG kazał zdjąć. Jedyna dozwolona kreska to zapasowe wyjście na wypadek
 *     niewczytanego glifu buta.
 *  2. **Wspólna pula odcisków.** Trzy ślady bywają na ekranie naraz (trasa pod
 *     kursorem, ziemia pod figurą, poświata po marszu). Jedna pula na dwa z nich
 *     znaczy, że najechanie myszą kasuje ślad dopiero co przebytej drogi.
 *  3. **Czerwień.** Granica szarości i czerwieni to cała odpowiedź na pytanie
 *     MG; policzona z `costFactor` w metrach **gruntu**, nie budżetu.
 *
 * Test czyta plik jako tekst — z tego samego powodu, co `walk-bands.test.ts`:
 * `MapRenderer` ciągnie za sobą Pixi i pół sklepu stanu, a sprawdzane jest
 * jedno zdanie o kształcie kodu.
 */

const SOURCE = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

/** Ciało metody od nagłówka do klamry zamykającej, licząc zagnieżdżenia. */
function blockAfter(header: string): string {
  const start = SOURCE.indexOf(header);
  expect(start, `nie znalazłem w MapRenderer.ts: ${header}`).toBeGreaterThan(0);
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

describe('ślad za idącą figurą', () => {
  it('nie rysuje już zielonej kreski pod idącą figurą', () => {
    const march = blockAfter('private drawMarchTrail(march: MarchState): void {');
    expect(march, 'wróciła kreska za marszem').not.toContain('.stroke(');
    expect(march, 'marsz znów maluje się kolorem trasy').not.toContain('WALK_COLOR');
    expect(march, 'marsz nie rysuje śladu').toContain('this.drawWalkedTrail(');
  });

  it('nie rysuje już kreski pod figurą ciągniętą myszą', () => {
    const drag = blockAfter('private drawMoveOverlay(): void {');
    expect(drag, 'ciągnięcie nie rysuje śladu').toContain('this.drawWalkedTrail(');
    // Jedyna kreska, jaka została w tym rysunku, to okrąg zasięgu.
    expect(drag.split('.stroke(').length - 1, 'w rysunku ciągnięcia jest więcej niż okrąg').toBe(1);
    // Licznik metrów zostaje: to liczba, nie kreska, i nikt jej nie odwoływał.
    expect(drag, 'zniknął licznik metrów przy ciągniętej figurze').toContain('formatMetres');
  });

  it('poświata po marszu też jest odciskami, nie kreską', () => {
    const trail = blockAfter('private drawTrail(): void {');
    expect(trail, 'poświata nie używa własnej puli odcisków').toContain('this.fadingPrints');
    expect(trail, 'poświata znów maluje się kolorem trasy').not.toContain('WALK_COLOR');
    expect(trail, 'wróciła kreska poświaty').not.toContain('.stroke(');
  });

  it('daje każdemu z trzech śladów własną pulę odcisków', () => {
    for (const pool of ['routePrints', 'trailPrints', 'fadingPrints']) {
      expect(
        SOURCE.split(`${pool} = new FootprintPool()`).length - 1,
        `pula ${pool} nie jest zadeklarowana dokładnie raz`,
      ).toBe(1);
    }
    // Poświata przeżywa marsz, więc nie wolno jej dzielić puli z niczym, co
    // rysuje się w tym samym czasie.
    const march = blockAfter('private drawMarchTrail(march: MarchState): void {');
    expect(march, 'marsz sięga po pulę poświaty').not.toContain('fadingPrints');
    const preview = blockAfter('private drawWalkPreview(): void {');
    expect(preview, 'podgląd trasy sięga po pulę śladu').not.toContain('trailPrints');
  });

  it('barwi ślad na czerwono dopiero za granicą budżetu tury', () => {
    const trail = blockAfter('private drawWalkedTrail(');
    expect(trail, 'ślad nie zna szarości').toContain('TRAIL_COLOR');
    expect(trail, 'ślad nie zna czerwieni przekroczonej tury').toContain('TRAIL_COLOR_OVER');
    expect(trail, 'czerwień nie stoi na granicy budżetu').toContain('overFrom');
    // Zapasowe wyjście: bez glifu buta zostaje cienka kreska, bo ślad, którego
    // nie widać, jest gorszy niż kreska, którą MG kazał zdjąć.
    expect(trail, 'brak zapasowej kreski dla niewczytanego glifu').toContain('.stroke(');
  });

  it('liczy granicę czerwieni w metrach gruntu, nie budżetu', () => {
    const over = blockAfter('private trailOverFrom(');
    expect(over, 'granica nie dzieli przez koszt terenu').toContain('costFactor');
    expect(over, 'granica nie czyta pozostałych metrów').toContain('metresLeft');
  });

  it('zostawia ślad na tyle długo, żeby zdążyć spytać „którędy on wszedł?"', () => {
    const match = /const TRAIL_FADE_MS = (\d+);/.exec(SOURCE);
    expect(match, 'brak stałej TRAIL_FADE_MS').not.toBeNull();
    expect(Number(match![1]), 'ślad gaśnie szybciej, niż pada pytanie').toBeGreaterThanOrEqual(
      5000,
    );
  });
});
