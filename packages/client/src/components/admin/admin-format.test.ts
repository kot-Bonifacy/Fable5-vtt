import { describe, expect, it } from 'vitest';
import { adminDuration } from './admin-format.js';
import { suggestTemporaryPassword } from './AdminAccounts.js';

describe('panel administratora — drobiazgi', () => {
  it('czas sesji w godzinach i minutach', () => {
    const start = '2026-10-17T18:00:00.000Z';
    expect(adminDuration(start, '2026-10-17T18:00:30.000Z')).toBe('< 1 min');
    expect(adminDuration(start, '2026-10-17T18:40:00.000Z')).toBe('40 min');
    expect(adminDuration(start, '2026-10-17T20:00:00.000Z')).toBe('2 h');
    expect(adminDuration(start, '2026-10-17T21:15:00.000Z')).toBe('3 h 15 min');
    // Trwająca — liczona do teraz.
    expect(adminDuration(start, null, Date.parse('2026-10-17T18:05:00.000Z'))).toBe('5 min');
  });

  it('hasło tymczasowe przechodzi regułę hasła i nie ma mylących znaków', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = suggestTemporaryPassword();
      expect(password).toHaveLength(12);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });
});
