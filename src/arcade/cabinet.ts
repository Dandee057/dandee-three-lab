import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CanvasTex, PIXEL_FONT, neonText, pixelFontReady } from "../shared/canvas";
import { createScreenGeometry } from "./crt";

/**
 * The cabinet. If `public/models/cabinet.glb` exists (exported from Blender) it is used; otherwise a stand-in
 * is built from code. Either way the rest of the app gets the same handles: the screen mesh (which receives the
 * CRT material) and, when present, the joystick and buttons so they can move with the player's input.
 *
 * Units are metres, the origin is on the floor at the centre of the cabinet, and the front faces +Z.
 */
export interface Cabinet {
  group: THREE.Group;
  screen: THREE.Mesh;
  joystick: THREE.Object3D | null;
  buttons: THREE.Object3D[];
  source: "gltf" | "stand-in";
  /** Size of the glass in metres, so the camera can frame it. */
  screenW: number;
  screenH: number;
}

/** The biggest screen of the given width ÷ height that fits the bezel opening (about 0.6 × 0.6 m). */
export function screenSize(aspect: number): { w: number; h: number } {
  const w = Math.min(0.6, 0.6 * aspect);
  return { w, h: w / aspect };
}

/** Try the Blender model first; fall back to the stand-in. */
export async function loadCabinet(url: string, marquee: string, aspect: number): Promise<Cabinet> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    const type = head.headers.get("content-type") || "";
    if (head.ok && !type.includes("text/html")) {
      const gltf = await new GLTFLoader().loadAsync(url);
      const group = new THREE.Group();
      group.add(gltf.scene);
      const find = (name: string) => gltf.scene.getObjectByName(name) || null;
      const screen = find("Screen");
      if (screen && (screen as THREE.Mesh).isMesh) {
        gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const box = new THREE.Box3().setFromObject(screen).getSize(new THREE.Vector3());
        return { group, screen: screen as THREE.Mesh, joystick: find("Joystick"), buttons: ["ButtonA", "ButtonB", "Start"].map(find).filter((o): o is THREE.Object3D => !!o), source: "gltf", screenW: box.x, screenH: Math.hypot(box.y, box.z) };
      }
      console.warn("cabinet.glb has no mesh named \"Screen\"; using the stand-in cabinet.");
    }
  } catch {
    /* no model, or it failed to load: use the stand-in */
  }
  return buildStandIn(marquee, aspect);
}

// ---------------------------------------------------------------------------------------------------------
// Stand-in cabinet

// Side profile, as (depth from the front, height). The marquee overhangs at the top, the screen leans back,
// the control panel juts out at waist height, and the kick plate is recessed at the floor.
const PROFILE: [number, number][] = [
  [0.05, 0.0], [0.74, 0.0], [0.74, 1.84], [0.0, 1.84], [0.0, 1.62], [0.27, 1.62],
  [0.1, 0.96], [-0.14, 0.88], [-0.14, 0.82], [0.03, 0.78], [0.03, 0.08], [0.05, 0.06]
];
const WIDTH = 0.72, SIDE = 0.022;
const INNER = WIDTH - 2 * SIDE;
const at = (i: number) => PROFILE[i];

function sideArt(): CanvasTex {
  const t = new CanvasTex(512, 1024);
  const { ctx } = t;
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, "#1b0f38"); g.addColorStop(1, "#0b0718");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 1024);
  // Diagonal speed stripes, the classic side-art move
  const stripes = ["#ff3fd8", "#ffb02e", "#33f0ff"];
  stripes.forEach((c, k) => {
    ctx.save(); ctx.translate(256, 620 + k * 46); ctx.rotate(-0.42);
    ctx.fillStyle = c; ctx.globalAlpha = 0.9; ctx.fillRect(-600, -12, 1200, 24); ctx.restore();
  });
  ctx.globalAlpha = 0.18; ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 70; i++) ctx.fillRect(Math.random() * 512, Math.random() * 520, 2, 2);
  t.update();
  return t;
}

