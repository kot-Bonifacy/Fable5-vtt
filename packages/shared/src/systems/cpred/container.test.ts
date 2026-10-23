import { describe, expect, it } from 'vitest';
import { exchangeOptionsFor } from '../../exchange.js';
import { createDefaultCharacterData, type CpredCharacterData } from './character.js';
import {
  cpredContainerOpening,
  cpredLockTestSettled,
  createCpredContainer,
  isContainerCard,
  isContainerCardJson,
  readCpredContainer,
} from './container.js';
import {
  cpredContainerEmpty,
  cpredHasKey,
  cpredKeyRow,
  createContainerSheet,
} from './containercard.js';
import { cpredMoveItems } from './inventory.js';
import { CPRED_LOCK_DV_DEFAULT } from './lock.js';

const KEY = 'klucz-skrzyni-01';

function sheetWith(patch: Partial<CpredCharacterData>): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...patch };
}

describe('readCpredContainer — zapis karty pojemnika', () => {
  it('brak pola to karta postaci', () => {
    expect(readCpredContainer(undefined)).toBeNull();
    expect(readCpredContainer(null)).toBeNull();
  });

  it('zepsuty stan zamka to błąd, drobiazgi wracają do domyślnych', () => {
    expect(readCpredContainer({ lock: 'rozwalony' })).toBeUndefined();
    expect(readCpredContainer('skrzynia')).toBeUndefined();
    expect(
      readCpredContainer({ lock: 'locked', dv: 999, skills: ['hacking'], keyId: 'x', tried: [1] }),
    ).toEqual({
      lock: 'locked',
      dv: CPRED_LOCK_DV_DEFAULT,
      skills: ['pick-lock'],
      keyId: null,
      pile: false,
      tried: [],
    });
  });

  it('trzyma dwie Umiejętności bez powtórzeń i uchwyt klucza', () => {
    expect(
      readCpredContainer({
        lock: 'locked',
        dv: 15,
        skills: ['electronics-security', 'pick-lock', 'pick-lock'],
        keyId: KEY,
        pile: true,
        tried: ['a', 'a', 'b'],
      }),
    ).toEqual({
      lock: 'locked',
      dv: 15,
      skills: ['electronics-security', 'pick-lock'],
      keyId: KEY,
      pile: true,
      tried: ['a', 'b'],
    });
  });
});

describe('isContainerCard — jedno pytanie dla każdej listy figur', () => {
  it('karta postaci nie jest pojemnikiem, karta skrzyni jest', () => {
    expect(isContainerCard(createDefaultCharacterData())).toBe(false);
    expect(isContainerCard(createContainerSheet())).toBe(true);
  });

  it('szybkie pytanie o surowy zapis daje tę samą odpowiedź', () => {
    expect(isContainerCardJson(JSON.stringify(createDefaultCharacterData()))).toBe(false);
    expect(isContainerCardJson(JSON.stringify(createContainerSheet({ lock: 'locked' })))).toBe(
      true,
    );
    // Słowo „container" w notatce nie robi z postaci skrzyni.
    expect(isContainerCardJson(JSON.stringify(sheetWith({ notes: '"container"' })))).toBe(false);
    expect(isContainerCardJson('{zepsute')).toBe(false);
  });
});

describe('cpredContainerOpening — co robi „Otwórz”', () => {
  const opener = { characterId: 'kowal', isGm: false, hasKey: false };

  it('otwarty zostaje otwarty, zamknięty otwiera się kliknięciem', () => {
    expect(cpredContainerOpening(createCpredContainer(), opener)).toEqual({ kind: 'already-open' });
    expect(cpredContainerOpening(createCpredContainer({ lock: 'closed' }), opener)).toEqual({
      kind: 'open',
      via: 'click',
    });
  });

  it('zamek: MG otwiera ręką, klucz bez Testu, reszta — Test z PT od MG', () => {
    const locked = createCpredContainer({ lock: 'locked', dv: 15 });
    expect(cpredContainerOpening(locked, { ...opener, isGm: true })).toEqual({
      kind: 'open',
      via: 'gm',
    });
    expect(cpredContainerOpening(locked, { ...opener, hasKey: true })).toEqual({
      kind: 'open',
      via: 'key',
    });
    expect(cpredContainerOpening(locked, opener)).toEqual({
      kind: 'test',
      skillId: 'pick-lock',
      dv: 15,
    });
  });

  it('Umiejętność wybiera otwierający, ale tylko spośród tych, które zna zamek', () => {
    const locked = createCpredContainer({
      lock: 'locked',
      skills: ['pick-lock', 'electronics-security'],
    });
    expect(cpredContainerOpening(locked, { ...opener, skillId: 'electronics-security' })).toEqual({
      kind: 'test',
      skillId: 'electronics-security',
      dv: CPRED_LOCK_DV_DEFAULT,
    });
    const pickOnly = createCpredContainer({ lock: 'locked' });
    expect(cpredContainerOpening(pickOnly, { ...opener, skillId: 'electronics-security' })).toEqual(
      { kind: 'refused', error: 'LOCK_SKILL' },
    );
    expect(cpredContainerOpening(pickOnly, { ...opener, skillId: 'hacking' })).toEqual({
      kind: 'refused',
      error: 'LOCK_SKILL',
    });
  });

  it('jedna próba na postać — klucz działa i po nieudanej', () => {
    const tried = cpredLockTestSettled(createCpredContainer({ lock: 'locked' }), 'kowal', false);
    expect(tried.lock).toBe('locked');
    expect(tried.tried).toEqual(['kowal']);
    expect(cpredContainerOpening(tried, opener)).toEqual({ kind: 'refused', error: 'LOCK_TRIED' });
    expect(cpredContainerOpening(tried, { ...opener, characterId: 'iskra' }).kind).toBe('test');
    expect(cpredContainerOpening(tried, { ...opener, hasKey: true })).toEqual({
      kind: 'open',
      via: 'key',
    });
    // Druga porażka tej samej postaci nie dopisuje jej drugi raz.
    expect(cpredLockTestSettled(tried, 'kowal', false)).toBe(tried);
  });

  it('zdany Test otwiera zamek', () => {
    const opened = cpredLockTestSettled(createCpredContainer({ lock: 'locked' }), 'kowal', true);
    expect(opened.lock).toBe('open');
  });
});

