import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { CabinetGame, GameKey } from "./game";
import { MiniKnight } from "./mini-knight";
import { CARTRIDGES, CartridgeGame } from "./cartridge";
import { createCrtMaterial } from "./crt";
import { buildStandIn, loadCabinet, type Cabinet } from "./cabinet";
import { buildRoom } from "./room";
import "../shared/base.css";
import "./arcade.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- Renderer, scene, camera ----------
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
// Neutral tone mapping keeps the neon saturated (ACES washes bright colours towards white)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute("aria-label", "A row of 3D arcade cabinets. Use the arrows to choose a cabinet; click its screen to play.");
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
const room = buildRoom(scene, renderer);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.1;
controls.maxDistance = 7;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.5;

// ---------- Post-processing: HDR scene → bloom → tone mapping and sRGB ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.3, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- The games, one per cabinet, left to right ----------
// Mini Knight is a TypeScript port drawn as its own Three.js scene; the rest are the website's cartridges.
const carts = new Map(CARTRIDGES.map((c) => [c.id, c]));
const cart = (id: string) => new CartridgeGame(carts.get(id)!);
const games: CabinetGame[] = [
  cart("neon-run"), cart("hyrox-rush"), cart("stock-room"), new MiniKnight(),
  cart("riot-runner"), cart("surge-fighters"), cart("shelf-monsters"), cart("scrap-bots")
];
const hashIndex = games.findIndex((g) => "#" + g.id === location.hash);
let sel = hashIndex >= 0 ? hashIndex : 3;
let game = games[sel];

interface Slot { cab: Cabinet; crt: THREE.ShaderMaterial; cover: THREE.Texture; live: boolean; trim: THREE.MeshStandardMaterial[] }
const slots: Slot[] = [];

// The row bends round in a gentle arc, so every cabinet turns slightly towards the middle
const R = 4.2, STEP = 0.215, FRONT_Z = -0.25;
function placeCabinet(group: THREE.Object3D, i: number): void {
  const a = (i - (games.length - 1) / 2) * STEP;
  group.position.set(R * Math.sin(a), 0, FRONT_Z + R * (1 - Math.cos(a)));
  group.rotation.y = -a;
}

