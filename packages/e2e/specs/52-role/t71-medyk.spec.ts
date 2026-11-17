import type { Locator } from '@playwright/test';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { characterId } from '../../fixtures/nocna-zmiana.ts';
import { queryOne } from '../../fixtures/db.ts';
import {
  CELL,
  ROLES,
  cardData,
  creationDataOf,
  dataOf,
  gmSocket,
  lastMessageId,
  rollAfter,
  seatRole,
  startFromRoleStart,
} from '../../fixtures/role.ts';
import { emitAck } from '../../fixtures/socket.ts';
import { pendingDice, scriptDice } from '../../instance/instance.ts';

/**
 * Etap 71b — Medyk, Medycyna (s. 149–150), stan dzisiejszy. Wiersze macierzy:
 * MED-01, MED-02, MED-07, MED-08, MED-09, MED-10, MED-15.
 * Chirurgia na ranie krytycznej i wszczepy (MED-05, MED-06) mają testy serwera
 * i scenariusz T5b (Iskra) — tu Medyk z kreatora i jego Farmaceutyki.
 * Od 71d1: „Wytwórz” czeka na zapis punktów (G40), partia proponuje MG godzinę
 * zegara (G18); limit „raz dziennie” (G17) — `recovery.test.ts`.
 * Od 71d2: kriopompa z Obsługi kriosystemów (MED-17, G19) — odbiór, zamrożenie
 * pacjenta w zasięgu ramienia, rozmrożenie i płyn; koniec tygodnia zegara
 * sprawdza `work-cryo.test.ts`.
 */

const MED = ROLES.medtech;
type Gear = { name: string; qty: number; compendiumId?: string };
type Sheet = {
  medicine: Record<string, number>;
  pharmaPicks: string[];
  eddies: number;
  gear: Gear[];
  recovery: { antibioticDays: number };
};
const sheet = () => cardData<Sheet>(MED.card);
const antibiotics = () => sheet().gear.filter((row) => /Antybiotyk/.test(row.name));

