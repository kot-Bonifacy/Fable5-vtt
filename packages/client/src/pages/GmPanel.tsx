import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { CampaignDetail, CampaignSummary, InvitationSummary } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';
import { useAuthStore } from '../stores/authStore.js';

function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

function InvitationRow({
  invitation,
  onRevoke,
}: {
  invitation: InvitationSummary;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const expired = new Date(invitation.expiresAt).getTime() <= Date.now();
  const status = invitation.revoked ? 'unieważniony' : expired ? 'wygasł' : 'aktywny';

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl(invitation.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="invite-row">
      <code className="invite-url">{inviteUrl(invitation.token)}</code>
      <span className={`badge ${status === 'aktywny' ? 'badge--ok' : 'badge--off'}`}>{status}</span>
      <span className="invite-expiry">
        do {new Date(invitation.expiresAt).toLocaleString('pl-PL')}
      </span>
      {status === 'aktywny' && (
        <>
          <button type="button" className="small-button" onClick={() => void copy()}>
            {copied ? 'Skopiowano!' : 'Kopiuj'}
          </button>
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => onRevoke(invitation.id)}
          >
            Unieważnij
          </button>
        </>
      )}
    </li>
  );
}

function CampaignCard({
  campaign,
  onChanged,
}: {
  campaign: CampaignDetail;
  onChanged: () => void;
}) {
  async function createInvitation() {
    await apiPost(`/api/campaigns/${campaign.id}/invitations`);
    onChanged();
  }

  async function revoke(invitationId: string) {
    await apiPost(`/api/invitations/${invitationId}/revoke`);
    onChanged();
  }

  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h2>{campaign.name}</h2>
        {campaign.active && <span className="badge badge--ok">aktywna</span>}
      </header>

      <h3 className="panel-section-title">Gracze ({campaign.players.length})</h3>
      {campaign.players.length === 0 ? (
        <p className="placeholder-text">Nikt jeszcze nie dołączył.</p>
      ) : (
        <ul className="player-list">
          {campaign.players.map((player) => (
            <li key={player.id}>
              {player.name}
              <span className="invite-expiry">
                {' '}
                — dołączył(a) {new Date(player.joinedAt).toLocaleDateString('pl-PL')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="panel-section-title">Linki zaproszeń</h3>
      {campaign.invitations.length === 0 && (
        <p className="placeholder-text">Brak linków — wygeneruj pierwszy.</p>
      )}
      <ul className="invite-list">
        {campaign.invitations.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            onRevoke={(id) => void revoke(id)}
          />
        ))}
      </ul>
      <button type="button" onClick={() => void createInvitation()}>
        Nowy link zaproszenia (ważny 7 dni)
      </button>
    </section>
  );
}

export function GmPanel() {
  const user = useAuthStore((s) => s.user);
  const [campaigns, setCampaigns] = useState<CampaignDetail[] | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await apiPost<CampaignSummary>('/api/campaigns', { name: trimmed });
      setNewName('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gm-panel">
      <header className="gm-panel-header">
        <h1>Panel Mistrza Gry</h1>
        <Link className="top-bar-link" to="/">
          ← Wróć do gry
        </Link>
      </header>

      <form className="panel-card new-campaign-form" onSubmit={createCampaign}>
        <label className="auth-label" htmlFor="campaign-name">
          Nowa kampania
        </label>
        <div className="form-row">
          <input
            id="campaign-name"
            type="text"
            maxLength={64}
            placeholder="np. Ulice Night City"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={busy || newName.trim().length === 0}>
            Utwórz
          </button>
        </div>
        <p className="auth-hint">Nowa kampania staje się aktywna — poprzednie są dezaktywowane.</p>
      </form>

      {campaigns === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : campaigns.length === 0 ? (
        <p className="placeholder-text">Nie masz jeszcze żadnej kampanii — utwórz pierwszą.</p>
      ) : (
        campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} onChanged={() => void refresh()} />
        ))
      )}
    </div>
  );
}
