import type { HandoutImage, ScreamsheetMeta } from '@vtt/shared';
import { Markdown } from './Markdown.js';

/**
 * Szablon gazetowy screamsheetu (etap 24c).
 *
 * Czysta warstwa wyglądu: bierze te same pola, które ma handout, i układa je
 * jak pierwszą stronę brukowca — winieta, wielki nagłówek, wytłuszczony lead,
 * treść w szpaltach, stopka z miejscem i datą. Nic tu nie decyduje o tym, kto
 * to widzi; o tym rozstrzygnął serwer, zanim payload wyszedł.
 *
 * Bierze wprost pola, a nie `HandoutView`, żeby ten sam komponent rysował
 * **podgląd w formularzu** — MG ogląda gazetę, zanim cokolwiek zapisze.
 */
export function Screamsheet({
  title,
  body,
  image,
  meta,
}: {
  title: string;
  body: string;
  image: HandoutImage | null;
  meta: ScreamsheetMeta;
}) {
  return (
    <article className="screamsheet">
      <div className="screamsheet-masthead">{meta.outlet}</div>
      <h1 className="screamsheet-headline">{title || 'Bez nagłówka'}</h1>
      {meta.lead.length > 0 && <p className="screamsheet-lead">{meta.lead}</p>}
      {image ? (
        <img
          className="screamsheet-photo"
          src={image.url}
          width={image.width}
          height={image.height}
          alt={title}
        />
      ) : null}
      <div className="screamsheet-body">
        {/* Ta sama droga co w handoucie z 24a: markdown staje się drzewem
            bloków, więc znacznik wymyślony przez model zostaje tekstem. */}
        <Markdown source={body} />
      </div>
      <div className="screamsheet-footer">{meta.dateline}</div>
    </article>
  );
}
