import { describe, expect, it } from 'vitest';
import {
  ZONE_MESSAGES,
  isPointInZone,
  pickZoneAt,
  sanitizeZoneName,
  sanitizeZoneRect,
  zoneLabel,
  zoneLive,
  zoneStanding,
  zoneTouchedBy,
  zoneTouchedByPath,
  type DefenseZoneView,
} from './zones.js';

function zone(patch: Partial<DefenseZoneView> = {}): DefenseZoneView {
  return {
    id: 1,
    sceneId: 'scene',
    entryId: 'defense.podloga-elektryczna',
    name: 'Podłoga elektryczna',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    armed: true,
    hidden: true,
    hpMax: 20,
    hpCurrent: 20,
    ...patch,
  };
}

describe('geometria strefy bronionej', () => {
  it('bierze krawędź do środka — figura na linii stoi na pułapce', () => {
    expect(isPointInZone(zone(), { x: 100, y: 150 })).toBe(true);
    expect(isPointInZone(zone(), { x: 300, y: 200 })).toBe(true);
    expect(isPointInZone(zone(), { x: 99, y: 150 })).toBe(false);
  });

  it('trasa, która przecina obszar, dotyka go, choć kończy się poza nim', () => {
    // Przejście na wylot: żaden z końców nie leży w prostokącie.
    expect(zoneTouchedBy(zone(), { x: 0, y: 150 }, { x: 400, y: 150 })).toBe(true);
    expect(zoneTouchedBy(zone(), { x: 0, y: 0 }, { x: 0, y: 400 })).toBe(false);
  });

  it('czyta całą łamaną z etapu 16e, nie sam odcinek początek–koniec', () => {
    // Ścieżka obchodząca róg: prosta z A do B mija strefę, ale trasa w nią wchodzi.
    const path = [
      { x: 0, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 150 },
    ];
    expect(zoneTouchedByPath(zone(), path)).toBe(true);
    expect(
      zoneTouchedByPath(zone(), [
        { x: 0, y: 400 },
        { x: 400, y: 400 },
      ]),
    ).toBe(false);
  });

  it('ścieżka o jednym punkcie to zwykłe pytanie „czy tu stoi”', () => {
    expect(zoneTouchedByPath(zone(), [{ x: 150, y: 150 }])).toBe(true);
    expect(zoneTouchedByPath(zone(), [{ x: 10, y: 10 }])).toBe(false);
    expect(zoneTouchedByPath(zone(), [])).toBe(false);
  });

  it('klik trafia w strefę położoną najpóźniej — tak jak przy osłonach', () => {
    const under = zone({ id: 1 });
    const over = zone({ id: 2, x: 150, y: 120, width: 40, height: 40 });
    expect(pickZoneAt([under, over], { x: 160, y: 130 })?.id).toBe(2);
    expect(pickZoneAt([under, over], { x: 280, y: 190 })?.id).toBe(1);
    expect(pickZoneAt([under, over], { x: 0, y: 0 })).toBeNull();
  });
});

describe('stan systemu', () => {
  it('system bez PW nigdy nie jest zniszczony — pusta komórka to nie zero', () => {
    expect(zoneStanding(zone({ hpMax: 0, hpCurrent: 0 }))).toBe(true);
    expect(zoneStanding(zone({ hpMax: 20, hpCurrent: 0 }))).toBe(false);
    expect(zoneStanding(zone({ hpMax: 20, hpCurrent: 1 }))).toBe(true);
  });

  it('odpala się tylko system uzbrojony, cały i bez przepustki dla tej figury', () => {
    expect(zoneLive(zone(), 'token-1')).toBe(true);
    expect(zoneLive(zone({ armed: false }), 'token-1')).toBe(false);
    expect(zoneLive(zone({ hpCurrent: 0 }), 'token-1')).toBe(false);
    expect(zoneLive(zone({ exempt: ['token-1'] }), 'token-1')).toBe(false);
    // Przepustka jest imienna: kto jej nie ma, ten dostaje.
    expect(zoneLive(zone({ exempt: ['token-1'] }), 'token-2')).toBe(true);
  });

  it('podpis mówi, co się z tą strefą dzieje', () => {
    expect(zoneLabel(zone())).toBe('Podłoga elektryczna · 20/20 PW · uzbrojona');
    expect(zoneLabel(zone({ armed: false }))).toContain('rozbrojona');
    expect(zoneLabel(zone({ hpCurrent: 0 }))).toContain('zniszczona');
    expect(zoneLabel(zone({ hpMax: 0, hpCurrent: 0 }))).toBe('Podłoga elektryczna · uzbrojona');
  });
});

describe('sanityzacja gestu', () => {
  it('prostokąt wraca znormalizowany, niezależnie od kierunku przeciągnięcia', () => {
    expect(sanitizeZoneRect({ x: 300, y: 200, width: -200, height: -100 })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it('zabłąkane kliknięcie nie tworzy strefy', () => {
    expect(sanitizeZoneRect({ x: 10, y: 10, width: 2, height: 2 })).toBeNull();
    expect(sanitizeZoneRect({ x: 10, y: 10, width: 30 })).toBeNull();
    expect(sanitizeZoneRect(null)).toBeNull();
  });

  it('pusta nazwa znaczy „zostaw nazwę wpisu”', () => {
    expect(sanitizeZoneName('  Podłoga w windzie  ')).toBe('Podłoga w windzie');
    expect(sanitizeZoneName('   ')).toBeNull();
    expect(sanitizeZoneName(7)).toBeNull();
  });
});

describe('odmowy', () => {
  it('każdy kod ma polskie zdanie', () => {
    for (const message of Object.values(ZONE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
    }
  });
});
