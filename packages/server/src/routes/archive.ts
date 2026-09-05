import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ArchiveFile, ArchiveKind } from '@vtt/shared';
import type { AppContext } from '../context.js';
import { requireGm } from '../auth/guards.js';
import {
  archiveContentDisposition,
  exportCampaign,
  exportCharacter,
  exportScene,
} from '../archive.js';
import { getActiveCampaign } from './helpers.js';

/**
 * Pobieranie plików wymiany (etap 33) — trasy REST, nie zdarzenia gniazda.
 *
 * Umowa projektu brzmi „REST wgrywa i wydaje pliki, gniazdo zmienia stan stołu"
 * (spisana przy koszu biblioteki żetonów) i tu obowiązuje w obie strony:
 * **eksport niczego nie zmienia** i kończy się plikiem na dysku MG, więc jest
 * trasą; **import** zmienia stan i jedzie gniazdem (`archive:character`,
 * `archive:scene`).
 *
 * Jest też powód czysto techniczny: zrzut kampanii z czatem to dziś ~0,5 MB
 * i rośnie z każdą sesją, a Socket.IO ma domyślny limit wiadomości 1 MB.
 * Pobranie przez `GET` nie ma tego sufitu i daje przeglądarce zwykłe okno
 * „zapisz jako", zamiast budowania `Blob`-a z odpowiedzi na zdarzenie.
 */

/** Wyślij plik wymiany jako pobranie z sensowną nazwą. */
function sendArchive(
  reply: FastifyReply,
  kind: ArchiveKind,
  label: string,
  file: ArchiveFile<unknown>,
): FastifyReply {
  return (
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', archiveContentDisposition(kind, label))
      // Dwie spacje wcięcia: plik ma się otwierać w edytorze tekstu i dać
      // przeczytać — to jest kryterium ukończenia etapu, nie kwestia gustu.
      .send(JSON.stringify(file, null, 2))
  );
}

export function registerArchiveRoutes(app: FastifyInstance, ctx: AppContext): void {
  const gmOnly = { preHandler: requireGm };

  app.get<{ Params: { id: string } }>(
    '/api/archive/character/:id',
    gmOnly,
    async (request, reply) => {
      const file = await exportCharacter(ctx.prisma, request.params.id);
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
      return sendArchive(reply, 'character', file.payload.name, file);
    },
  );

  app.get<{ Params: { id: string } }>('/api/archive/scene/:id', gmOnly, async (request, reply) => {
    const file = await exportScene(ctx.prisma, request.params.id);
    if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
    return sendArchive(reply, 'scene', String(file.payload.scene.name ?? 'scena'), file);
  });

  /**
   * Zrzut całej kampanii. `?chat=0` pomija log — a manifest wtedy o tym mówi,
   * żeby po pliku było widać, czego w nim nie ma.
   */
  app.get<{ Querystring: { chat?: string } }>(
    '/api/archive/campaign',
    gmOnly,
    async (request, reply) => {
      const campaign = await getActiveCampaign(ctx.prisma);
      if (!campaign) return reply.code(409).send({ error: 'NO_CAMPAIGN' });
      const includeChat = request.query.chat !== '0';
      const file = await exportCampaign(ctx.prisma, campaign.id, { includeChat });
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
      return sendArchive(reply, 'campaign', campaign.name, file);
    },
  );
}
