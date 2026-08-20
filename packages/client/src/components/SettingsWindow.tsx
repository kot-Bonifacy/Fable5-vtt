import { useRef, useState, type PointerEvent } from 'react';
import type { MapFxSound } from '@vtt/shared';
import { DICE_SKIN_LIST } from '../dice-skins.js';
import { auditionFxSound } from '../sfx.js';
import { previewSkin } from '../dice3d.js';
import { sendDiceSkin } from '../socket.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { useThemeStore } from '../stores/themeStore.js';
import { useTypewriterStore } from '../stores/typewriterStore.js';

/**
 * Próbki mapy do odsłuchu (etap 27i).
 *
 * Wybrane z paczek CC0 **bez odsłuchu** — nazwy plików w archiwach mówiły „hit",
 * „metal", „spark", i to musiało wystarczyć. Ten rządek przycisków jest tego
 * konsekwencją: podmiana źle dobranej próbki to jeden plik w `public/sfx/`
 * i jeden wiersz w `SFX_FILES`, ale najpierw ktoś musi ją usłyszeć.
 */
const SFX_SAMPLES: readonly { id: MapFxSound; label: string }[] = [
  { id: 'shot-pistol', label: 'Pistolet' },
  { id: 'shot-rifle', label: 'Karabin' },
  { id: 'shot-sniper', label: 'Snajperka' },
  { id: 'shot-shotgun', label: 'Strzelba' },
  { id: 'swing', label: 'Cięcie' },
  { id: 'bowstring', label: 'Cięciwa' },
  { id: 'impact', label: 'Trafienie' },
  { id: 'ricochet', label: 'Rykoszet' },
  { id: 'explosion', label: 'Wybuch' },
  { id: 'gas', label: 'Gaz' },
  { id: 'zap', label: 'Wyładowanie' },
  { id: 'reload', label: 'Przeładowanie' },
];

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
  const diceVolume = useSettingsStore((s) => s.diceVolume);
  const setDiceVolume = useSettingsStore((s) => s.setDiceVolume);
  const cupVolume = useSettingsStore((s) => s.cupVolume);
  const setCupVolume = useSettingsStore((s) => s.setCupVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const setSfxVolume = useSettingsStore((s) => s.setSfxVolume);
  const skin = useSettingsStore((s) => s.skin);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const typewriter = useTypewriterStore((s) => s.enabled);
  const setTypewriter = useTypewriterStore((s) => s.setEnabled);

  const [position, setPosition] = useState(() => ({
    x: Math.max(12, window.innerWidth - 420),
    y: 64,
  }));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  if (!open) return null;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 120, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  /** Wybór skórki: zapis na serwerze i od razu próbny rzut w nowych kościach. */
  function chooseSkin(id: (typeof DICE_SKIN_LIST)[number]['id']) {
    void sendDiceSkin(id);
    void previewSkin(id);
  }

  return (
    <section
      className="settings-window"
      style={{ left: position.x, top: position.y }}
      aria-label="Ustawienia"
    >
      <div
        className="settings-window-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="settings-window-title">⚙ Ustawienia</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => setOpen(false)}
          title="Zamknij ustawienia"
        >
          ✕
        </button>
      </div>

      <div className="settings-window-body">
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

          <label className="settings-row">
            <span className="settings-label">Głośność kości</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={diceVolume}
              onChange={(event) => setDiceVolume(Number(event.target.value))}
            />
            <span className="settings-value">{diceVolume}</span>
          </label>

          <label className="settings-row">
            <span className="settings-label">Głośność kubka</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={cupVolume}
              onChange={(event) => setCupVolume(Number(event.target.value))}
            />
            <span className="settings-value">{cupVolume}</span>
          </label>
        </section>

        <section className="settings-group">
          <h3 className="settings-group-title">Efekty walki na mapie</h3>

          <label className="settings-row">
            <span className="settings-label">Głośność efektów</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sfxVolume}
              onChange={(event) => setSfxVolume(Number(event.target.value))}
            />
            <span className="settings-value">{sfxVolume}</span>
          </label>

          <p className="settings-note">
            Strzały, wybuchy i przeładowanie na mapie. Wyłączenie „Animacji 3D" wycisza je razem z
            kośćmi — to jeden przełącznik na całe przedstawienie. Kliknij próbkę, żeby jej
            posłuchać.
          </p>

          <div className="settings-samples">
            {SFX_SAMPLES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="settings-sample"
                onClick={() => auditionFxSound(entry.id)}
                title={`Posłuchaj: ${entry.label}`}
              >
                🔊 {entry.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-group">
          <h3 className="settings-group-title">Twoje kości</h3>
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
                  <span className="settings-hint">{entry.description}</span>
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

          <label className="settings-row settings-row--switch">
            <input
              type="checkbox"
              checked={typewriter}
              onChange={(event) => setTypewriter(event.target.checked)}
            />
            <span>
              Maszynopis wypowiedzi NPC-ów
              <span className="settings-hint">
                Wypowiedzi botów dopisują się słowo po słowie zamiast pojawiać od razu.
              </span>
            </span>
          </label>
        </section>
      </div>
    </section>
  );
}
