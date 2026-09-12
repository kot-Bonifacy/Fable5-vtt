import type { DiceSkinId } from '@vtt/shared';

/**
 * Jak wyglądają kości (etap 27d).
 *
 * `shared` zna wyłącznie **identyfikator** skórki, bo tylko on podróżuje —
 * silnik zasad nie ma prawa wiedzieć, że kość bywa zielona. Wygląd jest
 * sprawą klienta i mieszka tutaj: kolory, tekstura, materiał i dźwięk
 * w formacie, który rozumie `@3d-dice/dice-box-threejs`.
 *
 * Biblioteka trzyma skórkę **globalnie** — notacja nie zna koloru pojedynczej
 * kości — więc `dice3d.ts` przełącza ją przez `updateConfig` tuż przed
 * rzutem. Stąd też dwie fale przy krytyku: dorzut wjeżdża osobnym rzutem
 * w skórce, której nie da się pomylić z pierwszą falą.
 *
 * **Dwie pułapki biblioteki**, obie sprawdzone w `dist/dice-box-threejs.es.js`:
 *
 *  1. `makeColorSet` zapamiętuje zestaw pod kluczem `name`. Bez nazwy każde
 *     przełączenie tworzy nowy wpis (`${Date.now()}`) i cache rośnie w
 *     nieskończoność — dlatego każda skórka ma własną, stałą nazwę.
 *  2. `material` zapisuje się na **współdzielonym** deskryptorze tekstury
 *     (`ImageLoader` zwraca ten sam obiekt, nie kopię). Dwie skórki o tej
 *     samej teksturze muszą więc mieć ten sam materiał, inaczej ostatnio
 *     wczytana przestawi też poprzednią. Dziś: `metal`→`metal` (Krew, Chrom,
 *     dorzut krytyka), `none`→`plastic` (Neon), `stainedglass`→`glass`
 *     (Kwas), `paper`→`plastic` (Karta), `cloudy`→`plastic` (dorzut fumble).
 *
 * Nazwy tekstur pochodzą z listy biblioteki, nie z katalogu plików —
 * `public/dice/textures/` ma m.in. `noise.webp`, którego lista nie zna.
 * Dostępne: cloudy, cloudy_2, fire, marble, water, ice, paper, speckles,
 * glitter, glitter_2, stars, stainedglass, wood, metal, skulls, leopard,
 * tiger, cheetah, dragon, lizard, bird, astral, bronze01–04, none.
 */

/** Zestaw kolorów w formacie `theme_customColorset` biblioteki. */
export interface DiceColorset {
  /** Klucz cache'a w bibliotece — musi być stały i unikalny. */
  name: string;
  /** Kolor ścianki. Tablica = losowanie z palety dla każdej kości. */
  background: string | string[];
  /** Kolor oczek/cyfr. */
  foreground: string;
  /** Obrys cyfry — `'none'` znosi go zupełnie. */
  outline: string;
  /** Nazwa tekstury z listy biblioteki (patrz komentarz wyżej). */
  texture: string;
  /** `none | metal | wood | glass | plastic` — steruje połyskiem. */
  material: string;
}

export interface DiceSkin {
  id: DiceSkinId;
  /** Polska nazwa w oknie ustawień. */
  label: string;
  /** Krótki opis wyglądu w oknie ustawień. */
  description: string;
  colorset: DiceColorset;
  /**
   * Kolor kropki podglądu w oknie ustawień (CSS).
   *
   * Dźwięku uderzeń tu nie ma celowo: biblioteka wyprowadza go z `material`
   * zestawu kolorów (`metal` i `wood` mają własne próbki, reszta gra
   * plastikiem), a drugie źródło prawdy rozjechałoby się z pierwszym.
   */
  swatch: string;
}

export const DICE_SKINS: Record<DiceSkinId, DiceSkin> = {
  neon: {
    id: 'neon',
    label: 'Neon',
    description: 'Czarna kość, cyjanowe oczka.',
    colorset: {
      name: 'vtt-neon',
      background: '#0e1116',
      foreground: '#3ef0ff',
      outline: '#093039',
      texture: 'none',
      material: 'plastic',
    },
    swatch: '#3ef0ff',
  },
  blood: {
    id: 'blood',
    label: 'Krew',
    description: 'Czerwony metalik.',
    colorset: {
      name: 'vtt-blood',
      background: '#a11010',
      foreground: '#f2f2f2',
      outline: 'black',
      texture: 'metal',
      material: 'metal',
    },
    swatch: '#a11010',
  },
  chrome: {
    id: 'chrome',
    label: 'Chrom',
    description: 'Polerowany metal z ciemnym nadrukiem.',
    colorset: {
      name: 'vtt-chrome',
      background: '#c9ced6',
      foreground: '#15181d',
      outline: 'none',
      texture: 'metal',
      material: 'metal',
    },
    swatch: '#c9ced6',
  },
  acid: {
    id: 'acid',
    label: 'Kwas',
    description: 'Jadowita zieleń pod szkłem.',
    colorset: {
      name: 'vtt-acid',
      background: ['#123d1f', '#1c5c2c', '#0e2f18'],
      foreground: '#9dff5c',
      outline: '#05170a',
      texture: 'stainedglass',
      material: 'glass',
    },
    swatch: '#9dff5c',
  },
  card: {
    id: 'card',
    label: 'Karta',
    description: 'Biały plastik z czarnym nadrukiem.',
    colorset: {
      name: 'vtt-card',
      background: '#f4f1ea',
      foreground: '#14120f',
      outline: 'none',
      texture: 'paper',
      material: 'plastic',
    },
    swatch: '#f4f1ea',
  },
};

export const DICE_SKIN_LIST: DiceSkin[] = Object.values(DICE_SKINS);

/**
 * Skórki dorzutu (etap 27d) — nie do wyboru w ustawieniach.
 *
 * Dorzut krytyka i fumble'a wjeżdża **drugą falą**, po osiadnięciu pierwszej,
 * więc może mieć własny wygląd niezależnie od tego, czym rzucał gracz. Złoto
 * i krew czytają się przez stół szybciej niż jakikolwiek napis.
 */
export const CRIT_COLORSET: DiceColorset = {
  name: 'vtt-crit',
  background: '#f0b429',
  foreground: '#231703',
  outline: 'none',
  texture: 'metal',
  material: 'metal',
};

/**
 * Fumble: kość niemal czarna z jaskrawymi cyframi. Pierwsza wersja była
 * ciemnoczerwona (#5c0c0c) i na stole nie dało się jej odróżnić od skórki
 * „Krew" — dwie czerwienie obok siebie czytały się jak jedna. Kontrast robi
 * teraz jasność, nie odcień.
 */
export const FUMBLE_COLORSET: DiceColorset = {
  name: 'vtt-fumble',
  background: '#150404',
  foreground: '#ff3b30',
  outline: '#ff8f88',
  texture: 'cloudy',
  material: 'plastic',
};
