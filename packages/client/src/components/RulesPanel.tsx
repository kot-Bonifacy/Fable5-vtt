import { useEffect, useState, type FormEvent } from 'react';
import type { RulesIndexStatus, RulesPassage } from '@vtt/shared';
import { MAX_RULES_QUESTION_LENGTH, citationOf } from '@vtt/shared';
import { askRules, fetchRulesStatus, indexRulebook } from '../socket.js';
import { useAiStore } from '../stores/aiStore.js';
import { useRulesStore, type RulesExchange } from '../stores/rulesStore.js';
import { plural, pluralWord } from '../plural.js';

/**
 * Asystent zasad (etap 19a) — zakładka MG.
 *
 * Panel jest zbudowany wokół jednej myśli: **odpowiedź modelu nic nie znaczy bez
 * źródła**. Fragmenty pokazują się osobno i wcześniej niż odpowiedź, każdy z
 * cytatem „rozdział › sekcja, s. N" i rozwijalnym tekstem — MG ma móc sprawdzić,
 * czy asystent nie zmyśla, bez sięgania po książkę.
 *
 * Panel nie jest profilem bota: rozmowa nie ma osobowości, nie uczy się i nie
 * trafia na czat sesji (patrz `rules-assistant.ts` w `shared`).
 */

/** Co ile odpytywać o postęp, kiedy gateway indeksuje podręcznik. */
const INDEXING_POLL_MS = 2000;

function IndexStatusLine({ status }: { status: RulesIndexStatus }) {
  const [busy, setBusy] = useState(false);

  async function reindex() {
    setBusy(true);
    await indexRulebook();
    setBusy(false);
  }

  const label = status.ready
    ? 'podręcznik zaindeksowany'
    : status.indexing
      ? 'indeksowanie…'
      : 'brak indeksu';

  return (
    <div className="ai-status">
      <div className="ai-status-main">
        <span className={`badge ${status.ready ? 'badge--ok' : 'badge--off'}`}>{label}</span>
        {status.indexing && status.progress ? (
          <span className="ai-status-text">
            {status.progress.done} / {status.progress.total} rozdziałów
          </span>
        ) : null}
        <button
          type="button"
          className="small-button"
          onClick={() => void reindex()}
          disabled={busy || status.indexing || !status.enabled}
        >
          {status.ready ? 'Zaindeksuj ponownie' : 'Zaindeksuj podręcznik'}
        </button>
      </div>
      <dl className="ai-status-details">
        {status.model && (
          <>
            <dt>Model</dt>
            <dd title={status.model}>
              {status.model} ({status.device})
            </dd>
          </>
        )}
        {status.chunks > 0 && (
          <>
            <dt>Indeks</dt>
            <dd>
              {status.chunks.toLocaleString('pl-PL')}{' '}
              {pluralWord(status.chunks, 'fragment', 'fragmenty', 'fragmentów')} z{' '}
              {plural(status.documents, 'rozdziału', 'rozdziałów', 'rozdziałów')}
            </dd>
          </>
        )}
        {status.indexedAt && (
          <>
            <dt>Zaindeksowano</dt>
            <dd>{new Date(status.indexedAt).toLocaleString('pl-PL')}</dd>
          </>
        )}
      </dl>
      {status.reason && <p className="ai-status-error">{status.reason}</p>}
      {!status.ready && !status.indexing && status.enabled ? (
        <p className="ai-form-hint">
          Indeksowanie czyta podręcznik z dysku maszyny z AI Gateway — treść nie przechodzi przez
          serwer VTT. Na CPU trwa kilka minut.
        </p>
      ) : null}
    </div>
  );
}

function PassageCard({ passage, index }: { passage: RulesPassage; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rules-passage">
      <button
        type="button"
        className="rules-passage-head"
        onClick={() => setOpen((value) => !value)}
        title={open ? 'Zwiń fragment' : 'Pokaż fragment podręcznika'}
      >
        <span className="rules-passage-index">[{index}]</span>
        <span className="rules-passage-citation">{citationOf(passage)}</span>
        <span className="rules-passage-toggle">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <pre className="rules-passage-text">{passage.text}</pre>
          <p className="rules-passage-meta">
            {/* Skąd wynik przyszedł — jedyny sposób, żeby zdiagnozować złe
                wyszukiwanie bez zaglądania w bazę wektorową. */}
            {passage.denseRank !== null ? `semantycznie #${passage.denseRank}` : 'nie z semantyki'}
            {' · '}
            {passage.keywordRank !== null ? `słowa #${passage.keywordRank}` : 'nie ze słów'}
            {` · ${passage.source}`}
          </p>
        </>
      )}
    </li>
  );
}

