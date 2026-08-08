import { describe, expect, it } from 'vitest';
import {
  appendLesson,
  createDefaultBotData,
  createLesson,
  mergeBotData,
  parseBotData,
  validateBotDataPatch,
} from './profile.js';
import {
  buildLessonPrompt,
  buildRetryAnchor,
  buildRoleAnchor,
  compileBotPrompt,
  normalizeLesson,
  repeatedCatchphrase,
} from './prompt.js';
import type { BotProfileData } from './types.js';

function fixer(): BotProfileData {
  const data = createDefaultBotData('npc');
  return mergeBotData(data, {
    persona: {
      personality: 'Cyniczna fikserka z Watson.',
      motivations: 'Chce wyjść z długów u Tygrysów.',
      secrets: 'Sypie Tygrysom informacje o klientach.',
      speechStyle: 'Krótkie zdania, slang, dużo ironii.',
      catchphrases: ['Czas to eddiesy, skarbie.'],
    },
    knowledge: {
      world: 'Night City, 2045.',
      campaign: 'Drużyna szuka kuriera Militechu.',
      people: 'Zna Johnny’ego z dawnej roboty.',
      forbidden: 'Nie wie, kto zabił Sashę.',
    },
  });
}

describe('compileBotPrompt — where the bot is talking (stage 11)', () => {
  it('explains session chat: several speakers, answer only what was addressed', () => {
    const prompt = compileBotPrompt({
      name: 'Vex',
      data: fixer(),
      participants: ['Johnny', 'Rogue'],
      scene: 'Bar Afterlife',
      mode: 'chat',
    });
    expect(prompt).toContain('Miejsce sceny: Bar Afterlife');
    expect(prompt).toContain('ostatnią wypowiedź skierowaną do Ciebie');
    // Whispered lines are in the same transcript — they must not be repeated.
    expect(prompt).toContain('„(szeptem)"');
    expect(buildRoleAnchor({ name: 'Vex', data: fixer(), mode: 'chat' })).toContain(
      'ostatnią wypowiedź skierowaną do Ciebie',
    );
  });

  it('marks a whisper as a private exchange and names the other side', () => {
    const prompt = compileBotPrompt({
      name: 'Vex',
      data: fixer(),
      mode: 'whisper',
      whisperWith: 'Johnny',
    });
    expect(prompt).toContain('Rozmawiacie na osobności');
    expect(prompt).toContain('Johnny');
  });

  it('tells the bot not to echo the catchphrase it just used', () => {
    const data = fixer();
    const anchor = buildRoleAnchor({
      name: 'Vex',
      data,
      mode: 'chat',
      lastOwnLine: 'No i co z tego? Czas to eddiesy, skarbie.',
    });
    expect(anchor).toContain('Nie powtarzaj zwrotu „Czas to eddiesy, skarbie."');
    expect(repeatedCatchphrase(data, 'Nie znam takiego gościa.')).toBeNull();
    expect(repeatedCatchphrase(data, null)).toBeNull();
    // Punctuation and case must not hide a repeat.
    expect(repeatedCatchphrase(data, 'czas to EDDIESY skarbie!')).toBe('Czas to eddiesy, skarbie.');
  });

  it('says nothing about the situation in the editor sandbox', () => {
    const prompt = compileBotPrompt({ name: 'Vex', data: fixer() });
    expect(prompt).not.toContain('Rozmowa toczy się na żywo');
    expect(prompt).not.toContain('Rozmawiacie na osobności');
  });
});

