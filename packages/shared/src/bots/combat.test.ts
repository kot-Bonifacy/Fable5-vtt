import { describe, expect, it } from 'vitest';
import {
  BOT_COMBAT_STEPS_MAX,
  BOT_COMBAT_WORDS,
  availableBotCombatActions,
  buildBotCombatPrompt,
  buildBotCombatSchema,
  describeBotCombatDecision,
  parseBotCombatAction,
  type BotCombatState,
} from './combat.js';

/** Figura z pełnym budżetem, jedną bronią i dwiema figurami w polu widzenia. */
function state(patch: Partial<BotCombatState> = {}): BotCombatState {
  return {
    self: {
      name: 'Kaya',
      hp: { current: 32, max: 40 },
      wound: 'lekko ranna',
      statuses: [],
      metresLeft: 12,
      actionSpent: false,
      moveSpent: false,
    },
    figures: [
      { id: 'tok-rico', label: 'Rico', side: 'enemy', metres: 12, statuses: [] },
      { id: 'tok-vex', label: 'Vex', side: 'ally', metres: 4, statuses: [] },
    ],
    weapons: [
      {
        id: 'weapon:row-1:single',
        label: 'Ciężki pistolet',
        ammo: { current: 6, max: 8 },
      },
    ],
    round: 3,
    step: 1,
    ...patch,
  };
}

function schemaOf(input: BotCombatState): {
  properties: Record<string, { enum?: string[] }>;
  required: string[];
} {
  return buildBotCombatSchema(input) as never;
}

describe('availableBotCombatActions', () => {
  it('offers everything a full turn can pay for', () => {
    expect(availableBotCombatActions(state())).toEqual([
      'attack',
      'approach',
      'retreat',
      'reload',
      'pass',
    ]);
  });

  it('drops the attack once the Action is gone', () => {
    const spent = state({
      self: { ...state().self, actionSpent: true },
    });
    expect(availableBotCombatActions(spent)).toEqual(['approach', 'retreat', 'pass']);
  });

  it('drops both moves once the Move Action is gone', () => {
    const walked = state({ self: { ...state().self, moveSpent: true } });
    expect(availableBotCombatActions(walked)).not.toContain('approach');
    expect(availableBotCombatActions(walked)).not.toContain('retreat');
  });

  it('drops the attack when nothing can be shot at', () => {
    const blocked = state({
      figures: state().figures.map((figure) => ({ ...figure, noShot: 'ściana' })),
    });
    expect(availableBotCombatActions(blocked)).not.toContain('attack');
    // Podejść wciąż można — zasłonięta figura zostaje celem ruchu.
    expect(availableBotCombatActions(blocked)).toContain('approach');
  });

  it('drops the attack when every weapon is refused', () => {
    const empty = state({
      weapons: [
        {
          id: 'weapon:row-1:single',
          label: 'Ciężki pistolet',
          ammo: { current: 0, max: 8 },
          disabled: 'Pusty magazynek — przeładuj.',
        },
      ],
    });
    expect(availableBotCombatActions(empty)).not.toContain('attack');
    // …ale przeładowanie jest wtedy właśnie tym, po co ta lista istnieje.
    expect(availableBotCombatActions(empty)).toContain('reload');
  });

  it('never offers a reload of a full magazine', () => {
    const full = state({
      weapons: [{ id: 'weapon:row-1:single', label: 'Pistolet', ammo: { current: 8, max: 8 } }],
    });
    expect(availableBotCombatActions(full)).not.toContain('reload');
  });

  it('always keeps a way to end the step', () => {
    const stuck = state({
      self: { ...state().self, actionSpent: true, moveSpent: true },
      figures: [],
      weapons: [],
    });
    expect(availableBotCombatActions(stuck)).toEqual(['pass']);
  });
});

