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
  function windowL(x0, x1, y1, u, z, w, h, color = winColor()) {
    const xa = x0 + (x1 - x0) * u, xb = xa + w;
    poly([P(xa, y1, z), P(xb, y1, z), P(xb, y1, z + h), P(xa, y1, z + h)], color, 'rgba(0,0,0,0.4)');
  }
  function windowR(y0, y1, x1, u, z, w, h, color = winColor()) {
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
    buildWalls();
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
      box(x0, y0, x1, y1, 0, h + 16, stone ? '#9a958a' : '#7a5230');
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
      box(p1[0], p1[1], p1[2], p1[3], 0, h + 12, color);
      box(p2[0], p2[1], p2[2], p2[3], 0, h + 12, color);
      box(x0, y0, x1, y1, h + 6, h + 12, stone ? '#8e897e' : '#6b4a2a');
      torch(p1[0] + 0.1, p1[3], h);
      torch(p2[0] + 0.1, p2[3], h);
      return;
    }
    box(x0, y0, x1, y1, 0, h, color);
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

  function drawTree(t) {
    const [px, py] = P(t.x, t.y);
    const s = t.s;
    // sway in the wind
    const sway = Math.sin(time * 1.6 + t.x * 0.7 + t.y * 0.4) * 0.07 + Math.sin(time * 3.1 + t.x) * 0.015;
    ctx.save();
    ctx.translate(px, py); ctx.transform(1, 0, sway, 1, 0, 0); ctx.translate(-px, -py);
    drawTreeBody(t, px, py, s);
    ctx.restore();
  }
  function drawTreeBody(t, px, py, s) {
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
    // ground shadow
    diamond(x + 0.05, y + 0.05, x + s - 0.05, y + s - 0.05, 0, 'rgba(0,0,0,0.12)');
    if (def.refinery) drawRefinery(b, x, y, L);
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
      box(x + 0.12, y + 0.15, x + 0.75, y + 0.85, 0, 13, '#9a6a3c');
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
      box(x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, 40 + L * 4, '#3d3a48');
      box(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 40 + L * 4, 44 + L * 4, '#2e2b38');
      const [gx, gy] = P(x + 0.5, y + 0.5, 46 + L * 4);
      const pulse = 0.6 + Math.sin(time * 3) * 0.3;
      ctx.fillStyle = `rgba(95,214,208,${pulse})`; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
      light(gx, gy, 50);
      if (b.active && Math.random() < 0.3) particles.push({ x: gx, y: gy, vx: (Math.random() - 0.5) * 12, vy: -20, life: 0, max: 0.9, r: 1, ember: true, cyan: true });
    } else {
      // stone furnace with a coloured roof and a tall chimney
      const h = 14 + L * 3;
      box(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, h, '#8e8378');
      const glow = b.active ? `rgb(255,${120 + Math.floor(Math.sin(time * 8 + b.id) * 30)},40)` : '#3a2a20';
      windowL(x + 0.12, x + 0.88, y + 0.88, 0.3, 2, 0.3, 8, glow);
      gable(x + 0.08, y + 0.08, x + 0.92, y + 0.92, h, 8, acc, true);
      const ch = rec === 'steel' ? 2 : 1;
      for (let k = 0; k < ch; k++) {
        const cx = x + 0.2 + k * 0.38;
        box(cx, y + 0.2, cx + 0.16, y + 0.36, h, h + 26 + L * 5, '#6b5d52');
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
    ctx.fillStyle = '#2d3b2a';
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
