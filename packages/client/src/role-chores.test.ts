import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData, cpredRoleChores } from '@vtt/shared';
import type { CpredCharacterData } from '@vtt/shared';
import { useCharacterStore } from './stores/characterStore.js';

/**
 * „Przejdź" przy czynności po kreatorze (naprawa 3c).
 *
 * Wiersz listy wskazuje panel karty **nazwą** (`data-sheet-panel`), więc
 * przemianowanie panelu po drugiej stronie nie wywoła żadnego błędu — guzik po
 * prostu przestanie cokolwiek robić. Pierwszy test jest strażnikiem tej
 * jednej rzeczy: każda nazwa, którą lista potrafi zwrócić, musi stać w karcie.
 */

const SHEET = readFileSync(join(import.meta.dirname, 'components', 'CharacterSheet.tsx'), 'utf8');

/** Wszystkie Role, które cokolwiek po sobie zostawiają. */
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
    ],
  },
);

function sheetOf(roleId: string): CpredCharacterData {
  return {
    ...createDefaultCharacterData(),
    roleId,
    roleAbilityRank: 4,
    lifestyle: { level: 'kibble', housing: 'container' },
  };
}

describe('czynności po kreatorze prowadzą do istniejących paneli karty', () => {
  it('każdy panel z listy stoi w karcie pod tą samą nazwą', () => {
    const panels = new Set(
      registry.roles.flatMap((role) =>
        cpredRoleChores(sheetOf(role.id), registry).map((chore) => chore.panel),
      ),
    );
    // Sześć Ról, siedem czynności — i żadna nie może celować w próżnię.
    expect(panels.size).toBeGreaterThanOrEqual(7);
    for (const panel of panels) {
      expect(SHEET).toContain(`data-sheet-panel="${panel}"`);
    }
  });

  it('każda czynność otwiera zakładkę, którą karta zna', () => {
    const tabs = new Set(
      registry.roles.flatMap((role) =>
        cpredRoleChores(sheetOf(role.id), registry).map((chore) => chore.tab),
      ),
    );
    expect([...tabs].sort()).toEqual(['gear', 'stats']);
  });
});

describe('żądanie „Przejdź" w magazynie postaci', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: {
        'char-1': {
          id: 'char-1',
          name: 'Zgrzyt',
          ownerId: null,
          portraitUrl: null,
          data: sheetOf('solo'),
          playReady: false,
          template: false,
          templateId: null,
          revision: 0,
          updatedAt: new Date().toISOString(),
        },
      },
      order: ['char-1'],
      openSheets: [],
      panelFocus: null,
    });
  });

  it('otwiera kartę, którą trzeba, i podnosi numer żądania', () => {
    const { focusPanel } = useCharacterStore.getState();
    focusPanel('char-1', 'stats', 'combat-awareness');
    const first = useCharacterStore.getState();
    expect(first.openSheets).toEqual(['char-1']);
    expect(first.panelFocus).toMatchObject({ characterId: 'char-1', panel: 'combat-awareness' });

    // Drugie kliknięcie w ten sam wiersz musi zadziałać jak pierwsze — bez
    // rosnącego `seq` karta nie zobaczyłaby żadnej zmiany.
    focusPanel('char-1', 'stats', 'combat-awareness');
    expect(useCharacterStore.getState().panelFocus?.seq).toBe((first.panelFocus?.seq ?? 0) + 1);
  });

  it('nie prosi o panel karty, której ten widz nie ma', () => {
    useCharacterStore.getState().focusPanel('char-nie-ma', 'stats', 'team');
    expect(useCharacterStore.getState().panelFocus).toBeNull();
    expect(useCharacterStore.getState().openSheets).toEqual([]);
  });

  it('obsłużone żądanie znika, żeby nie wracało przy kolejnym otwarciu karty', () => {
    useCharacterStore.getState().focusPanel('char-1', 'gear', 'cyberdeck');
    useCharacterStore.getState().clearPanelFocus();
    expect(useCharacterStore.getState().panelFocus).toBeNull();
  });
});
