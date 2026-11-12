import { useState } from 'react';
import type {
  NetAbilityId,
  NetDeviceOperation,
  NetDeviceView,
  NetFloorView,
  NetRunView,
} from '@vtt/shared';
import {
  NET_ABILITIES_AVAILABLE,
  NET_DEVICE_KIND_LABELS,
  NET_FLOOR_KIND_LABELS,
} from '@vtt/shared';
import { plural } from '../../plural.js';
import { InlineNotice } from '../NoticeColumn.js';
import { NumberStepper } from '../NumberStepper.js';
import { NetNodeDevices, type OperateExtra } from './NetNodeDevices.js';
import { FLOOR_GLYPHS } from './net-glyphs.js';

/** Widełki wirusa (etap 21c): PT ustala MG, a pisanie trwa tyle Akcji Sieciowych. */
const VIRUS_DV_MIN = 1;
const VIRUS_DV_MAX = 30;
const VIRUS_DV_DEFAULT = 12;
const VIRUS_ACTIONS_MIN = 1;
const VIRUS_ACTIONS_MAX = 20;

/** „Opisz MG, co chcesz, by twój Wirus zrobił" (s. 200) — trzy pola, bez magii. */
function VirusForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (virus: { description: string; dv: number; actions: number }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [description, setDescription] = useState('');
  const [dv, setDv] = useState(VIRUS_DV_DEFAULT);
  const [actions, setActions] = useState(VIRUS_ACTIONS_MIN);
  return (
    <form
      className="net-virus-form"
      onSubmit={(event) => {
        event.preventDefault();
        // Zakresu pilnuje przełącznik, więc tu nie ma czego parsować ani ścinać.
        if (!description.trim()) return;
        onSubmit({ description: description.trim(), dv, actions });
      }}
    >
      <label className="bot-field">
        <span className="auth-label">Co ma zrobić Wirus</span>
        <textarea
          rows={2}
          maxLength={500}
          value={description}
          placeholder="Co 5 minut zmienia wszystkie hasła w tej Architekturze"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="net-generator-row">
        <label className="bot-field">
          <span className="auth-label">PT (ustala MG)</span>
          <NumberStepper
            min={VIRUS_DV_MIN}
            max={VIRUS_DV_MAX}
            value={dv}
            onChange={setDv}
            label="PT wirusa"
          />
        </label>
        <label className="bot-field">
          <span className="auth-label">Akcji Sieciowych</span>
          <NumberStepper
            min={VIRUS_ACTIONS_MIN}
            max={VIRUS_ACTIONS_MAX}
            value={actions}
            onChange={setActions}
            label="Akcji Sieciowych na napisanie wirusa"
          />
        </label>
      </div>
      <p className="placeholder-text">
        Wirusa pisze się przez kilka Tur: każda Akcja Sieciowa to jeden krok, a rzut idzie dopiero
        na ostatnim. PT zniszczenia gotowego Wirusa równa się wynikowi tego rzutu.
      </p>
      <div className="net-generator-foot">
        <button type="submit" className="small-button" disabled={busy}>
          Pisz Wirusa
        </button>
        <button type="button" className="small-button" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </form>
  );
}

export interface VirusDraft {
  description: string;
  dv: number;
  actions: number;
}

/**
 * Jedno zdanie „co dalej” z piętra, na którym netrunner stoi (zgłoszenie gracza
 * z 02.11: „nie wiedziałem, czy Backdoor zadziałał i czy mogę zjechać niżej”).
 */
function floorHint(here: NetFloorView): string | null {
  if (here.hackFailed) {
    return 'Ta postać już raz tu poległa — na tej scenie drugiej próby nie ma.';
  }
  switch (here.kind) {
    case 'password':
      return here.broken
        ? 'Hasło złamane — droga w dół wolna.'
        : 'Hasło blokuje zjazd niżej — złam je Backdoorem.';
    case 'controlNode':
      return here.controlledDv === undefined
        ? 'Kontrola daje władzę nad urządzeniami tego węzła.'
        : 'Węzeł przejęty — jego urządzenia czekają na polecenia.';
    case 'file':
      if (here.copied) return null;
      return here.identified
        ? 'Plik rozpoznany — kopia na dek nic nie kosztuje.'
        : 'Ajdi powie, co to za Plik. Kopia na dek nic nie kosztuje.';
    case 'ice':
      return 'Tego piętra pilnuje Czarny LOD.';
    default:
      return null;
  }
}

/**
 * Karta piętra (etap 70a) — jedyne piętro, jakie gracz ma w oknie.
 *
 * Wszystko, co da się zrobić **tutaj**, stoi w karcie: zdolności, które mają
 * na tym piętrze zastosowanie (Backdoor tylko na haśle, Ajdi i kopia na Pliku,
 * Kontrola na węźle, Wirus tam, gdzie serwer na niego pozwala), Zwiad
 * i Maskowanie zawsze. Koniec rzędu sześciu wyszarzonych przycisków.
 *
 * Urządzenia węzła: przed Kontrolą sama nazwa i rodzaj (`nodeDevices`), po niej
 * lista z przyciskami. Sterowanie z mapy przychodzi w 70b.
 */
