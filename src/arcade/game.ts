import type * as THREE from "three";

/**
 * What the cabinet needs from a game. A game owns its own Three.js scene and draws it into `target`,
 * a WebGLRenderTarget the cabinet's CRT screen samples. Everything else (camera moves, the joystick,
 * the screen light, touch buttons) is the cabinet's job, driven through the hooks below.
 */
export type GameKey = "left" | "right" | "up" | "down" | "jump" | "shoot";

export interface CabinetGame {
  /** The picture the CRT screen shows. */
  readonly target: THREE.WebGLRenderTarget;
  /** The resolution the CRT shader should draw scanlines and mask stripes for. */
  readonly crtResolution: THREE.Vector2;
  /** Width ÷ height of the picture, so the cabinet can shape its screen. */
  readonly aspect: number;
  /** Text for the marquee above the screen. */
  readonly marquee: string;
  /** Keyboard help shown under the cabinet while playing. */
  readonly controlsHint: string;
  readonly touchHint: string;

  /** Joystick position the cabinet should show, -1..1. */
  stick: number;
  /** Ask the cabinet to flash its screen light (a hit, a death…). */
  onFlash: (color: THREE.Color) => void;
  /** Ask the cabinet to press one of its buttons: 0 = A, 1 = B, 2 = Start. */
  onButton: (index: number) => void;
  /** The game's own EXIT option: step back from the cabinet. */
  onExit: () => void;
  /** Sound was switched on or off inside the game. */
  onSoundChange: (on: boolean) => void;

  /** Loads sprites and sounds. */
  load(): Promise<void>;
  /** True while a run is in progress (not on a menu or end screen). */
  readonly playing: boolean;
  sound: boolean;

  setKey(key: GameKey, down: boolean): void;
  /** Start / confirm (Enter, or the Start button). */
  press(): void;
  /** A click or tap on the glass, in screen UV (0..1, origin bottom-left). */
  click(u: number, v: number): void;
  /** The player stepped up to the cabinet. Called from a user gesture, so audio may start here. */
  enter(): void;
  /** The player stepped back. */
  leave(): void;
  /** Return to the attract screen. */
  attract(): void;

  update(dt: number): void;
  render(renderer: THREE.WebGLRenderer): void;
}
