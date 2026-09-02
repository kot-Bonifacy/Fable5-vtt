import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultCharacterData,
  type CompendiumEntry,
  type CpredCharacterData,
  type CpredSkillDefinition,
  type SceneView,
  type TokenView,
  type WeaponTypeDefinition,
} from '@vtt/shared';
import { intentFromTargeting, planAttackPreview } from './attack-targeting.js';
import type { AttackTargeting } from './stores/attackStore.js';
import { useCharacterStore } from './stores/characterStore.js';
import { useCompendiumStore } from './stores/compendiumStore.js';
import { useCoverStore } from './stores/coverStore.js';
import { useSceneStore } from './stores/sceneStore.js';
import { useTokenStore } from './stores/tokenStore.js';

/**
 * Dymek celowania a nabój w komorze (błąd #4 z sesji testów walki 08.08).
 *
 * Z załadowaną amunicją śrutową dymek nad celem wypisywał przedział i PT
 * **z tabeli kul** („Przedział 7–12 m · PT 15"), klik ładował kubek, a dopiero
 * rzut wracał odmową „Cel jest poza zasięgiem tej broni". Przyczyna: klient
 * budował podgląd bez profilu naboju, choć planer przyjmuje go od etapu 16g
 * i serwer mu go podaje.
 *
 * Test chodzi po prawdziwym `planAttackPreview` z podstawionymi sklepami —
 * bo naprawiona umowa mieszka dokładnie na styku sklepu kompendium i planera.
 */

const SAMPLE = resolve(import.meta.dirname, '../../../data/public/cpred/compendium/sample.json');
const SKILLS = resolve(import.meta.dirname, '../../../data/public/cpred/skills.json');
const SCENE: SceneView = {
  id: 'scene-1',
  name: 'Strzelnica',
  active: true,
  background: null,
  width: 4000,
  height: 3000,
  gridMode: 'grid',
  grid: { sizePx: 100, offsetX: 0, offsetY: 0, color: '#ffffff', alpha: 0.2, visible: true },
  // Kratka 100 px = 2 m, czyli skala Poligonu.
  metersPerSquare: 2,
  visibility: 'open',
  dark: false,
  darkSightM: 2,
  explore: false,
};

function token(id: string, x: number): TokenView {
  return {
    id,
    sceneId: SCENE.id,
    name: id,
    imageUrl: null,
    x,
    y: 1000,
    size: 1,
    ownerId: null,
    hidden: false,
    statuses: [],
  };
}

/** Karta z jedną strzelbą — magazynek pełny, żeby nic innego nie odmówiło. */
function shooterSheet(ammoId: string | undefined): CpredCharacterData {
  const base = createDefaultCharacterData();
  return {
    ...base,
    stats: { ...base.stats, ref: 8, dex: 6 },
    skills: { ...base.skills, 'shoulder-arms': 6 },
    weapons: [
      {
        id: 'w-shotgun',
        name: 'Huk 12',
        notes: '',
        compendiumId: 'weapon.huk-12',
        damage: '5k6',
        ammoCurrent: 4,
        ammoMax: 4,
        ammoType: '',
        rof: '1',
        ...(ammoId ? { ammoId } : {}),
      },
    ],
  };
}

