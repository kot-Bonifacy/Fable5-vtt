import { useCallback, useEffect, useState } from 'react';
import type { GmAccountView, PasswordResetLink } from '@vtt/shared';
import { apiGet, apiPost } from '../api.js';

function resetUrl(token: string): string {
  return `${window.location.origin}/reset/${token}`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccountRow({ account, onChanged }: { account: GmAccountView; onChanged: () => void }) {
  const [link, setLink] = useState<PasswordResetLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setError(null);
    try {
      setLink(await apiPost<PasswordResetLink>(`/api/owner/accounts/${account.id}/reset`));
      setCopied(false);
    } catch {
      setError('Nie udało się wystawić linku.');
    }
  }

  async function setBlocked(blocked: boolean) {
    setError(null);
    try {
      await apiPost(`/api/owner/accounts/${account.id}/block`, { blocked });
      onChanged();
    } catch {
      setError(blocked ? 'Nie udało się zablokować konta.' : 'Nie udało się odblokować konta.');
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(resetUrl(link.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="owner-account">
      <div className="owner-account-main">
        <strong className="owner-account-login">{account.login}</strong>
        {account.owner && <span className="badge badge--ok">właściciel</span>}
        {account.blocked && <span className="badge badge--off">zablokowane</span>}
        <span className="invite-expiry">
          założone {when(account.createdAt)} · kampanie: {account.campaigns} · ostatnio{' '}
          {when(account.lastSeenAt)}
        </span>
        {!account.owner && (
          <span className="owner-account-actions">
            <button
              type="button"
              className="small-button"
              onClick={() => void reset()}
              title="Jednorazowy link do ustawienia nowego hasła, ważny 24 h. Przekaż go MG poza VTT (np. na Discordzie)."
            >
              Zresetuj hasło
            </button>
            {account.blocked ? (
              <button type="button" className="small-button" onClick={() => void setBlocked(false)}>
                Odblokuj
              </button>
            ) : (
              <button
                type="button"
                className="small-button small-button--danger"
                onClick={() => void setBlocked(true)}
                title="Wylogowuje to konto wszędzie i nie wpuszcza go, dopóki nie odblokujesz. Kampanie zostają."
              >
                Zablokuj
              </button>
            )}
          </span>
        )}
      </div>
      {link && (
        <div className="invite-row">
          <code className="invite-url">{resetUrl(link.token)}</code>
          <span className="invite-expiry">jednorazowy, do {when(link.expiresAt)}</span>
          <button type="button" className="small-button" onClick={() => void copy()}>
            {copied ? 'Skopiowano!' : 'Kopiuj'}
          </button>
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}
    </li>
  );
}

/**
 * Panel właściciela serwera (etap 44a): konta MG, reset hasła, blokada.
 * Stoi w Panelu MG tylko dla konta z flagą właściciela — serwer pilnuje tego
 * niezależnie (`requireOwner`).
 */
export function OwnerAccounts() {
  const [accounts, setAccounts] = useState<GmAccountView[] | null>(null);

  const refresh = useCallback(async () => {
    setAccounts(await apiGet<GmAccountView[]>('/api/owner/accounts'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="panel-card owner-accounts">
      <header className="panel-card-header">
        <h2>Konta MG</h2>
        <span className="badge badge--off">tylko właściciel</span>
      </header>
      {accounts === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : (
        <ul className="owner-account-list">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} onChanged={() => void refresh()} />
          ))}
        </ul>
      )}
    </section>
  );
}
