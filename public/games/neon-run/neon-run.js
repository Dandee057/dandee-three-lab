/* =========================================================================
   NEON RUN: a tiny 3D endless runner that plays on the console screens.

   It renders real-time Three.js into its own off-screen WebGL canvas at the
   console screen's exact resolution (160×144 Gameboy, 320×180 Switch,
   400×240 3DS top screen) and that frame is copied onto the console's
   screen, so the Gameboy's 4-shade filter applies to a live 3D scene.

   Same engine API as Mini Knight (see gba.js "Playable cartridges"):
     NeonRun.create({ onExit }) → { state, update(dt), drawScreen(g, W, H),
       press("start"|"sound"), hold(k, down), click(), toMenu(), pause(p), stop(), … }

   Controls: Left / Right switch lanes · Space jump · X pulse (smashes the
   next block in your lane, costs a charge; 5 coins = 1 charge).
   ========================================================================= */
(function () {
  "use strict";

  const LANES = [-2.2, 0, 2.2];
  const SPAWN_Z = -140;
  const PAL = { cyan: "#6ee7ff", pink: "#ff5fa2", purple: "#a78bfa", amber: "#ffc857", ink: "#07131a" };
  const FONT = '"Press Start 2P", ui-monospace, monospace';

  function create(opts) {
    opts = opts || {};
    const T = window.THREE;
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 },
      state: "menu", soundOn: true,
      hints: {
        menu: "ENTER: START   ARROWS: LANES   SPACE: JUMP", menuShort: "A: START",
        play: "ARROWS: LANES   SPACE: JUMP   X: PULSE", playShort: "SPC:JUMP X:PULSE",
        over: "ENTER / A: RUN AGAIN", overShort: "A: RETRY"
      },
      padLabels: { left: "◀", right: "▶", jump: "JUMP", shoot: "PULSE" }
    };
    if (!T) { api.drawScreen = (g, W, H) => { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); }; ["update", "press", "hold", "click", "release", "toMenu", "pause", "stop", "draw"].forEach((k) => (api[k] = () => {})); return api; }

    // ---------------------------------------------------------------------
    // Renderer (lazy: created on the first frame we're asked to draw)
    // ---------------------------------------------------------------------
    let renderer = null, glFailed = false, rW = 0, rH = 0;
    const canvas = document.createElement("canvas");
    function ensureRenderer(W, H) {
      if (glFailed) return false;
      if (!renderer) {
        try { renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" }); }
        catch (e) { glFailed = true; return false; }
        renderer.setPixelRatio(1);
        renderer.outputEncoding = T.sRGBEncoding;
      }
      if (W !== rW || H !== rH) {
        rW = W; rH = H; renderer.setSize(W, H, false);
        camera.aspect = W / H; camera.fov = W / H < 1.3 ? 74 : 64; camera.updateProjectionMatrix();
      }
      return true;
    }

    // ---------------------------------------------------------------------
    // Scene
    // ---------------------------------------------------------------------
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(64, 2, 0.1, 400);
    const tex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; };

    scene.background = tex(4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#05010f"); grd.addColorStop(0.55, "#2a0845"); grd.addColorStop(1, "#ff5fa2");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    scene.fog = new T.Fog("#2a0845", 45, 150);
    scene.add(new T.HemisphereLight("#b9a6ff", "#1a0533", 0.9));
    const key = new T.DirectionalLight("#ffffff", 0.7); key.position.set(3, 8, 6); scene.add(key);

    // Synthwave sun (striped disc) and wireframe mountains
    const sun = new T.Mesh(new T.PlaneGeometry(70, 70), new T.MeshBasicMaterial({
      map: tex(256, 256, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "#ffe66b"); grd.addColorStop(0.6, "#ff7a59"); grd.addColorStop(1, "#ff2fa0");
        g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 7; i++) { const y = h * 0.55 + i * i * 2.2 + i * 6; g.fillRect(0, y, w, 2 + i * 1.3); }
      }), transparent: true, fog: false, depthWrite: false
    }));
    sun.position.set(0, 16, -210); scene.add(sun);
    function mountains(side) {
      const geo = new T.PlaneGeometry(140, 26, 28, 4);
      const pos = geo.attributes.position;
      let s = side > 0 ? 3 : 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > -12) pos.setY(i, y * 0.2 + (y + 13) * rnd() * 0.9); }
      geo.computeVertexNormals();
      const g = new T.Group();
      g.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: "#14042a", fog: false })));
      g.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: PAL.pink, wireframe: true, transparent: true, opacity: 0.35, fog: false })));
      g.position.set(side * 85, 4, -190); g.rotation.y = -side * 0.35; scene.add(g);
    }
    mountains(-1); mountains(1);

    // Scrolling neon grid ground + road
    const gridTex = tex(128, 128, (g, w, h) => { g.fillStyle = "#12021f"; g.fillRect(0, 0, w, h); g.strokeStyle = PAL.purple; g.lineWidth = 4; g.strokeRect(0, 0, w, h); });
    gridTex.wrapS = gridTex.wrapT = T.RepeatWrapping; gridTex.repeat.set(60, 60); gridTex.anisotropy = 4;
    const ground = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshBasicMaterial({ map: gridTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -120); scene.add(ground);
    const roadTex = tex(128, 128, (g, w, h) => {
      g.fillStyle = "#0b0418"; g.fillRect(0, 0, w, h);
      g.fillStyle = PAL.cyan; for (const x of [w / 3, (2 * w) / 3]) g.fillRect(x - 2, 0, 4, h * 0.55);
      g.fillStyle = PAL.pink; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    });
    roadTex.wrapS = roadTex.wrapT = T.RepeatWrapping; roadTex.repeat.set(1, 40); roadTex.anisotropy = 4;
    const road = new T.Mesh(new T.PlaneGeometry(6.8, 300), new T.MeshBasicMaterial({ map: roadTex }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -120); scene.add(road);

    // Neon posts along both sides (recycled)
    const postGeo = new T.BoxGeometry(0.18, 2.6, 0.18), postMats = [new T.MeshBasicMaterial({ color: PAL.cyan }), new T.MeshBasicMaterial({ color: PAL.pink })];
    const posts = [];
    for (let i = 0; i < 24; i++) {
      const m = new T.Mesh(postGeo, postMats[i % 2]); m.position.set((i % 2 ? 1 : -1) * 4.6, 1.3, -i * 6); scene.add(m); posts.push(m);
    }

    // Player hover car
    const car = new T.Group(); scene.add(car);
    const body = new T.MeshStandardMaterial({ color: "#1d1240", roughness: 0.35, metalness: 0.6 });
    const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); car.add(o); return o; };
    add(new T.BoxGeometry(1.3, 0.32, 2.1), body, 0, 0.42, 0);
    add(new T.BoxGeometry(0.85, 0.3, 0.95), new T.MeshStandardMaterial({ color: "#3ad7ff", emissive: "#0f6c88", roughness: 0.15, metalness: 0.3 }), 0, 0.72, 0.15);
    add(new T.BoxGeometry(1.5, 0.08, 0.5), body, 0, 0.62, 0.95); // spoiler
    add(new T.BoxGeometry(1.25, 0.1, 0.06), new T.MeshBasicMaterial({ color: PAL.pink }), 0, 0.45, 1.07); // tail light
    const glow = add(new T.PlaneGeometry(1.5, 2.3), new T.MeshBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.12, 0);
    glow.rotation.x = -Math.PI / 2;
    [-0.66, 0.66].forEach((x) => add(new T.BoxGeometry(0.06, 0.06, 2.0), new T.MeshBasicMaterial({ color: PAL.cyan }), x, 0.34, 0)); // side strips

    // Obstacles + coins (pooled)
    const lowGeo = new T.BoxGeometry(2.0, 0.6, 0.35), wallGeo = new T.BoxGeometry(2.0, 2.6, 0.6), coinGeo = new T.OctahedronGeometry(0.34);
    const lowMat = new T.MeshStandardMaterial({
      map: tex(64, 32, (g, w, h) => { g.fillStyle = PAL.amber; g.fillRect(0, 0, w, h); g.fillStyle = "#120018"; for (let x = -h; x < w; x += 16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, h); g.lineTo(x + 8 + h, 0); g.lineTo(x + h, 0); g.fill(); } }),
      emissive: "#4a2a00", roughness: 0.6
    });
    const wallMat = new T.MeshStandardMaterial({ color: "#2b0d3f", emissive: "#3a0a2a", roughness: 0.4, metalness: 0.3 });
    const wallEdges = new T.EdgesGeometry(wallGeo), edgeMat = new T.LineBasicMaterial({ color: PAL.pink });
    const coinMat = new T.MeshStandardMaterial({ color: PAL.amber, emissive: "#c98a00", roughness: 0.3, metalness: 0.4 });
    const things = []; // { kind, mesh, lane, x, y, z, alive }
    function make(kind) {
      let m;
      if (kind === "low") m = new T.Mesh(lowGeo, lowMat);
      else if (kind === "wall") { m = new T.Mesh(wallGeo, wallMat); m.add(new T.LineSegments(wallEdges, edgeMat)); }
      else m = new T.Mesh(coinGeo, coinMat);
      scene.add(m); return m;
    }
    function spawn(kind, lane, z, y) {
      let t = things.find((o) => !o.alive && o.kind === kind);
      if (!t) { t = { kind, mesh: make(kind) }; things.push(t); }
      t.alive = true; t.lane = lane; t.x = LANES[lane]; t.z = z;
      t.y = y != null ? y : kind === "low" ? 0.3 : kind === "wall" ? 1.3 : 0.75;
      t.mesh.visible = true; t.mesh.position.set(t.x, t.y, t.z); t.mesh.scale.setScalar(1);
      return t;
    }

    // Pulse ring + shards
    const ring = new T.Mesh(new T.RingGeometry(0.8, 1.0, 32), new T.MeshBasicMaterial({ color: PAL.cyan, transparent: true, side: T.DoubleSide, depthWrite: false }));
    ring.visible = false; scene.add(ring);
    const shardGeo = new T.BoxGeometry(0.3, 0.3, 0.3), shards = [];
    for (let i = 0; i < 16; i++) { const s = new T.Mesh(shardGeo, new T.MeshBasicMaterial({ color: PAL.pink })); s.visible = false; scene.add(s); shards.push({ m: s, v: new T.Vector3(), life: 0 }); }
    function burst(x, y, z, col) {
      shards.forEach((s, i) => {
        s.m.material.color.set(i % 2 ? col : "#ffffff"); s.m.visible = true; s.m.position.set(x, y, z);
        s.v.set((Math.random() - 0.5) * 12, Math.random() * 9 + 2, (Math.random() - 0.5) * 10 - 6); s.life = 0.9;
      });
    }

    // ---------------------------------------------------------------------
    // Game state
    // ---------------------------------------------------------------------
    let paused = false, speed = 0, dist = 0, coins = 0, coinBank = 0, charges = 1, score = 0, best = 0;
    let lane = 1, px = 0, py = 0, vy = 0, jumpBuf = 0, nextRowAt = 0, crashT = 0, shake = 0, roll = 0, t = 0, flash = 0;
    try { best = parseInt(localStorage.getItem("neonrun.best"), 10) || 0; } catch (e) {}

    function reset(mode) {
      things.forEach((o) => { o.alive = false; o.mesh.visible = false; });
      shards.forEach((s) => { s.m.visible = false; s.life = 0; });
      speed = mode === "game" ? 20 : 16; dist = 0; coins = 0; coinBank = 0; charges = 1; score = 0;
      lane = 1; px = 0; py = 0; vy = 0; jumpBuf = 0; nextRowAt = 30; crashT = 0; shake = 0; flash = 0;
      for (let z = -55; z > SPAWN_Z; z -= 24) row(z, true); // something to look at straight away
    }

    // One row of the course: never blocks all three lanes with walls
    function row(z, easy) {
      const r = Math.random();
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      if (easy || r < 0.3) { // single block + coins in a free lane
        spawn(Math.random() < 0.5 ? "low" : "wall", lanes[0], z);
        coinLine(lanes[1], z, false);
      } else if (r < 0.55) { // two walls, one gap
        spawn("wall", lanes[0], z); spawn("wall", lanes[1], z);
        coinLine(lanes[2], z, false);
      } else if (r < 0.75) { // full row of low barriers: jump it, coins arc over the top
        lanes.forEach((l) => spawn("low", l, z));
        coinArc(lanes[0], z);
      } else { // wall + low + open lane
        spawn("wall", lanes[0], z); spawn("low", lanes[1], z);
        coinArc(lanes[1], z);
      }
    }
    function coinLine(l, z) { for (let i = 1; i <= 4; i++) spawn("coin", l, z + 6 + i * 2.4); }
    function coinArc(l, z) { for (let i = -2; i <= 2; i++) spawn("coin", l, z + i * 1.6, 0.9 + (2.2 - i * i * 0.45)); }

    // ---------------------------------------------------------------------
    // Sound: tiny WebAudio synth (no files), started on the first key press
    // ---------------------------------------------------------------------
    let ac = null, musicT = 0, step = 0;
    const BASS = [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 40, 40, 52, 47];
    function audio() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === "suspended") ac.resume();
      return ac;
    }
    function tone(freq, dur, type, vol, slide, when) {
      if (!api.soundOn || !ac) return;
      const t0 = when || ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
      gn.gain.setValueAtTime(vol || 0.06, t0); gn.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(gn).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const sfx = {
      lane: () => tone(520, 0.06, "square", 0.025, 1.3),
      jump: () => tone(300, 0.22, "square", 0.05, 2.6),
      coin: () => { tone(1320, 0.07, "square", 0.04); tone(1760, 0.12, "square", 0.035, 1, ac && ac.currentTime + 0.06); },
      pulse: () => { tone(180, 0.35, "sawtooth", 0.07, 6); tone(90, 0.4, "square", 0.05, 0.5); },
      fizz: () => tone(140, 0.12, "square", 0.04, 0.6),
      crash: () => { tone(220, 0.6, "sawtooth", 0.09, 0.15); tone(70, 0.7, "square", 0.08, 0.4); },
      charge: () => [880, 1100, 1320].forEach((f, i) => tone(f, 0.08, "square", 0.035, 1, ac && ac.currentTime + i * 0.07))
    };
    function music(dt) {
      if (!ac || !api.soundOn || api.state !== "game" || paused) return;
      musicT -= dt;
      while (musicT <= 0) {
        const bpm = 120 + Math.min(40, (speed - 20) * 1.4), len = 60 / bpm / 2;
        tone(midi(BASS[step % 16]), len * 0.9, "sawtooth", 0.035, 1);
        if (step % 4 === 2) tone(midi(BASS[step % 16] + 24), len * 0.5, "square", 0.012);
        step++; musicT += len;
      }
    }

    // ---------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------
    function start() { audio(); reset("game"); api.state = "game"; car.visible = true; paused = false; musicT = 0; step = 0; }
    function crash() {
      api.state = "dying"; crashT = 0.9; shake = 0.6; flash = 1; sfx.crash();
      burst(px, 0.6 + py, 0, PAL.cyan); car.visible = false;
      score = Math.floor(dist) + coins * 10;
      if (score > best) { best = score; try { localStorage.setItem("neonrun.best", String(best)); } catch (e) {} }
    }
    function moveLane(d) { const n = Math.max(0, Math.min(2, lane + d)); if (n !== lane) { lane = n; roll = -d * 0.35; sfx.lane(); } }
    function jump() { jumpBuf = 0.14; }
    function pulse() {
      if (charges <= 0) { sfx.fizz(); return; }
      let target = null;
      things.forEach((o) => { if (o.alive && o.kind !== "coin" && Math.abs(o.x - LANES[lane]) < 0.5 && o.z < 0 && o.z > -55 && (!target || o.z > target.z)) target = o; });
      ring.visible = true; ring.position.set(px, 0.6 + py, -1); ring.scale.setScalar(0.5); ring.material.opacity = 1; ring.userData.life = 0.45;
      sfx.pulse();
      if (!target) return; // a wasted pulse is free
      charges--; target.alive = false; target.mesh.visible = false;
      burst(target.x, target.y, target.z, target.kind === "wall" ? PAL.pink : PAL.amber);
      dist += 25; flash = 0.35;
    }

    // ---------------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.05); t += dt;
      music(dt);
      const playing = api.state === "game", menu = api.state === "menu";
      if (api.state === "dying") { crashT -= dt; if (crashT <= 0) api.state = "over"; }
      if (playing) speed = Math.min(46, speed + dt * 0.35);
      const v = api.state === "dying" || api.state === "over" ? 0 : speed;
      dist += v * dt;

      // autopilot on the title screen: dodge into a free lane, hop the barriers
      if (menu) {
        const ahead = things.filter((o) => o.alive && o.kind !== "coin" && o.z < -2 && o.z > -18);
        const blocked = (l) => ahead.some((o) => o.lane === l && o.kind === "wall");
        if (blocked(lane)) { const opts2 = [lane - 1, lane + 1, lane - 2, lane + 2].filter((l) => l >= 0 && l <= 2 && !blocked(l)); if (opts2.length) moveLane(Math.sign(opts2[0] - lane)); }
        if (py === 0 && things.some((o) => o.alive && o.kind === "low" && o.lane === lane && o.z < -2 && o.z > -6)) jumpBuf = 0.1;
      }

      // player
      px += (LANES[lane] - px) * Math.min(1, dt * 14);
      roll += (0 - roll) * Math.min(1, dt * 8);
      if (jumpBuf > 0) { jumpBuf -= dt; if (py === 0 && api.state !== "dying" && api.state !== "over") { vy = 10.5; jumpBuf = 0; if (!menu) sfx.jump(); } }
      vy -= 30 * dt; py = Math.max(0, py + vy * dt); if (py === 0) vy = Math.max(0, vy);

      // world
      if (v > 0) {
        nextRowAt -= v * dt;
        if (nextRowAt <= 0) { row(SPAWN_Z, false); nextRowAt = Math.max(15, 30 - (speed - 20) * 0.45); }
      }
      things.forEach((o) => {
        if (!o.alive) return;
        o.z += v * dt; o.mesh.position.z = o.z;
        if (o.kind === "coin") { o.mesh.rotation.y += dt * 4; o.mesh.position.y = o.y + Math.sin(t * 5 + o.z) * 0.08; }
        if (o.z > 8) { o.alive = false; o.mesh.visible = false; return; }
        if (api.state === "dying" || api.state === "over") return;
        const dz = Math.abs(o.z), dx = Math.abs(o.x - px);
        if (o.kind === "coin") {
          if (dz < 1.2 && dx < 1.1 && Math.abs(o.y - (0.6 + py)) < 1.1) {
            o.alive = false; o.mesh.visible = false;
            if (!menu) { coins++; coinBank++; sfx.coin(); if (coinBank >= 5) { coinBank = 0; if (charges < 3) { charges++; sfx.charge(); } } }
          }
          return;
        }
        const depth = o.kind === "wall" ? 0.3 : 0.18;
        if (dz < 1.05 + depth && dx < 1.45) {
          if (o.kind === "low" && py > 0.62) return;
          if (menu) { o.alive = false; o.mesh.visible = false; return; } // the demo driver never crashes
          crash();
        }
      });
      posts.forEach((p) => { p.position.z += v * dt; if (p.position.z > 6) p.position.z -= 24 * 6; });
      const off = (dist / 5) % 1; gridTex.offset.y = off; roadTex.offset.y = (dist / 7.5) % 1;
      shards.forEach((s) => { if (s.life <= 0) return; s.life -= dt; s.v.y -= 25 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 9; s.m.rotation.y += dt * 7; if (s.life <= 0 || s.m.position.y < -1) s.m.visible = false; });
      if (ring.visible) { ring.userData.life -= dt; const k = 1 - ring.userData.life / 0.45; ring.position.z = -1 - k * 30; ring.scale.setScalar(0.5 + k * 3); ring.material.opacity = 1 - k; if (ring.userData.life <= 0) ring.visible = false; }
      shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 2.5);
      if (playing) score = Math.floor(dist) + coins * 10;

      // car + camera
      car.position.set(px, py + Math.sin(t * 8) * 0.03, 0);
      car.rotation.set(-vy * 0.012, 0, roll);
      glow.material.opacity = 0.4 + Math.sin(t * 10) * 0.12;
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.8 : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
      camera.position.set(px * 0.55 + sx, 2.5 + py * 0.35 + sy, 5.6);
      camera.lookAt(px * 0.75, 0.9 + py * 0.2, -10);
    }

    // ---------------------------------------------------------------------
    // Draw: 3D frame at the screen's own size, then a 2D HUD on top
    // ---------------------------------------------------------------------
    function txt(g, s, x, y, size, col, align) {
      g.font = size + "px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top";
      g.fillStyle = "#000"; g.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
      g.fillStyle = col; g.fillText(s, x, y);
    }
    function drawScreen(g, W, H) {
      if (!ensureRenderer(W, H)) { g.fillStyle = "#12021f"; g.fillRect(0, 0, W, H); txt(g, "NO 3D", W / 2, H / 2 - 4, 8, PAL.pink, "center"); return; }
      if (!api.state || api.state === "menu") { if (!things.some((o) => o.alive)) reset("menu"); car.visible = true; }
      renderer.render(scene, camera);
      g.save(); g.imageSmoothingEnabled = false; g.drawImage(canvas, 0, 0, W, H); g.restore();
      const k = W / 320, s = Math.max(8, Math.round(8 * k)), pad = Math.max(4, Math.round(6 * k));
      if (flash > 0) { g.fillStyle = "rgba(255,255,255," + (flash * 0.6).toFixed(3) + ")"; g.fillRect(0, 0, W, H); }
      if (api.state === "menu") {
        const ts = Math.max(12, Math.round(20 * k)), y0 = Math.round(H * 0.07);
        g.font = ts + "px " + FONT; const wN = g.measureText("NEON ").width, wR = g.measureText("RUN").width, x0 = (W - wN - wR) / 2;
        txt(g, "NEON ", x0, y0, ts, PAL.cyan); txt(g, "RUN", x0 + wN, y0, ts, PAL.pink);
        if (best) txt(g, "BEST " + best, W / 2, y0 + ts * 1.6, s, PAL.amber, "center");
        return;
      }
      // HUD along the bottom (the console draws its control hint across the top)
      txt(g, String(score).padStart(5, "0"), pad, H - s - pad, s, "#ffffff");
      const pip = Math.max(4, Math.round(6 * k));
      for (let i = 0; i < 3; i++) {
        const x = W - pad - (3 - i) * (pip + 3);
        g.fillStyle = "#000"; g.fillRect(x + 1, H - pad - pip + 1, pip, pip);
        g.fillStyle = i < charges ? PAL.cyan : "rgba(255,255,255,.25)"; g.fillRect(x, H - pad - pip, pip, pip);
      }
      if (W >= 300) txt(g, "PULSE", W - pad - 3 * (pip + 3) - 4, H - s - pad, s, PAL.cyan, "right");
      if (api.state === "over") {
        g.fillStyle = "rgba(7,2,20,.55)"; g.fillRect(0, 0, W, H);
        const ts = Math.max(10, Math.round(18 * k));
        txt(g, "WRECKED", W / 2, H * 0.2, ts, PAL.pink, "center");
        txt(g, "SCORE " + score, W / 2, H * 0.2 + ts * 1.8, s, "#ffffff", "center");
        txt(g, (score >= best && score > 0 ? "NEW BEST!" : "BEST " + best), W / 2, H * 0.2 + ts * 1.8 + s * 1.8, s, PAL.amber, "center");
      }
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    Object.assign(api, {
      update,
      drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k === "start") { if (api.state === "dying") return; start(); }
      },
      hold(k, down) {
        if (!down) return;
        audio();
        if (api.state !== "game") { if (api.state !== "dying" && (k === "jump" || k === "shoot")) start(); return; }
        if (k === "left") moveLane(-1); else if (k === "right") moveLane(1);
        else if (k === "jump") jump(); else if (k === "shoot") pulse();
      },
      click() { if (api.state === "menu" || api.state === "over") start(); },
      release() {},
      toMenu() { api.state = "menu"; reset("menu"); car.visible = true; paused = false; },
      pause(p) { paused = !!p; },
      stop() { paused = true; if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ things, lane, py, speed, dist })
    });
    reset("menu");
    return api;
  }

  window.NeonRun = { create };
})();
