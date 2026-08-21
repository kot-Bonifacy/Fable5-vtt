import { useHandoutStore } from '../stores/handoutStore.js';
import { Markdown } from './Markdown.js';
import { Screamsheet } from './Screamsheet.js';
import { useWindowPlacement } from '../window-placement.js';
import { WindowResizeGrip } from './WindowResizeGrip.js';

/**
 * Handout jako pływające okno (etap 24a).
 *
 * Dlaczego okno, a nie modal: MG udostępnia materiał **w trakcie sceny**, więc
 * kartka ma się położyć na stole obok mapy, a nie zasłonić grę. Ten sam wzorzec
 * co karty postaci z etapu 07 — z tą różnicą, że okno handoutu potrafi otworzyć
 * się samo, kiedy MG kliknie „Udostępnij".
 */
export function HandoutWindows() {
  const open = useHandoutStore((s) => s.open);
  return (
    <>
      {open.map((id, index) => (
        <HandoutWindow key={id} handoutId={id} stackIndex={index} />
      ))}
    </>
  );
}

function HandoutWindow({ handoutId, stackIndex }: { handoutId: string; stackIndex: number }) {
  const handout = useHandoutStore((s) => s.handouts[handoutId]);
  const closeHandout = useHandoutStore((s) => s.closeHandout);
  const focusHandout = useHandoutStore((s) => s.focusHandout);

  const placement = useWindowPlacement(`handout:${handoutId}`, () => ({
    x: 140 + (stackIndex % 6) * 28,
    y: 90 + (stackIndex % 6) * 24,
  }));

  if (!handout) return null;

  return (
    <section
      ref={placement.ref}
      className="handout-window"
      style={{ ...placement.style, zIndex: 320 + stackIndex }}
      onPointerDown={() => focusHandout(handoutId)}
      aria-label={`Handout: ${handout.title}`}
    >
      <div className="handout-window-header" {...placement.dragProps}>
        <span className="handout-window-title">{handout.title}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => closeHandout(handoutId)}
          title="Zamknij handout"
          aria-label="Zamknij handout"
        >
          ✕
        </button>
      </div>
      <div
        className={`handout-window-body ${
          handout.kind === 'screamsheet' ? 'handout-window-body--screamsheet' : ''
        }`}
      >
        {handout.kind === 'screamsheet' && handout.screamsheet ? (
          // Gazeta rysuje się własnym szablonem — okno, przeciąganie i zamykanie
          // zostają te same, bo screamsheet jest handoutem, a nie drugim bytem.
          <Screamsheet
            title={handout.title}
            body={handout.body}
            image={handout.image}
            meta={handout.screamsheet}
          />
        ) : (
          <>
            {handout.image ? (
              // Proporcje znane z uploadu — obrazek nie przeskakuje po wczytaniu.
              <img
                className="handout-image"
                src={handout.image.url}
                width={handout.image.width}
                height={handout.image.height}
                alt={handout.title}
              />
            ) : null}
            <Markdown source={handout.body} />
          </>
        )}
      </div>
      <WindowResizeGrip resizeProps={placement.resizeProps} />
    </section>
  );
}
