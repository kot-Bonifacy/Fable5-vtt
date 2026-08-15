import { describe, expect, it } from 'vitest';
import {
  NET_DEVICE_MESSAGES,
  describeNetDefense,
  isNetDeviceOperation,
  netApplyDeviceState,
  netControlDv,
  netDeviceLine,
  netDeviceNeedsToken,
  netDeviceNeedsWall,
  netDeviceOperations,
  netDeviceStateAfter,
  netDeviceStateOf,
  netDeviceView,
  netMarkNodeUse,
  netNodeIsFree,
  readNetDeviceStates,
  readNetNodeUses,
} from './netdevices.js';
import type { CpredNetDevice } from './netrunning.js';
import {
  isNetDefenseSystem,
  netArchitectureAdvice,
  readNetDevices,
  validateNetArchitecture,
} from './netrunning.js';

/**
 * Węzły kontrolne i urządzenia (etap 26d) — czysta logika.
 *
 * Testowane jest to, co rozstrzyga zdanie z podręcznika, a nie to, co rysuje
 * okno: które przyciski dostaje która rzecz, że „raz na Turę" liczy się przy
 * węźle, a nie przy urządzeniu, i że PT odebrania węzła bierze wyższą z dwóch
 * liczb.
 */

const camera: CpredNetDevice = { id: 'd1', name: 'Kamera nad barem', deviceKind: 'camera' };
const turret: CpredNetDevice = {
  id: 'd2',
  name: 'Wieżyczka',
  deviceKind: 'turret',
  tokenId: 'tok-1',
};

describe('urządzenia węzła kontrolnego', () => {
  it('daje każdemu rodzajowi urządzenia jego własny zestaw przycisków', () => {
    // „Można je tylko włączyć lub wyłączyć" (s. 215) — środowiskowe nie strzelają.
    expect(netDeviceOperations('environment')).toEqual(['on', 'off']);
    expect(netDeviceOperations('camera')).toContain('turn');
    expect(netDeviceOperations('turret')).toContain('fire');
    expect(netDeviceOperations('door')).toEqual(['open', 'close']);
    expect(netDeviceOperations('camera')).not.toContain('fire');
  });

  it('wie, która obsługa potrzebuje figury, a która drzwi', () => {
    expect(netDeviceNeedsToken('fire')).toBe(true);
    expect(netDeviceNeedsToken('turn')).toBe(false);
    expect(netDeviceNeedsWall('open')).toBe(true);
    expect(netDeviceNeedsWall('close')).toBe(true);
    expect(netDeviceNeedsWall('on')).toBe(false);
  });

  it('odrzuca operację, której nie zna', () => {
    expect(isNetDeviceOperation('fire')).toBe(true);
    expect(isNetDeviceOperation('detonate')).toBe(false);
    expect(isNetDeviceOperation(7)).toBe(false);
  });

  it('startuje z urządzeniem włączonym i pamięta, co z nim zrobiono', () => {
    const fresh = netDeviceStateOf(undefined, 'd1');
    expect(fresh).toEqual({ deviceId: 'd1', on: true });

    const turned = netDeviceStateAfter(fresh, 'turn');
    expect(turned).toEqual({ deviceId: 'd1', on: true, turned: true });
    // „Obróć" jest przełącznikiem: ta sama Akcja Sieciowa wraca kamerę na miejsce.
    expect(netDeviceStateAfter(turned!, 'turn')?.turned).toBe(false);

    const off = netDeviceStateAfter(turned!, 'off');
    expect(off).toEqual({ deviceId: 'd1', on: false, turned: true });
    expect(netDeviceStateAfter(off!, 'on')?.on).toBe(true);
  });

  it('nie zmienia stanu urządzenia przy strzale ani przy drzwiach', () => {
    // Strzał zjada amunicję na żetonie, drzwi piszą do ściany z 18d — samo
    // urządzenie zostaje takie, jakie było.
    expect(netDeviceStateAfter({ deviceId: 'd2', on: true }, 'fire')).toBeNull();
    expect(netDeviceStateAfter({ deviceId: 'd3', on: true }, 'open')).toBeNull();
  });

  it('podmienia stan w miejscu zamiast dokładać drugi wpis', () => {
    let states = netApplyDeviceState(undefined, { deviceId: 'd1', on: false });
    states = netApplyDeviceState(states, { deviceId: 'd2', on: true });
    states = netApplyDeviceState(states, { deviceId: 'd1', on: true, turned: true });
    expect(states).toHaveLength(2);
    expect(netDeviceStateOf(states, 'd1')).toEqual({ deviceId: 'd1', on: true, turned: true });
  });

  it('czyta zapisany stan i nie wywraca się na śmieciach', () => {
    expect(readNetDeviceStates('nie tablica')).toEqual([]);
    expect(readNetDeviceStates([{ deviceId: 'd1' }, { on: false }, 42])).toEqual([
      { deviceId: 'd1', on: true },
    ]);
    expect(readNetDeviceStates([{ deviceId: 'd1', on: false, turned: true }])).toEqual([
      { deviceId: 'd1', on: false, turned: true },
    ]);
  });
});

