import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_TOOLS } from './stores/mapToolStore.js';
import { SCENE_OBJECT_KINDS } from '@vtt/shared';

/**
 * Strażnik gramatyki edycji sceny (etap 27k).
 *
 * Etap nie dołożył funkcji — **zastąpił trzy gramatyki jedną**: warstwa → klik
 * w obiekt → `Delete`, `Ctrl+Z` cofa. Taką zmianę łatwo cofnąć przez pomyłkę,
 * bo każdy tryb-gumka wyglądał jak niewinna para przycisków. Ten plik pilnuje,
 * żeby nie wróciły i żeby siedem rodzajów obiektów miało po jednej drodze.
 *
 * Testy czytają pliki jako tekst — z tego samego powodu, co `map-click.test.ts`
 * i `shortcuts.test.ts`: `MapArea` i `MapRenderer` ciągną za sobą Pixi, gniazdo
 * i pół sklepu stanu, a sprawdzane są zdania o kształcie kodu.
 */

const MAP_AREA = readFileSync(join(import.meta.dirname, 'components', 'MapArea.tsx'), 'utf8');
const MAP_TOOLS_SRC = readFileSync(join(import.meta.dirname, 'components', 'MapTools.tsx'), 'utf8');
const RENDERER = readFileSync(join(import.meta.dirname, 'map', 'MapRenderer.ts'), 'utf8');

describe('edycja sceny: jedna gramatyka (etap 27k)', () => {
  it('nie ma już narzędzia „Gumka" ani trybów-gumek', () => {
    expect(MAP_TOOLS).not.toContain('erase');
    // Tryby wewnątrz narzędzi: osłona, strefa, lampa i gniazdo straciły całe
    // pary, ściana i strefa — samo `erase`.
    for (const mode of ['coverMode', 'zoneMode', 'lightMode', 'netPointMode']) {
      expect(MAP_TOOLS_SRC, `${mode} wrócił do paska`).not.toContain(mode);
    }
    expect(MAP_TOOLS_SRC).not.toContain("setWallMode('erase')");
  });

  it('renderer nie ma już wywołań gumek', () => {
    for (const gone of [
      'onWallErase',
      'onCoverErase',
      'onZoneErase',
      'onLightErase',
      'onAccessPointErase',
      'onDrawingErase',
      'onZoneOpen',
    ]) {
      expect(RENDERER, `${gone} wrócił do renderera`).not.toContain(gone);
      expect(MAP_AREA, `${gone} wrócił do MapArea`).not.toContain(gone);
    }
  });

  it('`Delete` i `Backspace` kasują zaznaczony obiekt, a nie figurę', () => {
    expect(MAP_AREA).toContain("event.key === 'Delete' || event.key === 'Backspace'");
    // Świadome odstępstwo od Foundry: żeton siedzi w środku walki, a jego id
    // noszą inicjatywa i runy Sieci. Kasowanie figur zostaje pod PPM.
    const start = MAP_AREA.indexOf("event.key === 'Delete'");
    const branch = MAP_AREA.slice(start, start + 900);
    expect(branch).toContain('useSceneSelectionStore');
    expect(branch).not.toContain('deleteToken');
  });

  it('`Ctrl+Z` idzie na serwer, a nie odtwarza obiektu u klienta', () => {
    expect(MAP_AREA).toContain('undoSceneDelete');
    // Klient odtwarzający obiekt własnym `create` dałby mu nowe id i zgubiłby
    // pola, których zdarzenia tworzące nie przyjmują (zamek ściany, PW osłony,
    // notatka gniazda) — patrz „Rozstrzygnięcie techniczne" w opisie etapu.
    const start = MAP_AREA.indexOf('undoSceneDelete');
    const branch = MAP_AREA.slice(start - 400, start + 400);
    expect(branch).not.toMatch(/create(Wall|Cover|Light)s?\(/);
  });

  it('każdy rodzaj obiektu ma dokładnie jedną drogę kasowania', () => {
    // `deleteSceneObject` jest tą drogą; test przewraca się, gdy ktoś dołoży
    // ósmy rodzaj do `shared` i zapomni o nim tutaj.
    const start = MAP_AREA.indexOf('async function deleteSceneObject');
    expect(start, 'nie znalazłem deleteSceneObject').toBeGreaterThan(0);
    const body = MAP_AREA.slice(start, MAP_AREA.indexOf('\n}\n', start));
    for (const kind of SCENE_OBJECT_KINDS) {
      expect(body, `brak gałęzi dla ${kind}`).toContain(`'${kind}'`);
    }
  });

  it('nic nie kasuje w ciszy — każda ścieżka ogląda ack', () => {
    // Trzy gumki (`deleteWall`, `deleteLight`, `removeNetAccessPoint`) szły bez
    // sprawdzenia `ack`, więc chybiony klik nie robił nic i nie tłumaczył
    // dlaczego. To był jeden z trzech błędów zamykanych w tym etapie.
    const start = MAP_AREA.indexOf('async function deleteSceneObject');
    const body = MAP_AREA.slice(start, MAP_AREA.indexOf('\n}\n', start));
    expect(body).toContain('if (ack.ok)');
    expect(body).toContain('sceneDeleteErrorText');
  });
});
