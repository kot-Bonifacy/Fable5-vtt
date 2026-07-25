import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import type {
  BotLesson,
  BotProfileData,
  BotType,
  BotView,
  PortraitUploadResult,
} from '@vtt/shared';
import {
  BOT_CATCHPHRASES_MAX,
  BOT_CORRECTION_MAX_LENGTH,
  BOT_FIELD_MAX_LENGTH,
  BOT_LESSON_MAX_LENGTH,
  BOT_MAX_TOKENS_MAX,
  BOT_MAX_TOKENS_MIN,
  BOT_PROMPT_VERSION,
  BOT_TEMPERATURE_MAX,
  BOT_TEMPERATURE_MIN,
  BOT_TEST_MESSAGE_MAX_LENGTH,
  BOT_TYPES,
  BOT_TYPE_LABELS,
  compileBotPrompt,
  defaultBotGeneration,
  estimatePromptTokens,
} from '@vtt/shared';
import { ApiError, apiUpload } from '../api.js';
import { cancelBotChat, flushBotSave, queueBotSave, sendBotChat, teachBot } from '../socket.js';
import { useBotStore, type BotTestTurn } from '../stores/botStore.js';
import { useAiStore } from '../stores/aiStore.js';
import { useCharacterStore } from '../stores/characterStore.js';

type EditorTab = 'role' | 'knowledge' | 'lessons' | 'chat' | 'prompt';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'role', label: 'Rola' },
  { id: 'knowledge', label: 'Wiedza i model' },
  { id: 'lessons', label: 'Wnioski' },
  { id: 'chat', label: 'Rozmowa testowa' },
  { id: 'prompt', label: 'Prompt' },
];

function portraitErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  switch (code) {
    case 'FILE_TOO_LARGE':
      return 'Plik jest za duży (limit 8 MB).';
    case 'UNSUPPORTED_IMAGE':
      return 'Nieobsługiwany format — użyj PNG, JPG lub WebP.';
    case 'IMAGE_TOO_LARGE':
      return 'Obraz jest za duży (maks. 2048 px na bok).';
    default:
      return 'Nie udało się wgrać portretu.';
  }
}

/** Renders every open bot editor as its own floating window (last one on top). */
export function BotEditors() {
  const openEditors = useBotStore((s) => s.openEditors);
  return (
    <>
      {openEditors.map((id, index) => (
        <BotEditorWindow key={id} botId={id} stackIndex={index} />
      ))}
    </>
  );
}

function BotEditorWindow({ botId, stackIndex }: { botId: string; stackIndex: number }) {
  const bot = useBotStore((s) => s.bots[botId]);
  const saveState = useBotStore((s) => s.saveStates[botId]);
  const closeEditor = useBotStore((s) => s.closeEditor);
  const focusEditor = useBotStore((s) => s.focusEditor);

  const [tab, setTab] = useState<EditorTab>('role');
  const [position, setPosition] = useState(() => ({
    x: 120 + (stackIndex % 6) * 28,
    y: 60 + (stackIndex % 6) * 24,
  }));
  /** Prefilled by „zapisz jako wniosek" on a slip — shared with the lessons tab. */
  const [correctionDraft, setCorrectionDraft] = useState('');
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    // Buffered edits must not be lost when the window unmounts.
    return () => flushBotSave(botId);
  }, [botId]);

  if (!bot) return null;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, input')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 120, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  function saveName(value: string) {
    if (value.trim().length === 0 || value.length > 48) return;
    queueBotSave(botId, { name: value });
  }

  /** Every profile edit reaches the bot's next line — nothing is cached. */
  function saveData(patch: Partial<BotProfileData>) {
    queueBotSave(botId, { data: patch });
  }

  const saveLabel =
    saveState === 'saving' ? 'Zapisywanie…' : saveState === 'error' ? 'Błąd zapisu!' : '';

  return (
    <section
      className="sheet-window bot-window"
      style={{ left: position.x, top: position.y, zIndex: 300 + stackIndex }}
      onPointerDown={() => focusEditor(botId)}
      aria-label={`Edytor bota: ${bot.name}`}
    >
      <div
        className="sheet-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {bot.portraitUrl ? (
          <img className="sheet-header-portrait" src={bot.portraitUrl} alt="" />
        ) : null}
        <input
          className="sheet-name"
          type="text"
          maxLength={48}
          value={bot.name}
          onChange={(e) => saveName(e.target.value)}
          title="Imię bota"
        />
        <span className={`sheet-save sheet-save--${saveState ?? 'idle'}`}>{saveLabel}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => closeEditor(botId)}
          title="Zamknij edytor"
        >
          ✕
        </button>
      </div>

      <nav className="sheet-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sheet-tab ${tab === t.id ? 'sheet-tab--active' : ''}`}
            onClick={() => {
              flushBotSave(botId);
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="sheet-body">
        {tab === 'role' && <RoleTab bot={bot} saveData={saveData} />}
        {tab === 'knowledge' && <KnowledgeTab bot={bot} saveData={saveData} />}
        {tab === 'lessons' && (
          <LessonsTab
            bot={bot}
            saveData={saveData}
            draft={correctionDraft}
            setDraft={setCorrectionDraft}
          />
        )}
        {tab === 'chat' && (
          <ChatTab
            bot={bot}
            onTeach={(text) => {
              setCorrectionDraft(text);
              setTab('lessons');
            }}
          />
        )}
        {tab === 'prompt' && <PromptTab bot={bot} />}
      </div>
    </section>
  );
}

