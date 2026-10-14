// ============================================================
//  Shared 3D toolkit: procedural textures, materials, geometry
//  helpers, mesh merging and a wind-sway shader for foliage.
// ============================================================

const GFX = (() => {
  const T = THREE;
  const texCache = {}, matCache = {};
  const windUniform = { value: 0 };       // shared clock for swaying foliage / crops

  // ---------- procedural canvas textures ----------
  function canvasTex(key, size, paint, repeat = true) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    paint(g, size);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  }
  const rnd = (a, b, c) => hash2(a, b, c);
  function noiseFill(g, s, base, amp, seed, cell = 2) {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += cell) for (let x = 0; x < s; x += cell) {
      const v = (rnd(x, y, seed) - 0.5) * amp;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(x, y, cell, cell);
    }
  }
  const TEX = {
    ground: () => canvasTex('ground', 256, (g, s) => {
      noiseFill(g, s, '#d8d8d8', 0.22, 1, 2);
      for (let i = 0; i < 900; i++) {           // blade strokes
        const x = rnd(i, 1, 2) * s, y = rnd(i, 2, 2) * s;
        g.strokeStyle = rnd(i, 3, 2) < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(i, 4, 2) - 0.5) * 3, y - 3 - rnd(i, 5, 2) * 4); g.stroke();
      }
    }),
    dirt: () => canvasTex('dirt', 128, (g, s) => {
      noiseFill(g, s, '#b39465', 0.25, 3, 2);
      for (let i = 0; i < 70; i++) { g.fillStyle = rnd(i, 1, 4) < 0.5 ? 'rgba(80,60,35,0.45)' : 'rgba(235,220,185,0.5)'; g.fillRect(rnd(i, 2, 4) * s, rnd(i, 3, 4) * s, 2 + rnd(i, 4, 4) * 2, 2); }
    }),
    cobble: () => canvasTex('cobble', 256, (g, s) => {
      g.fillStyle = '#6b665c'; g.fillRect(0, 0, s, s);
      const n = 8, cs = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const ox = (y % 2) * cs / 2, v = rnd(x, y, 7);
        const l = 150 + v * 45 | 0;
        g.fillStyle = `rgb(${l},${l - 6},${l - 16})`;
        g.beginPath(); g.roundRect((x * cs + ox + 2) % s, y * cs + 2, cs - 4, cs - 4, 5); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect((x * cs + ox + 4) % s, y * cs + 4, cs - 10, 3);
      }
    }),
    logs: () => canvasTex('logs', 128, (g, s) => {
      const n = 6, h = s / n;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
        grd.addColorStop(0, '#5a3a20'); grd.addColorStop(0.35, '#9a6a3c'); grd.addColorStop(0.7, '#7a5030'); grd.addColorStop(1, '#3e2814');
        g.fillStyle = grd; g.fillRect(0, i * h, s, h);
        for (let k = 0; k < 8; k++) { g.strokeStyle = 'rgba(40,25,10,0.35)'; g.beginPath(); const y = i * h + rnd(i, k, 9) * h; g.moveTo(0, y); g.lineTo(s, y + (rnd(k, i, 9) - 0.5) * 4); g.stroke(); }
      }
    }),
    planks: () => canvasTex('planks', 128, (g, s) => {
      const n = 6, w = s / n;
      for (let i = 0; i < n; i++) {
        const l = 0.85 + rnd(i, 1, 11) * 0.3;
        g.fillStyle = `rgb(${138 * l | 0},${92 * l | 0},${54 * l | 0})`; g.fillRect(i * w, 0, w, s);
        g.fillStyle = 'rgba(30,18,8,0.55)'; g.fillRect(i * w, 0, 1.5, s);
        for (let k = 0; k < 5; k++) { g.strokeStyle = 'rgba(60,35,15,0.3)'; g.beginPath(); const x = i * w + 3 + rnd(i, k, 12) * (w - 6); g.moveTo(x, 0); g.lineTo(x + (rnd(k, i, 12) - 0.5) * 3, s); g.stroke(); }
        g.fillStyle = 'rgba(30,18,8,0.6)'; g.beginPath(); g.arc(i * w + w / 2, s * rnd(i, 2, 13), 1.6, 0, 6.3); g.fill();
      }
    }),
    plaster: () => canvasTex('plaster', 128, (g, s) => noiseFill(g, s, '#e4d8bd', 0.12, 21, 2)),
    stone: () => canvasTex('stone', 256, (g, s) => bricks(g, s, [168, 160, 146], 22)),
    darkstone: () => canvasTex('darkstone', 256, (g, s) => bricks(g, s, [96, 90, 86], 23)),
    thatch: () => canvasTex('thatch', 128, (g, s) => {
      g.fillStyle = '#b8903e'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        const x = rnd(i, 1, 31) * s, y = rnd(i, 2, 31) * s;
        g.strokeStyle = ['#d9b25a', '#8a6a2a', '#c9a24c', '#a07c34'][i % 4];
        g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(i, 3, 31) - 0.5) * 3, y + 10); g.stroke();
      }
      for (let y = 0; y < s; y += 16) { g.fillStyle = 'rgba(60,40,10,0.35)'; g.fillRect(0, y, s, 2); }
    }),
    tiles: () => canvasTex('tiles', 128, (g, s) => shingles(g, s, [168, 66, 46], 41)),
    slate: () => canvasTex('slate', 128, (g, s) => shingles(g, s, [74, 86, 104], 42)),
    darkroof: () => canvasTex('darkroof', 128, (g, s) => shingles(g, s, [70, 52, 40], 43)),
    field: () => canvasTex('field', 128, (g, s) => {
      g.fillStyle = '#7a5a34'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 16) { g.fillStyle = '#5e4426'; g.fillRect(0, y, s, 6); g.fillStyle = 'rgba(255,230,180,0.12)'; g.fillRect(0, y + 8, s, 2); }
    }),
    water: () => canvasTex('water', 256, (g, s) => {
      noiseFill(g, s, '#ffffff', 0.15, 51, 4);
      for (let i = 0; i < 140; i++) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; const x = rnd(i, 1, 52) * s, y = rnd(i, 2, 52) * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - 2, x + 12, y); g.stroke(); }
    }),
    cloth: (col) => canvasTex('cloth' + col, 64, (g, s) => {
      g.fillStyle = typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : col; g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 8, s);
    }),
    mist: () => canvasTex('mist', 128, (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }, false),
  };
  function bricks(g, s, [r, gg, b], seed) {
    g.fillStyle = `rgb(${r * 0.55 | 0},${gg * 0.55 | 0},${b * 0.55 | 0})`; g.fillRect(0, 0, s, s);
    const rows = 10, h = s / rows;
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * -14;
      while (x < s) {
        const w = 22 + rnd(x, y, seed) * 20, l = 0.82 + rnd(y, x, seed) * 0.3;
        g.fillStyle = `rgb(${r * l | 0},${gg * l | 0},${b * l | 0})`;
        g.beginPath(); g.roundRect(x + 1.5, y * h + 1.5, w - 3, h - 3, 3); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 3, y * h + 2.5, w - 7, 2);
        x += w;
      }
    }
  }
  function shingles(g, s, [r, gg, b], seed) {
    g.fillStyle = `rgb(${r * 0.5 | 0},${gg * 0.5 | 0},${b * 0.5 | 0})`; g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows, w = s / 6;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 7; x++) {
      const l = 0.8 + rnd(x, y, seed) * 0.35, ox = (y % 2) * w / 2;
      g.fillStyle = `rgb(${r * l | 0},${gg * l | 0},${b * l | 0})`;
      g.beginPath(); g.roundRect(x * w + ox + 1, y * h, w - 2, h + 3, [0, 0, 6, 6]); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x * w + ox + 1, y * h + h, w - 2, 2);
    }
  }

  // ---------- materials ----------
  function mat(key, opts = {}) {
    if (matCache[key]) return matCache[key];
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, opts));
    matCache[key] = m;
    return m;
  }
  const M = {
    logs: () => mat('logs', { map: TEX.logs() }),
    planks: () => mat('planks', { map: TEX.planks() }),
    plaster: () => mat('plaster', { map: TEX.plaster() }),
    stone: () => mat('stone', { map: TEX.stone() }),
    darkstone: () => mat('darkstone', { map: TEX.darkstone() }),
    thatch: () => mat('thatch', { map: TEX.thatch() }),
    tiles: () => mat('tiles', { map: TEX.tiles() }),
    slate: () => mat('slate', { map: TEX.slate() }),
    darkroof: () => mat('darkroof', { map: TEX.darkroof() }),
    cobble: () => mat('cobble', { map: TEX.cobble(), color: 0xc9c0b0 }),
    dirt: () => mat('dirt', { map: TEX.dirt() }),
    field: () => mat('field', { map: TEX.field() }),
    wood: () => mat('wood', { color: 0x6b4a2a }),
    darkwood: () => mat('darkwood', { color: 0x3e2a18 }),
    beam: () => mat('beam', { color: 0x4a3020 }),
    iron: () => mat('iron', { color: 0x5a5e66, metalness: 0.7, roughness: 0.45 }),
    gold: () => mat('gold', { color: 0xd4a017, metalness: 0.8, roughness: 0.35 }),
    // windows glow at night: emissiveIntensity is driven by Render
    window: () => mat('window', { color: 0x2a3540, emissive: 0xffc35a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.3 }),
    fire: () => mat('fire', { color: 0xff7a2a, emissive: 0xff6a1a, emissiveIntensity: 2.2 }),
    torch: () => mat('torch', { color: 0xffb347, emissive: 0xffa040, emissiveIntensity: 2.5 }),
    crucible: () => mat('crucible', { color: 0x5fd6d0, emissive: 0x3fe0d8, emissiveIntensity: 2 }),
    color: (hex) => mat('c' + hex, { color: hex }),
    cloth: (hex) => mat('cloth' + hex, { map: TEX.cloth(hex), side: T.DoubleSide }),
    flag: (hex) => mat('flag' + hex, { color: hex, side: T.DoubleSide, roughness: 0.8 }),
  };

  // ---------- geometry helpers ----------
  // Box whose texture repeats per world unit instead of stretching per face
  function boxGeo(w, h, d, ts = 1.6) {
    const g = new T.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] * ts, uv.getY(i) * dims[f][1] * ts);
    }
    return g;
  }
  // Gable roof: ridge along X. Group 0 = slopes, group 1 = gable ends.
  function gableGeo(w, d, h, ts = 1.4) {
    const hw = w / 2, hd = d / 2;
    const pos = [], uv = [];
    const slope = Math.hypot(hd, h);
    const quad = (a, b, c, e, ua, ub, uc, ue) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue); };
    // front slope (+z) and back slope (-z)
    quad([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], [0, 0], [w * ts, 0], [w * ts, slope * ts], [0, slope * ts]);
    quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], [0, 0], [w * ts, 0], [w * ts, slope * ts], [0, slope * ts]);
    const slopeCount = pos.length / 3;
    // gable triangles
    pos.push(hw, 0, hd, hw, 0, -hd, hw, h, 0); uv.push(0, 0, d * ts, 0, d * ts / 2, h * ts);
    pos.push(-hw, 0, -hd, -hw, 0, hd, -hw, h, 0); uv.push(0, 0, d * ts, 0, d * ts / 2, h * ts);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.addGroup(0, slopeCount, 0);
    g.addGroup(slopeCount, 6, 1);
    return g;
  }
  // Gable roof as two meshes (slopes + gable ends) so each can be baked with its material
  function roof(parent, w, d, h, roofMat, endMat, x, y, z, ry = 0) {
    const g = gableGeo(w, d, h);
    const split = (start, count) => {
      const out = new T.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const at = g.attributes[name];
        out.setAttribute(name, new T.BufferAttribute(at.array.slice(start * at.itemSize, (start + count) * at.itemSize), at.itemSize));
      }
      return out;
    };
    const [g0, g1] = g.groups;
    add(parent, split(g0.start, g0.count), roofMat, x, y, z, { ry });
    add(parent, split(g1.start, g1.count), endMat, x, y, z, { ry });
  }
  function pyramidGeo(w, d, h) {
    const g = new T.ConeGeometry(Math.SQRT1_2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(w, 1, d);
    g.translate(0, h / 2, 0);
    return g;
  }

  // Merge geometries (each with its own matrix and optional vertex colour) into one
  function merge(items) {
    let total = 0;
    const parts = items.map(({ geo, matrix, color }) => {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      if (matrix) g.applyMatrix4(matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      total += g.attributes.position.count;
      return { g, color };
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
    let o = 0;
    const c = new T.Color();
    for (const { g, color } of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      c.set(color === undefined ? 0xffffff : color);
      for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += n;
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  // Collapse a group's static meshes into one mesh per material (far fewer draw calls)
  function bake(group) {
    group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(group.matrixWorld).invert();
    const byMat = new Map(), keep = [];
    // animated parts (and everything inside them) are kept as-is
    (function walk(o) {
      for (const ch of o.children) {
        if (ch.userData.dynamic || ch.isInstancedMesh || Array.isArray(ch.material)) { keep.push(ch); continue; }
        if (ch.isMesh) {
          const m = new T.Matrix4().multiplyMatrices(inv, ch.matrixWorld);
          if (!byMat.has(ch.material)) byMat.set(ch.material, []);
          byMat.get(ch.material).push({ geo: ch.geometry, matrix: m });
        }
        walk(ch);
      }
    })(group);
    const out = new T.Group();
    out.position.copy(group.position); out.rotation.copy(group.rotation); out.scale.copy(group.scale);
    for (const [material, items] of byMat) {
      const mesh = new T.Mesh(merge(items), material);
      mesh.castShadow = mesh.receiveShadow = true;
      out.add(mesh);
    }
    for (const o of keep) {
      const m = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      o.removeFromParent();
      m.decompose(o.position, o.quaternion, o.scale);
      out.add(o);
    }
    out.userData = group.userData;
    return out;
  }

  // shorthand: add a mesh to a parent at a position
  function add(parent, geo, material, x = 0, y = 0, z = 0, opts = {}) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.noShadow ? false : true;
    m.receiveShadow = true;
    if (opts.dynamic) m.userData.dynamic = true;
    parent.add(m);
    return m;
  }
  // box resting on y (bottom at y)
  function block(parent, w, h, d, material, x, y, z, opts) { return add(parent, boxGeo(w, h, d), material, x, y + h / 2, z, opts); }

  // Wind sway for vertex-coloured foliage: displacement grows with height
  function swayMaterial(key, opts = {}) {
    if (matCache[key]) return matCache[key];
    const m = new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, flatShading: true }, opts));
    m.onBeforeCompile = sh => {
      sh.uniforms.uWind = windUniform;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uWind * 1.6 + ip.x * 0.7 + ip.z * 0.4) * 0.05 + sin(uWind * 3.1 + ip.x) * 0.012;
        transformed.x += sway * max(0.0, transformed.y);
        transformed.z += sway * 0.6 * max(0.0, transformed.y);`);
    };
    matCache[key] = m;
    return m;
  }

  // ---------- reusable models ----------
  // Tree geometries (merged, vertex coloured). Base at y = 0, ~1.4 units tall.
  let treeGeos = null;
  function trees() {
    if (treeGeos) return treeGeos;
    const M4 = (x, y, z, s = 1, sy = s) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(s, sy, s));
    const trunk = new T.CylinderGeometry(0.035, 0.055, 0.4, 6);
    const pine = merge([
      { geo: trunk, matrix: M4(0, 0.2, 0), color: 0x5a3a20 },
      { geo: new T.ConeGeometry(0.34, 0.55, 8), matrix: M4(0, 0.5, 0), color: 0x2a5d32 },
      { geo: new T.ConeGeometry(0.27, 0.48, 8), matrix: M4(0, 0.78, 0), color: 0x316b3a },
      { geo: new T.ConeGeometry(0.19, 0.42, 8), matrix: M4(0, 1.04, 0), color: 0x3a7a42 },
      { geo: new T.ConeGeometry(0.1, 0.3, 7), matrix: M4(0, 1.27, 0), color: 0x468a4c },
    ]);
    const blob = new T.IcosahedronGeometry(0.22, 1);
    const oak = merge([
      { geo: new T.CylinderGeometry(0.05, 0.08, 0.6, 6), matrix: M4(0, 0.3, 0), color: 0x5a3b22 },
      { geo: blob, matrix: M4(0, 0.78, 0, 1.45), color: 0x3f7a32 },
      { geo: blob, matrix: M4(-0.2, 0.68, 0.08, 1.05), color: 0x4a8a38 },
      { geo: blob, matrix: M4(0.2, 0.7, -0.06, 1.1), color: 0x37702e },
      { geo: blob, matrix: M4(0.04, 1.02, 0.05, 1.0), color: 0x5a9a42 },
      { geo: blob, matrix: M4(-0.08, 0.66, -0.2, 0.95), color: 0x427e34 },
    ]);
    const birch = merge([
      { geo: new T.CylinderGeometry(0.03, 0.045, 0.75, 6), matrix: M4(0, 0.37, 0), color: 0xe8e2d4 },
      { geo: blob, matrix: M4(0, 0.86, 0, 0.95, 1.25), color: 0x7aa83e },
      { geo: blob, matrix: M4(-0.1, 0.72, 0.05, 0.8), color: 0x8cba4a },
      { geo: blob, matrix: M4(0.1, 1.0, -0.04, 0.7), color: 0x9cc858 },
    ]);
    const bush = merge([
      { geo: blob, matrix: M4(0, 0.1, 0, 0.7, 0.55), color: 0x3f7a32 },
      { geo: blob, matrix: M4(0.1, 0.1, 0.06, 0.5, 0.45), color: 0x4f8f3c },
    ]);
    treeGeos = { pine, oak, birch, bush };
    return treeGeos;
  }

  // Low-poly person parts (feet at y = 0)
  let personGeos = null;
  function person() {
    if (personGeos) return personGeos;
    personGeos = {
      body: (() => { const g = new T.CylinderGeometry(0.045, 0.06, 0.16, 7); g.translate(0, 0.15, 0); return g; })(),
      head: (() => { const g = new T.SphereGeometry(0.04, 8, 6); g.translate(0, 0.27, 0); return g; })(),
      leg: (() => { const g = new T.BoxGeometry(0.025, 0.08, 0.025); g.translate(0, -0.04, 0); return g; })(),
    };
    return personGeos;
  }

  return { TEX, M, mat, boxGeo, gableGeo, roof, pyramidGeo, merge, bake, add, block, swayMaterial, trees, person, windUniform };
})();
