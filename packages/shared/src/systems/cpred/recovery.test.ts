import { describe, expect, it } from 'vitest';
import {
  cpredApplyAntibiotic,
  cpredHealRate,
  cpredRestDay,
  CPRED_ANTIBODIES_CYBERWARE,
  type CpredRestSheet,
} from './recovery.js';
import { createDefaultCharacterData, CPRED_ANTIBIOTIC_DAYS } from './character.js';
import type { CpredArmorRow, CpredCyberwareRow } from './character.js';
import { hpMax } from './derived.js';

/**
 * Karta do odpoczynku: BC 7 i SW 6 dają 40 PW (`hpMax`), więc jeden dzień
 * leczy 7 i widać, że nie doszło się do maksimum przypadkiem.
 */
function sheet(patch: Partial<CpredRestSheet> = {}): CpredRestSheet {
  const base = createDefaultCharacterData();
  const stats = { ...base.stats, body: 7, will: 6 };
  return {
    stats,
    statBlock: null,
    hpCurrent: 10,
    armor: [],
    cyberware: [],
    recovery: { stabilized: true, antibioticDays: 0 },
    ...patch,
    ...(patch.stats ? { stats: patch.stats } : {}),
  };
}

function chrome(name: string): CpredCyberwareRow {
  return { id: `cw-${name}`, name, notes: '' };
}

function armor(name: string, sp: number, spCurrent: number): CpredArmorRow {
  return { id: `ar-${name}`, name, notes: '', sp, spCurrent, location: 'body' };
}

describe('tempo naturalnego leczenia (s. 222)', () => {
  it('jeden dzień odpoczynku wraca tyle PW, ile wynosi Budowa Ciała', () => {
    const rate = cpredHealRate(sheet());
    expect(rate.perDay).toBe(7);
    expect(rate.sources.map((row) => row.label)).toEqual(['Budowa Ciała 7']);
  });

  it('„Ulepszone przeciwciała" podwajają tempo (s. 362)', () => {
    const rate = cpredHealRate(sheet({ cyberware: [chrome(CPRED_ANTIBODIES_CYBERWARE)] }));
    expect(rate.perDay).toBe(14);
    expect(rate.sources[0]?.label).toContain('× 2');
  });

  it('chrom dopasowuje się po nazwie bez względu na wielkość liter i spacje', () => {
    expect(cpredHealRate(sheet({ cyberware: [chrome('  ulepszone PRZECIWCIAŁA ')] })).perDay).toBe(
      14,
    );
  });

  it('Antybiotyk dokłada 2 PW i mówi, ile dni zostało (s. 150)', () => {
    const rate = cpredHealRate(sheet({ recovery: { stabilized: true, antibioticDays: 3 } }));
    expect(rate.perDay).toBe(9);
    expect(rate.sources[1]?.label).toContain('zostało dni: 3');
  });

  it('chrom i antybiotyk sumują się', () => {
    const rate = cpredHealRate(
      sheet({
        cyberware: [chrome(CPRED_ANTIBODIES_CYBERWARE)],
        recovery: { stabilized: true, antibioticDays: 7 },
      }),
    );
    expect(rate.perDay).toBe(16);
  });
});

