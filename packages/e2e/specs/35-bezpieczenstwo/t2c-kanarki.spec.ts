import type { APIRequestContext } from '@playwright/test';
import type { Socket } from 'socket.io-client';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { query } from '../../fixtures/db.ts';
import {
  campaignId,
  canariesInDatabase,
  characterId,
  cookieHeader,
  apiGm,
  ONLY_FROM,
  sceneId,
  startFromPoT3,
} from '../../fixtures/nocna-zmiana.ts';
import { rawSocket } from '../../fixtures/security.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { BASE_URL } from '../../instance/paths.ts';

/**
 * T2, kanarki na zimno (`testy.md` 6.2, punkt 9): gracz tuż po zalogowaniu
 * dostaje pełny stan sceny i kampanii **inną ścieżką niż pushe** (`state:sync`,
 * listy na żądanie, trasy HTTP). Stan z kopii `po-T3` plus kanarki dołożone tu
 * przez MG w miejscach, których scenariusz jeszcze nie dotknął (rzut ukryty,
 * tabela losowa MG, dziennik MG, handout nieudostępniony, wiedza i relacja bota,
 * architektura Sieci, notatka karty statysty).
 *
 * Kanarki z T3 czyta się z bazy (napisy `KANAREK-<etykieta>-NNNN`), więc lista
 * nie jest kopią z plików T3 — nowy kanarek w scenariuszu trafia tu sam.
 * Kanarek o nieznanej etykiecie jest tajny przed obojgiem, dopóki ktoś go nie
 * sklasyfikuje niżej.
 */

