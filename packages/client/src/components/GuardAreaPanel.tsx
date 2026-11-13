import { useMemo, useState } from 'react';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  NET_DEVICE_KIND_BY_GLYPH,
  netDefenseGlyph,
  netDefenseSystemEntries,
  type NetDefenseEntry,
  type TokenGlyph,
  type TokenView,
} from '@vtt/shared';
import { deleteZone, updateZone } from '../socket.js';
import { netErrorText } from '../netErrors.js';
import { noteAck } from '../notices.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useMapToolStore } from '../stores/mapToolStore.js';
import { useZoneStore } from '../stores/zoneStore.js';
import { ZoneSystemPicker } from './ZoneSystemPicker.js';

/**
 * Czy figura z tą ikoną może mieć obszar straży (etap 70d) — wieżyczka, dron,
 * dron naziemny i robot: urządzenia Sieci, które strzelają. Kamera patrzy
 * stożkiem, a czujnik i terminal są przełącznikami.
 */
export function hasGuardArea(glyph: TokenGlyph | null | undefined): boolean {
  if (!glyph) return false;
  const kind = NET_DEVICE_KIND_BY_GLYPH[glyph];
  return kind === 'turret' || kind === 'drone';
}

/** Wpis podpowiadany na start: wieżyczka — stanowisko, które strzela; dron — dron z ikoną. */
function defaultEntry(glyph: TokenGlyph, entries: readonly NetDefenseEntry[]): string {
  const kind = NET_DEVICE_KIND_BY_GLYPH[glyph];
  const fires = entries.filter(
    (entry) => entry.defenseKind === 'emplacement' && entry.effects?.fires,
  );
  const pick =
    kind === 'turret'
      ? (fires.find((entry) => /wieżyczk/i.test(entry.name)) ?? fires[0])
      : (entries.find((entry) => netDefenseGlyph(entry) === glyph) ??
        entries.find((entry) => entry.defenseKind === 'drone'));
  return pick?.id ?? entries[0]?.id ?? '';
}

function dvInput(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  const dv = Number(text);
  return Number.isInteger(dv) && dv >= CHECK_CALL_DV_MIN && dv <= CHECK_CALL_DV_MAX ? dv : null;
}

/**
 * „Obszar straży” figury urządzenia w menu MG (etap 70d, decyzja MG nr 8
 * z 11.11): kamera, wieżyczka i dron to zawsze figura, a prostokąt, na którym
 * strzela, rysuje się od figury — nie od strefy do figury jak w 26f / 51.
 *
 * Pod spodem to zwykła strefa obronna z `tokenId`: wpis „Obrona Sieci” daje
 * figurze Wartość bojową, RUCH i PW, a samodzielna obrona z 26f działa bez
 * zmian. „Narysuj obszar” bierze narzędzie stref na jeden prostokąt.
 */
export function GuardAreaPanel({ token, onDone }: { token: TokenView; onDone: () => void }) {
  const compendiumEntries = useCompendiumStore((s) => s.entries);
  const compendiumOrder = useCompendiumStore((s) => s.order);
  const zones = useZoneStore((s) => s.zones);
  const setZoneGuard = useMapToolStore((s) => s.setZoneGuard);
  const entries = useMemo(
    () =>
      netDefenseSystemEntries(
        compendiumOrder.map((id) => compendiumEntries[id]).filter((e) => e !== undefined),
      ).filter((entry) => entry.defenseKind === 'drone' || entry.defenseKind === 'emplacement'),
    [compendiumEntries, compendiumOrder],
  );
  const guard = zones.find((zone) => zone.tokenId === token.id);
  const [entryId, setEntryId] = useState(() =>
    token.glyph ? defaultEntry(token.glyph, entries) : '',
  );
  const [spotDv, setSpotDv] = useState('');
  const [busy, setBusy] = useState(false);

  if (guard) {
    const entry = entries.find((row) => row.id === guard.entryId);
    return (
      <div className="guard-area" role="group" aria-label="Obszar straży">
        <p className="placeholder-text">
          {entry?.name ?? guard.entryId}
          {guard.hidden ? ' · gracze go nie widzą' : ''}
        </p>
        <label
          className="guard-area-dv"
          title="PT Percepcji, którym gracz zauważa obszar, podchodząc na 4 m. Puste — PT z wpisu (wieżyczka go nie ma: obszaru nikt sam nie zauważy)"
        >
          <span className="auth-label">PT 👁</span>
          <input
            key={`spot-${guard.spotDv ?? 'entry'}`}
            type="number"
            className="map-tool-number"
            min={CHECK_CALL_DV_MIN}
            max={CHECK_CALL_DV_MAX}
            defaultValue={guard.spotDv ?? ''}
            placeholder={entry?.spotDv !== undefined ? String(entry.spotDv) : '—'}
            aria-label="PT Percepcji obszaru straży"
            onBlur={(event) => {
              const dv = dvInput(event.target.value);
              if (dv === (guard.spotDv ?? null)) return;
              void updateZone(guard.id, { spotDv: dv }).then((ack) =>
                noteAck('net', ack, netErrorText),
              );
            }}
          />
        </label>
        <button
          type="button"
          className="context-menu-item context-menu-item--danger"
          title="Figura zostaje; obszar znika (Ctrl+Z cofa)"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void deleteZone(guard.id).then((ack) => {
              setBusy(false);
              noteAck('net', ack, netErrorText);
            });
          }}
        >
          🗑 Usuń obszar straży
        </button>
      </div>
    );
  }

  return (
    <div className="guard-area" role="group" aria-label="Obszar straży">
      <ZoneSystemPicker entries={entries} value={entryId} onChange={setEntryId} />
      <label
        className="guard-area-dv"
        title="PT Percepcji, którym gracz zauważa obszar, podchodząc na 4 m. Puste — PT z wpisu (wieżyczka go nie ma: obszaru nikt sam nie zauważy)"
      >
        <span className="auth-label">PT 👁</span>
        <input
          type="number"
          className="map-tool-number"
          min={CHECK_CALL_DV_MIN}
          max={CHECK_CALL_DV_MAX}
          value={spotDv}
          placeholder="—"
          aria-label="PT Percepcji obszaru straży"
          onChange={(event) => setSpotDv(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="context-menu-item"
        disabled={!entryId}
        title="Przeciągnij prostokąt na mapie: kto bez przepustki w niego wejdzie, do tego figura strzela sama (s. 214). Wpis daje jej Wartość bojową, PW i RUCH; broń ustawiasz w „Edytuj…” (statystyki bojowe)"
        onClick={() => {
          setZoneGuard({ tokenId: token.id, entryId, name: token.name, spotDv: dvInput(spotDv) });
          onDone();
        }}
      >
        ▭ Narysuj obszar straży
      </button>
    </div>
  );
}
