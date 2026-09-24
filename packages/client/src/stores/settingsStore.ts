import { create } from 'zustand';
import type { DiceSkinId } from '@vtt/shared';
import { DEFAULT_DICE_SKIN, isDiceSkinId } from '@vtt/shared';
import type { NotificationKind } from '../game-notifications.js';

/**
 * Ustawienia stołu widziane oczami jednego użytkownika (etap 27d).
 *
 * Wszystko poza skórką kości jest **prywatne i lokalne** — trzymane w tej
 * przeglądarce, nigdzie nie wysyłane. Skórka jest wyjątkiem, bo musi dojechać
 * do cudzych ekranów: przy stole widać kości **rzucającego**, więc jej jedyne
 * wiarygodne miejsce jest na serwerze (kolumna `User.diceSkin`). Tutaj leży
 * kopia, żeby okno ustawień miało co pokazać przed odpowiedzią serwera.
 *
 * Osobne głośności: kości (stukot o stół i grzechot kubka — jeden suwak od
 * 24.09), mapa (strzały, wybuchy, kroki — etap 27i) i powiadomienia. Zero
 * wycisza każdą z osobna — stół, który chce grzechoczących kości i cichej mapy,
 * istnieje. Żaden dźwięk nie zależy od przełącznika animacji (od 24.09).
 */
export interface SettingsState {
  /** Wyłączone = rzut nie toczy kości, karta czatu pojawia się natychmiast. */
  animate: boolean;
  /** 0–100, uderzenia kości o stół i grzechot kubka podczas potrząsania. */
  diceVolume: number;
  /** 0–100, efekty mapy: strzały, wybuchy, przeładowanie, kroki figur (etap 27i). */
  sfxVolume: number;
  notificationVolume: number;
  notifications: Record<NotificationKind, boolean>;
  setNotification: (kind: NotificationKind, enabled: boolean) => void;
  ambientVolume: number;
  setAmbientVolume: (volume: number) => void;
  musicVolume: number;
  setNotificationVolume: (volume: number) => void;
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

  setAnimate: (animate: boolean) => void;
  setDiceVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  /** Sam zapis — wejście i wyjście woła `setFullscreenPreference` z `fullscreen.ts`. */
  setFullscreen: (on: boolean) => void;
  /** Ustawia kopię lokalną; wysyłką na serwer zajmuje się `socket.ts`. */
  applySkin: (skin: DiceSkinId) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

const ANIMATE_KEY = 'vtt.dice.animate';
const DICE_VOLUME_KEY = 'vtt.dice.volume';
const SFX_VOLUME_KEY = 'vtt.sfx.volume';
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
  sfxVolume: readVolume(SFX_VOLUME_KEY, 50),
  notificationVolume: readVolume('vtt.notification.volume', 60),
  notifications: {
    turn: readFlag('vtt.notification.turn', true),
    whisper: readFlag('vtt.notification.whisper', true),
    request: readFlag('vtt.notification.request', true),
    handout: readFlag('vtt.notification.handout', true),
    inventory: readFlag('vtt.notification.inventory', true),
  },
  setNotification: (kind, enabled) => {
    write(`vtt.notification.${kind}`, enabled ? '1' : '0');
    set({ notifications: { ...get().notifications, [kind]: enabled } });
  },
  ambientVolume: readVolume('vtt.ambience.volume', 35),
  setAmbientVolume: (volume) => {
    const value = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 35;
    write('vtt.ambience.volume', String(value));
    set({ ambientVolume: value });
  },
  musicVolume: readVolume('vtt.music.volume', 40),
  setNotificationVolume: (volume) => {
    const value = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 60;
    write('vtt.notification.volume', String(value));
    set({ notificationVolume: value });
  },
  setMusicVolume: (volume) => {
    const value = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 40;
    write('vtt.music.volume', String(value));
    set({ musicVolume: value });
  },
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

  setSfxVolume: (volume) => {
    const clamped = Math.min(100, Math.max(0, Math.round(volume)));
    write(SFX_VOLUME_KEY, String(clamped));
    set({ sfxVolume: clamped });
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
