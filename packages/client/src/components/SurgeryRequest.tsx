import { useState } from 'react';
import type { ChatMessageView, SurgeryRequestEntry } from '@vtt/shared';
import {
  EDDIES_MAX,
  ROLE_GM,
  isSurgeryOpen,
  isSurgeryQuoted,
  mayPatientAnswer,
  maySurgeonAnswer,
  surgeryHeadline,
  surgeryNeedsApproval,
  surgeryResolutionLabel,
} from '@vtt/shared';
import { respondSurgery, surgeryErrorText } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { noteAck } from '../notices.js';
import { formatEd } from './exchange/items.js';

/**
 * Karta prośby o operację u Medyka innego gracza (#41, 30.09.2026).
 *
 * Pacjent prosi, Medyk wpisuje cenę — pole startuje od ceny domyślnej (tej
 * z guzika w Kompendium), którą pacjent widział, prosząc. Cena nie wyższa
 * operuje od razu, wyższa wraca do pacjenta z „Zgadzam się". Test montażu
 * i Utrata Człowieczeństwa lądują potem jako zwykłe karty rzutów. MG widzi
 * guziki obu stron, bo może odpowiedzieć za każdą — wzorem przekazania z 38b.
 */
export function SurgeryRequestRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: SurgeryRequestEntry;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [price, setPrice] = useState(String(entry.defaultPrice));
  const [busy, setBusy] = useState(false);

  const open = isSurgeryOpen(entry);
  const quoted = isSurgeryQuoted(entry);
  const surgeonSide = maySurgeonAnswer(entry, userId, isGm);
  const patientSide = mayPatientAnswer(entry, userId, isGm);
  const resolution = entry.resolution;

  const parsed = Number.parseInt(price, 10);
  const validPrice =
    /^\d+$/.test(price.trim()) && Number.isInteger(parsed) && parsed >= 0 && parsed <= EDDIES_MAX;
  const needsApproval = validPrice && surgeryNeedsApproval(entry, parsed);

  async function respond(action: 'operate' | 'approve' | 'decline' | 'cancel') {
    setBusy(true);
    const ack = await respondSurgery({
      messageId: message.id,
      action,
      ...(action === 'operate' ? { price: parsed } : {}),
    });
    setBusy(false);
    noteAck('character', ack, surgeryErrorText);
  }

  return (
    <div
      className={`chat-message chat-inventory${
        resolution && resolution.kind !== 'operated' ? ' chat-inventory--refused' : ''
      }`}
      data-testid="surgery-request"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">Prośba o operację</span>
        <span className="chat-roll-gm-label">{message.authorName}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">{surgeryHeadline(entry)}</span>
      </div>
      <ul className="chat-inventory-lines">
        <li>
          {entry.payment === 'installOnly' ? 'Znaleziony wszczep — sam montaż' : 'Nowy wszczep'}
          {entry.place ? ` · ${entry.place}` : ''} · PT {entry.dv}
        </li>
        <li>
          {entry.surgeonName}: Chirurgia {entry.surgery}
        </li>
        <li>Cena domyślna: {formatEd(entry.defaultPrice)}</li>
        {quoted && <li>Wycena Medyka: {formatEd(entry.quote ?? 0)} — czeka na zgodę pacjenta</li>}
      </ul>

      {resolution && (
        <span
          className={`chat-action-badge${
            resolution.kind === 'operated' ? ' chat-inventory-badge--done' : ''
          }`}
        >
          {surgeryResolutionLabel(entry)} — {resolution.byName}
        </span>
      )}

      {open && (
        <div className="chat-note-actions">
          {surgeonSide && !quoted && (
            <>
              <input
                type="number"
                className="chat-surgery-price"
                min={0}
                max={EDDIES_MAX}
                step={1}
                value={price}
                aria-label="Cena operacji w eurodolcach"
                title={`Cena domyślna: ${formatEd(entry.defaultPrice)}. Zero — operujesz za darmo; wyższą zatwierdza pacjent.`}
                onChange={(event) => setPrice(event.target.value)}
              />
              <button
                type="button"
                className="small-button"
                disabled={busy || !validPrice}
                title={
                  needsApproval
                    ? 'Cena wyższa od domyślnej — pacjent musi ją zatwierdzić'
                    : 'Test montażu rzuca się za twoją postać; pieniądze trafią na jej kartę'
                }
                onClick={() => void respond('operate')}
              >
                {needsApproval
                  ? `Wyceń na ${formatEd(parsed)}`
                  : `Operuję za ${validPrice ? formatEd(parsed) : '? ed'}`}
              </button>
            </>
          )}
          {surgeonSide && (
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Odmów operacji"
              onClick={() => void respond('decline')}
            >
              Odmawiam
            </button>
          )}
          {patientSide && quoted && (
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Zgoda na wycenę — Medyk operuje od razu"
              onClick={() => void respond('approve')}
            >
              Zgadzam się na {formatEd(entry.quote ?? 0)}
            </button>
          )}
          {patientSide && (
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title={quoted ? 'Odrzuć wycenę i zamknij prośbę' : 'Wycofaj prośbę'}
              onClick={() => void respond('cancel')}
            >
              {quoted ? 'Odrzucam' : 'Wycofaj'}
            </button>
          )}
          {!isGm && patientSide && !quoted && (
            <span className="chat-action-note">Czeka na Medyka.</span>
          )}
          {!isGm && surgeonSide && quoted && (
            <span className="chat-action-note">Czeka na pacjenta.</span>
          )}
        </div>
      )}
    </div>
  );
}
