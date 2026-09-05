import { describe, expect, it } from 'vitest';
import {
  GAME_TIME_DEFAULT,
  GAME_TIME_MAX,
  GAME_TIME_MIN,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  applyGameTimeStep,
  chatCategoryOf,
  chatCompactLine,
  formatGameClock,
  formatGameDate,
  formatGameTime,
  formatGameWeekday,
  gameDayKey,
  gameDayPart,
  gameDaysBetween,
  gameDaysLabel,
  gameDaysPassed,
  gameMonthKey,
  gameTimeFromInput,
  gameTimeToInput,
  isGameTime,
  isGameTimeStepId,
  settleDue,
  settleMonthsDue,
  timeLogTitle,
  type ChatMessageView,
} from './index.js';

/** Chwila świata z podanej daty UTC — testy czytają się wtedy jak kalendarz. */
function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Math.trunc(Date.UTC(year, month - 1, day, hour, minute) / 60_000);
}

describe('zegar świata — odczyt', () => {
  it('domyślny start kampanii to 1 stycznia 2045, 08:00', () => {
    expect(GAME_TIME_DEFAULT).toBe(at(2045, 1, 1, 8));
    expect(formatGameTime(GAME_TIME_DEFAULT)).toBe('1 stycznia 2045, 08:00 · rano');
  });

  it('składa datę po polsku, w dopełniaczu', () => {
    expect(formatGameDate(at(2045, 3, 15))).toBe('15 marca 2045');
    expect(formatGameDate(at(2045, 9, 1))).toBe('1 września 2045');
  });

  it('godzina zawsze na dwie cyfry', () => {
    expect(formatGameClock(at(2045, 3, 15, 8, 5))).toBe('08:05');
    expect(formatGameClock(at(2045, 3, 15, 0, 0))).toBe('00:00');
    expect(formatGameClock(at(2045, 3, 15, 23, 59))).toBe('23:59');
  });

  it('zna dzień tygodnia', () => {
    // 15 marca 2045 wypada w środę.
    expect(formatGameWeekday(at(2045, 3, 15))).toBe('środa');
  });

  it('dzieli dobę na cztery pory', () => {
    expect(gameDayPart(at(2045, 3, 15, 3))).toBe('night');
    expect(gameDayPart(at(2045, 3, 15, 5))).toBe('morning');
    expect(gameDayPart(at(2045, 3, 15, 10, 59))).toBe('morning');
    expect(gameDayPart(at(2045, 3, 15, 11))).toBe('day');
    expect(gameDayPart(at(2045, 3, 15, 17))).toBe('evening');
    expect(gameDayPart(at(2045, 3, 15, 22))).toBe('night');
  });

  it('klucze miesiąca i doby są dopełnione zerami', () => {
    expect(gameMonthKey(at(2045, 3, 15))).toBe('2045-03');
    expect(gameDayKey(at(2045, 3, 5))).toBe('2045-03-05');
  });

  it('odczyt nie zależy od strefy czasowej maszyny', () => {
    // Cała arytmetyka idzie przez `getUTC*`; gdyby gdziekolwiek wszedł czas
    // lokalny, ta godzina przesunęłaby się o strefę.
    const noon = at(2045, 6, 15, 12);
    expect(formatGameClock(noon)).toBe('12:00');
    expect(gameDayKey(noon)).toBe('2045-06-15');
  });
});

