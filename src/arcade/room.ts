import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CanvasTex, PIXEL_FONT, neonText, pixelFontReady } from "../shared/canvas";

/** The arcade around the cabinet: patterned carpet, a back wall with a neon sign, and the lights. */
export interface Room {
  screenLight: THREE.PointLight;
}

function carpet(): CanvasTex {
  // The cosmic carpet every arcade had: dark ground, neon squiggles, stars and planets
  const t = new CanvasTex(512, 512);
  const { ctx } = t;
  ctx.fillStyle = "#0b0718"; ctx.fillRect(0, 0, 512, 512);
  const rnd = mulberry(7);
  const cols = ["#ff3fd8", "#33f0ff", "#ffb02e", "#7b5cff"];
  ctx.lineWidth = 5; ctx.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = cols[i % cols.length]; ctx.globalAlpha = 0.55;
    const x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) ctx.lineTo(x + Math.cos(a) * k * 14 + Math.sin(k * 1.7) * 9, y + Math.sin(a) * k * 14 + Math.cos(k * 1.7) * 9);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = cols[(i + 1) % cols.length]; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(rnd() * 512, rnd() * 512, 10 + rnd() * 16, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 0.8; ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 120; i++) ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
  t.texture.wrapS = t.texture.wrapT = THREE.RepeatWrapping;
  t.texture.repeat.set(5, 5);
  t.update();
  return t;
}

function sign(text: string): CanvasTex {
  const t = new CanvasTex(1024, 192);
  const draw = () => {
    const { ctx, canvas } = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "54px " + PIXEL_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    neonText(ctx, text, canvas.width / 2, canvas.height / 2, "#33f0ff", 16);
    t.update();
  };
  draw();
  pixelFontReady.then(draw);
  return t;
}

function mulberry(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildRoom(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Room {
  scene.background = new THREE.Color("#05030b");
  scene.fog = new THREE.Fog("#05030b", 4.5, 11);
  // A faint studio environment so glossy laminate and metal pick up soft reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.18;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: carpet().texture, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshStandardMaterial({ color: "#120b24", roughness: 0.9 }));
  wall.position.set(0, 2.5, -1.4);
  wall.receiveShadow = true;
  scene.add(wall);

  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: sign("THREE LAB").texture, transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  neon.position.set(0, 2.55, -1.38);
  scene.add(neon);

  scene.add(new THREE.HemisphereLight("#6b5bd6", "#120818", 0.35));
  const key = new THREE.SpotLight("#ffe6f5", 28, 9, 0.5, 0.6, 1.6);
  key.position.set(1.4, 3.6, 2.2);
  key.target.position.set(0, 0.9, -0.3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const magenta = new THREE.PointLight("#ff3fd8", 6, 6, 1.6);
  magenta.position.set(-2.4, 2.2, -0.6);
  const cyan = new THREE.PointLight("#33f0ff", 6, 6, 1.6);
  cyan.position.set(2.4, 2.2, -0.6);
  scene.add(magenta, cyan);

  // Light thrown by the picture tube onto the control panel and the player
  const screenLight = new THREE.PointLight("#7fd8ff", 0.6, 2.2, 2);
  scene.add(screenLight);
  return { screenLight };
}
