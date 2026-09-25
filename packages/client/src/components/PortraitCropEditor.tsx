import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PortraitAssetView, PortraitCrop } from '@vtt/shared';
import {
  DEFAULT_PORTRAIT_CROP,
  PORTRAIT_BANNER_ASPECT,
  PORTRAIT_BANNER_ZOOM_MAX,
  PORTRAIT_CROP_ZOOM_MAX,
  PORTRAIT_CROP_ZOOM_MIN,
  clampPortraitBannerCrop,
  clampPortraitCrop,
  portraitBannerCropOf,
  portraitBannerFor,
  portraitCropPlacement,
} from '@vtt/shared';
import { RING_WIDTH, portraitRadius } from '../map/token-ring.js';
import { setPortraitCrop } from '../socket.js';
import { usePortraitStore } from '../stores/portraitStore.js';
import { useSceneStore } from '../stores/sceneStore.js';

/**
 * Kadrowanie portretu pod mapę (zlecenie MG, 12.09).
 *
 * Do tej pory mapa kadrowała ślepo — na środek — a portret jest prawie zawsze
 * prostokątem w pionie z twarzą w górnej trzeciej, więc krążek żetonu dostawał
 * tors. Jedynym wyjściem było przyciąć plik w edytorze grafiki **przed**
 * wgraniem.
 *
 * Okno pokazuje to, co zobaczy stół: kwadrat kratki, w nim krążek portretu
 * o promieniu `portraitRadius` i obwódkę właściciela dokoła. To, co wypada poza
 * krążek, zostaje widoczne, ale przygaszone — MG ma widzieć, co odcina, a nie
 * zgadywać.
 *
 * **Kadr wolno wywieźć poza obraz** (poprawka z 12.09 po zgłoszeniu MG: górnych
 * pikseli portretu nie dawało się wciągnąć w krążek, bo zatrzymywała je granica
 * liczona do kratki, a widoczne koło jest od kratki mniejsze o obwódkę). Pod
 * portretem leży więc krążek tła żetonu — dokładnie ten, który rysuje
 * `TokenNode` — żeby okno pokazywało pustkę tak, jak pokaże ją mapa.
 *
 * Kadruje się mapę (decyzja MG z 12.09), a od 25.09 także baner portretu
 * w lewym panelu — to samo miejsce, szerzej (`portraitBannerPlacement`). Karta,
 * kreator i czat pokazują wgrany plik w całości. Sam plik zostaje nietknięty —
 * kadr to trzy liczby przy wierszu puli, nie nowy upload.
 */
export function PortraitCropEditor() {
  const asset = usePortraitStore((s) => s.assets.find((a) => a.id === s.cropping) ?? null);
  if (!asset) return null;
  // Klucz po portrecie: otwarcie okna dla drugiego obrazka ma dać jego kadr,
  // a nie liczby zapamiętane z poprzedniego.
  return <PortraitCropEditorBody key={asset.id} asset={asset} />;
}

/** Bok kwadratu kratki w oknie, w pikselach CSS. */
const STAGE_CELL = 208;
/** Ile miejsca zostaje wokół kratki na resztę obrazu. */
const STAGE_PAD = 44;
const STAGE_BOX = STAGE_CELL + STAGE_PAD * 2;
/**
 * Baner w oknie w swojej prawdziwej wielkości — tyle mniej więcej ma w lewym
 * panelu (17 rem szyny minus marginesy), więc twarz ocenia się tak, jak przy
 * stole.
 */
const BANNER_W = 240;
const BANNER_H = BANNER_W * PORTRAIT_BANNER_ASPECT;
const BANNER_BOX_W = BANNER_W + STAGE_PAD * 2;
const BANNER_BOX_H = BANNER_H + STAGE_PAD * 2;
/** Ile przesuwa jedno naciśnięcie strzałki, w pikselach okna. */
const NUDGE_PX = 4;
/** Jedno kliknięcie kółka (deltaY ≈ 100) daje z tego ok. 1,22×. */
const WHEEL_ZOOM_DIVISOR = 500;

/** Sufit na jedno zdarzenie — gładzik potrafi wysłać jeden skok o 400 jednostek. */
function clampFactor(factor: number): number {
  return Math.min(1.5, Math.max(1 / 1.5, factor));
}

type CropTab = 'token' | 'banner';

