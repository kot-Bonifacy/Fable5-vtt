import { createHash, randomBytes } from 'node:crypto';
import type { DiceRng } from '@vtt/shared';

/**
 * Crypto-strong die roller, optionally mixing in client shake entropy.
 *
 * Seed = SHA-256(32 fresh crypto-random bytes || client entropy). The player's
 * physical gesture genuinely selects which of the equally likely outcomes
 * happens, yet nobody can predict or bias a roll: the server component is
 * fresh and secret for every roll. Values are drawn from the hash stream with
 * rejection sampling (no modulo bias); the stream extends by hashing a
 * counter when exhausted.
 */
export function createMixedRng(clientEntropy = ''): DiceRng {
  const seed = createHash('sha256').update(randomBytes(32)).update(clientEntropy).digest();
  let block = seed;
  let offset = 0;
  let counter = 0;

  const nextByte = (): number => {
    if (offset >= block.length) {
      counter += 1;
      block = createHash('sha256').update(seed).update(String(counter)).digest();
      offset = 0;
    }
    return block[offset++]!;
  };

  return (sides) => {
    const limit = Math.floor(65536 / sides) * sides;
    for (;;) {
      const value = (nextByte() << 8) | nextByte();
      if (value < limit) return (value % sides) + 1;
    }
  };
}
