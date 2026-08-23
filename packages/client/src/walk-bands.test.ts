import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik pasów zasięgu na trasie ruchu (sesja naprawcza 23.08).
 *
 * Trasa pod kursorem mówi trzema kolorami, jak daleko figura dojdzie w tej
 * turze: zielony — w budżecie Akcji Ruchu, bursztynowy — dopiero po oddaniu
 * Akcji za Bieg, szary — poza turą. Dwie rzeczy w tym łatwo zepsuć i żadnej nie
 * widać w typach:
 *
 *  1. **Pamięć podglądu.** `trackWalkHover` liczy trasę raz na kratkę docelową
 *     i trzyma ją pod kluczem. Klucz bez pasa bursztynowego zostawiłby go na
 *     ekranie po wydaniu Akcji na atak — trasa nie zmieniła kształtu, więc nikt
 *     by jej nie przeliczył.
 *  2. **Licencja grafiki.** Ślady to ikona z game-icons.net na CC BY 3.0.
 *     Repozytorium jest publiczne, więc plik bez wiersza w `ATTRIBUTION.md`
 *     jest problemem prawnym, a nie kosmetycznym.
 *  3. **Rozmiar śladów i brak liczb** (MG, 23.08). Ślad ma trzymać rozmiar
 *     tokenu, a nie ekranu — pomnożenie go przez `overlayScale()` wraca po
 *     cichu przy pierwszym „dodaj tu jeszcze jeden `k`". Podgląd nie pisze też
 *     na mapie żadnych metrów: od tego jest linijka, a zasięg widać kolorem.
 *
 * Test czyta pliki jako tekst — z tego samego powodu, co `map-click.test.ts`:
 * `MapRenderer` ciągnie za sobą Pixi i pół sklepu stanu, a sprawdzane jest
 * jedno zdanie o kształcie kodu.
 */

const SOURCE = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');
const ICONS = join(import.meta.dirname, '..', 'public', 'icons');

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

/** Kawałek pliku od jednego nagłówka do następnego. */
function between(from: string, to: string): string {
  const start = SOURCE.indexOf(from);
  const end = SOURCE.indexOf(to, start);
  expect(start, `nie znalazłem w MapRenderer.ts: ${from}`).toBeGreaterThan(0);
  expect(end, `nie znalazłem w MapRenderer.ts: ${to}`).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe('pasy zasięgu na trasie ruchu', () => {
  it('rysuje trzy pasy trasy, każdy własnym kolorem', () => {
    const preview = blockAfter('private drawWalkPreview(): void {');
    for (const color of ['WALK_COLOR', 'WALK_COLOR_EXTRA', 'WALK_COLOR_BEYOND']) {
      expect(preview, `podgląd trasy nie używa ${color}`).toContain(color);
    }
  });

  it('czyści ślady, zanim podgląd zdąży się wycofać', () => {
    const preview = blockAfter('private drawWalkPreview(): void {');
    const cleared = preview.indexOf('this.hideFootprints()');
    const firstReturn = preview.indexOf('return;');
    expect(cleared, 'podgląd trasy nie chowa śladów').toBeGreaterThan(0);
    expect(cleared, 'ślady chowane po pierwszym wyjściu — zostaną na mapie').toBeLessThan(
      firstReturn,
    );
  });

  it('liczy pas bursztynowy do pamięci podglądu', () => {
    const track = blockAfter('private trackWalkHover(point: ScenePoint): void {');
    expect(track, 'klucz podglądu nie zna pasa bursztynowego').toContain('extraMetres');
  });

  it('skaluje ślady tokenem, nie ekranem', () => {
    // Nie `blockAfter`: sygnatura ma własną klamrę w typie `bandAt`, więc
    // liczenie zagnieżdżeń urwałoby się na liście parametrów.
    const prints = between('private drawFootprints(', 'private footprintAt(');
    expect(prints, 'ślady wciąż liczone w pikselach ekranu').not.toContain('overlayScale');
    for (const ratio of ['FOOTPRINT_W_RATIO', 'FOOTPRINT_H_RATIO', 'FOOTPRINT_OFFSET_RATIO']) {
      expect(prints, `ślady nie używają ${ratio}`).toContain(ratio);
    }
    // Buty rozstawione palcami na zewnątrz — po lewej lewy, po prawej prawy.
    expect(prints, 'ślady bez rozstawu palców').toContain('FOOTPRINT_TOE_OUT');
    expect(prints, 'lustrzane odbicie śladu odwrócone — stopy zamienione stronami').toContain(
      '* -side',
    );
  });

  it('rysuje same ślady — bez metrów, kresek i ✖', () => {
    const preview = blockAfter('private drawWalkPreview(): void {');
    expect(preview, 'podgląd trasy znów pisze metry na mapie').not.toContain('formatMetres');
    expect(preview, 'wróciła kreska na granicy pasa').not.toContain('bandTick');
    // Jedyna kreska, jaka została na trasie, to kółka punktów trasy (`fill`).
    expect(preview, 'wrócił ✖ albo inna kreska na trasie').not.toContain('.stroke(');
    expect(SOURCE, 'została martwa maszyneria etykiet trasy').not.toContain('addWalkLabel');
    expect(SOURCE, 'została martwa maszyneria kresek granicznych').not.toContain('bandTick');
  });

  it('trzyma grafikę śladów w repo i w atrybucji', () => {
    const file = join(ICONS, 'boot-print.svg');
    expect(existsSync(file), 'brak public/icons/boot-print.svg').toBe(true);
    const svg = readFileSync(file, 'utf8');
    // Konwencja katalogu: sama biała sylwetka, bez czarnego tła z game-icons.
    expect(svg).not.toContain('M0 0h512v512H0z');
    expect(readFileSync(join(ICONS, 'ATTRIBUTION.md'), 'utf8')).toContain('`boot-print.svg`');
  });
});
