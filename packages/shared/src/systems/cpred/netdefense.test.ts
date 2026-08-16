import { describe, expect, it } from 'vitest';
import {
  describeNetDefenseEffects,
  netDefenseActs,
  netDefenseTrigger,
  readNetDefenseEffects,
  type CpredNetDefenseEffects,
} from './netrunning.js';
import { CPRED_SLOWED_STATUS_ID, cpredSlowedMoveModifier } from './statuses.js';
import { cpredMoveBudget } from './movement.js';

/**
 * Efekt systemu obronnego jako dane (etap 26f).
 *
 * Testy chodzą po wierszach z s. 213–216 — tych samych, które `parse-netrunning.py`
 * wyciąga ze zrzutu PDF-a — bo to one ustaliły kształt modelu i to one pierwsze
 * pękną, gdyby ktoś go „uprościł".
 */
describe('readNetDefenseEffects', () => {
  it('czyta podłogę elektryczną: obrażenia przez pancerz, bez uszkodzenia, co Turę', () => {
    const effects = readNetDefenseEffects({
      damage: '6k6',
      noAblation: true,
      repeats: true,
    });
    expect(effects).toEqual({ damage: '6k6', noAblation: true, repeats: true });
    expect(netDefenseTrigger(effects)).toBe('enter');
  });

  it('czyta ślizgawkę: ruch na obszarze, Test Atletyki, Powalony', () => {
    const effects = readNetDefenseEffects({
      when: 'move',
      check: { skillId: 'athletics', skillLabel: 'Atletyka', statId: 'dex', dv: 15 },
      statuses: ['prone'],
    });
    expect(netDefenseTrigger(effects)).toBe('move');
    expect(effects?.check?.dv).toBe(15);
    expect(effects?.statuses).toEqual(['prone']);
  });

  it('czyta krwawy rój: test na SW, 3k6 bezpośrednio, tylko cele biologiczne', () => {
    const effects = readNetDefenseEffects({
      check: {
        skillId: 'resist-torture-drugs',
        skillLabel: 'Odporność na tortury/narkotyki',
        statId: 'will',
        dv: 15,
        biologicalOnly: true,
      },
      damage: '3k6',
      direct: true,
    });
    expect(effects?.check?.biologicalOnly).toBe(true);
    expect(effects?.direct).toBe(true);
  });

  it('czyta panele ogłuszające: dwie rany na minutę, bez obrażeń dodatkowych', () => {
    const effects = readNetDefenseEffects({
      check: { skillId: 'resist-torture-drugs', dv: 15 },
      injuries: ['injury.head-uraz-ucha', 'injury.head-uraz-oka'],
      durationS: 60,
      noBonusDamage: true,
    });
    expect(effects?.injuries).toHaveLength(2);
    expect(effects?.durationS).toBe(60);
    expect(effects?.noBonusDamage).toBe(true);
  });

  it('czyta windę z gazem: własne miejsce w Kolejce Inicjatywy', () => {
    const effects = readNetDefenseEffects({
      when: 'turn',
      check: { skillId: 'resist-torture-drugs', dv: 13 },
      statuses: ['unconscious'],
    });
    expect(netDefenseTrigger(effects)).toBe('turn');
  });

  it('„enter" nie jedzie w danych — to i tak wartość domyślna', () => {
    const effects = readNetDefenseEffects({ when: 'enter', damage: '6k6' });
    expect(effects).toEqual({ damage: '6k6' });
  });

  it('odrzuca test bez PT albo bez umiejętności — pół testu to nie test', () => {
    expect(readNetDefenseEffects({ check: { skillId: 'athletics' } })).toBeUndefined();
    expect(readNetDefenseEffects({ check: { dv: 15 } })).toBeUndefined();
    expect(readNetDefenseEffects({ check: { skillId: 'athletics', dv: 0 } })).toBeUndefined();
  });

  it('„tylko dla tego, kto zauważył" bez testu nic nie znaczy', () => {
    expect(readNetDefenseEffects({ awareOnly: true, damage: '4k6' })).toEqual({ damage: '4k6' });
    const laser = readNetDefenseEffects({
      when: 'move',
      check: { skillId: 'human-rubber', statId: 'dex', dv: 17 },
      awareOnly: true,
      damage: '4k6',
    });
    expect(laser?.awareOnly).toBe(true);
  });

  it('pusty i niezrozumiały wpis daje „MG rozstrzyga", nigdy odmowy zapisu', () => {
    expect(readNetDefenseEffects({})).toBeUndefined();
    expect(readNetDefenseEffects(null)).toBeUndefined();
    expect(readNetDefenseEffects('6k6')).toBeUndefined();
    expect(readNetDefenseEffects({ damage: 42, moveDrain: [] })).toBeUndefined();
  });

  it('tnie listy statusów i ran do rozsądnej długości i odsiewa duplikaty', () => {
    const effects = readNetDefenseEffects({
      statuses: ['prone', 'prone', 'unconscious', 'a', 'b', 'c'],
    });
    expect(effects?.statuses).toEqual(['prone', 'unconscious', 'a', 'b']);
  });
});

