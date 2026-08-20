import { describe, expect, it } from 'vitest';
import {
  CPRED_STATUS_EFFECTS,
  cpredActionBlock,
  cpredDodgeBlock,
  cpredExpiringStatuses,
  cpredInjuryCarryOnDraw,
  cpredInjuryDodgeBlock,
  cpredInjuryModifiers,
  cpredInjuryTurnEnd,
  cpredMovementBlock,
  cpredPeriodicDamage,
  cpredStatusSeverity,
  cpredTurnReminders,
} from './statuses.js';

describe('statuses that stop a token from moving', () => {
  it('refuses the Prone token and names the Action that fixes it', () => {
    expect(cpredMovementBlock(['prone'])).toContain('Wstanie');
  });

  it('refuses being held and being unconscious', () => {
    expect(cpredMovementBlock(['grappled'])).not.toBeNull();
    expect(cpredMovementBlock(['immobilized'])).not.toBeNull();
    expect(cpredMovementBlock(['unconscious'])).not.toBeNull();
  });

  it('lets a wounded but conscious token walk', () => {
    expect(cpredMovementBlock(['seriously-wounded', 'on-fire'])).toBeNull();
    expect(cpredMovementBlock([])).toBeNull();
  });

  it('reports the deadliest reason first when several apply', () => {
    // „Martwy" outranks „Powalony": telling a corpse to stand up is nonsense.
    expect(cpredMovementBlock(['prone', 'dead'])).toContain('Martwy');
  });
});

describe('statuses that stop a token from acting', () => {
  it('refuses the unconscious and the dead', () => {
    expect(cpredActionBlock(['unconscious'])).not.toBeNull();
    expect(cpredActionBlock(['dead'])).not.toBeNull();
  });

  /**
   * The distinction the whole grapple stage rests on: being Held costs you your
   * Move Action and −2, never your Action — otherwise Duszenie would have
   * nobody left to struggle against.
   */
  it('lets a Held, Prone or Immobilized token still act', () => {
    expect(cpredActionBlock(['grappled'])).toBeNull();
    expect(cpredActionBlock(['prone'])).toBeNull();
    expect(cpredActionBlock(['immobilized'])).toBeNull();
  });
});

describe('statuses that stop a dodge', () => {
  it('refuses only those who cannot react at all', () => {
    expect(cpredDodgeBlock(['unconscious'])).not.toBeNull();
    expect(cpredDodgeBlock(['prone'])).toBeNull();
    expect(cpredDodgeBlock(['grappled'])).toBeNull();
  });
});

describe('the table itself', () => {
  it('names every status it judges, and every row does something', () => {
    for (const [id, effect] of Object.entries(CPRED_STATUS_EFFECTS)) {
      expect(effect.name, id).toBeTruthy();
      // A row earns its place by refusing something, by burning, or by having
      // something to say at the start of a turn. A row that does none of the
      // three is decoration the tracker would carry for nothing.
      expect(
        effect.noMove ?? effect.noAction ?? effect.noDodge ?? effect.dot ?? effect.reminder,
        `${id} is in the table but does nothing`,
      ).toBeTruthy();
    }
  });

  it('keeps every id it judges in the shipped status registry', async () => {
    const file = new URL('../../../../../data/public/cpred/statuses.json', import.meta.url);
    const { readFile } = await import('node:fs/promises');
    const parsed = JSON.parse(await readFile(file, 'utf8')) as {
      statuses: { id: string; name: string }[];
    };
    const known = new Map(parsed.statuses.map((status) => [status.id, status.name]));
    for (const [id, effect] of Object.entries(CPRED_STATUS_EFFECTS)) {
      expect(known.has(id), `${id} has effects but no icon or name in statuses.json`).toBe(true);
      expect(known.get(id), id).toBe(effect.name);
    }
  });
});

describe('periodic damage (stage 14e)', () => {
  it('burns at the end of the turn and drowns at the start', () => {
    expect(cpredPeriodicDamage(['on-fire'], 'turn-end')).toEqual([
      { statusId: 'on-fire', label: 'Podpalony', damage: 4 },
    ]);
    expect(cpredPeriodicDamage(['on-fire'], 'turn-start')).toEqual([]);
    expect(cpredPeriodicDamage(['drowning'], 'turn-start', { body: 7 })).toEqual([
      { statusId: 'drowning', label: 'Tonięcie', damage: 7 },
    ]);
  });

  it('lets the GM dial fire and poison, but never BODY', () => {
    expect(cpredPeriodicDamage(['on-fire'], 'turn-end', { values: { 'on-fire': 6 } })).toEqual([
      { statusId: 'on-fire', label: 'Podpalony', damage: 6 },
    ]);
    // Drowning reads the sheet: a dialed value must not overwrite BODY.
    expect(
      cpredPeriodicDamage(['drowning'], 'turn-start', { values: { drowning: 99 }, body: 4 }),
    ).toEqual([{ statusId: 'drowning', label: 'Tonięcie', damage: 4 }]);
  });

  it('skips damage that would be zero', () => {
    // A statist with no sheet has no BODY to drown by — better nothing than a
    // number the tracker invented.
    expect(cpredPeriodicDamage(['drowning'], 'turn-start', { body: 0 })).toEqual([]);
    expect(cpredPeriodicDamage(['on-fire'], 'turn-end', { values: { 'on-fire': 0 } })).toEqual([]);
  });

  it('stacks fire and poison in one end-of-turn pass', () => {
    const due = cpredPeriodicDamage(['on-fire', 'poisoned'], 'turn-end', {
      values: { 'on-fire': 2, poisoned: 3 },
    });
    expect(due.map((entry) => entry.damage)).toEqual([2, 3]);
  });
});

