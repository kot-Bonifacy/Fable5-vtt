import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { sceneListRow } from '../../fixtures/brama.ts';
import { queryOne } from '../../fixtures/db.ts';
import { campaignId, characterId } from '../../fixtures/nocna-zmiana.ts';
import { MG_ENGINE, PLAYER_ENGINE } from '../../fixtures/regresja.ts';
import {
  ROLES,
  breakdownRow,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  startFromRoleStart,
  userIdOf,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { closeNotices, createInvitation, shakeCup } from '../../fixtures/table.ts';
import { scriptDice } from '../../instance/instance.ts';

/**
 * Etap 72g2 — stały przebieg sceny przykładowej „Reklamacja” (wzorzec
 * `data/public/scenes/reklamacja/`, rozegrana w przeglądarce 21.11) na nowym
 * modelu jazdy. Kombi z dziupli prowadzi **Koleina** (Nomada z `role-start`,
 * REF 7 + Prowadzenie 6 + Moto 4, gracz Damian — **Firefox**), MG (Chromium)
 * prowadzi furgon Militechu i plan rund:
 *
 * - runda 1: Wyścig — Wektor od serwera, Koleina kubkiem; **Moto 4 w rozkładzie**
 *   i zryw w ruchu kombi; Gwałtowny skręt z szuflady też liczy Moto (NOM-02);
 * - Wektor zrzuca kolczatkę z kokpitu MG, a na początku rundy 2 kombi wjeżdża
 *   na nią i rzuca Prowadzenie PT 17 — z Moto;
 * - runda 2: plan wypuszcza auto cywilne na środkowym pasie przed furgonem,
 *   a autopilot „Uciekaj” sam zjeżdża z tego pasa na koniec tury Wektora;
 * - runda 3: plan wypuszcza radiowóz NCPD od tyłu na dolny pas z 200 mil/h;
 *   gracz widzi go dopiero wtedy i nie dostaje ani planu, ani zamiarów.
 *
 * Liczby jazdy sprawdzają testy `shared` i serwera; tu — że wzorzec gra się na
 * stole tak, jak opisuje go `etap-72g-reklamacja.md`.
 */

const NOMAD = ROLES.nomad;
const SCENE = 'Reklamacja';
const MOTO = 4;
/** Koleina: REF 7 + Prowadzenie 6 + Moto 4. */
const KOLEINA_BASE = 7 + 6 + MOTO;
/** Wektor: REF 7 + Prowadzenie 6 (karta NPC-a z wzorca). */
const WEKTOR_BASE = 13;

interface Placed {
  id: string;
  name: string;
  x: number;
  y: number;
  lane: number;
  speed: number;
  status: string;
  moved: boolean;
  raceBonus: number;
  swerveReady?: boolean;
  intent?: unknown;
}
interface Obstacle {
  id: string;
  kind: string;
  x: number;
  y: number;
}
interface CombatView {
  round: number;
  activeCombatantId: string | null;
  combatants: { id: string; tokenId: string | null }[];
}

const tokenId = (name: string): string => {
  const row = queryOne<{ id: string }>(
    'SELECT t.id FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ? AND t.name = ?',
    SCENE,
    name,
  );
  if (!row) throw new Error(`E2E: no token "${name}" on ${SCENE}`);
  return row.id;
};

test.describe
  .serial('@szybkie T72g „Reklamacja”: Wyścig z Nomadą, kolczatka, plan, autopilot', () => {
  let mg: Actor;
  let damian: Actor;
  let gm: Socket;
  let sceneId = '';
  let kombi: Placed;
  let van: Placed;
  let police: Placed;
  let koleina = '';
  let wektor = '';
  let kamien = '';
  let combatants: Record<string, string> = {};

  const chase = async (actor: Actor) =>
    actor.store<{ vehicles: Placed[]; obstacles: Obstacle[]; plan: unknown[] }>('chase');
  const vehicle = async (actor: Actor, id: string) =>
    (await chase(actor)).vehicles.find((row) => row.id === id);
  const combatOf = async (actor: Actor) =>
    (await actor.store<{ combat: CombatView | null }>('combat')).combat;
  const decision = () => mg.page.getByTestId('gm-decision');
  /** „Następna tura” MG; po niej stół MG dogania serwer, zanim test pójdzie dalej. */
  const next = async () => {
    const view = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined), 'combat:next');
    await expect
      .poll(async () => (await combatOf(mg))?.activeCombatantId ?? null)
      .toBe(view.activeCombatantId);
    return view;
  };
  /** Pas wzdłuż jezdni Neonowej ulicy (6–18 kratek po 100 px, pasy po 4 kratki). */
  const laneOfY = (y: number) => Math.floor((y / 100 - 6) / 4);

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    test.setTimeout(4 * 60_000);
    cast.viewport = { width: 1600, height: 1000 };
    mg = await cast.mg(MG_ENGINE);
    damian = await cast.gracz(
      NOMAD.player,
      PLAYER_ENGINE,
      await createInvitation(mg, campaignId(), NOMAD.player),
    );
    gm = await gmSocket();

    const created = dataOf<{ sceneId: string; missing: string[] }>(
      await emitAck(gm, 'scene:from-template', { templateId: 'reklamacja' }),
      'scene:from-template',
    );
    expect(created.missing).toEqual([]);
    sceneId = created.sceneId;
    dataOf(await emitAck(gm, 'scene:activate', { sceneId }), 'scene:activate');
    dataOf(await emitAck(gm, 'scene:view', { sceneId }), 'scene:view');
    await closeNotices(mg.page);
    await mg.page.getByRole('button', { name: 'Sceny', exact: true }).click();
    await sceneListRow(mg.page, SCENE).getByRole('button', { name: 'Pokaż' }).click();

    await expect
      .poll(async () => (await chase(mg)).vehicles.length, { message: 'auta wzorca u MG' })
      .toBe(3);
    const cars = (await chase(mg)).vehicles;
    const byName = (name: string) => {
      const found = cars.find((row) => row.name === name);
      if (!found) throw new Error(`E2E: no car "${name}" on ${SCENE}`);
      return found;
    };
    kombi = byName('Kombi z dziupli');
    van = byName('Furgon Militechu');
    police = byName('Radiowóz NCPD');
    // Kombi i furgon na środkowym pasie, radiowóz w rezerwie.
    expect(kombi).toMatchObject({ lane: 1, status: 'racing' });
    expect(van).toMatchObject({ lane: 1, status: 'racing' });
    expect(police.status).toBe('behind');

    // Koleina siada za kierownicą kombi (krok 5 notatki „Zanim ruszycie” robi to ręką MG).
    koleina = dataOf<{ id: string }>(
      await emitAck(gm, 'token:create', {
        sceneId,
        name: NOMAD.card,
        characterId: characterId(NOMAD.card),
        ownerId: userIdOf(NOMAD.player),
        x: 2950,
        y: 1600,
      }),
      'token:create',
    ).id;
    dataOf(
      await emitAck(gm, 'vehicle:seat', { tokenId: koleina, sceneVehicleId: kombi.id, seat: 0 }),
      'vehicle:seat',
    );
    wektor = tokenId('Wektor');
    kamien = tokenId('Kamień');

    const combat = dataOf<CombatView>(
      await emitAck(gm, 'combat:start', { sceneId, tokenIds: [koleina, wektor, kamien] }),
      'combat:start',
    );
    const order: Record<string, number> = { [koleina]: 18, [wektor]: 12, [kamien]: 10 };
    combatants = Object.fromEntries(combat.combatants.map((row) => [row.tokenId, row.id]));
    for (const row of combat.combatants) {
      dataOf(
        await emitAck(gm, 'combat:set-initiative', {
          combatantId: row.id,
          initiative: order[row.tokenId ?? ''] ?? 5,
        }),
        'combat:set-initiative',
      );
    }
    await closeNotices(damian.page);
  });

  test.afterAll(async ({ cast }) => {
    gm?.close();
    await cast.closeAll();
  });

  test('runda 1: Wyścig — Wektor od serwera, Koleina kubkiem z Moto 4, zryw w kombi (Firefox)', async () => {
    const since = lastMessageId();
    // Wektor rzuca od razu: 13 + 3 = 16.
    scriptDice([3]);
    const view = await next();
    expect(view).toMatchObject({ round: 1, activeCombatantId: null });
    await expect(damian.page.getByTestId('combat-bar-race')).toContainText(
      `Wyścig — czekam na: ${NOMAD.card}`,
    );
    const page = damian.page;
    await page.getByRole('button', { name: /^Czat/ }).first().click();
    const call = page.locator('.chat-message.chat-check').last();
    await expect(call).toContainText('Wyścig — runda 1');
    // Koleina nie jest słabym kierowcą — bez PT 10.
    await expect(call).not.toContainText('PT 10');
    // 7 + 6 + Moto 4 + 5 = 22; zryw ⌊(22 − 16) / 2⌋ = 3.
    scriptDice([5]);
    await call.getByRole('button', { name: 'Rzuć' }).click();
    await page.locator('.dialog').last().getByRole('button', { name: 'Weź kubek' }).click();
    await shakeCup(page);
    const card = page.getByTestId('chase-race').last();
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect(card).toContainText('Furgon Militechu');
    await expect(card).toContainText(`${KOLEINA_BASE + 5} · zryw +3 kr.`);
    await expect(card).toContainText(`${WEKTOR_BASE + 3}`);
    const roll = await rollAfter(since, 'Wyścig', 'roll');
    expect(roll.total).toBe(KOLEINA_BASE + 5);
    expect(breakdownRow(roll, 'Moto')?.value).toBe(MOTO);
    await expect.poll(async () => (await vehicle(damian, kombi.id))?.raceBonus).toBe(3);
    // Runda rusza od Koleiny.
    await expect
      .poll(async () => (await combatOf(damian))?.activeCombatantId)
      .toBe(combatants[koleina]);
    await card.screenshot({ path: test.info().outputPath('reklamacja-wyscig.png') });
  });

  test('NOM-02: Gwałtowny skręt z szuflady liczy Moto; „Jedź” jedzie o zryw (Firefox)', async () => {
    const group = damian.page.getByTestId('hud-vehicle');
    await expect(group).toBeVisible();
    const since = lastMessageId();
    await group.getByRole('button', { name: /^Manewr/ }).click();
    const drawer = group.getByRole('list', { name: 'Manewry' });
    await expect(drawer).toBeVisible();
    // 7 + 6 + Moto 4 + 2 = 19 > PT 13.
    scriptDice([2]);
    await drawer.getByRole('button', { name: /^Gwałtowny skręt/ }).click();
    await expect(drawer).toBeHidden();
    const roll = await rollAfter(since, 'Gwałtowny skręt', 'roll');
    expect(roll.total).toBe(KOLEINA_BASE + 2);
    expect(breakdownRow(roll, 'Moto')?.value).toBe(MOTO);
    await expect
      .poll(async () => (await vehicle(damian, kombi.id))?.swerveReady, { timeout: 30_000 })
      .toBe(true);
    // Skręt zostaje niewykorzystany — kombi trzyma pas furgonu (kolczatka niżej).
    const before = (await vehicle(damian, kombi.id))!;
    await group.getByRole('button', { name: /^Jedź/ }).click();
    await expect.poll(async () => (await vehicle(damian, kombi.id))?.moved).toBe(true);
    const after = (await vehicle(damian, kombi.id))!;
    // Jazda w lewo, prędkości równe — kombi jedzie o sam zryw: 3 kratki po 100 px.
    expect((after.x - before.x) / 100).toBeCloseTo(-3, 1);
    expect(after.lane).toBe(1);
    await group.screenshot({ path: test.info().outputPath('reklamacja-kokpit.png') });
  });

  test('kolczatka z kokpitu MG: na początku rundy 2 kombi rzuca Prowadzenie PT 17 z Moto', async () => {
    const turn = await next(); // tura Wektora
    expect(turn.activeCombatantId).toBe(combatants[wektor]);
    dataOf(await emitAck(gm, 'vehicle:spikes', { sceneVehicleId: van.id }), 'vehicle:spikes');
    // Kolczatka jest jawna dla stołu.
    await expect
      .poll(async () => (await chase(damian)).obstacles.some((row) => row.kind === 'spikes'))
      .toBe(true);
    await next(); // koniec tury Wektora (autopilot) — tura Kamienia
    const since = lastMessageId();
    // Kolczatka: 17 + 8 = 25 > PT 17 (bez obrażeń); Wyścig rundy 2: Wektor 13 + 8 —
    // ta sama ścianka, żeby kolejność rzutów w haku rundy nie miała znaczenia.
    scriptDice([8, 8]);
    const round2 = dataOf<CombatView>(await emitAck(gm, 'combat:next', undefined), 'combat:next');
    expect(round2.round).toBe(2);
    const roll = await rollAfter(since, 'Kolczatka', 'roll');
    expect(roll.total).toBe(KOLEINA_BASE + 8);
    expect(roll.outcome?.success).toBe(true);
    expect(breakdownRow(roll, 'Moto')?.value).toBe(MOTO);
    // Kolczatka reaguje z pierwszym autem i znika.
    await expect
      .poll(async () => (await chase(damian)).obstacles.some((row) => row.kind === 'spikes'))
      .toBe(false);
  });

  test('runda 2: plan wypuszcza auto cywilne przed furgonem, a autopilot zjeżdża z pasa (Chromium)', async () => {
    // Wyścig rundy 2 czeka na kubek Koleiny — MG go pomija drugą „Następną turą”.
    const view = await next();
    expect(view).toMatchObject({ round: 2, activeCombatantId: combatants[koleina] });
    await closeNotices(mg.page);
    await expect(decision()).toContainText('Plan rundy');
    await expect(decision()).toContainText('Auto cywilne');
    await mg.page.screenshot({ path: test.info().outputPath('reklamacja-plan-r2.png') });
    await decision().getByRole('button', { name: 'Wypuść' }).click();
    await expect
      .poll(async () => (await chase(mg)).obstacles.filter((row) => row.kind !== 'spikes').length)
      .toBe(1);
    const [civilian] = (await chase(mg)).obstacles.filter((row) => row.kind !== 'spikes');
    expect(laneOfY(civilian!.y)).toBe(1);
    // Przed furgonem (jazda w lewo — mniejsze x).
    expect(civilian!.x).toBeLessThan((await vehicle(mg, van.id))!.x);
    expect((await vehicle(mg, van.id))!.lane).toBe(1);

    await next(); // Koleina bez „Jedź” jedzie sama — tura Wektora
    expect((await combatOf(mg))?.activeCombatantId).toBe(combatants[wektor]);
    await next(); // koniec tury Wektora: autopilot „Uciekaj” omija auto cywilne
    await expect.poll(async () => (await vehicle(mg, van.id))?.lane).not.toBe(1);
    await mg.page.screenshot({ path: test.info().outputPath('reklamacja-autopilot.png') });
  });

  test('runda 3: plan wpuszcza radiowóz od tyłu z 200 mil/h; gracz bez planu i zamiarów (Firefox)', async () => {
    expect(await vehicle(damian, police.id)).toBeUndefined();
    scriptDice([5]); // Wyścig rundy 3: Wektor
    const view = await next(); // tura Kamienia → runda 3 (czeka na Wyścig)
    expect(view.round).toBe(3);
    await next(); // MG pomija Wyścig
    await closeNotices(mg.page);
    await expect(decision()).toContainText('Radiowóz NCPD');
    await decision().getByRole('button', { name: 'Wypuść' }).click();
    await expect.poll(async () => (await vehicle(mg, police.id))?.status).toBe('racing');
    expect(await vehicle(mg, police.id)).toMatchObject({ lane: 2, speed: 40 });
    await expect.poll(async () => (await vehicle(damian, police.id))?.status).toBe('racing');
    // Plan i zamiary to tajemnica MG.
    expect((await chase(damian)).plan).toEqual([]);
    for (const row of (await chase(damian)).vehicles) expect(row.intent).toBeUndefined();
    await damian.page.screenshot({ path: test.info().outputPath('reklamacja-radiowoz.png') });
  });
});
