import { DICE_SKIN_LIST } from '../dice-skins.js';
import {
  enterFullscreen,
  escapeHoldAvailable,
  fullscreenSupported,
  setFullscreenPreference,
  useFullscreenActive,
} from '../fullscreen.js';
import { previewSkin } from '../dice3d.js';
import { sendDiceSkin } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useThemeStore } from '../stores/themeStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { PasswordChange } from './PasswordChange.js';
import { OwnerLink } from './AiAccessRequest.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno ustawień (etap 27d).
 *
 * Powstało, bo górny pasek zaczął puchnąć: każdy przełącznik wyglądu lądował
 * w nim jako kolejny przycisk (☀/☾ z 27a, ⌨ z etapu 11), a 27d dokłada
 * skórki kości i dwie głośności. Okno jest z tej samej rodziny co karta
 * postaci i handout — pływa nad stołem, przeciąga się za nagłówek i niczego
 * nie zasłania na stałe.
 *
 * Wszystko tutaj jest **prywatne dla tej przeglądarki** z jednym wyjątkiem:
 * skórka kości jedzie na serwer, bo przy stole widać kości rzucającego.
 */
export function SettingsWindow() {
  const open = useSettingsStore((s) => s.open);
  const setOpen = useSettingsStore((s) => s.setOpen);

  const animate = useSettingsStore((s) => s.animate);
  const setAnimate = useSettingsStore((s) => s.setAnimate);
  const soundVolume = useSettingsStore((s) => s.soundVolume);
  const setSoundVolume = useSettingsStore((s) => s.setSoundVolume);
  const skin = useSettingsStore((s) => s.skin);
  const fullscreen = useSettingsStore((s) => s.fullscreen);
  const fullscreenActive = useFullscreenActive();
  const canFullscreen = fullscreenSupported();

  // Hasło zmienia tu zwykłe konto MG (44a); właściciel ma je w `.env`, gracz nie ma go wcale.
  const changesPassword = useAuthStore((s) => s.user?.role === 'GM' && !s.user.owner);
  // Gracz może tu połączyć konto z właścicielem serwera (44d).
  const isPlayer = useAuthStore((s) => s.user?.role === 'PLAYER');
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const placement = useWindowPlacement('settings', () => ({
    x: Math.max(12, window.innerWidth - 420),
    y: 64,
  }));

  if (!open) return null;

  /** Wybór skórki: zapis na serwerze i od razu próbny rzut w nowych kościach. */
  function chooseSkin(id: (typeof DICE_SKIN_LIST)[number]['id']) {
    void sendDiceSkin(id);
    void previewSkin(id);
  }

  return (
    <section
      ref={placement.ref}
      className="settings-window"
      style={placement.style}
      aria-label="Ustawienia"
      data-owns-keys
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">⚙ Ustawienia</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => setOpen(false)}
          title="Zamknij ustawienia"
          aria-label="Zamknij ustawienia"
        >
          ✕
        </button>
      </div>

      <div className="settings-window-body">
        <section className="settings-group">
          <h3 className="settings-group-title">Dźwięk</h3>
          <label
            className="settings-row"
            title="Kości, kubek, efekty na mapie i powiadomienia. Zero wycisza. Muzyka i otoczenie mają własne suwaki w oknie muzyki."
          >
            <span className="settings-label">Głośność</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={soundVolume}
              onChange={(event) => setSoundVolume(Number(event.target.value))}
            />
            <span className="settings-value">{soundVolume}</span>
          </label>
        </section>

        <section className="settings-group">
          <h3 className="settings-group-title">Kości</h3>

          <label className="settings-row settings-row--switch">
            <input
              type="checkbox"
              checked={animate}
              onChange={(event) => setAnimate(event.target.checked)}
            />
            <span>
              Animacja 3D
              <span className="settings-hint">
                Wyłączona — karta rzutu na czacie pojawia się od razu, bez czekania na kości.
              </span>
            </span>
          </label>

          <p className="settings-note">
            Skórka jedzie z rzutem: przy Twoim rzucie cały stół widzi te kości. Kliknięcie od razu
            toczy próbny rzut — na niby, bez znaczenia dla gry.
          </p>
          <div className="settings-skins">
            {DICE_SKIN_LIST.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`settings-skin${entry.id === skin ? ' settings-skin--on' : ''}`}
                onClick={() => chooseSkin(entry.id)}
                title={entry.description}
                aria-pressed={entry.id === skin}
              >
                <span className="settings-skin-swatch" style={{ background: entry.swatch }} />
                <span className="settings-skin-text">
                  <span className="settings-skin-name">{entry.label}</span>
                  <span className="settings-skin-description"> — {entry.description}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="settings-note">
            Dorzut krytyka i fumble'a ma własne kości — złote albo krwiste — i wjeżdża osobno, kiedy
            pierwsze już leżą.
          </p>
        </section>

        <section className="settings-group">
          <h3 className="settings-group-title">Widok</h3>

          {/* Pełny ekran (12.09). Pole to życzenie zapamiętane w tej przeglądarce,
              nie stan — gracz, który przytrzymał Esc, dalej go chce po F5, więc
              powrót dostaje własny guzik zamiast odhaczania i zaznaczania od nowa. */}
          <label className="settings-row settings-row--switch">
            <input
              type="checkbox"
              checked={fullscreen}
              disabled={!canFullscreen}
              onChange={(event) => setFullscreenPreference(event.target.checked)}
            />
            <span>
              Pełny ekran
              <span className="settings-hint">
                {canFullscreen
                  ? `VTT bez pasków przeglądarki, zapamiętany w tej przeglądarce. Włącza się przy logowaniu, a po odświeżeniu strony — przy pierwszym kliknięciu albo klawiszu. ${
                      escapeHoldAvailable()
                        ? 'Wyjście: przytrzymaj Esc — krótkie Esc dalej zamyka to, co otwarte w VTT.'
                        : 'Tutaj pierwsze Esc wychodzi z pełnego ekranu i dopiero następne zamyka coś w VTT (przytrzymanie Esc działa w Chrome i Edge, przez HTTPS).'
                    }`
                  : 'Ta przeglądarka nie pozwala stronie przejść na pełny ekran.'}
              </span>
            </span>
          </label>
          {fullscreen && canFullscreen && !fullscreenActive && (
            <button
              type="button"
              className="settings-action"
              onClick={() => void enterFullscreen()}
            >
              ⛶ Wróć do pełnego ekranu
            </button>
          )}

          <label className="settings-row settings-row--switch">
            <input
              type="checkbox"
              checked={theme === 'day'}
              onChange={(event) => setTheme(event.target.checked ? 'day' : 'night')}
            />
            <span>
              Tryb dzienny
              <span className="settings-hint">
                Jasna skóra całego VTT. Mapa zostaje ciemna — mgła, ciemność i podpisy żetonów są
                rysowane na płótnie i w dzień przestałyby być czytelne.
              </span>
            </span>
          </label>
        </section>

        {(changesPassword || isPlayer) && (
          <section className="settings-group settings-group--account">
            <h3 className="settings-group-title">Konto</h3>
            {changesPassword ? <PasswordChange /> : <OwnerLink />}
          </section>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
