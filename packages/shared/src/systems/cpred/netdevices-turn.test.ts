import { describe, expect, it } from 'vitest';
import {
  NET_DEVICE_FIGURE_PROFILES,
  NET_DEVICE_MESSAGES,
  netDeviceFigureProfile,
  netDeviceMoveSlot,
  netDeviceTurnOf,
  netDeviceUse,
  netDeviceVerbSlots,
  netOperatedCost,
  netOperatedMoveLeft,
  netOperatedRefusal,
  netOperatedState,
  readNetDeviceTurns,
  type CpredNetDeviceTurn,
  type CpredNetNodeUse,
} from './netdevices.js';
import { freshNetRun, readNetRunState } from './netrun.js';

/**
 * Przejęta figura (etap 70b): tabela czynności wg rodzaju i księga aktywacji —
 * „węzeł raz na Turę” (s. 199), ale jedna Akcja Sieciowa daje urządzeniu ruch
 * i jedną czynność (decyzja MG nr 1 z 11.11).
 */

interface Ledger {
  nodeUse: CpredNetNodeUse[];
  deviceTurns: CpredNetDeviceTurn[];
}

const EMPTY: Ledger = { nodeUse: [], deviceTurns: [] };

function use(
  ledger: Ledger,
  deviceId: string,
  kind: 'action' | 'move',
  extra: { floorId?: string; round?: number | null; moveM?: number; spendM?: number } = {},
) {
  return netDeviceUse(ledger, {
    floorId: extra.floorId ?? 'node-a',
    deviceId,
    round: extra.round === undefined ? 3 : extra.round,
    use: kind,
    ...(extra.moveM !== undefined ? { moveM: extra.moveM } : {}),
    ...(extra.spendM !== undefined ? { spendM: extra.spendM } : {}),
  });
}

function must(result: ReturnType<typeof netDeviceUse>): Ledger & { charge: boolean } {
  if (!result.ok) throw new Error(`odmowa: ${result.error}`);
  return result;
}

describe('czynności przejętej figury wg rodzaju', () => {
  it('kamera obraca się i gaśnie, wieżyczka strzela, dron także jeździ', () => {
    expect(netDeviceFigureProfile('camera')).toMatchObject({
      moves: false,
      verbs: ['turn', 'off'],
    });
    expect(netDeviceFigureProfile('turret')).toMatchObject({
      moves: false,
      verbs: ['fire', 'off'],
    });
    expect(netDeviceFigureProfile('drone')).toMatchObject({ moves: true, verbs: ['fire', 'off'] });
  });

  it('oczy (70c): kamera stożkiem 90°, wieżyczka i dron kołem, drzwi i instalacje wcale', () => {
    expect(netDeviceFigureProfile('camera').sight).toEqual({ coneDeg: 90 });
    expect(netDeviceFigureProfile('turret').sight).toEqual({ coneDeg: null });
    expect(netDeviceFigureProfile('drone').sight).toEqual({ coneDeg: null });
    expect(netDeviceFigureProfile('door').sight).toBeNull();
    expect(netDeviceFigureProfile('environment').sight).toBeNull();
  });

  it('drzwi i instalacje nie są figurami do prowadzenia', () => {
    expect(netDeviceFigureProfile('door').verbs).toEqual([]);
    expect(netDeviceFigureProfile('environment').verbs).toEqual([]);
  });

  it('tylko dron ma ruch', () => {
    const moving = Object.entries(NET_DEVICE_FIGURE_PROFILES)
      .filter(([, profile]) => profile.moves)
      .map(([kind]) => kind);
    expect(moving).toEqual(['drone']);
  });
});

