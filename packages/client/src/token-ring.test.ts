import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOG_PEEP_CORE_RATIO,
  FOG_PEEP_GRID_RADIUS,
  RING_WIDTH,
  fogPeepRadius,
  furnitureRadius,
  hpRingCasing,
  hpRingRadius,
  hpRingWidth,
  ownerRingRadius,
  portraitRadius,
} from './map/token-ring.js';

/**
 * Strażnik obrączki punktów wytrzymałości (zlecenie MG, 12.09.2026).
 *
 * Zlecenie brzmiało dosłownie: pasek ma być **na zewnątrz avatara**, bo
 * rysowany po brzegu portretu częściowo go zasłaniał. Cała reszta tego pliku
 * to konsekwencje jednej liczby — promienia — i właśnie dlatego stoi tu test:
 * geometrię łatwo przy okazji cofnąć do środka koła i nikt tego nie zauważy
 * w typach ani w kompilacji, tylko przy stole.
 *
 * Kratki, na których liczymy: 47 px (scena „StrefaPrzemysłowa" MG), 72 px
 * (mapa powitalna) i 100 px (sceny poligonu).
 */

const GRIDS = [47, 72, 100];

describe('obrączka PW leży poza portretem', () => {
  it('wewnętrzna krawędź paska zaczyna się za obwódką właściciela', () => {
    for (const extent of GRIDS) {
      const inner = hpRingRadius(extent) - hpRingWidth(extent) / 2;
      // Koło portretu sięga `extent / 2`, obwódka kończy się o własną grubość
      // dalej (od 12.09 leży poza portretem). Pasek zaczyna się za nią.
      expect(inner, `kratka ${extent}px`).toBeGreaterThan(extent / 2 + RING_WIDTH);
    }
  });

  it('pasek nie dotyka obwódki właściciela — zostaje prześwit', () => {
    for (const extent of GRIDS) {
      const inner = hpRingRadius(extent) - hpRingWidth(extent) / 2;
      const ownerRingOuter = extent / 2 + RING_WIDTH;
      expect(inner - ownerRingOuter, `kratka ${extent}px`).toBeGreaterThanOrEqual(1);
    }
  });

  it('figura wystaje poza kratkę najwyżej o oprawę paska', () => {
    for (const extent of GRIDS) {
      const overflow = furnitureRadius(extent, true) - extent / 2;
      // Świadoma cena dwóch decyzji MG z 12.09 (pasek PW, a potem obwódka, poza
      // portretem) — ale ograniczona: trzecia część kratki to już nachodzenie
      // na sąsiadów w sposób, którego nie da się rozczytać.
      expect(overflow, `kratka ${extent}px`).toBeGreaterThan(0);
      expect(overflow / extent, `kratka ${extent}px`).toBeLessThan(1 / 3);
    }
  });
});

/**
 * Pytanie MG z 12.09, zadane wprost: „obrączka PW portretu nie zasłania, ale
 * czy nie robi tego okrąg **wewnętrzny**?".
 *
 * Okręgów wokół figury jest cztery i każdy rysuje kto inny, więc odpowiedź
 * łatwo dać na oko i się pomylić. Tu jest policzona:
 *
 *  1. **obwódka właściciela** (`TokenNode.ring`, kolor mówi „czyja figura") —
 *     jedyna, która leży tak blisko portretu, że mogłaby go zjeść;
 *  2. **obrączka PW** — poza kratką od 12.09;
 *  3. **obrączka zaznaczenia** i **pierścień grupy** (`MapRenderer`, warstwa
 *     nakładki) — liczone od `node.outerRadius`, więc też poza wszystkim.
 */
