import { useEffect, useRef, useState } from 'react';
import { NOTE_ICONS, NOTE_TEXT_MAX_LENGTH, type NoteIcon } from '@vtt/shared';
import { useNoteStore } from '../stores/noteStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { createNote, deleteNote, updateNote } from '../socket.js';

/**
 * Editor of one GM note (stage 17) — opened by dropping a pin with the note
 * tool, or by clicking an existing pin. Nothing here is player-facing: the
 * notes never reach a player socket in the first place.
 */
export function NoteEditor() {
  const draft = useNoteStore((s) => s.draft);
  const note = useNoteStore((s) => (s.editingId ? s.notes[s.editingId] : undefined));
  const setDraft = useNoteStore((s) => s.setDraft);
  const setEditing = useNoteStore((s) => s.setEditing);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);

  const [text, setText] = useState('');
  const [icon, setIcon] = useState<NoteIcon>(NOTE_ICONS[0]);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-seed the form whenever a different pin (or a fresh draft) opens it.
  useEffect(() => {
    setText(note?.text ?? '');
    setIcon(note?.icon ?? NOTE_ICONS[0]);
  }, [note?.id, note?.text, note?.icon, draft?.x, draft?.y]);

  // `autoFocus` loses a race the editor cannot win on its own: the panel opens
  // from a click on the Pixi canvas, and the browser's own focus handling for
  // that press runs after React has mounted the field, putting focus back on
  // the body. One frame later the press is over and the focus sticks — without
  // this the first letters typed went to the map's tool shortcuts instead.
  useEffect(() => {
    const frame = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [note?.id, draft?.x, draft?.y]);

  const open = draft !== null || note !== undefined;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  function close(): void {
    setDraft(null);
    setEditing(null);
  }

  async function save(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      if (note) {
        await updateNote(note.id, { text: trimmed, icon });
      } else if (draft && sceneId) {
        await createNote(sceneId, draft.x, draft.y, trimmed, icon);
      }
      close();
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!note || busy) return;
    setBusy(true);
    try {
      await deleteNote(note.id);
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="note-editor" role="dialog" aria-label="Notatka MG">
      <header className="note-editor-header">
        <strong>{note ? 'Notatka MG' : 'Nowa notatka MG'}</strong>
        <span className="note-editor-hint">widoczna tylko dla ciebie</span>
      </header>
      <div className="note-editor-icons" role="group" aria-label="Ikona pinezki">
        {NOTE_ICONS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`note-icon${icon === candidate ? ' note-icon--active' : ''}`}
            aria-pressed={icon === candidate}
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
        autoFocus
        placeholder="Co tu jest ukryte, co się stanie, kogo tu spotkają…"
        onChange={(event) => setText(event.target.value)}
      />
      <footer className="note-editor-actions">
        {note && (
          <button
            type="button"
            className="small-button small-button--danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            Usuń
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="small-button" disabled={busy} onClick={close}>
          Anuluj
        </button>
        <button
          type="button"
          className="small-button small-button--on"
          disabled={busy || text.trim().length === 0}
          onClick={() => void save()}
        >
          Zapisz
        </button>
      </footer>
    </div>
  );
}
