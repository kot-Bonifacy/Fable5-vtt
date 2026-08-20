import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { MapFxEffect, MapFxSound, SceneView, ScenePoint } from '@vtt/shared';
import { mapFxTracerCount, metresPerPixel } from '@vtt/shared';
import { playFxSound } from '../sfx.js';

/**
 * Everything the map draws when somebody pulls a trigger (stage 27i).
 *
 * Kept out of `MapRenderer` deliberately, and it is the only layer that is:
 * every other one draws **state** — where the tokens are, what the fog covers,
 * which lamp is on — and is redrawn from that state whenever it changes. This
 * one draws **events**, which have no state to be redrawn from. They arrive,
 * they age, they are gone. Mixing the two in the 4 000-line renderer would mean
 * a `clear()` in the wrong place silently deleting an explosion.
 *
 * What is vector and what is a sprite follows from what each does badly. A
 * tracer, a muzzle flash and a lightning arc are lines whose length the scene
 * decides — a bitmap of them would stretch. A fireball and a cloud of smoke are
 * turbulence, which no `Graphics` call in this file could fake; those are
 * frame-by-frame sheets from CC0 packs (`public/fx/ATTRIBUTION.md`), which is
 * the level the GM asked for on 20.08.
 *
 * Sound rides along with the picture rather than being triggered by the socket
 * handler, for one reason: a burst is five tracers 55 ms apart, and five bangs
 * at once is not a burst. Whatever staggers the drawing has to stagger the
 * noise, so they live in the same object.
 */

/* --- geometry and timing ------------------------------------------------- */

/**
 * How long a round is in the air, whatever the distance (ms).
 *
 * Every number in this block was **halved and then put back** after the first
 * look at a real table (20.08). A shot that took 110 ms to cross the room was
 * physically honest and completely invisible: at a quarter zoom the whole
 * exchange was over before an eye moved to it. The projectile modules people
 * actually use in Foundry take half a second or so, and they are right — this
 * is a picture of a shot, not a ballistics table.
 */
const TRACER_FLIGHT_MS = 220;
/** …and how long the streak it leaves takes to fade. */
const TRACER_FADE_MS = 260;
const ARROW_FLIGHT_MS = 380;
const ROCKET_FLIGHT_MS = 460;
const MUZZLE_MS = 130;
const IMPACT_MS = 320;
const MELEE_MS = 300;
const CONE_MS = 380;
const ZAP_MS = 620;
/** A number nobody manages to read is a number that was not shown. */
const LABEL_MS = 2200;
/**
 * Height of a floating number **on screen**, and how far it rises, also on
 * screen.
 *
 * Not in world pixels, and that is the whole point. A table looks at a 4 000 px
 * map at about a quarter scale, so a number sized off the grid comes out nine
 * pixels tall and unreadable — the same trap `MapRenderer` documents for ruler
 * labels and note pins. Both numbers are multiplied by `overlayScale` every
 * frame, so „−12" is the same size zoomed in on one room and zoomed out on the
 * whole block.
 */
const LABEL_SIZE_PX = 22;
const LABEL_RISE_PX = 34;
/** Rounds of a burst, spaced so the eye reads „automatic" and not „one shot". */
const BURST_STAGGER_MS = 55;
/** Two numbers over one figure would print on top of each other. */
const LABEL_STAGGER_MS = 240;
/** Bangs one batch may play — a ten-round burst is not ten samples. */
const MAX_SOUNDS_PER_SHOT = 4;

/** A miss carries past the figure by this much, in metres. */
const MISS_OVERSHOOT_M = 1.6;
/** …and off to one side, so the line is visibly *not* the one that hit. */
const MISS_SIDESTEP_M = 0.7;

const EXPLOSION_SHEET = '/fx/explosion.png';
const EXPLOSION_COLS = 8;
const EXPLOSION_ROWS = 8;
const EXPLOSION_MS = 1100;

const CLOUD_SHEET = '/fx/smoke.png';
const CLOUD_COLS = 5;
const CLOUD_ROWS = 3;
const CLOUD_MS = 1600;

/* --- colours -------------------------------------------------------------- */

/**
 * The map is painted, not styled — it has no CSS to take tokens from, exactly
 * as the token rings and the blast template have none (stage 27e left the map
 * at its own light on purpose). These are the same family as `MapRenderer`'s.
 */
