import { describe, expect, it } from 'vitest';
import {
  RELATION_MAX,
  RELATION_MIN,
  clampRelation,
  relationBadge,
  relationPromptLines,
  sanitizeRelationNote,
  RELATION_NOTE_MAX_LENGTH,
} from './relations.js';

describe('skala', () => {
  it('trzyma się zakresu i zaokrągla', () => {
    expect(clampRelation(5)).toBe(RELATION_MAX);
    expect(clampRelation(-5)).toBe(RELATION_MIN);
    expect(clampRelation(1.6)).toBe(2);
    expect(clampRelation('wrogi')).toBe(0);
    expect(clampRelation(Number.NaN)).toBe(0);
  });

  it('nazywa stopień po polsku', () => {
    expect(relationBadge(-2)).toBe('-2 wrogi');
    expect(relationBadge(3)).toBe('+3 oddany przyjaciel');
    expect(relationBadge(0)).toBe('0 obojętny');
  });

  it('przycina notatkę „skąd"', () => {
    expect(sanitizeRelationNote('  okradł go  ')).toBe('okradł go');
    expect(sanitizeRelationNote(null)).toBe('');
    expect(sanitizeRelationNote('x'.repeat(1000))).toHaveLength(RELATION_NOTE_MAX_LENGTH);
  });
});

describe('relacja w prompcie', () => {
  it('niesie stopień I zdanie „skąd" — sama liczba nic modelowi nie mówi', () => {
    const text = relationPromptLines({
      characterName: 'Vex',
      value: -2,
      note: 'Okradł go przy wszystkich.',
    });
    expect(text).toContain('Rozmawiasz z: Vex.');
    expect(text).toContain('wrogi');
    expect(text).toContain('Skąd się wzięło: Okradł go przy wszystkich.');
    // Nastawienie ma być słychać, ale NPC nie streszcza własnej historii.
    expect(text).toContain('nie mówisz o nim wprost');
  });

  it('bez notatki podaje sam stopień', () => {
    const text = relationPromptLines({ characterName: 'Kaya', value: 2, note: '   ' });
    expect(text).toContain('życzliwy');
    expect(text).not.toContain('Skąd');
  });

  it('obojętność mówi wprost, że nie ma ani sympatii, ani urazy', () => {
    const text = relationPromptLines({ characterName: 'Rico', value: 0, note: '' });
    expect(text).toContain('ani sympatii, ani urazy');
  });
});
