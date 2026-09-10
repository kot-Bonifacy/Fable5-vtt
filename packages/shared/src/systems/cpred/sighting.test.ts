import { describe, expect, it } from 'vitest';
import {
  CPRED_SIGHTING_BARE_HEAD,
  cpredCyberwareShowsOutside,
  cpredHeadIsArmored,
  cpredSighting,
  cpredSightingLine,
} from './sighting.js';
import {
  createDefaultCharacterData,
  cpredDrawnWeapons,
  cpredHandsAreDeclared,
  cpredWeaponInHands,
  type CpredArmorRow,
  type CpredCharacterData,
  type CpredCyberwareRow,
  type CpredWeaponRow,
} from './character.js';

/**
 * Etap 41: co jedna figura widzi na drugiej.
 *
 * Testy pilnują przede wszystkim **granicy między warstwami**, bo to ona jest
 * całą treścią tego modułu: rzut oka ma nie zdradzić liczby, a oględziny mają
 * ją podać. Drugi obszar to ręce: „nikt nie pytał" i „puste ręce" to dwa różne
 * stany, i tylko drugi z nich czegokolwiek zabrania.
 */

function weapon(overrides: Partial<CpredWeaponRow> = {}): CpredWeaponRow {
  return {
    id: 'w1',
    name: 'Militech Ronin',
    notes: '',
    damage: '5k6',
    ammoCurrent: 12,
    ammoMax: 25,
    ammoType: 'Karabinowa',
    rof: '1',
    ...overrides,
  };
}

function armor(overrides: Partial<CpredArmorRow> = {}): CpredArmorRow {
  return {
    id: 'a1',
    name: 'Hełm bojowy',
    notes: '',
    sp: 11,
    spCurrent: 7,
    location: 'head',
    ...overrides,
  };
}

function chrome(overrides: Partial<CpredCyberwareRow> = {}): CpredCyberwareRow {
  return {
    id: 'c1',
    name: 'Cyberręka Arasaki',
    notes: '',
    type: 'cyberlimb',
    ...overrides,
  };
}

function sheet(overrides: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return { ...createDefaultCharacterData(), ...overrides };
}

describe('ręce: trzy stany, nie dwa', () => {
  it('karta, której nikt nie pytał, pokazuje pierwszą broń z listy', () => {
    const data = sheet({ weapons: [weapon(), weapon({ id: 'w2', name: 'Zgrzyt 9' })] });
    expect(cpredDrawnWeapons(data).map((row) => row.id)).toEqual(['w1']);
  });

  it('ale niepytana karta niczego nie zabrania — domysł nie jest deklaracją', () => {
    // Decyzja MG z 10.09.2026: pierwsza broń z karty służy do **pokazywania**.
    // Zakaz wyprowadzony z domysłu byłby regułą, której nie ustalił nikt przy stole.
    const data = sheet({ weapons: [weapon(), weapon({ id: 'w2' })] });
    expect(cpredHandsAreDeclared(data)).toBe(false);
    expect(cpredWeaponInHands(data, 'w2')).toBe(true);
  });

  it('pusta lista znaczy puste ręce i zabrania wszystkiego', () => {
    const data = sheet({ weapons: [weapon()], drawnWeaponRowIds: [] });
    expect(cpredDrawnWeapons(data)).toEqual([]);
    expect(cpredHandsAreDeclared(data)).toBe(true);
    expect(cpredWeaponInHands(data, 'w1')).toBe(false);
  });

  it('zadeklarowana broń wygrywa z pierwszą z listy', () => {
    const data = sheet({
      weapons: [weapon(), weapon({ id: 'w2', name: 'Zgrzyt 9' })],
      drawnWeaponRowIds: ['w2'],
    });
    expect(cpredDrawnWeapons(data).map((row) => row.name)).toEqual(['Zgrzyt 9']);
    expect(cpredWeaponInHands(data, 'w1')).toBe(false);
  });

  it('dwie jednoręczne bronie trzyma się naraz — ręce są dwie', () => {
    const data = sheet({
      weapons: [weapon({ id: 'w1', name: 'Zgrzyt 9' }), weapon({ id: 'w2', name: 'Szpon' })],
      drawnWeaponRowIds: ['w1', 'w2'],
    });
    expect(cpredDrawnWeapons(data)).toHaveLength(2);
    expect(cpredWeaponInHands(data, 'w1')).toBe(true);
    expect(cpredWeaponInHands(data, 'w2')).toBe(true);
  });

  it('broń, która zeszła z karty, wypada z rąk — nie podstawia się innej', () => {
    // Ta broń została oddana, sprzedana albo zabrana z ciała. Ciche podstawienie
    // pierwszej z brzegu dałoby postaci pistolet, po który nikt nie sięgnął.
    const data = sheet({ weapons: [weapon({ id: 'w2' })], drawnWeaponRowIds: ['w1'] });
    expect(cpredDrawnWeapons(data)).toEqual([]);
  });

  it('karta bez żadnej broni ma puste ręce, choć nikt jej o to nie pytał', () => {
    expect(cpredDrawnWeapons(sheet())).toEqual([]);
  });
});

