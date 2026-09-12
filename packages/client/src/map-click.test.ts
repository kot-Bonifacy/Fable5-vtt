import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Strażnik kolejności znaczeń kliknięcia w mapę (sesja naprawcza 22.08).
 *
 * Błąd #8 z sesji testów walki 08.08: z gumką osłon w ręku kliknięcie kasowało
 * osłonę **i jednocześnie** wysyłało zaznaczoną figurę w marsz albo ładowało
 * kubek atakiem. Przyczyną było to, że `viewport.on('clicked')` wyliczał
 * narzędzia z ręki, a gałąź osłon (a później stref z 26f i gniazd z 26b)
 * dopisała się wyłącznie do `pointerdown`. Każde nowe narzędzie mapy powtórzy
 * ten błąd, jeśli nikt nie przypilnuje, że jest wymienione w którymś ze
 * strażników.
 *
 * Test czyta plik jako tekst — z tego samego powodu, co `shortcuts.test.ts`:
 * `MapRenderer` ciągnie za sobą Pixi, canvas i pół sklepu stanu, a sprawdzane
 * jest jedno zdanie o kształcie kodu, nie zachowanie renderera.
 */

const SOURCE = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

/** Ciało metody/gettera od nagłówka do klamry zamykającej, licząc zagnieżdżenia. */
function blockAfter(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `nie znalazłem w MapRenderer.ts: ${header}`).toBeGreaterThan(0);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`niedomknięty blok: ${header}`);
}

/** Nazwy narzędzi (`this.cover.armed` → `cover`) plus flagi bez `.armed`. */
function toolsIn(fragment: string): Set<string> {
  const names = new Set<string>();
  for (const match of fragment.matchAll(/this\.(\w+)\.armed/g)) names.add(match[1] ?? '');
  for (const flag of ['rulerMode', 'notePlacing', 'spawnPlacing']) {
    if (fragment.includes(`this.${flag}`)) names.add(flag);
  }
  return names;
}

describe('kolejność znaczeń kliknięcia w mapę (błąd #8)', () => {
  const clicked = blockAfter(SOURCE, "viewport.on('clicked', (event) => {");
  const pointerDown = blockAfter(
    SOURCE,
    "viewport.on('pointerdown', (event: FederatedPointerEvent)",
  );

  it('żadne narzędzie z pointerdown nie jest pominięte w strażnikach kliknięcia', () => {
    const spent = toolsIn(blockAfter(SOURCE, 'private get toolSpentThisClick(): boolean {'));
    // Pędzle (mgła, rysowanie, gumka, linijka) kończą gest na pointerup, więc
    // odmawia im dopiero strażnik w środku `clicked` — ale odmawia.
    const guarded = new Set([...spent, ...toolsIn(clicked)]);
    const armedOnPointerDown = toolsIn(pointerDown);
    expect(armedOnPointerDown.size, 'nie znalazłem gałęzi narzędzi w pointerdown').toBeGreaterThan(
      3,
    );
    expect([...armedOnPointerDown].filter((tool) => !guarded.has(tool))).toEqual([]);
  });

  it('strażnik kliknięcia wyprzedza celownik i marsz', () => {
    const guard = clicked.indexOf('if (this.toolSpentThisClick) return;');
    expect(guard, 'strażnik zniknął albo znów jest listą z ręki').toBeGreaterThan(0);
    // Kolejność jest całą treścią poprawki: kubek (`onMapClick`) i marsz
    // (`walkTo`) muszą być **za** strażnikiem, inaczej klik znów płaci dwa razy.
    expect(clicked.indexOf('this.onMapClick?.(')).toBeGreaterThan(guard);
    expect(clicked.indexOf('this.walkTo(')).toBeGreaterThan(guard);
  });

  it('pozostałe strażniki pytają o narzędzia jednym getterem', () => {
    // Cztery miejsca pytały „czy narzędzie jest w ręku" czterema listami
    // pisanymi ręcznie i trzy z nich się rozjechały. Po poprawce lista jest
    // jedna; ten test przewraca się, gdy ktoś dopisze piątą.
    for (const header of [
      'private aimTargetFor(node: TokenNode | null, altKey: boolean): TokenNode | null {',
      'private trackWalkHover(point: ScenePoint): void {',
      'private applyMapCursor(): void {',
    ]) {
      expect(blockAfter(SOURCE, header), header).toContain('this.mapToolArmed');
    }
  });
});
