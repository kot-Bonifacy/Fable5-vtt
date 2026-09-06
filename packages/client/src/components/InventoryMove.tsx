import type { ChatMessageView, InventoryMoveEntry } from '@vtt/shared';
import {
  INVENTORY_MOVE_TITLES,
  ROLE_GM,
  inventoryMoveHeadline,
  inventoryResolutionLabel,
  isInventoryMoveOpen,
  mayAnswerInventoryMove,
  mayCancelInventoryMove,
} from '@vtt/shared';
import { inventoryErrorText, respondInventory } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';

/**
 * Karta przekazania i łupu (etap 38b).
 *
 * Dwie karty w jednym komponencie, bo różni je jedno zdanie: łup jest już
 * rozliczony w chwili, gdy staje na czacie (nie ma kogo pytać o zgodę), a
 * przekazanie czeka na „Przyjmij" odbiorcy — decyzja MG z 05.09.2026. Guziki
 * dostaje ten, kto ma prawo kliknąć: odbiorca przyjmuje albo odrzuca,
 * wysyłający wycofuje, MG może jedno i drugie.
 *
 * Skutków tu nie ma i mieć nie będzie: karta mówi, co pojechało, a co się z tym
 * dalej stanie, rozstrzyga stół — ta sama zasada, którą wezwanie do Testu
 * dostało w etapie 32.
 */
export function InventoryMoveRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: InventoryMoveEntry;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);

  const open = isInventoryMoveOpen(entry);
  const mayAnswer = mayAnswerInventoryMove(entry, userId, isGm);
  const mayCancel = mayCancelInventoryMove(entry, userId, isGm, message.authorId);
  const resolution = entry.resolution;

  async function respond(accept: boolean) {
    const ack = await respondInventory(message.id, accept);
    if (!ack.ok) useChatStore.getState().addNote(inventoryErrorText(ack.error));
  }

  return (
    <div
      className={`chat-message chat-inventory${
        resolution && resolution.kind !== 'accepted' ? ' chat-inventory--refused' : ''
      }`}
      data-testid="inventory-move"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">{INVENTORY_MOVE_TITLES[entry.kind]}</span>
        <span className="chat-roll-gm-label">{entry.actorName}</span>
      </div>
      <div className="chat-action-body">
        <span className="chat-action-name">{inventoryMoveHeadline(entry)}</span>
      </div>
      <ul className="chat-inventory-lines">
        {entry.lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
      {entry.note && <p className="chat-proposal-reason">„{entry.note}"</p>}

      {resolution && (
        <span
          className={`chat-action-badge${
            resolution.kind === 'accepted' ? ' chat-inventory-badge--done' : ''
          }`}
        >
          {inventoryResolutionLabel(entry)} — {resolution.byName}
        </span>
      )}

      {open && (
        <div className="chat-note-actions">
          {mayAnswer && (
            <button
              type="button"
              className="small-button"
              title="Przyjmij — pozycje wejdą na kartę"
              onClick={() => void respond(true)}
            >
              Przyjmij
            </button>
          )}
          {mayAnswer && (
            <button
              type="button"
              className="small-button"
              title="Odrzuć — nic nie zmieni karty"
              onClick={() => void respond(false)}
            >
              Odrzuć
            </button>
          )}
          {!mayAnswer && mayCancel && (
            <button
              type="button"
              className="small-button"
              title="Wycofaj propozycję"
              onClick={() => void respond(false)}
            >
              Wycofaj
            </button>
          )}
          {!mayAnswer && !mayCancel && <span className="chat-action-note">Czeka na odbiorcę.</span>}
        </div>
      )}
    </div>
  );
}
