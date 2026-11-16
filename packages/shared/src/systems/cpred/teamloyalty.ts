/**
 * Lojalność zespołu Korpo na zamknięciu sesji (etap 71e, G25; s. 154).
 *
 * Trzy zdania podręcznika o końcu sesji, trzy różne wagi:
 *
 *  - **KOR-12** „jeśli na koniec sesji wynosi powyżej 10, spada do 10” — liczba
 *    bez uznania MG, więc robi to samo zamknięcie sesji (`session:end`, każda
 *    droga końca);
 *  - **KOR-13** „brak wzrostu Lojalności przez całą sesję: −1” — VTT pamięta,
 *    czy w sesji był wzrost (`grew`), ale −1 jest **propozycją** dla MG
 *    (`neglectDue`): wzrost bywa fabularny (premia przy stole, której nikt nie
 *    kliknął), a automat odejmowałby za coś, co się wydarzyło;
 *  - **KOR-14** „ujemna Lojalność na koniec sesji: pracownik odchodzi” — tylko
 *    przypomnienie MG; zwolnienie dalej klika MG.
 */

import { CPRED_LOYALTY_SESSION_CAP, type CpredTeamMember } from './roleability.js';

export interface CpredTeamSessionClose {
  team: CpredTeamMember[];
  /** Ścięci do 10 — z wartością sprzed ścięcia. */
  capped: { member: CpredTeamMember; from: number }[];
  /** Bez wzrostu w tej sesji — czeka propozycja −1. */
  neglect: CpredTeamMember[];
  /** Ujemna Lojalność — przypomnienie o odejściu. */
  leaving: CpredTeamMember[];
  /** Coś się zmieniło na karcie (ścięcie, znaczniki). */
  changed: boolean;
}

/** Zespół po zamknięciu sesji: ścięcie, propozycje, przypomnienia. */
export function cpredTeamAfterSession(team: readonly CpredTeamMember[]): CpredTeamSessionClose {
  const capped: CpredTeamSessionClose['capped'] = [];
  const neglect: CpredTeamMember[] = [];
  const leaving: CpredTeamMember[] = [];
  let changed = false;
  const next = team.map((member) => {
    const { grew, ...rest } = member;
    const loyalty =
      member.loyalty > CPRED_LOYALTY_SESSION_CAP ? CPRED_LOYALTY_SESSION_CAP : member.loyalty;
    const row: CpredTeamMember = { ...rest, loyalty };
    if (loyalty !== member.loyalty) {
      capped.push({ member: row, from: member.loyalty });
      changed = true;
    }
    if (grew === true) changed = true;
    else {
      if (row.neglectDue !== true) changed = true;
      row.neglectDue = true;
      neglect.push(row);
    }
    if (loyalty < 0) leaving.push(row);
    return row;
  });
  return { team: next, capped, neglect, leaving, changed };
}

/** Id wiersza tabeli, którym MG przyjmuje propozycję −1 („Brak wzrostu…”). */
export const CPRED_LOYALTY_NEGLECT_ID = 'neglect';

/**
 * Pracownik po zmianie Lojalności z tabeli. Dodatnia zapisuje wzrost w sesji;
 * wiersz „brak wzrostu” rozstrzyga propozycję (`neglectDue` schodzi).
 */
export function cpredTeamMemberChanged(
  member: CpredTeamMember,
  loyalty: number,
  change: { id: string; value: number },
): CpredTeamMember {
  const row: CpredTeamMember = { ...member, loyalty };
  if (change.value > 0) row.grew = true;
  if (change.id === CPRED_LOYALTY_NEGLECT_ID) delete row.neglectDue;
  return row;
}

/** MG pomija propozycję −1 — znacznik schodzi, Lojalność zostaje. */
export function cpredTeamNeglectDismissed(member: CpredTeamMember): CpredTeamMember {
  const { neglectDue: _dismissed, ...rest } = member;
  return rest;
}
