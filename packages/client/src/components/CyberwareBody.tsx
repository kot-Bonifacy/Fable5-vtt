import { useMemo } from 'react';
import {
  CYBERWARE_BODY_LISTS,
  CYBERWARE_BODY_SLOT_LABELS,
  CYBERWARE_TYPE_LABELS,
  cyberpsychosisFor,
  cyberwareBodyMap,
  empFromHumanity,
  humanityMaxWith,
  type CpredCharacterData,
  type CpredCyberwareRow,
  type CyberwareBodySlot,
} from '@vtt/shared';

import { BODY_SILHOUETTE_PATH, BODY_SILHOUETTE_SIZE } from './body-silhouette.js';

/**
 * Strona trzecia karty (etap 27c) — sylwetka z gniazdami cyborgizacji.
 *
 * Rysunek jest **mapą, nie edytorem**: pokazuje, co gdzie siedzi, a zmiany
 * (gniazdo, uwagi, usunięcie) robi się w tabeli pod nim. Dwa miejsca do
 * klikania tej samej rzeczy to ta sama pomyłka, przed którą 27a broniło
 * portret i „Notatki" — jedno pole, jeden edytor.
 */

/**
 * Układ rysunku: kontur ma 970 jednostek szerokości, a wokół niego zostaje
 * po ~560 jednostek marginesu na dwie kolumny etykiet z odnośnikami.
 */
const VIEW = { x: -560, y: 0, width: 2090, height: BODY_SILHOUETTE_SIZE.height } as const;

/** Krawędzie, do których dobiegają odnośniki (i przy których stoją pudełka). */
const GUTTER_LEFT = -60;
const GUTTER_RIGHT = 1030;

interface SlotAnchor {
  /** Punkt na ciele, spróbkowany z konturu (oko, ucho, kark, ramię, udo). */
  x: number;
  y: number;
  /** Po której stronie rysunku stoi pudełko z nazwą. */
  side: 'left' | 'right';
  /** Wysokość pudełka w jednostkach rysunku. */
  boxY: number;
}

/**
 * Osiem gniazd z wydruku. Strony są **postaci, nie widza**: widok jest od
 * przodu, więc prawe oko postaci leży po lewej stronie rysunku — i po lewej
 * stronie stoją wszystkie „prawe" pudełka.
 */
const SLOT_ANCHORS: Record<CyberwareBodySlot, SlotAnchor> = {
  eyeRight: { x: 420, y: 130, side: 'left', boxY: 180 },
  eyeLeft: { x: 540, y: 130, side: 'right', boxY: 180 },
  // Kark, nie pierś: sylwetka ma krótką szyję, więc punkt siedzi tuż pod brodą.
  neural: { x: 480, y: 290, side: 'left', boxY: 560 },
  // Ucho leży niżej niż oko i przy samej krawędzi głowy — przy równej wysokości
  // z okiem oba kółka stykały się i wyglądały jak trzecie oko (oględziny 14.08).
  cyberaudio: { x: 578, y: 222, side: 'right', boxY: 560 },
  armRight: { x: 200, y: 880, side: 'left', boxY: 1010 },
  armLeft: { x: 775, y: 880, side: 'right', boxY: 1010 },
  legRight: { x: 366, y: 1700, side: 'left', boxY: 1700 },
  legLeft: { x: 636, y: 1700, side: 'right', boxY: 1700 },
};

/** Kolejność rysowania pudełek — od góry, żeby odnośniki się nie plątały. */
const SLOT_ORDER: CyberwareBodySlot[] = [
  'eyeRight',
  'eyeLeft',
  'neural',
  'cyberaudio',
  'armRight',
  'armLeft',
  'legRight',
  'legLeft',
];

function percentX(x: number): number {
  return ((x - VIEW.x) / VIEW.width) * 100;
}

function percentY(y: number): number {
  return (y / VIEW.height) * 100;
}

