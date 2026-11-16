import { describe, expect, it } from 'vitest';
import {
  CPRED_LOYALTY_NEGLECT_ID,
  cpredTeamAfterSession,
  cpredTeamMemberChanged,
  cpredTeamNeglectDismissed,
} from './teamloyalty.js';
import { readCpredTeam, type CpredTeamMember } from './roleability.js';

/** Etap 71e (G25; KOR-12, KOR-13, KOR-14): Lojalność na zamknięciu sesji. */

const member = (patch: Partial<CpredTeamMember>): CpredTeamMember => ({
  characterId: 'p1',
  professionId: 'bodyguard',
  loyalty: 5,
  ...patch,
});

describe('Lojalność na zamknięciu sesji', () => {
  it('ponad 10 spada do 10 samo (KOR-12)', () => {
    const closed = cpredTeamAfterSession([member({ loyalty: 14, grew: true })]);
    expect(closed.team[0]).toEqual(member({ loyalty: 10 }));
    expect(closed.capped).toEqual([{ member: member({ loyalty: 10 }), from: 14 }]);
    expect(closed.neglect).toEqual([]);
    expect(closed.changed).toBe(true);
  });

  it('sesja bez wzrostu daje propozycję −1, nie odejmuje (KOR-13)', () => {
    const closed = cpredTeamAfterSession([member({ loyalty: 3 })]);
    expect(closed.team[0]).toMatchObject({ loyalty: 3, neglectDue: true });
    expect(closed.neglect).toHaveLength(1);
    // Wzrost w sesji: bez propozycji, znacznik wzrostu schodzi na następną.
    const grew = cpredTeamAfterSession([member({ grew: true })]);
    expect(grew.team[0]).toEqual(member({}));
    expect(grew.neglect).toEqual([]);
  });

  it('ujemna Lojalność to przypomnienie o odejściu, bez automatu (KOR-14)', () => {
    const closed = cpredTeamAfterSession([member({ loyalty: -2, grew: true })]);
    expect(closed.leaving.map((row) => row.loyalty)).toEqual([-2]);
    expect(closed.team).toHaveLength(1);
  });

  it('dodatnia zmiana zapisuje wzrost; wiersz „brak wzrostu” i „Pomiń” rozstrzygają propozycję', () => {
    const due = member({ neglectDue: true });
    expect(cpredTeamMemberChanged(due, 6, { id: 'compliment', value: 1 })).toEqual(
      member({ loyalty: 6, grew: true, neglectDue: true }),
    );
    expect(cpredTeamMemberChanged(due, 4, { id: CPRED_LOYALTY_NEGLECT_ID, value: -1 })).toEqual(
      member({ loyalty: 4 }),
    );
    expect(cpredTeamMemberChanged(due, 3, { id: 'criticism', value: -2 })).toMatchObject({
      neglectDue: true,
    });
    expect(cpredTeamNeglectDismissed(due)).toEqual(member({}));
  });

  it('znaczniki przeżywają odczyt karty', () => {
    expect(readCpredTeam([member({ grew: true, neglectDue: true })])[0]).toMatchObject({
      grew: true,
      neglectDue: true,
    });
    expect(readCpredTeam([{ ...member({}), grew: 'tak' }])[0]).not.toHaveProperty('grew');
  });
});
