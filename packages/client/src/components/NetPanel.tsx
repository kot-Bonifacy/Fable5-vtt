import { useEffect, useState } from 'react';
import type { NetArchitectureSummary, NetDifficulty } from '@vtt/shared';
import {
  NET_DIFFICULTIES,
  NET_DIFFICULTY_LABELS,
  NET_BRANCHES_MAX,
  NET_FLOORS_MAX,
} from '@vtt/shared';
import {
  deleteNetArchitecture,
  fetchNetArchitecture,
  fetchNetArchitectures,
  rollNetArchitecture,
} from '../socket.js';
import { useNetStore } from '../stores/netStore.js';
import { plural } from '../plural.js';

/**
 * Biblioteka Architektur Sieciowych (etap 26a) — zakładka MG.
 *
 * Lista i generator; sam szyb edytuje się w pływającym oknie, tak jak profil
 * bota z etapu 10. Panel jest wąski, a architektura jest wysoka — trzymanie
 * pięter w kolumnie 320 px oznaczałoby przewijanie przy każdym piętrze.
 */

const EMPTY_TRUNK = { id: 'trunk', parentFloor: null as number | null, floors: [] };

function difficultyOf(value: string): NetDifficulty {
  return (NET_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as NetDifficulty)
    : 'standard';
}

function ArchitectureRow({ entry }: { entry: NetArchitectureSummary }) {
  const open = useNetStore((s) => s.open);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function edit() {
    setBusy(true);
    const ack = await fetchNetArchitecture(entry.id);
    setBusy(false);
    if (ack.ok && ack.data) open(entry.id, ack.data.architecture);
  }

  return (
    <li className="net-entry">
      <button type="button" className="net-entry-head" onClick={() => void edit()} disabled={busy}>
        <span className={`net-difficulty net-difficulty--${entry.difficulty}`}>
          {NET_DIFFICULTY_LABELS[entry.difficulty]}
        </span>
        <span className="net-entry-title">{entry.name}</span>
      </button>
      <div className="net-entry-foot">
        <span className="net-entry-meta">
          {plural(entry.floors, 'piętro', 'piętra', 'pięter')}
          {entry.branches > 1
            ? ` · ${plural(entry.branches - 1, 'odgałęzienie', 'odgałęzienia', 'odgałęzień')}`
            : ''}
        </span>
        {confirming ? (
          <>
            <span className="knowledge-flag">Usunąć?</span>
            <button
              type="button"
              className="small-button character-delete"
              onClick={() => void deleteNetArchitecture(entry.id)}
            >
              Tak, usuń
            </button>
            <button type="button" className="small-button" onClick={() => setConfirming(false)}>
              Anuluj
            </button>
          </>
        ) : (
          <button
            type="button"
            className="small-button character-delete"
            title="Usuń architekturę z biblioteki kampanii"
            onClick={() => setConfirming(true)}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Kroki 1 i 2 z s. 210. „Bez rzutu" znaczy dokładnie to, co w podręczniku:
 * „Zamiast losować, możesz także samodzielnie zaprojektować całą Architekturę".
 */
function Generator({ onClose }: { onClose: () => void }) {
  const open = useNetStore((s) => s.open);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<NetDifficulty>('standard');
  const [floors, setFloors] = useState('');
  const [branches, setBranches] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function roll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const parsedFloors = Number.parseInt(floors, 10);
    const parsedBranches = Number.parseInt(branches, 10);
    const ack = await rollNetArchitecture({
      name: name.trim() || 'Nowa architektura',
      difficulty,
      ...(Number.isInteger(parsedFloors) ? { floors: parsedFloors } : {}),
      ...(Number.isInteger(parsedBranches) ? { branches: parsedBranches } : {}),
    });
    setBusy(false);
    if (!ack.ok || !ack.data) {
      setError(
        ack.ok
          ? 'Serwer nie odesłał architektury.'
          : ack.error === 'NET_DATA_MISSING'
            ? 'Brak tabel Architektur Sieciowych — wgraj dane rozdziału 11 (netrunning.json).'
            : `Nie udało się wylosować: ${ack.error}`,
      );
      return;
    }
    open('new', ack.data.architecture, ack.data.summary);
    onClose();
  }

  return (
    <form
      className="bot-form net-generator"
      onSubmit={(event) => {
        event.preventDefault();
        void roll();
      }}
    >
      <label className="bot-field">
        <span className="auth-label">Nazwa</span>
        <input
          type="text"
          value={name}
          maxLength={80}
          placeholder="Sieć klubu Afterlife"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="bot-field">
        <span className="auth-label">Poziom trudności</span>
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(difficultyOf(event.target.value))}
        >
          {NET_DIFFICULTIES.map((id) => (
            <option key={id} value={id}>
              {NET_DIFFICULTY_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <div className="net-generator-row">
        <label className="bot-field">
          <span className="auth-label">Pięter</span>
          <input
            type="number"
            min={1}
            max={NET_FLOORS_MAX}
            value={floors}
            placeholder="3k6"
            onChange={(event) => setFloors(event.target.value)}
          />
        </label>
        <label className="bot-field">
          <span className="auth-label">Odgałęzień</span>
          <input
            type="number"
            min={0}
            max={NET_BRANCHES_MAX}
            value={branches}
            placeholder="1k10"
            onChange={(event) => setBranches(event.target.value)}
          />
        </label>
      </div>
      <p className="placeholder-text">
        Puste pola losuje serwer: 3k6 pięter, a każde 1k10 ≥ 7 dokłada odgałęzienie.
      </p>
      {error && <p className="ai-status-error">{error}</p>}
      <div className="net-generator-foot">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? 'Losuję…' : '🎲 Wylosuj'}
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

export function NetPanel() {
  const architectures = useNetStore((s) => s.architectures);
  const loaded = useNetStore((s) => s.loaded);
  const open = useNetStore((s) => s.open);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void fetchNetArchitectures();
  }, []);

  if (generating) {
    return (
      <section className="net-panel">
        <Generator onClose={() => setGenerating(false)} />
      </section>
    );
  }

  return (
    <section className="net-panel">
      <div className="compendium-head">
        <button
          type="button"
          className="small-button"
          onClick={() =>
            open('new', {
              id: 'net.nowa',
              name: 'Nowa architektura',
              difficulty: 'standard',
              branches: [EMPTY_TRUNK],
            })
          }
        >
          + Nowa
        </button>
        <button type="button" className="small-button" onClick={() => setGenerating(true)}>
          🎲 Wylosuj
        </button>
      </div>

      <ul className="net-list">
        {architectures.length === 0 ? (
          <li className="placeholder-text">
            {!loaded
              ? 'Wczytuję…'
              : 'Biblioteka jest pusta. Zbuduj architekturę ręcznie albo wylosuj ją krokami z podręcznika.'}
          </li>
        ) : (
          architectures.map((entry) => <ArchitectureRow key={entry.id} entry={entry} />)
        )}
      </ul>
    </section>
  );
}
