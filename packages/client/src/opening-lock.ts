import type { WallKind } from '@vtt/shared';
import { CPRED_LOCK_SKILLS } from '@vtt/shared';
import { takeCallCup } from './call-cup.js';
import { openingErrorText, openingPickErrorText } from './mapErrors.js';
import { notifyChoice, notifyInfo, notifyRefusal } from './notices.js';
import { pickOpening } from './socket.js';
import { useCharacterStore } from './stores/characterStore.js';

/**
 * Zamknięte na klucz drzwi, okno albo brama (etap 58c).
 *
 * Gracz nie wie z góry, że otwór jest zaryglowany — dowiaduje się, sięgając
 * po klamkę (`OPENING_LOCKED`, 18d). Dopiero ta odmowa zamienia się w pytanie
 * z wytrychem: „Otwórz zamek” Umiejętnością do wyboru, bo jakim Testem zamek
 * ustępuje, gracz nie dostaje (`lockRule` zostaje u MG). Zła Umiejętność to
 * odmowa `LOCK_SKILL`, która nie zużywa próby. Klucz w kieszeni otwiera już
 * przy klamce — tu nie dochodzi.
 */

const NOUNS: Partial<Record<WallKind, string>> = {
  door: 'Drzwi',
  window: 'Okno',
  gate: 'Brama',
};

export function offerLockPick(wallId: number, kind: WallKind | undefined): void {
  const skills = useCharacterStore.getState().registry.skills;
  const name = (id: string) => skills.find((skill) => skill.id === id)?.name ?? id;
  notifyChoice(
    'scene',
    `${openingErrorText('OPENING_LOCKED', kind)} Spróbujesz otworzyć zamek?`,
    CPRED_LOCK_SKILLS.map((skillId) => ({
      label: `Otwórz zamek: ${name(skillId)}`,
      title: `Test ${name(skillId)} z PT od MG — jedna próba na postać`,
      run: () => void pick(wallId, kind, skillId),
    })),
    { title: `Zamek: ${NOUNS[kind ?? 'door'] ?? 'Drzwi'}` },
  );
}

async function pick(wallId: number, kind: WallKind | undefined, skillId: string): Promise<void> {
  const ack = await pickOpening({ wallId, skillId });
  if (!ack.ok) {
    notifyRefusal('scene', openingPickErrorText(ack.error, kind));
    return;
  }
  if (ack.data?.outcome !== 'test' || ack.data.callMessageId === undefined) return;
  notifyInfo('Test zamka — rzuć kubkiem. Wezwanie czeka też na czacie.', {
    title: `Zamek: ${NOUNS[kind ?? 'door'] ?? 'Drzwi'}`,
    topic: 'check',
  });
  takeCallCup(ack.data.callMessageId);
}
