import { create } from 'zustand';
import type { DiceSkinId } from '@vtt/shared';
import { DEFAULT_DICE_SKIN, isDiceSkinId } from '@vtt/shared';

/**
 * Ustawienia stołu widziane oczami jednego użytkownika (etap 27d).
 *
 * Wszystko poza skórką kości jest **prywatne i lokalne** — trzymane w tej
 * przeglądarce, nigdzie nie wysyłane. Skórka jest wyjątkiem, bo musi dojechać
 * do cudzych ekranów: przy stole widać kości **rzucającego**, więc jej jedyne
 * wiarygodne miejsce jest na serwerze (kolumna `User.diceSkin`). Tutaj leży
 * kopia, żeby okno ustawień miało co pokazać przed odpowiedzią serwera.
 *
 * Głośności są trzy, bo to trzy różne rzeczy: kości uderzają o stół
 * (biblioteka 3D), kubek grzechocze w ręce (próbki odtwarzane u nas), a mapa
 * strzela i wybucha (etap 27i). Zero wycisza każdą z osobna — stół, który chce
 * grzechoczących kości i cichej mapy, istnieje.
 */
export interface SettingsState {
  /** Wyłączone = rzut nie toczy kości, karta czatu pojawia się natychmiast. */
  animate: boolean;
  /** 0–100, uderzenia kości o stół. */
  diceVolume: number;
  /** 0–100, grzechot kubka podczas potrząsania. */
  cupVolume: number;
  /** 0–100, efekty walki na mapie: strzały, wybuchy, przeładowanie (etap 27i). */
  sfxVolume: number;
  /**
   * Kroki figur na mapie (etap 27j) — własny przełącznik, nie własny suwak.
   *
   * Głośność bierze z suwaka efektów, bo to ten sam rodzaj dźwięku; wyłącznik
   * jest osobny, bo to jedyna próbka odtwarzana **za każdym razem, gdy ktoś
   * przejdzie przez pokój**, a nie raz na strzał. Zakres etapu mówi wprost:
   * „o ile nie zmęczy przy stole".
   */
  stepSounds: boolean;
  /**
   * Pełny ekran przy logowaniu i po odświeżeniu strony (12.09). To tylko
   * życzenie: wejściem i wyjściem zajmuje się `fullscreen.ts`, bo przeglądarka
   * wpuszcza w pełny ekran wyłącznie w odpowiedzi na gest.
   */
  fullscreen: boolean;
  /** Skórka TEGO użytkownika (kopia stanu serwera). */
  skin: DiceSkinId;
  /** Czy okno ustawień jest otwarte. */
  open: boolean;

  setAnimate: (animate: boolean) => void;
  setDiceVolume: (volume: number) => void;
  setCupVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setStepSounds: (on: boolean) => void;
  /** Sam zapis — wejście i wyjście woła `setFullscreenPreference` z `fullscreen.ts`. */
  setFullscreen: (on: boolean) => void;
  /** Ustawia kopię lokalną; wysyłką na serwer zajmuje się `socket.ts`. */
  applySkin: (skin: DiceSkinId) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

const ANIMATE_KEY = 'vtt.dice.animate';
const DICE_VOLUME_KEY = 'vtt.dice.volume';
const CUP_VOLUME_KEY = 'vtt.cup.volume';
const SFX_VOLUME_KEY = 'vtt.sfx.volume';
const STEP_SOUNDS_KEY = 'vtt.sfx.steps';
const FULLSCREEN_KEY = 'vtt.view.fullscreen';
const SKIN_KEY = 'vtt.dice.skin';

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function readVolume(key: string, fallback: number): number {
  try {
    // `getItem` gives null for „nigdy nie ustawione", a `Number(null)` to zero —
    // bez tego sprawdzenia każda świeża przeglądarka startowałaby wyciszona.
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const raw = Number(stored);
    return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : fallback;
  } catch {
    return fallback;
  }
}

function readSkin(): DiceSkinId {
  try {
    const raw = window.localStorage.getItem(SKIN_KEY);
    return isDiceSkinId(raw) ? raw : DEFAULT_DICE_SKIN;
  } catch {
    return DEFAULT_DICE_SKIN;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Tryb prywatny: ustawienie po prostu nie przeżyje przeładowania.
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  animate: readFlag(ANIMATE_KEY, true),
  diceVolume: readVolume(DICE_VOLUME_KEY, 50),
  cupVolume: readVolume(CUP_VOLUME_KEY, 50),
  sfxVolume: readVolume(SFX_VOLUME_KEY, 50),
  stepSounds: readFlag(STEP_SOUNDS_KEY, true),
  fullscreen: readFlag(FULLSCREEN_KEY, false),
  skin: readSkin(),
  open: false,

  setAnimate: (animate) => {
    write(ANIMATE_KEY, animate ? '1' : '0');
    set({ animate });
  },

  setDiceVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(DICE_VOLUME_KEY, String(clamped));
    set({ diceVolume: clamped });
  },

  setCupVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(CUP_VOLUME_KEY, String(clamped));
    set({ cupVolume: clamped });
  },

  setSfxVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(SFX_VOLUME_KEY, String(clamped));
    set({ sfxVolume: clamped });
  },

  setStepSounds: (on) => {
    write(STEP_SOUNDS_KEY, on ? '1' : '0');
    set({ stepSounds: on });
  },

  setFullscreen: (on) => {
    write(FULLSCREEN_KEY, on ? '1' : '0');
    set({ fullscreen: on });
  },

  applySkin: (skin) => {
    write(SKIN_KEY, skin);
    set({ skin });
  },

  setOpen: (open) => set({ open }),
  toggleOpen: () => set({ open: !get().open }),
}));
