/* =========================================================================
   HYROX RUSH: an arcade-sized HYROX race for the console cartridges.

   8 runs and 8 stations, each a tiny track-and-field style mini game:
     RUN / SLED PUSH / SANDBAG LUNGES  → alternate LEFT and RIGHT
     SLED PULL                         → alternate A and B (hand over hand)
     BURPEE BROAD JUMPS                → B (drop) then A (jump)
     SKIERG / ROW / WALL BALLS         → hit A when the marker is in the zone
     FARMERS CARRY                     → keep the balance needle centred
   Beat your PB; finish times earn a division (Elite / Pro / Open / Finisher).

   Pure 2D canvas, laid out for whatever screen it's drawn on (160×144 up to
   400×240). Same engine API as Mini Knight / Neon Run (see gba.js).
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const Y = "#ffd100", WHITE = "#f4f4f4", GREY = "#8b8b96", RED = "#ff5a5a", GREEN = "#43e07a", CYAN = "#6ee7ff";

  const STATIONS = [
    { id: "ski", name: "SKIERG", type: "timing", reps: 9, speed: 0.85, zone: 0.2 },
    { id: "push", name: "SLED PUSH", type: "mash", reps: 22, keys: ["left", "right"] },
    { id: "pull", name: "SLED PULL", type: "mash", reps: 22, keys: ["jump", "shoot"] },
    { id: "bbj", name: "BURPEE BROAD JUMPS", short: "BURPEES", type: "mash", reps: 16, keys: ["shoot", "jump"] },
    { id: "row", name: "ROW", type: "timing", reps: 9, speed: 0.75, zone: 0.22 },
    { id: "farm", name: "FARMERS CARRY", short: "FARMERS", type: "balance", dur: 6.5 },
    { id: "lunge", name: "SANDBAG LUNGES", short: "LUNGES", type: "mash", reps: 18, keys: ["left", "right"] },
    { id: "wall", name: "WALL BALLS", type: "timing", reps: 10, speed: 0.95, zone: 0.17 }
  ];
  // 16 segments: run, station, run, station …
  const SEGMENTS = [];
  STATIONS.forEach((s, i) => { SEGMENTS.push({ id: "run", name: "RUN", type: "mash", reps: 20, keys: ["left", "right"], n: i + 1 }); SEGMENTS.push(Object.assign({ n: i + 1 }, s)); });
  const TIERS = [[65, "ELITE 15"], [85, "PRO"], [120, "OPEN"], [1e9, "FINISHER"]];

  // ---------------------------------------------------------------------
  // Athlete poses: joint positions (x forward, y up, floor = 0, ~30 units tall)
  // ---------------------------------------------------------------------
  const J = ["hip", "neck", "head", "kneeB", "footB", "kneeF", "footF", "elbowB", "handB", "elbowF", "handF"];
  const P = (a) => { const o = {}; J.forEach((k, i) => (o[k] = [a[i * 2], a[i * 2 + 1]])); return o; };
  const POSE = {
    stand: P([0, 14, 0, 25, 0, 29, -1, 7, -1, 0, 1, 7, 1, 0, -2, 19, -2, 14, 2, 19, 2, 14]),
    run1: P([0, 14, 1, 25, 2, 29, -3, 8, -7, 3, 4, 9, 3, 2, -3, 20, -1, 16, 4, 20, 6, 23]),
    run2: P([0, 14, 1, 25, 2, 29, 4, 9, 3, 2, -3, 8, -7, 3, 4, 20, 6, 23, -3, 20, -1, 16]),
    push1: P([-2, 13, 5, 20, 8, 22, -5, 6, -9, 0, 2, 8, 0, 1, 8, 19, 12, 18, 8, 18, 12, 17]),
    push2: P([-2, 13, 5, 20, 8, 22, 2, 8, 0, 1, -5, 6, -9, 0, 8, 19, 12, 18, 8, 18, 12, 17]),
    pull1: P([0, 13, 3, 24, 4, 28, -3, 7, -5, 0, 3, 7, 4, 0, 7, 22, 11, 22, 7, 21, 11, 21]),
    pull2: P([-1, 13, -3, 24, -4, 28, -3, 7, -5, 0, 3, 7, 4, 0, 1, 20, 4, 21, 1, 20, 4, 21]),
    plank: P([0, 5, 9, 6, 12, 7, -4, 3, -9, 1, -4, 4, -9, 1, 9, 3, 9, 0, 9, 3, 9, 0]),
    leap: P([0, 17, 2, 28, 3, 32, -3, 11, -6, 6, 4, 12, 4, 6, 3, 32, 5, 37, 4, 32, 6, 37]),
    rowCatch: P([0, 5, 4, 15, 5, 19, 5, 11, 9, 5, 5, 11, 9, 5, 7, 12, 10, 11, 7, 12, 10, 11]),
    rowFinish: P([0, 5, -3, 14, -4, 18, 6, 6, 11, 5, 6, 6, 11, 5, 0, 9, 3, 11, 0, 9, 3, 11]),
    skiUp: P([0, 14, 0, 25, 1, 29, -1, 7, -1, 0, 1, 7, 1, 0, 2, 29, 4, 33, 2, 29, 4, 33]),
    skiDown: P([-1, 11, 3, 20, 5, 23, 1, 6, -1, 0, 2, 6, 1, 0, 5, 16, 5, 11, 5, 16, 5, 11]),
    carry1: P([0, 14, 0, 25, 1, 29, -2, 8, -5, 2, 3, 8, 3, 1, -1, 19, -1, 13, 1, 19, 1, 13]),
    carry2: P([0, 14, 0, 25, 1, 29, 3, 8, 3, 1, -2, 8, -5, 2, 1, 19, 1, 13, -1, 19, -1, 13]),
    lunge1: P([0, 9, 0, 20, 0, 24, -5, 2, -9, 0, 5, 8, 6, 0, -2, 21, -3, 23, 2, 21, 3, 23]),
    lunge2: P([0, 14, 0, 25, 0, 29, -2, 7, -3, 0, 2, 7, 3, 0, -2, 26, -3, 28, 2, 26, 3, 28]),
    squat: P([-2, 8, 2, 18, 3, 22, 3, 8, 1, 0, 3, 8, 2, 0, 4, 18, 5, 21, 4, 18, 5, 21]),
    throw: P([0, 14, 0, 25, 1, 29, -1, 7, -1, 0, 1, 7, 1, 0, 2, 30, 3, 35, 2, 30, 3, 35])
  };
  const mix = (a, b, t) => { const o = {}; J.forEach((k) => (o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t])); return o; };

  function create(opts) {
    opts = opts || {};
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true,
      hints: {
        menu: "ENTER: START   ARROWS + SPACE + X", menuShort: "A: START",
        play: "ARROWS: RUN   SPACE = A   X = B", playShort: "SPC=A  X=B",
        over: "ENTER / A: RACE AGAIN", overShort: "A: AGAIN"
      },
      padLabels: { jump: "A", shoot: "B" }
    };

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------
    let paused = false, t = 0, clock = 0, count = 0, seg = 0, prog = 0, lastKey = null, lock = 0, inputCD = 0;
    let anim = 0, feedback = null, fbT = 0, bannerT = 0, overT = 0, splits = [], pb = 0, newPB = false;
    let marker = 0, mdir = 1, zone = 0.5, bal = 0, balV = 0, dropped = 0, scroll = 0;
    try { pb = parseFloat(localStorage.getItem("hyroxrush.pb")) || 0; } catch (e) {}
    const cur = () => SEGMENTS[seg];

    function startRace() {
      audio(); api.state = "game"; count = 2.4; clock = 0; seg = 0; splits = []; newPB = false; enterSeg();
      [0, 0.8, 1.6].forEach((d) => beep(660, 0.12, d)); beep(1320, 0.4, 2.4);
    }
    function enterSeg() {
      prog = 0; lastKey = null; lock = 0; anim = 0; bal = 0; balV = 0; dropped = 0; marker = 0; mdir = 1;
      zone = 0.3 + Math.random() * 0.4; bannerT = 1.1;
    }
    function finishSeg() {
      splits.push(clock); sfx.done();
      if (seg + 1 >= SEGMENTS.length) return finishRace();
      seg++; enterSeg();
    }
    function finishRace() {
      api.state = "over"; overT = 0;
      if (!pb || clock < pb) { pb = clock; newPB = true; try { localStorage.setItem("hyroxrush.pb", clock.toFixed(2)); } catch (e) {} }
      [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, i * 0.12));
    }
    const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1); };
    const tier = (s) => TIERS.find((x) => s < x[0])[1];
    function say(text, col) { feedback = { text, col }; fbT = 0.6; }
    const hit = () => fbT > 0 && feedback && feedback.col !== RED;

    // ---------------------------------------------------------------------
    // Input
    // ---------------------------------------------------------------------
    function input(k) {
      if (api.state !== "game" || count > 0 || lock > 0) return;
      const s = cur();
      if (s.type === "mash") {
        if (!s.keys.includes(k)) return;
        if (inputCD > 0) return;
        const want = lastKey === null ? null : s.keys[(s.keys.indexOf(lastKey) + 1) % 2];
        if (want && k !== want) { lock = 0.28; say("STUMBLE!", RED); sfx.miss(); lastKey = null; return; }
        if (s.id === "bbj" && lastKey === null && k !== s.keys[0]) { say("B FIRST", RED); return; }
        lastKey = k; prog++; anim++; inputCD = 0.05; scroll += 1; sfx.step(prog);
        if (prog >= s.reps) finishSeg();
      } else if (s.type === "timing") {
        if (k !== "jump") return;
        const d = Math.abs(marker - zone);
        if (d < s.zone / 2) {
          prog++; anim++; sfx.rep(); say(d < s.zone / 6 ? "PERFECT!" : "GOOD", d < s.zone / 6 ? Y : GREEN);
          zone = 0.25 + Math.random() * 0.5;
          if (prog >= s.reps) finishSeg();
        } else { lock = 0.45; say("MISS", RED); sfx.miss(); }
      } else if (s.type === "balance") {
        if (k === "left") balV -= 1.15; else if (k === "right") balV += 1.15;
      }
    }

    // ---------------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.05); t += dt;
      fbT = Math.max(0, fbT - dt); bannerT = Math.max(0, bannerT - dt);
      if (api.state === "over") { overT += dt; return; }
      if (api.state !== "game") return;
      if (count > 0) { count -= dt; return; }
      clock += dt; lock = Math.max(0, lock - dt); inputCD = Math.max(0, inputCD - dt);
      const s = cur();
      if (s.type === "timing" && lock <= 0) {
        marker += mdir * dt * (s.speed + prog * 0.05) * 1.6;
        if (marker > 1) { marker = 2 - marker; mdir = -1; } if (marker < 0) { marker = -marker; mdir = 1; }
      }
      if (s.type === "balance") {
        if (dropped > 0) { dropped -= dt; if (dropped <= 0) { bal = 0; balV = 0; } return; }
        balV += (Math.sin(t * 2.3) * 1.1 + Math.sin(t * 5.1 + 1) * 0.8 + bal * 1.6) * dt; // drifts away from centre
        balV *= Math.pow(0.35, dt); bal += balV * dt;
        if (Math.abs(bal) > 1) { dropped = 1.0; say("DROPPED!", RED); sfx.miss(); return; }
        prog += dt; anim += dt * 3; scroll += dt * 5;
        if (prog >= s.dur) finishSeg();
      }
    }

    // ---------------------------------------------------------------------
    // Sound (WebAudio blips, no files)
    // ---------------------------------------------------------------------
    let ac = null;
    function audio() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === "suspended") ac.resume();
      return ac;
    }
    function beep(f, d, delay, type, vol) {
      if (!api.soundOn || !ac) return;
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    }
    const sfx = {
      step: (n) => beep(n % 2 ? 330 : 392, 0.04, 0, "square", 0.025),
      rep: () => { beep(880, 0.06); beep(1175, 0.1, 0.05); },
      miss: () => beep(110, 0.25, 0, "sawtooth", 0.06),
      done: () => [784, 988, 1175].forEach((f, i) => beep(f, 0.09, i * 0.06, "square", 0.04))
    };

    // ---------------------------------------------------------------------
    // Drawing helpers
    // ---------------------------------------------------------------------
    function txt(g, s, x, y, size, col, align) {
      g.font = size + "px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top";
      g.fillStyle = "#000"; g.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
      g.fillStyle = col; g.fillText(s, x, y);
    }
    function athlete(g, pose, x, fy, u, extra) {
      const X = (p) => x + p[0] * u, Yp = (p) => fy - p[1] * u;
      const limb = (a, b, c, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(X(pose[a]), Yp(pose[a])); g.lineTo(X(pose[b]), Yp(pose[b])); if (c) g.lineTo(X(pose[c]), Yp(pose[c])); g.stroke(); };
      g.lineCap = "round"; g.lineJoin = "round";
      limb("neck", "elbowB", "handB", 2.2 * u, "#c98f5a");
      limb("hip", "kneeB", "footB", 2.6 * u, "#3b3b46");
      limb("hip", "neck", null, 4.2 * u, Y);
      limb("hip", "kneeF", "footF", 2.6 * u, "#4a4a58");
      g.fillStyle = WHITE; [pose.footB, pose.footF].forEach((f) => g.fillRect(X(f) - 1.2 * u, Yp(f) - 1.2 * u, 3.4 * u, 1.6 * u));
      if (extra) extra(X, Yp);
      limb("neck", "elbowF", "handF", 2.2 * u, "#e0a96d");
      g.fillStyle = "#e0a96d"; g.beginPath(); g.arc(X(pose.head), Yp(pose.head), 2.7 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#222"; g.fillRect(X(pose.head) - 2.6 * u, Yp(pose.head) - 2.9 * u, 5 * u, 1.6 * u); // headband
    }
    function keyIcon(g, kind, cx, cy, sz, lit) {
      g.fillStyle = lit ? Y : "#2b2b33"; g.strokeStyle = lit ? "#000" : GREY; g.lineWidth = Math.max(1, sz / 12);
      g.beginPath(); g.rect(cx - sz / 2, cy - sz / 2, sz, sz); g.fill(); g.stroke();
      g.fillStyle = lit ? "#000" : WHITE;
      if (kind === "left" || kind === "right") {
        const d = kind === "left" ? -1 : 1, a = sz * 0.22;
        g.beginPath(); g.moveTo(cx + d * a, cy); g.lineTo(cx - d * a, cy - a); g.lineTo(cx - d * a, cy + a); g.closePath(); g.fill();
      } else { const fs = Math.max(8, Math.round(sz * 0.45)); g.font = fs + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(kind === "jump" ? "A" : "B", cx + 1, cy + 1); }
    }

    // Scene: arena, equipment and the athlete for the current segment
    function scene(g, W, top, h, u) {
      const fy = top + h * 0.86, cx = W * 0.42;
      // arena backdrop: crowd, banner boards, floor
      g.fillStyle = "#15151b"; g.fillRect(0, top, W, h);
      g.fillStyle = "#23232c"; for (let i = 0; i < W; i += 3 * u) g.fillRect(i, top + ((i / u) % 7) * 0.4 * u + 2 * u, 2 * u, 2 * u);
      const boardH = Math.max(6, 7 * u), boardY = top + Math.max(2, 3 * u);
      const off = -(scroll * 4 * u) % (40 * u);
      for (let x = off - 40 * u; x < W + 40 * u; x += 40 * u) {
        g.fillStyle = "#0d0d10"; g.fillRect(x, boardY, 38 * u, boardH);
        g.fillStyle = "#9c8100"; g.font = Math.max(6, Math.round(4 * u)) + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("RUSH", x + 19 * u, boardY + boardH / 2 + 0.5);
      }
      g.fillStyle = "#2e2e36"; g.fillRect(0, fy, W, top + h - fy);
      g.fillStyle = "#3d3d48"; for (let x = off * 1.5 % (12 * u) - 12 * u; x < W; x += 12 * u) g.fillRect(x, fy + 2 * u, 6 * u, 1 * u);
      g.fillStyle = Y; g.fillRect(0, fy, W, Math.max(1, u * 0.8));

      if (api.state !== "game") { athlete(g, mix(POSE.run1, POSE.run2, (Math.sin(t * 9) + 1) / 2), cx, fy, u); return; }
      const s = cur(), alt = anim % 2 ? 1 : 0;
      switch (s.id) {
        case "run": athlete(g, alt ? POSE.run2 : POSE.run1, cx, fy, u); break;
        case "ski": {
          const p = mix(POSE.skiUp, POSE.skiDown, hit() ? fbT / 0.6 : 0);
          g.fillStyle = "#2a2a30"; g.fillRect(cx + 7 * u, fy - 38 * u, 4 * u, 38 * u); g.fillStyle = "#444"; g.fillRect(cx + 5 * u, fy - 4 * u, 9 * u, 4 * u);
          g.fillStyle = Y; g.fillRect(cx + 7.5 * u, fy - 34 * u, 3 * u, 3 * u);
          athlete(g, p, cx, fy, u, null); break;
        }
        case "push": case "pull": {
          const sledX = s.id === "push" ? cx + 13 * u : cx + 22 * u - (prog / s.reps) * 6 * u;
          g.fillStyle = "#555"; g.fillRect(sledX, fy - 10 * u, 12 * u, 8 * u); g.fillStyle = "#777"; g.fillRect(sledX - 1 * u, fy - 2 * u, 14 * u, 2 * u);
          g.fillStyle = "#3a3a3a"; g.fillRect(sledX + 2 * u, fy - 15 * u, 8 * u, 5 * u); g.fillStyle = "#2b2b2b"; g.fillRect(sledX + 1 * u, fy - 9 * u, 2 * u, 9 * u);
          if (s.id === "push") athlete(g, alt ? POSE.push2 : POSE.push1, cx, fy, u);
          else { g.strokeStyle = "#c8b68a"; g.lineWidth = u; g.beginPath(); g.moveTo(cx + 9 * u, fy - 21 * u); g.lineTo(sledX, fy - 6 * u); g.stroke(); athlete(g, alt ? POSE.pull2 : POSE.pull1, cx - 4 * u, fy, u); }
          break;
        }
        case "bbj": athlete(g, lastKey === "shoot" ? POSE.plank : POSE.leap, cx, fy - (lastKey === "jump" && inputCD > 0 ? 3 * u : 0), u); break;
        case "row": {
          g.fillStyle = "#333"; g.fillRect(cx - 10 * u, fy - 3 * u, 34 * u, 2 * u); g.fillStyle = "#555"; g.beginPath(); g.arc(cx + 23 * u, fy - 6 * u, 5 * u, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#222"; g.fillRect(cx - 3 * u, fy - 5 * u, 6 * u, 2 * u);
          athlete(g, mix(POSE.rowCatch, POSE.rowFinish, hit() ? fbT / 0.6 : 0), cx, fy, u); break;
        }
        case "farm": {
          const wob = dropped > 0 ? 0 : bal * 6;
          const pose = dropped > 0 ? POSE.squat : mix(POSE.carry1, POSE.carry2, (Math.sin(anim * Math.PI) + 1) / 2);
          athlete(g, pose, cx, fy, u, (X, Yp) => {
            g.fillStyle = "#1c1c1c";
            [pose.handB, pose.handF].forEach((h, i) => { const dy = dropped > 0 ? 0 : (i ? wob : -wob) * 0.4; g.beginPath(); g.arc(X(h), Math.min(fy - 3 * u, Yp(h) + 3 * u + dy * u), 3 * u, 0, Math.PI * 2); g.fill(); });
          });
          break;
        }
        case "lunge": athlete(g, alt ? POSE.lunge2 : POSE.lunge1, cx, fy, u, (X, Yp) => { g.fillStyle = "#6b5b3e"; const n = (alt ? POSE.lunge2 : POSE.lunge1).neck; g.fillRect(X(n) - 5 * u, Yp(n) - 2 * u, 10 * u, 4 * u); }); break;
        case "wall": {
          const tx = cx + 22 * u; g.fillStyle = "#3a3a45"; g.fillRect(tx, top + 4 * u, 4 * u, fy - top - 4 * u); g.fillStyle = Y; g.fillRect(tx - 1 * u, fy - 44 * u, 6 * u, 1.5 * u);
          const throwing = hit();
          const pose = throwing ? POSE.throw : POSE.squat;
          athlete(g, pose, cx, fy, u);
          const k = throwing ? 1 - fbT / 0.6 : 0, bx = throwing ? cx + (5 + k * 15) * u : cx + 5 * u, by = throwing ? fy - (22 + Math.sin(k * Math.PI) * 22) * u : fy - 22 * u;
          g.fillStyle = "#7a2d2d"; g.beginPath(); g.arc(bx, by, 3 * u, 0, Math.PI * 2); g.fill();
          break;
        }
      }
    }

    // ---------------------------------------------------------------------
    // drawScreen: lays itself out for the screen it's given
    // ---------------------------------------------------------------------
    function drawScreen(g, W, H) {
      const k = W / 320, fs = Math.max(8, Math.round(8 * k)), pad = Math.max(3, Math.round(5 * k));
      const hudH = Math.round(fs * 2.4), promptH = Math.round(fs * 3.6);
      const top = hudH + Math.max(3, Math.round(4 * k)) + 2, sh = H - top - promptH;
      const u = Math.max(1, Math.min(W / 115, sh / 46));
      g.save(); g.imageSmoothingEnabled = false;
      g.fillStyle = "#0b0b0f"; g.fillRect(0, 0, W, H);
      scene(g, W, top, sh, u);

      if (api.state === "menu") {
        const ts = Math.max(10, Math.round(18 * k));
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, W, top + ts * 2.6);
        txt(g, "HYROX", W / 2, pad + 2, ts, Y, "center"); txt(g, "RUSH", W / 2, pad + 2 + ts * 1.25, ts, WHITE, "center");
        txt(g, W >= 300 ? "8 RUNS + 8 STATIONS" : "8 RUNS+8 STATIONS", W / 2, H - promptH + pad, fs, GREY, "center");
        if (pb) txt(g, "PB " + fmt(pb), W / 2, H - promptH + pad + fs * 1.6, fs, Y, "center");
        g.restore(); return;
      }

      // HUD: segment + race clock, then a progress bar for the whole race
      const s = cur();
      const label = api.state === "over" ? "FINISH" : s.id === "run" ? "RUN " + s.n + "/8" : (W >= 300 ? s.name : s.short || s.name);
      g.fillStyle = "#000"; g.fillRect(0, 0, W, hudH);
      txt(g, label, pad, Math.round((hudH - fs) / 2), fs, s.id === "run" || api.state === "over" ? WHITE : Y);
      txt(g, fmt(clock), W - pad, Math.round((hudH - fs) / 2), fs, WHITE, "right");
      const barY = hudH + 1, barH = Math.max(3, Math.round(4 * k));
      g.fillStyle = "#26262e"; g.fillRect(pad, barY, W - pad * 2, barH);
      const segProg = api.state === "over" ? 1 : (seg + (s.type === "balance" ? prog / s.dur : prog / s.reps)) / SEGMENTS.length;
      g.fillStyle = Y; g.fillRect(pad, barY, (W - pad * 2) * segProg, barH);
      for (let i = 1; i < 8; i++) { g.fillStyle = "#0b0b0f"; g.fillRect(pad + ((W - pad * 2) * i) / 8, barY, 1, barH); }

      // Prompt band
      const py = H - promptH, mid = py + promptH / 2, isz = Math.round(promptH * 0.62);
      g.fillStyle = "#000"; g.fillRect(0, py, W, promptH);
      if (api.state === "game" && count <= 0) {
        if (s.type === "mash") {
          const want = lastKey === null ? s.keys[0] : s.keys[(s.keys.indexOf(lastKey) + 1) % 2];
          s.keys.forEach((kk, i) => keyIcon(g, kk, W / 2 + (i ? 1 : -1) * isz * 0.75, mid, isz, lock <= 0 && kk === want && (Math.floor(t * 8) % 2 === 0 || prog > 0)));
          const left = s.reps - prog;
          txt(g, String(left), W - pad, mid - fs / 2, fs, GREY, "right");
          if (W >= 300) txt(g, s.id === "bbj" ? "DROP + JUMP" : s.id === "pull" ? "HAND OVER HAND" : "ALTERNATE", pad, mid - fs / 2, fs, GREY);
        } else if (s.type === "timing") {
          const bw = Math.round(W * (W >= 300 ? 0.56 : 0.62)), bx = Math.round((W - bw) / 2), bh = Math.max(6, Math.round(isz * 0.45)), by = Math.round(mid - bh / 2);
          g.fillStyle = "#26262e"; g.fillRect(bx, by, bw, bh);
          g.fillStyle = GREEN; g.fillRect(bx + bw * (zone - s.zone / 2), by, bw * s.zone, bh);
          g.fillStyle = Y; g.fillRect(bx + bw * (zone - s.zone / 6), by, bw * s.zone / 3, bh);
          g.fillStyle = lock > 0 ? RED : WHITE; g.fillRect(bx + bw * marker - Math.max(1, k * 1.5), by - 3, Math.max(2, k * 3), bh + 6);
          keyIcon(g, "jump", bx - isz * 0.7, mid, Math.round(isz * 0.8), true);
          txt(g, String(s.reps - prog), W - pad, mid - fs / 2, fs, GREY, "right");
        } else {
          const bw = Math.round(W * 0.5), bx = Math.round((W - bw) / 2), bh = Math.max(6, Math.round(isz * 0.45)), by = Math.round(mid - bh / 2);
          const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, RED); grd.addColorStop(0.3, "#333"); grd.addColorStop(0.5, GREEN); grd.addColorStop(0.7, "#333"); grd.addColorStop(1, RED);
          g.fillStyle = grd; g.fillRect(bx, by, bw, bh);
          g.fillStyle = WHITE; g.fillRect(bx + bw * (0.5 + Math.max(-1, Math.min(1, bal)) / 2) - Math.max(1, k * 1.5), by - 3, Math.max(2, k * 3), bh + 6);
          keyIcon(g, "left", bx - isz * 0.7, mid, Math.round(isz * 0.8), bal > 0.35); keyIcon(g, "right", bx + bw + isz * 0.7, mid, Math.round(isz * 0.8), bal < -0.35);
        }
      }

      // Overlays: countdown, station banner, feedback, finish card
      if (api.state === "game" && (count > 0 || clock < 0.6)) {
        const cs = Math.max(16, Math.round(34 * k));
        txt(g, count > 0 ? String(Math.min(3, Math.ceil(count / 0.8))) : "GO!", W / 2, top + sh / 2 - cs / 2, cs, Y, "center");
      } else if (api.state === "game" && bannerT > 0 && s.id !== "run") {
        const bs = Math.max(8, Math.round(11 * k)), nm = W >= 300 ? s.name : s.short || s.name;
        g.fillStyle = "rgba(0,0,0,.7)"; g.fillRect(0, top + sh * 0.18, W, bs * 3.2);
        txt(g, "STATION " + s.n, W / 2, top + sh * 0.18 + bs * 0.4, Math.max(8, Math.round(bs * 0.7)), GREY, "center");
        txt(g, nm, W / 2, top + sh * 0.18 + bs * 1.6, bs, Y, "center");
      }
      if (fbT > 0 && feedback && api.state === "game") txt(g, feedback.text, W / 2, top + Math.round(sh * 0.06), fs, feedback.col, "center");
      if (api.state === "over") {
        g.fillStyle = "rgba(0,0,0,.72)"; g.fillRect(0, top, W, sh);
        const ts = Math.max(10, Math.round(16 * k)), y0 = top + Math.round(sh * 0.08);
        txt(g, fmt(clock), W / 2, y0, ts, WHITE, "center");
        txt(g, tier(clock), W / 2, y0 + ts * 1.6, fs, Y, "center");
        txt(g, newPB ? "NEW PB!" : "PB " + fmt(pb), W / 2, y0 + ts * 1.6 + fs * 1.8, fs, newPB ? GREEN : GREY, "center");
        if (W >= 300 && splits.length === SEGMENTS.length) {
          let bestI = 0, bestT = 1e9;
          for (let i = 1; i < SEGMENTS.length; i += 2) { const d = splits[i] - splits[i - 1]; if (d < bestT) { bestT = d; bestI = i; } }
          txt(g, "BEST STATION: " + SEGMENTS[bestI].name + " " + bestT.toFixed(1) + "S", W / 2, y0 + ts * 1.6 + fs * 3.6, Math.max(8, Math.round(fs * 0.8)), CYAN, "center");
        }
      }
      g.restore();
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k === "start") { if (api.state === "over" && overT < 1) return; startRace(); }
      },
      hold(k, down) {
        if (!down) return;
        audio();
        if (api.state === "menu" || api.state === "over") { if ((k === "jump" || k === "shoot") && !(api.state === "over" && overT < 1)) startRace(); return; }
        input(k);
      },
      click() { if (api.state === "menu" || (api.state === "over" && overT >= 1)) startRace(); },
      release() {},
      toMenu() { api.state = "menu"; paused = false; clock = 0; seg = 0; },
      pause(p) { paused = !!p; },
      stop() { paused = true; if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ seg, prog, lastKey, lock, marker, zone, bal, count, clock, cur: cur() })
    });
    return api;
  }

  window.HyroxRush = { create };
})();
