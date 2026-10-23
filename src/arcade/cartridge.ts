import * as THREE from "three";
import type { CabinetGame, GameKey } from "./game";
import { PIXEL_FONT } from "../shared/canvas";

/**
 * The cartridge games from dandeegames.com, running on a cabinet.
 *
 * Each cartridge is a plain script (public/games/<id>/<id>.js) that registers a factory on `window` and
 * returns an engine with the same small API as the website's handheld console. The script is only
 * fetched when its cabinet is selected. This adapter turns that API into a CabinetGame: the engine draws
 * into a 2D canvas, and the canvas is uploaded as a texture for the CRT shader to sample.
 */

/** The engine API the cartridges share (see gba.js on the website). */
interface CartEngine {
  state: string;
  soundOn: boolean;
  grid?: boolean;
  bombs?: boolean;
  hints?: { menu?: string; play?: string; over?: string };
  update(dt: number): void;
  drawScreen(g: CanvasRenderingContext2D, w: number, h: number): void;
  press(k: "start" | "sound"): void;
  hold(k: string, down: boolean): void;
  click(x: number, y: number): void;
  release(): void;
  toMenu(): void;
  pause(p: boolean): void;
  stop(): void;
}
type CartFactory = { create(opts: { onExit: () => void }): CartEngine };

export interface CartSpec {
  id: string;
  /** Name of the factory the script puts on `window`. */
  global: string;
  marquee: string;
  accent: string;
  blurb: string;
  controls: string;
  touch: string;
  /** Labels for the A and B touch buttons. */
  a: string;
  b: string;
  /** Needs the global THREE (the 3D cartridges). */
  three?: boolean;
}

export const CARTRIDGES: CartSpec[] = [
  { id: "neon-run", global: "NeonRun", marquee: "NEON RUN", accent: "#33f0ff", three: true,
    blurb: "A 3D endless runner. Its own Three.js scene renders off-screen and is copied onto the tube every frame.",
    controls: "← → switch lanes · Space jump · X pulse · Enter start · Esc step back", touch: "◀ ▶ lanes · JUMP · PULSE", a: "JUMP", b: "PULSE" },
  { id: "hyrox-rush", global: "HyroxRush", marquee: "HYROX RUSH", accent: "#ffd100",
    blurb: "Eight runs and eight stations in race order, each a tiny track-and-field mini game. Beat your PB.",
    controls: "← → run · Space = A · X = B · Enter start · Esc step back", touch: "◀ ▶ run · A · B", a: "A", b: "B" },
  { id: "stock-room", global: "StockRoom", marquee: "STOCK ROOM", accent: "#ff8a3d",
    blurb: "A crate-pushing puzzle in the shop's back room. Eight levels, each with a solver-checked par.",
    controls: "Arrows move · Space undo · X restart · Enter start · Esc step back", touch: "Pad to move · UNDO · RESET", a: "UNDO", b: "RESET" },
  { id: "shelf-monsters", global: "ShelfMonsters", marquee: "SHELF MONSTERS", accent: "#5bd46a",
    blurb: "A turn-based monster battler: seven types, levelling, new moves and Capture Disks.",
    controls: "Arrows choose · Space OK · X back · Enter start · Esc step back", touch: "Pad to choose · OK · BACK", a: "OK", b: "BACK" },
  { id: "scrap-bots", global: "ScrapBots", marquee: "SCRAPBOTS", accent: "#c77dff",
    blurb: "Build a robot from parts and battle the shop's bots. The winner takes one of the loser's parts.",
    controls: "Arrows choose · Space OK · X back · Enter start · Esc step back", touch: "Pad to choose · OK · BACK", a: "OK", b: "BACK" },
  { id: "surge-fighters", global: "SurgeFighters", marquee: "SURGE FIGHTERS", accent: "#ff5a5a",
    blurb: "A 2D fighter with three-hit combos, specials and supers. Win the ladder, then fight your shadow.",
    controls: "← → move · ↑ jump · Space attack · X special · ↓ + X super · Esc step back", touch: "Pad to move · HIT · SPECIAL", a: "HIT", b: "SPECIAL" },
  { id: "riot-runner", global: "RiotRunner", marquee: "RIOT RUNNER", accent: "#ffb02e",
    blurb: "A run-and-gun mission: free POWs for weapons, drive the mini tank and take down the walker boss.",
    controls: "← → run · ↑ aim · Space jump · X fire · C grenade · Enter pause · Esc step back", touch: "Pad to run and aim · JUMP · FIRE · BOMB", a: "JUMP", b: "FIRE" }
];

// The picture: 256 × 144 cartridge pixels at 3×, a 16:9 widescreen tube
const W = 768, H = 432;
const BASE = new URL("../games/", location.href).href;

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

const RED = new THREE.Color("#ff3355"), CYAN = new THREE.Color("#33f0ff");

export class CartridgeGame implements CabinetGame {
  readonly id: string;
  readonly texture: THREE.CanvasTexture;
  readonly crtResolution = new THREE.Vector2(W / 3, H / 3);
  readonly aspect = W / H;
  readonly brightness = 0.95;
  readonly marquee: string;
  readonly accent: string;
  readonly blurb: string;
  readonly cover: string;
  readonly controlsHint: string;
  readonly touchHint: string;
  readonly pad: CabinetGame["pad"];

