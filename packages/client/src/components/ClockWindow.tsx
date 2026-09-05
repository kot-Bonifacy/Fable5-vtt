import { useMemo, useState } from 'react';
import {
  GAME_TIME_STEPS,
  formatGameClock,
  formatGameDate,
  formatGameDayTime,
  formatGameTime,
  formatGameWeekday,
  gameDaysPassed,
  gameTimeFromInput,
  gameTimeToInput,
  hpMax,
  settleDue,
  settleMonthsDue,
  type GameTimeStepId,
} from '@vtt/shared';
import { restForADay, setGameTime, settleMonth } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useGameTimeStore } from '../stores/gameTimeStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Okno zegara świata — narzędzie MG (etap 37).
 *
 * Trzy sekcje i wszystkie trzy są **podpowiedziami**: skoki przesuwają jedną
 * liczbę, monit rozliczenia podsuwa gotowy przycisk, a doby odpoczynku podają
 * listę postaci. Żadna z nich niczego nie robi bez kliknięcia — zasada „zegar
 * podpowiada, nie rządzi" (decyzja MG z 05.09.2026) jest tu widoczna jako
 * konsekwentny brak automatu.
 *
 * Wyjątkiem od „to jest rdzeń VTT" jest sekcja odpoczynku: PW są pojęciem
 * Cyberpunka RED. Siedzi u klienta świadomie — serwerowy moduł zegara nie ma
 * prawa wiedzieć, czym jest Punkt Wytrzymałości, a samo leczenie i tak liczy
 * `character:rest`, czyli kod, który zna podręcznik.
 */
