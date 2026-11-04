import { describe, expect, it } from 'vitest';
import { chaseRamText } from './chase-ram.js';

describe('chaseRamText — pasek „Zderzenie” (zaległość 66c z 04.11)', () => {
  it('Pług przodem zdejmuje szkodę z taranującego, bokiem nie działa', () => {
    expect(chaseRamText('vehicle', true, true)).toContain('Twoje auto nic nie bierze');
    expect(chaseRamText('vehicle', true, false)).toContain('Pług nie zadziała');
    expect(chaseRamText('vehicle', false, true)).not.toContain('Pług');
  });

  it('pieszy obrywa sam, beton robi z auta wrak', () => {
    expect(chaseRamText('pedestrian', false, true)).toContain('Auto nic nie bierze');
    expect(chaseRamText('concrete', true, true)).toContain('wrakiem');
  });

  it('przeszkoda z Pługiem: auto bez szkody i bez Rany', () => {
    expect(chaseRamText('obstacle', true, true)).not.toContain('Ran');
    expect(chaseRamText('obstacle', false, true)).toContain('Ranę Krytyczną');
  });
});
