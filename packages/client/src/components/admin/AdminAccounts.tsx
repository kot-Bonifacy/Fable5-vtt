import { useState } from 'react';
import type { AdminDeleteAccountResult, GmAccountView, PasswordResetLink } from '@vtt/shared';
import {
  adminErrorText,
  aiAccessErrorText,
  gmAccountErrorText,
  gmPasswordError,
} from '@vtt/shared';
import { ApiError, apiDeleteJson, apiPost } from '../../api.js';
import { decideAi } from '../OwnerAi.js';
import { adminWhen } from './admin-format.js';

/**
 * Konta MG w panelu administratora (etap 53; do 53 — „Konta MG” w Panelu MG
 * właściciela). Hasło tymczasowe, link resetu, AI, blokada i usunięcie.
 * Konta MG właściciela (`.env`) panel nie zmienia — serwer odpowiada
 * `OWNER_ACCOUNT`, więc przyciski nie stoją wcale.
 */

function resetUrl(token: string): string {
  return `${window.location.origin}/reset/${token}`;
}

/** Hasło tymczasowe do podyktowania: bez znaków, które łatwo pomylić (0/O, 1/l). */
export function suggestTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return (
    adminErrorText(error.code) ??
    gmAccountErrorText(error.code) ??
    aiAccessErrorText(error.code) ??
    fallback
  );
}

const AI_LABEL: Record<GmAccountView['ai'], string> = {
  none: 'AI: brak',
  requested: 'AI: prośba',
  granted: 'AI: zgoda',
  rejected: 'AI: odrzucona',
  revoked: 'AI: cofnięta',
};

type Open = null | 'password' | 'delete';