export function ClockWindow() {
  const open = useGameTimeStore((s) => s.open);
  const setOpen = useGameTimeStore((s) => s.setOpen);
  const minutes = useGameTimeStore((s) => s.minutes);
  const settledMonth = useGameTimeStore((s) => s.settledMonth);
  const restDays = useGameTimeStore((s) => s.pendingRestDays);
  const clearRestDays = useGameTimeStore((s) => s.clearRestDays);
  // Dwa selektory i `useMemo` zamiast jednego `map` w selektorze: selektor
  // zwracający świeżą tablicę przy każdym wywołaniu odpalałby render przy
  // każdej zmianie dowolnego store'a.
  const charactersById = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const addNote = useChatStore((s) => s.addNote);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ date: string; time: string } | null>(null);

  const placement = useWindowPlacement('clock', () => ({
    x: Math.max(12, window.innerWidth - 460),
    y: 64,
  }));

  /**
   * Postacie, którym doba odpoczynku coś da.
   *
   * Karta bez Poziomu życia i bez właściciela też się liczy — statysta z kartą
   * leczy się tak samo jak gracz, a decyzja, kogo położyć do łóżka, należy
   * do MG, nie do filtra.
   */
  const wounded = useMemo(
    () =>
      order
        .map((id) => charactersById[id]!)
        .map((character) => ({
          id: character.id,
          name: character.name,
          hp: character.data.hpCurrent,
          max: hpMax(character.data.stats),
        }))
        .filter((row) => row.hp < row.max),
    [order, charactersById],
  );

  if (!open) return null;

  const state = { minutes, settledMonth };
  const due = settleDue(state);
  const monthsDue = settleMonthsDue(state);
  const input = draft ?? gameTimeToInput(minutes);

  async function jump(step: GameTimeStepId) {
    setBusy(true);
    const ack = await setGameTime({ step });
    setBusy(false);
    if (!ack.ok) addNote('Nie udało się przesunąć zegara.');
  }

  async function setExact() {
    const wanted = gameTimeFromInput(input.date, input.time);
    if (wanted === null) {
      addNote('Taka data nie istnieje — sprawdź dzień i godzinę.');
      return;
    }
    setBusy(true);
    const ack = await setGameTime({ minutes: wanted });
    setBusy(false);
    setDraft(null);
    if (!ack.ok) addNote('Nie udało się ustawić zegara.');
  }

  async function settle(preview: boolean) {
    setBusy(true);
    const ack = await settleMonth(preview ? { preview: true } : {});
    setBusy(false);
    if (!ack.ok) addNote('Rozliczenie się nie udało.');
  }

  /** Doba odpoczynku dla jednej postaci, powtórzona tyle razy, ile dób minęło. */
  async function rest(characterId: string) {
    setBusy(true);
    for (let day = 0; day < restDays; day += 1) await restForADay(characterId);
    setBusy(false);
  }

  return (
    <section
      ref={placement.ref}
      className="settings-window clock-window"
      style={placement.style}
      aria-label="Zegar świata"
    >
      <div className="settings-window-header" {...placement.dragProps}>
        <span className="settings-window-title">🕑 Zegar świata</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => setOpen(false)}
          title="Zamknij zegar"
          aria-label="Zamknij zegar"
        >
          ✕
        </button>
      </div>

      <div className="settings-window-body">
        <section className="settings-group">
          <p className="clock-now">
            <strong className="clock-now-time">{formatGameClock(minutes)}</strong>
            <span className="clock-now-date">{formatGameDate(minutes)}</span>
            <span className="clock-now-weekday">{formatGameWeekday(minutes)}</span>
          </p>

          <div className="clock-steps">
            {GAME_TIME_STEPS.map((step) => (
              <button
                key={step.id}
                type="button"
                className="small-button"
                title={step.title}
                disabled={busy}
                onClick={() => void jump(step.id)}
              >
                {step.label}
              </button>
            ))}
          </div>

          <div className="clock-exact">
            <input
              type="date"
              value={input.date}
              aria-label="Data w świecie gry"
              onChange={(event) => setDraft({ ...input, date: event.target.value })}
            />
            <input
              type="time"
              value={input.time}
              aria-label="Godzina w świecie gry"
              onChange={(event) => setDraft({ ...input, time: event.target.value })}
            />
            <button type="button" className="small-button" disabled={busy} onClick={setExact}>
              Ustaw
            </button>
          </div>
          <p className="settings-hint">
            Zegar wolno cofnąć, ale cofnięcie <strong>niczego nie odwraca</strong>: pobrany czynsz
            zostaje pobrany, a wyleczone PW wyleczone.
          </p>
        </section>

        <section className="settings-group">
          <h3 className="settings-group-title">Rozliczenie miesiąca</h3>
          {due ? (
            <p className="clock-prompt clock-prompt--due">
              Minął pierwszy dzień miesiąca
              {monthsDue > 1 ? ` — i jeszcze ${monthsDue - 1}` : ''}. Ostatnio rozliczono{' '}
              {settledMonth ?? 'nigdy'}, zegar stoi w {formatGameDate(minutes)}.
            </p>
          ) : (
            <p className="clock-prompt">
              Nic nie czeka — {settledMonth ?? 'nigdy nie rozliczano'} rozliczony.
            </p>
          )}
          <div className="clock-steps">
            <button
              type="button"
              className="small-button"
              disabled={busy}
              title="Policz rachunek, nie ruszając żadnego portfela"
              onClick={() => void settle(true)}
            >
              Podgląd
            </button>
            <button
              type="button"
              className={`small-button${due ? ' small-button--on' : ''}`}
              disabled={busy}
              title="Pobierz Poziom życia i czynsz od każdej postaci, która je ma"
              onClick={() => void settle(false)}
            >
              Rozlicz
            </button>
          </div>
        </section>

        {restDays > 0 && (
          <section className="settings-group">
            <h3 className="settings-group-title">Odpoczynek — {gameDaysPassed(restDays)}</h3>
            {wounded.length === 0 ? (
              <p className="clock-prompt">Nikt nie ma ubytku PW.</p>
            ) : (
              <ul className="clock-rest">
                {wounded.map((row) => (
                  <li key={row.id}>
                    <span className="clock-rest-name">{row.name}</span>
                    <span className="clock-rest-hp">
                      {row.hp}/{row.max} PW
                    </span>
                    <button
                      type="button"
                      className="small-button"
                      disabled={busy}
                      title={`Rozlicz ${restDays === 1 ? 'dzień' : `${restDays} dni`} odpoczynku`}
                      onClick={() => void rest(row.id)}
                    >
                      Odpoczynek
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="small-button"
              onClick={clearRestDays}
              title="Schowaj propozycję — nikt tej nocy nie odpoczywał"
            >
              Pomiń
            </button>
          </section>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

/**
 * Zegar w górnym pasku: napis dla stołu, przycisk dla MG.
 *
 * **Gracz nie widzi tarczy zegara** (rozstrzygnięcie MG z 05.09.2026) — dostaje
 * datę i porę dnia, MG godzinę co do minuty. Nie jest to tajemnica ani filtr:
 * minuta jedzie w `state:sync` do wszystkich i nikt z niej nic nie ugra. Jest
 * to szczerość etykiety. Zegar rusza się wyłącznie na kliknięcie MG, a rundy
 * walki nie dotykają go wcale, więc godzina pokazana graczowi obiecuje
 * dokładność, której nie da się dotrzymać: po trzech godzinach strzelaniny
 * „08:37" czyta się jak zepsuty zegar, a „15 marca, rano" — jak działający.
 *
 * MG godzinę widzieć musi: to on ją przesuwa, jemu etap 39 policzy efekt „na
 * godzinę", i tylko z jego strony różnica między 05:59 a 06:00 cokolwiek znaczy
 * (skok „do rana").
 */
export function ClockChip({ isGm }: { isGm: boolean }) {
  const minutes = useGameTimeStore((s) => s.minutes);
  const open = useGameTimeStore((s) => s.open);
  const toggleOpen = useGameTimeStore((s) => s.toggleOpen);
  const settledMonth = useGameTimeStore((s) => s.settledMonth);
  const due = settleDue({ minutes, settledMonth });

  if (!isGm) {
    const shown = formatGameDayTime(minutes);
    return (
      <span className="top-bar-clock" title={`W świecie gry: ${shown}`}>
        {shown}
      </span>
    );
  }

  const label = `${formatGameClock(minutes)} · ${formatGameDate(minutes)}`;
  const title = formatGameTime(minutes);
  return (
    <button
      type="button"
      className={`top-bar-clock top-bar-clock--gm${open ? ' small-button--on' : ''}${
        due ? ' top-bar-clock--due' : ''
      }`}
      title={due ? `${title} — minął pierwszy dzień miesiąca` : `${title} — kliknij, by przesunąć`}
      aria-label={`Zegar świata: ${title}`}
      aria-pressed={open}
      onClick={toggleOpen}
    >
      {label}
      {due ? <span aria-hidden="true"> ●</span> : null}
    </button>
  );
}
