import { describe, expect, it } from 'vitest';
import { readTokenSneak, sneakEndedText, sneakTriedBy, writeTokenSneak } from '../../sneak.js';
import {
  CPRED_SNEAK_MODIFIER_LADDER,
  cpredSneakModifierLabel,
  cpredSneakNoticed,
  cpredSneakOutcome,
  cpredSneakRequest,
} from './sneak.js';
import { CPRED_STEALTH_SKILL_ID } from './hiding.js';
import { CPRED_SITUATIONAL_MODIFIER_LIMIT } from './rolls.js';

/**
 * Etap 61: tryb skradania. Stan na figurze czyta się wyrozumiale (zepsuta
 * kolumna znaczy „nie skrada się”), a werdykt Percepcji trzyma remis po
 * stronie skradającego się.
 */
describe('stan trybu skradania (rdzeń)', () => {
  it('czyta zapisany stan i odrzuca zepsutą kolumnę', () => {
    const raw = writeTokenSneak({ dv: 17, modifier: 2, tried: ['a', 'b', 'a'] });
    expect(readTokenSneak(raw)).toEqual({ dv: 17, modifier: 2, tried: ['a', 'b'] });
    expect(readTokenSneak(null)).toBeNull();
    expect(readTokenSneak('')).toBeNull();
    expect(readTokenSneak('{"modifier":2}')).toBeNull();
    expect(readTokenSneak('nie json')).toBeNull();
    expect(readTokenSneak('{"dv":14}')).toEqual({ dv: 14, modifier: 0, tried: [] });
  });

  it('pamięta, kto już patrzył', () => {
    const sneak = { dv: 15, modifier: 0, tried: ['guard'] };
    expect(sneakTriedBy(sneak, 'guard')).toBe(true);
    expect(sneakTriedBy(sneak, 'other')).toBe(false);
  });

  it('mówi graczowi, co skończyło tryb', () => {
    expect(sneakEndedText('noticed', 'Vex')).toBe('Zauważono cię — Vex przestaje się skradać.');
    expect(sneakEndedText('attack', 'Vex')).toContain('Atak');
    expect(sneakEndedText('run', 'Vex')).toContain('Bieg');
  });
});

describe('Skradanie przeciw Percepcji (CP RED)', () => {
  it('prosi o Test Skradania z adresem figury', () => {
    expect(cpredSneakRequest('tok')).toEqual({
      kind: 'skill',
      skillId: CPRED_STEALTH_SKILL_ID,
      sneakTokenId: 'tok',
    });
  });

  it('remis wygrywa skradający się', () => {
    expect(cpredSneakNoticed(16, 15)).toBe(true);
    expect(cpredSneakNoticed(15, 15)).toBe(false);
    expect(cpredSneakNoticed(9, 15)).toBe(false);
  });

  it('karta Testu nazywa wynik progiem', () => {
    expect(cpredSneakOutcome(17)).toMatchObject({ success: true, label: 'Skradasz się' });
    expect(cpredSneakOutcome(17).detail).toContain('17');
  });

  it('drabinka MG mieści się w widełkach modyfikatora sytuacyjnego', () => {
    for (const rung of CPRED_SNEAK_MODIFIER_LADDER) {
      expect(Math.abs(rung.value)).toBeLessThanOrEqual(CPRED_SITUATIONAL_MODIFIER_LIMIT);
    }
    expect(CPRED_SNEAK_MODIFIER_LADDER.map((rung) => rung.value)).toContain(0);
    expect(cpredSneakModifierLabel(2)).toBe('+2');
    expect(cpredSneakModifierLabel(-4)).toBe('−4');
    expect(cpredSneakModifierLabel(0)).toBe('±0');
  });
});
