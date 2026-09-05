import { useState } from 'react';
import type { SocketAck } from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCombatStore } from '../stores/combatStore.js';
import { useSelectionStore } from '../stores/selectionStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { addToCombat, deleteToken, duplicateToken, updateToken } from '../socket.js';
import { figureCardName } from '../figure-cards.js';
import { tokenErrorText } from '../mapErrors.js';
import { confirmDestructive } from '../confirm.js';
import { plural } from '../plural.js';

/**
 * Pasek operacji na zaznaczonych figurach (etap 35).
 *
 * Pokazuje się **od dwóch figur**, bo przy jednej wszystko, co tu stoi, jest
 * w menu pod prawym przyciskiem myszy — a pasek nad mapą, który pojawia się po
 * każdym kliknięciu w żeton, byłby karą za normalną pracę.
 *
 * **Każda operacja to pętla po zwykłych zdarzeniach figury**, a nie nowe
 * zdarzenie „zrób to szóstce". To nie jest oszczędność, tylko jedyny sposób,
 * żeby uprawnienia zostały tam, gdzie są od etapu 05: `token:update` i
 * `token:delete` są dla MG, `token:move` dla właściciela — a pętla po nich
 * dziedziczy każdą z tych odpowiedzi bez powtarzania jej u siebie. Przy jednej
 * aktywnej sesji i kilku figurach koszt sześciu zdarzeń zamiast jednego nie ma
 * znaczenia (umowa o skali z `CLAUDE.md`).
 *
 * Odmowy mówią **jednym zdaniem o całej paczce**, nie sześcioma o każdej
 * figurze z osobna — inaczej jedna zerwana operacja zalewałaby czat.
 */