describe('aktywacja urządzenia: Akcja Sieciowa = ruch i czynność', () => {
  it('pierwsza czynność aktywuje: kosztuje Akcję Sieciową i znaczy węzeł', () => {
    const first = must(use(EMPTY, 'turret', 'action'));
    expect(first.charge).toBe(true);
    expect(first.nodeUse).toEqual([{ floorId: 'node-a', round: 3 }]);
    expect(first.deviceTurns).toEqual([
      { floorId: 'node-a', deviceId: 'turret', round: 3, moveLeftM: 0, actionLeft: false },
    ]);
  });

  it('druga czynność tego samego urządzenia odmawia', () => {
    const first = must(use(EMPTY, 'turret', 'action'));
    expect(use(first, 'turret', 'action')).toEqual({ ok: false, error: 'NET_DEVICE_SPENT' });
  });

  it('inne urządzenie tego samego węzła w tej rundzie odmawia — węzeł raz na Turę', () => {
    const first = must(use(EMPTY, 'turret', 'action'));
    expect(use(first, 'camera', 'action')).toEqual({ ok: false, error: 'NET_NODE_USED' });
  });

  it('urządzenie innego trzymanego węzła to osobna aktywacja', () => {
    const first = must(use(EMPTY, 'turret', 'action'));
    const second = must(use(first, 'drone', 'action', { floorId: 'node-b' }));
    expect(second.charge).toBe(true);
    expect(second.deviceTurns).toHaveLength(2);
  });

  it('ruch, potem czynność — jedna aktywacja', () => {
    const moved = must(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 6 }));
    expect(moved.charge).toBe(true);
    expect(netDeviceTurnOf(moved.deviceTurns, 'node-a', 'drone', 3)).toMatchObject({
      moveLeftM: 2,
      actionLeft: true,
    });
    const fired = must(use(moved, 'drone', 'action'));
    expect(fired.charge).toBe(false);
    expect(netDeviceTurnOf(fired.deviceTurns, 'node-a', 'drone', 3)).toMatchObject({
      moveLeftM: 2,
      actionLeft: false,
    });
  });

  it('czynność, potem ruch — też jedna aktywacja, a metry się kończą', () => {
    const fired = must(use(EMPTY, 'drone', 'action', { moveM: 8 }));
    const moved = must(use(fired, 'drone', 'move', { spendM: 8 }));
    expect(moved.charge).toBe(false);
    expect(use(moved, 'drone', 'move', { spendM: 2 })).toEqual({
      ok: false,
      error: 'NET_DEVICE_NO_MOVE_LEFT',
    });
  });

  it('ruch ponad budżet odmawia od razu, a setne metra luzu przechodzą (70c)', () => {
    expect(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 9 })).toEqual({
      ok: false,
      error: 'NET_DEVICE_NO_MOVE_LEFT',
    });
    const exact = must(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 8.03 }));
    expect(netDeviceTurnOf(exact.deviceTurns, 'node-a', 'drone', 3)?.moveLeftM).toBe(0);
  });

  it('dwa marsze jednej aktywacji płacą z tych samych metrów (70c)', () => {
    const first = must(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 3.5 }));
    const second = must(use(first, 'drone', 'move', { moveM: 8, spendM: 4 }));
    expect(second.charge).toBe(false);
    expect(netDeviceTurnOf(second.deviceTurns, 'node-a', 'drone', 3)?.moveLeftM).toBe(0.5);
  });

  it('urządzenie, które stoi, nie rusza się wcale', () => {
    expect(use(EMPTY, 'turret', 'move', { spendM: 2 })).toEqual({
      ok: false,
      error: 'NET_DEVICE_STATIONARY',
    });
  });

  it('nowa runda zeruje budżet i wymiata stare wpisy', () => {
    const first = must(use(EMPTY, 'turret', 'action'));
    const next = must(use(first, 'turret', 'action', { round: 4 }));
    expect(next.charge).toBe(true);
    expect(next.deviceTurns).toEqual([
      { floorId: 'node-a', deviceId: 'turret', round: 4, moveLeftM: 0, actionLeft: false },
    ]);
    expect(next.nodeUse).toEqual([{ floorId: 'node-a', round: 4 }]);
  });

  it('poza walką nie ma rund: nic nie kosztuje i nic się nie zapisuje', () => {
    const free = must(use(EMPTY, 'turret', 'action', { round: null }));
    expect(free.charge).toBe(false);
    expect(free.nodeUse).toEqual([]);
    expect(free.deviceTurns).toEqual([]);
    expect(must(use(free, 'turret', 'action', { round: null })).charge).toBe(false);
  });

  it('nie zmienia księgi, którą dostała', () => {
    const ledger: Ledger = { nodeUse: [], deviceTurns: [] };
    use(ledger, 'turret', 'action');
    expect(ledger).toEqual({ nodeUse: [], deviceTurns: [] });
  });
});

describe('stan aktywacji na belce', () => {
  it('przechodzi ready → spent, a sąsiad z węzła dostaje node-used', () => {
    expect(netOperatedState(EMPTY, 'node-a', 'turret', 3)).toBe('ready');
    const fired = must(use(EMPTY, 'turret', 'action'));
    expect(netOperatedState(fired, 'node-a', 'turret', 3)).toBe('spent');
    expect(netOperatedState(fired, 'node-a', 'camera', 3)).toBe('node-used');
    expect(netOperatedState(fired, 'node-a', 'turret', 4)).toBe('ready');
    expect(netOperatedState(fired, 'node-a', 'turret', null)).toBe('free');
  });

  it('po samym ruchu urządzenie jest aktywne i ma jeszcze czynność', () => {
    const moved = must(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 2 }));
    expect(netOperatedState(moved, 'node-a', 'drone', 3)).toBe('active');
  });

  it('koszt: Akcja Sieciowa przed aktywacją, czynność po niej, nic poza walką', () => {
    expect(netOperatedCost('ready')).toBe('net');
    expect(netOperatedCost('active')).toBe('action');
    expect(netOperatedCost('free')).toBe('free');
  });

  it('odmowa mówi, czemu figura już nic nie zrobi', () => {
    expect(netOperatedRefusal('ready')).toBeNull();
    expect(netOperatedRefusal('active')).toBeNull();
    expect(netOperatedRefusal('spent')).toBe(NET_DEVICE_MESSAGES.NET_DEVICE_SPENT);
    expect(netOperatedRefusal('node-used')).toBe(NET_DEVICE_MESSAGES.NET_NODE_USED);
  });

  it('przyciski belki: kamera ma „Obróć” i „Wyłącz”, wieżyczka tylko „Wyłącz” (strzał to kafel broni)', () => {
    const camera = netDeviceVerbSlots({ tokenId: 't1', verbs: ['turn', 'off'], state: 'ready' });
    expect(camera.map((slot) => [slot.label, slot.cost, slot.disabled])).toEqual([
      ['Obróć', 'net', null],
      ['Wyłącz', 'net', null],
    ]);
    const turret = netDeviceVerbSlots({ tokenId: 't2', verbs: ['fire', 'off'], state: 'spent' });
    expect(turret.map((slot) => slot.verb)).toEqual(['off']);
    expect(turret[0]?.disabled).toBe(NET_DEVICE_MESSAGES.NET_DEVICE_SPENT);
    expect(turret[0]?.id).toBe('device:t2:off');
  });
});

