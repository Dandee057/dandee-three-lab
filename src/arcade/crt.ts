import * as THREE from "three";

/**
 * CRT monitor material. It samples the game's render target and adds what an arcade tube does to a picture:
 * barrel curvature, a slight RGB convergence error, a phosphor glow, horizontal scanlines (one per game row),
 * an aperture-grille mask, a vignette and a faint flicker. With `uNoise` set it shows an untuned channel instead,
 * which the neighbouring cabinets use.
 */
export interface CrtOptions {
  map: THREE.Texture | null;
  resolution: THREE.Vector2; // the game's logical resolution, e.g. 224 × 288
  noise?: boolean;
  brightness?: number;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tMap;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uCrt;       // 0 = clean picture, 1 = full CRT treatment
  uniform float uNoise;     // 1 = untuned static
  uniform float uBright;
  uniform float uPower;     // 0..1 power-on sweep
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec2 barrel(vec2 uv, float k) {
    uv = uv * 2.0 - 1.0;
    vec2 off = abs(uv.yx) * vec2(0.18, 0.12) * k;
    uv += uv * off * off;
    return uv * 0.5 + 0.5;
  }

  vec3 sampleGame(vec2 uv) {
    // Small convergence error: red and blue land a fraction of a pixel either side of green
    float ca = (0.6 / uRes.x) * uCrt;
    vec3 c;
    c.r = texture2D(tMap, uv + vec2(ca, 0.0)).r;
    c.g = texture2D(tMap, uv).g;
    c.b = texture2D(tMap, uv - vec2(ca, 0.0)).b;
    // Phosphor glow: a cheap 4-tap blur added on top
    vec2 px = 1.0 / uRes;
    vec3 glow = texture2D(tMap, uv + vec2(px.x, 0.0)).rgb + texture2D(tMap, uv - vec2(px.x, 0.0)).rgb
              + texture2D(tMap, uv + vec2(0.0, px.y)).rgb + texture2D(tMap, uv - vec2(0.0, px.y)).rgb;
    return c + glow * 0.12 * uCrt;
  }

  void main() {
    vec2 uv = mix(vUv, barrel(vUv, 1.0), uCrt);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    vec3 col;
    if (uNoise > 0.5) {
      float n = hash(floor(uv * vec2(160.0, 200.0)) + floor(uTime * 24.0));
      float roll = smoothstep(0.0, 0.08, abs(fract(uv.y - uTime * 0.12) - 0.5));
      col = vec3(n * 0.55 * (0.6 + 0.4 * roll));
    } else {
      col = sampleGame(uv);
    }

    // Scanlines: darken between the game's rows
    float line = sin(uv.y * uRes.y * 3.14159265);
    col *= mix(1.0, 0.62 + 0.38 * line * line, uCrt);
    // Aperture grille: alternating R/G/B stripes across each game pixel
    float m = mod(floor(uv.x * uRes.x * 3.0), 3.0);
    vec3 mask = m < 0.5 ? vec3(1.0, 0.78, 0.78) : m < 1.5 ? vec3(0.78, 1.0, 0.78) : vec3(0.78, 0.78, 1.0);
    col *= mix(vec3(1.0), mask * 1.18, uCrt * 0.8);
    // Vignette and flicker
    vec2 v = uv * (1.0 - uv.yx);
    col *= mix(1.0, pow(v.x * v.y * 18.0, 0.22), uCrt);
    col *= 1.0 - 0.025 * uCrt * sin(uTime * 113.0);
    // Power-on: the picture opens from a bright line in the middle
    float open = smoothstep(0.0, 1.0, uPower);
    float band = step(abs(uv.y - 0.5), open * 0.5 + 0.002);
    col = col * band + vec3(1.2) * (1.0 - open) * band * step(abs(uv.y - 0.5), 0.004 + open * 0.5);

    gl_FragColor = vec4(col * uBright, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createCrtMaterial(opts: CrtOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: opts.map },
      uRes: { value: opts.resolution.clone() },
      uTime: { value: 0 },
      uCrt: { value: 1 },
      uNoise: { value: opts.noise ? 1 : 0 },
      uBright: { value: opts.brightness ?? 1.6 },
      uPower: { value: 0 }
    },
    vertexShader,
    fragmentShader,
    toneMapped: false
  });
}

/** A gently bulging glass panel, like the face of a tube. UVs run 0..1 across the glass. */
export function createScreenGeometry(width: number, height: number, bulge = 0.012): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(width, height, 24, 30);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (width / 2), y = pos.getY(i) / (height / 2);
    pos.setZ(i, bulge * (1 - x * x) * (1 - y * y));
  }
  g.computeVertexNormals();
  return g;
}