function marqueeArt(text: string): CanvasTex {
  const t = new CanvasTex(1024, 320);
  const draw = () => {
    const { ctx, canvas } = t;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#220a3d"); g.addColorStop(1, "#0d0620");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#33f0ff"; ctx.lineWidth = 6; ctx.globalAlpha = 0.6; ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36); ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "64px " + PIXEL_FONT;
    neonText(ctx, text, canvas.width / 2, canvas.height / 2 - 18, "#ff3fd8", 18);
    ctx.font = "20px " + PIXEL_FONT; ctx.fillStyle = "#ffb02e";
    ctx.fillText("1 OR 2 PLAYERS", canvas.width / 2, canvas.height - 62);
    t.update();
  };
  draw();
  pixelFontReady.then(draw);
  return t;
}

function bezelArt(): CanvasTex {
  const t = new CanvasTex(512, 640);
  const { ctx } = t;
  ctx.fillStyle = "#06040b"; ctx.fillRect(0, 0, 512, 640);
  ctx.strokeStyle = "#5b3fd1"; ctx.lineWidth = 4; ctx.strokeRect(22, 22, 468, 596);
  ctx.strokeStyle = "#2a1b66"; ctx.lineWidth = 2; ctx.strokeRect(34, 34, 444, 572);
  ctx.font = "12px " + PIXEL_FONT; ctx.fillStyle = "#6b5bb0"; ctx.textAlign = "center";
  pixelFontReady.then(() => { ctx.fillText("INSERT COIN", 256, 626); t.update(); });
  t.update();
  return t;
}

/**
 * A flat panel spanning the cabinet's inner width between two profile points. Its local +Y runs up the
 * panel and its +Z face (box face 4) points out of the cabinet, so that face carries any artwork.
 * `inset` pushes the panel back into the cabinet.
 */
