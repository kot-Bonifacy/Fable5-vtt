import { useState } from 'react';
import { LIGHT_COLORS, type LightView } from '@vtt/shared';
import { updateLight } from '../socket.js';
import { lightErrorText } from '../mapErrors.js';

/**
 * Karta światła (etap 27l).
 *
 * Zastępuje pomostowe zachowanie z 27k — „dwuklik przestraja lampę do ustawień
 * z paska" — które istniało tylko dlatego, że lampy nie dało się przestroić
 * inaczej niż stawiając nową. Pasek zostaje tym, czym był: ustawieniem
 * **następnej** lampy; ta karta jest ustawieniem **tej**.
 *
 * „Dopasuj do pokoju" nie jest tu suwakiem, tylko przyciskiem, i to jest cała
 * różnica między nim a promieniami: ściany mieszkają na serwerze, więc to
 * jedyna właściwość lampy, o którą klient może wyłącznie **poprosić**.
 */
export function SceneCardLight({ light }: { light: LightView }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(next: Parameters<typeof updateLight>[1], fitRoom?: boolean) {
    setBusy(true);
    const ack = await updateLight(light.id, next, fitRoom);
    setBusy(false);
    setError(ack.ok ? null : lightErrorText(ack.error));
  }

  return (
    <div className="scene-card-form">
      <label className="bot-field">
        <span className="auth-label">Jasny promień — {light.brightM} m</span>
        {/* Te same dwa zakresy co suwaki na pasku (18b): 40 m i 60 m to praktyczny
            koniec skali dla wnętrza, a serwer i tak przyjmuje do 200 m. */}
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={Math.min(light.brightM, 40)}
          disabled={busy}
          title="Pełne światło: tu widać wszystko bez kary"
          onChange={(event) => void patch({ brightM: Number(event.target.value) })}
        />
      </label>

      <label className="bot-field">
        <span className="auth-label">Przyćmiony promień — {light.dimM} m</span>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={Math.min(light.dimM, 60)}
          disabled={busy}
          title="Zewnętrzny krąg; nigdy nie jest mniejszy od jasnego — serwer go rozszerza"
          onChange={(event) => void patch({ dimM: Number(event.target.value) })}
        />
      </label>

      <fieldset className="bot-field">
        <legend className="auth-label">Kolor</legend>
        <div className="scene-card-swatches" role="group" aria-label="Kolor światła">
          {LIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`scene-card-swatch${light.color === color ? ' scene-card-swatch--on' : ''}`}
              style={{ background: color }}
              aria-pressed={light.color === color}
              aria-label={`Kolor ${color}`}
              title={color}
              disabled={busy}
              onClick={() => void patch({ color })}
            />
          ))}
        </div>
      </fieldset>

      <label className="bot-checkbox">
        <input
          type="checkbox"
          checked={light.flicker}
          disabled={busy}
          onChange={(event) => void patch({ flicker: event.target.checked })}
        />
        Migotanie (świeca, zepsuty neon)
      </label>

      <div className="net-generator-foot">
        <button
          type="button"
          className={`small-button${light.enabled ? ' small-button--on' : ''}`}
          aria-pressed={light.enabled}
          title={
            light.enabled ? 'Zgaś — lampa zostaje na mapie, ciemna' : 'Zapal — lampa znów świeci'
          }
          disabled={busy}
          onClick={() => void patch({ enabled: !light.enabled })}
        >
          {light.enabled ? '💡 Świeci' : '🌑 Zgaszona'}
        </button>
        <button
          type="button"
          className="small-button"
          title="Zmierz pokój dookoła lampy i dobierz promienie do jego ścian"
          disabled={busy}
          onClick={() => void patch({}, true)}
        >
          Dopasuj do pokoju
        </button>
      </div>

      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}
