import * as THREE from "three";
import { CanvasTex, PIXEL_FONT, pixelFontReady } from "../shared/canvas";
import type { CabinetGame, GameKey } from "./game";

/**
 * MINI KNIGHT, ported from the original Python / Pygame Zero version (Main.py) to TypeScript.
 *
 * The rules are a line-by-line port: the same level geometry, the same frame-based physics run at a fixed
 * 60 Hz, the same enemies, sprites and sounds. Coordinates stay in Pygame's convention (800 × 400, origin
 * top-left, y down) and are only flipped when meshes are positioned.
 *
 * The cabinet has a 4:3 monitor, so the 2:1 game sits in the middle of an 800 × 600 picture, with an
 * arcade-style info bar above and a controls card below.
 */
const WIDTH = 800, HEIGHT = 400;
const PIC_W = 800, PIC_H = 600, BAR = (PIC_H - HEIGHT) / 2;
const STEP = 1 / 60;
// The arcade page lives one folder down (/arcade/), so assets in public/ sit one level up from it
const ASSETS = new URL("../games/mini-knight/", location.href).href;

type State = "menu" | "game" | "game_over" | "win";
interface Rect { x: number; y: number; w: number; h: number }
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const collide = (a: Rect, b: Rect) => a.x < b.x + b.w && a.y < b.y + b.h && a.x + a.w > b.x && a.y + a.h > b.y;
const inside = (r: Rect, px: number, py: number) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;

// ---------- Level (unchanged from Main.py) ----------
const PLATFORMS: Rect[] = [
  R(0, HEIGHT - 30, WIDTH, 20), // ground
  R(285, 350, 25, 25), R(310, 336, 80, 90), R(385, 350, 25, 25), R(490, 350, 120, 20), R(740, 340, 120, 50),
  R(655, 300, 45, 20), R(635, 283, 45, 20), R(613, 265, 45, 20), R(-10, 248, 650, 20), R(580, 230, 40, 20),
  R(8, 230, 150, 20), R(8, 210, 50, 20), R(8, 190, 50, 20), R(0, 160, 40, 40), R(78, 140, 60, 20),
  R(100, 120, 60, 20), R(100, 105, 700, 20), R(500, 88, 40, 20), R(0, 0, 20, 400), R(780, 0, 20, 400),
  R(505, 205, 40, 20), R(435, 205, 40, 20), R(320, 205, 40, 20), R(210, 205, 40, 20)
];
const OBSTACLES: Rect[] = [R(250, 348, 22, 30), R(438, 348, 22, 30), R(240, 40, 60, 25), R(380, 40, 60, 25), R(160, 235, 430, 25)];
const GOAL = R(650, 70, 30, 40);
const BAT = ["bat_fly_1", "bat_fly_2", "bat_fly_3", "bat_fly_4", "bat_fly_5", "bat_fly_6", "bat_fly_7", "bat_fly_8"];
const SLIME = ["slime_1", "slime_2", "slime_3", "slime_4", "slime_5", "slime_6", "slime_7", "slime_8"];
const INITIAL_ENEMIES = [
  { x: 500, y: 320, left: 490, right: 610, frames: BAT, type: "patrol" },
  { x: 350, y: 150, left: 150, right: 550, frames: BAT, type: "patrol" },
  { x: 340, y: 20, left: 0, right: 0, frames: SLIME, type: "slime" },
  { x: 400, y: 135, left: 0, right: 0, frames: SLIME, type: "slime" }
] as const;
const MENU = { start: R(300, 150, 200, 50), sound: R(300, 220, 200, 50), exit: R(300, 290, 200, 50) };
const MENU_ITEMS = ["start", "sound", "exit"] as const;

const IMAGES = [
  "game_bg", "menu_bg", "projectile", "projectile_left", ...SLIME,
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => ["idle_" + i, "idle_" + i + "_left"]),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => ["walk_" + i, "walk_" + i + "_left", "bat_fly_" + i, "bat_fly_" + i + "_left"])
];
const SOUNDS = ["click", "death", "hit", "jump", "projectile", "win"] as const;
type Sound = (typeof SOUNDS)[number];