  stick = 0;
  onFlash: (c: THREE.Color) => void = () => {};
  onButton: (i: number) => void = () => {};
  onExit: () => void = () => {};
  onSoundChange: (on: boolean) => void = () => {};

  private engine: CartEngine | null = null;
  private loading: Promise<void> | null = null;
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private held = new Set<string>();
  private lastState = "menu";
  private stateAt = performance.now();

  constructor(private spec: CartSpec) {
    this.id = spec.id;
    this.marquee = spec.marquee;
    this.accent = spec.accent;
    this.blurb = spec.blurb;
    this.cover = BASE + spec.id + "/cover.jpg";
    this.controlsHint = spec.controls;
    this.touchHint = spec.touch;
    this.pad = { grid: spec.id !== "neon-run" && spec.id !== "hyrox-rush", bomb: spec.id === "riot-runner", jump: spec.a, shoot: spec.b };
    this.canvas.width = W; this.canvas.height = H;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  get loaded(): boolean { return !!this.engine; }
  get playing(): boolean { return !!this.engine && this.engine.state === "game"; }
  get sound(): boolean { return this.engine ? this.engine.soundOn : true; }
  set sound(v: boolean) { if (this.engine && this.engine.soundOn !== v) { this.engine.press("sound"); this.onSoundChange(this.engine.soundOn); } }

  load(): Promise<void> {
    return (this.loading ??= (async () => {
      // The 3D cartridge needs a global THREE; that shim pulls in all of three.js, so it's its own chunk
      if (this.spec.three) (window as unknown as { THREE: unknown }).THREE = (await import("./legacy-three")).legacyThree();
      await loadScript(BASE + this.spec.id + "/" + this.spec.id + ".js");
      const factory = (window as unknown as Record<string, CartFactory | undefined>)[this.spec.global];
      if (!factory) throw new Error(this.spec.global + " did not register");
      this.engine = factory.create({ onExit: () => this.onExit() });
      this.engine.toMenu();
    })());
  }

  // ---- Input: the same mapping as the website's console ----
  setKey(key: GameKey, down: boolean): void {
    const e = this.engine;
    if (!e) return;
    let k: string | null = key;
    if (key === "up") k = e.grid ? "up" : "jump";   // without a d-pad, up means jump
    if (key === "down") k = e.grid ? "down" : null;
    if (key === "bomb") k = e.bombs ? "bomb" : null;
    if (!k) return;
    if (down === this.held.has(k)) return;
    if (down) this.held.add(k); else this.held.delete(k);
    if (down && k === "jump") this.onButton(0);
    if (down && k === "shoot") this.onButton(1);
    // On a menu or end screen, A starts the game
    if (down && k === "jump" && e.state !== "game") { e.press("start"); return; }
    e.hold(k, down);
  }
  press(): void { if (this.engine) { this.engine.press("start"); this.onButton(2); } }
  click(u: number, v: number): void { this.engine?.click(u * W, (1 - v) * H); }

  enter(): void { this.engine?.pause(false); }
  leave(): void {
    if (!this.engine) return;
    this.engine.release(); this.held.clear();
    if (this.engine.state === "game") this.engine.pause(true); // don't lose a run to a camera move
  }
  attract(): void { this.engine?.toMenu(); }
  sleep(): void { if (this.engine) { this.leave(); this.engine.toMenu(); this.engine.stop(); } }

  update(dt: number): void {
    const e = this.engine;
    if (!e) return;
    e.update(dt);
    if (e.state !== this.lastState) {
      if (e.state === "game" && this.lastState !== "game") this.onFlash(CYAN);
      if (e.state === "over" || e.state === "dying") this.onFlash(RED);
      this.lastState = e.state; this.stateAt = performance.now();
    }
    const target = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    this.stick += (target - this.stick) * Math.min(1, dt * 18);
  }

  render(): void {
    const e = this.engine, g = this.ctx;
    if (!e) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    e.drawScreen(g, W, H);
    this.drawHints(e);
    this.texture.needsUpdate = true;
  }

  /** The console's own prompts: how to start on menus, and the controls for the first seconds of a run. */
  private drawHints(e: CartEngine): void {
    const g = this.ctx, hs = e.hints || {};
    const k = W / 320, bar = Math.round(14 * k), fs = Math.max(8, Math.round(6 * k));
    g.save();
    g.font = fs + "px " + PIXEL_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    const age = (performance.now() - this.stateAt) / 1000;
    if (e.state === "game") {
      const a = age < 6 ? 1 : Math.max(0, 1 - (age - 6) / 1.5);
      if (a > 0) {
        g.globalAlpha = a; g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, W, bar);
        g.fillStyle = "#ffffff"; g.fillText(hs.play || "ARROWS: MOVE   SPACE: JUMP   X: ATTACK", W / 2, bar / 2 + 1);
      }
    } else if (e.state !== "dying" && (performance.now() / 1000) % 1.1 < 0.8) {
      g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, H - bar, W, bar);
      g.fillStyle = "#ffc857"; g.fillText(e.state === "menu" ? hs.menu || "ENTER: START" : hs.over || "ENTER / A: PLAY AGAIN", W / 2, H - bar / 2 + 1);
    }
    g.restore();
  }
}
