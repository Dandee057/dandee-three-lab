import {
  BoxGeometry, CanvasTexture, DirectionalLight as Directional, DoubleSide, EdgesGeometry, Fog, Group, HemisphereLight as Hemisphere,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PerspectiveCamera,
  PlaneGeometry, RepeatWrapping, RingGeometry, Scene, Vector3, WebGLRenderer, type ColorRepresentation
} from "three";

/**
 * A global `THREE` for the 3D cartridge (Neon Run), which was written against three.js r128.
 *
 * Rather than load a second copy of three.js, it gets the lab's own build. Two things changed since r128:
 * - Lights became physically based in r155, so hemisphere and directional intensities need × π to look the same.
 * - `sRGBEncoding` was removed (sRGB output is the default now), so it's kept as an inert constant.
 * Only the classes the cartridge uses are listed, so the shim doesn't defeat tree-shaking.
 */
class HemisphereLight extends Hemisphere {
  constructor(sky?: ColorRepresentation, ground?: ColorRepresentation, intensity = 1) { super(sky, ground, intensity * Math.PI); }
}
class DirectionalLight extends Directional {
  constructor(color?: ColorRepresentation, intensity = 1) { super(color, intensity * Math.PI); }
}

export function legacyThree(): Record<string, unknown> {
  return {
    BoxGeometry, CanvasTexture, DirectionalLight, DoubleSide, EdgesGeometry, Fog, Group, HemisphereLight, LineBasicMaterial,
    LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PerspectiveCamera, PlaneGeometry,
    RepeatWrapping, RingGeometry, Scene, Vector3, WebGLRenderer, sRGBEncoding: 3001
  };
}
