import { useEffect, useState } from 'react';
import type { CampaignDetail, TokenPatch, TokenView } from '@vtt/shared';
import { TOKEN_HP_LIMIT, TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from '@vtt/shared';
import { apiGet } from '../api.js';
import { deleteToken, updateToken } from '../socket.js';
import { useTokenStore } from '../stores/tokenStore.js';
import type { TokenMenuState } from './MapArea.js';

const MENU_WIDTH = 240;

interface PlayerOption {
  id: string;
  name: string;
}

function TokenEditDialog({ token, onClose }: { token: TokenView; onClose: () => void }) {
  const [name, setName] = useState(token.name);
  const [size, setSize] = useState(token.size);
  const [ownerId, setOwnerId] = useState<string | ''>(token.ownerId ?? '');
  const [hasHp, setHasHp] = useState(token.hp != null);
  const [hpCurrent, setHpCurrent] = useState(token.hp?.current ?? 10);
  const [hpMax, setHpMax] = useState(token.hp?.max ?? 10);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<CampaignDetail[]>('/api/campaigns')
      .then((campaigns) => {
        const active = campaigns.find((c) => c.active);
        setPlayers(active?.players.map((p) => ({ id: p.id, name: p.name })) ?? []);
      })
      .catch(() => setPlayers([]));
  }, []);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Nazwa nie może być pusta.');
      return;
    }
    setSaving(true);
    setError(null);
    const patch: TokenPatch = {
      name: trimmed,
      size,
      ownerId: ownerId === '' ? null : ownerId,
      hp: hasHp ? { current: hpCurrent, max: hpMax } : null,
    };
    const ack = await updateToken(token.id, patch);
    setSaving(false);
    if (ack.ok) onClose();
    else setError('Nie udało się zapisać tokenu.');
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="panel-section-title">Edycja tokenu</h3>

        <label className="auth-label" htmlFor="token-name">
          Nazwa
        </label>
        <input
          id="token-name"
          type="text"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="auth-label" htmlFor="token-size">
          Rozmiar (kratki)
        </label>
        <select id="token-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {Array.from(
            { length: TOKEN_SIZE_MAX - TOKEN_SIZE_MIN + 1 },
            (_, i) => TOKEN_SIZE_MIN + i,
          ).map((s) => (
            <option key={s} value={s}>
              {s}×{s}
            </option>
          ))}
        </select>

        <label className="auth-label" htmlFor="token-owner">
          Właściciel
        </label>
        <select id="token-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— MG (NPC) —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label className="auth-label">
          <input type="checkbox" checked={hasHp} onChange={(e) => setHasHp(e.target.checked)} /> Pasek
          HP
        </label>
        {hasHp && (
          <div className="scene-editor-row">
            <input
              type="number"
              className="scene-number-input"
              min={0}
              max={TOKEN_HP_LIMIT}
              value={hpCurrent}
              onChange={(e) => setHpCurrent(Number(e.target.value))}
            />
            <span>/</span>
            <input
              type="number"
              className="scene-number-input"
              min={1}
              max={TOKEN_HP_LIMIT}
              value={hpMax}
              onChange={(e) => setHpMax(Number(e.target.value))}
            />
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}
        <div className="scene-editor-row">
          <button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
          <button type="button" className="small-button" onClick={onClose}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenContextMenu({
  menu,
  onClose,
}: {
  menu: TokenMenuState;
  onClose: () => void;
}) {
  const token = useTokenStore((s) => s.tokens[menu.tokenId]);
  const statuses = useTokenStore((s) => s.statuses);
  const [editing, setEditing] = useState(false);

  // The token can vanish under the open menu (deleted in another tab).
  useEffect(() => {
    if (!token) onClose();
  }, [token, onClose]);
  if (!token) return null;

  if (editing) {
    return (
      <TokenEditDialog
        token={token}
        onClose={() => {
          setEditing(false);
          onClose();
        }}
      />
    );
  }

  const left = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(menu.y, window.innerHeight - 320);

  function toggleStatus(statusId: string) {
    if (!token) return;
    const next = token.statuses.includes(statusId)
      ? token.statuses.filter((s) => s !== statusId)
      : [...token.statuses, statusId];
    void updateToken(token.id, { statuses: next });
  }

  async function remove() {
    if (!token) return;
    if (!window.confirm(`Usunąć token „${token.name}”?`)) return;
    await deleteToken(token.id);
    onClose();
  }

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }} />
      <div className="context-menu" style={{ left, top, width: MENU_WIDTH }}>
        <p className="context-menu-title">{token.name}</p>
        <button
          type="button"
          className="context-menu-item"
          onClick={() => void updateToken(token.id, { hidden: !token.hidden }).then(onClose)}
        >
          {token.hidden ? '👁 Pokaż graczom' : '🚫 Ukryj przed graczami'}
        </button>
        <button type="button" className="context-menu-item" onClick={() => setEditing(true)}>
          ✏️ Edytuj…
        </button>
        <button
          type="button"
          className="context-menu-item context-menu-item--danger"
          onClick={() => void remove()}
        >
          🗑 Usuń
        </button>
        {statuses.length > 0 && (
          <>
            <p className="context-menu-section">Statusy</p>
            <div className="context-menu-statuses">
              {statuses.map((status) => (
                <label key={status.id} className="context-menu-status">
                  <input
                    type="checkbox"
                    checked={token.statuses.includes(status.id)}
                    onChange={() => toggleStatus(status.id)}
                  />
                  <img src={status.icon} alt="" width={18} height={18} />
                  {status.name}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
