import { describe, expect, it } from 'vitest';
import { SESSION_SLOTS_FULL_TEXT, sessionAutoEndText, sessionErrorText } from './sessions.js';

describe('sesje — zdania dla ludzi (etap 44c)', () => {
  it('odmowa trzeciej sesji mówi dokładnie to, co rozpiska etapu', () => {
    expect(sessionErrorText('SESSION_SLOTS_FULL')).toBe(SESSION_SLOTS_FULL_TEXT);
    expect(SESSION_SLOTS_FULL_TEXT).toBe(
      'Wszystkie miejsca na sesje są zajęte — serwer nie obsłuży więcej sesji naraz. Spróbuj, gdy któraś się skończy.',
    );
  });

  it('każdy kod obszaru ma zdanie, obcy kod — null', () => {
    for (const code of ['SESSION_NOT_RUNNING', 'SESSION_RUNNING', 'CAMPAIGN_NOT_OPEN']) {
      expect(sessionErrorText(code)).toMatch(/\.$/);
    }
    expect(sessionErrorText('NOT_FOUND')).toBeNull();
  });

  it('wpis o automatycznym końcu podaje próg po ludzku', () => {
    expect(sessionAutoEndText('empty', 15)).toContain('przez 15 min nikogo nie było przy stole');
    expect(sessionAutoEndText('idle', 180)).toContain('przez 3 h nic się przy stole nie wydarzyło');
    expect(sessionAutoEndText('idle', 60)).toContain('przez godzinę');
    expect(sessionAutoEndText('idle', 90)).toContain('przez 90 min');
  });
});
