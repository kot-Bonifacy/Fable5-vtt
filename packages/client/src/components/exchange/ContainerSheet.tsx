import { useMemo, useState } from 'react';
import type { CpredCharacterData, CpredContainer } from '@vtt/shared';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  CONTAINER_LOCKS,
  CONTAINER_LOCK_LABELS,
  CPRED_ITEM_LIST_LABELS,
  CPRED_LOCK_SKILLS,
  EDDIES_MAX,
  cpredInventoryView,
  isContainerCard,
  type ContainerLock,
} from '@vtt/shared';
import { noteAck, notifyInfo, notifyRefusal } from '../../notices.js';
import { configContainer, inventoryErrorText } from '../../socket.js';
import { useCharacterStore, type CharacterSheetView } from '../../stores/characterStore.js';
import { ItemViewIcon } from '../ItemIcons.js';
import { NumberStepper } from '../NumberStepper.js';
import { ContainerItemPicker } from './ContainerItemPicker.js';
import { itemDetail, itemKey } from './items.js';
import { openExchangeForCard } from './open.js';

/**
 * Karta pojemnika u MG (etap 46b2, decyzja MG z 09.10: kompaktowa).
 *
 * Pojemnik nie ma Cech, PW ani Umiejętności, więc zamiast czterech stron
 * karty jest jedna: zamek i zawartość. Zamek pisze wyłącznie serwer
 * (`container:config`) — łata karty z polem `container` dostaje `FORBIDDEN`,
 * żeby autozapis MG nie zamknął skrzyni, którą gracz właśnie otworzył.
 * Zawartość to zwykły ekwipunek karty: „✕” zdejmuje wiersz, eurodolce zmienia
 * pole; rzeczy dokłada „+ Z katalogu…” (za darmo, jak „Dodaj za darmo”
 * w Kompendium) albo okno „Wymiana” w trybie MG.
 */
