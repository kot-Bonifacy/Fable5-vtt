import { describe, expect, it } from 'vitest';
import {
  chatInvolvement,
  type ChatInvolvement,
  type ChatKind,
  type ChatMessageView,
  type DamageLogEntry,
} from './chat.js';
import type { CheckCallEntry, CheckRequestEntry } from './checks.js';
import type { InventoryMoveView } from './inventory.js';
import type { SurgeryRequestEntry } from './surgery.js';
import type { CardSubmissionEntry } from './archive.js';
import type { BotActionProposal } from './bots/types.js';
import type { RollResult } from './dice.js';

const GM = 'gm';
const KUBA = 'kuba';
const OLA = 'ola';
/** Figura Kuby na scenie — strzał w nią dotyczy Kuby. */
const KUBA_TOKENS: ReadonlySet<string> = new Set(['tok-kuba']);

function message(kind: ChatKind, fields: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 1,
    kind,
    authorId: GM,
    authorName: 'MG',
    text: '',
    createdAt: '2026-10-24T20:00:00.000Z',
    ...fields,
  };
}

function roll(fields: Partial<RollResult> = {}): RollResult {
  return { notation: '1d10', terms: [], criticalDamage: false, total: 7, ...fields };
}

const OPEN_CHECK = { ownerId: KUBA, characterName: 'Kowal' } as CheckCallEntry;
const OPEN_REQUEST = { askedById: KUBA } as CheckRequestEntry;
const OPEN_CARD = { userId: KUBA, status: 'open', expiresAt: '2999-01-01T00:00:00.000Z' };

const kuba = (m: ChatMessageView) => chatInvolvement(m, KUBA, false, KUBA_TOKENS);
const ola = (m: ChatMessageView) => chatInvolvement(m, OLA, false);
const gm = (m: ChatMessageView) => chatInvolvement(m, GM, true);

/**
 * Po jednym przypadku na rodzaj wiersza, oczami trzech osób. `satisfies`
 * pilnuje, żeby nowy `ChatKind` nie wszedł bez wpisu tutaj — to szóste miejsce
 * nowego rodzaju (umowa `czat`).
 */
const BY_KIND = {
  say: {
    row: message('say', { authorId: KUBA }),
    kuba: 'mine',
    ola: null,
    gm: null,
  },
  whisper: {
    row: message('whisper', { authorId: OLA, recipientId: KUBA }),
    kuba: 'forMe',
    ola: 'mine',
    gm: null,
  },
  roll: {
    row: message('roll', { authorId: KUBA, roll: roll({ actor: 'Kowal' }) }),
    kuba: 'mine',
    ola: null,
    gm: null,
  },
  gmroll: {
    row: message('gmroll', { authorId: OLA, roll: roll() }),
    kuba: null,
    ola: 'mine',
    gm: null,
  },
  damage: {
    row: message('damage', { damage: { targetOwnerId: KUBA } as DamageLogEntry }),
    kuba: 'forMe',
    ola: null,
    gm: null,
  },
  action: {
    row: message('action', { authorId: OLA }),
    kuba: null,
    ola: 'mine',
    gm: null,
  },
  gmaction: {
    row: message('gmaction', { authorId: KUBA }),
    kuba: 'mine',
    ola: null,
    gm: null,
  },
  proposal: {
    row: message('proposal', {
      botId: 'bot-1',
      proposal: { controllerUserId: null } as BotActionProposal,
    }),
    kuba: null,
    ola: null,
    gm: 'awaitingMe',
  },
  economy: {
    row: message('economy', { authorId: OLA, recipientId: KUBA }),
    kuba: 'forMe',
    ola: 'mine',
    gm: null,
  },
  handout: {
    row: message('handout', { recipientId: OLA }),
    kuba: null,
    ola: 'forMe',
    gm: 'mine',
  },
  journal: {
    row: message('journal'),
    kuba: null,
    ola: null,
    gm: 'mine',
  },
  check: {
    row: message('check', { recipientId: KUBA, check: OPEN_CHECK }),
    kuba: 'awaitingMe',
    ola: null,
    gm: 'mine',
  },
  request: {
    row: message('request', { authorId: KUBA, recipientId: GM, request: OPEN_REQUEST }),
    kuba: 'mine',
    ola: null,
    gm: 'awaitingMe',
  },
  recovery: {
    row: message('recovery', { authorId: OLA }),
    kuba: null,
    ola: 'mine',
    gm: null,
  },
  gmrecovery: {
    row: message('gmrecovery', { authorId: OLA, recipientId: KUBA }),
    kuba: 'forMe',
    ola: 'mine',
    gm: null,
  },
  time: {
    row: message('time'),
    kuba: null,
    ola: null,
    gm: null,
  },
  inventory: {
    row: message('inventory', {
      authorId: OLA,
      inventory: { toOwnerId: KUBA } as InventoryMoveView,
    }),
    kuba: 'awaitingMe',
    ola: 'mine',
    gm: null,
  },
  sighting: {
    row: message('sighting', { authorId: KUBA }),
    kuba: 'mine',
    ola: null,
    gm: null,
  },
  surgery: {
    row: message('surgery', {
      authorId: KUBA,
      surgery: { patientOwnerId: KUBA, surgeonOwnerId: OLA } as SurgeryRequestEntry,
    }),
    kuba: 'mine',
    ola: 'awaitingMe',
    gm: null,
  },
  cardsubmission: {
    row: message('cardsubmission', {
      authorId: KUBA,
      cardSubmission: OPEN_CARD as CardSubmissionEntry,
    }),
    kuba: 'mine',
    ola: null,
    gm: 'awaitingMe',
  },
  rolltable: {
    row: message('rolltable'),
    kuba: null,
    ola: null,
    gm: 'mine',
  },
  gmrolltable: {
    row: message('gmrolltable'),
    kuba: null,
    ola: null,
    gm: 'mine',
  },
} satisfies Record<
  ChatKind,
  {
    row: ChatMessageView;
    kuba: ChatInvolvement | null;
    ola: ChatInvolvement | null;
    gm: ChatInvolvement | null;
  }
