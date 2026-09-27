import { useEffect, useMemo, useState } from 'react';
import {
  ROLE_GM,
  describeNetDefense,
  describeNetDefenseEffects,
  isNetDefenseEntry,
  isPointInZone,
  netDefenseActs,
  netDefenseTrigger,
  NET_DEFENSE_TRIGGER_LABELS,
  tokenCentre,
  type DefenseZoneView,
} from '@vtt/shared';
import { fetchNetArchitecture, fetchNetArchitectures, fireZone, updateZone } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { netErrorText } from '../netErrors.js';

/** Jedno urządzenie na węźle kontrolnym — kandydat do wiązania strefy (#33). */
interface NodeDevice {
  architectureId: string;
  floorId: string;
  deviceId: string;
  label: string;
}

/**
 * Urządzenia wszystkich węzłów kontrolnych w bibliotece Architektur kampanii.
 *
 * Biblioteka u klienta trzyma same podsumowania (`netStore`), a urządzenia żyją
 * w pełnym szybie, więc karta dociąga każdą Architekturę `net:get` przy
 * otwarciu. W kampanii jest ich garść — jedno pole wyboru zamiast dwóch
 * (Architektura, potem urządzenie) jest warte tych kilku zapytań.
 */
async function loadNodeDevices(): Promise<NodeDevice[]> {
  const list = await fetchNetArchitectures();
  const views = await Promise.all(
    (list?.architectures ?? []).map((summary) => fetchNetArchitecture(summary.id)),
  );
  const devices: NodeDevice[] = [];
  for (const ack of views) {
    if (!ack.ok || !ack.data) continue;
    const view = ack.data;
    for (const branch of view.architecture.branches) {
      for (const floor of branch.floors) {
        if (floor.kind !== 'controlNode') continue;
        for (const device of floor.devices ?? []) {
          devices.push({
            architectureId: view.id,
            floorId: floor.id,
            deviceId: device.id,
            label: `${view.name} · ${floor.label || 'węzeł'} · ${device.name}`,
          });
        }
      }
    }
  }
  return devices;
}

/**
 * Karta strefy bronionej (etap 26f) — dwuklik w prostokąt na warstwie stref.
 *
 * Od 27l to jest **treść** karty, nie całe okno: ramkę, belkę, zamykanie i kosz
 * daje `SceneObjectCard`, wspólny dla siedmiu rodzajów obiektów sceny.
 *
 * Wyłącznie dla MG i to jest cały jej zakres: gracz o strefie wie tyle, ile
 * zobaczył — prostokąt na mapie i podpis. Przepustki, węzeł kontrolny, notatka
 * i żeton stanowiska są **planem**, a plan w tym projekcie nigdy nie opuszcza
 * serwera (ta sama zasada, co przy notatce piętra z 26a).
 *
 * Dwa przyciski niosą całą mechanikę stołu: **„Rozbrój / Uzbrój"** (system
 * wyłączony nie odpala się nikomu) i **„Odpal system"** — ten sam akt, który
 * podręcznik nazywa Turą pułapki („Pułapka zajmuje pierwsze miejsce w Kolejce
 * Inicjatywy", s. 216).
 */