describe('rzut oka nie zdradza liczb', () => {
  it('hełm widać, ale bez marki i bez OB', () => {
    const view = cpredSighting(sheet({ armor: [armor()] }));
    expect(view.armor).toHaveLength(1);
    expect(view.armor[0]!.name).toBe('Ochrona głowy');
    expect(view.armor[0]!.sp).toBeUndefined();
    expect(view.armor[0]!.spCurrent).toBeUndefined();
  });

  it('broń nazywa się klasą z katalogu, nie modelem z karty', () => {
    const view = cpredSighting(sheet({ weapons: [weapon()] }), {
      weapons: { w1: { typeName: 'Karabin szturmowy' } },
    });
    expect(view.weapons[0]?.name).toBe('Karabin szturmowy');
    expect(view.weapons[0]?.damage).toBeUndefined();
    expect(view.weapons[0]?.ammoCurrent).toBeUndefined();
  });

  it('broń bez wpisu katalogu jest „czymś w rękach", a nie nazwą od MG', () => {
    const view = cpredSighting(sheet({ weapons: [weapon({ name: 'Nóż Rico, zatruty' })] }));
    expect(view.weapons[0]?.name).toBe('Coś w rękach');
  });

  it('chrom nazywa się rodziną i skleja się w jeden wiersz na miejsce', () => {
    const view = cpredSighting(
      sheet({
        cyberware: [
          chrome({ id: 'c1', name: 'Cyberręka Arasaki' }),
          chrome({ id: 'c2', name: 'Cybernoga Arasaki' }),
        ],
      }),
    );
    expect(view.chrome).toEqual([{ name: 'Cyberkończyny' }]);
  });
});

describe('oględziny podają to, po co się rzucało', () => {
  it('pancerz przychodzi z marką i z obydwoma OB', () => {
    const view = cpredSighting(sheet({ armor: [armor()] }), { detailed: true });
    expect(view.armor[0]).toMatchObject({ name: 'Hełm bojowy', sp: 11, spCurrent: 7 });
  });

  it('broń przychodzi z modelem, obrażeniami i magazynkiem', () => {
    const view = cpredSighting(sheet({ weapons: [weapon()] }), {
      detailed: true,
      weapons: { w1: { typeName: 'Karabin szturmowy' } },
    });
    expect(view.weapons[0]).toMatchObject({
      name: 'Militech Ronin',
      damage: '5k6',
      ammoCurrent: 12,
      ammoMax: 25,
    });
  });

  it('broń biała nie dostaje magazynka, którego nie ma', () => {
    const view = cpredSighting(
      sheet({ weapons: [weapon({ name: 'Maczeta', ammoCurrent: 0, ammoMax: 0 })] }),
      { detailed: true },
    );
    expect(view.weapons[0]?.ammoMax).toBeUndefined();
  });

  it('zacięta broń mówi o tym wprost', () => {
    const view = cpredSighting(sheet({ weapons: [weapon({ jammed: true })] }), { detailed: true });
    expect(view.weapons[0]?.jammed).toBe(true);
  });

  it('każdy wszczep ma własną nazwę i własne miejsce na ciele', () => {
    const view = cpredSighting(
      sheet({
        cyberware: [
          chrome({ id: 'c1', name: 'Cyberręka Arasaki', bodySlot: 'armRight' }),
          chrome({ id: 'c2', name: 'Cyberręka Arasaki', bodySlot: 'armLeft' }),
        ],
      }),
      { detailed: true },
    );
    expect(view.chrome).toEqual([
      { name: 'Cyberręka Arasaki', slotLabel: 'Prawa cyberręka' },
      { name: 'Cyberręka Arasaki', slotLabel: 'Lewa cyberręka' },
    ]);
  });
});

