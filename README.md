# Three Lab

Small, finished Three.js pieces, each showing one part of building for the 3D web. Built with **Three.js r186**, **TypeScript** and **Vite**, with no framework.

**[Live demo →](https://dandee057.github.io/dandee-three-lab/)** · also at [dandeegames.com](https://dandeegames.com/)

| Experiment | What it shows |
| --- | --- |
| [Arcade](arcade/) | Eight playable games on a row of 3D cabinets: games rendered to textures, a GLSL CRT shader, HDR bloom, raycast input, lazy-loaded game code, and a Blender → glTF model pipeline |
| Delivery network *(next)* | GPU-animated instances and shader-drawn flow lines on a stylised map |

<!-- Add a screenshot or GIF, e.g. docs/arcade.gif:
![Arcade](docs/arcade.gif) -->

---

## Arcade

A neon-lit arcade with a row of eight cabinets, each running one of my games. Use ◀ ▶ (or the arrow keys, or click a cabinet) to walk along the row, click a screen to step up and play, and press Esc to step back. Each cabinet has its own URL, e.g. `arcade/#riot-runner`.

| Cabinet | Game |
| --- | --- |
| Neon Run | A 3D endless runner, its own Three.js scene rendered onto the tube |
| Hyrox Rush | A fitness race: eight runs and eight stations, each a tiny mini game |
| Stock Room | A crate-pushing puzzle, eight levels with solver-checked pars |
| Mini Knight | My Pygame Zero platformer, ported to TypeScript |
| Riot Runner | A run-and-gun mission with POWs, a mini tank and a boss |
| Surge Fighters | A 2D fighter with combos, specials and supers |
| Shelf Monsters | A turn-based monster battler with types and levelling |
| ScrapBots | Build a robot from parts and battle for more parts |

The controls for each game are shown under the cabinet while you play. Phones get an on-screen pad: a full d-pad for the menu-driven games, a grenade button for Riot Runner.

### How it works

**One interface, eight games.** Each cabinet talks to its game only through a small `CabinetGame` interface: a texture to show, keys in, and hooks out for flashing the screen light, pressing the cabinet's buttons and stepping back. ([`src/arcade/game.ts`](src/arcade/game.ts))

**Cartridges loaded on demand.** Seven of the games are the cartridges from [dandeegames.com](https://dandeegames.com/), unchanged: plain scripts that share one engine API (`update`, `drawScreen`, `hold`, `press`…). One adapter, `CartridgeGame`, turns that API into a `CabinetGame` by drawing into a 2D canvas that becomes a `CanvasTexture`. A cartridge's script is only fetched when you walk up to its cabinet, and only the selected cabinet runs its game. The other seven show cover art, so the frame cost stays the same however many cabinets there are. ([`src/arcade/cartridge.ts`](src/arcade/cartridge.ts))

**A 3D game inside a 3D game.** Neon Run renders its own Three.js scene off-screen every frame, and that picture becomes the texture on a tube in this scene. It was written against three.js r128, so instead of loading a second copy of three.js it gets a small shim of the lab's own build. The shim converts the old light units (lights became physically based in r155) and lists only the classes Neon Run uses, so tree-shaking still works. ([`src/arcade/legacy-three.ts`](src/arcade/legacy-three.ts))

**A Python game, ported.** Mini Knight is ported line by line from the Pygame Zero original: the same level, the same sprites and sounds, and the same frame-based physics run on a fixed 60 Hz step so it plays identically at any refresh rate. Sprites are textured planes in Pygame coordinates, with y pointing down, and collisions are the same rectangle tests. ([`src/arcade/mini-knight.ts`](src/arcade/mini-knight.ts))

**A scene inside a scene.** Mini Knight is its own `THREE.Scene` with an `OrthographicCamera`. Every frame it is drawn into an 800 × 600 `WebGLRenderTarget`: a 4:3 monitor picture with the 2:1 level in the middle and a score bar above it. Its cabinet gets a 4:3 tube, while the cartridges get 16:9 widescreen tubes, because each cabinet's screen is shaped from its game's aspect ratio.

**CRT shader.** The cabinet's screen is a gently bulging plane with a GLSL `ShaderMaterial` that samples the render target. It applies, in order:

1. barrel curvature
2. a slight RGB convergence error
3. a four-tap phosphor glow
4. one scanline per game row
5. an aperture-grille mask
6. a vignette and flicker

The cabinets that aren't selected show their cover art through the same shader. The **CRT** button fades the effect in and out, for a before/after comparison. ([`src/arcade/crt.ts`](src/arcade/crt.ts))

**HDR bloom.** The scene renders into a half-float buffer. The screen, the marquee and the neon trim are deliberately brighter than 1.0, so `UnrealBloomPass` with a high threshold picks up only those. `OutputPass` then applies Neutral tone mapping and the sRGB conversion. Neutral rather than ACES keeps the neon colours saturated. When you step up to play, bloom eases off and that cabinet's trim dims, so its glow doesn't wash over the picture.

**Raycast input.** Clicks are raycast against the curved screen, and the hit's UV coordinate becomes a game coordinate, so the game's own START, SOUND and EXIT buttons can be clicked on the glass.

**Blender → glTF.** On load the page checks for `public/models/cabinet.glb`. If it's there, a mesh named `Screen` receives the CRT material, and `Joystick` and the buttons animate with the game. If it isn't, a stand-in cabinet is built in code from an extruded side profile ([`src/arcade/cabinet.ts`](src/arcade/cabinet.ts)). See [`public/models/README.md`](public/models/README.md) for the export settings.

**Details:**
- The key spotlight glides over to whichever cabinet is selected, and the row powers on left to right.
- Camera moves are time-based, so a slow frame doesn't stretch them.
- Reduced-motion settings skip the camera flights.
- Sound starts on the first click, as browsers require.
- Best scores and progress are kept in `localStorage`.

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
arcade/index.html           arcade page
src/
  shared/base.css           colour tokens, type, buttons
  shared/canvas.ts          canvas textures, pixel font loading, neon text
  lab/                      lab index styles
  arcade/
    main.ts                 renderer, the row of cabinets, camera, post-processing, input, loop
    game.ts                 CabinetGame: what a cabinet needs from a game
    mini-knight.ts          Mini Knight: level, physics, sprites, menus, audio
    cartridge.ts            CartridgeGame: runs the website's cartridges on a cabinet
    legacy-three.ts         the global THREE shim for the r128-era 3D cartridge
    crt.ts                  CRT ShaderMaterial and curved screen geometry
    cabinet.ts              glTF loading with the stand-in cabinet as fallback
    room.ts                 carpet, wall, neon sign, lights, environment
    arcade.css              page overlay
public/models/              drop cabinet.glb here
public/games/mini-knight/   sprites, sounds and music (see CREDITS.md)
public/games/<cartridge>/   each cartridge's script and cover image
```

## Licence

The code is MIT. See [LICENSE](LICENSE).

The cartridge games in `public/games/` are my own code and art, also MIT. The Mini Knight art, sound and music are third-party assets under their own licences, not MIT. See [`public/games/mini-knight/CREDITS.md`](public/games/mini-knight/CREDITS.md).
