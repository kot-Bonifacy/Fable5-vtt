import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WALK_CONFIRM_NOTE,
  walkClickBand,
  walkClickNeedsConfirm,
  walkExtraConfirmNote,
} from './map/walk-click.js';

/**
 * Etap 54 — klik w podłoże wzorem BG3: pas pola docelowego rozstrzyga, czy klik
 * rusza figurę, czy tylko wskazuje cel do potwierdzenia.
 */

/** Tura RUCH 6: 12 m z Akcji Ruchu, drugie 12 m z Biegu. */
const TURN = { metresLeft: 12, costFactor: 1, extraMetres: 12 };

describe('pas celu kliknięcia', () => {
  it('zielony do granicy Ruchu, bursztyn do końca Biegu, dalej szary', () => {
    expect(walkClickBand({ metres: 8, truncated: false }, TURN)).toBe('move');
    expect(walkClickBand({ metres: 12, truncated: false }, TURN)).toBe('move');
    expect(walkClickBand({ metres: 12.04, truncated: false }, TURN)).toBe('move');
    expect(walkClickBand({ metres: 12.5, truncated: false }, TURN)).toBe('extra');
    expect(walkClickBand({ metres: 24, truncated: false }, TURN)).toBe('extra');
    expect(walkClickBand({ metres: 25, truncated: false }, TURN)).toBe('beyond');
  });

  it('trudny teren dzieli oba pasy, a wydana Akcja zabiera bursztyn', () => {
    const hard = { ...TURN, costFactor: 2 };
    expect(walkClickBand({ metres: 6, truncated: false }, hard)).toBe('move');
    expect(walkClickBand({ metres: 10, truncated: false }, hard)).toBe('extra');
    expect(walkClickBand({ metres: 13, truncated: false }, hard)).toBe('beyond');
    const spent = { ...TURN, extraMetres: 0 };
    expect(walkClickBand({ metres: 14, truncated: false }, spent)).toBe('beyond');
  });

  it('trasa urwana mgłą jest nieznana, a bez budżetu każda jest zielona', () => {
    expect(walkClickBand({ metres: 3, truncated: true }, TURN)).toBe('unknown');
    expect(walkClickBand({ metres: 300, truncated: false }, null)).toBe('move');
  });

  it('potwierdzenia chce tylko tura figury i tylko poza zielonym', () => {
    expect(walkClickNeedsConfirm('move', true)).toBe(false);
    for (const band of ['extra', 'beyond', 'unknown'] as const) {
      expect(walkClickNeedsConfirm(band, true)).toBe(true);
      // Poza walką (także z punktami trasy) i w cudzej turze klik rusza od razu.
      expect(walkClickNeedsConfirm(band, false)).toBe(false);
    }
  });

  it('zdanie o koszcie mówi system, a mapa nie zna słowa „Bieg”', () => {
    expect(walkExtraConfirmNote('Bieg zużyje Akcję')).toMatch(/^Bieg zużyje Akcję — kliknij/);
    expect(walkExtraConfirmNote(null)).not.toContain('Bieg');
    expect(WALK_CONFIRM_NOTE).toContain('Esc');
    const source = readFileSync(join(import.meta.dirname, 'map', 'walk-click.ts'), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/'))
      .join('\n');
    expect(code).not.toContain('Bieg');
  });
});

describe('gest marszu w rendererze (etap 54)', () => {
  const SOURCE = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

  function blockAfter(header: string): string {
    const start = SOURCE.indexOf(header);
    expect(start, `nie znalazłem w MapRenderer.ts: ${header}`).toBeGreaterThan(0);
    let depth = 0;
    for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
      if (SOURCE[i] === '{') depth += 1;
      else if (SOURCE[i] === '}') {
        depth -= 1;
        if (depth === 0) return SOURCE.slice(start, i + 1);
      }
    }
    throw new Error(`niedomknięty blok: ${header}`);
  }

  it('podgląd pod kursorem i jego rysunek pytają o turę figury', () => {
    for (const header of [
      'private trackWalkHover(point: ScenePoint): void {',
      'private drawWalkPreview(): void {',
    ]) {
      expect(blockAfter(header), header).toContain('this.walkPreviewShown()');
    }
  });

  it('klik planuje trasę sam, zamiast brać ją z podglądu', () => {
    const walkTo = blockAfter('private walkTo(worldX: number, worldY: number): void {');
    expect(walkTo).toContain('this.planWalkRoute(goal)');
    expect(walkTo).toContain('walkClickNeedsConfirm(');
  });

  it('prawy klik w puste zdejmuje najpierw cel marszu', () => {
    const rightClick = SOURCE.indexOf('if (event.button === 2 && !isTokenTarget(event.target)) {');
    expect(rightClick).toBeGreaterThan(0);
    const cancel = SOURCE.indexOf('this.cancelWalkTarget()', rightClick);
    const dismiss = SOURCE.indexOf("this.setSelection(null, 'dismiss')", rightClick);
    expect(cancel).toBeGreaterThan(rightClick);
    expect(cancel).toBeLessThan(dismiss);
  });
});
