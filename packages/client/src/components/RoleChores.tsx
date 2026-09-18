import type { CpredCharacterData, CpredRoleChore } from '@vtt/shared';
import { cpredRoleChores } from '@vtt/shared';
import { useCharacterStore } from '../stores/characterStore.js';

/**
 * Co zostało po kreatorze (naprawa 3c).
 *
 * Jedna lista w czterech miejscach: w podsumowaniu kreatora jako zapowiedź, na
 * ekranie końcowym, na samej karcie i u MG w zakładce „Postacie". Liczy ją
 * `cpredRoleChores` z karty, więc rozdzielone punkty zdejmują wiersz wszędzie
 * naraz i nie ma czego ze sobą uzgadniać.
 *
 * „Przejdź" dostaje `characterId` i prowadzi do właściwego panelu karty.
 * Kreator go nie ma, dopóki postać nie powstanie — wtedy wiersz jest samym
 * zdaniem, bo nie ma jeszcze dokąd iść.
 */
export function RoleChoresList({
  chores,
  characterId,
  onGo,
}: {
  chores: readonly CpredRoleChore[];
  characterId?: string;
  /** Called after „Przejdź" — the wizard uses it to step out of the card's way. */
  onGo?: () => void;
}) {
  const focusPanel = useCharacterStore((s) => s.focusPanel);
  if (chores.length === 0) return null;

  return (
    <ul className="role-chores">
      {chores.map((chore) => (
        <li key={chore.id} className="role-chore">
          <span className="role-chore-text">
            <strong>{chore.title}.</strong> {chore.text}{' '}
            <span className="role-chore-page">s. {chore.page}</span>
          </span>
          {characterId && (
            <button
              type="button"
              className="small-button role-chore-go"
              onClick={() => {
                focusPanel(characterId, chore.tab, chore.panel);
                onGo?.();
              }}
            >
              Przejdź
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Ta sama lista, liczona z karty — dla wołających, którzy mają samą kartę. */
export function RoleChoresFor({
  data,
  characterId,
}: {
  data: CpredCharacterData;
  characterId?: string;
}) {
  const registry = useCharacterStore((s) => s.registry);
  return <RoleChoresList chores={cpredRoleChores(data, registry)} characterId={characterId} />;
}

/** Zdanie podsumowujące listę — nagłówek sekcji i wiersz u MG mówią to samo. */
export function roleChoresSummary(chores: readonly CpredRoleChore[]): string {
  if (chores.length === 0) return 'Rola nie zostawia nic do uzupełnienia.';
  return chores.map((chore) => chore.title).join(', ');
}