export function ContainerSheet({
  character,
  container,
  saveData,
  saveName,
}: {
  character: CharacterSheetView;
  container: CpredContainer;
  saveData: (patch: Partial<CpredCharacterData>, fieldKey: string) => void;
  saveName: (value: string) => void;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const [keyHolder, setKeyHolder] = useState('');
  const [picking, setPicking] = useState(false);
  const data = character.data;
  const items = cpredInventoryView(data);

  // Klucz dostaje karta, która może go nieść — każda poza pojemnikami.
  const holders = useMemo(
    () =>
      order
        .map((id) => characters[id])
        .filter((card) => card !== undefined && !isContainerCard(card.data))
        .map((card) => ({ id: card!.id, name: card!.name })),
    [order, characters],
  );

  const skillName = (id: string) => registry.skills.find((skill) => skill.id === id)?.name ?? id;

  async function config(patch: Parameters<typeof configContainer>[0], done?: string) {
    const ack = await configContainer(patch);
    if (noteAck('character', ack, inventoryErrorText) && done) {
      notifyInfo(done, { topic: 'character' });
    }
  }

  function toggleSkill(id: string, on: boolean) {
    const next = on
      ? [...new Set([...container.skills, id])]
      : container.skills.filter((skill) => skill !== id);
    if (next.length === 0) {
      notifyRefusal('character', 'Zamek musi dać się otworzyć przynajmniej jedną Umiejętnością.');
      return;
    }
    void config({ characterId: character.id, skills: next });
  }

  function removeRow(list: 'weapons' | 'armor' | 'gear', rowId: string) {
    if (list === 'weapons') {
      saveData({ weapons: data.weapons.filter((row) => row.id !== rowId) }, 'weapons');
    } else if (list === 'armor') {
      saveData({ armor: data.armor.filter((row) => row.id !== rowId) }, 'armor');
    } else {
      saveData({ gear: data.gear.filter((row) => row.id !== rowId) }, 'gear');
    }
  }

  return (
    <div className="container-sheet" data-container-sheet>
      <div className="cp-panel">
        <label className="cp-field container-sheet-name">
          <span className="cp-label">Nazwa</span>
          <input
            type="text"
            maxLength={64}
            value={character.name}
            onChange={(e) => saveName(e.target.value)}
            aria-label="Nazwa pojemnika"
          />
        </label>
        {container.pile && (
          <p className="cp-field container-sheet-note">
            Stos z upuszczenia — znika sam, gdy ktoś wyjmie z niego ostatnią rzecz.
          </p>
        )}
      </div>

      <section className="cp-panel" aria-label="Zamek">
        <div className="cp-bar cp-bar--plain">
          <span>Zamek</span>
        </div>
        <div className="cp-field container-sheet-row">
          <span className="cp-label">Stan</span>
          <select
            value={container.lock}
            aria-label="Stan zamka"
            onChange={(e) =>
              void config({ characterId: character.id, lock: e.target.value as ContainerLock })
            }
          >
            {CONTAINER_LOCKS.map((lock) => (
              <option key={lock} value={lock}>
                {CONTAINER_LOCK_LABELS[lock]}
              </option>
            ))}
          </select>
          {container.lock === 'locked' && (
            <>
              <span
                className="cp-label cp-label--right"
                title="Próg Testu zamka — 13 to „Codzienny” (s. 129)"
              >
                PT
              </span>
              <NumberStepper
                min={CHECK_CALL_DV_MIN}
                max={CHECK_CALL_DV_MAX}
                value={container.dv}
                label="PT zamka"
                onChange={(dv) => void config({ characterId: character.id, dv })}
              />
            </>
          )}
        </div>
        {container.lock === 'locked' && (
          <div
            className="cp-field container-sheet-row"
            role="group"
            aria-label="Czym otworzyć zamek"
          >
            <span className="cp-label">Test</span>
            {CPRED_LOCK_SKILLS.map((id) => (
              <label key={id} className="container-sheet-check">
                <input
                  type="checkbox"
                  checked={container.skills.includes(id)}
                  onChange={(e) => toggleSkill(id, e.target.checked)}
                />
                {skillName(id)}
              </label>
            ))}
          </div>
        )}
        <div className="cp-field container-sheet-row">
          <span className="cp-label">Klucz</span>
          <select
            value={keyHolder}
            aria-label="Komu wydać klucz"
            onChange={(e) => setKeyHolder(e.target.value)}
          >
            <option value="">— komu —</option>
            {holders.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cp-mini-button"
            disabled={keyHolder === ''}
            title="Na kartę trafia wiersz „Klucz: …” — otwiera ten zamek bez Testu"
            onClick={() => {
              const name = holders.find((card) => card.id === keyHolder)?.name ?? '';
              void config(
                { characterId: character.id, issueKeyTo: keyHolder },
                `Klucz trafił na kartę: ${name}.`,
              );
              setKeyHolder('');
            }}
          >
            🔑 Wydaj klucz
          </button>
        </div>
        {container.tried.length > 0 && (
          <div className="cp-field container-sheet-row">
            <span className="cp-label">Nieudane próby: {container.tried.length}</span>
            <button
              type="button"
              className="cp-mini-button"
              title="Postacie, którym Test zamka nie wyszedł, mogą spróbować jeszcze raz"
              onClick={() =>
                void config(
                  { characterId: character.id, resetTries: true },
                  'Wszyscy mogą spróbować znowu.',
                )
              }
            >
              ↻ Pozwól spróbować znowu
            </button>
          </div>
        )}
      </section>

      <section className="cp-panel" aria-label="Zawartość">
        <div className="cp-bar cp-bar--plain container-sheet-bar">
          <span>Zawartość</span>
          <span className="container-sheet-actions">
            <button
              type="button"
              className="cp-mini-button"
              aria-pressed={picking}
              title="Włóż do pojemnika rzecz z katalogu — za darmo, jak „Dodaj za darmo” w Kompendium"
              onClick={() => setPicking((open) => !open)}
            >
              + Z katalogu…
            </button>
            <button
              type="button"
              className="cp-mini-button"
              title="Przenieś rzeczy między tym pojemnikiem a dowolną kartą"
              onClick={() => openExchangeForCard(character.id)}
            >
              Wymiana…
            </button>
          </span>
        </div>
        <div className="cp-field container-sheet-list">
          {items.length === 0 ? (
            <p className="container-sheet-note">
              Pusto. Rzeczy wkładasz przyciskiem „+ Z katalogu…” albo oknem „Wymiana”.
            </p>
          ) : (
            <ul className="inventory-list">
              {items.map((item) => (
                <li key={itemKey(item)} className="inventory-row">
                  <ItemViewIcon item={item} />
                  <span className="inventory-row-name" title={CPRED_ITEM_LIST_LABELS[item.list]}>
                    {item.name}
                  </span>
                  <span className="inventory-row-detail">{itemDetail(item) || item.detail}</span>
                  <button
                    type="button"
                    className="cp-mini-button cp-mini-button--danger"
                    title="Wyjmij z pojemnika na zawsze"
                    aria-label={`Usuń z pojemnika: ${item.name}`}
                    onClick={() => removeRow(item.list, item.rowId)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {picking && (
          <div className="container-sheet-picker">
            <ContainerItemPicker characterId={character.id} onClose={() => setPicking(false)} />
          </div>
        )}
        <div className="cp-field container-sheet-row">
          <span className="cp-label">Gotówka (ed)</span>
          <NumberStepper
            min={0}
            max={EDDIES_MAX}
            value={data.eddies}
            label="Eurodolce w pojemniku"
            onChange={(eddies) => saveData({ eddies }, 'eddies')}
          />
        </div>
      </section>
    </div>
  );
}
