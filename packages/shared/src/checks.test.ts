import { describe, expect, it } from 'vitest';
import {
  checkCallTargetText,
  isCheckCallOpen,
  mayAnswerCheckCall,
  type CheckCallEntry,
} from './checks.js';
import { chatCategoryOf } from './chat.js';

/** Wezwanie do Testu, tak jak wychodzi z `check:call` (etap 32). */
function call(patch: Partial<CheckCallEntry> = {}): CheckCallEntry {
  return {
    characterId: 'char-1',
    characterName: 'Forty',
    ownerId: 'user-vex',
    rollLabel: 'Percepcja (INT)',
    dv: 15,
    dvLabel: 'Trudny',
    visibility: 'public',
    system: { kind: 'skill', skillId: 'perception' },
    calledByName: 'MG',
    ...patch,
  };
}

describe('stan wezwania', () => {
  it('otwarte jest tylko wezwanie, na które nikt nie rzucił i którego nie odwołano', () => {
    expect(isCheckCallOpen(call())).toBe(true);
    expect(
      isCheckCallOpen(
        call({ resolved: { messageId: 8, byName: 'Vex', success: true, total: 18 } }),
      ),
    ).toBe(false);
    expect(isCheckCallOpen(call({ cancelled: { byName: 'MG' } }))).toBe(false);
  });

  it('rzuca właściciel karty albo MG — nikt inny', () => {
    const entry = call();
    expect(mayAnswerCheckCall(entry, 'user-vex', false)).toBe(true);
    expect(mayAnswerCheckCall(entry, 'user-rogue', false)).toBe(false);
    expect(mayAnswerCheckCall(entry, 'user-rogue', true)).toBe(true);
  });

  it('wezwania dla NPC-a (bez właściciela) nie odbierze żaden gracz', () => {
    const entry = call({ ownerId: null });
    expect(mayAnswerCheckCall(entry, 'user-vex', false)).toBe(false);
    expect(mayAnswerCheckCall(entry, 'user-gm', true)).toBe(true);
  });

  it('zamknięte wezwanie nie przyjmuje rzutu nawet od MG', () => {
    const entry = call({ cancelled: { byName: 'MG' } });
    expect(mayAnswerCheckCall(entry, 'user-vex', false)).toBe(false);
    expect(mayAnswerCheckCall(entry, 'user-gm', true)).toBe(false);
  });
});

describe('opis progu', () => {
  it('nazywa szczebel drabinki, gdy PT z niej pochodzi', () => {
    expect(checkCallTargetText(call())).toBe('PT 15 (Trudny)');
  });

  it('własną liczbę MG podaje bez szczebla', () => {
    expect(checkCallTargetText(call({ dv: 14, dvLabel: undefined }))).toBe('PT 14');
  });

  it('rzut przeciwstawny mówi, ile ma druga strona', () => {
    expect(
      checkCallTargetText(call({ dv: undefined, dvLabel: undefined, opponentBonus: 12 })),
    ).toBe('przeciwstawny — druga strona: 12 + 1k10');
  });
});

describe('wezwanie w feedzie czatu', () => {
  it('należy do grupy „Rzuty" — chowa się razem z rzutem, który zapowiada', () => {
    expect(chatCategoryOf('check')).toBe('dice');
  });
});
