import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, type CpredRegistry } from './character.js';
import { planCpredRoll } from './rolls.js';

/**
 * Trzy rzuty, które etap 30d dokłada do planera, plus dodatek Moto do sześciu
 * Testów (s. 144, 151, 161).
 *
 * Sprawdzamy to, czego nie widać po samych tabelach: że Efekt Charyzmy rzuca
 * **samą rangą** (bez Cechy i bez Umiejętności), że Test Rzetelności nie jest
 * Testem (nie ma kary za rany, nie eksploduje i nie przyjmuje Szczęścia) i że
 * Moto dokłada się dokładnie tam, gdzie każe podręcznik.
 */

const registry: CpredRegistry = buildCpredRegistry(
  {
    skills: [
      { id: 'driving', name: 'Prowadzenie pojazdów', stat: 'ref' },
      { id: 'sea-vehicle-tech', name: 'Naprawa pojazdów wodnych', stat: 'tech' },
      { id: 'handgun', name: 'Broń krótka', stat: 'ref' },
    ],
  },
  {
    roles: [
      { id: 'rockerboy', name: 'Rocker', ability: 'Efekt Charyzmy' },
      { id: 'media', name: 'Media', ability: 'Wiarygodność' },
      { id: 'nomad', name: 'Nomada', ability: 'Moto' },
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
    ],
  },
);

function sheet(roleId: string | null, rank: number, extra: Record<string, unknown> = {}) {
  return { ...createDefaultCharacterData(), roleId, roleAbilityRank: rank, ...extra };
}

