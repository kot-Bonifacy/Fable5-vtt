import type { SessionConfig } from '../config.js';

/**
 * Zegar slotów i biała lista zdarzeń między sesjami (etap 44c) — osobno od
 * `sessions.ts`, bo czyta je `registry.ts`, a `sessions.ts` sam z rejestru
 * korzysta.
 */

/**
 * Zdarzenia, które gracz może wysłać **między sesjami** (decyzje MG z 03.10
 * i 04.10). Wszystko inne dostaje `SESSION_NOT_RUNNING` w `registerEvents`,
 * zanim dotknie bazy. Biała lista, nie czarna: nowe zdarzenie stołu jest
 * zamknięte, dopóki ktoś świadomie go tu nie dopisze.
 *
 * Bez mapy, ruchu, rzutów stołu, walki, Sieci, botów i pisania na czacie.
 */
export const BETWEEN_SESSIONS_EVENTS: ReadonlySet<string> = new Set([
  // Odczyt: stan, historia czatu, dziennik, handouty, historie karty.
  'state:request',
  'chat:history',
  'journal:list',
  'handout:list',
  'character:xp-history',
  'economy:history',
  // Karta tam, gdzie gracz zmienia ją dziś bez MG.
  'character:update',
  'character:delete',
  'weapon:attachment',
  'portrait:crop',
  'portrait:want',
  'dice:skin',
  // Wydawanie PD (decyzja MG z 04.10).
  'character:advance',
  'character:role-change',
  // Sklep i przelewy (04.10).
  'economy:buy',
  'economy:transfer',
  // Przekazanie i handel między graczami tej kampanii (04.10).
  'inventory:sources',
  'inventory:give',
  'inventory:take',
  'inventory:respond',
  'trade:partners',
  'trade:list',
  'trade:invite',
  'trade:respond',
  'trade:offer',
  'trade:accept',
  'trade:cancel',
  // Kreator postaci z rzutami kreatora (04.10) — zgoda MG obowiązuje dalej.
  'creation:permit-state',
  'creation:request',
  'creation:accept-rules',
  'creation:start',
  'creation:patch',
  'creation:roll',
  'creation:buy',
  'creation:finish',
  'creation:lifepath-roll',
  'creation:lifepath-count',
  'creation:discard',
]);

/**
 * Zdarzenia, które nie są „grą” dla zegara bezczynności: odczyty i resync.
 * Klient pyta o nie sam (po zmianie zakładki, po luce `seq`), więc stół,
 * przy którym nikt nic nie robi, nie może się nimi utrzymywać przy życiu.
 */
function isPassiveEvent(name: string): boolean {
  return (
    name === 'state:request' ||
    name.endsWith(':list') ||
    name.endsWith(':history') ||
    name.endsWith(':status') ||
    name === 'trade:partners' ||
    name === 'inventory:sources' ||
    name === 'creation:permit-state'
  );
}

interface Clocks {
  lastEventAt: number;
  /** Od kiedy przy stole nie ma żadnego gniazda; null — ktoś jest. */
  emptySince: number | null;
}

/**
 * Liczniki trwających sesji (w pamięci procesu). `now` wstrzykiwane — testy
 * przesuwają zegar i wołają `sweep` same, zamiast czekać kwadrans.
 */
export class SessionClock {
  private readonly clocks = new Map<string, Clocks>();

  constructor(
    readonly config: SessionConfig | undefined,
    readonly now: () => number = Date.now,
  ) {}

  /** Nowa sesja albo sesja zastana po restarcie — oba liczniki od teraz. */
  track(campaignId: string): void {
    const now = this.now();
    this.clocks.set(campaignId, { lastEventAt: now, emptySince: now });
  }

  forget(campaignId: string): void {
    this.clocks.delete(campaignId);
  }

  /** Zdarzenie gry przy stole tej kampanii (`registerEvents`, po udanym handlerze). */
  touch(campaignId: string, eventName: string): void {
    if (isPassiveEvent(eventName)) return;
    const clocks = this.clocks.get(campaignId);
    if (clocks) clocks.lastEventAt = this.now();
  }

  tracked(): string[] {
    return [...this.clocks.keys()];
  }

  /**
   * Czy sesja jest już porzucona: `empty` przed `idle`, bo pusty stół jest
   * mocniejszym powodem. `sockets` — ile gniazd siedzi teraz przy stole.
   */
  verdict(campaignId: string, sockets: number): 'empty' | 'idle' | null {
    const clocks = this.clocks.get(campaignId);
    if (!clocks || !this.config) return null;
    const now = this.now();
    if (sockets > 0) clocks.emptySince = null;
    else clocks.emptySince ??= now;
    const minutes = (since: number) => (now - since) / 60_000;
    if (clocks.emptySince !== null && minutes(clocks.emptySince) >= this.config.emptyMinutes) {
      return 'empty';
    }
    if (minutes(clocks.lastEventAt) >= this.config.idleMinutes) return 'idle';
    return null;
  }
}
