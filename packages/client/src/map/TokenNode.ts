import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { TokenView } from '@vtt/shared';

/** Everything a node needs to draw itself for the local viewer. */
export interface TokenNodeCtx {
  gridSizePx: number;
  myUserId: string | null;
  isGm: boolean;
  /** status id → icon URL, from the data-driven registry. */
  statusIcons: ReadonlyMap<string, string>;
}

const RING_WIDTH = 3;
const RING_OWN = 0x4ade80;
const RING_OTHER_PLAYER = 0x38bdf8;
const RING_NPC = 0xf87171;

const HP_GREEN = 0x22c55e;
const HP_ORANGE = 0xf59e0b;
const HP_RED = 0xef4444;

/** Deterministic placeholder color from the token name (no image uploaded). */
function placeholderColor(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  // Muted HSL→RGB, fixed s/l — enough variety without neon clashes.
  const c = 0.35;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const to255 = (v: number) => Math.round((v + 0.25) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

function ringColor(token: TokenView, ctx: TokenNodeCtx): number {
  if (token.ownerId === null) return RING_NPC;
  return token.ownerId === ctx.myUserId ? RING_OWN : RING_OTHER_PLAYER;
}

/**
 * Visual representation of one token: circle-masked image (or placeholder
 * disc with an initial), owner-colored ring, HP bar above, name below and
 * status icon badges. Interaction is wired by MapRenderer, not here.
 */
export class TokenNode extends Container {
  readonly tokenId: string;
  /** Last applied token data — used by drag logic in MapRenderer. */
  token: TokenView;

  private readonly image = new Sprite();
  private readonly imageMask = new Graphics();
  private readonly placeholder = new Graphics();
  private readonly initial: Text;
  private readonly ring = new Graphics();
  private readonly hpBar = new Graphics();
  private readonly nameText: Text;
  private readonly statusLayer = new Container();
  private imageUrl: string | null = null;
  private extentPx = 0;
  private signature = '';

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
      this.placeholder,
      this.initial,
      this.image,
      this.imageMask,
      this.ring,
      this.hpBar,
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

    const signature = JSON.stringify([
      token.name,
      token.imageUrl,
      token.size,
      token.ownerId,
      token.hidden,
      token.statuses,
      token.hp ?? null,
      ctx.gridSizePx,
      ctx.myUserId,
      ctx.isGm,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    const extent = TokenNode.extent(token, ctx);
    this.extentPx = extent;
    const center = extent / 2;
    const radius = center - RING_WIDTH / 2;

    // Only the GM ever receives hidden tokens — render them ghosted.
    this.alpha = token.hidden ? 0.5 : 1;

    this.ring
      .clear()
      .circle(center, center, radius)
      .stroke({ color: ringColor(token, ctx), width: RING_WIDTH });

    this.imageMask.clear().circle(center, center, radius - RING_WIDTH / 2).fill(0xffffff);

    this.placeholder
      .clear()
      .circle(center, center, radius - RING_WIDTH / 2)
      .fill(placeholderColor(token.name));
    const hasImage = token.imageUrl !== null;
    this.placeholder.visible = !hasImage;
    this.initial.visible = !hasImage;
    this.initial.text = token.name.trim().charAt(0).toUpperCase() || '?';
    this.initial.style.fontSize = extent * 0.4;
    this.initial.position.set(center, center);

    this.updateImage(token.imageUrl, extent);
    this.drawHpBar(token, extent);

    this.nameText.text = token.name;
    this.nameText.style.fontSize = Math.max(12, extent * 0.14);
    this.nameText.position.set(center, extent + 4);

    this.updateStatuses(token, ctx, extent);
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
        // Broken image: the placeholder disc simply stays visible.
      });
  }

  /** Scales the image to cover the circle (center-crop for non-square art). */
  private fitImage(extent: number): void {
    const tex = this.image.texture;
    if (tex === Texture.EMPTY || tex.width === 0 || tex.height === 0) return;
    const scale = extent / Math.min(tex.width, tex.height);
    this.image.setSize(tex.width * scale, tex.height * scale);
    this.image.anchor.set(0.5);
    this.image.position.set(extent / 2, extent / 2);
    // With an image the disc is just a loading backdrop.
    this.placeholder.visible = false;
    this.initial.visible = false;
  }

  private drawHpBar(token: TokenView, extent: number): void {
    this.hpBar.clear();
    const hp = token.hp;
    // Absent hp = not visible to this viewer; null = token simply has none.
    if (hp === undefined || hp === null || hp.max <= 0) return;
    const ratio = Math.max(0, Math.min(1, hp.current / hp.max));
    const color = ratio > 0.5 ? HP_GREEN : ratio > 0.25 ? HP_ORANGE : HP_RED;
    const height = Math.max(5, extent * 0.06);
    const y = -height - 4;
    this.hpBar
      .roundRect(0, y, extent, height, height / 2)
      .fill({ color: 0x000000, alpha: 0.6 })
      .roundRect(1, y + 1, Math.max(0, (extent - 2) * ratio), height - 2, (height - 2) / 2)
      .fill(color);
  }

  private updateStatuses(token: TokenView, ctx: TokenNodeCtx, extent: number): void {
    this.statusLayer.removeChildren().forEach((child) => child.destroy());
    if (token.statuses.length === 0) return;
    const iconSize = Math.max(14, extent * 0.22);
    const perRow = Math.max(1, Math.floor(extent / (iconSize + 2)));
    token.statuses.forEach((statusId, index) => {
      const url = ctx.statusIcons.get(statusId);
      if (!url) return;
      const badge = new Sprite();
      badge.setSize(iconSize, iconSize);
      badge.position.set(2 + (index % perRow) * (iconSize + 2), 2 + Math.floor(index / perRow) * (iconSize + 2));
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
