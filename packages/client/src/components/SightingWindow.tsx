import { useMemo } from 'react';
import {
  CPRED_PERCEPTION_SKILL_ID,
  CPRED_SIGHTING_BARE_HEAD,
  type CpredSighting,
  type SightingLogEntry,
} from '@vtt/shared';
import { useSightingStore } from '../stores/sightingStore.js';
import { useTokenStore } from '../stores/tokenStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useChatStore } from '../stores/chatStore.js';
import { useCheckStore } from '../stores/checkStore.js';
import { useWindowPlacement } from '../window-placement.js';

/**
 * „Co on ma na sobie" — okno oględzin (etap 41).
 *
 * Dwa źródła, jedna lista. **Rzut oka** przychodzi z `sighting:look` przy każdym
 * otwarciu okna i mówi to, co widać: czy coś jest na głowie, co jest w rękach,
 * jaki chrom rzuca się w oczy. **Oględziny** przychodzą kartą czatu po zdanym
 * Teście Percepcji i mówią liczby. Gdy karta istnieje, wygrywa — bo wie więcej,
 * a nie dlatego, że jest nowsza.
 *
 * Rany czyta się z **żetonu**, nie stąd: jadą publicznie w `TokenView.injuries`
 * od 31.08 i drugi dom dla jednego faktu byłby drugim miejscem do poprawienia.
 */

/** Karta oględzin tej figury z czatu — najświeższa, gdy jest ich kilka. */
function detailFor(
  items: ReturnType<typeof useChatStore.getState>['items'],
  tokenId: string,
): SightingLogEntry | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== 'message') continue;
    const entry = item.message.sighting;
    if (entry && entry.targetTokenId === tokenId) return entry;
  }
  return null;
}

export function SightingWindow() {
  const tokenId = useSightingStore((s) => s.openTokenId);
  const glances = useSightingStore((s) => s.glances);
  const close = useSightingStore((s) => s.close);
  const tokens = useTokenStore((s) => s.tokens);
  const characters = useCharacterStore((s) => s.characters);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const items = useChatStore((s) => s.items);
  const placement = useWindowPlacement('sighting', () => ({ x: 260, y: 160 }));

  const detail = useMemo(() => (tokenId ? detailFor(items, tokenId) : null), [items, tokenId]);

  if (!tokenId) return null;
  const entry = glances[tokenId];
  const token = tokens[tokenId];
  const name = entry?.name ?? token?.name ?? 'Figura';
  // Karta z Testu wie więcej niż rzut oka, więc wygrywa — ale tylko ta o **tej**
  // figurze, co pilnuje `detailFor`.
  const sighting: CpredSighting | null =
    (detail?.sighting as CpredSighting | undefined) ?? entry?.sighting ?? null;

  /**
   * Karta, którą ten gracz może rzucić na Percepcję.
   *
   * Pierwsza własna z brzegu, bo prawie każdy gracz prowadzi jedną. MG ma ich
   * wiele i żadnej „swojej" — dlatego prośby o Test nie widzi: on te liczby
   * i tak ma na karcie NPC-a, a prosiłby sam siebie.
   */
  const mine = Object.values(characters).find((card) => card.ownerId === userId) ?? null;

  function askGm() {
    if (!mine) return;
    useCheckStore.getState().openRequest({
      characterId: mine.id,
      characterName: mine.name,
      // `sightingTokenId` jest jedyną rzeczą, która odróżnia tę prośbę od
      // każdego innego Testu Percepcji — i to serwer, nie okno, rozstrzyga,
      // co jej zdanie odsłoni.
      request: { kind: 'skill', skillId: CPRED_PERCEPTION_SKILL_ID, sightingTokenId: tokenId! },
      label: 'Percepcja — oględziny',
    });
    close();
  }

  return (
    <section
      ref={placement.ref}
      className="inventory-window sighting-window"
      style={placement.style}
      aria-label={`Oględziny: ${name}`}
    >
      <div className="inventory-window-header" {...placement.dragProps}>
        <span className="inventory-window-title">Oględziny — {name}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={close}
          title="Zamknij oględziny"
          aria-label="Zamknij oględziny"
        >
          ✕
        </button>
      </div>

      <div className="inventory-window-body">
        {!sighting ? (
          <p className="inventory-empty">Nie widać stąd nic, co dałoby się opisać.</p>
        ) : (
          <>
            {sighting.detailed && (
              <p className="sighting-badge" title="Liczby pochodzą ze zdanego Testu Percepcji">
                Przyjrzałeś się dokładnie
              </p>
            )}

            <p className="sighting-section">Na sobie</p>
            {sighting.armor.length === 0 ? (
              <p className="sighting-bare">
                Bez pancerza — {CPRED_SIGHTING_BARE_HEAD.toLowerCase()}
              </p>
            ) : (
              <ul className="sighting-list">
                {sighting.armor.map((row, index) => (
                  <li key={`${row.location}-${index}`}>
                    <span className="sighting-where">{row.locationLabel}</span>
                    <span className="sighting-what">
                      {row.name}
                      {row.spCurrent !== undefined && (
                        <span className="sighting-numbers">
                          {' '}
                          OB {row.spCurrent}/{row.sp}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                {/* Goła głowa jest osobnym zdaniem, a nie brakiem wiersza:
                    „nie ma hełmu" to informacja, po którą przyszedł cały etap. */}
                {!sighting.armor.some((row) => row.location === 'head') && (
                  <li className="sighting-bare">
                    <span className="sighting-where">Głowa</span>
                    <span className="sighting-what">bez ochrony</span>
                  </li>
                )}
              </ul>
            )}

            <p className="sighting-section">W rękach</p>
            {sighting.weapons.length === 0 ? (
              <p className="sighting-bare">Puste ręce</p>
            ) : (
              <ul className="sighting-list">
                {sighting.weapons.map((row, index) => (
                  <li key={`weapon-${index}`}>
                    <span className="sighting-what">{row.name}</span>
                    <span className="sighting-numbers">
                      {row.damage ? row.damage : ''}
                      {row.ammoMax !== undefined ? ` · ${row.ammoCurrent}/${row.ammoMax}` : ''}
                      {row.jammed ? ' · zacięta' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {sighting.chrome.length > 0 && (
              <>
                <p className="sighting-section">Widoczny chrom</p>
                <ul className="sighting-list">
                  {sighting.chrome.map((row, index) => (
                    <li key={`chrome-${index}`}>
                      <span className="sighting-what">{row.name}</span>
                      {row.slotLabel && <span className="sighting-numbers">{row.slotLabel}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {token?.injuries && token.injuries.length > 0 && (
              <>
                <p className="sighting-section">Widoczne rany</p>
                <ul className="sighting-list">
                  {token.injuries.map((injury, index) => (
                    <li key={`injury-${index}`}>
                      <span className="sighting-what">
                        {typeof injury.name === 'string' ? injury.name : 'Rana krytyczna'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!sighting.detailed && mine && (
              <>
                <button type="button" className="small-button sighting-ask" onClick={askGm}>
                  🔍 Poproś MG o dokładne oględziny
                </button>
                <p className="inventory-hint">
                  Test Percepcji — próg ustala MG. W walce kosztuje Akcję.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
