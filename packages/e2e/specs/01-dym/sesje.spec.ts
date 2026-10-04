import { query } from '../../fixtures/db.ts';
import { expect, test, type Actor } from '../../fixtures/actors.ts';
import { createCampaign, createInvitation, say } from '../../fixtures/table.ts';
import { emitAck } from '../../fixtures/socket.ts';

/**
 * Etap 44c — sesje i sloty, dym: przygotowanie MG bez graczy, start sesji,
 * koniec sesji i widok gracza między sesjami. MG w Chromium, gracz
 * w **Firefoksie** (kryterium ukończenia etapu). Jedzie po `dym.spec.ts` na tej
 * samej instancji: MG najpierw kończy sesję „Dym T1”, bo z trwającą sesją
 * nowa kampania nie otwiera mu się przy stole.
 */
test.describe.serial('@szybkie dym 44c: przygotowanie, start, koniec, widok między sesjami', () => {
  const CAMPAIGN = 'Sesje 44c';
  const PREP_LINE = 'Przygotowanie — tego gracze nie widzą';
  let mg: Actor;
  let kuba: Actor;

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  test('przygotowanie: MG sam przy stole, Kuba między sesjami na plakacie', async ({ cast }) => {
    mg = await cast.mg('chromium');
    const gmSocket = await mg.socket();
    for (const { id } of query<{ id: string }>(
      'SELECT id FROM Campaign WHERE sessionStartedAt IS NOT NULL',
    )) {
      expect((await emitAck(gmSocket, 'session:end', { campaignId: id })).ok).toBe(true);
    }
    const campaignId = await createCampaign(mg, CAMPAIGN, { session: false });
    await mg.page.reload();
    await expect(mg.page.locator('.top-bar-campaign')).toHaveText(CAMPAIGN);
    await expect(mg.page.locator('.session-state--prep')).toHaveText('przygotowanie');

    kuba = await cast.gracz('Kuba', 'firefox', await createInvitation(mg, campaignId, 'Kuba'));
    const page = kuba.page;
    const poster = page.locator('.between-sessions');
    await expect(poster).toBeVisible();
    await expect(poster).toContainText(CAMPAIGN);
    await expect(poster).toContainText('Pierwsza sesja jeszcze przed wami.');
    await expect(page.locator('.map-area')).toHaveCount(0);
    await expect(page.locator('.dice-cup')).toHaveCount(0);
    await expect(page.getByLabel('Wiadomość czatu')).toBeDisabled();
    // Zakładki panelu (nie filtr czatu, który też ma „Walka”).
    const tabs = page.locator('.side-tab');
    await expect(tabs).toHaveText(['Czat', 'Postacie', 'Kompendium', 'Handouty', 'Dziennik']);
    // MG widzi Kubę online, ale poza stołem.
    await expect(mg.page.locator('.presence-entry--away', { hasText: 'Kuba' })).toBeVisible();

    // Czat przygotowania nie dociera do gracza.
    await say(mg, PREP_LINE);
    await expect(mg.page.locator('.chat-message', { hasText: PREP_LINE })).toBeVisible();
    // Serwer odmawia zdarzeń stołu — także z konsoli.
    const raw = await kuba.socket();
    for (const [event, payload] of [
      ['chat:send', { text: 'z konsoli' }],
      ['token:move', { tokenId: 'x', x: 1, y: 1 }],
      ['map:ping', { x: 1, y: 1 }],
    ] as const) {
      expect(await emitAck(raw, event, payload), event).toEqual({
        ok: false,
        error: 'SESSION_NOT_RUNNING',
      });
    }
    await expect(page.locator('.chat-message', { hasText: PREP_LINE })).toHaveCount(0);
    expect(query(`SELECT id FROM ChatMessage WHERE text = 'z konsoli'`)).toEqual([]);
  });

  test('start: Kuba siada przy stole bez F5, czat w obie strony, przygotowania nie widać', async () => {
    await mg.page.getByRole('button', { name: 'Rozpocznij sesję' }).click();
    await expect(mg.page.locator('.session-state--live')).toContainText('sesja');
    const page = kuba.page;
    await expect(page.locator('.between-sessions')).toHaveCount(0);
    await expect(page.locator('.map-area')).toBeVisible();
    await expect(page.getByLabel('Wiadomość czatu')).toBeEnabled();
    await expect(page.getByText('MG rozpoczął sesję.')).toBeVisible();
    await expect(mg.page.locator('.presence-entry--away', { hasText: 'Kuba' })).toHaveCount(0);

    await say(mg, 'Witaj przy stole, Kuba.');
    await expect(
      page.locator('.chat-message', { hasText: 'Witaj przy stole, Kuba.' }),
    ).toBeVisible();
    await say(kuba, 'Jestem gotów.');
    await expect(mg.page.locator('.chat-message', { hasText: 'Jestem gotów.' })).toBeVisible();
    await expect(page.locator('.chat-message', { hasText: PREP_LINE })).toHaveCount(0);
  });

  test('koniec: Kuba wraca na plakat z historią do czytania, MG przygotowuje dalej', async () => {
    await mg.page.getByRole('button', { name: 'Zakończ sesję' }).click();
    await mg.page.getByRole('button', { name: 'Na pewno? Zakończ' }).click();
    await expect(mg.page.locator('.session-state--prep')).toHaveText('przygotowanie');
    const page = kuba.page;
    const poster = page.locator('.between-sessions');
    await expect(poster).toBeVisible();
    await expect(poster).toContainText('Ostatnia sesja skończyła się');
    await expect(page.getByLabel('Wiadomość czatu')).toBeDisabled();
    await expect(page.getByText('MG zakończył sesję. Do zobaczenia przy następnej.')).toBeVisible();
    await expect(
      page.locator('.chat-message', { hasText: 'Witaj przy stole, Kuba.' }),
    ).toBeVisible();
    // Po F5 to samo — stan sesji siedzi na serwerze, nie w karcie.
    await page.reload();
    await expect(page.locator('.between-sessions')).toBeVisible();
    await expect(page.locator('.chat-message', { hasText: PREP_LINE })).toHaveCount(0);
  });

  test('konsola bez nowych błędów w obu silnikach', () => {
    expect(mg.unexpectedErrors()).toEqual([]);
    expect(kuba.unexpectedErrors()).toEqual([]);
  });
});
