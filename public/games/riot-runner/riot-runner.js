/* =========================================================================
   RIOT RUNNER: a run-and-gun mission for the console cartridges, in the
   spirit of the chunky arcade shooters.

   One mission through a desert outpost: blast the Rust Army, free tied-up
   POWs for weapons, hop into the MINI TANK, beat the tank at the bridge and
   take down the IRON MAMMOTH walker.

   Controls: ← → run · ↑ aim up · ↓ crouch (aim down in the air)
             A (Space) jump · B (X) fire (knife at close range)
             C / Y / DOWN+B grenade · in the tank: ↓ + A to hop out
   Weapons from POWs: H heavy machine gun · R rockets · S shotgun.

   Drawn on a small logical screen (256×144 wide, 160×144 narrow), camera
   scrolls forward only. Fixed 60 fps simulation. Same engine API as the
   other cartridges (see gba.js), with grid: true and bombs: true.
   ========================================================================= */
(function () {
  "use strict";
  const FONT = '"Press Start 2P", ui-monospace, monospace';
  const LH = 144, GY = 124, STEP = 1 / 60, LEVEL_W = 2560, GRAV = 0.25;

  // ---------------------------------------------------------------------
  // The mission
  // ---------------------------------------------------------------------
  const PLATFORMS = [ // one-way tops: x, y, w (crates, ruins, ledges)
    [330, 104, 34], [420, 92, 48], [610, 100, 40], [760, 96, 60], [840, 78, 40], [1240, 102, 36],
    [1780, 98, 50], [1880, 84, 40], [1990, 100, 44]
  ];
  // enemies appear when the camera reaches `at` (spawned just off the right edge unless x is given)
  const SPAWNS = [
    { at: 60, type: "soldier", x: 300 }, { at: 120, type: "soldier", x: 380 }, { at: 200, type: "soldier" },
    { at: 260, type: "soldier" }, { at: 330, type: "soldier", x: 440, y: 92 }, { at: 380, type: "knifer" },
    { at: 420, type: "turret", x: 560 }, { at: 460, type: "soldier" }, { at: 520, type: "grenadier", x: 630, y: 100 },
    { at: 600, type: "soldier" }, { at: 640, type: "knifer" }, { at: 700, type: "soldier", x: 790, y: 96 },
    { at: 720, type: "grenadier", x: 860, y: 78 }, { at: 780, type: "soldier" }, { at: 820, type: "soldier" },
    { at: 900, type: "knifer" }, { at: 960, type: "soldier" },
    { at: 1120, type: "soldier" }, { at: 1160, type: "soldier" }, { at: 1200, type: "grenadier", x: 1258, y: 102 },
    { at: 1260, type: "knifer" }, { at: 1300, type: "tank", x: 1560 },
    { at: 1620, type: "soldier" }, { at: 1660, type: "knifer" }, { at: 1700, type: "soldier", x: 1805, y: 98 },
    { at: 1740, type: "turret", x: 1940 }, { at: 1780, type: "grenadier", x: 1900, y: 84 }, { at: 1840, type: "soldier" },
    { at: 1900, type: "knifer" }, { at: 1960, type: "soldier" }, { at: 2010, type: "soldier", x: 2012, y: 100 },
    { at: 2100, type: "soldier" }, { at: 2160, type: "knifer" },
    { at: 2230, type: "boss", x: 2440 }
  ];
  const POWS = [{ x: 250, give: "H" }, { x: 700, give: "BOMBS" }, { x: 1150, give: "H" }, { x: 1700, give: "R" }, { x: 2050, give: "S" }];
  const LOCKS = [{ type: "tank", from: 1300, cam: 1340 }, { type: "boss", from: 2230, cam: LEVEL_W - 256 }];
  const VEHICLE_X = 1030;
  const WEAPONS = {
    P: { name: "PISTOL", cd: 9, ammo: Infinity },
    H: { name: "HEAVY MG", cd: 4, ammo: 200 },
    R: { name: "ROCKET", cd: 20, ammo: 30 },
    S: { name: "SHOTGUN", cd: 24, ammo: 30 }
  };

  function create(opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const api = {
      WIDTH: 800, HEIGHT: 400, ready: true, focus: { x: 400, y: 200 }, state: "menu", soundOn: true, grid: true, bombs: true,
      hints: {
        menu: "ENTER / A: START", menuShort: "A: START",
        play: "SPACE: JUMP  X: FIRE  C: GRENADE", playShort: "A:JUMP B:FIRE",
        over: "ENTER / A: PLAY AGAIN", overShort: "A: AGAIN"
      },
      padLabels: { jump: "JUMP", shoot: "FIRE", bomb: "GRENADE", startPlay: "PAUSE" }
    };

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------
    let ui = "title", t = 0, acc = 0, frame = 0, paused = false, lastLW = 256;
    let P = null, camX = 0, lock = null, lockDone = {}, spawnI = 0, enemies = [], shots = [], eshots = [], nades = [], pows = [], items = [], fx = [], debris = [];
    let vehicle = null, score = 0, kills = 0, freed = 0, timeT = 0, shake = 0, banner = "", bannerT = 0, endT = 0, best = 0;
    const held = new Set();
    try { best = parseInt(localStorage.getItem("riotrunner.best"), 10) || 0; } catch (e) {}

    function newGame() {
      api.state = "game"; ui = "play"; score = 0; kills = 0; freed = 0; timeT = 0;
      P = { x: 40, y: GY, vx: 0, vy: 0, face: 1, ground: true, crouch: false, aim: "fwd", wpn: "P", ammo: Infinity, bombs: 10, cd: 0, lives: 3, inv: 90, dead: 0, runT: 0, flash: 0, knife: 0, inTank: false, throwT: 0 };
      camX = 0; lock = null; lockDone = {}; spawnI = 0; enemies = []; shots = []; eshots = []; nades = []; items = []; fx = []; debris = [];
      pows = POWS.map((p) => ({ x: p.x, y: GY, give: p.give, state: "tied", t: 0 }));
      vehicle = { x: VEHICLE_X, y: GY, hp: 3, used: false, alive: true, cd: 0, shellCd: 0, face: 1, vy: 0, bob: 0 };
      setBanner("MISSION 1  START!", 2); sfx.start();
    }
    function setBanner(s, d) { banner = s; bannerT = d; }
    const groundAt = (x, y, vy) => { // y of the surface under (x), checking one-way platforms when falling
      let g = GY;
      if (vy >= 0) for (const [px, py, pw] of PLATFORMS) if (x > px - 2 && x < px + pw + 2 && y <= py + 1 && py < g) g = py;
      return g;
    };

    // ---------------------------------------------------------------------
    // Enemies
    // ---------------------------------------------------------------------
    function spawn(sp) {
      const x = sp.x != null ? sp.x : camX + lastLW + 14 + rng() * 10;
      const base = { type: sp.type, x, y: sp.y != null ? sp.y : GY, vx: 0, vy: 0, face: -1, t: 0, cd: 40 + rng() * 60, flash: 0, dying: 0, state: "idle", panic: 0 };
      if (sp.type === "soldier") Object.assign(base, { hp: 1, w: 10, h: 20, score: 100 });
      if (sp.type === "knifer") Object.assign(base, { hp: 1, w: 10, h: 20, score: 150, speed: 1.45 });
      if (sp.type === "grenadier") Object.assign(base, { hp: 2, w: 10, h: 20, score: 200, cd: 70 });
      if (sp.type === "turret") Object.assign(base, { hp: 14, w: 26, h: 18, score: 500, cd: 60, burst: 0 });
      if (sp.type === "tank") Object.assign(base, { hp: 60, max: 60, w: 54, h: 30, score: 3000, cd: 90, dir: -1, mg: 0 });
      if (sp.type === "boss") Object.assign(base, { hp: 280, max: 280, w: 60, h: 64, score: 20000, cd: 80, pattern: 0, walk: -1 });
      // soldiers placed on a ledge stay on it
      if (base.y < GY) { const pl = PLATFORMS.find(([px, py, pw]) => py === base.y && x >= px - 2 && x <= px + pw + 2); if (pl) { base.minX = pl[0] + 4; base.maxX = pl[0] + pl[2] - 4; } }
      enemies.push(base);
    }
    function hurtEnemy(e, dmg, kx) {
      if (e.dying || e.hp <= 0) return;
      e.hp -= dmg; e.flash = 4;
      if (e.hp <= 0) {
        e.dying = 1; e.vx = (kx || 1) * 1.3; e.vy = -2.6; score += e.score; kills++;
        if (e.type === "turret" || e.type === "tank" || e.type === "boss") { e.dying = 1; bigBoom(e.x, e.y - e.h / 2, e.type === "boss" ? 3 : e.type === "tank" ? 2 : 1); }
        else sfx.enemyDie();
        if (e.type === "tank" || e.type === "boss") { lockDone[e.type] = true; if (lock && lock.type === e.type) lock = null; }
        if (e.type === "boss") { ui = "won"; endT = 0; setBanner("MISSION COMPLETE!", 99); sfx.win(); }
        if (e.type === "tank") setBanner("GREAT!", 1.2);
      } else if (e.type !== "tank" && e.type !== "boss" && e.type !== "turret") sfx.hit();
      else sfx.clank();
    }
    function enemyShot(x, y, tx, ty, speed, kind) {
      const a = Math.atan2(ty - y, tx - x);
      eshots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: kind || "bullet", life: 240 });
    }
    function lob(x, y, tx, kind, owner) { // arcing grenade / shell aimed at a spot
      const dx = tx - x, time = 50 + rng() * 10, vx = dx / time, vy = -0.5 * GRAV * time;
      nades.push({ x, y, vx, vy, t: 0, owner, kind: kind || "nade", bounced: false });
    }
    const pBox = () => (P.inTank ? { x0: P.x - 14, x1: P.x + 14, y0: P.y - 22, y1: P.y } : { x0: P.x - 4, x1: P.x + 4, y0: P.y - (P.crouch && P.ground ? 12 : 20), y1: P.y });
    const eBox = (e) => ({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y - e.h, y1: e.y });
    const inBox = (x, y, b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

    function stepEnemy(e) {
      e.t++; if (e.flash > 0) e.flash--;
      if (e.dying) {
        if (e.type === "soldier" || e.type === "knifer" || e.type === "grenadier") { e.vy += GRAV; e.x += e.vx; e.y = Math.min(groundAt(e.x, e.y, 1), e.y + e.vy); e.dying++; }
        else e.dying++;
        return e.dying < (e.type === "boss" ? 200 : 60);
      }
      const dx = P.x - e.x, dist = Math.abs(dx), sees = dist < lastLW * 0.9 && P.dead === 0;
      const onScreen = e.x > camX - 20 && e.x < camX + lastLW + 30;
      // grenades landing nearby make foot soldiers panic and run
      if ((e.type === "soldier" || e.type === "grenadier") && nades.some((n) => n.owner === "p" && Math.abs(n.x - e.x) < 30) && !e.panic) e.panic = 40;
      if (e.type === "soldier" || e.type === "grenadier") {
        e.face = dx > 0 ? 1 : -1;
        if (e.panic > 0) { e.panic--; e.x -= e.face * 1.2; e.state = "panic"; }
        else if (e.type === "soldier" && sees && dist > 110) { e.x += e.face * 0.7; e.state = "walk"; }
        else if (e.type === "soldier" && sees && dist < 40) { e.x -= e.face * 0.5; e.state = "walk"; }
        else e.state = "idle";
        if (sees && onScreen && --e.cd <= 0) {
          if (e.type === "soldier") { e.state = "aim"; e.cd = 110 + rng() * 80; enemyShot(e.x + e.face * 8, e.y - 14, P.x, P.y - (P.crouch ? 8 : 14), 1.9); sfx.eshot(); fx.push({ k: "flash", x: e.x + e.face * 10, y: e.y - 14, t: 0, life: 4 }); }
          else { e.cd = 130 + rng() * 60; lob(e.x, e.y - 18, P.x + (rng() - 0.5) * 30, "nade", "e"); sfx.throw(); e.state = "throw"; e.throwT = 14; }
        }
        if (e.throwT) e.throwT--;
      } else if (e.type === "knifer") {
        e.face = dx > 0 ? 1 : -1;
        if (sees) { e.x += e.face * e.speed; e.state = "run"; if (dist < 12 && Math.abs(P.y - e.y) < 16 && P.inv <= 0 && !P.dead) { e.state = "slash"; hurtPlayer(); } }
      } else if (e.type === "turret") {
        e.face = -1;
        if (sees && onScreen && dx < 0) { if (e.burst > 0) { if (e.t % 7 === 0) { enemyShot(e.x - 14, e.y - 12, e.x - 200, e.y - 12 + (P.y - e.y) * 0.3, 2.6); e.burst--; sfx.eshot(); fx.push({ k: "flash", x: e.x - 16, y: e.y - 12, t: 0, life: 3 }); } } else if (--e.cd <= 0) { e.burst = 4; e.cd = 100; } }
      } else if (e.type === "tank") {
        if (e.x > camX + lastLW - 30) e.x -= 0.6; // roll on screen
        else { e.x += e.dir * 0.35; if (e.x < camX + lastLW * 0.5 || e.x > camX + lastLW - 30) e.dir *= -1; }
        e.face = -1;
        if (--e.cd <= 0) { e.cd = 95 + rng() * 40; lob(e.x - 26, e.y - 26, P.x + (rng() - 0.5) * 20, "shell", "e"); sfx.cannon(); fx.push({ k: "flash", x: e.x - 30, y: e.y - 26, t: 0, life: 5 }); shake = Math.max(shake, 0.12); }
        if (e.t % 160 < 30 && e.t % 6 === 0) enemyShot(e.x - 20, e.y - 14, P.x, P.y - 10, 2.4);
      } else if (e.type === "boss") {
        if (e.x > camX + lastLW - 40) { e.x -= 0.5; return true; }
        e.x += e.walk * 0.25; if (e.x < camX + lastLW * 0.55 || e.x > camX + lastLW - 36) e.walk *= -1;
        const fast = e.hp < e.max / 2 ? 0.65 : 1;
        if (--e.cd <= 0) {
          e.pattern = (e.pattern + 1) % 3;
          if (e.pattern === 0) { for (let i = -2; i <= 2; i++) enemyShot(e.x - 24, e.y - 48, P.x, P.y - 12 + i * 14, 2.2); sfx.cannon(); e.cd = 90 * fast; }
          else if (e.pattern === 1) { for (let i = 0; i < 4; i++) lob(e.x - 10, e.y - 60, P.x + (i - 1.5) * 26 + (rng() - 0.5) * 10, "shell", "e"); sfx.cannon(); e.cd = 120 * fast; }
          else { fx.push({ k: "wave", x: e.x - 30, y: GY, vx: -2.6, t: 0, life: 140 }); shake = 0.25; sfx.stomp(); e.cd = 100 * fast; e.stomp = 18; }
        }
        if (e.stomp) e.stomp--;
      }
      if (e.minX != null) e.x = Math.max(e.minX, Math.min(e.maxX, e.x));
      // contact damage from big things
      if ((e.type === "tank" || e.type === "boss") && overlap(eBox(e), pBox())) hurtPlayer();
      return e.x > camX - 80;
    }

    // ---------------------------------------------------------------------
    // Player
    // ---------------------------------------------------------------------
    function hurtPlayer() {
      if (P.inv > 0 || P.dead) return;
      if (P.inTank) {
        vehicle.hp--; P.inv = 50; shake = 0.2; sfx.clank();
        if (vehicle.hp <= 0) { bigBoom(P.x, P.y - 12, 1); vehicle.alive = false; P.inTank = false; P.vy = -4; P.ground = false; P.inv = 90; setBanner("TANK DOWN!", 1.2); }
        return;
      }
      P.dead = 1; P.vy = -3; P.vx = -P.face * 1; sfx.die();
    }
    function respawn() {
      P.lives--;
      if (P.lives < 0) { ui = "continue"; P.lives = 0; return; }
      Object.assign(P, { x: Math.max(camX + 30, P.x), y: GY - 60, vy: 0, vx: 0, dead: 0, inv: 150, wpn: "P", ammo: Infinity, bombs: 10, ground: false });
    }
    function fire() {
      const W = WEAPONS[P.wpn];
      if (P.cd > 0) return;
      // knife: a soldier right in front of you
      if (!P.inTank) {
        const near = enemies.find((e) => !e.dying && (e.type === "soldier" || e.type === "knifer" || e.type === "grenadier") && Math.sign(e.x - P.x) === P.face && Math.abs(e.x - P.x) < 16 && Math.abs(e.y - P.y) < 14);
        if (near) { P.knife = 10; P.cd = 12; hurtEnemy(near, 5, P.face); sfx.knife(); return; }
      }
      const up = P.aim === "up", down = P.aim === "down" && !P.ground;
      let ox = P.x + P.face * (P.inTank ? 16 : 10), oy = P.y - (P.inTank ? 20 : P.crouch && P.ground ? 9 : 15);
      let ang = up ? -Math.PI / 2 : down ? Math.PI / 2 : P.face > 0 ? 0 : Math.PI;
      if (up) { ox = P.x + P.face * 2; oy = P.y - (P.inTank ? 30 : 26); } else if (down) { ox = P.x; oy = P.y; }
      P.flash = 4; P.cd = P.inTank ? 5 : W.cd;
      if (P.inTank || P.wpn === "P" || P.wpn === "H") {
        const spread = P.wpn === "H" || P.inTank ? (rng() - 0.5) * 0.12 : 0;
        shots.push({ x: ox, y: oy, vx: Math.cos(ang + spread) * 5.2, vy: Math.sin(ang + spread) * 5.2, dmg: 1, life: 70, k: "b" });
        sfx.shot(P.wpn === "H" || P.inTank);
      } else if (P.wpn === "R") {
        shots.push({ x: ox, y: oy, vx: Math.cos(ang) * 1.5, vy: Math.sin(ang) * 1.5, ax: Math.cos(ang) * 0.12, ay: Math.sin(ang) * 0.12, dmg: 5, life: 120, k: "r", splash: 20 });
        sfx.rocket();
      } else if (P.wpn === "S") {
        for (let i = -2; i <= 2; i++) shots.push({ x: ox, y: oy, vx: Math.cos(ang + i * 0.12) * 4.2, vy: Math.sin(ang + i * 0.12) * 4.2, dmg: 2, life: 14, k: "s" });
        fx.push({ k: "blast", x: ox + Math.cos(ang) * 10, y: oy + Math.sin(ang) * 10, t: 0, life: 8 }); sfx.shotgun();
      }
      if (!P.inTank && P.wpn !== "P") { P.ammo--; if (P.ammo <= 0) { P.wpn = "P"; P.ammo = Infinity; } }
    }
    function throwBomb() {
      if (P.inTank) { if (vehicle.shellCd > 0) return; vehicle.shellCd = 40; shots.push({ x: P.x + P.face * 18, y: P.y - 20, vx: P.face * 3.6, vy: -0.6, dmg: 8, life: 120, k: "shell", splash: 26, grav: 0.05 }); sfx.cannon(); shake = 0.1; return; }
      if (P.bombs <= 0 || P.throwT > 0) return;
      P.bombs--; P.throwT = 14;
      nades.push({ x: P.x + P.face * 4, y: P.y - 18, vx: P.face * 2.4 + P.vx * 0.5, vy: -3.2, t: 0, owner: "p", kind: "nade", bounced: false });
      sfx.throw();
    }
    function stepPlayer() {
      if (P.inv > 0) P.inv--; if (P.cd > 0) P.cd--; if (P.flash > 0) P.flash--; if (P.knife > 0) P.knife--; if (P.throwT > 0) P.throwT--;
      if (vehicle.shellCd > 0) vehicle.shellCd--;
      if (P.dead) { P.dead++; P.vy += GRAV; P.y = Math.min(GY, P.y + P.vy); P.x += P.vx; if (P.dead > 80) respawn(); return; }
      const L = held.has("left"), R = held.has("right");
      P.aim = held.has("up") ? "up" : held.has("down") ? "down" : "fwd";
      P.crouch = held.has("down") && P.ground && !P.inTank;
      const speed = P.inTank ? 1.2 : P.crouch ? 0 : 1.45;
      P.vx = (R ? speed : 0) - (L ? speed : 0);
      if (L !== R) P.face = R ? 1 : -1;
      if (P.vx) P.runT++;
      P.x += P.vx;
      // jump / gravity / land
      P.vy += GRAV; let ny = P.y + P.vy;
      const g = groundAt(P.x, P.y, P.vy);
      if (ny >= g && P.vy >= 0) { ny = g; P.vy = 0; P.ground = true; } else P.ground = false;
      P.y = ny;
      // hold fire = autofire
      if (held.has("shoot")) fire();
      // camera only moves forward; locks for the tank and the boss
      const minX = camX + 8, maxX = camX + lastLW - 10;
      P.x = Math.max(minX, Math.min(maxX, P.x));
      // tank pickup
      if (vehicle.cooldown > 0) vehicle.cooldown--;
      if (!P.inTank && vehicle.alive && !vehicle.used && !(vehicle.cooldown > 0) && Math.abs(P.x - vehicle.x) < 14 && P.y > GY - 30) { P.inTank = true; vehicle.used = true; P.inv = 30; setBanner("MINI TANK!", 1.2); sfx.power(); }
      if (P.inTank) { vehicle.x = P.x; vehicle.face = P.face; }
      // items
      items = items.filter((it) => {
        if (Math.abs(it.x - P.x) < 10 && Math.abs(it.y - P.y) < 16) {
          if (it.k === "BOMBS") { P.bombs += 10; setBanner("+10 GRENADES", 1); }
          else { P.wpn = it.k; P.ammo = WEAPONS[it.k].ammo; setBanner(WEAPONS[it.k].name + "!", 1); }
          score += 500; sfx.power(); return false;
        }
        return true;
      });
      // POWs: touch to free
      pows.forEach((p) => {
        if (p.state === "tied" && Math.abs(p.x - P.x) < 12 && Math.abs(p.y - P.y) < 16) freePow(p);
      });
    }
    function freePow(p) {
      p.state = "free"; p.t = 0; freed++; score += 1000; sfx.thanks();
      items.push({ x: p.x + 10, y: GY, k: p.give, t: 0 });
    }

    // ---------------------------------------------------------------------
    // Projectiles, grenades, effects
    // ---------------------------------------------------------------------
    function bigBoom(x, y, size) {
      for (let i = 0; i < 3 + size * 3; i++) fx.push({ k: "boom", x: x + (rng() - 0.5) * 18 * size, y: y + (rng() - 0.5) * 14 * size, r: 6 + rng() * 6 * size, t: -i * 4, life: 26 });
      for (let i = 0; i < 6 * size; i++) debris.push({ x, y, vx: (rng() - 0.5) * 4, vy: -rng() * 4, t: 0, c: rng() < 0.5 ? "#4a4a52" : "#7a5a3a" });
      shake = Math.max(shake, 0.25 * size); sfx.boom();
    }
    function explode(x, y, r, dmg, owner) {
      fx.push({ k: "boom", x, y, r: r * 0.6, t: 0, life: 24 }); shake = Math.max(shake, 0.15); sfx.boom();
      if (owner === "p") enemies.forEach((e) => { if (!e.dying && Math.abs(e.x - x) < r + e.w / 2 && Math.abs((e.y - e.h / 2) - y) < r + e.h / 2) hurtEnemy(e, dmg, Math.sign(e.x - x)); });
      else if (Math.abs(P.x - x) < r && Math.abs(P.y - 10 - y) < r + 6) hurtPlayer();
      pows.forEach((p) => { if (owner === "p" && p.state === "tied" && Math.abs(p.x - x) < r) freePow(p); });
    }
    function stepShots() {
      shots = shots.filter((s) => {
        if (s.ax) { s.vx += s.ax; s.vy += s.ay; } if (s.grav) s.vy += s.grav;
        s.x += s.vx; s.y += s.vy; s.life--;
        if (s.k === "r" && frame % 2 === 0) fx.push({ k: "smoke", x: s.x, y: s.y, t: 0, life: 18 });
        if (s.y > GY || s.y < -20 || s.x < camX - 20 || s.x > camX + lastLW + 20 || s.life <= 0) { if (s.splash && s.y > GY - 2) explode(s.x, GY - 4, s.splash, s.dmg, "p"); return false; }
        for (const e of enemies) if (!e.dying && inBox(s.x, s.y, eBox(e))) { if (s.splash) explode(s.x, s.y, s.splash, s.dmg, "p"); else { hurtEnemy(e, s.dmg, Math.sign(s.vx) || 1); fx.push({ k: "spark", x: s.x, y: s.y, t: 0, life: 6 }); } return false; }
        for (const p of pows) if (p.state === "tied" && Math.abs(s.x - p.x) < 6 && s.y > p.y - 14) { freePow(p); return false; }
        return true;
      });
      eshots = eshots.filter((s) => {
        s.x += s.vx; s.y += s.vy; s.life--;
        if (inBox(s.x, s.y, pBox()) && !P.dead) { hurtPlayer(); return false; }
        return s.life > 0 && s.y < GY && s.x > camX - 30 && s.x < camX + lastLW + 30;
      });
      nades = nades.filter((n) => {
        n.t++; n.vy += GRAV * (n.kind === "shell" ? 1 : 1.1); n.x += n.vx; n.y += n.vy;
        const g = groundAt(n.x, n.y, n.vy);
        const hitEnemy = n.owner === "p" && enemies.some((e) => !e.dying && inBox(n.x, n.y, eBox(e)));
        if (hitEnemy || (n.owner === "e" && !P.dead && inBox(n.x, n.y, pBox()))) { explode(n.x, n.y, n.kind === "shell" ? 18 : 22, 6, n.owner); return false; }
        if (n.y >= g) {
          if (n.kind === "nade" && !n.bounced && n.owner === "p") { n.bounced = true; n.y = g; n.vy = -1.6; n.vx *= 0.6; return true; }
          explode(n.x, g - 4, n.kind === "shell" ? 18 : 22, 6, n.owner); return false;
        }
        return n.t < 400;
      });
      fx.forEach((f) => {
        f.t++;
        if (f.k === "wave") { f.x += f.vx; if (Math.abs(f.x - P.x) < 8 && P.y > GY - 8) hurtPlayer(); }
      });
      fx = fx.filter((f) => f.t < f.life && !(f.k === "wave" && f.x < camX - 20));
      debris.forEach((d) => { d.t++; d.vy += GRAV; d.x += d.vx; d.y = Math.min(GY, d.y + d.vy); }); debris = debris.filter((d) => d.t < 70);
    }

    // ---------------------------------------------------------------------
    // Frame
    // ---------------------------------------------------------------------
    function stepFrame() {
      frame++; timeT += STEP;
      stepPlayer();
      // spawns triggered by the camera
      while (spawnI < SPAWNS.length && camX + lastLW > SPAWNS[spawnI].at + lastLW * 0.6 - 60) spawn(SPAWNS[spawnI++]);
      enemies = enemies.filter(stepEnemy);
      stepShots();
      pows.forEach((p) => { if (p.state === "free") { p.t++; p.x -= p.t > 40 ? 1.2 : 0; } });
      items.forEach((it) => it.t++);
      // locks: stop scrolling until the tank / boss is beaten
      LOCKS.forEach((L) => { if (!lockDone[L.type] && !lock && camX + lastLW * 0.5 >= L.from) { lock = L; setBanner(L.type === "boss" ? "WARNING! BOSS!" : "ENEMY TANK!", 1.6); sfx.warn(); } });
      const want = Math.max(camX, Math.min(LEVEL_W - lastLW, P.x - lastLW * 0.42));
      camX = lock ? Math.min(want, Math.max(camX, lock.cam)) : want;
      if (lock) camX = Math.min(camX, lock.cam);
    }

    // ---------------------------------------------------------------------
    // Sound
    // ---------------------------------------------------------------------
    let ac = null, noise = null;
    function audio() {
      if (!ac && typeof window !== "undefined") { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && !noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
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
      src.buffer = noise; fl.type = "lowpass"; fl.frequency.value = freq || 1200; g.gain.setValueAtTime(vol || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
      src.connect(fl).connect(g).connect(ac.destination); src.start(t0); src.stop(t0 + d);
    }
    let lastShot = 0;
    const sfx = {
      shot: (mg) => { if (t - lastShot < 0.05) return; lastShot = t; hiss(0.06, mg ? 0.08 : 0.1, 3000); beep(mg ? 220 : 300, 0.05, 0, "square", 0.025, 0.5); },
      shotgun: () => { hiss(0.2, 0.2, 1500); beep(90, 0.15, 0, "square", 0.05, 0.5); },
      rocket: () => hiss(0.35, 0.12, 800),
      knife: () => hiss(0.08, 0.1, 5000),
      eshot: () => beep(500, 0.06, 0, "square", 0.02, 0.6),
      cannon: () => { hiss(0.3, 0.2, 400); beep(70, 0.25, 0, "square", 0.06, 0.6); },
      throw: () => beep(400, 0.12, 0, "triangle", 0.03, 1.6),
      boom: () => { hiss(0.6, 0.25, 500); beep(55, 0.4, 0, "square", 0.06, 0.5); },
      hit: () => beep(180, 0.06, 0, "square", 0.03),
      clank: () => beep(900, 0.04, 0, "square", 0.03, 0.8),
      enemyDie: () => beep(600, 0.25, 0, "square", 0.035, 0.3),
      die: () => [400, 300, 200, 120].forEach((f, i) => beep(f, 0.15, i * 0.12, "square", 0.05)),
      power: () => [523, 784, 1047].forEach((f, i) => beep(f, 0.08, i * 0.06, "square", 0.04)),
      thanks: () => [880, 1175].forEach((f, i) => beep(f, 0.1, i * 0.1, "square", 0.035)),
      stomp: () => { hiss(0.5, 0.25, 300); beep(45, 0.5, 0, "square", 0.07, 0.7); },
      warn: () => [880, 660, 880, 660].forEach((f, i) => beep(f, 0.12, i * 0.15, "square", 0.04)),
      start: () => [392, 523, 659, 784].forEach((f, i) => beep(f, 0.1, i * 0.09, "square", 0.035)),
      win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.14, i * 0.12, "square", 0.04))
    };

    // ---------------------------------------------------------------------
    // Drawing
    // ---------------------------------------------------------------------
    const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    function text(g, s, x, y, col, align, size) { g.font = (size || 8) + "px " + FONT; g.textAlign = align || "left"; g.textBaseline = "top"; g.fillStyle = "#000"; g.fillText(s, x + 1, y + 1); g.fillStyle = col || "#fff"; g.fillText(s, x, y); }
    function big(g, s, x, y, col, size) { g.font = size + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#000"; [[-1, 0], [1, 0], [0, -1], [0, 2], [2, 2]].forEach(([a, b]) => g.fillText(s, x + a, y + b)); g.fillStyle = col; g.fillText(s, x, y); }

    // soldier: x = centre, y = feet. pal: skin, cap, top, pants, gun
    function soldier(g, x, y, face, pal, o) {
      o = o || {};
      const X = (dx, w) => (face > 0 ? x + dx : x - dx - w);
      const crouch = o.crouch, run = o.run || 0, legH = crouch ? 4 : 8, bodyY = y - legH - 8, ph = Math.floor(run / 5) % 4;
      // legs
      const lA = [0, 2, 0, -2][ph], lB = -lA;
      if (o.air) { R(g, X(-3, 3), y - 7, 3, 5, pal.pants); R(g, X(1, 3), y - 8, 3, 5, pal.pants); R(g, X(-4, 4), y - 3, 4, 2, "#2a2420"); R(g, X(1, 4), y - 4, 4, 2, "#2a2420"); }
      else { R(g, X(-3 + lA, 3), y - legH, 3, legH, pal.pants); R(g, X(1 + lB, 3), y - legH, 3, legH, shadeOf(pal.pants)); R(g, X(-4 + lA, 4), y - 2, 4, 2, "#2a2420"); R(g, X(1 + lB, 4), y - 2, 4, 2, "#2a2420"); }
      // body
      R(g, X(-4, 8), bodyY, 8, 9, pal.top); R(g, X(-4, 8), bodyY + 6, 8, 1, "#2a2420");
      if (pal.vest) R(g, X(-3, 3), bodyY + 1, 3, 5, pal.vest);
      // head
      R(g, X(-3, 6), bodyY - 7, 6, 7, pal.skin); R(g, X(1, 1), bodyY - 5, 1, 1, "#111");
      if (pal.band) { R(g, X(-3, 7), bodyY - 7, 7, 2, pal.band); R(g, X(-6, 3), bodyY - 6 + (run % 10 < 5 ? 0 : 1), 3, 1, pal.band); }
      if (pal.helmet) { R(g, X(-4, 8), bodyY - 9, 8, 4, pal.helmet); R(g, X(-4, 9), bodyY - 6, 9, 1, shadeOf(pal.helmet)); }
      if (o.panic) { R(g, X(-6, 2), bodyY - 4, 2, 6, pal.skin); R(g, X(5, 2), bodyY - 4, 2, 6, pal.skin); return; }
      // arm + gun
      const gunC = pal.gun || "#3a3a44", gy = bodyY + 2;
      if (o.knife) { R(g, X(4, 5), gy, 5, 2, pal.skin); R(g, X(9, 6), gy - 1, 6, 1, "#e8e8f0"); return; }
      if (o.aim === "up") { R(g, X(1, 2), bodyY - 10, 2, 11, gunC); R(g, X(0, 3), bodyY - 1, 3, 3, pal.skin); if (o.flash) R(g, X(0, 4), bodyY - 15, 4, 4, "#fff36b"); }
      else if (o.aim === "down") { R(g, X(0, 2), bodyY + 6, 2, 11, gunC); if (o.flash) R(g, X(-1, 4), bodyY + 17, 4, 4, "#fff36b"); }
      else if (o.throw) { R(g, X(-2, 3), bodyY - 4, 3, 5, pal.skin); }
      else { const len = o.big ? 11 : 8; R(g, X(2, 4), gy, 4, 3, pal.skin); R(g, X(4, len), gy, len, o.big ? 3 : 2, gunC); if (o.flash) { R(g, X(4 + len, 4), gy - 1, 4, 4, "#fff36b"); R(g, X(5 + len, 2), gy - 2, 2, 6, "#ffd27a"); } }
    }
    function shadeOf(hex) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v * 0.75); return "rgb(" + f((n >> 16) & 255) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")"; }
    const PAL_P = { skin: "#f1c08f", band: "#e0352b", top: "#6b7a3a", vest: "#8a9a4a", pants: "#a68a5a", gun: "#2f2f38" };
    const PAL_E = { skin: "#e8b07e", helmet: "#7a6a4a", top: "#9a7a52", pants: "#6a5a3e", gun: "#3a3a44" };
    const PAL_K = { skin: "#e8b07e", band: "#3a3a44", top: "#7a5a3e", pants: "#4a3e2a", gun: "#3a3a44" };
    const PAL_G = { skin: "#e8b07e", helmet: "#5a6a3a", top: "#7a8a52", pants: "#5a5a3e" };

    function drawTank(g, x, y, face, col, hatch, o) {
      o = o || {};
      const X = (dx, w) => (face > 0 ? x + dx : x - dx - w);
      R(g, X(-15, 30), y - 8, 30, 8, "#2a2a30"); for (let i = 0; i < 5; i++) R(g, X(-13 + ((i * 6 + (o.roll || 0)) % 28), 3), y - 6, 3, 4, "#55555e");
      R(g, X(-14, 28), y - 16, 28, 9, col); R(g, X(-14, 28), y - 16, 28, 2, shadeOf(col));
      R(g, X(-7, 14), y - 23, 14, 8, col);
      if (o.up) R(g, X(2, 3), y - 36, 3, 14, "#3a3a44"); else R(g, X(6, 14), y - 21, 14, 3, "#3a3a44");
      if (hatch) { R(g, X(-5, 6), y - 29, 6, 6, PAL_P.skin); R(g, X(-5, 7), y - 30, 7, 2, PAL_P.band); }
      if (o.flash) R(g, o.up ? X(1, 5) : X(20, 4), o.up ? y - 41 : y - 22, o.up ? 5 : 4, 5, "#fff36b");
    }

    function drawWorld(g, LW) {
      // sky + far mesas + ruins (parallax)
      const sky = g.createLinearGradient(0, 0, 0, GY); sky.addColorStop(0, "#5ab0e8"); sky.addColorStop(0.7, "#bfe0f0"); sky.addColorStop(1, "#f2d9a8");
      g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
      g.fillStyle = "#fff6"; for (let i = 0; i < 6; i++) { const x = ((i * 97 - camX * 0.05) % (LW + 60) + LW + 60) % (LW + 60) - 30; R(g, x, 14 + (i % 3) * 9, 26, 5, "#ffffff99"); R(g, x + 6, 10 + (i % 3) * 9, 14, 5, "#ffffff99"); }
      const layer = (par, col, step, hts, base) => { for (let i = -1; i < LW / step + 2; i++) { const wx = Math.floor(camX * par / step) + i, x = wx * step - camX * par, h = hts[((wx % hts.length) + hts.length) % hts.length]; R(g, x, base - h, step - 4, h + 40, col); R(g, x - 2, base - h, step, 3, shadeOf(col)); } };
      layer(0.2, "#d9a76a", 70, [26, 38, 20, 44, 30], 96);
      layer(0.45, "#c08850", 40, [14, 24, 8, 30, 18, 12], 108);
      // ground
      R(g, 0, GY, LW, LH - GY, "#d9a05b"); R(g, 0, GY, LW, 2, "#8a5a2a");
      for (let i = -1; i < LW / 20 + 2; i++) { const x = Math.floor(camX / 20) * 20 + i * 20 - camX; R(g, x + ((i * 7) % 11), GY + 6, 4, 1, "#b8803e"); R(g, x + ((i * 13) % 17), GY + 12, 3, 1, "#b8803e"); }
      // props: palms + broken walls + sandbags along the route
      for (let px = 120; px < LEVEL_W; px += 230) { const x = px - camX * 1; if (x < -30 || x > LW + 30) continue; R(g, x, GY - 34, 3, 34, "#7a5a32"); [[-10, -2], [3, -3], [-8, 2], [4, 1]].forEach(([dx, dy]) => R(g, x + dx, GY - 36 + dy, 10, 3, "#3f8a3a")); }
      PLATFORMS.forEach(([px, py, pw]) => { const x = px - camX; if (x > LW || x + pw < 0) return; R(g, x, py, pw, GY - py, "#9a6a3a"); R(g, x, py, pw, 2, "#c89a5a"); for (let yy = py + 6; yy < GY; yy += 8) R(g, x + 1, yy, pw - 2, 1, "#7a4a2a"); for (let xx = 6; xx < pw; xx += 12) R(g, x + xx, py + 2, 1, GY - py - 2, "#7a4a2a"); });
      if (LEVEL_W - camX < LW + 20) { const x = 2380 - camX; R(g, x, GY - 60, 6, 60, "#5a4a3a"); R(g, x + 6, GY - 60, 30, 4, "#5a4a3a"); }
    }

    function drawPlay(g, LW) {
      let sx = 0, sy = 0; if (shake > 0) { sx = Math.round((rng() - 0.5) * shake * 16); sy = Math.round((rng() - 0.5) * shake * 12); }
      g.save(); g.translate(sx, sy);
      drawWorld(g, LW);
      const cx = (x) => x - camX;
      // vehicle waiting
      if (vehicle.alive && !P.inTank && !vehicle.used) { drawTank(g, cx(vehicle.x), vehicle.y + Math.sin(t * 3) * 0.5, 1, "#c9a227", false); if (Math.floor(t * 3) % 2) text(g, "IN!", cx(vehicle.x), vehicle.y - 44, "#fff", "center"); }
      // POWs
      pows.forEach((p) => {
        const x = cx(p.x); if (x < -20 || x > LW + 20) return;
        if (p.state === "tied") { R(g, x - 1, p.y - 22, 2, 22, "#7a5a32"); R(g, x - 4, p.y - 14, 8, 8, "#e8e0c8"); R(g, x - 3, p.y - 20, 6, 6, "#f1c08f"); R(g, x - 3, p.y - 17, 6, 3, "#7a5a3a"); R(g, x - 4, p.y - 6, 3, 6, "#c8b890"); R(g, x + 1, p.y - 6, 3, 6, "#c8b890"); R(g, x - 5, p.y - 11, 10, 1, "#a8743a"); if (Math.floor(t * 2) % 2) text(g, "HELP", x, p.y - 32, "#fff", "center"); }
        else if (p.t < 200) { const salute = p.t < 40; R(g, x - 4, p.y - 14, 8, 8, "#e8e0c8"); R(g, x - 3, p.y - 20, 6, 6, "#f1c08f"); R(g, x - 3, p.y - 17, 6, 3, "#7a5a3a"); R(g, x - 4 + (p.t % 10 < 5 ? 0 : 1), p.y - 6, 3, 6, "#c8b890"); R(g, x + 1, p.y - 6, 3, 6, "#c8b890"); if (salute) { R(g, x + 3, p.y - 21, 2, 7, "#f1c08f"); text(g, "THANK YOU!", x, p.y - 32, "#ffd23f", "center"); } }
      });
      // items
      items.forEach((it) => { const x = cx(it.x), y = it.y - 8 + Math.sin(t * 5) * 1.5; R(g, x - 6, y - 6, 12, 12, "#2a2a30"); R(g, x - 5, y - 5, 10, 10, it.k === "BOMBS" ? "#5a8a3a" : "#c9302b"); text(g, it.k === "BOMBS" ? "B" : it.k, x, y - 4, "#fff", "center"); });
      // enemies
      enemies.forEach((e) => {
        const x = cx(e.x); if (x < -60 || x > LW + 60) return;
        if (e.dying && Math.floor(e.dying / 3) % 2 && e.dying > 30) return;
        const fl = e.flash > 0 && Math.floor(e.flash) % 2;
        if (e.type === "soldier") soldier(g, x, e.y, e.face, fl ? { skin: "#fff", helmet: "#fff", top: "#fff", pants: "#fff" } : PAL_E, { run: e.state === "walk" || e.state === "panic" ? e.t : 0, panic: e.state === "panic" || (e.dying && e.dying < 30), flash: e.state === "aim" && e.cd > 100 });
        else if (e.type === "knifer") soldier(g, x, e.y, e.face, PAL_K, { run: e.state === "run" ? e.t * 1.5 : 0, knife: e.state === "slash" || true, panic: !!e.dying });
        else if (e.type === "grenadier") soldier(g, x, e.y, e.face, PAL_G, { throw: e.throwT > 0, panic: e.state === "panic" || !!e.dying });
        else if (e.type === "turret") { R(g, x - 15, e.y - 10, 30, 10, "#b89a5a"); for (let i = 0; i < 5; i++) R(g, x - 15 + i * 6, e.y - 10, 5, 4, "#a08048"); R(g, x - 8, e.y - 18, 16, 8, fl ? "#fff" : "#5a5a62"); R(g, x - 22, e.y - 14, 14, 3, "#2f2f38"); if (e.dying) R(g, x - 15, e.y - 6, 30, 6, "#3a3a40"); }
        else if (e.type === "tank") { if (!e.dying) drawTank(g, x, e.y, -1, fl ? "#ffffff" : "#6a7a4a", false, { roll: e.t }); else { R(g, x - 20, e.y - 12, 40, 12, "#3a3a40"); } }
        else if (e.type === "boss") drawBoss(g, x, e, fl);
      });
      // player
      if (!(P.inv > 0 && Math.floor(P.inv / 3) % 2 && !P.dead)) {
        if (P.inTank) drawTank(g, cx(P.x), P.y, P.face, "#c9a227", true, { up: P.aim === "up", flash: P.flash > 0, roll: P.runT });
        else if (P.dead) { R(g, cx(P.x) - 7, P.y - 6, 14, 6, PAL_P.top); R(g, cx(P.x) + 5 * P.face - 3, P.y - 7, 6, 6, PAL_P.skin); }
        else soldier(g, cx(P.x), P.y, P.face, PAL_P, { run: P.vx ? P.runT : 0, crouch: P.crouch, air: !P.ground, aim: P.aim === "up" ? "up" : P.aim === "down" && !P.ground ? "down" : "fwd", flash: P.flash > 0, big: P.wpn !== "P", knife: P.knife > 0, throw: P.throwT > 8 });
      }
      // shots + grenades
      shots.forEach((s) => { const x = cx(s.x); if (s.k === "r") { R(g, x - 3, s.y - 1, 6, 3, "#d8dbe6"); R(g, x - 3 - Math.sign(s.vx) * 3, s.y - 1, 3, 3, "#ff8a3d"); } else if (s.k === "shell") R(g, x - 2, s.y - 2, 5, 4, "#2f2f38"); else if (s.k === "s") R(g, x - 1, s.y - 1, 3, 2, "#ffd27a"); else { const h = Math.abs(s.vy) > Math.abs(s.vx); R(g, x - (h ? 0 : 2), s.y - (h ? 2 : 0), h ? 1 : 4, h ? 4 : 1, "#fff36b"); } });
      eshots.forEach((s) => { const x = cx(s.x); R(g, x - 1, s.y - 1, 3, 3, "#ff5a3d"); R(g, x, s.y, 1, 1, "#fff"); });
      nades.forEach((n) => { const x = cx(n.x); R(g, x - 2, n.y - 2, n.kind === "shell" ? 5 : 4, n.kind === "shell" ? 5 : 4, n.kind === "shell" ? "#2f2f38" : "#4a5a2a"); });
      // fx
      fx.forEach((f) => {
        const x = cx(f.x), k = f.t / f.life;
        if (f.t < 0) return;
        if (f.k === "boom") { const r = f.r * (0.5 + k); g.fillStyle = k < 0.3 ? "#fff6b0" : k < 0.6 ? "#ff9a3d" : "#6a6a72"; g.beginPath(); g.arc(x, f.y - k * 6, r, 0, 7); g.fill(); if (k < 0.5) { g.fillStyle = "#ff5a2a"; g.beginPath(); g.arc(x + 2, f.y - k * 6 + 1, r * 0.55, 0, 7); g.fill(); } }
        else if (f.k === "smoke") { g.fillStyle = "rgba(220,220,220," + (0.6 - k * 0.6) + ")"; g.beginPath(); g.arc(x, f.y - k * 4, 2 + k * 3, 0, 7); g.fill(); }
        else if (f.k === "flash" || f.k === "blast") { R(g, x - 3, f.y - 3, 6, 6, "#fff36b"); }
        else if (f.k === "spark") { R(g, x - 2, f.y, 4, 1, "#fff"); R(g, x, f.y - 2, 1, 4, "#fff"); }
        else if (f.k === "wave") { for (let i = 0; i < 4; i++) R(g, x - 6 + i * 4, GY - 6 - ((frame + i * 3) % 6), 3, 6 + ((frame + i * 3) % 6), i % 2 ? "#c08850" : "#8a5a2a"); }
      });
      debris.forEach((d) => R(g, cx(d.x), d.y, 2, 2, d.c));
      g.restore();
      drawHUD(g, LW);
    }
    function drawBoss(g, x, e, fl) {
      const y = e.y, step = e.stomp ? 2 : 0, col = fl ? "#ffffff" : "#6a6f7a", dark = "#3e424c";
      if (e.dying) { R(g, x - 30, y - 20, 60, 20, "#2f2f35"); return; }
      const legPh = Math.sin(e.t * 0.1) * 3;
      R(g, x - 22, y - 26 + legPh, 8, 26 - legPh, dark); R(g, x + 12, y - 26 - legPh, 8, 26 + legPh, dark); R(g, x - 26, y - 4, 16, 4, "#2a2a30"); R(g, x + 8, y - 4, 16, 4, "#2a2a30");
      R(g, x - 30, y - 56 + step, 60, 30, col); R(g, x - 30, y - 56 + step, 60, 4, shadeOf(col)); R(g, x - 26, y - 46 + step, 10, 6, "#ffd23f"); R(g, x - 24, y - 45 + step, 6, 4, "#ff3b3b");
      R(g, x - 48, y - 50 + step, 22, 6, dark); R(g, x - 52, y - 49 + step, 6, 4, "#2a2a30"); // gun
      R(g, x - 4, y - 68 + step, 18, 12, col); R(g, x + 10, y - 66 + step, 8, 4, "#2a2a30"); // mortar
      for (let i = 0; i < 6; i++) R(g, x - 26 + i * 9, y - 30 + step, 6, 3, "#c9a227");
      // boss bar
      const bw = Math.min(160, lastLW - 40), bx = (lastLW - bw) / 2;
      R(g, bx - 1 - (x - x), 132, bw + 2, 6, "#000"); R(g, bx, 133, bw * Math.max(0, e.hp / e.max), 4, "#ff3b3b");
    }
    function drawHUD(g, LW) {
      text(g, "1UP", 4, 3, "#ffd23f"); text(g, String(score).padStart(LW >= 200 ? 7 : 6, "0"), 30, 3, "#fff");
      for (let i = 0; i < P.lives; i++) R(g, 4 + i * 7, 13, 5, 5, "#e0352b");
      const ax = LW >= 200 ? LW - 100 : LW - 64;
      if (LW >= 200) { text(g, "ARMS", ax, 3, "#9fd3ff"); text(g, "BOMB", ax + 52, 3, "#9fd3ff"); }
      text(g, P.inTank ? "TANK" : P.wpn === "P" ? "INF" : P.wpn + String(P.ammo), LW >= 200 ? ax : ax, LW >= 200 ? 12 : 3, "#fff");
      text(g, P.inTank ? "--" : String(P.bombs), LW >= 200 ? ax + 52 : LW - 4, LW >= 200 ? 12 : 3, "#fff", LW >= 200 ? "left" : "right");
      if (P.inTank) for (let i = 0; i < 3; i++) R(g, 4 + i * 9, 21, 7, 3, i < vehicle.hp ? "#ffd23f" : "#5a5a62");
      if (bannerT > 0 && ui === "play") big(g, banner, LW / 2, 50, "#ffd23f", banner.length > 12 ? (LW >= 200 ? 12 : 8) : 16);
    }
    function drawTitle(g, LW) {
      drawWorld(g, LW);
      big(g, "RIOT", LW / 2, 26, "#ffd23f", LW >= 200 ? 24 : 18); big(g, "RUNNER", LW / 2, 50, "#e0352b", LW >= 200 ? 18 : 13);
      soldier(g, LW / 2 - 30, GY, 1, PAL_P, { run: frame, flash: Math.floor(t * 8) % 2 === 0, big: true });
      soldier(g, LW / 2 + 34, GY, -1, PAL_E, { panic: true });
      drawTank(g, LW / 2 + 70 > LW - 20 ? LW - 22 : LW / 2 + 72, GY, -1, "#6a7a4a", false);
      if (Math.floor(t * 2) % 2 === 0) text(g, "PRESS START", LW / 2, 70, "#fff", "center");
      if (best) text(g, "HI " + best, LW / 2, 82, "#ffd23f", "center");
    }
    function drawEnd(g, LW) {
      drawPlay(g, LW);
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, LW, LH);
      if (ui === "continue") { big(g, "CONTINUE?", LW / 2, 50, "#ffd23f", LW >= 200 ? 16 : 12); text(g, "A: YES  B: QUIT", LW / 2, 74, "#fff", "center"); return; }
      big(g, "MISSION", LW / 2, 26, "#ffd23f", LW >= 200 ? 18 : 13); big(g, "COMPLETE!", LW / 2, 46, "#ffd23f", LW >= 200 ? 18 : 13);
      const rows = [["ENEMIES", kills], ["POWS FREED", freed + "/" + POWS.length], ["TIME", Math.floor(timeT / 60) + ":" + String(Math.floor(timeT % 60)).padStart(2, "0")], ["SCORE", score]];
      rows.forEach(([a, b], i) => { if (endT > 0.6 + i * 0.4) { text(g, a, LW / 2 - (LW >= 200 ? 80 : 70), 64 + i * 12, "#c9d6e3"); text(g, String(b), LW / 2 + (LW >= 200 ? 80 : 70), 64 + i * 12, "#fff", "right"); } });
      if (endT > 2.6 && Math.floor(t * 2) % 2 === 0) text(g, "PRESS A", LW / 2, 118, "#ffd23f", "center");
    }

    const lc = typeof document !== "undefined" ? document.createElement("canvas") : null;
    function drawScreen(g, W, H) {
      const LW = W / H > 1.3 ? 256 : 160; lastLW = LW;
      if (!lc) return;
      if (lc.width !== LW || lc.height !== LH) { lc.width = LW; lc.height = LH; }
      const lg = lc.getContext("2d"); lg.setTransform(1, 0, 0, 1, 0, 0); lg.imageSmoothingEnabled = false;
      if (api.state === "menu") drawTitle(lg, LW);
      else if (ui === "play") { drawPlay(lg, LW); if (paused) { lg.fillStyle = "rgba(0,0,0,.5)"; lg.fillRect(0, 0, LW, LH); big(lg, "PAUSED", LW / 2, 60, "#fff", 14); } }
      else drawEnd(lg, LW);
      const s = Math.min(W / LW, H / LH), dw = Math.round(LW * s), dh = Math.round(LH * s);
      g.save(); g.imageSmoothingEnabled = false; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      g.drawImage(lc, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh); g.restore();
    }

    // ---------------------------------------------------------------------
    // Update + input + API
    // ---------------------------------------------------------------------
    let userPause = false;
    function update(dt) {
      if (paused || userPause) return;
      dt = Math.min(dt, 0.1); t += dt; bannerT = Math.max(0, bannerT - dt); shake = Math.max(0, shake - dt);
      if (api.state === "menu") { frame++; return; }
      if (ui === "won") { endT += dt; acc += dt; while (acc >= STEP) { acc -= STEP; frame++; enemies = enemies.filter(stepEnemy); stepShots(); } if (score > best) { best = score; try { localStorage.setItem("riotrunner.best", String(best)); } catch (e) {} } return; }
      if (ui !== "play") return;
      acc += dt; while (acc >= STEP) { acc -= STEP; stepFrame(); if (ui !== "play") break; }
    }
    function input(k, down) {
      if (down) held.add(k); else { held.delete(k); return; }
      if (api.state === "menu") { if (k === "jump" || k === "shoot") newGame(); return; }
      if (ui === "continue") { if (k === "jump") { ui = "play"; P.lives = 2; respawnHere(); } else if (k === "shoot") { api.state = "menu"; ui = "title"; } return; }
      if (ui === "won") { if (endT > 2.6 && (k === "jump" || k === "shoot")) { api.state = "over"; } return; }
      if (ui !== "play" || P.dead) return;
      if (k === "jump") {
        if (P.inTank && held.has("down")) { P.inTank = false; vehicle.x = P.x; vehicle.y = GY; vehicle.used = false; P.vy = -4; P.ground = false; P.inv = 20; vehicle.cooldown = 60; return; }
        if (P.ground) { P.vy = P.inTank ? -3.4 : -4.6; P.ground = false; }
      } else if (k === "shoot") {
        if (held.has("down") && P.ground && !P.inTank) throwBomb(); else fire();
      } else if (k === "bomb") throwBomb();
    }
    function respawnHere() { Object.assign(P, { x: camX + 40, y: GY - 60, vy: 0, vx: 0, dead: 0, inv: 150, wpn: "P", ammo: Infinity, bombs: 10, ground: false }); }

    Object.assign(api, {
      update, drawScreen,
      draw: (g) => drawScreen(g, 800, 400),
      press(k) {
        audio();
        if (k === "sound") { api.soundOn = !api.soundOn; return; }
        if (k !== "start") return;
        if (api.state === "menu" || api.state === "over") { newGame(); return; }
        if (ui === "play") { userPause = !userPause; return; }
        input("jump", true); held.delete("jump");
      },
      hold(k, down) { audio(); if (api.state === "over") { if (down && (k === "jump" || k === "shoot")) newGame(); return; } input(k, down); },
      click() { if (api.state !== "game") newGame(); },
      release() { held.clear(); },
      toMenu() { api.state = "menu"; ui = "title"; paused = false; userPause = false; held.clear(); },
      pause(p) { paused = !!p; if (p) held.clear(); },
      stop() { paused = true; held.clear(); if (ac && ac.state === "running") ac.suspend(); },
      _warp: (x) => { camX = x - 60; P.x = x; while (spawnI < SPAWNS.length && SPAWNS[spawnI].at < x - 40) spawnI++; enemies = []; if (x > 1400) { lockDone.tank = true; vehicle.alive = false; } },
      debug: () => ({ ui, P, camX, enemies, lock, score, kills, freed, vehicle, items, spawnI })
    });
    return api;
  }

  window.RiotRunner = { create };
})();