/** The cover image, letterboxed to the cabinet's screen shape so it isn't stretched. */
function coverTexture(url: string, aspect: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round(512 / aspect);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(c.width / img.width, c.height / img.height), w = img.width * s, h = img.height * s;
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

async function init(): Promise<void> {
  const first = await loadCabinet(new URL("../models/cabinet.glb", location.href).href, games[0].marquee, games[0].aspect, games[0].accent);
  games.forEach((g, i) => {
    const cab = i === 0 ? first : first.source === "gltf" ? cloneWithScreen(first) : buildStandIn(g.marquee, g.aspect, g.accent);
    const cover = coverTexture(g.cover, g.aspect);
    const crt = createCrtMaterial({ map: cover, resolution: g.crtResolution, brightness: 0.85 });
    cab.screen.material = crt;
    cab.group.userData.slot = i;
    cab.group.traverse((o) => (o.userData.slot = i));
    placeCabinet(cab.group, i);
    scene.add(cab.group);
    const trim = new Set<THREE.MeshStandardMaterial>();
    cab.group.traverse((o) => { const m = (o as THREE.Mesh).material; if (m && !Array.isArray(m) && m.name === "trim") trim.add(m as THREE.MeshStandardMaterial); });
    slots.push({ cab, crt, cover, live: false, trim: [...trim] });
  });
  scene.updateMatrixWorld(true);

  $("model-source").textContent = first.source === "gltf" ? "your Blender model (models/cabinet.glb)" : "the stand-in built in code";
  resize();
  // Open on the whole row, then walk up to the selected cabinet
  setView(WIDE.pos, WIDE.target, true);
  select(sel, { force: true, delay: reduceMotion ? 0 : 650 });
  $("loading").hidden = true;
  stage.classList.add("ready");
}

function cloneWithScreen(src: Cabinet): Cabinet {
  const group = src.group.clone(true);
  const screen = group.getObjectByName("Screen") as THREE.Mesh;
  return { group, screen, joystick: group.getObjectByName("Joystick") || null, buttons: ["ButtonA", "ButtonB", "Start"].map((n) => group.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o), source: "gltf", screenW: src.screenW, screenH: src.screenH };
}

// ---------- Selecting a cabinet ----------
function showLive(i: number, on: boolean): void {
  const s = slots[i], g = games[i];
  if (!s || s.live === on) return;
  s.live = on;
  s.crt.uniforms.tMap.value = on ? g.texture : s.cover;
  s.crt.uniforms.uBright.value = on ? g.brightness : 0.85;
}

let soundOn = true;
function select(i: number, opts: { force?: boolean; delay?: number } = {}): void {
  i = (i + games.length) % games.length;
  if (mode === "play" || (i === sel && !opts.force)) return;
  if (i !== sel) { game.sleep(); showLive(sel, false); }
  sel = i; game = games[i];
  for (const k of ["left", "right", "up", "down", "jump", "shoot", "bomb"] as GameKey[]) game.setKey(k, false);
  history.replaceState(null, "", "#" + game.id);

  $("pick-count").textContent = `${i + 1} / ${games.length}`;
  $("pick-title").textContent = game.marquee;
  $("pick-title").style.color = game.accent;
  $("pick-blurb").textContent = game.blurb;
  soundBtn.setAttribute("aria-pressed", String(soundOn));
  syncPad();

  const go = () => { if (sel === i && mode === "overview") { const v = browseView(i); setView(v.pos, v.target); limitOrbit(i); } };
  if (opts.delay) setTimeout(go, opts.delay); else go();

  const g = game;
  g.load().then(() => {
    g.sound = soundOn;
    if (games[sel] === g) { g.attract(); showLive(sel, true); }
  }).catch((err) => { console.error(err); if (games[sel] === g) $("pick-blurb").textContent = "This cartridge didn't load. Try reloading the page."; });
}

// ---------- Camera: whole row ↔ browsing a cabinet ↔ playing ----------
let mode: "overview" | "play" = "overview";
let flight: { start: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
const WIDE = { pos: new THREE.Vector3(0, 2.1, 5.6), target: new THREE.Vector3(0, 1.05, 0.2) };

function setView(pos: THREE.Vector3, target: THREE.Vector3, instant = false): void {
  if (instant || reduceMotion) {
    camera.position.copy(pos); controls.target.copy(target); controls.update(); flight = null; return;
  }
  flight = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: pos.clone(), toTarget: target.clone() };
}

/** Standing in front of cabinet i, slightly to one side so its neighbours are in view. */
function browseView(i: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const g = slots[i].cab.group;
  const back = camera.aspect < 0.8 ? 1.55 : 1;
  return {
    pos: g.localToWorld(new THREE.Vector3(0.5 * back, 1.62, 3.3 * back)),
    target: g.localToWorld(new THREE.Vector3(0, 1.12, -0.2))
  };
}
/** Let the visitor orbit about a radian either side of straight-on. */
function limitOrbit(i: number): void {
  const yaw = slots[i].cab.group.rotation.y;
  controls.minAzimuthAngle = yaw - 1.1;
  controls.maxAzimuthAngle = yaw + 1.1;
}

function playView(): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const { cab } = slots[sel];
  const s = cab.screen;
  const center = s.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion()));
  // Back off far enough that the whole screen fits, in portrait or landscape
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitH = (cab.screenH * 0.68) / Math.tan(half);
  const fitW = (cab.screenW * 0.6) / (Math.tan(half) * camera.aspect);
  const dist = Math.max(fitH, fitW, 0.55);
  return { pos: center.clone().addScaledVector(normal, dist), target: center };
}

function enterPlay(): void {
  if (!slots.length || mode === "play") return;
  mode = "play";
  document.body.classList.add("playing");
  controls.enabled = false;
  const v = playView();
  setView(v.pos, v.target);
  game.load().then(() => { if (mode === "play") game.enter(); }).catch(() => {});
  $("play").textContent = "Step back";
  $("hint").textContent = coarse ? game.touchHint : game.controlsHint;
  renderer.domElement.focus({ preventScroll: true });
}
function exitPlay(): void {
  if (mode !== "play") return;
  mode = "overview";
  document.body.classList.remove("playing");
  controls.enabled = true;
  game.leave();
  const v = browseView(sel);
  setView(v.pos, v.target);
  $("play").textContent = "Play";
  $("hint").textContent = browseHint();
  idleT = 0;
}
const browseHint = () => (coarse ? "Tap ◀ ▶ to browse · Tap the screen to play" : "◀ ▶ to browse · Drag to look around · Click the screen to play");

