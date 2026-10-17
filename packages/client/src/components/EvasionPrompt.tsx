import { useMemo } from 'react';
import { ROLE_GM } from '@vtt/shared';
import { evasionCallKey, openEvasionCallsFor, type EvasionCall } from '../attack-evasion-call.js';
import { useBetweenSessions } from '../session-view.js';
import { declineEvasion } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useRollStore } from '../stores/rollStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/** Ile wezwań stoi naraz — reszta czeka na kartach ataku na czacie. */
const MAX_SHOWN = 3;

/**
 * Wezwanie do Uniku nad kubkiem (17.10, zlecenie MG).
 *
 * Monit reakcji wzorem Foundry: obrońca dostaje pytanie w miejscu, którego nie
 * przegapi, z obiema odpowiedziami pod ręką. W odróżnieniu od monitów z Foundry
 * nie ma limitu czasu — serwer i tak wstrzymuje obrażenia (`evasionPending`),
 * więc wezwanie stoi, dopóki ktoś nie odpowie. Unik po znanym trafieniu nic
 * nie kosztuje, więc gracz ma tylko „Unik” (decyzja MG z 17.10); „Bez uniku”
 * mówi wyłącznie MG — tu za swoje figury, na karcie ataku także za gracza,
 * który odszedł od stołu. `Esc` odkłada tylko kubek.
 */
export function EvasionPrompt() {
  const items = useChatStore((s) => s.items);
  const synced = useChatStore((s) => s.synced);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const characters = useCharacterStore((s) => s.characters);
  const tokens = useTokenStore((s) => s.tokens);
  const loaded = useRollStore((s) => s.evasion);
  const betweenSessions = useBetweenSessions();

  const calls = useMemo(
    () => openEvasionCallsFor(items, user, characters, tokens),
    [items, user, characters, tokens],
  );
  if (!synced || betweenSessions || calls.length === 0) return null;

  return (
    <section className="evasion-prompt" aria-label="Unik przed obrażeniami" aria-live="assertive">
      {calls.slice(0, MAX_SHOWN).map((call) => (
        <EvasionPromptRow
          key={evasionCallKey(call)}
          call={call}
          isGm={isGm}
          inCup={
            loaded?.kind !== 'smart' &&
            loaded?.messageId === call.messageId &&
            (loaded.tokenId ?? null) === (call.pending.tokenId ?? null)
          }
        />
      ))}
      {calls.length > MAX_SHOWN && (
        <p className="evasion-prompt-more">
          Czeka jeszcze {calls.length - MAX_SHOWN} — na kartach ataku na czacie.
        </p>
      )}
    </section>
  );
}

function EvasionPromptRow({
  call,
  isGm,
  inCup,
}: {
  call: EvasionCall;
  isGm: boolean;
  inCup: boolean;
}) {
  const verb = call.area === 'blast' ? 'Odskok' : 'Unik';
  const head =
    call.area === 'blast' ? 'Wybuch dosięga' : call.area === 'cone' ? 'Ogień obejmuje' : 'Atak na';
  return (
    <div className="evasion-prompt-row" role="alert">
      <p className="evasion-prompt-head">
        <span aria-hidden="true">⚠</span> {head}: <strong>{call.defenderName}</strong>
      </p>
      <p className="evasion-prompt-detail">
        {call.attackerName} · rzut {call.attackTotal}. {verb} (ZW + Unik) musi go przebić —
        obrażenia czekają na decyzję.
      </p>
      <div className="evasion-prompt-actions">
        {inCup ? (
          <span className="evasion-prompt-ready">Kubek gotowy — potrząśnij i rzuć</span>
        ) : (
          <button
            type="button"
            className="small-button small-button--primary"
            title={`Ładuje kubek rzutem ZW + Unik: ${call.defenderName}`}
            onClick={() => useRollStore.getState().loadEvasionCup(call.pending)}
          >
            {verb}
          </button>
        )}
        {isGm && (
          <button
            type="button"
            className="small-button"
            title="Obrońca nie unika — obrażenia przestają czekać"
            onClick={() =>
              declineEvasion({
                messageId: call.messageId,
                ...(call.area ? { tokenId: call.tokenId } : {}),
              })
            }
          >
            Bez uniku
          </button>
        )}
      </div>
    </div>
  );
}