export function CyberwareBody({
  data,
  onFocusRow,
  focusRowId,
}: {
  data: CpredCharacterData;
  /** Klik w nazwę wszczepu podświetla jego wiersz w tabeli pod rysunkiem. */
  onFocusRow: (rowId: string) => void;
  focusRowId: string | null;
}) {
  const map = useMemo(() => cyberwareBodyMap<CpredCyberwareRow>(data.cyberware), [data.cyberware]);
  const ceiling = humanityMaxWith(data.stats, data.cyberware);
  const psychosis = cyberpsychosisFor(data.humanityCurrent);
  const emp = empFromHumanity(data.humanityCurrent);

  return (
    <div className="cp-chrome">
      {/* Człowieczeństwo i EMP stoją przy sylwetce, bo to ona je wydaje —
          ale wyłącznie do odczytu: pole do wpisania jest jedno, na stronie
          pierwszej, i drugie kłóciłoby się z nim przy każdej terapii. */}
      <div className="cp-panel cp-chrome-pools">
        <div
          className="cp-field cp-field--notch cp-pool cp-pool--flat"
          title="Człowieczeństwo obecne z maksymalnego. Wpisuje się je na stronie pierwszej."
        >
          <span className="cp-label">Człowieczeństwo</span>
          <span className="cp-pool-value">
            {data.humanityCurrent} <span className="cp-of">z</span> {ceiling}
          </span>
        </div>
        <div
          className="cp-field cp-pool cp-pool--flat"
          title="EMP używana w grze: Człowieczeństwo ÷ 10 w dół (s. 229). Na karcie zostaje EMP bazowa."
        >
          <span className="cp-label">EMP w grze</span>
          <span className="cp-pool-value">
            {emp} <span className="cp-of">z</span> {data.stats.emp}
          </span>
        </div>
        <div
          className={`cp-field cp-pool cp-pool--flat cp-psychosis cp-psychosis--${psychosis.level}`}
          title={psychosis.note}
        >
          <span className="cp-label">Cyberpsychoza</span>
          <span className="cp-pool-value">{psychosis.label}</span>
        </div>
      </div>

      <div className="cp-body">
        <svg
          className="cp-body-svg"
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
          role="img"
          aria-label="Sylwetka z gniazdami cyborgizacji"
        >
          <path className="cp-body-shape" d={BODY_SILHOUETTE_PATH} />
          {SLOT_ORDER.map((slot) => {
            const anchor = SLOT_ANCHORS[slot];
            const gutter = anchor.side === 'left' ? GUTTER_LEFT : GUTTER_RIGHT;
            const filled = map.slots[slot].length > 0;
            return (
              <g key={slot} className={`cp-body-lead ${filled ? 'cp-body-lead--on' : ''}`}>
                <line x1={anchor.x} y1={anchor.y} x2={gutter} y2={anchor.boxY} />
                <circle cx={anchor.x} cy={anchor.y} r={26} />
              </g>
            );
          })}
        </svg>

        {SLOT_ORDER.map((slot) => {
          const anchor = SLOT_ANCHORS[slot];
          const rows = map.slots[slot];
          const left = anchor.side === 'left' ? 0 : percentX(GUTTER_RIGHT);
          return (
            <div
              key={slot}
              className={`cp-slot cp-slot--${anchor.side} ${rows.length > 0 ? 'cp-slot--on' : ''}`}
              style={{
                left: `${left}%`,
                width: `${percentX(GUTTER_LEFT)}%`,
                top: `${percentY(anchor.boxY)}%`,
              }}
            >
              <span className="cp-slot-label">{CYBERWARE_BODY_SLOT_LABELS[slot]}</span>
              {rows.length === 0 ? (
                <span className="cp-slot-empty">puste</span>
              ) : (
                <ul className="cp-slot-list">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={focusRowId === row.id ? 'cp-slot-item--on' : undefined}
                        onClick={() => onFocusRow(row.id)}
                        title="Pokaż w tabeli cyborgizacji"
                      >
                        {row.name || 'bez nazwy'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {map.unplaced.length > 0 && (
        <p className="cp-body-unplaced">
          Bez gniazda: {map.unplaced.map((row) => row.name || 'bez nazwy').join(', ')}. Wskaż je w
          kolumnie „Gniazdo” w tabeli niżej — podręcznik pyta „które oko?”, a VTT nie zgaduje.
        </p>
      )}

      <div className="cp-body-lists">
        {CYBERWARE_BODY_LISTS.map((list) => (
          <section key={list} className="cp-panel cp-body-list">
            <div className="cp-bar cp-bar--plain">{CYBERWARE_TYPE_LABELS[list]}</div>
            {map.lists[list].length === 0 ? (
              <div className="cp-field cp-body-list-empty">—</div>
            ) : (
              map.lists[list].map((row) => (
                <div key={row.id} className="cp-field cp-row">
                  <button
                    type="button"
                    className={`cp-body-list-item ${focusRowId === row.id ? 'cp-slot-item--on' : ''}`}
                    onClick={() => onFocusRow(row.id)}
                    title="Pokaż w tabeli cyborgizacji"
                  >
                    {row.name || 'bez nazwy'}
                  </button>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
