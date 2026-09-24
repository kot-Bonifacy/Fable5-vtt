import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RollResult } from '@vtt/shared';

const mock = vi.hoisted(() => ({
  roll: vi.fn(),
  add: vi.fn(),
  clearDice: vi.fn(),
  animate: true,
}));
vi.mock('./stores/settingsStore.js', () => ({
  useSettingsStore: {
    getState: () => ({ animate: mock.animate, skin: 'classic', soundVolume: 0 }),
  },
}));
vi.mock('@3d-dice/dice-box-threejs', () => ({
  default: class {
    initialize = async () => {};
    updateConfig = async () => {};
    loadSounds = async () => {};
    startClickThrow = () => null;
    roll = mock.roll;
    add = mock.add;
    clearDice = mock.clearDice;
  },
}));

const roll = {
  terms: [{ kind: 'dice', sign: 1, count: 1, sides: 10, rolls: [7] }],
  total: 7,
  notation: '1d10',
} as RollResult;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mock.animate = true;
  mock.roll.mockReset();
  mock.add.mockReset();
  mock.clearDice.mockReset();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', {
    createElement: () => ({ classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} }),
    body: { appendChild() {} },
  });
});
afterEach(async () => {
  (await import('./dice3d.js')).cancelDiceAnimations();
  await vi.dynamicImportSettled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dice completion', () => {
  it('does not reveal or interrupt a real roll when the cup is picked up', async () => {
    const dice = await import('./dice3d.js');
    const landing = deferred();
    mock.roll.mockReturnValue(landing.promise);
    const finished = vi.fn();
    const result = dice.playRollAnimation(roll).then(finished);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
    dice.sweepDice();
    expect(mock.clearDice).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    landing.resolve();
    await result;
    expect(finished).toHaveBeenCalledWith(true);
  });

  it('waits for the extra critical die as well', async () => {
    const dice = await import('./dice3d.js');
    const extra = deferred();
    mock.roll.mockResolvedValue(undefined);
    mock.add.mockReturnValue(extra.promise);
    const finished = vi.fn();
    const result = dice
      .playRollAnimation({ ...roll, critical: { type: 'crit', extraRoll: 4 } })
      .then(finished);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(600);
    expect(mock.add).toHaveBeenCalledWith('1d10@4');
    expect(finished).not.toHaveBeenCalled();
    extra.resolve();
    await result;
    expect(finished).toHaveBeenCalledWith(true);
  });

  it('queues later throws without releasing a moving die', async () => {
    const dice = await import('./dice3d.js');
    const first = deferred();
    mock.roll.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const a = dice.playRollAnimation(roll);
    const b = dice.playRollAnimation(roll);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.roll).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([a, b]);
    expect(mock.roll).toHaveBeenCalledTimes(2);
  });

  it('removes a hung animation before falling back to the result', async () => {
    const dice = await import('./dice3d.js');
    mock.roll.mockReturnValue(new Promise(() => {}));
    const finished = vi.fn(() => expect(mock.clearDice).toHaveBeenCalled());
    const result = dice.playRollAnimation(roll).then(finished);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(finished).not.toHaveBeenCalled();
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(finished).toHaveBeenCalledWith(false);
  });

  it('needs no animation when it is disabled', async () => {
    const dice = await import('./dice3d.js');
    mock.animate = false;
    expect(await dice.playRollAnimation(roll)).toBe(false);
    expect(mock.roll).not.toHaveBeenCalled();
  });
});
