import { describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData } from './character.js';
import type { CpredCharacterData } from './character.js';
import { cpredRoleChores } from './readiness.js';

/**
 * Czynności, które zostają po kreatorze (naprawa 3c).
 *
 * Testy pilnują dwóch rzeczy naraz: że wiersz pojawia się dokładnie dla tej
 * Roli, której dotyczy, i że **znika sam**, gdy karta go wypełni — bo tym
 * właśnie jest ta lista, a nie zapisanym stanem do odhaczania.
 */

const registry = buildCpredRegistry(
  { skills: [] },
  {
    roles: [
      { id: 'solo', name: 'Solo', ability: 'Zmysł Walki' },
      { id: 'medyk', name: 'Medyk', ability: 'Medycyna' },
      { id: 'technik', name: 'Technik', ability: 'Twórca' },
      { id: 'korpo', name: 'Korpo', ability: 'Praca Zespołowa' },
      { id: 'nomada', name: 'Nomada', ability: 'Moto' },
      { id: 'netrunner', name: 'Netrunner', ability: 'Interfejs' },
      { id: 'rocker', name: 'Rocker', ability: 'Efekt Charyzmy' },
    ],
  },
);

/** Karta świeżo z kreatora: ranga Zdolności 4, kontener „Na karmie" (s. 105). */
function freshSheet(roleId: string, patch: Partial<CpredCharacterData> = {}): CpredCharacterData {
  return {
    ...createDefaultCharacterData(),
    roleId,
    roleAbilityRank: 4,
    lifestyle: { level: 'kibble', housing: 'container' },
    ...patch,
  };
}

function ids(data: CpredCharacterData): string[] {
  return cpredRoleChores(data, registry).map((chore) => chore.id);
}

describe('czynności po kreatorze', () => {
  it('Rola bez własnych decyzji nie zostawia nic do zrobienia', () => {
    // Efekt Charyzmy działa z samej rangi — nie ma czego rozdzielać.
    expect(ids(freshSheet('rocker'))).toEqual([]);
  });

  it('Solo z rangą 4 ma cztery punkty Zmysłu Walki do rozdzielenia', () => {
    const [chore] = cpredRoleChores(freshSheet('solo'), registry);
    expect(chore?.id).toBe('combatAwareness');
    expect(chore?.left).toBe(4);
    // Czasownik odmienia się razem z liczebnikiem — pierwsza wersja pisała
    // „Zostało 4 punkty” (wyszło przy oględzinach 17.09).
    expect(chore?.text.startsWith('Zostały 4 punkty')).toBe(true);
    expect(chore?.tab).toBe('stats');
  });

  it('liczebnik odmienia czasownik: został / zostały / zostało', () => {
    const solo = (spent: number) =>
      cpredRoleChores(
        { ...freshSheet('solo'), roleAbilityRank: 9, combatAwareness: { threatSense: spent } },
        registry,
      )[0]?.text ?? '';
    expect(solo(8)).toMatch(/^Został 1 punkt /);
    expect(solo(6)).toMatch(/^Zostały 3 punkty /);
    expect(solo(0)).toMatch(/^Zostało 9 punktów /);
  });

  it('rozdzielone punkty zdejmują wiersz Solo same, bez żadnego zapisu', () => {
    // Redukcja obrażeń kosztuje 2, Precyzyjny atak 3 — wybór niepełny…
    expect(ids(freshSheet('solo', { combatAwareness: { damageReduction: 2 } }))).toEqual([
      'combatAwareness',
    ]);
    // …a pełny znika z listy.
    expect(ids(freshSheet('solo', { combatAwareness: { damageReduction: 4 } }))).toEqual([]);
  });

  it('Medyk ma punkt na poziom, Technik dwa', () => {
    expect(cpredRoleChores(freshSheet('medyk'), registry)[0]?.left).toBe(4);
    expect(cpredRoleChores(freshSheet('technik'), registry)[0]?.left).toBe(8);
    expect(ids(freshSheet('medyk', { medicine: { surgery: 4 } }))).toEqual([]);
  });

  it('Korpo na randze 4 ma jedno miejsce w zespole, a na 2 żadnego', () => {
    // „Poczynając od 3. poziomu […] członka zespołu" (s. 154).
    const chore = cpredRoleChores(freshSheet('korpo'), registry)[0];
    expect(chore?.id).toBe('team');
    expect(chore?.left).toBe(1);
    // Rodzaj nijaki: „Zostało 1 miejsce”, nie „Został” jak przy punkcie
    // (wyszło przy oględzinach 3d, 18.09).
    expect(chore?.text.startsWith('Zostało 1 miejsce w zespole')).toBe(true);
    expect(ids({ ...freshSheet('korpo'), roleAbilityRank: 2 })).toEqual([]);
  });

  it('Nomada ma Tabor i pytanie o Zakwaterowanie, a pełny Tabor zostawia samo pytanie', () => {
    expect(ids(freshSheet('nomada'))).toEqual(['fleet', 'nomadHousing']);
    const fleet = [1, 2, 3, 4].map((n) => ({
      id: `f${n}`,
      kind: 'vehicle' as const,
      name: `Pojazd ${n}`,
      level: 1,
      notes: '',
    }));
    expect(ids(freshSheet('nomada', { fleet }))).toEqual(['nomadHousing']);
    // Nomada, który przeniósł się do pojazdu, nie ma już o czym decydować.
    expect(
      ids(
        freshSheet('nomada', { fleet, lifestyle: { level: 'kibble', housing: 'streetVehicle' } }),
      ),
    ).toEqual([]);
  });

  it('NPC bez rachunków nie dostaje pytania o Zakwaterowanie', () => {
    // `lifestyle: null` = „ta postać nie prowadzi rachunków" (23b).
    expect(ids(freshSheet('nomada', { lifestyle: null }))).toEqual(['fleet']);
  });

  it('Netrunner czeka na cyberdek, dopóki nie wskaże go na karcie', () => {
    const chore = cpredRoleChores(freshSheet('netrunner'), registry)[0];
    expect(chore?.id).toBe('cyberdeck');
    expect(chore?.tab).toBe('gear');
    expect(
      ids(
        freshSheet('netrunner', {
          cyberdeck: { name: 'Kyberdek', slots: 5, installed: [] },
        }),
      ),
    ).toEqual([]);
  });
});
