import type { CharacterView, CreationPermitRow, SceneSummary } from '@vtt/shared';

/**
 * Czy stół jest gotowy na graczy (15.10, zlecenie MG): przypomnienie przed
 * „Rozpocznij sesję”, zanim gracze wejdą na mapę.
 *
 * Dwa braki psuły start: scena bez miejsca startu (figury graczy stają na
 * środku mapy — bywa nim pokój, którego drużyna jeszcze nie odkryła) i gracz
 * bez postaci przyjętej do gry (na scenie z widocznością Dynamiczną nie ma
 * czyimi oczami patrzeć). Lista jest liczona z magazynów MG, jak „Czeka na
 * MG” — niczego nie blokuje, MG może zacząć mimo braków.
 */
export type ReadinessKind = 'scene' | 'spawn' | 'no-character' | 'permit' | 'creating' | 'pending';

export interface ReadinessIssue {
  /** Stały klucz braku; ten sam trafia do „Czeka na MG”. */
  key: string;
  kind: ReadinessKind;
  text: string;
  /** Scena, której dotyczy brak miejsca startu. */
  sceneId?: string;
}

export interface ReadinessSources {
  scenes: readonly Pick<SceneSummary, 'id' | 'name' | 'active' | 'hasSpawn'>[];
  /** Gracze kampanii (członkowie), w kolejności dołączenia. */
  players: readonly { id: string; name: string }[];
  characters: readonly Pick<CharacterView, 'id' | 'name' | 'ownerId' | 'playReady' | 'template'>[];
  permits: readonly Pick<CreationPermitRow, 'userId' | 'status'>[];
}

export const readinessKey = {
  scene: () => 'readiness:scene',
  spawn: (sceneId: string) => `readiness:spawn:${sceneId}`,
  player: (userId: string) => `readiness:player:${userId}`,
};

/** Braki stołu: najpierw scena, potem gracze w kolejności listy. */
export function sessionReadinessIssues(sources: ReadinessSources): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const active = sources.scenes.find((scene) => scene.active);
  if (!active) {
    issues.push({
      key: readinessKey.scene(),
      kind: 'scene',
      text: 'Żadna scena nie jest aktywna — gracze zobaczą stół bez mapy',
    });
  } else if (!active.hasSpawn) {
    issues.push({
      key: readinessKey.spawn(active.id),
      kind: 'spawn',
      text: `Scena „${active.name}” nie ma miejsca startu — figury graczy staną na środku mapy`,
      sceneId: active.id,
    });
  }
  for (const player of sources.players) {
    const own = sources.characters.filter(
      (character) => character.ownerId === player.id && !character.template,
    );
    if (own.some((character) => character.playReady)) continue;
    const key = readinessKey.player(player.id);
    const pending = own[0];
    if (pending) {
      issues.push({
        key,
        kind: 'pending',
        text: `„${pending.name}” (${player.name}) czeka na przyjęcie do gry`,
      });
      continue;
    }
    const permit = sources.permits.find((row) => row.userId === player.id);
    if (permit?.status === 'requested') {
      issues.push({ key, kind: 'permit', text: `${player.name} czeka na zgodę na postać` });
    } else if (permit?.status === 'granted') {
      issues.push({
        key,
        kind: 'creating',
        text: `${player.name} ma zgodę, a postać jest jeszcze w kreatorze`,
      });
    } else {
      issues.push({ key, kind: 'no-character', text: `${player.name} nie ma postaci` });
    }
  }
  return issues;
}

/**
 * Braki, które dopisują się do „Czeka na MG”. Prośba o zgodę i postać czekająca
 * na „Przyjmij do gry” już tam stoją własnymi wierszami — drugi wpis o tym
 * samym tylko by się dublował.
 */
export function readinessForAttention(issues: readonly ReadinessIssue[]): ReadinessIssue[] {
  return issues.filter((issue) => issue.kind !== 'permit' && issue.kind !== 'pending');
}