// ---------- Sound: Web Audio for effects (no latency), an <audio> element for the music ----------
class GameAudio {
  on = true;
  private ctx: AudioContext | null = null;
  private buffers = new Map<Sound, AudioBuffer>();
  private music = new Audio(ASSETS + "music/menu_music.mp3");
  private wantMusic = false;
  constructor() { this.music.loop = true; this.music.volume = 0.3; this.music.preload = "none"; }
  /** Must run inside a user gesture the first time (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      for (const s of SOUNDS) {
        fetch(ASSETS + "sounds/" + s + ".wav").then((r) => r.arrayBuffer()).then((b) => this.ctx!.decodeAudioData(b)).then((buf) => this.buffers.set(s, buf)).catch(() => {});
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  play(name: Sound): void {
    if (!this.on || !this.ctx) return;
    const buf = this.buffers.get(name); if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const gain = this.ctx.createGain(); gain.gain.value = 0.6;
    src.connect(gain).connect(this.ctx.destination); src.start();
  }
  startMusic(): void { this.wantMusic = true; if (this.on) this.music.play().catch(() => {}); }
  stopMusic(): void { this.wantMusic = false; this.music.pause(); }
  setOn(v: boolean): void { this.on = v; if (!v) this.music.pause(); else if (this.wantMusic) this.music.play().catch(() => {}); }
}

// ---------- Actors ----------
interface Sprite { name: string; w: number; h: number }

class Player {
  x: number; y: number;
  speed = 3; direction = 1;
  image = "idle_1";
  frame = 0; animationTimer = 0;
  velocityY = 0; gravity = 0.5; jumpStrength = -7.5; isGrounded = true; jumpCd = 0; jumpDelay = 10;
  shootCd = 0; shootDelay = 10;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
}
class Enemy {
  x: number; y: number;
  speed = 2; direction = 1;
  frame = 0; animationTimer = 0; image: string;
  velocityY = 0; gravity = 0.2; jumpStrength = -5; grounded = false;
  constructor(x: number, y: number, public leftBorder: number, public rightBorder: number, public frames: readonly string[], public type: string) {
    this.x = x; this.y = y; this.image = frames[0];
  }
}
class Projectile {
  alive = true; speed = 6;
  constructor(public x: number, public y: number, public direction: number) {}
  get image() { return this.direction === 1 ? "projectile" : "projectile_left"; }
}

export class MiniKnight implements CabinetGame {
  readonly id = "mini-knight";
  readonly target: THREE.WebGLRenderTarget;
  readonly crtResolution = new THREE.Vector2(PIC_W / 2, PIC_H / 2);
  readonly aspect = PIC_W / PIC_H;
  readonly marquee = "MINI KNIGHT";
  readonly accent = "#ff3fd8";
  readonly brightness = 1.15;
  readonly blurb = "My Pygame Zero platformer, ported line by line and drawn as a Three.js scene.";
  readonly cover = ASSETS + "cover.jpg";
  readonly pad = { grid: false, bomb: false, jump: "JUMP", shoot: "FIRE" };
  readonly controlsHint = "← → move · Space jump · Z shoot · Esc to step back";
  readonly touchHint = "◀ ▶ move · JUMP · FIRE · tap the menu to choose";
  stick = 0;
  onFlash: (c: THREE.Color) => void = () => {};
  onButton: (i: number) => void = () => {};
  onExit: () => void = () => {};
  onSoundChange: (on: boolean) => void = () => {};

  private audio = new GameAudio();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, PIC_W, PIC_H, 0, -10, 10);
  private tex = new Map<string, THREE.Texture>();
  private size = new Map<string, Sprite>();
  private _loaded = false;
  private loading: Promise<void> | null = null;

  private state: State = "menu";
  private player = new Player(110, 350);
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private keys: Record<GameKey, boolean> = { left: false, right: false, up: false, down: false, jump: false, shoot: false, bomb: false };
  private acc = 0;
  private menuSel = 0;
  private ticks = 0;
  private best: number | null = null;

  // Meshes
  private quad = new THREE.PlaneGeometry(1, 1);
  private bg: THREE.Mesh;
  private playerMesh: THREE.Mesh;
  private enemyMeshes: THREE.Mesh[] = [];
  private projMeshes: THREE.Mesh[] = [];
  private overlay = new CanvasTex(WIDTH, HEIGHT, { pixelated: true });
  private overlayMesh: THREE.Mesh;
  private topBar = new CanvasTex(PIC_W, BAR, { pixelated: true });
  private bottomBar = new CanvasTex(PIC_W, BAR, { pixelated: true });
  private overlayKey = "";
  private topKey = "";

  constructor() {
    this.target = new THREE.WebGLRenderTarget(PIC_W, PIC_H, { depthBuffer: false });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.magFilter = THREE.LinearFilter;
    this.target.texture.minFilter = THREE.LinearFilter;
    this.target.texture.generateMipmaps = false;
    this.scene.background = new THREE.Color("#000000");
    try { const b = Number(localStorage.getItem("lab.miniknight.best")); if (b > 0) this.best = b; } catch { /* storage unavailable */ }

    const mat = (z: number, map: THREE.Texture | null = null) => {
      const m = new THREE.Mesh(this.quad, new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false }));
      m.position.z = z; this.scene.add(m); return m;
    };
    this.bg = mat(0); this.bg.position.set(WIDTH / 2, BAR + HEIGHT / 2, 0); this.bg.scale.set(WIDTH, HEIGHT, 1);
    this.playerMesh = mat(2);
    for (let i = 0; i < 4; i++) this.enemyMeshes.push(mat(3));
    for (let i = 0; i < 16; i++) this.projMeshes.push(mat(4));
    this.overlayMesh = mat(5, this.overlay.texture);
    this.overlayMesh.position.set(WIDTH / 2, BAR + HEIGHT / 2, 5); this.overlayMesh.scale.set(WIDTH, HEIGHT, 1);
    const top = mat(6, this.topBar.texture); top.position.set(PIC_W / 2, PIC_H - BAR / 2, 6); top.scale.set(PIC_W, BAR, 1);
    const bot = mat(6, this.bottomBar.texture); bot.position.set(PIC_W / 2, BAR / 2, 6); bot.scale.set(PIC_W, BAR, 1);
    this.resetEnemies();
    this.drawBars(true);
    pixelFontReady.then(() => { this.overlayKey = ""; this.topKey = ""; this.drawBars(true); });
  }

  get texture(): THREE.Texture { return this.target.texture; }
  get loaded(): boolean { return this._loaded; }

  load(): Promise<void> { return (this.loading ??= this.loadAssets()); }
  private async loadAssets(): Promise<void> {
    const loader = new THREE.TextureLoader();
    await Promise.all(IMAGES.map(async (name) => {
      const t = await loader.loadAsync(ASSETS + "images/" + name + ".png");
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      const img = t.image as HTMLImageElement;
      this.tex.set(name, t); this.size.set(name, { name, w: img.width, h: img.height });
    }));
    this._loaded = true;
  }

  get playing(): boolean { return this.state === "game"; }
  get sound(): boolean { return this.audio.on; }
  set sound(v: boolean) { this.audio.setOn(v); this.overlayKey = ""; }

  // ---------- Input ----------
  setKey(key: GameKey, down: boolean): void {
    const was = this.keys[key];
    this.keys[key] = down;
    if (!down || was) return;
    if (key === "jump") this.onButton(0);
    if (key === "shoot") this.onButton(1);
    if (this.state === "menu") {
      if (key === "up") this.menuSel = (this.menuSel + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
      if (key === "down") this.menuSel = (this.menuSel + 1) % MENU_ITEMS.length;
      if (key === "jump" || key === "shoot") this.menuChoose(MENU_ITEMS[this.menuSel]);
    } else if (this.state !== "game" && (key === "jump" || key === "shoot")) this.restart();
  }
  press(): void {
    this.onButton(2);
    if (this.state === "menu") this.menuChoose(MENU_ITEMS[this.menuSel]);
    else if (this.state !== "game") this.restart();
  }
  click(u: number, v: number): void {
    // Screen UV → Pygame coordinates (origin top-left of the game area)
    const px = u * PIC_W, py = (1 - v) * PIC_H - BAR;
    if (this.state === "menu") {
      for (const k of MENU_ITEMS) if (inside(MENU[k], px, py)) { this.menuSel = MENU_ITEMS.indexOf(k); this.menuChoose(k); }
    } else if (this.state !== "game") this.restart(); // on_mouse_down: any click restarts
  }
  enter(): void { this.audio.unlock(); this.audio.startMusic(); }
  sleep(): void { this.leave(); this.attract(); }
  leave(): void { this.audio.stopMusic(); for (const k in this.keys) this.keys[k as GameKey] = false; }
  attract(): void { this.state = "menu"; this.menuSel = 0; }

  private menuChoose(item: (typeof MENU_ITEMS)[number]): void {
    if (item === "start") { this.audio.play("click"); this.restart(); }
    else if (item === "sound") {
      this.audio.play("click");
      this.audio.setOn(!this.audio.on);
      this.onSoundChange(this.audio.on);
      this.overlayKey = "";
    } else this.onExit();
  }
  private restart(): void {
    this.player = new Player(110, 350);
    this.resetEnemies();
    this.projectiles = [];
    this.ticks = 0;
    this.state = "game";
  }
  private resetEnemies(): void {
    this.enemies = INITIAL_ENEMIES.map((e) => new Enemy(e.x, e.y, e.left, e.right, e.frames, e.type));
  }

  // ---------- Actor rectangles (Pygame Zero anchors actors at their centre) ----------
  private dims(name: string): Sprite { return this.size.get(name) || { name, w: 21, h: 21 }; }
  private rectOf(x: number, y: number, image: string): Rect { const d = this.dims(image); return R(x - d.w / 2, y - d.h / 2, d.w, d.h); }

  // ---------- Simulation: one call = one Pygame Zero frame ----------
  private tick(): void {
    if (this.state !== "game") return;
    this.ticks++;
    this.updatePlayer();
    for (const e of this.enemies) {
      this.updateEnemy(e);
      if (this.state === "game" && collide(this.rectOf(this.player.x, this.player.y, this.player.image), this.rectOf(e.x, e.y, e.image))) this.die();
    }
    for (const p of this.projectiles.slice()) {
      this.updateProjectile(p);
      if (!p.alive) this.projectiles.splice(this.projectiles.indexOf(p), 1);
    }
  }
  private die(): void {
    this.state = "game_over";
    this.audio.play("death");
    this.onFlash(new THREE.Color("#ff3030"));
  }
  private updatePlayer(): void {
    const p = this.player;
    let moving = false, moveX = 0;
    if (this.keys.left) { moveX = -p.speed; p.direction = -1; moving = true; }
    else if (this.keys.right) { moveX = p.speed; p.direction = 1; moving = true; }

    if (p.shootCd > 0) p.shootCd -= 1;
    if (this.keys.shoot && p.shootCd === 0) {
      this.projectiles.push(new Projectile(p.x + p.direction * 20, p.y, p.direction));
      this.audio.play("projectile");
      p.shootCd = p.shootDelay;
    }
    if (p.jumpCd > 0) p.jumpCd -= 1;
    if ((this.keys.jump || this.keys.up) && p.isGrounded && p.jumpCd === 0) {
      p.velocityY = p.jumpStrength; p.isGrounded = false; p.jumpCd = p.jumpDelay;
      this.audio.play("jump");
    }

    // Vertical movement and landing / ceilings
    p.velocityY += p.gravity;
    p.y += p.velocityY;
    p.isGrounded = false;
    const h = this.dims(p.image).h, w = this.dims(p.image).w;
    for (const pl of PLATFORMS) {
      const r = this.rectOf(p.x, p.y, p.image);
      if (!collide(r, pl)) continue;
      if (p.velocityY > 0 && r.y + r.h <= pl.y + p.velocityY) { p.y = pl.y - h / 2; p.velocityY = 0; p.isGrounded = true; }
      else if (p.velocityY < 0 && r.y >= pl.y + pl.h + p.velocityY) { p.y = pl.y + pl.h + h / 2; p.velocityY = 0; }
    }
    // Horizontal movement and walls
    p.x += moveX;
    for (const pl of PLATFORMS) {
      if (!collide(this.rectOf(p.x, p.y, p.image), pl)) continue;
      if (moveX > 0) p.x = pl.x - w / 2;
      else if (moveX < 0) p.x = pl.x + pl.w + w / 2;
    }
    const r = this.rectOf(p.x, p.y, p.image);
    for (const o of OBSTACLES) if (this.state === "game" && collide(r, o)) this.die();
    if (this.state === "game" && collide(r, GOAL)) this.win();

    // Animation: a new frame every 9 ticks
    p.animationTimer += 1;
    if (p.animationTimer > 8) {
      p.animationTimer = 0; p.frame += 1;
      if (p.frame >= 6) p.frame = 0; // both frame lists in Main.py have six entries
      p.image = (moving ? "walk_" : "idle_") + (p.frame + 1) + (p.direction === -1 ? "_left" : "");
    }
    this.stick += ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) - this.stick) * 0.3;
  }
  private win(): void {
    this.state = "win";
    this.audio.play("win");
    this.onFlash(new THREE.Color("#5cff7a"));
    const t = this.ticks / 60;
    if (this.best == null || t < this.best) { this.best = t; try { localStorage.setItem("lab.miniknight.best", String(t)); } catch { /* storage unavailable */ } }
  }
  private updateEnemy(e: Enemy): void {
    if (e.type === "patrol") {
      e.x += e.speed * e.direction;
      if (e.x < e.leftBorder) e.direction = 1;
      if (e.x > e.rightBorder) e.direction = -1;
    } else {
      e.velocityY += e.gravity;
      e.y += e.velocityY;
      e.grounded = false;
      for (const pl of PLATFORMS) {
        const r = this.rectOf(e.x, e.y, e.image);
        if (collide(r, pl) && e.velocityY > 0 && r.y + r.h <= pl.y + e.velocityY) {
          e.y = pl.y - r.h / 2; e.velocityY = 0; e.grounded = true;
        }
      }
      if (e.grounded) e.velocityY = e.jumpStrength;
    }
    e.animationTimer += 1;
    if (e.animationTimer > 6) { e.animationTimer = 0; e.frame += 1; }
    if (e.frame >= e.frames.length) e.frame = 0;
    e.image = e.frames[e.frame] + (e.direction === -1 ? "_left" : "");
  }
  private updateProjectile(p: Projectile): void {
    p.x += p.speed * p.direction;
    const r = this.rectOf(p.x, p.y, p.image);
    if (r.x + r.w < 0 || r.x > WIDTH) p.alive = false;
    for (const e of this.enemies) {
      if (collide(r, this.rectOf(e.x, e.y, e.image))) {
        this.enemies.splice(this.enemies.indexOf(e), 1);
        p.alive = false;
        this.audio.play("hit");
        this.onFlash(new THREE.Color("#ffd27a"));
        break;
      }
    }
  }

  // ---------- Frame update and drawing ----------
  update(dt: number): void {
    if (!this._loaded) return;
    this.acc = Math.min(this.acc + dt, STEP * 5);
    while (this.acc >= STEP) { this.acc -= STEP; this.tick(); }
    if (this.state !== "game") this.stick *= 0.85;

    const place = (m: THREE.Mesh, x: number, y: number, image: string) => {
      const d = this.dims(image);
      const mat = m.material as THREE.MeshBasicMaterial;
      const t = this.tex.get(image) || null;
      if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; }
      m.visible = true;
      m.position.set(Math.round(x), PIC_H - BAR - Math.round(y), m.position.z);
      m.scale.set(d.w, d.h, 1);
    };
    const inGame = this.state === "game";
    const bgMat = this.bg.material as THREE.MeshBasicMaterial;
    const bgTex = this.tex.get(this.state === "menu" ? "menu_bg" : "game_bg") || null;
    if (bgMat.map !== bgTex) { bgMat.map = bgTex; bgMat.needsUpdate = true; }
    this.bg.visible = this.state === "menu" || inGame;
    this.playerMesh.visible = false;
    this.enemyMeshes.forEach((m) => (m.visible = false));
    this.projMeshes.forEach((m) => (m.visible = false));
    if (inGame) {
      place(this.playerMesh, this.player.x, this.player.y, this.player.image);
      this.enemies.forEach((e, i) => place(this.enemyMeshes[i], e.x, e.y, e.image));
      this.projectiles.slice(0, this.projMeshes.length).forEach((p, i) => place(this.projMeshes[i], p.x, p.y, p.image));
    }
    this.drawOverlay();
    this.drawBars(false);
  }

  private drawOverlay(): void {
    const blink = Math.floor(performance.now() / 450) % 2 === 0;
    const key = this.state + "|" + this.menuSel + "|" + this.audio.on + "|" + (this.state === "menu" ? blink : "") + "|" + (this.state === "win" ? this.best : "");
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    const { ctx } = this.overlay;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (this.state === "menu") {
      ctx.font = "34px " + PIXEL_FONT;
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText("MINI KNIGHT!", WIDTH / 2 + 3, 83);
      ctx.fillStyle = "#ffffff"; ctx.fillText("MINI KNIGHT!", WIDTH / 2, 80);
      const btn = (r: Rect, color: string, label: string, sel: boolean) => {
        ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.w, r.h);
        if (sel) { ctx.strokeStyle = blink ? "#ffffff" : "#ffd27a"; ctx.lineWidth = 4; ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8); }
        ctx.font = "14px " + PIXEL_FONT; ctx.fillStyle = "#ffffff"; ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      };
      btn(MENU.start, "#006400", "START", this.menuSel === 0);
      btn(MENU.sound, "#00008b", this.audio.on ? "SOUND: ON" : "SOUND: OFF", this.menuSel === 1);
      btn(MENU.exit, "#8b0000", "EXIT", this.menuSel === 2);
    } else if (this.state === "game_over" || this.state === "win") {
      ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const over = this.state === "game_over";
      ctx.font = "44px " + PIXEL_FONT; ctx.fillStyle = over ? "#ff2020" : "#20e040";
      ctx.fillText(over ? "GAME OVER" : "YOU WIN!", WIDTH / 2, HEIGHT / 2 - 50);
      ctx.font = "16px " + PIXEL_FONT; ctx.fillStyle = "#ffffff";
      ctx.fillText(over ? "Click to Restart" : "Click to Play Again", WIDTH / 2, HEIGHT / 2 + 50);
      if (!over && this.best != null) { ctx.fillStyle = "#ffd27a"; ctx.fillText("TIME " + (this.ticks / 60).toFixed(1) + "s   BEST " + this.best.toFixed(1) + "s", WIDTH / 2, HEIGHT / 2 + 100); }
    }
    this.overlay.update();
  }

  private drawBars(force: boolean): void {
    const t = this.state === "game" ? (this.ticks / 60).toFixed(1) : this.state === "win" ? (this.ticks / 60).toFixed(1) : "0.0";
    const key = t + "|" + this.enemies.length + "|" + this.best + "|" + this.state;
    if (!force && key === this.topKey) return;
    this.topKey = key;
    {
      const { ctx } = this.topBar;
      ctx.fillStyle = "#05030a"; ctx.fillRect(0, 0, PIC_W, BAR);
      ctx.textBaseline = "middle"; ctx.font = "14px " + PIXEL_FONT;
      ctx.textAlign = "left"; ctx.fillStyle = "#ffd27a"; ctx.fillText("MINI KNIGHT", 28, 38);
      ctx.fillStyle = "#9aa0c8"; ctx.fillText("ENEMIES " + this.enemies.length, 28, 66);
      ctx.textAlign = "center"; ctx.fillStyle = "#33f0ff"; ctx.fillText("TIME", PIC_W / 2, 38);
      ctx.fillStyle = "#ffffff"; ctx.fillText(t + "s", PIC_W / 2, 66);
      ctx.textAlign = "right"; ctx.fillStyle = "#ff3fd8"; ctx.fillText("BEST", PIC_W - 28, 38);
      ctx.fillStyle = "#ffffff"; ctx.fillText(this.best != null ? this.best.toFixed(1) + "s" : "--", PIC_W - 28, 66);
      this.topBar.update();
    }
    if (force) {
      const { ctx } = this.bottomBar;
      ctx.fillStyle = "#05030a"; ctx.fillRect(0, 0, PIC_W, BAR);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "12px " + PIXEL_FONT;
      ctx.fillStyle = "#9aa0c8"; ctx.fillText("ARROWS MOVE   SPACE JUMP   Z SHOOT", PIC_W / 2, 40);
      ctx.fillStyle = "#5c5f86"; ctx.fillText("REACH THE CASTLE DOOR", PIC_W / 2, 66);
      this.bottomBar.update();
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}
