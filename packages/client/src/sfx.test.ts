import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_FX_SOUNDS } from '@vtt/shared';

/**
 * Strażnik warstwy dźwięku mapy (etap 27i, dołożony 28.08).
 *
 * Próbki dobrano po nazwach plików w paczkach CC0 i **wymienia się je ręcznie**:
 * MG odsłuchuje rządek przycisków w „⚙ Ustawienia" i podmienia to, co nie pasuje.
 * Ten test pilnuje trzech rzeczy, których żaden typ nie pilnuje:
 *
 *  - **każdy dźwięk ma przycisk odsłuchu** — bez wiersza w `SFX_SAMPLES` nikt nie
 *    usłyszy próbki, dopóki nie trafi na nią w walce;
 *  - **każdy plik z `SFX_FILES` leży w `public/sfx/`** — literówka w nazwie daje
 *    ciszę, a nie błąd;
 *  - **żaden plik nie został sierotą** — tak przez tydzień leżał `bowstring.ogg`
 *    po wymianie próbki cięciwy na `bowstring.wav`.
 */

const SRC = import.meta.dirname;
const read = (name: string) => readFileSync(join(SRC, name), 'utf8');

/** `bowstring: '/sfx/bowstring.wav',` oraz `'shot-pistol': '/sfx/…'`. */
function filesInSfxModule(): Map<string, string> {
  const body = read('sfx.ts').split('const SFX_GAIN')[0] ?? '';
  const found = new Map<string, string>();
  for (const match of body.matchAll(/^\s*'?([a-z-]+)'?:\s*'\/sfx\/([^']+)'/gm)) {
    found.set(match[1]!, match[2]!);
  }
  return found;
}

function auditionRowIds(): string[] {
  const source = read(join('components', 'SettingsWindow.tsx'));
  const list = source.split('const SFX_SAMPLES')[1]?.split('];')[0] ?? '';
  return [...list.matchAll(/id:\s*'([a-z-]+)'/g)].map((match) => match[1]!);
}

describe('próbki dźwiękowe mapy', () => {
  it('każdy dźwięk ma plik', () => {
    const files = filesInSfxModule();
    expect([...files.keys()].sort()).toEqual([...MAP_FX_SOUNDS].sort());
  });

  it('każdy dźwięk ma przycisk odsłuchu w ustawieniach', () => {
    expect(auditionRowIds().sort()).toEqual([...MAP_FX_SOUNDS].sort());
  });

  it('pliki z katalogu i pliki z kodu to ten sam zbiór', () => {
    const onDisk = readdirSync(join(SRC, '..', 'public', 'sfx')).filter(
      (name) => name.endsWith('.wav') || name.endsWith('.ogg'),
    );
    expect(onDisk.sort()).toEqual([...filesInSfxModule().values()].sort());
  });
});
