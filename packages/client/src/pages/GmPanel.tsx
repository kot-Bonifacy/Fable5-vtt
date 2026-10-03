import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { CampaignDetail } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { activateCampaign } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { CreateCampaignForm } from '../components/CreateCampaignForm.js';
import { OwnerAccounts } from '../components/OwnerAccounts.js';
import { CampaignPlayers } from '../components/CampaignPlayers.js';

function CampaignCard({
  campaign,
  onChanged,
}: {
  campaign: CampaignDetail;
  onChanged: () => void;
}) {
  /**
   * Przełączenie stołu. Idzie gniazdem, nie RESTem, bo serwer musi przy okazji
   * przenieść **wszystkie** podpięte ekrany — do 22.08 zmieniała się sama nazwa
   * w nagłówku, a mapa, czat i kolejka inicjatywy zostawały przy poprzedniej
   * kampanii do przeładowania karty.
   */
  async function activate() {
    const ack = await activateCampaign(campaign.id);
    if (ack.ok) onChanged();
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
        {campaign.active ? (
          <span className="badge badge--ok">aktywna</span>
        ) : (
          <button type="button" className="small-button" onClick={() => void activate()}>
            Aktywuj
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
        hint="Nowa kampania staje się aktywna — poprzednie są dezaktywowane."
      />

      {campaigns === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : campaigns.length === 0 ? (
        <p className="placeholder-text">Nie masz jeszcze żadnej kampanii — utwórz pierwszą.</p>
      ) : (
        campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} onChanged={() => void refresh()} />
        ))
      )}

      {user.owner && <OwnerAccounts />}
    </div>
  );
}