const TRACER_CORE = 0xfff3c4;
const TRACER_GLOW = 0xffb347;
const MUZZLE_COLOR = 0xffe08a;
const IMPACT_HIT = 0xff6b5b;
const IMPACT_MISS = 0xd6dde6;
const MELEE_COLOR = 0xe8eef5;
const CONE_COLOR = 0xffc46b;
const ZAP_COLOR = 0x8fd8ff;
const CLOUD_GAS = 0x9fe08a;
const CLOUD_SMOKE = 0xb9c1c9;

const LABEL_COLORS: Record<string, number> = {
  damage: 0xff5f52,
  heal: 0x4ade80,
  miss: 0xcbd5e1,
  crit: 0xfacc15,
  note: 0x94a3b8,
};

/* --- items --------------------------------------------------------------- */

interface Timed {
  /** Milliseconds since the batch arrived; negative while still queued. */
  age: number;
  life: number;
}

type FxItem = Timed &
  (
    | {
        kind: 'shot';
        from: ScenePoint | null;
        to: ScenePoint | null;
        style: 'bullet' | 'arrow' | 'flame' | 'rocket' | 'melee';
        hit: boolean;
        flight: number;
        /** Fired once, when `age` first goes positive. */
        sound: MapFxSound | null;
        soundPitch: number;
        played: boolean;
      }
    | { kind: 'cone'; from: ScenePoint; angle: number; half: number; reach: number }
    | { kind: 'zap'; x: number; y: number; width: number; height: number; seed: number }
    | { kind: 'sprite'; sprite: Sprite; frames: Texture[]; fade: boolean }
    | { kind: 'label'; text: Text; at: ScenePoint }
  );

/** Sheet cut into frames, loaded once and shared by every effect using it. */
async function loadFrames(url: string, cols: number, rows: number): Promise<Texture[]> {
  const sheet = await Assets.load<Texture>(url);
  const w = Math.floor(sheet.width / cols);
  const h = Math.floor(sheet.height / rows);
  const frames: Texture[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      frames.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(col * w, row * h, w, h),
        }),
      );
    }
  }
  return frames;
}

export class MapFxLayer {
  /** Added to the viewport by `MapRenderer`, below the light and the fog. */
  readonly container = new Container();

  private readonly graphics = new Graphics();
  private readonly spriteLayer = new Container();
  private readonly labelLayer = new Container();
  private readonly items: FxItem[] = [];

  private scene: SceneView | null = null;
  /** 1 / zoom, so a stroke keeps its width on screen. Set by the renderer. */
  private overlayScale = 1;

  private explosionFrames: Texture[] | null = null;
  private cloudFrames: Texture[] | null = null;
  private loading = false;
  private destroyed = false;

  constructor() {
    // Purely painted: without this the layer sits between the pointer and every
    // token underneath it — the hit-test bug of stage 16e, which cost half a day.
    this.container.eventMode = 'none';
    this.container.addChild(this.spriteLayer, this.graphics, this.labelLayer);
  }

  setScene(scene: SceneView | null): void {
    // Only a *different* map wipes what is burning. `setScene` also runs for an
    // ordinary scene edit — the GM nudging the grid, renaming the map — and a
    // grenade must not go out because somebody changed the grid colour.
    const changed = scene?.id !== this.scene?.id;
    this.scene = scene;
    if (changed) this.clear();
    if (scene) void this.ensureSheets();
  }

  setOverlayScale(scale: number): void {
    this.overlayScale = scale;
  }

  /** Anything still on screen goes; a scene change is not a slow fade. */
  clear(): void {
    for (const item of this.items) {
      if (item.kind === 'sprite') item.sprite.destroy();
      if (item.kind === 'label') item.text.destroy();
    }
    this.items.length = 0;
    this.graphics.clear();
  }

  destroy(): void {
    this.destroyed = true;
    this.clear();
    // The viewport this container hangs off is torn down with
    // `destroy({ children: true })`, which already reached it — so this is
    // only for the case where it never got added to one.
    if (!this.container.destroyed) this.container.destroy({ children: true });
  }

  /** True while something is still animating — the renderer's tick asks. */
  get busy(): boolean {
    return this.items.length > 0;
  }

