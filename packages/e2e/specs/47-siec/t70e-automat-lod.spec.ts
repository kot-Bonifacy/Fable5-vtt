import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { runOf } from '../../fixtures/brama.ts';
import { apiGm, cookieHeader } from '../../fixtures/nocna-zmiana.ts';
import { query, queryOne, seat, startFromPoT6 } from '../../fixtures/regresja.ts';
import { DEAD_GATEWAY, rawSocket } from '../../fixtures/security.ts';
import {
  abilityButton,
  buildNetScene,
  defenseBrake,
  floorCard,
  jackIn,
  runWindow,
  takeExit,
  throwNetRoll,
} from '../../fixtures/siec.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { shakeCup } from '../../fixtures/table.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 70e „Automat Czarnego LOD-u i Demona z hamulcem MG” (decyzja MG nr 4
 * z 11.11). Do etapu obrona Sieci stała, dopóki MG nie kliknął „LOD wykrywa
 * intruza” albo „Tura LOD-a” — w środku walki łatwo o tym zapomnieć. Teraz:
 *
 *  - zjazd na piętro LOD-u sam daje test wykrycia, a przegrana — darmowy atak
 *    i wejście LOD-u na czoło kolejki;
 *  - Tura LOD-u i Demona w kolejce gra się sama, wskaźnik idzie dalej;
 *  - przejęcie węzła budzi Demona, a jego Tura odbiera węzeł;
 *  - „Wstrzymaj obronę” w oknie runu MG wstrzymuje wszystko, przyciski MG
 *    działają w obu trybach.
 *
 * Obrona to wpisy kompendium MG z surowego gniazda (bez prywatnego kompendium):
 * oba LOD-y tylko kradną Akcję Sieciową, Demon ma jedną Akcję — wynik każdego
 * rzutu ustawia skrypt kości.
 */

const SCENE = 'Serwerownia 70e';
const SOCKET_AT = { x: 360, y: 460 };
const TURRET = 'Wieżyczka 70e';
const TURRET_AT = { x: 700, y: 700 };
const KRUK = 'Kruk 70e';
const SOWA = 'Sowa 70e';
const IFRYT = 'Ifryt 70e';

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
function dataOf<T>(ack: unknown, what: string): T {
  const typed = ack as Ack<T>;
  if (!typed.ok) throw new Error(`E2E: ${what}: ${JSON.stringify(ack)}`);
  return typed.data;
}

const tokenRow = (name: string) =>
  queryOne<{ id: string; statuses: string }>(
    'SELECT t.id, t.statuses FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?',
    SCENE,
    name,
  )!;
const statusesOf = (name: string) => JSON.parse(tokenRow(name).statuses || '[]') as string[];
const combat = () =>
  queryOne<{ round: number; activeCombatantId: string | null }>(
    'SELECT c.round, c.activeCombatantId FROM Combat c JOIN Scene s ON s.id = c.sceneId WHERE s.name = ?',
    SCENE,
  );
/** Kolejka po kolei: etykieta wiersza (LOD, Demon) albo nazwa figury. */
const queue = () =>
  query<{ id: string; name: string; initiative: number | null }>(
    `SELECT m.id, COALESCE(t.name, m.label) AS name, m.initiative FROM Combatant m
       JOIN Combat c ON c.id = m.combatId JOIN Scene s ON s.id = c.sceneId
       LEFT JOIN Token t ON t.id = m.tokenId
     WHERE s.name = ? ORDER BY m.initiative DESC`,
    SCENE,
  );
const activeName = () => queue().find((row) => row.id === combat()?.activeCombatantId)?.name;
const lastMessageId = () =>
  queryOne<{ id: number }>('SELECT COALESCE(MAX(id), 0) AS id FROM ChatMessage')!.id;
/** Dopisek tytułu karty wykrycia: „Udane” to ucieczka przed ciosem (70f pkt 4). */
const DETECTION = ': ucieczka przed darmowym atakiem';
/** Karta rzutu po `since` z tym tytułem, z rolą konta, które ją podpisało. */
const rollCard = (since: number, title: string) =>
  queryOne<{ id: number; payload: string; role: string }>(
    `SELECT m.id, m.payload, u.role FROM ChatMessage m JOIN User u ON u.id = m.authorId
     WHERE m.id > ? AND m.kind IN ('gmroll', 'roll') AND m.text = ? ORDER BY m.id LIMIT 1`,
    since,
    title,
  );