export function TokenGroupBar() {
  const groupIds = useSelectionStore((s) => s.groupIds);
  const tokens = useTokenStore((s) => s.tokens);
  const statuses = useTokenStore((s) => s.statuses);
  const combat = useCombatStore((s) => s.combat);
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const [showStatuses, setShowStatuses] = useState(false);
  const [busy, setBusy] = useState(false);

  // Figura mogła zniknąć spod zaznaczenia (skasowana w innej karcie).
  const picked = groupIds.map((id) => tokens[id]).filter((token) => token !== undefined);
  if (picked.length < 2) return null;

  const count = picked.length;
  const label = plural(count, 'figurę', 'figury', 'figur');
  const allHidden = picked.every((token) => token.hidden);

  /** Puszcza tę samą zmianę na wszystkie i mówi jednym zdaniem, jeśli coś padło. */
  async function apply(
    run: (tokenId: string) => Promise<SocketAck<unknown>>,
    what: string,
  ): Promise<void> {
    setBusy(true);
    const results = await Promise.all(picked.map((token) => run(token.id)));
    setBusy(false);
    const failed = results.filter((ack) => !ack.ok);
    const first = failed[0];
    if (!first || first.ok) return;
    useChatStore
      .getState()
      .addNote(
        `${what}: nie udało się przy ${failed.length} z ${count}. ${tokenErrorText(first.error)}`,
      );
  }

  function toggleStatus(statusId: string): void {
    // „Wszyscy mają" znaczy „zdejmij", inaczej „nadaj" — jedno kliknięcie
    // doprowadza całą paczkę do tego samego stanu, zamiast odwracać każdą
    // figurę z osobna i zostawiać połowę z naklejką.
    const everyone = picked.every((token) => token.statuses.includes(statusId));
    void apply(
      (tokenId) => {
        const token = tokens[tokenId];
        if (!token) return Promise.resolve<SocketAck<unknown>>({ ok: true, data: undefined });
        const next = everyone
          ? token.statuses.filter((entry) => entry !== statusId)
          : [...new Set([...token.statuses, statusId])];
        return updateToken(tokenId, { statuses: next });
      },
      everyone ? 'Zdejmowanie naklejki' : 'Nadawanie naklejki',
    );
  }

  async function removeAll(): Promise<void> {
    // Kosz figur pyta **zawsze**, także na poligonie: `Ctrl+Z` cofa usunięcia
    // scenerii (27k), ale nie figur — a id żetonu noszą inicjatywa i runy Sieci.
    // To jest ta sama różnica, dla której `Delete` figur nie dotyka.
    if (!confirmDestructive(`Usunąć ze sceny ${label}?`)) return;
    // Jedno pytanie o karty na całą paczkę, a nie jedno na figurę: dwanaście
    // okienek pod rząd to nie jest zgoda, tylko klikanie „OK".
    const withCards = picked.filter((token) => figureCardName(token) !== null);
    const alsoCards =
      withCards.length > 0 &&
      window.confirm(
        withCards.length === 1
          ? `Usunąć też kartę „${figureCardName(withCards[0]!)}”?`
          : `Usunąć też ${withCards.length} kart tych figur? Zostaną w kampanii, jeśli odmówisz.`,
      );
    const doomed = new Set(withCards.map((token) => token.id));
    await apply(
      (tokenId) => deleteToken(tokenId, alsoCards && doomed.has(tokenId)),
      'Usuwanie figur',
    );
    useSelectionStore.getState().clearGroup();
  }

  return (
    <div className="token-group-bar" role="group" aria-label="Operacje na zaznaczonych figurach">
      <span className="token-group-count">Zaznaczono: {label}</span>
      {isGm && (
        <>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title={
              allHidden
                ? 'Pokaż wszystkie zaznaczone figury graczom'
                : 'Ukryj wszystkie zaznaczone figury przed graczami'
            }
            onClick={() =>
              void apply(
                (tokenId) => updateToken(tokenId, { hidden: !allHidden }),
                allHidden ? 'Pokazywanie figur' : 'Ukrywanie figur',
              )
            }
          >
            {allHidden ? '👁 Pokaż' : '🚫 Ukryj'}
          </button>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Nadaj albo zdejmij naklejkę wszystkim zaznaczonym"
            aria-expanded={showStatuses}
            onClick={() => setShowStatuses((open) => !open)}
          >
            🏷 Naklejki…
          </button>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            title="Postaw kopię każdej zaznaczonej figury obok niej"
            onClick={() => void apply((tokenId) => duplicateToken(tokenId), 'Kopiowanie figur')}
          >
            ⧉ Duplikuj
          </button>
        </>
      )}
      {combat && (
        <button
          type="button"
          className="small-button"
          disabled={busy}
          title="Dopisz zaznaczone figury do trwającej walki"
          onClick={() => {
            // Jedno zdarzenie na całą paczkę, bo `combat:add` od etapu 14 bierze
            // listę — kolejka inicjatywy jest jednym stanem i przepisanie jej
            // sześć razy pod rząd byłoby sześcioma przetasowaniami.
            void addToCombat(picked.map((token) => token.id)).then((ack) => {
              if (!ack.ok) useChatStore.getState().addNote(tokenErrorText(ack.error));
            });
          }}
        >
          ⚔ Do walki
        </button>
      )}
      {isGm && (
        <button
          type="button"
          className="small-button small-button--danger"
          disabled={busy}
          title="Usuń wszystkie zaznaczone figury ze sceny"
          onClick={() => void removeAll()}
        >
          🗑 Usuń
        </button>
      )}
      <button
        type="button"
        className="small-button"
        title="Zdejmij zaznaczenie (Esc)"
        aria-label="Zdejmij zaznaczenie"
        onClick={() => useSelectionStore.getState().clearGroup()}
      >
        ✕
      </button>
      {showStatuses && statuses.length > 0 && (
        <div className="token-group-statuses">
          {statuses.map((status) => {
            const everyone = picked.every((token) => token.statuses.includes(status.id));
            return (
              <button
                key={status.id}
                type="button"
                className={`small-button ${everyone ? 'small-button--on' : ''}`}
                disabled={busy}
                title={
                  everyone
                    ? `Zdejmij „${status.name}" wszystkim zaznaczonym`
                    : `Nadaj „${status.name}" wszystkim zaznaczonym`
                }
                onClick={() => toggleStatus(status.id)}
              >
                <img src={status.icon} alt="" width={16} height={16} />
                {status.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