describe('klucz i stos', () => {
  it('klucz to wiersz wyposażenia, który otwiera tylko swój zamek', () => {
    const holder = sheetWith({ gear: [cpredKeyRow('k1', KEY, 'Bagażnik')] });
    expect(holder.gear[0]).toMatchObject({ name: 'Klucz: Bagażnik', qty: 1, key: KEY });
    expect(cpredHasKey(holder, KEY)).toBe(true);
    expect(cpredHasKey(holder, 'inny-zamek-02')).toBe(false);
    expect(cpredHasKey(holder, null)).toBe(false);
  });

  it('klucz jedzie z kartą na kartę w całości i nie skleja się z innym', () => {
    const from = sheetWith({ gear: [cpredKeyRow('k1', KEY, 'Bagażnik')] });
    const to = sheetWith({ gear: [cpredKeyRow('k2', 'drugi-zamek-03', 'Skrzynia')] });
    const moved = cpredMoveItems(from, to, [{ list: 'gear', rowId: 'k1' }]);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.result.to.gear).toHaveLength(2);
    expect(cpredHasKey(moved.result.to, KEY)).toBe(true);
    expect(cpredHasKey(moved.result.from, KEY)).toBe(false);
  });

  it('stos jest pusty bez wierszy i bez gotówki, skrzynia pełna z samą gotówką', () => {
    const pile = createContainerSheet({ pile: true });
    expect(cpredContainerEmpty(pile)).toBe(true);
    expect(cpredContainerEmpty({ ...pile, eddies: 5 })).toBe(false);
    expect(cpredContainerEmpty({ ...pile, gear: [cpredKeyRow('k', KEY, 'x')] })).toBe(false);
  });

  it('wyjęcie ostatniej rzeczy zostawia stos pusty', () => {
    const pile = sheetWith({
      container: createCpredContainer({ pile: true }),
      gear: [{ id: 'g1', name: 'Latarka', notes: '', qty: 2 }],
    });
    const taker = createDefaultCharacterData();
    const moved = cpredMoveItems(pile, taker, [{ list: 'gear', rowId: 'g1' }]);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(cpredContainerEmpty(moved.result.from)).toBe(true);
    expect(moved.result.to.gear[0]).toMatchObject({ name: 'Latarka', qty: 2 });
  });

  it('limit wierszy obowiązuje pojemnik jak każdą kartę', () => {
    const full = sheetWith({
      container: createCpredContainer(),
      gear: Array.from({ length: 40 }, (_, i) => ({
        id: `g${i}`,
        name: `Rzecz ${i}`,
        notes: '',
        qty: 1,
      })),
    });
    const giver = sheetWith({ gear: [{ id: 'x', name: 'Jeszcze jedna', notes: '', qty: 1 }] });
    expect(cpredMoveItems(giver, full, [{ list: 'gear', rowId: 'x' }])).toEqual({
      ok: false,
      error: 'TOO_MANY_ROWS',
    });
  });
});

describe('exchangeOptionsFor — pojemnik ma jeden tryb', () => {
  const facts = {
    anchorOwnerId: 'marek',
    ownerId: null,
    condition: 'dead' as const,
    merchant: null,
  };

  it('gracz dostaje tryb pojemnika — nie łup, choć karta „leży”', () => {
    expect(exchangeOptionsFor({ ...facts, isGm: false, container: { lock: 'locked' } })).toEqual([
      { kind: 'container' },
    ]);
  });

  it('MG dostaje tryb pojemnika i tryb MG', () => {
    expect(exchangeOptionsFor({ ...facts, isGm: true, container: { lock: 'open' } })).toEqual([
      { kind: 'container' },
      { kind: 'gm' },
    ]);
  });

  it('bez pojemnika zostaje stara reguła (ciało → łup)', () => {
    expect(exchangeOptionsFor({ ...facts, isGm: false, container: null })).toEqual([
      { kind: 'loot' },
    ]);
  });
});