  private async ensureSheets(): Promise<void> {
    if (this.loading || (this.explosionFrames && this.cloudFrames)) return;
    this.loading = true;
    try {
      const [explosion, cloud] = await Promise.all([
        loadFrames(EXPLOSION_SHEET, EXPLOSION_COLS, EXPLOSION_ROWS),
        loadFrames(CLOUD_SHEET, CLOUD_COLS, CLOUD_ROWS),
      ]);
      if (this.destroyed) return;
      this.explosionFrames = explosion;
      this.cloudFrames = cloud;
    } catch {
      // No sheet: blasts fall back to the ring `drawBlastRing` paints. A
      // missing asset must never take the rest of the effect with it.
    } finally {
      this.loading = false;
    }
  }

  /* --- taking a batch --------------------------------------------------- */

  play(effects: readonly MapFxEffect[]): void {
    if (this.destroyed || !this.scene) return;
    const perPixel = metresPerPixel(this.scene);
    if (perPixel <= 0) return;
    const px = (metres: number) => metres / perPixel;
    let labelSlot = 0;

    for (const effect of effects) {
      switch (effect.kind) {
        case 'shot':
          this.addShot(effect, px);
          break;
        case 'cone':
          this.items.push({
            kind: 'cone',
            age: 0,
            life: CONE_MS,
            from: effect.from,
            angle: (effect.angleDeg * Math.PI) / 180,
            half: (effect.halfAngleDeg * Math.PI) / 180,
            reach: px(effect.rangeM),
          });
          if (effect.sound) playFxSound(effect.sound);
          break;
        case 'blast':
          this.addSprite(effect.at, px(effect.sideM) * 1.15, EXPLOSION_MS, 'explosion', null);
          if (effect.sound) playFxSound(effect.sound);
          break;
        case 'cloud':
          this.addSprite(
            effect.at,
            px(effect.sideM),
            CLOUD_MS,
            'cloud',
            effect.variant === 'gas' ? CLOUD_GAS : CLOUD_SMOKE,
          );
          if (effect.sound) playFxSound(effect.sound);
          break;
        case 'zap':
          this.items.push({
            kind: 'zap',
            age: 0,
            life: ZAP_MS,
            ...effect.rect,
            seed: Math.random() * 1000,
          });
          if (effect.sound) playFxSound(effect.sound);
          break;
        case 'spark':
          this.items.push({
            kind: 'shot',
            age: 0,
            life: IMPACT_MS,
            from: null,
            to: effect.at,
            style: 'bullet',
            hit: true,
            flight: 0,
            sound: effect.sound,
            soundPitch: 1,
            played: false,
          });
          break;
        case 'float':
          this.addLabel(effect, labelSlot);
          labelSlot += 1;
          break;
      }
    }
  }

  /**
   * One shot, as one to eight tracers.
   *
   * A burst does not become a second kind of effect: it is the same line drawn
   * a few times with a stagger and a little scatter, which is what a burst
   * *is*. Only the first few make a noise (`MAX_SOUNDS_PER_SHOT`) — ten samples
   * at 55 ms is a machine gun made of clipping, not of rounds.
   */
  private addShot(
    effect: Extract<MapFxEffect, { kind: 'shot' }>,
    px: (metres: number) => number,
  ): void {
    const rounds = mapFxTracerCount(effect.shots);
    const flight =
      effect.style === 'arrow'
        ? ARROW_FLIGHT_MS
        : effect.style === 'rocket'
          ? ROCKET_FLIGHT_MS
          : effect.style === 'melee'
            ? MELEE_MS
            : TRACER_FLIGHT_MS;

    for (let round = 0; round < rounds; round += 1) {
      const delay = round * BURST_STAGGER_MS;
      // A round that missed goes past the figure and off to one side; every
      // round of a burst picks its own side, so a volley sprays.
      const to =
        effect.to && !effect.hit ? this.scatterMiss(effect.from, effect.to, px) : effect.to;
      this.items.push({
        kind: 'shot',
        age: -delay,
        life: flight + TRACER_FADE_MS + IMPACT_MS,
        from: effect.from,
        to,
        style: effect.style,
        hit: effect.hit,
        flight,
        sound: round < MAX_SOUNDS_PER_SHOT ? effect.sound : null,
        // Identical samples in a row read as a loop; a few percent of pitch
        // is enough to stop that without turning the gun into a cartoon.
        soundPitch: 1 + (round === 0 ? 0 : (Math.random() - 0.5) * 0.14),
        played: false,
      });
    }
  }

