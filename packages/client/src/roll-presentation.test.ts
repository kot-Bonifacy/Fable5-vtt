import { describe, expect, it } from 'vitest';
import { RollPresentation } from './roll-presentation.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('roll presentation', () => {
  it('holds the creator acknowledgement, state, chat updates and resync in wire order', async () => {
    const queue = new RollPresentation();
    const dice = deferred();
    const seen: string[] = [];
    queue.deliver(() => queue.hold(dice.promise, () => seen.push('roll')));
    for (const event of ['creator ack', 'character', 'initiative', 'chat update', 'resync']) {
      queue.deliver(() => seen.push(event));
    }
    expect(seen).toEqual([]);
    dice.resolve();
    await dice.promise;
    expect(seen).toEqual([
      'roll',
      'creator ack',
      'character',
      'initiative',
      'chat update',
      'resync',
    ]);
  });

  it('a second roll blocks its own results after the first settles', async () => {
    const queue = new RollPresentation();
    const first = deferred();
    const second = deferred();
    const seen: string[] = [];
    queue.hold(first.promise);
    queue.deliver(() => seen.push('first'));
    queue.deliver(() => queue.hold(second.promise));
    queue.deliver(() => seen.push('second'));
    first.resolve();
    await first.promise;
    expect(seen).toEqual(['first']);
    second.resolve();
    await second.promise;
    expect(seen).toEqual(['first', 'second']);
  });

  it('discarded connection callbacks cannot reveal stale data in the next session', async () => {
    const queue = new RollPresentation();
    const old = deferred();
    const next = deferred();
    const seen: string[] = [];
    queue.hold(old.promise, () => seen.push('old roll'));
    queue.deliver(() => seen.push('old ack'));
    queue.clear();
    queue.hold(next.promise);
    queue.deliver(() => seen.push('new'));
    old.resolve();
    await old.promise;
    expect(seen).toEqual([]);
    next.resolve();
    await next.promise;
    expect(seen).toEqual(['new']);
  });

  it('settles discarded acknowledgements so the creator does not remain busy after disconnect', async () => {
    const queue = new RollPresentation();
    queue.hold(new Promise(() => {}));
    const ack = new Promise<string>((resolve) => {
      queue.deliver(
        () => resolve('result'),
        () => resolve('disconnected'),
      );
    });
    queue.clear();
    expect(await ack).toBe('disconnected');
  });
});
