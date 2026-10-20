import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ArcadeGame, GAME_W, GAME_H } from "./game";
import { createCrtMaterial } from "./crt";
import { buildStandIn, loadCabinet, SCREEN_H, SCREEN_W, type Cabinet } from "./cabinet";
import { buildRoom } from "./room";
import "../shared/base.css";
import "./arcade.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- Renderer, scene, camera ----------
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
// Neutral tone mapping keeps the neon saturated (ACES washes bright colours towards white)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute("aria-label", "3D arcade cabinet. Drag to look around; click the screen to play.");
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
const room = buildRoom(scene, renderer);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.1;
controls.maxDistance = 5.5;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.5;
controls.minAzimuthAngle = -1.2;
controls.maxAzimuthAngle = 1.2;

// ---------- Post-processing: HDR scene → bloom → tone mapping and sRGB ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.3, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- The game and its screen ----------
const game = new ArcadeGame();
const crt = createCrtMaterial({ map: game.target.texture, resolution: new THREE.Vector2(GAME_W, GAME_H), brightness: 1.2 });
const statics: THREE.ShaderMaterial[] = [];

let cab: Cabinet | null = null;
const OVERVIEW = { pos: new THREE.Vector3(0.95, 1.55, 2.55), target: new THREE.Vector3(0, 1.08, -0.25) };

async function init(): Promise<void> {
  cab = await loadCabinet(import.meta.env.BASE_URL + "models/cabinet.glb", "DANDEE");
  cab.screen.material = crt;
  scene.add(cab.group);

  // Two neighbours showing an untuned channel, so the main cabinet reads as part of a row
  for (const sgn of [-1, 1]) {
    const n = cab.source === "gltf" ? cloneWithScreen(cab) : buildStandIn("COMING SOON");
    const mat = createCrtMaterial({ map: null, resolution: new THREE.Vector2(GAME_W, GAME_H), noise: true, brightness: 0.7 });
    n.screen.material = mat;
    statics.push(mat);
    n.group.position.set(sgn * 1.02, 0, -0.18);
    n.group.rotation.y = -sgn * 0.14;
    scene.add(n.group);
  }

  $("model-source").textContent = cab.source === "gltf" ? "your Blender model (models/cabinet.glb)" : "the stand-in built in code";
  resize();
  setView(OVERVIEW.pos, OVERVIEW.target, true);
  $("loading").hidden = true;
  stage.classList.add("ready");
}

function cloneWithScreen(src: Cabinet): Cabinet {
  const group = src.group.clone(true);
  const screen = group.getObjectByName("Screen") as THREE.Mesh;
  return { group, screen, joystick: null, buttons: [], source: "gltf" };
}

// ---------- Camera moves: overview ↔ playing ----------
let mode: "overview" | "play" = "overview";
let flight: { start: number; t: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;

function setView(pos: THREE.Vector3, target: THREE.Vector3, instant = false): void {
  if (instant || reduceMotion) {
    camera.position.copy(pos); controls.target.copy(target); controls.update(); flight = null; return;
  }
  flight = { start: performance.now(), t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: pos.clone(), toTarget: target.clone() };
}

function playView(): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const s = cab!.screen;
  const center = s.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion()));
  // Back off far enough that the whole screen fits, in portrait or landscape
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitH = (SCREEN_H * 0.62) / Math.tan(half);
  const fitW = (SCREEN_W * 0.62) / (Math.tan(half) * camera.aspect);
  const dist = Math.max(fitH, fitW, 0.55);
  return { pos: center.clone().addScaledVector(normal, dist), target: center };
}

function enterPlay(): void {
  if (!cab || mode === "play") return;
  mode = "play";
  document.body.classList.add("playing");
  controls.enabled = false;
  const v = playView();
  setView(v.pos, v.target);
  game.press();
  $("play").textContent = "Step back";
  $("hint").textContent = matchMedia("(pointer: coarse)").matches
    ? "Drag on the screen to move · Tap to launch"
    : "← → or A D to move · Space to launch · Esc to step back";
  renderer.domElement.focus({ preventScroll: true });
}
function exitPlay(): void {
  if (mode !== "play") return;
  mode = "overview";
  document.body.classList.remove("playing");
  controls.enabled = true;
  game.setPointer(null);
  setView(OVERVIEW.pos, OVERVIEW.target);
  $("play").textContent = "Play";
  $("hint").textContent = "Drag to look around · Click the screen to play";
  idleT = 0;
}