describe('zegar świata — skoki', () => {
  it('dodaje dziesięć minut, godzinę i dobę', () => {
    const start = at(2045, 3, 15, 8);
    expect(applyGameTimeStep(start, 'min10')).toBe(start + 10);
    expect(applyGameTimeStep(start, 'hour')).toBe(start + MINUTES_PER_HOUR);
    expect(applyGameTimeStep(start, 'day')).toBe(start + MINUTES_PER_DAY);
  });

  it('„do rana" bierze najbliższą szóstą po bieżącej chwili', () => {
    expect(applyGameTimeStep(at(2045, 3, 15, 23), 'morning')).toBe(at(2045, 3, 16, 6));
    expect(applyGameTimeStep(at(2045, 3, 15, 3), 'morning')).toBe(at(2045, 3, 15, 6));
    expect(applyGameTimeStep(at(2045, 3, 15, 7), 'morning')).toBe(at(2045, 3, 16, 6));
  });

  it('„do rana" równo o szóstej daje jutro, nie stoi w miejscu', () => {
    expect(applyGameTimeStep(at(2045, 3, 15, 6), 'morning')).toBe(at(2045, 3, 16, 6));
  });

  it('skok przechodzi przez granicę doby, miesiąca i roku', () => {
    expect(applyGameTimeStep(at(2045, 3, 15, 23, 55), 'min10')).toBe(at(2045, 3, 16, 0, 5));
    expect(applyGameTimeStep(at(2045, 3, 31, 12), 'day')).toBe(at(2045, 4, 1, 12));
    expect(applyGameTimeStep(at(2045, 12, 31, 23), 'hour')).toBe(at(2046, 1, 1, 0));
  });

  it('rok przestępny liczy się sam', () => {
    // 2048 jest przestępny, 2045 nie.
    expect(applyGameTimeStep(at(2048, 2, 28, 12), 'day')).toBe(at(2048, 2, 29, 12));
    expect(applyGameTimeStep(at(2045, 2, 28, 12), 'day')).toBe(at(2045, 3, 1, 12));
  });

  it('rozpoznaje własne identyfikatory skoków', () => {
    expect(isGameTimeStepId('morning')).toBe(true);
    expect(isGameTimeStepId('week')).toBe(false);
    expect(isGameTimeStepId(null)).toBe(false);
  });
});

describe('zegar świata — doby odpoczynku', () => {
  it('liczy przekroczone północe, nie odliczone 24 godziny', () => {
    // Osiem godzin, ale jedna przespana noc — to jeden dzień odpoczynku.
    expect(gameDaysBetween(at(2045, 3, 15, 23), at(2045, 3, 16, 7))).toBe(1);
    // Dwadzieścia trzy godziny w obrębie jednej doby to zero.
    expect(gameDaysBetween(at(2045, 3, 15, 0, 30), at(2045, 3, 15, 23, 30))).toBe(0);
  });

  it('skok o tydzień daje siedem dób', () => {
    expect(gameDaysBetween(at(2045, 3, 15, 8), at(2045, 3, 22, 8))).toBe(7);
  });

  it('cofnięty zegar nie oddaje ani jednej doby', () => {
    expect(gameDaysBetween(at(2045, 3, 20), at(2045, 3, 15))).toBe(0);
    expect(gameDaysBetween(at(2045, 3, 15), at(2045, 3, 15))).toBe(0);
  });
});

describe('zegar świata — ustawienie daty wprost', () => {
  it('wraca tą samą drogą, którą przyszło', () => {
    const minutes = at(2045, 3, 15, 8, 30);
    const input = gameTimeToInput(minutes);
    expect(input).toEqual({ date: '2045-03-15', time: '08:30' });
    expect(gameTimeFromInput(input.date, input.time)).toBe(minutes);
  });

  it('czyta datę jako UTC, nie jako czas lokalny przeglądarki', () => {
    expect(gameTimeFromInput('2045-03-15', '00:00')).toBe(at(2045, 3, 15, 0, 0));
  });

  it('odrzuca datę, której kalendarz nie ma', () => {
    expect(gameTimeFromInput('2045-02-31', '08:00')).toBeNull();
    expect(gameTimeFromInput('2045-13-01', '08:00')).toBeNull();
    expect(gameTimeFromInput('2045-03-15', '25:00')).toBeNull();
    expect(gameTimeFromInput('', '')).toBeNull();
  });

  it('odrzuca rok spoza granic bezpiecznika', () => {
    expect(gameTimeFromInput('1999-12-31', '23:59')).toBeNull();
    expect(gameTimeFromInput('2250-01-01', '00:00')).toBeNull();
    expect(isGameTime(GAME_TIME_MIN)).toBe(true);
    expect(isGameTime(GAME_TIME_MAX)).toBe(true);
    expect(isGameTime(GAME_TIME_MIN - 1)).toBe(false);
    expect(isGameTime(1.5)).toBe(false);
    expect(isGameTime('2045')).toBe(false);
  });
});

