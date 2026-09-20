import { describe, expect, it } from 'vitest';
import { CupNotificationGate } from './cup-notification.js';
import { musicPosition } from './music-player.js';

describe('cup readiness notification', () => {
  it('rings once, never for an empty cup or re-render', () => {
    const gate = new CupNotificationGate();
    expect(gate.activate(null)).toBe(false);
    expect(gate.activate('sheet:A')).toBe(true);
    expect(gate.activate('sheet:A')).toBe(false);
    expect(gate.activate(null)).toBe(false);
    expect(gate.activate('sheet:A')).toBe(true);
  });
  it('does not repeat a GM call when loaded, restored after another roll or reconnected', () => {
    const gate = new CupNotificationGate();
    expect(gate.activate('call:1')).toBe(true);
    expect(gate.activate('call:1')).toBe(false);
    expect(gate.activate('attack:2')).toBe(true);
    expect(gate.activate('call:1')).toBe(false);
    gate.activate(null);
    expect(gate.activate('call:1')).toBe(false);
    expect(gate.activate('call:2')).toBe(true);
  });
});
describe('music synchronization', () => {
  it('joins an ongoing loop at the shared position', () => {
    expect(musicPosition(20, 95, 60, true)).toBe(55);
  });
  it('keeps a paused position and clamps completed non-looping tracks', () => {
    expect(musicPosition(20, 0, 60, true)).toBe(20);
    expect(musicPosition(20, 95, 60, false)).toBe(60);
  });
});
