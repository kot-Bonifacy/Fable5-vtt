import { useEffect, useState, type FormEvent } from 'react';
import { BOT_TYPE_LABELS } from '@vtt/shared';
import { createBot, deleteBot, duplicateBot, updateBot } from '../socket.js';
import { useAiStore } from '../stores/aiStore.js';
import { ensureBotTemplatesLoaded, useBotStore } from '../stores/botStore.js';

function ackErrorText(code: string): string {
  switch (code) {
    case 'INVALID_NAME':
      return 'Imię bota musi mieć od 1 do 48 znaków.';
    case 'INVALID_DATA':
      return 'Szablon zawiera nieprawidłowe dane.';
    case 'BOT_NOT_FOUND':
      return 'Nie znaleziono bota — odśwież stronę.';
    case 'NO_CAMPAIGN':
      return 'Brak aktywnej kampanii.';
    default:
      return `Błąd: ${code}`;
  }
}

/**
 * GM-only side-panel tab: the campaign's bot roster. Creating from an
 * archetype, activating for the current session (stage 11 lets active bots
 * speak on chat), duplicating, archiving and deleting. The profile itself is
 * edited in a floating window, so the map stays visible during a session.
 */
export function BotPanel() {
  const bots = useBotStore((s) => s.bots);
  const order = useBotStore((s) => s.order);
  const templates = useBotStore((s) => s.templates);
  const openEditor = useBotStore((s) => s.openEditor);
  const available = useAiStore((s) => s.status.available);

  const [templateId, setTemplateId] = useState('');
  const [newName, setNewName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureBotTemplatesLoaded();
  }, []);

  const template = templates.find((entry) => entry.id === templateId) ?? null;

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    const name = (newName.trim() || template?.name || '').trim();
    if (name.length === 0) return;
    setError(null);
    const ack = await createBot({ name, ...(template ? { data: template.data } : {}) });
    if (!ack.ok) {
      setError(ackErrorText(ack.error));
      return;
    }
    setNewName('');
    if (ack.data) openEditor(ack.data.id);
  }

  async function toggle(botId: string, patch: { active?: boolean; archived?: boolean }) {
    const ack = await updateBot(botId, patch);
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  async function remove(botId: string, name: string) {
    if (!window.confirm(`Usunąć bota „${name}”? Tej operacji nie można cofnąć.`)) return;
    const ack = await deleteBot(botId);
    if (!ack.ok) setError(ackErrorText(ack.error));
  }

  async function copy(botId: string) {
    const ack = await duplicateBot(botId);
    if (!ack.ok) {
      setError(ackErrorText(ack.error));
      return;
    }
    if (ack.data) openEditor(ack.data.id);
  }

  const visible = order.filter((id) => showArchived || !bots[id]?.archived);
  const activeCount = order.filter((id) => bots[id]?.active).length;

  return (
    <div className="bot-panel">
      <div className="bot-panel-head">
        <span className={`badge ${available ? 'badge--ok' : 'badge--off'}`}>
          {available ? 'model gotowy' : 'boty offline'}
        </span>
        <span className="bot-panel-count">
          aktywne w sesji: {activeCount}/{order.length}
        </span>
      </div>
      {!available && (
        <p className="ai-form-hint">
          Profile edytujesz normalnie — rozmowa testowa wymaga uruchomionego AI Gateway.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="placeholder-text">Brak botów — utwórz pierwszego z szablonu poniżej.</p>
      ) : (
        <ul className="bot-list">
          {visible.map((id) => {
            const bot = bots[id];
            if (!bot) return null;
            const lessons = bot.data.lessons.filter((lesson) => lesson.enabled).length;
            return (
              <li key={id} className={`bot-row ${bot.archived ? 'bot-row--archived' : ''}`}>
                <button
                  type="button"
                  className="bot-open"
                  onClick={() => openEditor(id)}
                  title="Otwórz edytor bota"
                >
                  {bot.portraitUrl ? (
                    <img className="character-thumb" src={bot.portraitUrl} alt="" />
                  ) : (
                    <span className="character-thumb character-thumb--empty" aria-hidden>
                      ☻
                    </span>
                  )}
                  <span className="character-row-text">
                    <span className="character-row-name">{bot.name}</span>
                    <span className="character-row-meta">
                      {BOT_TYPE_LABELS[bot.data.type]}
                      {lessons > 0 ? ` · wnioski: ${lessons}` : ''}
                      {bot.archived ? ' · archiwum' : ''}
                    </span>
                  </span>
                </button>
                <span className="bot-row-actions">
                  <label className="bot-active" title="Bot bierze udział w bieżącej sesji">
                    <input
                      type="checkbox"
                      checked={bot.active}
                      onChange={(e) => void toggle(id, { active: e.target.checked })}
                    />
                    <span>w sesji</span>
                  </label>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => void copy(id)}
                    title="Duplikuj profil"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => void toggle(id, { archived: !bot.archived })}
                    title={bot.archived ? 'Przywróć z archiwum' : 'Archiwizuj'}
                  >
                    {bot.archived ? '↩' : '▤'}
                  </button>
                  <button
                    type="button"
                    className="small-button character-delete"
                    onClick={() => void remove(id, bot.name)}
                    title="Usuń bota"
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {order.some((id) => bots[id]?.archived) && (
        <label className="ai-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Pokaż archiwum</span>
        </label>
      )}

      <form className="scene-editor-row bot-create" onSubmit={(e) => void submitCreate(e)}>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          title="Archetyp startowy"
        >
          <option value="">Pusty profil</option>
          {templates.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          maxLength={48}
          placeholder={template ? template.name : 'Imię bota'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          className="small-button"
          disabled={newName.trim().length === 0 && !template}
        >
          Utwórz
        </button>
      </form>
      {template && <p className="ai-form-hint">{template.description}</p>}

      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
