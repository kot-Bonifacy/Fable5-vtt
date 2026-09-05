import { describe, expect, it } from 'vitest';
import type { CpredHotbarWeaponSlot } from '@vtt/shared';
import { hudSignature, type HudContext } from './hud.js';

/**
 * Strażnik sygnatury paska akcji (błąd #5 z sesji testów walki 08.08).
 *
 * Pasek nie przerysowuje się na każdą zmianę sklepów — sklepy zmieniają się
 * w tempie wskaźnika, a pasek kilka razy na turę. Różnicę robi `hudSignature`,
 * i dlatego wszystko, co ze slotu **widać**, musi w niej być. Chip naboju nie
 * był: po zmianie amunicji w broni bez magazynka (granat, `ammoMax = 0`)
 * zmieniał się wyłącznie on, sygnatura zostawała ta sama i chip pojawiał się
 * dopiero po przeładowaniu strony. Strzelba maskowała błąd, bo przy okazji
 * przeładowania zmieniał się licznik magazynka.
 */

function slot(patch: Partial<CpredHotbarWeaponSlot> = {}): CpredHotbarWeaponSlot {
  return {
    kind: 'weapon',
    icon: 'pistol',
    id: 'weapon:w-grenade:single',
    label: 'Puszka hukowa',
    modeLabel: '',
    hint: '',
    weaponRowId: 'w-grenade',
    attachmentId: null,
    mode: 'single',
    melee: false,
    pointTarget: true,
    thrown: true,
    ammo: null,
    ammoLabel: null,
    coneRangeM: null,
    disabled: null,
    key: '1',
    ...patch,
  };
}

function context(slots: CpredHotbarWeaponSlot[]): HudContext {
  return {
    token: null,
    combatant: null,
    turn: null,
    slots,
    groups: [],
    vitals: null,
    acting: false,
    isGm: true,
    isActiveTurn: true,
    refusal: null,
    sheetNotMine: false,
    injuries: [],
    figureSkills: [],
    statEffects: [],
    steering: false,
  };
}

describe('sygnatura paska akcji (błąd #5)', () => {
  it('widzi zmianę naboju w broni bez magazynka', () => {
    const before = hudSignature(context([slot()]));
    const after = hudSignature(context([slot({ ammoLabel: 'Gaz łzawiący' })]));
    expect(after).not.toBe(before);
  });

  it('widzi zmianę licznika magazynka', () => {
    const full = hudSignature(context([slot({ ammo: { current: 8, max: 8 } })]));
    const spent = hudSignature(context([slot({ ammo: { current: 5, max: 8 } })]));
    expect(spent).not.toBe(full);
  });

  it('widzi stożek śrutu, który zmienia sens tego samego przycisku', () => {
    const bullet = hudSignature(context([slot({ ammoLabel: 'Amunicja śrutowa' })]));
    const cone = hudSignature(context([slot({ ammoLabel: 'Amunicja śrutowa', coneRangeM: 6 })]));
    expect(cone).not.toBe(bullet);
  });

  it('nie zmienia się, gdy nic widocznego się nie zmieniło', () => {
    expect(hudSignature(context([slot()]))).toBe(hudSignature(context([slot()])));
  });
});
