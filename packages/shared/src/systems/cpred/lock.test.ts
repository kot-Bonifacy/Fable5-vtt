import { describe, expect, it } from 'vitest';
import {
  CPRED_LOCK_DV_DEFAULT,
  CPRED_LOCK_TRIED_MAX,
  cpredLockOpening,
  cpredLockTried,
  createCpredLock,
  readCpredLock,
} from './lock.js';

const KEY = 'klucz-drzwi-01';
const IVA = 'karta-iva';

describe('readCpredLock — zamek z zapisu', () => {
  it('brak zapisu to zamek domyślny (drzwi zaryglowane przed 58c)', () => {
    expect(readCpredLock(null)).toEqual(createCpredLock());
    expect(readCpredLock(undefined)).toEqual(createCpredLock());
    expect(readCpredLock('rygiel')).toEqual(createCpredLock());
  });

  it('drobiazgi wracają do domyślnych, dobre pola zostają', () => {
    expect(
      readCpredLock({ dv: 999, skills: ['hacking'], keyId: 'x', tried: [1, IVA, IVA] }),
    ).toEqual({ dv: CPRED_LOCK_DV_DEFAULT, skills: ['pick-lock'], keyId: null, tried: [IVA] });
    expect(readCpredLock({ dv: 17, skills: ['electronics-security'], keyId: KEY })).toEqual({
      dv: 17,
      skills: ['electronics-security'],
      keyId: KEY,
      tried: [],
    });
  });
});

describe('cpredLockOpening — jedna reguła dla pojemnika i drzwi', () => {
  const lock = createCpredLock({
    dv: 15,
    skills: ['pick-lock', 'electronics-security'],
    keyId: KEY,
  });
  const opener = { characterId: IVA, isGm: false, hasKey: false };

  it('otwarte i zamknięte bez zamka nie pytają o nic', () => {
    expect(cpredLockOpening('open', lock, opener)).toEqual({ kind: 'already-open' });
    expect(cpredLockOpening('closed', lock, opener)).toEqual({ kind: 'open', via: 'click' });
  });

  it('na zamek: MG ręką, klucz bez Testu, inaczej Test z PT zamka', () => {
    expect(cpredLockOpening('locked', lock, { ...opener, isGm: true })).toEqual({
      kind: 'open',
      via: 'gm',
    });
    expect(cpredLockOpening('locked', lock, { ...opener, hasKey: true })).toEqual({
      kind: 'open',
      via: 'key',
    });
    expect(cpredLockOpening('locked', lock, opener)).toEqual({
      kind: 'test',
      skillId: 'pick-lock',
      dv: 15,
    });
    expect(
      cpredLockOpening('locked', lock, { ...opener, skillId: 'electronics-security' }),
    ).toEqual({ kind: 'test', skillId: 'electronics-security', dv: 15 });
  });

  it('Umiejętność spoza zamka i druga próba — odmowa; klucz działa po porażce', () => {
    const picked = createCpredLock({ skills: ['pick-lock'] });
    expect(
      cpredLockOpening('locked', picked, { ...opener, skillId: 'electronics-security' }),
    ).toEqual({ kind: 'refused', error: 'LOCK_SKILL' });
    const tried = cpredLockTried(lock, IVA);
    expect(cpredLockOpening('locked', tried, opener)).toEqual({
      kind: 'refused',
      error: 'LOCK_TRIED',
    });
    expect(cpredLockOpening('locked', tried, { ...opener, hasKey: true })).toEqual({
      kind: 'open',
      via: 'key',
    });
  });
});

describe('cpredLockTried — lista prób', () => {
  it('dopisuje raz i trzyma typ właściciela', () => {
    const once = cpredLockTried({ ...createCpredLock(), lock: 'locked' as const }, IVA);
    expect(once.tried).toEqual([IVA]);
    expect(once.lock).toBe('locked');
    expect(cpredLockTried(once, IVA)).toBe(once);
  });

  it('pamięta najwyżej ostatnie próby', () => {
    let lock = createCpredLock();
    for (let i = 0; i <= CPRED_LOCK_TRIED_MAX; i++) lock = cpredLockTried(lock, `karta-${i}`);
    expect(lock.tried).toHaveLength(CPRED_LOCK_TRIED_MAX);
    expect(lock.tried[0]).toBe('karta-1');
  });
});
