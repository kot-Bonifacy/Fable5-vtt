import { describe, expect, it } from 'vitest';
import type { CampaignSummary } from '@vtt/shared';
import { formatSessionClock, isBetweenSessions } from './session-view.js';

const campaign = (sessionStartedAt: string | null): CampaignSummary => ({
  id: 'c1',
  name: 'Ulice Night City',
  sandbox: false,
  sessionStartedAt,
  lastSessionEndedAt: null,
});

describe('widok między sesjami (etap 44c)', () => {
  it('dotyczy wyłącznie gracza z kampanią bez trwającej sesji', () => {
    expect(isBetweenSessions(campaign(null), false)).toBe(true);
    expect(isBetweenSessions(campaign('2026-10-04T18:00:00.000Z'), false)).toBe(false);
    // MG w tym czasie przygotowuje przy stole.
    expect(isBetweenSessions(campaign(null), true)).toBe(false);
    // Bez kampanii to inny ekran („brak kampanii”), nie „między sesjami”.
    expect(isBetweenSessions(null, false)).toBe(false);
  });

  it('godzina dziś, data z godziną innego dnia', () => {
    const now = new Date(2026, 9, 4, 21, 0);
    expect(formatSessionClock(new Date(2026, 9, 4, 19, 4).toISOString(), now)).toBe('19:04');
    expect(formatSessionClock(new Date(2026, 9, 3, 23, 10).toISOString(), now)).toMatch(
      /^3 paź.*23:10$/,
    );
  });
});