function AccountRow({ account, onChanged }: { account: GmAccountView; onChanged: () => void }) {
  const [link, setLink] = useState<PasswordResetLink | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [temporary, setTemporary] = useState('');
  const [temporarySet, setTemporarySet] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(errorText(failure, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  function toggle(next: Exclude<Open, null>) {
    setError(null);
    setOpen((current) => (current === next ? null : next));
    if (next === 'password') {
      setTemporary(suggestTemporaryPassword());
      setTemporarySet(null);
    }
    if (next === 'delete') setConfirm('');
  }

  const setPassword = () =>
    run(async () => {
      const invalid = gmPasswordError(temporary, temporary, account.login);
      if (invalid) throw new ApiError(400, invalid);
      await apiPost(`/api/admin/accounts/${account.id}/password`, { password: temporary });
      setTemporarySet(temporary);
      setLink(null);
      onChanged();
    }, 'Nie udało się ustawić hasła.');

  const resetLink = () =>
    run(async () => {
      setLink(await apiPost<PasswordResetLink>(`/api/admin/accounts/${account.id}/reset`));
    }, 'Nie udało się wystawić linku.');

  const setBlocked = (blocked: boolean) =>
    run(
      async () => {
        await apiPost(`/api/admin/accounts/${account.id}/block`, { blocked });
        onChanged();
      },
      blocked ? 'Nie udało się zablokować konta.' : 'Nie udało się odblokować konta.',
    );

  const setAi = (grant: boolean) =>
    run(async () => {
      await decideAi(account.id, grant ? 'grant' : 'revoke');
      onChanged();
    }, 'Nie udało się zmienić dostępu do AI.');

  const remove = () =>
    run(async () => {
      await apiDeleteJson<AdminDeleteAccountResult>(`/api/admin/accounts/${account.id}`, {
        confirm,
      });
      onChanged();
    }, 'Nie udało się usunąć konta.');

  const confirmMatches = confirm.trim().toLowerCase() === account.login.toLowerCase();

  return (
    <li className="owner-account">
      <div className="owner-account-main">
        <strong className="owner-account-login">{account.login}</strong>
        {account.owner && (
          <span
            className="badge badge--ok"
            title="Konto MG z .env (GM_NAME). Hasło bierze się z .env, a jego kampanie mają AI zawsze."
          >
            właściciel
          </span>
        )}
        {account.blocked && <span className="badge badge--off">zablokowane</span>}
        {account.temporaryPassword && (
          <span
            className="badge badge--live"
            title="MG ustawi własne hasło przy najbliższym wejściu."
          >
            hasło tymczasowe
          </span>
        )}
        {account.sessionRunning && <span className="badge badge--live">sesja trwa</span>}
        {!account.owner && (
          <span className={`badge ${account.ai === 'granted' ? 'badge--ok' : 'badge--off'}`}>
            {AI_LABEL[account.ai]}
          </span>
        )}
        <span className="invite-expiry">
          założone {adminWhen(account.createdAt)} · kampanie: {account.campaigns} · ostatnio{' '}
          {adminWhen(account.lastSeenAt)}
        </span>
      </div>

      {!account.owner && (
        <div className="owner-account-actions admin-account-actions">
          <button
            type="button"
            className={`small-button${open === 'password' ? ' small-button--on' : ''}`}
            onClick={() => toggle('password')}
            title="Ustawiasz hasło, które przekazujesz MG poza VTT. Przy pierwszym wejściu MG musi je zmienić na własne. Wszystkie jego sesje zostają wylogowane."
          >
            Hasło tymczasowe
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() => void resetLink()}
            disabled={busy}
            title="Jednorazowy link do ustawienia nowego hasła, ważny 24 h. Przekaż go MG poza VTT (np. na Discordzie)."
          >
            Link resetu
          </button>
          {account.ai === 'granted' ? (
            <button
              type="button"
              className="small-button"
              onClick={() => void setAi(false)}
              disabled={busy}
              title="Boty tego MG gasną od razu, także w trakcie jego sesji."
            >
              Cofnij AI
            </button>
          ) : (
            <button
              type="button"
              className="small-button"
              onClick={() => void setAi(true)}
              disabled={busy}
              title="Zgoda na AI właściciela dla wszystkich kampanii tego MG, także przyszłych. Działa, gdy jesteś obecny i udostępniasz AI."
            >
              Nadaj AI
            </button>
          )}
          {account.blocked ? (
            <button
              type="button"
              className="small-button"
              onClick={() => void setBlocked(false)}
              disabled={busy}
            >
              Odblokuj
            </button>
          ) : (
            <button
              type="button"
              className="small-button small-button--danger"
              onClick={() => void setBlocked(true)}
              disabled={busy}
              title="Wylogowuje to konto wszędzie i nie wpuszcza go, dopóki nie odblokujesz. Kampanie zostają."
            >
              Zablokuj
            </button>
          )}
          <button
            type="button"
            className={`small-button small-button--danger${open === 'delete' ? ' small-button--on' : ''}`}
            onClick={() => toggle('delete')}
            title="Usuwa konto razem z jego kampaniami, plikami i kontami ich graczy. Tego nie da się cofnąć."
          >
            Usuń…
          </button>
        </div>
      )}

      {open === 'password' && (
        <div className="invite-row admin-inline-form">
          {temporarySet ? (
            <>
              <code className="invite-url">{temporarySet}</code>
              <span className="invite-expiry">ustawione — przekaż MG poza VTT</span>
              <button
                type="button"
                className="small-button"
                onClick={() => void copy(temporarySet)}
              >
                {copied === temporarySet ? 'Skopiowano!' : 'Kopiuj'}
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                className="admin-inline-input"
                aria-label={`Hasło tymczasowe dla ${account.login}`}
                value={temporary}
                onChange={(event) => setTemporary(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="small-button small-button--primary"
                onClick={() => void setPassword()}
                disabled={busy}
              >
                Ustaw
              </button>
            </>
          )}
        </div>
      )}

      {open === 'delete' && (
        <div className="invite-row admin-inline-form">
          <span className="invite-expiry">
            Wpisz login <strong>{account.login}</strong>, żeby usunąć konto, {account.campaigns}{' '}
            kampanii i ich graczy:
          </span>
          <input
            type="text"
            className="admin-inline-input"
            aria-label={`Potwierdź login ${account.login}`}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="small-button small-button--danger"
            onClick={() => void remove()}
            disabled={busy || !confirmMatches}
          >
            Usuń na zawsze
          </button>
        </div>
      )}

      {link && (
        <div className="invite-row">
          <code className="invite-url">{resetUrl(link.token)}</code>
          <span className="invite-expiry">jednorazowy, do {adminWhen(link.expiresAt)}</span>
          <button
            type="button"
            className="small-button"
            onClick={() => void copy(resetUrl(link.token))}
          >
            {copied === resetUrl(link.token) ? 'Skopiowano!' : 'Kopiuj'}
          </button>
        </div>
      )}
      {error && <p className="auth-error">{error}</p>}
    </li>
  );
}

export function AdminAccounts({
  accounts,
  onChanged,
}: {
  accounts: GmAccountView[] | null;
  onChanged: () => void;
}) {
  return (
    <section className="panel-card owner-accounts">
      <header className="panel-card-header">
        <h2>Konta MG</h2>
      </header>
      {accounts === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : accounts.length === 0 ? (
        <p className="placeholder-text">Nie ma jeszcze żadnego konta MG.</p>
      ) : (
        <ul className="owner-account-list">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
