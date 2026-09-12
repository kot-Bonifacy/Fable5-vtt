import { useEffect, useSyncExternalStore } from 'react';
import { useSettingsStore } from './stores/settingsStore.js';

/**
 * Pełny ekran (zlecenie MG z 12.09).
 *
 * Życzenie „chcę grać na pełnym ekranie" siedzi w `settingsStore` i jest
 * prywatne dla tej przeglądarki, jak głośności. Wszystko inne dyktuje
 * przeglądarka, a jej reguły są trzy — i każda zostawiła ślad w tym pliku:
 *
 *  - **Strona nie wchodzi w pełny ekran sama.** `requestFullscreen` wymaga
 *    świeżego gestu, więc „włącza się po zalogowaniu" znaczy: przy kliknięciu
 *    „Zaloguj się" / „Dołącz do gry", a po odświeżeniu strony (sesja
 *    z ciasteczka, żadnego kliknięcia) — przy pierwszym kliknięciu albo
 *    klawiszu gdziekolwiek. Ten automat działa **raz na wczytanie strony**:
 *    kto sam wyszedł z pełnego ekranu, nie zostanie wciągnięty z powrotem
 *    następnym kliknięciem w mapę.
 *  - **Esc wychodzi z pełnego ekranu i nie dociera do strony.** Drabina
 *    wyjścia z 27f przestałaby działać, więc tam, gdzie się da (Chrome, Edge),
 *    Esc idzie pod Keyboard Lock: krótkie wciśnięcie należy do VTT, z pełnego
 *    ekranu wychodzi się przytrzymaniem. API istnieje wyłącznie w bezpiecznym
 *    kontekście — w Firefoksie i na `http://` z gołym adresem IP Esc wychodzi
 *    po staremu.
 *  - **Przytrzymany Esc powtarza `keydown`.** Zanim przeglądarka zdejmie pełny
 *    ekran, drabina zdjęłaby po kolei celowanie, broń i zaznaczenie — wbrew
 *    jej zasadzie „nigdy wszystkiego naraz". Powtórzenia Esc w pełnym ekranie
 *    są zatrzymywane, zanim usłyszy je ktokolwiek inny.
 */

/** Keyboard Lock (Chrome, Edge) — TypeScript nie ma go w typach DOM. */
interface KeyboardLock {
  lock: (keyCodes?: string[]) => Promise<void>;
  unlock: () => void;
}

function keyboardLock(): KeyboardLock | null {
  if (typeof navigator === 'undefined') return null;
  const keyboard = (navigator as Navigator & { keyboard?: Partial<KeyboardLock> }).keyboard;
  return typeof keyboard?.lock === 'function' && typeof keyboard.unlock === 'function'
    ? (keyboard as KeyboardLock)
    : null;
}

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
}

/** Czy z pełnego ekranu wychodzi się przytrzymaniem Esc, a krótkie Esc zostaje w VTT. */
export function escapeHoldAvailable(): boolean {
  return keyboardLock() !== null;
}

/** Stan, od którego zależy, czy pierwszy gest na stronie ma wejść w pełny ekran. */
export interface AutoEntryState {
  preferred: boolean;
  authenticated: boolean;
  supported: boolean;
  fullscreen: boolean;
  /** Pełny ekran był już raz włączony od wczytania strony. */
  spent: boolean;
}

/**
 * Na ekranie logowania automat nie czeka — tam gestem jest samo „Zaloguj się".
 * Po pierwszym wejściu też nie: wyjście z pełnego ekranu jest wtedy decyzją.
 */
export function shouldArmAutoEntry(state: AutoEntryState): boolean {
  return (
    state.preferred && state.authenticated && state.supported && !state.fullscreen && !state.spent
  );
}

/** Esc zamyka rzeczy — nie może niczego otwierać, a pełnego ekranu tym bardziej. */
export function opensFullscreen(event: { type: string; key?: string }): boolean {
  return !(event.type === 'keydown' && event.key === 'Escape');
}

/** Powtórzenie przytrzymanego Esc w pełnym ekranie — nie schodzi po drabinie wyjścia. */
export function isHeldEscapeRepeat(
  event: Pick<KeyboardEvent, 'key' | 'repeat'>,
  fullscreen: boolean,
): boolean {
  return fullscreen && event.key === 'Escape' && event.repeat;
}