describe('buildBotCombatSchema', () => {
  it('puts only the figures in view into the target enum', () => {
    expect(schemaOf(state()).properties.cel?.enum).toEqual(['Rico', 'Vex']);
  });

  it('puts only available actions into the action enum', () => {
    const walked = state({ self: { ...state().self, moveSpent: true } });
    expect(schemaOf(walked).properties.akcja?.enum).toEqual(['atak', 'przeładowanie', 'pas']);
  });

  // Lekcja zmierzona 08.08 w 20a: pole opcjonalne 9B po prostu pomija, więc
  // każdy atak wracałby bez celu. Wymagane zawsze, gdy tylko istnieje.
  it('requires the target and the weapon whenever they exist at all', () => {
    expect(schemaOf(state()).required).toEqual(['akcja', 'cel', 'bron', 'powod']);
  });

  it('leaves out fields that have no options to offer', () => {
    const alone = schemaOf(state({ figures: [], weapons: [] }));
    expect(alone.required).toEqual(['akcja', 'powod']);
    expect(alone.properties.cel).toBeUndefined();
    expect(alone.properties.bron).toBeUndefined();
  });
});

describe('parseBotCombatAction', () => {
  it('reads an attack with its target and weapon', () => {
    const result = parseBotCombatAction(
      '{"akcja":"atak","cel":"Rico","bron":"Ciężki pistolet","powod":"Strzelam do najbliższego wroga."}',
      state(),
    );
    expect(result).toEqual({
      ok: true,
      decision: {
        kind: 'attack',
        targetId: 'tok-rico',
        targetLabel: 'Rico',
        weaponId: 'weapon:row-1:single',
        weaponLabel: 'Ciężki pistolet',
        reason: 'Strzelam do najbliższego wroga.',
      },
    });
  });

  it('ignores the target and weapon when the bot passes', () => {
    const result = parseBotCombatAction(
      '{"akcja":"pas","cel":"Rico","bron":"Ciężki pistolet","powod":"Czekam."}',
      state(),
    );
    expect(result).toEqual({ ok: true, decision: { kind: 'pass', reason: 'Czekam.' } });
  });

  it('reads a reload without needing a target', () => {
    const empty = state({
      weapons: [
        {
          id: 'weapon:row-1:single',
          label: 'Pistolet',
          ammo: { current: 0, max: 8 },
          disabled: 'x',
        },
      ],
    });
    const result = parseBotCombatAction(
      '{"akcja":"przeładowanie","cel":"Rico","bron":"Pistolet","powod":"Pusto."}',
      empty,
    );
    expect(result).toEqual({
      ok: true,
      decision: {
        kind: 'reload',
        weaponId: 'weapon:row-1:single',
        weaponLabel: 'Pistolet',
        reason: 'Pusto.',
      },
    });
  });

  it('reads both directions of movement', () => {
    const approach = parseBotCombatAction(
      '{"akcja":"podejście","cel":"Rico","bron":"Ciężki pistolet","powod":"Podchodzę."}',
      state(),
    );
    const retreat = parseBotCombatAction(
      '{"akcja":"odwrót","cel":"Rico","bron":"Ciężki pistolet","powod":"Uciekam."}',
      state(),
    );
    expect(approach).toMatchObject({
      ok: true,
      decision: { kind: 'approach', targetId: 'tok-rico' },
    });
    expect(retreat).toMatchObject({
      ok: true,
      decision: { kind: 'retreat', targetId: 'tok-rico' },
    });
  });

  // Poniższe odpowiedzi prawdziwa gramatyka by nie przepuściła. Cały sens tych
  // przypadków: gramatyka może być nieobsługiwana, a payload — podstawiony.
  it('refuses a figure that is not in view', () => {
    const result = parseBotCombatAction(
      '{"akcja":"atak","cel":"Zbir za murem","bron":"Ciężki pistolet","powod":"."}',
      state(),
    );
    expect(result).toEqual({ ok: false, error: 'BOT_COMBAT_UNKNOWN_TARGET' });
  });

  it('refuses a weapon the figure does not carry', () => {
    const result = parseBotCombatAction(
      '{"akcja":"atak","cel":"Rico","bron":"Wyrzutnia rakiet","powod":"."}',
      state(),
    );
    expect(result).toEqual({ ok: false, error: 'BOT_COMBAT_UNKNOWN_WEAPON' });
  });

  it('refuses an action that this step cannot pay for', () => {
    const spent = state({ self: { ...state().self, actionSpent: true } });
    const result = parseBotCombatAction(
      '{"akcja":"atak","cel":"Rico","bron":"Ciężki pistolet","powod":"."}',
      spent,
    );
    expect(result).toEqual({ ok: false, error: 'BOT_COMBAT_UNKNOWN_ACTION' });
  });

  it('refuses a word outside the enum', () => {
    const result = parseBotCombatAction('{"akcja":"taniec","powod":"."}', state());
    expect(result).toEqual({ ok: false, error: 'BOT_COMBAT_UNKNOWN_ACTION' });
  });

  it('refuses an answer that is not JSON at all', () => {
    expect(parseBotCombatAction('Podchodzę do Rico i strzelam.', state())).toEqual({
      ok: false,
      error: 'BOT_COMBAT_UNPARSABLE',
    });
  });

  it('digs the object out of a model that wrapped it in prose', () => {
    const result = parseBotCombatAction(
      'Oto moja decyzja:\n{"akcja":"pas","cel":"Rico","bron":"Ciężki pistolet","powod":"Czekam."}\nGotowe.',
      state(),
    );
    expect(result).toMatchObject({ ok: true, decision: { kind: 'pass' } });
  });

  it('accepts the model’s own capitalisation and padding', () => {
    const result = parseBotCombatAction(
      '{"akcja":" Atak ","cel":" rico ","bron":"ciężki pistolet","powod":"."}',
      state(),
    );
    expect(result).toMatchObject({ ok: true, decision: { kind: 'attack', targetId: 'tok-rico' } });
  });
});