// ---------- Input ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(e: PointerEvent): { slot: number; uv: THREE.Vector2 | null } | null {
  if (!slots.length) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(slots.map((s) => s.cab.group), true)[0];
  if (!hit) return null;
  const slot = hit.object.userData.slot as number;
  return { slot, uv: hit.object === slots[slot].cab.screen && hit.uv ? hit.uv : null };
}
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointermove", (e) => {
  const p = pick(e);
  const over = p && (mode === "overview" || (p.slot === sel && p.uv));
  renderer.domElement.style.cursor = over ? "pointer" : mode === "play" ? "default" : "grab";
});
renderer.domElement.addEventListener("pointerup", (e) => {
  const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
  downAt = null;
  if (moved > 6) return;
  const p = pick(e);
  if (!p) return;
  if (mode === "overview") {
    if (p.slot !== sel) select(p.slot);   // another cabinet: walk over to it
    else if (p.uv) enterPlay();           // this cabinet's screen: step up and play
  } else if (p.slot === sel && p.uv) game.click(p.uv.x, p.uv.y); // clicks on the glass land on the game's own menu buttons
});

const KEYS: Record<string, GameKey> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  Space: "jump", KeyZ: "shoot", KeyX: "shoot", KeyJ: "shoot", KeyK: "shoot", KeyC: "bomb", KeyG: "bomb"
};
window.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLButtonElement && (e.code === "Space" || e.code === "Enter")) return;
  if (mode === "play") {
    if (KEYS[e.code]) { if (!e.repeat) game.setKey(KEYS[e.code], true); e.preventDefault(); }
    else if (e.code === "Enter") { game.press(); e.preventDefault(); }
    else if (e.code === "KeyM") toggleSound();
    else if (e.code === "Escape") exitPlay();
    return;
  }
  if (e.target instanceof HTMLButtonElement && e.code.startsWith("Arrow")) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA") { select(sel - 1); e.preventDefault(); }
  else if (e.code === "ArrowRight" || e.code === "KeyD") { select(sel + 1); e.preventDefault(); }
  else if (e.code === "Enter" && (document.activeElement === renderer.domElement || document.activeElement === document.body)) enterPlay();
});
window.addEventListener("keyup", (e) => { if (KEYS[e.code]) game.setKey(KEYS[e.code], false); });
window.addEventListener("blur", () => { for (const k of new Set(Object.values(KEYS))) game.setKey(k, false); });

// On-screen buttons for touch devices: held while the finger is down
for (const [id, key] of [["t-left", "left"], ["t-right", "right"], ["t-up", "up"], ["t-down", "down"], ["t-jump", "jump"], ["t-fire", "shoot"], ["t-bomb", "bomb"]] as const) {
  const b = $(id);
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); game.setKey(key, true); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => game.setKey(key, false));
}
$("t-start").addEventListener("click", () => game.press());
/** Grid games get a full d-pad; Riot Runner gets a grenade button. The A and B labels come from the game. */
function syncPad(): void {
  document.body.classList.toggle("pad-grid", game.pad.grid);
  document.body.classList.toggle("pad-bomb", game.pad.bomb);
  $("t-jump").textContent = game.pad.jump;
  $("t-fire").textContent = game.pad.shoot;
}

// ---------- Dock and picker ----------
$("play").addEventListener("click", () => (mode === "play" ? exitPlay() : enterPlay()));
$("prev").addEventListener("click", () => select(sel - 1));
$("next").addEventListener("click", () => select(sel + 1));
let crtTarget = 1;
$("crt").addEventListener("click", (e) => {
  crtTarget = crtTarget ? 0 : 1;
  (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(!!crtTarget));
});
const soundBtn = $("sound");
function toggleSound(): void {
  soundOn = !soundOn;
  game.sound = soundOn;
  soundBtn.setAttribute("aria-pressed", String(soundOn));
}
soundBtn.addEventListener("click", toggleSound);
$("bloom").addEventListener("click", (e) => {
  bloom.enabled = !bloom.enabled;
  (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(bloom.enabled));
});
$("info").addEventListener("click", () => {
  const a = $("about"); a.hidden = !a.hidden;
  $("info").setAttribute("aria-expanded", String(!a.hidden));
});
$("about-close").addEventListener("click", () => { $("about").hidden = true; $("info").setAttribute("aria-expanded", "false"); });