describe('compileBotPrompt', () => {
  it('carries every profile section and the hard rules', () => {
    const prompt = compileBotPrompt({ name: 'Vex', data: fixer(), participants: ['Johnny'] });
    expect(prompt).toContain('Wcielasz się w postać o imieniu Vex');
    expect(prompt).toContain('Cyniczna fikserka z Watson.');
    expect(prompt).toContain('Czas to eddiesy, skarbie.');
    expect(prompt).toContain('Nie wie, kto zabił Sashę.');
    expect(prompt).toContain('Żelazne zasady');
    expect(prompt).toContain('nie mówisz, że jesteś sztuczną inteligencją');
    // Other people at the table are named so the bot does not speak for them.
    expect(prompt).toContain('Johnny');
  });

  it('includes only enabled lessons', () => {
    let data = appendLesson(fixer(), createLesson('Mów krócej — najwyżej dwa zdania.'));
    data = appendLesson(data, { ...createLesson('Nie wspominaj o Tygrysach.'), enabled: false });
    const prompt = compileBotPrompt({ name: 'Vex', data });
    expect(prompt).toContain('Mów krócej — najwyżej dwa zdania.');
    expect(prompt).not.toContain('Nie wspominaj o Tygrysach.');
  });

  it('switches to assistant rules for the GM helper', () => {
    const data = createDefaultBotData('gm_assistant');
    const prompt = compileBotPrompt({ name: 'Sekretarz', data });
    expect(prompt).toContain('asystentem Mistrza Gry');
    expect(prompt).toContain('Nie zmyślasz zasad gry ani liczb.');
    expect(prompt).not.toContain('Nigdy nie wychodzisz z tej roli');
  });
});

describe('role anchor', () => {
  it('repeats the role and the two newest lessons at the end of the context', () => {
    let data = fixer();
    for (const text of ['Lekcja pierwsza.', 'Lekcja druga.', 'Lekcja trzecia.']) {
      data = appendLesson(data, createLesson(text));
    }
    const anchor = buildRoleAnchor({ name: 'Vex', data });
    expect(anchor).toContain('Jesteś Vex.');
    expect(anchor).toContain('Lekcja druga.');
    expect(anchor).toContain('Lekcja trzecia.');
    expect(anchor).not.toContain('Lekcja pierwsza.');
  });

  it('names the reason in the retry reminder', () => {
    const anchor = buildRetryAnchor({ name: 'Vex', data: fixer() }, 'ai_self_reference');
    expect(anchor).toContain('przyznanie się do bycia sztuczną inteligencją');
    expect(anchor).toContain('wyłącznie jako Vex');
  });
});

describe('lessons from GM corrections', () => {
  it('asks the model for one imperative sentence, with examples', () => {
    const { system, user } = buildLessonPrompt('Vex', 'Za dużo gada o pogodzie', 'A pogoda dziś…');
    expect(system).toContain('jedno zdanie po polsku');
    // Examples are what actually stops a 9B model from answering in character.
    expect(system).toContain('Przykłady:');
    expect(system).toContain('NIE wcielasz się w postać');
    expect(user).toContain('Za dużo gada o pogodzie');
    expect(user).toContain('A pogoda dziś…');
    expect(user.trimEnd().endsWith('→ Reguła:')).toBe(true);
  });

  it('normalizes the model answer into a storable rule', () => {
    expect(normalizeLesson('Reguła: „Mów krócej."\nTo wszystko.')).toBe('Mów krócej.');
    expect(normalizeLesson('- Nie zdradzaj adresu kryjówki.')).toBe(
      'Nie zdradzaj adresu kryjówki.',
    );
  });
});

describe('profile storage', () => {
  it('rejects an unknown type and an out-of-range temperature', () => {
    expect(validateBotDataPatch({ type: 'wrog' })).toEqual({
      ok: false,
      issues: [{ field: 'type', message: 'Nieznany typ bota.' }],
    });
    const bad = validateBotDataPatch({ generation: { temperature: 9, maxTokens: 200 } });
    expect(bad.ok).toBe(false);
  });

  it('fills in missing sections when reading a partial profile', () => {
    const data = parseBotData('{"type":"companion","persona":{"personality":"Cichy snajper."}}');
    expect(data.type).toBe('companion');
    expect(data.persona.personality).toBe('Cichy snajper.');
    expect(data.persona.catchphrases).toEqual([]);
    expect(data.knowledge.world).toBe('');
    expect(data.generation.reasoning).toBe(false);
  });

  it('drops the retired voice section instead of rejecting an old profile', () => {
    // Profile zapisane przed wycofaniem mowy botów mają w JSON-ie sekcję `voice`.
    // Musi być po cichu pomijana — inaczej stary bot przestałby się wczytywać.
    const data = parseBotData(
      '{"type":"npc","voice":{"enabled":true,"presetId":"pl-fixer","rate":1.2},"persona":{"personality":"Barman."}}',
    );
    expect(data.persona.personality).toBe('Barman.');
    expect('voice' in data).toBe(false);
  });

  it('defaults thinking blocks on for the GM assistant only', () => {
    expect(createDefaultBotData('gm_assistant').generation.reasoning).toBe(true);
    expect(createDefaultBotData('npc').generation.reasoning).toBe(false);
  });
});

