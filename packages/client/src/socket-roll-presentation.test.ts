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
});
