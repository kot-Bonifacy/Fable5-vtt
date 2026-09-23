import { useEffect, useState } from 'react';
import type { TradeView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { cancelTrade, respondTrade, tradeErrorText } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useTradeStore } from '../stores/tradeStore.js';

/**
 * Dok handli w prawym górnym rogu mapy (etap 38c).
 *
 * Trzy rzeczy w jednym miejscu, bo wszystkie są tym samym pytaniem „co się
 * dzieje z moimi handlami": zaproszenie do przyjęcia, handel zwinięty do rogu
 * (okno zamknięte krzyżykiem, negocjacje trwają) i ślad po handlu, który
 * właśnie się skończył. MG widzi tu każdy handel przy stole — rozstrzygnięcie
 * z 23.09: podgląd i przerwanie, bez zgody za gracza.
 */

/** Jak długo wisi informacja o zakończonym handlu. */
const CLOSED_NOTE_MS = 6000;

export function TradeDock() {
  const trades = useTradeStore((s) => s.trades);
  const openId = useTradeStore((s) => s.openId);
  const lastClosed = useTradeStore((s) => s.lastClosed);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lastClosed) return;
    const timer = setTimeout(() => useTradeStore.getState().dismissClosed(), CLOSED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [lastClosed]);

  const rows = Object.values(trades).filter((trade) => trade.id !== openId);
  if (rows.length === 0 && !lastClosed && !error) return null;

  async function answer(trade: TradeView, accept: boolean) {
    const ack = await respondTrade(trade.id, accept);
    setError(ack.ok ? null : tradeErrorText(ack.error));
  }

  async function stop(trade: TradeView) {
    const ack = await cancelTrade(trade.id);
    setError(ack.ok ? null : tradeErrorText(ack.error));
  }

  return (
    <div className="trade-dock" aria-live="polite">
      {rows.map((trade) => {
        const [a, b] = trade.sides;
        const title = `${a.name} ⇄ ${b.name}`;
        if (trade.status === 'invited' && b.mine) {
          return (
            <div key={trade.id} className="trade-dock-row trade-dock-row--invite">
              <span className="trade-dock-text">
                <strong>{a.name}</strong> proponuje handel
                {isGm ? ` (${b.name})` : ''}
              </span>
              <button
                type="button"
                className="small-button small-button--primary"
                onClick={() => void answer(trade, true)}
              >
                Przyjmij
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => void answer(trade, false)}
              >
                Odrzuć
              </button>
            </div>
          );
        }
        if (trade.status === 'invited') {
          return (
            <div key={trade.id} className="trade-dock-row">
              <span className="trade-dock-text">
                {a.mine ? `Czekasz, aż ${b.name} przyjmie handel` : `Zaproszenie: ${title}`}
              </span>
              <button type="button" className="small-button" onClick={() => void stop(trade)}>
                {a.mine ? 'Wycofaj' : 'Przerwij'}
              </button>
            </div>
          );
        }
        const agreed = trade.sides.filter((side) => side.accepted).length;
        return (
          <div key={trade.id} className="trade-dock-row">
            <span className="trade-dock-text">
              Handel: {title}
              <span className="trade-dock-meta"> · zgody {agreed}/2</span>
            </span>
            <button
              type="button"
              className="small-button"
              onClick={() => useTradeStore.getState().open(trade.id)}
            >
              {trade.sides.some((side) => side.mine) ? 'Otwórz' : 'Podgląd'}
            </button>
            {isGm && !trade.sides.some((side) => side.mine) && (
              <button type="button" className="small-button" onClick={() => void stop(trade)}>
                Przerwij
              </button>
            )}
          </div>
        );
      })}
      {lastClosed && (
        <div className="trade-dock-row trade-dock-row--closed">
          <span className="trade-dock-text">
            {lastClosed.status === 'done'
              ? `Wymienione: ${lastClosed.sides[0].name} ⇄ ${lastClosed.sides[1].name}`
              : `Handel przerwany${lastClosed.closedBy ? ` — ${lastClosed.closedBy}` : ''}`}
            {lastClosed.status === 'cancelled' && lastClosed.notice
              ? ` (${tradeErrorText(lastClosed.notice)})`
              : ''}
          </span>
          <button
            type="button"
            className="sheet-close"
            title="Zamknij"
            aria-label="Zamknij informację o handlu"
            onClick={() => useTradeStore.getState().dismissClosed()}
          >
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="trade-dock-row trade-dock-row--closed">
          <span className="trade-dock-text">{error}</span>
          <button
            type="button"
            className="sheet-close"
            title="Zamknij"
            aria-label="Zamknij komunikat"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