export function NetFloorCard({
  here,
  run,
  busy,
  sceneId,
  targets,
  onAbility,
  onCopy,
  onOperate,
  onShow,
}: {
  here: NetFloorView;
  run: NetRunView;
  busy: boolean;
  sceneId: string | null;
  targets: { id: string; name: string }[];
  onAbility: (id: NetAbilityId, virus?: VirusDraft) => void;
  onCopy: (floorId: string) => void;
  onOperate: (
    floorId: string,
    deviceId: string,
    operation: NetDeviceOperation,
    extra: OperateExtra,
  ) => void;
  onShow: (device: NetDeviceView) => void;
}) {
  const [virusOpen, setVirusOpen] = useState(false);
  const kind = here.kind ?? 'empty';
  const kindLabel = NET_FLOOR_KIND_LABELS[kind];
  const hint = floorHint(here);
  const virusPending = run.virus;
  const sighted = run.nodeDevices ?? [];

  const abilities = NET_ABILITIES_AVAILABLE.filter((entry) => {
    if (entry.id === 'scanner') return false;
    // Wirus: tam, gdzie serwer go dopuszcza (`virusAllowed`), i póki trwa pisanie.
    if (entry.id === 'virus') return here.virusAllowed === true || virusPending !== null;
    return entry.floorKind === undefined || entry.floorKind === here.kind;
  }).sort((a, b) => Number(b.floorKind !== undefined) - Number(a.floorKind !== undefined));

  return (
    <section
      className={`net-floor-card net-floor-card--${kind}`}
      aria-label="Piętro, na którym stoisz"
    >
      <header className="net-floor-card-head">
        <span className="net-floor-card-glyph" aria-hidden>
          {FLOOR_GLYPHS[kind]}
        </span>
        <span className="net-floor-card-title">{here.label || kindLabel}</span>
        {here.dv !== undefined && <span className="net-floor-card-dv">PT {here.dv}</span>}
      </header>
      <p className="net-floor-card-meta">
        {here.label && here.label !== kindLabel ? `${kindLabel} · ` : ''}głębokość {here.depth + 1}
      </p>

      {(here.broken ||
        here.controlledDv !== undefined ||
        here.identified ||
        here.copied ||
        here.hackFailed ||
        (here.programIds?.length ?? 0) > 0) && (
        <p className="net-floor-card-flags">
          {here.broken && <span className="net-run-floor-flag">złamane</span>}
          {here.controlledDv !== undefined && (
            <span className="net-run-floor-flag">przejęty · PT {here.controlledDv}</span>
          )}
          {here.identified && <span className="net-run-floor-flag">rozpoznany</span>}
          {here.copied && <span className="net-run-floor-flag">kopia na deku</span>}
          {here.hackFailed && (
            <span
              className="net-run-floor-flag"
              title="Ta postać już raz poległa tu na tej scenie — drugiej próby nie ma"
            >
              próba zużyta
            </span>
          )}
          {here.programIds && here.programIds.length > 0 && (
            <span className="net-run-floor-flag net-run-floor-flag--ice">
              {plural(here.programIds.length, 'Program', 'Programy', 'Programów')} — walka w Sieci
            </span>
          )}
        </p>
      )}

      {hint && <p className="net-run-hint">{hint}</p>}
      {here.notes && <p className="net-run-floor-notes">{here.notes}</p>}

      {sighted.length > 0 && (
        <ul className="net-node-sighted" aria-label="Urządzenia tego węzła">
          {sighted.map((device, index) => (
            <li key={index} className="net-sighted-device">
              <span className="net-node-name">{device.name}</span>
              {device.name !== NET_DEVICE_KIND_LABELS[device.deviceKind] && (
                <span className="net-node-kind">{NET_DEVICE_KIND_LABELS[device.deviceKind]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <NetNodeDevices
        node={here}
        targets={targets}
        busy={busy}
        sceneId={sceneId}
        onOperate={(deviceId, operation, extra) => onOperate(here.id, deviceId, operation, extra)}
        onShow={onShow}
      />

      {virusPending && (
        <InlineNotice tone="info" title="Wirus w budowie" role="status">
          {virusPending.actionsSpent} / {virusPending.actionsNeeded} Akcji Sieciowych · PT{' '}
          {virusPending.dv} — {virusPending.description}
        </InlineNotice>
      )}

      <div className="net-abilities">
        {abilities.map((entry) => {
          // Zlecenia MG z 02.11: zdolność, której jedyną próbę ta postać już tu
          // wykorzystała na tej scenie (`NET_TRY_LIMITS`; serwer i tak odmówi),
          // i włamanie, które już się udało (pamiętane po ponownym połączeniu).
          const spent = run.spentAbilities.includes(entry.id);
          const done =
            (entry.id === 'backdoor' && here.broken === true) ||
            (entry.id === 'eyed' && here.identified === true) ||
            (entry.id === 'control' && here.controlledDv !== undefined);
          return (
            <button
              key={entry.id}
              type="button"
              className="small-button net-ability"
              title={
                spent
                  ? 'Próba już zużyta na tej scenie'
                  : done
                    ? 'Już się udało — nie trzeba powtarzać'
                    : `${entry.hint} Kosztuje Akcję Sieciową.`
              }
              disabled={busy || spent || done}
              onClick={() => {
                if (entry.id === 'virus' && !virusPending) setVirusOpen(true);
                else onAbility(entry.id);
              }}
            >
              {entry.name}
            </button>
          );
        })}
        {here.kind === 'file' && !here.copied && (
          <button
            type="button"
            className="small-button net-ability net-ability--free"
            title="Kopia Pliku na cyberdek — nie zużywa Akcji Sieciowej"
            disabled={busy}
            onClick={() => onCopy(here.id)}
          >
            Skopiuj Plik
          </button>
        )}
      </div>

      {virusOpen && (
        <VirusForm
          busy={busy}
          onCancel={() => setVirusOpen(false)}
          onSubmit={(virus) => {
            setVirusOpen(false);
            onAbility('virus', virus);
          }}
        />
      )}
    </section>
  );
}