function panelBetween(a: [number, number], b: [number, number], mat: THREE.Material | THREE.Material[], inset = 0, width = INNER): THREE.Mesh {
  const [lo, hi] = a[1] <= b[1] ? [a, b] : [b, a];
  const uy = hi[1] - lo[1], uz = -(hi[0] - lo[0]);
  const len = Math.hypot(uy, uz);
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.018), mat);
  m.position.set(0, (a[1] + b[1]) / 2, -(a[0] + b[0]) / 2);
  m.rotation.x = Math.atan2(uz, uy);
  m.translateZ(-inset);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildStandIn(marquee: string, aspect: number): Cabinet {
  const group = new THREE.Group();
  group.name = "Cabinet (stand-in)";

  const laminate = new THREE.MeshStandardMaterial({ color: "#16102c", roughness: 0.35, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: "#09070f", roughness: 0.55 });
  const trim = new THREE.MeshStandardMaterial({ color: "#ff3fd8", emissive: "#ff3fd8", emissiveIntensity: 1.15, roughness: 0.4 });
  const lip = new THREE.MeshStandardMaterial({ color: "#3a1446", emissive: "#ff3fd8", emissiveIntensity: 0.35, roughness: 0.4 });
  const art = sideArt();
  art.texture.wrapS = art.texture.wrapT = THREE.ClampToEdgeWrapping;
  art.texture.repeat.set(1 / 0.88, 1 / 1.84);
  art.texture.offset.set(0.14 / 0.88, 0);
  const sideMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.45 });

  // Side panels: the profile extruded through the panel thickness
  const shape = new THREE.Shape(PROFILE.map(([d, y]) => new THREE.Vector2(d, y)));
  const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: SIDE, bevelEnabled: false });
  for (const sgn of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, [sideMat, laminate]);
    side.rotation.y = Math.PI / 2;
    side.position.x = sgn < 0 ? -WIDTH / 2 : WIDTH / 2 - SIDE;
    side.castShadow = true; side.receiveShadow = true;
    group.add(side);
    // Neon T-moulding along the front edges of each side panel
    for (let i = 3; i < PROFILE.length - 1; i++) {
      const strip = panelBetween(at(i), at(i + 1), trim, -0.006, 0.006);
      strip.position.x = sgn * (WIDTH / 2 - SIDE / 2);
      strip.scale.z = 0.5;
      group.add(strip);
    }
  }

  // Body panels between the sides
  group.add(panelBetween(at(1), at(2), laminate, 0.009));                  // back
  group.add(panelBetween(at(2), at(3), laminate, -0.009));                 // top
  const marqueeTex = marqueeArt(marquee);
  const marqueeMat = new THREE.MeshStandardMaterial({ map: marqueeTex.texture, emissive: "#ffffff", emissiveMap: marqueeTex.texture, emissiveIntensity: 1.1, roughness: 0.3 });
  const marqueePanel = panelBetween(at(3), at(4), [black, black, black, black, marqueeMat, black], 0.012);
  group.add(marqueePanel);
  group.add(panelBetween(at(4), at(5), black, 0.01));                      // underside of the marquee
  const bezel = bezelArt();
  const bezelMat = new THREE.MeshStandardMaterial({ map: bezel.texture, roughness: 0.15, metalness: 0.2 });
  const bezelPanel = panelBetween(at(5), at(6), [black, black, black, black, bezelMat, black], 0.02);
  group.add(bezelPanel);
  group.add(panelBetween(at(9), at(10), laminate, 0.01));                  // front
  group.add(panelBetween(at(10), at(11), black, 0.01));                    // kick plate
  group.add(panelBetween(at(0), at(1), black, 0.01));                      // base

  // The screen sits in the bezel, slightly in front of it
  const { w: screenW, h: screenH } = screenSize(aspect);
  const screen = new THREE.Mesh(createScreenGeometry(screenW, screenH), new THREE.MeshBasicMaterial({ color: "#000000" }));
  screen.name = "Screen";
  screen.position.copy(bezelPanel.position);
  screen.rotation.copy(bezelPanel.rotation);
  screen.translateZ(0.012);
  group.add(screen);

  // Control panel: a slab following the profile, with the joystick and buttons on its surface
  const cpA = at(6), cpB = at(7);
  const cpMat = new THREE.MeshStandardMaterial({ color: "#1d1440", roughness: 0.4, metalness: 0.1 });
  const cp = panelBetween(cpA, cpB, cpMat, 0, INNER);
  cp.scale.z = 2.2;
  group.add(cp);
  group.add(panelBetween(cpB, at(8), lip, 0, INNER));                      // softly lit front edge of the control panel
  group.add(panelBetween(at(8), at(9), black, 0));
  const deck = new THREE.Group();
  deck.position.copy(cp.position); deck.rotation.copy(cp.rotation);
  deck.translateZ(0.02);
  group.add(deck);

  const joystick = new THREE.Group();
  joystick.position.set(-0.16, 0.0, 0);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 32), black);
  plate.rotation.x = Math.PI / 2;
  joystick.add(plate);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 12), new THREE.MeshStandardMaterial({ color: "#c9c9d6", metalness: 0.9, roughness: 0.25 }));
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.04;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), new THREE.MeshStandardMaterial({ color: "#ff2a5a", roughness: 0.2, metalness: 0.05 }));
  ball.position.z = 0.08;
  const stick = new THREE.Group();
  stick.name = "Joystick";
  stick.add(shaft, ball);
  joystick.add(stick);
  deck.add(joystick);

  const buttons: THREE.Object3D[] = [];
  const btn = (x: number, y: number, color: string, r = 0.022) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.008, 28), black);
    ring.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.016, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.25 }));
    cap.rotation.x = Math.PI / 2; cap.position.z = 0.01;
    cap.name = "cap";
    g.add(ring, cap);
    deck.add(g);
    return g;
  };
  buttons.push(btn(0.06, 0.02, "#33f0ff"), btn(0.13, 0.04, "#ff3fd8"));
  buttons.push(btn(0.24, 0.1, "#f2f2ff", 0.012));
  buttons[0].name = "ButtonA"; buttons[1].name = "ButtonB"; buttons[2].name = "Start";

  // Coin door with two glowing coin slots
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.012), new THREE.MeshStandardMaterial({ color: "#2a2a33", metalness: 0.75, roughness: 0.35 }));
  door.position.set(0, 0.5, -0.03 + 0.012);
  door.castShadow = true;
  group.add(door);
  for (const x of [-0.06, 0.06]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: "#ff3030", emissive: "#ff2020", emissiveIntensity: 2.2 }));
    slot.position.set(x, 0.56, -0.03 + 0.02);
    group.add(slot);
  }

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, screen, joystick: stick, buttons, source: "stand-in", screenW, screenH };
}
