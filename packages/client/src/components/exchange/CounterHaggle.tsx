import { useState } from 'react';
import type { CpredCharacterData } from '@vtt/shared';
import {
  CPRED_OPERATOR_ABILITY,
  cpredHaggleDeal,
  cpredHaggleDeals,
  cpredRoleAbilityRank,
} from '@vtt/shared';
import { clearNotices, notifyInfo } from '../../notices.js';
import { strikeHaggle } from '../../socket.js';
import { useCharacterStore } from '../../stores/characterStore.js';

/**
 * Targowanie się przy ladzie (etap 71e, G20; FIX-01, FIX-14).
 *
 * Druga strona to karta handlarza — sumę liczy serwer, gracz nic nie wpisuje.
 * Fixer wybiera targ z menu swoich Znajomości; kto Fixerem nie jest, rzuca
 * tylko u handlarza-Fixera, żeby ten nie urwał mu przy skupie (FAQ). Jeden
 * rzut u tego handlarza do najbliższej transakcji.
 */
export function CounterHaggle({
  anchorId,
  merchantId,
  merchantName,
  saleCut,
  blockedHint,
}: {
  anchorId: string;
  merchantId: string;
  merchantName: string;
  saleCut: number;
  blockedHint: string | null;
}) {
  const anchor = useCharacterStore((s) => s.characters[anchorId]);
  const registry = useCharacterStore((s) => s.registry);
  const data = anchor?.data as CpredCharacterData | undefined;
  const [dealId, setDealId] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const rank = cpredRoleAbilityRank(data, registry, CPRED_OPERATOR_ABILITY);
  const deals =
    rank === null
      ? []
      : cpredHaggleDeals(rank).filter((deal) => !(deal.id === 'halfLater' && data.halfLaterClosed));
  if (deals.length === 0 && saleCut === 0) return null;

  const counter = data.counterHaggle?.merchantId === merchantId ? data.counterHaggle : null;
  const struck = data.haggle?.merchantId === merchantId ? data.haggle : null;
  const struckDeal = struck ? cpredHaggleDeal(struck.dealId) : null;
  const chosen = dealId || deals[0]?.id || '';

  async function roll(): Promise<void> {
    setBusy(true);
    clearNotices('exchange');
    const result = await strikeHaggle(anchorId, deals.length > 0 ? chosen : null, { merchantId });
    setBusy(false);
    if (!result.ok) return;
    notifyInfo(
      result.won
        ? deals.length > 0
          ? 'Targ dobity — zadziała przy najbliższej transakcji z tym handlarzem.'
          : 'Wygrana — handlarz skupi bez urywania.'
        : 'Handlarz nie ustąpił. Remis też przegrywa.',
      { title: merchantName, topic: 'exchange' },
    );
  }

  return (
    <div className="counter-haggle" data-testid="counter-haggle">
      {saleCut > 0 && (
        <p className="inventory-hint">
          {merchantName} jest Fixerem: przy skupie urywa {saleCut}%, dopóki nie wygrasz z nim rzutu
          spornego.
        </p>
      )}
      {counter ? (
        <p className="inventory-hint" data-testid="counter-haggle-result">
          Targowanie przy tej ladzie: {counter.won ? 'wygrane' : 'przegrane'} ({counter.note})
          {struckDeal ? ` — dobity targ: ${struckDeal.name}` : ''}. Kolejny rzut po transakcji.
        </p>
      ) : (
        <div className="counter-haggle-row">
          {deals.length > 0 && (
            <select
              value={chosen}
              aria-label="Targ"
              onChange={(event) => setDealId(event.target.value)}
              disabled={busy || blockedHint !== null}
            >
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id} title={deal.text}>
                  {deal.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="small-button"
            disabled={busy || blockedHint !== null}
            title={
              blockedHint ??
              'CHA + Handel + Znajomości + 1k10 przeciw temu samemu z karty handlarza'
            }
            onClick={() => void roll()}
          >
            {busy ? '…' : deals.length > 0 ? 'Targuj się' : 'Targuj się o cenę skupu'}
          </button>
        </div>
      )}
    </div>
  );
}
