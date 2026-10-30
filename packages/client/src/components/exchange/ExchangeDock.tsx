import { useState } from 'react';
import type { TradeView } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { noteAck } from '../../notices.js';
import { cancelTrade, respondTrade, tradeErrorText } from '../../socket.js';
import { useAuthStore } from '../../stores/authStore.js';
import { liveTradeKey, useExchangeStore } from '../../stores/exchangeStore.js';
import { formatEd } from './items.js';
import { openShop } from './open.js';

/**
 * Dok w prawym górnym rogu mapy (38c, od 46a dok okna „Wymiana”).
 *
 * Wszystko, co jest pytaniem „co się dzieje z moimi wymianami”: zaproszenie do
 * przyjęcia, handel zwinięty do rogu (okno zamknięte albo patrzące gdzie
 * indziej — negocjacje trwają) i **sklepy zdalne** („Sklepy (N)”, decyzja MG 9) — Fixer przez telefon albo
 * sklep sieciowy, bez figury na mapie. MG widzi tu każdy handel przy stole
 * (podgląd i przerwanie, bez zgody za gracza); sklepy prowadzi z karty NPC-a.
 *
 * Na ekranie „Między sesjami” dok stoi bez sklepów — tam są przyciskami.
 */

export function ExchangeDock({ withShops = true }: { withShops?: boolean }) {
  const trades = useExchangeStore((s) => s.trades);
  const selected = useExchangeStore((s) => s.window?.selected ?? null);
  const shops = useExchangeStore((s) => s.shops);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [shopsOpen, setShopsOpen] = useState(false);

  const rows = Object.values(trades).filter((trade) => liveTradeKey(trade.id) !== selected);
  const remote = withShops && !isGm ? shops.filter((shop) => shop.closed === undefined) : [];
  if (rows.length === 0 && remote.length === 0) return null;

  async function answer(trade: TradeView, accept: boolean, agree = false) {
    const ack = await respondTrade(trade.id, accept, agree ? trade.version : undefined);
    noteAck('exchange', ack, tradeErrorText);
    // Kliknięte „Przyjmij” otwiera okno handlu — także temu, kto właśnie
    // przeglądał półkę: tę decyzję podjął sam. Prezent, który przy zgodzie
    // z góry już się wymienił (64a), okna nie ma — `openTrade` go nie znajdzie.
    // Odmowa zgody (`TRADE_CHANGED`) zostawia handel przyjęty: okno pokaże zmianę.
    const accepted = ack.ok || (agree && ['TRADE_CHANGED', 'TRADE_EMPTY'].includes(ack.error));
    if (accept && accepted) useExchangeStore.getState().openTrade(trade.id);
  }

  async function stop(trade: TradeView) {
    const ack = await cancelTrade(trade.id);
    noteAck('exchange', ack, tradeErrorText);
  }

  return (
    <div className="trade-dock" aria-live="polite">
      {rows.map((trade) => {
        const [a, b] = trade.sides;
        const title = `${a.name} ⇄ ${b.name}`;
        if (trade.status === 'invited' && b.mine) {
          // Etap 64a: to, co zapraszający już położył, stoi w doku, a „Przyjmij”
          // przyjmuje zaproszenie razem ze zgodą — prezent to jedno kliknięcie.
          // „Negocjuj” przyjmuje bez zgody, żeby dołożyć coś od siebie.
          const gifts = [
            ...a.items.map((item) =>
              item.stackable && item.qty > 1 ? `${item.name} × ${item.qty}` : item.name,
            ),
            ...(a.eddies > 0 ? [formatEd(a.eddies)] : []),
          ];
          return (
            <div key={trade.id} className="trade-dock-row trade-dock-row--invite">
              <span className="trade-dock-text">
                <strong>{a.name}</strong> proponuje handel
                {isGm ? ` (${b.name})` : ''}
                {gifts.length > 0 && (
                  <span className="trade-dock-offer" data-testid="trade-dock-offer">
                    daje: {gifts.join(', ')}
                    {a.accepted && <span className="trade-consent--yes"> · ✔ zgoda</span>}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="small-button small-button--primary"
                title={
                  gifts.length > 0
                    ? `Bierzesz to, co daje ${a.name}, nic nie dając w zamian — ${
                        a.accepted
                          ? 'wymiana dzieje się od razu'
                          : `wymiana nastąpi, gdy ${a.name} też się zgodzi`
                      }`
                    : 'Przyjmij zaproszenie — otworzy się okno handlu'
                }
                onClick={() => void answer(trade, true, gifts.length > 0)}
              >
                Przyjmij
              </button>
              {gifts.length > 0 && (
                <button
                  type="button"
                  className="small-button"
                  title="Przyjmij zaproszenie bez zgody — dołożysz coś od siebie albo poprosisz o więcej"
                  onClick={() => void answer(trade, true)}
                >
                  Negocjuj
                </button>
              )}
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
              {a.mine && (
                <button
                  type="button"
                  className="small-button"
                  onClick={() => useExchangeStore.getState().openTrade(trade.id)}
                >
                  Otwórz
                </button>
              )}
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
              onClick={() => useExchangeStore.getState().openTrade(trade.id)}
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
      {remote.length > 0 && (
        <div className="trade-dock-row exchange-shops">
          <button
            type="button"
            className="small-button"
            aria-expanded={shopsOpen}
            title="Sklepy, do których nie trzeba podchodzić — zdalne albo przez telefon"
            onClick={() => setShopsOpen((open) => !open)}
          >
            🛒 Sklepy ({remote.length})
          </button>
          {shopsOpen && (
            <ul className="exchange-shop-list">
              {remote.map((shop) => (
                <li key={shop.id}>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => {
                      setShopsOpen(false);
                      openShop(shop.id);
                    }}
                  >
                    {shop.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