describe('raz na Turę — przy węźle, nie przy urządzeniu', () => {
  it('poza walką nie ma czego wydawać', () => {
    // Rundy istnieją wyłącznie w trybie turowym; to samo czytanie, co przy
    // Ślizgu i zegarze Superkleju z 26c.
    const used = netMarkNodeUse([], 'f3', null);
    expect(used).toEqual([]);
    expect(netNodeIsFree(used, 'f3', null)).toBe(true);
  });

  it('zamyka węzeł na resztę Rundy i otwiera go w następnej', () => {
    const used = netMarkNodeUse([], 'f3', 2);
    expect(netNodeIsFree(used, 'f3', 2)).toBe(false);
    expect(netNodeIsFree(used, 'f3', 3)).toBe(true);
  });

  it('nie zamyka drugiego węzła — limit jest per węzeł', () => {
    const used = netMarkNodeUse([], 'f3', 2);
    expect(netNodeIsFree(used, 'f7', 2)).toBe(true);
  });

  it('zamiata wpisy ze starych Rund', () => {
    const used = netMarkNodeUse(netMarkNodeUse([], 'f3', 1), 'f7', 4);
    expect(used).toEqual([{ floorId: 'f7', round: 4 }]);
  });

  it('czyta zapisany rejestr i pomija połamane wiersze', () => {
    expect(readNetNodeUses([{ floorId: 'f3', round: 2 }, { floorId: 'f3' }, null])).toEqual([
      { floorId: 'f3', round: 2 },
    ]);
  });
});

describe('odebranie węzła', () => {
  it('bierze wyższą z dwóch liczb — zamek nie mięknie od kiepskiego złodzieja', () => {
    // „PT odebrania kontroli … równe wartości Testu Kontroli" (s. 199), ale
    // węzeł o PT 15 przejęty wynikiem 12 dalej jest węzłem o PT 15.
    expect(netControlDv(15, 12)).toBe(15);
    expect(netControlDv(10, 18)).toBe(18);
    expect(netControlDv(10, undefined)).toBe(10);
    expect(netControlDv(undefined, 18)).toBe(18);
    expect(netControlDv(undefined, undefined)).toBeNull();
  });
});