interface TabProps {
  bot: BotView;
  saveData: (patch: Partial<BotProfileData>) => void;
}

function RoleTab({ bot, saveData }: TabProps) {
  const data = bot.data;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function setPersona(patch: Partial<BotProfileData['persona']>) {
    saveData({ persona: { ...data.persona, ...patch } });
  }

  function setType(type: BotType) {
    // Thinking blocks and answer length differ per type — follow the default
    // unless the GM has already tuned it.
    saveData({ type, generation: defaultBotGeneration(type) });
  }

  async function uploadPortrait(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await apiUpload<PortraitUploadResult>('/api/uploads/portraits', file);
      queueBotSave(bot.id, { portraitUrl: result.url });
      flushBotSave(bot.id);
    } catch (error) {
      setUploadError(portraitErrorText(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bot-form">
      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Typ bota</span>
          <select value={data.type} onChange={(e) => setType(e.target.value as BotType)}>
            {BOT_TYPES.map((type) => (
              <option key={type} value={type}>
                {BOT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Portret</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(e) => void uploadPortrait(e.target.files?.[0])}
          />
        </label>
      </div>
      {uploadError && <p className="auth-error">{uploadError}</p>}

      <BotTextField
        label="Osobowość"
        hint="Kim jest, jak się zachowuje, co go wyróżnia."
        value={data.persona.personality}
        onChange={(value) => setPersona({ personality: value })}
      />
      <BotTextField
        label="Motywacje i cele"
        hint="Czego chce teraz, o co gra."
        value={data.persona.motivations}
        onChange={(value) => setPersona({ motivations: value })}
      />
      <BotTextField
        label="Sekrety"
        hint="Nie zdradza ich wprost — może kłamać albo zmienić temat."
        value={data.persona.secrets}
        onChange={(value) => setPersona({ secrets: value })}
      />
      <BotTextField
        label="Styl wypowiedzi"
        hint="Rytm zdań, słownictwo, sposób zwracania się do ludzi."
        value={data.persona.speechStyle}
        onChange={(value) => setPersona({ speechStyle: value })}
      />

      <div className="bot-field">
        <span className="auth-label">
          Przykładowe odzywki ({data.persona.catchphrases.length}/{BOT_CATCHPHRASES_MAX})
        </span>
        <p className="bot-hint">Najskuteczniejszy sposób na utrzymanie stylu w małym modelu.</p>
        {data.persona.catchphrases.map((phrase, index) => (
          <div key={index} className="bot-phrase-row">
            <input
              type="text"
              maxLength={200}
              value={phrase}
              onChange={(e) => {
                const next = [...data.persona.catchphrases];
                next[index] = e.target.value;
                setPersona({ catchphrases: next });
              }}
            />
            <button
              type="button"
              className="small-button"
              title="Usuń odzywkę"
              onClick={() =>
                setPersona({
                  catchphrases: data.persona.catchphrases.filter((_, i) => i !== index),
                })
              }
            >
              ✕
            </button>
          </div>
        ))}
        {data.persona.catchphrases.length < BOT_CATCHPHRASES_MAX && (
          <button
            type="button"
            className="small-button"
            onClick={() => setPersona({ catchphrases: [...data.persona.catchphrases, ''] })}
          >
            + Dodaj odzywkę
          </button>
        )}
      </div>
    </div>
  );
}

function KnowledgeTab({ bot, saveData }: TabProps) {
  const data = bot.data;
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);

  function setKnowledge(patch: Partial<BotProfileData['knowledge']>) {
    saveData({ knowledge: { ...data.knowledge, ...patch } });
  }

  function setGeneration(patch: Partial<BotProfileData['generation']>) {
    saveData({ generation: { ...data.generation, ...patch } });
  }

  return (
    <div className="bot-form">
      <BotTextField
        label="Świat"
        hint="Co bot wie o świecie gry."
        value={data.knowledge.world}
        onChange={(value) => setKnowledge({ world: value })}
      />
      <BotTextField
        label="Kampania"
        hint="Wydarzenia i miejsca, o których wie."
        value={data.knowledge.campaign}
        onChange={(value) => setKnowledge({ campaign: value })}
      />
      <BotTextField
        label="Ludzie"
        hint="Co wie o postaciach graczy i innych NPC."
        value={data.knowledge.people}
        onChange={(value) => setKnowledge({ people: value })}
      />
      <BotTextField
        label="Czego nie wie"
        hint="Wyraźne białe plamy — bot ma się do nich przyznawać, a nie zmyślać."
        value={data.knowledge.forbidden}
        onChange={(value) => setKnowledge({ forbidden: value })}
      />

      <h3>Model</h3>
      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Temperatura ({data.generation.temperature.toFixed(2)})</span>
          <input
            type="range"
            min={BOT_TEMPERATURE_MIN}
            max={BOT_TEMPERATURE_MAX}
            step={0.05}
            value={data.generation.temperature}
            onChange={(e) => setGeneration({ temperature: Number(e.target.value) })}
          />
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Maks. długość (tokeny)</span>
          <input
            type="number"
            min={BOT_MAX_TOKENS_MIN}
            max={BOT_MAX_TOKENS_MAX}
            value={data.generation.maxTokens}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (
                Number.isInteger(value) &&
                value >= BOT_MAX_TOKENS_MIN &&
                value <= BOT_MAX_TOKENS_MAX
              ) {
                setGeneration({ maxTokens: value });
              }
            }}
          />
        </label>
      </div>
      <label className="ai-toggle">
        <input
          type="checkbox"
          checked={data.generation.reasoning}
          onChange={(e) => setGeneration({ reasoning: e.target.checked })}
        />
        <span>Bloki myślenia (wolniej; sensowne tylko dla asystenta MG)</span>
      </label>

      <label className="bot-field">
        <span className="auth-label">Powiązana karta postaci</span>
        <select
          value={bot.characterId ?? ''}
          onChange={(e) => queueBotSave(bot.id, { characterId: e.target.value || null })}
        >
          <option value="">— brak —</option>
          {order.map((id) => (
            <option key={id} value={id}>
              {characters[id]?.name ?? id}
            </option>
          ))}
        </select>
        <span className="bot-hint">
          Dla towarzyszy — od etapu 20 bot będzie z niej rzucał kośćmi.
        </span>
      </label>

      {/* Sekcja „Głos" dojdzie tutaj w etapie 12 (TTS). */}
    </div>
  );
}

function LessonsTab({
  bot,
  saveData,
  draft,
  setDraft,
}: TabProps & { draft: string; setDraft: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lessons = bot.data.lessons;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const correction = draft.trim();
    if (!correction || busy) return;
    setBusy(true);
    setError(null);
    const ack = await teachBot(bot.id, correction);
    setBusy(false);
    if (!ack.ok) {
      setError(
        ack.error === 'BOT_CORRECTION_TOO_LONG'
          ? 'Korekta jest za długa.'
          : `Nie udało się zapisać wniosku: ${ack.error}`,
      );
      return;
    }
    setDraft('');
  }

  function patchLesson(id: string, change: Partial<BotLesson>) {
    saveData({
      lessons: lessons.map((lesson) => (lesson.id === id ? { ...lesson, ...change } : lesson)),
    });
  }

  return (
    <div className="bot-form">
      <p className="bot-hint">
        Korekta w trakcie gry: napisz, co poprawić, a bot zamieni to na regułę i będzie się jej
        trzymał od następnej wypowiedzi. Regułę możesz potem zmienić, wyłączyć albo usunąć.
      </p>
      <form className="bot-teach" onSubmit={(e) => void submit(e)}>
        <textarea
          rows={2}
          maxLength={BOT_CORRECTION_MAX_LENGTH}
          placeholder="np. za dużo gada o pogodzie, ma być krótko i konkretnie"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="small-button" disabled={busy || draft.trim().length === 0}>
          {busy ? 'Uczę…' : 'Naucz bota'}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}

      {lessons.length === 0 ? (
        <p className="placeholder-text">Bot nie ma jeszcze żadnych wniosków.</p>
      ) : (
        <ul className="bot-lessons">
          {lessons.map((lesson) => (
            <li key={lesson.id} className={`bot-lesson ${lesson.enabled ? '' : 'bot-lesson--off'}`}>
              <input
                type="checkbox"
                checked={lesson.enabled}
                title="Stosuj ten wniosek"
                onChange={(e) => patchLesson(lesson.id, { enabled: e.target.checked })}
              />
              <input
                type="text"
                maxLength={BOT_LESSON_MAX_LENGTH}
                value={lesson.text}
                onChange={(e) => patchLesson(lesson.id, { text: e.target.value })}
                title={lesson.note ? `Uwaga MG: ${lesson.note}` : undefined}
              />
              <button
                type="button"
                className="small-button character-delete"
                title="Usuń wniosek"
                onClick={() =>
                  saveData({ lessons: lessons.filter((entry) => entry.id !== lesson.id) })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatTab({ bot, onTeach }: { bot: BotView; onTeach: (correction: string) => void }) {
  const turns = useBotStore((s) => s.conversations[bot.id] ?? []);
  const pending = useBotStore((s) => s.pendingReplies[bot.id]);
  const clearConversation = useBotStore((s) => s.clearConversation);
  const available = useAiStore((s) => s.status.available);
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !available || pending) return;
    sendBotChat({
      botId: bot.id,
      message: text,
      history: turns
        .filter((turn) => !turn.error && turn.text.length > 0)
        .map((turn) => ({ role: turn.role, text: turn.text })),
    });
    setMessage('');
  }

  return (
    <div className="bot-chat">
      <div className="bot-chat-head">
        <span className="bot-hint">
          Rozmowa poza sesją — nie trafia na czat i nie jest zapisywana.
        </span>
        {turns.length > 0 && (
          <button type="button" className="small-button" onClick={() => clearConversation(bot.id)}>
            Wyczyść
          </button>
        )}
      </div>

      <div className="bot-chat-log" ref={listRef}>
        {turns.length === 0 && (
          <p className="placeholder-text">Zagadnij bota, żeby sprawdzić, jak trzyma rolę.</p>
        )}
        {turns.map((turn) => (
          <BotTurnRow key={turn.id} turn={turn} botName={bot.name} onTeach={onTeach} />
        ))}
      </div>

      <form className="bot-chat-form" onSubmit={submit}>
        <textarea
          rows={2}
          maxLength={BOT_TEST_MESSAGE_MAX_LENGTH}
          placeholder={available ? 'Powiedz coś botowi…' : 'Boty offline — uruchom AI Gateway'}
          value={message}
          disabled={!available}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as FormEvent);
            }
          }}
        />
        {pending ? (
          <button type="button" className="small-button" onClick={() => cancelBotChat()}>
            Przerwij
          </button>
        ) : (
          <button type="submit" className="small-button" disabled={!available || !message.trim()}>
            Wyślij
          </button>
        )}
      </form>
    </div>
  );
}

function BotTurnRow({
  turn,
  botName,
  onTeach,
}: {
  turn: BotTestTurn;
  botName: string;
  onTeach: (correction: string) => void;
}) {
  const seconds = turn.usage?.generationMs ? turn.usage.generationMs / 1000 : null;
  return (
    <div className={`bot-turn bot-turn--${turn.role}`}>
      <span className="bot-turn-author">{turn.role === 'bot' ? botName : 'MG'}</span>
      <p className="bot-turn-text">
        {turn.text || (turn.pending ? 'bot pisze…' : '')}
        {turn.pending && turn.text ? ' ▌' : ''}
      </p>
      {turn.error && <p className="auth-error">{turn.error}</p>}
      {turn.retried && !turn.warning && (
        <p className="bot-turn-note">↻ pierwsza wersja wypadła z roli — powtórzono automatycznie</p>
      )}
      {turn.warning && (
        <p className="bot-turn-warning">
          ⚠ {turn.warning} — mimo powtórki.{' '}
          <button
            type="button"
            className="small-button"
            onClick={() => onTeach(`Nie wychodź z roli: ${turn.warning}.`)}
          >
            Zapisz jako wniosek
          </button>
        </p>
      )}
      {!turn.pending && turn.role === 'bot' && seconds !== null && (
        <span className="bot-turn-usage">
          {turn.usage?.completionTokens ?? '?'} tok · {seconds.toFixed(1)} s
        </span>
      )}
    </div>
  );
}

function PromptTab({ bot }: { bot: BotView }) {
  const prompt = compileBotPrompt({ name: bot.name, data: bot.data });
  return (
    <div className="bot-form">
      <p className="bot-hint">
        Dokładnie to dostaje model (wersja szablonu {BOT_PROMPT_VERSION}, ok.{' '}
        {estimatePromptTokens(prompt)} tokenów). Na końcu każdej rozmowy serwer dokleja jeszcze
        krótkie przypomnienie roli z najnowszymi wnioskami.
      </p>
      <pre className="ai-thinking-text bot-prompt">{prompt}</pre>
    </div>
  );
}

function BotTextField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="bot-field">
      <span className="auth-label">{label}</span>
      <textarea
        rows={3}
        maxLength={BOT_FIELD_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="bot-hint">{hint}</span>
    </label>
  );
}