describe('Test Efektu Charyzmy', () => {
  it('rzuca samą rangą — bez Cechy i bez Umiejętności', () => {
    const planned = planCpredRoll(sheet('rockerboy', 4), registry, {
      kind: 'charisma',
      charismaAudience: 'single',
      charismaPurpose: 'favour',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown).toEqual([
      { label: 'Efekt Charyzmy 4', value: 4, kind: 'skill' },
    ]);
    expect(planned.plan.modifierTotal).toBe(4);
    expect(planned.plan.charisma).toEqual({
      dv: 8,
      audience: 'single',
      purpose: 'favour',
      effect: expect.stringContaining('dużą przysługę'),
    });
    // To Test, więc dziesiątka eksploduje i rany bolą.
    expect(planned.plan.checkRule).toBe(true);
  });

  it('PT rośnie z publicznością: 8, 10, 12', () => {
    for (const [audience, dv] of [
      ['single', 8],
      ['small', 10],
      ['large', 12],
    ] as const) {
      const planned = planCpredRoll(sheet('rockerboy', 6), registry, {
        kind: 'charisma',
        charismaAudience: audience,
        charismaPurpose: 'favour',
      });
      expect(planned.ok && planned.plan.charisma?.dv).toBe(dv);
    }
  });

  it('prośba do dużej grupy przy randze 2 nie dochodzi do kości', () => {
    const planned = planCpredRoll(sheet('rockerboy', 2), registry, {
      kind: 'charisma',
      charismaAudience: 'large',
      charismaPurpose: 'favour',
    });
    expect(planned).toEqual({ ok: false, error: 'NO_CROWD' });
  });

  it('ale nowych fanów robi się na każdym poziomie', () => {
    const planned = planCpredRoll(sheet('rockerboy', 1), registry, {
      kind: 'charisma',
      charismaAudience: 'large',
      charismaPurpose: 'fans',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.charisma?.effect).toBe('');
    expect(planned.plan.title).toContain('nowi fani');
  });

  it('karta bez tej Roli nie ma czym rzucić', () => {
    const planned = planCpredRoll(sheet('solo', 8), registry, {
      kind: 'charisma',
      charismaAudience: 'single',
      charismaPurpose: 'favour',
    });
    expect(planned).toEqual({ ok: false, error: 'NO_ABILITY' });
  });

  it('rany i modyfikator MG wchodzą jak do każdego Testu', () => {
    const planned = planCpredRoll(
      sheet('rockerboy', 5, { hpCurrent: 10 }), // 35 PW → poważna rana
      registry,
      { kind: 'charisma', charismaAudience: 'small', charismaPurpose: 'favour', modifier: 2 },
    );
    expect(planned.ok && planned.plan.modifierTotal).toBe(5);
  });
});

describe('Test Rzetelności', () => {
  it('to goła kość przeciw szansie z rangi — bez kary za rany i bez eksplozji', () => {
    const planned = planCpredRoll(sheet('media', 7, { hpCurrent: 1 }), registry, {
      kind: 'reliability',
      reliabilityProof: 'none',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.breakdown).toEqual([]);
    expect(planned.plan.modifierTotal).toBe(0);
    expect(planned.plan.checkRule).toBe(false);
    expect(planned.plan.reliability).toEqual({ chance: 5, proof: 'none', base: 5 });
  });

  it('dowody podnoszą szansę, nie rzut', () => {
    const planned = planCpredRoll(sheet('media', 3), registry, {
      kind: 'reliability',
      reliabilityProof: 'irrefutable',
    });
    expect(planned.ok && planned.plan.reliability).toEqual({
      chance: 6,
      proof: 'irrefutable',
      base: 3,
    });
  });

  it('Szczęścia użyć nie wolno (s. 152)', () => {
    const planned = planCpredRoll(sheet('media', 3), registry, {
      kind: 'reliability',
      luckSpent: 1,
    });
    expect(planned).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('nie-Media nie ma Wiarygodności do rzucenia', () => {
    expect(planCpredRoll(sheet('nomad', 3), registry, { kind: 'reliability' })).toEqual({
      ok: false,
      error: 'NO_ABILITY',
    });
  });
});

describe('Pogłoski', () => {
  it('to Wiarygodność + 1k10, czyli Test jak każdy inny', () => {
    const planned = planCpredRoll(sheet('media', 6), registry, { kind: 'rumour' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.title).toBe('Pogłoski');
    expect(planned.plan.modifierTotal).toBe(6);
    expect(planned.plan.checkRule).toBe(true);
    expect(planned.plan.rumour).toEqual({ rank: 6 });
  });
});

describe('Moto w Testach Umiejętności', () => {
  it('dokłada poziom do Prowadzenia i do Naprawy pojazdów wodnych', () => {
    const nomad = sheet('nomad', 3, { skills: { driving: 6, 'sea-vehicle-tech': 2 } });
    const driving = planCpredRoll(nomad, registry, { kind: 'skill', skillId: 'driving' });
    expect(driving.ok).toBe(true);
    if (!driving.ok) return;
    expect(driving.plan.breakdown.map((entry) => entry.label)).toContain('Moto 3');
    expect(driving.plan.modifierTotal).toBe(5 + 6 + 3);

    const repair = planCpredRoll(nomad, registry, { kind: 'skill', skillId: 'sea-vehicle-tech' });
    expect(repair.ok && repair.plan.modifierTotal).toBe(5 + 2 + 3);
  });

  it('nie dokłada się do niczego poza szóstką z podręcznika', () => {
    const nomad = sheet('nomad', 3, { skills: { handgun: 4 } });
    const shot = planCpredRoll(nomad, registry, { kind: 'skill', skillId: 'handgun' });
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.plan.breakdown.map((entry) => entry.label)).not.toContain('Moto 3');
    expect(shot.plan.modifierTotal).toBe(5 + 4);
  });

  it('i nie dokłada się z cudzej karty', () => {
    const solo = sheet('solo', 9, { skills: { driving: 6 } });
    const driving = planCpredRoll(solo, registry, { kind: 'skill', skillId: 'driving' });
    expect(driving.ok && driving.plan.modifierTotal).toBe(5 + 6);
  });
});
