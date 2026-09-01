import { describe, expect, it } from 'vitest';
import { chatCategoryOf, chatCompactLine, parseChatInput } from './chat.js';
import type { ChatMessageView } from './chat.js';
import type { RollResult } from './dice.js';

const ROSTER = ['MG', 'Rogue', 'Jan Kowalski', 'Jan'];

describe('parseChatInput — plain messages', () => {
  it('treats plain text as say', () => {
    expect(parseChatInput('cześć wszystkim')).toEqual({ kind: 'say', text: 'cześć wszystkim' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseChatInput('  witaj  ')).toEqual({ kind: 'say', text: 'witaj' });
  });

  it('returns empty for blank input', () => {
    expect(parseChatInput('   ')).toEqual({ kind: 'empty' });
  });

  it('escapes a leading slash with //', () => {
    expect(parseChatInput('//w sumie racja')).toEqual({ kind: 'say', text: '/w sumie racja' });
  });
});

describe('parseChatInput — whispers', () => {
  it('parses a simple whisper', () => {
    expect(parseChatInput('/w Rogue masz chwilę?', ROSTER)).toEqual({
      kind: 'whisper',
      targetName: 'Rogue',
      text: 'masz chwilę?',
    });
  });

  it('accepts the /whisper and /szept aliases', () => {
    expect(parseChatInput('/whisper Rogue hej', ROSTER)).toMatchObject({ kind: 'whisper' });
    expect(parseChatInput('/szept Rogue hej', ROSTER)).toMatchObject({ kind: 'whisper' });
  });

  it('is case-insensitive for the command', () => {
    expect(parseChatInput('/W Rogue hej', ROSTER)).toMatchObject({ kind: 'whisper' });
  });

  it('matches multi-word names from the roster without quotes', () => {
    expect(parseChatInput('/w Jan Kowalski tajny plan', ROSTER)).toEqual({
      kind: 'whisper',
      targetName: 'Jan Kowalski',
      text: 'tajny plan',
    });
  });

  it('prefers the longest roster match', () => {
    // Both "Jan" and "Jan Kowalski" are on the roster — greedy match wins.
    expect(parseChatInput('/w Jan Kowalski cześć', ROSTER)).toMatchObject({
      targetName: 'Jan Kowalski',
    });
    expect(parseChatInput('/w Jan cześć', ROSTER)).toMatchObject({ targetName: 'Jan' });
  });

  it('matches roster names case-insensitively and returns canonical casing', () => {
    expect(parseChatInput('/w rogue hej', ROSTER)).toMatchObject({ targetName: 'Rogue' });
  });

  it('supports quoted names', () => {
    expect(parseChatInput('/w "Jan Kowalski" tajny plan')).toEqual({
      kind: 'whisper',
      targetName: 'Jan Kowalski',
      text: 'tajny plan',
    });
  });

  it('falls back to the first token without a roster', () => {
    expect(parseChatInput('/w Rogue masz chwilę?')).toEqual({
      kind: 'whisper',
      targetName: 'Rogue',
      text: 'masz chwilę?',
    });
  });

  it('does not treat a name prefix as a roster match', () => {
    // "Rogue2" starts with "Rogue" but is not followed by a word boundary.
    expect(parseChatInput('/w Rogue2 hej', ROSTER)).toMatchObject({ targetName: 'Rogue2' });
  });

  it('reports a missing target', () => {
    expect(parseChatInput('/w', ROSTER)).toEqual({
      kind: 'invalid-whisper',
      reason: 'MISSING_TARGET',
    });
  });

  it('reports missing text', () => {
    expect(parseChatInput('/w Rogue', ROSTER)).toEqual({
      kind: 'invalid-whisper',
      reason: 'MISSING_TEXT',
    });
  });
});

describe('parseChatInput — rolls', () => {
  const D10_PLUS_5 = {
    terms: [
      { kind: 'dice', sign: 1, count: 1, sides: 10 },
      { kind: 'modifier', sign: 1, value: 5 },
    ],
  };

  it('parses a public roll', () => {
    expect(parseChatInput('/r 1d10+5', ROSTER)).toEqual({
      kind: 'roll',
      visibility: 'public',
      formula: D10_PLUS_5,
    });
  });

  it('accepts the /roll and /rzut aliases', () => {
    expect(parseChatInput('/roll 2d6', ROSTER)).toMatchObject({ kind: 'roll' });
    expect(parseChatInput('/rzut 2d6', ROSTER)).toMatchObject({ kind: 'roll' });
  });

  it('parses a GM roll with gm visibility', () => {
    expect(parseChatInput('/gr 1d10+5', ROSTER)).toMatchObject({ kind: 'roll', visibility: 'gm' });
    expect(parseChatInput('/gmroll 1d10+5', ROSTER)).toMatchObject({ visibility: 'gm' });
  });

  it('allows spaces inside the notation when there is no label', () => {
    expect(parseChatInput('/r 1d10 + 5', ROSTER)).toEqual({
      kind: 'roll',
      visibility: 'public',
      formula: D10_PLUS_5,
    });
  });

  it('treats text after the notation as a label', () => {
    expect(parseChatInput('/r 1d10+5 atak z bliska', ROSTER)).toEqual({
      kind: 'roll',
      visibility: 'public',
      formula: D10_PLUS_5,
      label: 'atak z bliska',
    });
  });

  it('reports a missing notation', () => {
    expect(parseChatInput('/r', ROSTER)).toEqual({
      kind: 'invalid-roll',
      reason: 'MISSING_NOTATION',
    });
  });

  it('reports a malformed notation', () => {
    expect(parseChatInput('/r abc', ROSTER)).toEqual({ kind: 'invalid-roll', reason: 'SYNTAX' });
    expect(parseChatInput('/r 999d6', ROSTER)).toEqual({
      kind: 'invalid-roll',
      reason: 'TOO_MANY_DICE',
    });
  });
});

describe('parseChatInput — bots (stage 11)', () => {
  const NAMES = [...ROSTER, 'Vex', 'Pani Wu'];

  it('accepts the @ prefix in a whisper target, like a chat mention', () => {
    expect(parseChatInput('/w @Vex mam eddiesy', NAMES)).toEqual({
      kind: 'whisper',
      targetName: 'Vex',
      text: 'mam eddiesy',
    });
  });

  it('parses „speak as this NPC" with both aliases', () => {
    expect(parseChatInput('/jako Vex Czas to eddiesy.', NAMES)).toEqual({
      kind: 'as-bot',
      targetName: 'Vex',
      text: 'Czas to eddiesy.',
    });
    expect(parseChatInput('/as Vex Siadaj.', NAMES)).toMatchObject({ kind: 'as-bot' });
  });

  it('matches a multi-word NPC name without quoting', () => {
    expect(parseChatInput('/jako Pani Wu Herbata ostygła.', NAMES)).toEqual({
      kind: 'as-bot',
      targetName: 'Pani Wu',
      text: 'Herbata ostygła.',
    });
  });

  it('reports a missing NPC and a missing line separately', () => {
    expect(parseChatInput('/jako', NAMES)).toEqual({
      kind: 'invalid-as-bot',
      reason: 'MISSING_TARGET',
    });
    expect(parseChatInput('/jako Vex', NAMES)).toEqual({
      kind: 'invalid-as-bot',
      reason: 'MISSING_TEXT',
    });
  });
});

describe('parseChatInput — unknown commands', () => {
  it('flags an unknown command with its name', () => {
    expect(parseChatInput('/dance', ROSTER)).toEqual({ kind: 'unknown-command', command: 'dance' });
  });

  it('flags a lone slash as unknown', () => {
    expect(parseChatInput('/', ROSTER)).toEqual({ kind: 'unknown-command', command: '' });
  });
});

// ---------------------------------------------------------------------------
// Filtry i tryb zwarty (01.09.2026)
// ---------------------------------------------------------------------------

function baseMessage(patch: Partial<ChatMessageView>): ChatMessageView {
  return {
    id: 1,
    kind: 'say',
    authorId: 'u1',
    authorName: 'Rico',
    text: '',
    createdAt: '2026-09-01T20:00:00.000Z',
    ...patch,
  };
}

function roll(patch: Partial<RollResult>): RollResult {
  return {
    notation: '1d10+7',
    terms: [{ kind: 'dice', sign: 1, sides: 10, count: 1, rolls: [7], subtotal: 7 }],
    criticalDamage: false,
    total: 14,
    ...patch,
  };
}

describe('chatCategoryOf', () => {
  it('trzyma mowę i szept w jednej grupie', () => {
    expect(chatCategoryOf('say')).toBe('talk');
    expect(chatCategoryOf('whisper')).toBe('talk');
  });

  it('trzyma rzut MG razem z rzutem jawnym', () => {
    expect(chatCategoryOf('roll')).toBe('dice');
    expect(chatCategoryOf('gmroll')).toBe('dice');
  });

  it('trzyma odmowę akcji razem z obrażeniami', () => {
    expect(chatCategoryOf('damage')).toBe('combat');
    expect(chatCategoryOf('action')).toBe('combat');
    expect(chatCategoryOf('gmaction')).toBe('combat');
  });

  it('zbiera papiery stołu w jednej grupie', () => {
    expect(chatCategoryOf('proposal')).toBe('table');
    expect(chatCategoryOf('economy')).toBe('table');
    expect(chatCategoryOf('handout')).toBe('table');
    expect(chatCategoryOf('journal')).toBe('table');
  });
});

describe('chatCompactLine', () => {
  it('zostawia wypowiedzi w spokoju', () => {
    expect(chatCompactLine(baseMessage({ kind: 'say', text: 'Nie ruszaj się.' }))).toBeNull();
    expect(chatCompactLine(baseMessage({ kind: 'whisper', text: 'wchodzę' }))).toBeNull();
  });

  it('mówi imieniem postaci, nie konta, gdy rzut wyszedł z karty', () => {
    const line = chatCompactLine(
      baseMessage({ kind: 'roll', roll: roll({ title: 'Percepcja (INT)', actor: 'Vex' }) }),
    );
    expect(line?.actor).toBe('Vex');
    expect(line?.summary).toBe('Percepcja (INT) · 14');
  });

  it('bierze etykietę komendy, gdy rzut nie ma tytułu', () => {
    const line = chatCompactLine(
      baseMessage({ kind: 'roll', text: 'atak z bliska', roll: roll({}) }),
    );
    expect(line?.summary).toBe('1d10+7 · 14 — atak z bliska');
  });

  it('niesie werdykt ataku i linię wyjaśnienia', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'roll',
        roll: roll({
          title: 'Atak: Ciężki pistolet',
          attack: {
            system: {},
            label: 'Rico → Ganger',
            detail: '24 m (13–25 m) · PT 15',
            hit: true,
          },
        }),
      }),
    );
    expect(line?.summary).toBe('Atak: Ciężki pistolet · 14 · Trafienie · 24 m (13–25 m) · PT 15');
    expect(line?.tone).toBe('success');
  });

  it('nazywa pudło pudłem', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'roll',
        roll: roll({ attack: { system: {}, label: 'x', detail: 'PT 20', hit: false } }),
      }),
    );
    expect(line?.summary).toContain('Pudło');
    expect(line?.tone).toBe('failure');
  });

  it('nie gubi krytyka ani fumbla', () => {
    const crit = chatCompactLine(
      baseMessage({ kind: 'roll', roll: roll({ critical: { type: 'crit', extraRoll: 6 } }) }),
    );
    expect(crit?.summary).toContain('Krytyk!');
    const shrugged = chatCompactLine(
      baseMessage({
        kind: 'roll',
        roll: roll({ critical: { type: 'fumble', extraRoll: 3, ignored: true } }),
      }),
    );
    expect(shrugged?.summary).not.toContain('Fumble!');
  });

  it('streszcza obrażenia celem, miejscem i utratą PW', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'damage',
        damage: {
          targetName: 'Ganger',
          location: 'head',
          locationLabel: 'głowa',
          damageRolled: 12,
          armorSp: 4,
          damageThrough: 16,
          doubled: true,
          bonusDamage: 0,
          hpLost: 16,
          hp: { before: 40, after: 24, max: 40 },
          woundLabel: 'Poważnie ranny',
        },
      }),
    );
    expect(line).toEqual({
      actor: 'Ganger',
      summary: 'głowa · −16 PW (24/40) · Poważnie ranny',
      tone: 'failure',
    });
  });

  it('nie zmyśla PW, gdy serwer ich nie przysłał', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'damage',
        damage: {
          targetName: 'Ganger',
          location: 'body',
          locationLabel: 'korpus',
          damageRolled: 9,
          armorSp: 0,
          damageThrough: 9,
          doubled: false,
          bonusDamage: 0,
          hpLost: 9,
        },
      }),
    );
    expect(line?.summary).toBe('korpus · −9 PW');
  });

  it('mówi wprost, że pancerz zatrzymał cios', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'damage',
        damage: {
          targetName: 'Ganger',
          location: 'body',
          locationLabel: 'korpus',
          damageRolled: 5,
          armorSp: 11,
          damageThrough: 0,
          doubled: false,
          bonusDamage: 0,
          hpLost: 0,
        },
      }),
    );
    expect(line?.summary).toContain('pancerz zatrzymał cios (5 obr.)');
    expect(line?.tone).toBe('success');
  });

  it('niesie odmowę akcji razem z jej powodem', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'gmaction',
        action: {
          combatantId: 'c1',
          actorName: 'Rico',
          actionId: 'reload',
          actionName: 'Przeładowanie',
          refusal: { code: 'NO_ACTION', message: 'Akcja już zużyta' },
        },
      }),
    );
    expect(line).toEqual({
      actor: 'Rico',
      summary: 'Przeładowanie · odmowa: Akcja już zużyta',
      tone: 'failure',
    });
  });

  it('liczy pozostałe wiersze rozliczenia zamiast je sklejać', () => {
    const line = chatCompactLine(
      baseMessage({
        kind: 'economy',
        economy: { title: 'Zakup', lines: ['a', 'b', 'c'] },
      }),
    );
    expect(line).toEqual({ actor: 'Zakup', summary: 'a · +2 poz.' });
  });
});