describe('statuses that expire and statuses that nag', () => {
  it('takes „Przygwożdżony" off at the end of its carrier’s turn', () => {
    expect(cpredExpiringStatuses(['suppressed', 'on-fire'])).toEqual(['suppressed']);
  });

  it('reminds the pinned and the burning when their turn starts', () => {
    expect(cpredTurnReminders(['suppressed'])[0]).toContain('osłony');
    expect(cpredTurnReminders(['on-fire'])[0]).toContain('Ugaszenie');
    expect(cpredTurnReminders(['prone'])).toEqual([]);
  });
});

describe('Critical Injuries with machine effects (stage 14e)', () => {
  const ribs = { id: 'injury.body-zebra', name: 'Złamane żebra', effect: '', dotAfterRun: true };
  const ear = { id: 'injury.head-ucho', name: 'Uraz ucha', effect: '', noMoveAfterRun: true };
  const spine = {
    id: 'injury.body-kregoslup',
    name: 'Uraz kręgosłupa',
    effect: '',
    noActionNextTurn: true,
  };

  it('bites back only past four metres of walking', () => {
    expect(cpredInjuryTurnEnd([ribs], 4).damage).toEqual([]);
    expect(cpredInjuryTurnEnd([ribs], 4.5).damage).toEqual([
      { statusId: ribs.id, label: 'Złamane żebra', damage: 5 },
    ]);
  });

  it('costs the next turn its Move Action after a long walk', () => {
    expect(cpredInjuryTurnEnd([ear], 3).carry.noMove).toBeUndefined();
    expect(cpredInjuryTurnEnd([ear], 10).carry.noMove).toContain('Uraz ucha');
  });

  it('takes the next turn’s Action the moment the spine is hurt', () => {
    expect(cpredInjuryCarryOnDraw(spine)?.noAction).toContain('Akcja Ruchu zostaje');
    expect(cpredInjuryCarryOnDraw(ribs)).toBeNull();
  });

  it('refuses a dodge and names the leg that is gone', () => {
    const leg = { id: 'injury.body-noga', name: 'Odcięta noga', effect: '', noDodge: true };
    expect(cpredInjuryDodgeBlock([leg])).toContain('Odcięta noga');
    expect(cpredInjuryDodgeBlock([ribs])).toBeNull();
  });

  it('lists flat penalties by name, so a card can show where they came from', () => {
    const concussion = {
      id: 'injury.head-wstrzas',
      name: 'Wstrząśnienie mózgu',
      effect: '',
      actionPenalty: -2,
    };
    expect(cpredInjuryModifiers([concussion, ribs])).toEqual([
      { label: 'Wstrząśnienie mózgu', value: -2 },
    ]);
  });
});

describe('how loudly a status is drawn (stage 27h)', () => {
  it('calls a status that stops every Action critical', () => {
    expect(cpredStatusSeverity('dead')).toBe('critical');
    expect(cpredStatusSeverity('unconscious')).toBe('critical');
  });

  it('warns for the ones that cost movement, a dodge or hit points', () => {
    expect(cpredStatusSeverity('prone')).toBe('warn');
    expect(cpredStatusSeverity('grappled')).toBe('warn');
    expect(cpredStatusSeverity('on-fire')).toBe('warn');
  });

  it('leaves a sticker that only reminds at info — and never throws on one it has never heard of', () => {
    expect(cpredStatusSeverity('intimidated')).toBe('info');
    expect(cpredStatusSeverity('slowed')).toBe('info');
    expect(cpredStatusSeverity('nie-ma-takiego')).toBe('info');
  });

  it('paints the wound states loudly even though the table has no row for them', () => {
    // Their penalties come off the Hit Points (`woundCheckPenalty`), not off a
    // refusal — which is exactly why they need naming here.
    expect(CPRED_STATUS_EFFECTS['mortally-wounded']).toBeUndefined();
    expect(cpredStatusSeverity('mortally-wounded')).toBe('critical');
    expect(cpredStatusSeverity('seriously-wounded')).toBe('warn');
  });

  it('agrees with the effects table it is derived from', () => {
    for (const [id, effect] of Object.entries(CPRED_STATUS_EFFECTS)) {
      const severity = cpredStatusSeverity(id);
      if (effect.noAction) expect(severity).toBe('critical');
      else if (effect.noMove || effect.noDodge || effect.dot) expect(severity).toBe('warn');
      else expect(severity).toBe('info');
    }
  });
});
