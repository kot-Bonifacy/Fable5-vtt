import { describe, expect, it } from 'vitest';
import { chatAuthorColor, type ChatMessageView } from './chat.js';
import {
  GM_AUTHOR_COLOR,
  PLAYER_COLORS,
  isPlayerColor,
  playerColors,
  playerInitial,
} from './player-colors.js';

/** Etap 60c: kolor gracza — paleta po kolejności dołączenia, wybór MG wygrywa. */

const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 12, minute)).toISOString();

describe('playerColors', () => {
  it('daje kolory z palety w kolejności dołączenia, nie w kolejności listy', () => {
    const colors = playerColors([
      { userId: 'marek', joinedAt: at(5) },
      { userId: 'ola', joinedAt: at(1) },
      { userId: 'kuba', joinedAt: at(9) },
    ]);
    expect(colors.get('ola')).toBe(PLAYER_COLORS[0]);
    expect(colors.get('marek')).toBe(PLAYER_COLORS[1]);
    expect(colors.get('kuba')).toBe(PLAYER_COLORS[2]);
  });

  it('wybór MG wygrywa i nie przesuwa pozostałych', () => {
    const colors = playerColors([
      { userId: 'ola', joinedAt: at(1), color: 'lime' },
      { userId: 'marek', joinedAt: at(2), color: null },
    ]);
    expect(colors.get('ola')).toBe('lime');
    expect(colors.get('marek')).toBe(PLAYER_COLORS[1]);
  });

  it('nieznana nazwa w bazie liczy się jak brak wyboru', () => {
    expect(playerColors([{ userId: 'ola', joinedAt: at(1), color: '#ff0000' }]).get('ola')).toBe(
      PLAYER_COLORS[0],
    );
  });

  it('dziewiąty gracz zaczyna paletę od nowa', () => {
    const members = Array.from({ length: 9 }, (_, i) => ({ userId: `g${i}`, joinedAt: at(i) }));
    expect(playerColors(members).get('g8')).toBe(PLAYER_COLORS[0]);
  });

  it('paleta ma osiem różnych nazw, a MG kolor spoza niej', () => {
    expect(new Set(PLAYER_COLORS).size).toBe(8);
    expect(isPlayerColor(GM_AUTHOR_COLOR)).toBe(false);
    expect(isPlayerColor('sky')).toBe(true);
    expect(isPlayerColor(undefined)).toBe(false);
  });
});

describe('playerInitial', () => {
  it('pierwsza litera wielką, także z ogonkiem', () => {
    expect(playerInitial('ola')).toBe('O');
    expect(playerInitial('  łukasz')).toBe('Ł');
    expect(playerInitial('')).toBe('?');
  });
});

describe('chatAuthorColor', () => {
  const colors = new Map([['ola', 'pink' as const]]);
  const view = (patch: Partial<ChatMessageView>): ChatMessageView => ({
    id: 1,
    kind: 'say',
    authorId: 'ola',
    authorName: 'Iskra',
    text: '',
    createdAt: at(0),
    ...patch,
  });

  it('gracz ma swój kolor na każdej swojej karcie', () => {
    expect(chatAuthorColor(view({}), false, colors)).toBe('pink');
    expect(chatAuthorColor(view({ kind: 'economy' }), false, colors)).toBe('pink');
  });

  it('autor spoza kampanii i linia NPC nie mają koloru', () => {
    expect(chatAuthorColor(view({ authorId: 'obcy' }), false, colors)).toBeUndefined();
    expect(chatAuthorColor(view({ authorId: 'mg', botId: 'b1' }), true, colors)).toBeUndefined();
  });

  it('MG ma bursztyn tylko na tym, co pisze sam', () => {
    const gm = (patch: Partial<ChatMessageView>) =>
      chatAuthorColor(view({ authorId: 'mg', ...patch }), true, colors);
    expect(gm({})).toBe(GM_AUTHOR_COLOR);
    expect(gm({ kind: 'check' })).toBe(GM_AUTHOR_COLOR);
    expect(gm({ kind: 'damage' })).toBeUndefined();
    expect(gm({ kind: 'time' })).toBeUndefined();
    expect(
      gm({ kind: 'roll', roll: { actor: 'Zbir' } as ChatMessageView['roll'] }),
    ).toBeUndefined();
  });
});