let autoEntrySpent = false;
let pendingEntry: Promise<boolean> | null = null;

/** Wejście w pełny ekran; `false`, gdy przeglądarka odmówiła (brak gestu, brak wsparcia). */
export function enterFullscreen(): Promise<boolean> {
  if (!fullscreenSupported()) return Promise.resolve(false);
  if (isFullscreen()) return Promise.resolve(true);
  // Mysz daje `pointerdown` i zaraz `keydown` z czatu — drugie żądanie w locie
  // przeglądarka potrafi odrzucić, więc oba gesty czekają na to samo.
  pendingEntry ??= document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      pendingEntry = null;
    });
  return pendingEntry;
}

export function exitFullscreen(): void {
  if (!isFullscreen()) return;
  document.exitFullscreen().catch(() => {
    // Przeglądarka zdążyła wyjść sama (Esc, F11) — nie ma czego sprzątać.
  });
}

/** Wejście przy logowaniu i dołączaniu — gestem jest kliknięcie w formularzu. */
export function enterPreferredFullscreen(): void {
  if (useSettingsStore.getState().fullscreen) void enterFullscreen();
}

/** Przełącznik z okna ustawień: zapis życzenia i od razu wejście albo wyjście. */
export function setFullscreenPreference(on: boolean): void {
  useSettingsStore.getState().setFullscreen(on);
  if (on) void enterFullscreen();
  else exitFullscreen();
}

/** Wylogowanie wraca do okna, a następne wejście do gry ma znów swój automat. */
export function leaveFullscreenOnLogout(): void {
  autoEntrySpent = false;
  exitFullscreen();
}

function onFullscreenChange(): void {
  const lock = keyboardLock();
  if (isFullscreen()) {
    autoEntrySpent = true;
    lock?.lock(['Escape']).catch(() => {
      // Bez blokady Esc wychodzi po staremu — pełny ekran i tak działa.
    });
  } else {
    lock?.unlock();
  }
}

function onKeyDownCapture(event: KeyboardEvent): void {
  if (isHeldEscapeRepeat(event, isFullscreen())) event.stopImmediatePropagation();
}

/**
 * Całe zachowanie pełnego ekranu na poziomie aplikacji. Wołane w `App`, bo
 * dotyczy każdej trasy — MG po odświeżeniu potrafi wylądować w `/gm`.
 *
 * Tłumik Esc siedzi w fazie przechwytywania na `window`, czyli przed każdym
 * nasłuchem drabiny (te słuchają w fazie bąbelkowania albo dopinają się
 * później, jak `AimMenu`).
 */
export function useFullscreen(authenticated: boolean): void {
  const preferred = useSettingsStore((s) => s.fullscreen);

  useEffect(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, []);

  useEffect(() => {
    const armed = shouldArmAutoEntry({
      preferred,
      authenticated,
      supported: fullscreenSupported(),
      fullscreen: isFullscreen(),
      spent: autoEntrySpent,
    });
    if (!armed) return;

    const onGesture = (event: Event) => {
      if (!opensFullscreen(event as KeyboardEvent)) return;
      // Klawisz, który nie liczy się za gest (np. sam Shift), dałby odrzucone
      // żądanie — automat czeka wtedy na następny.
      if ('userActivation' in navigator && !navigator.userActivation.isActive) return;
      void enterFullscreen().then((entered) => {
        // Odmowa MIMO gestu to decyzja przeglądarki (karta schowana za innym
        // oknem daje „not granted"), a nie pech. `requestFullscreen` zużywa
        // gest także wtedy, gdy odmawia — ponawianie przy każdym kliknięciu
        // odbierałoby go guzikom, które same go potrzebują („Wróć do pełnego
        // ekranu" dostawał przez to „Permissions check failed").
        if (!entered) {
          autoEntrySpent = true;
          disarm();
        }
      });
    };
    const onChange = () => {
      if (isFullscreen()) disarm();
    };
    function disarm() {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('fullscreenchange', onChange);
    }

    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    document.addEventListener('fullscreenchange', onChange);
    return disarm;
  }, [preferred, authenticated]);
}

function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

/** Czy strona jest TERAZ na pełnym ekranie — do okna ustawień. */
export function useFullscreenActive(): boolean {
  return useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
}
