import { describe, expect, it } from 'vitest';
import {
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_LIMITS,
  formatUploadSize,
  localUploadRejection,
  uploadRejectionText,
  uploadRequirementText,
} from './uploads.js';

describe('wymagania wgrywanego obrazu', () => {
  it('mówi format, rozdzielczość i wagę w jednym zdaniu', () => {
    expect(uploadRequirementText('handout')).toBe(
      'PNG, JPG lub WebP, maks. 4096 px na bok, do 12 MB',
    );
  });

  it('każda odmowa niesie pełne wymaganie, nie samą przyczynę', () => {
    for (const code of ['NO_FILE', 'FILE_TOO_LARGE', 'UNSUPPORTED_IMAGE', 'IMAGE_TOO_LARGE']) {
      const text = uploadRejectionText(code, 'portrait');
      expect(text).toContain('PNG, JPG lub WebP');
      expect(text).toContain('2048 px dłuższego boku');
      expect(text).toContain('10 MB');
      expect(text).toContain('20 mln pikseli');
    }
  });

  it('nieznany kod nie zostawia człowieka bez wskazówki', () => {
    expect(uploadRejectionText(undefined, 'map')).toContain('16384 px na bok');
  });

  it('brak kampanii to jedyna odmowa, która nie jest o pliku', () => {
    expect(uploadRejectionText('NO_CAMPAIGN', 'token')).toBe('Brak aktywnej kampanii.');
  });

  it('zaokrągla wagę bez zbędnych zer i po polsku', () => {
    expect(formatUploadSize(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatUploadSize(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});

describe('sprawdzenie pliku przed wysłaniem', () => {
  it('przepuszcza obraz w dobrym formacie i rozmiarze', () => {
    expect(localUploadRejection({ type: 'image/png', size: 1024 }, 'portrait')).toBeNull();
  });

  it('odrzuca format spoza listy, zanim ruszy wysyłka', () => {
    expect(localUploadRejection({ type: 'image/gif', size: 1024 }, 'handout')).toContain(
      'Nieobsługiwany format',
    );
  });

  it('odrzuca plik ponad limit rodzaju, nie ponad limit największego', () => {
    const tenMb = 10 * 1024 * 1024;
    expect(localUploadRejection({ type: 'image/png', size: tenMb }, 'portrait')).toBeNull();
    expect(localUploadRejection({ type: 'image/png', size: tenMb + 1 }, 'portrait')).toContain(
      'za duży',
    );
    expect(localUploadRejection({ type: 'image/png', size: tenMb }, 'handout')).toBeNull();
  });

  it('nie zgaduje za przeglądarkę, gdy ta nie podała typu', () => {
    expect(localUploadRejection({ type: '', size: 1024 }, 'map')).toBeNull();
  });

  it('brak pliku to też odmowa, nie cisza', () => {
    expect(localUploadRejection(null, 'token')).toContain('Nie wybrano pliku');
  });

  it('atrybut accept wymienia dokładnie przyjmowane typy', () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toBe('image/png,image/jpeg,image/webp');
  });

  it('mapa ma najwyższy limit ze wszystkich rodzajów', () => {
    const others = (['token', 'portrait', 'handout'] as const).map(
      (k) => UPLOAD_LIMITS[k].maxBytes,
    );
    expect(Math.max(...others)).toBeLessThanOrEqual(UPLOAD_LIMITS.map.maxBytes);
  });
});