function ExchangeCard({ exchange }: { exchange: RulesExchange }) {
  const [showThinking, setShowThinking] = useState(false);
  const seconds = exchange.totalMs !== null ? exchange.totalMs / 1000 : null;
  const waiting = !exchange.done && !exchange.error;

  return (
    <li className="ai-exchange">
      <p className="ai-exchange-prompt">{exchange.question}</p>

      {exchange.passages.length > 0 && (
        <ul className="rules-passages">
          {exchange.passages.map((passage, index) => (
            <PassageCard key={passage.chunkId} passage={passage} index={index + 1} />
          ))}
        </ul>
      )}

      {exchange.thinking && (
        <div className="ai-exchange-thinking">
          <button
            type="button"
            className="small-button"
            onClick={() => setShowThinking((value) => !value)}
          >
            {showThinking ? 'Ukryj rozumowanie' : 'Pokaż rozumowanie'}
          </button>
          {showThinking && <pre className="ai-thinking-text">{exchange.thinking}</pre>}
        </div>
      )}

      {exchange.answer && <p className="ai-exchange-answer">{exchange.answer}</p>}
      {waiting && !exchange.answer && (
        <p className="ai-exchange-answer ai-exchange-answer--pending">
          {exchange.passages.length === 0
            ? 'szukam w podręczniku…'
            : exchange.thinking
              ? 'model myśli…'
              : 'układam odpowiedź…'}
        </p>
      )}
      {exchange.error && <p className="ai-status-error">{exchange.error}</p>}
      {exchange.retriedWithoutReasoning && (
        <p className="ai-form-hint">
          Rozumowanie zajęło cały limit tokenów i nie zostawiło miejsca na odpowiedź — pytanie
          poszło jeszcze raz bez rozumowania.
        </p>
      )}

      {exchange.done && !exchange.error && (
        <p className="ai-exchange-usage">
          {exchange.searchMs !== null && `wyszukiwanie ${exchange.searchMs} ms`}
          {seconds !== null && ` · razem ${seconds.toFixed(1)} s`}
          {exchange.completionTokens !== null && ` · ${exchange.completionTokens} tokenów`}
        </p>
      )}
    </li>
  );
}

export function RulesPanel() {
  const status = useRulesStore((s) => s.status);
  const exchanges = useRulesStore((s) => s.exchanges);
  const clear = useRulesStore((s) => s.clear);
  const modelAvailable = useAiStore((s) => s.status.available);

  const [question, setQuestion] = useState('');
  const [reasoning, setReasoning] = useState(true);

  useEffect(() => {
    void fetchRulesStatus();
  }, []);

  // Indeksowanie trwa minuty i chodzi po stronie gatewaya — o postęp trzeba
  // dopytać, bo gateway nie ma jak nas zawołać.
  useEffect(() => {
    if (!status.indexing) return;
    const timer = setInterval(() => void fetchRulesStatus(), INDEXING_POLL_MS);
    return () => clearInterval(timer);
  }, [status.indexing]);

  const canAsk = modelAvailable && status.ready;

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || !canAsk) return;
    askRules({ question: text, reasoning });
    setQuestion('');
  }

  const placeholder = !modelAvailable
    ? 'Model offline — uruchom AI Gateway'
    : !status.ready
      ? 'Zaindeksuj podręcznik, żeby pytać o zasady'
      : 'np. Co się dzieje z pancerzem, kiedy oberwę?';

  return (
    <div className="ai-panel">
      <IndexStatusLine status={status} />

      <form className="ai-form" onSubmit={submit}>
        <label className="ai-field">
          <span className="auth-label">Pytanie o zasady</span>
          <textarea
            className="ai-prompt"
            rows={3}
            value={question}
            maxLength={MAX_RULES_QUESTION_LENGTH}
            placeholder={placeholder}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                submit(event as unknown as FormEvent);
              }
            }}
            disabled={!canAsk}
          />
        </label>
        <div className="ai-form-actions">
          <label className="ai-toggle">
            <input
              type="checkbox"
              checked={reasoning}
              onChange={(event) => setReasoning(event.target.checked)}
              disabled={!canAsk}
            />
            <span>Pokaż rozumowanie</span>
          </label>
          <button className="primary-button" type="submit" disabled={!canAsk || !question.trim()}>
            Zapytaj
          </button>
        </div>
        <p className="ai-form-hint">
          Ctrl+Enter wysyła. Odpowiedź powstaje wyłącznie z cytowanych fragmentów i nie trafia na
          czat sesji.
        </p>
      </form>

      {exchanges.length > 0 && (
        <div className="ai-history-head">
          <span>Historia ({exchanges.length})</span>
          <button type="button" className="small-button" onClick={clear}>
            Wyczyść
          </button>
        </div>
      )}
      <ul className="ai-history">
        {exchanges.map((exchange) => (
          <ExchangeCard key={exchange.requestId} exchange={exchange} />
        ))}
      </ul>
    </div>
  );
}
