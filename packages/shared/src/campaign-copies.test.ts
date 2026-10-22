import { describe, expect, it } from 'vitest';
import {
  campaignCopyName,
  campaignCopySessionLabel,
  confirmsCampaignName,
  parseCampaignCopyName,
  planCampaignCopyRotation,
  type CampaignCopyRef,
} from './archive.js';

describe('campaignCopyName', () => {
  it('carries the moment to the millisecond and the reason', () => {
    const at = new Date('2026-10-22T14:30:05.123Z');
    expect(campaignCopyName(at, 'start')).toBe('copy-20261022-143005-123-start');
    expect(parseCampaignCopyName('copy-20261022-143005-123-start')).toEqual({
      takenAt: at,
      reason: 'start',
    });
  });

  it('orders by name the same way as by time, also within one second', () => {
    const start = campaignCopyName(new Date('2026-10-22T14:30:05.100Z'), 'start');
    const end = campaignCopyName(new Date('2026-10-22T14:30:05.900Z'), 'end');
    expect(start < end).toBe(true);
  });

  it('does not recognise names outside the scheme', () => {
    expect(parseCampaignCopyName('snapshot-2026-10-22-1430')).toBeNull();
    expect(parseCampaignCopyName('copy-20261022-143005-123-start.partial')).toBeNull();
    expect(parseCampaignCopyName('copy-20261022-143005-123-whenever')).toBeNull();
    expect(parseCampaignCopyName('na-zawsze')).toBeNull();
  });
});

/** Sesja `n` (start o n-tej godzinie): kopie start, co godzinę, koniec. */
function session(n: number, hourly = 0): CampaignCopyRef[] {
  const base = Date.UTC(2026, 9, 1 + n, 18);
  const key = new Date(base).toISOString();
  const refs: CampaignCopyRef[] = [
    { name: campaignCopyName(new Date(base), 'start'), session: key },
  ];
  for (let hour = 1; hour <= hourly; hour += 1) {
    refs.push({
      name: campaignCopyName(new Date(base + hour * 3_600_000), 'hourly'),
      session: key,
    });
  }
  refs.push({
    name: campaignCopyName(new Date(base + (hourly + 1) * 3_600_000), 'end'),
    session: key,
  });
  return refs;
}

describe('planCampaignCopyRotation', () => {
  it('keeps every copy of the 10 newest sessions after the 11th', () => {
    const copies = Array.from({ length: 11 }, (_, n) => session(n, n % 3)).flat();
    const plan = planCampaignCopyRotation(copies, 10);
    const oldest = session(0, 0).map((copy) => copy.name);
    expect(plan.drop).toEqual(oldest);
    expect(plan.keep).toHaveLength(copies.length - oldest.length);
    expect(plan.keep).not.toContain(oldest[0]);
  });

  it('counts all copies of one session as one position', () => {
    const copies = [...session(1, 5), ...session(2, 0)];
    const plan = planCampaignCopyRotation(copies, 1);
    expect(plan.keep).toEqual(
      session(2, 0)
        .map((copy) => copy.name)
        .reverse(),
    );
    expect(plan.drop).toEqual(session(1, 5).map((copy) => copy.name));
  });

  it('counts a copy outside a session (before a rollback) as its own position', () => {
    const rollback: CampaignCopyRef = {
      name: campaignCopyName(new Date(Date.UTC(2026, 9, 20, 12)), 'rollback'),
      session: null,
    };
    const copies = [...session(1), ...session(2), rollback];
    const plan = planCampaignCopyRotation(copies, 2);
    expect(plan.keep).toContain(rollback.name);
    expect(plan.drop).toEqual(session(1).map((copy) => copy.name));
  });

  it('never drops a name it does not recognise', () => {
    const copies = [...session(1), { name: 'przed-premiera', session: null }];
    const plan = planCampaignCopyRotation(copies, 0);
    expect(plan.ignored).toEqual(['przed-premiera']);
    expect(plan.drop).toHaveLength(2);
    expect(plan.keep).toEqual([]);
  });
});

describe('confirmsCampaignName', () => {
  it('ignores case and surrounding spaces, not letters', () => {
    expect(confirmsCampaignName('  NOC W watsonie ', 'Noc w Watsonie')).toBe(true);
    expect(confirmsCampaignName('Ząb', 'ZĄB')).toBe(true);
    expect(confirmsCampaignName('Noc', 'Noc w Watsonie')).toBe(false);
  });
});

describe('campaignCopySessionLabel', () => {
  it('names the session by its start or says there was none', () => {
    expect(campaignCopySessionLabel(null)).toBe('poza sesją');
    const local = new Date(2026, 9, 22, 18, 5);
    expect(campaignCopySessionLabel(local.toISOString())).toBe('sesja 22.10, 18:05');
  });
});
