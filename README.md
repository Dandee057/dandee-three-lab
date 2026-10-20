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

**Mini Knight**, a platformer I first wrote in Python with Pygame Zero, runs on a 3D arcade cabinet in a neon-lit arcade. Drag to look around, click the screen to step up and play, and press Esc to step back.

Controls: arrow keys or A/D to move, Space to jump, Z or X to shoot. Up/down and Enter work the menu, or click its buttons on the glass. Phones get on-screen arrows plus JUMP and FIRE buttons.

### How it works

**A Python game, ported.** Mini Knight is ported line by line from the Pygame Zero original: the same level, the same sprites and sounds, and the same frame-based physics run on a fixed 60 Hz step so it plays identically at any refresh rate. Sprites are textured planes in Pygame coordinates, with y pointing down, and collisions are the same rectangle tests. ([`src/arcade/mini-knight.ts`](src/arcade/mini-knight.ts))

**A scene inside a scene.** The game is its own `THREE.Scene` with an `OrthographicCamera`. Every frame it is drawn into an 800 × 600 `WebGLRenderTarget`: a 4:3 monitor picture with the 2:1 level in the middle and a score bar above it. The cabinet only talks to the game through a small `CabinetGame` interface, so another game can be dropped in. ([`src/arcade/game.ts`](src/arcade/game.ts))

**CRT shader.** The cabinet's screen is a gently bulging plane with a GLSL `ShaderMaterial` that samples the render target. It applies, in order:

1. barrel curvature
2. a slight RGB convergence error
3. a four-tap phosphor glow
4. one scanline per game row
5. an aperture-grille mask
6. a vignette and flicker

The same shader shows static on the neighbouring cabinets. The **CRT** button fades the effect in and out, for a before/after comparison. ([`src/arcade/crt.ts`](src/arcade/crt.ts))

**HDR bloom.** The scene renders into a half-float buffer. The screen, the marquee and the neon trim are deliberately brighter than 1.0, so `UnrealBloomPass` with a high threshold picks up only those. `OutputPass` then applies Neutral tone mapping and the sRGB conversion. Neutral rather than ACES keeps the neon colours saturated.

**Raycast input.** Clicks are raycast against the curved screen, and the hit's UV coordinate becomes a game coordinate, so the game's own START, SOUND and EXIT buttons can be clicked on the glass.

**Blender → glTF.** On load the page checks for `public/models/cabinet.glb`. If it's there, a mesh named `Screen` receives the CRT material, and `Joystick` and the buttons animate with the game. If it isn't, a stand-in cabinet is built in code from an extruded side profile ([`src/arcade/cabinet.ts`](src/arcade/cabinet.ts)). See [`public/models/README.md`](public/models/README.md) for the export settings.

**Details:**
- Camera moves are time-based, so a slow frame doesn't stretch them.
- Reduced-motion settings skip the camera flights.
- Sound starts on the first click, as browsers require.
- The best clear time is kept in `localStorage`.

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
    game.ts                 CabinetGame: what the cabinet needs from a game
    mini-knight.ts          Mini Knight: level, physics, sprites, menus, audio
    crt.ts                  CRT ShaderMaterial and curved screen geometry
    cabinet.ts              glTF loading with the stand-in cabinet as fallback
    room.ts                 carpet, wall, neon sign, lights, environment
    arcade.css              page overlay
public/models/              drop cabinet.glb here
public/games/mini-knight/   sprites, sounds and music (see CREDITS.md)
```

## Licence

The code is MIT. See [LICENSE](LICENSE).

The Mini Knight art, sound and music are third-party assets under their own licences, not MIT. See [`public/games/mini-knight/CREDITS.md`](public/games/mini-knight/CREDITS.md).
