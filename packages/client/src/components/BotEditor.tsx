import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  BotAutonomy,
  BotKnowledgeSource,
  BotLesson,
  BotProfileData,
  BotType,
  BotView,
  KnowledgePreviewResult,
  PortraitUploadResult,
} from '@vtt/shared';
import {
  BOT_AUTONOMY_HINTS,
  BOT_AUTONOMY_LABELS,
  BOT_AUTONOMY_MODES,
  BOT_CATCHPHRASES_MAX,
  BOT_CORRECTION_MAX_LENGTH,
  BOT_FIELD_MAX_LENGTH,
  BOT_KNOWLEDGE_SOURCES,
  BOT_KNOWLEDGE_SOURCE_LABELS,
  BOT_KNOWLEDGE_TOP_K_MAX,
  BOT_KNOWLEDGE_TOP_K_MIN,
  BOT_LESSON_MAX_LENGTH,
  BOT_MAX_TOKENS_MAX,
  BOT_MAX_TOKENS_MIN,
  BOT_PROMPT_VERSION,
  BOT_TEMPERATURE_MAX,
  BOT_TEMPERATURE_MIN,
  BOT_TEST_MESSAGE_MAX_LENGTH,
  BOT_TYPES,
  BOT_TYPE_LABELS,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_NOTE_MAX_LENGTH,
  ROLE_GM,
  compileBotPrompt,
  defaultBotGeneration,
  estimatePromptTokens,
  normalizeKnowledgeTags,
  relationBadge,
} from '@vtt/shared';

/** Stopnie skali w kolejności od najgorszego — lista rozwijana czyta się jak suwak. */
const RELATION_VALUES = Array.from(
  { length: RELATION_MAX - RELATION_MIN + 1 },
  (_, index) => RELATION_MIN + index,
);
import { apiUpload } from '../api.js';
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadRequirementText } from '@vtt/shared';
import { fileRejectionText, uploadErrorText } from '../uploads.js';
import {
  cancelBotChat,
  deleteRelation,
  fetchRelations,
  flushBotSave,
  previewBotPrompt,
  queueBotSave,
  sendBotChat,
  setRelation,
  teachBot,
} from '../socket.js';
import { useKnowledgeStore } from '../stores/knowledgeStore.js';
import { relationKey, useRelationStore } from '../stores/relationStore.js';
import { useBotStore, type BotTestTurn } from '../stores/botStore.js';
import { useAiStore } from '../stores/aiStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

type EditorTab = 'role' | 'knowledge' | 'lessons' | 'chat' | 'prompt';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'role', label: 'Rola' },
  { id: 'knowledge', label: 'Wiedza i model' },
  { id: 'lessons', label: 'Wnioski' },
  { id: 'chat', label: 'Rozmowa testowa' },
  { id: 'prompt', label: 'Prompt' },
];

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
  const placement = useWindowPlacement(`bot:${botId}`, () => ({
    x: 120 + (stackIndex % 6) * 28,
    y: 60 + (stackIndex % 6) * 24,
  }));
  /** Prefilled by „zapisz jako wniosek" on a slip — shared with the lessons tab. */
  const [correctionDraft, setCorrectionDraft] = useState('');

  useEffect(() => {
    // Buffered edits must not be lost when the window unmounts.
    return () => flushBotSave(botId);
  }, [botId]);

  if (!bot) return null;

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
      ref={placement.ref}
      className="sheet-window bot-window"
      style={{ ...placement.style, zIndex: 300 + stackIndex }}
      onPointerDown={() => focusEditor(botId)}
      aria-label={`Edytor bota: ${bot.name}`}
    >
      <div className="sheet-header" {...placement.dragProps}>
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
          aria-label="Zamknij edytor"
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
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}

/**
 * Ile bot może zrobić sam (etap 20a) i kto — obok MG — odpowiada na jego
 * propozycje. Stoi na zakładce „Rola", bo to pytanie o to, kim bot jest przy
 * stole, a nie o parametry modelu.
 *
 * Asystent MG nie gra żadną postacią, więc pola są dla niego wygaszone: mówić
 * o mechanice to co innego niż ją wykonywać.
 */
