import { useEffect, useMemo, useState } from 'react';
import { ROLE_GM, conditionRegistry, partyWiped } from '@vtt/shared';
import { useAuthStore } from '../stores/authStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * Plansza „Wszyscy zginęli” (17.10.2026, zlecenie MG): gdy każda figura
 * graczy na scenie ma stan Martwy, stół zasłania plakat z ekranu logowania.
 *
 * Warunek liczy `partyWiped` z tego, co widz i tak dostał, więc plansza znika
 * sama, gdy MG zdejmie komuś „Martwego”. Przycisk to żart z „Teraz możesz
 * bezpiecznie wyłączyć komputer” z Windows 95: gracza wylogowuje (koniec gry),
 * a MG tylko zamyka planszę — prowadzący dalej ma przy stole robotę.
 */
export function PartyWipe() {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const logout = useAuthStore((s) => s.logout);
  const sceneId = useSceneStore((s) => s.scene?.id ?? null);
  const tokens = useTokenStore((s) => s.tokens);
  const statuses = useTokenStore((s) => s.statuses);
  const conditions = useMemo(() => conditionRegistry(statuses), [statuses]);
  const wiped = useMemo(
    () =>
      sceneId !== null &&
      partyWiped(
        Object.values(tokens).filter((token) => token.sceneId === sceneId),
        conditions,
      ),
    [tokens, sceneId, conditions],
  );
  const [dismissed, setDismissed] = useState(false);

  // Zamknięta plansza wraca przy następnym pogromie, nie przy każdej zmianie
  // figur w trakcie obecnego.
  useEffect(() => {
    if (!wiped) setDismissed(false);
  }, [wiped]);

  if (!wiped || dismissed) return null;

  return (
    <div className="auth-screen party-wipe" role="alertdialog" aria-labelledby="party-wipe-title">
      <div className="auth-card">
        <p className="auth-eyebrow">Koniec gry</p>
        <h1 id="party-wipe-title" className="auth-title">
          Wszyscy zginęli
        </h1>
        <div className="auth-rule" aria-hidden="true" />
        <p className="party-wipe-slogan">W Night City nikt nie umiera ze starości.</p>
        <p className="auth-hint">
          {isGm
            ? 'Każda postać graczy na tej scenie ma stan Martwy. Zdejmij go komuś, a gra toczy się dalej.'
            : 'Chrom ostygł, a miasto już zapomniało wasze ksywki.'}
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => (isGm ? setDismissed(true) : void logout())}
        >
          Teraz możesz bezpiecznie wyłączyć komputer
        </button>
      </div>
    </div>
  );
}
