/**
 * Limity tempa (01.10, #12 i #13) — czyste klasy z zegarem podawanym z zewnątrz,
 * żeby testy nie musiały czekać.
 */

/** Wiadro żetonów: `burst` na start, `perSecond` dolewane w czasie. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    now: number,
  ) {
    this.tokens = burst;
    this.updatedAt = now;
  }

  /** Bierze jeden żeton; false = wiadro puste. */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export interface BucketShape {
  perSecond: number;
  burst: number;
}

/**
 * Progi gniazda (decyzja MG z 01.10). Klient sam wysyła ruch figury i miarkę po
 * 20/s, więc zdarzenia bez potwierdzenia mają 40/s; nadmiar przepada po cichu
 * — to klatki ręki w ruchu, następna i tak przyjdzie. Reszta (czat, rzuty,
 * zapisy) 20/s z zapasem 60 na wejście do gry i serie kliknięć; nadmiar dostaje
 * odmowę `RATE_LIMITED`. Przy zalewie z T2 (500 wiadomości jednego gracza)
 * zapisuje się ~60, a stół reszty nie czeka.
 */
export const SOCKET_RATE_LIMITS: { acked: BucketShape; fireAndForget: BucketShape } = {
  acked: { perSecond: 20, burst: 60 },
  fireAndForget: { perSecond: 40, burst: 40 },
};

/** Limit zdarzeń gniazda per konto — wszystkie gniazda jednego konta razem. */
export class SocketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly limits = SOCKET_RATE_LIMITS) {}

  allow(userId: string, kind: 'acked' | 'fireAndForget', now = Date.now()): boolean {
    const key = `${kind}:${userId}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const shape = this.limits[kind];
      bucket = new TokenBucket(shape.perSecond, shape.burst, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }
}

/** 10 złych prób z jednego adresu w ciągu 15 minut (decyzja MG z 01.10). */
export const LOGIN_FAILURES_MAX = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;

/**
 * Rejestracje kont MG z jednego adresu (etap 44a): 5 na godzinę. Ta sama klasa
 * co złe hasła — okno przesuwne — tylko `fail` znaczy tu „założono konto”.
 */
export const REGISTRATIONS_MAX = 5;
export const REGISTRATION_WINDOW_MS = 60 * 60_000;

/**
 * Złe hasła MG i złe zaproszenia per adres IP (#12).
 *
 * Okno przesuwne: liczą się porażki z ostatnich 15 minut. Po dziesiątej adres
 * dostaje 429 z `Retry-After` **także na dobre hasło** — inaczej limit byłby
 * pozorny, bo zgadujący i tak dowiedziałby się o trafieniu. Inne adresy
 * i otwarte sesje MG działają dalej (blokada konta byłaby DoS-em na MG).
 * Udane wejście zeruje licznik adresu.
 */
export class LoginAttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max = LOGIN_FAILURES_MAX,
    private readonly windowMs = LOGIN_FAILURE_WINDOW_MS,
  ) {}

  /** Sekundy do odblokowania adresu albo null, gdy może próbować. */
  retryAfter(key: string, now = Date.now()): number | null {
    const recent = this.recent(key, now);
    if (recent.length < this.max) return null;
    const oldest = recent[recent.length - this.max]!;
    return Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }

  fail(key: string, now = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.failures.set(key, recent);
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (list.length === 0) this.failures.delete(key);
    else this.failures.set(key, list);
    return list;
  }
}
