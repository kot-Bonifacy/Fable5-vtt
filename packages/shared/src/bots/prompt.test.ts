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
    expect(data.voice.enabled).toBe(false);
  });

  it('defaults thinking blocks on for the GM assistant only', () => {
    expect(createDefaultBotData('gm_assistant').generation.reasoning).toBe(true);
    expect(createDefaultBotData('npc').generation.reasoning).toBe(false);
  });
});
