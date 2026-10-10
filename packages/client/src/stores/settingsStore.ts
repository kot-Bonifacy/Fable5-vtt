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
 * Efekty dźwiękowe mają **jeden suwak** (24.09, decyzja MG: „wciąż za dużo
 * opcji"): kości, kubek, mapa i powiadomienia. Proporcje między nimi siedzą
 * w kodzie (`SFX_GAIN`, wzmocnienie sygnału w `cup-notification.ts`), nie
 * u gracza. Muzyka i otoczenie sceny mają własne suwaki w oknie muzyki.
 *
 * Kości toczą się zawsze (10.10, decyzja MG): rzut i patrzenie, co wypadnie,
 * to sedno gry, więc przełącznik „Animacja 3D” zniknął z ustawień.
 */
export interface SettingsState {
  /** 0–100, wszystkie efekty: kości, kubek, mapa, powiadomienia. Zero wycisza. */
  soundVolume: number;
  ambientVolume: number;
  setAmbientVolume: (volume: number) => void;
  musicVolume: number;
  setMusicVolume: (volume: number) => void;
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

  setSoundVolume: (volume: number) => void;
  /** Sam zapis — wejście i wyjście woła `setFullscreenPreference` z `fullscreen.ts`. */
  setFullscreen: (on: boolean) => void;
  /** Ustawia kopię lokalną; wysyłką na serwer zajmuje się `socket.ts`. */
  applySkin: (skin: DiceSkinId) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

const SOUND_VOLUME_KEY = 'vtt.sound.volume';
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
  soundVolume: readVolume(SOUND_VOLUME_KEY, 50),
  ambientVolume: readVolume('vtt.ambience.volume', 35),
  setAmbientVolume: (volume) => {
    const value = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 35;
    write('vtt.ambience.volume', String(value));
    set({ ambientVolume: value });
  },
  musicVolume: readVolume('vtt.music.volume', 40),
  setMusicVolume: (volume) => {
    const value = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 40;
    write('vtt.music.volume', String(value));
    set({ musicVolume: value });
  },
  fullscreen: readFlag(FULLSCREEN_KEY, false),
  skin: readSkin(),
  open: false,

  setSoundVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(SOUND_VOLUME_KEY, String(clamped));
    set({ soundVolume: clamped });
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
