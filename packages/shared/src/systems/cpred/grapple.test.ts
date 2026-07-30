import { describe, expect, it } from 'vitest';
import {
  CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS,
  CPRED_GRAPPLE_PENALTY,
  CPRED_STATIST_GRAPPLE_DV,
  cpredGrappleBase,
  cpredHumanShieldCovers,
  cpredPassiveGrappleDv,
  nextCpredChokeStreak,
  resolveCpredChoke,
  resolveCpredGrappleTest,
  resolveCpredThrow,
} from './grapple.js';
import {
  buildCpredRegistry,
  createDefaultCharacterData,
  type CpredCharacterData,
  type CpredRegistry,
} from './character.js';

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'brawling', name: 'Bijatyka', stat: 'dex' },
      { id: 'evasion', name: 'Unik', stat: 'dex' },
    ],
  },
  { roles: [{ id: 'solo', name: 'Solo', ability: 'Zmysł Walki' }] },
);

function sheet(patch: Partial<CpredCharacterData> = {}): CpredCharacterData {
  const base = createDefaultCharacterData();
  return {
    ...base,
    ...patch,
    stats: { ...base.stats, ...(patch.stats ?? {}) },
    skills: { ...base.skills, ...(patch.skills ?? {}) },
  };
}

describe('the opposed test', () => {
  it('adds ZW and Bijatyka, and nothing else', () => {
    const data = sheet({
      stats: { dex: 7 } as CpredCharacterData['stats'],
      skills: { brawling: 4 },
    });
    expect(cpredGrappleBase(data, registry)).toBe(11);
  });

  it('falls back to bare ZW when the skill is untrained', () => {
    const data = sheet({ stats: { dex: 6 } as CpredCharacterData['stats'] });
    expect(cpredGrappleBase(data, registry)).toBe(6);
  });

  it('stands in for an absent defender with half a die on top', () => {
    const data = sheet({
      stats: { dex: 6 } as CpredCharacterData['stats'],
      skills: { brawling: 3 },
    });
    expect(cpredPassiveGrappleDv(data, registry)).toBe(14);
  });

  it('carries the defenders own penalties into their stand-in DV', () => {
    const data = sheet({
      stats: { dex: 6 } as CpredCharacterData['stats'],
      skills: { brawling: 3 },
    });
    // Already Held by somebody else: their −2 must not vanish just because they
    // are not the one rolling.
    expect(cpredPassiveGrappleDv(data, registry, CPRED_GRAPPLE_PENALTY)).toBe(12);
  });

  it('gives a sheetless statist a bare DEX 5 and no training', () => {
    expect(CPRED_STATIST_GRAPPLE_DV).toBe(10);
  });

  it('gives ties to the defender, like every other contest in CP RED', () => {
    expect(resolveCpredGrappleTest(14, 14).won).toBe(false);
    expect(resolveCpredGrappleTest(15, 14).won).toBe(true);
    expect(resolveCpredGrappleTest(15, 14).margin).toBe(1);
  });
});

describe('Duszenie', () => {
  it('deals the attackers BODY straight to HP, ignoring armor', () => {
    const outcome = resolveCpredChoke({ body: 8, hpCurrent: 30, hpMax: 40, roundsInARow: 1 });
    expect(outcome.damage).toBe(8);
    expect(outcome.hpAfter).toBe(22);
    expect(outcome.unconscious).toBe(false);
  });

  it('parks a target that would have died at 1 HP and knocks them out', () => {
    // 5 HP against BODY 12 is −7: below zero, so the floor fires.
    const outcome = resolveCpredChoke({ body: 12, hpCurrent: 5, hpMax: 40, roundsInARow: 1 });
    expect(outcome.hpAfter).toBe(1);
    expect(outcome.unconscious).toBe(true);
    expect(outcome.unconsciousReason).toBe('floor');
  });

  /**
   * RAW says „spadną poniżej 0", not „poniżej 1" — damage landing exactly on
   * zero is an ordinary Mortal Wound, not a blackout. Implemented literally.
   */
  it('lets damage landing exactly on 0 through as a normal mortal wound', () => {
    const outcome = resolveCpredChoke({ body: 8, hpCurrent: 8, hpMax: 40, roundsInARow: 1 });
    expect(outcome.hpAfter).toBe(0);
    expect(outcome.unconscious).toBe(false);
    expect(outcome.woundAfter).toBe('mortal');
  });

  it('does not protect a target already down to 1 HP', () => {
    const outcome = resolveCpredChoke({ body: 8, hpCurrent: 1, hpMax: 40, roundsInARow: 1 });
    expect(outcome.hpAfter).toBe(0);
    expect(outcome.unconscious).toBe(false);
  });

  it('knocks out on the third round in a row whatever the HP say', () => {
    const outcome = resolveCpredChoke({
      body: 2,
      hpCurrent: 40,
      hpMax: 40,
      roundsInARow: CPRED_CHOKE_ROUNDS_TO_UNCONSCIOUS,
    });
    expect(outcome.hpAfter).toBe(38);
    expect(outcome.unconscious).toBe(true);
    expect(outcome.unconsciousReason).toBe('streak');
  });

  it('counts rounds in a row, and starts over after a round off', () => {
    expect(nextCpredChokeStreak(null, 3, 0)).toBe(1);
    expect(nextCpredChokeStreak(3, 4, 1)).toBe(2);
    expect(nextCpredChokeStreak(4, 5, 2)).toBe(3);
    // Round 6 skipped: the count restarts rather than resuming.
    expect(nextCpredChokeStreak(5, 7, 3)).toBe(1);
    // Two squeezes inside one round must not count as two rounds.
    expect(nextCpredChokeStreak(5, 5, 2)).toBe(2);
  });
});

describe('Rzut', () => {
  it('deals BODY without armor and can kill — no floor here', () => {
    const outcome = resolveCpredThrow({ body: 12, hpCurrent: 5, hpMax: 40 });
    expect(outcome.damage).toBe(12);
    expect(outcome.hpAfter).toBe(0);
    expect(outcome.woundAfter).toBe('mortal');
  });
});

describe('Ludzka tarcza', () => {
  it('covers ranged attacks that are not aimed at the head', () => {
    expect(cpredHumanShieldCovers({ melee: false, aimedAtHead: false })).toBe(true);
  });

  it('covers neither melee nor an aimed head shot', () => {
    expect(cpredHumanShieldCovers({ melee: true, aimedAtHead: false })).toBe(false);
    expect(cpredHumanShieldCovers({ melee: false, aimedAtHead: true })).toBe(false);
  });
});
