import { useState } from 'react';
import {
  DRAWING_COLORS,
  DRAWING_FONT_PRESETS,
  DRAWING_MAX_WIDTH,
  DRAWING_MIN_WIDTH,
  DRAWING_TEXT_MAX_LENGTH,
  ROLE_GM,
  type DrawingView,
} from '@vtt/shared';
import { updateDrawing } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { drawingErrorText } from '../mapErrors.js';

/**
 * Karta rysunku (etap 27l).
 *
 * Do tej sesji kreska była **niezmienna**: zły kolor, za cienka linia albo
 * literówka w podpisie znaczyły „skasuj i narysuj jeszcze raz", a `drawGmOnly`
 * z paska dotyczył zawsze *następnego* kształtu — szkic postawiony za ekranem
 * nie miał jak trafić na stół.
 *
 * Przenoszenie między warstwami widzi wyłącznie MG, bo warstwa MG jest rolą,
 * a nie ustawieniem: gracz, który o nią poprosi, po prostu rysuje publicznie
 * (ta sama reguła, co przy stawianiu kreski).
 */

const FONT_LABELS: Record<string, string> = {
  small: 'Małe',
  medium: 'Średnie',
  large: 'Duże',
};

export function SceneCardDrawing({ drawing }: { drawing: DrawingView }) {
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(drawing.shape.kind === 'text' ? drawing.shape.text : '');

  async function patch(next: Parameters<typeof updateDrawing>[1]) {
    setBusy(true);
    const ack = await updateDrawing(drawing.id, next);
    setBusy(false);
    setError(ack.ok ? null : drawingErrorText(ack.error));
  }

  const fillable = drawing.shape.kind === 'rect' || drawing.shape.kind === 'ellipse';
  const label = drawing.shape.kind === 'text' ? drawing.shape : null;

  return (
    <div className="scene-card-form">
      <fieldset className="bot-field">
        <legend className="auth-label">Kolor</legend>
        <div className="scene-card-swatches" role="group" aria-label="Kolor rysunku">
          {DRAWING_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`scene-card-swatch${
                drawing.style.color === color ? ' scene-card-swatch--on' : ''
              }`}
              style={{ background: color }}
              aria-pressed={drawing.style.color === color}
              aria-label={`Kolor ${color}`}
              title={color}
              disabled={busy}
              onClick={() => void patch({ style: { color } })}
            />
          ))}
        </div>
      </fieldset>

      <label className="bot-field">
        <span className="auth-label">Grubość — {drawing.style.width}</span>
        <input
          type="range"
          min={DRAWING_MIN_WIDTH}
          max={DRAWING_MAX_WIDTH}
          step={1}
          value={drawing.style.width}
          disabled={busy}
          title="W pikselach sceny — kreska maleje razem z mapą"
          onChange={(event) => void patch({ style: { width: Number(event.target.value) } })}
        />
      </label>

      {fillable && (
        <label className="bot-checkbox">
          <input
            type="checkbox"
            checked={drawing.style.filled}
            disabled={busy}
            onChange={(event) => void patch({ style: { filled: event.target.checked } })}
          />
          Wypełnienie
        </label>
      )}

      {label && (
        <>
          <label className="bot-field">
            <span className="auth-label">Treść etykiety</span>
            <input
              type="text"
              maxLength={DRAWING_TEXT_MAX_LENGTH}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => {
                const trimmed = text.trim();
                if (!trimmed) {
                  setText(label.text);
                  return;
                }
                if (trimmed !== label.text) void patch({ shape: { ...label, text: trimmed } });
              }}
            />
          </label>
          <fieldset className="bot-field">
            <legend className="auth-label">Pismo — {label.fontSize} px sceny</legend>
            <div className="scene-card-choice" role="group" aria-label="Rozmiar pisma">
              {DRAWING_FONT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`small-button${
                    label.fontSize === preset.size ? ' small-button--on' : ''
                  }`}
                  aria-pressed={label.fontSize === preset.size}
                  disabled={busy}
                  onClick={() => void patch({ shape: { ...label, fontSize: preset.size } })}
                >
                  {FONT_LABELS[preset.id] ?? preset.id}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {isGm && (
        <>
          <fieldset className="bot-field">
            <legend className="auth-label">Warstwa</legend>
            <div className="scene-card-choice" role="group" aria-label="Warstwa rysunku">
              <button
                type="button"
                className={`small-button${drawing.gmOnly ? ' small-button--on' : ''}`}
                aria-pressed={drawing.gmOnly}
                title="Za ekranem — gracze nigdy tego nie dostają"
                disabled={busy}
                onClick={() => void patch({ gmOnly: true })}
              >
                Tylko MG
              </button>
              <button
                type="button"
                className={`small-button${drawing.gmOnly ? '' : ' small-button--on'}`}
                aria-pressed={!drawing.gmOnly}
                title="Na stole — widzą wszyscy przy tej scenie"
                disabled={busy}
                onClick={() => void patch({ gmOnly: false })}
              >
                Wspólna
              </button>
            </div>
          </fieldset>
          <p className="placeholder-text">
            {drawing.gmOnly
              ? 'Ten szkic nie opuszcza serwera — gracze go nie mają.'
              : `Widzą wszyscy. Narysował: ${drawing.authorName}.`}
          </p>
        </>
      )}

      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}
