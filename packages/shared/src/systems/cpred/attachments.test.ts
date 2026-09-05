import { describe, expect, it } from 'vitest';
import {
  CPRED_ATTACHMENT_GROUP_MAGAZINE,
  attachmentAttackModifiers,
  attachmentFitsWeapon,
  attachmentMountProblem,
  attachmentOptionsFor,
  attachmentRangedBonusApplies,
  attachmentSlotCost,
  attachmentSlotsFree,
  attachmentSlotsUsed,
  attachmentIgnoresObscurement,
  describeAttachment,
  hasRequiredCyberware,
  secondaryAttachments,
  weaponConcealableWith,
  weaponMagazineKind,
  weaponMagazineWith,
  type CpredAttachmentProfile,
} from './attachments.js';
import { fittedAttachmentsFor, type ResolvedWeapon } from './compendium.js';

/** A long arm with three slots — the row every printed attachment fits. */
function rifle(patch: Partial<ResolvedWeapon> = {}): ResolvedWeapon {
  return {
    damage: '5k6',
    magazine: 25,
    magazineExtended: 35,
    magazineDrum: 45,
    rof: 1,
    hands: 2,
    concealable: false,
    attachmentSlots: 3,
    skillId: 'shoulder-arms',
    melee: false,
    ...patch,
  };
}

function attachment(patch: Partial<CpredAttachmentProfile> = {}): CpredAttachmentProfile {
  return { id: 'attachment.x', name: 'Dodatek', fit: {}, ...patch };
}

const BAYONET = attachment({
  id: 'attachment.bayonet',
  name: 'Bagnet',
  fit: { skillIds: ['shoulder-arms'] },
  blocksConcealment: true,
  secondary: { weaponTypeId: 'weapon-type.light-melee' },
});

const DRUM = attachment({
  id: 'attachment.drum-magazine',
  name: 'Magazynek bębnowy',
  fit: { notSkillIds: ['archery'], needsMagazine: true },
  magazine: 'drum',
  exclusiveGroup: CPRED_ATTACHMENT_GROUP_MAGAZINE,
  blocksConcealment: true,
});

const EXTENDED = attachment({
  id: 'attachment.extended-magazine',
  name: 'Wydłużony magazynek',
  fit: { notSkillIds: ['archery'], needsMagazine: true },
  magazine: 'extended',
  exclusiveGroup: CPRED_ATTACHMENT_GROUP_MAGAZINE,
  blocksConcealment: true,
});

const LAUNCHER = attachment({
  id: 'attachment.underbarrel-grenade-launcher',
  name: 'Granatnik podwieszany',
  fit: { skillIds: ['shoulder-arms'] },
  slots: 2,
  blocksConcealment: true,
  secondary: { weaponTypeId: 'weapon-type.grenade-launcher', magazine: 1 },
});

const SMARTGUN = attachment({
  id: 'attachment.smartgun-link',
  name: 'Złącze smartguna',
  slots: 2,
  attackBonus: 1,
  requiresCyberware: ['Złącza interfejsu', 'Uchwyt podskórny'],
});

const SCOPE = attachment({
  id: 'attachment.sniper-scope',
  name: 'Snajperska luneta celownicza',
  rangedBonus: { bonus: 1, minMetres: 51, singleOnly: true, whenAimed: true },
});

const NIGHT_SIGHT = attachment({
  id: 'attachment.night-sight',
  name: 'Celownik noktowizyjny',
  ignoresObscurement: true,
});

describe('what fits what', () => {
  it('lets a Broń długa weapon take a bayonet and refuses a pistol one', () => {
    expect(attachmentFitsWeapon(BAYONET, rifle())).toBe(true);
    expect(attachmentFitsWeapon(BAYONET, rifle({ skillId: 'handgun' }))).toBe(false);
  });

  it('refuses everything on an exotic, because the catalogue gives it no slots', () => {
    // „nie da się ich wyposażyć w Dodatki" (s. 92) is expressed as
    // `attachmentSlots: 0` in the data, so no rule about exotics is needed here.
    expect(attachmentFitsWeapon(SCOPE, rifle({ attachmentSlots: 0 }))).toBe(false);
  });

  it('refuses everything on a melee weapon', () => {
    expect(attachmentFitsWeapon(SCOPE, rifle({ melee: true }))).toBe(false);
  });

  it('refuses a magazine on a bow and on a weapon that counts no rounds', () => {
    const bow = rifle({ skillId: 'archery', magazine: null });
    expect(attachmentFitsWeapon(DRUM, bow)).toBe(false);
    expect(attachmentFitsWeapon(DRUM, rifle({ magazine: null }))).toBe(false);
  });

  it('has nothing to say about a row with no catalogue entry', () => {
    expect(attachmentFitsWeapon(SCOPE, null)).toBe(false);
  });
});

