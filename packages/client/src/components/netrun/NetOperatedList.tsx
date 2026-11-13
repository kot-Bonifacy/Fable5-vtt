import type { NetOperatedState } from '@vtt/shared';
import { NET_DEVICE_KIND_LABELS } from '@vtt/shared';
import { takeFigure } from '../../hud.js';
import { operatedEntries } from '../../net-operated.js';
import { useNetRunStore } from '../../stores/netRunStore.js';
import { useSceneStore } from '../../stores/sceneStore.js';

const STATE_LABELS: Record<NetOperatedState, string> = {
  ready: 'gotowe',
  active: 'aktywne',
  spent: 'czynność wykonana',
  'node-used': 'węzeł użyty',
  free: 'gotowe',
};

/**
 * Sekcja „Przejęte” w zakładce „Postacie” gracza (etap 70b, pomysł MG z 07.11):
 * urządzenia, które netrunner trzyma przez swoje węzły. Czyta ten sam stan co
 * mapa i lewa belka (`NetRunPayload.operated`), więc lista nie ma własnej
 * prawdy — znika razem z kontrolą. Klik bierze figurę w rękę i przenosi kadr.
 */
export function NetOperatedList() {
  const runs = useNetRunStore((s) => s.runs);
  const sceneId = useSceneStore((s) => s.effectiveScene?.id ?? null);
  const entries = operatedEntries(runs);
  if (entries.length === 0) return null;
  return (
    <details className="character-group" data-character-group="operated" open>
      <summary title="Urządzenia przejęte w Sieci — prowadzisz je lewą belką, dopóki trzymasz ich węzeł">
        Przejęte ({entries.length})
      </summary>
      <ul className="character-list">
        {entries.map(({ figure }) => (
          <li key={figure.tokenId} className="character-row">
            <button
              type="button"
              className="character-row-text net-operated-row"
              disabled={figure.sceneId !== sceneId}
              title={
                figure.sceneId === sceneId ? 'Weź na mapie' : 'To urządzenie stoi na innej scenie'
              }
              onClick={() => takeFigure(figure.tokenId, true)}
            >
              <span className="character-row-name">{figure.name}</span>
              <span className="character-row-meta">
                {NET_DEVICE_KIND_LABELS[figure.deviceKind]} · przez: {figure.nodeLabel} ·{' '}
                {STATE_LABELS[figure.state]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
