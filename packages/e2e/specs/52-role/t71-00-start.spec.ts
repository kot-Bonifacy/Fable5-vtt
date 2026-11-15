import { expect, test } from '../../fixtures/actors.ts';
import { query, queryOne } from '../../fixtures/db.ts';
import {
  MERCHANT,
  ROLE_CHECKPOINT,
  ROLE_SCENE,
  ROLES,
  TARGET,
  buildRoleStart,
  cardData,
} from '../../fixtures/role.ts';
import { hasCheckpoint, stopInstance } from '../../instance/instance.ts';

/**
 * Etap 71b: punkt kontrolny `role-start` — wspólny start dziewięciu specyfikacji
 * Ról i rozegrań przez Playwright MCP. Budowany od nowa przy każdym przebiegu
 * `t71-`, bo `po-T6` też powstaje od nowa przy pełnym przebiegu T3–T6b.
 */
test.describe.serial('@szybkie T71 punkt kontrolny role-start', () => {
  test.afterAll(async () => {
    await stopInstance();
  });

  test('dziewięć Ról na „Poligonie Ról”: karty, figury, cel, handlarz, auto na karcie', async () => {
    test.setTimeout(4 * 60_000);
    await buildRoleStart();
    expect(hasCheckpoint(ROLE_CHECKPOINT)).toBe(true);

    for (const role of Object.values(ROLES)) {
      const data = cardData<{ roleId: string; roleAbilityRank: number; formerRoles: unknown[] }>(
        role.card,
      );
      expect(data.roleId, role.card).toBe(role.roleId);
      expect(data.roleAbilityRank, role.card).toBe(role.rank);
      expect(data.formerRoles, `${role.card}: jedna Rola`).toEqual([]);
    }
    const figures = query<{ name: string }>(
      'SELECT t.name FROM Token t JOIN Scene s ON s.id = t.sceneId WHERE s.name = ?',
      ROLE_SCENE,
    ).map((row) => row.name);
    expect(figures).toEqual(
      expect.arrayContaining([...Object.values(ROLES).map((r) => r.card), TARGET, MERCHANT]),
    );
    expect(
      queryOne<{ open: number }>(
        'SELECT m.open FROM Merchant m JOIN Character c ON c.id = m.characterId WHERE c.name = ?',
        MERCHANT,
      )?.open,
    ).toBe(1);
    expect(
      queryOne<{ n: number }>(
        'SELECT count(*) AS n FROM Vehicle v JOIN Character c ON c.id = v.ownerCharacterId WHERE c.name = ?',
        ROLES.tech.card,
      )?.n,
    ).toBe(1);
  });
});
