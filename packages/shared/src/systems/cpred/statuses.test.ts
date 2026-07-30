import { describe, expect, it } from 'vitest';
import {
  CPRED_STATUS_EFFECTS,
  cpredActionBlock,
  cpredDodgeBlock,
  cpredMovementBlock,
} from './statuses.js';

describe('statuses that stop a token from moving', () => {
  it('refuses the Prone token and names the Action that fixes it', () => {
    expect(cpredMovementBlock(['prone'])).toContain('Wstanie');
  });

  it('refuses being held and being unconscious', () => {
    expect(cpredMovementBlock(['grappled'])).not.toBeNull();
    expect(cpredMovementBlock(['immobilized'])).not.toBeNull();
    expect(cpredMovementBlock(['unconscious'])).not.toBeNull();
  });

  it('lets a wounded but conscious token walk', () => {
    expect(cpredMovementBlock(['seriously-wounded', 'on-fire'])).toBeNull();
    expect(cpredMovementBlock([])).toBeNull();
  });

  it('reports the deadliest reason first when several apply', () => {
    // „Martwy" outranks „Powalony": telling a corpse to stand up is nonsense.
    expect(cpredMovementBlock(['prone', 'dead'])).toContain('Martwy');
  });
});

describe('statuses that stop a token from acting', () => {
  it('refuses the unconscious and the dead', () => {
    expect(cpredActionBlock(['unconscious'])).not.toBeNull();
    expect(cpredActionBlock(['dead'])).not.toBeNull();
  });

  /**
   * The distinction the whole grapple stage rests on: being Held costs you your
   * Move Action and −2, never your Action — otherwise Duszenie would have
   * nobody left to struggle against.
   */
  it('lets a Held, Prone or Immobilized token still act', () => {
    expect(cpredActionBlock(['grappled'])).toBeNull();
    expect(cpredActionBlock(['prone'])).toBeNull();
    expect(cpredActionBlock(['immobilized'])).toBeNull();
  });
});

describe('statuses that stop a dodge', () => {
  it('refuses only those who cannot react at all', () => {
    expect(cpredDodgeBlock(['unconscious'])).not.toBeNull();
    expect(cpredDodgeBlock(['prone'])).toBeNull();
    expect(cpredDodgeBlock(['grappled'])).toBeNull();
  });
});

describe('the table itself', () => {
  it('names every status it judges, so a refusal can be read out loud', () => {
    for (const [id, effect] of Object.entries(CPRED_STATUS_EFFECTS)) {
      expect(effect.name, id).toBeTruthy();
      expect(
        effect.noMove ?? effect.noAction ?? effect.noDodge,
        `${id} is in the table but refuses nothing`,
      ).toBeTruthy();
    }
  });
});
