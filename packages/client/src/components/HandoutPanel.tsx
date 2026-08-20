import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ROLE_GM,
  type HandoutImage,
  type HandoutKind,
  type HandoutView,
  type ScreamsheetDraft,
  type ScreamsheetMeta,
} from '@vtt/shared';
import {
  DEFAULT_SCREAMSHEET_DATELINE,
  DEFAULT_SCREAMSHEET_OUTLET,
  HANDOUT_BODY_MAX_LENGTH,
  HANDOUT_TITLE_MAX_LENGTH,
  SCREAMSHEET_DATELINE_MAX_LENGTH,
  SCREAMSHEET_LEAD_MAX_LENGTH,
  SCREAMSHEET_OUTLET_MAX_LENGTH,
  SCREAMSHEET_TOPIC_MAX_LENGTH,
  handoutErrorText,
  markdownToPlainText,
  normalizeScreamsheetMeta,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { IconNewspaper } from './UiIcons.js';
import {
  cancelScreamsheet,
  deleteHandout,
  fetchHandouts,
  generateScreamsheet,
  saveHandout,
  shareHandout,
} from '../socket.js';
import { useAiStore } from '../stores/aiStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useHandoutStore } from '../stores/handoutStore.js';
import { useScreamsheetStore } from '../stores/screamsheetStore.js';
import { Markdown } from './Markdown.js';
import { Screamsheet } from './Screamsheet.js';

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
  // Przy gazecie zajawką jest lead: po to został napisany.
  const source =
    handout.kind === 'screamsheet' ? handout.screamsheet?.lead || handout.body : handout.body;
  const text = markdownToPlainText(source);
  if (text.length === 0) return handout.image ? 'sama grafika' : '';
  return text.length <= 90 ? text : `${text.slice(0, 90)}…`;
}

/**
 * Jedna ikona na rodzaj — gazeta odróżnia się od kartki na liście i w oknie.
 *
 * Gazeta jedzie jako SVG (etap 27e): 📰 rysowało się na Windowsie jednobarwnie
 * i nie przyjmowało koloru motywu. Pozostałe dwa emoji zostają — mają domyślną
 * prezentację emoji, więc są kolorowe w obu trybach.
 */
function HandoutIcon({ handout }: { handout: HandoutView }) {
  if (handout.kind === 'screamsheet') return <IconNewspaper />;
  return <span className="handout-row-glyph">{handout.image ? '🖼️' : '📄'}</span>;
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
                <HandoutIcon handout={handout} />
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
            <HandoutIcon handout={handout} />
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

/**
 * Generator brukowca (24c) — hasło MG i przycisk, który woła model.
 *
 * Wynik **wraca do formularza**, a nie do graczy: kryterium etapu mówi, że
 * między modelem a stołem stoi decyzja MG. Bez gatewaya przycisk jest
 * wyszarzony i mówi dlaczego — reszta formularza działa normalnie, więc
 * screamsheet da się napisać ręcznie.
 */
function ScreamsheetGenerator({
  outlet,
  onDraft,
}: {
  outlet: string;
  onDraft: (draft: ScreamsheetDraft) => void;
}) {
  const modelAvailable = useAiStore((s) => s.status.available);
  const busy = useScreamsheetStore((s) => s.busy);
  const draft = useScreamsheetStore((s) => s.draft);
  const error = useScreamsheetStore((s) => s.error);
  const totalMs = useScreamsheetStore((s) => s.totalMs);
  const takeDraft = useScreamsheetStore((s) => s.takeDraft);
  const [topic, setTopic] = useState('');

  // Gotowy artykuł przepisuje się do pól formularza raz — dalej to już tekst
  // MG, który może go dowolnie poprawić przed zapisem.
  useEffect(() => {
    if (!draft) return;
    onDraft(draft);
    takeDraft();
  }, [draft, onDraft, takeDraft]);

  useEffect(() => () => useScreamsheetStore.getState().reset(), []);

  return (
    <div className="bot-field screamsheet-generator">
      <span className="auth-label">Napisz to za mnie</span>
      <div className="bot-row-inline">
        <input
          type="text"
          className="screamsheet-topic"
          maxLength={SCREAMSHEET_TOPIC_MAX_LENGTH}
          value={topic}
          placeholder="np. strzelanina w Kabuki"
          disabled={busy}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Formularz zapisuje handout — hasło ma wołać model, nie zapis.
            event.preventDefault();
            if (!busy && topic.trim().length > 0 && modelAvailable) {
              void generateScreamsheet(topic, outlet);
            }
          }}
        />
        {busy ? (
          <button type="button" className="small-button" onClick={cancelScreamsheet}>
            Przerwij
          </button>
        ) : (
          <button
            type="button"
            className="small-button"
            disabled={topic.trim().length === 0 || !modelAvailable}
            title={
              modelAvailable
                ? 'Model napisze nagłówek, lead i treść'
                : 'AI Gateway nie odpowiada — wypełnij szablon ręcznie'
            }
            onClick={() => void generateScreamsheet(topic, outlet)}
          >
            ✨ Napisz artykuł
          </button>
        )}
      </div>
      {busy && <span className="bot-hint">Redakcja pisze… (zwykle kilkanaście sekund)</span>}
      {!busy && !modelAvailable && (
        <span className="bot-hint">
          Generator jest niedostępny — AI Gateway nie odpowiada. Szablon wypełnisz ręcznie.
        </span>
      )}
      {!busy && totalMs !== null && (
        <span className="bot-hint">Artykuł napisany w {(totalMs / 1000).toFixed(1)} s.</span>
      )}
      {error && <span className="auth-error">{error}</span>}
    </div>
  );
}

