import { describe, expect, it } from 'vitest';
import { stackedTargetsAt, type StackedFigure } from './map/stacked-targets.js';

/** Kilka celów na jednym polu (03.11, zlecenie MG): kto jeszcze stoi pod kliknięciem. */

const CELL = 100;
const figure = (id: string, col: number, row: number, order = 0, side = CELL): StackedFigure => ({
  id,
  x: col * CELL,
  y: row * CELL,
  side,
  order,
});

const all = () => true;

describe('cele na jednym polu', () => {
  it('pojedyncza figura — tylko ona', () => {
    const figures = [figure('a', 0, 0), figure('b', 1, 0)];
    expect(stackedTargetsAt('a', figures, 50, 50, all)).toEqual(['a']);
  });

  it('dwóch wrogów na jednym polu — kliknięty pierwszy, drugi za nim', () => {
    const figures = [figure('dolny', 2, 2, 0), figure('gorny', 2, 2, 1)];
    expect(stackedTargetsAt('gorny', figures, 250, 250, all)).toEqual(['gorny', 'dolny']);
  });

  it('reszta stosu idzie od wierzchu', () => {
    const figures = [figure('c', 0, 0, 0), figure('b', 0, 0, 2), figure('a', 0, 0, 1)];
    expect(stackedTargetsAt('b', figures, 10, 10, all)).toEqual(['b', 'a', 'c']);
  });

  it('figura, w którą nie wolno celować (własna, strzelec), wypada', () => {
    const figures = [figure('wrog', 0, 0, 1), figure('moja', 0, 0, 0)];
    expect(stackedTargetsAt('wrog', figures, 10, 10, (id) => id !== 'moja')).toEqual(['wrog']);
  });

  it('duża figura obejmuje punkt na sąsiednim polu, sąsiad obok nie', () => {
    const figures = [
      figure('maly', 1, 1, 1),
      figure('duzy', 0, 0, 0, 2 * CELL),
      figure('obok', 2, 1),
    ];
    expect(stackedTargetsAt('maly', figures, 150, 150, all)).toEqual(['maly', 'duzy']);
  });

  it('punkt tuż przy krawędzi pola nie łapie sąsiada', () => {
    const figures = [figure('a', 0, 0, 1), figure('b', 1, 0, 0), figure('c', 0, 1, 0)];
    expect(stackedTargetsAt('a', figures, CELL - 1, CELL - 1, all)).toEqual(['a']);
  });
});
