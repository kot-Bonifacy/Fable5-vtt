import { useEffect, useRef, useState } from 'react';
import {
  DRAWING_FONT_PRESETS,
  DRAWING_TEXT_MAX_LENGTH,
  ROLE_GM,
  type DrawingFontPresetId,
} from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useDrawingStore } from '../stores/drawingStore.js';
import { currentDrawingStyle, useMapToolStore } from '../stores/mapToolStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { createDrawing } from '../socket.js';

/** UI names of the shared size ladder; the numbers live in `@vtt/shared`. */
const FONT_PRESET_LABELS: Record<DrawingFontPresetId, string> = {
  small: 'Mała',
  medium: 'Średnia',
  large: 'Duża',
};

/**
 * The text tool's one-line prompt (stage 17b): the map click said *where*, this
 * says *what*. Deliberately not an on-canvas editor — typing straight onto a
 * Pixi surface means reimplementing the caret, IME and selection, and a label
 * on a map is a few words, not a paragraph.
 *
 * The size lives here rather than only on the toolbar because it is a decision
 * about *this* caption — and it is the same setting the slider writes, so a
 * choice made here is the one the next label starts from.
 */
export function DrawingTextEditor() {
  const draft = useDrawingStore((s) => s.textDraft);
  const setTextDraft = useDrawingStore((s) => s.setTextDraft);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const fontSize = useMapToolStore((s) => s.drawFontSize);
  const setDrawFontSize = useMapToolStore((s) => s.setDrawFontSize);
  const gmOnly = useMapToolStore((s) => s.drawGmOnly);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (draft) setText('');
  }, [draft?.x, draft?.y]);

  // `autoFocus` is not enough here, and the difference is not cosmetic: the
  // dialog opens from a *canvas* click, and the browser's own focus handling
  // for that press runs after React has mounted the input — it lands on the
  // body and the field is left empty. Typing then goes to the map's one-letter
  // tool shortcuts instead of into the label. One frame later the press is
  // over and the focus sticks.
  useEffect(() => {
    if (!draft) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [draft?.x, draft?.y]);

  useEffect(() => {
    if (!draft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTextDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, setTextDraft]);

  if (!draft) return null;
  const onGmLayer = isGm && gmOnly;

  async function save(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !draft || !sceneId || busy) return;
    setBusy(true);
    try {
      await createDrawing(
        sceneId,
        { kind: 'text', x: draft.x, y: draft.y, text: trimmed, fontSize },
        currentDrawingStyle(useMapToolStore.getState()),
        onGmLayer,
      );
      setTextDraft(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note-editor drawing-text-editor" role="dialog" aria-label="Podpis na mapie">
      <header className="note-editor-header">
        <strong>Podpis na mapie</strong>
        <span className="note-editor-hint">
          {onGmLayer ? 'warstwa MG — gracze nie zobaczą' : 'widoczny dla wszystkich'}
        </span>
      </header>
      <input
        ref={inputRef}
        className="drawing-text-input"
        value={text}
        maxLength={DRAWING_TEXT_MAX_LENGTH}
        autoFocus
        placeholder="np. Magazyn, wyjście awaryjne…"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
        }}
      />
      <div className="drawing-text-sizes" role="group" aria-label="Wielkość podpisu">
        {DRAWING_FONT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`text-size-chip${fontSize === preset.size ? ' text-size-chip--active' : ''}`}
            aria-pressed={fontSize === preset.size}
            aria-label={`${FONT_PRESET_LABELS[preset.id]} (${preset.size} px)`}
            title={`${FONT_PRESET_LABELS[preset.id]} — ${preset.size} px mapy`}
            onClick={() => setDrawFontSize(preset.size)}
          >
            {/* No words: the glyph is scaled in exact proportion to the map
                size (a 72nd of it), so the ladder *is* the label — and three
                letters fit where three names did not. An affine version of
                this read as three identical A's; the ratio has to survive, not
                just the order. The name and the number stay in the tooltip. */}
            <span style={{ fontSize: `${preset.size / 72}rem` }}>A</span>
          </button>
        ))}
        {/* A size dialled in on the toolbar slider matches no chip — the number
            is what tells the user where they actually are. */}
        <span className="drawing-text-size-value">{fontSize} px</span>
      </div>
      <footer className="note-editor-actions">
        <span className="spacer" />
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={() => setTextDraft(null)}
        >
          Anuluj
        </button>
        <button
          type="button"
          className="small-button small-button--on"
          disabled={busy || text.trim().length === 0}
          onClick={() => void save()}
        >
          Napisz
        </button>
      </footer>
    </div>
  );
}
