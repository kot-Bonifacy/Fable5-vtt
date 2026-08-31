import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CPRED_AIM_BODY_ICON, CPRED_AIM_POINTS, CPRED_AIM_POINT_ICONS } from '@vtt/shared';
import { mayAimShot, type AttackIntent } from './attack-targeting.js';

/**
 * Dwie drogi uzbrojenia, jedno Celowanie (naprawa 31.08).
 *
 * Wybór lokacji trafienia (s. 170) miał od etapu 16 cały silnik i jedną
 * kontrolkę: guziki na banerze, które pokazywały się **wyłącznie** po
 * uzbrojeniu broni „Atakiem" z karty. Figura uzbrojona kaflem paska strzelała
 * bez możliwości Celowania. Naprawa przenosi wybór do okna przy kursorze,
 * otwieranego z `loadAttackFor` — jedynego miejsca, przez które przechodzą
 * wszystkie drogi ataku. Ten test pilnuje warunku, który je otwiera: gdyby
 * wrócił do „tylko krzyżyk z karty", pęknie tutaj, a nie przy stole.
 */

function intent(patch: Partial<AttackIntent> = {}): AttackIntent {
  return { attackerTokenId: 'tok-kai', weaponRowId: 'w-1', mode: 'single', ...patch };
}

describe('kiedy wolno Celować', () => {
  it('pojedynczy strzał w figurę — tak', () => {
    expect(mayAimShot(intent(), { kind: 'token', tokenId: 'tok-cel' })).toBe(true);
  });

  it('ogień ciągły i zaporowy — nie („nie można Celować", s. 173)', () => {
    const at = { kind: 'token', tokenId: 'tok-cel' } as const;
    expect(mayAimShot(intent({ mode: 'autofire' }), at)).toBe(false);
    expect(mayAimShot(intent({ mode: 'suppressive' }), at)).toBe(false);
  });

  it('kratka i osłona nie mają głowy ani nogi', () => {
    expect(mayAimShot(intent(), { kind: 'point', point: { x: 10, y: 10 } })).toBe(false);
    expect(mayAimShot(intent(), { kind: 'cover', coverId: 7 })).toBe(false);
  });

  it('strzał już wymierzony wolno wymierzyć jeszcze raz', () => {
    // Okno zostaje otwarte po wyborze, żeby „jednak w nogę" nie kosztowało
    // ponownego wskazywania celu — więc warunek nie może zależeć od `aimedAt`.
    expect(mayAimShot(intent({ aimedAt: 'head' }), { kind: 'token', tokenId: 'tok-cel' })).toBe(
      true,
    );
  });
});

describe('sylwetki punktów Celowania', () => {
  const icons = resolve(import.meta.dirname, '../public/icons/hud');

  it('każdy punkt Celowania ma plik ikony', () => {
    for (const id of CPRED_AIM_POINTS) {
      const file = join(icons, `${CPRED_AIM_POINT_ICONS[id]}.svg`);
      expect(existsSync(file), `brak ikony punktu Celowania „${id}": ${file}`).toBe(true);
    }
    const body = join(icons, `${CPRED_AIM_BODY_ICON}.svg`);
    expect(existsSync(body), `brak ikony zwykłego strzału: ${body}`).toBe(true);
  });
});
