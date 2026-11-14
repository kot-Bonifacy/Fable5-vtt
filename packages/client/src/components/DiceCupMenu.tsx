import type { KeyboardEvent } from 'react';
import { ROLE_GM, cpredAutoDodge } from '@vtt/shared';
import { hudFocusTokenId } from '../hud.js';
import { queueCharacterSave } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { MenuBackdrop, useMenuEscape, useMenuTop } from './TokenContextMenu.js';

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
 * Szczęście do załadowanego rzutu (przebudowa z 14.11 na życzenie MG — mały
 * przełącznik ze strzałkami „0 ▲▼ z 5” był nieczytelny).
 *
 * Jeden żeton na każdy punkt w puli: zapalone idą do rzutu, zgaszone zostają.
 * Klik w żeton ustawia tyle punktów, ile wskazuje; klik w ostatni zapalony
 * gasi go (tak wraca się do zera). Najechanie podświetla, ile weźmie klik.
 * Strzałki na klawiaturze działają jak na suwaku.
 */
function LuckPicker({
  luck,
  pool,
  off,
  onLuck,
}: {
  luck: number;
  pool: number;
  /** Czemu Szczęścia nie da się teraz nastawić; null — można. */
  off: string | null;
  onLuck: (next: number) => void;
}) {
  if (off !== null) {
    return (
      <div className="dice-cup-menu-luck dice-cup-menu-luck--off" title={off}>
        <div className="dice-cup-menu-luck-head">
          <span className="dice-cup-menu-luck-name">Szczęście</span>
          <span className="dice-cup-menu-luck-value" aria-label={off}>
            —
          </span>
        </div>
      </div>
    );
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (event.key === 'Home') onLuck(0);
    else if (event.key === 'End') onLuck(pool);
    else if (step !== 0) onLuck(Math.max(0, Math.min(pool, luck + step)));
    else return;
    event.preventDefault();
  };
  const left = pool - luck;
  return (
    <div
      className={`dice-cup-menu-luck${luck > 0 ? ' dice-cup-menu-luck--spent' : ''}`}
      title={`Punkty Szczęścia dodane do tego rzutu (+1 za punkt), w puli zostanie ${left} z ${pool}. Wydane przepadają, nawet gdy rzut się nie uda.`}
    >
      <div className="dice-cup-menu-luck-head">
        <span className="dice-cup-menu-luck-name">Szczęście</span>
        <span className="dice-cup-menu-luck-value">{luck > 0 ? `+${luck}` : '0'}</span>
      </div>
      <div
        className="dice-cup-menu-luck-pips"
        role="slider"
        tabIndex={0}
        aria-label="Szczęście do tego rzutu"
        aria-valuemin={0}
        aria-valuemax={pool}
        aria-valuenow={luck}
        aria-valuetext={`+${luck}, w puli zostanie ${left}`}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: pool }, (_, index) => {
          const value = index + 1;
          return (
            <button
              key={value}
              type="button"
              tabIndex={-1}
              className={`dice-cup-menu-luck-pip${value <= luck ? ' dice-cup-menu-luck-pip--on' : ''}`}
              title={value === luck ? 'Zgaś ten punkt' : `+${value}`}
              aria-label={`Szczęście +${value}`}
              onClick={() => onLuck(value === luck ? value - 1 : value)}
            />
          );
        })}
      </div>
    </div>
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
        <LuckPicker luck={luck} pool={luckPool} off={luckOff} onLuck={onLuck} />
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