describe('zegar świata — monit rozliczenia', () => {
  it('pojawia się po przekroczeniu pierwszego dnia miesiąca', () => {
    const state = { minutes: at(2045, 4, 1, 0, 5), settledMonth: '2045-03' };
    expect(settleDue(state)).toBe(true);
    expect(settleMonthsDue(state)).toBe(1);
  });

  it('nie pojawia się w miesiącu już rozliczonym — także po wielu skokach', () => {
    expect(settleDue({ minutes: at(2045, 3, 1), settledMonth: '2045-03' })).toBe(false);
    expect(settleDue({ minutes: at(2045, 3, 31, 23, 59), settledMonth: '2045-03' })).toBe(false);
  });

  it('kwartał poza miastem to trzy nierozliczone miesiące, nie trzy monity', () => {
    const state = { minutes: at(2045, 6, 2), settledMonth: '2045-03' };
    expect(settleDue(state)).toBe(true);
    expect(settleMonthsDue(state)).toBe(3);
  });

  it('liczy poprawnie przez granicę roku', () => {
    const state = { minutes: at(2046, 1, 5), settledMonth: '2045-12' };
    expect(settleDue(state)).toBe(true);
    expect(settleMonthsDue(state)).toBe(1);
  });

  it('cofnięty zegar monitu nie zapala', () => {
    expect(settleDue({ minutes: at(2045, 2, 10), settledMonth: '2045-03' })).toBe(false);
    expect(settleMonthsDue({ minutes: at(2045, 2, 10), settledMonth: '2045-03' })).toBe(0);
  });

  it('kampania, która nigdy nie rozliczała, nie zaczyna od zaległego czynszu', () => {
    expect(settleDue({ minutes: at(2045, 6, 1), settledMonth: null })).toBe(false);
    expect(settleMonthsDue({ minutes: at(2045, 6, 1), settledMonth: null })).toBe(0);
  });
});

describe('zegar świata — polska liczba mnoga dób', () => {
  it('odmienia rzeczownik w trzech formach', () => {
    expect(gameDaysLabel(1)).toBe('jedna doba');
    expect(gameDaysLabel(2)).toBe('2 doby');
    expect(gameDaysLabel(4)).toBe('4 doby');
    expect(gameDaysLabel(5)).toBe('5 dób');
    expect(gameDaysLabel(30)).toBe('30 dób');
    expect(gameDaysLabel(22)).toBe('22 doby');
  });

  it('nastolatki idą do formy dopełniaczowej, nie do „doby"', () => {
    // Pułapka polskiej odmiany: 12–14 mają „dób", choć kończą się na 2–4.
    expect(gameDaysLabel(12)).toBe('12 dób');
    expect(gameDaysLabel(13)).toBe('13 dób');
    expect(gameDaysLabel(14)).toBe('14 dób');
    expect(gameDaysLabel(112)).toBe('112 dób');
  });

  it('czasownik idzie za liczbą', () => {
    expect(gameDaysPassed(1)).toBe('minęła doba');
    expect(gameDaysPassed(3)).toBe('minęły 3 doby');
    expect(gameDaysPassed(30)).toBe('minęło 30 dób');
    expect(gameDaysPassed(13)).toBe('minęło 13 dób');
  });
});

describe('zegar świata na czacie', () => {
  it('tytuł karty zależy od skoku, a cofnięcie ma własny', () => {
    expect(timeLogTitle('morning', false)).toBe('Minęła noc');
    expect(timeLogTitle('day', false)).toBe('Minęła doba');
    expect(timeLogTitle(null, false)).toBe('Zegar ustawiony');
    expect(timeLogTitle('day', true)).toBe('Zegar cofnięty');
  });

  it('rodzaj `time` czyta się razem z papierami i pieniędzmi', () => {
    expect(chatCategoryOf('time')).toBe('table');
  });

  it('ściska się do jednej linii, a cofnięcie nosi ostrzeżenie', () => {
    const message: ChatMessageView = {
      id: 1,
      kind: 'time',
      authorId: 'gm',
      authorName: 'MG',
      text: '',
      createdAt: '2026-09-05T20:00:00.000Z',
      time: {
        title: 'Minęła noc',
        from: '15 marca 2045, 23:00 · noc',
        to: '16 marca 2045, 06:00 · rano',
        days: 1,
      },
    };
    expect(chatCompactLine(message)).toEqual({
      actor: 'Zegar świata',
      summary: 'Minęła noc — 16 marca 2045, 06:00 · rano',
    });
    expect(chatCompactLine({ ...message, time: { ...message.time!, backwards: true } })?.tone).toBe(
      'warn',
    );
  });
});
