import type { Page } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { queryOne } from '../../fixtures/db.ts';
import { apiGm, cookieHeader, invite } from '../../fixtures/nocna-zmiana.ts';
import { MEASUREMENTS_DIR } from '../../fixtures/pomiary.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import { buildPerfScene, PERF_SCENE } from '../../fixtures/wydajnosc.ts';
import { restoreCheckpoint, startInstance } from '../../instance/instance.ts';
import { clickActivate } from '../../fixtures/table.ts';

/**
 * Diagnoza #50 (T7c, 02.10): co zostaje na stercie MG i gracza w Chromium po
 * przełączaniu scen. Cztery zrzuty sterty MG (po 3 i po 15 przełączeniach, po
 * 150 s spokoju, po zamknięciu panelu „Sceny”) i trzy Marka; różnica liczby
 * i rozmiaru obiektów na konstruktor w `.e2e/pomiary/t7c-diag-sterta.json`.
 * Narzędzie do poprawki i retestu #50 — kod jest zminifikowany, więc nazwy klas
 * Pixi są skrócone; liczą się `JSArrayBufferData`, `WebGLBuffer` i VAO.
 */

const SCENES = ['Knajpa', 'Brama', PERF_SCENE] as const;

async function heapSummary(page: Page): Promise<Map<string, { count: number; size: number }>> {
  const session = await page.context().newCDPSession(page);
  const chunks: string[] = [];
  session.on('HeapProfiler.addHeapSnapshotChunk', (event) => chunks.push(event.chunk));
  await session.send('HeapProfiler.collectGarbage');
  await session.send('HeapProfiler.collectGarbage');
  await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await session.detach();
  const snapshot = JSON.parse(chunks.join('')) as {
    snapshot: { meta: { node_fields: string[]; node_types: [string[]] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snapshot.snapshot.meta.node_fields;
  const types = snapshot.snapshot.meta.node_types[0];
  const width = fields.length;
  const iType = fields.indexOf('type');
  const iName = fields.indexOf('name');
  const iSize = fields.indexOf('self_size');
  const summary = new Map<string, { count: number; size: number }>();
  for (let i = 0; i < snapshot.nodes.length; i += width) {
    const type = types[snapshot.nodes[i + iType]!]!;
    const name =
      type === 'string' || type === 'concatenated string' || type === 'sliced string'
        ? '(string)'
        : type === 'code' || type === 'hidden'
          ? `(${type})`
          : `${type}:${snapshot.strings[snapshot.nodes[i + iName]!]!.slice(0, 80)}`;
    const row = summary.get(name) ?? { count: 0, size: 0 };
    row.count += 1;
    row.size += snapshot.nodes[i + iSize]!;
    summary.set(name, row);
  }
  return summary;
}

function diff(
  a: Map<string, { count: number; size: number }>,
  b: Map<string, { count: number; size: number }>,
) {
  const rows = [...b.entries()].map(([name, after]) => {
    const before = a.get(name) ?? { count: 0, size: 0 };
    return { name, dCount: after.count - before.count, dSize: after.size - before.size };
  });
  return rows
    .filter((r) => r.dSize > 20_000 || r.dCount > 200)
    .sort((x, y) => y.dSize - x.dSize)
    .slice(0, 40);
}

test.describe.serial('T7c diagnoza sterty @odpornosc', () => {
  let gm: Socket;
  let mg: Actor;
  let marek: Actor;

  test.beforeAll(async ({ cast }) => {
    test.setTimeout(5 * 60_000);
    cast.viewport = { width: 1920, height: 1080 };
    await restoreCheckpoint('po-T6');
    await startInstance(DEAD_GATEWAY);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
    cast.viewport = { width: 1600, height: 900 };
  });

  test('zrzuty sterty MG i Marka przed i po 12 przełączeniach', async ({ cast }) => {
    test.setTimeout(20 * 60_000);
    await buildPerfScene(gm);
    mg = await cast.mg('chromium');
    marek = await cast.gracz('Marek', 'chromium', await invite(await apiGm(), 'Marek'));
    const page = mg.page;
    await page.getByRole('button', { name: 'Sceny', exact: true }).click();
    let n = 0;
    const switchTo = async (name: string) => {
      const row = sceneListRow(page, name);
      await clickActivate(row);
      await expect
        .poll(
          () =>
            queryOne<{ active: number }>('SELECT active FROM Scene WHERE name = ?', name)!.active,
        )
        .toBe(1);
      await row.getByRole('button', { name: 'Pokaż' }).click();
      for (const actor of [mg, marek]) {
        await expect
          .poll(
            async () =>
              (await actor.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
          )
          .toBe(name);
      }
      await page.waitForTimeout(1_500);
      n += 1;
    };
    for (let i = 0; i < 3; i += 1) await switchTo(SCENES[n % 3]!);
    const before = { mg: await heapSummary(mg.page), marek: await heapSummary(marek.page) };
    for (let i = 0; i < 12; i += 1) await switchTo(SCENES[n % 3]!);
    const after = { mg: await heapSummary(mg.page), marek: await heapSummary(marek.page) };
    await page.waitForTimeout(150_000);
    const rested = { mg: await heapSummary(mg.page), marek: await heapSummary(marek.page) };
    await page.getByRole('button', { name: /^Czat/ }).first().click();
    await page.waitForTimeout(30_000);
    const chat = { mg: await heapSummary(mg.page) };
    const total = (m: Map<string, { size: number }>) =>
      Math.round([...m.values()].reduce((s, r) => s + r.size, 0) / 1024 / 1024);
    const result = {
      mgMb: [total(before.mg), total(after.mg), total(rested.mg), total(chat.mg)],
      mgPoCzacie: diff(before.mg, chat.mg),
      marekMb: [total(before.marek), total(after.marek), total(rested.marek)],
      mgPoSpoczynku: diff(before.mg, rested.mg),
      mg: diff(before.mg, after.mg),
      marek: diff(before.marek, after.marek),
    };
    writeFileSync(join(MEASUREMENTS_DIR, 't7c-diag-sterta.json'), JSON.stringify(result, null, 2));
  });
});
