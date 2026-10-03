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
  noseLength,
  nosePolygon,
  ownerRingRadius,
  ownerRingWidth,
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
  it('wewnętrzna krawędź koszulki paska zaczyna się na brzegu portretu', () => {
    for (const extent of GRIDS) {
      const inner = hpRingRadius(extent) - hpRingWidth(extent) / 2 - hpRingCasing(extent);
      // Od 03.10 (#71) pasek leży tuż za twarzą, a obwódka właściciela za nim.
      expect(inner, `kratka ${extent}px`).toBeCloseTo(portraitRadius(extent), 6);
    }
  });

  it('figura wystaje poza kratkę najwyżej o oprawę paska i obwódki', () => {
    for (const extent of [36, ...GRIDS]) {
      const overflow = furnitureRadius(extent, true) - extent / 2;
      // Świadoma cena decyzji MG z 12.09 (pasek PW poza portretem) i z 03.10
      // (gruba obwódka za paskiem) — ale ograniczona: trzecia część kratki to
      // już nachodzenie na sąsiadów w sposób, którego nie da się rozczytać.
      expect(overflow, `kratka ${extent}px`).toBeGreaterThan(0);
      expect(overflow / extent, `kratka ${extent}px`).toBeLessThan(1 / 3);
    }
  });
});

/**
 * Pytanie MG z 12.09, zadane wprost: „obrączka PW portretu nie zasłania, ale
 * czy nie robi tego okrąg **wewnętrzny**?". Od 03.10 (#71) okręgi idą od twarzy
 * w kolejności: koszulka i pasek PW, obwódka właściciela (kolor „czyja
 * figura”), na końcu nakładki `MapRenderer` liczone od `node.outerRadius`.
 */
describe('żaden okrąg nie wchodzi na portret', () => {
  it('bez PW obwódka właściciela zaczyna się tam, gdzie kończy portret', () => {
    for (const extent of GRIDS) {
      const ringInner = ownerRingRadius(extent) - ownerRingWidth(extent, false) / 2;
      expect(ringInner, `kratka ${extent}px`).toBeCloseTo(portraitRadius(extent), 6);
      expect(ownerRingWidth(extent, false)).toBe(RING_WIDTH);
    }
  });

  it('z PW obwódka właściciela leży za paskiem i jego koszulką (#71)', () => {
    for (const extent of GRIDS) {
      const hpOuter = hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent);
      const ownerInner = ownerRingRadius(extent, true) - ownerRingWidth(extent, true) / 2;
      expect(ownerInner, `kratka ${extent}px`).toBeCloseTo(hpOuter, 6);
    }
  });

  it('z PW obwódka jest co najmniej tak gruba jak pasek — czyta się z daleka (#71)', () => {
    for (const extent of GRIDS) {
      expect(ownerRingWidth(extent, true)).toBeGreaterThanOrEqual(hpRingWidth(extent));
      expect(ownerRingWidth(extent, true)).toBeGreaterThan(RING_WIDTH);
    }
  });
});

/**
 * Pierścień grupy i uchwyt obrotu rysują się w `MapRenderer`, na warstwie
 * nakładki, w pikselach **ekranu** — więc ich odstęp od figury topnieje
 * w pikselach świata wraz ze zbliżeniem. Przy zoomie 2 dawne `half + 8 * k`
 * siadało dokładnie na pasku życia. Obie muszą więc pytać `node.outerRadius`.
 */