function AutonomyFields({ bot, saveData }: TabProps) {
  const presence = useChatStore((s) => s.presence);
  const players = presence.filter((entry) => entry.role !== ROLE_GM);
  const disabled = bot.data.type === 'gm_assistant';
  const autonomy = bot.data.autonomy;
  const controller = bot.data.controllerUserId;
  // Konto sterującego może już nie być na liście obecnych — pokaż je mimo to,
  // inaczej `select` po cichu przeskoczyłby na „tylko MG".
  const knownController = controller && !players.some((entry) => entry.userId === controller);

  return (
    <>
      <div className="bot-row-inline">
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Autonomia w mechanice</span>
          <select
            value={autonomy}
            disabled={disabled}
            onChange={(e) => saveData({ autonomy: e.target.value as BotAutonomy })}
          >
            {BOT_AUTONOMY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {BOT_AUTONOMY_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="bot-field bot-field--inline">
          <span className="auth-label">Propozycje zatwierdza też</span>
          <select
            value={controller ?? ''}
            disabled={disabled || autonomy !== 'proposal'}
            onChange={(e) => saveData({ controllerUserId: e.target.value || null })}
          >
            <option value="">tylko Mistrz Gry</option>
            {knownController && <option value={controller}>gracz spoza sesji</option>}
            {players.map((entry) => (
              <option key={entry.userId} value={entry.userId}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="bot-hint">
        {disabled
          ? 'Asystent MG nie prowadzi postaci — mechaniki nie dotyka.'
          : BOT_AUTONOMY_HINTS[autonomy]}
      </p>
    </>
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
    const rejection = fileRejectionText(file, 'portrait');
    if (rejection) {
      setUploadError(rejection);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await apiUpload<PortraitUploadResult>('/api/uploads/portraits', file);
      queueBotSave(bot.id, { portraitUrl: result.url });
      flushBotSave(bot.id);
    } catch (error) {
      setUploadError(uploadErrorText(error, 'portrait'));
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
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            title={uploadRequirementText('portrait')}
            disabled={uploading}
            onChange={(e) => void uploadPortrait(e.target.files?.[0])}
          />
        </label>
      </div>
      {uploadError && <p className="auth-error">{uploadError}</p>}

      <AutonomyFields bot={bot} saveData={saveData} />

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
              aria-label="Usuń odzywkę"
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

      <KnowledgeContextSection bot={bot} saveData={saveData} />

      <RelationsSection bot={bot} />

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
          Bez niej bot nie ma czym rzucać — testy wykonuje wyłącznie tą kartą.
        </span>
      </label>
    </div>
  );
}

/**
 * Uprawnienia do bazy wiedzy kampanii (etap 19b).
 *
 * Domyślnie pusty zbiór źródeł, czyli zachowanie z etapu 11: bot zna wyłącznie
 * to, co MG wpisał mu wyżej. Dostęp trzeba nadać świadomie — i zawsze dotyczy
 * tylko wpisów oznaczonych „boty z uprawnieniem".
 */
function KnowledgeContextSection({ bot, saveData }: TabProps) {
  const context = bot.data.knowledgeContext;
  const entries = useKnowledgeStore((s) => s.entries);
  const order = useKnowledgeStore((s) => s.order);
  const [tagDraft, setTagDraft] = useState(context.tags.join(', '));

  // Tagi, które w ogóle występują w bazie — inaczej MG wpisuje je z pamięci
  // i literówka cicho odcina bota od połowy świata.
  const known = useMemo(() => {
    const all = new Set<string>();
    for (const id of order) for (const tag of entries[id]?.tags ?? []) all.add(tag);
    return [...all].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [entries, order]);

  function setContext(patch: Partial<BotProfileData['knowledgeContext']>) {
    saveData({ knowledgeContext: { ...context, ...patch } });
  }

  function toggleSource(source: BotKnowledgeSource, enabled: boolean) {
    setContext({
      sources: enabled
        ? [...new Set([...context.sources, source])]
        : context.sources.filter((entry) => entry !== source),
    });
  }

  function commitTags(raw: string) {
    setTagDraft(raw);
    setContext({ tags: normalizeKnowledgeTags(raw.split(/[,\s]+/)) });
  }

  const reads = context.sources.length > 0;

  return (
    <>
      <h3>Kontekst wiedzy</h3>
      <p className="bot-hint">
        Czego bot może sobie przypomnieć poza własnym profilem. Bez zaznaczonego źródła zachowuje
        się jak przed etapem 19b — zna wyłącznie to, co napisano wyżej.
      </p>
      {BOT_KNOWLEDGE_SOURCES.map((source) => (
        <label key={source} className="bot-checkbox">
          <input
            type="checkbox"
            checked={context.sources.includes(source)}
            onChange={(e) => toggleSource(source, e.target.checked)}
          />
          <span>{BOT_KNOWLEDGE_SOURCE_LABELS[source]}</span>
        </label>
      ))}

      {reads && (
        <>
          <label className="bot-field">
            <span className="auth-label">Tagi, które czyta</span>
            <input
              type="text"
              value={tagDraft}
              placeholder="Puste = wszystkie wpisy dla botów"
              onChange={(e) => commitTags(e.target.value)}
            />
            <span className="bot-hint">
              {context.tags.length > 0
                ? `Czyta wpisy z: ${context.tags.map((tag) => `#${tag}`).join(' ')}.`
                : 'Czyta każdy wpis oznaczony „boty z uprawnieniem".'}
              {known.length > 0 && ` W bazie są: ${known.map((tag) => `#${tag}`).join(' ')}.`}
            </span>
          </label>

          <label className="bot-field">
            <span className="auth-label">Ile fragmentów dokleić ({context.topK})</span>
            <input
              type="range"
              min={BOT_KNOWLEDGE_TOP_K_MIN}
              max={BOT_KNOWLEDGE_TOP_K_MAX}
              step={1}
              value={context.topK}
              onChange={(e) => setContext({ topK: Number(e.target.value) })}
            />
            <span className="bot-hint">
              Każdy fragment to kilkaset tokenów kontekstu i chwila wyszukiwania przed odpowiedzią.
              Trzy wystarczają, dopóki wpisy są krótkie.
            </span>
          </label>

          <p className="bot-hint">
            Wpisy oznaczone „tylko MG" nigdy tu nie trafią, niezależnie od tagów. Co konkretnie
            dostanie model, sprawdzisz w zakładce „Prompt".
          </p>
        </>
      )}
    </>
  );
}

/**
 * Nastawienie tego NPC-a do postaci graczy (etap 19c).
 *
 * Lista jest po postaciach, nie po relacjach: MG ma widzieć także te, których
 * jeszcze nie wypełnił. „Bez relacji" nie jest tym samym co „obojętny" — pierwszy
 * nie dokleja do promptu ani jednego zdania, drugi mówi modelowi wprost, że nie ma
 * tu ani sympatii, ani urazy.
 */
function RelationsSection({ bot }: { bot: BotView }) {
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const relations = useRelationStore((s) => s.relations);
  const loaded = useRelationStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) void fetchRelations();
  }, [loaded]);

  if (bot.data.type === 'gm_assistant') return null;

  const rows = order
    .map((id) => characters[id])
    .filter((character): character is NonNullable<typeof character> => !!character);

  return (
    <>
      <h3>Nastawienie do postaci</h3>
      <p className="bot-hint">
        Wchodzi do promptu wyłącznie wtedy, gdy bot odpowiada tej postaci — i słychać je w tonie, a
        nie w treści. Zdanie „skąd" jest ważniejsze niż stopień: bez niego model wie tylko, że ma
        być miły albo niemiły.
      </p>
      {rows.length === 0 ? (
        <p className="bot-hint">W kampanii nie ma jeszcze żadnej karty postaci.</p>
      ) : (
        <ul className="bot-relations">
          {rows.map((character) => {
            const relation = relations[relationKey(bot.id, character.id)];
            return (
              <li key={character.id} className="bot-relation">
                <span className="bot-relation-name">{character.name}</span>
                <select
                  value={relation ? String(relation.value) : ''}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      void deleteRelation(bot.id, character.id);
                      return;
                    }
                    void setRelation({
                      botId: bot.id,
                      characterId: character.id,
                      value: Number(e.target.value),
                      note: relation?.note ?? '',
                    });
                  }}
                >
                  <option value="">— bez relacji —</option>
                  {RELATION_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {relationBadge(value)}
                    </option>
                  ))}
                </select>
                {relation && (
                  <input
                    type="text"
                    className="bot-relation-note"
                    defaultValue={relation.note}
                    maxLength={RELATION_NOTE_MAX_LENGTH}
                    placeholder="Skąd się to wzięło — jedno zdanie"
                    onBlur={(e) => {
                      if (e.target.value === relation.note) return;
                      void setRelation({
                        botId: bot.id,
                        characterId: character.id,
                        value: relation.value,
                        note: e.target.value,
                      });
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
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
                aria-label="Usuń wniosek"
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

/**
 * Stable fallback: a fresh `[]` inside the selector would be a new snapshot on
 * every render and send zustand into an infinite update loop.
 */
const NO_TURNS: BotTestTurn[] = [];

function ChatTab({ bot, onTeach }: { bot: BotView; onTeach: (correction: string) => void }) {
  const turns = useBotStore((s) => s.conversations[bot.id] ?? NO_TURNS);
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

/**
 * Podgląd promptu. Bez pytania testowego pokazuje sam profil (kompilowany
 * lokalnie), a po wpisaniu zdania rozmówcy — prompt **złożony przez serwer**,
 * razem z fragmentami bazy wiedzy, które bot faktycznie dostanie. Bez tego
 * „dlaczego bot to powiedział" przestaje być sprawdzalne (etap 19b).
 */
function PromptTab({ bot }: { bot: BotView }) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<KnowledgePreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const local = compileBotPrompt({ name: bot.name, data: bot.data });
  const prompt = preview?.prompt ?? local;
  const tokens = preview?.promptTokens ?? estimatePromptTokens(local);
  const reads = bot.data.knowledgeContext.sources.length > 0;

  async function check(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    flushBotSave(bot.id);
    const ack = await previewBotPrompt(bot.id, message);
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError('Nie udało się złożyć podglądu — sprawdź, czy serwer i AI Gateway działają.');
      return;
    }
    setPreview(ack.data);
  }

  return (
    <div className="bot-form">
      <p className="bot-hint">
        Dokładnie to dostaje model (wersja szablonu {BOT_PROMPT_VERSION}, ok. {tokens} tokenów). Na
        końcu każdej rozmowy serwer dokleja jeszcze krótkie przypomnienie roli z najnowszymi
        wnioskami.
      </p>

      <form className="bot-teach" onSubmit={(event) => void check(event)}>
        <input
          type="text"
          value={message}
          placeholder={
            reads
              ? 'Wpisz zdanie rozmówcy, np. „co wiesz o klubie Afterlife?”'
              : 'Bot nie czyta bazy wiedzy — sprawdź, że prompt jest bez fragmentów'
          }
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Składam…' : 'Sprawdź prompt'}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}

      {preview && (
        <div className="bot-knowledge-preview">
          {preview.passages.length > 0 ? (
            <p className="bot-hint">
              Doklejone wpisy:{' '}
              {[...new Set(preview.passages.map((passage) => passage.title))].join(' · ')}
            </p>
          ) : null}
          {preview.reason && <p className="bot-warning">{preview.reason}</p>}
        </div>
      )}

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
