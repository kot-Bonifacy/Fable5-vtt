import { useState } from 'react';
import { COVER_HP_MAX, type CoverView } from '@vtt/shared';
import { updateCover } from '../socket.js';
import { coverErrorText } from '../mapErrors.js';
import { noteAck } from '../notices.js';

/**
 * Karta osłony (etap 27l).
 *
 * Powód, dla którego ta karta w ogóle powstała, jest jeden i konkretny:
 * **rozwalonej osłony nie dało się naprawić**. Wrak zostawał wrakiem do końca
 * kampanii albo trzeba było postawić nową w to samo miejsce, na oko, bo suwak
 * PW siedział wyłącznie w… nigdzie — `cover:update` przyjmowało `hpCurrent`
 * od 16c, ale żadne UI go nie wołało.
 *
 * Od 21.10.2026 (zlecenie MG) osłona nie ma rodzaju z katalogu: to jedna
 * ogólna „Osłona", której MG wpisuje PW i mówi, czy gracze ją widzą.
 */
export function SceneCardCover({ cover }: { cover: CoverView }) {
  const [busy, setBusy] = useState(false);

  async function patch(next: Parameters<typeof updateCover>[1]) {
    setBusy(true);
    const ack = await updateCover(cover.id, next);
    setBusy(false);
    noteAck('scene', ack, coverErrorText);
  }

  const wrecked = cover.hpCurrent <= 0;

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

      <label
        className="bot-checkbox"
        title="Ukrytej osłony gracze nie dostają wcale; dalej zatrzymuje kule i ruch, a pierwszy strzał gracza, który zatrzyma, ją odsłania"
      >
        <input
          type="checkbox"
          checked={!cover.hidden}
          disabled={busy}
          onChange={(event) => void patch({ hidden: !event.target.checked })}
        />
        Widoczna dla graczy
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
    </div>
  );
}
