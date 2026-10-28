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
    t.magFilter = T.NearestFilter;                 // hard texels: pixel art
    t.minFilter = T.NearestMipmapNearestFilter;
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
  // Hand-pixelled 16×16 tiles (32×32 for grass): about one texel per
  // screen pixel at the normal zoom, with highlight and shadow rows like
  // classic isometric pixel art.
  const P = (g, x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  function speckle(g, s, cols, n, seed) { for (let i = 0; i < n; i++) P(g, Math.floor(rnd(i, 1, seed) * s), Math.floor(rnd(i, 2, seed) * s), cols[i % cols.length]); }
  // horizontal courses: [highlight, mid, mid, shadow] repeated every 4 px
  function courses(g, s, [hi, mid, lo], seed, joints = 0) {
    for (let y = 0; y < s; y++) P(g, 0, y, y % 4 === 0 ? hi : y % 4 === 3 ? lo : mid, s, 1);
    if (joints) for (let r = 0; r < s / 4; r++) for (let x = (r % 2) * joints / 2; x < s; x += joints) P(g, x, r * 4, lo, 1, 3);
    speckle(g, s, [hi, lo], s / 2, seed);
  }
  const TEX = {
    ground: () => canvasTex('ground', 32, (g, s) => {
      P(g, 0, 0, '#e6e6e6', s, s);
      speckle(g, s, ['#f6f6f6', '#d2d2d2', '#ffffff', '#c4c4c4'], 150, 1);
      for (let i = 0; i < 18; i++) { const x = Math.floor(rnd(i, 3, 2) * s), y = Math.floor(rnd(i, 4, 2) * s); P(g, x, y, '#b4b4b4'); P(g, x + 1, y - 1, '#c8c8c8'); P(g, x - 1, y - 1, '#d0d0d0'); }
    }),
    dirt: () => canvasTex('dirt', 16, (g, s) => { P(g, 0, 0, '#d8bc8a', s, s); speckle(g, s, ['#b89a6a', '#ead2a2', '#c6a674'], 34, 3); }),
    cobble: () => canvasTex('cobble', 16, (g, s) => {
      P(g, 0, 0, '#9a9080', s, s);
      for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
        const x = k * 8 + (r % 2) * 4 + 1, y = r * 4 + 1;
        P(g, x, y, '#d6ccb8', 6, 2); P(g, x, y, '#ece4d4', 6, 1); P(g, x + 5, y, '#b8ad98', 1, 3); P(g, x, y + 2, '#b8ad98', 6, 1);
      }
    }),
    logs: () => canvasTex('logs', 16, (g, s) => { courses(g, s, ['#cf9a60', '#a87040', '#5e3c20'], 5); for (let i = 0; i < 3; i++) P(g, 3 + i * 5, 1 + i * 4, '#7a5030', 2, 2); }),
    planks: () => canvasTex('planks', 16, (g, s) => courses(g, s, ['#e6bc84', '#c8965c', '#8a5e34'], 11, 0)),
    plaster: () => canvasTex('plaster', 16, (g, s) => { P(g, 0, 0, '#f2e8d2', s, s); speckle(g, s, ['#e2d6bc', '#fbf5e8'], 16, 21); }),
    stone: () => canvasTex('stone', 16, (g, s) => courses(g, s, ['#ece6da', '#d6cebe', '#9e9686'], 22, 8)),
    darkstone: () => canvasTex('darkstone', 16, (g, s) => courses(g, s, ['#a8a29a', '#8a847c', '#5e5952'], 23, 8)),
    thatch: () => canvasTex('thatch', 16, (g, s) => { courses(g, s, ['#f0cc74', '#d8ac54', '#a07a32'], 31); for (let x = 0; x < s; x += 3) P(g, x, (x * 7) % 4 + 1, '#c09440', 1, 2); }),
    tiles: () => canvasTex('tiles', 16, (g, s) => courses(g, s, ['#ee9070', '#d0644a', '#8e3424'], 41, 4)),
    slate: () => canvasTex('slate', 16, (g, s) => courses(g, s, ['#9cb2cc', '#6c86a6', '#42546e'], 42, 4)),
    darkroof: () => canvasTex('darkroof', 16, (g, s) => courses(g, s, ['#aa8268', '#86624c', '#523828'], 43, 4)),
    field: () => canvasTex('field', 16, (g, s) => {
      for (let y = 0; y < s; y++) P(g, 0, y, y % 4 < 2 ? '#a87a4a' : '#7e5634', s, 1);
      for (let x = 1; x < s; x += 3) { P(g, x, 1, '#7ab448'); P(g, x + 1, 9, '#6aa040'); }
    }),
    water: () => canvasTex('water', 16, (g, s) => {
      P(g, 0, 0, '#cfe2fa', s, s);
      for (let i = 0; i < 6; i++) { const x = Math.floor(rnd(i, 1, 52) * s), y = Math.floor(rnd(i, 2, 52) * s); P(g, x, y, '#ffffff', 3, 1); P(g, x + 3, y + 1, '#ffffff'); }
      speckle(g, s, ['#b4cdee'], 10, 53);
    }),
    cloth: (col) => canvasTex('cloth' + col, 16, (g, s) => {
      P(g, 0, 0, typeof col === 'number' ? '#' + col.toString(16).padStart(6, '0') : col, s, s);
      for (let x = 0; x < s; x += 8) P(g, x, 0, '#f4f0e6', 4, s);
    }),
    mist: () => canvasTex('mist', 128, (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }, false),
  };

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

  // ---------- pixel-art renderer ----------
  // Draws a scene at a fraction of the screen resolution, then blows it
  // up with hard pixels: dark outlines where depth jumps or folds, and
  // colours snapped to a limited palette with an ordered dither.
  function pixelator(renderer, opts = {}) {
    const px = opts.pixel || 2;
    let rt = null, w = 0, h = 0;
    const mat = new T.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, res: { value: new T.Vector2(1, 1) },
        near: { value: 0.1 }, far: { value: 100 }, ortho: { value: 1 }, thr: { value: 0.05 },
        outline: { value: opts.outline ?? 0.5 }, levels: { value: opts.levels || 22 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res;
        uniform float near, far, ortho, thr, outline, levels;
        varying vec2 vUv;
        float lin(float d) {
          if (ortho > 0.5) return near + d * (far - near);
          float z = d * 2.0 - 1.0;
          return 2.0 * near * far / (far + near - z * (far - near));
        }
        float D(vec2 p, vec2 o) { return lin(texture2D(tDepth, p + o / res).x); }
        const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        void main() {
          vec2 cell = floor(vUv * res);
          vec2 p = (cell + 0.5) / res;
          vec3 c = texture2D(tColor, p).rgb;
          float d = D(p, vec2(0.0)), l = D(p, vec2(-1.0, 0.0)), r = D(p, vec2(1.0, 0.0)), u = D(p, vec2(0.0, 1.0)), dn = D(p, vec2(0.0, -1.0));
          float t = ortho > 0.5 ? thr : thr * d;
          float edge = 0.0;
          if (max(max(l - d, r - d), max(u - d, dn - d)) > t * 4.0) edge = 1.0;           // silhouette
          else if (max(abs(l + r - 2.0 * d), abs(u + dn - 2.0 * d)) > t) edge = 0.55;      // fold or crease
          c *= 1.0 - edge * outline;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          int i = int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4;
          gl_FragColor.rgb = floor(gl_FragColor.rgb * levels + (B[i] + 0.5) / 16.0) / levels;
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const qs = new T.Scene(); qs.add(quad);
    const qc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      pixel: px,
      size: () => [w, h],
      setSize(W, H) {
        const nw = Math.max(1, Math.ceil(W / px)), nh = Math.max(1, Math.ceil(H / px));
        if (nw === w && nh === h && rt) return;
        w = nw; h = nh;
        if (rt) { rt.depthTexture.dispose(); rt.dispose(); }
        rt = new T.WebGLRenderTarget(w, h, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
        rt.depthTexture = new T.DepthTexture(w, h);
        rt.depthTexture.type = T.UnsignedIntType;
        mat.uniforms.tColor.value = rt.texture; mat.uniforms.tDepth.value = rt.depthTexture;
        mat.uniforms.res.value.set(w, h);
      },
      // thr: for an orthographic camera, world units of depth that count as a fold;
      // for a perspective one, a fraction of the distance
      render(scene, camera, thr) {
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        const U = mat.uniforms;
        U.near.value = camera.near; U.far.value = camera.far; U.ortho.value = camera.isOrthographicCamera ? 1 : 0; U.thr.value = thr;
        renderer.render(qs, qc);
      },
    };
  }

  return { pixelator, TEX, M, mat, boxGeo, gableGeo, roof, pyramidGeo, merge, bake, add, block, swayMaterial, trees, person, windUniform };
})();