describe('kafel „Ruch” drona (70c)', () => {
  const drone = { tokenId: 'd1', deviceKind: 'drone' as const, moveM: 8 };

  it('metry: pełny RUCH przed aktywacją, reszta po niej, bez limitu poza walką', () => {
    expect(netOperatedMoveLeft({ ...drone, state: 'ready' })).toBe(8);
    expect(netOperatedMoveLeft({ ...drone, state: 'active', moveLeftM: 3 })).toBe(3);
    // Strzał zamyka czynność, nie jazdę.
    expect(netOperatedMoveLeft({ ...drone, state: 'spent', moveLeftM: 3 })).toBe(3);
    expect(netOperatedMoveLeft({ ...drone, state: 'node-used' })).toBe(0);
    expect(netOperatedMoveLeft({ ...drone, state: 'free' })).toBeNull();
    expect(netOperatedMoveLeft({ ...drone, moveM: 0, state: 'free' })).toBe(0);
  });

  it('kafel: koszt Akcja Sieciowa przed aktywacją, potem z aktywacji; odmowy z powodem', () => {
    expect(netDeviceMoveSlot({ ...drone, state: 'ready' })).toMatchObject({
      id: 'device:d1:move',
      label: 'Ruch',
      metres: 8,
      cost: 'net',
      disabled: null,
    });
    expect(netDeviceMoveSlot({ ...drone, state: 'active', moveLeftM: 2 })).toMatchObject({
      metres: 2,
      cost: 'action',
      disabled: null,
    });
    expect(netDeviceMoveSlot({ ...drone, state: 'spent', moveLeftM: 0 })?.disabled).toBe(
      NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE_LEFT,
    );
    expect(netDeviceMoveSlot({ ...drone, state: 'node-used' })?.disabled).toBe(
      NET_DEVICE_MESSAGES.NET_NODE_USED,
    );
    expect(netDeviceMoveSlot({ ...drone, moveM: 0, state: 'ready' })?.disabled).toBe(
      NET_DEVICE_MESSAGES.NET_DEVICE_NO_MOVE,
    );
  });

  it('wieżyczka i kamera kafla „Ruch” nie mają', () => {
    expect(netDeviceMoveSlot({ tokenId: 't', deviceKind: 'turret', state: 'ready' })).toBeNull();
    expect(netDeviceMoveSlot({ tokenId: 'c', deviceKind: 'camera', state: 'ready' })).toBeNull();
  });
});

describe('zapis aktywacji w stanie runu', () => {
  it('przeżywa zapis i odczyt runu', () => {
    const fired = must(use(EMPTY, 'drone', 'move', { moveM: 8, spendM: 3 }));
    const stored = JSON.stringify({
      ...freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0'),
      nodeUse: fired.nodeUse,
      deviceTurns: fired.deviceTurns,
    });
    expect(readNetRunState(stored)?.deviceTurns).toEqual(fired.deviceTurns);
  });

  it('run sprzed 70b czyta się bez pola', () => {
    const stored = JSON.stringify(freshNetRun({ branchId: 'trunk', floor: 0 }, 'f0'));
    expect(readNetRunState(stored)?.deviceTurns).toBeUndefined();
  });

  it('śmieci w zapisie nie wywracają odczytu', () => {
    expect(readNetDeviceTurns('nic')).toEqual([]);
    expect(
      readNetDeviceTurns([
        null,
        { floorId: 'a' },
        { floorId: 'a', deviceId: 'd', round: 2, moveLeftM: -4, actionLeft: 'tak' },
      ]),
    ).toEqual([{ floorId: 'a', deviceId: 'd', round: 2, moveLeftM: 0, actionLeft: true }]);
  });
});
