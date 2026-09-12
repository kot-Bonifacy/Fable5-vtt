import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  DEFAULT_PORTRAIT_CROP,
  fallbackConditionStatusId,
  portraitCropPlacement,
  tokenCondition,
  tokenHpRung,
  type PortraitCrop,
  type TokenCondition,
  type TokenHpRung,
  type TokenView,
} from '@vtt/shared';
import {
  RING_WIDTH,
  furnitureRadius,
  hpRingCasing,
  hpRingRadius,
  hpRingWidth,
  ownerRingRadius,
  portraitRadius,
} from './token-ring.js';

/** Everything a node needs to draw itself for the local viewer. */
export interface TokenNodeCtx {
  gridSizePx: number;
  myUserId: string | null;
  isGm: boolean;
  /** status id → icon URL, from the data-driven registry. */
  statusIcons: ReadonlyMap<string, string>;
  /** status id → what it does to the figure (stage 27j), from the same registry. */
  conditions: ReadonlyMap<string, TokenCondition>;
  /** Token acting right now in the initiative tracker (stage 14). */
  activeTokenId: string | null;
  /**
   * Kadr portretu na mapie (12.09), po adresie pliku.
   *
   * Kadr jest cechą **obrazka**, nie figury, więc pyta się o niego adresem:
   * ten sam portret na dwóch żetonach jest ujęty tak samo. Brak wpisu znaczy
   * „na środek", czyli dokładnie to, co mapa rysowała przed tą zmianą — mapa
   * nie ma osobnego trybu „bez kadru".
   */
  portraitCrops: ReadonlyMap<string, PortraitCrop>;
}

const RING_OWN = 0x4ade80;
const RING_OTHER_PLAYER = 0x38bdf8;
const RING_NPC = 0xf87171;

/** Halo around whoever is taking their turn — amber, like the tracker. */
const TURN_RING_COLOR = 0xfacc15;
const TURN_RING_WIDTH = 5;

// The third ring — „this is the figure my clicks steer" (stage 16e) — is drawn
// by `MapRenderer` on the overlay layer, not here. Everything in this file is
// sized in *world* pixels, and a table is usually looking at a 4096 px map at
// about a fifth of scale: a ring three world pixels wide lands on half a screen
// pixel. The owner ring survives that because it is a solid circle of colour;
// a second thin ring inside it simply disappears. The overlay is the one layer
// that already scales its strokes by the zoom.

/**
 * Kolory obrączki PW — **te same, co pasek PW w panelu postaci** (zlecenie MG,
 * 12.09).
 *
 * Gracz ma na ekranie dwa paski tej samej postaci naraz: obrączkę wokół swojej
 * figury i pasek w lewym górnym rogu, w panelu. Do 12.09 mówiły dwoma
 * językami — mapa miała trzy stopnie liczone z ułamka, panel cztery, wzięte
 * ze stanu ran — więc ta sama postać bywała na mapie zielona, a w panelu
 * żółta. Teraz obie strony pytają `tokenHpRung` i biorą kolor z tej tabeli.
 *
 * Wartości są przepisane z **nocnej** palety `theme.css` (`--ok`,
 * `--hurt-light`, `--warn`, `--err`), a nie czytane z niej w locie, i to jest
 * świadome: płótno mapy zostaje nocne w obu motywach (decyzja etapu 27e — Pixi
 * maluje na nim białe podpisy), więc w dzień pasek w panelu przyciemnia się
 * razem z resztą interfejsu, a obrączka ma zostać jasna. Zgodności obu tabel
 * pilnuje `token-ring.test.ts`; zmiana koloru w `theme.css` wymaga zmiany tutaj.
 */
const HP_RUNG_COLORS: Readonly<Record<TokenHpRung, number>> = {
  healthy: 0x34c759,
  light: 0xd4d94a,
  serious: 0xd9a441,
  mortal: 0xff3b30,
};
/** The unfilled part of the arc — dark enough to read as „missing". */
const HP_TRACK = 0x0b1220;
/** Koszulka pod obrączką: obrys, dzięki któremu pasek czyta się na każdym tle. */
const HP_CASING = 0x05070d;

