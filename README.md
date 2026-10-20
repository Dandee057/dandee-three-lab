# Three Lab

Small, finished Three.js pieces, each showing one part of building for the 3D web. Built with **Three.js r186**, **TypeScript** and **Vite**, with no framework.

**[Live demo →](https://dandee057.github.io/dandee-three-lab/)** · also at [dandeegames.com](https://dandeegames.com/)

| Experiment | What it shows |
| --- | --- |
| [Arcade cabinet](arcade/) | A playable game rendered to a texture, a GLSL CRT shader, HDR bloom, raycast input, and a Blender → glTF model pipeline |
| Delivery network *(next)* | GPU-animated instances and shader-drawn flow lines on a stylised map |

<!-- Add a screenshot or GIF, e.g. docs/arcade.gif:
![Arcade cabinet](docs/arcade.gif) -->

---

## Arcade cabinet

A brick-breaker called **BRICK RUSH** runs on a 3D arcade cabinet in a neon-lit arcade. Drag to look around, click the screen to step up and play, and press Esc to step back. When nobody is playing, the cabinet runs its own attract-mode demo, like a real arcade machine.

### How it works

**A scene inside a scene.** The game is its own `THREE.Scene` with an `OrthographicCamera` that works in monitor pixels. Every frame it is drawn into a 224 × 288 `WebGLRenderTarget`, the resolution of a 1980s vertical arcade monitor. Bricks and particles are `InstancedMesh`es, and the score panel and messages are canvas textures inside the game scene. ([`src/arcade/game.ts`](src/arcade/game.ts))

**CRT shader.** The cabinet's screen is a gently bulging plane with a GLSL `ShaderMaterial` that samples the render target. It applies, in order:

1. barrel curvature
2. a slight RGB convergence error
3. a four-tap phosphor glow
4. one scanline per game row
5. an aperture-grille mask
6. a vignette and flicker

The same shader shows static on the neighbouring cabinets. The **CRT** button fades the effect in and out, for a before/after comparison. ([`src/arcade/crt.ts`](src/arcade/crt.ts))

**HDR bloom.** The scene renders into a half-float buffer. The screen, the marquee and the neon trim are deliberately brighter than 1.0, so `UnrealBloomPass` with a high threshold picks up only those. `OutputPass` then applies Neutral tone mapping and the sRGB conversion. Neutral rather than ACES keeps the neon colours saturated.

**Raycast input.** The pointer is raycast against the curved screen, and the hit's UV coordinate drives the paddle. Dragging on the glass therefore works the same with a mouse or a finger. Phones also get on-screen arrows and a fire button.

**Blender → glTF.** On load the page checks for `public/models/cabinet.glb`. If it's there, a mesh named `Screen` receives the CRT material, and `Joystick` and the buttons animate with the game. If it isn't, a stand-in cabinet is built in code from an extruded side profile ([`src/arcade/cabinet.ts`](src/arcade/cabinet.ts)). See [`public/models/README.md`](public/models/README.md) for the export settings.

**Details:**
- Camera moves are time-based, so a slow frame doesn't stretch them.
- Reduced-motion settings skip the camera flights.
- The high score is kept in `localStorage`.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm run preview    # serves the build
```

### Publishing

- **GitHub Pages:** in the repository, go to *Settings → Pages* and set *Source* to **GitHub Actions**. Every push to `main` then builds and deploys through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
- **Your own site:** run `npm run build` and upload the contents of `dist/` to any folder, e.g. `/lab/`. Paths are relative (`base: "./"`), so it works in a sub-folder.

## Project structure

```
index.html                  lab index
arcade/index.html           arcade cabinet page
src/
  shared/base.css           colour tokens, type, buttons
  shared/canvas.ts          canvas textures, pixel font loading, neon text
  lab/                      lab index styles
  arcade/
    main.ts                 renderer, camera, post-processing, input, loop
    game.ts                 BRICK RUSH: its own scene and render target
    crt.ts                  CRT ShaderMaterial and curved screen geometry
    cabinet.ts              glTF loading with the stand-in cabinet as fallback
    room.ts                 carpet, wall, neon sign, lights, environment
    arcade.css              page overlay
public/models/              drop cabinet.glb here
```

## Licence

MIT. See [LICENSE](LICENSE).
