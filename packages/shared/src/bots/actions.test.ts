import { describe, expect, it } from 'vitest';
import {
  BOT_ACTION_OPTIONS_MAX,
  BOT_ACTION_REASON_MAX_LENGTH,
  BOT_ACTION_WORDS,
  buildBotActionSchema,
  buildBotDecisionPrompt,
  parseBotAction,
  type BotActionOption,
} from './actions.js';
import { looksLikeActionRequest, mentionsName } from './requests.js';

const OPTIONS: BotActionOption[] = [
  { id: 'perception', label: 'Percepcja', detail: 'poziom 5, INT 6' },
  { id: 'brawling', label: 'Bijatyka', detail: 'poziom 2, ZR 7' },
];

function answer(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

describe('buildBotActionSchema', () => {
  it('wpisuje etykiety opcji do enuma — nieistniejąca umiejętność jest niemożliwa', () => {
    const schema = buildBotActionSchema(OPTIONS) as {
      properties: { umiejetnosc: { enum: string[] }; akcja: { enum: string[] } };
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.properties.umiejetnosc.enum).toEqual(['Percepcja', 'Bijatyka']);
    expect(schema.properties.akcja.enum).toEqual([BOT_ACTION_WORDS.check, BOT_ACTION_WORDS.talk]);
    expect(schema.additionalProperties).toBe(false);
    // Wymagane, choć przy „rozmowie" nic nie znaczy: pole opcjonalne 9B pomija
    // (pomiar 08.08), a wtedy każdy rzut wraca jako „nie wskazał umiejętności".
    expect(schema.required).toEqual(['akcja', 'umiejetnosc', 'powod']);
  });

  it('bez menu nie wymaga umiejętności, bo nie ma z czego wybierać', () => {
    const schema = buildBotActionSchema([]) as { required: string[] };
    expect(schema.required).toEqual(['akcja', 'powod']);
  });

  it('bez opcji zabiera z enuma samo słowo „rzut"', () => {
    const schema = buildBotActionSchema([]) as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.umiejetnosc).toBeUndefined();
    expect((schema.properties.akcja as { enum: string[] }).enum).toEqual([BOT_ACTION_WORDS.talk]);
  });

  it('przycina menu do limitu, żeby gramatyka nie puchła', () => {
    const many = Array.from({ length: BOT_ACTION_OPTIONS_MAX + 5 }, (_, index) => ({
      id: `s${index}`,
      label: `Umiejętność ${index}`,
    }));
    const schema = buildBotActionSchema(many) as {
      properties: { umiejetnosc: { enum: string[] } };
    };
    expect(schema.properties.umiejetnosc.enum).toHaveLength(BOT_ACTION_OPTIONS_MAX);
  });
});

describe('parseBotAction', () => {
  it('czyta wybór umiejętności i mapuje etykietę na identyfikator', () => {
    const result = parseBotAction(
      answer({ akcja: 'rzut', umiejetnosc: 'Percepcja', powod: 'Poproszono mnie o nasłuch.' }),
      OPTIONS,
    );
    expect(result).toEqual({
      ok: true,
      action: {
        kind: 'check',
        optionId: 'perception',
        optionLabel: 'Percepcja',
        reason: 'Poproszono mnie o nasłuch.',
      },
    });
  });

  it('czyta decyzję „to zwykła rozmowa"', () => {
    const result = parseBotAction(
      answer({ akcja: 'rozmowa', powod: 'Nikt nie prosił o test.' }),
      OPTIONS,
    );
    expect(result).toEqual({
      ok: true,
      action: { kind: 'talk', reason: 'Nikt nie prosił o test.' },
    });
  });

  it('odrzuca umiejętność spoza menu — nawet gdy istnieje w grze', () => {
    const result = parseBotAction(
      answer({ akcja: 'rzut', umiejetnosc: 'Elektronika', powod: 'Naprawię to.' }),
      OPTIONS,
    );
    expect(result).toEqual({ ok: false, error: 'BOT_ACTION_UNKNOWN_OPTION' });
  });

  it('odrzuca rzut bez wskazanej umiejętności', () => {
    const result = parseBotAction(answer({ akcja: 'rzut', powod: 'Rzucam.' }), OPTIONS);
    expect(result).toEqual({ ok: false, error: 'BOT_ACTION_UNKNOWN_OPTION' });
  });

  it('odrzuca słowo spoza enuma', () => {
    const result = parseBotAction(answer({ akcja: 'atak', powod: 'Strzelam.' }), OPTIONS);
    expect(result).toEqual({ ok: false, error: 'BOT_ACTION_UNKNOWN_DECISION' });
  });

  it('odrzuca odpowiedź, która nie jest JSON-em (gramatyka nie zadziałała)', () => {
    expect(parseBotAction('Rzucam na percepcję!', OPTIONS)).toEqual({
      ok: false,
      error: 'BOT_ACTION_UNPARSABLE',
    });
    expect(parseBotAction('', OPTIONS)).toEqual({ ok: false, error: 'BOT_ACTION_UNPARSABLE' });
  });

  it('wyławia obiekt z gadatliwej odpowiedzi — gramatyka bywa nieobsługiwana', () => {
    const raw = `Proszę bardzo:\n${answer({ akcja: 'rzut', umiejetnosc: 'Bijatyka', powod: 'Bójka.' })}\nGotowe.`;
    expect(parseBotAction(raw, OPTIONS)).toMatchObject({
      ok: true,
      action: { optionId: 'brawling' },
    });
  });

  it('nie daje się zmylić wielkością liter ani spacjami wokół etykiety', () => {
    const result = parseBotAction(
      answer({ akcja: ' RZUT ', umiejetnosc: '  percepcja ', powod: 'ok' }),
      OPTIONS,
    );
    expect(result).toMatchObject({ ok: true, action: { optionId: 'perception' } });
  });

  it('przycina uzasadnienie do limitu karty', () => {
    const result = parseBotAction(
      answer({ akcja: 'rozmowa', powod: 'a'.repeat(BOT_ACTION_REASON_MAX_LENGTH + 50) }),
      OPTIONS,
    );
    expect(result.ok && result.action.reason).toHaveLength(BOT_ACTION_REASON_MAX_LENGTH);
  });
});

