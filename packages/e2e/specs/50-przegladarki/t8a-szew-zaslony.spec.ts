import { expect, test, type Actor, type Engine } from '../../fixtures/actors.ts';
import { brightPixelsAlong } from '../../fixtures/canvas.ts';
import { KNAJPA } from '../../fixtures/maps.ts';
import { campaignId } from '../../fixtures/nocna-zmiana.ts';
import { DEAD_GATEWAY } from '../../fixtures/security.ts';
import { createInvitation } from '../../fixtures/table.ts';
import { hasCheckpoint, restoreCheckpoint, startInstance } from '../../instance/instance.ts';

/**
 * #53 (T8a): gracz bez figury widział przez czarną zasłonę „Knajpy” cienką nitkę
 * mapy. Leżała na przekątnej sceny (0, 0) → (1470, 1070): czworokąt zasłony
 * rysowany na płótno z MSAA miał szew między swoimi trójkątami (tekstura zasłony
 * była szczelna). Kamera domyślna przy 1920 × 1080 pokazuje ten odcinek w ciemnej,
 * niezwiedzonej części sceny — tam przez zasłonę nie ma prawa przejść nic jasnego.
 *
 * Kontrola: ten sam pomiar na zwiedzonej sali (pamięć terenu, mapa przyciemniona)
 * musi znaleźć jasne piksele — inaczej zero na przekątnej nic by nie znaczyło.
 */

const ENGINES: Engine[] = ['firefox', 'chromium'];
/** Fragment przekątnej w niezwiedzonej kuchni (współrzędne z diagnozy 03.10). */
const DIAGONAL = [0.55, 0.67].map((t) => ({ x: KNAJPA.width * t, y: KNAJPA.height * t }));
/** Pas zwiedzonej sali — punkt `po-T4a` ma pamięć terenu na zachodzie sceny. */
const EXPLORED = [
  { x: 200, y: 700 },
  { x: 560, y: 700 },
];

test.describe.serial('T8a: szew zasłony pola widzenia (#53) @szybkie', () => {
  let mg: Actor;

  test.beforeAll(async () => {
    test.skip(!hasCheckpoint('po-T4a'), 'brak punktu po-T4a — najpierw pełny przebieg T3–T4a');
    test.setTimeout(3 * 60_000);
    await restoreCheckpoint('po-T4a');
    await startInstance(DEAD_GATEWAY);
  });

  test.afterAll(async ({ cast }) => {
    await cast.closeAll();
  });

  for (const engine of ENGINES) {
    test(`gracz bez figury w ${engine}: przekątna sceny zostaje czarna`, async ({ cast }) => {
      test.setTimeout(2 * 60_000);
      cast.viewport = { width: 1920, height: 1080 };
      mg ??= await cast.mg('chromium');
      const gracz = await cast.gracz(
        `Szew${engine}`,
        engine,
        await createInvitation(mg, campaignId()),
      );
      await expect
        .poll(
          async () => (await gracz.store<{ scene: { name: string } | null }>('scene'))?.scene?.name,
        )
        .toBe('Knajpa');
      await expect
        .poll(async () => (await gracz.store<{ mask: unknown }>('exploration'))?.mask ?? null)
        .not.toBeNull();
      // Pamięć terenu i zasłona składają się po przyjściu stanu — dajemy im klatki.
      await gracz.page.waitForTimeout(1500);

      expect(await brightPixelsAlong(gracz.page, EXPLORED[0]!, EXPLORED[1]!)).toBeGreaterThan(100);
      expect(await brightPixelsAlong(gracz.page, DIAGONAL[0]!, DIAGONAL[1]!)).toBe(0);
    });
  }
});
