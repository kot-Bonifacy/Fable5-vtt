import { netDeviceFigureProfile } from '@vtt/shared';
import type { PrismaClient } from '../db.js';
import type { Scene } from '../generated/prisma/client.js';
import type { BorrowedSight } from './vision.js';
import { loadNetDeviceGrants } from './net-control.js';

/**
 * Oczy przejętych urządzeń (zlecenie MG z 20.10; od etapu 70c nie tylko
 * kamery) — wzrok, który netrunner pożycza od figury urządzenia, dopóki trzyma
 * jej węzeł kontrolny.
 *
 * Moduł czyta wyłącznie bazę i czyste funkcje z `@vtt/shared`, bo woła go
 * `vision.ts` przy każdym liczeniu widoku: zależność od `netrun-io.ts` (który
 * sam sięga do widzenia) zrobiłaby z tego pętlę.
 *
 * Warunki, wszystkie z podręcznika i z decyzji MG:
 *  - węzeł jest w `controlled` runu („po przejęciu kontroli nad węzłem",
 *    s. 199) — odłączenie kasuje run, więc i wzrok;
 *  - urządzenie jest włączone — wyłączone nic nie pokazuje (oba sprawdza
 *    `loadNetDeviceGrants`);
 *  - patrzy **tylko netrunner** (decyzja MG z 20.10): właściciel figury albo
 *    karty runu. NPC-netrunner MG nikomu wzroku nie pożycza;
 *  - **jak** patrzy, mówi rodzaj (`NetDeviceFigureProfile.sight`, 70c): kamera
 *    stożkiem 90° wzdłuż kierunku figury, wieżyczka i dron kołem na zasięg
 *    wzroku figury. Drzwi i instalacje nie patrzą.
 */

/** Przejęte urządzenia stojące na tej scenie, z kontami, które przez nie patrzą. */
export async function loadNetDeviceSights(
  prisma: PrismaClient,
  scene: Pick<Scene, 'id' | 'campaignId'>,
): Promise<BorrowedSight[]> {
  const grants = [...(await loadNetDeviceGrants(prisma, scene.campaignId)).values()].filter(
    (grant) => grant.operatorIds.size > 0 && netDeviceFigureProfile(grant.deviceKind).sight,
  );
  if (grants.length === 0) return [];
  const tokens = await prisma.token.findMany({
    where: { sceneId: scene.id, id: { in: grants.map((grant) => grant.tokenId) } },
  });
  return tokens.flatMap((token) => {
    const grant = grants.find((entry) => entry.tokenId === token.id);
    const sight = grant ? netDeviceFigureProfile(grant.deviceKind).sight : null;
    if (!grant || !sight) return [];
    return [
      {
        token,
        viewers: new Set(grant.operatorIds),
        coneDeg: sight.coneDeg,
        moves: netDeviceFigureProfile(grant.deviceKind).moves,
      },
    ];
  });
}
