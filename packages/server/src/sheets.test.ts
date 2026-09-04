import { describe, expect, it } from 'vitest';
import {
  readSheetStatusDisabled,
  readSheetStatusTimers,
  writeSheetStatusDisabled,
  writeSheetStatusTimer,
} from './sheets.js';

/**
 * Kolumna `Token.statusData` — wszystko, co wisi przy naklejce (04.09.2026).
 *
 * Te trzy pola (`damage`, `timer`, `disabled`) nie jadą do klienta w żadnym
 * widoku, więc testy na żywych gniazdach ich nie widzą; jedyne miejsce, w
 * którym da się je sprawdzić, jest tutaj.
 */
describe('dane przy statusie żetonu', () => {
  const timer = { source: 'Amunicja EMP', durationS: 60 };

  it('zapisuje przy Impulsie nazwy wyłączonych cyborgizacji', () => {
    const raw = writeSheetStatusDisabled('', 'emp', ['Kerenzikov', 'Cyberoko']);
    expect(readSheetStatusDisabled(raw, 'emp')).toEqual(['Kerenzikov', 'Cyberoko']);
    // Inny status nic z tego nie widzi.
    expect(readSheetStatusDisabled(raw, 'prone')).toEqual([]);
  });

  it('pusta lista nie zostawia po sobie wpisu', () => {
    const raw = writeSheetStatusDisabled('', 'emp', []);
    expect(readSheetStatusDisabled(raw, 'emp')).toEqual([]);
    expect(raw).toBe('{}');
  });

  it('lista i zegar mieszkają obok siebie', () => {
    let raw = writeSheetStatusTimer('', 'emp', timer);
    raw = writeSheetStatusDisabled(raw, 'emp', ['Kerenzikov']);
    expect(readSheetStatusTimers(raw).emp).toMatchObject(timer);
    expect(readSheetStatusDisabled(raw, 'emp')).toEqual(['Kerenzikov']);
  });

  // Ta ścieżka zamyka błąd znaleziony przy oględzinach 04.09: „Cofnij"
  // zdejmowało naklejkę, ale zegar i lista zostawały, więc następna walka
  // ogłaszała powrót cyborgizacji, których nikt nie wyłączył.
  it('zdjęcie zegara zabiera ze sobą listę wyłączonych', () => {
    let raw = writeSheetStatusTimer('', 'emp', timer);
    raw = writeSheetStatusDisabled(raw, 'emp', ['Kerenzikov', 'Cyberoko']);
    raw = writeSheetStatusTimer(raw, 'emp', null);
    expect(raw).toBe('{}');
    expect(readSheetStatusDisabled(raw, 'emp')).toEqual([]);
  });

  it('nie rusza liczby, którą status niesie osobno', () => {
    let raw = writeSheetStatusTimer('{"on-fire":{"damage":6}}', 'on-fire', timer);
    raw = writeSheetStatusTimer(raw, 'on-fire', null);
    // Intensywność ognia to nastawienie MG, nie ślad po trafieniu.
    expect(raw).toBe('{"on-fire":{"damage":6}}');
  });
});