describe('slots', () => {
  it('charges one slot by default and two when the row says so', () => {
    expect(attachmentSlotCost(BAYONET)).toBe(1);
    expect(attachmentSlotCost(LAUNCHER)).toBe(2);
  });

  it('adds them up and counts what is left', () => {
    expect(attachmentSlotsUsed([BAYONET, LAUNCHER])).toBe(3);
    expect(attachmentSlotsFree(rifle(), [BAYONET, LAUNCHER])).toBe(0);
    expect(attachmentSlotsFree(rifle(), [BAYONET])).toBe(2);
  });

  it('refuses a two-slot attachment when only one slot is left', () => {
    expect(attachmentMountProblem(SMARTGUN, rifle(), [BAYONET, SCOPE])).toBe('ATTACHMENT_NO_SLOTS');
  });

  it('never lets a weapon claim more than the rulebook’s three', () => {
    expect(attachmentSlotsFree(rifle({ attachmentSlots: 9 }), [])).toBe(3);
  });
});

describe('what may not be doubled', () => {
  it('refuses a second copy of the same attachment', () => {
    // „Efekty dwóch jednakowych dodatków nie kumulują się" (s. 342) — refused
    // at the moment of mounting rather than ignored later, so nobody pays twice.
    expect(attachmentMountProblem(SCOPE, rifle(), [SCOPE])).toBe('ATTACHMENT_ALREADY_FITTED');
  });

  it('refuses a second magazine of any kind', () => {
    expect(attachmentMountProblem(EXTENDED, rifle(), [DRUM])).toBe('ATTACHMENT_GROUP_TAKEN');
  });

  it('offers only what could still go on', () => {
    const catalogue = [BAYONET, DRUM, EXTENDED, LAUNCHER, SMARTGUN, SCOPE];
    const options = attachmentOptionsFor(catalogue, rifle(), [DRUM]);
    expect(options.map((entry) => entry.id)).toEqual([
      BAYONET.id,
      LAUNCHER.id,
      SMARTGUN.id,
      SCOPE.id,
    ]);
  });
});

describe('the magazine table', () => {
  it('swaps in the column the attachment names', () => {
    expect(weaponMagazineWith(rifle(), [])).toBe(25);
    expect(weaponMagazineWith(rifle(), [EXTENDED])).toBe(35);
    expect(weaponMagazineWith(rifle(), [DRUM])).toBe(45);
    expect(weaponMagazineKind([DRUM])).toBe('drum');
    expect(weaponMagazineKind([])).toBe('standard');
  });

  it('keeps the standard magazine for a type the table forgot', () => {
    const odd = rifle({ magazineExtended: undefined, magazineDrum: undefined });
    expect(weaponMagazineWith(odd, [DRUM])).toBe(25);
  });

  it('leaves a weapon that counts no rounds alone', () => {
    expect(weaponMagazineWith(rifle({ magazine: null }), [DRUM])).toBeNull();
  });
});

describe('hiding the gun', () => {
  it('takes concealment away as soon as one attachment says so', () => {
    const pistol = rifle({ concealable: true, skillId: 'handgun' });
    expect(weaponConcealableWith(pistol, [])).toBe(true);
    expect(weaponConcealableWith(pistol, [DRUM])).toBe(false);
  });

  it('does not make an unconcealable weapon concealable', () => {
    expect(weaponConcealableWith(rifle(), [])).toBe(false);
  });
});

describe('the smartgun link', () => {
  const shot = { metres: 10, single: true, aimed: false };

  it('adds nothing to somebody with no chrome to plug into', () => {
    expect(attachmentAttackModifiers([SMARTGUN], shot)).toEqual([]);
  });

  it('adds +1 once the interface plugs are in', () => {
    expect(
      attachmentAttackModifiers([SMARTGUN], { ...shot, cyberware: ['Złącza interfejsu'] }),
    ).toEqual([{ label: 'Złącze smartguna', value: 1, kind: 'situational' }]);
  });

  it('accepts either of the two pieces the rulebook names', () => {
    expect(hasRequiredCyberware(SMARTGUN.requiresCyberware, ['Uchwyt podskórny'])).toBe(true);
    expect(hasRequiredCyberware(SMARTGUN.requiresCyberware, ['Sprzęg neuralny'])).toBe(false);
  });

  it('matches the name however it was capitalised', () => {
    // Umowa z 30c: dopasowania po nazwie robi się na `trim().toLowerCase()`.
    expect(hasRequiredCyberware(['Złącza interfejsu'], ['  złącza INTERFEJSU '])).toBe(true);
  });

  it('adds nothing to a swing — „wykonując atak dystansowy smartgunem"', () => {
    const melee = { ...shot, melee: true, cyberware: ['Złącza interfejsu'] };
    expect(attachmentAttackModifiers([SMARTGUN], melee)).toEqual([]);
  });
});