describe('żaden okrąg nie wchodzi na portret', () => {
  it('obwódka właściciela kończy się tam, gdzie zaczyna portret', () => {
    for (const extent of GRIDS) {
      const ringInner = ownerRingRadius(extent) - RING_WIDTH / 2;
      // Kreska obwódki zaczyna się **dokładnie** na krawędzi maski portretu:
      // ani piksela na twarzy, ani piksela przerwy między nimi.
      expect(ringInner, `kratka ${extent}px`).toBeCloseTo(portraitRadius(extent), 6);
    }
  });

  it('portret zajmuje całą kratkę, a obwódka wystaje o swoją grubość', () => {
    for (const extent of GRIDS) {
      // To jest zlecenie MG z 12.09 wypisane liczbami: „znana liczba pikseli"
      // obwódki wysuwa się poza grafikę portretu dokładnie o tę grubość.
      expect(portraitRadius(extent)).toBeCloseTo(extent / 2, 6);
      expect(ownerRingRadius(extent) + RING_WIDTH / 2).toBeCloseTo(extent / 2 + RING_WIDTH, 6);
      expect(portraitRadius(extent)).toBeLessThan(ownerRingRadius(extent));
    }
  });

  it('obrączka PW nie dotyka nawet obwódki, nie mówiąc o portrecie', () => {
    for (const extent of GRIDS) {
      const hpInner = hpRingRadius(extent) - hpRingWidth(extent) / 2;
      expect(hpInner, `kratka ${extent}px`).toBeGreaterThan(
        ownerRingRadius(extent) + RING_WIDTH / 2,
      );
    }
  });
});

/**
 * Obrączka zaznaczenia i pierścień grupy rysują się w `MapRenderer`, na
 * warstwie nakładki, w pikselach **ekranu** — więc ich odstęp od figury topnieje
 * w pikselach świata wraz ze zbliżeniem. Przy zoomie 2 dawne `half + 8 * k`
 * siadało dokładnie na pasku życia. Obie muszą więc pytać `node.outerRadius`.
 */
describe('nakładki liczą się od brzegu oprawy, nie od kratki', () => {
  const RENDERER = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

  it.each(['drawSelectionRing', 'drawGroupRings', 'facingKnob'])(
    '`%s` pyta o `outerRadius`',
    (method) => {
      // `private`, bo samo imię metody trafia najpierw w jej wywołanie —
      // `drawSelectionRing` woła się z dziewięciu miejsc w tym pliku.
      const start = RENDERER.indexOf(`private ${method}(`);
      expect(start, `nie znalazłem ${method} w MapRenderer.ts`).toBeGreaterThan(0);
      const body = RENDERER.slice(start, start + 1600);
      expect(body).toContain('node.outerRadius');
    },
  );
});

describe('oprawa figury', () => {
  it('bez PW kończy się na zewnętrznej krawędzi obwódki', () => {
    for (const extent of GRIDS) {
      expect(furnitureRadius(extent, false)).toBeCloseTo(extent / 2 + RING_WIDTH, 6);
    }
  });

  it('z PW obejmuje pasek razem z koszulką', () => {
    for (const extent of GRIDS) {
      const outer = hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent);
      expect(furnitureRadius(extent, true)).toBeCloseTo(outer, 6);
      // Aureola tury i klin kierunku opierają się o tę liczbę; gdyby wypadła
      // wewnątrz paska, pasek zamalowałby aureolę, a klin wyciąłby w nim dziurę.
      expect(furnitureRadius(extent, true)).toBeGreaterThan(hpRingRadius(extent));
    }
  });
});

describe('mała figura dostaje czytelny pasek', () => {
  it('szerokość i koszulka mają dolny próg', () => {
    // Żeton 1×1 na kratce 20 px (mapa oddalona do granic) to kilka pikseli
    // ekranu — proporcjonalny pasek zniknąłby zupełnie.
    expect(hpRingWidth(20)).toBe(4);
    expect(hpRingCasing(20)).toBe(1);
  });

  it('duża figura skaluje się proporcjonalnie', () => {
    expect(hpRingWidth(200)).toBeCloseTo(14, 6);
    expect(hpRingCasing(200)).toBeCloseTo(3, 6);
  });
});

