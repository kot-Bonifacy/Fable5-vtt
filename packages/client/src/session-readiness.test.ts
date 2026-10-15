import { describe, expect, it } from 'vitest';
import { gmAttentionItems } from './gm-attention.js';
import {
  readinessForAttention,
  readinessKey,
  sessionReadinessIssues,
  type ReadinessSources,
} from './session-readiness.js';

const scene = (fields: Partial<ReadinessSources['scenes'][number]> = {}) => ({
  id: 's1',
  name: 'Bar',
  active: true,
  hasSpawn: true,
  ...fields,
});

const character = (fields: Partial<ReadinessSources['characters'][number]> = {}) => ({
  id: 'c1',
  name: 'Kowal',
  ownerId: 'u1',
  playReady: true,
  template: false,
  ...fields,
});

const base = (fields: Partial<ReadinessSources> = {}): ReadinessSources => ({
  scenes: [scene()],
  players: [{ id: 'u1', name: 'Ola' }],
  characters: [character()],
  permits: [],
  ...fields,
});

describe('sessionReadinessIssues', () => {
  it('is empty when the active scene has a start and every player a ready character', () => {
    expect(sessionReadinessIssues(base())).toEqual([]);
  });

  it('flags the active scene without a start, and only that one', () => {
    const issues = sessionReadinessIssues(
      base({
        scenes: [scene({ hasSpawn: false }), scene({ id: 's2', active: false, hasSpawn: false })],
      }),
    );
    expect(issues).toEqual([
      expect.objectContaining({ key: readinessKey.spawn('s1'), kind: 'spawn', sceneId: 's1' }),
    ]);
    expect(issues[0]!.text).toContain('„Bar”');
  });

  it('flags a campaign without an active scene', () => {
    const issues = sessionReadinessIssues(base({ scenes: [scene({ active: false })] }));
    expect(issues.map((issue) => issue.kind)).toEqual(['scene']);
  });

  it('tells apart a player with nothing, a request, a consent and a sheet awaiting approval', () => {
    const issues = sessionReadinessIssues(
      base({
        players: [
          { id: 'u1', name: 'Ola' },
          { id: 'u2', name: 'Bartek' },
          { id: 'u3', name: 'Celina' },
          { id: 'u4', name: 'Darek' },
        ],
        characters: [character({ ownerId: 'u4', name: 'Sowa', playReady: false })],
        permits: [
          { userId: 'u2', status: 'requested' },
          { userId: 'u3', status: 'granted' },
        ],
      }),
    );
    expect(issues.map((issue) => [issue.key, issue.kind])).toEqual([
      [readinessKey.player('u1'), 'no-character'],
      [readinessKey.player('u2'), 'permit'],
      [readinessKey.player('u3'), 'creating'],
      [readinessKey.player('u4'), 'pending'],
    ]);
    expect(issues[3]!.text).toBe('„Sowa” (Darek) czeka na przyjęcie do gry');
  });

  it('does not count a template or an NPC as the player’s character', () => {
    const issues = sessionReadinessIssues(
      base({
        characters: [character({ template: true }), character({ id: 'c2', ownerId: null })],
      }),
    );
    expect(issues.map((issue) => issue.kind)).toEqual(['no-character']);
  });

  it('one ready character is enough, even beside a draft awaiting approval', () => {
    const issues = sessionReadinessIssues(
      base({ characters: [character({ id: 'c2', playReady: false }), character()] }),
    );
    expect(issues).toEqual([]);
  });
});

describe('readiness in „Czeka na MG”', () => {
  it('skips what already has its own row: a consent request and a sheet awaiting approval', () => {
    const issues = sessionReadinessIssues(
      base({
        scenes: [scene({ hasSpawn: false })],
        players: [
          { id: 'u1', name: 'Ola' },
          { id: 'u2', name: 'Bartek' },
          { id: 'u3', name: 'Celina' },
        ],
        characters: [character({ ownerId: 'u3', playReady: false })],
        permits: [{ userId: 'u2', status: 'requested' }],
      }),
    );
    expect(readinessForAttention(issues).map((issue) => issue.kind)).toEqual([
      'spawn',
      'no-character',
    ]);
  });

  it('becomes attention rows: the start leads to the scene, a player to the characters', () => {
    const readiness = sessionReadinessIssues(
      base({ scenes: [scene({ hasSpawn: false })], characters: [] }),
    );
    const items = gmAttentionItems({ chat: [], permits: [], ranks: [], characters: [], readiness });
    expect(items.map((item) => [item.kind, item.tab, item.sceneId])).toEqual([
      ['spawn', 'scenes', 's1'],
      ['player', 'characters', undefined],
    ]);
  });
});