function HandoutForm({
  handout,
  kind,
  onClose,
}: {
  handout: HandoutView | null;
  kind: HandoutKind;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(handout?.title ?? '');
  const [body, setBody] = useState(handout?.body ?? '');
  const [image, setImage] = useState<HandoutImage | null>(handout?.image ?? null);
  const [meta, setMeta] = useState<ScreamsheetMeta>(
    () => handout?.screamsheet ?? normalizeScreamsheetMeta({}),
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isScreamsheet = kind === 'screamsheet';

  const takeDraft = useCallback((draft: ScreamsheetDraft) => {
    if (draft.headline.length > 0) setTitle(draft.headline.slice(0, HANDOUT_TITLE_MAX_LENGTH));
    setMeta((current) => ({ ...current, lead: draft.lead }));
    if (draft.body.length > 0) setBody(draft.body);
  }, []);

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
      kind,
      screamsheet: isScreamsheet ? meta : null,
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
      {isScreamsheet && <ScreamsheetGenerator outlet={meta.outlet} onDraft={takeDraft} />}

      <label className="bot-field">
        <span className="auth-label">{isScreamsheet ? 'Nagłówek' : 'Tytuł'}</span>
        <input
          type="text"
          autoFocus
          maxLength={HANDOUT_TITLE_MAX_LENGTH}
          value={title}
          placeholder={isScreamsheet ? 'np. Krwawa noc w Kabuki' : 'np. Mapa Kabuki'}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      {isScreamsheet && (
        <>
          <label className="bot-field">
            <span className="auth-label">Lead</span>
            <textarea
              rows={2}
              maxLength={SCREAMSHEET_LEAD_MAX_LENGTH}
              value={meta.lead}
              placeholder="Jedno–dwa zdania, które streszczają całą sprawę."
              onChange={(event) => setMeta({ ...meta, lead: event.target.value })}
            />
          </label>
          <div className="bot-row-inline screamsheet-furniture">
            <label className="bot-field">
              <span className="auth-label">Brukowiec</span>
              <input
                type="text"
                maxLength={SCREAMSHEET_OUTLET_MAX_LENGTH}
                value={meta.outlet}
                placeholder={DEFAULT_SCREAMSHEET_OUTLET}
                onChange={(event) => setMeta({ ...meta, outlet: event.target.value })}
              />
            </label>
            <label className="bot-field">
              <span className="auth-label">Data w stopce</span>
              <input
                type="text"
                maxLength={SCREAMSHEET_DATELINE_MAX_LENGTH}
                value={meta.dateline}
                placeholder={DEFAULT_SCREAMSHEET_DATELINE}
                onChange={(event) => setMeta({ ...meta, dateline: event.target.value })}
              />
            </label>
          </div>
        </>
      )}

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
        <span className="auth-label">{isScreamsheet ? 'Treść artykułu' : 'Treść'}</span>
        <textarea
          rows={10}
          maxLength={HANDOUT_BODY_MAX_LENGTH}
          value={body}
          placeholder={
            isScreamsheet
              ? 'Dwa–cztery krótkie akapity. Znaczniki markdownu działają tak samo jak w notatce.'
              : '## Nagłówek\n\nTekst z **pogrubieniem**, *kursywą* i listą:\n\n- punkt'
          }
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
          {isScreamsheet ? (
            // Ten sam komponent, który zobaczy gracz — podgląd nie jest
            // przybliżeniem gazety, tylko gazetą.
            <Screamsheet
              title={title}
              body={body}
              image={image}
              meta={normalizeScreamsheetMeta(meta)}
            />
          ) : (
            <Markdown source={body} />
          )}
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
    const handout =
      editing === 'new' || editing === 'new-screamsheet' ? null : (handouts[editing] ?? null);
    // Rodzaj istniejącego handoutu jest jego własnością; nowy bierze go
    // z przycisku, którym MG otworzył formularz.
    const kind: HandoutKind =
      handout?.kind ?? (editing === 'new-screamsheet' ? 'screamsheet' : 'note');
    return (
      <section className="handout-panel">
        <HandoutForm handout={handout} kind={kind} onClose={() => setEditing(null)} />
      </section>
    );
  }

  return (
    <section className="handout-panel">
      <div className="compendium-head">
        <button type="button" className="small-button" onClick={() => setEditing('new')}>
          + Nowy handout
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => setEditing('new-screamsheet')}
          title="Zajawka w stylu brukowca Night City — treść może napisać model"
        >
          <IconNewspaper /> + Screamsheet
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