// ---------- Cabinet animation ----------
const pressT = [0, 0, 0];
const flashColor = new THREE.Color("#7fd8ff"), baseLight = new THREE.Color("#7fd8ff");
let flash = 0;
for (const g of games) {
  g.onButton = (i) => { if (g === game) pressT[i] = 1; };
  g.onFlash = (c) => { if (g === game) { flash = 1; flashColor.copy(c); } };
  g.onExit = () => { if (g === game) exitPlay(); };
  g.onSoundChange = (on) => { if (g === game) { soundOn = on; soundBtn.setAttribute("aria-pressed", String(on)); } };
}

// ---------- Resize ----------
function resize(): void {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / Math.max(1, h);
  WIDE.pos.set(0, 2.1, 5.6).multiplyScalar(camera.aspect < 0.8 ? 1.6 : 1);
  camera.updateProjectionMatrix();
  if (slots.length && !flight && mode === "play") { const v = playView(); setView(v.pos, v.target, true); }
}
new ResizeObserver(resize).observe(stage);

// ---------- Loop ----------
const timer = new THREE.Timer();
let idleT = 0, poweredAt = 0;
const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), keyGoal = new THREE.Vector3(), keyAim = new THREE.Vector3();
function frame(now: number): void {
  timer.update(now);
  const dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();

  if (flight) {
    const k = Math.min(1, (performance.now() - flight.start) / 1100), e = ease(k);
    camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    camera.lookAt(controls.target);
    if (k >= 1) { flight = null; if (mode === "overview") controls.update(); }
  } else if (mode === "overview") {
    controls.update();
  } else {
    camera.lookAt(controls.target);
  }

  // Only the selected cabinet runs its game; the others show their cover art
  game.update(dt);
  if (mode === "overview" && game.playing && (idleT += dt) > 20) game.attract(); // walk away mid-game and it drops back to the demo
  if (slots[sel]?.live) game.render(renderer);

  if (slots.length) {
    if (!poweredAt) poweredAt = performance.now();
    const crtNow = slots[0].crt.uniforms.uCrt.value + (crtTarget - slots[0].crt.uniforms.uCrt.value) * Math.min(1, dt * 8);
    slots.forEach((s, i) => {
      const u = s.crt.uniforms;
      u.uTime.value = t;
      u.uPower.value = THREE.MathUtils.clamp((performance.now() - poweredAt - i * 110) / 1400, 0, 1); // the row powers on left to right
      u.uCrt.value = crtNow;
    });

    const { cab } = slots[sel];
    if (cab.joystick) cab.joystick.rotation.y = game.stick * 0.42;
    cab.buttons.forEach((b, i) => {
      pressT[i] = Math.max(0, pressT[i] - dt * 6);
      const cap = b.getObjectByName("cap") || b;
      cap.position.z = 0.01 - 0.007 * Math.sin(pressT[i] * Math.PI);
    });

    // Screen light: sits just in front of the selected tube, flashes on hits, deaths and wins
    cab.screen.getWorldPosition(tmp);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.screen.getWorldQuaternion(q));
    room.screenLight.position.copy(tmp).addScaledVector(n, 0.35);
    flash = Math.max(0, flash - dt * 4);
    room.screenLight.color.copy(baseLight).lerp(flashColor, flash);
    room.screenLight.intensity = (0.55 + flash * 1.4) * Number(slots[sel].crt.uniforms.uPower.value);

    // The key spotlight glides over to the selected cabinet
    cab.group.localToWorld(keyGoal.set(1.2, 3.6, 2.2));
    cab.group.localToWorld(keyAim.set(0, 0.9, -0.3));
    const f = Math.min(1, dt * 3);
    room.key.position.lerp(keyGoal, f);
    room.key.target.position.lerp(keyAim, f);
  }

  // While playing, bloom eases off and the cabinet's neon trim dims: up close it would glow over the picture
  const ease4 = Math.min(1, dt * 4);
  bloom.strength += ((mode === "play" ? 0.2 : 0.55) - bloom.strength) * ease4;
  slots.forEach((s, i) => { for (const m of s.trim) m.emissiveIntensity += ((mode === "play" && i === sel ? 0.18 : 1.15) - m.emissiveIntensity) * ease4; });

  composer.render(dt);
  requestAnimationFrame(frame);
}

resize();
$("hint").textContent = browseHint();
init().catch((err) => {
  console.error(err);
  $("loading").textContent = "The arcade could not be built. Try reloading the page.";
});
requestAnimationFrame(frame);
