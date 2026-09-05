import type {
  CostCategory,
  CpredSpecialtyDefinition,
  CpredSpecialtyRules,
  CpredSpecialtyAllocation,
} from '@vtt/shared';
import {
  cpredMedicineEffects,
  cpredRoleAbilityRank,
  cpredSpecialtyCap,
  cpredSpecialtyPool,
  cpredSpecialtyProblem,
  cpredSpecialtySpent,
  readCpredFabrication,
  readCpredMedicine,
  COST_CATEGORY_LABELS,
  CPRED_CRYO_LEVELS,
  CPRED_FABRICATION,
  CPRED_FABRICATION_TASK,
  CPRED_ITEM_UPGRADES,
  CPRED_FABRICATION_ABILITY,
  CPRED_FABRICATION_RULES,
  CPRED_MEDICINE,
  CPRED_MEDICINE_ABILITY,
  CPRED_MEDICINE_RULES,
  CPRED_PHARMACEUTICALS,
  CPRED_PHARMA_BATCH_COST,
  CPRED_PHARMA_CRAFT_DV,
  cpredPharmaAccess,
} from '@vtt/shared';
import { craftPharmaceutical, queueCharacterSave } from '../socket.js';
import { plural } from '../plural.js';
import { useCharacterStore } from '../stores/characterStore.js';

/** Which of the two abilities of etap 30b this panel is showing. */
export type SpecialtyAbility = 'medicine' | 'fabrication';

interface AbilityShape {
  ability: string;
  definitions: readonly CpredSpecialtyDefinition[];
  rules: CpredSpecialtyRules;
  read: (raw: unknown) => CpredSpecialtyAllocation;
  /** Zdanie o tym, co daje kolejny poziom — nad listą, bo dwie zasady różnią się. */
  hint: string;
}

const SHAPES: Record<SpecialtyAbility, AbilityShape> = {
  medicine: {
    ability: CPRED_MEDICINE_ABILITY,
    definitions: CPRED_MEDICINE,
    rules: CPRED_MEDICINE_RULES,
    read: readCpredMedicine,
    hint: 'Każdy poziom Medycyny to jeden punkt w jednej z trzech Specjalizacji (s. 149).',
  },
  fabrication: {
    ability: CPRED_FABRICATION_ABILITY,
    definitions: CPRED_FABRICATION,
    rules: CPRED_FABRICATION_RULES,
    read: readCpredFabrication,
    hint: 'Każdy poziom Twórcy to po punkcie w dwóch różnych Specjalizacjach (s. 147).',
  },
};

/**
 * Rozdzielanie punktów Specjalizacji — Medycyny Medyka i Twórcy Technika
 * (etap 30b, s. 147–151).
 *
 * Jeden komponent na obie Zdolności, bo to jedna maszyneria: sakiewka rośnie
 * z poziomem, a żadna Specjalizacja nie może mieć więcej punktów niż poziom.
 * Różnią się dwiema liczbami (`perRank`, sufit Specjalizacji) i tekstami, więc
 * dwa komponenty znaczyłyby dwie odpowiedzi na pytanie „ile punktów mi zostało".
 *
 * W przeciwieństwie do panelu Zmysłu Walki z 30a **nie ma tu szkicu i guzika
 * „Zapisz"**: tam zapis kosztuje Akcję i musi być decyzją, tutaj przydział
 * zapada przy awansie i jest zwykłą edycją karty — jak każde inne pole.
 */
