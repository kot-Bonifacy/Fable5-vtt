import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneByName } from '../../fixtures/brama.ts';
import { queryOne } from '../../fixtures/db.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { apiGm, cookieHeader, invite, tokenOf } from '../../fixtures/nocna-zmiana.ts';
import { clickOnMap, fitCamera } from '../../fixtures/scene.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * #52 (T7c, 02.10): marsz Sowy i Iskry w walce T7b nie ruszał, gdy tuż nad polem
 * docelowym stała inna figura — klik w środek pola trafia w podpis tamtej figury
 * (`TokenNode.nameText` wisi pod żetonem, w polu niżej), a nie w mapę. Odtworzenie
 * bez walki i bez obciążenia: Ola (Firefox) prowadzi Iskrę z (8, 9) na (9, 9);
 * w próbie kontrolnej Kowal stoi z boku, w próbie właściwej — na (9, 8). Od poprawki
 * (02.10) figura łapie klik wyłącznie na swoich polach (`TokenNode.hitArea`).
 */

test.describe.serial('T7c: marsz na pole pod cudzą figurą (#52) @odpornosc', () => {
  let gm: Socket;
  let ola: Actor;
  let cell = 0;

  test.beforeAll(async ({ cast }) => {
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;
    const knajpa = sceneByName('Knajpa');
    cell = knajpa.gridSizePx;
    expect(await emitAck(gm, 'scene:activate', { sceneId: knajpa.id })).toMatchObject({ ok: true });
    ola = await cast.gracz('Ola', 'firefox', await invite(await apiGm(), 'Ola'));
    ola.page.setDefaultTimeout(15_000);
    await expect
      .poll(async () => (await ola.store<{ scene: { name: string } | null }>('scene'))?.scene?.name)
      .toBe('Knajpa');
    // Kamera gracza jest zamknięta w granicach mapy — dopasowanie bywa tylko częściowe (jak w T7b).
    await fitCamera(ola.page, KNAJPA.width, KNAJPA.height).catch(() => undefined);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  const at = (character: string) => {
    const row = queryOne<{ x: number; y: number }>(
      'SELECT x, y FROM Token WHERE id = ?',
      tokenOf(character),
    )!;
    return [Math.round(row.x / cell), Math.round(row.y / cell)];
  };

  async function place(character: string, [x, y]: [number, number]) {
    const moved = await emitAck(gm, 'token:move', {
      tokenId: tokenOf(character),
      x: x * cell,
      y: y * cell,
      final: true,
    });
    expect(moved, JSON.stringify(moved)).toMatchObject({ ok: true });
  }

  /** Klik w Iskrę, potem w środek pola (9, 9) — jak `march` w `t7b-obciazenie`. */
  async function marchIskra() {
    await ola.page.keyboard.press('Escape');
    await ola.page.waitForTimeout(500);
    await clickOnMap(ola.page, { x: 8.5 * cell, y: 9.5 * cell });
    await ola.page.waitForTimeout(250);
    await clickOnMap(ola.page, { x: 9.5 * cell, y: 9.5 * cell });
    await expect.poll(() => at('Iskra'), { timeout: 10_000 }).toEqual([9, 9]);
  }

  test('kontrola: Kowal z boku (12, 8) — Iskra dochodzi na (9, 9)', async () => {
    await place('Kowal', [12, 8]);
    await place('Iskra', [8, 9]);
    await marchIskra();
  });

  test('#52 Kowal tuż nad celem (9, 8) — klik w środek (9, 9) rusza Iskrę', async () => {
    await place('Iskra', [8, 9]);
    await place('Kowal', [9, 8]);
    await marchIskra();
  });
});