>;

describe('chatInvolvement — każdy rodzaj wiersza z trzech stron', () => {
  for (const [kind, expected] of Object.entries(BY_KIND)) {
    it(kind, () => {
      expect(kuba(expected.row)).toBe(expected.kuba);
      expect(ola(expected.row)).toBe(expected.ola);
      expect(gm(expected.row)).toBe(expected.gm);
    });
  }
});

describe('chatInvolvement — „czeka na mnie” mija z decyzją', () => {
  it('rozstrzygnięte wezwanie jest już tylko „do mnie”', () => {
    const done = message('check', {
      check: {
        ...OPEN_CHECK,
        resolved: { messageId: 2, byName: 'Kuba', success: true, total: 14 },
      },
    });
    expect(kuba(done)).toBe('forMe');
  });

  it('przyjęte przekazanie zostaje „do mnie”', () => {
    const done = message('inventory', {
      authorId: OLA,
      inventory: {
        toOwnerId: KUBA,
        resolution: { kind: 'accepted', byName: 'Kuba' },
      } as InventoryMoveView,
    });
    expect(kuba(done)).toBe('forMe');
  });

  it('wycena Medyka wraca do pacjenta, choć to on napisał prośbę', () => {
    const quoted = message('surgery', {
      authorId: KUBA,
      surgery: { patientOwnerId: KUBA, surgeonOwnerId: OLA, quote: 900 } as SurgeryRequestEntry,
    });
    expect(kuba(quoted)).toBe('awaitingMe');
    expect(ola(quoted)).toBe('forMe');
  });

  it('prośba o Test zostaje u MG sprawą „do mnie” po odpowiedzi', () => {
    const answered = message('request', {
      authorId: KUBA,
      request: { ...OPEN_REQUEST, resolution: { kind: 'refused', byName: 'MG' } },
    });
    expect(gm(answered)).toBe('forMe');
  });

  it('wygasłe zgłoszenie karty nie czeka już na MG', () => {
    const expired = message('cardsubmission', {
      authorId: KUBA,
      cardSubmission: {
        ...OPEN_CARD,
        expiresAt: '2000-01-01T00:00:00.000Z',
      } as CardSubmissionEntry,
    });
    expect(gm(expired)).toBe('forMe');
  });

  it('propozycja bota gracza czeka na gracza, nie na MG', () => {
    const own = message('proposal', {
      botId: 'bot-1',
      proposal: { controllerUserId: KUBA } as BotActionProposal,
    });
    expect(kuba(own)).toBe('awaitingMe');
    expect(gm(own)).toBe(null);
    const done = message('proposal', {
      botId: 'bot-1',
      proposal: { controllerUserId: KUBA, resolution: 'approved' } as BotActionProposal,
    });
    expect(kuba(done)).toBe('forMe');
  });
});