  /** Where a missed round actually goes: past the figure and to one side. */
  private scatterMiss(
    from: ScenePoint | null,
    to: ScenePoint,
    px: (metres: number) => number,
  ): ScenePoint {
    if (!from) return to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const side = Math.random() < 0.5 ? -1 : 1;
    const spread = px(MISS_SIDESTEP_M) * (0.5 + Math.random());
    return {
      x: to.x + ux * px(MISS_OVERSHOOT_M) - uy * spread * side,
      y: to.y + uy * px(MISS_OVERSHOOT_M) + ux * spread * side,
    };
  }

  private addSprite(
    at: ScenePoint,
    sizePx: number,
    life: number,
    which: 'explosion' | 'cloud',
    tint: number | null,
  ): void {
    const frames = which === 'explosion' ? this.explosionFrames : this.cloudFrames;
    if (!frames || frames.length === 0) {
      // Sheets still loading (or missing): a plain ring says „something went
      // off here" and costs nothing. Never nothing at all.
      this.items.push({
        kind: 'zap',
        age: 0,
        life: 320,
        x: at.x - sizePx / 2,
        y: at.y - sizePx / 2,
        width: sizePx,
        height: sizePx,
        seed: 0,
      });
      return;
    }
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(at.x, at.y);
    sprite.setSize(sizePx, sizePx);
    if (tint !== null) sprite.tint = tint;
    // Fire adds light; smoke blocks it. The blend mode is the whole difference
    // between a fireball and a grey blob painted over the map.
    sprite.blendMode = which === 'explosion' ? 'add' : 'normal';
    sprite.alpha = which === 'explosion' ? 1 : 0;
    this.spriteLayer.addChild(sprite);
    this.items.push({ kind: 'sprite', age: 0, life, sprite, frames, fade: which === 'cloud' });
  }

  private addLabel(effect: Extract<MapFxEffect, { kind: 'float' }>, slot: number): void {
    const grid = this.scene?.grid.sizePx ?? 50;
    const text = new Text({
      text: effect.text,
      style: {
        fill: LABEL_COLORS[effect.tone] ?? LABEL_COLORS.note!,
        fontSize: LABEL_SIZE_PX,
        fontWeight: effect.tone === 'crit' ? '900' : 'bold',
        stroke: { color: 0x000000, width: 4, join: 'round' },
      },
      anchor: { x: 0.5, y: 1 },
      resolution: 2,
    });
    // The starting height *is* tied to the figure — it has to clear the token's
    // own circle, and that circle is measured in squares.
    text.position.set(effect.at.x, effect.at.y - grid * 0.4);
    text.alpha = 0;
    this.labelLayer.addChild(text);
    this.items.push({
      kind: 'label',
      age: -slot * LABEL_STAGGER_MS,
      life: LABEL_MS,
      text,
      at: { x: effect.at.x, y: effect.at.y - grid * 0.4 },
    });
  }

  /* --- drawing ----------------------------------------------------------- */

