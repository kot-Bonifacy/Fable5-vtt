import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTRAIT_CROP, portraitCropPlacement } from '@vtt/shared';
import { RING_WIDTH, portraitRadius } from './map/token-ring.js';

/**
 * Kadr portretu na mapie (zlecenie MG, 12.09).
 *
 * Sam rachunek kadru mieszka w `shared/src/portrait-crop.ts` i tam ma własne
 * testy. Tutaj pilnowane są **styki**, na których da się go stracić bez ani
 * jednego błędu kompilacji:
 *
 *  - `TokenNode` musi liczyć ułożenie portretu tą funkcją, a nie własnym
 *    `extent / min(w, h)`, bo wtedy kadr istnieje wyłącznie w oknie edycji;
 *  - podpis figury musi kadr nieść, inaczej przestawienie go przez MG nie
 *    przerysuje żetonu („nic się nie zmieniło" — bo nazwa i obrazek te same);
 *  - `MapArea` musi kadry podać i **słuchać** puli, inaczej poprawka dojdzie
 *    dopiero po przeładowaniu strony;
 *  - okno kadrowania musi rysować krążek tym samym promieniem, którym rysuje
 *    go mapa, inaczej obiecuje kadr, którego stół nie zobaczy.
 */

const SRC = join(__dirname);
const TOKEN_NODE = readFileSync(join(SRC, 'map', 'TokenNode.ts'), 'utf8');
const MAP_AREA = readFileSync(join(SRC, 'components', 'MapArea.tsx'), 'utf8');
const EDITOR = readFileSync(join(SRC, 'components', 'PortraitCropEditor.tsx'), 'utf8');

/** Ciało metody `fitImage` — wszystko do następnej deklaracji `private`. */
function fitImageBody(): string {
  const start = TOKEN_NODE.indexOf('private fitImage(');
  expect(start).toBeGreaterThan(-1);
  const end = TOKEN_NODE.indexOf('private ', start + 10);
  return TOKEN_NODE.slice(start, end === -1 ? undefined : end);
}

describe('figura rysuje portret tym samym kadrem, co okno edycji', () => {
  it('`fitImage` pyta o ułożenie `portraitCropPlacement`', () => {
    expect(fitImageBody()).toContain('portraitCropPlacement(');
  });

  it('`fitImage` nie liczy skali po staremu, z pominięciem kadru', () => {
    // Dawny rachunek: `extent / Math.min(tex.width, tex.height)`. Gdyby wrócił,
    // kadr MG zostałby w bazie, a mapa dalej brałaby ślepy środek.
    expect(fitImageBody()).not.toMatch(/extent\s*\/\s*Math\.min\(/);
  });

  it('kotwica jest punktem kadru, nie sztywnym środkiem', () => {
    const body = fitImageBody();
    expect(body).toContain('anchor.set(place.anchorX, place.anchorY)');
    expect(body).not.toContain('anchor.set(0.5)');
  });

  it('podpis figury niesie kadr, więc przestawienie go przerysowuje żeton', () => {
    const start = TOKEN_NODE.indexOf('const signature = JSON.stringify([');
    expect(start).toBeGreaterThan(-1);
    const signature = TOKEN_NODE.slice(start, TOKEN_NODE.indexOf(']);', start));
    expect(signature).toContain('cropFor(token.imageUrl, ctx)');
  });
});

describe('mapa dostaje kadry i słucha puli', () => {
  it('`MapArea` podaje rendererowi odwzorowanie adres → kadr', () => {
    expect(MAP_AREA).toContain('portraitCrops: usePortraitStore.getState().crops');
  });

  it('zmiana w puli przerysowuje figury bez przeładowania strony', () => {
    expect(MAP_AREA).toContain('usePortraitStore.subscribe(pushTokens)');
    // Subskrypcja bez odwołania zostawiłaby wiszące nasłuchy przy każdej
    // wymianie renderera — a ten wymienia się przy zmianie narzędzia mapy.
    expect(MAP_AREA).toContain('unsubPortraits()');
  });
});

describe('okno kadrowania obiecuje to, co mapa narysuje', () => {
  it('promień krążka liczy `portraitRadius`, a nie własna stała', () => {
    expect(EDITOR).toContain('portraitRadius(gridPx)');
    expect(EDITOR).toContain("from '../map/token-ring.js'");
  });

  it('krążek podglądu ma dokładnie wnętrze obwódki właściciela', () => {
    // Podgląd „tak na mapie" to kwadrat kratki z obramowaniem `RING_WIDTH`;
    // przy `box-sizing: border-box` jego wnętrze musi wyjść równo średnicą
    // portretu. Ta równość jest jedynym powodem, dla którego w komponencie
    // stoi `gridPx`, a nie `radius * 2` — gdyby przestała zachodzić, podgląd
    // pokazywałby inny kadr niż żeton.
    for (const gridPx of [47, 72, 100, 140]) {
      expect(gridPx - 2 * RING_WIDTH).toBeCloseTo(portraitRadius(gridPx) * 2, 10);
    }
  });

  it('domyślny kadr daje w podglądzie dokładnie dawne „na środek”', () => {
    const place = portraitCropPlacement(DEFAULT_PORTRAIT_CROP, { width: 800, height: 1200 }, 47);
    expect(place.scale).toBeCloseTo(47 / 800, 10);
    expect(place.anchorX).toBe(0.5);
    expect(place.anchorY).toBe(0.5);
  });
});

describe('obwódka w oknie ma kolor obwódki na mapie', () => {
  it('`--map-ring-own` w `theme.css` to ta sama liczba, co `RING_OWN`', () => {
    // Okno kadrowania rysuje obwódkę właściciela CSS-em, a mapa Pixi — więc
    // kolor stoi w dwóch plikach i nic poza tym testem nie każe im się zgadzać.
    const theme = readFileSync(join(SRC, 'theme.css'), 'utf8');
    const css = /--map-ring-own:\s*#([0-9a-fA-F]{6})/.exec(theme)?.[1];
    const pixi = /const RING_OWN = 0x([0-9a-fA-F]{6})/.exec(TOKEN_NODE)?.[1];
    expect(css).toBeDefined();
    expect(css?.toLowerCase()).toBe(pixi?.toLowerCase());
  });
});

describe('portret wybiera się raz, przy tworzeniu postaci (12.09)', () => {
  const SHEET = readFileSync(join(SRC, 'components', 'CharacterSheet.tsx'), 'utf8');

  it('pula portretów na karcie jest tylko dla MG', () => {
    // Gracz w trakcie rozgrywki nie podmienia twarzy; zostaje mu kadr.
    const start = SHEET.indexOf('<PortraitPicker');
    expect(start).toBeGreaterThan(-1);
    const before = SHEET.slice(Math.max(0, start - 200), start);
    expect(before).toContain('isGm ? (');
  });

  it('kadr na mapie jest dostępny z karty i z kreatora', () => {
    expect(SHEET).toContain('<PortraitCropButton portraitUrl={character.portraitUrl} />');
    const creator = readFileSync(join(SRC, 'components', 'CharacterCreator.tsx'), 'utf8');
    expect(creator).toContain('<PortraitCropButton portraitUrl={draft.portraitUrl}');
  });
});
