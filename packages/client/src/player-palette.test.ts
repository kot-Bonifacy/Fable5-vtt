import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '@vtt/shared';

/**
 * Paleta kolorów graczy (etap 60c) czytana prosto z `theme.css`.
 *
 * Dwa wymogi z pliku etapu, oba łatwe do złamania jedną poprawką odcienia:
 * każdy kolor ma kontrast ≥ 3:1 z tłem czatu (`--cp-paper`) w obu motywach,
 * a sąsiednie pary palety (także ósmy z pierwszym — dziewiąty gracz zaczyna
 * od nowa) da się odróżnić przy deuteranopii i protanopii. Symulacja wzroku:
 * macierze Machado i in. (2009) dla pełnego nasilenia, odległość — ΔE76 w Lab.
 */

const CSS = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ' ',
);

/** Deklaracje bloków o dokładnie tym selektorze, po kolei (późniejsza wygrywa). */
function tokens(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, head, body] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (head!.trim() !== selector) continue;
    for (const [, name, value] of body!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out.set(name!, value!.trim());
    }
  }
  return out;
}

const NIGHT = tokens(':root');
const DAY = new Map([...NIGHT, ...tokens(":root[data-theme='day']")]);

/** Wartość tokenu z rozwinięciem `var(--x)` — `#rrggbb`. */
function hex(theme: Map<string, string>, name: string): string {
  let value = theme.get(name);
  for (let i = 0; value?.startsWith('var(') && i < 5; i++) {
    value = theme.get(value.slice(4, -1).trim());
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name}: ${value}`);
  return value;
}

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const rgb = (h: string) => [1, 3, 5].map((i) => linear(parseInt(h.slice(i, i + 2), 16)));
const luminance = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const DEUTAN = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const PROTAN = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

function seen(h: string, matrix?: number[][]): number[] {
  const v = rgb(h);
  if (!matrix) return v;
  return matrix.map((row) =>
    Math.min(
      1,
      Math.max(
        0,
        row.reduce((sum, k, i) => sum + k * v[i]!, 0),
      ),
    ),
  );
}

function lab([r, g, b]: number[]): number[] {
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047;
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const distance = (a: string, b: string, matrix?: number[][]) => {
  const [p, q] = [lab(seen(a, matrix)), lab(seen(b, matrix))];
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
};

describe('paleta kolorów graczy (etap 60c)', () => {
  for (const [label, theme] of [
    ['noc', NIGHT],
    ['dzień', DAY],
  ] as const) {
    const background = hex(theme, '--cp-paper');
    const colors = PLAYER_COLORS.map((name) => hex(theme, `--player-${name}`));

    it(`${label}: każdy kolor i MG ma kontrast ≥ 3:1 z tłem czatu`, () => {
      const low = [...colors, hex(theme, '--player-gm')]
        .map((color) => [color, contrast(color, background)] as const)
        .filter(([, ratio]) => ratio < 3);
      expect(low).toEqual([]);
    });

    it(`${label}: sąsiednie pary rozróżnialne przy deuteranopii i protanopii`, () => {
      const close: string[] = [];
      colors.forEach((color, i) => {
        const next = colors[(i + 1) % colors.length]!;
        const pair = `${PLAYER_COLORS[i]}–${PLAYER_COLORS[(i + 1) % colors.length]}`;
        if (distance(color, next) < 25) close.push(`${pair} (pełne widzenie)`);
        if (distance(color, next, DEUTAN) < 15) close.push(`${pair} (deuteranopia)`);
        if (distance(color, next, PROTAN) < 15) close.push(`${pair} (protanopia)`);
      });
      expect(close).toEqual([]);
    });
  }
});