function PortraitCropEditorBody({ asset }: { asset: PortraitAssetView }) {
  const close = usePortraitStore((s) => s.closeCrop);
  const applyUpsert = usePortraitStore((s) => s.applyUpsert);
  // Kratka aktywnej sceny: od niej zależy, jaką częścią kratki jest krążek
  // portretu (obwódka ma stałe 3 px świata, więc na małej kratce zjada więcej).
  const gridPx = useSceneStore((s) => s.effectiveScene?.grid.sizePx ?? 100);

  // Dwa wystąpienia portretu, dwie zakładki (zlecenie MG z 25.09): krążek
  // żetonu i baner lewego panelu. Kadr banera `null` znaczy „jak żeton” —
  // baner wylicza się wtedy z kadru żetonu, także tego właśnie zmienianego.
  const [tab, setTab] = useState<CropTab>('token');
  const [crop, setCrop] = useState<PortraitCrop>(asset.crop);
  const [bannerCrop, setBannerCrop] = useState<PortraitCrop | null>(asset.bannerCrop);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; crop: PortraitCrop } | null>(
    null,
  );

  const size = useMemo(() => ({ width: asset.width, height: asset.height }), [asset]);

  const change = useCallback(
    (next: PortraitCrop) => setCrop(clampPortraitCrop(next, size)),
    [size],
  );
  const changeBanner = useCallback(
    (next: PortraitCrop) => setBannerCrop(clampPortraitBannerCrop(next, size)),
    [size],
  );

  // Escape zamyka jak każde inne okno aplikacji.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const place = portraitCropPlacement(crop, size, STAGE_CELL);
  const shownW = size.width * place.scale;
  const shownH = size.height * place.scale;
  // Lewy górny róg obrazu względem ramki: punkt kadru siada na środku kratki.
  const left = STAGE_BOX / 2 - place.anchorX * shownW;
  const top = STAGE_BOX / 2 - place.anchorY * shownH;

  // Baner: to, co pokaże lewy panel, i ten sam układ wyrażony jako własny kadr
  // — przeciąganie rusza od tego, co widać, także gdy baner jest „jak żeton”.
  const bannerPlace = portraitBannerFor({ ...size, crop, bannerCrop });
  const bannerView = bannerCrop ?? portraitBannerCropOf(bannerPlace, size);
  const bannerShownW = bannerPlace.width * BANNER_W;
  const bannerShownH = bannerPlace.height * BANNER_H;

  // Promienie liczy ta sama funkcja, co dla figury na mapie, i dla kratki tej
  // sceny — inaczej okno obiecywałoby kadr, którego mapa nie narysuje.
  //
  // Od 12.09 obwódka właściciela leży **poza** portretem, więc krążek portretu
  // to równo kratka, a obramowanie rysuje się dookoła niej: pierścień jest
  // o dwie swoje grubości szerszy od kratki i niczego już nie przykrywa.
  const cellRatio = STAGE_CELL / gridPx;
  const circle = portraitRadius(gridPx) * cellRatio;
  const ringWidth = RING_WIDTH * cellRatio;
  const ringBox = STAGE_CELL + ringWidth * 2;

  // Jedna para rąk dla obu zakładek: co ciągniemy, jak to zacisnąć i ile
  // pikseli okna ma cały obraz.
  const active =
    tab === 'token'
      ? { crop, set: change, width: shownW, height: shownH }
      : { crop: bannerView, set: changeBanner, width: bannerShownW, height: bannerShownH };

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop: active.crop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Ciągnięcie obrazu w prawo przesuwa punkt kadru w lewo — stąd minus.
    active.set({
      x: drag.crop.x - (event.clientX - drag.x) / active.width,
      y: drag.crop.y - (event.clientY - drag.y) / active.height,
      zoom: drag.crop.zoom,
    });
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    // Mnożnik, nie dodawanie: krok ma być ten sam przy 1,1 i przy 3,5.
    //
    // Wykładniczo **z siły obrotu**, a nie stałym skokiem: kółko myszy zgłasza
    // ok. ±100, gładzik — kilka jednostek na klatkę. Stały skok na zdarzenie
    // dałby na gładziku przeskok z 1 na sufit w pół gestu.
    const factor = Math.exp(-event.deltaY / WHEEL_ZOOM_DIVISOR);
    active.set({ ...active.crop, zoom: active.crop.zoom * clampFactor(factor) });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? NUDGE_PX * 4 : NUDGE_PX;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    active.set({
      x: active.crop.x + move[0] / active.width,
      y: active.crop.y + move[1] / active.height,
      zoom: active.crop.zoom,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const ack = await setPortraitCrop(asset.id, crop, bannerCrop);
    setSaving(false);
    if (!ack.ok) {
      setError(
        ack.error === 'OFFLINE'
          ? 'Brak połączenia z serwerem — kadr nie został zapisany.'
          : 'Nie udało się zapisać kadru.',
      );
      return;
    }
    if (!ack.data) {
      setError('Nie udało się zapisać kadru.');
      return;
    }
    // Rozgłoszenie i tak dojdzie, ale własne okno nie ma na nie czekać.
    applyUpsert(ack.data);
    close();
  }

  const stageEvents = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onWheel,
    onKeyDown,
  };

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog portrait-crop" onClick={(event) => event.stopPropagation()}>
        <h3 className="panel-section-title">Kadr portretu — {asset.name}</h3>
        <div className="portrait-crop-tabs" role="tablist" aria-label="Gdzie widać portret">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'token'}
            className="small-button"
            onClick={() => setTab('token')}
          >
            Żeton
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'banner'}
            className="small-button"
            title="Portret u góry lewego panelu, pod nim imię i PW"
            onClick={() => setTab('banner')}
          >
            Baner
          </button>
        </div>
        <p className="portrait-crop-hint">
          {tab === 'token'
            ? 'Ciągnij portret, kółkiem myszy albo suwakiem przybliż. Kadr wolno wywieźć poza obraz — puste miejsce wypełnia wtedy tło żetonu.'
            : bannerCrop
              ? 'Baner ma własny kadr. Ciągnij i przybliżaj; dół przykryje podpis z imieniem i PW. „Jak żeton” wraca do kadru liczonego z żetonu.'
              : 'Baner liczy się teraz z kadru żetonu. Pociągnij albo przybliż, żeby ustawić mu własny kadr.'}{' '}
          Karta, kreator i czat pokazują portret w całości.
        </p>

        {tab === 'token' ? (
          <div className="portrait-crop-stage-row">
            <div
              className="portrait-crop-stage"
              style={{ width: STAGE_BOX, height: STAGE_BOX }}
              role="group"
              aria-label="Kadr portretu na mapie — ciągnij myszą, strzałki przesuwają"
              tabIndex={0}
              {...stageEvents}
            >
              {/* Tło krążka — widać je tam, gdzie kadr wyjechał poza obraz (12.09). */}
              <span
                className="portrait-crop-backdrop"
                style={{ width: circle * 2, height: circle * 2 }}
                aria-hidden
              />
              <img
                className="portrait-crop-image"
                src={asset.url}
                alt=""
                draggable={false}
                style={{ left, top, width: shownW, height: shownH }}
              />
              {/* Cień na wszystkim poza krążkiem: MG ma widzieć, co odcina. */}
              <span
                className="portrait-crop-mask"
                style={{ width: circle * 2, height: circle * 2 }}
                aria-hidden
              />
              {/* Obwódka właściciela — od 12.09 biegnie dookoła portretu, nie po nim. */}
              <span
                className="portrait-crop-ring"
                style={{ width: ringBox, height: ringBox, borderWidth: ringWidth }}
                aria-hidden
              />
              <span
                className="portrait-crop-cell"
                style={{ width: STAGE_CELL, height: STAGE_CELL }}
                aria-hidden
              />
            </div>

            <div className="portrait-crop-side">
              <p className="portrait-crop-side-label">Tak na mapie</p>
              {/* Prawdziwa wielkość: kratka tej sceny, co do piksela. Krążek bywa
                  mały i to jest właśnie ta informacja — twarz ma być czytelna
                  przy stole, nie w oknie edycji. */}
              <TruePreview asset={asset} crop={crop} gridPx={gridPx} />
              <p className="portrait-crop-side-note">kratka {Math.round(gridPx)} px</p>
            </div>
          </div>
        ) : (
          <div className="portrait-crop-stage-row">
            <div
              className="portrait-crop-stage"
              style={{ width: BANNER_BOX_W, height: BANNER_BOX_H }}
              role="group"
              aria-label="Kadr portretu w banerze lewego panelu — ciągnij myszą, strzałki przesuwają"
              tabIndex={0}
              {...stageEvents}
            >
              <img
                className="portrait-crop-image"
                src={asset.url}
                alt=""
                draggable={false}
                style={{
                  left: STAGE_PAD + bannerPlace.left * BANNER_W,
                  top: STAGE_PAD + bannerPlace.top * BANNER_H,
                  width: bannerShownW,
                  height: bannerShownH,
                }}
              />
              {/* Ta sama ramka i to samo przejście, co w panelu: podpis przykrywa
                  dół banera, więc widać od razu, czy twarz nad nim zostaje. */}
              <span
                className="portrait-crop-banner"
                style={{ width: BANNER_W, height: BANNER_H }}
                aria-hidden
              >
                <span className="portrait-crop-banner-caption">imię · PW</span>
              </span>
            </div>
          </div>
        )}

        <label className="portrait-crop-zoom">
          Przybliżenie
          <input
            type="range"
            min={tab === 'token' ? PORTRAIT_CROP_ZOOM_MIN : 1}
            max={tab === 'token' ? PORTRAIT_CROP_ZOOM_MAX : PORTRAIT_BANNER_ZOOM_MAX}
            step={0.01}
            value={active.crop.zoom}
            onChange={(event) => active.set({ ...active.crop, zoom: Number(event.target.value) })}
          />
          <span className="portrait-crop-zoom-value">{active.crop.zoom.toFixed(2)}×</span>
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <div className="portrait-crop-buttons">
          {tab === 'token' ? (
            <button
              type="button"
              className="small-button"
              disabled={saving}
              onClick={() => change(DEFAULT_PORTRAIT_CROP)}
            >
              Wyśrodkuj
            </button>
          ) : (
            <button
              type="button"
              className="small-button"
              disabled={saving || bannerCrop === null}
              title="Baner znowu liczy się z kadru żetonu"
              onClick={() => setBannerCrop(null)}
            >
              Jak żeton
            </button>
          )}
          <span className="portrait-crop-spacer" />
          <button type="button" className="small-button" disabled={saving} onClick={close}>
            Anuluj
          </button>
          <button
            type="button"
            className="small-button portrait-crop-save"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Zapisywanie…' : 'Zapisz kadr'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Krążek w prawdziwej wielkości kratki — ten sam rachunek, co na mapie. */
