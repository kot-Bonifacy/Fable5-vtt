import { describe, expect, it } from 'vitest';
import { compareExchangeCounterparts, exchangeOptionsFor, type ExchangeFacts } from './exchange.js';

/**
 * Etap 46a: jedno okno, rodzaj zależy od drugiej strony (decyzja MG 5).
 * Lista u gracza i odmowa serwera czytają tę samą regułę.
 */

function facts(patch: Partial<ExchangeFacts> = {}): ExchangeFacts {
  return {
    isGm: false,
    anchorOwnerId: 'u-marek',
    ownerId: null,
    condition: 'ok',
    merchant: null,
    ...patch,
  };
}

describe('rodzaj drugiej strony u gracza', () => {
  it('kolega z drużyny → handel', () => {
    expect(exchangeOptionsFor(facts({ ownerId: 'u-ola' }))).toEqual([{ kind: 'trade' }]);
  });

  it('żywy NPC → handel (jego stronę prowadzi MG)', () => {
    expect(exchangeOptionsFor(facts())).toEqual([{ kind: 'trade' }]);
  });

  it('leżący albo martwy NPC → łup', () => {
    expect(exchangeOptionsFor(facts({ condition: 'down' }))).toEqual([{ kind: 'loot' }]);
    expect(exchangeOptionsFor(facts({ condition: 'dead' }))).toEqual([{ kind: 'loot' }]);
  });

  it('handlarz otwarty → sklep, zamknięty → wyszarzony', () => {
    expect(exchangeOptionsFor(facts({ merchant: { closed: null } }))).toEqual([
      { kind: 'merchant' },
    ]);
    expect(exchangeOptionsFor(facts({ merchant: { closed: 'closed' } }))).toEqual([
      { kind: 'merchant', unavailable: 'MERCHANT_CLOSED' },
    ]);
  });

  it('martwy handlarz → łup, nie sklep (decyzja MG 7)', () => {
    expect(
      exchangeOptionsFor(facts({ condition: 'dead', merchant: { closed: 'keeper' } })),
    ).toEqual([{ kind: 'loot' }]);
  });
});

describe('rodzaj drugiej strony u MG', () => {
  it('NPC z kartą gracza: handel jako NPC i tryb MG', () => {
    expect(
      exchangeOptionsFor(facts({ isGm: true, anchorOwnerId: null, ownerId: 'u-ola' })),
    ).toEqual([{ kind: 'trade' }, { kind: 'gm' }]);
  });

  it('z karty gracza MG nie handluje za gracza — zostaje tryb MG', () => {
    expect(exchangeOptionsFor(facts({ isGm: true, ownerId: 'u-ola' }))).toEqual([{ kind: 'gm' }]);
  });

  it('zamknięty sklep MG widzi jako zwykłego NPC-a, otwarty — także jako sklep', () => {
    expect(
      exchangeOptionsFor(
        facts({ isGm: true, anchorOwnerId: null, merchant: { closed: 'closed' } }),
      ),
    ).toEqual([{ kind: 'gm' }]);
    expect(exchangeOptionsFor(facts({ isGm: true, merchant: { closed: null } }))).toEqual([
      { kind: 'merchant' },
      { kind: 'gm' },
    ]);
  });
});

describe('kolejność listy', () => {
  it('najpierw dostępne, potem bliżej, potem nazwa; bez metrów na końcu', () => {
    const list = [
      { name: 'Sieć Militechu' },
      { name: 'Paser', metres: 12, unavailable: 'OUT_OF_REACH' as const },
      { name: 'Iskra', metres: 2 },
      { name: 'Ciało', metres: 1 },
    ].sort(compareExchangeCounterparts);
    expect(list.map((row) => row.name)).toEqual(['Ciało', 'Iskra', 'Sieć Militechu', 'Paser']);
  });
});
