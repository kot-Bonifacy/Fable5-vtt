import { describe, expect, it } from 'vitest';
import { detectBotBreak, sanitizeBotReply } from './guardrails.js';

const npc = { botName: 'Vex', type: 'npc' as const, participants: ['Johnny', 'Rogue', 'Vex'] };

describe('sanitizeBotReply', () => {
  it('drops the bot own name label and stage directions', () => {
    const result = sanitizeBotReply('Vex: *zapala papierosa* Masz forsę czy tylko gadasz?', npc);
    expect(result.text).toBe('Masz forsę czy tylko gadasz?');
    expect(result.changed).toBe(true);
  });

  it('cuts the answer where the model starts writing for someone else', () => {
    const raw = ['Vex: Dwa tysiące i temat zamknięty.', 'Johnny: Zgoda, biorę robotę.'].join('\n');
    expect(sanitizeBotReply(raw, npc).text).toBe('Dwa tysiące i temat zamknięty.');
  });

  it('removes whole-line asides and unwraps a fully quoted answer', () => {
    const raw = ['(uśmiecha się krzywo)', '„Nie znam takiego gościa."'].join('\n');
    expect(sanitizeBotReply(raw, npc).text).toBe('Nie znam takiego gościa.');
  });

  it('leaves a clean answer untouched', () => {
    const raw = 'Znam kogoś, kto to załatwi. Ale nie za darmo.';
    const result = sanitizeBotReply(raw, npc);
    expect(result.text).toBe(raw);
    expect(result.changed).toBe(false);
  });

  it('trims an overlong answer at a sentence end', () => {
    const raw = `${'Gadasz i gadasz. '.repeat(10)}Koniec tematu.`;
    const result = sanitizeBotReply(raw, { ...npc, maxChars: 60 });
    expect(result.text.length).toBeLessThanOrEqual(60);
    expect(result.text.endsWith('.')).toBe(true);
  });

  it('keeps lists and markdown for the GM assistant', () => {
    const raw = '## Pomysły\n- zasadzka w metrze\n- kurier z przesyłką';
    const result = sanitizeBotReply(raw, { botName: 'Asystent', type: 'gm_assistant' });
    expect(result.text).toBe(raw);
    expect(result.changed).toBe(false);
  });
});

describe('detectBotBreak', () => {
  it('accepts an in-character answer', () => {
    expect(detectBotBreak('Nie mam pojęcia, o czym mówisz, słonko.', npc)).toBeNull();
  });

  it('catches an AI confession', () => {
    expect(detectBotBreak('Jako model językowy nie mam uczuć.', npc)).toBe('ai_self_reference');
    expect(detectBotBreak('Jestem sztuczną inteligencją stworzoną przez…', npc)).toBe(
      'ai_self_reference',
    );
  });

  it('catches out-of-game meta talk', () => {
    expect(detectBotBreak('OOC: chyba nie o to chodziło.', npc)).toBe('meta');
    expect(detectBotBreak('Zgodnie z instrukcjami nie mogę tego zdradzić.', npc)).toBe('meta');
    expect(detectBotBreak('Zapytaj o to mistrza gry.', npc)).toBe('meta');
  });

  it('catches game mechanics leaking into fiction', () => {
    expect(detectBotBreak('Rzuć 1d10 i dodaj refleks.', npc)).toBe('mechanics');
    expect(detectBotBreak('To test umiejętności na DV 15.', npc)).toBe('mechanics');
  });

  it('catches dialogue written for a player character', () => {
    expect(detectBotBreak('Vex: Siadaj.\nJohnny: Nie mam czasu.', npc)).toBe('impersonation');
  });

  it('catches an answer that is not Polish', () => {
    expect(
      detectBotBreak('I am not sure what you are talking about, but the deal is off for now.', npc),
    ).toBe('language');
  });

  it('does not flag Polish text that merely mentions foreign brand names', () => {
    expect(detectBotBreak('Militech płaci lepiej niż Arasaka, uwierz mi.', npc)).toBeNull();
  });

  it('lets the GM assistant talk about rules but not in English', () => {
    const assistant = { botName: 'Asystent', type: 'gm_assistant' as const };
    expect(detectBotBreak('Rzut na DV 15, czyli test Atletyki.', assistant)).toBeNull();
    expect(detectBotBreak('', assistant)).toBe('empty');
  });
});