export function SpecialtyPanel({
  characterId,
  ability,
}: {
  characterId: string;
  ability: SpecialtyAbility;
}) {
  const character = useCharacterStore((s) => s.characters[characterId] ?? null);
  const registry = useCharacterStore((s) => s.registry);
  const shape = SHAPES[ability];
  const rank = character ? cpredRoleAbilityRank(character.data, registry, shape.ability) : null;
  if (!character || rank === null) return null;

  const allocation = shape.read(character.data[ability]);
  const pool = cpredSpecialtyPool(shape.rules, rank);
  const left = pool - cpredSpecialtySpent(allocation);

  function withPoints(id: string, points: number): CpredSpecialtyAllocation {
    const next: CpredSpecialtyAllocation = { ...allocation };
    if (points > 0) next[id] = points;
    else delete next[id];
    return next;
  }

  /** Czemu ten krok jest niemożliwy, albo null — ta sama funkcja, co na serwerze. */
  function refusal(id: string, direction: 1 | -1): string | null {
    const points = (allocation[id] ?? 0) + direction;
    if (points < 0) return 'Nie ma czego zdejmować.';
    const problem = cpredSpecialtyProblem(
      withPoints(id, points),
      shape.definitions,
      shape.rules,
      rank,
    );
    if (problem === 'NOT_ENOUGH_POINTS') return 'Nie masz wolnych punktów tej Zdolności.';
    if (problem === 'SPECIALTY_CAP') {
      const definition = shape.definitions.find((entry) => entry.id === id)!;
      return `Ta Specjalizacja nie przyjmie więcej niż ${cpredSpecialtyCap(definition, rank!)} pkt.`;
    }
    return problem === null ? null : 'Ten przydział jest poza zasięgiem.';
  }

  function bump(id: string, direction: 1 | -1): void {
    if (refusal(id, direction) !== null) return;
    queueCharacterSave(characterId, {
      data: { [ability]: withPoints(id, (allocation[id] ?? 0) + direction) },
    });
  }

  return (
    <div className="awareness">
      <header className="awareness-head">
        <h4>
          {shape.ability} {rank}
        </h4>
        <p className={left === 0 ? 'awareness-left awareness-left--empty' : 'awareness-left'}>
          {left === 0 ? 'Wszystkie punkty rozdzielone' : `Do rozdzielenia: ${left} z ${pool}`}
        </p>
      </header>
      <ul className="awareness-list">
        {shape.definitions.map((entry) => {
          const points = allocation[entry.id] ?? 0;
          const up = refusal(entry.id, 1);
          const down = refusal(entry.id, -1);
          return (
            <li key={entry.id} className="awareness-row">
              <span className="awareness-name" title={`${entry.description} (s. ${entry.page})`}>
                {entry.name}
              </span>
              <span className="awareness-value">{points === 0 ? '—' : `poziom ${points}`}</span>
              <span className="awareness-cost">{points > 0 ? `${points} pkt` : ''}</span>
              <span className="awareness-steps">
                <button
                  type="button"
                  onClick={() => bump(entry.id, -1)}
                  disabled={down !== null}
                  title={down ?? `Zdejmij punkt: ${entry.name}`}
                  aria-label={`Zdejmij punkt: ${entry.name}`}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => bump(entry.id, 1)}
                  disabled={up !== null}
                  title={up ?? `Dołóż punkt: ${entry.name}`}
                  aria-label={`Dołóż punkt: ${entry.name}`}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {ability === 'medicine' && (
        <MedicineExtras allocation={allocation} rank={rank} characterId={characterId} />
      )}
      {ability === 'fabrication' && <FabricationExtras />}
      <p className="awareness-hint">{shape.hint}</p>
    </div>
  );
}

/**
 * To, co Medycyna daje poza liczbami: dwie Umiejętności tylko dla Medyków oraz
 * dwie listy z podręcznika, których VTT nie automatyzuje (patrz
 * `decyzje-i-uproszczenia.md`) — farmaceutyki i drabina kriosystemów.
 * Drukujemy je tutaj, bo inaczej gracz nie ma gdzie ich przeczytać przy stole.
 */
function MedicineExtras({
  allocation,
  rank,
  characterId,
}: {
  allocation: CpredSpecialtyAllocation;
  rank: number;
  characterId: string;
}) {
  const pharma = allocation.pharma ?? 0;
  const cryo = allocation.cryo ?? 0;
  const effects = cpredMedicineEffects(allocation, rank);
  return (
    <div className="awareness-extras">
      {/* Dwie Umiejętności, których nie ma w tabeli Umiejętności karty i mieć
          nie może: kupuje się je punktami Medycyny, nie punktami Umiejętności
          (s. 149). Bez tego wiersza gracz nie ma gdzie odczytać „Chirurgia 6". */}
      <p className="awareness-derived">
        Umiejętności z Medycyny: <b>Chirurgia {effects.surgerySkill}</b> ·{' '}
        <b>Technologia Medyczna {effects.medtechSkill}</b>
      </p>
      {pharma > 0 && (
        <details>
          <summary>Farmaceutyki — dostęp do {pharma} z 5 środków</summary>
          <ul className="pharma-list">
            {CPRED_PHARMACEUTICALS.map((drug) => {
              // „Zawsze, gdy przydzielasz punkt do Farmaceutyków, zyskujesz
              // dostęp do jednego z poniższych środków" (s. 150) — kolejność
              // tabeli jest kolejnością odblokowania, więc reszta zostaje
              // wypisana szarym: gracz ma widzieć, co go czeka.
              const unlocked = cpredPharmaAccess(pharma).some((row) => row.id === drug.id);
              return (
                <li key={drug.id} className={unlocked ? undefined : 'pharma-locked'}>
                  <b>{drug.name}</b> — {drug.effect}
                  {drug.limit ? <i> {drug.limit}</i> : null}
                  {unlocked && effects.medtechSkill > 0 ? (
                    <button
                      type="button"
                      title={`Test Technologii Medycznej PT ${CPRED_PHARMA_CRAFT_DV}. Surowce za ${CPRED_PHARMA_BATCH_COST} ed przepadają także po porażce. Udany Test daje ${plural(effects.medtechSkill, 'dawkę', 'dawki', 'dawek')}.`}
                      onClick={() => void craftPharmaceutical(characterId, drug.id)}
                    >
                      Wytwórz ({plural(effects.medtechSkill, 'dawkę', 'dawki', 'dawek')})
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p>
            Partia to godzina pracy i surowce za {CPRED_PHARMA_BATCH_COST} ed — przepadają także
            wtedy, gdy Test się nie uda (s. 150). Dawki lądują w Wyposażeniu, z licznikiem.
          </p>
        </details>
      )}
      {cryo > 0 && (
        <details>
          <summary>Obsługa kriosystemów — poziom {cryo}</summary>
          <ul>
            {CPRED_CRYO_LEVELS.slice(0, cryo).map((line, index) => (
              <li key={line}>
                <b>{index + 1}.</b> {line}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * To, czego Twórca nie liczy sam: dziesięć skutków Ulepszania z s. 148 i
 * tabela PT/czasu z tej samej strony.
 *
 * Wypisujemy **wszystkie dziesięć**, choć VTT umie policzyć jeden (+1 OB, guzik
 * ⊕ przy pancerzu). Technik wybiera z dziesięciu, więc menu z jednym po cichu
 * przepisałoby Rolę — a każdy z pozostałych dziewięciu stoi na maszynerii,
 * której projekt nie ma (gniazda dodatków to etap 31, jakości broni nic nie
 * czyta, pojazdów nie ma). Zapisane w `decyzje-i-uproszczenia.md`.
 */
function FabricationExtras() {
  return (
    <div className="awareness-extras">
      <details>
        <summary>Ulepszanie — dziesięć sposobów (s. 148)</summary>
        <ul>
          {CPRED_ITEM_UPGRADES.map((upgrade) => (
            <li key={upgrade.id}>
              <b>{upgrade.name}</b> — {upgrade.text}
              {upgrade.effect ? ' (VTT liczy to samo: guzik ⊕ przy pancerzu)' : ''}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>PT i czas: Ulepszanie / Wytwarzanie / Wynajdywanie</summary>
        <ul>
          {(Object.keys(CPRED_FABRICATION_TASK) as CostCategory[]).map((band) => (
            <li key={band}>
              {COST_CATEGORY_LABELS[band]}: PT {CPRED_FABRICATION_TASK[band].dv} ·{' '}
              {CPRED_FABRICATION_TASK[band].time}
            </li>
          ))}
        </ul>
        <p>
          Test: TECH + Umiejętność Techniczna, którą zwykle naprawia się taki przedmiot + poziom
          Specjalizacji + 1k10.
        </p>
      </details>
    </div>
  );
}
