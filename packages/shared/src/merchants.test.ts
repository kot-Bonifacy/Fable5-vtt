import { describe, expect, it } from 'vitest';
import {
  merchantClosedReason,
  pruneMerchantRows,
  readCatalogShopping,
  readMerchantRows,
  readMerchantSettingsPatch,
} from './merchants.js';

/** Etap 46a: ustawienia sklepu i nakładka MG na wiersze — tylko to, co da się zapisać. */

describe('nakładki wierszy', () => {
  it('śmieć w bazie nie wywraca półki', () => {
    expect(readMerchantRows('nie-json')).toEqual({});
    expect(readMerchantRows('[1,2]')).toEqual({});
    expect(
      readMerchantRows(
        JSON.stringify({
          'gear:a': { infinite: true, extra: 1 },
          'gear:b': { price: -5 },
          'gear:c': { hidden: true, price: 40 },
        }),
      ),
    ).toEqual({ 'gear:a': { infinite: true }, 'gear:c': { hidden: true, price: 40 } });
  });

  it('nakładki wierszy, których już nie ma, znikają', () => {
    expect(
      pruneMerchantRows(
        { 'gear:a': { hidden: true }, 'gear:b': { infinite: true } },
        new Set(['gear:b']),
      ),
    ).toEqual({ 'gear:b': { infinite: true } });
  });
});

describe('ustawienia z żądania MG', () => {
  it('przyjmuje poprawne pola i przycina szyld', () => {
    expect(
      readMerchantSettingsPatch({
        sign: '  Spod lady  ',
        open: true,
        priceMul: 120,
        buyBackPct: 0,
      }),
    ).toEqual({ sign: 'Spod lady', open: true, priceMul: 120, buyBackPct: 0 });
  });

  it('jedno złe pole odrzuca całość zamiast przycinać', () => {
    expect(readMerchantSettingsPatch({ priceMul: 0 })).toBeNull();
    expect(readMerchantSettingsPatch({ buyBackPct: 150 })).toBeNull();
    expect(readMerchantSettingsPatch({ access: 'everywhere' })).toBeNull();
    expect(readMerchantSettingsPatch({ open: 'tak' })).toBeNull();
    expect(readMerchantSettingsPatch(null)).toBeNull();
  });
});

describe('otwarty sklep', () => {
  it('przełącznik MG i handlarz na nogach', () => {
    expect(merchantClosedReason({ open: true }, 'wounded')).toBeNull();
    expect(merchantClosedReason({ open: false }, 'ok')).toBe('closed');
    expect(merchantClosedReason({ open: true }, 'down')).toBe('keeper');
  });
});

describe('zakupy z katalogu', () => {
  it('nieznana wartość to „wszędzie” — stara kampania nie traci sklepu', () => {
    expect(readCatalogShopping('merchants')).toBe('merchants');
    expect(readCatalogShopping(undefined)).toBe('everywhere');
    expect(readCatalogShopping('nigdzie')).toBe('everywhere');
  });
});