test.describe.serial('@szybkie T71 Medyk — Medycyna', () => {
  let celina: Actor;
  let card: Locator;
  const panel = () => card.locator('[data-sheet-panel="medicine"]');
  const plus = (name: string) =>
    panel().getByRole('button', { name: `Dołóż punkt: ${name}`, exact: true });

  test.beforeAll(async ({ cast }) => {
    await startFromRoleStart();
    ({ player: celina, card } = await seatRole(cast, 'medtech'));
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('MED-01 MED-02 MED-07 punkt na poziom: Chirurgia za 2 punkty Umiejętności, Farmaceutyki do Technologii Medycznej', async () => {
    await expect(panel()).toContainText('Do rozdzielenia: 4 z 4');
    for (const name of [
      'Chirurgia',
      'Chirurgia',
      'Technologia Medyczna (Farmaceutyki)',
      'Technologia Medyczna (Farmaceutyki)',
    ]) {
      const before = JSON.stringify(sheet().medicine);
      await plus(name).click();
      await expect.poll(() => JSON.stringify(sheet().medicine)).not.toBe(before);
    }
    expect(sheet().medicine).toEqual({ surgery: 2, pharma: 2 });
    await expect(panel()).toContainText('Wszystkie punkty rozdzielone');
    await expect(panel()).toContainText('Chirurgia 4');
    await expect(panel()).toContainText('Technologia Medyczna 2');
    const refused = await emitAck(await celina.socket(), 'character:update', {
      characterId: characterId(MED.card),
      patch: { data: { medicine: { surgery: 3, pharma: 2 } } },
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('MED-08 MED-09 D2 dwa punkty Farmaceutyków czekają na wybór; Medyk bierze Antybiotyk i Stym, partia Antybiotyku: Test PT 13, surowce, dawki', async () => {
    const pharma = panel().locator('details', { hasText: 'Farmaceutyki — dostęp do' });
    await expect(pharma.locator('summary')).toHaveText(
      'Farmaceutyki — dostęp do 0 z 5 środków · 2 punkty czekają na wybór',
    );
    await pharma.locator('summary').click();
    await expect(pharma.getByRole('button', { name: /^Wytwórz/ })).toHaveCount(0);
    // Etap 71g1 (D2, bramka 15.11): środek wybiera się przy punkcie — Stym, choć
    // w tabeli stoi czwarty (do 71g1 dwa punkty dawały dwa pierwsze wiersze).
    for (const [index, drug] of ['Antybiotyk', 'Stym'].entries()) {
      await pharma
        .locator('li', { hasText: drug })
        .getByRole('button', { name: 'Wybierz' })
        .click();
      await expect.poll(() => sheet().pharmaPicks.length).toBe(index + 1);
    }
    await expect.poll(() => sheet().pharmaPicks).toEqual(['pharma.antybiotyk', 'pharma.stym']);
    await expect(panel()).toContainText('Farmaceutyki — dostęp do 2 z 5 środków');
    await expect(pharma.getByRole('button', { name: 'Wybierz' })).toHaveCount(0);
    await expect(pharma.getByRole('button', { name: /^Wytwórz/ })).toHaveCount(2);
    // Trzeciego środka bez trzeciego punktu nie ma, a łatą karty wyborów się nie zmieni.
    const socket = await celina.socket();
    expect(
      await emitAck(socket, 'character:pharma-pick', {
        characterId: characterId(MED.card),
        pharmaId: 'pharma.zryw',
      }),
    ).toEqual({ ok: false, error: 'NO_PHARMA_POINT' });
    expect(
      await emitAck(socket, 'character:update', {
        characterId: characterId(MED.card),
        patch: { data: { pharmaPicks: ['pharma.zryw'] } },
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await emitAck(socket, 'character:pharma-pick', {
        characterId: characterId(MED.card),
        pharmaId: 'pharma.stym',
        remove: true,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    const eddies = sheet().eddies;
    const since = lastMessageId();
    scriptDice([8]);
    await pharma
      .locator('li', { hasText: 'Antybiotyk' })
      .getByRole('button', { name: /^Wytwórz/ })
      .click();
    const roll = await rollAfter(since, 'Antybiotyk');
    // TECH 7 + Technologia Medyczna 2 + kość 8 = 17 ≥ PT 13.
    expect(roll.total, JSON.stringify(roll)).toBe(17);
    expect(pendingDice()).toBe('');
    await expect.poll(() => antibiotics().reduce((sum, row) => sum + row.qty, 0)).toBe(2);
    expect(sheet().eddies).toBeLessThan(eddies);
    test
      .info()
      .annotations.push({ type: 'koszt partii', description: String(eddies - sheet().eddies) });

    // Turbo uzdrawiacz nie jest wybrany — Wytwórz odmawia.
    const refused = await emitAck(await celina.socket(), 'character:craft-pharma', {
      characterId: characterId(MED.card),
      pharmaId: 'pharma.turbo-uzdrawiacz',
    });
    expect(refused).toMatchObject({ ok: false });
  });

  test('G40 G18 „Wytwórz” zaraz po dołożeniu punktu czeka na zapis; „2 dawki” i godzina dla zegara MG', async () => {
    const pharma = panel().locator('details', { hasText: 'Farmaceutyki — dostęp do' });
    await panel()
      .getByRole('button', {
        name: 'Zdejmij punkt: Technologia Medyczna (Farmaceutyki)',
        exact: true,
      })
      .click();
    await expect.poll(() => sheet().medicine.pharma).toBe(1);
    await expect(pharma.getByRole('button', { name: /^Wytwórz/ })).toHaveCount(1);

    // Zdjęty punkt chowa ostatni wybór (Stym); dołożony z powrotem go oddaje.
    // Klik „Wytwórz” przy nim tuż po „+”, zanim minie zwłoka autozapisu — do
    // 71d1 serwer czytał kartę sprzed punktu i odmawiał.
    await plus('Technologia Medyczna (Farmaceutyki)').click();
    const since = lastMessageId();
    scriptDice([8]);
    await pharma
      .locator('li', { hasText: 'Stym' })
      .getByRole('button', { name: /^Wytwórz/ })
      .click();
    const roll = await rollAfter(since, 'Technologia Medyczna');
    expect(roll.outcome?.label, JSON.stringify(roll.outcome)).toBe('Wytworzone: 2 dawki');
    // „W ciągu godziny” (s. 150) — propozycja zegara, nie automat.
    expect(roll.clock).toMatchObject({ minutes: 60 });
    expect(sheet().medicine.pharma).toBe(2);
    expect(pendingDice()).toBe('');
    expect(celina.unexpectedErrors()).toEqual([]);
  });

  test('MED-10 MED-15 dawka Antybiotyku podana sobie: tydzień leczenia, jedna dawka mniej', async () => {
    await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
    const doses = card.locator('.cp-doses');
    await expect(doses.locator('select')).toHaveValue('');
    await doses
      .locator('li', { hasText: 'Antybiotyk' })
      .getByRole('button', { name: /^(Podaj|Zażyj)$/ })
      .click();
    await expect.poll(() => antibiotics().reduce((sum, row) => sum + row.qty, 0)).toBe(1);
    await expect.poll(() => sheet().recovery.antibioticDays).toBe(7);
    expect(celina.unexpectedErrors()).toEqual([]);
  });

  // ───────────── 71d2: kriopompa (G19, MED-17) ─────────────

  test('MED-K1 G34 lista Umiejętności Medyka wg oryginału: Broń długa zamiast Broni białej', async () => {
    const creation = await creationDataOf();
    const skills = creation.roles.find((role) => role.id === 'medtech')!.skills;
    expect(skills).toContain('shoulder-arms');
    expect(skills).not.toContain('melee-weapon');
    expect(Object.keys(creation.streetrat.medtech!.skills)).toContain('shoulder-arms');
  });

  test('MED-17 G19 kriopompa: odbiór z pierwszego punktu, zamrożenie sąsiada, bez Testu Przeżywalności, płyn', async () => {
    const gm = await gmSocket();
    const patient = ROLES.nomad.card;
    type Cryo = { by: string; expiresAtMinute?: number } | null;
    const patientCryo = () => cardData<{ cryo?: Cryo }>(patient).cryo ?? null;
    const patientStatuses = () =>
      JSON.parse(
        queryOne<{ statuses: string }>(
          'SELECT statuses FROM Token WHERE characterId = ?',
          characterId(patient),
        )!.statuses,
      ) as string[];
    const pump = () =>
      sheet().gear.find((row) => row.compendiumId === 'gear.kriopompa') as
        (Gear & { cryoUsed?: number }) | undefined;
    try {
      dataOf(
        await emitAck(gm, 'character:update', {
          characterId: characterId(MED.card),
          patch: { data: { medicine: { surgery: 1, pharma: 2, cryo: 1 }, eddies: 2_000 } },
        }),
        'character:update Obsługa kriosystemów 1',
      );
      await card.getByRole('button', { name: 'Karta', exact: true }).click();
      const cryo = panel().locator('details', { hasText: 'Obsługa kriosystemów — poziom 1' });
      await cryo.locator('summary').click();
      await cryo.getByRole('button', { name: 'Odbierz kriopompę', exact: true }).click();
      await expect.poll(() => pump()?.name).toBe('Kriopompa');
      await expect(cryo.getByRole('button', { name: 'Odbierz kriopompę' })).toHaveCount(0);

      // Pacjent obok Medyka — zasięg ramienia (s. 353).
      const patientToken = queryOne<{ id: string }>(
        'SELECT id FROM Token WHERE characterId = ?',
        characterId(patient),
      )!.id;
      dataOf(
        await emitAck(gm, 'token:move', {
          tokenId: patientToken,
          x: (ROLES.medtech.column + 1) * CELL,
          y: 3 * CELL,
          final: true,
        }),
        'token:move pacjent obok Medyka',
      );

      await card.getByRole('button', { name: 'Ekwipunek', exact: true }).click();
      const section = card.locator('.cp-cryo');
      await expect(section).toContainText('ładunki 1/1');
      await section
        .getByRole('combobox', { name: 'Kogo zamrozić' })
        .selectOption({ label: patient });
      await section.getByRole('button', { name: 'Zamroź', exact: true }).click();
      await expect.poll(patientCryo).toMatchObject({ by: MED.card });
      expect(patientStatuses()).toContain('unconscious');
      await expect.poll(() => pump()?.cryoUsed).toBe(1);
      await expect(section).toContainText('ładunki 0/1');

      // W worku nie rzuca się przeciw śmierci; stanu nie wpisze łata karty.
      expect(
        await emitAck(gm, 'character:roll', {
          characterId: characterId(patient),
          request: { kind: 'deathSave' },
          visibility: 'public',
        }),
      ).toEqual({ ok: false, error: 'IN_CRYO' });
      expect(
        await emitAck(gm, 'character:update', {
          characterId: characterId(patient),
          patch: { data: { cryo: null } },
        }),
      ).toEqual({ ok: false, error: 'FORBIDDEN' });

      // Rozmraża Medyk, który zamroził; status „Nieprzytomny” schodzi.
      expect(
        await emitAck(await celina.socket(), 'character:cryo', {
          action: 'thaw',
          characterId: characterId(patient),
        }),
      ).toMatchObject({ ok: true });
      await expect.poll(patientCryo).toBeNull();
      expect(patientStatuses()).not.toContain('unconscious');

      const before = sheet().eddies;
      await section.getByRole('button', { name: 'Uzupełnij (150 ed)', exact: true }).click();
      await expect.poll(() => sheet().eddies).toBe(before - 150);
      expect(pump()?.cryoUsed).toBeUndefined();
      await expect(section).toContainText('ładunki 1/1');
      expect(celina.unexpectedErrors()).toEqual([]);
    } finally {
      gm.close();
    }
  });
});
