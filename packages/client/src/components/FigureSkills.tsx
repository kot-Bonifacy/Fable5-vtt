import { loadFigureSkillCup } from '../stores/rollStore.js';

/**
 * Testy Umiejętności figury bez karty — sekcja paska bocznego (31.08).
 *
 * Statysta rzucał dotąd wyłącznie bronią i Unikiem, bo jego profil ma jeden
 * poziom Umiejętności i ten poziom należy do broni. To wystarczało, dopóki
 * jedyną figurą bez karty był ganger na jedną wymianę ognia — ale Wsparcie
 * 10. poziomu przychodzi z piętnastoma Testami wypisanymi w podręczniku:
 * „mogą oni wykorzystać swoją Wartość bojową w Testach poniższych
 * Umiejętności: Aktorstwo, Atrakcyjność, Dedukcja…" (s. 159). Agent federalny,
 * który nie umie zrobić Testu Dedukcji, jest agentem federalnym tylko z nazwy.
 *
 * Lista jest **wpisana w profil figury**, nie wyprowadzona z jej nazwy ani
 * z kategorii Wsparcia: po przybyciu na mapę po kategorii nie zostaje ślad,
 * a nazwę żetonu MG zmienia jednym kliknięciem. Dzięki temu ta sama sekcja
 * obsługuje ochroniarza, któremu MG dopisał Percepcję, i hakera z Kryptografią.
 *
 * Klik ładuje kubek — rzuca się nim tak samo jak każdym innym rzutem w tej
 * aplikacji. Serwer i tak przelicza wszystko od nowa z profilu, więc liczba na
 * guziku jest podglądem, a nie obietnicą.
 */
export function FigureSkills({
  tokenId,
  name,
  skills,
  disabled,
}: {
  tokenId: string;
  name: string;
  skills: readonly { id: string; name: string; level: number }[];
  disabled: string | null;
}) {
  return (
    <section className="hud-group hud-figure-skills">
      <h3 className="hud-group-title">Testy</h3>
      <div className="hud-skill-row">
        {skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            className="cp-mini-button"
            disabled={disabled !== null}
            title={disabled ?? `Test: ${skill.name} — rzut 1k10 + ${skill.level}`}
            onClick={() => loadFigureSkillCup({ tokenId, name }, skill)}
          >
            {skill.name} {skill.level}
          </button>
        ))}
      </div>
    </section>
  );
}