describe('chatInvolvement — atak i starcie w moją figurę', () => {
  it('strzał w moją figurę jest „do mnie”, a czekający unik — „czeka na mnie”', () => {
    const shot = message('roll', {
      authorId: OLA,
      roll: roll({
        attack: { system: {}, label: 'M-10AF → Kowal', detail: '', targetTokenId: 'tok-kuba' },
      }),
    });
    expect(kuba(shot)).toBe('forMe');
    const waiting = message('roll', {
      authorId: OLA,
      roll: roll({
        attack: {
          system: {},
          label: '',
          detail: '',
          targetTokenId: 'tok-kuba',
          evasionPending: ['tok-kuba'],
        },
      }),
    });
    expect(kuba(waiting)).toBe('awaitingMe');
    expect(ola(waiting)).toBe('mine');
  });

  it('granat, który mnie objął, i ogień zaporowy z moim Testem', () => {
    const blast = message('roll', {
      authorId: OLA,
      roll: roll({
        attack: {
          system: {},
          label: '',
          detail: '',
          area: { targets: [{ tokenId: 'x', name: 'Kowal', ownerId: KUBA }] },
        } as unknown as RollResult['attack'],
      }),
    });
    expect(chatInvolvement(blast, KUBA, false)).toBe('forMe');
    const suppress = message('roll', {
      authorId: OLA,
      roll: roll({
        attack: {
          system: {},
          label: '',
          detail: '',
          forcedChecks: [{ name: 'Kowal', detail: '', success: false, ownerId: KUBA }],
        },
      }),
    });
    expect(chatInvolvement(suppress, KUBA, false)).toBe('forMe');
  });

  it('obrona w starciu przeciwstawnym czeka, póki jej nie rzucę', () => {
    const grapple = (answered: boolean) =>
      message('roll', {
        authorId: OLA,
        roll: roll({
          opposed: {
            system: {},
            label: 'Iskra → Kowal · Pochwycenie',
            detail: '',
            won: true,
            defenderTokenId: 'tok-kuba',
            answerLabel: 'Broń się',
            answered,
          },
        }),
      });
    expect(kuba(grapple(false))).toBe('awaitingMe');
    expect(kuba(grapple(true))).toBe('forMe');
    expect(ola(grapple(false))).toBe('mine');
  });

  it('przegrana Konfrontacja czeka na wybór przegranego', () => {
    const facedown = message('roll', {
      authorId: OLA,
      roll: roll({
        opposed: {
          system: {},
          label: '',
          detail: '',
          won: true,
          concede: { loserTokenId: 'tok-kuba', winnerTokenId: 'tok-ola', winnerName: 'Iskra' },
        },
      }),
    });
    expect(kuba(facedown)).toBe('awaitingMe');
  });
});

describe('chatInvolvement — MG', () => {
  it('wypowiedź NPC-a nie jest „moja”, choć jej autorem jest konto MG', () => {
    expect(gm(message('say', { botId: 'bot-1', authorName: 'Paser' }))).toBe(null);
    expect(gm(message('say'))).toBe('mine');
  });

  it('rzut z karty NPC-a to praca za stół, `/r` MG — jego własny', () => {
    expect(gm(message('roll', { roll: roll({ actor: 'Zbir' }) }))).toBe(null);
    expect(gm(message('roll', { roll: roll() }))).toBe('mine');
  });

  it('karty wystawione przez serwer kontem MG nie są „jego”', () => {
    expect(gm(message('time'))).toBe(null);
    expect(gm(message('damage', { damage: { targetOwnerId: null } as DamageLogEntry }))).toBe(null);
    expect(gm(message('gmaction'))).toBe(null);
  });

  it('szept gracza do MG jest „do mnie”', () => {
    expect(gm(message('whisper', { authorId: KUBA, recipientId: GM }))).toBe('forMe');
  });

  it('strzał w NPC-a nie dotyczy MG — MG nie podaje figur', () => {
    const shot = message('roll', {
      authorId: KUBA,
      roll: roll({ attack: { system: {}, label: '', detail: '', targetTokenId: 'tok-zbir' } }),
    });
    expect(gm(shot)).toBe(null);
  });
});

describe('chatInvolvement — brzegi', () => {
  it('bez zalogowanego konta nic nikogo nie dotyczy', () => {
    expect(chatInvolvement(message('say', { authorId: '' }), '', false)).toBe(null);
  });

  it('cudzy wiersz o cudzej figurze zostaje bez znaku', () => {
    const shot = message('roll', {
      authorId: OLA,
      roll: roll({ attack: { system: {}, label: '', detail: '', targetTokenId: 'tok-zbir' } }),
    });
    expect(kuba(shot)).toBe(null);
  });
});
