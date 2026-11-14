import { useEffect, useRef, useState } from 'react';
import type { ScenePoint } from '@vtt/shared';
import { NET_DEVICE_OPERATION_LABELS } from '@vtt/shared';
import { operateNetDevice } from '../socket.js';
import { netErrorText } from '../netErrors.js';
import { notifyInfo, notifyRefusal } from '../notices.js';
import { useCompendiumStore } from '../stores/compendiumStore.js';
import { useNetRunStore } from '../stores/netRunStore.js';
import { useSceneStore } from '../stores/sceneStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useZoneAskStore } from '../stores/zoneAskStore.js';
import { useZoneStore } from '../stores/zoneStore.js';
import { zoneGuardNote, zoneNetSwitch } from '../zone-ask.js';
import { startDisarm, zonesWithinReach } from '../zone-disarm.js';

const OFFSET = 14;
const ESTIMATED_WIDTH = 240;

interface Props {
  /** „Wejdź mimo to”: ten sam klik jeszcze raz, bez pytania o strefę. */
  onProceed: (tokenId: string, goal: ScenePoint) => void;
}

/**
 * Okienko strefy przy kursorze (etap 70d; zaległość 🔴 66e pkt 3) — klik
 * w zauważoną strefę albo marsz przez nią nie idzie od razu. Gracz wybiera:
 * „Wejdź mimo to”, „Rozbrój” (w zasięgu ręki, Test jak z menu figury), a gdy
 * jego run trzyma węzeł strefy — „Wyłącz” / „Włącz” (Akcja Sieciowa w walce,
 * decyzja MG nr 3 z 11.11). `Esc` albo klik obok — nic się nie dzieje.
 */
export function ZoneAskMenu({ onProceed }: Props) {
  const ask = useZoneAskStore((s) => s.ask);
  const close = useZoneAskStore((s) => s.close);
  const zones = useZoneStore((s) => s.zones);
  const runs = useNetRunStore((s) => s.runs);
  const entries = useCompendiumStore((s) => s.entries);
  const token = useTokenStore((s) => (ask ? s.tokens[ask.tokenId] : undefined));
  const scene = useSceneStore((s) => s.effectiveScene);
  const ref = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ask) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    const onDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey, true);
    // Jak `TargetPickMenu`: okienko otwiera ten sam `pointerdown`.
    const arm = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [ask, close]);

  const present = ask ? zones.filter((zone) => ask.zoneIds.includes(zone.id)) : [];
  // Strefa zniknęła (MG ją skasował, zmiana sceny) albo figura — pytanie schodzi.
  useEffect(() => {
    if (ask && (present.length === 0 || !token)) close();
  }, [ask, present.length, token, close]);

  if (!ask || present.length === 0 || !token) return null;

  const height = 60 + present.length * 84;
  const left = Math.max(8, Math.min(ask.x + OFFSET, window.innerWidth - ESTIMATED_WIDTH));
  const top = Math.max(8, Math.min(ask.y + OFFSET, window.innerHeight - height - 8));
  const characterId = token.characterId;
  const inReach = new Set(zonesWithinReach(token, present, scene).map((zone) => zone.id));

  async function toggle(zoneId: number) {
    const sw = zoneNetSwitch(runs, zoneId);
    if (!sw) return;
    setBusy(true);
    const ack = await operateNetDevice({
      runId: sw.runId,
      floorId: sw.floorId,
      deviceId: sw.device.id,
      operation: sw.device.on ? 'off' : 'on',
    });
    setBusy(false);
    close();
    if (!ack.ok) notifyRefusal('net', netErrorText(ack.error));
    else if (ack.data?.summary) notifyInfo(ack.data.summary, { title: 'Sieć', topic: 'net' });
  }

  return (
    <div
      ref={ref}
      className="target-pick zone-ask"
      role="dialog"
      aria-label="Strefa na drodze"
      style={{ left, top }}
    >
      {present.map((zone) => {
        const sw = zoneNetSwitch(runs, zone.id);
        const guard = zoneGuardNote(zone, entries);
        return (
          <div key={zone.id} className="zone-ask-zone" data-zone-id={zone.id}>
            <div className="target-pick-title">{zone.name}</div>
            {guard && <p className="zone-ask-note">{guard}</p>}
            {characterId && inReach.has(zone.id) && (
              <button
                type="button"
                className="target-pick-item"
                title="Test Elektroniki i zabezpieczeń z PT systemu; jedna próba na postać, a duża porażka go odpala"
                onClick={() => {
                  close();
                  void startDisarm(zone, characterId);
                }}
              >
                🛠 Rozbrój
              </button>
            )}
            {sw && (
              <button
                type="button"
                className="target-pick-item"
                title="Urządzenie węzła, który trzymasz w Sieci — w walce za Akcję Sieciową, węzeł raz na Turę"
                disabled={busy}
                onClick={() => void toggle(zone.id)}
              >
                ⚡ {NET_DEVICE_OPERATION_LABELS[sw.device.on ? 'off' : 'on']}
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="target-pick-item zone-ask-proceed"
        onClick={() => {
          close();
          onProceed(ask.tokenId, ask.goal);
        }}
      >
        Wejdź mimo to
      </button>
    </div>
  );
}
