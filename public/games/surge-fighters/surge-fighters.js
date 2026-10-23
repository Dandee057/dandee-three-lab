/* =========================================================================
   SURGE FIGHTERS: a 2D fighting game for the console cartridges, in the
   spirit of the arcade fighters and the flashy anime ones.

   Pick one of three fighters and win the arcade ladder (best of 3 rounds):
     KAI    balanced · SURGE SHOT (energy ball)  · super SURGE BEAM
     RHEA   fast     · SPIN KICK (rising, beats jump-ins) · super STAR RUSH
     BRUNO  heavy    · QUAKE STOMP (ground wave) · super METEOR DROP
   then face your own SHADOW.

   Controls: ← → move (hold back to block) · double-tap ← / → to dash
             ↑ jump · A (Space) attack, press again to chain a 3-hit combo
             B (X) special · ↓ + B super (when the SURGE meter is full)

   Drawn on a small logical screen (256×144 wide, 160×144 narrow) and scaled
   up, with a camera that follows the fight. Fixed 60 fps simulation.
   Same engine API as the other cartridges (see gba.js), grid: true.
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const LH = 144, GROUND = 128, STAGE_W = 440, GRAV = 0.32, STEP = 1 / 60;

  // ---------------------------------------------------------------------
  // Poses: joint positions (x forward, y up from the floor), ~44 units tall
  // ---------------------------------------------------------------------
  const J = ["hip", "neck", "head", "kneeB", "footB", "kneeF", "footF", "elbowB", "handB", "elbowF", "handF"];
  const P = (a) => { const o = {}; J.forEach((k, i) => (o[k] = [a[i * 2], a[i * 2 + 1]])); return o; };
  const POSE = {
    idle1: P([0, 22, 1, 36, 2, 42, -4, 12, -7, 0, 5, 12, 7, 0, -2, 30, 3, 34, 6, 31, 9, 36]),
    idle2: P([0, 21, 1, 35, 2, 41, -4, 11, -7, 0, 5, 11, 7, 0, -2, 29, 3, 33, 6, 30, 9, 35]),
    walk1: P([0, 22, 2, 36, 3, 42, -2, 11, -4, 0, 4, 12, 8, 1, -2, 30, 3, 34, 6, 31, 9, 36]),
    walk2: P([0, 22, 2, 36, 3, 42, -5, 12, -9, 1, 2, 11, 3, 0, -2, 30, 3, 34, 6, 31, 9, 36]),
    dash: P([2, 20, 9, 31, 12, 36, -6, 12, -13, 6, 7, 13, 6, 0, 2, 26, -5, 24, 6, 26, 0, 22]),
    jump: P([0, 26, 1, 39, 2, 45, -3, 20, -6, 14, 6, 22, 4, 14, -3, 34, 1, 40, 6, 34, 9, 39]),
    punch1: P([1, 22, 3, 36, 4, 42, -4, 12, -7, 0, 5, 12, 8, 0, -1, 30, 3, 34, 10, 34, 18, 35]),
    punch2: P([2, 22, 5, 35, 7, 41, -4, 12, -8, 0, 6, 12, 9, 0, 9, 33, 18, 34, 4, 30, 7, 34]),
    kick3: P([-1, 23, -3, 36, -4, 42, -3, 11, -5, 0, 8, 28, 19, 31, -6, 31, -2, 35, 2, 31, 5, 36]),
    airkick: P([0, 26, -1, 38, -1, 44, -3, 20, -4, 13, 8, 24, 17, 20, -5, 34, -2, 39, 5, 34, 8, 38]),
    block: P([-1, 20, -1, 33, 0, 39, -4, 10, -7, 0, 4, 10, 6, 0, 3, 29, 5, 37, 5, 31, 6, 39]),
    hurt: P([-2, 21, -5, 34, -7, 39, -4, 11, -7, 0, 4, 11, 5, 0, -8, 30, -11, 26, -4, 31, -7, 26]),
    knock: P([0, 14, -12, 17, -17, 18, 7, 18, 14, 16, 8, 13, 15, 11, -6, 22, -10, 26, -4, 12, -9, 9]),
    down: P([0, 3, -13, 3, -18, 4, 7, 5, 15, 2, 8, 4, 16, 1, -7, 3, -11, 1, -5, 2, -9, 0]),
    special: P([0, 20, 3, 34, 5, 40, -6, 10, -10, 0, 7, 11, 10, 0, 7, 28, 15, 27, 8, 30, 16, 31]),
    charge: P([-1, 19, -1, 33, 0, 39, -6, 10, -9, 0, 6, 10, 8, 0, -4, 27, -7, 23, -2, 28, -6, 25]),
    spin: P([0, 26, 0, 39, 1, 45, -3, 18, -2, 12, 6, 30, 16, 36, -6, 36, -10, 40, 6, 36, 10, 40]),
    win: P([0, 22, 0, 36, 0, 42, -4, 11, -6, 0, 4, 11, 6, 0, -4, 30, -3, 25, 4, 43, 4, 52]),
    slam: P([0, 22, 2, 34, 3, 40, -5, 10, -9, 0, 6, 10, 9, 0, 6, 26, 14, 18, 7, 26, 15, 19])
  };
  const lerpPose = (a, b, t) => { const o = {}; J.forEach((k) => (o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t])); return o; };

  // ---------------------------------------------------------------------
  // Fighters
  // ---------------------------------------------------------------------
  const FIGHTERS = {
    KAI: { hp: 100, walk: 1.35, dash: 4.6, jump: -5.7, dmg: 1, scale: 1.25, special: "ball", superName: "SURGE BEAM", superKind: "beam",
      col: { gi: "#2f6fe0", pants: "#f08a24", belt: "#1b2a5c", skin: "#f1c08f", hair: "#16161e", aura: "#6ee7ff" }, hair: "spiky",
      blurb: ["BALANCED", "SURGE SHOT", "SUPER: SURGE BEAM"] },
    RHEA: { hp: 95, walk: 1.7, dash: 5.4, jump: -6.1, dmg: 0.95, scale: 1.18, special: "spin", superName: "STAR RUSH", superKind: "rush", fast: 1,
      col: { gi: "#e5487f", pants: "#2a1e3e", belt: "#ffd23f", skin: "#e8b07e", hair: "#ff9f1c", aura: "#ffb3d1" }, hair: "tail",
      blurb: ["FAST", "SPIN KICK", "SUPER: STAR RUSH"] },
    BRUNO: { hp: 115, walk: 1.05, dash: 3.6, jump: -5.1, dmg: 1.2, scale: 1.42, special: "quake", superName: "METEOR DROP", superKind: "meteor",
      col: { gi: "#3f9a4c", pants: "#4a3a2a", belt: "#c9a227", skin: "#b9805a", hair: "#3a2516", aura: "#9cff8a" }, hair: "beard",
      blurb: ["HEAVY", "QUAKE STOMP", "SUPER: METEOR DROP"] }
  };
  const ROSTER = ["KAI", "RHEA", "BRUNO"];
  const ATK = {
    a1: { st: 4, act: 3, rec: 8, dmg: 4, hx: [6, 22], hy: [28, 40], stun: 16, push: 2.4, pose: "punch1", next: "a2" },
    a2: { st: 5, act: 3, rec: 10, dmg: 5, hx: [6, 22], hy: [26, 40], stun: 18, push: 2.8, pose: "punch2", next: "a3" },
    a3: { st: 7, act: 4, rec: 17, dmg: 8, hx: [4, 26], hy: [18, 34], stun: 30, push: 0, knock: [3.2, -4.8], pose: "kick3" },
    air: { st: 4, act: 7, rec: 6, dmg: 6, hx: [2, 22], hy: [8, 26], stun: 18, push: 2, pose: "airkick" }
  };

  function create(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true, grid: true,
      hints: {
        menu: "ENTER / A: START", menuShort: "A: START",
        play: "SPACE: ATTACK  X: SPECIAL  DOWN+X: SUPER", playShort: "A:HIT B:SPECIAL",
        over: "ENTER / A: PLAY AGAIN", overShort: "A: AGAIN"
      },
      padLabels: { jump: "ATTACK", shoot: "SPECIAL" }
    };

    // ---------------------------------------------------------------------
    // Match state
    // ---------------------------------------------------------------------
    let ui = "title", pick = 0, ladder = [], rung = 0, playerName = "KAI";
    let f1 = null, f2 = null, shots = [], fx = [], camX = 0, shake = 0, freeze = 0, slowmo = 0, flash = 0;
    let round = 1, wins = [0, 0], timer = 60, phase = "intro", phaseT = 0, banner = "", bannerT = 0, superCut = null;
    let paused = false, acc = 0, t = 0, frame = 0;
    const held = new Set();
    let lastTap = { left: -99, right: -99 };

    // ---------------------------------------------------------------------
    // Fighter instances
    // ---------------------------------------------------------------------
    function makeFighter(name, x, face, cpu, shadow, level) {
      const D = FIGHTERS[name];
      return { name, D, x, y: 0, vx: 0, vy: 0, face, hp: D.hp, maxhp: D.hp, meter: 0, state: "idle", st: 0, atk: null, atkT: 0, hitDone: false, queued: null,
        stun: 0, combo: 0, inv: 0, cool: 0, cpu, shadow, level: level || 0, ai: { t: 0, hold: null, block: false }, superT: 0, superHits: 0, grabbed: false, walkT: 0, dashT: 0, airDash: false };
    }
    const other = (f) => (f === f1 ? f2 : f1);
    const grounded = (f) => f.y <= 0.01;
    const actionable = (f) => ["idle", "walk", "block"].includes(f.state) && f.stun <= 0;
    const holding = (f, k) => (f.cpu ? f.ai.hold === k || (k === "back" && f.ai.block) : k === "back" ? held.has(f.face > 0 ? "left" : "right") : k === "fwd" ? held.has(f.face > 0 ? "right" : "left") : held.has(k));

    function startMatch() {
      const opp = ladder[rung];
      f1 = makeFighter(playerName, 150, 1, false);
      f2 = makeFighter(opp.name, 290, -1, true, opp.shadow, opp.level);
      wins = [0, 0]; round = 1; startRound();
    }
    function startRound() {
      const gap = Math.min(70, lastLW / 2 - 34); camX = STAGE_W / 2 - lastLW / 2; // start apart, both on screen
      [f1, f2].forEach((f, i) => Object.assign(f, { x: STAGE_W / 2 + (i ? gap : -gap), y: 0, vx: 0, vy: 0, face: i ? -1 : 1, hp: f.maxhp, state: "idle", atk: null, stun: 0, combo: 0, inv: 0, cool: 0, superT: 0, grabbed: false }));
      shots = []; fx = []; timer = 60; phase = "intro"; phaseT = 0; superCut = null; slowmo = 0; freeze = 0;
      setBanner("ROUND " + round, 1.2); sfx.round();
    }
    function setBanner(text, dur) { banner = text; bannerT = dur; }

    // ---------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------
    function attack(f) {
      if (f.state === "attack" && f.atk && f.atk.next && f.atkT >= f.atk.st) { f.queued = f.atk.next; return; }
      if (!grounded(f) && ["jump", "airdash"].includes(f.state)) { startAtk(f, "air"); return; }
      if (actionable(f) && grounded(f)) startAtk(f, "a1");
    }
    function startAtk(f, id) {
      const base = ATK[id], fast = f.D.fast ? 1 : 0;
      f.atk = Object.assign({ id }, base, { st: Math.max(2, base.st - fast), rec: Math.max(4, base.rec - fast) });
      f.state = "attack"; f.atkT = 0; f.hitDone = false; f.queued = null; sfx.swing();
      if (grounded(f)) f.vx = id === "a3" ? f.face * 1.4 : f.face * 0.6;
    }
    function special(f) {
      if (holding(f, "down") && f.meter >= 100 && (actionable(f) || f.state === "attack")) { superMove(f); return; }
      if (!actionable(f) || !grounded(f) || f.cool > 0) return;
      f.state = "special"; f.st = 0; f.hitDone = false; f.cool = 0.7;
      if (f.D.special === "spin") { f.inv = 8; }
      sfx.special(f.D.special);
    }
    function superMove(f) {
      f.meter = 0; f.state = "super"; f.st = 0; f.superT = 0; f.superHits = 0; f.inv = 30; f.vx = 0; f.hitDone = false;
      superCut = { f, t: 0 }; flash = 0.4; sfx.superStart();
    }
    function jump(f) {
      if (!actionable(f) || !grounded(f)) return;
      f.vy = -f.D.jump * 1; f.state = "jump"; f.airDash = false;
      f.vx = (holding(f, "fwd") ? 1.9 : holding(f, "back") ? -1.9 : 0) * f.face; sfx.jump();
    }
    function dash(f, dir) { // dir: +1 forward, -1 back (relative to facing)
      if (grounded(f) && actionable(f)) { f.state = "dash"; f.dashT = dir > 0 ? 12 : 9; f.vx = f.face * dir * (dir > 0 ? f.D.dash : f.D.dash * 0.8); sfx.dash(); }
      else if (!grounded(f) && f.state === "jump" && !f.airDash) { f.state = "airdash"; f.dashT = 12; f.airDash = true; f.vx = f.face * dir * f.D.dash * 0.9; f.vy = 0; sfx.dash(); }
    }

    // ---------------------------------------------------------------------
    // Hit resolution
    // ---------------------------------------------------------------------
    function hurtbox(f) { const s = f.D.scale; return f.state === "down" ? null : { x0: f.x - 8 * s, x1: f.x + 8 * s, y0: f.y, y1: f.y + 44 * s }; }
    function overlap(a, b) { return a && b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
    function boxFor(f, hx, hy) { const s = f.D.scale, xa = f.x + f.face * hx[0] * s, xb = f.x + f.face * hx[1] * s; return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: f.y + hy[0] * s, y1: f.y + hy[1] * s }; }
    function canBlock(d, a) { return grounded(d) && (actionable(d) || d.state === "block") && holding(d, "back") && Math.sign(a.x - d.x) === d.face; }
    function hit(a, d, h) { // h: { dmg, stun, push, knock, chip, from }
      if (d.inv > 0 || d.state === "down" || d.state === "ko") return false;
      const px = h.from != null ? h.from : a.x;
      if (canBlock(d, { x: px })) {
        d.state = "block"; d.stun = Math.round(h.stun * 0.6); d.vx = -d.face * (h.push || 2) * 0.8;
        d.hp = Math.max(1, d.hp - (h.chip || 0)); a.meter = Math.min(100, a.meter + 2); d.meter = Math.min(100, d.meter + 3);
        spark(d.x + d.face * 6, d.y + 30, "#9fd3ff", 6); sfx.block(); return true;
      }
      const inStun = d.state === "hurt" || d.state === "knock";
      d.combo = inStun ? d.combo + 1 : 1;
      const scaleDmg = Math.max(0.45, 1 - 0.1 * (d.combo - 1));
      const dmg = Math.max(1, Math.round(h.dmg * a.D.dmg * scaleDmg));
      d.hp = Math.max(0, d.hp - dmg);
      a.meter = Math.min(100, a.meter + dmg * 1.6); d.meter = Math.min(100, d.meter + dmg * 0.9);
      const dir = Math.sign(d.x - px) || a.face;
      if (h.knock || !grounded(d) || d.hp <= 0) { d.state = "knock"; d.vx = dir * (h.knock ? h.knock[0] : 2); d.vy = h.knock ? -h.knock[1] : 3.2; d.y = Math.max(d.y, 1); }
      else { d.state = "hurt"; d.stun = h.stun; d.vx = dir * (h.push || 2); }
      d.atk = null; d.superT = 0;
      shake = Math.min(0.25, 0.06 + dmg * 0.012); freeze = Math.max(freeze, dmg >= 8 ? 0.08 : 0.04);
      spark(d.x - dir * 4, d.y + 28 * d.D.scale, dmg >= 8 ? "#fff36b" : "#ffffff", 6 + dmg);
      sfx.hit(dmg);
      if (d.hp <= 0) ko(a, d);
      return true;
    }
    function ko(a, d) {
      d.state = "knock"; d.vx = Math.sign(d.x - a.x) * 3; d.vy = 5.2; d.y = Math.max(1, d.y);
      phase = "ko"; phaseT = 0; slowmo = 1.2; setBanner("K.O.", 2.2); sfx.ko();
    }
    function spark(x, y, col, size) { fx.push({ k: "spark", x, y, col, size, t: 0, life: 0.18 }); }

    // ---------------------------------------------------------------------
    // Fighter update (one 60 fps frame)
    // ---------------------------------------------------------------------
    function stepFighter(f) {
      const o = other(f), s = f.D.scale;
      f.cool = Math.max(0, f.cool - STEP); if (f.inv > 0) f.inv--;
      if (phase !== "fight" && f.state !== "knock" && f.state !== "down" && f.state !== "ko" && f.state !== "win") { f.vx *= 0.8; if (grounded(f)) f.state = f.state === "win" ? "win" : "idle"; }
      // facing
      if (grounded(f) && ["idle", "walk", "block"].includes(f.state)) f.face = o.x >= f.x ? 1 : -1;

      switch (f.state) {
        case "idle": case "walk": {
          if (phase !== "fight") break;
          const fwd = holding(f, "fwd"), back = holding(f, "back");
          if (fwd || back) { f.state = "walk"; f.vx = f.face * (fwd ? f.D.walk : -f.D.walk * 0.8); f.walkT++; }
          else { f.state = "idle"; f.vx *= 0.6; }
          break;
        }
        case "block": if (--f.stun <= 0) { f.state = "idle"; f.stun = 0; } f.vx *= 0.85; break;
        case "hurt": if (--f.stun <= 0) { f.state = "idle"; f.combo = 0; } f.vx *= 0.85; break;
        case "dash": f.vx *= 0.9; if (--f.dashT <= 0) f.state = "idle"; break;
        case "airdash": f.vy = 0; if (--f.dashT <= 0) { f.state = "jump"; } break;
        case "attack": {
          const A = f.atk; f.atkT++;
          if (grounded(f)) f.vx *= 0.82;
          const active = f.atkT > A.st && f.atkT <= A.st + A.act;
          if (active && !f.hitDone && overlap(boxFor(f, A.hx, A.hy), hurtbox(o))) { f.hitDone = true; hit(f, o, { dmg: A.dmg, stun: A.stun, push: A.push, knock: A.knock }); }
          const total = A.st + A.act + A.rec;
          if (f.queued && f.hitDone && f.atkT >= A.st + A.act) { startAtk(f, f.queued); break; }
          if (f.atkT >= total) { f.state = grounded(f) ? "idle" : "jump"; f.atk = null; }
          break;
        }
        case "special": specialStep(f, o); break;
        case "super": superStep(f, o); break;
        case "knock": f.atk = null; break;
        case "down": f.vx *= 0.7; if (--f.stun <= 0) { if (f.hp <= 0) { f.state = "ko"; } else { f.state = "idle"; f.inv = 14; f.combo = 0; } } break;
      }
      // physics
      const airborne = !grounded(f) || f.vy > 0;
      if (airborne && f.state !== "airdash") { f.vy -= GRAV; }
      f.x += f.vx; f.y += f.vy > 0 || !grounded(f) ? f.vy : 0;
      if (f.y <= 0 && (airborne || f.y < 0)) {
        f.y = 0;
        if (f.state === "knock") { f.state = "down"; f.stun = f.hp <= 0 ? 999 : 34; f.vx *= 0.4; f.vy = 0; shake = Math.max(shake, 0.1); sfx.thud(); }
        else if (f.vy < 0) { f.vy = 0; if (["jump", "airdash"].includes(f.state) || (f.state === "attack" && f.atk && f.atk.id === "air")) { f.state = "idle"; f.atk = null; f.vx = 0; } }
        if (f.state === "super" && f.D.superKind === "meteor" && f.superT > 12) meteorLand(f, o);
      }
      if (f.y > 0 && f.state === "idle") f.state = "jump";
      // stay on stage and on screen
      const lw = lastLW;
      f.x = Math.max(12, Math.min(STAGE_W - 12, f.x));
      f.x = Math.max(camX + 10, Math.min(camX + lw - 10, f.x));
    }

    function specialStep(f, o) {
      f.st++; const s = f.D.scale;
      if (f.D.special === "ball") {
        if (f.st === 10) { shots.push({ k: "ball", owner: f, x: f.x + f.face * 16 * s, y: f.y + 31 * s, vx: f.face * 3.4, life: 2.4, r: 6 }); sfx.ball(); }
        if (f.st >= 28) f.state = "idle";
      } else if (f.D.special === "spin") {
        if (f.st === 3) { f.vy = 6.2; f.vx = f.face * 1.4; }
        if (f.st >= 3 && f.st <= 20 && !f.hitDone && overlap({ x0: f.x - 16, x1: f.x + 16, y0: f.y + 6, y1: f.y + 48 }, hurtbox(o))) { f.hitDone = true; hit(f, o, { dmg: 9, stun: 26, knock: [2.6, -5.4], chip: 1 }); }
        if (f.st > 6 && grounded(f)) { f.state = "idle"; f.vx = 0; }
      } else if (f.D.special === "quake") {
        if (f.st === 14) { shots.push({ k: "wave", owner: f, x: f.x + f.face * 14 * s, y: 0, vx: f.face * 2.8, life: 1.6, r: 10 }); shake = 0.12; sfx.quake(); }
        if (f.st >= 34) f.state = "idle";
      }
    }
    function superStep(f, o) {
      f.superT++; const k = f.D.superKind, s = f.D.scale;
      if (superCut && superCut.f === f) return;
      if (k === "beam") {
        if (f.superT < 18) { f.vx = 0; return; }
        if (f.superT === 18) sfx.beam();
        const x0 = f.x + f.face * 16 * s, box = { x0: f.face > 0 ? x0 : -999, x1: f.face > 0 ? 9999 : x0, y0: f.y + 20 * s, y1: f.y + 44 * s };
        if (f.superT <= 68 && f.superT % 6 === 0 && overlap(box, hurtbox(o))) { f.superHits++; hit(f, o, { dmg: f.superHits >= 8 ? 6 : 3, stun: 10, push: 0.6, knock: f.superHits >= 8 ? [3.5, -5] : null, chip: 1, from: f.x }); if (o.state === "knock" && f.superHits < 8) { o.vy = 0; o.state = "hurt"; o.stun = 10; } }
        if (f.superT > 82) f.state = "idle";
      } else if (k === "rush") {
        if (!f.grabbed) {
          f.vx = f.face * 7.2;
          if (overlap({ x0: f.x - 14, x1: f.x + 14, y0: f.y, y1: f.y + 44 }, hurtbox(o)) && o.inv <= 0 && o.state !== "down") {
            if (canBlock(o, f)) { hit(f, o, { dmg: 6, stun: 20, push: 3, chip: 4 }); f.state = "idle"; f.vx = 0; return; }
            f.grabbed = true; f.superT = 0; f.vx = 0; o.state = "hurt"; o.stun = 99; o.vx = 0;
          } else if (f.superT > 34) { f.state = "idle"; f.vx = 0; }
        } else {
          o.x = f.x + f.face * 16; o.vx = 0;
          if (f.superT % 5 === 0 && f.superT <= 40) { f.x += f.face * 2; hit(f, o, { dmg: 3, stun: 99, push: 0 }); o.state = o.hp > 0 ? "hurt" : o.state; o.stun = 99; fx.push({ k: "star", x: o.x + (rng() - 0.5) * 20, y: o.y + 20 + rng() * 20, t: 0, life: 0.25 }); }
          if (f.superT === 46) { o.stun = 0; hit(f, o, { dmg: 9, stun: 30, knock: [4.2, -6.2] }); f.grabbed = false; f.state = "idle"; }
        }
      } else if (k === "meteor") {
        if (f.superT === 1) { f.vy = 6.4; f.vx = Math.max(-4, Math.min(4, (o.x - f.x) / 32)); f.y = 0.5; }
      }
    }
    function meteorLand(f, o) {
      shake = 0.35; flash = 0.3; sfx.quake(); sfx.ko();
      fx.push({ k: "shock", x: f.x, y: 0, t: 0, life: 0.45 });
      if (Math.abs(o.x - f.x) < 62 && o.y < 30) hit(f, o, { dmg: 30, stun: 30, knock: [4, -6.6], chip: 5, from: f.x });
      f.state = "idle"; f.vx = 0;
    }

    // ---------------------------------------------------------------------
    // Projectiles + effects
    // ---------------------------------------------------------------------
    function stepShots() {
      shots.forEach((p) => {
        p.x += p.vx; p.life -= STEP;
        const o = other(p.owner);
        const box = p.k === "wave" ? { x0: p.x - 8, x1: p.x + 8, y0: 0, y1: 14 } : { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r };
        if (overlap(box, hurtbox(o)) && o.inv <= 0) { if (hit(p.owner, o, p.k === "wave" ? { dmg: 10, stun: 22, knock: [2.4, -4.6], chip: 2, from: p.x - p.vx * 4 } : { dmg: 8, stun: 20, push: 3, chip: 1, from: p.x - p.vx * 4 })) p.life = 0; }
        shots.forEach((q) => { if (q !== p && q.owner !== p.owner && q.k === "ball" && p.k === "ball" && Math.abs(q.x - p.x) < 10 && q.life > 0 && p.life > 0) { q.life = p.life = 0; spark((p.x + q.x) / 2, p.y, "#bdf3ff", 10); sfx.block(); } });
      });
      shots = shots.filter((p) => p.life > 0 && p.x > -20 && p.x < STAGE_W + 20);
      fx.forEach((e) => (e.t += STEP)); fx = fx.filter((e) => e.t < e.life);
    }

    // ---------------------------------------------------------------------
    // CPU opponent
    // ---------------------------------------------------------------------
    function cpuThink(f) {
      const o = other(f), L = f.level, dx = o.x - f.x, dist = Math.abs(dx), A = f.ai;
      A.t -= STEP;
      // react to danger right away (blocking / jumping projectiles), chance scales with level
      const danger = (o.state === "attack" && dist < 44) || (o.state === "super") || shots.some((p) => p.owner === o && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 60);
      if (danger && grounded(f) && actionable(f)) {
        if (A.react == null) A.react = rng() < 0.25 + L * 0.6 ? (rng() < 0.75 ? "block" : "jump") : "none";
        if (A.react === "block") { A.block = true; A.hold = null; return; }
        if (A.react === "jump" && shots.some((p) => p.owner === o)) { A.react = "none"; jump(f); return; }
      } else { A.react = null; A.block = false; }
      if (A.t > 0) return;
      A.t = 0.32 - L * 0.2 + rng() * 0.15; A.hold = null; A.block = false;
      if (!actionable(f) && f.state !== "attack") return;
      const r = rng();
      if (f.meter >= 100 && r < 0.35 + L * 0.3 && (dist < 110 || f.D.superKind === "beam")) { f.ai.hold = "down"; special(f); f.ai.hold = null; return; }
      if (dist > 95) {
        if (r < 0.35 && f.D.special !== "spin") special(f);
        else if (r < 0.55) dash(f, 1); else A.hold = "fwd";
      } else if (dist > 34) {
        if (r < 0.15 + L * 0.1 && !grounded(o) && f.D.special === "spin") special(f);
        else if (r < 0.25) { A.hold = "fwd"; jump(f); }
        else if (r < 0.4 && f.D.special === "quake") special(f);
        else A.hold = "fwd";
      } else {
        if (o.state === "jump" && f.D.special === "spin" && r < 0.5) special(f);
        else if (r < 0.65 + L * 0.2) attack(f);
        else if (r < 0.8) A.hold = "back"; else dash(f, -1);
      }
    }
    function cpuCombo(f) { // keep pressing A to finish strings that land
      if (f.state === "attack" && f.atk && f.atk.next && f.hitDone && rng() < 0.4 + f.level * 0.6) f.queued = f.atk.next;
    }

    // ---------------------------------------------------------------------
    // Frame
    // ---------------------------------------------------------------------
    function stepFrame() {
      frame++;
      if (superCut) { superCut.t += STEP; if (superCut.t > 0.45) superCut = null; return; }
      if (freeze > 0) { freeze -= STEP; return; }
      if (phase === "intro") { phaseT += STEP; if (phaseT > 1.2 && banner !== "FIGHT!") { setBanner("FIGHT!", 0.7); sfx.fight(); } if (phaseT > 1.6) phase = "fight"; }
      if (phase === "fight") {
        timer -= STEP;
        if (timer <= 0) { timer = 0; phase = "ko"; phaseT = 0; setBanner("TIME", 2); const a = f1.hp / f1.maxhp, b = f2.hp / f2.maxhp; if (a !== b) (a > b ? f2 : f1).hp = 0; sfx.ko(); }
        if (f2.cpu) { cpuThink(f2); cpuCombo(f2); }
      }
      stepFighter(f1); stepFighter(f2);
      // push bodies apart
      const dx = f2.x - f1.x;
      if (Math.abs(dx) < 16 && Math.abs(f1.y - f2.y) < 30 && f1.state !== "down" && f2.state !== "down") { const push = (16 - Math.abs(dx)) / 2, s = Math.sign(dx) || 1; f1.x -= s * push; f2.x += s * push; }
      stepShots();
      if (phase === "ko") {
        phaseT += STEP;
        if (phaseT > 2.6) endRound();
      }
      // camera follows the middle of the fight
      const mid = (f1.x + f2.x) / 2, target = Math.max(0, Math.min(STAGE_W - lastLW, mid - lastLW / 2));
      camX += (target - camX) * 0.15;
    }
    function endRound() {
      const p1Won = f2.hp <= 0 && f1.hp > 0 ? true : f1.hp <= 0 && f2.hp > 0 ? false : f1.hp >= f2.hp;
      wins[p1Won ? 0 : 1]++;
      if (wins[0] >= 2 || wins[1] >= 2) {
        const won = wins[0] >= 2;
        (won ? f1 : f2).state = "win";
        phase = "result"; phaseT = 0; setBanner(won ? "YOU WIN!" : "YOU LOSE", 99); sfx[won ? "win" : "lose"]();
        return;
      }
      round++; startRound();
    }
    function afterResult() {
      const won = wins[0] >= 2;
      if (!won) { ui = "continue"; return; }
      rung++;
      if (rung >= ladder.length) { api.state = "over"; ui = "champion"; sfx.win(); return; }
      ui = "vs"; phaseT = 0;
    }

    // ---------------------------------------------------------------------
    // Sound (WebAudio blips + noise, no files)
    // ---------------------------------------------------------------------
    let ac = null, noise = null;
    function audio() {
      if (!ac && typeof window !== "undefined") { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && !noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      if (ac && ac.state === "suspended") ac.resume();
    }
    function beep(f, d, delay, type, vol, slide) {
      if (!api.soundOn || !ac) return;
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + d);
      g.gain.setValueAtTime(vol || 0.04, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    }
    function hiss(d, vol, freq, delay) {
      if (!api.soundOn || !ac || !noise) return;
      const t0 = ac.currentTime + (delay || 0), src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noise; fl.type = "bandpass"; fl.frequency.value = freq || 1200; g.gain.setValueAtTime(vol || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
      src.connect(fl).connect(g).connect(ac.destination); src.start(t0); src.stop(t0 + d);
    }
    const sfx = {
      swing: () => hiss(0.06, 0.05, 2500),
      hit: (d) => { hiss(0.08 + d * 0.006, 0.18, 900); beep(d >= 8 ? 90 : 140, 0.1, 0, "square", 0.06, 0.5); },
      block: () => { hiss(0.05, 0.08, 3500); beep(600, 0.04, 0, "square", 0.025); },
      jump: () => beep(260, 0.12, 0, "square", 0.025, 1.8),
      dash: () => hiss(0.15, 0.08, 1800),
      ball: () => beep(500, 0.3, 0, "sawtooth", 0.05, 0.5),
      special: (k) => (k === "spin" ? hiss(0.25, 0.08, 2200) : beep(180, 0.2, 0, "square", 0.04, 1.5)),
      quake: () => { hiss(0.4, 0.2, 200); beep(60, 0.4, 0, "square", 0.08, 0.6); },
      superStart: () => [392, 523, 784].forEach((f, i) => beep(f, 0.12, i * 0.06, "sawtooth", 0.04)),
      beam: () => { beep(110, 1.3, 0, "sawtooth", 0.06, 1.6); hiss(1.2, 0.08, 700); },
      thud: () => { hiss(0.15, 0.12, 300); beep(70, 0.15, 0, "square", 0.05); },
      ko: () => beep(330, 0.9, 0, "sawtooth", 0.06, 0.25),
      round: () => [523, 523].forEach((f, i) => beep(f, 0.1, i * 0.15, "square", 0.035)),
      fight: () => [523, 784, 1047].forEach((f, i) => beep(f, 0.12, i * 0.07, "square", 0.04)),
      win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.14, i * 0.12, "square", 0.04)),
      lose: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.2, i * 0.18, "triangle", 0.05)),
      menu: () => beep(660, 0.04, 0, "square", 0.025),
      ok: () => beep(990, 0.07, 0, "square", 0.035)
    };

    // ---------------------------------------------------------------------
    // Drawing
    // ---------------------------------------------------------------------
    let lastLW = 256;
    const lc = typeof document !== "undefined" ? document.createElement("canvas") : null;
    function text(g, s, x, y, col, align, size) {
      g.font = (size || 8) + "px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top";
      g.fillStyle = "#000"; g.fillText(s, x + 1, y + 1); g.fillStyle = col || "#fff"; g.fillText(s, x, y);
    }
    function bigText(g, s, x, y, col, size) {
      g.font = size + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#000"; for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) g.fillText(s, x + ox, y + oy);
      g.fillStyle = col; g.fillText(s, x, y);
    }
    function drawFighter(g, f, sx, sy, scaleMul, overridePose) {
      const D = f.D, s = D.scale * (scaleMul || 1), col = f.shadow ? { gi: "#2a2140", pants: "#15101f", belt: "#6a3dbf", skin: "#5e4c7a", hair: "#0b0812", aura: "#b06bff" } : D.col;
      let pose = overridePose || poseFor(f);
      const X = (p) => sx + f.face * p[0] * s, Y = (p) => sy - p[1] * s;
      const limb = (a, b, c, w, colr) => { g.strokeStyle = colr; g.lineWidth = w; g.beginPath(); g.moveTo(X(pose[a]), Y(pose[a])); g.lineTo(X(pose[b]), Y(pose[b])); if (c) g.lineTo(X(pose[c]), Y(pose[c])); g.stroke(); };
      g.lineCap = "round"; g.lineJoin = "round";
      const parts = (out) => {
        const o = out ? 2 : 0, k = out ? "#0b0b12" : null;
        limb("neck", "elbowB", "handB", 3.4 * s + o, k || shade(col.skin, -0.18));
        limb("hip", "kneeB", "footB", 4.4 * s + o, k || shade(col.pants, -0.2));
        limb("hip", "neck", null, 7 * s + o, k || col.gi);
        limb("hip", "kneeF", "footF", 4.4 * s + o, k || col.pants);
        limb("neck", "elbowF", "handF", 3.4 * s + o, k || col.skin);
      };
      // aura while charging a super / dashing
      if (f.state === "super" || (superCut && superCut.f === f)) {
        g.globalAlpha = 0.35 + Math.sin(t * 30) * 0.15; g.fillStyle = col.aura;
        g.beginPath(); g.ellipse(sx, sy - 24 * s, 18 * s, 30 * s, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      }
      parts(true); parts(false);
      // belt + gloves/boots
      const hx = X(pose.hip), hy = Y(pose.hip);
      g.fillStyle = col.belt; g.fillRect(Math.round(hx - 4 * s), Math.round(hy - 2 * s), Math.round(8 * s), Math.max(1, Math.round(2 * s)));
      g.fillStyle = "#1a1a24"; [pose.footB, pose.footF].forEach((p) => g.fillRect(Math.round(X(p) - 2.5 * s), Math.round(Y(p) - 2 * s), Math.round(5 * s), Math.round(2.5 * s)));
      // head + hair
      const cx = X(pose.head), cy = Y(pose.head);
      g.fillStyle = "#0b0b12"; g.beginPath(); g.arc(cx, cy, 4.6 * s + 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = col.skin; g.beginPath(); g.arc(cx, cy, 4.6 * s, 0, Math.PI * 2); g.fill();
      g.fillStyle = col.hair;
      if (D.hair === "spiky") { for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + (i * 2.2 - 2) * s * f.face, cy - 2 * s); g.lineTo(cx + (i * 3.2 - 3) * s * f.face, cy - (9 - Math.abs(i)) * s); g.lineTo(cx + (i * 2.2 + 2) * s * f.face, cy - 2.5 * s); g.fill(); } g.fillRect(cx - 4.5 * s, cy - 4 * s, 9 * s, 2.5 * s); }
      else if (D.hair === "tail") { g.beginPath(); g.arc(cx, cy - 1 * s, 4.8 * s, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(cx - f.face * 6 * s, cy + Math.sin(t * 8) * 0.8, 3 * s, 2 * s, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx - f.face * 9 * s, cy + 2 * s, 2.4 * s, 3.5 * s, 0.3, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.ellipse(cx + f.face * 1 * s, cy + 3 * s, 4 * s, 2.6 * s, 0, 0, Math.PI); g.fill(); }
      g.fillStyle = "#0b0b12"; g.fillRect(Math.round(cx + f.face * 2 * s), Math.round(cy - 1 * s), Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.6 * s))); // eye
      if (f.shadow) { g.fillStyle = "#ff3b6b"; g.fillRect(Math.round(cx + f.face * 2 * s), Math.round(cy - 1 * s), Math.max(1, Math.round(1.4 * s)), Math.max(1, Math.round(1.4 * s))); }
    }
    function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255, f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt)))); return "rgb(" + f(r) + "," + f(gg) + "," + f(b) + ")"; }
    function poseFor(f) {
      switch (f.state) {
        case "walk": return Math.floor(f.walkT / 8) % 2 ? POSE.walk1 : POSE.walk2;
        case "dash": case "airdash": return POSE.dash;
        case "jump": return POSE.jump;
        case "attack": { const A = f.atk; if (!A) return POSE.idle1; const p = POSE[A.pose], k = f.atkT <= A.st ? f.atkT / A.st * 0.6 : f.atkT <= A.st + A.act ? 1 : 1 - (f.atkT - A.st - A.act) / A.rec * 0.6; return lerpPose(f.y > 0 ? POSE.jump : POSE.idle1, p, k); }
        case "block": return POSE.block;
        case "hurt": return POSE.hurt;
        case "knock": return POSE.knock;
        case "down": case "ko": return POSE.down;
        case "special": return f.D.special === "spin" && f.st > 2 ? POSE.spin : f.D.special === "quake" ? (f.st < 12 ? POSE.charge : POSE.slam) : f.st < 8 ? POSE.charge : POSE.special;
        case "super": { const k = f.D.superKind; if (k === "beam") return f.superT < 18 ? POSE.charge : POSE.special; if (k === "rush") return f.grabbed ? (Math.floor(f.superT / 5) % 2 ? POSE.punch1 : POSE.kick3) : POSE.dash; return f.y > 0 ? POSE.jump : POSE.slam; }
        case "win": return POSE.win;
        default: return Math.floor(t * 2.5) % 2 ? POSE.idle1 : POSE.idle2;
      }
    }

    function drawStage(g, LW) {
      const sky = g.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.55, "#7a2d6b"); sky.addColorStop(1, "#ff8a4c");
      g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
      g.fillStyle = "#ffd9a0"; g.beginPath(); g.arc(LW * 0.7 - camX * 0.05, 64, 16, 0, Math.PI * 2); g.fill();
      // far mesas (parallax)
      const layer = (par, col, hts, base, w) => { g.fillStyle = col; const off = -camX * par; for (let i = -1; i < 12; i++) { const x = off + i * w, h = hts[(i + 20) % hts.length]; g.fillRect(Math.round(x), base - h, w - 6, h + 40); g.fillRect(Math.round(x - 3), base - h, w, 4); } };
      layer(0.15, "#4a2a5e", [22, 34, 18, 40, 28], 104, 60);
      layer(0.35, "#33204a", [14, 26, 20, 10, 30, 16], 116, 46);
      // floating rocks
      g.fillStyle = "#2a1a3a"; [[90, 30, 10], [260, 18, 7], [380, 40, 12]].forEach(([x, y, r]) => { const px = x - camX * 0.5, py = y + Math.sin(t + x) * 2; g.fillRect(Math.round(px - r), Math.round(py), r * 2, Math.round(r * 0.8)); g.fillRect(Math.round(px - r * 0.6), Math.round(py + r * 0.8), Math.round(r * 1.2), Math.round(r * 0.5)); });
      // ground
      g.fillStyle = "#6b4a3a"; g.fillRect(0, GROUND, LW, LH - GROUND);
      g.fillStyle = "#8a6247"; g.fillRect(0, GROUND, LW, 2);
      g.fillStyle = "#553a2e"; for (let i = -2; i < 20; i++) { const x = Math.round(i * 34 - (camX % 34)); g.fillRect(x, GROUND + 6, 14, 1); g.fillRect(x + 18, GROUND + 11, 9, 1); }
    }
    function drawShots(g) {
      shots.forEach((p) => {
        const x = p.x - camX, y = GROUND - p.y;
        if (p.k === "ball") {
          const c = p.owner.shadow ? "#b06bff" : "#6ee7ff";
          g.fillStyle = c; g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, p.r + 3 + Math.sin(t * 40), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          g.beginPath(); g.arc(x, y, p.r, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, p.r * 0.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = c; g.globalAlpha = 0.5; g.fillRect(x - Math.sign(p.vx) * 14, y - 2, Math.sign(p.vx) * 8, 4); g.globalAlpha = 1;
        } else {
          // quake wave: a rolling burst of rock shards with a glowing crack under it
          for (let i = 0; i < 6; i++) { const h = 8 + ((frame * 2 + i * 5) % 12), w = 4; g.fillStyle = i % 2 ? "#c9935e" : "#8a6247"; g.fillRect(Math.round(x - 12 + i * 4), GROUND - h, w, h); g.fillStyle = "#ffd28a"; g.fillRect(Math.round(x - 12 + i * 4), GROUND - h, w, 2); }
          g.fillStyle = "#ffb347"; g.fillRect(Math.round(x - 16 - Math.sign(p.vx) * 10), GROUND - 1, 26, 2);
        }
      });
      // beam super
      [f1, f2].forEach((f) => {
        if (f.state !== "super" || f.D.superKind !== "beam" || f.superT < 18 || f.superT > 72) return;
        const s = f.D.scale, x0 = f.x + f.face * 16 * s - camX, yC = GROUND - (f.y + 31 * s), w = 9 + Math.sin(t * 50) * 1.5;
        const x1 = f.face > 0 ? lastLW + 10 : -10, xa = Math.min(x0, x1), wd = Math.abs(x1 - x0);
        g.fillStyle = f.shadow ? "#7a3bd1" : "#2fb8ff"; g.fillRect(Math.round(xa), Math.round(yC - w), Math.round(wd), Math.round(w * 2));
        g.fillStyle = f.shadow ? "#d3a8ff" : "#bdf3ff"; g.fillRect(Math.round(xa), Math.round(yC - w * 0.55), Math.round(wd), Math.round(w * 1.1));
        g.fillStyle = "#fff"; g.fillRect(Math.round(xa), Math.round(yC - w * 0.2), Math.round(wd), Math.max(1, Math.round(w * 0.4)));
        g.beginPath(); g.arc(x0, yC, w * 1.4, 0, Math.PI * 2); g.fill();
      });
    }
    function drawFx(g) {
      fx.forEach((e) => {
        const k = e.t / e.life, x = e.x - camX, y = GROUND - e.y;
        if (e.k === "spark") {
          g.fillStyle = e.col; const r = e.size * (0.5 + k);
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + e.x; g.fillRect(Math.round(x + Math.cos(a) * r * (i % 2 ? 0.6 : 1) - 1), Math.round(y + Math.sin(a) * r * (i % 2 ? 0.6 : 1) - 1), 2, 2); }
          if (k < 0.4) { g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill(); }
        } else if (e.k === "star") { g.fillStyle = k < 0.5 ? "#fff" : "#ffd23f"; g.fillRect(Math.round(x - 3), Math.round(y - 1), 7, 2); g.fillRect(Math.round(x - 1), Math.round(y - 3), 2, 7); }
        else if (e.k === "shock") { g.strokeStyle = "#ffd28a"; g.lineWidth = 3; g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(x, GROUND, 10 + k * 70, 4 + k * 10, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      });
    }
    function drawHUD(g, LW) {
      const bw = Math.floor(LW / 2) - 22, by = 6;
      [f1, f2].forEach((f, i) => {
        const x = i ? LW - 6 - bw : 6, r = Math.max(0, f.hp / f.maxhp);
        g.fillStyle = "#0b0b12"; g.fillRect(x - 1, by - 1, bw + 2, 8);
        g.fillStyle = "#5a1020"; g.fillRect(x, by, bw, 6);
        const w = Math.round(bw * r); g.fillStyle = r > 0.3 ? "#ffd23f" : "#ff4d4d"; g.fillRect(i ? x + bw - w : x, by, w, 6);
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(i ? x + bw - w : x, by, w, 2);
        const nm = f.shadow ? "SHADOW" : f.name; text(g, LW >= 200 ? nm : nm.slice(0, 5), i ? x + bw : x, by + 9, "#fff", i ? "right" : "left");
        for (let k = 0; k < wins[i]; k++) { g.fillStyle = "#ffd23f"; g.fillRect(i ? x + bw - 52 - k * 7 - (LW >= 200 ? 0 : 0) : x + 52 + k * 7, by + 10, 5, 5); }
        // surge meter along the bottom
        const mw = Math.min(70, Math.floor(LW / 2) - 12), mx = i ? LW - 6 - mw : 6, my = LH - 9, full = f.meter >= 100;
        g.fillStyle = "#0b0b12"; g.fillRect(mx - 1, my - 1, mw + 2, 6);
        g.fillStyle = full ? (Math.floor(t * 8) % 2 ? "#fff" : f.D.col.aura) : "#2fb8ff"; const mwF = Math.round(mw * f.meter / 100); g.fillRect(i ? mx + mw - mwF : mx, my, mwF, 4);
        if (full && LW >= 200) text(g, "SUPER!", i ? mx - 4 : mx + mw + 4, my - 3, "#fff", i ? "right" : "left");
      });
      g.fillStyle = "#0b0b12"; g.fillRect(LW / 2 - 12, 3, 24, 14); text(g, String(Math.ceil(timer)).padStart(2, "0"), LW / 2, 6, "#fff", "center");
    }

    function drawLogical(g, LW) {
      g.imageSmoothingEnabled = false;
      if (api.state === "menu" || ui === "title") { drawTitle(g, LW); return; }
      if (ui === "select") { drawSelect(g, LW); return; }
      if (ui === "vs") { drawVs(g, LW); return; }
      if (ui === "champion") { drawChamp(g, LW); return; }
      // fight
      let sx = 0, sy = 0; if (shake > 0) { sx = Math.round((rng() - 0.5) * shake * 20); sy = Math.round((rng() - 0.5) * shake * 14); }
      g.save(); g.translate(sx, sy);
      drawStage(g, LW);
      const order = [f1, f2].sort((a, b) => (a.state === "attack" || a.state === "super" ? 1 : 0) - (b.state === "attack" || b.state === "super" ? 1 : 0));
      order.forEach((f) => { if (f.inv > 0 && f.state === "idle" && Math.floor(frame / 3) % 2) return; drawFighter(g, f, f.x - camX, GROUND - f.y); });
      drawShots(g); drawFx(g);
      g.restore();
      if (superCut) { // super flash: dim the screen, slide a name banner across
        g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, LW, LH);
        drawFighter(g, superCut.f, superCut.f.x - camX, GROUND - superCut.f.y);
        const k = Math.min(1, superCut.t / 0.15), y = 44;
        g.fillStyle = superCut.f.D.col.aura; g.fillRect(0, y, LW * k, 22);
        text(g, superCut.f.D.superName, LW / 2, y + 7, "#0b0b12", "center");
      }
      if (flash > 0) { g.fillStyle = "rgba(255,255,255," + Math.min(0.8, flash).toFixed(2) + ")"; g.fillRect(0, 0, LW, LH); }
      drawHUD(g, LW);
      if (bannerT > 0 || phase === "result") {
        const col = banner === "K.O." ? "#ff4d4d" : banner === "YOU LOSE" ? "#9aa3b5" : "#ffd23f";
        bigText(g, banner, LW / 2, 60, col, banner.length > 6 ? (LW >= 200 ? 16 : 12) : 24);
        if (phase === "result" && phaseT > 1.2 && Math.floor(t * 2) % 2 === 0) text(g, "PRESS A", LW / 2, 84, "#fff", "center");
      }
      if (ui === "continue") {
        g.fillStyle = "rgba(0,0,0,.7)"; g.fillRect(0, 0, LW, LH);
        bigText(g, "CONTINUE?", LW / 2, 54, "#ffd23f", LW >= 200 ? 16 : 12);
        text(g, "A: REMATCH", LW / 2, 78, "#fff", "center"); text(g, "B: QUIT", LW / 2, 92, "#9aa3b5", "center");
      }
    }
    function drawTitle(g, LW) {
      drawStageStatic(g, LW);
      bigText(g, "SURGE", LW / 2, 26, "#6ee7ff", LW >= 200 ? 22 : 16); bigText(g, "FIGHTERS", LW / 2, 50, "#ff5fa2", LW >= 200 ? 16 : 12);
      ROSTER.forEach((n, i) => { const f = demo(n, i === 1 ? -1 : 1); drawFighter(g, f, LW / 2 + (i - 1) * Math.min(60, LW / 3.3), GROUND, 1); });
      if (Math.floor(t * 2) % 2 === 0) text(g, "PRESS START", LW / 2, LH - 12, "#fff", "center");
    }
    const demos = {};
    function demo(name, face) { const f = demos[name] || (demos[name] = makeFighter(name, 0, face, false)); f.face = face; f.state = "idle"; return f; }
    function drawStageStatic(g, LW) { const c = camX; camX = 60; drawStage(g, LW); camX = c; }
    function drawSelect(g, LW) {
      drawStageStatic(g, LW);
      g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, LW, LH);
      text(g, "CHOOSE YOUR FIGHTER", LW / 2, 6, "#fff", "center");
      ROSTER.forEach((n, i) => {
        const x = LW / 2 + (i - 1) * Math.min(64, LW / 3.1), sel = i === pick, f = demo(n, 1);
        if (sel) { g.fillStyle = "rgba(255,210,63,.25)"; g.fillRect(Math.round(x - 24), 22, 48, 72); g.strokeStyle = "#ffd23f"; g.lineWidth = 2; g.strokeRect(Math.round(x - 24) + 1, 23, 46, 70); }
        f.state = sel ? "idle" : "idle"; drawFighter(g, f, x, 88, sel ? 1.15 : 0.95, sel && Math.floor(t * 3) % 2 ? POSE.special : null);
      });
      const D = FIGHTERS[ROSTER[pick]];
      g.fillStyle = "rgba(11,11,18,.85)"; g.fillRect(0, 98, LW, LH - 98);
      text(g, ROSTER[pick], 8, 103, D.col.aura); text(g, D.blurb[0], LW - 8, 103, "#ffd23f", "right");
      text(g, "B: " + D.blurb[1], 8, 116, "#fff"); text(g, LW >= 200 ? "DOWN+B: " + D.blurb[2].replace("SUPER: ", "") : D.blurb[2].replace("SUPER: ", "") , 8, 129, "#9fd3ff");
    }
    function drawVs(g, LW) {
      drawStageStatic(g, LW);
      g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(0, 0, LW, LH);
      const opp = ladder[rung];
      text(g, "STAGE " + (rung + 1) + "/" + ladder.length, LW / 2, 8, "#ffd23f", "center");
      const a = demo(playerName, 1), b = makeFighter(opp.name, 0, -1, false, opp.shadow);
      const k = Math.min(1, phaseT / 0.35);
      drawFighter(g, a, LW * 0.25 - (1 - k) * 60, 108, 1.3); drawFighter(g, b, LW * 0.75 + (1 - k) * 60, 108, 1.3);
      bigText(g, "VS", LW / 2, 62, "#ff5fa2", 16);
      text(g, playerName, LW * 0.25, 116, "#fff", "center"); text(g, opp.shadow ? "SHADOW" : opp.name, LW * 0.75, 116, opp.shadow ? "#b06bff" : "#fff", "center");
    }
    function drawChamp(g, LW) {
      drawStageStatic(g, LW);
      bigText(g, "CHAMPION!", LW / 2, 30, "#ffd23f", LW >= 200 ? 18 : 13);
      const f = demo(playerName, 1); f.state = "win"; drawFighter(g, f, LW / 2, GROUND, 1.4); f.state = "idle";
      text(g, "YOU BEAT THE LADDER", LW / 2, 50, "#fff", "center");
    }

    function drawScreen(g, W, H) {
      const LW = W / H > 1.3 ? 256 : 160; lastLW = LW;
      if (!lc) return;
      if (lc.width !== LW || lc.height !== LH) { lc.width = LW; lc.height = LH; }
      const lg = lc.getContext("2d"); lg.setTransform(1, 0, 0, 1, 0, 0);
      drawLogical(lg, LW);
      const s = Math.min(W / LW, H / LH), dw = Math.round(LW * s), dh = Math.round(LH * s);
      g.save(); g.imageSmoothingEnabled = false; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.drawImage(lc, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh); g.restore();
    }

    // ---------------------------------------------------------------------
    // Update + input
    // ---------------------------------------------------------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.1); t += dt;
      bannerT = Math.max(0, bannerT - dt); shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 2);
      if (ui === "vs") { phaseT += dt; if (phaseT > 1.8) { ui = "fight"; startMatch(); } return; }
      if (ui === "fight" || ui === "continue") {
        if (phase === "result") { phaseT += dt; }
        if (ui !== "fight") return;
        const sm = slowmo > 0 ? 0.35 : 1; slowmo = Math.max(0, slowmo - dt);
        acc += dt * sm;
        while (acc >= STEP) { acc -= STEP; stepFrame(); }
      }
    }
    function newLadder() {
      playerName = ROSTER[pick];
      const others = ROSTER.filter((n) => n !== playerName);
      ladder = [{ name: others[0], level: 0.25 }, { name: others[1], level: 0.5 }, { name: playerName, shadow: true, level: 0.8 }];
      rung = 0; ui = "vs"; phaseT = 0;
    }
    function input(k, down) {
      if (down) held.add(k); else { held.delete(k); return; }
      if (ui === "title") { if (k === "jump" || k === "shoot") { ui = "select"; api.state = "game"; sfx.ok(); } return; }
      if (ui === "select") {
        if (k === "left") { pick = (pick + 2) % 3; sfx.menu(); } else if (k === "right") { pick = (pick + 1) % 3; sfx.menu(); }
        else if (k === "jump") { sfx.ok(); newLadder(); } else if (k === "shoot") { ui = "title"; api.state = "menu"; }
        return;
      }
      if (ui === "continue") { if (k === "jump") { ui = "vs"; phaseT = 0; sfx.ok(); } else if (k === "shoot") { ui = "title"; api.state = "menu"; } return; }
      if (ui !== "fight") return;
      if (phase === "result") { if (phaseT > 1.2 && (k === "jump" || k === "shoot")) afterResult(); return; }
      if (phase !== "fight") return;
      const f = f1;
      if (k === "left" || k === "right") { // double-tap = dash
        const now = t, dirRel = (k === "right" ? 1 : -1) * f.face;
        if (now - lastTap[k] < 0.22) { dash(f, dirRel); lastTap[k] = -99; } else lastTap[k] = now;
      }
      if (k === "up") jump(f);
      else if (k === "jump") attack(f);
      else if (k === "shoot") special(f);
    }

    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k !== "start") return;
        if (ui === "title" || api.state === "over") { api.state = "game"; ui = "select"; sfx.ok(); return; }
        input("jump", true); held.delete("jump");
      },
      hold(k, down) { audio(); if (api.state === "over") { if (down && k === "jump") { api.state = "game"; ui = "select"; } return; } input(k, down); },
      click() { if (ui === "title" || api.state === "over") { api.state = "game"; ui = "select"; } else input("jump", true), held.delete("jump"); },
      release() { held.clear(); },
      toMenu() { api.state = "menu"; ui = "title"; paused = false; held.clear(); },
      pause(p) { paused = !!p; if (p) held.clear(); },
      stop() { paused = true; held.clear(); if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ ui, phase, round, wins, f1, f2, rung, timer, shots: shots.length, pick })
    });
    return api;
  }

  window.SurgeFighters = { create };
})();
