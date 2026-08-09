import { describe, expect, it } from 'vitest';
import {
  HANDOUT_BODY_MAX_LENGTH,
  HANDOUT_TITLE_MAX_LENGTH,
  handoutErrorText,
  normalizeRecipientIds,
  validateHandout,
} from './handouts.js';

const image = { url: '/uploads/handouts/abc123_-.png', width: 800, height: 600 };

describe('validateHandout', () => {
  it('przyjmuje handout z tytułem i treścią', () => {
    const result = validateHandout({
      title: '  Mapa Kabuki  ',
      body: '  **Uwaga**  ',
      image: null,
    });
    expect(result).toEqual({
      ok: true,
      handout: { title: 'Mapa Kabuki', body: '**Uwaga**', image: null },
    });
  });

  it('przyjmuje handout będący samą grafiką', () => {
    const result = validateHandout({ title: 'Zdjęcie z monitoringu', body: '', image });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.handout.image).toEqual(image);
  });

  it('odrzuca pustą kartkę — ani grafiki, ani treści', () => {
    const result = validateHandout({ title: 'Nic', body: '   ', image: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        field: 'body',
        message: 'Handout musi mieć treść albo grafikę.',
      });
    }
  });

  it('odrzuca handout bez tytułu', () => {
    const result = validateHandout({ title: '  ', body: 'treść', image: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe('title');
  });

  it('pilnuje limitów długości', () => {
    const longTitle = validateHandout({
      title: 'x'.repeat(HANDOUT_TITLE_MAX_LENGTH + 1),
      body: 'treść',
      image: null,
    });
    expect(longTitle.ok).toBe(false);

    const longBody = validateHandout({
      title: 'Tytuł',
      body: 'x'.repeat(HANDOUT_BODY_MAX_LENGTH + 1),
      image: null,
    });
    expect(longBody.ok).toBe(false);
  });

  it('odrzuca grafikę spoza katalogu handoutów', () => {
    // Adres grafiki wystawia serwer przy uploadzie; klient nie ma prawa wskazać
    // niczego innego — inaczej handout stałby się czytnikiem cudzych plików.
    for (const url of [
      '/uploads/maps/inna.png',
      '/uploads/handouts/../maps/inna.png',
      'https://evil.example/a.png',
      '/uploads/handouts/a.gif',
    ]) {
      const result = validateHandout({ title: 'T', body: '', image: { ...image, url } });
      expect(result.ok, url).toBe(false);
    }
  });

  it('odrzuca grafikę bez sensownych wymiarów', () => {
    const result = validateHandout({
      title: 'T',
      body: '',
      image: { ...image, width: 0, height: -3 },
    });
    expect(result.ok).toBe(false);
  });

  it('nie przewraca się na śmieciach zamiast obiektu', () => {
    expect(validateHandout(null).ok).toBe(false);
    expect(validateHandout('handout').ok).toBe(false);
    expect(validateHandout({ title: 5, body: [], image: 'grafika' }).ok).toBe(false);
  });
});

describe('normalizeRecipientIds', () => {
  it('zdejmuje duplikaty, puste i nie-teksty, zachowując kolejność', () => {
    expect(normalizeRecipientIds(['b', ' a ', 'b', '', 7, null, 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('ze śmieci robi pustą listę', () => {
    expect(normalizeRecipientIds(undefined)).toEqual([]);
    expect(normalizeRecipientIds('wszyscy')).toEqual([]);
  });
});

describe('handoutErrorText', () => {
  it('rozwija komunikat walidacji doklejony do kodu', () => {
    expect(handoutErrorText('INVALID_HANDOUT:Handout musi mieć tytuł.')).toBe(
      'Handout musi mieć tytuł.',
    );
  });

  it('tłumaczy kody odmowy na polski', () => {
    expect(handoutErrorText('HANDOUT_NOT_FOUND')).toBe('Tego handoutu już nie ma.');
    expect(handoutErrorText('CO_TO_JEST')).toBe('Nie udało się wykonać operacji na handoucie.');
  });
});