function TruePreview({
  asset,
  crop,
  gridPx,
}: {
  asset: PortraitAssetView;
  crop: PortraitCrop;
  gridPx: number;
}) {
  const place = portraitCropPlacement(crop, asset, gridPx);
  const shownW = asset.width * place.scale;
  const shownH = asset.height * place.scale;
  const radius = portraitRadius(gridPx);
  // Kratka plus obwódka po obu stronach: przy `border-box` wnętrze wychodzi
  // wtedy równo `portraitRadius · 2`, czyli tyle, ile sama kratka — bo od 12.09
  // obwódka leży poza portretem, a nie na nim.
  return (
    <span
      className="portrait-crop-true"
      style={{
        width: gridPx + RING_WIDTH * 2,
        height: gridPx + RING_WIDTH * 2,
        borderWidth: RING_WIDTH,
      }}
    >
      <img
        src={asset.url}
        alt=""
        draggable={false}
        style={{
          left: radius - place.anchorX * shownW,
          top: radius - place.anchorY * shownH,
          width: shownW,
          height: shownH,
        }}
      />
    </span>
  );
}

/**
 * „Kadr portretu" przy portrecie karty albo kreatora (12.09; od 25.09 okno
 * ma też zakładkę banera lewego panelu).
 *
 * Osobny, maleńki komponent, bo wołają go trzy miejsca i każde ma inny układ
 * wokół portretu — a odszukanie wiersza puli po adresie pliku jest wszędzie
 * takie samo.
 *
 * **To jedyne, co gracz może zrobić z portretem w trakcie rozgrywki**
 * (decyzja MG z 12.09): sam portret wybiera się raz, przy tworzeniu postaci.
 * Przycisk pojawia się więc i graczowi, i MG — na uprawnienia patrzy serwer.
 */
