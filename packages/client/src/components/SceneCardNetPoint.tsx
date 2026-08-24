import { useEffect, useMemo, useState } from 'react';
import {
  NET_ACCESS_RANGE_M,
  ROLE_GM,
  metresBetween,
  tokenCentre,
  type NetAccessPointView,
} from '@vtt/shared';
import { fetchNetArchitectures, runNetScan, startNetRun, updateNetAccessPoint } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useNetStore } from '../stores/netStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { netErrorText } from '../netErrors.js';

/**
 * Karta punktu dostępu (etap 26b) — otwiera się klikiem w gniazdo na mapie.
 *
 * Od 27l to jest **treść** karty, nie całe okno: ramkę, belkę, zamykanie i kosz
 * daje `SceneObjectCard`, wspólny dla siedmiu rodzajów obiektów sceny.
 *
 * Dwie strony, jedna karta. **MG** dostaje edytor: nazwa, Architektura,
 * ukrycie, notatka i kosz. **Gracz** dostaje jedno pytanie — „podłączyć się?" —
 * i odpowiedź, dlaczego jeszcze nie: zasięg liczy się u klienta wyłącznie po to,
 * żeby napisać „za daleko o 3 m" **zanim** serwer odmówi. Rozstrzyga i tak
 * serwer, razem ze ścianą, której klient gracza nie zna.
 */
export function SceneCardNetPoint({
  point,
  onClose,
}: {
  point: NetAccessPointView;
  onClose: () => void;
}) {
  const architectures = useNetStore((s) => s.architectures);
  const scene = useSceneStore((s) => s.effectiveScene);
  const tokens = useTokenStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Biblioteka Architektur jedzie tylko na żądanie (26a), a selektor niżej jej
  // potrzebuje — bez tego MG, który nie otwierał zakładki „Sieć", zobaczyłby
  // wyłącznie „martwe gniazdo" i nie miałby czym gniazda podpiąć.
  useEffect(() => {
    if (isGm) void fetchNetArchitectures();
  }, [isGm, point.id]);

  /**
   * Figury, którymi da się tu podłączyć: własne (u gracza) albo wszystkie
   * z kartą (u MG), z dopisanym dystansem. Kartę postaci sprawdza serwer —
   * klient nie wie, czy ktoś ma Interfejs i cyberdek.
   */
  const candidates = useMemo(() => {
    if (!scene) return [];
    return Object.values(tokens)
      .filter((token) => token.sceneId === scene.id && token.characterId)
      .filter((token) => isGm || token.ownerId === user?.id)
      .map((token) => ({
        token,
        metres: metresBetween(
          tokenCentre({ x: token.x, y: token.y, size: token.size }, scene),
          { x: point.x, y: point.y },
          scene,
        ),
      }))
      .sort((a, b) => a.metres - b.metres);
  }, [point, scene, tokens, isGm, user?.id]);

  const [tokenId, setTokenId] = useState('');
  const chosen = candidates.find((entry) => entry.token.id === tokenId) ?? candidates[0] ?? null;

  async function jackIn() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const ack = await startNetRun(chosen.token.id, point.id);
    setBusy(false);
    if (!ack.ok) setError(netErrorText(ack.error));
    else onClose();
  }

  async function scan() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const ack = await runNetScan(chosen.token.id);
    setBusy(false);
    if (!ack.ok) setError(netErrorText(ack.error));
  }

  async function patch(next: Parameters<typeof updateNetAccessPoint>[0]) {
    setBusy(true);
    const ack = await updateNetAccessPoint(next);
    setBusy(false);
    if (!ack.ok) setError(netErrorText(ack.error));
  }

  const tooFar = chosen ? chosen.metres > NET_ACCESS_RANGE_M : false;

  return (
    <>
      {isGm && (
        <div className="scene-card-form">
          <label className="bot-field">
            <span className="auth-label">Nazwa</span>
            <input
              type="text"
              maxLength={60}
              defaultValue={point.name}
              onBlur={(event) => void patch({ id: point.id, name: event.target.value })}
            />
          </label>
          <label className="bot-field">
            <span className="auth-label">Architektura</span>
            <select
              value={point.architectureId ?? ''}
              onChange={(event) =>
                void patch({ id: point.id, architectureId: event.target.value || null })
              }
            >
              <option value="">— martwe gniazdo —</option>
              {architectures.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bot-field">
            <span className="auth-label">Notatka MG</span>
            <textarea
              rows={2}
              maxLength={500}
              defaultValue={point.notes ?? ''}
              onBlur={(event) => void patch({ id: point.id, notes: event.target.value })}
            />
          </label>
          <div className="net-generator-foot">
            <button
              type="button"
              className="small-button"
              title={
                point.hidden
                  ? 'Odsłoń graczom — gniazdo trafi do ich payloadu bez skanowania'
                  : 'Ukryj — gracze przestaną je dostawać, dopóki nie znajdzie go Skaner'
              }
              disabled={busy}
              onClick={() => void patch({ id: point.id, hidden: !point.hidden })}
            >
              {point.hidden ? 'Odsłoń graczom' : 'Ukryj'}
            </button>
          </div>
        </div>
      )}

      <div className="scene-card-form scene-card-jack">
        {candidates.length === 0 ? (
          <p className="placeholder-text">
            Nie ma tu figury z kartą postaci, którą dałoby się podłączyć.
          </p>
        ) : (
          <>
            <label className="bot-field">
              <span className="auth-label">Kto się podłącza</span>
              <select
                value={chosen?.token.id ?? ''}
                onChange={(event) => setTokenId(event.target.value)}
              >
                {candidates.map((entry) => (
                  <option key={entry.token.id} value={entry.token.id}>
                    {entry.token.name} — {entry.metres.toFixed(1).replace('.', ',')} m
                  </option>
                ))}
              </select>
            </label>
            {tooFar && (
              <p className="ai-status-error">
                Za daleko — trzeba stanąć w promieniu {NET_ACCESS_RANGE_M} m od gniazda.
              </p>
            )}
            <div className="net-generator-foot">
              <button
                type="button"
                className="small-button"
                title="Podłączenie zabiera Akcję Sieciową; ściana między tobą a gniazdem blokuje"
                disabled={busy || tooFar || point.architectureId === null}
                onClick={() => void jackIn()}
              >
                Podłącz się
              </button>
              <button
                type="button"
                className="small-button"
                title="Skaner — Akcja w Somie: szuka w okolicy ukrytych punktów dostępu"
                disabled={busy}
                onClick={() => void scan()}
              >
                🛰 Skaner
              </button>
            </div>
            {point.architectureId === null && (
              <p className="placeholder-text">
                To gniazdo nie prowadzi jeszcze do żadnej Architektury.
              </p>
            )}
          </>
        )}
        {error && <p className="ai-status-error">{error}</p>}
      </div>
    </>
  );
}