describe('compileBotPrompt — campaign knowledge (stage 19b)', () => {
  const passages = [
    {
      chunkId: 1,
      entryId: 'e1',
      title: 'Klub Afterlife',
      text: 'Klub Afterlife\n\nBar w podziemiach, w którym solówki szukają zleceń.',
      score: 0.9,
    },
  ];

  it('pastes the passages as the bot’s own memory, with no citation', () => {
    const prompt = compileBotPrompt({
      name: 'Vex',
      data: fixer(),
      knowledgePassages: passages,
    });
    expect(prompt).toContain('# Co pamiętasz na ten temat');
    expect(prompt).toContain('Bar w podziemiach');
    // A bot is a person, not the rules assistant: no source, no [1] markers.
    expect(prompt).not.toContain('[1]');
    expect(prompt).toContain('nie powołujesz się na notatki');
  });

  it('remembers BEFORE it keeps quiet — a blind spot outranks a passage', () => {
    const prompt = compileBotPrompt({
      name: 'Vex',
      data: fixer(),
      knowledgePassages: passages,
    });
    // The GM’s explicit „you don’t know this" is the last word in the profile,
    // so it has to sit after anything the search pulled in.
    expect(prompt.indexOf('Co pamiętasz na ten temat')).toBeLessThan(
      prompt.indexOf('Czego nie wiesz i o czym milczysz'),
    );
    expect(prompt.indexOf('Co pamiętasz na ten temat')).toBeGreaterThan(
      prompt.indexOf('# Co wiesz'),
    );
  });

  it('adds no section at all when nothing was found', () => {
    const prompt = compileBotPrompt({ name: 'Vex', data: fixer(), knowledgePassages: [] });
    expect(prompt).not.toContain('Co pamiętasz');
  });

  it('tells the bot to admit it does not know a name it never heard', () => {
    const prompt = compileBotPrompt({ name: 'Vex', data: fixer() });
    expect(prompt).toContain('nie kojarzysz');
  });
});

describe('compileBotPrompt — attitude towards the speaker (stage 19c)', () => {
  const relation = { characterName: 'Vex', value: -2, note: 'Okradł go przy wszystkich.' };

  it('states the degree AND the reason, and repeats it in the anchor', () => {
    const prompt = compileBotPrompt({ name: 'Barman', data: fixer(), relation });
    expect(prompt).toContain('# Z kim rozmawiasz');
    expect(prompt).toContain('Rozmawiasz z: Vex.');
    expect(prompt).toContain('wrogi');
    expect(prompt).toContain('Okradł go przy wszystkich.');
    // A 9B model drifts away from a section it read forty lines ago.
    expect(buildRoleAnchor({ name: 'Barman', data: fixer(), relation })).toContain('wrogi');
  });

  it('a friendly and a hostile attitude produce different prompts', () => {
    const hostile = compileBotPrompt({ name: 'Barman', data: fixer(), relation });
    const friendly = compileBotPrompt({
      name: 'Barman',
      data: fixer(),
      relation: { ...relation, value: 3, note: 'Wyciągnął go z opresji.' },
    });
    expect(hostile).not.toBe(friendly);
    expect(friendly).toContain('oddany przyjaciel');
    expect(friendly).not.toContain('wrogi');
  });

  it('adds nothing when the speaker is not a player character', () => {
    // The GM's own lines and the editor sandbox carry no relation at all.
    const prompt = compileBotPrompt({ name: 'Barman', data: fixer() });
    expect(prompt).not.toContain('Z kim rozmawiasz');
    expect(buildRoleAnchor({ name: 'Barman', data: fixer() })).not.toContain('Mówisz do postaci');
  });

  it('keeps secrets above the attitude — a warm NPC still does not spill them', () => {
    const prompt = compileBotPrompt({ name: 'Barman', data: fixer(), relation });
    expect(prompt.indexOf('Z kim rozmawiasz')).toBeLessThan(prompt.indexOf('Twoje sekrety'));
  });
});
