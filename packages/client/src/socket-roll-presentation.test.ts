import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RollResult } from '@vtt/shared';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  emit: vi.fn(),
  animate: vi.fn(),
}));
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      connected: true,
      on: (event: string, listener: (payload: unknown) => void) => {
        mock.handlers.set(event, listener);
        return socket;
      },
      timeout: () => socket,
      emit: mock.emit,
      disconnect: () => {},
    };
    return socket;
  },
}));
vi.mock('./dice3d.js', () => ({
  playRollAnimation: mock.animate,
  toAnimationNotation: () => '1d10@7',
  cancelDiceAnimations: () => {},
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  mock.handlers.clear();
  mock.emit.mockReset();
  mock.animate.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live socket roll presentation', () => {
  it('holds a lifepath acknowledgement and a character update until the animation finishes', async () => {
    const socket = await import('./socket.js');
    const { useChatStore } = await import('./stores/chatStore.js');
    const { useCharacterStore } = await import('./stores/characterStore.js');
    socket.connectSocket('roller');
    useChatStore.setState({ synced: true, seq: 0, items: [], held: [] });
    let finish!: (played: boolean) => void;
    mock.animate.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const ackSeen = vi.fn();
    const update = vi.spyOn(useCharacterStore.getState(), 'applyUpsert');
    const result = socket.rollCreationLifepath(['test-table']).then(ackSeen);
    const ack = mock.emit.mock.calls[0]![2] as (error: null, data: unknown) => void;
    const message = {
      id: 123,
      kind: 'roll',
      authorId: 'roller',
      authorName: 'Tester',
      text: 'Lifepath',
      createdAt: new Date().toISOString(),
      roll: {
        notation: '1d10',
        total: 7,
        terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10, rolls: [7] }],
      } as RollResult,
    };
    mock.handlers.get('chat:message')!({ seq: 1, message });
    mock.handlers.get('character:upsert')!({ character: { id: 'test' } });
    ack(null, { ok: true, data: { draft: { lifepath: { personality: 'test result' } } } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ackSeen).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(useChatStore.getState().items).toHaveLength(0);
    finish(true);
    await vi.advanceTimersByTimeAsync(2500);
    await result;
    expect(ackSeen).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(useChatStore.getState().items).toHaveLength(1);
    // A duplicate live packet must not replay the dice.
    mock.handlers.get('chat:message')!({ seq: 1, message });
    expect(mock.animate).toHaveBeenCalledOnce();
    socket.disconnectSocket();
    update.mockRestore();
  });

  describe('#48 — dogonienie, gdy rzuty zbierają się w kolejkę', () => {
    const rollMessage = (id: number) => ({
      seq: id,
      message: {
        id,
        kind: 'roll',
        authorId: 'someone',
        authorName: 'Gracz',
        text: '/r 1d10',
        createdAt: new Date().toISOString(),
        roll: {
          notation: '1d10',
          total: 7,
          terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10, rolls: [7] }],
        } as RollResult,
      },
    });

    async function setup() {
      const socket = await import('./socket.js');
      const { useChatStore } = await import('./stores/chatStore.js');
      socket.connectSocket('viewer');
      useChatStore.setState({ synced: true, seq: 0, items: [], held: [] });
      const finishes: ((played: boolean) => void)[] = [];
      mock.animate.mockImplementation(
        () => new Promise<boolean>((resolve) => finishes.push(resolve)),
      );
      const shown = () =>
        useChatStore
          .getState()
          .items.filter((item) => item.type === 'message')
          .map((item) => (item as { message: { id: number } }).message.id);
      const isHeld = (id: number) => useChatStore.getState().held.some((m) => m.id === id);
      return { socket, finishes, shown, isHeld };
    }

    it('karta odsłania się zaraz po wylądowaniu, gdy za rzutem czeka następny', async () => {
      const { socket, finishes, isHeld } = await setup();
      mock.handlers.get('chat:message')!(rollMessage(1));
      await vi.advanceTimersByTimeAsync(1000);
      mock.handlers.get('chat:message')!(rollMessage(2));
      await vi.advanceTimersByTimeAsync(1000);
      expect(isHeld(1)).toBe(true);
      finishes[0]!(true);
      // Bez pauzy 2,5 s: rzut 2 czeka, więc karta 1 wychodzi od razu…
      await vi.advanceTimersByTimeAsync(0);
      expect(isHeld(1)).toBe(false);
      // …a rzut 2 czekał tylko ~1 s, więc dostaje swoją animację.
      expect(mock.animate).toHaveBeenCalledTimes(2);
      expect(isHeld(2)).toBe(true);
      finishes[1]!(true);
      // Nic już nie czeka — zwykła pauza przed kartą.
      await vi.advanceTimersByTimeAsync(2000);
      expect(isHeld(2)).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      expect(isHeld(2)).toBe(false);
      socket.disconnectSocket();
    });

    it('rzut, który czekał dłużej niż 3 s, pokazuje się od razu kartą, bez kości', async () => {
      const { socket, finishes, shown, isHeld } = await setup();
      mock.handlers.get('chat:message')!(rollMessage(1));
      mock.handlers.get('chat:message')!(rollMessage(2));
      mock.handlers.get('chat:message')!(rollMessage(3));
      mock.handlers.get('presence:update')!({ seq: 4, users: [] });
      await vi.advanceTimersByTimeAsync(3500);
      finishes[0]!(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(mock.animate).toHaveBeenCalledOnce();
      expect(shown()).toEqual([1, 2, 3]);
      expect(isHeld(2) || isHeld(3)).toBe(false);
      socket.disconnectSocket();
    });
  });
});
