import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCharacterData } from '@vtt/shared';
import type { CharacterView, CpredCharacterData } from '@vtt/shared';

/**
 * Strażnik autozapisu karty (sesja naprawcza 21.08).
 *
 * Karta zapisuje się z opóźnieniem 600 ms, a echo serwera podmienia **całą**
 * postać. Dopóki bufor debounce nie liczył się jako zapis w locie, ack
 * poprzedniego zapisu adoptował widok serwera i kasował ze store'a łatkę, która
 * dopiero czekała na wysłanie — następny klik budował listę z okrojonego stanu
 * i wiersz przepadał bez śladu ani komunikatu. Tak „cztery Programy wkładane do
 * deku co 600 ms zostawiły dwa" (etap 26a); dotyczyło każdej listy karty od
 * etapu 07, deku tylko najłatwiej to wywołać.
 *
 * Test chodzi po prawdziwym `queueCharacterSave` z podstawionym gniazdem, bo
 * naprawiona umowa mieszka na styku bufora i store'a: bufor otwiera zapis,
 * a dopiero ack go zamyka.
 */

const wire = vi.hoisted(() => {
  const sent: { event: string; payload: unknown; ack?: (result: unknown) => void }[] = [];
  const socket = {
    on: () => socket,
    off: () => socket,
    once: () => socket,
    emit: (event: string, payload?: unknown, ack?: (result: unknown) => void) => {
      sent.push({ event, payload, ...(ack ? { ack } : {}) });
      return socket;
    },
    disconnect: () => undefined,
    connected: true,
    io: { on: () => undefined, off: () => undefined },
  };
  return { sent, socket };
});

vi.mock('socket.io-client', () => ({ io: () => wire.socket }));

let socketApi: typeof import('./socket.js');
let useCharacterStore: typeof import('./stores/characterStore.js').useCharacterStore;

const base = createDefaultCharacterData();

function withGear(names: string[]): CpredCharacterData {
  return { ...base, gear: names.map((name) => ({ name, quantity: 1, notes: '' })) as never };
}

function serverView(gear: string[]): CharacterView {
  return {
    id: 'c1',
    name: 'Rico',
    ownerId: null,
    portraitUrl: null,
    data: withGear(gear),
  } as unknown as CharacterView;
}

function gearNames(): string[] {
  return useCharacterStore.getState().characters['c1']!.data.gear.map((g) => g.name);
}

/** Odpowiada na najstarszy niezałatwiony `character:update` widokiem serwera. */
function ackOldestSave(gear: string[]): void {
  const pending = wire.sent.find((entry) => entry.event === 'character:update' && entry.ack);
  if (!pending?.ack) throw new Error('nie ma na co odpowiedzieć — zapis nie poszedł');
  const answer = pending.ack;
  delete pending.ack;
  answer({ ok: true, data: serverView(gear) });
}

/** Odmawia najstarszemu niezałatwionemu zapisowi — tak, jak robi to serwer. */
function refuseOldestSave(code: string): void {
  const pending = wire.sent.find((entry) => entry.event === 'character:update' && entry.ack);
  if (!pending?.ack) throw new Error('nie ma na co odpowiedzieć — zapis nie poszedł');
  const answer = pending.ack;
  delete pending.ack;
  answer({ ok: false, error: code });
}

function savesSent(): number {
  return wire.sent.filter((entry) => entry.event === 'character:update').length;
}

beforeAll(async () => {
  // socket.ts sięga po `window` po timery; testy klienta biegną w node.
  (globalThis as { window?: unknown }).window = globalThis;
  socketApi = await import('./socket.js');
  ({ useCharacterStore } = await import('./stores/characterStore.js'));
  socketApi.connectSocket('u1');
});

beforeEach(() => {
  vi.useFakeTimers();
  wire.sent.length = 0;
  useCharacterStore.setState({
    characters: {},
    order: [],
    pendingSaves: {},
    saveStates: {},
    saveErrors: {},
    serverViews: {},
  });
  useCharacterStore.getState().applyUpsert(serverView([]));
});