/**
 * Kadr portretu tej figury (12.09) — po adresie pliku, nie po figurze.
 *
 * Zwraca kadr domyślny, gdy portretu nie ma albo nikt go nie kadrował; żeton
 * z obrazkiem spoza puli (biblioteka żetonów, grafika z `public/`) też trafia
 * tutaj i dostaje dawne „na środek".
 */
function cropFor(url: string | null, ctx: TokenNodeCtx): PortraitCrop {
  if (!url) return DEFAULT_PORTRAIT_CROP;
  return ctx.portraitCrops.get(url) ?? DEFAULT_PORTRAIT_CROP;
}

/** Czy ta figura w ogóle nosi obrączkę PW — patrz `drawHpArc`. */
function hasHpRing(token: TokenView): boolean {
  const hp = token.hp;
  return hp !== undefined && hp !== null && hp.max > 0;
}

/**
 * The ground under the figure (stage 27j).
 *
 * A miniature has a base and casts a shadow, and both do the same job on a map:
 * they say „this thing is standing on the floor" rather than „this thing is
 * painted on the floor". The colour is the second job — the base is where the
 * figure's condition is written, because it is the one part of a token that is
 * never covered by the portrait, the arc or a sticker.
 */
const BASE_COLORS: Readonly<Record<TokenCondition, number>> = {
  ok: 0x0f172a,
  wounded: 0xb45309,
  down: 0x991b1b,
  dead: 0x000000,
};

/**
 * How the portrait itself is dressed by the condition.
 *
 * Death is the one state written on the portrait — greyed, half gone and
 * crossed out — because it is final and has to read from across the table.
 * Everything short of death says what it is with a sticker (decision of
 * 22.08): a figure that is merely unconscious can be picked up, healed and
 * played again, and a dimmed portrait made it look destroyed. `down` therefore
 * keeps its dark red base and gets its icon, and the face stays a face.
 */
/**
 * Tło krążka pod portretem — to, co widać tam, gdzie kadr wyjechał poza obraz.
 *
 * Ten sam grafit, co spokojna podstawa figury (`BASE_COLORS.ok`): pusty pas ma
 * czytać się jak część żetonu, a nie jak brakujący fragment mapy.
 */
const PORTRAIT_BACKDROP = 0x0f172a;

const CONDITION_TINT: Readonly<Record<TokenCondition, number>> = {
  ok: 0xffffff,
  wounded: 0xffffff,
  down: 0xffffff,
  dead: 0x5b6270,
};
const CONDITION_ALPHA: Readonly<Record<TokenCondition, number>> = {
  ok: 1,
  wounded: 1,
  down: 1,
  dead: 0.75,
};

/**
 * How far the portrait leans when the figure is off its feet (POMYSLY 21.08).
 *
 * `down` was the state that read worst on a crowded map: a dark red base and an
 * icon, against the huge ✕ that death gets. „Leży" is the one thing both states
 * have in common and the one thing a top-down map can say without words, so the
 * face tips over — the whole reason `drawNose` refuses to rotate a portrait for
 * *facing* („rotating one makes a person lie on their side") is exactly why
 * rotating one here is right.
 *
 * Only the portrait turns. The ring, the hit point arc, the base, the name and
 * the status stickers stay upright, because a tilted caption is a bug and a
 * tilted circle is nothing at all.
 *
 * Thirty-five degrees, not the twenty the idea was written with: at the zoom a
 * table actually plays at, a token is a few dozen screen pixels and twenty
 * degrees was checked in the browser against an upright copy of the same face —
 * the difference was there and nobody would notice it. Thirty-five reads as
 * „on his side" at a glance and still not as a broken sprite.
 */
const CONDITION_TILT_DEG: Readonly<Record<TokenCondition, number>> = {
  ok: 0,
  wounded: 0,
  down: 35,
  dead: 35,
};

