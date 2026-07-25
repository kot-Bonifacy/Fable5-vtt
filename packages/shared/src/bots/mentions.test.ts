import { describe, expect, it } from 'vitest';
import {
  BOT_CONTINUATION_WINDOW_MS,
  findBotMentions,
  selectBotsToAnswer,
  type BotTriggerCandidate,
} from './mentions.js';

/**
 * Stage 11: who answers a line on session chat. Everything here is pure logic —
 * the server uses exactly these functions, so a false positive would mean a bot
 * butting into a conversation between players.
 */

const SCENE = 'scene-watson';
const OTHER_SCENE = 'scene-korpo';

function bot(overrides: Partial<BotTriggerCandidate> & { id: string; name: string }) {
  return { active: true, sceneId: null, ...overrides } satisfies BotTriggerCandidate;
}

const vex = bot({ id: 'vex', name: 'Vex' });
const sasha = bot({ id: 'sasha', name: 'Sasha' });

describe('findBotMentions', () => {
  it('finds a name with and without the @ prefix, ignoring case', () => {
    expect(findBotMentions('@Vex, masz robotę?', [vex])).toEqual(['vex']);
    expect(findBotMentions('vex, masz robotę?', [vex])).toEqual(['vex']);
    expect(findBotMentions('Pytam VEX o cenę', [vex])).toEqual(['vex']);
  });

  it('accepts Polish inflection but not a longer, different word', () => {
    expect(findBotMentions('Pytam Vexa o robotę', [vex])).toEqual(['vex']);
    expect(findBotMentions('Powiedz Vexowi, że mam eddiesy', [vex])).toEqual(['vex']);
    expect(findBotMentions('Sashy nie ma w mieście', [sasha])).toEqual(['sasha']);
    // „Vexanne" is somebody else — the boundary must hold (`\b` would not,
    // because JS word boundaries are ASCII-only).
    expect(findBotMentions('Vexanne wyszła', [vex])).toEqual([]);
    expect(findBotMentions('Widziałem konwex na dachu', [vex])).toEqual([]);
  });

  it('inflects every word of a multi-word name, soft consonants included', () => {
    const doc = bot({ id: 'doc', name: 'Doktor Kość' });
    // Live test of stage 11: the vocative „Doktorze Kość" was missed when only
    // the last word could inflect, and „Kości" needs the ć→ci change.
    expect(findBotMentions('Doktorze Kość, załatasz mnie?', [doc])).toEqual(['doc']);
    expect(findBotMentions('Idziemy do Doktora Kości', [doc])).toEqual(['doc']);
    expect(findBotMentions('Doktor Kość ma wolne', [doc])).toEqual(['doc']);
    // A different word is still a different person.
    expect(findBotMentions('Doktorat Kość', [doc])).toEqual([]);
  });

  it('prefers the longest matching name and returns names in order of appearance', () => {
    const pan = bot({ id: 'pan', name: 'Pan' });
    const kowalski = bot({ id: 'kowalski', name: 'Pan Kowalski' });
    expect(findBotMentions('Pan Kowalski, chwila', [pan, kowalski])).toEqual(['kowalski']);
    expect(findBotMentions('Vex i Sasha, do mnie', [sasha, vex])).toEqual(['vex', 'sasha']);
  });

  it('never matches an empty text or a bot with a blank name', () => {
    expect(findBotMentions('', [vex])).toEqual([]);
    expect(findBotMentions('cokolwiek', [bot({ id: 'x', name: '   ' })])).toEqual([]);
  });
});

