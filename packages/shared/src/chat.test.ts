import { describe, expect, it } from 'vitest';
import { parseChatInput } from './chat.js';

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

describe('parseChatInput — unknown commands', () => {
  it('flags an unknown command with its name', () => {
    expect(parseChatInput('/dance', ROSTER)).toEqual({ kind: 'unknown-command', command: 'dance' });
  });

  it('flags a lone slash as unknown', () => {
    expect(parseChatInput('/', ROSTER)).toEqual({ kind: 'unknown-command', command: '' });
  });

  it('does not know /r yet (arrives in stage 06)', () => {
    expect(parseChatInput('/r 1d10', ROSTER)).toEqual({ kind: 'unknown-command', command: 'r' });
  });
});
