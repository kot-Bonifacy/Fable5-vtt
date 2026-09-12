import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WELCOME_MAP_COLUMNS, WELCOME_MAP_ROWS, buildWelcomeScene } from './map/welcome-map.js';

/**
 * Mapa powitalna gracza (11.09.2026) — dwie rzeczy, których w typach nie widać.
 *
 *  1. **Siatka ma się zgadzać z mapą.** MG podał skalę wprost („mapa jest
 *     w skali 40 × 30"), a rysunek na mapie — krawężniki, pasy, kontenery —
 *     stoi na tych kratkach. Siatka policzona z innego dzielnika przecinałaby
 *     jezdnię w poprzek i to pierwsze, co widać po wejściu do gry.
 *  2. **Tło nie jest sceną.** Cała ostrożność tego rozwiązania polega na tym,
 *     że obiekt jedzie wyłącznie do renderera, a `sceneStore` dalej trzyma
 *     `null` — dzięki temu nic się nie da na tej mapie postawić, wysłać ani
 *     zapisać. Modułowi wolno więc znać typy z `@vtt/shared` i nic poza tym;
 *     pierwszy import gniazda albo store'u znaczyłby, że atrapa zaczęła
 *     udawać scenę naprawdę.
 */
describe('mapa powitalna gracza', () => {
  it('dzieli mapę na dokładnie 40 × 30 kratek', () => {
    // Wymiary pliku, który MG dał do tej roli (1448 × 1086 px). Kratka wypada
    // 36,2 px, więc oba ilorazy liczy się z przybliżeniem — 1086 / 36,2 to
    // w podwójnej precyzji 29,999999999999996, i z tego samego powodu ostatnia
    // linia siatki wypada pół piksela za krawędzią mapy (nie widać jej, bo tam
    // kończy się obraz).
    const scene = buildWelcomeScene(1448, 1086);
    expect(scene.width / scene.grid.sizePx).toBeCloseTo(WELCOME_MAP_COLUMNS, 9);
    expect(scene.height / scene.grid.sizePx).toBeCloseTo(WELCOME_MAP_ROWS, 9);
    expect(scene.grid.visible).toBe(true);
    expect(scene.gridMode).toBe('grid');
  });

  it('liczy kratkę z pliku, więc podmiana mapy 40 × 30 nie wymaga kodu', () => {
    const scene = buildWelcomeScene(4000, 3000);
    expect(scene.grid.sizePx).toBe(100);
    expect(scene.height / scene.grid.sizePx).toBe(WELCOME_MAP_ROWS);
    expect(scene.background).toEqual({ url: scene.background?.url, width: 4000, height: 3000 });
  });

  it('jest jawna i pusta: nic do odsłaniania, kratka po 2 m jak w CP RED', () => {
    const scene = buildWelcomeScene(1448, 1086);
    // Mgła malowana potrzebuje MG, widoczność dynamiczna — figur gracza,
    // a tło nie ma ani jednego, ani drugiego. Czarny ekran zamiast mapy byłby
    // dokładnie tym, czego ta mapa ma nie dopuścić.
    expect(scene.visibility).toBe('open');
    expect(scene.dark).toBe(false);
    expect(scene.active).toBe(false);
    expect(scene.metersPerSquare).toBe(2);
  });

  it('nie zna gniazda ani żadnego store’u — to obrazek, nie stan', () => {
    const source = readFileSync(join(import.meta.dirname, 'map', 'welcome-map.ts'), 'utf8');
    const imports = [...source.matchAll(/^import .*?from '(.*?)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['@vtt/shared']);
  });
});
