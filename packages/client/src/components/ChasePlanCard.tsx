import type { ChasePlanAnswer, ChasePlanLogEntry, ChatMessageView } from '@vtt/shared';
import { CHASE_PLAN_KIND_LABELS } from '@vtt/shared';
import { notifyRefusal } from '../notices.js';
import { answerChasePlan } from '../socket.js';
import { chaseErrorText } from './ChaseVehicleMenu.js';

/**
 * Karta „Plan rundy N” (etap 72f3): zdarzenie z planu rund pościgu, o które
 * serwer pyta MG na początku rundy. Wyłącznie dla MG — graczom nie jedzie ani
 * na żywo, ani w historii. Runda przy tym nie stoi (decyzja MG z 21.11):
 * karta czeka w panelu decyzji, aż MG wybierze „Wypuść”, „Pomiń” albo
 * „Odłóż o rundę”.
 */
export function ChasePlanRowCard({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: ChasePlanLogEntry;
}) {
  const waiting = entry.status === 'waiting';
  return (
    <div
      className={`chat-message chat-plan${entry.status === 'cancelled' ? ' chat-check--cancelled' : ''}`}
      data-testid="chase-plan"
      data-status={entry.status}
      data-entry-id={entry.entryId}
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">{chasePlanCardTitle(entry)}</span>
        <span className="chat-action-badge" title="Plan rund widzi tylko MG">
          tylko MG
        </span>
      </div>
      <ChasePlanSummary entry={entry} />
      {!waiting && <span className="chat-action-badge">{chasePlanOutcome(entry)}</span>}
      {waiting && <ChasePlanDecision messageId={message.id} entry={entry} />}
    </div>
  );
}

export function chasePlanCardTitle(entry: Pick<ChasePlanLogEntry, 'round' | 'kind'>): string {
  return `Plan rundy ${entry.round}: ${CHASE_PLAN_KIND_LABELS[entry.kind].toLowerCase()}`;
}

/** Co się stanie i dopisek MG — to samo na karcie czatu i w panelu decyzji. */
export function ChasePlanSummary({ entry }: { entry: ChasePlanLogEntry }) {
  // Tytuł zaczyna się rodzajem („Posiłki: …”) — nagłówek karty już go mówi.
  const body = entry.title.replace(/^[^:]+:\s*/, '');
  return (
    <>
      <p className="chat-plan-what">{body}</p>
      {entry.text && <p className="chat-plan-text">{entry.text}</p>}
    </>
  );
}

function chasePlanOutcome(entry: ChasePlanLogEntry): string {
  const by = entry.byName ? ` (${entry.byName})` : '';
  switch (entry.status) {
    case 'released':
      return entry.kind === 'note' ? `Zrobione${by}` : `Wypuszczone${by}`;
    case 'skipped':
      return `Pominięte${by}`;
    case 'deferred':
      return `Odłożone na rundę ${entry.deferredTo ?? entry.round + 1}${by}`;
    case 'cancelled':
      return 'Przerwane — walka się skończyła';
    case 'waiting':
      return '';
  }
}

const ANSWERS: {
  id: ChasePlanAnswer;
  label: (entry: ChasePlanLogEntry) => string;
  hint: string;
}[] = [
  {
    id: 'release',
    label: (entry) => (entry.kind === 'note' ? 'Zrobione' : 'Wypuść'),
    hint: 'Zdarzenie dzieje się teraz — tak, jakby MG zrobił to z okna „Pościg”.',
  },
  {
    id: 'defer',
    label: () => 'Odłóż o rundę',
    hint: 'Serwer zapyta znowu na początku następnej rundy.',
  },
  {
    id: 'skip',
    label: () => 'Pomiń',
    hint: 'Zdarzenie nie nastąpi w tej walce.',
  },
];

/** „Wypuść / Odłóż o rundę / Pomiń” — karta czatu, panel decyzji i okno „Pościg”. */
export function ChasePlanDecision({
  messageId,
  entry,
}: {
  messageId: number;
  entry: ChasePlanLogEntry;
}) {
  return (
    <div className="chat-note-actions">
      {ANSWERS.map((answer) => (
        <button
          key={answer.id}
          type="button"
          className="small-button"
          data-plan-answer={answer.id}
          title={answer.hint}
          onClick={async () => {
            const ack = await answerChasePlan(messageId, answer.id);
            if (!ack.ok) notifyRefusal('chase', chaseErrorText(ack.error));
          }}
        >
          {answer.label(entry)}
        </button>
      ))}
    </div>
  );
}
