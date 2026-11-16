import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, parseCharacterData } from './character.js';
import {
  CPRED_CRYO_REFILL_PRICE,
  cpredCryopumpCapacity,
  cpredCryopumpCharges,
  cpredIsCryopump,
  readCpredCryo,
} from './cryo.js';

/** Etap 71d2 (G19, MED-17) — kriopompa z ładunkami i stan „w kriośnie” (s. 150, s. 353). */

const registry = buildCpredRegistry({ skills: [] }, { roles: [] });

describe('MED-17 kriopompa', () => {
  it('ładunki: 1, a przy 4 i 5 punktach Obsługi kriosystemów — 2 i 3', () => {
    expect([0, 1, 2, 3, 4, 5].map(cpredCryopumpCapacity)).toEqual([1, 1, 1, 1, 2, 3]);
    expect(cpredCryopumpCharges({}, 4)).toBe(2);
    expect(cpredCryopumpCharges({ cryoUsed: 1 }, 4)).toBe(1);
    expect(cpredCryopumpCharges({ cryoUsed: 2 }, 1)).toBe(0);
  });

  it('pompę poznaje się po wpisie albo po nazwie', () => {
    expect(cpredIsCryopump({ compendiumId: 'gear.kriopompa', name: 'Walizka Kiry' })).toBe(true);
    expect(cpredIsCryopump({ name: ' kriopompa ' })).toBe(true);
    expect(cpredIsCryopump({ name: 'Latarka' })).toBe(false);
  });

  it('uzupełnienie: 50 ed z pasma Drogie razy cennik drobnego sprzętu', () => {
    expect(CPRED_CRYO_REFILL_PRICE).toBe(150);
  });

  it('licznik ładunków zostaje tylko na pompie; stara karta czyta się bez pól kriosystemów', () => {
    const sheet = parseCharacterData(
      JSON.stringify({
        ...createDefaultCharacterData(),
        gear: [
          { id: 'g1', name: 'Kriopompa', notes: '', qty: 1, cryoUsed: 1 },
          { id: 'g2', name: 'Latarka', notes: '', qty: 1, cryoUsed: 1 },
        ],
        cryoPumpGranted: undefined,
        cryo: undefined,
      }),
      registry,
    );
    expect(sheet.gear[0]!.cryoUsed).toBe(1);
    expect(sheet.gear[1]!.cryoUsed).toBeUndefined();
    expect(sheet.cryo).toBeNull();
    expect(sheet.cryoPumpGranted).toBe(false);
  });

  it('stan „w kriośnie”: czytnik odrzuca śmieci, termin tylko dodatni', () => {
    expect(readCpredCryo({ by: 'Kira', byCharacterId: 'c1', expiresAtMinute: 100 })).toEqual({
      by: 'Kira',
      byCharacterId: 'c1',
      expiresAtMinute: 100,
    });
    expect(readCpredCryo({ by: 'Kira' })).toBeNull();
    expect(readCpredCryo({ by: 'Kira', byCharacterId: 'c1', expiresAtMinute: -5 })).toEqual({
      by: 'Kira',
      byCharacterId: 'c1',
    });
  });
});
