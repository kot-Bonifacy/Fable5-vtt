import { ROLE_GM, cpredAutoDodge } from '@vtt/shared';
import { hudFocusTokenId } from '../hud.js';
import { queueCharacterSave } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { MenuBackdrop, useMenuEscape, useMenuTop } from './TokenContextMenu.js';
import { NumberStepper } from './NumberStepper.js';

const MENU_WIDTH = 250;

/**
 * „Unik i Odskok automatycznie” (etap 63b, decyzje MG 4–7 z 28.10; od 10.11
 * w menu kubka zamiast pod banerem portretu) — dla figury z lewego panelu.
 *
 * Tylko przy postaci gracza i tylko dla tego, kto może zmienić jej kartę
 * (właściciel albo MG): bot-towarzysz unika zawsze, NPC MG nigdy, więc tam nie
 * ma czego przełączać. Zaznaczony domyślnie — brak pola na karcie znaczy „tak”.
 * Odznaczony oddaje Unik kubkowi gracza, np. żeby dorzucić Szczęście.
 */
function AutoDodgeToggle() {
  const focusId = hudFocusTokenId();
  const characterId = useTokenStore((s) => (focusId ? s.tokens[focusId]?.characterId : undefined));
  const character = useCharacterStore((s) => (characterId ? s.characters[characterId] : undefined));
  const user = useAuthStore((s) => s.user);
  if (!character || !character.ownerId || !user) return null;
  if (user.role !== ROLE_GM && character.ownerId !== user.id) return null;
  return (
    <label
      className="dice-cup-menu-check"
      title={`${character.name}: po trafieniu serwer sam rzuca ZW + Unik (bez Szczęścia), a przy wybuchu Odskok. Odznacz, żeby rzucać kubkiem i dorzucić Szczęście.`}
    >
      <input
        type="checkbox"
        checked={cpredAutoDodge(character.data)}
        onChange={(event) =>
          queueCharacterSave(character.id, { data: { autoDodge: event.target.checked } })
        }
      />
      <span>Unik i Odskok automatycznie</span>
    </label>
  );
}

/**
 * Menu kubka pod prawym przyciskiem (zlecenie MG z 10.11.2026): Szczęście do
 * załadowanego rzutu, automatyczny Unik i przenoszenie kubka. Szczęście
 * deklaruje się przed rzutem (s. 74), więc liczy się tu, a nie na kubku —
 * chwyt kubka potrząsa.
 */
export function DiceCupMenu({
  x,
  y,
  luck,
  luckPool,
  luckOff,
  unlocked,
  moved,
  onLuck,
  onToggleLock,
  onResetPlace,
  onClose,
}: {
  x: number;
  y: number;
  luck: number;
  luckPool: number;
  /** Czemu Szczęścia nie da się teraz nastawić; null — można. */
  luckOff: string | null;
  unlocked: boolean;
  /** Kubek stoi poza domyślnym rogiem. */
  moved: boolean;
  onLuck: (next: number) => void;
  onToggleLock: () => void;
  onResetPlace: () => void;
  onClose: () => void;
}) {
  const placement = useMenuTop(y);
  useMenuEscape(true, onClose);
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const act = (run: () => void) => {
    run();
    onClose();
  };
  return (
    <>
      <MenuBackdrop onClose={onClose} className="dice-cup-menu-backdrop" />
      <div
        ref={placement.ref}
        className="context-menu dice-cup-menu"
        style={{ left, top: placement.top, width: MENU_WIDTH }}
        role="menu"
        aria-label="Kubek"
      >
        {luckOff === null ? (
          <div
            className={`dice-cup-menu-luck${luck > 0 ? ' dice-cup-menu-luck--spent' : ''}`}
            title="Punkty Szczęścia dodane do tego rzutu (+1 za punkt). Wydane przepadają, nawet gdy rzut się nie uda."
          >
            <span>Szczęście</span>
            <NumberStepper
              min={0}
              max={luckPool}
              value={luck}
              onChange={onLuck}
              label="Szczęście do tego rzutu"
              format={(value) => (value > 0 ? `+${value}` : '0')}
            />
            <span className="dice-cup-menu-luck-pool">z {luckPool}</span>
          </div>
        ) : (
          <div className="dice-cup-menu-luck dice-cup-menu-luck--off" title={luckOff}>
            <span>Szczęście</span>
            <span aria-label={luckOff}>—</span>
          </div>
        )}
        <AutoDodgeToggle />
        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          title={
            unlocked
              ? 'Kubek zostaje tam, gdzie stoi, i znów można nim rzucać.'
              : 'Lewym przyciskiem przeciągniesz kubek w inne miejsce. Rzucisz nim po zablokowaniu.'
          }
          onClick={() => act(onToggleLock)}
        >
          {unlocked ? '🔒 Zablokuj kubek' : '🔓 Odblokuj kubek'}
        </button>
        {moved && (
          <button
            type="button"
            className="context-menu-item"
            role="menuitem"
            onClick={() => act(onResetPlace)}
          >
            ↩ Wróć do rogu ekranu
          </button>
        )}
      </div>
    </>
  );
}
