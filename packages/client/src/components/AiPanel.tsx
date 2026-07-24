import { useState, type FormEvent } from 'react';
import type { AiStatus } from '@vtt/shared';
import { askAi, refreshAiStatus } from '../socket.js';
import { useAiStore, type AiExchange } from '../stores/aiStore.js';

/** Human-readable llama-server state for the GM diagnostics line. */
function llamaLabel(status: AiStatus): string {
  switch (status.llama) {
    case 'ready':
      return 'model gotowy';
    case 'external':
      return 'model gotowy (proces zewnętrzny)';
    case 'starting':
      return 'model się wczytuje…';
    case 'unhealthy':
      return 'model nie odpowiada';
    case 'stopped':
      return 'model zatrzymany';
    case 'unreachable':
      return 'brak połączenia z gatewayem';
  }
}

function StatusLine({ status }: { status: AiStatus }) {
  const [checking, setChecking] = useState(false);

  async function recheck() {
    setChecking(true);
    await refreshAiStatus();
    setChecking(false);
  }

  return (
    <div className="ai-status">
      <div className="ai-status-main">
        <span className={`badge ${status.available ? 'badge--ok' : 'badge--off'}`}>
          {status.available ? 'boty dostępne' : 'boty offline'}
        </span>
        <span className="ai-status-text">{llamaLabel(status)}</span>
        <button type="button" className="small-button" onClick={() => void recheck()}>
          {checking ? 'sprawdzam…' : 'Sprawdź'}
        </button>
      </div>
      <dl className="ai-status-details">
        {status.model && (
          <>
            <dt>Model</dt>
            <dd title={status.model}>{status.model}</dd>
          </>
        )}
        {status.contextSize != null && (
          <>
            <dt>Kontekst</dt>
            <dd>{status.contextSize.toLocaleString('pl-PL')} tokenów</dd>
          </>
        )}
        {status.gpu && (
          <>
            <dt>VRAM</dt>
            <dd>
              {Math.round(status.gpu.memoryUsedMb / 1024)} / {Math.round(status.gpu.memoryTotalMb / 1024)} GB
            </dd>
          </>
        )}
        {(status.queueLength > 0 || status.busy) && (
          <>
            <dt>Kolejka</dt>
            <dd>
              {status.busy ? 'generuje' : 'wolny'}
              {status.queueLength > 0 ? ` · czeka ${status.queueLength}` : ''}
            </dd>
          </>
        )}
        {status.restarts != null && status.restarts > 0 && (
          <>
            <dt>Restarty</dt>
            <dd>{status.restarts}</dd>
          </>
        )}
      </dl>
      {status.error && <p className="ai-status-error">{status.error}</p>}
    </div>
  );
}

function ExchangeCard({ exchange }: { exchange: AiExchange }) {
  const [showThinking, setShowThinking] = useState(false);
  const seconds = exchange.usage?.generationMs ? exchange.usage.generationMs / 1000 : null;

  return (
    <li className="ai-exchange">
      <p className="ai-exchange-prompt">{exchange.prompt}</p>

      {exchange.queuePosition !== null && (
        <p className="ai-exchange-queue">W kolejce: pozycja {exchange.queuePosition}</p>
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
      {!exchange.done && !exchange.answer && exchange.queuePosition === null && (
        <p className="ai-exchange-answer ai-exchange-answer--pending">
          {exchange.thinking ? 'model myśli…' : 'generuję…'}
        </p>
      )}
      {exchange.error && <p className="ai-status-error">{exchange.error}</p>}

      {exchange.done && exchange.usage && (
        <p className="ai-exchange-usage">
          {exchange.usage.completionTokens ?? '?'} tokenów
          {seconds !== null && ` · ${seconds.toFixed(1)} s`}
          {exchange.usage.tokensPerSecond && ` · ${exchange.usage.tokensPerSecond.toFixed(1)} tok/s`}
        </p>
      )}
    </li>
  );
}

/**
 * GM-only diagnostics screen from stage 09: asks the model a question and shows
 * the whole chain (gateway → llama-server → answer) working. Stage 10 replaces
 * the free-form system prompt with saved bot profiles.
 */
export function AiPanel() {
  const status = useAiStore((s) => s.status);
  const exchanges = useAiStore((s) => s.exchanges);
  const clear = useAiStore((s) => s.clear);

  const [prompt, setPrompt] = useState('');
  const [system, setSystem] = useState('');
  const [reasoning, setReasoning] = useState(false);
  const busy = exchanges.some((exchange) => !exchange.done);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || !status.available) return;
    askAi({
      prompt: text,
      ...(system.trim() ? { system: system.trim() } : {}),
      purpose: reasoning ? 'gm_assistant' : 'test',
      reasoning,
    });
    setPrompt('');
  }

  return (
    <div className="ai-panel">
      <StatusLine status={status} />

      <form className="ai-form" onSubmit={submit}>
        <label className="ai-field">
          <span className="auth-label">Rola modelu (opcjonalnie)</span>
          <textarea
            className="ai-system"
            rows={2}
            value={system}
            placeholder="np. Jesteś Vex, cyniczną fikserką z Night City. Mów krótko, po polsku."
            onChange={(event) => setSystem(event.target.value)}
            disabled={!status.available}
          />
        </label>
        <label className="ai-field">
          <span className="auth-label">Pytanie</span>
          <textarea
            className="ai-prompt"
            rows={3}
            value={prompt}
            placeholder={
              status.available ? 'Zadaj pytanie modelowi…' : 'Boty offline — uruchom AI Gateway'
            }
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                submit(event as unknown as FormEvent);
              }
            }}
            disabled={!status.available}
          />
        </label>
        <div className="ai-form-actions">
          <label className="ai-toggle">
            <input
              type="checkbox"
              checked={reasoning}
              onChange={(event) => setReasoning(event.target.checked)}
              disabled={!status.available}
            />
            <span>Pokaż rozumowanie (tryb asystenta MG)</span>
          </label>
          <button type="submit" disabled={!status.available || !prompt.trim()}>
            {busy ? 'Wyślij (trwa generacja)' : 'Wyślij'}
          </button>
        </div>
        <p className="ai-form-hint">Ctrl+Enter wysyła. Rozmowa nie trafia na czat sesji.</p>
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