export function SceneCardZone({ zone }: { zone: DefenseZoneView }) {
  const entries = useCompendiumStore((s) => s.entries);
  const scene = useSceneStore((s) => s.effectiveScene);
  const tokens = useTokenStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  const isGm = user?.role === ROLE_GM;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nodeDevices, setNodeDevices] = useState<NodeDevice[] | null>(null);

  useEffect(() => {
    if (!isGm) return;
    let live = true;
    void loadNodeDevices().then((devices) => {
      if (live) setNodeDevices(devices);
    });
    return () => {
      live = false;
    };
  }, [isGm]);

  const entry = entries[zone.entryId];
  const profile = entry && isNetDefenseEntry(entry) ? entry : null;

  /** Figury tej sceny — do listy przepustek i do wskazania stanowiska. */
  const figures = useMemo(() => {
    if (!scene) return [];
    return Object.values(tokens)
      .filter((token) => token.sceneId === scene.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [tokens, scene]);

  /** Kto stoi na strefie w tej chwili — „Odpal system" bije właśnie w nich. */
  const inside = useMemo(() => {
    if (!zone || !scene) return [];
    return figures.filter((token) =>
      isPointInZone(zone, tokenCentre({ x: token.x, y: token.y, size: token.size }, scene)),
    );
  }, [figures, zone, scene]);

  if (!isGm) return null;

  async function patch(next: Parameters<typeof updateZone>[1]) {
    setBusy(true);
    const ack = await updateZone(zone.id, next);
    setBusy(false);
    setError(ack.ok ? null : netErrorText(ack.error));
  }

  async function fire() {
    setBusy(true);
    const ack = await fireZone(zone.id);
    setBusy(false);
    setError(ack.ok ? null : netErrorText(ack.error));
  }

  const exempt = zone.exempt ?? [];
  const boundIndex =
    nodeDevices?.findIndex(
      (device) =>
        device.architectureId === zone.architectureId &&
        device.floorId === zone.floorId &&
        device.deviceId === zone.deviceId,
    ) ?? -1;
  // Związana z urządzeniem, którego w bibliotece już nie ma (skasowane, zmieniony szyb).
  const boundElsewhere = Boolean(zone.deviceId) && nodeDevices !== null && boundIndex < 0;

  function bindNode(value: string) {
    const device = value === '' ? null : nodeDevices?.[Number(value)];
    if (device === undefined) return;
    void patch({
      architectureId: device?.architectureId ?? null,
      floorId: device?.floorId ?? null,
      deviceId: device?.deviceId ?? null,
    });
  }
  const effects = profile?.effects;
  const trigger = netDefenseTrigger(effects);

  return (
    <div className="scene-card-form">
      {profile ? (
        <p className="placeholder-text">
          {describeNetDefense(profile)}
          {netDefenseActs(effects) ? ` · ${describeNetDefenseEffects(effects)}` : ''}
        </p>
      ) : (
        <p className="ai-status-error">
          Kompendium nie ma już wpisu <code>{zone.entryId}</code> — strefa stoi na mapie, ale nic
          nie robi.
        </p>
      )}
      {profile && !netDefenseActs(effects) && (
        <p className="placeholder-text">
          Ten wpis nie ma opisanego efektu — uzupełnij go w zakładce „Kompendium”, albo rozstrzygaj
          go ręcznie.
        </p>
      )}
      <p className="placeholder-text">
        Wyzwalacz: {NET_DEFENSE_TRIGGER_LABELS[trigger]}
        {profile?.trigger ? ` — „${profile.trigger}”` : ''}
      </p>

      <label className="bot-field">
        <span className="auth-label">Nazwa</span>
        <input
          type="text"
          maxLength={40}
          defaultValue={zone.name}
          onBlur={(event) => void patch({ name: event.target.value })}
        />
      </label>

      {zone.hpMax > 0 && (
        <label className="bot-field">
          <span className="auth-label">
            PW systemu — {zone.hpCurrent} / {zone.hpMax}
          </span>
          <input
            type="range"
            min={0}
            max={zone.hpMax}
            value={zone.hpCurrent}
            onChange={(event) => void patch({ hpCurrent: Number(event.target.value) })}
          />
        </label>
      )}

      <label className="bot-field">
        <span className="auth-label">Stanowisko (żeton, który strzela)</span>
        <select
          value={zone.tokenId ?? ''}
          title="Wieżyczka albo dron stojący na mapie; jego broń i magazynek zostają jego"
          onChange={(event) => void patch({ tokenId: event.target.value || null })}
        >
          <option value="">— brak żetonu —</option>
          {figures.map((token) => (
            <option key={token.id} value={token.id}>
              {token.name}
            </option>
          ))}
        </select>
      </label>

      <label className="bot-field">
        <span className="auth-label">Węzeł kontrolny</span>
        <select
          value={boundIndex >= 0 ? String(boundIndex) : boundElsewhere ? 'gone' : ''}
          disabled={nodeDevices === null}
          title="Urządzenie na węźle kontrolnym Architektury: netrunner, który je wyłączy, rozbraja tę strefę"
          onChange={(event) => bindNode(event.target.value)}
        >
          <option value="">
            {nodeDevices === null ? 'Wczytuję Architektury…' : '— bez węzła —'}
          </option>
          {boundElsewhere && (
            <option value="gone" disabled>
              urządzenia nie ma już w Architekturze
            </option>
          )}
          {(nodeDevices ?? []).map((device, index) => (
            <option key={`${device.architectureId}:${device.deviceId}`} value={String(index)}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="bot-field">
        <legend className="auth-label">Przepustki — kogo system przepuszcza</legend>
        {figures.length === 0 ? (
          <p className="placeholder-text">Na tej scenie nie ma figur.</p>
        ) : (
          <div className="zone-exempt-list">
            {figures.map((token) => (
              <label key={token.id} className="bot-checkbox">
                <input
                  type="checkbox"
                  checked={exempt.includes(token.id)}
                  onChange={(event) =>
                    void patch({
                      exempt: event.target.checked
                        ? [...exempt, token.id]
                        : exempt.filter((id) => id !== token.id),
                    })
                  }
                />
                {token.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="bot-field">
        <span className="auth-label">Notatka MG</span>
        <textarea
          rows={2}
          maxLength={500}
          defaultValue={zone.notes ?? ''}
          onBlur={(event) => void patch({ notes: event.target.value })}
        />
      </label>

      <p className="placeholder-text">
        {inside.length === 0
          ? 'Na strefie nikt teraz nie stoi.'
          : `Na strefie stoi: ${inside.map((token) => token.name).join(', ')}`}
      </p>

      <div className="net-generator-foot">
        <button
          type="button"
          className="small-button"
          title={
            zone.armed
              ? 'Rozbrój — system przestaje odpalać się sam (netrunner robi to samo węzłem)'
              : 'Uzbrój — system znów odpala się na każdego, kto wejdzie'
          }
          disabled={busy}
          onClick={() => void patch({ armed: !zone.armed })}
        >
          {zone.armed ? 'Rozbrój' : 'Uzbrój'}
        </button>
        <button
          type="button"
          className="small-button"
          title={
            zone.hidden
              ? 'Odsłoń graczom — strefa trafi do ich payloadu bez rzutu na Percepcję'
              : 'Ukryj — gracze przestaną ją dostawać, dopóki jej nie zauważą'
          }
          disabled={busy}
          onClick={() => void patch({ hidden: !zone.hidden })}
        >
          {zone.hidden ? 'Odsłoń graczom' : 'Ukryj'}
        </button>
        <button
          type="button"
          className="small-button"
          title="Odpal system ręcznie — bije we wszystkich, którzy na nim stoją. To jest też „Tura pułapki”"
          disabled={busy || inside.length === 0 || !netDefenseActs(effects)}
          onClick={() => void fire()}
        >
          Odpal system
        </button>
      </div>
      {error && <p className="ai-status-error">{error}</p>}
    </div>
  );
}