function loadShooter(ammoId: string | undefined): void {
  useCharacterStore.setState({
    characters: {
      'char-1': {
        id: 'char-1',
        name: 'Rico',
        ownerId: null,
        portraitUrl: null,
        data: shooterSheet(ammoId),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

/**
 * Karta z karabinem i strzelbą podwieszaną pod lufą (etap 31): jeden wiersz
 * ekwipunku, dwa sposoby zrobienia komuś krzywdy — i dwa osobne magazynki.
 */
function loadRifleWithUnderbarrel(): void {
  const base = createDefaultCharacterData();
  useCharacterStore.setState({
    characters: {
      'char-1': {
        id: 'char-1',
        name: 'Rico',
        ownerId: null,
        portraitUrl: null,
        data: {
          ...base,
          stats: { ...base.stats, ref: 8, dex: 6 },
          skills: { ...base.skills, 'shoulder-arms': 6 },
          weapons: [
            {
              id: 'w-rifle',
              name: 'Grzechotnik',
              notes: '',
              compendiumId: 'weapon.grzechotnik',
              damage: '5k6',
              ammoCurrent: 25,
              ammoMax: 25,
              ammoType: '',
              rof: '1',
              attachmentIds: ['attachment.sample-underbarrel'],
              attachmentAmmo: { 'attachment.sample-underbarrel': 2 },
            },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

beforeAll(() => {
  const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as {
    entries: CompendiumEntry[];
    weaponTypes: WeaponTypeDefinition[];
  };
  const entries: Record<string, CompendiumEntry> = {};
  for (const entry of sample.entries) entries[entry.id] = entry;
  const weaponTypeById: Record<string, WeaponTypeDefinition> = {};
  for (const type of sample.weaponTypes) weaponTypeById[type.id] = type;
  useCompendiumStore.setState({ entries, order: Object.keys(entries), weaponTypeById });

  // Rejestr umiejętności — bez niego planer nie wie, czym się strzela, i każdy
  // podgląd kończy się odmową jeszcze przed pytaniem o zasięg.
  const skills = (JSON.parse(readFileSync(SKILLS, 'utf8')) as { skills: CpredSkillDefinition[] })
    .skills;
  useCharacterStore.setState({
    registry: {
      skills,
      skillIds: new Set(skills.map((skill) => skill.id)),
      roles: [],
      roleIds: new Set(),
      creation: null,
      lifepath: null,
      netrunning: null,
    },
  });

  useSceneStore.setState({ scene: SCENE, effectiveScene: SCENE });
  useCoverStore.setState({ covers: [] });
  // Strzelec i cel dziesięć metrów od siebie — poza stożkiem śrutu (6 m),
  // a wewnątrz drugiego przedziału tabeli kul.
  useTokenStore.setState({
    tokens: { shooter: token('shooter', 1000), target: token('target', 1000 + 10 * 50) },
  });
});

const intent = { characterId: 'char-1', attackerTokenId: 'shooter', weaponRowId: 'w-shotgun' };

describe('dymek celowania czyta nabój z komory (błąd #4)', () => {
  it('bez naboju wycenia strzał z tabeli przedziałów', () => {
    loadShooter(undefined);
    const preview = planAttackPreview({ ...intent, mode: 'single' }, 'target');
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.metres).toBe(10);
    expect(preview.attack.dvSource).toBe('range');
    expect(preview.attack.rangeLabel).toBeTruthy();
  });

  it('ze śrutem w komorze odmawia strzału za stożek zamiast wyceniać go z tabeli kul', () => {
    loadShooter('ammo.sample-shot');
    const preview = planAttackPreview({ ...intent, mode: 'single' }, 'target');
    // To jest cała treść poprawki: do 22.08 dymek pokazywał tu „Przedział
    // 7–12 m · PT 15", a odmowa przychodziła dopiero po rzucie.
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.message).toContain('zasięg');
  });

  it('ze śrutem w zasięgu stożka podaje stałe PT, nie przedział', () => {
    loadShooter('ammo.sample-shot');
    useTokenStore.setState({
      tokens: { shooter: token('shooter', 1000), target: token('target', 1000 + 4 * 50) },
    });
    const preview = planAttackPreview({ ...intent, mode: 'single' }, 'target');
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.attack.dvSource).toBe('spread');
    expect(preview.attack.dv).toBe(13);
    expect(preview.attack.coneRangeM).toBe(6);
    // Przedział, który dymek wypisze, jest teraz zasięgiem **stożka**, a nie
    // wierszem tabeli kul — przy czterech metrach obie etykiety brzmią tak samo
    // („0–6 m"), więc rozstrzyga o tym `dvSource` i `coneRangeM` wyżej.
    expect(preview.attack.rangeLabel?.replace(/\s/g, ' ')).toBe('0–6 m');
  });
});

describe('katalog naboi jest czytany ze sklepu kompendium', () => {
  it('nie zna naboju, którego nie ma w kampanii', () => {
    loadShooter('ammo.nie-ma-takiego');
    useTokenStore.setState({
      tokens: { shooter: token('shooter', 1000), target: token('target', 1000 + 4 * 50) },
    });
    const preview = planAttackPreview({ ...intent, mode: 'single' }, 'target');
    // Nieznany nabój nie jest wymówką, żeby przestać celować — strzał wraca do
    // tabeli broni, dokładnie jak na serwerze.
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.attack.dvSource).toBe('range');
  });
});

/**
 * Dymek celowania a broń podwieszana (zaległość z oględzin etapu 31, 01.09).
 *
 * Z uzbrojonym bagnetem chmurka nad celem mówiła nazwę **wiersza karty**
 * („Militech Dragon"), choć baner nad mapą i karta ataku mówiły „Bagnet".
 * Przyczyna nie była w planerze — ten obsługuje `attachmentId` od 31 — tylko
 * w tym, że `TargetTooltip` budował intencję **własną kopią** kodu z
 * `loadAttackAtToken` i przy okazji gubił to pole. Test pilnuje więc jednego
 * budowniczego intencji, nie dwóch.
 */
describe('dymek celowania nazywa broń podwieszaną, nie wiersz karty', () => {
  const targeting: AttackTargeting = {
    characterId: 'char-1',
    characterName: 'Rico',
    attackerTokenId: 'shooter',
    weaponRowId: 'w-rifle',
    weaponName: 'Grzechotnik · Strzelba podwieszana (próbka)',
    mode: 'single',
    modifier: 0,
    melee: false,
    attachmentId: 'attachment.sample-underbarrel',
    attachmentName: 'Strzelba podwieszana (próbka)',
  };

  beforeEach(() => {
    loadRifleWithUnderbarrel();
    useTokenStore.setState({
      tokens: { shooter: token('shooter', 1000), target: token('target', 1000 + 10 * 50) },
    });
  });

  it('przenosi `attachmentId` z uzbrojonego celownika do intencji', () => {
    const built = intentFromTargeting(targeting, useTokenStore.getState().tokens);
    expect(built?.attachmentId).toBe('attachment.sample-underbarrel');
  });

  it('wycenia strzał z podwieszanej i podpisuje go jej nazwą', () => {
    const built = intentFromTargeting(targeting, useTokenStore.getState().tokens);
    expect(built).not.toBeNull();
    if (!built) return;
    const preview = planAttackPreview(built, 'target');
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.attack.weaponName).toBe('Strzelba podwieszana (próbka)');
    // Magazynek też jest jej własny — dwa naboje, nie dwadzieścia pięć karabinu.
    expect(preview.attack.ammoBefore).toBe(2);
  });

  it('bez `attachmentId` ta sama karta wycenia strzał z karabinu', () => {
    const { attachmentId: _drop, ...bare } = targeting;
    const built = intentFromTargeting(bare, useTokenStore.getState().tokens);
    expect(built).not.toBeNull();
    if (!built) return;
    const preview = planAttackPreview(built, 'target');
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.attack.weaponName).toBe('Grzechotnik');
  });

  it('nie zwraca intencji, gdy strzelec nie ma tokenu na scenie', () => {
    expect(intentFromTargeting(targeting, {})).toBeNull();
  });
});

/** Wspólny katalog testów: ścieżka pliku próbki musi istnieć. */
it('próbka kompendium leży tam, gdzie test jej szuka', () => {
  expect(() => readFileSync(join(SAMPLE), 'utf8')).not.toThrow();
});
