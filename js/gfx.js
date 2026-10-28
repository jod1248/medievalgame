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
  // Clean, low-contrast surfaces: a hint of pattern (boards, blocks,
  // shingle rows) on flat, bright colour, like a tidy city builder.
  const TEX = {
    ground: () => canvasTex('ground', 128, (g, s) => noiseFill(g, s, '#f4f4f4', 0.035, 1, 16)),
    dirt: () => canvasTex('dirt', 128, (g, s) => {
      noiseFill(g, s, '#e3cc9c', 0.05, 3, 8);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,115,70,0.18)'; g.beginPath(); g.arc(rnd(i, 2, 4) * s, rnd(i, 3, 4) * s, 1.5 + rnd(i, 4, 4) * 2, 0, 6.3); g.fill(); }
    }),
    cobble: () => canvasTex('cobble', 256, (g, s) => {
      g.fillStyle = '#b9ae9c'; g.fillRect(0, 0, s, s);
      const n = 4, cs = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const ox = (y % 2) * cs / 2, l = 222 + rnd(x, y, 7) * 18 | 0;
        g.fillStyle = `rgb(${l},${l - 6},${l - 16})`;
        g.beginPath(); g.roundRect((x * cs + ox + 4) % s, y * cs + 4, cs - 8, cs - 8, 10); g.fill();
        if ((x * cs + ox + 4) % s + cs - 8 > s) { g.beginPath(); g.roundRect((x * cs + ox + 4) % s - s, y * cs + 4, cs - 8, cs - 8, 10); g.fill(); }
      }
    }),
    logs: () => canvasTex('logs', 128, (g, s) => {
      const n = 5, h = s / n;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
        grd.addColorStop(0, '#9a6a40'); grd.addColorStop(0.45, '#c08a58'); grd.addColorStop(1, '#8a5c36');
        g.fillStyle = grd; g.fillRect(0, i * h, s, h);
      }
    }),
    planks: () => canvasTex('planks', 128, (g, s) => {
      const n = 5, w = s / n;
      for (let i = 0; i < n; i++) {
        const l = 0.95 + rnd(i, 1, 11) * 0.1;
        g.fillStyle = `rgb(${200 * l | 0},${150 * l | 0},${98 * l | 0})`; g.fillRect(i * w, 0, w, s);
        g.fillStyle = 'rgba(90,55,25,0.35)'; g.fillRect(i * w, 0, 2, s);
      }
    }),
    plaster: () => canvasTex('plaster', 64, (g, s) => noiseFill(g, s, '#f6eedc', 0.03, 21, 8)),
    stone: () => canvasTex('stone', 128, (g, s) => bricks(g, s, [214, 206, 192], 22)),
    darkstone: () => canvasTex('darkstone', 128, (g, s) => bricks(g, s, [140, 134, 128], 23)),
    thatch: () => canvasTex('thatch', 64, (g, s) => rows(g, s, [226, 186, 98], 31, 0)),
    tiles: () => canvasTex('tiles', 64, (g, s) => rows(g, s, [214, 98, 70], 41, 1)),
    slate: () => canvasTex('slate', 64, (g, s) => rows(g, s, [98, 124, 156], 42, 1)),
    darkroof: () => canvasTex('darkroof', 64, (g, s) => rows(g, s, [132, 92, 70], 43, 1)),
    field: () => canvasTex('field', 64, (g, s) => {
      g.fillStyle = '#b08458'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 16) { g.fillStyle = '#946a42'; g.fillRect(0, y, s, 6); }
    }),
    water: () => canvasTex('water', 128, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.fillStyle = 'rgba(200,230,255,0.5)'; const x = rnd(i, 1, 52) * s, y = rnd(i, 2, 52) * s; g.fillRect(x, y, 10, 2); }
    }),
    cloth: (col) => canvasTex('cloth' + col, 64, (g, s) => {
      g.fillStyle = typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : col; g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 8, s);
    }),
    mist: () => canvasTex('mist', 128, (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }, false),
  };
  // big tidy blocks with soft mortar lines
  function bricks(g, s, [r, gg, b], seed) {
    g.fillStyle = `rgb(${r * 0.84 | 0},${gg * 0.84 | 0},${b * 0.84 | 0})`; g.fillRect(0, 0, s, s);
    const rowsN = 4, h = s / rowsN;
    for (let y = 0; y < rowsN; y++) {
      let x = (y % 2) * -20;
      while (x < s) {
        const w = 34 + rnd(x, y, seed) * 16, l = 0.95 + rnd(y, x, seed) * 0.08;
        g.fillStyle = `rgb(${Math.min(255, r * l) | 0},${Math.min(255, gg * l) | 0},${Math.min(255, b * l) | 0})`;
        g.beginPath(); g.roundRect(x + 2, y * h + 2, w - 4, h - 4, 4); g.fill();
        x += w;
      }
    }
  }
  // roof rows: soft bands with a darker lip under each course
  function rows(g, s, [r, gg, b], seed, scallop) {
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, s, s);
    const n = 4, h = s / n;
    for (let y = 0; y < n; y++) {
      g.fillStyle = `rgba(0,0,0,0.13)`; g.fillRect(0, y * h + h - 3, s, 3);
      g.fillStyle = `rgba(255,255,255,0.1)`; g.fillRect(0, y * h, s, 3);
      if (scallop) for (let x = (y % 2) * 8; x < s; x += 16) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, y * h, 1.5, h); }
    }
  }

  // ---------- materials ----------
  function mat(key, opts = {}) {
    if (matCache[key]) return matCache[key];
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0, flatShading: true }, opts));
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
    cobble: () => mat('cobble', { map: TEX.cobble() }),
    dirt: () => mat('dirt', { map: TEX.dirt() }),
    field: () => mat('field', { map: TEX.field() }),
    wood: () => mat('wood', { color: 0x9a6a3e }),
    darkwood: () => mat('darkwood', { color: 0x5e4028 }),
    beam: () => mat('beam', { color: 0x6a4630 }),
    iron: () => mat('iron', { color: 0x6a707a, metalness: 0.5, roughness: 0.5 }),
    gold: () => mat('gold', { color: 0xd4a017, metalness: 0.8, roughness: 0.35 }),
    // windows glow at night: emissiveIntensity is driven by Render
    window: () => mat('window', { color: 0x3a5a78, emissive: 0xffc35a, emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 }),
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
  // Gable roof: two thick slabs meeting at a ridge cap, with solid gable
  // ends in the wall material. Ridge runs along X (rotated by ry).
  function roof(parent, w, d, h, roofMat, endMat, x, y, z, ry = 0) {
    const g = new T.Group();
    const hd = d / 2, L = Math.hypot(hd, h), ang = Math.atan2(h, hd), th = Math.min(0.05, 0.03 + w * 0.01);
    for (const sgn of [1, -1]) {
      const slab = new T.Mesh(boxGeo(w, th, L + th), roofMat);
      slab.position.set(0, h / 2 + th * 0.35, sgn * hd / 2);
      slab.rotation.x = sgn * ang;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
    }
    const cap = new T.Mesh(boxGeo(w + 0.02, th * 1.2, th * 2.2), roofMat);
    cap.position.set(0, h + th * 0.5, 0); cap.castShadow = true; g.add(cap);
    // gable ends sit just inside the overhang
    const inset = Math.min(0.06, w * 0.08);
    const tri = new T.Shape(); tri.moveTo(-hd + 0.03, 0); tri.lineTo(hd - 0.03, 0); tri.lineTo(0, h - 0.02); tri.lineTo(-hd + 0.03, 0);
    const end = new T.ExtrudeGeometry(tri, { depth: w - inset * 2, bevelEnabled: false });
    end.rotateY(Math.PI / 2); end.translate(-(w - inset * 2) / 2, 0, 0);
    const em = new T.Mesh(end, endMat); em.castShadow = em.receiveShadow = true; g.add(em);
    g.position.set(x, y, z); g.rotation.y = ry;
    parent.add(g);
    return g;
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
      { geo: new T.ConeGeometry(0.34, 0.55, 8), matrix: M4(0, 0.5, 0), color: 0x2f7a40 },
      { geo: new T.ConeGeometry(0.27, 0.48, 8), matrix: M4(0, 0.78, 0), color: 0x378a48 },
      { geo: new T.ConeGeometry(0.19, 0.42, 8), matrix: M4(0, 1.04, 0), color: 0x41994f },
      { geo: new T.ConeGeometry(0.1, 0.3, 7), matrix: M4(0, 1.27, 0), color: 0x4fa85a },
    ]);
    const blob = new T.IcosahedronGeometry(0.22, 1);
    const oak = merge([
      { geo: new T.CylinderGeometry(0.05, 0.08, 0.6, 6), matrix: M4(0, 0.3, 0), color: 0x5a3b22 },
      { geo: blob, matrix: M4(0, 0.78, 0, 1.45), color: 0x4f9a3a },
      { geo: blob, matrix: M4(-0.2, 0.68, 0.08, 1.05), color: 0x5aab42 },
      { geo: blob, matrix: M4(0.2, 0.7, -0.06, 1.1), color: 0x468e36 },
      { geo: blob, matrix: M4(0.04, 1.02, 0.05, 1.0), color: 0x6cba4e },
      { geo: blob, matrix: M4(-0.08, 0.66, -0.2, 0.95), color: 0x52a03e },
    ]);
    const birch = merge([
      { geo: new T.CylinderGeometry(0.03, 0.045, 0.75, 6), matrix: M4(0, 0.37, 0), color: 0xe8e2d4 },
      { geo: blob, matrix: M4(0, 0.86, 0, 0.95, 1.25), color: 0x92c24a },
      { geo: blob, matrix: M4(-0.1, 0.72, 0.05, 0.8), color: 0xa6d05a },
      { geo: blob, matrix: M4(0.1, 1.0, -0.04, 0.7), color: 0xb6dc68 },
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