describe('nakładki liczą się od brzegu oprawy, nie od kratki', () => {
  const RENDERER = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

  it.each(['drawGroupRings', 'facingKnob'])('`%s` pyta o `outerRadius`', (method) => {
    // `private`, bo samo imię metody trafia najpierw w jej wywołanie.
    const start = RENDERER.indexOf(`private ${method}(`);
    expect(start, `nie znalazłem ${method} w MapRenderer.ts`).toBeGreaterThan(0);
    const body = RENDERER.slice(start, start + 1600);
    expect(body).toContain('node.outerRadius');
  });

  /**
   * „Prowadzę tę figurę" mówi od 12.09 **pogrubiona obwódka właściciela**, a nie
   * osobny biały przerywany okrąg (zlecenie MG: „skoro obwódka i tak mówi, że to
   * ta figura"). Stąd inna geometria niż u sąsiadów wyżej: podświetlenie leży
   * dokładnie **na** obwódce, więc pyta `ownerRingRadius`, a nie brzeg oprawy.
   *
   * Dwie rzeczy są tu nieprzypadkowe i obie łatwo cofnąć bez zauważenia.
   * Po pierwsze **kolor jest z figury** (`ownerRingTint`) — biel wróciłaby jako
   * czwarty kolor na żetonie, a to właśnie ona została zdjęta. Po drugie
   * **grubość ma sufit liczony z kratki**: bez niego kreska skalowana ekranem
   * pożarłaby przy oddaleniu cały portret, a bez skalowania w ogóle znikałaby
   * przy stole (patrz komentarz na górze `TokenNode.ts`).
   */
  it('„prowadzę tę figurę" rysuje pogrubioną obwódkę właściciela, nie biały okrąg', () => {
    const start = RENDERER.indexOf('private drawSelectionRing(');
    expect(start, 'nie znalazłem drawSelectionRing w MapRenderer.ts').toBeGreaterThan(0);
    const body = RENDERER.slice(start, start + 1600);
    expect(body, 'podświetlenie zeszło z obwódki właściciela').toContain('node.ownerRingRadius');
    expect(body, 'podświetlenie nie bierze koloru z figury').toContain('node.ownerRingTint');
    expect(body, 'grubość bez sufitu — przy oddaleniu zje portret').toContain('Math.min(');
    expect(RENDERER, 'wrócił biały przerywany okrąg zaznaczenia').not.toContain(
      'SELECT_RING_DASHES',
    );
  });
});

describe('oprawa figury', () => {
  it('bez PW kończy się na zewnętrznej krawędzi obwódki', () => {
    for (const extent of GRIDS) {
      expect(furnitureRadius(extent, false)).toBeCloseTo(extent / 2 + RING_WIDTH, 6);
    }
  });

  it('z PW kończy się na zewnętrznej krawędzi obwódki, za paskiem', () => {
    for (const extent of GRIDS) {
      const outer = ownerRingRadius(extent, true) + ownerRingWidth(extent, true) / 2;
      expect(furnitureRadius(extent, true)).toBeCloseTo(outer, 6);
      // Aureola tury i klin kierunku opierają się o tę liczbę; gdyby wypadła
      // wewnątrz paska, pasek zamalowałby aureolę, a klin wyciąłby w nim dziurę.
      expect(furnitureRadius(extent, true)).toBeGreaterThan(
        hpRingRadius(extent) + hpRingWidth(extent) / 2 + hpRingCasing(extent),
      );
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

/**
 * Grot kierunku (26.09): uchwytem obrotu jest sam grot, bez patyka przez
 * portret i bez kropki — więc grot musi leżeć w całości **za** oprawą figury
 * i mieć wcięcie, po którym czyta się jak strzałka.
 */
describe('nosePolygon', () => {
  it.each(GRIDS)('grot na kratce %i px leży za oprawą i ma wcięcie', (grid) => {
    for (const hasHp of [true, false]) {
      const base = furnitureRadius(grid, hasHp) + 1;
      for (const angle of [0, Math.PI / 3, -Math.PI / 2, 2.5]) {
        const points = nosePolygon(0, 0, angle, base, grid);
        const dist = (i: number) => Math.hypot(points[i * 2]!, points[i * 2 + 1]!);
        // Czubek na osi, dokładnie długość grotu za nasadą.
        expect(dist(0)).toBeCloseTo(base + noseLength(grid), 6);
        // Żaden wierzchołek nie wchodzi na oprawę (portret, obwódka, pasek PW).
        for (let i = 0; i < 4; i += 1) expect(dist(i)).toBeGreaterThanOrEqual(base - 1e-9);
        // Wcięcie: środek nasady cofnięty ku czubkowi.
        expect(dist(2)).toBeGreaterThan(base);
        expect(dist(2)).toBeLessThan(dist(0));
      }
    }
  });
});