describe('netDefenseActs', () => {
  it('kamera nic nie robi — i to jest kamera, nie wiersz w połowie wypełniony', () => {
    expect(netDefenseActs(undefined)).toBe(false);
    expect(netDefenseActs({})).toBe(false);
  });

  it('sam RUCH albo sam strzał wystarczy, żeby silnik miał co zrobić', () => {
    expect(netDefenseActs({ moveDrain: '2k6' })).toBe(true);
    expect(netDefenseActs({ fires: true })).toBe(true);
    expect(netDefenseActs({ statuses: ['prone'] })).toBe(true);
  });
});

describe('describeNetDefenseEffects', () => {
  it('składa jedno polskie zdanie z tego, co system robi', () => {
    const effects: CpredNetDefenseEffects = {
      check: { skillId: 'athletics', skillLabel: 'Atletyka', dv: 15 },
      damage: '6k6',
      repeats: true,
    };
    expect(describeNetDefenseEffects(effects)).toBe(
      'Test Atletyka PT 15 · 6k6 w ciało · powtórnie na koniec każdej Tury',
    );
  });

  it('mówi wprost, gdy test przysługuje tylko temu, kto strefę zauważył', () => {
    const line = describeNetDefenseEffects({
      check: { skillId: 'human-rubber', skillLabel: 'Człowiek guma', dv: 17 },
      awareOnly: true,
      damage: '4k6',
    });
    expect(line).toContain('tylko dla tego, kto zauważył');
  });

  it('bierze nazwy statusów i ran od wołającego, nie identyfikatory', () => {
    const line = describeNetDefenseEffects(
      { statuses: ['prone'], injuries: ['injury.head-uraz-oka'], durationS: 60 },
      { statuses: ['Powalony'], injuries: ['Uraz oka'] },
    );
    expect(line).toContain('Powalony');
    expect(line).toContain('Uraz oka');
    expect(line).not.toContain('injury.head');
  });

  it('brak efektu to puste zdanie, nie „undefined"', () => {
    expect(describeNetDefenseEffects(undefined)).toBe('');
  });
});

describe('kara do RUCH-u ze strefy (Maź, Podłoga obalająca)', () => {
  it('liczy się dopiero razem z naklejką i liczbą przy niej', () => {
    expect(cpredSlowedMoveModifier([], { [CPRED_SLOWED_STATUS_ID]: 7 })).toBeNull();
    expect(cpredSlowedMoveModifier([CPRED_SLOWED_STATUS_ID], {})).toBeNull();
    expect(
      cpredSlowedMoveModifier([CPRED_SLOWED_STATUS_ID], { [CPRED_SLOWED_STATUS_ID]: 7 }),
    ).toEqual({ label: 'Spowolniony', value: -7 });
  });

  it('wchodzi do budżetu ruchu jako nazwany modyfikator, nie jako cicha odjęcie', () => {
    const budget = cpredMoveBudget({ move: 6, extra: [{ label: 'Spowolniony', value: -7 }] });
    // RUCH 6 − 7 spadłby poniżej minimum, więc podłoga z 14c trzyma go na 1.
    expect(budget.move).toBe(1);
    expect(budget.floored).toBe(true);
    expect(budget.modifiers).toContainEqual({ label: 'Spowolniony', value: -7 });
  });

  it('zerowy modyfikator nie zaśmieca listy', () => {
    const budget = cpredMoveBudget({ move: 6, extra: [{ label: 'Spowolniony', value: 0 }] });
    expect(budget.modifiers).toHaveLength(0);
    expect(budget.metresPerMove).toBe(12);
  });
});