describe('the sniper scope', () => {
  const bonus = SCOPE.rangedBonus!;

  it('pays at 51 m with a single shot and not at 50', () => {
    expect(attachmentRangedBonusApplies(bonus, { metres: 51, single: true, aimed: false })).toBe(
      true,
    );
    expect(attachmentRangedBonusApplies(bonus, { metres: 50, single: true, aimed: false })).toBe(
      false,
    );
  });

  it('refuses a burst however far away the target is', () => {
    expect(attachmentRangedBonusApplies(bonus, { metres: 300, single: false, aimed: false })).toBe(
      false,
    );
  });

  it('pays for an Aimed Shot at any distance — the sentence’s other half', () => {
    expect(attachmentRangedBonusApplies(bonus, { metres: 3, single: true, aimed: true })).toBe(
      true,
    );
  });
});

describe('the night sight', () => {
  it('says it sees through smoke and the dark', () => {
    expect(attachmentIgnoresObscurement([NIGHT_SIGHT])).toBe(true);
    expect(attachmentIgnoresObscurement([SCOPE])).toBe(false);
  });
});

describe('the second weapon', () => {
  it('picks out the attachments that bolt one on', () => {
    expect(secondaryAttachments([BAYONET, SCOPE, LAUNCHER]).map((e) => e.id)).toEqual([
      BAYONET.id,
      LAUNCHER.id,
    ]);
  });
});

describe('the sheet’s one-line summary', () => {
  it('assembles the sentence from the flags rather than the description', () => {
    expect(describeAttachment(LAUNCHER)).toBe('2 gniazda · druga broń · broni nie da się ukryć');
    expect(describeAttachment(DRUM)).toBe('1 gniazdo · magazynek bębnowy · broni nie da się ukryć');
    expect(describeAttachment(SCOPE)).toBe('1 gniazdo · +1 do Testu (od 51 m lub przy Celowaniu)');
  });
});

describe('a hand-edited attachment list', () => {
  // `attachmentIds` jedzie zwykłą łatą karty jak nazwa broni, więc gracz może
  // tam wpisać, co zechce. Reguły montażu stoją po stronie **odczytu**: lista,
  // której nie dałoby się zamontować, po prostu nie daje tego, czego nie ma.
  const catalogue = [BAYONET, DRUM, EXTENDED, LAUNCHER, SMARTGUN, SCOPE];

  it('drops an id the catalogue no longer knows, and frees its slot', () => {
    const fitted = fittedAttachmentsFor(['attachment.gone', SCOPE.id], catalogue, rifle());
    expect(fitted.map((entry) => entry.id)).toEqual([SCOPE.id]);
  });

  it('keeps only the first of two magazines', () => {
    const fitted = fittedAttachmentsFor([DRUM.id, EXTENDED.id], catalogue, rifle());
    expect(fitted.map((entry) => entry.id)).toEqual([DRUM.id]);
  });

  it('drops what would not fit this weapon at all', () => {
    const fitted = fittedAttachmentsFor(
      [BAYONET.id, SCOPE.id],
      catalogue,
      rifle({
        skillId: 'handgun',
      }),
    );
    expect(fitted.map((entry) => entry.id)).toEqual([SCOPE.id]);
  });

  it('stops at three slots however long the list is', () => {
    const fitted = fittedAttachmentsFor([LAUNCHER.id, SMARTGUN.id, SCOPE.id], catalogue, rifle());
    // Granatnik 2 + luneta 1 = trzy; smartgun (2) nie ma się gdzie zmieścić.
    expect(fitted.map((entry) => entry.id)).toEqual([LAUNCHER.id, SCOPE.id]);
  });

  it('gives an exotic nothing, whatever its sheet says', () => {
    expect(fittedAttachmentsFor([SCOPE.id], catalogue, rifle({ attachmentSlots: 0 }))).toEqual([]);
  });
});