async function cookieOf(actor: Actor): Promise<string> {
  const cookies = await actor.context.cookies(BASE_URL);
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

test.describe.serial('T2 kanarki na zimno: pełny stan po zalogowaniu', () => {
  let gm: APIRequestContext;
  let gmSocket: Socket;
  let marek: Actor;
  let ola: Actor;
  const t2: string[] = [];
  /** Odpowiedzi na żądania list i HTTP, zebrane poza podsłuchem karty. */
  const pulled = new Map<string, string[]>([
    ['Marek', []],
    ['Ola', []],
  ]);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await startFromPoT3();
    gm = await apiGm();
    gmSocket = (await rawSocket(await cookieHeader(gm))).socket!;
  });

  test.afterAll(async ({ cast }) => {
    gmSocket?.disconnect();
    await gm?.dispose();
    await cast.closeAll();
  });

  test('MG dokłada kanarki tam, gdzie scenariusz jeszcze nie pisał', async () => {
    const code = (label: string) => {
      const value = `KANAREK-T2-${label}-${(t2.length + 1).toString(16).toUpperCase().padStart(4, '0')}`;
      t2.push(value);
      return value;
    };
    const ok = async (event: string, payload: unknown) => {
      const ack = await emitAck<unknown>(gmSocket, event, payload);
      expect(ack, `${event} ${JSON.stringify(ack).slice(0, 300)}`).toMatchObject({ ok: true });
      return ack.ok ? ack.data : undefined;
    };

    await ok('chat:send', { text: `/gr 1d10 ${code('rzut-MG')}` });
    await ok('journal:upsert', {
      title: `Plan MG ${code('dziennik-tytul')}`,
      body: `Rzeźnik zdradzi w drugiej walce. ${code('dziennik')}`,
      sessionDate: '2045-03-14',
      tags: [],
      visibility: 'gm',
    });
    await ok('handout:upsert', {
      title: `Mapa kanałów ${code('handout-tytul')}`,
      body: `Wejście od strony rzeki. ${code('handout-nieudostepniony')}`,
      image: null,
    });
    const table = (await ok('table:upsert', {
      name: `Plotki MG ${code('tabela-nazwa')}`,
      formula: '1d2',
      description: '',
      visibility: 'gm',
      rows: [
        { min: 1, max: 1, text: `Paser sprzedaje wszystkich. ${code('tabela-wiersz')}` },
        { min: 2, max: 2, text: `Paser sprzedaje wszystkich. ${code('tabela-wiersz')}` },
      ],
    })) as { table?: { id: string }; id?: string } | undefined;
    const tableId = table?.table?.id ?? table?.id;
    expect(tableId, JSON.stringify(table)).toBeTruthy();
    await ok('table:roll', { id: tableId, visibility: 'gm' });
    await ok('knowledge:upsert', {
      title: `Kryjówka ${code('wiedza-tytul')}`,
      body: `Paser trzyma zapas pod podłogą. ${code('wiedza')}`,
      type: 'npc',
      tags: [],
      visibility: 'gm',
    });
    const paserBot = query<{ id: string }>(`SELECT id FROM BotProfile WHERE name = 'Paser'`)[0]!;
    await ok('relation:set', {
      botId: paserBot.id,
      characterId: characterId('Kowal'),
      value: -2,
      note: `Kowal jest mu winien. ${code('relacja')}`,
    });
    const rolled = (await ok('net:roll', {
      name: `Serwer Pasera ${code('siec-nazwa')}`,
      difficulty: 'standard',
    })) as { architecture?: unknown } | undefined;
    expect(rolled?.architecture, JSON.stringify(rolled).slice(0, 300)).toBeTruthy();
    await ok('net:save', { architecture: rolled!.architecture });
    await ok('character:update', {
      characterId: characterId('Zbir'),
      patch: { data: { notes: `Zbir ma dług u Rzeźnika. ${code('karta-statysty')}` } },
    });
    await ok('note:create', {
      sceneId: sceneId('Knajpa'),
      x: 100,
      y: 100,
      text: `Kamera nad wejściem. ${code('pinezka-MG')}`,
    });
    // Wszystkie dołożone kanarki są w bazie — inaczej sprawdzalibyśmy powietrze.
    const inDb = canariesInDatabase();
    for (const value of t2) expect(inDb.has(value), value).toBe(true);
  });

  test('Marek i Ola wchodzą na zimno: F5, listy na żądanie i trasy HTTP', async ({ cast }) => {
    test.setTimeout(180_000);
    const token = await createInvitation(await cast.mg('chromium'), campaignId());
    marek = await cast.gracz('Marek', 'chromium', token);
    ola = await cast.gracz('Ola', 'firefox', token);
    for (const actor of [marek, ola]) {
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
      await actor.page.reload();
      await expect(actor.page.getByLabel('Wiadomość czatu')).toBeEnabled();
      // Wszystkie filtry czatu i lista postaci — to, co gracz klika w pierwszej minucie.
      await actor.page.getByRole('button', { name: 'Postacie', exact: true }).click();
      await actor.page.getByRole('button', { name: 'Czat', exact: true }).click();
    }

    const own: Record<string, string> = { Marek: characterId('Kowal'), Ola: characterId('Iskra') };
    for (const actor of [marek, ola]) {
      const bucket = pulled.get(actor.name)!;
      const { socket, sync } = await rawSocket(await cookieOf(actor));
      bucket.push(JSON.stringify(sync));
      const mine = own[actor.name]!;
      for (const [event, payload] of [
        ['chat:history', { beforeId: 1_000_000_000 }],
        ['handout:list', {}],
        ['journal:list', {}],
        ['trade:list', {}],
        ['creation:peek', {}],
        ['creation:permit-state', {}],
        ['economy:history', { characterId: mine }],
        ['character:xp-history', { characterId: mine }],
        ['inventory:sources', { characterId: mine }],
        ['trade:partners', { characterId: mine }],
        ['state:request', {}],
      ] as const) {
        bucket.push(`${event} ${JSON.stringify(await emitAck(socket!, event, payload))}`);
      }
      // Pushe po `state:request` przychodzą osobno — chwila na nie.
      socket!.onAny((event: string, ...args: unknown[]) =>
        bucket.push(`${event} ${JSON.stringify(args)}`),
      );
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      socket!.disconnect();
      for (const path of [
        '/api/auth/me',
        '/api/portrait-assets',
        '/api/portrait-assets?includeRetired=true',
        '/api/cpred/covers',
      ]) {
        const response = await actor.page.request.get(path);
        bucket.push(`${path} ${response.status()} ${await response.text()}`);
      }
    }
  });

  test('żaden kanarek tajny w chwili logowania nie dotarł do gracza', async () => {
    const all = canariesInDatabase();
    const secretFor = (player: 'Marek' | 'Ola') =>
      [...all]
        .filter(([, label]) => !ONLY_FROM[label] || ONLY_FROM[label] === player)
        .map(([c]) => c);
    // Id ukrytej figury i nieaktywnej sceny też są tajne.
    const hidden = query<{ id: string }>('SELECT id FROM Token WHERE hidden = 1').map((r) => r.id);
    const inactive = [sceneId('Brama')];
    test.info().annotations.push({
      type: 'kanarki',
      description: `${all.size} w bazie (${t2.length} z T2), ukrytych figur ${hidden.length}`,
    });
    for (const actor of [marek, ola]) {
      const secrets = [...secretFor(actor.name as 'Marek' | 'Ola'), ...hidden, ...inactive];
      const text = pulled.get(actor.name)!.join('\n');
      const leaked = [
        ...(await actor.sniffer.found(secrets)),
        ...secrets.filter((code) => text.includes(code)),
      ];
      expect([...new Set(leaked)], `${actor.name}: kanarki u gracza`).toEqual([]);
    }
  });

  test('kontrola podsłuchu: adresaci mają swoje szepty, handout i notatkę', async () => {
    const all = canariesInDatabase();
    const meantFor = (player: 'Marek' | 'Ola') =>
      [...all]
        .filter(([, label]) => ONLY_FROM[label] && ONLY_FROM[label] !== player)
        .map(([c]) => c);
    for (const actor of [marek, ola]) {
      const expected = meantFor(actor.name as 'Marek' | 'Ola');
      expect(expected.length, actor.name).toBeGreaterThan(0);
      const text = pulled.get(actor.name)!.join('\n');
      const got = [
        ...new Set([
          ...(await actor.sniffer.found(expected)),
          ...expected.filter((code) => text.includes(code)),
        ]),
      ];
      expect(got.sort(), actor.name).toEqual(expected.sort());
    }
    for (const actor of [marek, ola]) expect(actor.unexpectedErrors(), actor.name).toEqual([]);
  });
});
