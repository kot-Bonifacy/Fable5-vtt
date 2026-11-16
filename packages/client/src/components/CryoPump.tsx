import { useState } from 'react';
import {
  CPRED_CRYO_MINUTES,
  CPRED_CRYO_REFILL_PRICE,
  ROLE_GM,
  cpredCryopumpCapacity,
  cpredCryopumpCharges,
  cpredIsCryopump,
  cpredSheetMedicine,
  formatEddies,
  formatGameTime,
  formatWorkDuration,
  type CpredCharacterData,
} from '@vtt/shared';
import { sendCryo } from '../socket.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCharacterStore } from '../stores/characterStore.js';
import { COMBAT_LOCKED_HINT, useCombatLocked } from '../stores/combatStore.js';
import { useTokenStore } from '../stores/tokenStore.js';

/**
 * Kriopompa Medyka (etap 71d2, G19; s. 150, s. 353).
 *
 *  - `CryoGrantButton` — w panelu Medycyny: pompa z pierwszego punktu Obsługi
 *    kriosystemów, raz;
 *  - `CryoPumpSection` — pod Wyposażeniem: ładunki, „Zamroź” (Akcja, pacjent
 *    w zasięgu ramienia) i „Uzupełnij płyn”;
 *  - `CryoPatientNote` — na karcie pacjenta: „W kriośnie”, do kiedy,
 *    i „Rozmroź” dla Medyka, który zamroził, i MG.
 */

export function CryoGrantButton({
  characterId,
  data,
}: {
  characterId: string;
  data: CpredCharacterData;
}) {
  const [busy, setBusy] = useState(false);
  if (data.cryoPumpGranted) return null;
  return (
    <button
      type="button"
      disabled={busy}
      title="Pierwszy punkt Obsługi kriosystemów daje jedną kriopompę (s. 150) — ląduje w Wyposażeniu."
      onClick={() => {
        setBusy(true);
        void sendCryo({ action: 'grant', characterId }).finally(() => setBusy(false));
      }}
    >
      Odbierz kriopompę
    </button>
  );
}

export function CryoPumpSection({
  characterId,
  data,
}: {
  characterId: string;
  data: CpredCharacterData;
}) {
  const registry = useCharacterStore((s) => s.registry);
  const tokens = useTokenStore((s) => s.tokens);
  const locked = useCombatLocked();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const pumps = data.gear.filter((row) => cpredIsCryopump(row));
  if (pumps.length === 0) return null;
  const medicine = cpredSheetMedicine(data, registry);
  const medic = medicine.rank > 0;
  const capacity = cpredCryopumpCapacity(medicine.cryo);
  // Gracz nie widzi `characterId` cudzych figur (filtr serwera) — lista bierze
  // wszystkie nazwane poza własną; figurę bez karty odrzuci serwer (`NO_TARGET_SHEET`).
  const figures = Object.values(tokens).filter(
    (token) => token.name.length > 0 && token.characterId !== characterId,
  );

  function run(action: 'freeze' | 'refill', gearRowId: string) {
    setBusy(true);
    void sendCryo({
      action,
      characterId,
      gearRowId,
      ...(action === 'freeze' ? { targetTokenId: targetId } : {}),
    }).finally(() => setBusy(false));
  }

  return (
    <div className="cp-panel cp-doses cp-cryo">
      <div className="cp-field cp-field--notch cp-doses-target-field">
        <span className="cp-label">Kriopompa</span>
        <label className="cp-doses-target">
          Kogo:
          <select
            value={targetId}
            aria-label="Kogo zamrozić"
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">— pacjent —</option>
            {figures.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="cp-doses-list">
        {pumps.map((row) => {
          const charges = cpredCryopumpCharges(row, medicine.cryo);
          const used = row.cryoUsed ?? 0;
          return (
            <li key={row.id} data-cryopump={row.id}>
              <span className="cp-doses-name">{row.name}</span>
              <span
                className="cp-doses-qty"
                title="Ładunki: 1, przy 4 i 5 punktach Obsługi kriosystemów — 2 i 3 (s. 150)"
              >
                ładunki {charges}/{capacity}
              </span>
              <button
                type="button"
                disabled={busy || !medic || charges < 1 || !targetId}
                title={
                  !medic
                    ? 'Kriopompę obsługuje wyłącznie Medyk (s. 353).'
                    : charges < 1
                      ? 'Nie ma ładunku — uzupełnij płyn.'
                      : `Akcja: nieprzytomny albo zgadzający się pacjent w zasięgu ramienia ląduje w worku — przez ${formatWorkDuration(CPRED_CRYO_MINUTES)} bez rzutów przeciw śmierci, osłona 15 PW (s. 353).`
                }
                onClick={() => run('freeze', row.id)}
              >
                Zamroź
              </button>
              {used > 0 ? (
                <button
                  type="button"
                  disabled={busy || locked}
                  title={
                    locked
                      ? COMBAT_LOCKED_HINT
                      : `Płyn: ${formatEddies(CPRED_CRYO_REFILL_PRICE)} ed za ładunek (50 ed Drogo, s. 353, w cenniku domowym).`
                  }
                  onClick={() => run('refill', row.id)}
                >
                  Uzupełnij ({formatEddies(used * CPRED_CRYO_REFILL_PRICE)} ed)
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CryoPatientNote({
  characterId,
  data,
}: {
  characterId: string;
  data: CpredCharacterData;
}) {
  const user = useAuthStore((s) => s.user);
  const medic = useCharacterStore((s) =>
    data.cryo ? (s.characters[data.cryo.byCharacterId] ?? null) : null,
  );
  const [busy, setBusy] = useState(false);
  const state = data.cryo;
  if (!state) return null;
  const mayThaw = user?.role === ROLE_GM || (medic !== null && medic.ownerId === user?.id);
  const until =
    state.expiresAtMinute !== undefined
      ? ` · bez rzutów przeciw śmierci do ${formatGameTime(state.expiresAtMinute)}`
      : '';
  return (
    <p className="cp-alert cp-alert--muted cp-cryo-note" data-cryo-patient={characterId}>
      <strong>W kriośnie</strong>
      <span title="Nieprzytomny w worku kriopompy; bez rzutów przeciw śmierci, o ile worek ma choć 1 PW (s. 353).">
        od: {state.by}
        {until}
      </span>
      {mayThaw ? (
        <button
          type="button"
          disabled={busy}
          title="Wyjmij pacjenta z worka — znów rzuty przeciw śmierci i zdjęty status „Nieprzytomny”."
          onClick={() => {
            setBusy(true);
            void sendCryo({ action: 'thaw', characterId }).finally(() => setBusy(false));
          }}
        >
          Rozmroź
        </button>
      ) : null}
    </p>
  );
}
