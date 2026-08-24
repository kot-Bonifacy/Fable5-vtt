import { useEffect, useRef, useState } from 'react';
import { NOTE_ICONS, NOTE_TEXT_MAX_LENGTH, type MapNoteView, type NoteIcon } from '@vtt/shared';
import { createNote, updateNote } from '../socket.js';
import { useSceneStore } from '../stores/sceneStore.js';

/**
 * Karta notatki MG (etap 17) — pinezka z tekstem za nią.
 *
 * Od 27l to jest **treść** karty, nie całe okno: ramkę, belkę, zamykanie i kosz
 * daje `SceneObjectCard`, wspólny dla siedmiu rodzajów obiektów sceny.
 *
 * Jedyna karta, która bywa otwarta **bez obiektu** po drugiej stronie: świeżo
 * wbita pinezka nie ma jeszcze notatki, bo notatka powstaje dopiero z zapisanego
 * tekstu. Stąd `draft` obok `note` — dwa wejścia, jeden formularz.
 *
 * Nic tu nie jest skierowane do gracza: notatki nigdy nie opuszczają serwera
 * w stronę jego gniazda.
 */
export function SceneCardNote({
  note,
  draft,
  onClose,
}: {
  note?: MapNoteView;
  draft?: { x: number; y: number };
  onClose: () => void;
}) {
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const [text, setText] = useState(note?.text ?? '');
  const [icon, setIcon] = useState<NoteIcon>(note?.icon ?? NOTE_ICONS[0]);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-seed the form whenever a different pin (or a fresh draft) opens it.
  useEffect(() => {
    setText(note?.text ?? '');
    setIcon(note?.icon ?? NOTE_ICONS[0]);
  }, [note?.id, note?.text, note?.icon, draft?.x, draft?.y]);

  // `autoFocus` loses a race the editor cannot win on its own: the card opens
  // from a click on the Pixi canvas, and the browser's own focus handling for
  // that press runs after React has mounted the field, putting focus back on
  // the body. One frame later the press is over and the focus sticks — without
  // this the first letters typed went to the map's tool shortcuts instead.
  useEffect(() => {
    const frame = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [note?.id, draft?.x, draft?.y]);

  async function save(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      if (note) await updateNote(note.id, { text: trimmed, icon });
      else if (draft && sceneId) await createNote(sceneId, draft.x, draft.y, trimmed, icon);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scene-card-form">
      <p className="placeholder-text">Widoczna tylko dla ciebie — nie opuszcza serwera.</p>
      <div className="note-editor-icons" role="group" aria-label="Ikona pinezki">
        {NOTE_ICONS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`note-icon${icon === candidate ? ' note-icon--active' : ''}`}
            aria-pressed={icon === candidate}
            aria-label={`Ikona ${candidate}`}
            title={`Ikona ${candidate}`}
            onClick={() => setIcon(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      <textarea
        ref={textRef}
        className="note-editor-text"
        value={text}
        maxLength={NOTE_TEXT_MAX_LENGTH}
        rows={5}
        aria-label="Treść notatki"
        placeholder="Co tu jest ukryte, co się stanie, kogo tu spotkają…"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="net-generator-foot">
        <button
          type="button"
          className="small-button small-button--on"
          disabled={busy || text.trim().length === 0}
          onClick={() => void save()}
        >
          Zapisz
        </button>
        <button type="button" className="small-button" disabled={busy} onClick={onClose}>
          Anuluj
        </button>
      </div>
    </div>
  );
}
