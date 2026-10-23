import { useEffect, useMemo, useState } from 'react';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  ROLE_GM,
  criticalInjuryNames,
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
import { useCharacterStore } from '../stores/characterStore.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { netErrorText } from '../netErrors.js';
import { noteAck } from '../notices.js';

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
  const statusRegistry = useTokenStore((s) => s.statuses);
  const user = useAuthStore((s) => s.user);
  const characters = useCharacterStore((s) => s.characters);
  const isGm = user?.role === ROLE_GM;
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
    noteAck('net', ack, netErrorText);
  }

  async function fire() {
    setBusy(true);
    const ack = await fireZone(zone.id);
    setBusy(false);
    noteAck('net', ack, netErrorText);
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
  // Etap 58b: kto już próbował rozbroić i mu się nie udało.
  const disarmTried = (zone.disarmTried ?? []).map(
    (id) => characters[id]?.name ?? 'postać spoza kampanii',
  );

  /** PT tej strefy (rozbrojenie 58b, Percepcja 23.10): puste wraca do PT wpisu. */
  function setDv(field: 'disarmDv' | 'spotDv', raw: string) {
    const text = raw.trim();
    if (text === '') {
      if (zone[field] != null) void patch({ [field]: null });
      return;
    }
    const dv = Number(text);
    if (!Number.isInteger(dv) || dv < CHECK_CALL_DV_MIN || dv > CHECK_CALL_DV_MAX) return;
    if (dv !== zone[field]) void patch({ [field]: dv });
  }

  return (
    <div className="scene-card-form">
      {profile ? (
        <p className="placeholder-text">
          {describeNetDefense(profile)}
          {netDefenseActs(effects)
            ? ` · ${describeNetDefenseEffects(effects, {
                // Nazwy, nie id — „Powalony", a nie „prone" (jak karta wpisu, #6).
                statuses: (effects?.statuses ?? []).map(
                  (id) => statusRegistry.find((status) => status.id === id)?.name ?? id,
                ),
                injuries: criticalInjuryNames(Object.values(entries), effects?.injuries ?? []),
              })}`
            : ''}
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

      {effects?.fires && zone.tokenId && (
        <p className="placeholder-text">
          PW stanowiska liczy figura „{tokens[zone.tokenId]?.name ?? 'stanowisko'}” — do niej się
          strzela, a rozbita figura przestaje strzelać.
        </p>
      )}
      {zone.hpMax > 0 && (
        <label
          className="bot-field"
          title="PW samego urządzenia (spryskiwaczy, dywanu, paneli, wieżyczki) z tabeli systemów obronnych — nie podłogi. Na 0 system jest zniszczony i przestaje działać. Gracze tych liczb nie widzą"
        >
          <span className="auth-label">
            PW urządzenia — {zone.hpCurrent} / {zone.hpMax}
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

      {/* Pole stanowiska tylko tam, gdzie coś strzela (etap 51) — ślizgawce
          i podłodze nie ma kogo przypiąć. Stara wiązka zostaje widoczna. */}
      {(effects?.fires || zone.tokenId) && (
        <label className="bot-field">
          <span className="auth-label">Stanowisko (żeton, który strzela)</span>
          <select
            value={zone.tokenId ?? ''}
            title="Wieżyczka albo dron stojący na mapie; jego broń, magazynek i PW zostają jego"
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
      )}

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

      <label
        className="bot-field"
        title="PT Testu Percepcji, którym gracz zauważa ukrytą strefę, podchodząc na 4 m. Puste — PT z wpisu kompendium. Bez żadnego PT ukrytej strefy nikt sam nie zauważy"
      >
        <span className="auth-label">PT Percepcji</span>
        <input
          key={`spot-${zone.spotDv ?? 'entry'}`}
          type="number"
          min={CHECK_CALL_DV_MIN}
          max={CHECK_CALL_DV_MAX}
          defaultValue={zone.spotDv ?? ''}
          placeholder={
            profile?.spotDv !== undefined ? `z wpisu: ${profile.spotDv}` : 'nie da się zauważyć'
          }
          onBlur={(event) => setDv('spotDv', event.target.value)}
        />
      </label>
      <label
        className="bot-field"
        title="PT Testu Elektroniki i zabezpieczeń, którym gracz rozbraja ten system stojąc przy jego krawędzi. Puste — PT z wpisu kompendium. Porażka o 5 i więcej odpala system na rozbrajającego"
      >
        <span className="auth-label">PT rozbrojenia</span>
        <input
          key={`disarm-${zone.disarmDv ?? 'entry'}`}
          type="number"
          min={CHECK_CALL_DV_MIN}
          max={CHECK_CALL_DV_MAX}
          defaultValue={zone.disarmDv ?? ''}
          placeholder={
            profile?.disableDv !== undefined
              ? `z wpisu: ${profile.disableDv}`
              : 'nie da się rozbroić'
          }
          onBlur={(event) => setDv('disarmDv', event.target.value)}
        />
      </label>
      {disarmTried.length > 0 && (
        <p className="placeholder-text">
          Nie udało się rozbroić: {disarmTried.join(', ')}{' '}
          <button
            type="button"
            className="small-button"
            title="Każda z tych postaci dostanie jeszcze jedną próbę"
            disabled={busy}
            onClick={() => void patch({ resetDisarmTries: true })}
          >
            Pozwól spróbować znowu
          </button>
        </p>
      )}

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
    </div>
  );
}
