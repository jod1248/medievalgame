// ============================================================
//  Animated battle scene. Replays a Combat.simulate() result:
//  armies march in, archers loose volleys, lines charge and
//  clash, soldiers fall, the loser routs.
// ============================================================

const Battle = (() => {
  const queue = [];
  let cur = null;           // the battle being shown
  let canvas, ctx, W, H, dpr;
  let raf = 0, last = 0;

  const ROWS = 8, MAX_FIGS = 96;
  const STEP = { deploy: 1.8, volley: 1.15, charge: 1.3, melee: 0.85, rout: 2.2 };
  const RANK = { spear: 0, militia: 1, sword: 1, axe: 1, mace: 1, cavalry: 2, javelin: 3, ranged: 4 };
  const isShooter = cls => cls === 'ranged' || cls === 'javelin';

  function play(opts) {
    queue.push(opts);
    if (!cur) next();
  }

  function next() {
    const opts = queue.shift();
    const el = document.getElementById('battle');
    if (!opts) {
      cur = null;
      el.classList.add('hidden');
      G.inBattle = false;
      return;
    }
    G.inBattle = true;
    el.classList.remove('hidden');
    el.querySelector('.b-result').classList.add('hidden');
    canvas = el.querySelector('canvas');
    ctx = canvas.getContext('2d');
    resize();
    setup(opts);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  }

  // ---------------------------------------------------------
  //  Setup: figures, timeline
  // ---------------------------------------------------------
  function setup(o) {
    const res = o.res;
    const playerIsA = o.playerSide === 'A';
    const colors = {
      A: playerIsA ? '#3b6fc4' : o.enemy.color,
      D: playerIsA ? o.enemy.color : '#3b6fc4',
    };
    const r0 = res.rounds[0];
    const maxSide = Math.max(1, r0.a, r0.d);
    const scale = Math.max(1, Math.ceil(maxSide / MAX_FIGS));
    const figs = [];
    const fieldTop = H * 0.47, fieldBot = H * 0.9;
    for (const side of ['A', 'D']) {
      const dir = side === 'A' ? 1 : -1;
      const ids = res.order[side];
      const counts = side === 'A' ? r0.sa : r0.sd;
      const stacks = ids.map((id, k) => ({ id, k, cls: WEAPONS[id].cls, n: figsFor(counts[k], scale) }))
        .sort((a, b) => RANK[a.cls] - RANK[b.cls]);
      let col = 0;
      const spx = Math.min(17, (W * 0.42) / Math.max(1, Math.ceil(MAX_FIGS / ROWS) + stacks.length));
      for (const st of stacks) {
        for (let i = 0; i < st.n; i++) {
          const c = col + Math.floor(i / ROWS), row = i % ROWS;
          const hx = W / 2 - dir * (W * 0.08 + c * spx + (Math.random() - 0.5) * 4);
          const hy = fieldTop + (row + 0.5) * (fieldBot - fieldTop) / ROWS + (Math.random() - 0.5) * 6;
          figs.push({
            side, dir, stack: st.k, id: st.id, cls: st.cls, col: c,
            hx, hy, sx: hx - dir * W * 0.42, x: hx - dir * W * 0.42, y: hy, tx: hx, ty: hy,
            alive: true, dieAt: Infinity, fallen: 0, ph: Math.random() * 6, swing: 0, moving: 0,
          });
        }
        col += Math.ceil(st.n / ROWS) + 0.4;
      }
    }
    // timeline
    const steps = [];
    let t = 0;
    for (let i = 0; i < res.rounds.length; i++) {
      const kind = res.rounds[i].kind;
      const dur = STEP[kind] || 1;
      steps.push({ i, kind, start: t, dur, done: false });
      t += dur;
    }
    cur = {
      o, res, colors, scale, figs, steps, t: 0, total: t, speed: 1, shake: 0,
      arrows: [], sparks: [], dust: [], finished: false, playerIsA,
      volleyN: 0,
    };
    hud();
  }

  function figsFor(n, scale) { return n > 0.05 ? Math.max(1, Math.round(n / scale)) : 0; }

  // Mark the figures that fall during a step and spawn the projectiles that kill them
  function beginStep(st) {
    const r = cur.res.rounds[st.i];
    if (st.kind === 'volley') cur.volleyN++;
    if (st.kind === 'charge') setTimeout(() => { if (cur) cur.shake = 7; }, 450 / cur.speed);
    for (const side of ['A', 'D']) {
      const counts = side === 'A' ? r.sa : r.sd;
      if (!counts) continue;
      counts.forEach((n, k) => {
        const want = figsFor(n, cur.scale);
        const alive = cur.figs.filter(f => f.side === side && f.stack === k && f.alive && f.dieAt === Infinity)
          .sort((a, b) => a.col - b.col);   // front ranks fall first
        let kill = alive.length - want;
        for (const f of alive) {
          if (kill-- <= 0) break;
          const ranged = st.kind === 'volley' || (st.kind === 'melee' && Math.random() < 0.3);
          f.dieAt = st.start + st.dur * (ranged ? 0.55 + Math.random() * 0.35 : 0.2 + Math.random() * 0.7);
          if (ranged) shootAt(f, st);
        }
      });
    }
    // extra arrows that miss, for spectacle
    if (st.kind === 'volley' || st.kind === 'melee') {
      for (const f of cur.figs) {
        if (!f.alive || f.dieAt !== Infinity || !isShooter(f.cls)) continue;
        if (Math.random() < (st.kind === 'volley' ? 0.55 : 0.2)) {
          const tx = W / 2 + f.dir * (W * (0.08 + Math.random() * 0.2));
          const ty = f.hy + (Math.random() - 0.5) * 60;
          arrow(f.x, f.y - 14, tx, ty, st.start + Math.random() * st.dur * 0.3, f.cls === 'javelin' ? 'jav' : f.id === 'sling' ? 'stone' : 'arrow');
        }
      }
    }
  }
  function shootAt(victim, st) {
    const shooters = cur.figs.filter(f => f.side !== victim.side && f.alive && isShooter(f.cls));
    const land = victim.dieAt;
    const flight = 0.55;
    if (shooters.length) {
      const s = shooters[Math.floor(Math.random() * shooters.length)];
      arrow(s.hx, s.hy - 14, victim.hx, victim.hy - 8, Math.max(st.start, land - flight), s.cls === 'javelin' ? 'jav' : s.id === 'sling' ? 'stone' : 'arrow', land, victim);
    } else {
      // towers / walls
      const x0 = victim.side === 'A' ? W * 0.93 : W * 0.07;
      arrow(x0, H * 0.4, victim.hx, victim.hy - 8, Math.max(st.start, land - flight), 'arrow', land, victim);
    }
  }
  function arrow(x0, y0, x1, y1, t0, type, t1, victim) {
    t1 = t1 || t0 + 0.5 + Math.random() * 0.15;
    cur.arrows.push({ x0, y0, x1, y1, t0, t1, type, victim, h: 40 + Math.abs(x1 - x0) * 0.25 });
  }

  // ---------------------------------------------------------
  //  Loop
  // ---------------------------------------------------------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!cur) return;
    update(dt * cur.speed);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function stepAt(t) { return cur.steps.find(s => t >= s.start && t < s.start + s.dur) || cur.steps[cur.steps.length - 1]; }

  function update(dt) {
    cur.t += dt;
    for (const st of cur.steps) if (!st.done && cur.t >= st.start) { st.done = true; beginStep(st); }
    const st = stepAt(cur.t);
    const kind = st.kind;
    const loserSide = cur.res.winner === 'A' ? 'D' : 'A';
    for (const f of cur.figs) {
      if (f.alive && cur.t >= f.dieAt) { f.alive = false; f.fallT = cur.t; dustAt(f.x, f.y, 3); }
      if (!f.alive) { f.fallen = Math.min(1, (cur.t - f.fallT) / 0.35); continue; }
      // march into formation during the opening step
      if (kind === 'deploy') {
        const u = Math.min(1, (cur.t - st.start) / (st.dur * 0.9));
        const e = 1 - Math.pow(1 - u, 2);
        f.x = f.sx + (f.hx - f.sx) * e; f.y = f.hy;
        f.moving = u < 1 ? 1 : 0;
        f.ph += dt * 11;
        continue;
      }
      // where should this figure be?
      else if (kind === 'rout' && f.side === loserSide) { f.tx = f.hx - f.dir * W; f.ty = f.hy; }
      else if ((kind === 'charge' || kind === 'melee' || kind === 'rout') && !isShooter(f.cls)) {
        f.tx = W / 2 - f.dir * (6 + (f.col % 3) * 9 + Math.sin(f.ph) * 4);
        f.ty = f.hy;
      } else if ((kind === 'charge' || kind === 'melee') && f.cls === 'javelin') {
        f.tx = W / 2 - f.dir * (W * 0.05 + (f.col % 3) * 10);
      } else { f.tx = f.hx; f.ty = f.hy; }
      const spd = (f.cls === 'cavalry' ? 230 : kind === 'rout' && f.side === loserSide ? 170 : kind === 'deploy' ? 120 : 140) * (W / 1400 + 0.3);
      const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
      if (d > 1) {
        const m = Math.min(d, spd * dt);
        f.x += dx / d * m; f.y += dy / d * m;
        f.moving = 1;
        f.ph += dt * (f.cls === 'cavalry' ? 16 : 11);
        if (kind === 'charge' && Math.random() < 0.08) dustAt(f.x, f.y, 1);
      } else {
        f.moving = 0;
        if ((kind === 'melee' || kind === 'charge') && !isShooter(f.cls)) {
          f.swing += dt * (6 + Math.sin(f.ph) * 2);
          if (Math.random() < 0.012) sparkAt(f.x + f.dir * 8, f.y - 12);
        }
        if (kind === 'rout' && f.side !== loserSide) f.ph += dt * 6;   // cheering
      }
    }
    for (const a of cur.arrows) if (!a.hit && cur.t >= a.t1) { a.hit = true; if (!a.victim) dustAt(a.x1, a.y1, 1); }
    cur.arrows = cur.arrows.filter(a => cur.t < a.t1 + 0.6);
    for (const p of cur.sparks) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; }
    cur.sparks = cur.sparks.filter(p => p.life < 0.4);
    for (const p of cur.dust) { p.life += dt; p.y -= 8 * dt; p.r += 10 * dt; }
    cur.dust = cur.dust.filter(p => p.life < 0.8);
    cur.shake = Math.max(0, cur.shake - dt * 18);
    hud();
    if (cur.t >= cur.total && !cur.finished) { cur.finished = true; showResult(); }
  }
  function sparkAt(x, y) {
    for (let i = 0; i < 5; i++) cur.sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 140, life: 0 });
  }
  function dustAt(x, y, n) {
    for (let i = 0; i < n; i++) cur.dust.push({ x: x + (Math.random() - 0.5) * 10, y, r: 3 + Math.random() * 3, life: 0 });
  }

  // ---------------------------------------------------------
  //  Drawing
  // ---------------------------------------------------------
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sh = cur.shake;
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    drawBackdrop();
    // corpses first, then living figures sorted by depth
    const list = [...cur.figs].sort((a, b) => (a.alive - b.alive) || (a.y - b.y));
    for (const f of list) drawFig(f);
    for (const p of cur.dust) {
      ctx.fillStyle = `rgba(150,130,100,${0.35 * (1 - p.life / 0.8)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const a of cur.arrows) drawArrow(a);
    for (const p of cur.sparks) { ctx.fillStyle = `rgba(255,${200 - p.life * 300},80,${1 - p.life / 0.4})`; ctx.fillRect(p.x, p.y, 2.5, 2.5); }
    const night = 1 - Render.daylight();
    if (night > 0.02) { ctx.fillStyle = `rgba(10,16,48,${night * 0.25})`; ctx.fillRect(-10, -10, W + 20, H + 20); }
  }

  function lerpCol(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
    return `rgb(${r | 0},${g | 0},${bl | 0})`;
  }

  function drawBackdrop() {
    const day = Render.daylight();
    const hz = H * 0.42;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, lerpCol('#0b1230', '#5d9ad6', day));
    sky.addColorStop(1, lerpCol('#2a2a4a', '#cfe3ef', day));
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, hz + 10);
    if (day < 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - day * 2)})`;
      for (let i = 0; i < 60; i++) ctx.fillRect((hash2(i, 1, 4) * W) | 0, (hash2(i, 2, 4) * hz * 0.9) | 0, 1.5, 1.5);
    }
    // sun / moon
    ctx.fillStyle = day > 0.5 ? 'rgba(255,240,190,0.9)' : 'rgba(230,235,255,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.8, hz * 0.3, 22, 0, Math.PI * 2); ctx.fill();
    // distant hills
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = lerpCol(['#1d2a2a', '#22332a', '#283d2c'][layer], ['#8fb08a', '#76a06a', '#5f8e52'][layer], day);
      ctx.beginPath(); ctx.moveTo(-10, hz + 5);
      for (let x = -10; x <= W + 10; x += 20) ctx.lineTo(x, hz - 20 - layer * -8 - Math.sin(x * 0.006 + layer * 2) * (30 - layer * 8) - Math.sin(x * 0.017 + layer) * 8);
      ctx.lineTo(W + 10, hz + 5); ctx.closePath(); ctx.fill();
    }
    // setting
    if (cur.o.setting === 'town') drawTownWall(hz, day); else drawCastle(hz, day);
    // ground
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, lerpCol('#2c4a2c', '#6f9c4c', day));
    g.addColorStop(1, lerpCol('#22381f', '#4f7a35', day));
    ctx.fillStyle = g; ctx.fillRect(-10, hz, W + 20, H - hz + 10);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 90; i++) {
      const x = hash2(i, 3, 6) * W, y = hz + 10 + hash2(i, 4, 6) * (H - hz);
      ctx.fillRect(x, y, 3 + (y - hz) * 0.02, 1.5);
    }
  }
  function drawTownWall(hz, day) {
    const stone = has('stoneWalls');
    const x0 = W * 0.84, top = hz - 46, bottom = hz + 34;
    // houses behind the wall
    for (let i = 0; i < 6; i++) {
      const hx = x0 + 10 + i * 34, hy = top + 6 - (i % 2) * 10;
      ctx.fillStyle = lerpCol('#3a2c20', '#c49a63', day); ctx.fillRect(hx, hy, 26, 22);
      ctx.fillStyle = lerpCol('#2a1a14', '#a6442e', day);
      ctx.beginPath(); ctx.moveTo(hx - 3, hy); ctx.lineTo(hx + 13, hy - 14); ctx.lineTo(hx + 29, hy); ctx.closePath(); ctx.fill();
      if (day < 0.5) { ctx.fillStyle = '#ffd56b'; ctx.fillRect(hx + 9, hy + 8, 6, 6); }
    }
    ctx.fillStyle = stone ? lerpCol('#3b3a3a', '#a9a396', day) : lerpCol('#2e2216', '#8a6038', day);
    ctx.fillRect(x0, top + 22, W - x0 + 10, bottom - top - 22);
    if (stone) for (let x = x0; x < W + 10; x += 14) ctx.fillRect(x, top + 14, 8, 9);
    else for (let x = x0; x < W + 10; x += 8) { ctx.beginPath(); ctx.moveTo(x, top + 22); ctx.lineTo(x + 4, top + 12); ctx.lineTo(x + 8, top + 22); ctx.fill(); }
    // tower + torch
    ctx.fillStyle = stone ? lerpCol('#333333', '#9a958a', day) : lerpCol('#2a1e12', '#7a5230', day);
    ctx.fillRect(x0 - 10, top - 4, 30, bottom - top + 4);
    flame(x0 + 5, top - 8);
  }
  function drawCastle(hz, day) {
    const col = cur.o.enemy.color;
    const x0 = W * 0.82, base = hz + 20;
    ctx.fillStyle = lerpCol('#30302e', '#a8a296', day);
    ctx.fillRect(x0, base - 70, W - x0 + 10, 70);
    for (let x = x0; x < W + 10; x += 16) ctx.fillRect(x, base - 80, 9, 11);
    for (const tx of [x0 - 8, x0 + 70, x0 + 150]) {
      ctx.fillRect(tx, base - 115, 34, 115);
      for (let k = 0; k < 3; k++) ctx.fillRect(tx + k * 12, base - 124, 8, 10);
      ctx.fillStyle = col;
      const wave = Math.sin(performance.now() / 300 + tx) * 2;
      ctx.fillRect(tx + 16, base - 150, 2, 26);
      ctx.beginPath(); ctx.moveTo(tx + 18, base - 150); ctx.lineTo(tx + 34, base - 145 + wave); ctx.lineTo(tx + 18, base - 139); ctx.fill();
      ctx.fillStyle = lerpCol('#30302e', '#a8a296', day);
    }
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(x0 + 46, base, 16, Math.PI, 0); ctx.fill();
    flame(x0 + 26, base - 30); flame(x0 + 66, base - 30);
  }
  function flame(x, y) {
    const f = Math.sin(performance.now() / 70 + x) * 1.5;
    ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.beginPath(); ctx.arc(x, y, 14 + f, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(x, y, 3, 6 + f, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawFig(f) {
    const s = (0.75 + 0.5 * ((f.y - H * 0.47) / (H * 0.43))) * Math.max(1.3, Math.min(2, H / 520));
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(s * f.dir, s);
    if (!f.alive) {
      ctx.globalAlpha = 1 - f.fallen * 0.35;
      ctx.rotate(-f.fallen * Math.PI / 2 * 0.95);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (f.alive) { ctx.beginPath(); ctx.ellipse(0, 0, f.cls === 'cavalry' ? 14 : 7, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    const color = cur.colors[f.side];
    const step = f.moving ? Math.sin(f.ph) : 0;
    const bob = f.moving ? Math.abs(Math.cos(f.ph)) * 1.5 : 0;
    const cheer = cur.steps[cur.steps.length - 1].done && cur.res.winner === f.side && !f.moving ? Math.abs(Math.sin(f.ph)) * 4 : 0;
    ctx.translate(0, -bob - cheer);
    if (f.cls === 'cavalry') {
      // horse
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(-11, -16, 22, 9);
      ctx.fillRect(9, -22, 5, 10);
      ctx.fillRect(11, -25, 8, 5);
      ctx.strokeStyle = '#4a2c18'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -8); ctx.lineTo(-9 + step * 4, 0);
      ctx.moveTo(-4, -8); ctx.lineTo(-4 - step * 4, 0);
      ctx.moveTo(5, -8); ctx.lineTo(5 + step * 4, 0);
      ctx.moveTo(9, -8); ctx.lineTo(9 - step * 4, 0);
      ctx.stroke();
      ctx.translate(-1, -14);
    } else {
      ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-1.5, -7); ctx.lineTo(-1.5 + step * 3, 0); ctx.moveTo(1.5, -7); ctx.lineTo(1.5 - step * 3, 0); ctx.stroke();
    }
    // body
    ctx.fillStyle = color;
    ctx.fillRect(-3.5, -16, 7, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, -16, 3.5, 10);
    // head + helmet
    ctx.fillStyle = '#f0c9a0'; ctx.beginPath(); ctx.arc(0, -19, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.cls === 'militia' ? '#7a5a3a' : '#9aa4ad';
    ctx.beginPath(); ctx.arc(0, -19.5, 3.2, Math.PI, 0); ctx.fill();
    // weapon
    const sw = f.alive && !f.moving ? Math.sin(f.swing) : 0;
    ctx.strokeStyle = '#d6dbe0'; ctx.fillStyle = '#d6dbe0'; ctx.lineWidth = 1.6;
    ctx.save();
    ctx.translate(3, -12);
    switch (f.cls) {
      case 'sword':
        ctx.rotate(-0.6 + sw * 0.9);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke();
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-2, -1, 4, 1.5);
        break;
      case 'axe':
        ctx.rotate(-0.5 + sw * 1.1);
        ctx.strokeStyle = '#6b4a2a'; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -11); ctx.stroke();
        ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(5, -13); ctx.lineTo(5, -6); ctx.lineTo(0, -8); ctx.fill();
        break;
      case 'mace':
        ctx.rotate(-0.5 + sw * 1.1);
        ctx.strokeStyle = '#6b4a2a'; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -9); ctx.stroke();
        ctx.fillStyle = '#9aa4ad'; ctx.beginPath(); ctx.arc(0, -10, 2.8, 0, Math.PI * 2); ctx.fill();
        break;
      case 'spear': case 'cavalry':
        ctx.rotate(f.cls === 'cavalry' ? 1.35 : 1.1 + sw * 0.15);
        ctx.strokeStyle = '#7a5a3a'; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -20); ctx.stroke();
        ctx.fillStyle = '#d6dbe0'; ctx.beginPath(); ctx.moveTo(-1.6, -20); ctx.lineTo(0, -25); ctx.lineTo(1.6, -20); ctx.fill();
        break;
      case 'javelin':
        ctx.rotate(-0.3);
        ctx.strokeStyle = '#8a6a44'; ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(4, -12); ctx.stroke();
        break;
      case 'ranged':
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(1, -2, 7, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(3.5, -8.5); ctx.lineTo(3.5, 4.5); ctx.stroke();
        break;
      default:
        ctx.rotate(-0.3 + sw * 0.4);
        ctx.strokeStyle = '#7a5a3a'; ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2, -13); ctx.lineTo(-2, -16); ctx.moveTo(0, -13); ctx.lineTo(0, -17); ctx.moveTo(2, -13); ctx.lineTo(2, -16); ctx.stroke();
    }
    ctx.restore();
    if (f.cls === 'spear' || f.cls === 'sword') {
      ctx.fillStyle = shadeHex(color, 0.7);
      ctx.beginPath(); ctx.ellipse(4.5, -11, 2.2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    }
    ctx.restore();
  }
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${((n >> 16) & 255) * f | 0},${((n >> 8) & 255) * f | 0},${(n & 255) * f | 0})`;
  }

  function drawArrow(a) {
    if (cur.t < a.t0) return;
    const u = Math.min(1, (cur.t - a.t0) / (a.t1 - a.t0));
    const pos = v => [a.x0 + (a.x1 - a.x0) * v, a.y0 + (a.y1 - a.y0) * v - Math.sin(Math.PI * v) * a.h];
    const [x, y] = pos(u);
    if (a.hit) {
      if (a.victim) return;
      ctx.globalAlpha = Math.max(0, 1 - (cur.t - a.t1) / 0.6);   // stuck in the ground
    }
    if (a.type === 'stone') {
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    } else {
      const [px, py] = pos(Math.max(0, u - 0.04));
      const ang = Math.atan2(y - py, x - px);
      const len = a.type === 'jav' ? 14 : 9;
      ctx.strokeStyle = a.type === 'jav' ? '#8a6a44' : '#e8dcc0'; ctx.lineWidth = a.type === 'jav' ? 1.8 : 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------
  //  HUD + result card
  // ---------------------------------------------------------
  function sideCount(side) {
    return cur.figs.filter(f => f.side === side && f.alive).length * cur.scale;
  }
  function hud() {
    const el = document.getElementById('battle');
    const you = cur.playerIsA ? 'A' : 'D', them = cur.playerIsA ? 'D' : 'A';
    const r0 = cur.res.rounds[0];
    const start = { A: r0.a, D: r0.d };
    const pct = s => Math.max(0, Math.min(100, sideCount(s) / Math.max(1, start[s]) * 100));
    el.querySelector('.b-you .b-bar div').style.width = pct(you) + '%';
    el.querySelector('.b-them .b-bar div').style.width = pct(them) + '%';
    el.querySelector('.b-you b').textContent = Math.round(Math.min(start[you], sideCount(you)));
    el.querySelector('.b-them b').textContent = Math.round(Math.min(start[them], sideCount(them)));
    el.querySelector('.b-them span').textContent = cur.o.enemy.name;
    el.querySelector('.b-them .b-bar div').style.background = cur.o.enemy.color;
  }

  function showResult() {
    const o = cur.o, res = cur.res;
    const mine = cur.playerIsA ? res.A : res.D;
    const theirs = cur.playerIsA ? res.D : res.A;
    const lostUnits = {}; for (const k in mine.lost) if (mine.lost[k] > 0) lostUnits[k] = mine.lost[k];
    const killed = unitCount(theirs.lost);
    const el = document.querySelector('#battle .b-result');
    el.innerHTML = `
      <div class="b-title ${o.won ? 'won' : 'lost'}">${ic(o.won ? 'trophy' : 'skull', 'big')}<span>${o.won ? 'Victory' : 'Defeat'}</span></div>
      <div class="b-rows">
        <div title="Your losses">${ic('skull')} ${unitsHTML(lostUnits)}</div>
        <div title="Enemies slain">${ic('battle')} ${killed}</div>
        ${o.loot ? `<div title="Spoils">${ic('bag')} ${gainHTML(o.loot)}</div>` : ''}
        ${o.stolen ? `<div class="bad" title="Plundered">${ic('bag')} ${gainHTML(o.stolen, '−')}</div>` : ''}
        ${o.dead ? `<div class="bad" title="Villagers killed">${ic('pop')} −${o.dead}</div>` : ''}
        ${o.won && o.setting === 'castle' ? `<div title="Land expands">${ic('crown')} ${o.enemy.name}</div>` : ''}
      </div>
      <button class="big" data-bact="close">${ic('arrowR')}</button>`;
    el.classList.remove('hidden');
  }

  function close() {
    cancelAnimationFrame(raf);
    const after = cur && cur.o.after;
    cur = null;
    next();
    if (after) after();
  }

  function init() {
    const el = document.getElementById('battle');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-bact]');
      if (!b || !cur) return;
      const a = b.dataset.bact;
      if (a === 'skip') {
        // fast-forward to the end of the battle
        for (const st of cur.steps) if (!st.done) { st.done = true; beginStep(st); }
        cur.t = cur.total - 0.4;
        for (const f of cur.figs) if (f.dieAt !== Infinity) { f.alive = false; f.fallT = -1; f.fallen = 1; }
        cur.arrows = [];
      } else if (a === 'speed') {
        cur.speed = cur.speed === 1 ? 2.5 : 1;
        b.classList.toggle('on', cur.speed > 1);
      } else if (a === 'close') close();
    });
    window.addEventListener('resize', () => { if (cur) resize(); });
  }

  return { play, init, active: () => !!cur };
})();
