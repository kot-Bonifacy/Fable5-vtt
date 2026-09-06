import { describe, expect, it } from 'vitest';
import {
  inventoryMoveHeadline,
  inventoryResolutionLabel,
  isInventoryMoveOpen,
  mayAnswerInventoryMove,
  mayCancelInventoryMove,
  type InventoryMoveEntry,
} from './inventory.js';
import { chatCategoryOf } from './chat.js';

/**
 * Etap 38b, strona rdzenia: kto może kliknąć co na karcie przekazania.
 *
 * Reguła jest jedna i pilnuje jej ten plik: **przyjmuje odbiorca, wycofuje
 * wysyłający, MG może jedno i drugie** — a zamknięta karta nie przyjmuje już
 * niczyjego kliknięcia, bo drugie „Przyjmij" przeniosłoby przedmiot dwa razy.
 */

function offer(patch: Partial<InventoryMoveEntry> = {}): InventoryMoveEntry {
  return {
    kind: 'give',
    fromCharacterId: 'c-vex',
    fromName: 'Vex',
    toCharacterId: 'c-rico',
    toName: 'Rico',
    toOwnerId: 'u-rico',
    actorName: 'Vex',
    lines: ['Stimpak × 2'],
    system: { items: [] },
    ...patch,
  };
}

describe('propozycja przekazania', () => {
  it('bez rozstrzygnięcia jest otwarta', () => {
    expect(isInventoryMoveOpen(offer())).toBe(true);
  });

  it('przyjmuje odbiorca albo MG, nie wysyłający', () => {
    const entry = offer();
    expect(mayAnswerInventoryMove(entry, 'u-rico', false)).toBe(true);
    expect(mayAnswerInventoryMove(entry, 'u-gm', true)).toBe(true);
    expect(mayAnswerInventoryMove(entry, 'u-vex', false)).toBe(false);
  });

  it('wycofuje wysyłający albo MG', () => {
    const entry = offer();
    expect(mayCancelInventoryMove(entry, 'u-vex', false, 'u-vex')).toBe(true);
    expect(mayCancelInventoryMove(entry, 'u-gm', true, 'u-vex')).toBe(true);
    expect(mayCancelInventoryMove(entry, 'u-obcy', false, 'u-vex')).toBe(false);
  });

  it('zamknięta nie przyjmuje już żadnego kliknięcia — także od MG', () => {
    const closed = offer({ resolution: { kind: 'accepted', byName: 'Rico' } });
    expect(isInventoryMoveOpen(closed)).toBe(false);
    expect(mayAnswerInventoryMove(closed, 'u-rico', false)).toBe(false);
    expect(mayAnswerInventoryMove(closed, 'u-gm', true)).toBe(false);
    expect(mayCancelInventoryMove(closed, 'u-vex', false, 'u-vex')).toBe(false);
  });

  it('karty bez właściciela nie ma kto przyjąć poza MG', () => {
    const entry = offer({ toOwnerId: null });
    expect(mayAnswerInventoryMove(entry, 'u-rico', false)).toBe(false);
    expect(mayAnswerInventoryMove(entry, 'u-gm', true)).toBe(true);
  });

  it('łup jest „zabrany", nie „przyjęty" — nie ma kogo pytać o zgodę', () => {
    const taken = offer({ kind: 'take', resolution: { kind: 'accepted', byName: 'Vex' } });
    expect(inventoryResolutionLabel(taken)).toBe('Zabrane');
    const given = offer({ resolution: { kind: 'accepted', byName: 'Rico' } });
    expect(inventoryResolutionLabel(given)).toBe('Przyjęte');
    expect(
      inventoryResolutionLabel(offer({ resolution: { kind: 'declined', byName: 'Rico' } })),
    ).toBe('Odrzucone');
    expect(inventoryResolutionLabel(offer())).toBe('');
  });

  it('nagłówek mówi kierunek', () => {
    expect(inventoryMoveHeadline(offer())).toBe('Vex → Rico');
  });
});

describe('wiersz czatu', () => {
  it('trafia do grupy „Stół" — czyta się go razem z pieniędzmi i papierami', () => {
    expect(chatCategoryOf('inventory')).toBe('table');
  });
});
