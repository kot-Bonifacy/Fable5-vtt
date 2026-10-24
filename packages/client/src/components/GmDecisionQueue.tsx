import type { ComponentType, ReactNode } from 'react';
import { isCheckRequestOpen } from '@vtt/shared';
import { gmDecisionQueue, type GmAttentionItem, type GmAttentionKind } from '../gm-attention.js';
import { useChatStore } from '../stores/chatStore.js';
import { useGmAttentionStore } from '../stores/gmAttentionStore.js';
import { CheckRequestDecision, CheckRequestSummary } from './CheckRequest.js';

/**
 * Panel decyzji MG (24.10, zlecenie MG): sprawa, którą MG rozstrzyga jednym
 * kliknięciem, wyskakuje sama w prawym górnym rogu mapy, w miejscu kafla
 * „Czeka na MG”, i stoi, dopóki MG jej nie rozstrzygnie albo nie odłoży.
 *
 * Panel jest **niemodalny** — mapa i czat dalej działają — i leży pod
 * `.dialog-backdrop`, więc przy otwartym oknie (np. „Ustaw…”) czeka pod nim.
 * Naraz stoi jedna sprawa, reszta czeka w kolejce z licznikiem. „✕” odkłada:
 * sprawa zostaje na czacie i na liście „Czeka na MG”, ale panel już jej sam
 * nie pokaże.
 *
 * To wzorzec dla każdej szybkiej decyzji MG: nowy rodzaj dopisuje się
 * w `GM_DECISION_KINDS` (`gm-attention.ts`) i tutaj w `GM_DECISION_BODIES`,
 * a treść składa z tych samych komponentów, co karta czatu — rama, kolejka
 * i odkładanie są wspólne.
 */
export function GmDecisionQueue({ items }: { items: readonly GmAttentionItem[] }) {
  const keys = useGmAttentionStore((s) => s.decisions);
  const setAside = useGmAttentionStore((s) => s.setAside);
  const queue = gmDecisionQueue(keys, items);
  const item = queue[0];
  if (!item) return null;
  const Body = GM_DECISION_BODIES[item.kind];
  if (!Body) return null;
  return (
    <GmDecisionPanel
      key={item.key}
      title={GM_DECISION_TITLES[item.kind] ?? 'Czeka na MG'}
      waiting={queue.length - 1}
      onSetAside={() => setAside(item.key)}
    >
      <Body item={item} />
    </GmDecisionPanel>
  );
}

/** Rama panelu: tytuł, licznik kolejki i „✕”, które odkłada sprawę. */
export function GmDecisionPanel({
  title,
  waiting,
  onSetAside,
  children,
}: {
  title: string;
  waiting: number;
  onSetAside: () => void;
  children: ReactNode;
}) {
  return (
    <section className="gm-decision" aria-label={title} data-testid="gm-decision">
      <div className="gm-decision-head">
        <p className="gm-decision-title">{title}</p>
        {waiting > 0 && (
          <span className="gm-decision-waiting" title="Kolejne sprawy wejdą po tej">
            +{waiting} czeka
          </span>
        )}
        <button
          type="button"
          className="notice-close"
          title="Odłóż — sprawa zostaje na czacie i w „Czeka na MG”"
          aria-label="Odłóż"
          onClick={onSetAside}
        >
          ✕
        </button>
      </div>
      {children}
    </section>
  );
}

const GM_DECISION_TITLES: Partial<Record<GmAttentionKind, string>> = {
  request: 'Prośba o Test',
};

/** Prośba o Test i o oględziny (etap 40, 41) — to samo, co na karcie czatu. */
function CheckRequestBody({ item }: { item: GmAttentionItem }) {
  const message = useChatStore((s) =>
    s.items.find((row) => row.type === 'message' && row.message.id === item.messageId),
  );
  const entry = message?.type === 'message' ? message.message.request : undefined;
  if (!entry || !isCheckRequestOpen(entry) || item.messageId === undefined) return null;
  return (
    <>
      <p className="gm-decision-who">{entry.askedByName}</p>
      <CheckRequestSummary entry={entry} />
      <CheckRequestDecision messageId={item.messageId} entry={entry} />
    </>
  );
}

const GM_DECISION_BODIES: Partial<
  Record<GmAttentionKind, ComponentType<{ item: GmAttentionItem }>>
> = {
  request: CheckRequestBody,
};
