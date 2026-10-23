/* =========================================================================
   SHELF MONSTERS: a turn-based monster battler for the console cartridges.

   The monsters have escaped the shop shelves. Pick a starter, battle your
   way down the route (wild monsters and shop staff), recruit up to three
   monsters with Capture Disks, and beat the Champion at the till.

   - 6 original monsters, 7 types with a strength / weakness chart
   - Classic damage formula (level, power, attack / defence, same-type bonus,
     type effectiveness, crits, random roll), stat stages, levelling and new moves
   - Menus: FIGHT / BAG / TEAM / RUN. Arrows move · A (Space) OK · B (X) back

   Drawn on a small logical screen (160×144 on narrow screens, 240×144 on wide
   ones) and scaled up, like a real handheld. Same engine API as the other
   cartridges (see gba.js), with grid: true for proper up / down.
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const LH = 144;

  // ---------------------------------------------------------------------
  // Data: types, moves, monsters, the route
  // ---------------------------------------------------------------------
  const TYPE_COL = { FIRE: "#ff7a3d", WATER: "#4fa8ff", GRASS: "#5bd46a", VOLT: "#ffd23f", ROCK: "#b39b7a", GLITCH: "#c77dff", NORMAL: "#c9c9d6" };
  const EFF = {
    FIRE: { GRASS: 2, WATER: 0.5, ROCK: 0.5, FIRE: 0.5 },
    WATER: { FIRE: 2, ROCK: 2, GRASS: 0.5, WATER: 0.5 },
    GRASS: { WATER: 2, ROCK: 2, FIRE: 0.5, GRASS: 0.5, VOLT: 0.5 },
    VOLT: { WATER: 2, GLITCH: 2, GRASS: 0.5, ROCK: 0.5, VOLT: 0.5 },
    ROCK: { FIRE: 2, VOLT: 2, GRASS: 0.5, ROCK: 0.5 },
    GLITCH: { GLITCH: 2, ROCK: 0.5 },
    NORMAL: { ROCK: 0.5 }
  };
  const eff = (moveType, defType) => (EFF[moveType] && EFF[moveType][defType]) || 1;

  const MOVES = {
    TACKLE: { type: "NORMAL", pow: 35, acc: 95 },
    SCRATCH: { type: "NORMAL", pow: 40, acc: 100 },
    HEADBUTT: { type: "NORMAL", pow: 60, acc: 100 },
    GROWL: { type: "NORMAL", pow: 0, acc: 100, fx: "atkDown" },
    HARDEN: { type: "NORMAL", pow: 0, acc: 100, fx: "defUp" },
    EMBER: { type: "FIRE", pow: 40, acc: 100 },
    "FLARE DASH": { type: "FIRE", pow: 70, acc: 95 },
    BUBBLE: { type: "WATER", pow: 40, acc: 100 },
    "TIDE PUSH": { type: "WATER", pow: 70, acc: 95 },
    "VINE LASH": { type: "GRASS", pow: 40, acc: 100 },
    "THORN STORM": { type: "GRASS", pow: 70, acc: 95 },
    "PHOTO SNACK": { type: "GRASS", pow: 0, acc: 100, fx: "heal" },
    ZAP: { type: "VOLT", pow: 40, acc: 100 },
    THUNDERCLAP: { type: "VOLT", pow: 75, acc: 85 },
    "PEBBLE TOSS": { type: "ROCK", pow: 45, acc: 95 },
    ROCKSLIDE: { type: "ROCK", pow: 70, acc: 90 },
    BYTE: { type: "GLITCH", pow: 45, acc: 100 },
    "STACK SMASH": { type: "GLITCH", pow: 75, acc: 90 },
    "DUST CLOUD": { type: "NORMAL", pow: 0, acc: 100, fx: "atkDown" }
  };

  const SPECIES = {
    EMBERPUP: { type: "FIRE", base: { hp: 42, atk: 55, def: 42, spd: 62 }, learn: [[1, "SCRATCH"], [1, "GROWL"], [5, "EMBER"], [7, "HEADBUTT"], [9, "FLARE DASH"]] },
    DRIZZLET: { type: "WATER", base: { hp: 48, atk: 48, def: 58, spd: 44 }, learn: [[1, "TACKLE"], [1, "HARDEN"], [5, "BUBBLE"], [9, "TIDE PUSH"]] },
    LEAFLING: { type: "GRASS", base: { hp: 50, atk: 50, def: 50, spd: 46 }, learn: [[1, "TACKLE"], [1, "GROWL"], [5, "VINE LASH"], [7, "PHOTO SNACK"], [9, "THORN STORM"]] },
    VOLTMOTH: { type: "VOLT", base: { hp: 38, atk: 52, def: 36, spd: 72 }, learn: [[1, "TACKLE"], [1, "DUST CLOUD"], [4, "ZAP"], [9, "THUNDERCLAP"]] },
    PEBBLOB: { type: "ROCK", base: { hp: 50, atk: 52, def: 68, spd: 26 }, learn: [[1, "TACKLE"], [1, "HARDEN"], [6, "PEBBLE TOSS"], [9, "ROCKSLIDE"]] },
    GLITCHAT: { type: "GLITCH", base: { hp: 44, atk: 60, def: 44, spd: 64 }, learn: [[1, "SCRATCH"], [1, "GROWL"], [5, "BYTE"], [10, "STACK SMASH"]] }
  };
  const STARTERS = ["EMBERPUP", "DRIZZLET", "LEAFLING"];

  // The route: wild monsters and shop staff, ending with the Champion at the till
  const ROUTE = [
    { wild: ["GLITCHAT", 3] },
    { wild: ["VOLTMOTH", 3] },
    { wild: ["PEBBLOB", 5] },
    { trainer: "STOCK BOY RAY", intro: "Hey! Back on the shelf!", team: [["PEBBLOB", 5], ["LEAFLING", 5]] },
    { trainer: "CASHIER MEL", intro: "Nobody skips the queue!", team: [["DRIZZLET", 6], ["VOLTMOTH", 7]] },
    { trainer: "CHAMPION DAN", intro: "Welcome to the till. Let's see your team!", team: [["GLITCHAT", 8], ["VOLTMOTH", 8], ["EMBERPUP", 9]], champ: true }
  ];

  // ---------------------------------------------------------------------
  // Monsters
  // ---------------------------------------------------------------------
  const statOf = (b, L) => Math.floor((2 * b * L) / 100) + 5;
  const hpOf = (b, L) => Math.floor((2 * b * L) / 100) + L + 10;
  function makeMon(name, lvl) {
    const sp = SPECIES[name];
    const m = { name, type: sp.type, lvl, xp: 0, moves: [], stages: { atk: 0, def: 0 } };
    sp.learn.forEach(([l, mv]) => { if (l <= lvl && !m.moves.includes(mv)) { m.moves.push(mv); if (m.moves.length > 4) m.moves.shift(); } });
    calc(m); m.hp = m.maxhp; return m;
  }
  function calc(m) {
    const b = SPECIES[m.name].base, old = m.maxhp || 0;
    m.maxhp = hpOf(b.hp, m.lvl); m.atk = statOf(b.atk, m.lvl); m.def = statOf(b.def, m.lvl); m.spd = statOf(b.spd, m.lvl);
    if (old && m.hp > 0) m.hp = Math.min(m.maxhp, m.hp + (m.maxhp - old));
  }
  const xpNext = (L) => 10 + L * 8;
  const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  function damage(a, d, mv, rng) {
    const M = MOVES[mv]; if (!M.pow) return { dmg: 0, e: 1, crit: false };
    const A = a.atk * stageMul(a.stages.atk), D = d.def * stageMul(d.stages.def);
    const crit = rng() < 1 / 16, e = eff(M.type, d.type), stab = M.type === a.type ? 1.5 : 1;
    let dmg = Math.floor(Math.floor((Math.floor((2 * a.lvl) / 5 + 2) * M.pow * A) / D) / 50) + 2;
    dmg = Math.max(1, Math.floor(dmg * stab * e * (crit ? 1.5 : 1) * (0.85 + rng() * 0.15)));
    return { dmg, e, crit };
  }

  // ---------------------------------------------------------------------
  // Monster sprites: drawn with shapes on the small screen (so they pixelate)
  // ---------------------------------------------------------------------
  function sprite(g, name, cx, by, s, back, t, flash) {
    if (flash) return;
    const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(cx + x * s), Math.round(by + y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
    const E = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(Math.round(cx + x * s), Math.round(by + y * s), Math.max(1, rx * s), Math.max(1, ry * s), 0, 0, Math.PI * 2); g.fill(); };
    const eyes = (x1, x2, y, c) => { if (back) return; P(x1, y, 2, 3, "#111"); P(x2, y, 2, 3, "#111"); P(x1, y, 1, 1, c || "#fff"); P(x2, y, 1, 1, c || "#fff"); };
    const bob = Math.round(Math.sin(t * 3) * 0.6 * s) / s;
    by += bob * s;
    g.save(); if (back) { g.translate(cx * 2, 0); g.scale(-1, 1); }
    switch (name) {
      case "EMBERPUP": {
        const f = Math.sin(t * 14) > 0 ? 1 : 0;
        E(9, -8 - f, 3, 5, "#ffd23f"); E(9, -7, 2, 3, "#ff4d2e");                 // flame tail
        E(1, -6, 9, 6, "#e8662c"); E(1, -4, 6, 3, "#ffb27a");                     // body + belly
        P(-6, -2, 3, 3, "#c44f1f"); P(4, -2, 3, 3, "#c44f1f");                    // legs
        E(-5, -13, 6, 5, "#e8662c");                                               // head
        P(-11, -21, 3, 6, "#c44f1f"); P(-2, -21, 3, 6, "#c44f1f");                // ears
        E(-9, -11, 2, 1.5, "#ffb27a"); eyes(-8, -4, -15); P(-11, -12, 1, 1, "#111");
        break;
      }
      case "DRIZZLET": {
        E(0, -8, 9, 8, "#3d8de6"); g.fillStyle = "#3d8de6"; g.beginPath(); g.moveTo(cx - 6 * s, by - 13 * s); g.lineTo(cx, by - 24 * s); g.lineTo(cx + 6 * s, by - 13 * s); g.fill();
        E(-3, -12, 2, 3, "#bfe3ff"); E(0, -4, 6, 3, "#7cc1ff");
        P(-6, -1, 3, 2, "#2a66b0"); P(3, -1, 3, 2, "#2a66b0");
        eyes(-4, 1, -11); if (!back) P(-2, -6, 3, 1, "#1b3d6b");
        break;
      }
      case "LEAFLING": {
        E(0, -7, 8, 7, "#4bbf5a"); E(0, -4, 5, 3, "#a5e8a0");
        P(-1, -18, 1, 5, "#2f7a35"); E(3, -20, 5, 2.5, "#7ee06a"); E(-4, -18, 3, 2, "#5bd46a");   // stem + leaves
        E(-9, -8, 2, 3, "#5bd46a"); E(9, -8, 2, 3, "#5bd46a");                                   // leaf arms
        P(-5, -1, 3, 2, "#2f7a35"); P(2, -1, 3, 2, "#2f7a35");
        eyes(-4, 1, -10); if (!back) { P(-6, -7, 2, 1, "#ff9cb0"); P(3, -7, 2, 1, "#ff9cb0"); }
        break;
      }
      case "VOLTMOTH": {
        const w = Math.sin(t * 18) > 0 ? 1 : 0.8;
        E(-8, -14, 7 * w, 6, "#fff1a8"); E(8, -14, 7 * w, 6, "#fff1a8");           // wings
        E(-7, -6, 5 * w, 4, "#ffe36b"); E(7, -6, 5 * w, 4, "#ffe36b");
        P(-11, -15, 5, 1, "#2a2a2a"); P(-10, -14, 1, 2, "#2a2a2a"); P(6, -15, 5, 1, "#2a2a2a"); P(9, -14, 1, 2, "#2a2a2a");
        E(0, -10, 3, 8, "#ffd23f"); P(-2, -9, 4, 1, "#2a2a2a"); P(-2, -6, 4, 1, "#2a2a2a");     // body stripes
        E(0, -19, 3, 3, "#ffd23f"); P(-3, -26, 1, 5, "#2a2a2a"); P(2, -26, 1, 5, "#2a2a2a");     // head + antennae
        eyes(-2, 1, -20);
        break;
      }
      case "PEBBLOB": {
        E(0, -7, 10, 7, "#8d8478"); E(-5, -11, 5, 4, "#a39a8c"); E(5, -10, 4, 4, "#7a7266"); E(1, -14, 4, 3, "#a39a8c");
        E(6, -13, 2, 1.5, "#6fbf5a");                                               // moss
        P(-4, -6, 2, 1, "#5d564d"); P(3, -3, 3, 1, "#5d564d");
        eyes(-4, 1, -10, "#ffe36b");
        break;
      }
      case "GLITCHAT": {
        E(2, -6, 8, 5, "#7b3fd1"); E(-5, -12, 6, 5, "#8f55e6");
        P(-10, -20, 3, 5, "#7b3fd1"); P(-3, -20, 3, 5, "#7b3fd1");
        P(9, -14, 2, 9, "#7b3fd1"); P(10, -16, 3, 2, "#6ee7ff");                   // tail with a pixel tip
        P(-5, -1, 3, 2, "#5b2aa0"); P(4, -1, 3, 2, "#5b2aa0");
        eyes(-8, -4, -14, "#6ee7ff");
        // glitch: shift a few horizontal slices sideways now and then
        if (Math.sin(t * 7) > 0.85) { const y = Math.round(by - (6 + Math.floor(t * 50) % 10) * s); const img = g.getImageData(Math.round(cx - 14 * s), y, Math.round(28 * s), Math.max(1, Math.round(2 * s))); g.putImageData(img, Math.round(cx - 12 * s), y); }
        break;
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------------
  // The game
  // ---------------------------------------------------------------------
  function create(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true, grid: true, noLift: true,
      hints: {
        menu: "ENTER / A: START", menuShort: "A: START",
        play: "ARROWS: CHOOSE   SPACE: OK   X: BACK", playShort: "A:OK  B:BACK",
        over: "ENTER / A: PLAY AGAIN", overShort: "A: AGAIN"
      },
      padLabels: { jump: "OK (A)", shoot: "BACK (B)" }
    };
    let paused = false, t = 0, wins = 0;
    try { wins = parseInt(localStorage.getItem("shelfmon.wins"), 10) || 0; } catch (e) {}

    // run state
    let party = [], bag = { POTION: 3, DISK: 5 }, stage = 0, starterPick = 0;
    // battle state
    let foe = [], fi = 0, pi = 0, wild = false, ui = "title", cursor = 0, script = [], cur = null, curT = 0, typed = 0;
    let anim = { p: null, f: null }, shown = { p: 0, f: 0 }, lastMsg = "", ending = false, won = false;
    const P = () => party[pi], F = () => foe[fi];

    // -------------------- script runner (messages + timed actions) --------------------
    // steps normally queue at the end; inside inline() they're collected and slotted in next
    let Q = null;
    const push = (st) => (Q || script).push(st);
    const say = (text) => push({ text });
    const act = (fn) => push({ fn });
    const wait = (s, fx) => push({ wait: s, fx });
    function inline(fn) { const prev = Q; Q = []; fn(); const steps = Q; Q = prev; (Q || script).unshift(...steps); }
    const later = (fn) => act(() => inline(fn));
    function runScript(dt) {
      if (!cur) {
        if (!script.length) return false;
        cur = script.shift(); curT = 0; typed = 0;
        if (cur.fn) { cur.fn(); cur = null; return true; }
        if (cur.fx) cur.fx();
        if (cur.text) { lastMsg = cur.text; sfx.blip(); }
      }
      curT += dt;
      if (cur.text) { typed = Math.min(cur.text.length, typed + dt * 60); if (typed >= cur.text.length && curT > Math.max(1.1, cur.text.length / 30)) cur = null; }
      else if (cur.wait != null && curT >= cur.wait) cur = null;
      return true;
    }
    function skip() { if (cur && cur.text) { if (typed < cur.text.length) typed = cur.text.length; else cur = null; } }

    // -------------------- run / route --------------------
    function newRun() {
      party = []; bag = { POTION: 3, DISK: 5 }; stage = 0; starterPick = 0; ui = "starter"; script = []; cur = null; api.state = "game";
    }
    function chooseStarter() {
      party = [makeMon(STARTERS[starterPick], 5)]; pi = 0; ui = "route"; sfx.ok();
    }
    function startBattle() {
      const R = ROUTE[stage]; wild = !!R.wild;
      foe = wild ? [makeMon(R.wild[0], R.wild[1])] : R.team.map(([n, l]) => makeMon(n, l)); fi = 0;
      pi = party.findIndex((m) => m.hp > 0); if (pi < 0) pi = 0;
      party.forEach((m) => (m.stages = { atk: 0, def: 0 }));
      shown = { p: P().hp, f: F().hp }; anim = { p: "enter", f: "enter", pT: 0, fT: 0 }; ending = false; won = false;
      ui = "script"; sfx.start();
      if (wild) say("A wild " + F().name + " jumped off the shelf!");
      else { say(R.trainer + ": " + R.intro); say(R.trainer + " sent out " + F().name + "!"); }
      say("Go, " + P().name + "!");
      act(() => toMain());
    }
    function toMain() { ui = "main"; cursor = 0; lastMsg = "What will " + P().name + " do?"; }

    // -------------------- turns --------------------
    function useMove(user, target, mv, side) {
      const M = MOVES[mv], who = side === "p" ? user.name : (wild ? "Wild " : "Foe ") + user.name;
      say(who + " used " + mv + "!");
      act(() => { anim[side] = "lunge"; anim[side + "T"] = 0; sfx.move(M.type); });
      wait(0.25);
      act(() => {
        if (user.hp <= 0) return;
        if (rng() * 100 >= M.acc) { script.unshift({ text: "But it missed!" }); return; }
        const other = side === "p" ? "f" : "p";
        if (M.fx === "atkDown") { target.stages.atk = Math.max(-3, target.stages.atk - 1); script.unshift({ text: target.name + "'s attack fell!" }); return; }
        if (M.fx === "defUp") { user.stages.def = Math.min(3, user.stages.def + 1); script.unshift({ text: user.name + "'s defence rose!" }); return; }
        if (M.fx === "heal") { const h = Math.ceil(user.maxhp / 2); user.hp = Math.min(user.maxhp, user.hp + h); sfx.heal(); script.unshift({ text: user.name + " recovered HP!" }); return; }
        const r = damage(user, target, mv, rng);
        target.hp = Math.max(0, target.hp - r.dmg);
        anim[other] = "hit"; anim[other + "T"] = 0; sfx.hit(r.e);
        const notes = [];
        if (r.crit) notes.push({ text: "A critical hit!" });
        if (r.e > 1) notes.push({ text: "It's super effective!" });
        if (r.e < 1) notes.push({ text: "It's not very effective..." });
        notes.push({ wait: 0.55 });
        script.unshift(...notes);
      });
    }
    function foeMove() {
      const f = F(), p = P();
      const scored = f.moves.map((mv) => { const M = MOVES[mv]; let v = M.pow ? M.pow * eff(M.type, p.type) * (M.type === f.type ? 1.5 : 1) * (M.acc / 100) : 25; if (M.fx === "heal") v = f.hp < f.maxhp / 2 ? 90 : 0; if (M.fx === "atkDown" && p.stages.atk <= -2) v = 0; if (M.fx === "defUp" && f.stages.def >= 2) v = 0; return [mv, v]; });
      scored.sort((a, b) => b[1] - a[1]);
      const smart = rng() < (ROUTE[stage].champ ? 0.85 : 0.7);
      return smart ? scored[0][0] : f.moves[Math.floor(rng() * f.moves.length)];
    }
    function turn(pa) { // pa: { move } | { item } | { switchTo }
      ui = "script";
      const foeAct = () => { if (F().hp > 0 && P().hp > 0) useMove(F(), P(), foeMove(), "f"); };
      if (pa.switchTo != null) {
        say("Come back, " + P().name + "!");
        act(() => { pi = pa.switchTo; P().stages = { atk: 0, def: 0 }; shown.p = P().hp; anim.p = "enter"; anim.pT = 0; });
        later(() => say("Go, " + P().name + "!"));
        later(foeAct);
      } else if (pa.item === "POTION") {
        bag.POTION--; act(() => { P().hp = Math.min(P().maxhp, P().hp + 25); sfx.heal(); }); later(() => say(P().name + " recovered HP!"));
        later(foeAct);
      } else if (pa.item === "DISK") {
        bag.DISK--; say("You threw a Capture Disk!");
        act(() => { anim.f = "catch"; anim.fT = 0; });
        wait(1.0);
        act(() => {
          const f = F(), chance = 0.35 + (1 - f.hp / f.maxhp) * 0.6;
          if (rng() < chance) inline(() => { say("Gotcha! " + f.name + " joined your team!"); act(() => { f.stages = { atk: 0, def: 0 }; party.push(f); sfx.win(); endBattle(true, true); }); });
          else { anim.f = "enter"; anim.fT = 0; inline(() => { say("Oh no! It broke free!"); foeAct(); }); }
        });
      } else {
        const p = P(), f = F(), pFirst = p.spd === f.spd ? rng() < 0.5 : p.spd > f.spd;
        const mine = () => { if (P().hp > 0 && F().hp > 0) useMove(P(), F(), pa.move, "p"); };
        if (pFirst) { later(mine); later(foeAct); } else { later(foeAct); later(mine); }
      }
      act(afterTurn);
    }
    function afterTurn() {
      if (ending) return;
      const f = F(), p = P();
      if (f.hp <= 0) {
        script.push({ fn: () => { anim.f = "faint"; anim.fT = 0; sfx.faint(); } }, { wait: 0.6 }, { text: (wild ? "Wild " : "Foe ") + f.name + " fainted!" });
        later(() => giveXp(f));
        act(() => {
          if (fi + 1 < foe.length) { fi++; shown.f = F().hp; anim.f = "enter"; anim.fT = 0; say(ROUTE[stage].trainer + " sent out " + F().name + "!"); act(() => (p.hp > 0 ? toMain() : forceSwitch())); }
          else endBattle(true);
        });
        return;
      }
      if (p.hp <= 0) {
        script.push({ fn: () => { anim.p = "faint"; anim.pT = 0; sfx.faint(); } }, { wait: 0.6 }, { text: p.name + " fainted!" });
        act(() => forceSwitch());
        return;
      }
      toMain();
    }
    function forceSwitch() {
      if (party.some((m) => m.hp > 0)) { ui = "team"; cursor = party.findIndex((m) => m.hp > 0); lastMsg = "Choose a monster."; }
      else endBattle(false);
    }
    function giveXp(f) {
      const xp = Math.floor(f.lvl * 7 * (wild ? 1 : 1.3));
      party.forEach((m) => {
        if (m.hp <= 0) return;
        const gain = m === P() ? xp : Math.floor(xp * 0.75); // the whole team learns from watching
        m.xp += gain;
        if (m === P()) say(m.name + " gained " + gain + " XP!");
        while (m.xp >= xpNext(m.lvl) && m.lvl < 20) {
          m.xp -= xpNext(m.lvl); m.lvl++; calc(m);
          const L = m.lvl; say(m.name + " grew to Lv " + L + "!"); act(() => sfx.level());
          SPECIES[m.name].learn.forEach(([l, mv]) => {
            if (l !== L || m.moves.includes(mv)) return;
            if (m.moves.length >= 4) { const drop = m.moves.reduce((a, b) => ((MOVES[a].pow || 99) <= (MOVES[b].pow || 99) ? a : b)); m.moves[m.moves.indexOf(drop)] = mv; say(m.name + " forgot " + drop + " and learned " + mv + "!"); }
            else { m.moves.push(mv); say(m.name + " learned " + mv + "!"); }
          });
        }
      });
    }
    function endBattle(victory, caught) {
      ending = true; script = []; cur = null; ui = "script";
      if (!victory) {
        say("You're out of monsters!"); say("You hurried back to the counter...");
        act(() => { party.forEach((m) => { m.hp = m.maxhp; }); ui = "blackout"; });
        return;
      }
      const R = ROUTE[stage];
      if (!wild) { say(R.trainer + " was beaten!"); if (R.champ) say("DAN: Wow. The till is yours, Champion!"); }
      act(() => {
        party.forEach((m) => { m.hp = m.maxhp; m.stages = { atk: 0, def: 0 }; });
        bag.POTION = Math.max(bag.POTION, 3); // the shop restocks between battles
        if (R.champ) { won = true; wins++; try { localStorage.setItem("shelfmon.wins", String(wins)); } catch (e) {} api.state = "over"; sfx.win(); return; }
        stage++; ui = "route";
      });
      if (!caught && wild && party.length < 3) say("Your team rests between the shelves.");
    }

    // -------------------- input --------------------
    const MAIN = ["FIGHT", "BAG", "TEAM", "RUN"];
    function grid(k, n, cols) { // 2-column menus
      if (k === "left" && cursor % cols) cursor--;
      else if (k === "right" && cursor % cols < cols - 1 && cursor + 1 < n) cursor++;
      else if (k === "up" && cursor - cols >= 0) cursor -= cols;
      else if (k === "down" && cursor + cols < n) cursor += cols;
      else return; sfx.move2();
    }
    function input(k) {
      if (ui === "script") { if (k === "jump" || k === "shoot") skip(); return; }
      if (ui === "starter") {
        if (k === "left") { starterPick = (starterPick + 2) % 3; sfx.move2(); } else if (k === "right") { starterPick = (starterPick + 1) % 3; sfx.move2(); }
        else if (k === "jump") chooseStarter(); return;
      }
      if (ui === "route") { if (k === "jump") startBattle(); return; }
      if (ui === "blackout") { if (k === "jump") startBattle(); return; }
      if (ui === "main") {
        if (k === "jump") {
          sfx.ok();
          const c = MAIN[cursor];
          if (c === "FIGHT") { ui = "fight"; cursor = 0; }
          else if (c === "BAG") { ui = "bag"; cursor = 0; }
          else if (c === "TEAM") { ui = "team"; cursor = pi; }
          else if (wild) { ui = "script"; say("Got away safely!"); act(() => { ending = true; stage++; ui = "route"; }); }
          else { ui = "script"; say("You can't run from a staff battle!"); act(toMain); }
        } else grid(k, 4, 2);
        return;
      }
      if (ui === "fight") {
        if (k === "shoot") { toMain(); return; }
        if (k === "jump") { sfx.ok(); turn({ move: P().moves[cursor] }); return; }
        grid(k, P().moves.length, lastLW >= 200 ? 2 : 1); return;
      }
      if (ui === "bag") {
        const items = ["POTION", "DISK"];
        if (k === "shoot") { toMain(); return; }
        if (k === "up" || k === "down") { cursor = cursor ? 0 : 1; sfx.move2(); return; }
        if (k === "jump") {
          const it = items[cursor];
          if (bag[it] <= 0) { sfx.no(); return; }
          if (it === "POTION" && P().hp >= P().maxhp) { sfx.no(); lastMsg = "HP is already full."; return; }
          if (it === "DISK" && !wild) { sfx.no(); lastMsg = "You can't catch a staff member's monster!"; return; }
          if (it === "DISK" && party.length >= 3) { sfx.no(); lastMsg = "Your team is full (3)."; return; }
          sfx.ok(); turn({ item: it });
        }
        return;
      }
      if (ui === "team") {
        const forced = P().hp <= 0;
        if (k === "shoot" && !forced) { toMain(); return; }
        if (k === "up" && cursor > 0) { cursor--; sfx.move2(); } else if (k === "down" && cursor < party.length - 1) { cursor++; sfx.move2(); }
        else if (k === "jump") {
          const m = party[cursor];
          if (m.hp <= 0 || cursor === pi) { sfx.no(); return; }
          sfx.ok();
          if (forced) { ui = "script"; act(() => { pi = cursor; P().stages = { atk: 0, def: 0 }; shown.p = P().hp; anim.p = "enter"; anim.pT = 0; }); say("Go, " + m.name + "!"); act(toMain); }
          else turn({ switchTo: cursor });
        }
      }
    }

    // -------------------- sound --------------------
    let ac = null;
    function audio() {
      if (!ac && typeof window !== "undefined") { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
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
    const sfx = {
      blip: () => beep(880, 0.03, 0, "square", 0.015),
      move2: () => beep(660, 0.03, 0, "square", 0.02),
      ok: () => beep(990, 0.06, 0, "square", 0.03),
      no: () => beep(160, 0.12, 0, "square", 0.04),
      move: (type) => beep({ FIRE: 300, WATER: 520, GRASS: 420, VOLT: 900, ROCK: 140, GLITCH: 700, NORMAL: 360 }[type] || 400, 0.15, 0, type === "VOLT" ? "sawtooth" : "square", 0.04, type === "WATER" ? 1.6 : 0.6),
      hit: (e) => { beep(e > 1 ? 120 : 90, 0.18, 0, "sawtooth", e > 1 ? 0.08 : 0.05, 0.5); if (e > 1) beep(1400, 0.08, 0.1); },
      heal: () => [523, 659, 784].forEach((f, i) => beep(f, 0.1, i * 0.07, "triangle", 0.05)),
      faint: () => beep(400, 0.6, 0, "square", 0.05, 0.2),
      level: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.1, i * 0.08, "square", 0.035)),
      start: () => [392, 392, 523, 659].forEach((f, i) => beep(f, 0.12, i * 0.1, "square", 0.035)),
      win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, i * 0.12, "square", 0.04))
    };

    // -------------------- update --------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.05); t += dt;
      ["p", "f"].forEach((s) => { if (anim[s]) { anim[s + "T"] += dt; if (anim[s] !== "faint" && anim[s] !== "catch" && anim[s + "T"] > 0.5) anim[s] = null; } });
      // HP bars drain smoothly towards the real value
      if (party.length && foe.length && P() && F()) {
        shown.p += Math.sign(P().hp - shown.p) * Math.min(Math.abs(P().hp - shown.p), dt * Math.max(12, P().maxhp * 0.9));
        shown.f += Math.sign(F().hp - shown.f) * Math.min(Math.abs(F().hp - shown.f), dt * Math.max(12, F().maxhp * 0.9));
      }
      const draining = party.length && foe.length && (Math.abs(shown.p - P().hp) > 0.5 || Math.abs(shown.f - F().hp) > 0.5);
      if (ui === "script" && !draining) runScript(dt);
    }

    // -------------------- drawing --------------------
    const lc = typeof document !== "undefined" ? document.createElement("canvas") : null;
    function text(g, s, x, y, col, align) { g.font = "8px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top"; g.fillStyle = col || "#202020"; g.fillText(s, x, y); }
    function wrap(g, s, w) {
      g.font = "8px " + FONT; const out = []; let line = "";
      s.split(" ").forEach((word) => { const tryL = line ? line + " " + word : word; if (g.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL; });
      if (line) out.push(line); return out;
    }
    function box(g, x, y, w, h) {
      g.fillStyle = "#f8f8f0"; g.fillRect(x, y, w, h);
      g.fillStyle = "#303048"; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h);
      g.fillStyle = "#9aa0c0"; g.fillRect(x + 3, y + 3, w - 6, 1);
    }
    function arrowAt(g, x, y) { g.fillStyle = "#202020"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 3.5); g.lineTo(x, y + 7); g.fill(); }
    function hpBar(g, x, y, w, hp, max) {
      const r = Math.max(0, hp / max);
      g.fillStyle = "#303048"; g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle = "#e8e8e8"; g.fillRect(x, y, w, 3);
      g.fillStyle = r > 0.5 ? "#3fcf5e" : r > 0.2 ? "#f2c230" : "#e8463c"; g.fillRect(x, y, Math.round(w * r), 3);
    }
    function infoBox(g, m, x, y, w, shownHp, showNums) {
      box(g, x, y, w, showNums ? 30 : 22);
      text(g, m.name.slice(0, 8), x + 5, y + 5, "#202020");
      text(g, "L" + m.lvl, x + w - 5, y + 5, "#202020", "right");
      g.fillStyle = TYPE_COL[m.type]; g.fillRect(x + 5, y + 15, 3, 3);
      text(g, "HP", x + 11, y + 13, "#d04040"); hpBar(g, x + 28, y + 15, w - 34, shownHp, m.maxhp);
      if (showNums) text(g, Math.ceil(shownHp) + "/" + m.maxhp, x + w - 5, y + 20, "#202020", "right");
    }

    function drawLogical(g, LW) {
      g.imageSmoothingEnabled = false;
      // backdrop: shop floor with shelves
      const sky = g.createLinearGradient(0, 0, 0, 100); sky.addColorStop(0, "#f6e9c9"); sky.addColorStop(1, "#e9d6a8");
      g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
      g.fillStyle = "#d8c08a"; for (let x = 0; x < LW; x += 40) { g.fillRect(x + 2, 6, 34, 34); }
      g.fillStyle = "#b58c55"; for (let x = 0; x < LW; x += 40) { g.fillRect(x + 2, 18, 34, 2); g.fillRect(x + 2, 30, 34, 2); }
      [["#ff7a3d", 6, 10], ["#4fa8ff", 14, 22], ["#5bd46a", 46, 10], ["#c77dff", 92, 22], ["#ffd23f", 130, 10], ["#ff7a3d", 172, 22], ["#4fa8ff", 214, 10]].forEach(([c, x, y]) => { if (x < LW) { g.fillStyle = c; g.fillRect(x, y, 6, 8); } });
      g.fillStyle = "#c9a874"; g.fillRect(0, 40, LW, LH - 40);
      g.fillStyle = "#bf9c66"; for (let y = 48; y < LH; y += 10) g.fillRect(0, y, LW, 1);

      if (api.state === "menu") { drawTitle(g, LW); return; }
      if (api.state === "over") { drawWin(g, LW); return; }
      if (ui === "starter") { drawStarter(g, LW); return; }
      if (ui === "route" || ui === "blackout") { drawRoute(g, LW); return; }

      // battle: platforms, monsters, info boxes
      const fx = Math.round(LW * 0.72), fy = 56, px = Math.round(LW * 0.26), py = 100;
      g.fillStyle = "#a88b5c"; g.beginPath(); g.ellipse(fx, fy, 24, 6, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(px, py - 2, 30, 7, 0, 0, Math.PI * 2); g.fill();
      const drawMon = (m, side, x, y, s, back) => {
        const a = anim[side], at = anim[side + "T"] || 0;
        let dx = 0, dy = 0, flash = false;
        if (a === "enter") dx = (side === "f" ? 1 : -1) * Math.max(0, 1 - at / 0.4) * 60;
        if (a === "lunge") dx = (side === "f" ? -1 : 1) * Math.sin(Math.min(1, at / 0.25) * Math.PI) * 8;
        if (a === "hit") flash = Math.floor(at * 16) % 2 === 1;
        if (a === "faint") { dy = Math.min(1, at / 0.4) * 30; if (at > 0.4) return; }
        if (a === "catch") { if (at > 0.3) { g.fillStyle = "#e8463c"; g.fillRect(x - 4, y - 8 + Math.round(Math.sin(at * 12) * 1), 8, 4); g.fillStyle = "#fff"; g.fillRect(x - 4, y - 4, 8, 4); g.fillStyle = "#303048"; g.fillRect(x - 1, y - 5, 2, 2); return; } dy = 0; }
        g.save(); g.beginPath(); g.rect(0, 0, LW, y + 1); g.clip();
        sprite(g, m.name, x + dx, y + dy, s, back, t + (side === "f" ? 1.3 : 0), flash);
        g.restore();
      };
      if (F() && !(anim.f === "faint" && anim.fT > 0.4)) drawMon(F(), "f", fx, fy, 1.6, false);
      if (P() && !(anim.p === "faint" && anim.pT > 0.4)) drawMon(P(), "p", px, py, 2.1, true);
      const iw = LW >= 200 ? 104 : 98;
      if (F()) infoBox(g, F(), 4, 4, iw, shown.f, false);
      if (P()) infoBox(g, P(), LW - iw - 4, 66, iw, shown.p, true);

      // text box + menus
      const by = 100, bh = LH - by;
      box(g, 0, by, LW, bh);
      if (ui === "script") {
        const msg = cur && cur.text ? cur.text.slice(0, Math.floor(typed)) : lastMsg;
        wrap(g, msg, LW - 16).slice(0, 3).forEach((l, i) => text(g, l, 8, by + 8 + i * 11));
        if (cur && cur.text && typed >= cur.text.length && Math.floor(t * 3) % 2 === 0) { g.fillStyle = "#202020"; g.beginPath(); g.moveTo(LW - 14, by + bh - 11); g.lineTo(LW - 8, by + bh - 11); g.lineTo(LW - 11, by + bh - 7); g.fill(); }
      } else if (ui === "main") {
        const mw = LW >= 200 ? 112 : 84, mx = LW - mw;
        if (LW >= 200) { wrap(g, "What will " + P().name + " do?", LW - mw - 16).slice(0, 3).forEach((l, i) => text(g, l, 8, by + 10 + i * 11)); box(g, mx, by, mw, bh); }
        const gx = LW >= 200 ? mx : 8, cw = LW >= 200 ? mw / 2 : 72;
        MAIN.forEach((m, i) => { const x = gx + 12 + (i % 2) * cw, y = by + 11 + Math.floor(i / 2) * 15; text(g, m, x, y); if (i === cursor) arrowAt(g, x - 8, y); });
      } else if (ui === "fight") {
        const mv = P().moves;
        if (LW >= 200) {
          mv.forEach((m, i) => { const x = 12 + (i % 2) * 90, y = by + 11 + Math.floor(i / 2) * 15; text(g, m, x, y); if (i === cursor) arrowAt(g, x - 8, y); });
          const M = MOVES[mv[cursor]]; g.fillStyle = TYPE_COL[M.type]; g.fillRect(LW - 58, by + 8, 52, 11); text(g, M.type, LW - 32, by + 10, "#202020", "center"); text(g, M.pow ? "POW " + M.pow : "STATUS", LW - 32, by + 24, "#505060", "center");
        } else { // narrow screens: one move per row with a type colour tab
          mv.forEach((m, i) => { const y = by + 6 + i * 9; g.fillStyle = TYPE_COL[MOVES[m].type]; g.fillRect(12, y + 1, 4, 6); text(g, m, 20, y); if (i === cursor) arrowAt(g, 5, y); });
          const M = MOVES[mv[cursor]]; text(g, M.pow ? "P" + M.pow : "ST", LW - 6, by + 6, "#505060", "right");
        }
      } else if (ui === "bag") {
        [["POTION", "+25 HP"], ["DISK", "CATCH"]].forEach(([it, d], i) => { const y = by + 8 + i * 12; text(g, it + " x" + bag[it], 12, y, bag[it] ? "#202020" : "#9090a0"); if (LW >= 200) text(g, d, LW - 8, y, "#505060", "right"); if (i === cursor) arrowAt(g, 4, y); });
        text(g, lastMsg.startsWith("You can't") || lastMsg.startsWith("Your team") || lastMsg.startsWith("HP is") ? lastMsg.slice(0, LW >= 200 ? 28 : 18) : "B: BACK", 12, by + 32, "#707080");
      } else if (ui === "team") {
        // team list covers the battle
        box(g, 0, 0, LW, LH);
        text(g, P().hp <= 0 ? "CHOOSE A MONSTER" : "YOUR TEAM", 8, 7, "#202020");
        party.forEach((m, i) => {
          const y = 22 + i * 38;
          if (i === cursor) { g.fillStyle = "#e4e8ff"; g.fillRect(4, y - 3, LW - 8, 34); }
          sprite(g, m.name, 22, y + 27, 1, false, t, false);
          text(g, m.name + (i === pi ? "*" : ""), 42, y, m.hp > 0 ? "#202020" : "#9090a0"); text(g, "L" + m.lvl, LW - 8, y, "#202020", "right");
          hpBar(g, 42, y + 12, LW - 54, m.hp, m.maxhp); text(g, m.hp + "/" + m.maxhp, LW - 8, y + 18, "#505060", "right");
        });
      }
    }

    function drawTitle(g, LW) {
      box(g, 6, 8, LW - 12, 40);
      text(g, "SHELF", LW / 2, 15, "#d0503a", "center"); text(g, "MONSTERS", LW / 2, 29, "#3060c0", "center");
      ["EMBERPUP", "DRIZZLET", "LEAFLING"].forEach((n, i) => sprite(g, n, LW / 2 + (i - 1) * Math.min(48, LW / 4), 92, 1.5, false, t + i, false));
      box(g, 0, 104, LW, 40);
      text(g, "Battle to the till!", LW / 2, 112, "#202020", "center");
      if (Math.floor(t * 2) % 2 === 0) text(g, "PRESS START", LW / 2, 126, "#d0503a", "center");
      if (wins) text(g, "CHAMP x" + wins, LW - 6, 49, "#505060", "right");
    }
    function drawStarter(g, LW) {
      box(g, 0, 0, LW, 22); text(g, "CHOOSE A STARTER", LW / 2, 7, "#202020", "center");
      STARTERS.forEach((n, i) => {
        const x = LW / 2 + (i - 1) * Math.min(52, LW / 3.2), sel = i === starterPick;
        if (sel) { g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(x - 22, 30, 44, 54); }
        sprite(g, n, x, 78, sel ? 1.6 : 1.2, false, sel ? t : 0, false);
      });
      const n = STARTERS[starterPick], sp = SPECIES[n];
      box(g, 0, 96, LW, 48);
      text(g, n, 8, 104, "#202020"); g.fillStyle = TYPE_COL[sp.type]; g.fillRect(LW - 50, 103, 42, 10); text(g, sp.type, LW - 29, 104, "#202020", "center");
      const blurb = { EMBERPUP: "Fast and fierce. Burns leaf types.", DRIZZLET: "Tough. Douses fire and rock.", LEAFLING: "Steady. Can heal itself." }[n];
      wrap(g, blurb, LW - 16).slice(0, 2).forEach((l, i) => text(g, l, 8, 117 + i * 11, "#505060"));
    }
    function drawRoute(g, LW) {
      box(g, 0, 0, LW, 22); text(g, ui === "blackout" ? "TRY AGAIN" : "SHOP ROUTE", LW / 2, 7, "#202020", "center");
      const n = ROUTE.length, x0 = 14, x1 = LW - 14, y = 52;
      g.fillStyle = "#8a6b3f"; g.fillRect(x0, y - 1, x1 - x0, 3);
      ROUTE.forEach((R, i) => {
        const x = Math.round(x0 + ((x1 - x0) * i) / (n - 1));
        g.fillStyle = i < stage ? "#3fcf5e" : i === stage ? "#d0503a" : "#f8f8f0"; g.fillRect(x - 4, y - 4, 9, 9);
        g.fillStyle = "#303048"; g.fillRect(x - 4, y - 4, 9, 1); g.fillRect(x - 4, y + 4, 9, 1); g.fillRect(x - 4, y - 4, 1, 9); g.fillRect(x + 4, y - 4, 1, 9);
        if (R.champ) { g.fillStyle = "#ffd23f"; g.fillRect(x - 2, y - 11, 5, 4); }
      });
      const px = Math.round(x0 + ((x1 - x0) * stage) / (n - 1));
      sprite(g, party[0] ? P().name : "LEAFLING", px, y - 8 + Math.round(Math.sin(t * 6)), 0.8, false, t, false);
      const R = ROUTE[stage];
      box(g, 0, 76, LW, 68);
      const line1 = R.wild ? "Wild monsters ahead!" : R.champ ? "The Champion waits at the till." : R.trainer + " blocks the aisle.";
      wrap(g, line1, LW - 16).slice(0, 2).forEach((l, i) => text(g, l, 8, 84 + i * 11));
      text(g, "TEAM " + party.length + "/3  DISK x" + bag.DISK, 8, 110, "#505060");
      if (Math.floor(t * 2) % 2 === 0) text(g, ui === "blackout" ? "A: RETRY" : "A: GO", LW - 8, 128, "#d0503a", "right");
    }
    function drawWin(g, LW) {
      box(g, 6, 8, LW - 12, 34);
      text(g, "CHAMPION!", LW / 2, 15, "#d0503a", "center"); text(g, "THE TILL IS YOURS", LW / 2, 28, "#202020", "center");
      party.forEach((m, i) => sprite(g, m.name, LW / 2 + (i - (party.length - 1) / 2) * Math.min(48, LW / 3.4), 96, 1.4, false, t + i, false));
      box(g, 0, 104, LW, 40);
      text(g, party.map((m) => m.name.slice(0, 4) + " L" + m.lvl).join(" "), LW / 2, 114, "#202020", "center");
    }

    let lastLW = 240;
    function drawScreen(g, W, H) {
      const LW = W / H > 1.3 ? 240 : 160; lastLW = LW;
      if (!lc) return;
      if (lc.width !== LW || lc.height !== LH) { lc.width = LW; lc.height = LH; }
      const lg = lc.getContext("2d"); lg.setTransform(1, 0, 0, 1, 0, 0);
      drawLogical(lg, LW);
      const s = Math.min(W / LW, H / LH), dw = Math.round(LW * s), dh = Math.round(LH * s);
      g.save(); g.imageSmoothingEnabled = false;
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.drawImage(lc, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
      g.restore();
    }

    // -------------------- API --------------------
    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k !== "start") return;
        if (api.state === "menu" || api.state === "over") newRun();
        else input("jump");
      },
      hold(k, down) {
        if (!down) return;
        audio();
        if (api.state === "menu" || api.state === "over") { if (k === "jump") newRun(); return; }
        input(k);
      },
      click() { if (api.state !== "game") newRun(); else input("jump"); },
      release() {},
      toMenu() { api.state = "menu"; paused = false; ui = "title"; script = []; cur = null; },
      pause(p) { paused = !!p; },
      stop() { paused = true; if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ ui, stage, party, foe, fi, pi, bag, cursor, wild, msg: cur && cur.text, state: api.state })
    });
    return api;
  }

  window.ShelfMonsters = { create, _data: { MOVES, SPECIES, ROUTE, eff } };
})();