describe('buildBotDecisionPrompt', () => {
  it('wypisuje menu z poziomami i nie wciela modelu w rolę', () => {
    const { system, user } = buildBotDecisionPrompt({
      botName: 'Barman',
      characterName: 'Kolec',
      options: OPTIONS,
      request: 'Barman, rzuć na Percepcję',
      speaker: 'Mistrz Gry',
    });
    expect(system).toContain('- Percepcja (poziom 5, INT 6)');
    expect(system).toContain('Kolec');
    expect(system).toContain('Nie wcielasz się w postać');
    expect(user).toContain('Barman, rzuć na Percepcję');
    expect(user).toContain('Mistrz Gry');
  });

  it('bot bez karty postaci dostaje wprost „zawsze wybierasz rozmowę"', () => {
    const { system } = buildBotDecisionPrompt({
      botName: 'Barman',
      characterName: null,
      options: [],
      request: 'rzuć na coś',
      speaker: 'MG',
    });
    expect(system).toContain('nie ma karty postaci');
    expect(system).toContain(BOT_ACTION_WORDS.talk);
  });
});

describe('looksLikeActionRequest', () => {
  it('rozpoznaje polskie prośby o test w różnych odmianach', () => {
    for (const line of [
      'Barman, rzuć na Percepcję',
      'Barman rzuc na percepcje',
      'Rzucisz na Spostrzegawczość?',
      'Zrób test Charakteru',
      'Potrzebuję testu Percepcji',
      'przetestuj to',
      'sprawdź na Percepcję',
      'sprawdź, czy ktoś idzie',
      'daj 1k10',
    ]) {
      expect(looksLikeActionRequest(line), line).toBe(true);
    }
  });

  it('nie reaguje na zwykłą rozmowę', () => {
    for (const line of [
      'Barman, nalej mi czegoś mocnego',
      'Co słychać w Watson?',
      'Znasz Kolca?',
      'Widziałeś tu wczoraj kogoś podejrzanego?',
      '',
    ]) {
      expect(looksLikeActionRequest(line), line).toBe(false);
    }
  });
});

describe('mentionsName', () => {
  it('trafia w nazwę mimo polskiej odmiany — to był błąd znaleziony na żywo', () => {
    expect(mentionsName('rzuć na Percepcję', 'Percepcja')).toBe(true);
    expect(mentionsName('rzuc na percepcje', 'Percepcja')).toBe(true);
    expect(mentionsName('test Percepcji, szybko', 'Percepcja')).toBe(true);
    expect(mentionsName('rzuć na Broń ręczną', 'Broń ręczna')).toBe(true);
    expect(mentionsName('sprawdź Atletykę', 'Atletyka')).toBe(true);
  });

  it('nie skleja różnych nazw ani nie reaguje na krótkie rdzenie', () => {
    expect(mentionsName('rzuć na Percepcję', 'Atletyka')).toBe(false);
    expect(mentionsName('rzuć na coś', 'Percepcja')).toBe(false);
    // Trzyliterowy rdzeń trafiałby w połowę zdań — takich nazw nie dopasowujemy.
    expect(mentionsName('rzuć na to i owo', 'Gra')).toBe(false);
  });
});
