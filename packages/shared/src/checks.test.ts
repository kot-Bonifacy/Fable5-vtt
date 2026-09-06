import { describe, expect, it } from 'vitest';
import {
  checkCallTargetText,
  checkRequestResolutionLabel,
  isCheckCallOpen,
  isCheckRequestOpen,
  mayAnswerCheckCall,
  mayCancelCheckRequest,
  type CheckCallEntry,
  type CheckRequestEntry,
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

/** Prośba o Test, tak jak wychodzi z `check:request` (etap 40). */
function request(patch: Partial<CheckRequestEntry> = {}): CheckRequestEntry {
  return {
    characterId: 'char-1',
    characterName: 'Forty',
    askedById: 'user-vex',
    askedByName: 'Vex',
    rollLabel: 'Odczytywanie emocji (EMP)',
    reason: 'Chcę zrozumieć, co znaczy ta mina.',
    system: { kind: 'skill', skillId: 'human-perception' },
    ...patch,
  };
}

describe('stan prośby o Test (etap 40)', () => {
  it('otwarta jest tylko prośba bez rozstrzygnięcia', () => {
    expect(isCheckRequestOpen(request())).toBe(true);
    for (const kind of ['approved', 'refused', 'withdrawn'] as const) {
      expect(isCheckRequestOpen(request({ resolution: { kind, byName: 'MG' } }))).toBe(false);
    }
  });

  it('wycofuje wyłącznie ten, kto prosił — MG ma na to „Odmów"', () => {
    const entry = request();
    expect(mayCancelCheckRequest(entry, 'user-vex')).toBe(true);
    expect(mayCancelCheckRequest(entry, 'user-gm')).toBe(false);
  });

  it('rozstrzygniętej prośby nie da się wycofać', () => {
    const entry = request({ resolution: { kind: 'refused', byName: 'MG' } });
    expect(mayCancelCheckRequest(entry, 'user-vex')).toBe(false);
  });

  it('plakietka niesie próg, na który MG przystał', () => {
    expect(
      checkRequestResolutionLabel(
        request({
          resolution: {
            kind: 'approved',
            byName: 'MG',
            callMessageId: 9,
            targetText: 'PT 15 (Trudny)',
          },
        }),
      ),
    ).toBe('Zgoda — PT 15 (Trudny)');
    expect(
      checkRequestResolutionLabel(request({ resolution: { kind: 'refused', byName: 'MG' } })),
    ).toBe('Odmowa');
    expect(checkRequestResolutionLabel(request())).toBe('');
  });
});

describe('prośba w feedzie czatu', () => {
  it('siedzi w grupie „Rzuty" razem z wezwaniem, które z niej powstanie', () => {
    // Zgaszona grupa „Rzuty" ma gasić całą zapowiedź rzutu, a nie jej połowę:
    // prośba bez wezwania albo wezwanie bez prośby to pół rozmowy.
    expect(chatCategoryOf('request')).toBe(chatCategoryOf('check'));
    expect(chatCategoryOf('request')).toBe('dice');
  });
});
