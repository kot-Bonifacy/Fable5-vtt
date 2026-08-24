import { useEffect, useState } from 'react';
import { COVER_HP_MAX, cpredCoverPresetDetail, type CoverView } from '@vtt/shared';
import { updateCover } from '../socket.js';
import { ensureCoverCatalogueLoaded, useMapToolStore } from '../stores/mapToolStore.js';
import { coverErrorText } from '../mapErrors.js';

/**
 * Karta osłony (etap 27l).
 *
 * Powód, dla którego ta karta w ogóle powstała, jest jeden i konkretny:
 * **rozwalonej osłony nie dało się naprawić**. Wrak zostawał wrakiem do końca
 * kampanii albo trzeba było postawić nową w to samo miejsce, na oko, bo suwak
 * PW siedział wyłącznie w… nigdzie — `cover:update` przyjmowało `hpCurrent`
 * od 16c, ale żadne UI go nie wołało.
 *
 * Preset jest polem edytowalnym z tego samego powodu: „to jednak nie samochód,
 * to kontener" nie może znaczyć „skasuj i narysuj prostokąt jeszcze raz".
 * Wytrzymałość presetu czyta **serwer** z katalogu — klient wysyła samo id.
 */
export function SceneCardCover({ cover }: { cover: CoverView }) {
  const catalogue = useMapToolStore((s) => s.coverCatalogue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Katalog jedzie z API na żądanie (16c). Karta bywa pierwszym miejscem, które
  // go potrzebuje — MG, który nie rozwijał palety osłon, zobaczyłby pustą listę.
  useEffect(() => ensureCoverCatalogueLoaded(), []);

  async function patch(next: Parameters<typeof updateCover>[1]) {
    setBusy(true);
    const ack = await updateCover(cover.id, next);
    setBusy(false);
    setError(ack.ok ? null : coverErrorText(ack.error));
  }

  const wrecked = cover.hpCurrent <= 0;
  const preset = catalogue.presets.find((entry) => entry.id === cover.typeId) ?? null;

  return (
    <div className="scene-card-form">
      <label className="bot-field">
        <span className="auth-label">Nazwa</span>
        <input
          type="text"
          maxLength={40}
          defaultValue={cover.name}
          key={cover.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== cover.name) void patch({ name });
          }}
        />
      </label>

      <label className="bot-field">
        <span className="auth-label">Rodzaj z katalogu</span>
        <select
          value={preset ? preset.id : ''}
          title="Zmiana rodzaju przestawia wytrzymałość na tę z katalogu"
          disabled={busy || catalogue.presets.length === 0}
          onChange={(event) => void patch({ typeId: event.target.value })}
        >
          {!preset && <option value="">— {cover.typeId} (spoza katalogu) —</option>}
          {catalogue.presets.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} — {cpredCoverPresetDetail(catalogue, entry)}
            </option>
          ))}
        </select>
      </label>

      <label className="bot-field">
        <span className="auth-label">
          PW — {cover.hpCurrent} / {cover.hpMax}
          {wrecked ? ' (wrak: nic już nie zatrzymuje)' : ''}
        </span>
        <input
          type="range"
          min={0}
          max={cover.hpMax}
          value={cover.hpCurrent}
          disabled={busy}
          onChange={(event) => void patch({ hpCurrent: Number(event.target.value) })}
        />
      </label>

      <label className="bot-field">
        <span className="auth-label">Wytrzymałość maksymalna</span>
        <input
          type="number"
          min={1}
          max={COVER_HP_MAX}
          step={1}
          defaultValue={cover.hpMax}
          key={`max-${cover.hpMax}`}
          title="Preset z katalogu jest punktem wyjścia — tu podnosisz albo obniżasz sufit"
          onBlur={(event) => {
            const hpMax = Math.round(Number(event.target.value));
            if (Number.isFinite(hpMax) && hpMax >= 1 && hpMax !== cover.hpMax)
              void patch({ hpMax });
          }}
        />
      </label>

      <div className="net-generator-foot">
        <button
          type="button"
          className="small-button"
          title="Napraw — PW wracają do maksimum, osłona znów zatrzymuje kule"
          disabled={busy || cover.hpCurrent >= cover.hpMax}
          onClick={() => void patch({ hpCurrent: cover.hpMax })}
        >
          Napraw
        </button>
        <button
          type="button"
          className="small-button"
          title="Rozwal — PW na zero; osłona zostaje na mapie jako wrak"
          disabled={busy || wrecked}
          onClick={() => void patch({ hpCurrent: 0 })}
        >
          Rozwal
        </button>
      </div>

      <p className="placeholder-text">
        Prostokąt przesuniesz i przeskalujesz na mapie — przeciągnij zaznaczoną osłonę albo jej
        narożnik.
      </p>
      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}
