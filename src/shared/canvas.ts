import * as THREE from "three";

/** A 2D canvas wrapped in a Three.js texture. Call `update()` after drawing. */
export class CanvasTex {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  constructor(width: number, height: number, opts: { pixelated?: boolean; srgb?: boolean } = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    if (opts.srgb !== false) this.texture.colorSpace = THREE.SRGBColorSpace;
    if (opts.pixelated) {
      this.texture.magFilter = THREE.NearestFilter;
      this.texture.minFilter = THREE.NearestFilter;
      this.texture.generateMipmaps = false;
    } else {
      this.texture.anisotropy = 4;
    }
  }

  update(): void {
    this.texture.needsUpdate = true;
  }
}

/** The pixel font used on the marquee and in the game. Resolves once it has loaded (or after a short timeout). */
export const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';
export const pixelFontReady: Promise<void> = (async () => {
  if (!document.fonts) return;
  try {
    await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* fall back to the system monospace font */
  }
})();

/** Draws text with a soft neon glow: a blurred coloured pass under a crisp light core. */
export function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, blur: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  for (const b of [blur * 2, blur]) {
    ctx.shadowBlur = b;
    ctx.fillText(text, x, y);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff6ff";
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y);
  ctx.restore();
}