export function PortraitCropButton({
  portraitUrl,
  disabled = false,
  className = 'small-button',
}: {
  portraitUrl: string | null | undefined;
  disabled?: boolean;
  className?: string;
}) {
  const asset = usePortraitStore((s) =>
    portraitUrl ? (s.assets.find((a) => a.url === portraitUrl) ?? null) : null,
  );
  const load = usePortraitStore((s) => s.load);
  const openCrop = usePortraitStore((s) => s.openCrop);
  /** Adresy, dla których pula była już odpytana ponownie — po jednym podejściu. */
  const retried = useRef(new Set<string>());

  useEffect(() => {
    void load();
  }, [load]);

  // Portret, którego pula nie zna, a powinna: wgrany przez MG **po** tym, jak
  // ta przeglądarka pobrała listę. Jedno ponowne pytanie na adres — bez tego
  // przycisk byłby wyszarzony do przeładowania strony, a tu naprawdę nic nie
  // brakuje poza świeżą listą.
  useEffect(() => {
    if (!portraitUrl || asset || retried.current.has(portraitUrl)) return;
    retried.current.add(portraitUrl);
    void load(true);
  }, [portraitUrl, asset, load]);

  if (!portraitUrl) return null;
  // Portret spoza puli — wgrany przed 12.09 trasą, która nie zakładała wiersza
  // w bazie. Kadr nie ma gdzie zamieszkać, więc przycisk mówi to wprost zamiast
  // znikać bez wyjaśnienia.
  if (!asset) {
    return (
      <button
        type="button"
        className={className}
        disabled
        title={
          'Ten portret nie jest w puli kampanii, więc nie ma gdzie zapisać kadru. ' +
          'Wgraj go ponownie przyciskiem „+ Dodaj" w puli.'
        }
      >
        Kadr portretu
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title="Jak ten portret jest ujęty w krążku żetonu i w banerze lewego panelu"
      onClick={() => openCrop(asset.id)}
    >
      Kadr portretu
    </button>
  );
}
