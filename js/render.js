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
  const api = { terrainDirty: true, cam, hover: null, hoverTile: null, ghost: null };

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
  function box(x0, y0, x1, y1, z0, z1, color, opts = {}) {
    const edge = opts.edge || 'rgba(0,0,0,0.25)';
    poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(color, 0.82), edge);    // left (front-left)
    poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade(color, 0.62), edge);    // right (front-right)
    if (!opts.noTop) poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], opts.top || color, edge);
  }
  function pyramid(x0, y0, x1, y1, z, h, color) {
    const ap = P((x0 + x1) / 2, (y0 + y1) / 2, z + h);
    poly([P(x0, y0, z), P(x1, y0, z), ap], shade(color, 1.1), 'rgba(0,0,0,0.2)');
    poly([P(x0, y0, z), P(x0, y1, z), ap], shade(color, 1.0), 'rgba(0,0,0,0.2)');
    poly([P(x0, y1, z), P(x1, y1, z), ap], shade(color, 0.85), 'rgba(0,0,0,0.25)');
    poly([P(x1, y0, z), P(x1, y1, z), ap], shade(color, 0.65), 'rgba(0,0,0,0.25)');
  }
  function gable(x0, y0, x1, y1, z, h, color, alongX) {
    const e = 'rgba(0,0,0,0.25)';
    if (alongX) {
      const ym = (y0 + y1) / 2;
      poly([P(x0, y0, z), P(x1, y0, z), P(x1, ym, z + h), P(x0, ym, z + h)], shade(color, 1.1), e);
      poly([P(x0, y0, z), P(x0, y1, z), P(x0, ym, z + h)], shade(color, 0.7), e);
      poly([P(x0, y1, z), P(x1, y1, z), P(x1, ym, z + h), P(x0, ym, z + h)], shade(color, 0.88), e);
      poly([P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + h)], shade('#c9b089', 0.7), e);
    } else {
      const xm = (x0 + x1) / 2;
      poly([P(x0, y0, z), P(x0, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], shade(color, 1.05), e);
      poly([P(x0, y0, z), P(x1, y0, z), P(xm, y0, z + h)], shade(color, 0.7), e);
      poly([P(x1, y0, z), P(x1, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], shade(color, 0.68), e);
      poly([P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + h)], shade('#c9b089', 0.85), e);
    }
  }
  function diamond(x0, y0, x1, y1, z, fill, stroke, lw) {
    poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill, stroke, lw);
  }
  // window on the front-left face (y = y1) at fractional position u along x
  function windowL(x0, x1, y1, u, z, w, h, color = '#f3d27a') {
    const xa = x0 + (x1 - x0) * u, xb = xa + w;
    poly([P(xa, y1, z), P(xb, y1, z), P(xb, y1, z + h), P(xa, y1, z + h)], color, 'rgba(0,0,0,0.4)');
  }
  function windowR(y0, y1, x1, u, z, w, h, color = '#e0b95e') {
    const ya = y0 + (y1 - y0) * u, yb = ya + w;
    poly([P(x1, ya, z), P(x1, yb, z), P(x1, yb, z + h), P(x1, ya, z + h)], color, 'rgba(0,0,0,0.4)');
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
  const GRASS = ['#6fa04a', '#6a9b46', '#73a64e', '#679843'];
  function buildTerrain() {
    if (!terrain) {
      terrain = document.createElement('canvas');
      terrain.width = TERRAIN_W; terrain.height = TERRAIN_H;
    }
    const c = terrain.getContext('2d');
    const saved = ctx; ctx = c;
    c.setTransform(1, 0, 0, 1, ORIGIN_X, ORIGIN_Y);
    c.clearRect(-ORIGIN_X, -ORIGIN_Y, TERRAIN_W, TERRAIN_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      const v = hash2(x, y, 5);
      let col;
      switch (t) {
        case T_FOREST: col = v < 0.5 ? '#557f37' : '#5a8439'; break;
        case T_WATER: col = v < 0.5 ? '#3f7fb5' : '#4386bd'; break;
        case T_ROAD: col = v < 0.5 ? '#bba277' : '#b59b70'; break;
        case T_PLAZA: col = ((x + y) % 2) ? '#a8a296' : '#b1ab9f'; break;
        case T_SAND: col = '#d6c48f'; break;
        default: col = GRASS[Math.floor(v * 4)];
      }
      diamond(x, y, x + 1, y + 1, 0, col, t === T_PLAZA ? 'rgba(80,70,60,0.35)' : null);
      if (t === T_GRASS && v > 0.85) {      // little flowers / tufts
        const [px, py] = P(x + 0.5, y + 0.5);
        c.fillStyle = v > 0.95 ? '#e8d36a' : '#5c8a3c';
        c.fillRect(px - 3 + v * 6, py - 2, 2, 2);
      }
      if (!inTerritory(x, y)) diamond(x, y, x + 1, y + 1, 0, 'rgba(20,25,40,0.28)');
    }
    // road edges
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y) !== T_ROAD) continue;
      const [px, py] = P(x + 0.5, y + 0.5);
      c.fillStyle = 'rgba(90,70,40,0.25)';
      c.fillRect(px - 6, py - 1, 3, 2); c.fillRect(px + 4, py + 1, 3, 2);
    }
    // territory border
    c.strokeStyle = 'rgba(255,215,90,0.85)'; c.lineWidth = 2; c.setLineDash([6, 4]);
    c.beginPath();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (!inTerritory(x, y)) continue;
      const edges = [[0, -1, [x, y], [x + 1, y]], [1, 0, [x + 1, y], [x + 1, y + 1]], [0, 1, [x, y + 1], [x + 1, y + 1]], [-1, 0, [x, y], [x, y + 1]]];
      for (const [dx, dy, a, b] of edges) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || !inTerritory(nx, ny)) {
          const pa = P(a[0], a[1]), pb = P(b[0], b[1]);
          c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]);
        }
      }
    }
    c.stroke(); c.setLineDash([]);
    // command center lettering
    c.save();
    const [lx, ly] = P(27.5, 27.9);
    c.translate(lx, ly); c.transform(1, -0.5, 1, 0.5, 0, 0);
    c.font = 'bold 11px Georgia, serif'; c.fillStyle = 'rgba(60,45,30,0.55)'; c.textAlign = 'center';
    c.fillText('COMMAND CENTER', 0, 0);
    c.restore();
    ctx = saved;
    // trees
    trees = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y) !== T_FOREST) continue;
      const n = hash2(x, y, 9) < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        trees.push({ x: x + 0.3 + hash2(x, y, 20 + i) * 0.4, y: y + 0.3 + hash2(x, y, 30 + i) * 0.4, kind: hash2(x, y, 40 + i) < 0.55 ? 0 : 1, s: 0.8 + hash2(x, y, 50 + i) * 0.45 });
      }
    }
    api.terrainDirty = false;
  }

  function drawTree(t) {
    const [px, py] = P(t.x, t.y);
    const s = t.s;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(px + 3, py + 1, 9 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b3d22';
    ctx.fillRect(px - 1.5 * s, py - 9 * s, 3 * s, 9 * s);
    if (t.kind === 0) {     // pine
      for (let i = 0; i < 3; i++) {
        const yy = py - 8 * s - i * 8 * s, w = (10 - i * 2.5) * s;
        ctx.fillStyle = i % 2 ? '#2f6b32' : '#2a6230';
        ctx.beginPath(); ctx.moveTo(px - w, yy); ctx.lineTo(px + w, yy); ctx.lineTo(px, yy - 13 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + w, yy); ctx.lineTo(px, yy - 13 * s); ctx.closePath(); ctx.fill();
      }
    } else {                // round oak
      ctx.fillStyle = '#3f7d35';
      ctx.beginPath(); ctx.arc(px, py - 16 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4b9140';
      ctx.beginPath(); ctx.arc(px - 3 * s, py - 19 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.beginPath(); ctx.arc(px + 3 * s, py - 14 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
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
      case 'refinery': return 70;
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
    // ground shadow
    diamond(x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, 0, 'rgba(0,0,0,0.12)');
    switch (b.type) {
      case 'house': {
        const i = 0.17, x0 = x + i, y0 = y + i, x1 = x + 1 - i, y1 = y + 1 - i;
        const wall = ['#c49a63', '#e1d2b0', '#b8b2a6'][L - 1];
        const roof = ['#c9a14a', '#a6442e', '#4f5d70'][L - 1];
        const h = [14, 18, 30][L - 1];
        box(x0, y0, x1, y1, 0, h, wall);
        if (L === 2) {   // timber framing
          ctx.strokeStyle = 'rgba(80,50,30,0.7)'; ctx.lineWidth = 1;
          const a = P(x0, y1, h * 0.5), bb = P(x1, y1, h * 0.5);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]); ctx.stroke();
        }
        windowL(x0, x1, y1, 0.15, 3, 0.18, 7, '#5a3a22');      // door
        windowL(x0, x1, y1, 0.55, h * 0.45, 0.16, 5);
        windowR(y0, y1, x1, 0.4, h * 0.45, 0.16, 5);
        if (L === 3) windowL(x0, x1, y1, 0.15, 19, 0.16, 5);
        gable(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, h, 13, roof, v < 0.5);
        const cx = v < 0.5 ? x0 + 0.15 : x1 - 0.2;
        box(cx, y0 + 0.15, cx + 0.12, y0 + 0.27, h + 4, h + 16, '#7d6a5a');
        smoke(cx + 0.06, y0 + 0.21, h + 16, 0.012, false);
        break;
      }
      case 'farm': {
        diamond(x + 0.05, y + 0.05, x + 2 - 0.05, y + 2 - 0.05, 0, '#8a6a3f', 'rgba(60,40,20,0.5)');
        const crop = ['#9cbc4f', '#c2c24e', '#d8b84a'][L - 1];
        ctx.strokeStyle = crop; ctx.lineWidth = 2.2;
        for (let i = 1; i < 8; i++) {
          const yy = y + 0.1 + i * 0.22;
          if (yy > y + 1.95) break;
          const a = P(x + 0.95, yy, 1), c = P(x + 1.9, yy, 1);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
        }
        for (let i = 1; i < 4; i++) {
          const yy = y + 0.95 + i * 0.22;
          const a = P(x + 0.12, yy, 1), c = P(x + 0.9, yy, 1);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
        }
        // barn
        box(x + 0.12, y + 0.12, x + 0.85, y + 0.8, 0, 14, '#9b3b2c');
        windowL(x + 0.12, x + 0.85, y + 0.8, 0.35, 0, 0.25, 9, '#4a2a1a');
        gable(x + 0.08, y + 0.08, x + 0.89, y + 0.84, 14, 11, '#6b4a2a', true);
        if (L === 3) {   // windmill
          box(x + 0.15, y + 1.2, x + 0.5, y + 1.55, 0, 34, '#d8cdb6');
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
        box(x + 0.1, y + 0.1, x + 0.6, y + 0.6, 0, 13, '#8a6038');
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
      case 'refinery': {
        const wall = ['#a49a8c', '#8e8378', '#6f6a66', '#4f4b55'][L - 1];
        const h = [16, 20, 24, 28][L - 1];
        box(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, h, wall);
        // furnace mouth
        const glow = b.active ? `rgba(255,${120 + Math.floor(Math.sin(time * 8 + b.id) * 30)},40,1)` : '#3a2a20';
        windowL(x + 0.12, x + 0.88, y + 0.88, 0.3, 2, 0.3, 8, glow);
        gable(x + 0.08, y + 0.08, x + 0.92, y + 0.92, h, 8, '#5a4a3e', true);
        for (let k = 0; k < Math.min(L, 2); k++) {
          const cx = x + 0.2 + k * 0.38;
          box(cx, y + 0.2, cx + 0.16, y + 0.36, h, h + 26 + L * 6, '#6b5d52');
          if (b.active) smoke(cx + 0.08, y + 0.28, h + 26 + L * 6, 0.15, true);
        }
        // tier pips
        const [px, py] = P(x + 0.88, y + 0.5, h * 0.5);
        for (let k = 0; k < L; k++) { ctx.fillStyle = '#ffcc55'; ctx.fillRect(px - 2 + k * 4 - L * 2, py, 3, 3); }
        break;
      }
      case 'watchtower': {
        const h = L === 2 ? 64 : 48;
        box(x + 0.3, y + 0.3, x + 0.7, y + 0.7, 0, h, L === 2 ? '#9e9a92' : '#8a6a44');
        box(x + 0.22, y + 0.22, x + 0.78, y + 0.78, h, h + 6, L === 2 ? '#b0aba2' : '#9a7a50');
        pyramid(x + 0.2, y + 0.2, x + 0.8, y + 0.8, h + 6, 16, '#7a3a2a');
        flag(x + 0.5, y + 0.5, h + 22, '#c0392b');
        break;
      }
      case 'stables': {
        box(x + 0.1, y + 0.2, x + 1.9, y + 0.9, 0, 16, '#8a5a34');
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
        box(x + 0.15, y + 0.15, x + 0.65, y + 0.65, 0, th, '#bdb4a2');
        windowL(x + 0.15, x + 0.65, y + 0.65, 0.35, th - 16, 0.3, 8, '#3a2a1a');
        pyramid(x + 0.1, y + 0.1, x + 0.7, y + 0.7, th, 22, '#3f4f6a');
        flag(x + 0.4, y + 0.4, th + 22, '#d4a017');
        const hh = 26 + L * 4;
        box(x + 0.75, y + 0.15, x + 1.85, y + 0.75, 0, hh, wall);
        windowR(y + 0.15, y + 0.75, x + 1.85, 0.35, 10, 0.25, 9);
        gable(x + 0.7, y + 0.1, x + 1.9, y + 0.8, hh, 16, '#3f4f6a', false);
        box(x + 0.15, y + 0.75, x + 1.85, y + 1.85, 0, hh, wall);
        for (let k = 0; k < 4; k++) windowL(x + 0.15, x + 1.85, y + 1.85, 0.1 + k * 0.22, 10, 0.08, 9);
        for (let k = 0; k < 2; k++) windowR(y + 0.75, y + 1.85, x + 1.85, 0.2 + k * 0.4, 10, 0.12, 9);
        windowL(x + 0.15, x + 1.85, y + 1.85, 0.42, 0, 0.16, 13, '#5a3a22');
        gable(x + 0.1, y + 0.7, x + 1.9, y + 1.9, hh, 20, '#3f4f6a', true);
        break;
      }
      case 'forge': {
        const h = 22 + L * 3;
        box(x + 0.15, y + 0.15, x + 1.8, y + 1.5, 0, h, '#5b5450');
        const glow = `rgba(255,${130 + Math.floor(Math.sin(time * 6) * 40)},40,1)`;
        windowL(x + 0.15, x + 1.8, y + 1.5, 0.15, 0, 0.35, 14, glow);
        windowR(y + 0.15, y + 1.5, x + 1.8, 0.3, 8, 0.15, 6, glow);
        gable(x + 0.1, y + 0.1, x + 1.85, y + 1.55, h, 14, '#3a3533', true);
        box(x + 1.25, y + 0.3, x + 1.6, y + 0.65, h, h + 34, '#4b4542');
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
        box(x + 0.1, y + 0.1, x + 1.9, y + 0.9, 0, 18 + L * 3, '#8e8676');
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
    if (b.upg !== undefined) {
      const [px, py] = P(x + s / 2, y + s / 2, bHeight(b) + 6);
      progressBar(px, py, b.upg, '#ffb84d');
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔨', px, py - 4);
    }
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

  function drawLabel(b) {
    const def = BUILDINGS[b.type];
    if (!def.unique) return;
    const [px, py] = P(b.x + def.size / 2, b.y + def.size / 2, bHeight(b) + 8);
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    const text = def.name + (b.level > 1 ? ' ' + '★'.repeat(b.level - 1) : '');
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(30,22,14,0.7)';
    ctx.fillRect(px - w / 2, py - 12, w, 16);
    ctx.fillStyle = '#f5e2b8';
    ctx.fillText(text, px, py);
  }

  // ---------- people ----------
  function personAt(px, py, color, carry, scale = 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(px, py, 3 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(px - 2 * scale, py - 7 * scale, 4 * scale, 6 * scale);
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
    const want = Math.min(80, Math.floor(idleCitizens() / 4 + employedWorkers() / 8) + 6);
    const targets = walkerTargets();
    while (walkers.length < want && targets.length) {
      const s = targets[Math.floor(Math.random() * targets.length)];
      walkers.push({ x: s[0], y: s[1], tx: s[0], ty: s[1], c: CLOTHES[Math.floor(Math.random() * CLOTHES.length)], sp: 0.8 + Math.random() * 0.6, wait: Math.random() * 3 });
    }
    if (walkers.length > want) walkers.length = want;
    for (const w of walkers) {
      if (w.wait > 0) { w.wait -= dt; continue; }
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
      else personAt(px, py - bob, CLOTHES[i % CLOTHES.length], g.carry);
    }
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

  function frame(dt) {
    time += dt;
    if (api.terrainDirty) buildTerrain();
    updateWalkers(dt * Math.min(G.paused ? 0 : G.speed, 2) || 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2d3b2a';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));
    ctx.drawImage(terrain, -ORIGIN_X, -ORIGIN_Y);
    drawWaterShimmer();

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

    // depth-sorted objects
    const objs = [];
    for (const b of G.buildings) {
      const s = BUILDINGS[b.type].size;
      if (visible(b.x + s / 2, b.y + s / 2)) objs.push({ d: b.x + b.y + 2 * (s - 1) + 0.5, b });
    }
    for (const t of trees) if (visible(t.x, t.y) && !buildingAt(Math.floor(t.x), Math.floor(t.y))) objs.push({ d: Math.floor(t.x) + Math.floor(t.y) + 0.4, t });
    for (const w of walkers) if (visible(w.x, w.y)) objs.push({ d: Math.floor(w.x) + Math.floor(w.y) + 0.7, w });
    for (const g of movingGroups()) objs.push({ d: Math.floor(g.x) + Math.floor(g.y) + 0.8, g });
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) {
      if (o.b) {
        const hov = api.hover === o.b;
        if (hov) ctx.filter = 'brightness(1.18)';
        drawBuilding(o.b, false);
        if (hov) ctx.filter = 'none';
      } else if (o.t) drawTree(o.t);
      else if (o.w) { const [px, py] = P(o.w.x, o.w.y); personAt(px, py, o.w.c, null, 0.9); }
      else if (o.g) drawGroup(o.g);
    }
    if (api.ghost) {
      const { type, x, y } = api.ghost;
      ctx.globalAlpha = 0.6;
      drawBuilding({ id: 0, type, x, y, level: 1, built: 1, ore: 'ironOre' }, true);
      ctx.globalAlpha = 1;
    }
    for (const b of G.buildings) drawLabel(b);

    // particles
    for (const p of particles) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const f = p.life / p.max;
      if (p.ember) { ctx.fillStyle = `rgba(255,${180 - f * 100},60,${1 - f})`; ctx.fillRect(p.x, p.y, 2, 2); continue; }
      ctx.fillStyle = p.dark ? `rgba(70,65,62,${0.45 * (1 - f)})` : `rgba(220,220,220,${0.4 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + f * 9, 0, Math.PI * 2); ctx.fill();
    }
    particles = particles.filter(p => p.life < p.max);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
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

  function centerOn(tx, ty) { const [wx, wy] = P(tx, ty); cam.x = wx; cam.y = wy; }
  function clampCam() {
    const minX = -MAP_H * HW, maxX = MAP_W * HW, maxY = (MAP_W + MAP_H) * HH;
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.y = Math.max(0, Math.min(maxY, cam.y));
  }

  function init(c) {
    canvas = c; ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    centerOn(22, 21);
    cam.zoom = Math.max(0.6, Math.min(1.3, W / 1500));
  }

  return Object.assign(api, { init, frame, pick, screenToTile, screenToWorld, buildingScreenTop, centerOn, clampCam, resize, resetWalkers: () => { walkers = []; } });
})();
