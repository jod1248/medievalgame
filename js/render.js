// ============================================================
//  2.5D isometric renderer (canvas)
// ============================================================

const Render = (() => {
  const TW = 64, TH = 32, HW = TW / 2, HH = TH / 2;
  const ORIGIN_X = MAP_H * HW + 4, ORIGIN_Y = 60;
  const TERRAIN_W = (MAP_W + MAP_H) * HW + 8, TERRAIN_H = (MAP_W + MAP_H) * HH + ORIGIN_Y + 8;

  let canvas, ctx, W = 0, H = 0, dpr = 1;
  const cam = { x: 0, y: 0, zoom: 1 };
  let terrain = null;
  let trees = [];
  let walkers = [];
  let particles = [];
  const expTargets = {};
  let time = 0;
  let wallSegs = [];        // wall pieces along the territory border
  let lights = [];          // light sources collected each frame (world coords)
  let lightCanvas = null;
  const clouds = [], birds = [];
  const tgt = { x: 0, y: 0, zoom: 1, px: 0, py: 0 };   // camera target (eased)
  const api = { terrainDirty: true, cam, tgt, hover: null, hoverTile: null, ghost: null, pulse: null };

  // ---------- day / night ----------
  // phase 0..1 through the day; game starts mid-morning
  function dayPhase() { return G ? (G.time + 0.3) % 1 : 0.4; }
  function daylight() {
    const p = dayPhase();
    if (p >= 0.3 && p <= 0.75) return 1;
    if (p > 0.22 && p < 0.3) return (p - 0.22) / 0.08;
    if (p > 0.75 && p < 0.83) return 1 - (p - 0.75) / 0.08;
    return 0;
  }
  function light(wx, wy, r, warm = 1) { lights.push([wx, wy, r, warm]); }
  function winColor() { return daylight() < 0.6 ? '#ffd56b' : '#6f8193'; }

  // ---------- math ----------
  const P = (tx, ty, z = 0) => [(tx - ty) * HW, (tx + ty) * HH - z];
  function worldToScreen(wx, wy) { return [(wx - cam.x) * cam.zoom + W / 2, (wy - cam.y) * cam.zoom + H / 2]; }
  function screenToWorld(sx, sy) { return [(sx - W / 2) / cam.zoom + cam.x, (sy - H / 2) / cam.zoom + cam.y]; }
  function screenToTile(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    return [Math.floor((wx / HW + wy / HH) / 2), Math.floor((wy / HH - wx / HW) / 2)];
  }

  // ---------- colour ----------
  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + f;
    let v = shadeCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    v = `rgb(${r},${g},${b})`;
    shadeCache.set(key, v);
    return v;
  }

  // ---------- primitives ----------
  function poly(pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  // Box with shaded faces and painted courses (planks / stone blocks)
  function box(x0, y0, x1, y1, z0, z1, color, opts = {}) {
    const edge = opts.edge || 'rgba(0,0,0,0.3)';
    poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(color, 0.84), edge);    // left (front-left)
    poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade(color, 0.64), edge);    // right (front-right)
    if (!opts.noTop) poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], opts.top || shade(color, 1.05), edge);
    const tex = opts.tex;
    if (tex && z1 - z0 > 6) {
      const step = tex === 'stone' ? 4.5 : 3.2;
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = tex === 'stone' ? 'rgba(40,30,20,0.28)' : 'rgba(60,35,15,0.25)';
      ctx.beginPath();
      let row = 0;
      for (let z = z0 + step; z < z1 - 1; z += step, row++) {
        ctx.moveTo(...P(x0, y1, z)); ctx.lineTo(...P(x1, y1, z));
        ctx.moveTo(...P(x1, y0, z)); ctx.lineTo(...P(x1, y1, z));
        if (tex === 'stone') {
          for (let u = (row % 2) * 0.12 + 0.12; u < 1; u += 0.24) {
            const xa = x0 + (x1 - x0) * u, ya = y0 + (y1 - y0) * u;
            ctx.moveTo(...P(xa, y1, z)); ctx.lineTo(...P(xa, y1, Math.min(z1, z + step)));
            ctx.moveTo(...P(x1, ya, z)); ctx.lineTo(...P(x1, ya, Math.min(z1, z + step)));
          }
        }
      }
      ctx.stroke();
      // top-edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...P(x0, y1, z1)); ctx.lineTo(...P(x1, y1, z1)); ctx.lineTo(...P(x1, y0, z1)); ctx.stroke();
    }
  }
  // parallel lines across a roof slope from eave (a0→a1) to ridge (b0→b1)
  function shingles(a0, a1, b0, b1, n, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.moveTo(a0[0] + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t);
      ctx.lineTo(a1[0] + (b1[0] - a1[0]) * t, a1[1] + (b1[1] - a1[1]) * t);
    }
    ctx.stroke();
  }
  function pyramid(x0, y0, x1, y1, z, h, color) {
    const ap = P((x0 + x1) / 2, (y0 + y1) / 2, z + h);
    poly([P(x0, y0, z), P(x1, y0, z), ap], shade(color, 1.1), 'rgba(0,0,0,0.25)');
    poly([P(x0, y0, z), P(x0, y1, z), ap], shade(color, 1.0), 'rgba(0,0,0,0.25)');
    poly([P(x0, y1, z), P(x1, y1, z), ap], shade(color, 0.86), 'rgba(0,0,0,0.3)');
    poly([P(x1, y0, z), P(x1, y1, z), ap], shade(color, 0.64), 'rgba(0,0,0,0.3)');
    shingles(P(x0, y1, z), P(x1, y1, z), ap, ap, 4, 'rgba(0,0,0,0.18)');
    shingles(P(x1, y0, z), P(x1, y1, z), ap, ap, 4, 'rgba(0,0,0,0.18)');
  }
  function gable(x0, y0, x1, y1, z, h, color, alongX) {
    const e = 'rgba(0,0,0,0.3)', sh = 'rgba(0,0,0,0.16)', gableEnd = '#c9b089';
    const n = Math.max(3, Math.round(h / 3));
    if (alongX) {
      const ym = (y0 + y1) / 2;
      poly([P(x0, y0, z), P(x1, y0, z), P(x1, ym, z + h), P(x0, ym, z + h)], shade(color, 1.1), e);
      poly([P(x0, y0, z), P(x0, y1, z), P(x0, ym, z + h)], shade(color, 0.7), e);
      poly([P(x0, y1, z), P(x1, y1, z), P(x1, ym, z + h), P(x0, ym, z + h)], shade(color, 0.9), e);
      shingles(P(x0, y1, z), P(x1, y1, z), P(x0, ym, z + h), P(x1, ym, z + h), n, sh);
      poly([P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + h)], shade(gableEnd, 0.72), e);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(...P(x0, ym, z + h)); ctx.lineTo(...P(x1, ym, z + h)); ctx.stroke();
    } else {
      const xm = (x0 + x1) / 2;
      poly([P(x0, y0, z), P(x0, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], shade(color, 1.05), e);
      poly([P(x0, y0, z), P(x1, y0, z), P(xm, y0, z + h)], shade(color, 0.7), e);
      poly([P(x1, y0, z), P(x1, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], shade(color, 0.7), e);
      shingles(P(x1, y0, z), P(x1, y1, z), P(xm, y0, z + h), P(xm, y1, z + h), n, sh);
      poly([P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + h)], shade(gableEnd, 0.88), e);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(...P(xm, y0, z + h)); ctx.lineTo(...P(xm, y1, z + h)); ctx.stroke();
    }
    // dark eave line
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(...P(x0, y1, z)); ctx.lineTo(...P(x1, y1, z)); ctx.lineTo(...P(x1, y0, z)); ctx.stroke();
  }
  function diamond(x0, y0, x1, y1, z, fill, stroke, lw) {
    poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill, stroke, lw);
  }
  // framed window (or door) with mullions on the front-left face (y = y1)
  function windowL(x0, x1, y1, u, z, w, h, color = winColor()) {
    const xa = x0 + (x1 - x0) * u, xb = xa + w;
    const door = color.startsWith('#5') || color.startsWith('#4') || color.startsWith('#3');
    poly([P(xa - 0.02, y1, z - 1), P(xb + 0.02, y1, z - 1), P(xb + 0.02, y1, z + h + 1), P(xa - 0.02, y1, z + h + 1)], '#4a3423');
    poly([P(xa, y1, z), P(xb, y1, z), P(xb, y1, z + h), P(xa, y1, z + h)], color);
    ctx.strokeStyle = door ? 'rgba(0,0,0,0.35)' : '#4a3423'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (door) { for (let k = 1; k < 3; k++) { const xx = xa + w * k / 3; ctx.moveTo(...P(xx, y1, z)); ctx.lineTo(...P(xx, y1, z + h)); } }
    else { ctx.moveTo(...P((xa + xb) / 2, y1, z)); ctx.lineTo(...P((xa + xb) / 2, y1, z + h)); ctx.moveTo(...P(xa, y1, z + h / 2)); ctx.lineTo(...P(xb, y1, z + h / 2)); }
    ctx.stroke();
  }
  function windowR(y0, y1, x1, u, z, w, h, color = winColor()) {
    const ya = y0 + (y1 - y0) * u, yb = ya + w;
    poly([P(x1, ya - 0.02, z - 1), P(x1, yb + 0.02, z - 1), P(x1, yb + 0.02, z + h + 1), P(x1, ya - 0.02, z + h + 1)], '#3a2818');
    poly([P(x1, ya, z), P(x1, yb, z), P(x1, yb, z + h), P(x1, ya, z + h)], shade(color.startsWith('#') ? color : '#ffd56b', 0.85));
    ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(...P(x1, (ya + yb) / 2, z)); ctx.lineTo(...P(x1, (ya + yb) / 2, z + h)); ctx.moveTo(...P(x1, ya, z + h / 2)); ctx.lineTo(...P(x1, yb, z + h / 2)); ctx.stroke();
  }
  // soft shadow cast toward the lower right (sun in the upper left)
  function castShadow(x0, y0, x1, y1, h) {
    const day = daylight();
    if (day < 0.05) return;
    const ox = h * 0.55, oy = h * 0.22;
    const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
    const all = pts.concat(pts.map(([a, b]) => [a + ox, b + oy]));
    poly(hull(all), `rgba(25,35,15,${0.2 * day})`);
  }
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function flag(tx, ty, z, color) {
    const [px, py] = P(tx, ty, z);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 22); ctx.stroke();
    const wave = Math.sin(time * 4 + tx) * 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py - 22);
    ctx.quadraticCurveTo(px + 7, py - 24 + wave, px + 14, py - 21 + wave);
    ctx.lineTo(px + 14, py - 13 + wave);
    ctx.quadraticCurveTo(px + 7, py - 16 + wave, px, py - 14);
    ctx.closePath(); ctx.fill();
  }
  function smoke(tx, ty, z, rate, dark) {
    if (Math.random() < rate) {
      const [px, py] = P(tx, ty, z);
      particles.push({ x: px + (Math.random() - 0.5) * 3, y: py, vx: 3 + Math.random() * 4, vy: -12 - Math.random() * 8, life: 0, max: 2.5 + Math.random() * 1.5, r: 3, dark });
    }
  }

  // ---------- terrain ----------
  function buildTerrain() {
    if (!terrain) {
      terrain = document.createElement('canvas');
      terrain.width = TERRAIN_W; terrain.height = TERRAIN_H;
    }
    const c = terrain.getContext('2d');
    const saved = ctx; ctx = c;
    c.setTransform(1, 0, 0, 1, ORIGIN_X, ORIGIN_Y);
    c.clearRect(-ORIGIN_X, -ORIGIN_Y, TERRAIN_W, TERRAIN_H);
    // ---- ground: continuous colour field + hand-painted detail ----
    const mix = (a, b, t) => {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      const ch = s => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * t));
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    };
    const waterDepth = (x, y) => {
      let d = 4;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const t = tileAt(x + dx, y + dy);
        if (t !== T_WATER && t !== -1) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      }
      return d;
    };
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      const n = smoothNoise(x, y, 5, 21), n2 = smoothNoise(x, y, 2.3, 22);
      let col;
      switch (t) {
        case T_FOREST: col = mix('#578a3b', '#7aab4c', n * 0.75 + n2 * 0.25); break;   // forest floor blends into the meadow
        case T_WATER: { const d = waterDepth(x, y); col = mix('#5aa0c8', '#2a5f93', Math.min(1, (d - 1) / 3)); break; }
        case T_ROAD: col = mix('#b49867', '#c7ae80', n2); break;
        case T_PLAZA: col = '#8f897d'; break;
        case T_SAND: col = mix('#d2bd85', '#e2d09c', n2); break;
        default: col = mix('#5f9440', '#86b553', n * 0.75 + n2 * 0.25);
      }
      // fill + same-colour stroke hides seams between diamonds
      poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], col, col, 1);
    }
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      const rnd = k => hash2(x, y, 100 + k);
      if (t === T_GRASS || t === T_FOREST) {
        // grass blades
        for (let i = 0; i < 9; i++) {
          const [px, py] = P(x + rnd(i), y + rnd(i + 20));
          c.strokeStyle = rnd(i + 40) < 0.5 ? 'rgba(40,75,25,0.45)' : 'rgba(170,210,110,0.35)';
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(px, py); c.lineTo(px + (rnd(i + 60) - 0.5) * 2, py - 2 - rnd(i + 80) * 3); c.stroke();
        }
        if (t === T_FOREST) for (let i = 0; i < 4; i++) {
          const [px, py] = P(x + rnd(i + 5), y + rnd(i + 25));
          c.fillStyle = ['#6b5a2a', '#7a6a32', '#4d6a2a'][i % 3]; c.fillRect(px, py, 2, 1.5);
        }
        if (t === T_GRASS && rnd(7) > 0.82) {     // flower patch
          const fc = ['#f2e36b', '#f7f2e8', '#d97ab0', '#8fb6ec'][Math.floor(rnd(8) * 4)];
          for (let i = 0; i < 5; i++) {
            const [px, py] = P(x + 0.3 + rnd(i + 120) * 0.4, y + 0.3 + rnd(i + 140) * 0.4);
            c.fillStyle = fc; c.fillRect(px, py - 1, 2, 2);
          }
        }
        if (t === T_GRASS && rnd(9) > 0.9) {      // stones
          const [px, py] = P(x + rnd(10), y + rnd(11));
          c.fillStyle = '#8f8a80'; c.beginPath(); c.ellipse(px, py, 3, 1.8, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#b5b0a5'; c.beginPath(); c.ellipse(px - 0.6, py - 0.6, 1.8, 1, 0, 0, Math.PI * 2); c.fill();
        }
      } else if (t === T_ROAD) {
        // wheel ruts and pebbles
        const alongX = tileAt(x - 1, y) === T_ROAD || tileAt(x + 1, y) === T_ROAD;
        c.strokeStyle = 'rgba(110,85,50,0.35)'; c.lineWidth = 1.4;
        for (const o of [0.36, 0.64]) {
          const a = alongX ? P(x, y + o) : P(x + o, y), b2 = alongX ? P(x + 1, y + o) : P(x + o, y + 1);
          c.beginPath(); c.moveTo(...a); c.lineTo(...b2); c.stroke();
        }
        for (let i = 0; i < 5; i++) {
          const [px, py] = P(x + rnd(i), y + rnd(i + 9));
          c.fillStyle = rnd(i + 30) < 0.5 ? 'rgba(90,70,45,0.5)' : 'rgba(230,215,180,0.6)'; c.fillRect(px, py, 2, 1.5);
        }
        // grassy verge where the road meets grass
        for (const [dx, dy, a, b2] of [[0, -1, [x, y], [x + 1, y]], [1, 0, [x + 1, y], [x + 1, y + 1]], [0, 1, [x, y + 1], [x + 1, y + 1]], [-1, 0, [x, y], [x, y + 1]]]) {
          const nt = tileAt(x + dx, y + dy);
          if (nt !== T_GRASS && nt !== T_FOREST) continue;
          c.strokeStyle = 'rgba(90,120,50,0.45)'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(...P(...a)); c.lineTo(...P(...b2)); c.stroke();
        }
      } else if (t === T_PLAZA) {
        // cobbles: 3x3 stones per tile with mortar gaps
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const v = hash2(x * 3 + i, y * 3 + j, 31);
          const sh = 0.86 + v * 0.22;
          const g = 0.04;
          const x0 = x + i / 3 + g, y0 = y + j / 3 + g, x1 = x + (i + 1) / 3 - g, y1 = y + (j + 1) / 3 - g;
          poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], shade('#b4ad9f', sh));
          poly([P(x0, y0), P(x1, y0), P(x1, y0 + 0.05), P(x0, y0 + 0.05)], 'rgba(255,255,255,0.12)');
        }
      } else if (t === T_SAND) {
        for (let i = 0; i < 6; i++) { const [px, py] = P(x + rnd(i), y + rnd(i + 9)); c.fillStyle = 'rgba(150,120,70,0.35)'; c.fillRect(px, py, 1.5, 1.5); }
      } else if (t === T_WATER) {
        // light foam where water meets land
        for (const [dx, dy, a, b2] of [[0, -1, [x, y], [x + 1, y]], [1, 0, [x + 1, y], [x + 1, y + 1]], [0, 1, [x, y + 1], [x + 1, y + 1]], [-1, 0, [x, y], [x, y + 1]]]) {
          const nt = tileAt(x + dx, y + dy);
          if (nt === T_WATER || nt === -1) continue;
          c.strokeStyle = 'rgba(235,245,250,0.55)'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(...P(...a)); c.lineTo(...P(...b2)); c.stroke();
        }
      }
    }
    ctx = saved;
    buildFog();
    buildWalls();
    // trees
    trees = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y) !== T_FOREST) continue;
      const n = hash2(x, y, 9) < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        trees.push({ x: x + 0.25 + hash2(x, y, 20 + i) * 0.5, y: y + 0.25 + hash2(x, y, 30 + i) * 0.5, spr: Math.floor(hash2(x, y, 40 + i) * 7), s: 0.7 + hash2(x, y, 50 + i) * 0.4 });
      }
    }
    api.terrainDirty = false;
  }

  // Wall segments along every border edge; a gate where a road leaves town
  function buildWalls() {
    wallSegs = [];
    const isRoad = (x, y) => tileAt(x, y) === T_ROAD;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (!inTerritory(x, y)) continue;
      for (const [dx, dy, side] of [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || inTerritory(nx, ny)) continue;
        const gate = isRoad(x, y) && isRoad(nx, ny);
        const back = side === 'n' || side === 'w';
        wallSegs.push({ x, y, side, gate, d: x + y + (back ? -0.05 : 0.95) });
      }
    }
    // towers on the four corners of the walled square
    const R = G.territory, [cx, cy] = TOWN_CENTER;
    for (const [vx, vy] of [[cx - R, cy - R], [cx + R + 1, cy - R], [cx - R, cy + R + 1], [cx + R + 1, cy + R + 1]]) {
      if (vx < 0 || vy < 0 || vx > MAP_W || vy > MAP_H) continue;
      wallSegs.push({ tower: true, vx, vy, d: vx + vy - 0.1 });
    }
  }

  function drawWall(sg) {
    const stone = has('stoneWalls'), tall = has('palisade');
    const color = stone ? '#a8a296' : '#8a6038';
    const h = stone ? 22 : tall ? 18 : 13;
    if (sg.tower) {
      const t = 0.32, x0 = sg.vx - t, y0 = sg.vy - t, x1 = sg.vx + t, y1 = sg.vy + t;
      box(x0, y0, x1, y1, 0, h + 16, stone ? '#9a958a' : '#7a5230', { tex: stone ? 'stone' : 'wood' });
      if (stone) for (const [a, b] of [[x0, y1 - 0.12], [x1 - 0.12, y1 - 0.12], [x1 - 0.12, y0]]) box(a, b, a + 0.12, b + 0.12, h + 16, h + 21, '#9a958a');
      else pyramid(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, h + 16, 12, '#6b3a24');
      torch(sg.vx, sg.vy + t, h + 8);
      return;
    }
    const th = 0.07;
    let x0, y0, x1, y1;
    if (sg.side === 'n') { x0 = sg.x; x1 = sg.x + 1; y0 = sg.y - th; y1 = sg.y + th; }
    else if (sg.side === 's') { x0 = sg.x; x1 = sg.x + 1; y0 = sg.y + 1 - th; y1 = sg.y + 1 + th; }
    else if (sg.side === 'w') { x0 = sg.x - th; x1 = sg.x + th; y0 = sg.y; y1 = sg.y + 1; }
    else { x0 = sg.x + 1 - th; x1 = sg.x + 1 + th; y0 = sg.y; y1 = sg.y + 1; }
    if (sg.gate) {
      // two gate posts with a beam and torches
      const along = sg.side === 'n' || sg.side === 's';
      const p1 = along ? [x0, y0, x0 + 0.2, y1] : [x0, y0, x1, y0 + 0.2];
      const p2 = along ? [x1 - 0.2, y0, x1, y1] : [x0, y1 - 0.2, x1, y1];
      box(p1[0], p1[1], p1[2], p1[3], 0, h + 12, color, { tex: stone ? 'stone' : 'wood' });
      box(p2[0], p2[1], p2[2], p2[3], 0, h + 12, color, { tex: stone ? 'stone' : 'wood' });
      box(x0, y0, x1, y1, h + 6, h + 12, stone ? '#8e897e' : '#6b4a2a');
      torch(p1[0] + 0.1, p1[3], h);
      torch(p2[0] + 0.1, p2[3], h);
      return;
    }
    box(x0, y0, x1, y1, 0, h, color, { tex: stone ? 'stone' : 'wood' });
    if (stone) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.2) / n, v = (i + 0.55) / n;
        if (sg.side === 'n' || sg.side === 's') box(x0 + (x1 - x0) * u, y0, x0 + (x1 - x0) * v, y1, h, h + 5, color);
        else box(x0, y0 + (y1 - y0) * u, x1, y0 + (y1 - y0) * v, h, h + 5, color);
      }
    } else {
      // sharpened stakes
      ctx.fillStyle = shade(color, 0.85);
      for (let i = 0; i < 5; i++) {
        const u = (i + 0.5) / 5;
        const bx = sg.side === 'n' || sg.side === 's' ? x0 + (x1 - x0) * u : (x0 + x1) / 2;
        const by = sg.side === 'n' || sg.side === 's' ? (y0 + y1) / 2 : y0 + (y1 - y0) * u;
        const a = P(bx - 0.06, by + 0.06, h), b = P(bx + 0.06, by - 0.06, h), c = P(bx, by, h + 6);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.lineTo(...b); ctx.closePath(); ctx.fill();
      }
    }
  }
  function torch(tx, ty, z) {
    const [px, py] = P(tx, ty, z);
    const f = Math.sin(time * 14 + tx * 3) * 1.2;
    ctx.fillStyle = '#4a3020'; ctx.fillRect(px - 1, py - 2, 2, 6);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(px, py - 4, 2, 3.5 + f * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff1b0'; ctx.beginPath(); ctx.ellipse(px, py - 3.5, 1, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    light(px, py - 4, 46 + f * 3);
  }

  // ---------- trees: detailed sprites painted once, then stamped ----------
  const TREE_SCALE = 3;                 // sprites drawn at 3x for crisp zoom
  const SPR_W = 34, SPR_H = 62;         // logical size; base of trunk at (17, 58)
  let treeSprites = null;
  function makeTreeSprites() {
    const variants = [];
    const palettes = {
      pine: [['#1f4d2a', '#2d6a36', '#4d8f4a'], ['#21502e', '#326f3b', '#58985a'], ['#1d4626', '#2a6131', '#43803f']],
      oak: [['#2f5f26', '#46812f', '#79b14e'], ['#355f22', '#4f8a2e', '#8dbd57'], ['#2c5a2c', '#3f7d3a', '#6ba65a']],
      birch: [['#4f7a2a', '#73a43c', '#a9d36a']],
    };
    for (const kind of ['pine', 'oak', 'birch']) {
      for (const pal of palettes[kind]) {
        const cv = document.createElement('canvas');
        cv.width = SPR_W * TREE_SCALE; cv.height = SPR_H * TREE_SCALE;
        const g = cv.getContext('2d');
        g.scale(TREE_SCALE, TREE_SCALE);
        const bx = 17, by = 58;
        const [dark, mid, light] = pal;
        if (kind === 'pine') {
          g.fillStyle = '#4a2f1a'; g.fillRect(bx - 1.6, by - 10, 3.2, 10);
          for (let i = 0; i < 4; i++) {
            const yy = by - 8 - i * 9.5, w = 13 - i * 2.6, hgt = 15 - i;
            // jagged tier: dark right half, lit left half
            g.fillStyle = dark;
            g.beginPath(); g.moveTo(bx, yy - hgt);
            for (let k = 0; k <= 6; k++) g.lineTo(bx + w * k / 6, yy - (k % 2) * 2.2 - (6 - k) * hgt / 6 * 0.0);
            g.lineTo(bx, yy + 1); g.closePath(); g.fill();
            g.fillStyle = mid;
            g.beginPath(); g.moveTo(bx, yy - hgt);
            for (let k = 0; k <= 6; k++) g.lineTo(bx - w * k / 6, yy - (k % 2) * 2.2);
            g.lineTo(bx, yy + 1); g.closePath(); g.fill();
            g.strokeStyle = light; g.lineWidth = 0.8;
            g.beginPath(); g.moveTo(bx - 0.5, yy - hgt + 2); g.lineTo(bx - w * 0.55, yy - 2); g.stroke();
          }
        } else {
          const bark = kind === 'birch' ? '#e6e1d4' : '#5a3b22';
          g.fillStyle = bark; g.fillRect(bx - 1.8, by - 16, 3.6, 16);
          if (kind === 'birch') { g.fillStyle = '#333'; for (let k = 0; k < 4; k++) g.fillRect(bx - 1.8 + (k % 2) * 2, by - 4 - k * 3.5, 1.6, 0.8); }
          g.strokeStyle = bark; g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(bx, by - 12); g.lineTo(bx - 5, by - 20); g.moveTo(bx, by - 14); g.lineTo(bx + 5, by - 22); g.stroke();
          const blobs = kind === 'birch'
            ? [[0, -30, 8], [-5, -25, 6], [5, -24, 6], [-2, -36, 6], [3, -33, 5]]
            : [[0, -28, 11], [-8, -23, 8], [8, -22, 8], [-4, -35, 8], [5, -34, 8], [0, -20, 9]];
          g.fillStyle = dark;
          for (const [x, y, r] of blobs) { g.beginPath(); g.arc(bx + x + 1.2, by + y + 1.2, r, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = mid;
          for (const [x, y, r] of blobs) { g.beginPath(); g.arc(bx + x - 0.6, by + y - 0.6, r * 0.88, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = light;
          for (const [x, y, r] of blobs) { g.beginPath(); g.arc(bx + x - r * 0.35, by + y - r * 0.4, r * 0.42, 0, Math.PI * 2); g.fill(); }
          // leaf speckles
          for (let k = 0; k < 26; k++) {
            const [x, y, r] = blobs[k % blobs.length];
            const a = hash2(k, kind.length, 3) * Math.PI * 2, rr = hash2(k, 2, 7) * r;
            g.fillStyle = hash2(k, 5, 9) < 0.5 ? dark : light;
            g.fillRect(bx + x + Math.cos(a) * rr, by + y + Math.sin(a) * rr, 1.3, 1.3);
          }
        }
        variants.push({ kind, cv });
      }
    }
    treeSprites = variants;
  }

  function drawTree(t) {
    if (!treeSprites) makeTreeSprites();
    const [px, py] = P(t.x, t.y);
    const s = t.s;
    const day = daylight();
    // cast shadow
    ctx.fillStyle = `rgba(20,35,15,${0.1 + 0.16 * day})`;
    ctx.beginPath(); ctx.ellipse(px + 6 * s * day, py + 1, 10 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    // sway in the wind
    const sway = Math.sin(time * 1.6 + t.x * 0.7 + t.y * 0.4) * 0.06 + Math.sin(time * 3.1 + t.x) * 0.012;
    const spr = treeSprites[t.spr % treeSprites.length].cv;
    ctx.save();
    ctx.translate(px, py); ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.drawImage(spr, -17 * s, -58 * s, SPR_W * s, SPR_H * s);
    ctx.restore();
  }

  // ---------- fog at the edge of the world ----------
  let fogCanvas = null;
  const FOG_PAD = 160;
  function buildFog() {
    const raw = document.createElement('canvas');
    raw.width = TERRAIN_W + FOG_PAD * 2; raw.height = TERRAIN_H + FOG_PAD * 2;
    const g = raw.getContext('2d');
    g.fillStyle = '#cfd8da';
    g.fillRect(0, 0, raw.width, raw.height);
    g.setTransform(1, 0, 0, 1, ORIGIN_X + FOG_PAD, ORIGIN_Y + FOG_PAD);
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const e = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y) + (smoothNoise(x, y, 3, 77) - 0.5) * 2.4;
      const fog = Math.pow(Math.max(0, Math.min(1, 1 - (e - 0.3) / 5.5)), 1.4);
      const clear = 1 - fog;
      if (clear <= 0) continue;
      g.fillStyle = `rgba(0,0,0,${clear})`;
      g.beginPath(); g.moveTo(...P(x - 0.05, y - 0.05)); g.lineTo(...P(x + 1.05, y - 0.05)); g.lineTo(...P(x + 1.05, y + 1.05)); g.lineTo(...P(x - 0.05, y + 1.05)); g.closePath(); g.fill();
    }
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = raw.width; fogCanvas.height = raw.height;
    const f = fogCanvas.getContext('2d');
    f.filter = 'blur(18px)';
    f.drawImage(raw, 0, 0);
  }
  function drawFog() {
    if (!fogCanvas) return;
    const x = -ORIGIN_X - FOG_PAD, y = -ORIGIN_Y - FOG_PAD;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(fogCanvas, x, y);
    // a second, drifting layer makes the mist roll slowly
    ctx.globalAlpha = 0.35;
    ctx.drawImage(fogCanvas, x + Math.sin(time * 0.15) * 26, y + Math.cos(time * 0.11) * 14);
    ctx.globalAlpha = 1;
  }

  // ---------- plaza props ----------
  const PROPS = [
    { kind: 'fountain', x: 26.5, y: 22 },
    { kind: 'lamp', x: 24.3, y: 19.5 }, { kind: 'lamp', x: 30.7, y: 19.5 }, { kind: 'lamp', x: 24.3, y: 24 },
    { kind: 'lamp', x: 30.7, y: 24 }, { kind: 'lamp', x: 27.5, y: 27.6 }, { kind: 'lamp', x: 27.2, y: 16.3 },
    { kind: 'cart', x: 30.4, y: 17.6 }, { kind: 'crates', x: 30.5, y: 21.2 }, { kind: 'crates', x: 24.5, y: 17.2 },
    { kind: 'banner', x: 24.2, y: 22, color: '#2c4f8a' }, { kind: 'banner', x: 24.2, y: 22.9, color: '#b5462e' },
  ];
  function drawProp(pr) {
    const { x, y } = pr;
    if (pr.kind === 'fountain') {
      castShadow(x - 0.45, y - 0.45, x + 0.45, y + 0.45, 6);
      box(x - 0.48, y - 0.48, x + 0.48, y + 0.48, 0, 5, '#a8a296', { tex: 'stone' });
      diamond(x - 0.38, y - 0.38, x + 0.38, y + 0.38, 5, '#4f8fc0');
      const [wx, wy] = P(x, y, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      const rip = (time * 0.8) % 1;
      ctx.beginPath(); ctx.ellipse(wx, wy, 6 + rip * 14, (6 + rip * 14) / 2, 0, 0, Math.PI * 2); ctx.globalAlpha = 1 - rip; ctx.stroke(); ctx.globalAlpha = 1;
      box(x - 0.08, y - 0.08, x + 0.08, y + 0.08, 5, 16, '#bdb6a8');
      box(x - 0.2, y - 0.2, x + 0.2, y + 0.2, 16, 18, '#bdb6a8');
      // water spray
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + time, u = (time * 1.6 + k / 6) % 1;
        const [sx, sy] = P(x + Math.cos(a) * 0.3 * u, y + Math.sin(a) * 0.3 * u, 19 + Math.sin(u * Math.PI) * 6 - u * 12);
        ctx.fillStyle = `rgba(200,230,255,${0.8 * (1 - u)})`; ctx.fillRect(sx, sy, 1.6, 1.6);
      }
    } else if (pr.kind === 'lamp') {
      const [bx, by] = P(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(bx + 3, by, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e2a26'; ctx.fillRect(bx - 1, by - 22, 2, 22);
      ctx.fillRect(bx - 3, by - 2, 6, 2);
      const lit = daylight() < 0.6;
      ctx.fillStyle = '#2e2a26'; ctx.fillRect(bx - 3, by - 28, 6, 1.5);
      ctx.fillStyle = lit ? '#ffe08a' : '#8c9aa6'; ctx.fillRect(bx - 2.2, by - 26.5, 4.4, 4.5);
      if (lit) light(bx, by - 24, 52);
    } else if (pr.kind === 'cart') {
      castShadow(x - 0.3, y - 0.2, x + 0.3, y + 0.2, 8);
      box(x - 0.3, y - 0.18, x + 0.3, y + 0.18, 3, 8, '#8a6038', { tex: 'wood' });
      box(x - 0.25, y - 0.12, x + 0.2, y + 0.12, 8, 11, '#c9a14a');
      for (const dx of [-0.15, 0.15]) {
        const [wx, wy] = P(x + dx, y + 0.2, 3);
        ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(wx, wy, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(...P(x - 0.3, y, 5)); ctx.lineTo(...P(x - 0.75, y, 2)); ctx.stroke();
    } else if (pr.kind === 'crates') {
      box(x - 0.2, y - 0.2, x + 0.05, y + 0.05, 0, 7, '#a07a4a', { tex: 'wood' });
      box(x, y - 0.05, x + 0.2, y + 0.18, 0, 6, '#8a6a44', { tex: 'wood' });
      box(x - 0.15, y - 0.15, x + 0.02, y + 0.02, 7, 12, '#b58a55');
    } else if (pr.kind === 'banner') {
      const [bx, by] = P(x, y);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(bx - 1, by - 30, 2, 30);
      ctx.fillRect(bx - 6, by - 30, 12, 1.5);
      const wave = Math.sin(time * 2 + x) * 1.5;
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.moveTo(bx - 5, by - 29); ctx.lineTo(bx + 5, by - 29); ctx.lineTo(bx + 5 + wave, by - 14); ctx.lineTo(bx + wave * 0.5, by - 17); ctx.lineTo(bx - 5 + wave, by - 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f1c75b'; ctx.fillRect(bx - 1.5 + wave * 0.3, by - 25, 3, 3);
    }
  }

  // ---------- buildings ----------
  function bHeight(b) {
    switch (b.type) {
      case 'house': return [26, 34, 48][b.level - 1];
      case 'farm': return b.level === 3 ? 60 : 26;
      case 'watchtower': return b.level === 2 ? 92 : 72;
      case 'townhall': return 95;
      case 'forge': return 80;
      case 'market': return 40;
      case 'barracks': return 50;
      case 'sawmill': return 34; case 'kiln': return 28; case 'crucible': return 64;
      case 'stables': return 34;
      case 'mine': return 32;
      default: return 30;
    }
  }

  function drawBuilding(b, ghost) {
    const def = BUILDINGS[b.type];
    const s = def.size, x = b.x, y = b.y;
    const v = hash2(b.id || 1, 3, 1);
    const L = b.level;
    if (!ghost && b.built < 1) { drawConstruction(b); return; }
    // pop-in bounce right after construction finishes
    const age = b.born ? (performance.now() - b.born) / 1000 : 9;
    const pop = age < 0.6;
    if (pop) {
      const t = age / 0.6, k = 1 + Math.sin(t * Math.PI) * 0.18 * (1 - t) - (1 - Math.min(1, t * 3)) * 0.3;
      const [gx, gy] = P(x + s / 2, y + s / 2);
      ctx.save(); ctx.translate(gx, gy); ctx.scale(1 + (k - 1) * 0.5, k); ctx.translate(-gx, -gy);
    }
    // ground contact + cast shadow
    diamond(x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, 0, 'rgba(0,0,0,0.1)');
    if (b.type !== 'farm' && b.type !== 'market' && b.type !== 'quarry') castShadow(x + 0.15, y + 0.15, x + s - 0.15, y + s - 0.15, bHeight(b) * 0.55);
    else if (b.type === 'farm') castShadow(x + 0.12, y + 0.12, x + 0.85, y + 0.8, 20);
    if (def.refinery) drawRefinery(b, x, y, L);
    switch (b.type) {
      case 'house': {
        const i = 0.17, x0 = x + i, y0 = y + i, x1 = x + 1 - i, y1 = y + 1 - i;
        const wall = ['#c49a63', '#e1d2b0', '#b8b2a6'][L - 1];
        const roof = ['#c9a14a', '#a6442e', '#4f5d70'][L - 1];
        const h = [14, 18, 30][L - 1];
        box(x0, y0, x1, y1, 0, h, wall, { tex: L === 3 ? 'stone' : L === 1 ? 'wood' : null });
        if (L === 2) {   // timber framing: beams, posts and braces
          ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(...P(x0, y1, h * 0.55)); ctx.lineTo(...P(x1, y1, h * 0.55));
          ctx.moveTo(...P(x1, y0, h * 0.55)); ctx.lineTo(...P(x1, y1, h * 0.55));
          for (const u of [0, 0.5, 1]) { ctx.moveTo(...P(x0 + (x1 - x0) * u, y1, 0)); ctx.lineTo(...P(x0 + (x1 - x0) * u, y1, h)); }
          for (const u of [0, 1]) { ctx.moveTo(...P(x1, y0 + (y1 - y0) * u, 0)); ctx.lineTo(...P(x1, y0 + (y1 - y0) * u, h)); }
          ctx.moveTo(...P(x0 + (x1 - x0) * 0.5, y1, h * 0.55)); ctx.lineTo(...P(x1, y1, h));
          ctx.moveTo(...P(x1, y0, h * 0.55)); ctx.lineTo(...P(x1, y0 + (y1 - y0) * 0.5, h));
          ctx.stroke();
        }
        // stone footing
        box(x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01, 0, 2.5, '#8f887c', { noTop: true });
        windowL(x0, x1, y1, 0.12, 2.5, 0.2, 8, '#5a3a22');      // door
        windowL(x0, x1, y1, 0.58, h * 0.42, 0.18, 5.5);
        windowR(y0, y1, x1, 0.38, h * 0.42, 0.2, 5.5);
        if (L === 3) { windowL(x0, x1, y1, 0.12, 19, 0.18, 5.5); windowR(y0, y1, x1, 0.38, 19, 0.2, 5.5); }
        // flower box under the side window
        const fb = P(x1 + 0.01, y0 + (y1 - y0) * 0.48, h * 0.42 - 1);
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(fb[0] - 4, fb[1] - 1, 8, 2.2);
        ctx.fillStyle = ['#e85d75', '#f2d14b', '#c77dde'][Math.floor(v * 3)];
        for (let k = 0; k < 3; k++) ctx.fillRect(fb[0] - 3 + k * 2.6, fb[1] - 3, 1.8, 1.8);
        // yard props: barrel, woodpile or fence
        const yv = hash2(b.id || 1, 9, 2);
        if (yv < 0.33) {
          const [bx2, by2] = P(x1 + 0.08, y1 + 0.02);
          ctx.fillStyle = '#7a4f2a'; ctx.fillRect(bx2 - 2.5, by2 - 6, 5, 6);
          ctx.fillStyle = '#4a3020'; ctx.fillRect(bx2 - 2.5, by2 - 4.5, 5, 0.8); ctx.fillRect(bx2 - 2.5, by2 - 2, 5, 0.8);
          ctx.fillStyle = '#8f6034'; ctx.beginPath(); ctx.ellipse(bx2, by2 - 6, 2.5, 1, 0, 0, Math.PI * 2); ctx.fill();
        } else if (yv < 0.66) {
          for (let k = 0; k < 3; k++) {
            const [lx, ly] = P(x0 - 0.06, y0 + 0.2 + k * 0.17, 1.5);
            ctx.fillStyle = '#7a4f2a'; ctx.fillRect(lx - 5, ly - 1.5, 10, 3);
            ctx.fillStyle = '#d9b07a'; ctx.beginPath(); ctx.arc(lx - 5, ly, 1.5, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1;
          const f0 = [x + 0.05, y + 0.97], f1 = [x + 0.97, y + 0.97], f2 = [x + 0.97, y + 0.05];
          ctx.beginPath();
          ctx.moveTo(...P(f0[0], f0[1], 3.5)); ctx.lineTo(...P(f1[0], f1[1], 3.5)); ctx.lineTo(...P(f2[0], f2[1], 3.5));
          for (let k = 0; k <= 6; k++) {
            const u = k / 6;
            const a = [f0[0] + (f1[0] - f0[0]) * u, f0[1]], b2 = [f1[0], f1[1] + (f2[1] - f1[1]) * u];
            ctx.moveTo(...P(a[0], a[1], 0)); ctx.lineTo(...P(a[0], a[1], 5));
            ctx.moveTo(...P(b2[0], b2[1], 0)); ctx.lineTo(...P(b2[0], b2[1], 5));
          }
          ctx.stroke();
        }
        gable(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, h, 13, roof, v < 0.5);
        const cx = v < 0.5 ? x0 + 0.15 : x1 - 0.2;
        box(cx, y0 + 0.15, cx + 0.12, y0 + 0.27, h + 4, h + 16, '#7d6a5a', { tex: 'stone' });
        smoke(cx + 0.06, y0 + 0.21, h + 16, 0.012, false);
        break;
      }
      case 'farm': {
        diamond(x + 0.05, y + 0.05, x + 2 - 0.05, y + 2 - 0.05, 0, '#8a6a3f', 'rgba(60,40,20,0.5)');
        const crop = ['#8fb84a', '#b9c24a', '#d9b546'][L - 1], cropDark = ['#5f8a32', '#8a9632', '#a8852e'][L - 1];
        // furrows with individual plants that sway in the wind
        const rowsOf = (xa, xb, ya, yb) => {
          for (let yy = ya; yy < yb; yy += 0.16) {
            ctx.strokeStyle = 'rgba(70,45,20,0.45)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(...P(xa, yy + 0.06)); ctx.lineTo(...P(xb, yy + 0.06)); ctx.stroke();
            for (let xx = xa + 0.04; xx < xb; xx += 0.11) {
              const [px, py] = P(xx, yy);
              const sw = Math.sin(time * 2 + xx * 3 + yy * 2) * 1.2;
              ctx.strokeStyle = cropDark; ctx.lineWidth = 1.6;
              ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + sw, py - 4 - L); ctx.stroke();
              ctx.fillStyle = crop; ctx.fillRect(px + sw - 1, py - 5.5 - L, 2.2, 2.2);
            }
          }
        };
        rowsOf(x + 0.95, x + 1.9, y + 0.12, y + 1.92);
        rowsOf(x + 0.12, x + 0.9, y + 0.95, y + 1.92);
        // barn
        box(x + 0.12, y + 0.12, x + 0.85, y + 0.8, 0, 14, '#9b3b2c', { tex: 'wood' });
        windowL(x + 0.12, x + 0.85, y + 0.8, 0.35, 0, 0.25, 9, '#4a2a1a');
        gable(x + 0.08, y + 0.08, x + 0.89, y + 0.84, 14, 11, '#6b4a2a', true);
        if (L === 3) {   // windmill
          box(x + 0.15, y + 1.2, x + 0.5, y + 1.55, 0, 34, '#d8cdb6', { tex: 'stone' });
          pyramid(x + 0.12, y + 1.17, x + 0.53, y + 1.58, 34, 10, '#6b4a2a');
          const [hx, hy] = P(x + 0.33, y + 1.55, 30);
          ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 2;
          for (let k = 0; k < 4; k++) {
            const a = time * 1.5 + k * Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * 18, hy + Math.sin(a) * 18); ctx.stroke();
          }
        }
        break;
      }
      case 'lumber': {
        box(x + 0.1, y + 0.1, x + 0.6, y + 0.6, 0, 13, '#8a6038', { tex: 'wood' });
        gable(x + 0.06, y + 0.06, x + 0.64, y + 0.64, 13, 9, '#5d4a2c', true);
        for (let k = 0; k < L + 1; k++) {
          const [lx, ly] = P(x + 0.72, y + 0.35 + k * 0.17, 3);
          ctx.fillStyle = '#7a4f2a'; ctx.fillRect(lx - 9, ly - 3, 18, 6);
          ctx.fillStyle = '#c99a62'; ctx.beginPath(); ctx.ellipse(lx + 9, ly, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
        const [sx, sy] = P(x + 0.3, y + 0.8, 0);
        ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'quarry': {
        diamond(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, '#8d8a84', 'rgba(0,0,0,0.3)');
        diamond(x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, '#6e6b66');
        const rocks = [[0.25, 0.7, 6], [0.7, 0.3, 5], [0.65, 0.75, 7 + L]];
        for (const [rx, ry, h] of rocks) box(x + rx - 0.08, y + ry - 0.08, x + rx + 0.08, y + ry + 0.08, 0, h, '#a8a39b');
        break;
      }
      case 'mine': {
        pyramid(x + 0.05, y + 0.05, x + 0.95, y + 0.95, 0, 26, '#7c6c5c');
        const [ex, ey] = P(x + 0.5, y + 0.95, 0);
        ctx.fillStyle = '#1e1712'; ctx.beginPath(); ctx.arc(ex, ey - 4, 6, Math.PI, 0); ctx.fill(); ctx.fillRect(ex - 6, ey - 4, 12, 4);
        ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2; ctx.strokeRect(ex - 7, ey - 11, 14, 11);
        const oc = { ironOre: '#8a5a3a', copperOre: '#d0813f', tinOre: '#d0d0d0', zincOre: '#8fa3b5' }[b.ore];
        for (let k = 0; k < 3; k++) { const [ox, oy] = P(x + 0.75 + k * 0.05, y + 0.85, 2); ctx.fillStyle = oc; ctx.fillRect(ox - 2 + k * 3, oy - 3, 4, 3); }
        break;
      }
      case 'watchtower': {
        const h = L === 2 ? 64 : 48;
        box(x + 0.3, y + 0.3, x + 0.7, y + 0.7, 0, h, L === 2 ? '#9e9a92' : '#8a6a44', { tex: L === 2 ? 'stone' : 'wood' });
        box(x + 0.22, y + 0.22, x + 0.78, y + 0.78, h, h + 6, L === 2 ? '#b0aba2' : '#9a7a50');
        pyramid(x + 0.2, y + 0.2, x + 0.8, y + 0.8, h + 6, 16, '#7a3a2a');
        flag(x + 0.5, y + 0.5, h + 22, '#c0392b');
        break;
      }
      case 'stables': {
        box(x + 0.1, y + 0.2, x + 1.9, y + 0.9, 0, 16, '#8a5a34', { tex: 'wood' });
        windowL(x + 0.1, x + 1.9, y + 0.9, 0.2, 0, 0.1, 10, '#3a2618');
        windowL(x + 0.1, x + 1.9, y + 0.9, 0.5, 0, 0.1, 10, '#3a2618');
        windowL(x + 0.1, x + 1.9, y + 0.9, 0.8, 0, 0.1, 10, '#3a2618');
        gable(x + 0.05, y + 0.15, x + 1.95, y + 0.95, 16, 12, '#6b4a2a', true);
        ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5;
        const f = [P(x + 0.1, y + 1.1, 5), P(x + 1.9, y + 1.1, 5), P(x + 1.9, y + 1.9, 5), P(x + 0.1, y + 1.9, 5)];
        ctx.beginPath(); ctx.moveTo(...f[0]); for (const p of f.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const hx = x + 0.4 + k * 0.5 + Math.sin(time * 0.5 + k) * 0.1, hy = y + 1.4 + (k % 2) * 0.2;
          const [px, py] = P(hx, hy, 0);
          ctx.fillStyle = ['#6b3e1f', '#3a2a1e', '#a0703e'][k];
          ctx.fillRect(px - 5, py - 7, 10, 4); ctx.fillRect(px + 3, py - 10, 3, 4);
          ctx.fillRect(px - 4, py - 3, 1.5, 3); ctx.fillRect(px + 3, py - 3, 1.5, 3);
        }
        break;
      }
      case 'townhall': {
        const wall = ['#c8bfae', '#d6cdb8', '#e2dac6'][L - 1];
        // tower sits at the back corner, so draw it first
        const th = 46 + L * 8;
        box(x + 0.15, y + 0.15, x + 0.65, y + 0.65, 0, th, '#bdb4a2', { tex: 'stone' });
        windowL(x + 0.15, x + 0.65, y + 0.65, 0.35, th - 16, 0.3, 8, '#3a2a1a');
        pyramid(x + 0.1, y + 0.1, x + 0.7, y + 0.7, th, 22, '#3f4f6a');
        flag(x + 0.4, y + 0.4, th + 22, '#d4a017');
        const hh = 26 + L * 4;
        box(x + 0.75, y + 0.15, x + 1.85, y + 0.75, 0, hh, wall, { tex: 'stone' });
        windowR(y + 0.15, y + 0.75, x + 1.85, 0.35, 10, 0.25, 9);
        gable(x + 0.7, y + 0.1, x + 1.9, y + 0.8, hh, 16, '#3f4f6a', false);
        box(x + 0.15, y + 0.75, x + 1.85, y + 1.85, 0, hh, wall, { tex: 'stone' });
        for (let k = 0; k < 4; k++) windowL(x + 0.15, x + 1.85, y + 1.85, 0.1 + k * 0.22, 10, 0.08, 9);
        for (let k = 0; k < 2; k++) windowR(y + 0.75, y + 1.85, x + 1.85, 0.2 + k * 0.4, 10, 0.12, 9);
        windowL(x + 0.15, x + 1.85, y + 1.85, 0.42, 0, 0.16, 13, '#5a3a22');
        gable(x + 0.1, y + 0.7, x + 1.9, y + 1.9, hh, 20, '#3f4f6a', true);
        break;
      }
      case 'forge': {
        const h = 22 + L * 3;
        box(x + 0.15, y + 0.15, x + 1.8, y + 1.5, 0, h, '#5b5450', { tex: 'stone' });
        const glow = `rgba(255,${130 + Math.floor(Math.sin(time * 6) * 40)},40,1)`;
        windowL(x + 0.15, x + 1.8, y + 1.5, 0.15, 0, 0.35, 14, glow);
        windowR(y + 0.15, y + 1.5, x + 1.8, 0.3, 8, 0.15, 6, glow);
        gable(x + 0.1, y + 0.1, x + 1.85, y + 1.55, h, 14, '#3a3533', true);
        box(x + 1.25, y + 0.3, x + 1.6, y + 0.65, h, h + 34, '#4b4542', { tex: 'stone' });
        box(x + 1.21, y + 0.26, x + 1.64, y + 0.69, h + 34, h + 38, '#3a3533');
        smoke(x + 1.42, y + 0.47, h + 38, 0.35, true);
        // embers
        if (Math.random() < 0.2) {
          const [px, py] = P(x + 1.42, y + 0.47, h + 38);
          particles.push({ x: px, y: py, vx: (Math.random() - 0.5) * 10, vy: -25, life: 0, max: 0.8, r: 1.2, ember: true });
        }
        // anvil
        const [ax, ay] = P(x + 0.8, y + 1.75, 0);
        ctx.fillStyle = '#2b2b2b'; ctx.fillRect(ax - 7, ay - 9, 14, 4); ctx.fillRect(ax - 3, ay - 5, 6, 5);
        if (Math.sin(time * 5) > 0.95) { ctx.fillStyle = '#ffd36b'; ctx.fillRect(ax - 1, ay - 13, 2, 2); ctx.fillRect(ax + 3, ay - 12, 2, 2); }
        flag(x + 0.2, y + 1.5, h, '#b5462e');
        break;
      }
      case 'market': {
        diamond(x + 0.1, y + 0.1, x + 1.9, y + 1.9, 0, '#c2b293', 'rgba(0,0,0,0.25)');
        const stalls = [[0.25, 0.25, '#c0392b'], [1.1, 0.25, '#2e86c1'], [0.25, 1.1, '#27ae60'], [1.1, 1.1, '#d4a017']];
        const n = L === 1 ? 3 : 4;
        for (let k = 0; k < n; k++) {
          const [sx, sy, c] = stalls[k];
          box(x + sx, y + sy, x + sx + 0.6, y + sy + 0.6, 0, 7, '#8a6a44');
          pyramid(x + sx - 0.05, y + sy - 0.05, x + sx + 0.65, y + sy + 0.65, 13, 10, c);
          ctx.strokeStyle = '#5a4026'; ctx.lineWidth = 1.2;
          for (const [cx, cy] of [[sx, sy + 0.6], [sx + 0.6, sy + 0.6], [sx + 0.6, sy]]) {
            const a = P(x + cx, y + cy, 7), bb = P(x + cx, y + cy, 13);
            ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...bb); ctx.stroke();
          }
        }
        if (L === 1) { box(x + 1.2, y + 1.2, x + 1.45, y + 1.45, 0, 7, '#8a6a44'); box(x + 1.5, y + 1.3, x + 1.7, y + 1.5, 0, 5, '#a07a4a'); }
        flag(x + 1, y + 1, 18, '#e67e22');
        break;
      }
      case 'barracks': {
        box(x + 0.1, y + 0.1, x + 1.9, y + 0.9, 0, 18 + L * 3, '#8e8676', { tex: 'stone' });
        for (let k = 0; k < 5; k++) windowL(x + 0.1, x + 1.9, y + 0.9, 0.08 + k * 0.19, 8, 0.06, 6);
        gable(x + 0.05, y + 0.05, x + 1.95, y + 0.95, 18 + L * 3, 12, '#6a2f2a', true);
        // training yard + dummies
        diamond(x + 0.15, y + 1.05, x + 1.85, y + 1.85, 0, '#b39d76');
        for (let k = 0; k < 3; k++) {
          const [dx, dy] = P(x + 0.4 + k * 0.55, y + 1.45, 0);
          ctx.fillStyle = '#6b4a2a'; ctx.fillRect(dx - 1, dy - 14, 2, 14); ctx.fillRect(dx - 5, dy - 11, 10, 2);
          ctx.fillStyle = '#d6c08a'; ctx.beginPath(); ctx.arc(dx, dy - 16, 3, 0, Math.PI * 2); ctx.fill();
        }
        flag(x + 1.9, y + 0.1, 20 + L * 3, '#c0392b');
        flag(x + 0.1, y + 0.9, 18, '#2c3e50');
        break;
      }
    }
    if (pop) ctx.restore();
    // night lights from windows / fires
    const [lx, ly] = P(x + s / 2, y + s / 2, 12);
    if (b.type === 'house') light(lx, ly, 34 + L * 4, 0.8);
    else if (def.unique) light(lx, ly, 70);
    else if (b.active && (def.refinery || b.type === 'stables')) light(lx, ly, 46);
    if (b.upg !== undefined) {
      const [px, py] = P(x + s / 2, y + s / 2, bHeight(b) + 6);
      progressBar(px, py, b.upg, '#ffb84d');
      hammerIcon(px, py - 9);
    }
  }
  function hammerIcon(px, py) {
    const a = Math.sin(time * 8) * 0.5;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.5 + a);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-1, -2, 2, 10);
    ctx.fillStyle = '#c9ced4'; ctx.fillRect(-4, -5, 8, 4);
    ctx.restore();
  }

  // One look per refinery type
  const REF_ACCENT = { planks: '#c99a5b', charcoal: '#3a3634', iron: '#9aa4ad', bronze: '#c8833f', brass: '#e3c050', steel: '#7fb0e0', damascus: '#5fd6d0' };
  function drawRefinery(b, x, y, L) {
    const rec = BUILDINGS[b.type].recipe, acc = REF_ACCENT[rec];
    if (rec === 'planks') {
      box(x + 0.12, y + 0.15, x + 0.75, y + 0.85, 0, 13, '#9a6a3c', { tex: 'wood' });
      gable(x + 0.08, y + 0.11, x + 0.79, y + 0.89, 13, 9, '#6b4a2a', false);
      for (let k = 0; k < 3; k++) { const [lx, ly] = P(x + 0.88, y + 0.3 + k * 0.2, 3); ctx.fillStyle = '#7a4f2a'; ctx.fillRect(lx - 8, ly - 3, 16, 5); }
      // spinning saw blade
      const [sx, sy] = P(x + 0.75, y + 0.55, 9);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.active ? time * 9 : 0);
      ctx.fillStyle = '#c9ced4'; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 4.5 : 6, a = i * Math.PI / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = '#555'; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    } else if (rec === 'charcoal') {
      const [cx, cy] = P(x + 0.5, y + 0.5);
      ctx.fillStyle = '#5a4436'; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 20, 10, 0, Math.PI, 0); ctx.lineTo(cx + 20, cy); ctx.ellipse(cx, cy - 2, 20, 6, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#463428'; ctx.beginPath(); ctx.ellipse(cx, cy - 6, 16, 14, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = b.active ? `rgb(255,${130 + Math.sin(time * 7) * 40 | 0},50)` : '#2a1d14';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 2, 3.5, Math.PI, 0); ctx.fill();
      if (b.active) { smoke(x + 0.5, y + 0.5, 20, 0.2, true); smoke(x + 0.4, y + 0.6, 16, 0.08, true); }
    } else if (rec === 'damascus') {
      box(x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, 40 + L * 4, '#3d3a48', { tex: 'stone' });
      box(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 40 + L * 4, 44 + L * 4, '#2e2b38');
      const [gx, gy] = P(x + 0.5, y + 0.5, 46 + L * 4);
      const pulse = 0.6 + Math.sin(time * 3) * 0.3;
      ctx.fillStyle = `rgba(95,214,208,${pulse})`; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
      light(gx, gy, 50);
      if (b.active && Math.random() < 0.3) particles.push({ x: gx, y: gy, vx: (Math.random() - 0.5) * 12, vy: -20, life: 0, max: 0.9, r: 1, ember: true, cyan: true });
    } else {
      // stone furnace with a coloured roof and a tall chimney
      const h = 14 + L * 3;
      box(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, h, '#8e8378', { tex: 'stone' });
      const glow = b.active ? `rgb(255,${120 + Math.floor(Math.sin(time * 8 + b.id) * 30)},40)` : '#3a2a20';
      windowL(x + 0.12, x + 0.88, y + 0.88, 0.3, 2, 0.3, 8, glow);
      gable(x + 0.08, y + 0.08, x + 0.92, y + 0.92, h, 8, acc, true);
      const ch = rec === 'steel' ? 2 : 1;
      for (let k = 0; k < ch; k++) {
        const cx = x + 0.2 + k * 0.38;
        box(cx, y + 0.2, cx + 0.16, y + 0.36, h, h + 26 + L * 5, '#6b5d52', { tex: 'stone' });
        if (b.active) smoke(cx + 0.08, y + 0.28, h + 26 + L * 5, 0.18, true);
      }
    }
    // tier pips
    const [px, py] = P(x + 0.95, y + 0.55, 4);
    for (let k = 0; k < L; k++) { ctx.fillStyle = '#ffcc55'; ctx.fillRect(px - 6 + k * 4, py, 3, 3); }
  }

  function drawConstruction(b) {
    const s = BUILDINGS[b.type].size, x = b.x, y = b.y;
    diamond(x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, 0, '#a58a62', 'rgba(0,0,0,0.3)');
    const h = Math.max(4, 22 * s * b.built);
    ctx.globalAlpha = 0.55;
    box(x + 0.15, y + 0.15, x + s - 0.15, y + s - 0.15, 0, h, '#c9a26b');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.5;
    for (const [cx, cy] of [[x + 0.1, y + s - 0.1], [x + s - 0.1, y + s - 0.1], [x + s - 0.1, y + 0.1], [x + 0.1, y + 0.1]]) {
      const a = P(cx, cy, 0), bb = P(cx, cy, 22 * s + 4);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...bb); ctx.stroke();
    }
    const [px, py] = P(x + s / 2, y + s / 2, 22 * s + 12);
    progressBar(px, py, b.built, '#7ed957');
  }

  function progressBar(px, py, f, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px - 16, py, 32, 5);
    ctx.fillStyle = color; ctx.fillRect(px - 15, py + 1, 30 * Math.max(0, Math.min(1, f)), 3);
  }

  // ---------- people ----------
  function personAt(px, py, color, carry, scale = 1, step = 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(px, py, 3 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(px - 1 * scale, py - 3 * scale); ctx.lineTo(px - 1 * scale + step * 1.6 * scale, py);
    ctx.moveTo(px + 1 * scale, py - 3 * scale); ctx.lineTo(px + 1 * scale - step * 1.6 * scale, py);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(px - 2 * scale, py - 8 * scale, 4 * scale, 5.5 * scale);
    ctx.fillStyle = '#f0c9a0';
    ctx.beginPath(); ctx.arc(px, py - 9 * scale, 2 * scale, 0, Math.PI * 2); ctx.fill();
    if (carry) { ctx.fillStyle = carry; ctx.fillRect(px - 4 * scale, py - 12 * scale, 8 * scale, 3 * scale); }
  }
  function soldierAt(px, py, color, scale = 1) {
    personAt(px, py, color, null, scale);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 3 * scale, py - 2 * scale); ctx.lineTo(px + 3 * scale, py - 15 * scale); ctx.stroke();
  }

  const CLOTHES = ['#8b5a2b', '#6d7f3a', '#3f5f8a', '#8a3f3f', '#7a6a5a', '#a07a3a'];
  function walkerTargets() {
    const t = [];
    for (const b of G.buildings) if (b.built >= 1) {
      const s = BUILDINGS[b.type].size;
      t.push([b.x + s + 0.1, b.y + s / 2]);
    }
    return t;
  }
  function updateWalkers(dt) {
    // fewer people out at night
    const want = Math.floor(Math.min(80, Math.floor(idleCitizens() / 4 + employedWorkers() / 8) + 6) * (0.3 + 0.7 * daylight()));
    const targets = walkerTargets();
    while (walkers.length < want && targets.length) {
      const s = targets[Math.floor(Math.random() * targets.length)];
      walkers.push({ x: s[0], y: s[1], tx: s[0], ty: s[1], c: CLOTHES[Math.floor(Math.random() * CLOTHES.length)], sp: 0.8 + Math.random() * 0.6, wait: Math.random() * 3, ph: Math.random() * 6, lantern: Math.random() < 0.5 });
    }
    if (walkers.length > want) walkers.length = want;
    for (const w of walkers) {
      if (w.wait > 0) { w.wait -= dt; w.moving = false; continue; }
      w.moving = true; w.ph += dt * 10;
      const dx = w.tx - w.x, dy = w.ty - w.y;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        const t = targets[Math.floor(Math.random() * targets.length)] || [w.x, w.y];
        w.tx = t[0]; w.ty = t[1]; w.wait = 1 + Math.random() * 4;
        continue;
      }
      // walk along x first, then y (looks like walking streets)
      const st = w.sp * dt;
      if (Math.abs(dx) >= 0.05) w.x += Math.sign(dx) * Math.min(st, Math.abs(dx));
      else w.y += Math.sign(dy) * Math.min(st, Math.abs(dy));
    }
  }

  function expeditionTarget(e) {
    if (expTargets[e.id]) return expTargets[e.id];
    const want = e.type === 'wood' || e.type === 'food' ? T_FOREST : e.type === 'stone' ? T_SAND : -2;
    const cands = [];
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      if (inTerritory(x, y)) continue;
      const t = tileAt(x, y);
      if (want === -2 ? (t === T_FOREST && (x < 4 || y < 4 || x > MAP_W - 5 || y > MAP_H - 5)) : t === want) cands.push([x + 0.5, y + 0.5]);
    }
    const pick = cands.length ? cands[Math.floor(hash2(e.id, 7, 2) * cands.length)] : [2, 2];
    expTargets[e.id] = pick;
    return pick;
  }
  function edgePoint(angleDeg) {
    const a = angleDeg * Math.PI / 180;
    // walk outward from town center until leaving the map
    let x = TOWN_CENTER[0], y = TOWN_CENTER[1];
    while (x > 0.5 && y > 0.5 && x < MAP_W - 0.5 && y < MAP_H - 0.5) { x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5; }
    return [x, y];
  }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  function movingGroups() {
    const out = [];
    const home = [TOWN_CENTER[0] + 1, TOWN_CENTER[1]];
    for (const e of G.expeditions) {
      const p = 1 - e.t / e.total;
      const tgt = expeditionTarget(e);
      let pos, carry = null;
      if (p < 0.3) pos = lerp(home, tgt, p / 0.3);
      else if (p < 0.7) pos = tgt;
      else { pos = lerp(tgt, home, (p - 0.7) / 0.3); carry = { wood: '#7a4f2a', stone: '#9a968e', food: '#c9a04a', ore: '#8a5a3a' }[e.type]; }
      out.push({ kind: 'exp', x: pos[0], y: pos[1], n: Math.min(14, Math.ceil(e.people / 5)), carry, working: p >= 0.3 && p < 0.7 });
    }
    const bk = findBuilding('barracks');
    const bpos = [bk.x + 1, bk.y + 2.2];
    for (const c of G.campaigns) {
      const kd = kingdomDef(c.target);
      const edge = edgePoint(kd.angle);
      const p = 1 - c.t / c.total;
      const pos = c.phase === 'march' ? lerp(bpos, edge, p) : lerp(edge, bpos, p);
      out.push({ kind: 'army', x: pos[0], y: pos[1], n: Math.min(24, Math.ceil(unitCount(c.units) / 4)), color: '#2c4f8a' });
    }
    const inc = G.raid.incoming;
    if (inc) {
      const left = inc.eta - G.time;
      if (left < 1.2) {
        const kd = kingdomDef(inc.from);
        const edge = edgePoint(kd.angle);
        const pos = lerp(edge, TOWN_CENTER, Math.max(0, 1 - left / 1.2) * 0.6);
        out.push({ kind: 'army', x: pos[0], y: pos[1], n: Math.min(24, Math.ceil(unitCount(inc.units) / 4)), color: '#8a2c2c', enemy: true });
      }
    }
    return out;
  }
  function drawGroup(g) {
    for (let i = 0; i < g.n; i++) {
      const ox = (hash2(i, 1, 3) - 0.5) * (g.kind === 'army' ? 1.4 : 1.1), oy = (hash2(i, 2, 3) - 0.5) * (g.kind === 'army' ? 1.4 : 1.1);
      const bob = g.working ? Math.abs(Math.sin(time * 6 + i)) * 2 : Math.abs(Math.sin(time * 8 + i)) * 1;
      const [px, py] = P(g.x + ox, g.y + oy);
      if (g.kind === 'army') soldierAt(px, py - bob, g.color);
      else personAt(px, py - bob, CLOTHES[i % CLOTHES.length], g.carry, 1, g.working ? 0 : Math.sin(time * 9 + i));
    }
    const [lx, ly] = P(g.x, g.y);
    light(lx, ly - 8, 40);
    if (g.kind === 'army') {
      const [px, py] = P(g.x, g.y);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 28); ctx.stroke();
      ctx.fillStyle = g.enemy ? '#c0392b' : '#d4a017';
      ctx.fillRect(px, py - 28, 12, 8);
    }
  }

  // ---------- main draw ----------
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  }

  function drawWaterShimmer() {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y) !== T_WATER) continue;
      const ph = time * 1.2 + hash2(x, y, 8) * 6;
      if (Math.sin(ph) < 0.3) continue;
      const [px, py] = P(x + 0.5, y + 0.5);
      ctx.beginPath(); ctx.moveTo(px - 6, py + Math.sin(ph) * 2); ctx.lineTo(px + 2, py + Math.sin(ph) * 2); ctx.stroke();
    }
  }

  function easeCam(dt) {
    const k = 1 - Math.exp(-dt * 12);
    if (Math.abs(tgt.zoom - cam.zoom) > 1e-4) {
      const before = screenToWorld(tgt.px, tgt.py);
      cam.zoom += (tgt.zoom - cam.zoom) * k;
      const after = screenToWorld(tgt.px, tgt.py);
      cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
      tgt.x += before[0] - after[0]; tgt.y += before[1] - after[1];
    }
    cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k;
  }

  function updateSky(dt) {
    const minX = -MAP_H * HW, maxX = MAP_W * HW, maxY = (MAP_W + MAP_H) * HH;
    while (clouds.length < 7) clouds.push({ x: minX + Math.random() * (maxX - minX), y: Math.random() * maxY, r: 60 + Math.random() * 70, v: 8 + Math.random() * 8 });
    for (const c of clouds) { c.x += c.v * dt; if (c.x > maxX + 200) { c.x = minX - 200; c.y = Math.random() * maxY; } }
    if (daylight() > 0.6 && birds.length < 2 && Math.random() < dt * 0.08) {
      const y = Math.random() * maxY;
      birds.push({ x: minX - 50, y, vx: 60 + Math.random() * 30, vy: (Math.random() - 0.5) * 10, n: 3 + (Math.random() * 4 | 0), ph: 0 });
    }
    for (const b of birds) { b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * 10; }
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x > maxX + 100) birds.splice(i, 1);
  }
  function drawCloudShadows() {
    const day = daylight();
    for (const c of clouds) {
      ctx.fillStyle = `rgba(20,30,20,${0.08 * day})`;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 1.4, c.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawSkyLayer() {
    const day = daylight();
    for (const c of clouds) {
      ctx.fillStyle = day > 0.3 ? `rgba(255,255,255,${0.16 * day})` : 'rgba(120,130,170,0.06)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath(); ctx.ellipse(c.x + (k - 1.5) * c.r * 0.45, c.y - 160 - (k % 2) * 14, c.r * 0.5, c.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = 1.3;
    for (const b of birds) {
      for (let i = 0; i < b.n; i++) {
        const bx = b.x - Math.abs(i - b.n / 2) * 14, by = b.y - 200 + (i - b.n / 2) * 6;
        const f = Math.sin(b.ph + i) * 3;
        ctx.beginPath(); ctx.moveTo(bx - 5, by - f); ctx.lineTo(bx, by); ctx.lineTo(bx + 5, by - f); ctx.stroke();
      }
    }
  }
  function drawFireflies() {
    const night = 1 - daylight();
    if (night < 0.3) return;
    for (let i = 0; i < 40; i++) {
      const tx = 2 + hash2(i, 5, 1) * (MAP_W - 4), ty = 2 + hash2(i, 6, 1) * (MAP_H - 4);
      if (tileAt(Math.floor(tx), Math.floor(ty)) !== T_FOREST) continue;
      const [px, py] = P(tx + Math.sin(time * 0.7 + i) * 0.4, ty + Math.cos(time * 0.5 + i) * 0.4, 10 + Math.sin(time * 2 + i) * 5);
      const a = (0.5 + Math.sin(time * 3 + i * 2) * 0.5) * night;
      ctx.fillStyle = `rgba(220,255,140,${a})`; ctx.fillRect(px, py, 2, 2);
      light(px, py, 10 * a + 2);
    }
  }
  function drawNight() {
    const day = daylight(), night = 1 - day;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // golden-hour tint at dawn and dusk
    const twi = Math.sin(day * Math.PI);
    if (twi > 0.02) { ctx.fillStyle = `rgba(255,130,60,${0.13 * twi})`; ctx.fillRect(0, 0, W, H); }
    if (night < 0.01) return;
    if (!lightCanvas) lightCanvas = document.createElement('canvas');
    if (lightCanvas.width !== canvas.width || lightCanvas.height !== canvas.height) { lightCanvas.width = canvas.width; lightCanvas.height = canvas.height; }
    const lc = lightCanvas.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);
    lc.fillStyle = `rgba(8,12,42,${0.66 * night})`;
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'destination-out';
    const pts = lights.map(([wx, wy, r, warm]) => { const [sx, sy] = worldToScreen(wx, wy); return [sx, sy, r * cam.zoom, warm]; })
      .filter(([sx, sy, r]) => sx > -r && sy > -r && sx < W + r && sy < H + r);
    for (const [sx, sy, r] of pts) {
      const g = lc.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g; lc.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.drawImage(lightCanvas, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx, sy, r, warm] of pts) {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
      g.addColorStop(0, `rgba(255,${150 + 30 * (1 - warm) | 0},70,${0.22 * night})`); g.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(dt) {
    time += dt;
    lights = [];
    if (api.terrainDirty) buildTerrain();
    easeCam(dt);
    updateWalkers(dt * Math.min(G.paused ? 0 : G.speed, 2) || 0);
    updateSky(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cfd8da';   // fog colour beyond the map
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));
    ctx.drawImage(terrain, -ORIGIN_X, -ORIGIN_Y);
    drawWaterShimmer();
    drawCloudShadows();

    // visible bounds in world coords for culling
    const [vx0, vy0] = screenToWorld(-80, -120), [vx1, vy1] = screenToWorld(W + 80, H + 120);
    const visible = (tx, ty) => { const [px, py] = P(tx, ty); return px > vx0 && px < vx1 && py > vy0 && py < vy1; };

    // hover / ghost footprint
    if (api.ghost) {
      const { type, x, y, ok } = api.ghost;
      const s = BUILDINGS[type].size;
      diamond(x, y, x + s, y + s, 0, ok ? 'rgba(120,255,120,0.35)' : 'rgba(255,80,80,0.4)', ok ? '#7f7' : '#f55', 2);
    } else if (api.hover) {
      const b = api.hover, s = BUILDINGS[b.type].size;
      diamond(b.x, b.y, b.x + s, b.y + s, 0, 'rgba(255,230,120,0.25)', '#ffd75a', 2);
    }
    if (api.pulse) {   // tutorial highlight
      const b = api.pulse, s = BUILDINGS[b.type].size, k = 0.15 + Math.abs(Math.sin(time * 3)) * 0.35;
      diamond(b.x - k, b.y - k, b.x + s + k, b.y + s + k, 0, 'rgba(255,215,90,0.18)', '#ffd75a', 3);
    }

    // depth-sorted objects
    const objs = [];
    for (const b of G.buildings) {
      const s = BUILDINGS[b.type].size;
      if (visible(b.x + s / 2, b.y + s / 2)) objs.push({ d: b.x + b.y + 2 * (s - 1) + 0.5, b });
    }
    const gh = api.ghost, ghs = gh ? BUILDINGS[gh.type].size : 0;
    const underGhost = t => gh && t.x >= gh.x && t.x < gh.x + ghs && t.y >= gh.y && t.y < gh.y + ghs;
    for (const t of trees) if (visible(t.x, t.y) && !buildingAt(Math.floor(t.x), Math.floor(t.y)) && !underGhost(t)) objs.push({ d: Math.floor(t.x) + Math.floor(t.y) + 0.4, t });
    for (const sg of wallSegs) { const vx = sg.tower ? sg.vx : sg.x, vy = sg.tower ? sg.vy : sg.y; if (visible(vx, vy)) objs.push({ d: sg.d, s: sg }); }
    for (const w of walkers) if (visible(w.x, w.y)) objs.push({ d: Math.floor(w.x) + Math.floor(w.y) + 0.7, w });
    for (const g of movingGroups()) objs.push({ d: Math.floor(g.x) + Math.floor(g.y) + 0.8, g });
    for (const pr of PROPS) if (visible(pr.x, pr.y)) objs.push({ d: Math.floor(pr.x) + Math.floor(pr.y) + 0.6, pr });
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) {
      if (o.b) {
        const hov = api.hover === o.b;
        if (hov) ctx.filter = 'brightness(1.18)';
        drawBuilding(o.b, false);
        if (hov) ctx.filter = 'none';
      } else if (o.t) drawTree(o.t);
      else if (o.w) {
        const [px, py] = P(o.w.x, o.w.y);
        personAt(px, py - (o.w.moving ? Math.abs(Math.cos(o.w.ph)) : 0), o.w.c, null, 0.9, o.w.moving ? Math.sin(o.w.ph) : 0);
        if (o.w.lantern && daylight() < 0.5) { ctx.fillStyle = '#ffd56b'; ctx.fillRect(px + 2, py - 7, 2, 2); light(px + 3, py - 6, 20); }
      }
      else if (o.s) drawWall(o.s);
      else if (o.pr) drawProp(o.pr);
      else if (o.g) drawGroup(o.g);
    }
    if (api.ghost) {
      const { type, x, y } = api.ghost;
      ctx.globalAlpha = 0.6;
      drawBuilding({ id: 0, type, x, y, level: 1, built: 1, ore: 'ironOre' }, true);
      ctx.globalAlpha = 1;
    }

    // particles
    for (const p of particles) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const f = p.life / p.max;
      if (p.ember) { ctx.fillStyle = p.cyan ? `rgba(120,240,230,${1 - f})` : `rgba(255,${180 - f * 100},60,${1 - f})`; ctx.fillRect(p.x, p.y, 2, 2); if (!p.cyan) light(p.x, p.y, 8); continue; }
      ctx.fillStyle = p.dark ? `rgba(70,65,62,${0.45 * (1 - f)})` : `rgba(220,220,220,${0.4 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + f * 9, 0, Math.PI * 2); ctx.fill();
    }
    particles = particles.filter(p => p.life < p.max);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
    drawFog();
    drawFireflies();
    drawSkyLayer();
    drawNight();
  }

  // ---------- picking ----------
  function pick(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    const list = [...G.buildings].sort((a, b) => {
      const sa = BUILDINGS[a.type].size, sb = BUILDINGS[b.type].size;
      return (b.x + b.y + 2 * sb) - (a.x + a.y + 2 * sa);
    });
    for (const b of list) {
      const s = BUILDINGS[b.type].size;
      const left = P(b.x, b.y + s)[0], right = P(b.x + s, b.y)[0];
      const bottom = P(b.x + s, b.y + s)[1], top = P(b.x, b.y)[1] - bHeight(b) * (b.built < 1 ? 0.6 : 1);
      if (wx >= left + 4 && wx <= right - 4 && wy >= top && wy <= bottom) {
        // below the footprint's top corner, require being inside the diamond
        const mid = P(b.x + s / 2, b.y + s / 2)[1];
        if (wy > mid) {
          const cx = P(b.x + s / 2, b.y + s / 2)[0];
          const dx = Math.abs(wx - cx) / (s * HW), dy = (wy - mid) / (s * HH);
          if (dx + dy > 1) continue;
        }
        return b;
      }
    }
    return null;
  }
  function buildingScreenTop(b) {
    const s = BUILDINGS[b.type].size;
    const [wx, wy] = P(b.x + s / 2, b.y + s / 2, bHeight(b) + (BUILDINGS[b.type].unique ? 18 : 2));
    return worldToScreen(wx, wy);
  }

  function centerOn(tx, ty, smooth) {
    const [wx, wy] = P(tx, ty);
    tgt.x = wx; tgt.y = wy;
    if (!smooth) { cam.x = wx; cam.y = wy; }
  }
  function clampCam() {
    const minX = -MAP_H * HW, maxX = MAP_W * HW, maxY = (MAP_W + MAP_H) * HH;
    for (const c of [cam, tgt]) {
      c.x = Math.max(minX, Math.min(maxX, c.x));
      c.y = Math.max(0, Math.min(maxY, c.y));
    }
  }
  // zoom smoothly around a screen point
  function zoomAt(sx, sy, factor) {
    tgt.zoom = Math.max(0.4, Math.min(2.2, tgt.zoom * factor));
    tgt.px = sx; tgt.py = sy;
  }
  function panTo(wx, wy) { cam.x = tgt.x = wx; cam.y = tgt.y = wy; }

  function init(c) {
    canvas = c; ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    centerOn(22, 21);
    cam.zoom = tgt.zoom = Math.max(0.6, Math.min(1.3, W / 1500));
  }

  return Object.assign(api, { init, frame, pick, screenToTile, screenToWorld, buildingScreenTop, centerOn, clampCam, zoomAt, panTo, daylight, dayPhase, resize, resetWalkers: () => { walkers = []; } });
})();
