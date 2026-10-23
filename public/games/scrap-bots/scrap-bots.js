/* =========================================================================
   SCRAPBOTS: build a robot from parts and battle the shop's bots.

   Every bot is four parts: HEAD, LEFT ARM, RIGHT ARM and LEGS, each with its
   own armour. Arms are your attacks (guns, fists, beams, drills), the head
   has an ability (scan, repair, missiles, shield) and the legs decide speed,
   dodge and defence (biped, wheels, hover, treads, spider). Break the HEAD to
   win. Broken arms can't attack; broken legs slow you down.

   - Battles run on charge gauges: when yours fills, time stops and you pick
     a part to use, then aim at a HEAD / ARM / LEGS (heads are harder to hit)
   - Your CORE sets your style and its OVERDRIVE special
   - WINNER TAKES A PART: after each win, take one of the loser's parts and
     bolt it on in the GARAGE. Four parts from one set = SET BONUS
   - 5 shop bots, ending with Champion Dan's DANDROID

   Arrows choose · A (Space) OK · B (X) back. Drawn on a small logical
   screen (240×144 wide, 160×144 narrow) and scaled up. Same engine API as
   the other cartridges (see gba.js), with grid: true for up / down.
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const LH = 144, FLOOR = 100;

  // ---------------------------------------------------------------------
  // Parts
  // ---------------------------------------------------------------------
  const SETS = {
    TINKER: { col: "#ffd23f", dark: "#a8862a" },
    ROLLER: { col: "#4fd6ff", dark: "#2a7fa0" },
    HOVER: { col: "#ff7ab8", dark: "#a8457a" },
    SPIDER: { col: "#6fe07a", dark: "#3a8f45" },
    TREAD: { col: "#ff8a3d", dark: "#a8501f" },
    DAN: { col: "#b38bff", dark: "#6a4abf" }
  };
  // heads: ability · arms: kind (shoot / strike / beam / drill) · legs: type
  const PARTS = {
    "TINKER HEAD": { slot: "head", set: "TINKER", armor: 30, ability: "SCAN" },
    "RIVET GUN": { slot: "arm", set: "TINKER", armor: 34, kind: "shoot", pow: 16, acc: 88, charge: 1 },
    "WRENCH ARM": { slot: "arm", set: "TINKER", armor: 38, kind: "strike", pow: 23, acc: 80, charge: 1.15 },
    "TINKER LEGS": { slot: "legs", set: "TINKER", armor: 44, type: "biped", spd: 10, eva: 12, def: 3 },

    "SCAN VISOR": { slot: "head", set: "ROLLER", armor: 24, ability: "SHIELD" },
    "PRICE GUN": { slot: "arm", set: "ROLLER", armor: 28, kind: "shoot", pow: 13, acc: 95, charge: 0.8 },
    "TAG BLASTER": { slot: "arm", set: "ROLLER", armor: 28, kind: "shoot", pow: 18, acc: 86, charge: 1 },
    "ROLLER WHEEL": { slot: "legs", set: "ROLLER", armor: 38, type: "wheels", spd: 14, eva: 8, def: 2 },

    "TILL HEAD": { slot: "head", set: "HOVER", armor: 26, ability: "REPAIR" },
    "COIN CANNON": { slot: "arm", set: "HOVER", armor: 26, kind: "beam", pow: 30, acc: 80, charge: 1.55 },
    "RECEIPT WHIP": { slot: "arm", set: "HOVER", armor: 30, kind: "strike", pow: 20, acc: 86, charge: 0.95 },
    "HOVER PAD": { slot: "legs", set: "HOVER", armor: 34, type: "hover", spd: 12, eva: 22, def: 1 },

    "MOP HEAD": { slot: "head", set: "SPIDER", armor: 28, ability: "REPAIR" },
    "SUDS SPRAYER": { slot: "arm", set: "SPIDER", armor: 30, kind: "shoot", pow: 15, acc: 92, charge: 0.9 },
    "SCRUB DRILL": { slot: "arm", set: "SPIDER", armor: 34, kind: "drill", pow: 24, acc: 82, charge: 1.2 },
    "SPIDER LEGS": { slot: "legs", set: "SPIDER", armor: 46, type: "spider", spd: 11, eva: 16, def: 4 },

    "HAZARD HEAD": { slot: "head", set: "TREAD", armor: 36, ability: "MISSILE" },
    "FORK DRILL": { slot: "arm", set: "TREAD", armor: 48, kind: "drill", pow: 29, acc: 74, charge: 1.45 },
    "LIFT CLAMP": { slot: "arm", set: "TREAD", armor: 48, kind: "strike", pow: 26, acc: 78, charge: 1.25 },
    "TREADS": { slot: "legs", set: "TREAD", armor: 66, type: "treads", spd: 7, eva: 3, def: 8 },

    "DAN CORE": { slot: "head", set: "DAN", armor: 40, ability: "MISSILE" },
    "PIXEL BLASTER": { slot: "arm", set: "DAN", armor: 40, kind: "beam", pow: 33, acc: 84, charge: 1.45 },
    "CODE SABER": { slot: "arm", set: "DAN", armor: 42, kind: "strike", pow: 30, acc: 86, charge: 1.15 },
    "DASH LEGS": { slot: "legs", set: "DAN", armor: 50, type: "biped", spd: 13, eva: 16, def: 5 }
  };
  const ABIL = {
    BRACE: "Halve the next hit",
    SCAN: "Next 2 attacks: +25 aim, more crits",
    REPAIR: "Fix your most damaged part",
    MISSILE: "Head missile, 3 shots",
    SHIELD: "Halve the next 2 hits"
  };
  const CORES = {
    BLAZE: { col: "#ff5a3d", blurb: ["+15% ATTACK POWER", "OVERDRIVE: MELTDOWN", "hits every enemy part"], od: "MELTDOWN" },
    SPARK: { col: "#ffe14d", blurb: ["+20% CHARGE SPEED", "OVERDRIVE: OVERCLOCK", "your next 3 turns are instant"], od: "OVERCLOCK" },
    GUARD: { col: "#4fd6ff", blurb: ["+15% ARMOUR", "OVERDRIVE: FORTIFY", "repairs every part by half"], od: "FORTIFY" }
  };
  const ROUTE = [
    { trainer: "STOCK BOY RAY", bot: "ROLL-E", core: "SPARK", parts: ["SCAN VISOR", "PRICE GUN", "TAG BLASTER", "ROLLER WHEEL"], lvl: 0.2, mult: 0.75, line: "Price check! On YOU!" },
    { trainer: "CASHIER MEL", bot: "CASHBOT", core: "GUARD", parts: ["TILL HEAD", "COIN CANNON", "RECEIPT WHIP", "HOVER PAD"], lvl: 0.3, mult: 0.72, line: "That'll be one defeat, please." },
    { trainer: "JANITOR JO", bot: "SUDSY", core: "GUARD", parts: ["MOP HEAD", "SUDS SPRAYER", "SCRUB DRILL", "SPIDER LEGS"], lvl: 0.5, mult: 0.88, line: "Time to mop the floor with you!" },
    { trainer: "FORKLIFT FRAN", bot: "FORKZILLA", core: "BLAZE", parts: ["HAZARD HEAD", "FORK DRILL", "LIFT CLAMP", "TREADS"], lvl: 0.6, mult: 0.86, line: "Heavy load coming through!" },
    { trainer: "CHAMPION DAN", bot: "DANDROID", core: "BLAZE", parts: ["DAN CORE", "PIXEL BLASTER", "CODE SABER", "DASH LEGS"], lvl: 0.65, mult: 0.8, line: "Built it myself. Show me yours!", champ: true }
  ];
  const SLOTS = ["head", "armL", "armR", "legs"], SLOT_NAME = { head: "HEAD", armL: "L-ARM", armR: "R-ARM", legs: "LEGS" };

  // ---------------------------------------------------------------------
  // Bot instances
  // ---------------------------------------------------------------------
  function makeBot(name, core, partNames) {
    const b = { name, core, parts: {}, gauge: 0, charge: 1, od: 0, scan: 0, shield: 0, overclock: 0, missiles: 3, x: 0, flash: {}, dead: false };
    const setBonus = partNames.every((p) => PARTS[p].set === PARTS[partNames[0]].set);
    SLOTS.forEach((s, i) => {
      const P = PARTS[partNames[i]];
      const armor = Math.round(P.armor * (core === "GUARD" ? 1.15 : 1) * (setBonus ? 1.1 : 1));
      b.parts[s] = { id: partNames[i], P, hp: armor, max: armor };
    });
    b.setBonus = setBonus;
    return b;
  }
  const alive = (b, s) => b.parts[s].hp > 0;
  const legsOK = (b) => alive(b, "legs");
  const speed = (b) => b.parts.legs.P.spd * (legsOK(b) ? 1 : 0.5) * (b.core === "SPARK" ? 1.2 : 1) * (b.setBonus ? 1.1 : 1);
  const evade = (b) => (legsOK(b) ? b.parts.legs.P.eva : 0);
  const defence = (b) => (legsOK(b) ? b.parts.legs.P.def : 0);
  function actions(b) { // what this bot can do right now
    const out = [];
    ["armL", "armR"].forEach((s) => { if (alive(b, s)) out.push({ kind: "arm", slot: s, part: b.parts[s].P, label: b.parts[s].id }); });
    const H = b.parts.head.P;
    if (H.ability === "MISSILE" ? b.missiles > 0 : true) out.push({ kind: "ability", ab: H.ability, label: H.ability === "MISSILE" ? "MISSILE x" + b.missiles : H.ability });
    if (b.od >= 100) out.push({ kind: "od", label: CORES[b.core].od + "!" });
    // no arms left: fight with what's left (a kick, or a headbutt with broken legs)
    if (!alive(b, "armL") && !alive(b, "armR")) out.unshift({ kind: "arm", slot: "legs", part: legsOK(b) ? KICK : HEADBUTT, label: legsOK(b) ? "KICK" : "HEADBUTT" });
    return out;
  }
  const KICK = { kind: "strike", pow: 14, acc: 82, charge: 1 }, HEADBUTT = { kind: "drill", pow: 10, acc: 78, charge: 1.1 };
  const AIM = { head: -24, armL: -6, armR: -6, legs: 8 };

  function create(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true, grid: true,
      hints: {
        menu: "ENTER / A: START", menuShort: "A: START",
        play: "ARROWS: CHOOSE   SPACE: OK   X: BACK", playShort: "A:OK  B:BACK",
        over: "ENTER / A: PLAY AGAIN", overShort: "A: AGAIN"
      },
      padLabels: { jump: "OK (A)", shoot: "BACK (B)" }
    };

    // ---------------------------------------------------------------------
    // Run state
    // ---------------------------------------------------------------------
    let ui = "title", t = 0, paused = false, cursor = 0, coreCur = 0;
    let core = "BLAZE", owned = [], build = {}, stage = 0, me = null, foe = null;
    let mode = "run", menu = [], target = null, job = null, msg = "", msgT = 0, floats = [], sparks = [], endT = 0, lootCur = 0, garageMsg = "";
    let lastLW = 240;

    function newRun() {
      api.state = "game"; ui = "core"; coreCur = 0;
      owned = ["TINKER HEAD", "RIVET GUN", "WRENCH ARM", "TINKER LEGS"];
      build = { head: "TINKER HEAD", armL: "RIVET GUN", armR: "WRENCH ARM", legs: "TINKER LEGS" }; stage = 0;
    }
    const buildList = () => SLOTS.map((s) => build[s]);
    const ownedFor = (slot) => owned.filter((p) => PARTS[p].slot === (slot === "armL" || slot === "armR" ? "arm" : slot));
    function startBattle() {
      const R = ROUTE[stage];
      me = makeBot("SCRAPPY", core, buildList()); foe = makeBot(R.bot, R.core, R.parts); foe.lvl = R.lvl; foe.mult = R.mult;
      SLOTS.forEach((sl) => { const p = foe.parts[sl]; p.max = p.hp = Math.round(p.max * (0.75 + R.mult * 0.15)); }); // shop bots are a bit flimsier than yours
      me.gauge = 40; foe.gauge = 20 + R.lvl * 20; job = null; floats = []; sparks = [];
      ui = "battle"; mode = "intro"; endT = 0; say(R.trainer + ": " + R.line); sfx.start();
    }
    function say(text) { msg = text; msgT = 0; }

    // ---------------------------------------------------------------------
    // Combat
    // ---------------------------------------------------------------------
    function resolve(a, d, act, tgt) { // returns a result and the job that animates it
      if (act.kind === "ability") {
        if (act.ab === "SCAN") return { msg: a.name + " SCANNED " + d.name + "!", fx: () => { a.scan = 2; } };
        if (act.ab === "BRACE") return { msg: a.name + " braced for impact!", fx: () => { a.shield = 1; } };
        if (act.ab === "SHIELD") return { msg: a.name + " raised a SHIELD!", fx: () => { a.shield = 2; } };
        if (act.ab === "REPAIR") {
          const s = SLOTS.filter((k) => alive(a, k)).sort((x, y) => a.parts[x].hp / a.parts[x].max - a.parts[y].hp / a.parts[y].max)[0];
          const amt = Math.round(a.parts[s].max * 0.35);
          return { msg: a.name + " repaired its " + SLOT_NAME[s] + "!", fx: () => { a.parts[s].hp = Math.min(a.parts[s].max, a.parts[s].hp + amt); floats.push({ who: a, slot: s, text: "+" + amt, col: "#6fe07a", t: 0 }); sfx.repair(); } };
        }
        if (act.ab === "MISSILE") { a.missiles--; return attackRes(a, d, { kind: "missile", pow: 26, acc: 82 }, tgt, "MISSILE"); }
      }
      if (act.kind === "od") {
        a.od = 0; const od = CORES[a.core].od;
        if (od === "MELTDOWN") return { msg: a.name + " OVERDRIVE: MELTDOWN!", anim: "melt", fx: () => SLOTS.forEach((s) => { if (alive(d, s)) dmgPart(a, d, s, 16, false); }) };
        if (od === "OVERCLOCK") return { msg: a.name + " OVERDRIVE: OVERCLOCK!", fx: () => { a.overclock = 3; } };
        return { msg: a.name + " OVERDRIVE: FORTIFY!", fx: () => SLOTS.forEach((s) => { if (alive(a, s)) { const amt = Math.round(a.parts[s].max * 0.5); a.parts[s].hp = Math.min(a.parts[s].max, a.parts[s].hp + amt); floats.push({ who: a, slot: s, text: "+" + amt, col: "#6fe07a", t: 0 }); } }) };
      }
      return attackRes(a, d, act.part, tgt, act.label);
    }
    function attackRes(a, d, P, tgt, label) {
      if (!alive(d, tgt)) tgt = SLOTS.filter((s) => alive(d, s))[0];
      let acc = P.acc + AIM[tgt] - evade(d) + (a.scan > 0 ? 25 : 0) + (P.kind === "strike" && d.parts.legs.P.type === "hover" && legsOK(d) ? -10 : 0);
      acc = Math.max(12, Math.min(98, acc));
      const hit = rng() * 100 < acc, crit = hit && rng() < (a.scan > 0 ? 0.3 : 0.1);
      if (a.scan > 0) a.scan--;
      let pow = P.pow * (a.mult || 1) * (a.core === "BLAZE" ? 1.15 : 1) * (a.setBonus ? 1.1 : 1) * (0.88 + rng() * 0.24) * (crit ? 1.5 : 1);
      if (P.kind === "strike" && !legsOK(a)) pow *= 0.6;
      const dmg = Math.max(1, Math.round(pow - (P.kind === "drill" ? 0 : P.kind === "beam" ? defence(d) / 2 : defence(d))));
      const verb = { shoot: "fired", strike: "swung", beam: "charged", drill: "drilled with", missile: "launched a" }[P.kind] || "used";
      return { msg: a.name + " " + verb + " " + label + "!", anim: P.kind, tgt, hit, fx: () => { if (hit) dmgPart(a, d, tgt, dmg, crit); else { floats.push({ who: d, slot: tgt, text: "MISS", col: "#c9d6e3", t: 0 }); sfx.miss(); } } };
    }
    function dmgPart(a, d, s, dmg, crit) {
      if (d.shield > 0) { dmg = Math.ceil(dmg / 2); d.shield--; }
      const p = d.parts[s]; const was = p.hp; p.hp = Math.max(0, p.hp - dmg);
      d.flash[s] = 0.3; floats.push({ who: d, slot: s, text: (crit ? "CRIT " : "") + dmg, col: crit ? "#ffd23f" : "#fff", t: 0 });
      a.od = Math.min(100, a.od + dmg * 0.7); d.od = Math.min(100, d.od + dmg * 1.3);
      sfx.hit(dmg);
      if (was > 0 && p.hp <= 0) { floats.push({ who: d, slot: s, text: SLOT_NAME[s] + " BROKEN!", col: "#ff5a5a", t: -0.25, big: true }); sfx.broke(); for (let i = 0; i < 10; i++) sparks.push({ who: d, slot: s, vx: (rng() - 0.5) * 60, vy: -rng() * 60, t: 0 }); }
      if (s === "head" && p.hp <= 0) d.dead = true;
    }
    function act(a, d, action, tgt) {
      const res = resolve(a, d, action, tgt);
      job = { a, d, res, t: 0, done: false, applied: false, dur: res.anim === "beam" || res.anim === "melt" ? 1.4 : res.anim ? 1.15 : 0.9, impact: res.anim === "strike" || res.anim === "drill" ? 0.5 : res.anim === "beam" ? 0.75 : res.anim === "missile" ? 0.7 : res.anim === "melt" ? 0.7 : res.anim ? 0.45 : 0.35 };
      say(res.msg); mode = "act";
      if (res.anim) sfx.attack(res.anim);
      const charge = action.kind === "arm" ? action.part.charge : 1;
      a.charge = a.overclock > 0 ? 0.05 : charge; if (a.overclock > 0) a.overclock--;
      a.gauge = 0;
    }
    function foeTurn() {
      const L = foe.lvl, acts = actions(foe);
      let choice;
      const hurt = SLOTS.filter((s) => alive(foe, s)).some((s) => foe.parts[s].hp / foe.parts[s].max < 0.4);
      const od = acts.find((x) => x.kind === "od"), ab = acts.find((x) => x.kind === "ability");
      if (od && rng() < 0.5 + L * 0.5) choice = od;
      else if (ab && ab.ab === "REPAIR" && hurt && rng() < 0.6) choice = ab;
      else if (ab && (ab.ab === "SCAN" || ab.ab === "SHIELD") && rng() < 0.18) choice = ab;
      else if (ab && ab.ab === "MISSILE" && rng() < 0.3) choice = ab;
      else {
        const arms = acts.filter((x) => x.kind === "arm");
        choice = arms.length ? arms.sort((x, y) => y.part.pow * y.part.acc - x.part.pow * x.part.acc)[rng() < 0.65 + L * 0.3 ? 0 : arms.length - 1] : acts[0];
      }
      // smart foes go for a weak head, otherwise spread damage
      let tgt;
      const headLow = me.parts.head.hp / me.parts.head.max < 0.45;
      const r = rng();
      if (headLow && r < 0.3 + L * 0.5) tgt = "head";
      else if (r < 0.1 + L * 0.2) tgt = "head"; else if (r < 0.55) tgt = alive(me, "armR") ? "armR" : "armL"; else if (r < 0.75) tgt = alive(me, "armL") ? "armL" : "legs"; else tgt = "legs";
      act(foe, me, choice, tgt);
    }

    // ---------------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------------
    function update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.05); t += dt; msgT += dt;
      floats.forEach((f) => (f.t += dt)); floats = floats.filter((f) => f.t < 1.1);
      sparks.forEach((s) => { s.t += dt; s.vy += 140 * dt; }); sparks = sparks.filter((s) => s.t < 0.6);
      [me, foe].forEach((b) => b && Object.keys(b.flash).forEach((k) => (b.flash[k] = Math.max(0, b.flash[k] - dt))));
      if (ui === "vs") { endT += dt; if (endT > 1.8) startBattle(); return; }
      if (ui !== "battle") return;
      if (mode === "intro") { if (msgT > 1.6) { mode = "run"; say("BATTLE START!"); sfx.go(); } return; }
      if (mode === "act") {
        job.t += dt;
        if (!job.applied && job.t >= job.impact) { job.applied = true; if (job.res.fx) job.res.fx(); }
        if (job.t >= job.dur) {
          job = null;
          if (foe.dead || me.dead) { mode = "end"; endT = 0; const won = foe.dead; say(won ? foe.name + " shut down! YOU WIN!" : me.name + " shut down..."); won ? sfx.win() : sfx.lose(); }
          else mode = "run";
        }
        return;
      }
      if (mode === "end") { endT += dt; return; }
      if (mode === "run") {
        const k = 9; // gauge fill: speed 10 ≈ 1.1 s per action at charge 1
        me.gauge += (dt * speed(me) * k) / me.charge; foe.gauge += (dt * speed(foe) * k) / foe.charge;
        if (me.gauge >= 100) { me.gauge = 100; mode = "menu"; menu = actions(me); cursor = 0; say("Your turn! Pick a part."); sfx.ready(); return; }
        if (foe.gauge >= 100) { foe.gauge = 100; foeTurn(); }
      }
    }

    // ---------------------------------------------------------------------
    // Input
    // ---------------------------------------------------------------------
    function input(k) {
      if (ui === "title") { if (k === "jump") newRun(); return; }
      if (ui === "core") {
        if (k === "left") { coreCur = (coreCur + 2) % 3; sfx.move(); } else if (k === "right") { coreCur = (coreCur + 1) % 3; sfx.move(); }
        else if (k === "jump") { core = Object.keys(CORES)[coreCur]; ui = "garage"; cursor = 4; garageMsg = "Bolt on parts, then BATTLE!"; sfx.ok(); }
        return;
      }
      if (ui === "garage") {
        if (k === "up") { cursor = (cursor + 4) % 5; sfx.move(); }
        else if (k === "down") { cursor = (cursor + 1) % 5; sfx.move(); }
        else if ((k === "left" || k === "right") && cursor < 4) {
          const slot = SLOTS[cursor], list = ownedFor(slot), other = slot === "armL" ? build.armR : slot === "armR" ? build.armL : null;
          const choices = list.filter((p) => p !== other || list.filter((q) => q === p).length > 1);
          if (choices.length < 2) { sfx.no(); return; }
          let i = choices.indexOf(build[slot]); i = (i + (k === "right" ? 1 : choices.length - 1)) % choices.length;
          build[slot] = choices[i]; sfx.move();
        } else if (k === "jump") { if (cursor === 4) { ui = "vs"; endT = 0; sfx.ok(); } else { cursor = 4; sfx.move(); } }
        return;
      }
      if (ui === "loot") {
        const parts = ROUTE[stage].parts;
        if (k === "up" || k === "left") { lootCur = (lootCur + 3) % 4; sfx.move(); }
        else if (k === "down" || k === "right") { lootCur = (lootCur + 1) % 4; sfx.move(); }
        else if (k === "jump") {
          const p = parts[lootCur]; owned.push(p); sfx.win();
          garageMsg = "Got " + p + "! Try it on.";
          if (ROUTE[stage].champ) { ui = "champion"; api.state = "over"; return; }
          stage++; ui = "garage"; cursor = SLOTS.findIndex((s) => (s === "armL" || s === "armR" ? "arm" : s) === PARTS[p].slot);
        }
        return;
      }
      if (ui === "lose") { if (k === "jump") { ui = "garage"; cursor = 4; garageMsg = "Rebuild and try again!"; } return; }
      if (ui !== "battle") return;
      if (mode === "end") {
        if (endT < 1 || !(k === "jump" || k === "shoot")) return;
        if (foe.dead) { ui = "loot"; lootCur = 0; } else ui = "lose";
        return;
      }
      if (mode === "menu") {
        if (k === "up") { cursor = (cursor + menu.length - 1) % menu.length; sfx.move(); }
        else if (k === "down") { cursor = (cursor + 1) % menu.length; sfx.move(); }
        else if (k === "jump") {
          const a = menu[cursor];
          if (a.kind === "arm" || (a.kind === "ability" && a.ab === "MISSILE")) { mode = "target"; target = a; cursor = 0; say("Aim at which part?"); sfx.ok(); }
          else { sfx.ok(); act(me, foe, a, null); }
        }
        return;
      }
      if (mode === "target") {
        const opts = SLOTS.filter((s) => alive(foe, s));
        if (k === "shoot") { mode = "menu"; cursor = 0; say("Your turn! Pick a part."); return; }
        if (k === "up" || k === "left") { cursor = (cursor + opts.length - 1) % opts.length; sfx.move(); }
        else if (k === "down" || k === "right") { cursor = (cursor + 1) % opts.length; sfx.move(); }
        else if (k === "jump") { sfx.ok(); act(me, foe, target, opts[cursor]); }
      }
    }

    // ---------------------------------------------------------------------
    // Sound
    // ---------------------------------------------------------------------
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
      move: () => beep(660, 0.03, 0, "square", 0.02), ok: () => beep(990, 0.06, 0, "square", 0.03), no: () => beep(150, 0.1, 0, "square", 0.04),
      ready: () => [880, 1320].forEach((f, i) => beep(f, 0.06, i * 0.06, "square", 0.03)),
      attack: (k) => (k === "beam" ? beep(140, 0.9, 0, "sawtooth", 0.05, 3) : k === "strike" || k === "drill" ? beep(220, 0.3, 0, "square", 0.04, 0.4) : k === "missile" ? beep(400, 0.6, 0, "sawtooth", 0.04, 0.3) : beep(900, 0.12, 0, "square", 0.04, 0.5)),
      hit: (d) => beep(d > 20 ? 80 : 120, 0.18, 0, "sawtooth", 0.07, 0.5),
      miss: () => beep(500, 0.1, 0, "triangle", 0.03, 1.5),
      broke: () => { beep(200, 0.5, 0, "sawtooth", 0.07, 0.2); beep(1600, 0.06, 0.05, "square", 0.03); },
      repair: () => [523, 659, 784].forEach((f, i) => beep(f, 0.08, i * 0.06, "triangle", 0.05)),
      start: () => [392, 523, 659, 784].forEach((f, i) => beep(f, 0.1, i * 0.09, "square", 0.035)),
      go: () => [784, 1047].forEach((f, i) => beep(f, 0.12, i * 0.1, "square", 0.04)),
      win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.13, i * 0.11, "square", 0.04)),
      lose: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.2, i * 0.16, "triangle", 0.05))
    };

    // ---------------------------------------------------------------------
    // Drawing: bots are assembled from their parts
    // ---------------------------------------------------------------------
    const LEG_H = { biped: 22, wheels: 14, hover: 18, treads: 12, spider: 18 };
    function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
    function outlineRect(g, x, y, w, h, c, o) { rect(g, x - 1, y - 1, w + 2, h + 2, o || "#0d0f16"); rect(g, x, y, w, h, c); }
    function drawBot(g, partNames, cx, fy, face, s, opts) {
      opts = opts || {};
      const st = (id) => SETS[PARTS[id].set], broken = opts.broken || {}, flash = opts.flash || {};
      const col = (slot, id) => (flash[slot] > 0 && Math.floor(flash[slot] * 20) % 2 ? "#ffffff" : broken[slot] ? "#3a3d48" : st(id).col);
      const dk = (slot, id) => (broken[slot] ? "#24262e" : st(id).dark);
      const [head, armL, armR, legs] = partNames;
      const L = PARTS[legs], lh = LEG_H[L.type] * s, bob = opts.still ? 0 : Math.round(Math.sin(t * 4 + cx) * 1 * s) / 1;
      const X = (dx) => cx + face * dx * s;
      const hipY = fy - lh + bob;
      const lc = col("legs", legs), ld = dk("legs", legs);
      // ---- legs
      if (L.type === "biped") { [-5, 3].forEach((dx, i) => { outlineRect(g, Math.min(X(dx), X(dx + 4)), hipY, 4 * s, lh - 3 * s, i ? lc : ld); outlineRect(g, Math.min(X(dx - 1), X(dx + 6)), fy - 3 * s, 7 * s, 3 * s, ld); }); }
      else if (L.type === "wheels") { outlineRect(g, Math.min(X(-9), X(9)), hipY, 18 * s, 5 * s, lc); [-6, 6].forEach((dx) => { g.fillStyle = "#0d0f16"; g.beginPath(); g.arc(X(dx), fy - 4.5 * s, 5 * s, 0, 7); g.fill(); g.fillStyle = ld; g.beginPath(); g.arc(X(dx), fy - 4.5 * s, 4 * s, 0, 7); g.fill(); g.fillStyle = "#d8dbe6"; g.save(); g.translate(X(dx), fy - 4.5 * s); g.rotate(t * 6 * face); g.fillRect(-1, -3 * s, 2, 6 * s); g.restore(); }); }
      else if (L.type === "hover") { outlineRect(g, Math.min(X(-10), X(10)), hipY + 4 * s, 20 * s, 6 * s, lc); outlineRect(g, Math.min(X(-4), X(4)), hipY, 8 * s, 5 * s, ld); g.globalAlpha = 0.5 + Math.sin(t * 20) * 0.2; rect(g, Math.min(X(-8), X(8)), hipY + 10 * s, 16 * s, 3 * s, "#bdf3ff"); g.globalAlpha = 1; }
      else if (L.type === "treads") { outlineRect(g, Math.min(X(-12), X(12)), fy - 11 * s, 24 * s, 11 * s, "#2a2c35"); for (let i = 0; i < 6; i++) rect(g, X(-11 + ((i * 4 + t * 20 * face) % 22 + 22) % 22) - (face < 0 ? 2 * s : 0), fy - 10 * s, 2 * s, 9 * s, ld); outlineRect(g, Math.min(X(-8), X(8)), hipY - 1 * s, 16 * s, 4 * s, lc); }
      else if (L.type === "spider") { const w = Math.sin(t * 8) * 1.5 * s; [[-12, -1], [-6, 1], [6, -1], [12, 1]].forEach(([dx, ph]) => { g.strokeStyle = "#0d0f16"; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(X(dx * 0.4), hipY + 3 * s); g.lineTo(X(dx * 0.9), hipY - 4 * s + ph * w); g.lineTo(X(dx), fy); g.stroke(); g.strokeStyle = ph > 0 ? lc : ld; g.lineWidth = 2 * s; g.stroke(); }); outlineRect(g, Math.min(X(-7), X(7)), hipY, 14 * s, 6 * s, lc); }
      // ---- back arm (left arm sits behind the body)
      const torsoY = hipY - 16 * s;
      drawArm(g, armL, X, torsoY, s, face, col("armL", armL), dk("armL", armL), true, opts.armPose);
      // ---- torso + core gem
      outlineRect(g, Math.min(X(-7), X(7)), torsoY, 14 * s, 16 * s, "#4a4f62");
      rect(g, Math.min(X(-6), X(6)), torsoY + 1 * s, 12 * s, 3 * s, "#5e6479");
      rect(g, Math.min(X(-2), X(2)), torsoY + 6 * s, 4 * s, 4 * s, opts.core ? CORES[opts.core].col : "#6ee7ff");
      rect(g, Math.min(X(-1), X(1)), torsoY + 7 * s, 1.5 * s, 1.5 * s, "#fff");
      // ---- head
      drawHead(g, head, X, torsoY, s, face, col("head", head), dk("head", head), broken.head);
      // ---- front arm
      drawArm(g, armR, X, torsoY, s, face, col("armR", armR), dk("armR", armR), false, opts.armPose);
    }
    function drawArm(g, id, X, ty, s, face, c, d, back, pose) {
      const P = PARTS[id], sx = back ? -6 : 6, extend = pose && pose.slot === (back ? "armL" : "armR") ? pose.k : 0;
      const ax = sx * 0.4 + extend * 8, y = ty + 3 * s;
      outlineRect(g, Math.min(X(ax - 2), X(ax + 2)), y, 4 * s, 6 * s, d); // shoulder
      const hx = ax + 2 + extend * 4, hy = y + 6 * s;
      if (P.kind === "shoot") { outlineRect(g, Math.min(X(hx - 3), X(hx + 9)), hy, 12 * s, 4 * s, c); rect(g, Math.min(X(hx + 9), X(hx + 11)), hy + 1 * s, 2 * s, 2 * s, "#0d0f16"); }
      else if (P.kind === "beam") { outlineRect(g, Math.min(X(hx - 3), X(hx + 11)), hy - 1 * s, 14 * s, 7 * s, c); rect(g, Math.min(X(hx + 8), X(hx + 11)), hy + 1 * s, 3 * s, 3 * s, "#bdf3ff"); }
      else if (P.kind === "drill") { outlineRect(g, Math.min(X(hx - 2), X(hx + 4)), hy, 6 * s, 6 * s, d); g.fillStyle = "#0d0f16"; g.beginPath(); g.moveTo(X(hx + 4), hy - 1 * s); g.lineTo(X(hx + 14), hy + 3 * s); g.lineTo(X(hx + 4), hy + 7 * s); g.fill(); g.fillStyle = c; g.beginPath(); g.moveTo(X(hx + 4), hy); g.lineTo(X(hx + 12), hy + 3 * s); g.lineTo(X(hx + 4), hy + 6 * s); g.fill(); }
      else { outlineRect(g, Math.min(X(hx - 2), X(hx + 4)), hy, 6 * s, 5 * s, d); outlineRect(g, Math.min(X(hx + 2), X(hx + 9)), hy - 1 * s, 7 * s, 7 * s, c); } // fist / clamp
    }
    function drawHead(g, id, X, ty, s, face, c, d, broken) {
      const set = PARTS[id].set, y = ty - 10 * s;
      if (set === "TINKER") { outlineRect(g, Math.min(X(-6), X(6)), y, 12 * s, 10 * s, c); rect(g, X(0), y - 5 * s, 1 * s, 5 * s, "#0d0f16"); rect(g, X(0) - 1.5 * s, y - 7 * s, 3 * s, 3 * s, "#ff5a5a"); }
      else if (set === "ROLLER") { outlineRect(g, Math.min(X(-7), X(7)), y + 1 * s, 14 * s, 9 * s, c); rect(g, Math.min(X(-1), X(7)), y + 3 * s, 8 * s, 3 * s, "#0d0f16"); }
      else if (set === "HOVER") { g.fillStyle = "#0d0f16"; g.beginPath(); g.arc(X(0), y + 8 * s, 7.5 * s, Math.PI, 0); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(X(0), y + 8 * s, 6.5 * s, Math.PI, 0); g.fill(); rect(g, Math.min(X(-6), X(6)), y + 8 * s, 12 * s, 2 * s, d); }
      else if (set === "SPIDER") { outlineRect(g, Math.min(X(-6), X(6)), y + 2 * s, 12 * s, 8 * s, c); for (let i = -5; i <= 5; i += 2) rect(g, X(i), y - 2 * s + Math.abs(i) * 0.3 * s, 1 * s, 4 * s, d); }
      else if (set === "TREAD") { outlineRect(g, Math.min(X(-7), X(7)), y, 14 * s, 10 * s, c); for (let i = 0; i < 4; i++) rect(g, Math.min(X(-7 + i * 4), X(-5 + i * 4)), y, 2 * s, 2 * s, "#0d0f16"); }
      else { outlineRect(g, Math.min(X(-6), X(6)), y, 12 * s, 10 * s, c); g.fillStyle = d; g.beginPath(); g.moveTo(X(-5), y); g.lineTo(X(0), y - 6 * s); g.lineTo(X(1), y); g.fill(); }
      // eye
      if (!broken) rect(g, Math.min(X(2), X(5)), y + 3.5 * s, 3 * s, 2 * s, set === "DAN" ? "#ff5a5a" : "#6ee7ff");
      else { rect(g, Math.min(X(2), X(5)), y + 4 * s, 3 * s, 1 * s, "#0d0f16"); }
    }

    // ---------------------------------------------------------------------
    // Screens
    // ---------------------------------------------------------------------
    function text(g, s, x, y, col, align) { g.font = "8px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top"; g.fillStyle = "#000"; g.fillText(s, x + 1, y + 1); g.fillStyle = col || "#fff"; g.fillText(s, x, y); }
    function wrap(g, s, w) { g.font = "8px " + FONT; const out = []; let line = ""; s.split(" ").forEach((wd) => { const tl = line ? line + " " + wd : wd; if (g.measureText(tl).width > w && line) { out.push(line); line = wd; } else line = tl; }); if (line) out.push(line); return out; }
    function panel(g, x, y, w, h) { rect(g, x, y, w, h, "#11131c"); rect(g, x, y, w, 1, "#3a3f55"); rect(g, x, y + h - 1, w, 1, "#3a3f55"); rect(g, x, y, 1, h, "#3a3f55"); rect(g, x + w - 1, y, 1, h, "#3a3f55"); }
    function arrow(g, x, y) { g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 3.5); g.lineTo(x, y + 7); g.fill(); }
    function backdrop(g, LW) {
      const sky = g.createLinearGradient(0, 0, 0, FLOOR); sky.addColorStop(0, "#151a2e"); sky.addColorStop(1, "#2a2346"); g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
      g.fillStyle = "#1e2238"; for (let x = 0; x < LW; x += 28) { g.fillRect(x + 2, 20, 24, FLOOR - 20); }               // warehouse racking
      g.fillStyle = "#ff8a3d"; for (let x = 0; x < LW; x += 28) { g.fillRect(x + 2, 44, 24, 2); g.fillRect(x + 2, 70, 24, 2); }
      g.fillStyle = "#2f3550"; g.fillRect(0, FLOOR, LW, LH - FLOOR);
      g.fillStyle = "#ffd23f"; for (let x = 0; x < LW; x += 16) g.fillRect(x, FLOOR + 1, 8, 2);                           // hazard stripe
      g.fillStyle = "#262b42"; for (let y = FLOOR + 8; y < LH; y += 8) g.fillRect(0, y, LW, 1);
    }
    const names = (b) => SLOTS.map((s) => b.parts[s].id);
    const brokenOf = (b) => { const o = {}; SLOTS.forEach((s) => (o[s] = !alive(b, s))); return o; };

    function drawBattle(g, LW) {
      backdrop(g, LW);
      const narrow = LW < 200, s = narrow ? 1.0 : 1.2, mx = Math.round(LW * 0.26), fxp = Math.round(LW * 0.74), fy = FLOOR + 6;
      // attack motion
      let meX = mx, foeX = fxp, armPose = null, foePose = null;
      if (job && job.res.anim) {
        const k = job.t / job.dur, attacker = job.a === me, from = attacker ? mx : fxp, to = attacker ? fxp - 30 : mx + 30;
        let x = from;
        if (job.res.anim === "strike" || job.res.anim === "drill") { const m = k < 0.45 ? k / 0.45 : k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; x = from + (to - from) * Math.min(1, Math.max(0, m)); }
        const pose = { slot: job.res.anim === "missile" ? "none" : "armR", k: k > 0.25 && k < 0.8 ? 1 : 0 };
        if (attacker) { meX = x; armPose = pose; } else { foeX = x; foePose = pose; }
      }
      const dead = (b) => b.dead && (!job || job.applied);
      g.save(); if (dead(me)) { g.globalAlpha = 0.85; }
      drawBot(g, names(me), meX, fy + (dead(me) ? 4 : 0), 1, s, { broken: brokenOf(me), flash: me.flash, core: me.core, armPose });
      g.restore();
      drawBot(g, names(foe), foeX, fy + (dead(foe) ? 4 : 0), -1, s, { broken: brokenOf(foe), flash: foe.flash, core: foe.core, armPose: foePose });
      // projectiles
      if (job && job.res.anim && job.t < job.impact) {
        const attacker = job.a === me, k = job.t / job.impact, x0 = attacker ? mx + 16 * s : fxp - 16 * s, x1 = attacker ? fxp : mx, y = fy - 34 * s;
        const kind = job.res.anim;
        if (kind === "shoot") { const x = x0 + (x1 - x0) * k; rect(g, x - 3, y, 6, 2, "#fff36b"); rect(g, x - 6 * Math.sign(x1 - x0), y, 3, 2, "#ff8a3d"); }
        if (kind === "missile") { const x = x0 + (x1 - x0) * k, yy = y - 20 * Math.sin(k * Math.PI) - 10; rect(g, x - 3, yy - 1, 7, 3, "#d8dbe6"); rect(g, x - 6 * Math.sign(x1 - x0), yy, 3, 2, "#ff5a3d"); }
        if (kind === "beam" && k > 0.5) { const w = (k - 0.5) * 2; g.fillStyle = "#2fb8ff"; g.fillRect(Math.min(x0, x1), y - 4 * w, Math.abs(x1 - x0), 8 * w); g.fillStyle = "#e8fbff"; g.fillRect(Math.min(x0, x1), y - 1.5 * w, Math.abs(x1 - x0), 3 * w); }
        if (kind === "melt") { g.fillStyle = "rgba(255,90,61," + (0.3 + k * 0.4) + ")"; g.fillRect(0, 0, LW, FLOOR + 10); }
      }
      // sparks + floating numbers
      const posOf = (b, slot) => { const x = b === me ? meX : foeX, y = fy - ({ head: 46, armL: 30, armR: 30, legs: 12 }[slot]) * s; return [x, y]; };
      sparks.forEach((p) => { const [x, y] = posOf(p.who, p.slot); rect(g, x + p.vx * p.t, y + p.vy * p.t, 2, 2, p.t < 0.3 ? "#fff36b" : "#ff8a3d"); });
      floats.forEach((f) => { if (f.t < 0) return; const [x, y] = posOf(f.who, f.slot); text(g, f.text, x, y - 6 - f.t * 18, f.col, "center"); });

      // status panels: 4 part bars + gauge + overdrive per bot
      const pw = narrow ? 74 : 104;
      [[me, 3], [foe, LW - pw - 3]].forEach(([b, x]) => {
        panel(g, x, 2, pw, 47);
        text(g, b.name.slice(0, narrow ? 7 : 11), x + 4, 5, b === me ? "#ffd23f" : "#ff7ab8");
        SLOTS.forEach((sl, i) => {
          const y = 15 + i * 7.5, p = b.parts[sl], r = p.hp / p.max, bx = x + 14, bw = pw - 18, flashOn = b.flash[sl] > 0;
          g.font = "8px " + FONT; g.textAlign = "left"; g.textBaseline = "top"; g.fillStyle = alive(b, sl) ? (flashOn ? "#fff" : "#9aa3b5") : "#ff5a5a";
          g.fillText("HLRF"[i], x + 4, Math.round(y - 1));
          rect(g, bx, y + 1, bw, 4, "#2a2d3a"); rect(g, bx, y + 1, Math.round(bw * r), 4, flashOn ? "#ffffff" : r > 0.5 ? "#43e07a" : r > 0.2 ? "#ffd23f" : "#ff5a5a");
        });
        rect(g, x + 4, 45, pw - 8, 2, "#2a2d3a"); rect(g, x + 4, 45, Math.round((pw - 8) * Math.min(1, b.gauge / 100)), 2, b.gauge >= 100 ? "#ffffff" : "#6ee7ff");
        // overdrive gem fills up in the corner, flashes when ready
        const odc = CORES[b.core].col, h = Math.round(6 * Math.min(1, b.od / 100));
        rect(g, x + pw - 10, 4, 6, 6, "#2a2d3a");
        if (b.od >= 100) { if (Math.floor(t * 6) % 2) rect(g, x + pw - 10, 4, 6, 6, odc); } else if (h) rect(g, x + pw - 10, 10 - h, 6, h, odc);
      });

      // bottom box
      const by = 108; panel(g, 0, by, LW, LH - by);
      if (mode === "menu") {
        const cols = narrow ? 1 : 2, cw = narrow ? LW : LW / 2;
        menu.forEach((a, i) => {
          const x = 12 + (i % cols) * cw, y = by + 5 + Math.floor(i / cols) * 10;
          if (narrow && i !== cursor) return;
          const label = a.kind === "arm" ? a.label : a.label;
          text(g, label.slice(0, narrow ? 17 : 14), narrow ? 12 : x, narrow ? by + 5 : y, a.kind === "od" ? CORES[me.core].col : "#fff");
          if (i === cursor) arrow(g, (narrow ? 12 : x) - 8, narrow ? by + 5 : y);
        });
        const a = menu[cursor]; let info = "";
        if (a.kind === "arm") info = a.part.kind.toUpperCase() + " POW " + a.part.pow + " AIM " + a.part.acc;
        else if (a.kind === "ability") info = ABIL[a.ab]; else info = CORES[me.core].blurb[2];
        if (narrow) { text(g, (cursor + 1) + "/" + menu.length, LW - 6, by + 5, "#9aa3b5", "right"); wrap(g, info, LW - 16).slice(0, 2).forEach((l, i) => text(g, l, 8, by + 16 + i * 10, "#9fd3ff")); }
        else text(g, info.slice(0, 29), 8, by + 26, "#9fd3ff");
      } else if (mode === "target") {
        const opts = SLOTS.filter((s2) => alive(foe, s2));
        text(g, "AIM:", 8, by + 5, "#9aa3b5");
        opts.forEach((sl, i) => { const x = (narrow ? 40 : 46) + i * (narrow ? 30 : 46), w = narrow ? 28 : 44; if (i === cursor) rect(g, x - 2, by + 3, w, 11, "#ffd23f"); text(g, narrow ? { head: "HD", armL: "LA", armR: "RA", legs: "FT" }[sl] : SLOT_NAME[sl], x, by + 5, i === cursor ? "#11131c" : "#fff"); });
        const sl = opts[cursor], P = target.part || { acc: 82, kind: "missile" };
        let acc = P.acc + AIM[sl] - evade(foe) + (me.scan > 0 ? 25 : 0) + (P.kind === "strike" && foe.parts.legs.P.type === "hover" && legsOK(foe) ? -10 : 0);
        acc = Math.max(12, Math.min(98, acc));
        text(g, "HIT " + Math.round(acc) + "%" + (sl === "head" ? (narrow ? " HEAD=KO" : "  HEAD = KO!") : ""), 8, by + 22, "#9fd3ff");
      } else {
        wrap(g, msg, LW - 14).slice(0, 3).forEach((l, i) => text(g, l, 7, by + 5 + i * 10));
        if (mode === "end" && endT > 1 && Math.floor(t * 2) % 2 === 0) text(g, "A", LW - 10, by + 26, "#ffd23f");
      }
      if (mode === "intro") { const R = ROUTE[stage]; g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, 50, LW, 18); text(g, "BATTLE " + (stage + 1) + "/5", LW / 2, 55, "#ffd23f", "center"); }
    }

    function statsLine(id) {
      const P = PARTS[id];
      if (P.slot === "head") return "ARM " + P.armor + " " + P.ability;
      if (P.slot === "arm") return P.kind.toUpperCase() + " P" + P.pow + " A" + P.acc;
      return P.type.toUpperCase() + " SPD" + P.spd + " EVA" + P.eva;
    }
    function drawGarage(g, LW) {
      backdrop(g, LW);
      const narrow = LW < 200, list = buildList();
      g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, LW, LH);
      text(g, "GARAGE", 6, 5, "#ffd23f"); text(g, "NEXT: " + ROUTE[stage].bot, LW - 6, 5, "#ff7ab8", "right");
      const px = narrow ? 32 : 54;
      drawBot(g, list, px, 98, 1, narrow ? 1.0 : 1.4, { core, still: false });
      const setB = list.every((p) => PARTS[p].set === PARTS[list[0]].set);
      if (setB) text(g, narrow ? "SET+10%" : "SET BONUS!", 4, 103, "#43e07a");
      const lx = narrow ? 64 : 112, rowH = 19;
      SLOTS.forEach((sl, i) => {
        const y = 18 + i * rowH, sel = cursor === i, many = ownedFor(sl).length > (sl === "armL" || sl === "armR" ? 2 : 1);
        if (sel) rect(g, lx - 3, y - 2, LW - lx, rowH - 1, "#2a2f4a");
        text(g, SLOT_NAME[sl], lx, y, "#7d869c");
        text(g, (sel && many ? "<" : "") + build[sl].slice(0, narrow ? 11 : 13) + (sel && many ? ">" : ""), lx, y + 9, SETS[PARTS[build[sl]].set].col);
      });
      const y4 = 18 + 4 * rowH;
      if (cursor === 4) rect(g, lx - 3, y4 - 2, LW - lx, 11, "#ffd23f");
      text(g, "BATTLE!", lx, y4, cursor === 4 ? "#11131c" : "#fff");
      panel(g, 0, 114, LW, 30);
      if (cursor < 4) { const id = build[SLOTS[cursor]], P = PARTS[id]; text(g, statsLine(id).slice(0, narrow ? 19 : 30), 6, 119, "#9fd3ff"); text(g, ("ARMOUR " + P.armor + "  " + (P.slot === "arm" ? "CHARGE " + P.charge : P.slot === "legs" ? "DEF " + P.def : "")).slice(0, narrow ? 19 : 30), 6, 130, "#c9d6e3"); }
      else wrap(g, garageMsg, LW - 12).slice(0, 2).forEach((l, i) => text(g, l, 6, 119 + i * 11, "#c9d6e3"));
    }
    function drawCore(g, LW) {
      backdrop(g, LW); g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(0, 0, LW, LH);
      text(g, "CHOOSE YOUR CORE", LW / 2, 6, "#fff", "center");
      Object.keys(CORES).forEach((k, i) => {
        const x = LW / 2 + (i - 1) * Math.min(56, LW / 3.2), sel = i === coreCur, c = CORES[k].col;
        if (sel) rect(g, x - 20, 20, 40, 44, "#2a2f4a");
        g.fillStyle = "#0d0f16"; g.beginPath(); g.moveTo(x, 26); g.lineTo(x + 12, 40); g.lineTo(x, 54); g.lineTo(x - 12, 40); g.fill();
        g.fillStyle = c; g.beginPath(); g.moveTo(x, 28 + (sel ? Math.sin(t * 5) : 0)); g.lineTo(x + 10, 40); g.lineTo(x, 52); g.lineTo(x - 10, 40); g.fill();
        rect(g, x - 3, 34, 3, 3, "#fff");
        text(g, k, x, 57, sel ? c : "#9aa3b5", "center");
      });
      const C = CORES[Object.keys(CORES)[coreCur]];
      panel(g, 0, 78, LW, LH - 78);
      C.blurb.forEach((l, i) => text(g, l.slice(0, LW < 200 ? 19 : 30), 6, 84 + i * 13, i === 1 ? C.col : "#c9d6e3"));
      text(g, "A: CHOOSE", LW - 6, LH - 12, "#ffd23f", "right");
    }
    function drawTitle(g, LW) {
      backdrop(g, LW);
      g.font = (LW >= 200 ? 22 : 16) + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#0d0f16"; g.fillText("SCRAPBOTS", LW / 2 + 2, 26 + 2); g.fillStyle = "#ffd23f"; g.fillText("SCRAPBOTS", LW / 2, 26);
      text(g, LW >= 200 ? "BUILD · BATTLE · TAKE PARTS" : "BUILD·BATTLE·LOOT", LW / 2, 40, "#9fd3ff", "center");
      drawBot(g, ["TINKER HEAD", "RIVET GUN", "WRENCH ARM", "TINKER LEGS"], LW / 2 - 40, FLOOR + 6, 1, 1.05, { core: "BLAZE" });
      drawBot(g, ["HAZARD HEAD", "FORK DRILL", "LIFT CLAMP", "TREADS"], LW / 2 + 40, FLOOR + 6, -1, 1.05, { core: "GUARD" });
      if (Math.floor(t * 2) % 2 === 0) text(g, "PRESS START", LW / 2, LH - 16, "#fff", "center");
    }
    function drawVs(g, LW) {
      backdrop(g, LW); g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, LW, LH);
      const R = ROUTE[stage], k = Math.min(1, endT / 0.35);
      text(g, R.trainer, LW / 2, 8, "#ff7ab8", "center");
      drawBot(g, buildList(), LW * 0.25 - (1 - k) * 60, FLOOR + 6, 1, 1.3, { core });
      drawBot(g, R.parts, LW * 0.75 + (1 - k) * 60, FLOOR + 6, -1, 1.3, { core: R.core });
      g.font = "16px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#0d0f16"; g.fillText("VS", LW / 2 + 2, 62); g.fillStyle = "#ffd23f"; g.fillText("VS", LW / 2, 60);
      text(g, "SCRAPPY", LW * 0.25, 120, "#ffd23f", "center"); text(g, R.bot, LW * 0.75, 120, "#ff7ab8", "center");
    }
    function drawLoot(g, LW) {
      backdrop(g, LW); g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, LW, LH);
      text(g, LW < 200 ? "TAKE A PART!" : "WINNER TAKES A PART!", LW / 2, 6, "#ffd23f", "center");
      const R = ROUTE[stage], id = R.parts[lootCur];
      drawBot(g, R.parts, LW < 200 ? 32 : 56, 100, -1, LW < 200 ? 1.0 : 1.4, { core: R.core, flash: { [SLOTS[lootCur]]: Math.sin(t * 10) > 0 ? 0.2 : 0 } });
      const lx = LW < 200 ? 66 : 112;
      R.parts.forEach((p, i) => { const y = 20 + i * 22; if (i === lootCur) rect(g, lx - 3, y - 2, LW - lx, 20, "#2a2f4a"); text(g, SLOT_NAME[SLOTS[i]], lx, y, "#7d869c"); text(g, p.slice(0, LW < 200 ? 11 : 13), lx, y + 9, SETS[PARTS[p].set].col); });
      panel(g, 0, 114, LW, 30); text(g, statsLine(id).slice(0, LW < 200 ? 19 : 30), 6, 119, "#9fd3ff"); text(g, "A: TAKE IT", 6, 130, "#ffd23f");
    }
    function drawEnd(g, LW, champ) {
      backdrop(g, LW); g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, LW, LH);
      g.font = (LW >= 200 ? 16 : 12) + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#0d0f16"; const tt = champ ? "BOT CHAMPION!" : "SHUT DOWN..."; g.fillText(tt, LW / 2 + 2, 24); g.fillStyle = champ ? "#ffd23f" : "#9aa3b5"; g.fillText(tt, LW / 2, 22);
      drawBot(g, buildList(), LW / 2, FLOOR + 6, 1, 1.35, { core });
      text(g, champ ? "PARTS COLLECTED: " + owned.length : "A: BACK TO GARAGE", LW / 2, 122, "#fff", "center");
    }

    function drawLogical(g, LW) {
      g.imageSmoothingEnabled = false;
      if (api.state === "menu" || ui === "title") return drawTitle(g, LW);
      if (ui === "core") return drawCore(g, LW);
      if (ui === "garage") return drawGarage(g, LW);
      if (ui === "vs") return drawVs(g, LW);
      if (ui === "battle") return drawBattle(g, LW);
      if (ui === "loot") return drawLoot(g, LW);
      if (ui === "lose") return drawEnd(g, LW, false);
      if (ui === "champion") return drawEnd(g, LW, true);
    }
    const lc = typeof document !== "undefined" ? document.createElement("canvas") : null;
    function drawScreen(g, W, H) {
      const LW = W / H > 1.3 ? 240 : 160; lastLW = LW;
      if (!lc) return;
      if (lc.width !== LW || lc.height !== LH) { lc.width = LW; lc.height = LH; }
      const lg = lc.getContext("2d"); lg.setTransform(1, 0, 0, 1, 0, 0);
      drawLogical(lg, LW);
      const s = Math.min(W / LW, H / LH), dw = Math.round(LW * s), dh = Math.round(LH * s);
      g.save(); g.imageSmoothingEnabled = false; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.drawImage(lc, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh); g.restore();
    }

    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k !== "start") return;
        if (api.state === "menu" || api.state === "over") { newRun(); return; }
        input("jump");
      },
      hold(k, down) {
        if (!down) return;
        audio();
        if (api.state === "menu" || api.state === "over") { if (k === "jump") newRun(); return; }
        input(k);
      },
      click() { if (api.state !== "game") newRun(); else input("jump"); },
      release() {},
      toMenu() { api.state = "menu"; ui = "title"; paused = false; },
      pause(p) { paused = !!p; },
      stop() { paused = true; if (ac && ac.state === "running") ac.suspend(); },
      debug: () => ({ ui, mode, stage, me, foe, menu, cursor, owned, build, msg })
    });
    return api;
  }

  window.ScrapBots = { create, _data: { PARTS, ROUTE, SLOTS } };
})();
