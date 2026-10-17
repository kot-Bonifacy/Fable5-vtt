import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { CampaignDetail } from '@vtt/shared';
import { sessionErrorText } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { openCampaign } from '../socket.js';
import { formatSessionClock } from '../session-view.js';
import { useAuthStore } from '../stores/authStore.js';
import { CreateCampaignForm } from '../components/CreateCampaignForm.js';
import { AiAccessRequest } from '../components/AiAccessRequest.js';
import { CampaignPlayers } from '../components/CampaignPlayers.js';

function CampaignCard({
  campaign,
  runningElsewhere,
  onChanged,
}: {
  campaign: CampaignDetail;
  /** Nazwa innej kampanii tego MG z trwającą sesją — wtedy „Otwórz” czeka. */
  runningElsewhere: string | null;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  /**
   * Przejście do innej kampanii (etap 44c; do 44b „Aktywuj”, które przenosiło
   * cały serwer). Idzie gniazdem, nie RESTem, bo serwer przenosi przy okazji
   * wszystkie ekrany **tego MG** — gracze nie zauważają niczego.
   */
  async function open() {
    setError(null);
    const ack = await openCampaign(campaign.id);
    if (ack.ok) onChanged();
    else setError(sessionErrorText(ack.error) ?? 'Nie udało się otworzyć kampanii.');
  }

  /**
   * Poligon czy stół (postulat MG z 22.08). Bez potwierdzenia w obie strony —
   * flaga niczego nie kasuje i przestawia się jednym kliknięciem z powrotem.
   */
  async function toggleSandbox() {
    await apiPost(`/api/campaigns/${campaign.id}/sandbox`, { sandbox: !campaign.sandbox });
    onChanged();
  }

  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h2>{campaign.name}</h2>
        {campaign.sessionStartedAt && (
          <span className="badge badge--live" title="Gracze tej kampanii są przy stole">
            sesja od {formatSessionClock(campaign.sessionStartedAt)}
          </span>
        )}
        {campaign.open ? (
          <span className="badge badge--ok">otwarta</span>
        ) : (
          <button
            type="button"
            className="small-button"
            onClick={() => void open()}
            disabled={runningElsewhere !== null}
            title={
              runningElsewhere
                ? `Najpierw zakończ sesję w kampanii „${runningElsewhere}”`
                : 'Przejdź do tej kampanii — przygotowanie nie zajmuje miejsca na sesję'
            }
          >
            Otwórz
          </button>
        )}
        <button
          type="button"
          className={`small-button ${campaign.sandbox ? 'small-button--on' : ''}`}
          onClick={() => void toggleSandbox()}
          title={
            campaign.sandbox
              ? 'Kampania testowa: chip „poligon" w pasku, kasowanie nie dopytuje o nazwę'
              : 'Oznacz jako testową — wtedy widać w pasku, że wolno tu wszystko zepsuć'
          }
        >
          {campaign.sandbox ? '🧪 Poligon' : 'Oznacz jako poligon'}
        </button>
      </header>

      {error && <p className="auth-error">{error}</p>}
      <CampaignPlayers campaign={campaign} onChanged={onChanged} />
    </section>
  );
}

export function GmPanel() {
  const user = useAuthStore((s) => s.user);
  const [campaigns, setCampaigns] = useState<CampaignDetail[] | null>(null);

  const refresh = useCallback(async () => {
    setCampaigns(await apiGet<CampaignDetail[]>('/api/campaigns'));
    // Active campaign may have changed — keep the auth store in sync.
    await useAuthStore.getState().initialize();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (user?.role !== 'GM') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="gm-panel">
      <header className="gm-panel-header">
        <h1>Panel Mistrza Gry</h1>
        <Link className="top-bar-link" to="/">
          ← Wróć do gry
        </Link>
      </header>

      <CreateCampaignForm
        onCreated={refresh}
        hint="Nowa kampania otwiera się u Ciebie do przygotowania — gracze zobaczą stół dopiero po „Rozpocznij sesję”."
      />

      {campaigns === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : campaigns.length === 0 ? (
        <p className="placeholder-text">Nie masz jeszcze żadnej kampanii — utwórz pierwszą.</p>
      ) : (
        campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            runningElsewhere={
              campaigns.find((other) => other.id !== campaign.id && other.sessionStartedAt)?.name ??
              null
            }
            onChanged={() => void refresh()}
          />
        ))
      )}

      {/* Konto MG właściciela ma AI zawsze, a konta MG, prośby o AI i kopie
          całej bazy prowadzi od etapu 53 konto administratora. */}
      {user.owner ? (
        <p className="placeholder-text">
          Twoje kampanie mają AI zawsze. Konta MG, prośby o AI, sesje i kopie całej bazy są w panelu
          administratora.
        </p>
      ) : (
        <AiAccessRequest />
      )}
    </div>
  );
}
