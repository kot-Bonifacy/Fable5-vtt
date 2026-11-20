import { describe, expect, it } from 'vitest';
import {
  cpredChaseAutopilot,
  type CpredAutopilotInput,
  type CpredAutopilotSelf,
  type CpredPilotBody,
} from './chase-autopilot.js';

/** Auto 3 × 5 kratek na środku pasa. */
const LENGTH = 5;

function self(patch: Partial<CpredAutopilotSelf> = {}): CpredAutopilotSelf {
  return {
    along: 0,
    lengthSq: LENGTH,
    lane: 1,
    speed: 30,
    maxSpeed: 40,
    raceBonus: 0,
    nitroMove: 0,
    ...patch,
  };
}

function car(id: string, patch: Partial<CpredPilotBody> = {}): CpredPilotBody {
  const lane = patch.lane ?? 1;
  return { id, along: 20, lengthSq: LENGTH, lane, lanes: [lane], speed: 30, pending: 0, ...patch };
}

function obstacle(id: string, along: number, lane: number): CpredPilotBody {
  return { id, along, lengthSq: 2, lane, lanes: [lane], speed: 0, pending: 0 };
}

function input(patch: Partial<CpredAutopilotInput>): CpredAutopilotInput {
  return {
    intent: 'flee',
    self: self(),
    pursuitSpeed: 30,
    lanes: 3,
    target: null,
    keepGapSq: null,
    others: [],
    ...patch,
  };
}

describe('cpredChaseAutopilot — Uciekaj', () => {
  it('na wolnej drodze dodaje gazu, nie zmieniając pasa', () => {
    expect(cpredChaseAutopilot(input({}))).toEqual({ pedal: 'gas', laneDelta: 0 });
  });

  it('przy maksimum jedzie prosto bez pedału', () => {
    expect(cpredChaseAutopilot(input({ self: self({ speed: 40 }) }))).toEqual({
      pedal: null,
      laneDelta: 0,
    });
  });

  it('omija przeszkodę na swoim pasie, zjeżdżając na wolny', () => {
    const plan = cpredChaseAutopilot(
      input({ self: self({ speed: 40 }), others: [obstacle('barykada', 12, 1)] }),
    );
    expect(plan?.laneDelta).not.toBe(0);
  });

  it('nie zjeżdża na pas, na którym stoi przeszkoda', () => {
    const plan = cpredChaseAutopilot(
      input({
        self: self({ speed: 40 }),
        others: [obstacle('barykada', 12, 1), obstacle('roboty', 12, 0)],
      }),
    );
    expect(plan).toEqual({ pedal: null, laneDelta: 1 });
  });

  it('przy krawędzi jezdni nie wyjeżdża poza skrajny pas', () => {
    const plan = cpredChaseAutopilot(
      input({ self: self({ lane: 0, speed: 40 }), others: [obstacle('barykada', 12, 0)] }),
    );
    expect(plan).toEqual({ pedal: null, laneDelta: 1 });
  });
});

describe('cpredChaseAutopilot — Goń', () => {
  it('bez celu nie ma planu', () => {
    expect(cpredChaseAutopilot(input({ intent: 'pursue' }))).toBeNull();
  });

  it('daleko za celem dodaje gazu', () => {
    const plan = cpredChaseAutopilot(
      input({ intent: 'pursue', target: car('cel', { along: 40 }) }),
    );
    expect(plan).toEqual({ pedal: 'gas', laneDelta: 0 });
  });

  it('zjeżdża na pas celu', () => {
    const plan = cpredChaseAutopilot(
      input({ intent: 'pursue', target: car('cel', { along: 40, lane: 0 }) }),
    );
    expect(plan?.laneDelta).toBe(-1);
  });

  it('tuż za stojącym celem hamuje zamiast w niego wjechać', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'pursue',
        self: self({ speed: 40 }),
        target: car('cel', { along: 12, speed: 0 }),
      }),
    );
    expect(plan?.pedal).toBe('brake');
    expect(plan?.laneDelta).toBe(0);
  });

  it('dogania w kilka rund i staje tuż za celem', () => {
    // Prosta pętla: auto i cel jadą swoimi prędkościami, prędkość pościgu to celu.
    const target = car('cel', { along: 30, speed: 30 });
    let me = self({ speed: 30 });
    for (let round = 0; round < 14; round += 1) {
      const plan = cpredChaseAutopilot(input({ intent: 'pursue', self: me, target }))!;
      const speed = Math.min(
        me.maxSpeed,
        Math.max(0, me.speed + (plan.pedal === 'gas' ? 10 : plan.pedal === 'brake' ? -20 : 0)),
      );
      me = { ...me, speed, along: me.along + (speed - target.speed) / 4 };
    }
    const gap = target.along - LENGTH / 2 - (me.along + LENGTH / 2);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(4);
  });
});

describe('cpredChaseAutopilot — Trzymaj dystans', () => {
  it('cel odjeżdża — dodaje gazu', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'keep',
        keepGapSq: -20,
        target: car('cel', { along: 20, speed: 40, pending: 2.5 }),
      }),
    );
    expect(plan?.pedal).toBe('gas');
  });

  it('cel zwalnia — hamuje', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'keep',
        keepGapSq: -20,
        target: car('cel', { along: 20, speed: 10, pending: -5 }),
      }),
    );
    expect(plan?.pedal).toBe('brake');
  });

  it('odstęp w sam raz — jedzie prosto', () => {
    const plan = cpredChaseAutopilot(
      input({ intent: 'keep', keepGapSq: -20, target: car('cel', { along: 20 }) }),
    );
    expect(plan).toEqual({ pedal: null, laneDelta: 0 });
  });
});

describe('cpredChaseAutopilot — Taranuj', () => {
  it('za celem na jego pasie przyspiesza, żeby w niego wjechać', () => {
    const plan = cpredChaseAutopilot(
      input({ intent: 'ram', target: car('cel', { along: 9, speed: 30 }) }),
    );
    expect(plan).toEqual({ pedal: 'gas', laneDelta: 0 });
  });

  it('obok celu spycha go bokiem', () => {
    const plan = cpredChaseAutopilot(
      input({ intent: 'ram', target: car('cel', { along: 0, lane: 2 }) }),
    );
    expect(plan?.laneDelta).toBe(1);
  });
});

describe('cpredChaseAutopilot — Blokuj', () => {
  it('przed celem na sąsiednim pasie zajeżdża mu drogę', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'block',
        self: self({ along: 10 }),
        target: car('cel', { along: 0, lane: 2 }),
      }),
    );
    expect(plan?.laneDelta).toBe(1);
  });

  it('za celem na jego pasie nie wjeżdża w niego — wyprzedza innym pasem', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'block',
        self: self({ speed: 30 }),
        target: car('cel', { along: 7, speed: 30 }),
      }),
    );
    expect(plan?.laneDelta).not.toBe(0);
  });
});

describe('cpredChaseAutopilot — inne auta na drodze', () => {
  it('Goń nie wjeżdża w auto, które stoi między nim a celem', () => {
    const plan = cpredChaseAutopilot(
      input({
        intent: 'pursue',
        self: self({ speed: 40 }),
        target: car('cel', { along: 40, speed: 30 }),
        others: [car('cywil', { along: 10, speed: 10 })],
      }),
    );
    expect(plan?.laneDelta).not.toBe(0);
  });
});
