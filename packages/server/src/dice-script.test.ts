import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseRollNotation, rollFormula } from '@vtt/shared';
import { createMixedRng } from './realtime/dice-rng.js';
import { diceScriptPath, parseDiceScript, takeScriptedDie } from './realtime/dice-script.js';

describe('dice script (E2E only)', () => {
  let dir: string;
  let file: string;
  const saved = { script: process.env.VTT_DICE_SCRIPT, nodeEnv: process.env.NODE_ENV };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vtt-dice-script-'));
    file = join(dir, 'dice.txt');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (saved.script === undefined) delete process.env.VTT_DICE_SCRIPT;
    else process.env.VTT_DICE_SCRIPT = saved.script;
    if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.nodeEnv;
  });

  it('is off without the variable and always off in production', () => {
    expect(diceScriptPath({})).toBeNull();
    expect(diceScriptPath({ VTT_DICE_SCRIPT: file })).toBe(file);
    expect(diceScriptPath({ VTT_DICE_SCRIPT: file, NODE_ENV: 'test' })).toBe(file);
    expect(diceScriptPath({ VTT_DICE_SCRIPT: file, NODE_ENV: 'production' })).toBeNull();
  });

  it('reads faces separated by spaces, commas and lines, skipping comments', () => {
    expect(parseDiceScript('10 3,7\n# krytyk\n2 # po przecinku\n')).toEqual([10, 3, 7, 2]);
    expect(parseDiceScript('')).toEqual([]);
    expect(() => parseDiceScript('10 x')).toThrow(/not a die face/);
    expect(() => parseDiceScript('0')).toThrow(/not a die face/);
  });

  it('takes faces in order and writes the rest back', () => {
    writeFileSync(file, '10 4 6');
    expect(takeScriptedDie(file, 10)).toBe(10);
    expect(readFileSync(file, 'utf8')).toBe('4 6');
    expect(takeScriptedDie(file, 6)).toBe(4);
    expect(takeScriptedDie(file, 6)).toBe(6);
    expect(takeScriptedDie(file, 10)).toBeNull();
  });

  it('treats a missing file as an empty queue', () => {
    expect(takeScriptedDie(join(dir, 'nie-ma.txt'), 10)).toBeNull();
  });

  it('refuses a face the die does not have', () => {
    writeFileSync(file, '8');
    expect(() => takeScriptedDie(file, 6)).toThrow(/not a face of d6/);
  });

  it('forces the server roller, then falls back to chance', () => {
    process.env.VTT_DICE_SCRIPT = file;
    delete process.env.NODE_ENV;
    writeFileSync(file, '1 10 7');
    const rng = createMixedRng('gest');
    expect([rng(10), rng(10), rng(10)]).toEqual([1, 10, 7]);
    for (let i = 0; i < 50; i += 1) {
      const face = rng(10);
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(10);
    }
  });

  it('drives a whole formula, the critical explosion included', () => {
    process.env.VTT_DICE_SCRIPT = file;
    delete process.env.NODE_ENV;
    writeFileSync(file, '10 6');
    const parsed = parseRollNotation('1d10');
    if (!parsed.ok) throw new Error(parsed.error);
    const result = rollFormula(parsed.formula, createMixedRng());
    expect(result.total).toBe(16);
  });

  it('is ignored in production even with a queue on disk', () => {
    process.env.VTT_DICE_SCRIPT = file;
    process.env.NODE_ENV = 'production';
    writeFileSync(file, '1 1 1 1 1 1 1 1 1 1');
    const rng = createMixedRng();
    for (let i = 0; i < 10; i += 1) rng(10);
    expect(readFileSync(file, 'utf8')).toBe('1 1 1 1 1 1 1 1 1 1');
  });
});
