import { useState, type FormEvent } from 'react';
import type { CampaignDetail, InvitationState, InvitationSummary } from '@vtt/shared';
import {
  PLAYER_COLORS,
  PLAYER_COLOR_LABELS,
  PLAYER_NAME_MAX_LENGTH,
  isPlayerColor,
  playerColors,
  playerInitial,
} from '@vtt/shared';
import { ApiError, apiPost } from '../api.js';

function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

const STATE_LABEL: Record<InvitationState, string> = {
  waiting: 'czeka',
  used: 'w użyciu',
  expired: 'wygasł',
  revoked: 'unieważniony',
};

/** Link wpuszcza: czeka na pierwsze wejście albo jest już stałym kluczem gracza (24.10). */
const isLive = (invitation: InvitationSummary): boolean =>
  invitation.state === 'waiting' || invitation.state === 'used';

/** Link do schowka; przeglądarka bez dostępu do schowka zostawia go na liście do ręcznego skopiowania. */
async function copyLink(token: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(inviteUrl(token));
    return true;
  } catch {
    return false;
  }
}

function InvitationRow({
  invitation,
  cardName,
  onRevoke,
}: {
  invitation: InvitationSummary;
  /** Etap 57a: karta, którą link przypisze graczowi. */
  cardName: string | null;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const live = isLive(invitation);

  async function copy() {
    if (await copyLink(invitation.token)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <li className="invite-row">
      <strong className="invite-name">{invitation.name ?? 'bez imienia'}</strong>
      <span className="invite-expiry">
        {invitation.renewal ? 'odnowienie' : invitation.name ? 'nowy gracz' : 'stary link'}
      </span>
      {cardName && <span className="invite-expiry">z kartą „{cardName}”</span>}
      <span className={`badge ${live ? 'badge--ok' : 'badge--off'}`}>
        {STATE_LABEL[invitation.state]}
      </span>
      <span className="invite-expiry">
        {invitation.usedAt
          ? `pierwsze wejście ${new Date(invitation.usedAt).toLocaleString('pl-PL')}`
          : invitation.expiresAt
            ? `do ${new Date(invitation.expiresAt).toLocaleString('pl-PL')}`
            : 'bez terminu'}
      </span>
      {live && (
        <>
          <code className="invite-url">{inviteUrl(invitation.token)}</code>
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

function issueErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NAME_TAKEN') {
    return 'Przy tym stole ktoś już nosi to imię albo czeka na nie link — wybierz inne.';
  }
  if (error instanceof ApiError && error.code === 'CHARACTER_NOT_FOUND') {
    return 'Ta karta ma już gracza albo zniknęła — odśwież listę.';
  }
  if (error instanceof ApiError && error.code === 'INVALID_NAME') {
    return `Imię gracza: od 1 do ${PLAYER_NAME_MAX_LENGTH} znaków.`;
  }
  return 'Nie udało się wystawić linku. Spróbuj ponownie.';
}

/**
 * Gracze kampanii i ich imienne linki (etap 44b). Link jest stałym kluczem do
 * jednego miejsca przy stole (24.10): „Nowy gracz” wypisuje imię i daje link,
 * który zakłada konto, a potem wpuszcza na nie za każdym razem. „Link
 * odnowienia” przy graczu to nowy klucz w miejsce zgubionego — poprzednie
 * przestają działać. Świeży link od razu trafia do schowka, bo następny krok
 * MG to wkleić go graczowi na Discordzie.
 */
export function CampaignPlayers({
  campaign,
  onChanged,
}: {
  campaign: CampaignDetail;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [cardId, setCardId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSpent, setShowSpent] = useState(false);

  const live = campaign.invitations.filter(isLive);
  // Etap 57a: karty z pliku, które czekają na gracza — „ta karta jest twoja”.
  const pendingCards = campaign.pendingCards ?? [];
  const cardName = (link: InvitationSummary) =>
    pendingCards.find((card) => card.id === link.characterId)?.name ?? null;
  const spent = campaign.invitations.filter((link) => !isLive(link));
  // Kolor na czacie (60c): wybrany albo z palety po kolejności dołączenia.
  const colors = playerColors(campaign.players.map((player) => ({ ...player, userId: player.id })));

  async function setColor(playerId: string, value: string) {
    setError(null);
    try {
      await apiPost(`/api/campaigns/${campaign.id}/players/${playerId}/color`, {
        color: isPlayerColor(value) ? value : null,
      });
      onChanged();
    } catch {
      setError('Nie udało się zmienić koloru. Spróbuj ponownie.');
    }
  }

  async function issue(url: string, body: unknown, who: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const link = await apiPost<InvitationSummary>(url, body);
      const copied = await copyLink(link.token);
      setNotice(
        copied
          ? `Link dla gracza ${who} jest w schowku — wyślij mu go. Działa bez terminu, za każdym razem.`
          : `Link dla gracza ${who} czeka na liście niżej — skopiuj go i wyślij.`,
      );
      onChanged();
      return true;
    } catch (err) {
      setError(issueErrorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function newPlayer(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    const body = { name: trimmed, ...(cardId ? { characterId: cardId } : {}) };
    if (await issue(`/api/campaigns/${campaign.id}/invitations`, body, trimmed)) {
      setName('');
      setCardId('');
    }
  }

  async function revoke(invitationId: string) {
    await apiPost(`/api/invitations/${invitationId}/revoke`);
    onChanged();
  }

  return (
    <>
      <h3 className="panel-section-title">Gracze ({campaign.players.length})</h3>
      {campaign.players.length === 0 ? (
        <p className="placeholder-text">Nikt jeszcze nie dołączył.</p>
      ) : (
        <ul className="player-list">
          {campaign.players.map((player) => (
            <li key={player.id} className="player-row">
              <span className="player-swatch" data-author-color={colors.get(player.id)} aria-hidden>
                {playerInitial(player.name)}
              </span>
              <span>{player.name}</span>
              <select
                className="player-color-select"
                value={player.color ?? ''}
                aria-label={`Kolor gracza ${player.name} na czacie`}
                title="Kolor gracza na czacie — pasek przy jego kartach i kropka przy nicku, ten sam u całego stołu"
                onChange={(event) => void setColor(player.id, event.target.value)}
              >
                <option value="">
                  z kolejności ({PLAYER_COLOR_LABELS[colors.get(player.id) ?? PLAYER_COLORS[0]]})
                </option>
                {PLAYER_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {PLAYER_COLOR_LABELS[color]}
                  </option>
                ))}
              </select>
              <span className="invite-expiry">
                dołączył(a) {new Date(player.joinedAt).toLocaleDateString('pl-PL')}
              </span>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                title="Gracz zgubił link albo wyciekł: nowy link na to samo konto, poprzednie przestają działać, zalogowane urządzenia zostają"
                onClick={() =>
                  void issue(
                    `/api/campaigns/${campaign.id}/players/${player.id}/renewal`,
                    undefined,
                    player.name,
                  )
                }
              >
                Link odnowienia
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="form-row new-player-form" onSubmit={(event) => void newPlayer(event)}>
        <label className="visually-hidden" htmlFor={`new-player-${campaign.id}`}>
          Imię nowego gracza
        </label>
        <input
          id={`new-player-${campaign.id}`}
          type="text"
          maxLength={PLAYER_NAME_MAX_LENGTH}
          placeholder="Imię nowego gracza"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {pendingCards.length > 0 && (
          <select
            value={cardId}
            aria-label="Karta dla nowego gracza"
            title="Karta z pliku, która czeka na gracza — link przypisze mu ją przy wejściu"
            onChange={(event) => {
              const card = pendingCards.find((row) => row.id === event.target.value);
              setCardId(event.target.value);
              if (card && !name.trim()) setName(card.pendingOwner);
            }}
          >
            <option value="">bez karty</option>
            {pendingCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name} (czeka: {card.pendingOwner})
              </option>
            ))}
          </select>
        )}
        <button className="primary-button" type="submit" disabled={busy || !name.trim()}>
          Nowy gracz
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-hint">{notice}</p>}

      <h3 className="panel-section-title">Linki</h3>
      {live.length === 0 && <p className="placeholder-text">Żaden link nie jest ważny.</p>}
      <ul className="invite-list">
        {live.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            cardName={cardName(invitation)}
            onRevoke={(id) => void revoke(id)}
          />
        ))}
      </ul>
      {spent.length > 0 && (
        <>
          <button
            type="button"
            className="small-button"
            aria-expanded={showSpent}
            onClick={() => setShowSpent((value) => !value)}
          >
            {showSpent ? 'Ukryj' : 'Pokaż'} nieważne ({spent.length})
          </button>
          {showSpent && (
            <ul className="invite-list">
              {spent.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  cardName={null}
                  onRevoke={(id) => void revoke(id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