describe('autozapis karty postaci', () => {
  it('nie gubi wiersza dołożonego, gdy poprzedni zapis jest jeszcze w locie', () => {
    // Pierwszy Program — bufor otwiera się i od tej chwili liczy jako zapis.
    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A']).gear } });
    vi.advanceTimersByTime(600); // debounce mija, emit idzie na serwer
    expect(savesSent()).toBe(1);

    // Drugi Program wchodzi, zanim serwer zdążył odpowiedzieć na pierwszy.
    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A', 'B']).gear } });
    expect(gearNames()).toEqual(['A', 'B']);

    // Spóźniony ack pierwszego zapisu niesie listę bez B — i nie ma prawa jej
    // narzucić, bo B nadal czeka w buforze.
    ackOldestSave(['A']);
    expect(gearNames()).toEqual(['A', 'B']);

    // Drugi zapis dowozi komplet i dopiero jego ack jest prawdą.
    vi.advanceTimersByTime(600);
    expect(savesSent()).toBe(2);
    ackOldestSave(['A', 'B']);
    expect(gearNames()).toEqual(['A', 'B']);
    expect(useCharacterStore.getState().pendingSaves['c1']).toBe(0);
  });

  it('adoptuje widok serwera, gdy nic już nie czeka', () => {
    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A', 'B']).gear } });
    vi.advanceTimersByTime(600);
    // Serwer odrzucił drugi wiersz — ostatni ack jest autorytetem.
    ackOldestSave(['A']);
    expect(gearNames()).toEqual(['A']);
  });

  it('liczy jeden zapis na okno debounce, nie jeden na naciśnięty klawisz', () => {
    socketApi.queueCharacterSave('c1', { name: 'R' });
    socketApi.queueCharacterSave('c1', { name: 'Ri' });
    socketApi.queueCharacterSave('c1', { name: 'Rico' });
    expect(useCharacterStore.getState().pendingSaves['c1']).toBe(1);

    vi.advanceTimersByTime(600);
    expect(savesSent()).toBe(1); // jeden bufor to jeden emit…
    ackOldestSave([]);
    expect(useCharacterStore.getState().pendingSaves['c1']).toBe(0); // …i jeden ack
  });
});

/**
 * Odmowa serwera a karta na ekranie (zaległość z 02.09).
 *
 * MG wybierał w polu „Rola" Rolę, którą postać miała już jako poprzednią,
 * serwer odmawiał `ROLE_TWICE` i **nie zapisywał nic** — a karta dalej pokazywała
 * nową Rolę, z tytułem okna włącznie, aż do przeładowania strony. Jedynym śladem
 * było czerwone „Błąd zapisu!" bez powodu. Dotyczyło **każdej** odmowy
 * `character:update`, nie tylko Ról.
 *
 * Dwie rzeczy są tu pilnowane: że ekran wraca do tego, co ma serwer, i że
 * powód odmowy dojeżdża do karty.
 */
describe('odmowa zapisu karty', () => {
  it('cofa optymistyczną łatę do widoku serwera', () => {
    socketApi.queueCharacterSave('c1', { name: 'FRANK NOMADA' });
    expect(useCharacterStore.getState().characters['c1']!.name).toBe('FRANK NOMADA');

    vi.advanceTimersByTime(600);
    refuseOldestSave('ROLE_TWICE');

    expect(useCharacterStore.getState().characters['c1']!.name).toBe('Rico');
    expect(useCharacterStore.getState().saveStates['c1']).toBe('error');
  });

  it('zapamiętuje kod odmowy i tłumaczy go na zdanie', () => {
    socketApi.queueCharacterSave('c1', { name: 'FRANK NOMADA' });
    vi.advanceTimersByTime(600);
    refuseOldestSave('ROLE_TWICE');

    expect(useCharacterStore.getState().saveErrors['c1']).toBe('ROLE_TWICE');
    expect(socketApi.characterSaveErrorText('ROLE_TWICE')).toContain('już jest na karcie');
    // Kod, którego nie zna żadna tabela, wraca jako zdanie z kodem — nigdy pusto.
    expect(socketApi.characterSaveErrorText('WHATEVER')).toContain('WHATEVER');
  });

  it('udany zapis po odmowie zdejmuje powód', () => {
    socketApi.queueCharacterSave('c1', { name: 'FRANK NOMADA' });
    vi.advanceTimersByTime(600);
    refuseOldestSave('ROLE_TWICE');

    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A']).gear } });
    vi.advanceTimersByTime(600);
    ackOldestSave(['A']);

    expect(useCharacterStore.getState().saveErrors['c1']).toBeUndefined();
    expect(useCharacterStore.getState().saveStates['c1']).toBe('saved');
  });

  it('nie cofa niczego, dopóki inny zapis jest w locie', () => {
    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A']).gear } });
    vi.advanceTimersByTime(600);
    // Druga zmiana wchodzi, zanim serwer odpowiedział na pierwszą.
    socketApi.queueCharacterSave('c1', { data: { gear: withGear(['A', 'B']).gear } });

    refuseOldestSave('INVALID_DATA');
    // Cofnięcie teraz zgasiłoby łatę, która dopiero czeka na wysłanie — prawdę
    // rozstrzygnie ack drugiego zapisu, dokładnie jak przy adopcji widoku.
    expect(gearNames()).toEqual(['A', 'B']);

    vi.advanceTimersByTime(600);
    ackOldestSave(['A', 'B']);
    expect(gearNames()).toEqual(['A', 'B']);
  });
});
