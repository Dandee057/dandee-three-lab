import * as THREE from "three";
import { CanvasTex, PIXEL_FONT, pixelFontReady } from "../shared/canvas";

/**
 * BRICK RUSH: a small brick-breaker that lives in its own Three.js scene and is rendered into a
 * WebGLRenderTarget every frame. The cabinet's screen samples that render target through the CRT shader.
 *
 * The game works in arcade-monitor pixels: a 224 × 288 portrait picture (the resolution of many 1980s
 * vertical cabinets), with the origin in the bottom-left corner.
 */
export const GAME_W = 224, GAME_H = 288;

type State = "attract" | "ready" | "playing" | "lost" | "over" | "cleared";
const COLS = 10, ROWS = 6, BRICK_W = 19, BRICK_H = 7, GRID_X = 12, GRID_TOP = 236;
const ROW_COLORS = ["#ff3fd8", "#ff5a4a", "#ffb02e", "#b8ff3c", "#33f0ff", "#5b7bff"];
const ROW_POINTS = [60, 50, 40, 30, 20, 10];
const PADDLE_Y = 26, PADDLE_H = 5, BALL = 4, WALL = 6, HUD_H = 26;
const MAX_PARTICLES = 160;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: THREE.Color }

export class ArcadeGame {
  readonly target: THREE.WebGLRenderTarget;
  /** Fires on every brick hit with the brick's colour (the cabinet flashes its screen light). */
  onHit: (color: THREE.Color) => void = () => {};
  /** Joystick direction the cabinet should show, -1..1 (also set during attract mode). */
  stick = 0;

  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, GAME_W, GAME_H, 0, -10, 10);
  private bricks: THREE.InstancedMesh;
  private alive = new Uint8Array(COLS * ROWS);
  private paddle: THREE.Mesh;
  private ball: THREE.Mesh;
  private particles: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private hud = new CanvasTex(GAME_W * 2, HUD_H * 2, { pixelated: true });
  private msg = new CanvasTex(GAME_W * 2, 64, { pixelated: true });
  private msgMesh: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  private state: State = "attract";
  private stateT = 0;
  private px = GAME_W / 2;          // paddle centre
  private paddleW = 30;
  private bx = 0; private by = 0; private vx = 0; private vy = 0;
  private speed = 150;
  private score = 0; private lives = 3; private level = 1;
  private hi: number;
  private keys = { left: false, right: false };
  private pointerX: number | null = null;
  private aiError = 0;
  private lastMsg = "";

  constructor() {
    this.target = new THREE.WebGLRenderTarget(GAME_W, GAME_H, { depthBuffer: false });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.magFilter = THREE.NearestFilter;
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.generateMipmaps = false;
    this.scene.background = new THREE.Color("#07040d");

    let hi = 4200;
    try { hi = Number(localStorage.getItem("lab.arcade.hi")) || hi; } catch { /* storage unavailable */ }
    this.hi = hi;

    const quad = new THREE.PlaneGeometry(1, 1);
    const flat = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

    // Playfield frame
    const frameMat = flat("#2b1d5c");
    const top = GAME_H - HUD_H;
    for (const [x, y, w, h] of [[WALL / 2, top / 2, WALL, top], [GAME_W - WALL / 2, top / 2, WALL, top], [GAME_W / 2, top - WALL / 2, GAME_W, WALL]]) {
      const m = new THREE.Mesh(quad, frameMat); m.position.set(x, y, 0); m.scale.set(w, h, 1); this.scene.add(m);
    }

    this.bricks = new THREE.InstancedMesh(quad, flat("#ffffff"), COLS * ROWS);
    this.scene.add(this.bricks);

    this.paddle = new THREE.Mesh(quad, flat("#e9fbff"));
    this.paddle.position.z = 1;
    this.scene.add(this.paddle);
    this.ball = new THREE.Mesh(quad, flat("#ffffff"));
    this.ball.scale.set(BALL, BALL, 1);
    this.ball.position.z = 2;
    this.scene.add(this.ball);

    this.particles = new THREE.InstancedMesh(quad, flat("#ffffff"), MAX_PARTICLES);
    this.particles.count = 0;
    this.scene.add(this.particles);

    const hudMesh = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: this.hud.texture, toneMapped: false }));
    hudMesh.position.set(GAME_W / 2, GAME_H - HUD_H / 2, 3); hudMesh.scale.set(GAME_W, HUD_H, 1);
    this.scene.add(hudMesh);
    this.msgMesh = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: this.msg.texture, transparent: true, toneMapped: false }));
    this.msgMesh.position.set(GAME_W / 2, 118, 4); this.msgMesh.scale.set(GAME_W, 32, 1);
    this.scene.add(this.msgMesh);

    this.resetBricks();
    this.serve();
    this.state = "attract";
    this.drawHud();
    pixelFontReady.then(() => { this.drawHud(); this.lastMsg = ""; });
  }

  // ---------- Input ----------
  setKey(dir: "left" | "right", down: boolean): void { this.keys[dir] = down; if (down) this.pointerX = null; }
  /** Paddle follows a pointer; x is 0..1 across the screen. Pass null to stop following. */
  setPointer(u: number | null): void { this.pointerX = u == null ? null : u * GAME_W; }
  /** Start, launch or continue, depending on the state. */
  press(): void {
    if (this.state === "attract" || this.state === "over") this.newGame();
    else if (this.state === "ready") this.launch();
  }
  /** Back to the self-playing demo (used when the player walks away). */
  attract(): void {
    if (this.state === "attract") return;
    this.state = "attract"; this.stateT = 0;
    this.resetBricks(); this.serve(); this.launch(); this.state = "attract";
  }
  get playing(): boolean { return this.state !== "attract"; }

  // ---------- Rules ----------
  private newGame(): void {
    this.score = 0; this.lives = 3; this.level = 1; this.speed = 150;
    this.resetBricks(); this.serve(); this.setState("ready"); this.drawHud();
  }
  private setState(s: State): void { this.state = s; this.stateT = 0; }
  private resetBricks(): void {
    this.alive.fill(1);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      this.dummy.position.set(GRID_X + c * (BRICK_W + 1) + BRICK_W / 2, GRID_TOP - r * (BRICK_H + 1) - BRICK_H / 2, 0);
      this.dummy.scale.set(BRICK_W, BRICK_H, 1);
      this.dummy.updateMatrix();
      this.bricks.setMatrixAt(i, this.dummy.matrix);
      this.bricks.setColorAt(i, this.tmpColor.set(ROW_COLORS[r]));
    }
    this.bricks.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true;
  }
  private serve(): void { this.bx = this.px; this.by = PADDLE_Y + PADDLE_H / 2 + BALL / 2 + 1; this.vx = 0; this.vy = 0; }
  private launch(): void {
    const a = (Math.random() * 0.5 - 0.25) + Math.PI / 2;
    this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
    if (this.state === "ready") this.setState("playing");
  }
  private killBrick(i: number): void {
    this.alive[i] = 0;
    this.dummy.position.set(-100, -100, 0); this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix();
    this.bricks.setMatrixAt(i, this.dummy.matrix);
    this.bricks.instanceMatrix.needsUpdate = true;
    const r = Math.floor(i / COLS), c = i % COLS;
    const color = new THREE.Color(ROW_COLORS[r]);
    const x = GRID_X + c * (BRICK_W + 1) + BRICK_W / 2, y = GRID_TOP - r * (BRICK_H + 1) - BRICK_H / 2;
    for (let k = 0; k < 10; k++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 70;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color });
    }
    if (this.state !== "attract") { this.score += ROW_POINTS[r] * this.level; if (this.score > this.hi) this.hi = this.score; this.drawHud(); }
    this.onHit(color);
    if (!this.alive.some((v) => v)) {
      if (this.state === "attract") { this.resetBricks(); return; }
      this.level++; this.speed *= 1.1; this.setState("cleared");
    }
  }
  private loseBall(): void {
    if (this.state === "attract") { this.serve(); this.launch(); this.state = "attract"; return; }
    this.lives--; this.drawHud();
    if (this.lives <= 0) {
      this.setState("over");
      try { localStorage.setItem("lab.arcade.hi", String(this.hi)); } catch { /* storage unavailable */ }
    } else { this.setState("lost"); }
  }

  // ---------- Simulation ----------
  update(dt: number): void {
    this.stateT += dt;
    if (this.state === "lost" && this.stateT > 1) { this.serve(); this.setState("ready"); }
    if (this.state === "cleared" && this.stateT > 1.6) { this.resetBricks(); this.serve(); this.setState("ready"); }
    if (this.state === "over" && this.stateT > 6) this.attract();
    if (this.state === "attract" && this.vx === 0 && this.vy === 0) { this.serve(); this.launch(); this.state = "attract"; }

    // Paddle
    const half = this.paddleW / 2, min = WALL + half, max = GAME_W - WALL - half;
    const prev = this.px;
    if (this.state === "attract") {
      // The demo player: tracks the ball with a little lag and a wandering aim error
      this.aiError += (Math.random() - 0.5) * dt * 40; this.aiError *= 0.98;
      const goal = this.bx + Math.max(-10, Math.min(10, this.aiError));
      this.px += Math.max(-170 * dt, Math.min(170 * dt, goal - this.px));
    } else if (this.pointerX != null) {
      this.px += (this.pointerX - this.px) * Math.min(1, dt * 18);
    } else {
      this.px += ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)) * 190 * dt;
    }
    this.px = Math.max(min, Math.min(max, this.px));
    const v = (this.px - prev) / Math.max(dt, 1e-4);
    this.stick += (Math.max(-1, Math.min(1, v / 150)) - this.stick) * Math.min(1, dt * 12);

    if (this.state === "ready") this.bx = this.px;

    // Ball, in small steps so it never tunnels through a brick
    if (this.state === "playing" || this.state === "attract") {
      const steps = 4, h = dt / steps;
      for (let s = 0; s < steps; s++) this.step(h);
    }

    // Particles
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 160 * dt; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    this.particles.count = this.parts.length;
    this.parts.forEach((p, i) => {
      this.dummy.position.set(p.x, p.y, 1.5); this.dummy.scale.set(2, 2, 1); this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
      this.particles.setColorAt(i, this.tmpColor.copy(p.color).multiplyScalar(Math.min(1, p.life * 2)));
    });
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;

    this.paddle.position.set(this.px, PADDLE_Y, 1);
    this.paddle.scale.set(this.paddleW, PADDLE_H, 1);
    this.ball.position.set(this.bx, this.by, 2);
    this.ball.visible = this.state !== "over" && this.state !== "lost" && this.state !== "cleared";
    this.drawMessage();
  }

  private step(h: number): void {
    this.bx += this.vx * h; this.by += this.vy * h;
    const r = BALL / 2, top = GAME_H - HUD_H - WALL;
    if (this.bx - r < WALL) { this.bx = WALL + r; this.vx = Math.abs(this.vx); }
    if (this.bx + r > GAME_W - WALL) { this.bx = GAME_W - WALL - r; this.vx = -Math.abs(this.vx); }
    if (this.by + r > top) { this.by = top - r; this.vy = -Math.abs(this.vy); }
    // Paddle: the further from centre the ball hits, the steeper it leaves
    if (this.vy < 0 && this.by - r <= PADDLE_Y + PADDLE_H / 2 && this.by - r >= PADDLE_Y - PADDLE_H && Math.abs(this.bx - this.px) <= this.paddleW / 2 + r) {
      const off = (this.bx - this.px) / (this.paddleW / 2 + r);
      const sp = Math.hypot(this.vx, this.vy) * 1.01;
      const a = Math.PI / 2 - off * 1.05;
      this.vx = Math.cos(a) * sp; this.vy = Math.abs(Math.sin(a) * sp);
      this.by = PADDLE_Y + PADDLE_H / 2 + r;
    }
    if (this.by < -8) { this.loseBall(); return; }
    // Bricks
    const c = Math.floor((this.bx - GRID_X) / (BRICK_W + 1));
    const row = Math.floor((GRID_TOP - this.by) / (BRICK_H + 1));
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = row + dr, cc = c + dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      const i = rr * COLS + cc;
      if (!this.alive[i]) continue;
      const x0 = GRID_X + cc * (BRICK_W + 1), y1 = GRID_TOP - rr * (BRICK_H + 1), x1 = x0 + BRICK_W, y0 = y1 - BRICK_H;
      if (this.bx + r < x0 || this.bx - r > x1 || this.by + r < y0 || this.by - r > y1) continue;
      // Bounce off the side of the brick that the ball overlaps least
      const ox = Math.min(this.bx + r - x0, x1 - (this.bx - r)), oy = Math.min(this.by + r - y0, y1 - (this.by - r));
      if (ox < oy) this.vx = -this.vx; else this.vy = -this.vy;
      this.killBrick(i);
      return;
    }
  }

  // ---------- Drawing ----------
  private drawHud(): void {
    const { ctx, canvas } = this.hud;
    ctx.fillStyle = "#07040d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "14px " + PIXEL_FONT; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff3fd8"; ctx.textAlign = "left"; ctx.fillText("1UP", 14, 16);
    ctx.fillStyle = "#ffffff"; ctx.fillText(String(this.score).padStart(5, "0"), 14, 36);
    ctx.fillStyle = "#33f0ff"; ctx.textAlign = "center"; ctx.fillText("HI-SCORE", canvas.width / 2, 16);
    ctx.fillStyle = "#ffffff"; ctx.fillText(String(this.hi).padStart(5, "0"), canvas.width / 2, 36);
    ctx.textAlign = "right"; ctx.fillStyle = "#ffb02e"; ctx.fillText("LV " + this.level, canvas.width - 14, 16);
    for (let k = 0; k < Math.max(0, this.lives - 1); k++) { ctx.fillStyle = "#e9fbff"; ctx.fillRect(canvas.width - 22 - k * 18, 32, 12, 6); }
    this.hud.update();
  }
  private drawMessage(): void {
    const blink = Math.floor(this.stateT * 2.2) % 2 === 0;
    let text = "";
    if (this.state === "attract") text = Math.floor(this.stateT / 4) % 2 === 0 ? (blink ? "PRESS START" : "") : "BRICK RUSH";
    else if (this.state === "ready") text = blink ? "LAUNCH!" : "";
    else if (this.state === "over") text = "GAME OVER";
    else if (this.state === "cleared") text = "LEVEL " + this.level;
    if (text === this.lastMsg) return;
    this.lastMsg = text;
    const { ctx, canvas } = this.msg;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (text) {
      ctx.font = "20px " + PIXEL_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#07040d"; ctx.fillRect(canvas.width / 2 - text.length * 11 - 10, 14, text.length * 22 + 20, 36);
      ctx.fillStyle = this.state === "over" ? "#ff5a4a" : "#ffffff"; ctx.fillText(text, canvas.width / 2, 33);
    }
    this.msg.update();
  }

  render(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}
