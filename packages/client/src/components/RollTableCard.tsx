import type { ChatMessageView, RandomTableRollEntry, RandomTableRollStep } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { randomTableErrorText, rollRandomTableNow, showRandomTableRoll } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';

/**
 * Karta losowania z tabeli (etap 34).
 *
 * Kości są tu **nieomalowane** i to nie jest przeoczenie: rzut idzie z flagą
 * `plain` (patrz `shared/src/tables.ts`), bo dziesiątka w tabeli dziesięciu
 * wierszy znaczy „wiersz dziesiąty", a nie krytyk — zielona kropka byłaby
 * kłamstwem. Ta sama zasada, co przy rzutach kreatora postaci z 27d.
 *
 * Przyciski widzi wyłącznie MG i wyłącznie na cichej karcie (`gmrolltable`):
 * „Pokaż stołowi" **dokłada** publiczny wiersz z tym samym wynikiem, więc na
 * karcie już pokazanej nie ma czego pokazywać drugi raz.
 */
function StepDice({ step }: { step: RandomTableRollStep }) {
  const dice: number[] = [];
  let modifiers = false;
  for (const term of step.roll.terms) {
    if (term.kind === 'dice') dice.push(...term.rolls);
    else modifiers = true;
  }
  // Suma stoi obok kości tylko wtedy, gdy jest czym się różnić: przy `1d100`
  // „47 47" nie mówi nic dwa razy, a przy `2d6+1` dopiero ona jest wierszem.
  const showTotal = dice.length !== 1 || modifiers;
  return (
    <span className="chat-table-dice">
      {dice.map((value, index) => (
        <span key={index} className="chat-die" title={step.roll.notation}>
          {value}
        </span>
      ))}
      {showTotal ? <span className="chat-table-value">{step.value}</span> : null}
    </span>
  );
}

export function RollTableRow({
  message,
  entry,
}: {
  message: ChatMessageView;
  entry: RandomTableRollEntry;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const secret = message.kind === 'gmrolltable';

  async function reroll() {
    const ack = await rollRandomTableNow({
      id: entry.tableId,
      visibility: secret ? 'gm' : 'public',
    });
    if (!ack.ok) useChatStore.getState().addNote(randomTableErrorText(ack.error));
  }

  async function show() {
    const ack = await showRandomTableRoll(message.id);
    if (!ack.ok) useChatStore.getState().addNote(randomTableErrorText(ack.error));
  }

  return (
    <div
      className={`chat-message chat-table${secret ? ' chat-table--secret' : ''}`}
      data-testid="rolltable"
    >
      <div className="chat-message-meta">
        <span className="chat-message-author">🎲 {entry.tableName}</span>
        {secret ? <span className="chat-roll-gm-label">tylko MG</span> : null}
      </div>
      <ol className="chat-table-steps">
        {entry.steps.map((step, index) => (
          <li key={index} className="chat-table-step">
            {index > 0 ? <span className="chat-table-sub">↳ {step.tableName}</span> : null}
            <StepDice step={step} />
            {step.missing ? (
              <span className="chat-table-text chat-table-text--missing">
                Żaden wiersz nie odpowiada za tę liczbę — tabela ma dziurę w zakresach.
              </span>
            ) : (
              <span className="chat-table-text">{step.text}</span>
            )}
          </li>
        ))}
      </ol>
      {isGm && secret ? (
        <div className="chat-note-actions">
          <button type="button" className="small-button" onClick={() => void reroll()}>
            Losuj ponownie
          </button>
          {entry.shown ? (
            <span className="chat-table-shown">Pokazane stołowi</span>
          ) : (
            <button type="button" className="small-button" onClick={() => void show()}>
              Pokaż stołowi
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
