import { describe, expect, it } from 'vitest';
import {
  GM_PASSWORD_MIN_LENGTH,
  gmAccountErrorText,
  gmLoginError,
  gmPasswordError,
  normalizeGmLogin,
} from './auth.js';

describe('konta MG — login (44a)', () => {
  it('przyjmuje 3–32 znaki: litery, cyfry, „-”, „_”, „.”', () => {
    expect(gmLoginError('abc')).toBeNull();
    expect(gmLoginError('Bartek_K.2-x')).toBeNull();
    expect(gmLoginError('a'.repeat(32))).toBeNull();
  });

  it('odrzuca za krótki, za długi, spacje i polskie znaki', () => {
    expect(gmLoginError('ab')).toBe('LOGIN_INVALID');
    expect(gmLoginError('a'.repeat(33))).toBe('LOGIN_INVALID');
    expect(gmLoginError('ze spacja')).toBe('LOGIN_INVALID');
    expect(gmLoginError('łoś')).toBe('LOGIN_INVALID');
  });

  it('normalizuje do małych liter bez spacji z brzegów', () => {
    expect(normalizeGmLogin('  Bartek ')).toBe('bartek');
    expect(gmLoginError('  abc  ')).toBeNull();
  });
});

describe('konta MG — hasło (44a)', () => {
  it(`wymaga co najmniej ${GM_PASSWORD_MIN_LENGTH} znaków i dwa razy tego samego`, () => {
    expect(gmPasswordError('123456789', '123456789', null)).toBe('PASSWORD_TOO_SHORT');
    expect(gmPasswordError('1234567890', '1234567890', null)).toBeNull();
    expect(gmPasswordError('1234567890', '1234567891', null)).toBe('PASSWORD_MISMATCH');
    expect(gmPasswordError('x'.repeat(257), 'x'.repeat(257), null)).toBe('PASSWORD_TOO_LONG');
  });

  it('nie może być loginem, także w innej wielkości liter', () => {
    expect(gmPasswordError('Bartek1234', 'Bartek1234', 'bartek1234')).toBe(
      'PASSWORD_SAME_AS_LOGIN',
    );
    expect(gmPasswordError('Bartek1234', 'Bartek1234', 'bartek')).toBeNull();
  });

  it('każdy kod odmowy ma polskie zdanie', () => {
    for (const code of [
      'LOGIN_INVALID',
      'LOGIN_TAKEN',
      'PASSWORD_TOO_SHORT',
      'PASSWORD_TOO_LONG',
      'PASSWORD_SAME_AS_LOGIN',
      'PASSWORD_MISMATCH',
      'INVALID_CREDENTIALS',
      'WRONG_PASSWORD',
      'ACCOUNT_BLOCKED',
      'REGISTRATION_CLOSED',
      'TOO_MANY_REGISTRATIONS',
      'TOO_MANY_ATTEMPTS',
      'INVALID_RESET',
      'PASSWORD_FROM_ENV',
    ]) {
      expect(gmAccountErrorText(code), code).toMatch(/\S/);
    }
    expect(gmAccountErrorText('COS_INNEGO')).toBeNull();
  });
});