// ---------- Input ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function screenUv(e: PointerEvent): THREE.Vector2 | null {
  if (!cab) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(cab.screen, false)[0];
  return hit && hit.uv ? hit.uv : null;
}
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (mode === "play") { const uv = screenUv(e); if (uv) game.setPointer(uv.x); }
});
renderer.domElement.addEventListener("pointermove", (e) => {
  const uv = screenUv(e);
  renderer.domElement.style.cursor = uv ? "pointer" : mode === "play" ? "default" : "grab";
  if (mode === "play" && uv && (e.pointerType === "mouse" || e.buttons)) game.setPointer(uv.x);
});
renderer.domElement.addEventListener("pointerup", (e) => {
  const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
  downAt = null;
  if (moved > 6) return;
  const uv = screenUv(e);
  if (mode === "overview") { if (uv) enterPlay(); }
  else { game.press(); pressButton(0); }
});

const keyDir: Record<string, "left" | "right"> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLButtonElement && (e.code === "Space" || e.code === "Enter")) return;
  if (mode === "play") {
    if (keyDir[e.code]) { game.setKey(keyDir[e.code], true); e.preventDefault(); }
    else if (e.code === "Space" || e.code === "Enter") { game.press(); pressButton(e.code === "Enter" ? 2 : 0); e.preventDefault(); }
    else if (e.code === "Escape") exitPlay();
  } else if (e.code === "Enter" && document.activeElement === renderer.domElement) enterPlay();
});
window.addEventListener("keyup", (e) => { if (keyDir[e.code]) game.setKey(keyDir[e.code], false); });

// On-screen buttons for touch devices
for (const [id, dir] of [["t-left", "left"], ["t-right", "right"]] as const) {
  const b = $(id);
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); game.setKey(dir, true); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => game.setKey(dir, false));
}
$("t-fire").addEventListener("click", () => { game.press(); pressButton(0); });

// ---------- Dock ----------
$("play").addEventListener("click", () => (mode === "play" ? exitPlay() : enterPlay()));
let crtTarget = 1;
$("crt").addEventListener("click", (e) => {
  crtTarget = crtTarget ? 0 : 1;
  (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(!!crtTarget));
});
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
function pressButton(i: number): void { pressT[i] = 1; }
const flashColor = new THREE.Color("#7fd8ff"), baseLight = new THREE.Color("#7fd8ff");
let flash = 0;
game.onHit = (c) => { flash = 1; flashColor.copy(c); };

// ---------- Resize ----------
function resize(): void {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / Math.max(1, h);
  // Narrow screens: step back so the whole cabinet stays in frame
  OVERVIEW.pos.set(0.95, 1.55, 2.55).multiplyScalar(camera.aspect < 0.8 ? 1.5 : 1);
  camera.updateProjectionMatrix();
  if (mode === "play" && cab && !flight) { const v = playView(); setView(v.pos, v.target, true); }
}
new ResizeObserver(resize).observe(stage);

// ---------- Loop ----------
const clock = new THREE.Clock();
let power = 0, idleT = 0, poweredAt = 0;
const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (flight) {
    flight.t = Math.min(1, (performance.now() - flight.start) / 1100);
    const e = ease(flight.t);
    camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    camera.lookAt(controls.target);
    if (flight.t >= 1) flight = null;
  } else if (mode === "overview") {
    controls.update();
  } else {
    camera.lookAt(controls.target);
  }

  game.update(dt);
  // Walk away mid-game and it drops back to the demo after a while
  if (mode === "overview" && game.playing && (idleT += dt) > 20) game.attract();
  game.render(renderer);

  if (cab) {
    if (!poweredAt) poweredAt = performance.now();
    power = Math.min(1, (performance.now() - poweredAt) / 1400);
    crt.uniforms.uTime.value = t;
    crt.uniforms.uPower.value = power;
    crt.uniforms.uCrt.value += (crtTarget - crt.uniforms.uCrt.value) * Math.min(1, dt * 8);
    for (const m of statics) { m.uniforms.uTime.value = t; m.uniforms.uPower.value = power; m.uniforms.uCrt.value = crt.uniforms.uCrt.value; }

    if (cab.joystick) cab.joystick.rotation.y = game.stick * 0.42;
    cab.buttons.forEach((b, i) => {
      pressT[i] = Math.max(0, pressT[i] - dt * 6);
      const cap = b.getObjectByName("cap") || b;
      cap.position.z = 0.01 - 0.007 * Math.sin(pressT[i] * Math.PI);
    });

    // Screen light: sits just in front of the tube, flashes the colour of each brick hit
    cab.screen.getWorldPosition(tmp);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.screen.getWorldQuaternion(q));
    room.screenLight.position.copy(tmp).addScaledVector(n, 0.35);
    flash = Math.max(0, flash - dt * 4);
    room.screenLight.color.copy(baseLight).lerp(flashColor, flash);
    room.screenLight.intensity = (0.55 + flash * 1.4) * power;
  }

  composer.render(dt);
  requestAnimationFrame(frame);
}

resize();
init().catch((err) => {
  console.error(err);
  $("loading").textContent = "The cabinet could not be built. Try reloading the page.";
});
requestAnimationFrame(frame);
