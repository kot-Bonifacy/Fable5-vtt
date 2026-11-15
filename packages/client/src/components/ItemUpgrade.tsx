import {
  CPRED_ITEM_UPGRADE_PROBLEMS,
  cpredApplyItemUpgrade,
  cpredItemUpgrade,
  cpredItemUpgradeProblem,
  cpredUpgradesForTarget,
  type CpredItemRow,
  type CpredUpgradeSubject,
} from '@vtt/shared';
import { ROLE_GM } from '@vtt/shared';
import { notifyRefusal } from '../notices.js';
import { useAuthStore } from '../stores/authStore.js';

/**
 * Ulepszanie Technika na wierszu karty (etap 71d1, G14–G16; s. 148).
 *
 * Każdy widzi plakietkę ulepszenia, które rzecz już niesie — z tym, co VTT
 * z nim liczy, w dymku. Stempel wpisuje dziś MG (menu „Ulepszenie…”, jak
 * „+1 OB” przy pancerzu od 48c); Test Technika, który robi to samo po
 * udanym rzucie, dochodzi w 71d2 i stempluje tą samą `cpredApplyItemUpgrade`.
 * Listę sposobów daje `cpredUpgradesForTarget` — ta sama, której pyta serwer.
 */
export function ItemUpgrade<T extends CpredItemRow>({
  subject,
  onStamp,
}: {
  subject: CpredUpgradeSubject;
  /** Zapis wiersza ze stemplem — wołający podmienia go na liście karty. */
  onStamp: (row: T) => void;
}) {
  const isGm = useAuthStore((s) => s.user?.role === ROLE_GM);
  const current = subject.row.upgrade ? cpredItemUpgrade(subject.row.upgrade) : null;
  if (current) {
    return (
      <span
        className="item-upgrade-chip"
        title={`Ulepszanie Technika: ${current.text}${current.vtt ? ` VTT: ${current.vtt}.` : ''}`}
      >
        ⚙ {current.name}
      </span>
    );
  }
  if (!isGm) return null;
  const options = cpredUpgradesForTarget(subject);
  if (options.length === 0) return null;

  function stamp(upgradeId: string) {
    const problem = cpredItemUpgradeProblem(upgradeId, subject);
    if (problem) {
      notifyRefusal('character', CPRED_ITEM_UPGRADE_PROBLEMS[problem]);
      return;
    }
    onStamp(cpredApplyItemUpgrade(subject.row as T, upgradeId));
  }

  return (
    <select
      className="item-upgrade-select"
      value=""
      aria-label={`Ulepszenie Technika: ${subject.row.name}`}
      title="Ulepszanie Technika (s. 148) — przedmiot ulepsza się tylko raz."
      onChange={(event) => {
        if (event.target.value) stamp(event.target.value);
      }}
    >
      <option value="">Ulepszenie…</option>
      {options.map((id) => {
        const definition = cpredItemUpgrade(id)!;
        return (
          <option key={id} value={id} title={definition.text}>
            {definition.name}
          </option>
        );
      })}
    </select>
  );
}