/** Deterministic placeholder color from the token name (no image uploaded). */
function placeholderColor(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  // Muted HSL→RGB, fixed s/l — enough variety without neon clashes.
  const c = 0.35;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v: number) => Math.round((v + 0.25) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

function ringColor(token: TokenView, ctx: TokenNodeCtx): number {
  if (token.ownerId === null) return RING_NPC;
  return token.ownerId === ctx.myUserId ? RING_OWN : RING_OTHER_PLAYER;
}

/**
 * Visual representation of one token: circle-masked image (or placeholder
 * disc with an initial), owner-colored ring, HP arc around it, name below,
 * status icon badges and — since stage 27j — a base, a shadow, a condition and
 * a nose saying which way it is turned. Interaction is wired by MapRenderer.
 */
export class TokenNode extends Container {
  readonly tokenId: string;
  /** Last applied token data — used by drag logic in MapRenderer. */
  token: TokenView;

  /** Shadow and base go *under* everything, in that order. */
  private readonly shadow = new Graphics();
  private readonly base = new Graphics();
  private readonly image = new Sprite();
  private readonly imageMask = new Graphics();
  private readonly placeholder = new Graphics();
  private readonly initial: Text;
  private readonly ring = new Graphics();
  private readonly turnRing = new Graphics();
  private readonly hpArc = new Graphics();
  private readonly nose = new Graphics();
  private readonly downMark = new Graphics();
  private readonly nameText: Text;
  private readonly statusLayer = new Container();
  private imageUrl: string | null = null;
  /**
   * Kadr, którym jest ujęty aktualnie wczytany portret (12.09).
   *
   * Zapamiętany, bo `fitImage` woła się także po doczytaniu tekstury — czyli
   * poza `update`, gdzie kontekst jest pod ręką.
   */
  private imageCrop: PortraitCrop = DEFAULT_PORTRAIT_CROP;
  private extentPx = 0;
  private signature = '';
  /**
   * Facing the renderer is showing right now, which is not always the facing
   * the server holds: while a figure is being dragged or is walking a route,
   * the client turns it from its own motion and the drop confirms it. Kept off
   * `token` so a `state:sync` cannot snap the nose back mid-walk.
   */
  private shownFacing: number | null = null;
  /**
   * The last angle the *server* said, so a local turn can outrank a stale one.
   *
   * Without this the nose snaps backwards mid-march: every `state:sync` carries
   * the facing from before the walk started, and a plain „take what the token
   * says" would apply it over the direction the figure is visibly walking in.
   * The server's word is adopted the moment it *changes*, which is the drop.
   */
  private serverFacing: number | null | undefined = undefined;
  /** Colour the nose is painted, kept so a local turn need not re-derive it. */
  private ringTint = RING_NPC;
  /**
   * Dokąd sięga oprawa figury (`furnitureRadius`), zapamiętane z ostatniego
   * przerysowania — klin kierunku rysuje się też poza `update`, ze `showFacing`,
   * i musi wiedzieć, czy ma obejść obrączkę PW, czy samą obwódkę.
   */
  private furniture = 0;
  private turnGlow = 0;

  constructor(token: TokenView) {
    super();
    this.tokenId = token.id;
    this.token = token;
    this.initial = new Text({
      text: '',
      style: { fill: 0xffffff, fontWeight: 'bold', fontSize: 40 },
      anchor: 0.5,
    });
    this.nameText = new Text({
      text: '',
      style: {
        fill: 0xffffff,
        fontSize: 14,
        stroke: { color: 0x000000, width: 3, join: 'round' },
      },
      anchor: { x: 0.5, y: 0 },
      resolution: 2,
    });
    this.image.mask = this.imageMask;
    this.addChild(
      this.shadow,
      this.base,
      this.turnRing,
      this.placeholder,
      this.initial,
      this.image,
      this.imageMask,
      this.ring,
      this.hpArc,
      this.nose,
      this.downMark,
      this.nameText,
      this.statusLayer,
    );
  }

  /** Edge length in world px for the current grid. */
  static extent(token: TokenView, ctx: TokenNodeCtx): number {
    return token.size * ctx.gridSizePx;
  }

  update(token: TokenView, ctx: TokenNodeCtx, skipPosition: boolean): void {
    this.token = token;
    if (!skipPosition) this.position.set(token.x, token.y);
    // A figure the server has turned is a figure the client stops guessing
    // about; a local turn from a drag survives until that answer arrives.
    if (token.facing !== this.serverFacing) {
      this.serverFacing = token.facing;
      this.shownFacing = token.facing ?? null;
    }

    const condition = tokenCondition(token, ctx.conditions);
    const signature = JSON.stringify([
      token.name,
      token.imageUrl,
      token.size,
      token.ownerId,
      token.hidden,
      token.statuses,
      token.hp ?? null,
      condition,
      this.shownFacing,
      ctx.gridSizePx,
      ctx.myUserId,
      ctx.isGm,
      ctx.activeTokenId === token.id,
      // Bez tego przestawienie kadru przez MG nie przerysowałoby figury:
      // podpis nie zmienia się, gdy zmienia się sam sposób ujęcia obrazka.
      cropFor(token.imageUrl, ctx),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    const extent = TokenNode.extent(token, ctx);
    this.extentPx = extent;
    this.ringTint = ringColor(token, ctx);
    const center = extent / 2;
    const radius = ownerRingRadius(extent);
    // Obrączka PW leży od 12.09 **poza** portretem, więc to ona, a nie obwódka
    // właściciela, wyznacza brzeg figury dla wszystkiego, co się o ten brzeg
    // opiera: aureoli tury i klina kierunku.
    this.furniture = furnitureRadius(extent, hasHpRing(token));

    // Only the GM ever receives hidden tokens — render them ghosted.
    this.alpha = token.hidden ? 0.5 : CONDITION_ALPHA[condition];

    this.drawGround(center, radius, condition);

    this.ring
      .clear()
      .circle(center, center, radius)
      .stroke({ color: this.ringTint, width: RING_WIDTH });

    // Whose turn it is: a soft halo outside the owner ring, so both stay
    // readable (owner colour keeps its meaning during combat).
    this.turnRing.clear();
    if (ctx.activeTokenId === token.id) {
      // Liczone od brzegu oprawy, nie od obwódki: gdy figura nosi obrączkę PW,
      // aureola narysowana po staremu schowałaby się pod paskiem — `turnRing`
      // leży w kolejności rysowania **pod** nim.
      const halo = this.furniture;
      this.turnRing
        // A filled disc under the figure, not only a line round it. At a fifth
        // of scale a five-pixel halo is one screen pixel of amber and the
        // question „whose turn is it" goes back to being asked out loud.
        .circle(center, center, halo + TURN_RING_WIDTH * 2)
        .fill({ color: TURN_RING_COLOR, alpha: 0.16 })
        .circle(center, center, halo + TURN_RING_WIDTH)
        .stroke({ color: TURN_RING_COLOR, width: TURN_RING_WIDTH, alpha: 0.55 })
        .circle(center, center, halo + 1)
        .stroke({ color: TURN_RING_COLOR, width: 2, alpha: 0.95 });
    } else {
      this.turnGlow = 0;
      this.turnRing.alpha = 1;
    }

    this.imageMask.clear().circle(center, center, portraitRadius(extent)).fill(0xffffff);

    const hasImage = token.imageUrl !== null;
    // Krążek pod portretem jest teraz rysowany **zawsze** (12.09): od kiedy kadr
    // wolno wywieźć poza obraz, jego brzeg bywa pusty — a pustka pod maską to
    // dziura, przez którą widać mapę pod figurą. Bez obrazka to dalej dawny
    // kolorowy placeholder z inicjałem; pod obrazkiem — ciemne tło żetonu.
    this.paintPlaceholder(hasImage ? PORTRAIT_BACKDROP : placeholderColor(token.name));
    this.initial.visible = !hasImage;
    this.initial.text = token.name.trim().charAt(0).toUpperCase() || '?';
    this.initial.style.fontSize = extent * 0.4;
    this.initial.position.set(center, center);
    this.image.tint = CONDITION_TINT[condition];
    this.placeholder.tint = CONDITION_TINT[condition];
    this.tiltPortrait(condition);

    this.imageCrop = cropFor(token.imageUrl, ctx);
    this.updateImage(token.imageUrl, extent);
    this.drawHpArc(token, extent, condition);
    this.drawNose(extent, this.ringTint);
    this.drawDownMark(center, radius, condition);

    this.nameText.text = token.name;
    this.nameText.style.fontSize = Math.max(12, extent * 0.14);
    // Below the base, not below the circle: the ellipse sticks out under the
    // figure's feet, and a name printed over it reads as a caption on a shadow.
    // Od 12.09 podpis ustępuje też obrączce PW: ta wyszła poza kratkę i jej
    // dolny łuk kończył się dokładnie na pierwszym wierszu nazwy.
    this.nameText.position.set(
      center,
      Math.max(extent, center + this.furniture) + Math.max(6, extent * 0.1),
    );

    this.updateStatuses(token, ctx, extent, condition);
  }

  /**
   * Which way the figure is looking right now, or null when nobody has said.
   *
   * Read by `MapRenderer` to place the rotation knob, so the knob sits where the
   * nose is even mid-drag, when the server's answer is a frame behind.
   */
  get facing(): number | null {
    return this.shownFacing;
  }

  /**
   * Dokąd sięga oprawa tej figury, licząc od jej środka (12.09).
   *
   * Czyta to `MapRenderer`, bo obrączka zaznaczenia i uchwyt obrotu rysują się
   * na warstwie nakładki, a nie tutaj — i muszą wiedzieć, że od 12.09 brzegiem
   * figury bywa obrączka PW, a nie obwódka właściciela. Bez tego biały przerywany
   * okrąg siadałby graczowi **na pasku życia** przy każdym przybliżeniu: jego
   * odstęp liczy się w pikselach ekranu, więc w pikselach świata topnieje
   * wraz ze zbliżeniem.
   */
  get outerRadius(): number {
    return this.furniture || this.extentPx / 2 - RING_WIDTH / 2;
  }

  /**
   * Kolor obwódki właściciela: zielona — moja figura, błękitna — cudza gracza,
   * czerwona — NPC.
   *
   * Czyta go `MapRenderer`, odkąd „tą figurą sterują moje kliknięcia" mówi
   * **pogrubiona własna obwódka**, a nie osobny biały okrąg (zlecenie MG,
   * 12.09): nakładka musi znać kolor, który ma pogrubić.
   */
  get ownerRingTint(): number {
    return this.ringTint;
  }

  /** Promień osi obwódki właściciela w pikselach świata — dla tej samej nakładki. */
  get ownerRingRadius(): number {
    return ownerRingRadius(this.extentPx);
  }

  /**
   * Turns the figure locally (stage 27j) — what dragging and marching do while
   * they are happening.
   *
   * Purely visual: the server writes the angle when the drop is paid for, and
   * this is what keeps the figure from walking half a room backwards first.
   */
  showFacing(degrees: number | null): void {
    if (degrees === this.shownFacing) return;
    this.shownFacing = degrees;
    this.drawNose(this.extentPx, this.ringTint);
    // The signature carries the facing, so a redraw would otherwise be skipped
    // as „nothing changed" once the server catches up with the same angle.
    this.signature = '';
  }

  /**
   * One frame of the „it is this one's turn" pulse.
   *
   * Driven from the renderer's ticker rather than a private one: there is at
   * most one active figure, the map already has a ticker running, and a second
   * one would be a second clock to keep in step with the first.
   */
  pulseTurn(phase: number): void {
    if (this.turnGlow === phase) return;
    this.turnGlow = phase;
    this.turnRing.alpha = 0.72 + 0.28 * phase;
  }

  private drawGround(center: number, radius: number, condition: TokenCondition): void {
    // Squashed and pushed down: a shadow on a map is cast by a figure standing
    // up, which is the whole illusion the base is trying to sell.
    this.shadow
      .clear()
      .ellipse(center, center + radius * 0.92, radius * 0.95, radius * 0.32)
      .fill({ color: 0x000000, alpha: 0.5 });
    // A hurt figure's base is drawn heavier than a healthy one's: at table zoom
    // the ellipse is a dozen screen pixels of dark ground, and „he is bleeding
    // out" has to survive that. The rim is what does the surviving.
    const rim = condition === 'ok' ? 2 : Math.max(3, radius * 0.09);
    this.base
      .clear()
      .ellipse(center, center + radius * 0.78, radius * 1.0, radius * 0.34)
      .fill({ color: BASE_COLORS[condition], alpha: condition === 'ok' ? 0.55 : 0.9 })
      .ellipse(center, center + radius * 0.78, radius * 1.0, radius * 0.34)
      .stroke({ color: BASE_COLORS[condition], width: rim, alpha: 0.95 });
  }

  private updateImage(url: string | null, extent: number): void {
    if (url === this.imageUrl) {
      if (this.image.texture !== Texture.EMPTY) this.fitImage(extent);
      return;
    }
    this.imageUrl = url;
    this.image.texture = Texture.EMPTY;
    this.image.visible = false;
    if (!url) return;
    Assets.load<Texture>(url)
      .then((texture) => {
        if (this.destroyed || this.imageUrl !== url) return;
        this.image.texture = texture;
        this.image.visible = true;
        this.fitImage(this.extentPx);
      })
      .catch(() => {
        if (this.destroyed || this.imageUrl !== url) return;
        // Zepsuty plik: krążek wraca do koloru z nazwy i inicjału, bo tło
        // portretu (grafit) samo w sobie niczego by o figurze nie mówiło.
        this.paintPlaceholder(placeholderColor(this.token.name));
        this.initial.visible = true;
      });
  }

  /** Krążek pod portretem — tło obrazka albo placeholder, zależnie od koloru. */
  private paintPlaceholder(color: number): void {
    const centre = this.extentPx / 2;
    this.placeholder.clear().circle(centre, centre, portraitRadius(this.extentPx)).fill(color);
    this.placeholder.visible = true;
  }

  /**
   * Wpisuje obraz w krążek według kadru MG (12.09).
   *
   * Kotwica **jest** punktem kadru, a sprite stoi nią na środku kratki — dzięki
   * temu leżąca figura (`CONDITION_TILT_DEG`) dalej obraca się wokół środka
   * krążka, a nie wokół środka pliku, i portret nie ucieka spod maski.
   *
   * Bez kadru wychodzi dokładnie to, co ta metoda liczyła wcześniej: skala
   * `extent / min(w, h)` i kotwica 0,5, czyli ślepy środkowy kadr.
   */
  private fitImage(extent: number): void {
    const tex = this.image.texture;
    if (tex === Texture.EMPTY || tex.width === 0 || tex.height === 0) return;
    const place = portraitCropPlacement(
      this.imageCrop,
      { width: tex.width, height: tex.height },
      extent,
    );
    this.image.setSize(tex.width * place.scale, tex.height * place.scale);
    this.image.anchor.set(place.anchorX, place.anchorY);
    this.image.position.set(extent / 2, extent / 2);
    // Krążek zostaje pod obrazem: kadr wyjechany poza grafikę odsłania jego
    // brzeg, a tam ma być tło żetonu, nie mapa. Znika tylko inicjał.
    this.initial.visible = false;
  }

  /**
   * Hit points as a ring round the figure (stage 27j decision, 20.08).
   *
   * The bar over the head is gone and with it the two things wrong with it: it
   * belonged to no figure in particular in a crowd, and it stood exactly where
   * the damage numbers of 27i want to float. A ring belongs to what it encircles
   * and leaves the sky free.
   *
   * Drawn from the top clockwise, which is how every dial a person has ever
   * read empties, and on a dark track so „half gone" is legible without doing
   * arithmetic on a length.
   *
   * **Od 12.09 obrączka leży poza portretem, nie na nim** (zlecenie MG). Do tej
   * pory biegła wewnątrz obwódki właściciela — czyli po brzegu twarzy, którą
   * zasłaniała tym bardziej, im szerszy był pasek. Na zewnątrz kosztuje to tyle,
   * że figura wystaje poza swoją kratkę o szerokość paska; MG wybrał ten koszt
   * świadomie, woląc go od zwężenia portretu. Promień liczy `hpRingRadius`,
   * bo czyta go też `furnitureRadius` — aureola tury i klin kierunku muszą
   * wiedzieć, gdzie ten pasek się kończy.
   */
  private drawHpArc(token: TokenView, extent: number, condition: TokenCondition): void {
    this.hpArc.clear();
    const hp = token.hp;
    // Absent hp = not visible to this viewer; null = token simply has none.
    if (!hasHpRing(token) || hp === undefined || hp === null) return;
    const ratio = Math.max(0, Math.min(1, hp.current / hp.max));
    // Kolor bierze się ze szczebla, nie z ułamka — tego samego, na którym stoi
    // pasek PW w panelu postaci. Długość łuku dalej z ułamka: szczebel mówi
    // „jak źle", łuk „ile jeszcze".
    const color = HP_RUNG_COLORS[tokenHpRung(hp)];
    const width = hpRingWidth(extent);
    const centre = extent / 2;
    const radius = hpRingRadius(extent);
    const start = -Math.PI / 2;
    this.hpArc
      // Ciemna koszulka pod całą obrączką (12.09). Pasek wyjechał poza figurę,
      // czyli wprost na rysunek mapy — a ten bywa jasny. Bez obrysu zielone
      // na piaskowym betonie przestaje być paskiem, a zaczyna być plamą.
      .circle(centre, centre, radius)
      .stroke({ color: HP_CASING, width: width + hpRingCasing(extent) * 2, alpha: 0.85 })
      .circle(centre, centre, radius)
      .stroke({ color: HP_TRACK, width, alpha: 0.9, cap: 'butt' });
    if (ratio > 0) {
      // `moveTo` before the arc, and it is not optional: Pixi keeps one path
      // cursor per `Graphics`, so an `arc` following anything else is joined to
      // it by a straight line — which came out as a green whisker hanging off
      // the top of every figure the first time this was drawn.
      this.hpArc
        .moveTo(centre + Math.cos(start) * radius, centre + Math.sin(start) * radius)
        .arc(centre, centre, radius, start, start + ratio * Math.PI * 2)
        .stroke({ color, width, alpha: 1, cap: 'butt' });
    }
    // A figure at zero has an empty ring, which is easy to mistake for „no data"
    // — so the ring itself goes red when the fight is over for this one.
    if (condition === 'down' || condition === 'dead') {
      this.hpArc
        .circle(centre, centre, radius)
        .stroke({ color: HP_RUNG_COLORS.mortal, width: 2, alpha: 0.7, cap: 'butt' });
    }
  }

  /**
   * The nose: which way this figure is turned (stage 27j).
   *
   * A wedge outside the ring rather than a rotated portrait, because portraits
   * are drawn face-on and rotating one makes a person lie on their side. CP RED
   * has no facing rules — this is legibility, so it is deliberately small: it
   * says „he is watching that door" and claims nothing about arcs of fire.
   */
  private drawNose(extent: number, color: number): void {
    this.nose.clear();
    const facing = this.shownFacing;
    if (facing === null || extent <= 0) return;
    const centre = extent / 2;
    // Klin zaczyna się za całą oprawą figury, a nie za samą obwódką: od 12.09
    // między nimi leży obrączka PW, a klin narysowany po staremu wycinałby
    // w niej dziurę (rysuje się nad nią).
    const radius = this.furniture || centre - RING_WIDTH / 2;
    // Screen degrees: 0 is up, and up is −Y.
    const angle = ((facing - 90) * Math.PI) / 180;
    // Sized off the figure rather than off the screen, and generously: the
    // first attempt was a thirteen-percent nub in the owner's own colour, and
    // it vanished into the ring it was sitting on.
    const tip = Math.max(9, extent * 0.22);
    const half = Math.max(6, extent * 0.15);
    const base = radius + 1;
    const ax = centre + Math.cos(angle) * (base + tip);
    const ay = centre + Math.sin(angle) * (base + tip);
    const bx = centre + Math.cos(angle + Math.PI / 2) * half + Math.cos(angle) * base;
    const by = centre + Math.sin(angle + Math.PI / 2) * half + Math.sin(angle) * base;
    const cx = centre + Math.cos(angle - Math.PI / 2) * half + Math.cos(angle) * base;
    const cy = centre + Math.sin(angle - Math.PI / 2) * half + Math.sin(angle) * base;
    this.nose
      .poly([ax, ay, bx, by, cx, cy])
      .fill({ color, alpha: 0.95 })
      .poly([ax, ay, bx, by, cx, cy])
      .stroke({ color: 0x0b1220, width: Math.max(2, extent * 0.025), alpha: 0.85 });
  }

  /**
   * Lays the portrait on its side when the figure is down or dead.
   *
   * Both parts already sit at the centre with a 0.5 anchor, so the angle is the
   * whole of it — and it survives `updateImage`, whose texture arrives frames
   * later and would otherwise stand a corpse back up. A figure with no portrait
   * has only its initial to tip, which is less than a face but still not
   * nothing; the base, the sticker and the arc carry the rest.
   */
  private tiltPortrait(condition: TokenCondition): void {
    const radians = (CONDITION_TILT_DEG[condition] * Math.PI) / 180;
    this.image.rotation = radians;
    this.initial.rotation = radians;
  }

  /** The cross over a figure that is out of the fight — dead only. */
  private drawDownMark(center: number, radius: number, condition: TokenCondition): void {
    this.downMark.clear();
    if (condition !== 'dead') return;
    const arm = radius * 0.62;
    const width = Math.max(3, radius * 0.14);
    this.downMark
      .moveTo(center - arm, center - arm)
      .lineTo(center + arm, center + arm)
      .moveTo(center + arm, center - arm)
      .lineTo(center - arm, center + arm)
      .stroke({ color: 0x0b1220, width: width + 2, alpha: 0.85, cap: 'round' })
      .moveTo(center - arm, center - arm)
      .lineTo(center + arm, center + arm)
      .moveTo(center + arm, center - arm)
      .lineTo(center - arm, center + arm)
      .stroke({ color: 0xf87171, width, alpha: 0.95, cap: 'round' });
  }

  private updateStatuses(
    token: TokenView,
    ctx: TokenNodeCtx,
    extent: number,
    condition: TokenCondition,
  ): void {
    this.statusLayer.removeChildren().forEach((child) => child.destroy());
    // A figure can be out of the fight without wearing a status for it — a
    // statist with no sheet simply hits zero hit points. Since the condition is
    // told by its icon, that icon has to exist even then; it goes first, where
    // the eye lands.
    const fallback = fallbackConditionStatusId(token, condition, ctx.conditions);
    const statuses = fallback ? [fallback, ...token.statuses] : token.statuses;
    if (statuses.length === 0) return;
    const iconSize = Math.max(14, extent * 0.22);
    const perRow = Math.max(1, Math.floor(extent / (iconSize + 2)));
    statuses.forEach((statusId, index) => {
      const url = ctx.statusIcons.get(statusId);
      if (!url) return;
      const badge = new Sprite();
      badge.setSize(iconSize, iconSize);
      badge.position.set(
        2 + (index % perRow) * (iconSize + 2),
        2 + Math.floor(index / perRow) * (iconSize + 2),
      );
      badge.alpha = 0.9;
      this.statusLayer.addChild(badge);
      Assets.load<Texture>(url)
        .then((texture) => {
          if (badge.destroyed) return;
          badge.texture = texture;
          badge.setSize(iconSize, iconSize);
        })
        .catch(() => badge.destroy());
    });
  }
}
