import { useState } from 'react';
import type { AdminRunningSession, AdminSessionsView } from '@vtt/shared';
import { adminErrorText, sessionEndReasonLabel } from '@vtt/shared';
import { ApiError, apiPost } from '../../api.js';
import { adminDuration, adminWhen } from './admin-format.js';

/**
 * Sesje w panelu administratora (etap 53): trwające, z „Zakończ sesję” dla
 * porzuconej albo zawieszonej, i dziennik. Dziennik zaczyna się od etapu 53 —
 * wcześniejszych sesji serwer nigdzie nie zapisywał.
 */

function RunningRow({
  session,
  onChanged,
}: {
  session: AdminRunningSession;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setError(null);
    try {
      await apiPost(`/api/admin/sessions/${session.campaignId}/end`);
      onChanged();
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : '';
      setError(adminErrorText(code) ?? 'Nie udało się zakończyć sesji.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <li className="owner-account">
      <div className="owner-account-main">
        <strong className="owner-account-login">{session.campaignName}</strong>
        <span className="badge badge--live">
          od {adminWhen(session.startedAt)} · {adminDuration(session.startedAt, null)}
        </span>
        {session.aiHolder && (
          <span className="badge badge--ok" title="Ta sesja trzyma teraz AI właściciela.">
            AI
          </span>
        )}
        <span className="invite-expiry">
          MG {session.gmLogin} · przy stole:{' '}
          {session.atTable.length > 0 ? session.atTable.join(', ') : 'nikt z graczy'}
        </span>
        <span className="owner-account-actions">
          {confirming ? (
            <>
              <button
                type="button"
                className="small-button small-button--danger"
                onClick={() => void end()}
              >
                Tak, zakończ
              </button>
              <button type="button" className="small-button" onClick={() => setConfirming(false)}>
                Nie
              </button>
            </>
          ) : (
            <button
              type="button"
              className="small-button"
              onClick={() => setConfirming(true)}
              title="Gracze wracają do widoku „Między sesjami”, MG zostaje w przygotowaniu i dostaje wpis na czacie. Slot się zwalnia."
            >
              Zakończ sesję
            </button>
          )}
        </span>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </li>
  );
}

export function AdminSessions({
  view,
  onChanged,
}: {
  view: AdminSessionsView | null;
  onChanged: () => void;
}) {
  return (
    <section className="panel-card">
      <header className="panel-card-header">
        <h2>Sesje</h2>
        {view && view.maxSessions > 0 && (
          <span
            className="badge badge--off"
            title="Ile sesji serwer prowadzi naraz (VTT_MAX_SESSIONS). Przygotowanie kampanii nie zajmuje miejsca."
          >
            zajęte {view.running.length} z {view.maxSessions}
          </span>
        )}
      </header>
      {view === null ? (
        <p className="placeholder-text">Ładowanie…</p>
      ) : (
        <>
          {view.running.length === 0 ? (
            <p className="placeholder-text">Żadna sesja teraz nie trwa.</p>
          ) : (
            <ul className="owner-account-list">
              {view.running.map((session) => (
                <RunningRow key={session.campaignId} session={session} onChanged={onChanged} />
              ))}
            </ul>
          )}

          <h3 className="panel-section-title">Dziennik sesji</h3>
          {view.history.length === 0 ? (
            <p className="placeholder-text">
              Dziennik jest pusty — zapisuje sesje od wdrożenia panelu administratora.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Start</th>
                    <th scope="col">Czas</th>
                    <th scope="col">Kampania</th>
                    <th scope="col">MG</th>
                    <th scope="col">Gracze</th>
                    <th scope="col">Koniec</th>
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((row) => (
                    <tr key={row.id}>
                      <td>{adminWhen(row.startedAt)}</td>
                      <td>{adminDuration(row.startedAt, row.endedAt)}</td>
                      <td>
                        {row.campaignName}
                        {row.campaignId === null && (
                          <span className="admin-table-note"> (usunięta)</span>
                        )}
                      </td>
                      <td>{row.gmLogin}</td>
                      <td>{row.players.length > 0 ? row.players.join(', ') : '—'}</td>
                      <td title={row.endedAt ? adminWhen(row.endedAt) : undefined}>
                        {sessionEndReasonLabel(row.endReason)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