describe('widok urządzenia i zdania po polsku', () => {
  it('wypuszcza notatkę MG wyłącznie do MG', () => {
    const withNote: CpredNetDevice = { ...camera, notes: 'Nagrywa na serwer w piwnicy' };
    expect(netDeviceView(withNote, { deviceId: 'd1', on: true }, { gm: true }).notes).toBe(
      'Nagrywa na serwer w piwnicy',
    );
    expect(netDeviceView(withNote, { deviceId: 'd1', on: true }, { gm: false }).notes).toBe(
      undefined,
    );
  });

  it('niesie wiązanie z figurą, żeby okno wiedziało, czy jest czym strzelić', () => {
    const view = netDeviceView(turret, { deviceId: 'd2', on: true }, { gm: false });
    expect(view.tokenId).toBe('tok-1');
    expect(view.operations).toContain('fire');
  });

  it('mówi wprost, co się stało z kamerą', () => {
    expect(netDeviceLine(camera, 'turn', { deviceId: 'd1', on: true, turned: true })).toContain(
      'nie patrzy',
    );
    expect(netDeviceLine(camera, 'turn', { deviceId: 'd1', on: true })).toContain('z powrotem');
    expect(netDeviceLine(camera, 'off', { deviceId: 'd1', on: false })).toContain('wyłączona');
  });

  it('składa jedną linię z liczb wpisu systemu obronnego', () => {
    expect(describeNetDefense({ combatValue: 14, hp: 25, disableDv: 17, disableMinutes: 5 })).toBe(
      'Wartość bojowa 14 · 25 PW · PT 17 Elektronika i zabezpieczenia · 5 min',
    );
    expect(describeNetDefense({ hp: 5, spotDv: 17 })).toBe('5 PW · Percepcja PT 17, by zauważyć');
    expect(describeNetDefense({})).toBe('');
  });

  it('ma polskie zdanie za każdą odmową', () => {
    for (const message of Object.values(NET_DEVICE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
    }
  });
});

describe('urządzenia w danych Architektury', () => {
  it('czyta listę urządzeń i wyrzuca wiersze bez nazwy albo bez rodzaju', () => {
    const devices = readNetDevices([
      { id: 'a', name: 'Kamera', deviceKind: 'camera' },
      { id: 'b', name: '', deviceKind: 'turret' },
      { id: 'c', name: 'Coś', deviceKind: 'gramofon' },
      { id: 'd', name: 'Drzwi', deviceKind: 'door', wallId: 12 },
    ]);
    expect(devices.map((device) => device.id)).toEqual(['a', 'd']);
    expect(devices[1]!.wallId).toBe(12);
  });

  it('trzyma urządzenia wyłącznie przy węźle kontrolnym', () => {
    const parsed = validateNetArchitecture({
      name: 'Sieć klubu',
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: [
            {
              id: 'f0',
              kind: 'controlNode',
              label: 'Kamery',
              dv: 10,
              devices: [{ id: 'd1', name: 'Kamera', deviceKind: 'camera' }],
            },
            {
              id: 'f1',
              kind: 'file',
              label: 'Plik',
              dv: 9,
              devices: [{ id: 'd2', name: 'Kamera', deviceKind: 'camera' }],
            },
          ],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const floors = parsed.architecture.branches[0]!.floors;
    expect(floors[0]!.devices).toHaveLength(1);
    expect(floors[1]!.devices).toBeUndefined();
  });

  it('podpowiada MG węzeł bez urządzeń i wieżyczkę bez figury', () => {
    const advice = netArchitectureAdvice({
      id: 'net.test',
      name: 'Sieć',
      difficulty: 'standard',
      branches: [
        {
          id: 'trunk',
          parentFloor: null,
          floors: [
            { id: 'f0', kind: 'controlNode', label: 'Pusty węzeł', dv: 10 },
            {
              id: 'f1',
              kind: 'controlNode',
              label: 'Wieżyczka',
              dv: 10,
              devices: [{ id: 'd1', name: 'Grzechot', deviceKind: 'turret' }],
            },
          ],
        },
      ],
    });
    expect(advice.some((line) => line.includes('bez urządzeń'))).toBe(true);
    expect(advice.some((line) => line.includes('nie ma żetonu'))).toBe(true);
  });

  it('oddziela Demona od trzech tabel systemów obronnych', () => {
    expect(isNetDefenseSystem('demon')).toBe(false);
    expect(isNetDefenseSystem('drone')).toBe(true);
    expect(isNetDefenseSystem('emplacement')).toBe(true);
    expect(isNetDefenseSystem('environment')).toBe(true);
  });
});
