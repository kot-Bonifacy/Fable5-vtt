import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildCpredRegistry, createDefaultCharacterData } from '@vtt/shared';
import { askForCheck, useCheckStore } from './stores/checkStore.js';
import { useRollStore, type RollTarget } from './stores/rollStore.js';

/**
 * Trzy okna jednej rozmowy o Teście i **jedna zasada: naraz stoi jedno**
 * (etap 40, poprawka z 06.09).
 *
 * „Poproś MG" w oknie rzutu otwierało okno prośby, ale okna rzutu nie
 * zamykało. Prośba szła, jej okno znikało — i na wierzch wracało okno rzutu
 * z guzikiem „Weź kubek", stojące tam przez cały czas oczekiwania i po zgodzie
 * MG także. Gracz patrzył na przycisk znaczący „rzuć bez zgody" i nie wiedział,
 * czy to jest właśnie ta zgoda, czy trzeba jeszcze coś z tym oknem zrobić.
 *
 * Testy są na store, a nie na klikaniu: to store rozstrzyga, które okno stoi,
 * a `askForCheck` jest jedyną drogą z wiersza karty i z okna rzutu naraz.
 */

const SRC = join(import.meta.dirname);

const registry = buildCpredRegistry(
  { skills: [{ id: 'perception', name: 'Percepcja', stat: 'int' }] },
  { roles: [] },
);

const data = createDefaultCharacterData();

const SKILL_TARGET: RollTarget = {
  kind: 'skill',
  characterId: 'char-1',
  characterName: 'Czterdziestka',
  skillId: 'perception',
};

beforeEach(() => {
  useRollStore.getState().closeDialog();
  useCheckStore.getState().closeRequest();
  useCheckStore.getState().closeCall();
});

describe('prośba a okno rzutu (etap 40)', () => {
  it('prośba zamyka okno rzutu, z którego wyszła', () => {
    useRollStore.getState().openDialog(SKILL_TARGET);
    expect(useRollStore.getState().target).not.toBeNull();

    askForCheck(SKILL_TARGET, data, registry);

    expect(useRollStore.getState().target).toBeNull();
    expect(useCheckStore.getState().requestDraft?.characterId).toBe('char-1');
    expect(useCheckStore.getState().requestDraft?.label).toContain('Percepcja');
  });

  it('po zamknięciu okna prośby nie zostaje pod nim NIC do kliknięcia', () => {
    // Sedno usterki: gracz wysyła prośbę, okno znika — i nie ma prawa odsłonić
    // pod sobą guzika „Weź kubek", bo ten znaczy „rzuć bez zgody MG".
    useRollStore.getState().openDialog(SKILL_TARGET);
    askForCheck(SKILL_TARGET, data, registry);
    useCheckStore.getState().closeRequest();

    expect(useCheckStore.getState().requestDraft).toBeNull();
    expect(useRollStore.getState().target).toBeNull();
  });

  it('rzut, o który nie da się poprosić, zostawia okno rzutu na miejscu', () => {
    // Obrażenia, Rzut na Śmierć i reszta mają własne drogi — prośba ich nie
    // obejmuje, więc Alt+klik na nich ma nie robić nic, a nie gasić okno.
    const damage: RollTarget = { ...SKILL_TARGET, kind: 'damage', weaponRowId: 'w-1' };
    useRollStore.getState().openDialog(damage);

    askForCheck(damage, data, registry);

    expect(useRollStore.getState().target?.kind).toBe('damage');
    expect(useCheckStore.getState().requestDraft).toBeNull();
  });

  it('nieznana Umiejętność nie otwiera prośby i nie gasi okna rzutu', () => {
    const ghost: RollTarget = { ...SKILL_TARGET, skillId: 'nie-ma-takiej' };
    useRollStore.getState().openDialog(ghost);

    askForCheck(ghost, data, registry);

    expect(useRollStore.getState().target).not.toBeNull();
    expect(useCheckStore.getState().requestDraft).toBeNull();
  });

  it('prośba i wezwanie wykluczają się nawzajem', () => {
    askForCheck(SKILL_TARGET, data, registry);
    useCheckStore.getState().openCall({ characterId: 'char-1', characterName: 'Czterdziestka' });
    expect(useCheckStore.getState().requestDraft).toBeNull();
    expect(useCheckStore.getState().callDraft).not.toBeNull();

    askForCheck(SKILL_TARGET, data, registry);
    expect(useCheckStore.getState().callDraft).toBeNull();
    expect(useCheckStore.getState().requestDraft).not.toBeNull();
  });

  it('okno rzutu prosi WYŁĄCZNIE przez askForCheck', () => {
    // Gdyby przycisk „Poproś MG" wołał `openRequest` wprost, minąłby zamknięcie
    // okna rzutu i usterka wróciłaby tą samą drogą, którą przyszła.
    const source = readFileSync(join(SRC, 'components/RollDialog.tsx'), 'utf8');
    expect(source).toMatch(/askForCheck\(/);
    expect(source).not.toMatch(/openRequest\(/);
  });
});