describe('selectBotsToAnswer — mentions', () => {
  it('answers only the bot that was called, not everyone in the scene', () => {
    const ids = selectBotsToAnswer({
      text: 'Vex, ile za tę robotę?',
      origin: 'user',
      sceneId: SCENE,
      bots: [
        bot({ id: 'vex', name: 'Vex', sceneId: SCENE }),
        bot({ id: 'sasha', name: 'Sasha', sceneId: SCENE }),
      ],
    });
    expect(ids).toEqual(['vex']);
  });

  it('caps how many bots one line can call', () => {
    const ids = selectBotsToAnswer({
      text: 'Vex, Sasha, Rip — wszyscy do mnie',
      origin: 'user',
      sceneId: SCENE,
      bots: [vex, sasha, bot({ id: 'rip', name: 'Rip' })],
    });
    expect(ids).toEqual(['vex', 'sasha']);
  });

  it('ignores bots that are not in the session or stand in another scene', () => {
    const ids = selectBotsToAnswer({
      text: 'Vex, Sasha — jesteście tam?',
      origin: 'user',
      sceneId: SCENE,
      bots: [
        bot({ id: 'vex', name: 'Vex', active: false }),
        bot({ id: 'sasha', name: 'Sasha', sceneId: OTHER_SCENE }),
      ],
    });
    expect(ids).toEqual([]);
  });

  it('lets an unpinned bot answer its name in any scene', () => {
    const ids = selectBotsToAnswer({
      text: 'Vex, jesteś?',
      origin: 'user',
      sceneId: OTHER_SCENE,
      bots: [vex],
    });
    expect(ids).toEqual(['vex']);
  });
});

describe('selectBotsToAnswer — „in scene" continuation', () => {
  const pinned = bot({ id: 'vex', name: 'Vex', sceneId: SCENE });

  it('answers a reply to its own last line without being named again', () => {
    const ids = selectBotsToAnswer({
      text: 'Zgoda, płacimy.',
      origin: 'user',
      sceneId: SCENE,
      previous: { botId: 'vex', agoMs: 5_000 },
      bots: [pinned],
    });
    expect(ids).toEqual(['vex']);
  });

  it('stops answering once the conversation has gone cold', () => {
    const ids = selectBotsToAnswer({
      text: 'Zgoda, płacimy.',
      origin: 'user',
      sceneId: SCENE,
      previous: { botId: 'vex', agoMs: BOT_CONTINUATION_WINDOW_MS + 1 },
      bots: [pinned],
    });
    expect(ids).toEqual([]);
  });

  it('stays out when the previous line was a human one', () => {
    const ids = selectBotsToAnswer({
      text: 'A ty co o tym myślisz?',
      origin: 'user',
      sceneId: SCENE,
      previous: { botId: null, agoMs: 1_000 },
      bots: [pinned],
    });
    expect(ids).toEqual([]);
  });

  it('does not continue for a bot that is only called by name', () => {
    const ids = selectBotsToAnswer({
      text: 'Zgoda, płacimy.',
      origin: 'user',
      sceneId: SCENE,
      previous: { botId: 'vex', agoMs: 1_000 },
      bots: [vex],
    });
    expect(ids).toEqual([]);
  });
});

describe('selectBotsToAnswer — loop guard', () => {
  it('never lets a generated line call anyone', () => {
    const ids = selectBotsToAnswer({
      text: 'Sasha, powiedz im prawdę.',
      origin: 'bot',
      sceneId: SCENE,
      previous: { botId: 'vex', agoMs: 1_000 },
      bots: [bot({ id: 'sasha', name: 'Sasha', sceneId: SCENE })],
    });
    expect(ids).toEqual([]);
  });

  it('lets the GM speaking as an NPC call another bot by name, but not continue a thread', () => {
    const bots = [bot({ id: 'sasha', name: 'Sasha', sceneId: SCENE })];
    expect(
      selectBotsToAnswer({
        text: 'Sasha, powiedz im prawdę.',
        origin: 'gm_as_bot',
        sceneId: SCENE,
        bots,
      }),
    ).toEqual(['sasha']);
    expect(
      selectBotsToAnswer({
        text: 'Powiedz im prawdę.',
        origin: 'gm_as_bot',
        sceneId: SCENE,
        previous: { botId: 'sasha', agoMs: 1_000 },
        bots,
      }),
    ).toEqual([]);
  });
});