describe('dzień odpoczynku (s. 222–223)', () => {
  it('leczy BC i zapisuje nowe PW w łatce', () => {
    const result = cpredRestDay(sheet());
    expect(result.refusal).toBeNull();
    expect(result.healed).toBe(7);
    expect(result.hpAfter).toBe(17);
    expect(result.patch.hpCurrent).toBe(17);
  });

  it('bez Ustabilizowania nie daje nic — „aby rozpocząć proces…" (s. 222)', () => {
    const result = cpredRestDay(sheet({ recovery: { stabilized: false, antibioticDays: 0 } }));
    expect(result.refusal).toBe('notStabilized');
    expect(result.healed).toBe(0);
    expect(result.patch).toEqual({});
  });

  it('nie leczy ponad maksimum i wtedy kończy proces', () => {
    const data = sheet({ hpCurrent: hpMax(sheet().stats) - 2 });
    const result = cpredRestDay(data);
    expect(result.hpAfter).toBe(hpMax(data.stats));
    expect(result.healed).toBe(2);
    // Komplet PW zamyka proces: kolejne rany to kolejne Ustabilizowanie.
    expect(result.patch.recovery).toEqual({ stabilized: false, antibioticDays: 0 });
  });

  it('postaci z kompletem PW odmawia bez zmiany karty', () => {
    const data = sheet({ hpCurrent: hpMax(sheet().stats) });
    const result = cpredRestDay(data);
    expect(result.refusal).toBe('alreadyFull');
    expect(result.patch).toEqual({});
  });

  it('odlicza dzień antybiotyku i melduje jego koniec', () => {
    const result = cpredRestDay(sheet({ recovery: { stabilized: true, antibioticDays: 1 } }));
    expect(result.healed).toBe(9);
    expect(result.patch.recovery).toEqual({ stabilized: true, antibioticDays: 0 });
    expect(result.antibioticEnded).toBe(true);
  });

  it('nadwyrężenie zabiera PW dnia, ustabilizowanie i antybiotyk (s. 223)', () => {
    const result = cpredRestDay(sheet({ recovery: { stabilized: true, antibioticDays: 5 } }), {
      strained: true,
    });
    expect(result.refusal).toBe('strained');
    expect(result.healed).toBe(0);
    expect(result.patch.recovery).toEqual({ stabilized: false, antibioticDays: 0 });
  });

  it('nadwyrężenie u kogoś, kto i tak nie był ustabilizowany, nie pisze nic', () => {
    const result = cpredRestDay(sheet({ recovery: { stabilized: false, antibioticDays: 0 } }), {
      strained: true,
    });
    expect(result.refusal).toBe('strained');
    expect(result.patch).toEqual({});
  });
});

describe('pancerz zrastający się sam (s. 363)', () => {
  it('Splot skórny odzyskuje 1 OB za dzień odpoczynku', () => {
    const result = cpredRestDay(sheet({ armor: [armor('Splot skórny', 7, 4)] }));
    expect(result.armorRepaired).toEqual([{ name: 'Splot skórny', from: 4, to: 5 }]);
    expect(result.patch.armor?.[0]?.spCurrent).toBe(5);
  });

  it('nie podnosi OB ponad wartość nieuszkodzonego pancerza', () => {
    const result = cpredRestDay(sheet({ armor: [armor('Pancerz podskórny', 11, 11)] }));
    expect(result.armorRepaired).toEqual([]);
    expect(result.patch.armor).toBeUndefined();
  });

  it('zwykła kurtka nie zrasta się sama', () => {
    const result = cpredRestDay(sheet({ armor: [armor('Kurtka kuloodporna', 11, 3)] }));
    expect(result.armorRepaired).toEqual([]);
    expect(result.patch.armor).toBeUndefined();
  });

  it('dzień bez leczenia PW nie naprawia też pancerza', () => {
    const result = cpredRestDay(
      sheet({
        recovery: { stabilized: false, antibioticDays: 0 },
        armor: [armor('Splot skórny', 7, 4)],
      }),
    );
    expect(result.armorRepaired).toEqual([]);
  });
});

describe('dawka Antybiotyku (s. 150)', () => {
  it('ustawia tydzień', () => {
    expect(cpredApplyAntibiotic({ stabilized: true, antibioticDays: 0 })).toEqual({
      stabilized: true,
      antibioticDays: CPRED_ANTIBIOTIC_DAYS,
    });
  });

  it('druga dawka nie kumuluje się — wraca siedem, nie czternaście', () => {
    expect(cpredApplyAntibiotic({ stabilized: true, antibioticDays: 5 }).antibioticDays).toBe(
      CPRED_ANTIBIOTIC_DAYS,
    );
  });

  it('nie zaczyna sama procesu leczenia', () => {
    expect(cpredApplyAntibiotic({ stabilized: false, antibioticDays: 0 }).stabilized).toBe(false);
  });
});
