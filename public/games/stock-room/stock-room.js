/* =========================================================================
   STOCK ROOM: a crate-pushing puzzle set in the shop's back room.

   Push every box onto a yellow pallet bay to ship the order. You can push
   one box at a time and never pull, so plan before you shove.
     Arrows move · A (Space) undo · B (X) restart the level · Enter next
   8 levels, each checked solvable by a solver; PAR is the fewest possible moves.

   Pure 2D canvas, tiles sized to whatever screen it's drawn on. Same engine
   API as Mini Knight / Neon Run (see gba.js), plus grid: true, which tells the
   console to send real up / down presses instead of "jump".
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const C = { floor: "#3a3d46", floor2: "#353841", line: "#2e3038", rack: "#22252e", beam: "#ff8a3d", post: "#6b7080",
    bay: "#ffd23f", box: "#c98b4a", boxDark: "#9a6633", tape: "#e8c58f", done: "#5bd47a", vest: "#ff8a3d", ink: "#0d0f14",
    white: "#f2f4f8", grey: "#9aa3b5", cyan: "#6ee7ff" };

  const LEVELS = [
    { name: "FIRST SHIFT", par: 3, map: [
      "#######",
      "#@ $ .#",
      "#######"] },
    { name: "TWO FOR ONE", par: 12, map: [
      "########",
      "#.  @  #",
      "# $  $ #",
      "#     .#",
      "########"] },
    { name: "BACK ROOM", par: 17, map: [
      "########",
      "#  .   #",
      "# #$## #",
      "# . $  #",
      "## #$# #",
      " # . @ #",
      " #######"] },
    { name: "RACKING", par: 26, map: [
      "#########",
      "#   #   #",
      "# $ . $ #",
      "#.##@##.#",
      "#   $ $ #",
      "#   .   #",
      "#########"] },
    { name: "THE CORNER", par: 31, map: [
      " #####  ",
      " #   ###",
      " # #   #",
      "##.$ $ #",
      "#  .## #",
      "# @    #",
      "########"] },
    { name: "FULL PALLET", par: 31, map: [
      "  ####   ",
      "###  ####",
      "#  $ $  #",
      "# #. .# #",
      "#  $@$  #",
      "## .#. ##",
      " #     # ",
      " ####### "] },
    { name: "NARROW AISLE", par: 36, map: [
      "#######",
      "#. #  #",
      "#  $  #",
      "#. $# #",
      "## $  #",
      " #@ . #",
      " ######"] },
    { name: "LOADING BAY", par: 46, map: [
      "#########",
      "#.  #  .#",
      "# $   $ #",
      "## #$# ##",
      "# $ @ $ #",
      "#.  .  .#",
      "#########"] }
  ];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function create() {
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true, grid: true,
      hints: {
        menu: "ARROWS: PICK LEVEL   ENTER / A: START", menuShort: "A: START",
        play: "ARROWS: MOVE   SPACE: UNDO   X: RESTART", playShort: "A:UNDO B:RESET",
        over: "ENTER / A: BACK TO LEVELS", overShort: "A: LEVELS"
      },
      padLabels: { jump: "UNDO", shoot: "RESTART" }
    };

    // ---------------------------------------------------------------------
    // Save data: unlocked levels + best moves
    // ---------------------------------------------------------------------
    let save = { unlocked: 1, best: {} };
    try { save = Object.assign(save, JSON.parse(localStorage.getItem("stockroom.save") || "{}")); } catch (e) {}
    const store = () => { try { localStorage.setItem("stockroom.save", JSON.stringify(save)); } catch (e) {} };

    // ---------------------------------------------------------------------
    // Level state
    // ---------------------------------------------------------------------
    let pick = Math.min(save.unlocked, LEVELS.length) - 1, lvl = 0, W = 0, H = 0;
    let walls, floor, goals, boxes, player, facing = "down", moves = 0, pushes = 0, undo = [];
    let cleared = false, clearT = 0, t = 0, paused = false, bump = 0;
    let anim = null; // { from:[x,y], to:[x,y], box: index|-1, bfrom, bto, k }
    const key = (x, y) => x + "," + y;

    function load(i) {
      lvl = i; const m = LEVELS[i].map; H = m.length; W = Math.max(...m.map((r) => r.length));
      walls = new Set(); goals = new Set(); boxes = []; floor = new Set(); player = null;
      m.forEach((row, y) => [...row.padEnd(W)].forEach((c, x) => {
        if (c === "#") walls.add(key(x, y));
        if (c === "." || c === "*" || c === "+") goals.add(key(x, y));
        if (c === "$" || c === "*") boxes.push([x, y]);
        if (c === "@" || c === "+") player = [x, y];
      }));
      // flood fill from the player: everything reachable inside the walls is warehouse floor
      const q = [player.slice()]; floor.add(key(...player));
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || walls.has(k) || floor.has(k)) continue;
          floor.add(k); q.push([nx, ny]);
        }
      }
      moves = 0; pushes = 0; undo = []; cleared = false; clearT = 0; anim = null; queued = null; facing = "down";
    }
    const boxAt = (x, y) => boxes.findIndex((b) => b[0] === x && b[1] === y);
    const solved = () => boxes.every((b) => goals.has(key(b[0], b[1])));

    let queued = null; // a press during the slide animation is remembered, not dropped
    function step(dir) {
      if (cleared) return;
      if (anim) { queued = dir; return; }
      const [dx, dy] = DIRS[dir]; facing = dir;
      const nx = player[0] + dx, ny = player[1] + dy;
      if (walls.has(key(nx, ny))) { bump = 0.12; sfx.bump(); return; }
      const bi = boxAt(nx, ny);
      if (bi >= 0) {
        const bx = nx + dx, by = ny + dy;
        if (walls.has(key(bx, by)) || boxAt(bx, by) >= 0) { bump = 0.12; sfx.bump(); return; }
        undo.push({ p: player.slice(), b: boxes.map((b) => b.slice()), m: moves, s: pushes });
        anim = { from: player.slice(), to: [nx, ny], box: bi, bfrom: [nx, ny], bto: [bx, by], k: 0 };
        boxes[bi] = [bx, by]; pushes++;
        goals.has(key(bx, by)) ? sfx.place() : sfx.push();
      } else {
        undo.push({ p: player.slice(), b: boxes.map((b) => b.slice()), m: moves, s: pushes });
        anim = { from: player.slice(), to: [nx, ny], box: -1, k: 0 }; sfx.step();
      }
      player = [nx, ny]; moves++;
      if (undo.length > 400) undo.shift();
      if (solved()) {
        cleared = true; clearT = 0; sfx.win();
        const b = save.best[lvl]; if (!b || moves < b) save.best[lvl] = moves;
        save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lvl + 2)); store();
      }
    }
    function doUndo() {
      if (cleared || !undo.length) return;
      const u = undo.pop(); player = u.p; boxes = u.b; moves = u.m; pushes = u.s; anim = null; queued = null; sfx.undo();
    }
    function next() {
      if (lvl + 1 >= LEVELS.length) { api.state = "over"; return; }
      load(lvl + 1); pick = lvl;
    }

    // ---------------------------------------------------------------------
    // Sound
    // ---------------------------------------------------------------------
    let ac = null;
    function audio() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === "suspended") ac.resume();
    }
    function beep(f, d, delay, type, vol, slide) {
      if (!api.soundOn || !ac) return;
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d);
      g.gain.setValueAtTime(vol || 0.04, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    }
    const sfx = {
      step: () => beep(220, 0.03, 0, "square", 0.015),
      push: () => beep(90, 0.09, 0, "triangle", 0.09, 0.7),
      bump: () => beep(70, 0.06, 0, "square", 0.03),
      place: () => { beep(90, 0.08, 0, "triangle", 0.08, 0.7); beep(988, 0.07, 0.05); beep(1319, 0.12, 0.11); },
      undo: () => beep(500, 0.06, 0, "square", 0.025, 0.6),
      win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.14, 0.1 + i * 0.09, "square", 0.04)),
      pick: () => beep(660, 0.05, 0, "square", 0.025)
    };

    // ---------------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.05); t += dt; bump = Math.max(0, bump - dt);
      if (anim) { anim.k += dt / 0.085; if (anim.k >= 1) { anim = null; if (queued) { const q = queued; queued = null; step(q); } } }
      if (cleared) clearT += dt;
    }

    // ---------------------------------------------------------------------
    // Drawing
    // ---------------------------------------------------------------------
    function txt(g, s, x, y, size, col, align) {
      g.font = size + "px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top";
      g.fillStyle = "#000"; g.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
      g.fillStyle = col; g.fillText(s, x, y);
    }
    const ease = (k) => 1 - (1 - k) * (1 - k);

    function drawBox(g, x, y, s, onBay) {
      const p = Math.max(1, Math.round(s / 12));
      g.fillStyle = C.boxDark; g.fillRect(x + p, y + p, s - p * 2, s - p * 2);
      g.fillStyle = onBay ? "#d7b26a" : C.box; g.fillRect(x + p, y + p, s - p * 2, s - p * 3);
      g.fillStyle = C.tape; g.fillRect(x + s / 2 - p, y + p, p * 2, s - p * 3);
      g.fillStyle = C.boxDark; g.fillRect(x + p * 3, y + s * 0.62, s * 0.3, p);
      if (onBay) { g.fillStyle = C.done; g.fillRect(x + s - p * 5, y + p * 2, p * 3, p * 3); }
    }
    function drawWorker(g, x, y, s, dir) {
      const p = s / 16;
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + 3 * p, y + 13 * p, 10 * p, 2 * p);
      g.fillStyle = "#2a3550"; g.fillRect(x + 5 * p, y + 10 * p, 2.5 * p, 4 * p); g.fillRect(x + 8.5 * p, y + 10 * p, 2.5 * p, 4 * p); // legs
      g.fillStyle = C.vest; g.fillRect(x + 4 * p, y + 5 * p, 8 * p, 6 * p);                                            // hi-vis vest
      g.fillStyle = "#fff4c2"; g.fillRect(x + 4 * p, y + 8 * p, 8 * p, 1 * p);
      g.fillStyle = "#e0a96d"; g.fillRect(x + 5 * p, y + 1.5 * p, 6 * p, 4 * p);                                       // face
      g.fillStyle = "#ffd23f"; g.fillRect(x + 4.5 * p, y + 0.5 * p, 7 * p, 2 * p);                                     // hard hat
      g.fillStyle = C.ink;
      if (dir === "left") g.fillRect(x + 5.5 * p, y + 3 * p, 1.2 * p, 1.2 * p);
      else if (dir === "right") g.fillRect(x + 9.3 * p, y + 3 * p, 1.2 * p, 1.2 * p);
      else if (dir === "down") { g.fillRect(x + 6.3 * p, y + 3 * p, 1.2 * p, 1.2 * p); g.fillRect(x + 8.5 * p, y + 3 * p, 1.2 * p, 1.2 * p); }
      g.fillStyle = "#e0a96d"; // arms reach out the way you're facing
      if (dir === "left") g.fillRect(x + 2 * p, y + 7 * p, 2.5 * p, 2 * p);
      else if (dir === "right") g.fillRect(x + 11.5 * p, y + 7 * p, 2.5 * p, 2 * p);
      else { g.fillRect(x + 3 * p, y + 6 * p, 1.5 * p, 3.5 * p); g.fillRect(x + 11.5 * p, y + 6 * p, 1.5 * p, 3.5 * p); }
    }

    function drawLevel(g, Wpx, Hpx, top, bottom) {
      const availH = Hpx - top - bottom, s = Math.max(6, Math.floor(Math.min(Wpx / W, availH / H)));
      const ox = Math.floor((Wpx - s * W) / 2) + (bump > 0 ? Math.round(Math.sin(bump * 90) * s * 0.06) : 0), oy = top + Math.floor((availH - s * H) / 2);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = key(x, y), px = ox + x * s, py = oy + y * s;
        if (floor.has(k)) {
          g.fillStyle = (x + y) % 2 ? C.floor : C.floor2; g.fillRect(px, py, s, s);
          g.fillStyle = C.line; g.fillRect(px, py, s, 1);
          if (goals.has(k)) { // yellow pallet bay with hatching
            const m = Math.max(1, Math.round(s * 0.1));
            g.fillStyle = C.bay; g.fillRect(px + m, py + m, s - m * 2, s - m * 2);
            g.fillStyle = (x + y) % 2 ? C.floor : C.floor2; g.fillRect(px + m * 2, py + m * 2, s - m * 4, s - m * 4);
            g.fillStyle = "#7a6a2a"; for (let i = 1; i < 4; i++) g.fillRect(px + m * 2, py + (s * i) / 4, s - m * 4, Math.max(1, m / 2));
          }
        } else if (walls.has(k)) { // racking: dark frame, orange beams, a few boxes on shelves
          g.fillStyle = C.rack; g.fillRect(px, py, s, s);
          g.fillStyle = C.post; g.fillRect(px, py, Math.max(1, s / 10), s); g.fillRect(px + s - Math.max(1, s / 10), py, Math.max(1, s / 10), s);
          g.fillStyle = C.beam; g.fillRect(px, py + s * 0.45, s, Math.max(1, s / 10)); g.fillRect(px, py + s * 0.92, s, Math.max(1, s / 12));
          if ((x * 7 + y * 3) % 3 === 0) { g.fillStyle = C.boxDark; g.fillRect(px + s * 0.2, py + s * 0.2, s * 0.28, s * 0.25); }
          if ((x * 5 + y) % 4 === 1) { g.fillStyle = "#4d6a8a"; g.fillRect(px + s * 0.55, py + s * 0.6, s * 0.3, s * 0.32); }
        }
      }
      // boxes (the one being pushed slides with the worker)
      boxes.forEach((b, i) => {
        let bx = b[0], by = b[1];
        if (anim && anim.box === i) { const e = ease(anim.k); bx = anim.bfrom[0] + (anim.bto[0] - anim.bfrom[0]) * e; by = anim.bfrom[1] + (anim.bto[1] - anim.bfrom[1]) * e; }
        drawBox(g, ox + bx * s, oy + by * s, s, goals.has(key(b[0], b[1])) && (!anim || anim.box !== i || anim.k > 0.8));
      });
      let wx = player[0], wy = player[1];
      if (anim) { const e = ease(anim.k); wx = anim.from[0] + (anim.to[0] - anim.from[0]) * e; wy = anim.from[1] + (anim.to[1] - anim.from[1]) * e; }
      const hop = anim ? Math.sin(anim.k * Math.PI) * s * 0.06 : 0;
      drawWorker(g, ox + wx * s, oy + wy * s - hop, s, facing);
    }

    function drawScreen(g, Wpx, Hpx) {
      const k = Wpx / 320, fs = Math.max(8, Math.round(8 * k)), pad = Math.max(3, Math.round(5 * k));
      g.save(); g.imageSmoothingEnabled = false;
      g.fillStyle = "#14161c"; g.fillRect(0, 0, Wpx, Hpx);

      if (api.state === "menu") {
        if (lvl !== pick || !walls) load(pick);
        const hud = Math.round(fs * 4.6), foot = Math.round(fs * 3.2);
        drawLevel(g, Wpx, Hpx, hud, foot);
        g.fillStyle = "rgba(20,22,28,.6)"; g.fillRect(0, hud, Wpx, Hpx - hud - foot);
        const ts = Math.max(10, Math.round(16 * k));
        g.fillStyle = "#000"; g.fillRect(0, 0, Wpx, hud);
        g.font = ts + "px " + FONT; const w1 = g.measureText("STOCK ").width, w2 = g.measureText("ROOM").width, x0 = (Wpx - w1 - w2) / 2;
        txt(g, "STOCK ", x0, pad, ts, C.box); txt(g, "ROOM", x0 + w1, pad, ts, C.bay);
        txt(g, "PUSH BOXES ONTO THE BAYS", Wpx / 2, pad + ts * 1.6, Math.max(8, Math.round(fs * (Wpx >= 300 ? 0.85 : 0.6))), C.grey, "center");
        // level picker
        const L = LEVELS[pick], py = Math.round(Hpx / 2 - fs);
        g.fillStyle = "rgba(0,0,0,.75)"; g.fillRect(0, py - pad, Wpx, fs * 3.4 + pad);
        txt(g, (pick > 0 ? "< " : "  ") + "LEVEL " + (pick + 1) + "/" + LEVELS.length + (pick + 1 < save.unlocked ? " >" : "  "), Wpx / 2, py, fs, C.white, "center");
        txt(g, L.name, Wpx / 2, py + fs * 1.6, fs, C.bay, "center");
        g.fillStyle = "#000"; g.fillRect(0, Hpx - foot, Wpx, foot);
        const b = save.best[pick];
        txt(g, b ? "BEST " + b + "  PAR " + L.par : "PAR " + L.par, Wpx / 2, Hpx - foot + Math.round((foot - fs) / 2), fs, b && b <= L.par ? C.done : C.grey, "center");
        g.restore(); return;
      }
      if (api.state === "over") {
        const ts = Math.max(10, Math.round(14 * k));
        txt(g, "ALL ORDERS", Wpx / 2, Hpx * 0.2, ts, C.bay, "center"); txt(g, "SHIPPED!", Wpx / 2, Hpx * 0.2 + ts * 1.4, ts, C.done, "center");
        const perfect = LEVELS.filter((L, i) => save.best[i] && save.best[i] <= L.par).length;
        txt(g, "PAR ON " + perfect + "/" + LEVELS.length, Wpx / 2, Hpx * 0.2 + ts * 3.2, fs, C.white, "center");
        g.restore(); return;
      }

      // playing: HUD bar on top, level in the middle, controls along the bottom
      const hud = Math.round(fs * 2.2), foot = Math.round(fs * 2.2);
      drawLevel(g, Wpx, Hpx, hud, foot);
      g.fillStyle = "#000"; g.fillRect(0, 0, Wpx, hud); g.fillRect(0, Hpx - foot, Wpx, foot);
      const ty = Math.round((hud - fs) / 2);
      txt(g, "L" + (lvl + 1) + (Wpx >= 300 ? " " + LEVELS[lvl].name : ""), pad, ty, fs, C.bay);
      txt(g, (Wpx >= 300 ? "MOVES " : "") + moves, Wpx - pad, ty, fs, moves <= LEVELS[lvl].par ? C.white : C.grey, "right");
      const done = boxes.filter((b) => goals.has(key(b[0], b[1]))).length;
      txt(g, done + "/" + boxes.length + (Wpx >= 300 ? " ON BAYS" : ""), pad, Hpx - foot + ty, fs, done === boxes.length ? C.done : C.grey);
      txt(g, "PAR " + LEVELS[lvl].par, Wpx - pad, Hpx - foot + ty, fs, C.grey, "right");
      if (cleared && clearT > 0.25) {
        const ts = Math.max(10, Math.round(14 * k)), by = Math.round(Hpx / 2 - ts * 1.6);
        g.fillStyle = "rgba(0,0,0,.78)"; g.fillRect(0, by - pad, Wpx, ts * 3.4 + fs * 2 + pad * 2);
        txt(g, "ORDER SHIPPED!", Wpx / 2, by, ts, C.done, "center");
        const perfect = moves <= LEVELS[lvl].par;
        txt(g, moves + " MOVES" + (perfect ? "  PAR!" : ""), Wpx / 2, by + ts * 1.6, fs, perfect ? C.bay : C.white, "center");
        if (Math.floor(t * 2.5) % 2 === 0) txt(g, lvl + 1 < LEVELS.length ? "A: NEXT LEVEL" : "A: FINISH", Wpx / 2, by + ts * 1.6 + fs * 1.9, fs, C.cyan, "center");
      }
      g.restore();
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    function begin() { load(pick); api.state = "game"; }
    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k !== "start") return;
        if (api.state === "menu") begin();
        else if (api.state === "over") { api.state = "menu"; pick = Math.min(save.unlocked, LEVELS.length) - 1; }
        else if (cleared) next();
        else { load(lvl); sfx.undo(); } // RESTART on the touch pad
      },
      hold(k, down) {
        if (!down) return;
        audio();
        if (api.state === "menu") {
          if (k === "left" && pick > 0) { pick--; sfx.pick(); }
          else if (k === "right" && pick + 1 < Math.min(save.unlocked, LEVELS.length)) { pick++; sfx.pick(); }
          else if (k === "jump" || k === "shoot") begin();
          return;
        }
        if (api.state === "over") { if (k === "jump") { api.state = "menu"; } return; }
        if (cleared) { if (k === "jump" || k === "shoot") next(); return; }
        if (DIRS[k]) step(k);
        else if (k === "jump") doUndo();
        else if (k === "shoot") { load(lvl); sfx.undo(); }
      },
      click() { if (api.state === "menu") begin(); else if (cleared) next(); },
      release() {},
      toMenu() { api.state = "menu"; paused = false; pick = Math.min(save.unlocked, LEVELS.length) - 1; load(pick); },
      pause(p) { paused = !!p; },
      stop() { paused = true; if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ lvl, player, boxes, moves, cleared, state: api.state, pick, facing })
    });
    load(pick);
    return api;
  }

  window.StockRoom = { create };
})();