describe('buildBotCombatPrompt', () => {
  it('hands the model measured distances instead of coordinates', () => {
    const { system } = buildBotCombatPrompt(state(), { botName: 'Kolec' });
    expect(system).toContain('Rico — przeciwnik · 12 m');
    expect(system).toContain('Vex — sojusznik · 4 m');
    expect(system).not.toMatch(/\bx:|\by:/);
  });

  it('says what cannot be shot at and why', () => {
    const blocked = state({
      figures: [
        { id: 'tok-rico', label: 'Rico', side: 'enemy', metres: 12, noShot: 'osłona: Samochód' },
      ],
    });
    expect(buildBotCombatPrompt(blocked, { botName: 'Kolec' }).system).toContain(
      'NIE DA SIĘ STRZELIĆ: osłona: Samochód',
    );
  });

  it('lists only the actions this step allows', () => {
    const walked = state({ self: { ...state().self, moveSpent: true } });
    const { system } = buildBotCombatPrompt(walked, { botName: 'Kolec' });
    expect(system).toContain(`„${BOT_COMBAT_WORDS.attack}"`);
    expect(system).not.toContain(`„${BOT_COMBAT_WORDS.approach}"`);
  });

  it('states the round and which step of the turn this is', () => {
    const { system } = buildBotCombatPrompt(state({ step: 2 }), { botName: 'Kolec' });
    expect(system).toContain(`RUNDA 3, krok 2 z ${BOT_COMBAT_STEPS_MAX}`);
  });

  // Cudze PW nie wchodzą do promptu: NPC, który wie, że komuś zostały trzy
  // punkty, jest wyciekiem przez usta postaci.
  it('never mentions anybody else’s hit points', () => {
    const { system } = buildBotCombatPrompt(state(), { botName: 'Kolec' });
    const figuresBlock = system.slice(system.indexOf('WIDZISZ:'), system.indexOf('TWOJA BROŃ:'));
    expect(figuresBlock).not.toContain('PW');
  });

  it('says out loud when the figure sees nobody', () => {
    const { system } = buildBotCombatPrompt(state({ figures: [] }), { botName: 'Kolec' });
    expect(system).toContain('nikogo');
  });
});

describe('describeBotCombatDecision', () => {
  it('writes one sentence per kind of action', () => {
    expect(
      describeBotCombatDecision({
        kind: 'attack',
        targetId: 't',
        targetLabel: 'Rico',
        weaponId: 'w',
        weaponLabel: 'Pistolet',
        reason: '',
      }),
    ).toBe('Atak: Rico — Pistolet');
    expect(
      describeBotCombatDecision({
        kind: 'retreat',
        targetId: 't',
        targetLabel: 'Rico',
        reason: '',
      }),
    ).toBe('Odwrót od: Rico');
    expect(describeBotCombatDecision({ kind: 'pass', reason: '' })).toBe('Pas — nic w tym kroku');
  });
});
