import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ROLE_GM, type HandoutImage, type HandoutView } from '@vtt/shared';
import {
  HANDOUT_BODY_MAX_LENGTH,
  HANDOUT_TITLE_MAX_LENGTH,
  handoutErrorText,
  markdownToPlainText,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { deleteHandout, fetchHandouts, saveHandout, shareHandout } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useHandoutStore } from '../stores/handoutStore.js';
import { Markdown } from './Markdown.js';

/**
 * Zakładka „Handouty" (etap 24a) — jedna dla całego stołu, dwa różne widoki.
 *
 * MG widzi listę wszystkich materiałów z odbiorcami i edytorem; gracz widzi
 * wyłącznie to, co dostał, jako listę do otwarcia. Nie ma tu gałęzi
 * „ukryj u gracza" — u gracza tych handoutów po prostu nie ma, bo serwer ich
 * nie wysłał.
 */

function uploadErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  switch (code) {
    case 'FILE_TOO_LARGE':
      return 'Plik jest za duży (limit 12 MB).';
    case 'UNSUPPORTED_IMAGE':
      return 'Nieobsługiwany format — użyj PNG, JPG lub WebP.';
    case 'IMAGE_TOO_LARGE':
      return 'Obraz jest za duży (maks. 4096 px na bok).';
    default:
      return 'Nie udało się wgrać grafiki.';
  }
}

/** Pierwsze zdanie treści — na liście, gdzie nie ma miejsca na formatowanie. */
function excerpt(handout: HandoutView): string {
  const text = markdownToPlainText(handout.body);
  if (text.length === 0) return handout.image ? 'sama grafika' : '';
  return text.length <= 90 ? text : `${text.slice(0, 90)}…`;
}

// ---------------------------------------------------------------------------
// Widok gracza
// ---------------------------------------------------------------------------

