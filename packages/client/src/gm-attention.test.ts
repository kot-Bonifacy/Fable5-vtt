import { expect, it } from 'vitest';
import type { ChatMessageView, CreationPermitRow, CreationRankDraft } from '@vtt/shared';
import {
  gmAttentionItems,
  gmAttentionTitle,
  newGmAttention,
  type GmAttentionSources,
} from './gm-attention.js';

const empty: GmAttentionSources = { chat: [], permits: [], ranks: [], characters: [] };

const message = (patch: Partial<ChatMessageView>): ChatMessageView => ({
  id: 7,
  kind: 'say',
  authorId: 'player',
  authorName: 'Gracz',
  text: '',
  createdAt: '2026-09-25T00:00:00Z',
  ...patch,
});

const permit = (patch: Partial<CreationPermitRow>): CreationPermitRow => ({
  userId: 'u1',
  userName: 'Marek',
  status: 'requested',
  rulesAccepted: false,
  terms: null,
  ...patch,
});

const draft = (patch: Partial<CreationRankDraft>): CreationRankDraft => ({
  id: 'd1',
  userName: 'Ola',
  characterName: 'Kruk',
  method: 'complete',
  rolledStats: [],
  skillPoints: 86,
  methodFixed: true,
  statRankId: null,
  rankApproved: false,
  ...patch,
});

it('lists a request for a new character, but not a consent already given', () => {
  const items = gmAttentionItems({
    ...empty,
    permits: [permit({}), permit({ userId: 'u2', status: 'granted' })],
  });
  expect(items).toEqual([
    {
      key: 'permit:u1',
      kind: 'permit',
      text: 'Marek prosi o zgodę na nową postać',
      tab: 'characters',
    },
  ]);
});

it('lists drafts waiting for a rank and cards waiting for „Przyjmij do gry”', () => {
  const items = gmAttentionItems({
    ...empty,
    ranks: [
      draft({}),
      draft({ id: 'd2', rankApproved: true }),
      draft({ id: 'd3', characterName: '' }),
    ],
    characters: [
      { id: 'c1', name: 'Stym', playReady: false },
      { id: 'c2', name: 'Paser', playReady: true },
    ],
  });
  expect(items.map((item) => [item.key, item.text])).toEqual([
    ['rank:d1', 'Szkic „Kruk” (Ola) czeka na Rangę Postaci'],
    ['rank:d3', 'Szkic Ola czeka na Rangę Postaci'],
    ['ready:c1', '„Stym” czeka na przyjęcie do gry'],
  ]);
});

it('lists open Test requests and proposals only the GM can answer', () => {
  const request: NonNullable<ChatMessageView['request']> = {
    characterId: 'c1',
    characterName: 'Stym',
    askedById: 'player',
    askedByName: 'Marek',
    rollLabel: 'Percepcja (INT)',
    system: {},
  };
  const proposal: NonNullable<ChatMessageView['proposal']> = {
    botId: 'b1',
    botName: 'Rico',
    characterId: null,
    characterName: null,
    optionLabel: 'Percepcja',
    optionId: 'perception',
    reason: '',
    request: '',
    controllerUserId: null,
  };
  const items = gmAttentionItems({
    ...empty,
    chat: [
      { type: 'message', message: message({ id: 1, kind: 'request', request }) },
      {
        type: 'message',
        message: message({
          id: 2,
          kind: 'request',
          request: { ...request, resolution: { kind: 'withdrawn', byName: 'Marek' } },
        }),
      },
      { type: 'message', message: message({ id: 3, kind: 'proposal', proposal }) },
      {
        type: 'message',
        message: message({
          id: 4,
          kind: 'proposal',
          proposal: { ...proposal, controllerUserId: 'player' },
        }),
      },
      {
        type: 'message',
        message: message({
          id: 5,
          kind: 'proposal',
          proposal: { ...proposal, resolution: 'approved' },
        }),
      },
      { type: 'note', id: 'n', text: 'notatka' },
    ],
  });
  expect(items.map((item) => [item.key, item.kind, item.tab, item.text])).toEqual([
    ['msg:1', 'request', 'chat', 'Marek prosi o Test: Percepcja (INT)'],
    ['msg:3', 'proposal', 'chat', 'Rico czeka na zatwierdzenie: Percepcja'],
  ]);
});

it('lists players waiting for a portrait from an exhausted pool (#68)', () => {
  const items = gmAttentionItems({
    ...empty,
    portraitWanted: [{ userId: 'u7', userName: 'Kuba' }],
  });
  expect(items).toEqual([
    {
      key: 'portrait:u7',
      kind: 'portrait',
      text: 'Kuba czeka na portret — w puli graczy nie ma wolnego',
      tab: 'characters',
    },
  ]);
});

it('a matter is news only when it was not there before the push', () => {
  const before = gmAttentionItems({ ...empty, permits: [permit({})] });
  const after = gmAttentionItems({
    ...empty,
    permits: [permit({}), permit({ userId: 'u2', userName: 'Ola' })],
  });
  expect(newGmAttention(before, after).map((item) => item.key)).toEqual(['permit:u2']);
  expect(newGmAttention(after, before)).toEqual([]);
});

it('the tab title carries the count and drops it again', () => {
  expect(gmAttentionTitle('VTT — Cyberpunk RED', 2)).toBe('(2) VTT — Cyberpunk RED');
  expect(gmAttentionTitle('(2) VTT — Cyberpunk RED', 3)).toBe('(3) VTT — Cyberpunk RED');
  expect(gmAttentionTitle('(3) VTT — Cyberpunk RED', 0)).toBe('VTT — Cyberpunk RED');
});

it('lists a card a player submitted from a file until the GM decides or it expires (57c)', () => {
  const entry = {
    submissionId: 'a'.repeat(24),
    userId: 'player',
    userName: 'Rogue',
    name: 'Kira',
    roleName: 'Solo',
    roleRank: 4,
    hasPortrait: true,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'open' as const,
  };
  const items = gmAttentionItems({
    ...empty,
    chat: [
      {
        type: 'message',
        message: message({ id: 1, kind: 'cardsubmission', cardSubmission: entry }),
      },
      {
        type: 'message',
        message: message({
          id: 2,
          kind: 'cardsubmission',
          cardSubmission: { ...entry, status: 'accepted' },
        }),
      },
      {
        type: 'message',
        message: message({
          id: 3,
          kind: 'cardsubmission',
          cardSubmission: { ...entry, expiresAt: '2026-01-01T00:00:00Z' },
        }),
      },
    ],
  });
  expect(items).toEqual([
    {
      key: 'msg:1',
      kind: 'card',
      text: 'Rogue zgłasza kartę „Kira” do wczytania',
      tab: 'chat',
    },
  ]);
});
