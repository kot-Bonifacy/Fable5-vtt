import { useRef, useState, type PointerEvent } from 'react';
import { useHandoutStore } from '../stores/handoutStore.js';
import { Markdown } from './Markdown.js';
import { Screamsheet } from './Screamsheet.js';

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

  const [position, setPosition] = useState(() => ({
    x: 140 + (stackIndex % 6) * 28,
    y: 90 + (stackIndex % 6) * 24,
  }));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  if (!handout) return null;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 120, drag.baseX + event.clientX - drag.startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, drag.baseY + event.clientY - drag.startY)),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <section
      className="handout-window"
      style={{ left: position.x, top: position.y, zIndex: 320 + stackIndex }}
      onPointerDown={() => focusHandout(handoutId)}
      aria-label={`Handout: ${handout.title}`}
    >
      <div
        className="handout-window-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="handout-window-title">{handout.title}</span>
        <button
          type="button"
          className="sheet-close"
          onClick={() => closeHandout(handoutId)}
          title="Zamknij handout"
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
    </section>
  );
}