describe('czego nie widać z żadnej odległości', () => {
  it('pancerz w plecaku nie jest pancerzem na kimś', () => {
    const view = cpredSighting(sheet({ armor: [armor({ equipped: false })] }));
    expect(view.armor).toEqual([]);
    expect(cpredHeadIsArmored(view)).toBe(false);
  });

  it('chrom pod skórą zostaje pod skórą — w obu warstwach', () => {
    const data = sheet({
      cyberware: [
        chrome({ id: 'c1', name: 'Neuroprocesor', type: 'neuralware' }),
        chrome({ id: 'c2', name: 'Wzmocniony układ odpornościowy', type: 'internal' }),
      ],
    });
    expect(cpredSighting(data).chrome).toEqual([]);
    expect(cpredSighting(data, { detailed: true }).chrome).toEqual([]);
  });

  it('wiersz chromu bez rodziny milczy, zamiast zgadywać', () => {
    // Karty sprzed etapu 23a nie mają rodziny. Przy wyborze między „pokaż,
    // czego nie wiesz" a „przemilcz" przemilczenie jest jedynym bezpiecznym
    // domyślnym — to jest droga danych z karty MG do gracza.
    const view = cpredSighting(sheet({ cyberware: [chrome({ type: undefined })] }));
    expect(view.chrome).toEqual([]);
  });

  it('rodziny widoczne i niewidoczne rozstrzyga jedna lista', () => {
    expect(cpredCyberwareShowsOutside('cyberoptics')).toBe(true);
    expect(cpredCyberwareShowsOutside('borgware')).toBe(true);
    expect(cpredCyberwareShowsOutside('neuralware')).toBe(false);
    expect(cpredCyberwareShowsOutside(undefined)).toBe(false);
  });
});

describe('sylwetka czyta się od góry', () => {
  it('głowa, korpus, tarcza — niezależnie od kolejności na karcie', () => {
    const view = cpredSighting(
      sheet({
        armor: [
          armor({ id: 'a1', location: 'shield', name: 'Tarcza balistyczna' }),
          armor({ id: 'a2', location: 'body', name: 'Kamizelka' }),
          armor({ id: 'a3', location: 'head', name: 'Hełm' }),
        ],
      }),
    );
    expect(view.armor.map((row) => row.location)).toEqual(['head', 'body', 'shield']);
  });
});

describe('jedna linijka do dymka pod celownikiem', () => {
  it('mówi o gołej głowie wprost — po to powstał cały etap', () => {
    const view = cpredSighting(sheet({ weapons: [weapon()] }), {
      weapons: { w1: { typeName: 'Karabin szturmowy' } },
    });
    expect(cpredSightingLine(view)).toBe(`${CPRED_SIGHTING_BARE_HEAD} · Karabin szturmowy`);
  });

  it('puste ręce są informacją, a nie brakiem informacji', () => {
    const view = cpredSighting(sheet({ armor: [armor()], drawnWeaponRowIds: [] }));
    expect(cpredSightingLine(view)).toBe('Ochrona głowy · Puste ręce');
  });

  it('po zdanym Teście ta sama linijka niesie OB', () => {
    const view = cpredSighting(sheet({ armor: [armor()], drawnWeaponRowIds: [] }), {
      detailed: true,
    });
    expect(cpredSightingLine(view)).toBe('Hełm bojowy OB 7 · Puste ręce');
  });
});