/**
 * Strażnik palety obrączki PW (zlecenie MG, 12.09.2026).
 *
 * MG chciał, żeby obrączka wokół figury i pasek PW w panelu postaci mówiły
 * jednym kolorem — gracz widzi oba naraz, obrączkę na swojej figurze i pasek
 * w lewym górnym rogu. Pasek bierze kolor z `theme.css` (`--ok`,
 * `--hurt-light`, `--warn`, `--err`), a obrączka **nie może**: płótno mapy
 * zostaje nocne w obu motywach (etap 27e), więc w dzień pasek się przyciemnia,
 * a obrączka ma zostać jasna. Wartości są więc przepisane — i to jest miejsce,
 * w którym pilnujemy, żeby przepisane zostały te same.
 *
 * Test czyta `theme.css` jako tekst i `TokenNode.ts` jako tekst: pierwszy nie
 * jest modułem, a drugi ciągnie za sobą całe Pixi.
 */
describe('obrączka PW mówi kolorami panelu', () => {
  const THEME = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
  const NODE = readFileSync(join(import.meta.dirname, 'map', 'TokenNode.ts'), 'utf8');

  /** Wartość zmiennej z nocnej palety, czyli pierwszego `:root` w pliku. */
  function nightVar(name: string): string {
    const match = new RegExp('\\n\\s*' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(THEME);
    expect(match, `nie znalazłem ${name} w theme.css`).not.toBeNull();
    return match![1]!.toLowerCase();
  }

  /** Kolor szczebla wpisany w tabelę `HP_RUNG_COLORS`. */
  function rungColor(rung: string): string {
    const match = new RegExp(rung + ':\\s*0x([0-9a-fA-F]{6})').exec(NODE);
    expect(match, `nie znalazłem szczebla „${rung}” w TokenNode.ts`).not.toBeNull();
    return `#${match![1]!.toLowerCase()}`;
  }

  it.each([
    ['healthy', '--ok'],
    ['light', '--hurt-light'],
    ['serious', '--warn'],
    ['mortal', '--err'],
  ])('szczebel „%s" ma kolor %s z nocnej palety', (rung, variable) => {
    expect(rungColor(rung)).toBe(nightVar(variable));
  });
});

/**
 * Okienko własnej figury gracza w mgle wojny (zlecenie MG, 12.09.2026).
 *
 * Serwer od 17a obiecuje, że gracz nie traci swojej postaci z mapy, a renderer
 * tej obietnicy nie dotrzymywał — mgła zamalowywała figurę razem z podłożem.
 * Wielkość okienka wybrał MG: **krąg mniej więcej trzech kratek**. Test pilnuje
 * dwóch rzeczy, których w typach nie widać: że okienko nie schodzi poniżej tej
 * miary i że przy dużej figurze rośnie wraz z nią, zamiast dać się przez nią
 * przerosnąć.
 */
describe('okienko w mgle wokół własnej figury', () => {
  it.each(GRIDS)('na kratce %i px ma promień półtorej kratki', (grid) => {
    const furniture = furnitureRadius(grid, true);
    expect(fogPeepRadius(furniture, grid)).toBeCloseTo(grid * FOG_PEEP_GRID_RADIUS, 6);
  });

  it.each(GRIDS)('na kratce %i px figura 4 × 4 rozpycha okienko poza siebie', (grid) => {
    const furniture = furnitureRadius(grid * 4, true);
    const radius = fogPeepRadius(furniture, grid);
    // Pełne wycięcie (rdzeń) obejmuje figurę z oprawą i ćwierć kratki zapasu —
    // reszta promienia to zanik brzegu.
    expect(radius * FOG_PEEP_CORE_RATIO).toBeCloseTo(furniture + grid / 4, 6);
  });

  it.each(GRIDS)('pełne wycięcie obejmuje całą figurę z oprawą (%i px)', (grid) => {
    // Zanik zaczyna się dopiero za `FOG_PEEP_CORE_RATIO` promienia — a to musi
    // wypaść **poza** figurą, inaczej gracz ogląda własny żeton przez mgłę.
    for (const size of [1, 2, 4]) {
      const furniture = furnitureRadius(grid * size, true);
      const core = fogPeepRadius(furniture, grid) * FOG_PEEP_CORE_RATIO;
      expect(core).toBeGreaterThanOrEqual(furniture);
    }
  });
});
