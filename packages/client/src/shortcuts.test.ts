import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_TOOL_KEYS, SHORTCUT_GROUPS, shortcutGroupsFor } from './shortcuts.js';

/**
 * Strażnik katalogu skrótów (etap 27f).
 *
 * Kryterium etapu: „`?` otwiera listę skrótów **zgodną z tym, co naprawdę
 * działa**". Narzędzia mapy tego dotrzymują z definicji — okno pomocy i obsługa
 * klawiszy czytają jedną tabelę. Zostają dwie rzeczy, których wspólna tabela
 * nie załatwia i które da się złamać jedną linią: klawisz przypisany dwa razy
 * oraz `MapArea`, w którym ktoś znów wpisze narzędzie z ręki, omijając tabelę.
 */

describe('katalog skrótów (etap 27f)', () => {
  it('żaden klawisz narzędzia nie jest przypisany dwa razy', () => {
    const keys = MAP_TOOL_KEYS.map((entry) => entry.key);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it('narzędzia mapy nie zajmują klawiszy walki', () => {
    /**
     * `Tab`, `E` i cyfry obsługuje ten sam nasłuch, **przed** tabelą narzędzi
     * — narzędzie pod `E` byłoby więc martwe i nikt by nie zauważył dlaczego.
     */
    const combat = new Set(['e', 'tab', ' ', 'enter', 'escape', '?']);
    expect(MAP_TOOL_KEYS.filter((entry) => combat.has(entry.key))).toEqual([]);
  });

  it('każdy klawisz to jedna mała litera', () => {
    expect(MAP_TOOL_KEYS.filter((entry) => !/^[a-z]$/.test(entry.key))).toEqual([]);
  });

  it('gracz nie ogląda skrótów MG', () => {
    const player = shortcutGroupsFor(false);
    expect(player.flatMap((group) => group.items).filter((item) => item.gmOnly)).toEqual([]);
    // I nie zostaje z pustym nagłówkiem po odfiltrowaniu ostatniego wiersza.
    expect(player.filter((group) => group.items.length === 0)).toEqual([]);
  });

  /**
   * Drabina `Esc` ma krok tylko dla MG, a numery są nadawane po filtrze roli.
   * Zanim tak było, gracz oglądał „1, 2, 3, 4, 6, 7" (22.08, oględziny z konta
   * gracza) — dziura brała się z numerów wpisanych na sztywno w treść wierszy.
   */
  it('numerowana grupa jest ciągła w obu rolach', () => {
    for (const isGm of [true, false]) {
      for (const group of shortcutGroupsFor(isGm)) {
        if (!group.numbered) continue;
        const numbers = group.items.map((item) => Number.parseInt(item.what, 10));
        expect(numbers, `${group.title} (MG: ${isGm})`).toEqual(
          group.items.map((_, index) => index + 1),
        );
      }
    }
  });

  it('żaden wiersz katalogu nie nosi numeru w treści', () => {
    // Numer jest wyłącznie ozdobą nadawaną przy odczycie. Wpisany w `what`
    // albo zrobi graczowi dziurę (gdy grupa nie jest `numbered`), albo podwoi
    // się na „1. 1." (gdy jest) — obie drogi wracają tu jako porażka.
    for (const group of SHORTCUT_GROUPS) {
      expect(
        group.items.filter((item) => /^\d+\.\s/.test(item.what)).map((item) => item.what),
        group.title,
      ).toEqual([]);
    }
  });

  it('każda grupa ma tytuł i przynajmniej jeden wiersz', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title.length, group.title).toBeGreaterThan(0);
      expect(group.items.length, group.title).toBeGreaterThan(0);
    }
  });

  /**
   * Test czyta plik jako tekst, bo alternatywą jest udawanie przeglądarki:
   * `MapArea` ciągnie za sobą Pixi, gniazdo i pół sklepu stanu. Sprawdzane
   * jest jedno zdanie: przełącznik narzędzia w obsłudze klawiatury bierze
   * narzędzie z tabeli, a nie z literału.
   */
  it('MapArea przełącza narzędzia wyłącznie z tabeli', () => {
    const source = readFileSync(join(import.meta.dirname, 'components', 'MapArea.tsx'), 'utf8');
    // Wycinek od obsługi cyfr do drabiny `Escape` — czyli dokładnie ta gałąź,
    // w której siedzą przełączniki narzędzi. `Escape` szukane **od** tego
    // miejsca: wcześniej w pliku jest drugi, od trybu stawiania tokenu.
    const start = source.indexOf('const digit = ');
    expect(start, 'nie znalazłem obsługi klawiatury w MapArea').toBeGreaterThan(0);
    const handler = source.slice(start, source.indexOf("if (event.key === 'Escape')", start));
    expect(handler.length, 'pusty wycinek — zmienił się kształt obsługi').toBeGreaterThan(0);
    expect(handler).toContain('MAP_TOOL_KEYS.find');
    expect(handler.match(/toggleTool\('[a-z]+'\)/g)).toBeNull();
  });
});
