import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CPRED_ITEM_ICONS } from '@vtt/shared';

/**
 * Miniatury na listach (24.09.2026): `shared` nazywa sylwetkę, klient ma plik.
 * Nazwa bez pliku rysowałaby na liście pusty kwadrat bez żadnego błędu.
 */
describe('miniatury przedmiotów', () => {
  const icons = resolve(import.meta.dirname, '../public/icons/hud');

  it('każda miniatura ma plik w public/icons/hud', () => {
    for (const icon of CPRED_ITEM_ICONS) {
      const file = join(icons, `${icon}.svg`);
      expect(existsSync(file), `brak miniatury „${icon}": ${file}`).toBe(true);
    }
  });
});
