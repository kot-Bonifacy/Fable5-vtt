import { useMemo, useState } from 'react';
import {
  CHECK_CALL_DV_MAX,
  CHECK_CALL_DV_MIN,
  CPRED_LOCK_SKILLS,
  isContainerCard,
  readCpredLock,
  type OpeningLockConfigPayload,
  type WallView,
} from '@vtt/shared';
import { noteAck, notifyInfo, notifyRefusal } from '../notices.js';
import { configOpeningLock, inventoryErrorText } from '../socket.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { NumberStepper } from './NumberStepper.js';

/**
 * Zamek zaryglowanego otworu na karcie ściany u MG (etap 58c) — to samo, co
 * zamek na karcie pojemnika (`ContainerSheet`): PT, Umiejętności, „Wydaj
 * klucz” i „Pozwól spróbować znowu”. Zamek pisze wyłącznie serwer
 * (`opening:lock-config`); gracz go nie dostaje, a o ryglu dowiaduje się
 * dopiero przy klamce.
 */
export function OpeningLockFields({ wall }: { wall: WallView }) {
  const registry = useCharacterStore((s) => s.registry);
  const characters = useCharacterStore((s) => s.characters);
  const order = useCharacterStore((s) => s.order);
  const [keyHolder, setKeyHolder] = useState('');
  const lock = readCpredLock(wall.lockRule);

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

  async function config(patch: Omit<OpeningLockConfigPayload, 'wallId'>, done?: string) {
    const ack = await configOpeningLock({ wallId: wall.id, ...patch });
    if (noteAck('scene', ack, inventoryErrorText) && done) notifyInfo(done, { topic: 'scene' });
  }

  function toggleSkill(id: string, on: boolean) {
    const next = on
      ? [...new Set([...lock.skills, id])]
      : lock.skills.filter((skill) => skill !== id);
    if (next.length === 0) {
      notifyRefusal('scene', 'Zamek musi dać się otworzyć przynajmniej jedną Umiejętnością.');
      return;
    }
    void config({ skills: next });
  }

  return (
    <fieldset className="bot-field" data-opening-lock>
      <legend className="auth-label">Zamek</legend>
      <label className="bot-field">
        <span className="auth-label" title="Próg Testu zamka — 13 to „Codzienny” (s. 129)">
          PT zamka
        </span>
        <NumberStepper
          min={CHECK_CALL_DV_MIN}
          max={CHECK_CALL_DV_MAX}
          value={lock.dv}
          label="PT zamka"
          onChange={(dv) => void config({ dv })}
        />
      </label>
      <div className="scene-card-choice" role="group" aria-label="Czym otworzyć zamek">
        {CPRED_LOCK_SKILLS.map((id) => (
          <label key={id} className="bot-checkbox">
            <input
              type="checkbox"
              checked={lock.skills.includes(id)}
              onChange={(event) => toggleSkill(id, event.target.checked)}
            />
            {skillName(id)}
          </label>
        ))}
      </div>
      <div className="scene-card-choice">
        <select
          value={keyHolder}
          aria-label="Komu wydać klucz"
          onChange={(event) => setKeyHolder(event.target.value)}
        >
          <option value="">— komu klucz —</option>
          {holders.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={keyHolder === ''}
          title="Na kartę trafia wiersz „Klucz: …” — otwiera ten zamek przy klamce, bez Testu"
          onClick={() => {
            const name = holders.find((card) => card.id === keyHolder)?.name ?? '';
            void config({ issueKeyTo: keyHolder }, `Klucz trafił na kartę: ${name}.`);
            setKeyHolder('');
          }}
        >
          🔑 Wydaj klucz
        </button>
      </div>
      {lock.tried.length > 0 && (
        <div className="scene-card-choice">
          <span className="placeholder-text">
            Nie udało się:{' '}
            {lock.tried.map((id) => characters[id]?.name ?? 'postać spoza listy').join(', ')}
          </span>
          <button
            type="button"
            className="small-button"
            title="Postacie, którym Test zamka nie wyszedł, mogą spróbować jeszcze raz"
            onClick={() => void config({ resetTries: true }, 'Wszyscy mogą spróbować znowu.')}
          >
            ↻ Pozwól spróbować znowu
          </button>
        </div>
      )}
    </fieldset>
  );
}