function PlayerList() {
  const handouts = useHandoutStore((s) => s.handouts);
  const order = useHandoutStore((s) => s.order);
  const loaded = useHandoutStore((s) => s.loaded);
  const openHandout = useHandoutStore((s) => s.openHandout);

  if (order.length === 0) {
    return (
      <p className="placeholder-text">
        {loaded ? 'Mistrz Gry nie dał ci jeszcze żadnego materiału.' : 'Wczytuję…'}
      </p>
    );
  }

  return (
    <ul className="handout-list">
      {order.map((id) => {
        const handout = handouts[id];
        if (!handout) return null;
        return (
          <li key={id} className="handout-row">
            <button
              type="button"
              className="handout-open"
              onClick={() => openHandout(id)}
              title="Otwórz handout"
            >
              <span className="handout-row-title">
                {handout.image ? '🖼 ' : '📄 '}
                {handout.title}
              </span>
              <span className="handout-row-excerpt">{excerpt(handout)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Widok MG
// ---------------------------------------------------------------------------

function ShareControls({ handout }: { handout: HandoutView }) {
  const recipients = useHandoutStore((s) => s.recipients);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = useMemo(() => new Set(handout.sharedWith ?? []), [handout.sharedWith]);

  async function setShare(userIds: string[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await shareHandout(handout.id, userIds);
    setBusy(false);
    if (!ack.ok) setError(handoutErrorText(ack.error));
  }

  function toggle(userId: string) {
    const next = shared.has(userId)
      ? [...shared].filter((id) => id !== userId)
      : [...shared, userId];
    void setShare(next);
  }

  if (recipients.length === 0) {
    return <p className="bot-hint">Nikt jeszcze nie dołączył do kampanii — nie ma komu dać.</p>;
  }

  return (
    <div className="handout-share">
      <span className="handout-share-label">Widzą:</span>
      {recipients.map((recipient) => (
        <button
          key={recipient.userId}
          type="button"
          className={`handout-chip ${shared.has(recipient.userId) ? 'handout-chip--on' : ''}`}
          disabled={busy}
          onClick={() => toggle(recipient.userId)}
          title={
            shared.has(recipient.userId)
              ? `Cofnij udostępnienie: ${recipient.name}`
              : `Udostępnij: ${recipient.name}`
          }
        >
          {recipient.name}
        </button>
      ))}
      <button
        type="button"
        className="small-button"
        disabled={busy || recipients.length === shared.size}
        onClick={() => void setShare(recipients.map((recipient) => recipient.userId))}
        title="Udostępnij wszystkim graczom"
      >
        Wszystkim
      </button>
      {shared.size > 0 && (
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={() => void setShare([])}
          title="Cofnij wszystkie udostępnienia"
        >
          Nikomu
        </button>
      )}
      {error && <span className="auth-error">{error}</span>}
    </div>
  );
}

function GmRow({ handout, onEdit }: { handout: HandoutView; onEdit: () => void }) {
  const openHandout = useHandoutStore((s) => s.openHandout);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="handout-row handout-row--gm">
      <div className="handout-row-head">
        <button
          type="button"
          className="handout-open"
          onClick={() => openHandout(handout.id)}
          title="Podejrzyj handout"
        >
          <span className="handout-row-title">
            {handout.image ? '🖼 ' : '📄 '}
            {handout.title}
          </span>
          <span className="handout-row-excerpt">{excerpt(handout)}</span>
        </button>
        <div className="handout-row-actions">
          <button type="button" className="small-button" onClick={onEdit} title="Edytuj handout">
            ✎
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                className="small-button character-delete"
                onClick={() => void deleteHandout(handout.id)}
              >
                Tak, usuń
              </button>
              <button type="button" className="small-button" onClick={() => setConfirming(false)}>
                Anuluj
              </button>
            </>
          ) : (
            <button
              type="button"
              className="small-button character-delete"
              onClick={() => setConfirming(true)}
              title="Usuń handout (zniknie też graczom)"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <ShareControls handout={handout} />
    </li>
  );
}

function HandoutForm({ handout, onClose }: { handout: HandoutView | null; onClose: () => void }) {
  const [title, setTitle] = useState(handout?.title ?? '');
  const [body, setBody] = useState(handout?.body ?? '');
  const [image, setImage] = useState<HandoutImage | null>(handout?.image ?? null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setImage(await apiUpload<HandoutImage>('/api/uploads/handouts', file));
    } catch (uploadError) {
      setError(uploadErrorText(uploadError));
    }
    setBusy(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const ack = await saveHandout({
      ...(handout ? { id: handout.id } : {}),
      title,
      body,
      image,
    });
    setBusy(false);
    if (!ack.ok) {
      setError(handoutErrorText(ack.error));
      return;
    }
    onClose();
  }

  return (
    <form className="bot-form handout-form" onSubmit={(event) => void submit(event)}>
      <label className="bot-field">
        <span className="auth-label">Tytuł</span>
        <input
          type="text"
          autoFocus
          maxLength={HANDOUT_TITLE_MAX_LENGTH}
          value={title}
          placeholder="np. Mapa Kabuki"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="bot-field">
        <span className="auth-label">Grafika</span>
        {image ? (
          <div className="handout-image-picked">
            <img className="handout-image-thumb" src={image.url} alt="" />
            <span className="bot-hint">
              {image.width} × {image.height} px
            </span>
            <button type="button" className="small-button" onClick={() => setImage(null)}>
              Usuń grafikę
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => void pickImage(event.target.files?.[0])}
          />
        )}
      </div>

      <label className="bot-field">
        <span className="auth-label">Treść</span>
        <textarea
          rows={10}
          maxLength={HANDOUT_BODY_MAX_LENGTH}
          value={body}
          placeholder={'## Nagłówek\n\nTekst z **pogrubieniem**, *kursywą* i listą:\n\n- punkt'}
          onChange={(event) => setBody(event.target.value)}
        />
        <span className="bot-hint">
          Markdown: <code>#</code> nagłówek, <code>**mocno**</code>, <code>*kursywa*</code>,{' '}
          <code>-</code> lista, <code>&gt;</code> cytat, <code>---</code> linia. Znaczniki HTML
          zostają tekstem. {body.length} / {HANDOUT_BODY_MAX_LENGTH} znaków
        </span>
      </label>

      <div className="bot-row-inline">
        <button type="button" className="small-button" onClick={() => setPreview(!preview)}>
          {preview ? 'Ukryj podgląd' : 'Podgląd'}
        </button>
      </div>
      {preview && (
        <div className="handout-preview">
          <Markdown source={body} />
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}
      <div className="bot-row-inline">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Zapisuję…' : handout ? 'Zapisz zmiany' : 'Dodaj handout'}
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Anuluj
        </button>
      </div>
      {!handout && (
        <p className="bot-hint">
          Zapisany handout jeszcze nikogo nie wyskoczy — odbiorców zaznacza się na liście.
        </p>
      )}
    </form>
  );
}

export function HandoutPanel() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const handouts = useHandoutStore((s) => s.handouts);
  const order = useHandoutStore((s) => s.order);
  const loaded = useHandoutStore((s) => s.loaded);
  const editing = useHandoutStore((s) => s.editing);
  const setEditing = useHandoutStore((s) => s.setEditing);

  useEffect(() => {
    void fetchHandouts();
  }, []);

  if (!isGm) {
    return (
      <section className="handout-panel">
        <PlayerList />
      </section>
    );
  }

  if (editing) {
    const handout = editing === 'new' ? null : (handouts[editing] ?? null);
    return (
      <section className="handout-panel">
        <HandoutForm handout={handout} onClose={() => setEditing(null)} />
      </section>
    );
  }

  return (
    <section className="handout-panel">
      <div className="compendium-head">
        <button type="button" className="small-button" onClick={() => setEditing('new')}>
          + Nowy handout
        </button>
      </div>
      <ul className="handout-list">
        {order.length === 0 ? (
          <li className="placeholder-text">
            {loaded
              ? 'Brak handoutów. Wgraj mapę dzielnicy albo napisz notatkę od fixera i daj ją drużynie.'
              : 'Wczytuję…'}
          </li>
        ) : (
          order.map((id) => {
            const handout = handouts[id];
            if (!handout) return null;
            return <GmRow key={id} handout={handout} onEdit={() => setEditing(id)} />;
          })
        )}
      </ul>
    </section>
  );
}