  tick(deltaMs: number): void {
    if (this.destroyed) return;
    this.graphics.clear();
    if (this.items.length === 0) return;
    const k = this.overlayScale;

    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i]!;
      item.age += deltaMs;
      if (item.age < 0) {
        // Still queued (a later round of a burst, a second number over the same
        // figure). Nothing drawn, nothing heard.
        continue;
      }
      if (item.age > item.life) {
        if (item.kind === 'sprite') item.sprite.destroy();
        if (item.kind === 'label') item.text.destroy();
        this.items.splice(i, 1);
        continue;
      }
      switch (item.kind) {
        case 'shot':
          if (!item.played) {
            item.played = true;
            if (item.sound) playFxSound(item.sound, { pitch: item.soundPitch });
          }
          this.drawShot(item, k);
          break;
        case 'cone':
          this.drawCone(item, k);
          break;
        case 'zap':
          this.drawZap(item, k);
          break;
        case 'sprite':
          this.drawSprite(item);
          break;
        case 'label':
          this.drawLabel(item);
          break;
      }
    }
  }

  private drawShot(item: Extract<FxItem, { kind: 'shot' }>, k: number): void {
    const { from, to } = item;
    // A muzzle with nowhere to point: the shooter is in view and the target is
    // not, so the table sees somebody fire and learns nothing about where.
    if (from && !to) {
      this.drawMuzzle(from, null, item.age, k);
      return;
    }
    if (!to) return;

    if (item.style === 'melee') {
      this.drawMelee(from, to, item.age, item.hit, k);
      return;
    }

    if (from) {
      this.drawMuzzle(from, to, item.age, k);
      const travel = Math.min(1, item.age / item.flight);
      const head = {
        x: from.x + (to.x - from.x) * travel,
        y: from.y + (to.y - from.y) * travel,
      };
      // The round in flight: a short bright segment, not the whole line, so the
      // eye follows something moving instead of a line that simply appears.
      const tailFraction = item.style === 'rocket' ? 0.34 : 0.22;
      const tail = {
        x: head.x - (to.x - from.x) * tailFraction * travel,
        y: head.y - (to.y - from.y) * tailFraction * travel,
      };
      const width = item.style === 'arrow' ? 1.6 : item.style === 'rocket' ? 3.4 : 2.4;
      this.graphics
        .moveTo(tail.x, tail.y)
        .lineTo(head.x, head.y)
        .stroke({ color: TRACER_GLOW, width: width * 2.4 * k, alpha: 0.28 })
        .moveTo(tail.x, tail.y)
        .lineTo(head.x, head.y)
        .stroke({ color: TRACER_CORE, width: width * k, alpha: 0.95 });

      // …and the streak it leaves, once it has arrived.
      const fading = item.age - item.flight;
      if (fading > 0 && fading < TRACER_FADE_MS && item.style !== 'rocket') {
        const alpha = 0.5 * (1 - fading / TRACER_FADE_MS);
        this.graphics
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .stroke({ color: TRACER_GLOW, width: 1.4 * k, alpha });
      }
    }

    // The far end. With no muzzle the round simply arrives, so it lands at once.
    const landed = from ? item.age - item.flight : item.age;
    if (landed >= 0 && landed < IMPACT_MS) {
      this.drawImpact(to, landed, item.hit, k);
    }
  }

  private drawMuzzle(from: ScenePoint, to: ScenePoint | null, age: number, k: number): void {
    if (age > MUZZLE_MS) return;
    const fade = 1 - age / MUZZLE_MS;
    const radius = (4 + 6 * fade) * k;
    this.graphics.circle(from.x, from.y, radius).fill({ color: MUZZLE_COLOR, alpha: 0.85 * fade });
    if (!to) return;
    // A short flare along the barrel — enough to read the direction, not enough
    // to be mistaken for the shot itself.
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const reach = radius * 2.6;
    this.graphics
      .moveTo(from.x, from.y)
      .lineTo(from.x + Math.cos(angle) * reach, from.y + Math.sin(angle) * reach)
      .stroke({ color: MUZZLE_COLOR, width: 5 * k, alpha: 0.7 * fade });
  }

  private drawImpact(at: ScenePoint, age: number, hit: boolean, k: number): void {
    const progress = age / IMPACT_MS;
    const fade = 1 - progress;
    const color = hit ? IMPACT_HIT : IMPACT_MISS;
    this.graphics
      .circle(at.x, at.y, (3 + 14 * progress) * k)
      .stroke({ color, width: 2.2 * k, alpha: 0.8 * fade });
    // Splinters: four short strokes off the point of impact. Fixed angles on
    // purpose — a random star redrawn every frame flickers.
    const spread = (5 + 16 * progress) * k;
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i + 0.4;
      this.graphics
        .moveTo(at.x + Math.cos(angle) * spread * 0.4, at.y + Math.sin(angle) * spread * 0.4)
        .lineTo(at.x + Math.cos(angle) * spread, at.y + Math.sin(angle) * spread)
        .stroke({ color, width: 1.6 * k, alpha: 0.7 * fade });
    }
  }

  private drawMelee(
    from: ScenePoint | null,
    to: ScenePoint,
    age: number,
    hit: boolean,
    k: number,
  ): void {
    const progress = Math.min(1, age / MELEE_MS);
    const fade = 1 - progress;
    // The arc is drawn *on the target*, facing whoever swung: a slash at the
    // attacker's feet would be the wrong end of the blow.
    const facing = from ? Math.atan2(from.y - to.y, from.x - to.x) : -Math.PI / 2;
    const grid = this.scene?.grid.sizePx ?? 50;
    const radius = grid * 0.55;
    const sweep = Math.PI * 0.75;
    const start = facing - sweep / 2 + sweep * progress * 0.6;
    this.graphics
      .arc(to.x, to.y, radius, start, start + sweep * 0.5)
      .stroke({ color: MELEE_COLOR, width: 4 * k, alpha: 0.85 * fade });
    if (hit) this.drawImpact(to, age, true, k);
  }

  private drawCone(item: Extract<FxItem, { kind: 'cone' }>, k: number): void {
    const fade = 1 - item.age / item.life;
    // The wedge opens as it goes: a spread of shot leaves the muzzle narrow.
    const reach = item.reach * Math.min(1, 0.35 + item.age / (item.life * 0.5));
    this.graphics
      .moveTo(item.from.x, item.from.y)
      .arc(item.from.x, item.from.y, reach, item.angle - item.half, item.angle + item.half)
      .lineTo(item.from.x, item.from.y)
      .fill({ color: CONE_COLOR, alpha: 0.22 * fade })
      .stroke({ color: CONE_COLOR, width: 2 * k, alpha: 0.7 * fade });
  }

  /**
   * A defended area going live (stage 26f).
   *
   * Vector rather than a sheet, and not out of thrift: the electric floor of
   * the Poligon is 20 × 13 metres, and no bitmap stretches to that without
   * turning into porridge. Arcs are lines, and lines are what `Graphics` is for.
   */
  private drawZap(item: Extract<FxItem, { kind: 'zap' }>, k: number): void {
    const progress = item.age / item.life;
    const fade = 1 - progress;
    this.graphics
      .rect(item.x, item.y, item.width, item.height)
      .fill({ color: ZAP_COLOR, alpha: 0.1 * fade })
      .stroke({ color: ZAP_COLOR, width: 2 * k, alpha: 0.8 * fade });

    // Four arcs that redraw a few times a second. Stepping the seed rather than
    // rerolling it every frame is what keeps them crackling instead of boiling.
    const step = Math.floor(item.age / 70);
    for (let arc = 0; arc < 4; arc += 1) {
      const rnd = pseudoRandom(item.seed + arc * 13.7 + step * 101.3);
      const ax = item.x + item.width * rnd(0);
      const ay = item.y + item.height * rnd(1);
      const bx = item.x + item.width * rnd(2);
      const by = item.y + item.height * rnd(3);
      this.graphics.moveTo(ax, ay);
      const segments = 5;
      for (let s = 1; s <= segments; s += 1) {
        const t = s / segments;
        const jitter = (rnd(3 + s) - 0.5) * Math.min(item.width, item.height) * 0.16;
        const nx = -(by - ay);
        const ny = bx - ax;
        const nl = Math.hypot(nx, ny) || 1;
        const wobble = s === segments ? 0 : jitter;
        this.graphics.lineTo(
          ax + (bx - ax) * t + (nx / nl) * wobble,
          ay + (by - ay) * t + (ny / nl) * wobble,
        );
      }
      this.graphics.stroke({ color: ZAP_COLOR, width: 2.2 * k, alpha: 0.9 * fade });
    }
  }

  private drawSprite(item: Extract<FxItem, { kind: 'sprite' }>): void {
    const progress = item.age / item.life;
    const frame = Math.min(item.frames.length - 1, Math.floor(progress * item.frames.length));
    item.sprite.texture = item.frames[frame]!;
    if (item.fade) {
      // Smoke rolls in and thins out; the sheet loops seamlessly and would
      // otherwise pop in and pop out.
      item.sprite.alpha = 0.75 * Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 3);
      item.sprite.scale.set(item.sprite.scale.x * 1.0015, item.sprite.scale.y * 1.0015);
    } else {
      item.sprite.alpha = progress > 0.75 ? (1 - progress) * 4 : 1;
    }
  }

  private drawLabel(item: Extract<FxItem, { kind: 'label' }>): void {
    const progress = item.age / item.life;
    // Re-applied every frame rather than once: the table pans and zooms while
    // the number is still in the air, and a scale set at birth would shrink
    // with the map under it.
    item.text.scale.set(this.overlayScale);
    item.text.position.set(
      item.at.x,
      item.at.y - LABEL_RISE_PX * this.overlayScale * easeOut(progress),
    );
    // Full strength for most of the flight, then out: a number that starts
    // fading at once is a number nobody manages to read.
    item.text.alpha = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 3.5);
  }
}

/** Deterministic „random" for one arc — see `drawZap`. */
function pseudoRandom(seed: number): (index: number) => number {
  return (index) => {
    const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