/** Publiczne wiersze dziennika Sieci po `since` (`logNetLine`, rodzaj `action`). */
const lineAfter = (since: number, text: string) =>
  query<{ id: number }>(
    "SELECT id FROM ChatMessage WHERE id > ? AND kind = 'action' AND payload LIKE ?",
    since,
    `%${text}%`,
  ).length;
const runState = () =>
  runOf('Iskra')?.state as unknown as { netActionDebt: number; controlled: { floorId: string }[] };

test.describe.serial('@szybkie T70e automat Czarnego LOD-u i Demona', () => {
  let gm: Socket;
  let mg: Actor;
  let ola: Actor;
  let sceneId = '';
  const threat = (actor: Actor, name: string) =>
    runWindow(actor).locator('.net-ice', { hasText: name });
  const eyes = (actor: Actor) => runWindow(actor).locator('.net-eye[data-eye]');

  test.beforeAll(async ({ cast }) => {
    await startFromPoT6(DEAD_GATEWAY);
    test.setTimeout(4 * 60_000);
    const { socket } = await rawSocket(await cookieHeader(await apiGm()));
    gm = socket!;

    const upsert = async (entry: Record<string, unknown>) =>
      dataOf<{ id: string }>(
        await emitAck(gm, 'compendium:upsert', { entry }),
        entry.name as string,
      ).id;
    const ice = (name: string, value: number) => ({
      category: 'program',
      name,
      programClass: 'attacker',
      target: 'antiPersonnel',
      blackIce: true,
      atk: value,
      def: 2,
      rez: 15,
      per: value,
      speed: value,
      effects: { hooks: ['stealNetAction'] },
    });
    const krukId = await upsert(ice(KRUK, 4));
    const sowaId = await upsert(ice(SOWA, 2));
    const ifrytId = await upsert({
      category: 'netDefense',
      defenseKind: 'demon',
      name: IFRYT,
      rez: 15,
      interfaceRank: 5,
      netActions: 1,
      combatValue: 10,
    });

    ({ sceneId } = await buildNetScene(gm, {
      scene: SCENE,
      runner: { character: 'Iskra', player: 'Ola', at: { x: 200, y: 300 } },
      socketAt: SOCKET_AT,
      architecture: {
        name: 'Sieć serwerowni 70e',
        branches: [
          {
            id: 'trzon-70e',
            parentFloor: null,
            floors: [
              { id: 'wejscie-70e', kind: 'empty', label: 'Wejście' },
              { id: 'kruk-70e', kind: 'ice', label: 'Gniazdo Kruka', programIds: [krukId] },
              { id: 'sowa-70e', kind: 'ice', label: 'Gniazdo Sowy', programIds: [sowaId] },
              { id: 'wezel-70e', kind: 'controlNode', label: 'Obrona serwerowni', dv: 6 },
              { id: 'ifryt-70e', kind: 'demon', label: 'Serce', programIds: [ifrytId] },
            ],
          },
        ],
      },
    }));
    // Wieżyczka z ikoną urządzenia sama wejdzie do węzła przy podłączeniu (62).
    const turretId = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: TURRET,
        ...TURRET_AT,
        glyph: 'turret',
        hp: { current: 25, max: 25 },
      }),
      'token:create (wieżyczka)',
    ).id;
    dataOf(
      await emitAck(gm, 'token:stat', {
        tokenId: turretId,
        quick: {
          ref: 3,
          dex: 3,
          body: 5,
          will: 5,
          skillLevel: 1,
          evasion: 0,
          combatValue: 14,
          armorSp: 0,
          weaponId: 'weapon.submachine-gun',
          weaponName: 'Pistolet maszynowy',
          weaponDamage: '2k6',
          ammoCurrent: 30,
          ammoMax: 30,
        },
      }),
      'token:stat (wieżyczka)',
    );

    ({
      mg,
      players: [ola],
    } = (await seat(cast, ['Ola'], SCENE)) as { mg: Actor; players: [Actor] });
    ola.page.setDefaultTimeout(15_000);

    // Podłączenie przed walką (poza walką nic nie kosztuje), potem walka z Iskrą.
    await jackIn(ola, SOCKET_AT);
    await expect(floorCard(ola)).toContainText('Wejście');
    dataOf(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [tokenRow('Iskra').id] }),
      'combat:start',
    );
    await expect(ola.page.locator('.dice-cup')).toHaveAttribute('title', /inicjatyw/i);
    scriptDice([8]);
    await shakeCup(ola.page);
    await expect.poll(() => queue()[0]?.initiative ?? null, { timeout: 20_000 }).not.toBeNull();
    // Bez NPC-a w kolejce pierwszy klik tylko ostrzega (etap 50a) — drugi zaczyna.
    await mg.page.getByRole('button', { name: /Rozpocznij walkę/ }).click();
    await mg.page.getByRole('button', { name: /zacznij mimo to/ }).click();
    await expect.poll(() => combat()?.round).toBe(1);
    await expect.poll(activeName).toBe('Iskra');
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('1. zjazd na piętro Kruka: test wykrycia bez MG, darmowy atak, Kruk na czele kolejki', async () => {
    // Iskra: Interfejs 4 + 2 = 6 przeciw PRĘ Kruka 4 + 9 = 13 — przegrywa.
    const since = lastMessageId();
    scriptDice([2, 9]);
    await takeExit(ola, 'Iskra');
    await expect
      .poll(() => rollCard(since, `Wykrycie — ${KRUK}${DETECTION}`)?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    const card = rollCard(since, `Wykrycie — ${KRUK}${DETECTION}`)!;
    // Obrona należy do MG (#39): karta idzie jego kontem, nie kontem Oli.
    expect(card.role).toBe('GM');
    expect((JSON.parse(card.payload) as { opposed?: { won: boolean } }).opposed?.won).toBe(false);
    // Kości lecą u gracza: karta jest w czacie Oli.
    await expect
      .poll(async () =>
        (
          (await ola.store<{ items: { type: string; message?: { id: number } }[] }>('chat'))
            ?.items ?? []
        ).some((item) => item.type === 'message' && item.message?.id === card.id),
      )
      .toBe(true);

    // Darmowy atak: Kruk ukradł Akcję Sieciową; Kruk ściga i stoi nad Iskrą.
    expect(runState().netActionDebt).toBe(1);
    await expect(threat(ola, KRUK)).toContainText('ściga', { timeout: 30_000 });
    await expect(runWindow(ola).locator('.net-run-debt')).toContainText('−1');
    const order = queue().map((row) => row.name);
    expect(order).toEqual([KRUK, 'Iskra']);
    expect(queue()[0]!.initiative).toBe(queue()[1]!.initiative! + 1);
    // Wykrycie nie jest Turą: wskaźnik został na Iskrze.
    expect(activeName()).toBe('Iskra');
    // Gracz nie wie, czy obrona działa sama — przełącznik ma tylko MG.
    await expect(defenseBrake(ola)).toHaveCount(0);
    await expect(defenseBrake(mg)).not.toBeChecked();
  });

  test('2. następna runda: Tura Kruka gra się sama, wskaźnik wraca do Iskry', async () => {
    // Kruk: ATK 4 + 9 = 13 przeciw Interfejsowi Iskry 4 + 2 = 6 — trafia.
    const since = lastMessageId();
    scriptDice([9, 2]);
    dataOf(await emitAck(await ola.socket(), 'combat:next', undefined), 'Kończę turę (Ola)');
    await expect.poll(() => combat()?.round).toBe(2);
    await expect.poll(activeName, { timeout: 20_000 }).toBe('Iskra');
    await expect
      .poll(() => rollCard(since, `${KRUK} → Iskra`)?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    expect(rollCard(since, `${KRUK} → Iskra`)!.role).toBe('GM');
    expect(lineAfter(since, 'Tura Czarnego LOD-u')).toBe(1);
    expect(runState().netActionDebt).toBe(2);
    await expect(runWindow(ola).locator('.net-run-debt')).toContainText('−2', {
      timeout: 30_000,
    });
  });

  test('3. hamulec MG: zjazd na piętro Sowy nic nie robi, dopóki MG nie kliknie', async () => {
    await defenseBrake(mg).click();
    await expect(defenseBrake(mg)).toBeChecked();
    const since = lastMessageId();
    await takeExit(ola, 'Iskra');
    await expect(floorCard(ola)).toContainText('Gniazdo Sowy');
    await ola.page.waitForTimeout(1_500);
    expect(rollCard(since, `Wykrycie — ${SOWA}${DETECTION}`)).toBeUndefined();
    expect(queue().map((row) => row.name)).toEqual([KRUK, 'Iskra']);

    // Ręczne „LOD wykrywa intruza” działa z hamulcem: Iskra 4 + 9 przeciw 2 + 1.
    scriptDice([9, 1]);
    await threat(mg, SOWA).getByRole('button', { name: 'LOD wykrywa intruza' }).click();
    await expect
      .poll(() => rollCard(since, `Wykrycie — ${SOWA}${DETECTION}`)?.id ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(pendingDice()).toBe('');
    expect(queue().map((row) => row.name)).toEqual([SOWA, KRUK, 'Iskra']);
    await expect(threat(ola, SOWA)).toContainText('ściga', { timeout: 30_000 });
  });

  test('4. Kontrola budzi Demona, a jego Tura w kolejce sama odbiera węzeł', async () => {
    await defenseBrake(mg).click();
    await expect(defenseBrake(mg)).not.toBeChecked();
    // Zdjęty hamulec nie nadrabia niczego: kolejka i wskaźnik bez zmian.
    expect(activeName()).toBe('Iskra');

    await takeExit(ola, 'Iskra');
    await expect(floorCard(ola)).toContainText('Obrona serwerowni');
    const since = lastMessageId();
    // Kontrola: Interfejs 4 + 9 = 13 przeciw PT 6.
    scriptDice([9]);
    await abilityButton(ola, 'Kontrola').click();
    await throwNetRoll(ola.page);
    await expect(eyes(ola)).toHaveCount(1, { timeout: 30_000 });
    expect(pendingDice()).toBe('');
    await expect.poll(() => statusesOf(TURRET)).toContain('net-seized');
    // Demon budzi się sam — gracz go widzi, w kolejce stoi najwyżej.
    await expect.poll(() => lineAfter(since, `${IFRYT} — wykrycie intruza`)).toBe(1);
    await expect(threat(ola, IFRYT)).toContainText('ściga', { timeout: 30_000 });
    expect(queue().map((row) => row.name)).toEqual([IFRYT, SOWA, KRUK, 'Iskra']);

    // Koniec Tury Iskry. Runda 3: Ifryt 5 + 10 = 15 przeciw PT 13 z Kontroli —
    // odbiera węzeł; Sowa 2 + 1 i Kruk 4 + 1 przeciw Iskrze 4 + 9 — pudłują.
    const turn = lastMessageId();
    scriptDice([10, 1, 9, 1, 9]);
    dataOf(await emitAck(await ola.socket(), 'combat:next', undefined), 'Kończę turę (Ola)');
    await expect.poll(() => combat()?.round).toBe(3);
    await expect.poll(activeName, { timeout: 30_000 }).toBe('Iskra');
    await expect.poll(pendingDice, { timeout: 20_000 }).toBe('');
    expect(lineAfter(turn, 'Tura Demona')).toBe(1);
    expect(lineAfter(turn, 'Tura Czarnego LOD-u')).toBe(2);
    expect(runState().controlled).toEqual([]);
    // Wieżyczka wraca do obrony: znika z paska Oli i traci naklejkę.
    await expect.poll(() => statusesOf(TURRET), { timeout: 20_000 }).not.toContain('net-seized');
    await expect(eyes(ola)).toHaveCount(0, { timeout: 30_000 });
  });

  test('5. konsola przeglądarek czysta', async () => {
    for (const actor of [mg, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
