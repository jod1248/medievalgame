// ============================================================
//  3D town renderer (Three.js). Perspective camera that pans,
//  rotates and zooms; real-time shadows; day/night; fog banks
//  at the edge of the world.
//  World units: 1 tile = 1 unit. Tile (tx, ty) -> (x = tx, z = ty).
// ============================================================

const Render = (() => {
  const T = THREE;
  const MARGIN = 26;                       // terrain beyond the map that fades into fog
  let renderer, scene, camera, canvas, W = 1, H = 1;
  let sun, moon, hemi;
  const pointLights = [];
  let time = 0;
  const api = { terrainDirty: true, hover: null, ghost: null, pulse: null, selected: null };

  // camera: orthographic, looking in from the south-east corner like an
  // isometric pixel-art game. `dist` sets the zoom. It can swing 15°
  // either side of the corner view and tilt from near level to near
  // straight down.
  const YAW0 = Math.PI / 4, YAW_LIMIT = 0.26, PITCH_MIN = 0.16, PITCH_MAX = 1.5;
  const CAM_BACK = 160;                   // how far back the ortho camera sits
  const cam = { x: 22, z: 21, yaw: YAW0, pitch: 0.6, dist: 24 };
  let pix = null;
  const want = { ...cam };

  // scene parts
  let worldGroup, groundMesh, waterMesh, wallGroup, buildingRoot, decoGroup, treeGroup;
  const bModels = new Map();               // building id -> { group, key }
  let lightSources = [];
  let people, smoke, sparks, fireflies, clouds = [], birds = [], mists = [];
  let ring, pulseRing, ghostGroup = null, ghostKey = '';
  const raycaster = new T.Raycaster();
  let walkers = [];
  const expTargets = {};

  // ---------- day / night ----------
  function dayPhase() { return G ? (G.time + 0.3) % 1 : 0.4; }
  function daylight() {
    const p = dayPhase();
    if (p >= 0.3 && p <= 0.75) return 1;
    if (p > 0.22 && p < 0.3) return (p - 0.22) / 0.08;
    if (p > 0.75 && p < 0.83) return 1 - (p - 0.75) / 0.08;
    return 0;
  }

  // ---------- terrain ----------
  function edgeDist(x, z) {
    const dx = Math.max(0, -x, x - MAP_W), dz = Math.max(0, -z, z - MAP_H);
    return Math.hypot(dx, dz);
  }
  function waterAt(x, z) {
    let n = 0;
    for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) if (tileAt(Math.floor(x + ox), Math.floor(z + oz)) === T_WATER) n++;
    return n / 4;
  }
  function heightAt(x, z) {
    const e = edgeDist(x, z);
    let h = 0;
    if (e > 0) h = Math.pow(Math.min(1, e / 12), 1.4) * (1.5 + smoothNoise(x + 200, z + 200, 7, 91) * 6);
    return h - waterAt(x, z) * 0.45;
  }
  const FOG_COL = new T.Color('#cfe2ee');
  const GC = { water: new T.Color('#7a8a5a'), sand: new T.Color('#e6cf94'), forest: new T.Color('#5a8a38'), forest2: new T.Color('#6e9a40'),
    grass: new T.Color('#78a646'), grass2: new T.Color('#98b856'), hill: new T.Color('#6a9444') };
  function groundColor(x, z, out) {
    const t = tileAt(Math.floor(x), Math.floor(z));
    const n = smoothNoise(x, z, 7, 21), n2 = smoothNoise(x, z, 3, 22);
    const c = new T.Color();
    if (t === T_WATER || waterAt(x, z) > 0) c.copy(GC.water);
    else if (t === T_SAND) c.copy(GC.sand);
    else if (t === T_FOREST) c.copy(GC.forest).lerp(GC.forest2, n);
    else c.copy(GC.grass).lerp(GC.grass2, n * 0.7 + n2 * 0.15);
    const e = edgeDist(x, z);
    if (e > 0) {   // hills outside the realm, dissolving into the fog
      c.lerp(GC.hill, Math.min(1, e / 6) * 0.5);
      c.lerp(FOG_COL, Math.min(1, Math.pow(e / 20, 1.3)));
    }
    out.copy(c);
  }

  function buildGround() {
    if (groundMesh) { worldGroup.remove(groundMesh); groundMesh.geometry.dispose(); }
    const size = MAP_W + MARGIN * 2, seg = Math.round(size * 1.5);
    const geo = new T.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(MAP_W / 2, 0, MAP_H / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
      groundColor(x, z, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const tex = GFX.TEX.ground();
    tex.repeat.set(size / 2, size / 2);
    const m = new T.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 });
    groundMesh = new T.Mesh(geo, m);
    groundMesh.receiveShadow = true;
    worldGroup.add(groundMesh);
  }

  // Roads, plaza, water surface and ground clutter
  function buildSurfaces() {
    if (decoGroup) { worldGroup.remove(decoGroup); decoGroup.traverse(o => o.geometry && o.geometry.dispose()); }
    decoGroup = new T.Group();
    const roadQ = [], plazaQ = [], waterQ = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      if (t === T_ROAD) roadQ.push([x, y]);
      else if (t === T_PLAZA) plazaQ.push([x, y]);
      else if (t === T_WATER) waterQ.push([x, y]);
    }
    const quads = (list, y, pad = 0) => GFX.merge(list.map(([x, z]) => {
      const g = new T.PlaneGeometry(1 + pad, 1 + pad); g.rotateX(-Math.PI / 2);
      return { geo: g, matrix: new T.Matrix4().makeTranslation(x + 0.5, y, z + 0.5) };
    }));
    const roadMat = GFX.mat('roadsurf', { map: GFX.TEX.dirt(), polygonOffset: true, polygonOffsetFactor: -2 });
    const road = new T.Mesh(quads(roadQ, 0.012, 0.06), roadMat); road.receiveShadow = true; decoGroup.add(road);
    const plaza = new T.Mesh(quads(plazaQ, 0.03), GFX.M.cobble()); plaza.receiveShadow = true; decoGroup.add(plaza);
    const curb = new T.Group();
    for (const [x, z] of plazaQ) for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (tileAt(x + dx, z + dz) === T_PLAZA) continue;
      const along = dz !== 0;
      GFX.block(curb, along ? 1 : 0.08, 0.06, along ? 0.08 : 1, GFX.M.stone(), x + 0.5 + dx * 0.5, 0, z + 0.5 + dz * 0.5);
    }
    decoGroup.add(GFX.bake(curb));
    if (waterMesh) worldGroup.remove(waterMesh);
    const wtex = GFX.TEX.water(); wtex.repeat.set(4, 4);
    waterMesh = new T.Mesh(quads(waterQ, -0.12, 0.1), new T.MeshStandardMaterial({ color: 0x4f9fd8, map: wtex, transparent: true, opacity: 0.88, roughness: 0.1, metalness: 0.1 }));
    worldGroup.add(waterMesh);

    // grass tufts, flowers, rocks (instanced)
    const tufts = [], flowers = [], rocks = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      if ((t !== T_GRASS && t !== T_FOREST) || buildingAt(x, y)) continue;
      for (let k = 0; k < 3; k++) tufts.push([x + hash2(x, y, 60 + k), y + hash2(x, y, 70 + k), 0.7 + hash2(x, y, 80 + k) * 0.6]);
      if (t === T_GRASS && hash2(x, y, 7) > 0.84) {
        const fc = [0xf2e36b, 0xf7f2e8, 0xd97ab0, 0x8fb6ec][Math.floor(hash2(x, y, 8) * 4)];
        for (let k = 0; k < 5; k++) flowers.push([x + 0.3 + hash2(x, y, 120 + k) * 0.4, y + 0.3 + hash2(x, y, 140 + k) * 0.4, fc]);
      }
      if (hash2(x, y, 9) > 0.92) rocks.push([x + hash2(x, y, 10), y + hash2(x, y, 11), 0.5 + hash2(x, y, 12)]);
    }
    const tuftGeo = GFX.merge([0, 1, 2].map(k => ({
      geo: new T.ConeGeometry(0.012, 0.1 + k * 0.02, 3),
      matrix: new T.Matrix4().compose(new T.Vector3((k - 1) * 0.02, 0.05 + k * 0.01, (k % 2) * 0.015), new T.Quaternion().setFromEuler(new T.Euler((k - 1) * 0.3, 0, (k - 1) * 0.35)), new T.Vector3(1, 1, 1)),
      color: [0x5f9e3a, 0x7cb84a, 0x9ccc5a][k],
    })));
    decoGroup.add(instanced(tuftGeo, GFX.swayMaterial('tuft', { flatShading: false }), tufts.map(([x, z, s]) => [x, 0, z, s, hash2(x * 7, z * 7, 1) * 6]), false));
    const fl = instanced(new T.SphereGeometry(0.02, 5, 4), new T.MeshStandardMaterial({ roughness: 0.8 }), flowers.map(([x, z]) => [x, 0.05, z, 1, 0]), false);
    flowers.forEach(([, , c], i) => fl.setColorAt(i, new T.Color(c)));
    decoGroup.add(fl);
    decoGroup.add(instanced(new T.DodecahedronGeometry(0.06, 0), GFX.mat('rocks', { color: 0x9a958b, flatShading: true }), rocks.map(([x, z, s]) => [x, 0.02, z, s, s * 9]), true));
    worldGroup.add(decoGroup);
  }
  // [x, y, z, scale, rotY] list -> InstancedMesh
  function instanced(geo, material, list, shadow) {
    const im = new T.InstancedMesh(geo, material, Math.max(1, list.length));
    const m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), s = new T.Vector3(), e = new T.Euler();
    list.forEach(([x, y, z, sc, ry], i) => { q.setFromEuler(e.set(0, ry || 0, 0)); im.setMatrixAt(i, m4.compose(v.set(x, y, z), q, s.set(sc, sc, sc))); });
    if (!list.length) im.count = 0;
    im.castShadow = shadow; im.receiveShadow = true;
    return im;
  }

  // ---------- command square props: fountain, lamps, cart, banners ----------
  let propGroup = null;
  function buildProps() {
    if (propGroup) { worldGroup.remove(propGroup); disposeGroup(propGroup); propGroup = null; }
    const T3 = THREE, g = new T3.Group();
    const M = GFX.M;
    const [fx, fz] = PLAZA_MID;
    // fountain: stone basin, rippling pool, two-tier column with falling water
    GFX.add(g, new T3.CylinderGeometry(0.62, 0.68, 0.2, 24), M.stone(), fx, 0.1, fz);
    GFX.add(g, new T3.CylinderGeometry(0.66, 0.66, 0.04, 24), M.darkstone(), fx, 0.21, fz);
    const pool = GFX.add(g, new T3.CylinderGeometry(0.55, 0.55, 0.02, 24), GFX.mat('fountainwater', { color: 0x5aa8d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }), fx, 0.19, fz, { dynamic: true, noShadow: true });
    GFX.add(g, new T3.CylinderGeometry(0.07, 0.1, 0.42, 10), M.stone(), fx, 0.4, fz);
    GFX.add(g, new T3.CylinderGeometry(0.24, 0.14, 0.07, 16), M.stone(), fx, 0.62, fz);
    GFX.add(g, new T3.CylinderGeometry(0.03, 0.05, 0.16, 8), M.stone(), fx, 0.72, fz);
    GFX.add(g, new T3.SphereGeometry(0.05, 10, 8), M.gold(), fx, 0.83, fz);
    const water = GFX.mat('fountainfall', { color: 0xbfe3ff, roughness: 0.05, transparent: true, opacity: 0.55 });
    const fall = GFX.add(g, new T3.CylinderGeometry(0.2, 0.32, 0.4, 16, 1, true), water, fx, 0.42, fz, { dynamic: true, noShadow: true });
    Models.anim(g, t => {
      pool.scale.set(1 + Math.sin(t * 3) * 0.01, 1, 1 + Math.cos(t * 3) * 0.01);
      fall.scale.set(1 + Math.sin(t * 9) * 0.04, 1, 1 + Math.sin(t * 9) * 0.04);
      fall.material.opacity = 0.45 + Math.sin(t * 7) * 0.08;
    });
    // lamp posts at the corners of the fountain court
    for (const [x, z] of [[fx - 1.1, fz - 1.1], [fx + 1.1, fz - 1.1], [fx - 1.1, fz + 1.1], [fx + 1.1, fz + 1.1]]) {
      GFX.add(g, new T3.CylinderGeometry(0.03, 0.04, 0.72, 8), M.iron(), x, 0.36, z);
      GFX.add(g, new T3.BoxGeometry(0.1, 0.12, 0.1), M.window(), x, 0.78, z, { noShadow: true });
      GFX.add(g, GFX.pyramidGeo(0.15, 0.15, 0.08), M.iron(), x, 0.84, z);
      (g.userData.lights = g.userData.lights || []).push({ x, y: 0.78, z, color: 0xffc06a });
    }
    // benches, flower tubs, a cart by the lane, banners at the entrance
    for (const [x, z, r] of [[fx, fz - 1.25, 0], [fx, fz + 1.25, 0], [fx - 1.25, fz, Math.PI / 2], [fx + 1.25, fz, Math.PI / 2]]) {
      const b = new T3.Group();
      GFX.block(b, 0.4, 0.03, 0.12, M.planks(), 0, 0.1, 0);
      for (const dx of [-0.16, 0.16]) GFX.block(b, 0.03, 0.1, 0.1, M.darkwood(), dx, 0, 0);
      b.position.set(x, 0, z); b.rotation.y = r; g.add(b);
    }
    for (const [x, z] of [[PLAZA.x0 + 0.25, fz - 0.6], [PLAZA.x0 + 0.25, fz + 0.6]]) {
      GFX.add(g, new T3.CylinderGeometry(0.13, 0.11, 0.14, 12), M.planks(), x, 0.07, z);
      for (let k = 0; k < 5; k++) GFX.add(g, new T3.SphereGeometry(0.045, 6, 5), M.color([0xe85d75, 0xf2d14b, 0xffffff, 0xc77dde, 0xf28a3a][k]), x + Math.cos(k * 1.3) * 0.06, 0.17, z + Math.sin(k * 1.3) * 0.06);
      GFX.add(g, new T3.SphereGeometry(0.09, 8, 6), M.color(0x4f9a3a), x, 0.15, z);
    }
    const cart = new T3.Group();
    GFX.block(cart, 0.5, 0.14, 0.3, M.planks(), 0, 0.12, 0);
    for (const dz of [-0.17, 0.17]) GFX.add(cart, new T3.CylinderGeometry(0.11, 0.11, 0.03, 12), M.darkwood(), 0, 0.11, dz, { rx: Math.PI / 2 });
    GFX.add(cart, GFX.boxGeo(0.5, 0.02, 0.02), M.wood(), -0.45, 0.12, 0.08); GFX.add(cart, GFX.boxGeo(0.5, 0.02, 0.02), M.wood(), -0.45, 0.12, -0.08);
    for (let k = 0; k < 3; k++) GFX.add(cart, new T3.CylinderGeometry(0.05, 0.05, 0.14, 8), M.thatch(), -0.1 + k * 0.1, 0.33, 0, { rz: Math.PI / 2 });
    cart.position.set(PLAZA.x1 + 0.9, 0, PLAZA.y0 + 1.4); cart.rotation.y = -0.3; g.add(cart);
    Models.crate(g, PLAZA.x1 + 0.7, fz + 0.6, 0.16); Models.crate(g, PLAZA.x1 + 0.75, fz + 0.85, 0.12); Models.barrel(g, PLAZA.x1 + 0.6, fz + 1.2);
    Models.flag(g, PLAZA.x0 + 0.1, 0, fz - 1.05, 0x2c4f8a, 0.8);
    Models.flag(g, PLAZA.x0 + 0.1, 0, fz + 0.95, 0xb5462e, 0.8);
    const anims = g.userData.anim || [], lights = g.userData.lights || [];
    propGroup = GFX.bake(g);
    propGroup.userData = { anim: anims, lights };
    worldGroup.add(propGroup);
  }

  // ---------- trees: instanced per species, also out into the misty hills ----------
  function buildTrees() {
    if (treeGroup) { worldGroup.remove(treeGroup); treeGroup.children.forEach(c => c.dispose && c.dispose()); }
    treeGroup = new T.Group();
    const geos = GFX.trees();
    const lists = { pine: [], oak: [], birch: [], bush: [] };
    const kinds = ['pine', 'pine', 'oak', 'oak', 'birch'];
    for (let y = -MARGIN + 2; y < MAP_H + MARGIN - 2; y++) for (let x = -MARGIN + 2; x < MAP_W + MARGIN - 2; x++) {
      const inside = x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
      let dense;
      if (inside) { if (tileAt(x, y) !== T_FOREST || buildingAt(x, y)) continue; dense = 2; }
      else {
        const e = edgeDist(x + 0.5, y + 0.5);
        if (e > 18) continue;
        const n = smoothNoise(x + 300, y + 300, 5, 33);
        if (hash2(x, y, 13) > 0.25 + n * 0.6) continue;
        dense = 1 + (n > 0.5 ? 1 : 0);
      }
      for (let k = 0; k < dense; k++) {
        const tx = x + 0.15 + hash2(x, y, 20 + k) * 0.7, tz = y + 0.15 + hash2(x, y, 30 + k) * 0.7;
        const kind = kinds[Math.floor(hash2(x, y, 40 + k) * kinds.length)];
        lists[kind].push([tx, heightAt(tx, tz), tz, 0.75 + hash2(x, y, 50 + k) * 0.55, hash2(x, y, 55 + k) * 6]);
      }
      if (inside && hash2(x, y, 90) > 0.7) lists.bush.push([x + hash2(x, y, 91), 0, y + hash2(x, y, 92), 0.8 + hash2(x, y, 93) * 0.5, 0]);
    }
    for (const kind in lists) {
      const im = instanced(geos[kind], GFX.swayMaterial('tree'), lists[kind], true);
      const c = new T.Color();
      lists[kind].forEach((_, i) => { const v = 0.82 + hash2(i, kind.length, 3) * 0.32; im.setColorAt(i, c.setRGB(v, v * (0.95 + hash2(i, 2, 3) * 0.1), v)); });
      treeGroup.add(im);
    }
    worldGroup.add(treeGroup);
  }

  // ---------- walls ----------
  function buildWalls() {
    if (wallGroup) { worldGroup.remove(wallGroup); wallGroup.traverse(o => o.geometry && o.geometry.dispose()); }
    const raw = new T.Group();
    const isRoad = (x, y) => tileAt(x, y) === T_ROAD;
    const stone = has('stoneWalls'), tall = has('palisade');
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (!inTerritory(x, y)) continue;
      for (const [dx, dy, side] of [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || inTerritory(nx, ny)) continue;
        Models.wallPiece(raw, { x, y, side, gate: isRoad(x, y) && isRoad(nx, ny) }, stone, tall);
      }
    }
    const R = G.territory, [cx, cy] = TOWN_CENTER;
    for (const [vx, vy] of [[cx - R, cy - R], [cx + R + 1, cy - R], [cx - R, cy + R + 1], [cx + R + 1, cy + R + 1]]) {
      if (vx < 0 || vy < 0 || vx > MAP_W || vy > MAP_H) continue;
      Models.wallPiece(raw, { tower: true, vx, vy }, stone, tall);
    }
    const anims = raw.userData.anim || [], lights = raw.userData.lights || [];
    wallGroup = GFX.bake(raw);
    wallGroup.userData = { anim: anims, lights };
    worldGroup.add(wallGroup);
  }

  // ---------- buildings ----------
  function modelKey(b) {
    return [b.type, b.level, b.built < 1 ? 'c' : 'b', b.ore || ''].join('|');
  }
  function syncBuildings() {
    const alive = new Set();
    for (const b of G.buildings) {
      alive.add(b.id);
      const key = modelKey(b);
      let rec = bModels.get(b.id);
      if (!rec || rec.key !== key) {
        const wasScaffold = rec && rec.key.split('|')[2] === 'c';
        if (rec) { buildingRoot.remove(rec.group); disposeGroup(rec.group); }
        const raw = Models.build(b);
        const ud = { anim: raw.userData.anim || [], lights: raw.userData.lights || [], smoke: raw.userData.smoke || [], sparks: raw.userData.sparks, grow: raw.userData.grow };
        const group = GFX.bake(raw);
        group.position.set(b.x, 0, b.y);
        group.userData = ud;
        group.traverse(o => { o.userData.bid = b.id; });
        buildingRoot.add(group);
        rec = { group, key, born: wasScaffold || (rec && b.level > 1) ? time : -9 };
        bModels.set(b.id, rec);
        api.lightsDirty = true;
      }
    }
    for (const [id, rec] of bModels) if (!alive.has(id)) { buildingRoot.remove(rec.group); disposeGroup(rec.group); bModels.delete(id); api.lightsDirty = true; }
  }
  function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  function animateBuildings(dt) {
    for (const b of G.buildings) {
      const rec = bModels.get(b.id);
      if (!rec) continue;
      const g = rec.group, ud = g.userData;
      if (ud.grow) ud.grow.scale.y = Math.max(0.05, b.built * 0.55);
      for (const fn of ud.anim) fn(time, b.active !== false);
      const age = time - rec.born;       // bounce when a building finishes
      if (age < 0.7) { const k = 1 + Math.sin(age / 0.7 * Math.PI) * 0.14 * (1 - age / 0.7); g.scale.set(1, k, 1); } else if (g.scale.y !== 1) g.scale.set(1, 1, 1);
      const working = b.built >= 1 && (BUILDINGS[b.type].unique || b.type === 'house' || b.active);
      if (working) for (const s of ud.smoke) if (Math.random() < s.rate * dt * 6) emitSmoke(b.x + s.x, s.y, b.y + s.z, s.dark);
      if (ud.sparks && Math.random() < dt * 8) emitSpark(b.x + ud.sparks.x, ud.sparks.y, b.y + ud.sparks.z);
    }
    if (wallGroup) for (const fn of wallGroup.userData.anim) fn(time, true);
    if (propGroup) for (const fn of propGroup.userData.anim) fn(time, true);
  }

  // ---------- people (instanced) ----------
  const MAX_PEOPLE = 520, MAX_CARTS = 40;
  function makePeople() {
    const p = GFX.person();
    const body = new T.InstancedMesh(p.body, new T.MeshStandardMaterial({ roughness: 0.9 }), MAX_PEOPLE);
    const head = new T.InstancedMesh(p.head, GFX.mat('skin', { color: 0xf0c9a0 }), MAX_PEOPLE);
    const legs = new T.InstancedMesh(p.leg, GFX.mat('legs', { color: 0x3a2a1e }), MAX_PEOPLE * 2);
    const tool = new T.InstancedMesh(new T.BoxGeometry(0.012, 0.22, 0.012).translate(0, 0.11, 0), GFX.M.iron(), MAX_PEOPLE);
    const load = new T.InstancedMesh(GFX.merge([
      { geo: new T.SphereGeometry(0.055, 8, 6), matrix: new T.Matrix4().compose(new T.Vector3(-0.02, 0, 0), new T.Quaternion(), new T.Vector3(1, 0.8, 1.1)), color: 0xffffff },
      { geo: new T.BoxGeometry(0.012, 0.012, 0.12), matrix: new T.Matrix4().makeTranslation(-0.02, 0.04, 0), color: 0x5a3a20 },
    ]), new T.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }), MAX_PEOPLE);
    // handcart, pulled from the front (+z)
    const cartGeo = GFX.merge([
      { geo: new T.BoxGeometry(0.16, 0.06, 0.2), matrix: new T.Matrix4().makeTranslation(0, 0.1, 0), color: 0x9a6a3a },
      { geo: new T.BoxGeometry(0.13, 0.08, 0.16), matrix: new T.Matrix4().makeTranslation(0, 0.16, -0.01), color: 0xd8c8a0 },
      { geo: new T.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2), matrix: new T.Matrix4().makeTranslation(0.09, 0.06, 0), color: 0x4a3020 },
      { geo: new T.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2), matrix: new T.Matrix4().makeTranslation(-0.09, 0.06, 0), color: 0x4a3020 },
      { geo: new T.BoxGeometry(0.012, 0.012, 0.2), matrix: new T.Matrix4().makeTranslation(0.05, 0.13, 0.18), color: 0x6b4a2a },
      { geo: new T.BoxGeometry(0.012, 0.012, 0.2), matrix: new T.Matrix4().makeTranslation(-0.05, 0.13, 0.18), color: 0x6b4a2a },
    ]);
    const cart = new T.InstancedMesh(cartGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), MAX_CARTS);
    for (const m of [body, head, legs, tool, load, cart]) { m.castShadow = true; m.frustumCulled = false; worldGroup.add(m); }
    body.setColorAt(0, new T.Color()); load.setColorAt(0, new T.Color());
    cart.count = 0;
    people = { body, head, legs, tool, load, cart, n: 0 };
  }
  const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3(), _e = new T.Euler(), _c = new T.Color();
  const ZERO = new T.Matrix4().makeScale(0, 0, 0);
  function putPerson(x, z, rot, phase, moving, color, opts = {}) {
    const P = people;
    if (P.n >= MAX_PEOPLE) return;
    const i = P.n++;
    const y = heightAt(x, z) + (moving ? Math.abs(Math.sin(phase)) * 0.012 : 0);
    const sc = opts.scale || 1;
    _q.setFromEuler(_e.set(0, rot, 0));
    _m4.compose(_v.set(x, y, z), _q, _s.set(sc, sc, sc));
    P.body.setMatrixAt(i, _m4);
    P.head.setMatrixAt(i, _m4);
    P.body.setColorAt(i, _c.set(color));
    for (let k = 0; k < 2; k++) {
      const swing = moving ? Math.sin(phase + k * Math.PI) * 0.5 : 0;
      const off = k ? 0.022 : -0.022;
      _q2.setFromEuler(_e.set(swing, rot, 0, 'YXZ'));
      P.legs.setMatrixAt(i * 2 + k, _m4.compose(_v.set(x + Math.cos(rot) * off * sc, y + 0.08 * sc, z - Math.sin(rot) * off * sc), _q2, _s.set(sc, sc, sc)));
    }
    if (opts.tool) {
      _q2.setFromEuler(_e.set(opts.toolAngle || 0.15, rot, 0, 'YXZ'));
      P.tool.setMatrixAt(i, _m4.compose(_v.set(x + Math.cos(rot) * 0.06, y + 0.1, z - Math.sin(rot) * 0.06), _q2, _s.set(1, opts.toolLen || 1, 1)));
    } else P.tool.setMatrixAt(i, ZERO);
    if (opts.load) {
      // bundle carried on the back
      P.load.setMatrixAt(i, _m4.compose(_v.set(x - Math.sin(rot) * 0.05, y + 0.2, z - Math.cos(rot) * 0.05), _q, _s.set(1, 1, 1)));
      P.load.setColorAt(i, _c.set(opts.load));
    } else P.load.setMatrixAt(i, ZERO);
  }
  function flushPeople() {
    const P = people;
    for (let i = P.n; i < MAX_PEOPLE; i++) { P.body.setMatrixAt(i, ZERO); P.head.setMatrixAt(i, ZERO); P.tool.setMatrixAt(i, ZERO); P.load.setMatrixAt(i, ZERO); P.legs.setMatrixAt(i * 2, ZERO); P.legs.setMatrixAt(i * 2 + 1, ZERO); }
    for (const m of [P.body, P.head, P.legs, P.tool, P.load]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    P.n = 0;
  }

  const CLOTHES = [0x8b5a2b, 0x6d7f3a, 0x3f5f8a, 0x8a3f3f, 0x7a6a5a, 0xa07a3a, 0x5a4a6a];
  function walkerTargets() {
    const t = [];
    for (const b of G.buildings) if (b.built >= 1) { const s = BUILDINGS[b.type].size; t.push([b.x + s + 0.15, b.y + s / 2]); }
    return t;
  }
  function updateWalkers(dt) {
    const want = Math.floor(Math.min(110, Math.floor(idleCitizens() / 3 + employedWorkers() / 6) + 8) * (0.3 + 0.7 * daylight()));
    const targets = walkerTargets();
    while (walkers.length < want && targets.length) {
      const s = targets[Math.floor(Math.random() * targets.length)];
      walkers.push({ x: s[0], y: s[1], tx: s[0], ty: s[1], c: CLOTHES[Math.floor(Math.random() * CLOTHES.length)], sp: 0.5 + Math.random() * 0.4, wait: Math.random() * 3, ph: Math.random() * 6, rot: 0 });
    }
    if (walkers.length > want) walkers.length = want;
    for (const w of walkers) {
      if (w.wait > 0) { w.wait -= dt; w.moving = false; continue; }
      const dx = w.tx - w.x, dy = w.ty - w.y;
      if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04) {
        const t = targets[Math.floor(Math.random() * targets.length)] || [w.x, w.y];
        w.tx = t[0]; w.ty = t[1]; w.wait = 1 + Math.random() * 4;
        continue;
      }
      w.moving = true; w.ph += dt * 12;
      const st = w.sp * dt;
      if (Math.abs(dx) >= 0.04) { w.x += Math.sign(dx) * Math.min(st, Math.abs(dx)); w.rot = dx > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { w.y += Math.sign(dy) * Math.min(st, Math.abs(dy)); w.rot = dy > 0 ? 0 : Math.PI; }
    }
  }

  // ---------- settlers arriving: they come in through a gate and walk to a house ----------
  let arrivals = [], lastPop = null;
  const GATES = [[[-3, 22.5], [10, 22.5]], [[17.5, -3], [17.5, 12]], [[17.5, MAP_H + 3], [17.5, 32]]];
  const LOADS = [0x8a5a32, 0xd8c8a0, 0x6a7a4a, 0xa0703e, 0xc9a04a];
  function spawnArrivals(n) {
    const homes = G.buildings.filter(b => b.type === 'house' && b.built >= 1);
    if (!homes.length) return;
    homes.sort((a, b) => b.id - a.id);                      // newest houses fill first
    let left = Math.min(n, 40);
    while (left > 0 && arrivals.length < 140) {
      const size = Math.min(left, 2 + Math.floor(Math.random() * 3));
      left -= size;
      const gate = GATES[Math.floor(Math.random() * GATES.length)];
      const home = homes[Math.floor(Math.pow(Math.random(), 2) * Math.min(homes.length, 8))];
      const door = [home.x + 0.36, home.y + 0.95];
      const path = [gate[0], gate[1], [TOWN_CENTER[0] - 2.5, 22.5], [17.5, door[1] > 22 ? door[1] + 0.3 : 22.5], [door[0], door[1] + 0.3], door]
        .filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.2);
      const cart = Math.random() < 0.35;
      for (let k = 0; k < size; k++) {
        const kid = k > 0 && Math.random() < 0.35;
        arrivals.push({
          path, seg: 0, x: path[0][0], y: path[0][1], rot: 0, ph: Math.random() * 6, delay: k * 0.55, kid,
          c: CLOTHES[Math.floor(Math.random() * CLOTHES.length)], load: kid ? null : LOADS[Math.floor(Math.random() * LOADS.length)],
          cart: cart && k === 0, sp: 0.75 + Math.random() * 0.15, home: home.id,
        });
      }
    }
  }
  function updateArrivals(dt) {
    if (lastPop === null) lastPop = G.pop;
    if (G.pop > lastPop) spawnArrivals(G.pop - lastPop);
    lastPop = G.pop;
    for (const a of arrivals) {
      if (a.delay > 0) { a.delay -= dt; continue; }
      const tgt = a.path[a.seg + 1];
      if (!tgt) { a.done = true; continue; }
      const dx = tgt[0] - a.x, dy = tgt[1] - a.y, d = Math.hypot(dx, dy), st = a.sp * dt;
      a.ph += dt * 11;
      if (d <= st) { a.x = tgt[0]; a.y = tgt[1]; a.seg++; continue; }
      a.x += dx / d * st; a.y += dy / d * st;
      a.rot = Math.atan2(dx, dy);
    }
    arrivals = arrivals.filter(a => !a.done && G.buildings.some(b => b.id === a.home));
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
    let x = TOWN_CENTER[0], y = TOWN_CENTER[1];
    while (x > 0.5 && y > 0.5 && x < MAP_W - 0.5 && y < MAP_H - 0.5) { x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5; }
    return [x, y];
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function drawPeople() {
    for (const w of walkers) putPerson(w.x, w.y, w.rot, w.ph, w.moving, w.c);
    let carts = 0;
    for (const a of arrivals) {
      if (a.delay > 0) continue;
      putPerson(a.x, a.y, a.rot, a.ph, true, a.c, { load: a.load, scale: a.kid ? 0.72 : 1 });
      if (a.cart && carts < MAX_CARTS) {
        // handcart pulled behind
        const bx = a.x - Math.sin(a.rot) * 0.32, bz = a.y - Math.cos(a.rot) * 0.32;
        _q.setFromEuler(_e.set(0, a.rot, 0));
        people.cart.setMatrixAt(carts++, _m4.compose(_v.set(bx, heightAt(bx, bz) + Math.abs(Math.sin(a.ph)) * 0.008, bz), _q, _s.set(1, 1, 1)));
      }
    }
    people.cart.count = carts; people.cart.instanceMatrix.needsUpdate = true;
    const home = [TOWN_CENTER[0] + 1, TOWN_CENTER[1]];
    for (const e of G.expeditions) {
      const p = 1 - e.t / e.total, tgt = expeditionTarget(e);
      let pos, load = null, working = false;
      if (p < 0.3) pos = lerp2(home, tgt, p / 0.3);
      else if (p < 0.7) { pos = tgt; working = true; }
      else { pos = lerp2(tgt, home, (p - 0.7) / 0.3); load = { wood: 0x7a4f2a, stone: 0x9a968e, food: 0xc9a04a, ore: 0x8a5a3a }[e.type]; }
      const dir = p < 0.3 ? Math.atan2(tgt[0] - home[0], tgt[1] - home[1]) : Math.atan2(home[0] - tgt[0], home[1] - tgt[1]);
      const n = Math.min(24, Math.ceil(e.people / 4));
      for (let i = 0; i < n; i++) {
        const ox = (hash2(i, 1, 3) - 0.5) * 1.6, oz = (hash2(i, 2, 3) - 0.5) * 1.6;
        putPerson(pos[0] + ox, pos[1] + oz, working ? hash2(i, 4, 4) * 6 : dir, time * 10 + i, !working, CLOTHES[i % CLOTHES.length],
          { load, tool: working, toolAngle: working ? Math.sin(time * 6 + i) * 0.9 : 0.15 });
      }
    }
    const bk = findBuilding('barracks');
    const bpos = [bk.x + 1, bk.y + 2.4];
    const armies = G.campaigns.map(c => {
      const kd = kingdomDef(c.target), edge = edgePoint(kd.angle), p = 1 - c.t / c.total;
      return { pos: c.phase === 'march' ? lerp2(bpos, edge, p) : lerp2(edge, bpos, p), to: c.phase === 'march' ? edge : bpos, n: unitCount(c.units), color: 0x2c4f8a };
    });
    const inc = G.raid.incoming;
    if (inc && inc.eta - G.time < 1.2) {
      const kd = kingdomDef(inc.from), edge = edgePoint(kd.angle);
      armies.push({ pos: lerp2(edge, TOWN_CENTER, Math.max(0, 1 - (inc.eta - G.time) / 1.2) * 0.6), to: TOWN_CENTER, n: unitCount(inc.units), color: new T.Color(kd.color).getHex() });
    }
    for (const a of armies) {
      const dir = Math.atan2(a.to[0] - a.pos[0], a.to[1] - a.pos[1]);
      const n = Math.min(120, a.n), cols = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols) - cols / 2, c = (i % cols) - cols / 2;
        const ox = Math.cos(dir) * c * 0.16 + Math.sin(dir) * r * 0.16, oz = -Math.sin(dir) * c * 0.16 + Math.cos(dir) * r * 0.16;
        putPerson(a.pos[0] + ox, a.pos[1] + oz, dir, time * 10 + i * 0.7, true, a.color, { tool: true, toolLen: 1.6, toolAngle: 0.25 });
      }
    }
    flushPeople();
  }

  // ---------- particles ----------
  const MAX_SMOKE = 320, MAX_SPARK = 140;
  const smokeParts = [], sparkParts = [];
  function makeParticles() {
    smoke = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, roughness: 1, depthWrite: false }), MAX_SMOKE);
    smoke.frustumCulled = false;
    smoke.setColorAt(0, new T.Color());
    sparks = new T.InstancedMesh(new T.BoxGeometry(0.015, 0.015, 0.015), GFX.M.torch(), MAX_SPARK);
    sparks.frustumCulled = false;
    worldGroup.add(smoke, sparks);
  }
  function emitSmoke(x, y, z, dark) {
    if (smokeParts.length >= MAX_SMOKE) smokeParts.shift();
    smokeParts.push({ x: x + (Math.random() - 0.5) * 0.05, y, z, vx: 0.08 + Math.random() * 0.06, vy: 0.25 + Math.random() * 0.15, life: 0, max: 3 + Math.random() * 2, dark });
  }
  function emitSpark(x, y, z) {
    if (sparkParts.length >= MAX_SPARK) sparkParts.shift();
    sparkParts.push({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.6, life: 0, max: 0.9 });
  }
  function updateParticles(dt) {
    let i = 0;
    for (const p of smokeParts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.995;
      const f = p.life / p.max, s = 0.05 + f * 0.25;
      smoke.setMatrixAt(i, _m4.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s * 0.85, s)));
      const l = p.dark ? 0.35 + f * 0.35 : 0.9 - f * 0.1;
      smoke.setColorAt(i, _c.setRGB(l, l, l));
      i++;
    }
    for (let k = smokeParts.length - 1; k >= 0; k--) if (smokeParts[k].life >= smokeParts[k].max) smokeParts.splice(k, 1);
    smoke.count = i;
    smoke.instanceMatrix.needsUpdate = true; if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
    i = 0;
    for (const p of sparkParts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 1.2 * dt;
      sparks.setMatrixAt(i++, _m4.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.setScalar(Math.max(0.01, 1 - p.life / p.max))));
    }
    for (let k = sparkParts.length - 1; k >= 0; k--) if (sparkParts[k].life >= sparkParts[k].max) sparkParts.splice(k, 1);
    sparks.count = i; sparks.instanceMatrix.needsUpdate = true;
  }

  // ---------- sky life: clouds, birds, mist banks, fireflies ----------
  function makeSky() {
    const cm = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const items = [];
      for (let k = 0; k < 6; k++) items.push({ geo: new T.IcosahedronGeometry(1, 1), matrix: new T.Matrix4().compose(new T.Vector3((k - 2.5) * 1.1, Math.sin(k) * 0.4, (k % 3 - 1) * 0.8), new T.Quaternion(), new T.Vector3(1.2 + hash2(i, k, 1) * 0.8, 0.8 + hash2(i, k, 2) * 0.5, 1.1)) });
      const c = new T.Mesh(GFX.merge(items), cm);
      c.castShadow = true;
      c.position.set(-20 + hash2(i, 1, 9) * 90, 11 + hash2(i, 2, 9) * 3, -10 + hash2(i, 3, 9) * 70);
      c.userData.v = 0.4 + hash2(i, 4, 9) * 0.4;
      clouds.push(c); worldGroup.add(c);
    }
    const bm = GFX.mat('bird', { color: 0x2a2a2a, side: T.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const flock = new T.Group();
      for (let k = 0; k < 5; k++) {
        const bird = new T.Group();
        for (const s of [-1, 1]) {
          const wg = new T.BufferGeometry();
          wg.setAttribute('position', new T.Float32BufferAttribute([0, 0, -0.04, 0, 0, 0.04, s * 0.16, 0, 0], 3));
          wg.computeVertexNormals();
          const wing = new T.Mesh(wg, bm); wing.userData.side = s; bird.add(wing);
        }
        bird.position.set(-Math.abs(k - 2) * 0.35, 0, (k - 2) * 0.3);
        flock.add(bird);
      }
      flock.position.set(-30 + i * 25, 7 + i, 10 + i * 12);
      flock.userData.v = 2 + i * 0.4;
      birds.push(flock); worldGroup.add(flock);
    }
    // fog banks rolling along the edge of the world
    const mistMat = new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 1, depthWrite: false });
    const mg = new T.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 90; i++) {
      const side = i % 4, u = hash2(i, 1, 77) * (MAP_W + 16) - 8;
      const out = 1 + hash2(i, 2, 77) * 9;
      let x, z;
      if (side === 0) { x = u; z = -out; } else if (side === 1) { x = MAP_W + out; z = u; } else if (side === 2) { x = u; z = MAP_H + out; } else { x = -out; z = u; }
      const m = new T.Mesh(mg, mistMat);
      const s = 3 + hash2(i, 3, 77) * 4;
      m.scale.set(s, s * 0.32, s);
      m.position.set(x, heightAt(x, z) + 0.6 + hash2(i, 4, 77) * 1.2, z);
      m.userData.base = m.position.clone(); m.userData.ph = hash2(i, 5, 77) * 6;
      mists.push(m); worldGroup.add(m);
    }
    fireflies = new T.InstancedMesh(new T.SphereGeometry(0.015, 5, 4), new T.MeshBasicMaterial({ color: 0xdfff8a }), 60);
    fireflies.frustumCulled = false;
    worldGroup.add(fireflies);
  }
  function updateSky(dt) {
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > MAP_W + 40) c.position.x = -40; }
    for (const c of clouds) c.visible = cam.pitch > 0.45;     // low views would look through them
    const day = daylight();
    for (const f of birds) {
      f.position.x += f.userData.v * dt;
      if (f.position.x > MAP_W + 40) { f.position.x = -40; f.position.z = Math.random() * MAP_H; }
      f.visible = day > 0.5;
      f.children.forEach((bird, k) => bird.children.forEach(w => { w.rotation.x = w.userData.side * Math.sin(time * 9 + k) * 0.6; }));
    }
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    for (const m of mists) {
      const b = m.userData.base;
      m.position.x = b.x + Math.sin(time * 0.07 + m.userData.ph) * 1.5;
      m.position.z = b.z + Math.cos(time * 0.05 + m.userData.ph) * 1.2;
      // fog banks on the near side would sit in front of the town
      const ahead = (m.position.x - cam.x) * fx + (m.position.z - cam.z) * fz;
      m.visible = ahead < cam.dist * 0.25;
    }
    const night = 1 - day;
    let i = 0;
    if (night > 0.3) for (let k = 0; k < 60; k++) {
      const tx = 2 + hash2(k, 5, 1) * (MAP_W - 4), tz = 2 + hash2(k, 6, 1) * (MAP_H - 4);
      if (tileAt(Math.floor(tx), Math.floor(tz)) !== T_FOREST) continue;
      const a = 0.5 + Math.sin(time * 3 + k * 2) * 0.5;
      fireflies.setMatrixAt(i++, _m4.compose(_v.set(tx + Math.sin(time * 0.7 + k) * 0.4, 0.3 + Math.sin(time * 2 + k) * 0.15, tz + Math.cos(time * 0.5 + k) * 0.4), _q.identity(), _s.setScalar(Math.max(0.05, a))));
    }
    fireflies.count = i; fireflies.instanceMatrix.needsUpdate = true;
  }

  // ---------- selection, ghost ----------
  function makeRing() {
    const g = new T.Group();
    const m = new T.MeshBasicMaterial({ color: 0xffd75a });
    for (const [x, z, w, d] of [[0.5, 0, 1, 0.04], [0.5, 1, 1, 0.04], [0, 0.5, 0.04, 1], [1, 0.5, 0.04, 1]]) {
      const b = new T.Mesh(new T.BoxGeometry(w, 0.03, d), m); b.position.set(x, 0.05, z); g.add(b);
    }
    g.visible = false;
    worldGroup.add(g);
    return g;
  }
  const ghostMats = {
    ok: new T.MeshStandardMaterial({ color: 0x9cff9c, transparent: true, opacity: 0.55, emissive: 0x2a6a2a }),
    bad: new T.MeshStandardMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55, emissive: 0x6a2a2a }),
  };
  function updateGhost() {
    const gh = api.ghost;
    if (!gh) { if (ghostGroup) { worldGroup.remove(ghostGroup); ghostGroup = null; ghostKey = ''; } return; }
    const key = gh.type + (gh.ok ? 1 : 0);
    if (key !== ghostKey) {
      if (ghostGroup) worldGroup.remove(ghostGroup);
      ghostGroup = Models.build({ id: 0, type: gh.type, x: 0, y: 0, level: 1, built: 1, ore: 'ironOre' });
      const gm = gh.ok ? ghostMats.ok : ghostMats.bad;
      ghostGroup.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
      const s = BUILDINGS[gh.type].size;
      const pad = new T.Mesh(new T.BoxGeometry(s, 0.02, s), gm); pad.position.set(s / 2, 0.02, s / 2); ghostGroup.add(pad);
      worldGroup.add(ghostGroup);
      ghostKey = key;
    }
    ghostGroup.position.set(gh.x, 0, gh.y);
    for (const fn of ghostGroup.userData.anim || []) fn(time, true);
  }
  function placeRing(r, b, pulse) {
    if (!b) { r.visible = false; return; }
    const s = BUILDINGS[b.type].size, k = pulse ? 0.12 + Math.abs(Math.sin(time * 3)) * 0.25 : 0.04;
    r.visible = true;
    r.position.set(b.x - k, 0, b.y - k);
    r.scale.set(s + k * 2, 1, s + k * 2);
  }

  // ---------- lights ----------
  function collectLights() {
    lightSources = [];
    for (const [, rec] of bModels) for (const l of rec.group.userData.lights || []) lightSources.push({ x: rec.group.position.x + l.x, y: l.y, z: rec.group.position.z + l.z, color: l.color });
    if (wallGroup) for (const l of wallGroup.userData.lights) lightSources.push(l);
    if (propGroup) for (const l of propGroup.userData.lights) lightSources.push(l);
    api.lightsDirty = false;
  }
  const _sky = new T.Color(), _tmp = new T.Color();
  function updateLighting() {
    const day = daylight(), night = 1 - day, p = dayPhase();
    const twi = Math.sin(day * Math.PI);
    // the sun crosses the sky from sunrise to sunset
    const a = Math.min(1, Math.max(0, (p - 0.22) / 0.61)) * Math.PI;
    const dir = new T.Vector3(-Math.cos(a) * 0.8, Math.max(0.15, Math.sin(a)), 0.45).normalize();
    sun.position.set(cam.x + dir.x * 40, dir.y * 40, cam.z + dir.z * 40);
    sun.target.position.set(cam.x, 0, cam.z);
    sun.intensity = 2.3 * day;
    sun.color.set(0xfff4e0).lerp(_tmp.set(0xffa266), twi * 0.55);
    moon.position.set(cam.x + 20, 30, cam.z - 15);
    moon.target.position.set(cam.x, 0, cam.z);
    moon.intensity = 0.55 * night;
    hemi.intensity = 0.45 + 0.85 * day;
    hemi.color.set(0x34477a).lerp(_tmp.set(0xe2f0ff), day);
    hemi.groundColor.set(0x1e2620).lerp(_tmp.set(0x7a8a52), day);
    _sky.set(0x101a34).lerp(_tmp.set(0xcfe2ee), day).lerp(_tmp.set(0xf0b088), twi * 0.3);
    scene.background = _sky;
    scene.fog.color.copy(_sky);
    GFX.M.window().emissiveIntensity = 0.15 + night * 1.8;
    const sc = sun.shadow.camera, ext = Math.min(48, cam.dist * 1.15);
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    if (api.lightsDirty) collectLights();
    const near = lightSources.slice().sort((A, B) => ((A.x - cam.x) ** 2 + (A.z - cam.z) ** 2) - ((B.x - cam.x) ** 2 + (B.z - cam.z) ** 2));
    pointLights.forEach((pl, i) => {
      const s = near[i];
      if (!s || night < 0.05) { pl.intensity = 0; return; }
      pl.position.set(s.x, s.y + 0.15, s.z);
      pl.color.set(s.color);
      pl.intensity = night * 2.2 * (0.9 + Math.sin(time * 11 + i) * 0.1);
    });
    if (mists.length) mists[0].material.color.set(0xffffff).lerp(_tmp.set(0x34405a), night);
  }

  // ---------- camera ----------
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['x', 'z', 'yaw', 'pitch', 'dist']) cam[key] += (want[key] - cam[key]) * k;
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.x + Math.sin(cam.yaw) * cp * CAM_BACK, Math.sin(cam.pitch) * CAM_BACK, cam.z + Math.cos(cam.yaw) * cp * CAM_BACK);
    camera.lookAt(cam.x, 0, cam.z);
    const hh = cam.dist * 0.34, aspect = W / Math.max(1, H);
    camera.left = -hh * aspect; camera.right = hh * aspect; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
    scene.fog.near = CAM_BACK + cam.dist * 0.7;
    scene.fog.far = CAM_BACK + cam.dist * 2.4 + 14;
  }
  function clampCam() {
    want.x = Math.max(-6, Math.min(MAP_W + 6, want.x));
    want.z = Math.max(-6, Math.min(MAP_H + 6, want.z));
    want.dist = Math.max(6, Math.min(60, want.dist));
  }
  // drag the ground by screen pixels: the point under the cursor follows it
  let dragAnchor = null;
  function dragStart(sx, sy) { dragAnchor = groundPoint(sx, sy); }
  function dragMove(sx, sy) {
    if (!dragAnchor) return;
    const p = groundPoint(sx, sy);
    if (!p) return;
    want.x += dragAnchor.x - p.x; want.z += dragAnchor.z - p.z;
    cam.x = want.x; cam.z = want.z;
    clampCam();
    updateCamera(0);
  }
  function panKeys(ax, ay, dt) {
    const sp = cam.dist * 0.9 * dt;
    const rx = Math.cos(want.yaw), rz = -Math.sin(want.yaw), fx = -Math.sin(want.yaw), fz = -Math.cos(want.yaw);
    want.x += (ax * rx + ay * fx) * sp; want.z += (ax * rz + ay * fz) * sp;
    clampCam();
  }
  function rotateBy(a) { want.yaw = Math.max(YAW0 - YAW_LIMIT, Math.min(YAW0 + YAW_LIMIT, want.yaw + a)); }
  function tiltBy(a) { want.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, want.pitch + a)); }
  function zoomAt(sx, sy, factor) {
    const before = groundPoint(sx, sy);
    const nd = Math.max(6, Math.min(60, want.dist / factor));
    if (before) { const t = 1 - nd / want.dist; want.x += (before.x - want.x) * t; want.z += (before.z - want.z) * t; }
    want.dist = nd;
    clampCam();
  }
  function centerOn(tx, ty, smooth) { want.x = tx; want.z = ty; if (!smooth) { cam.x = tx; cam.z = ty; } }

  // ---------- picking ----------
  function ndc(sx, sy) { return new T.Vector2(sx / W * 2 - 1, -(sy / H) * 2 + 1); }
  function groundPoint(sx, sy) {
    raycaster.setFromCamera(ndc(sx, sy), camera);
    const p = new T.Vector3();
    return raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  function screenToTile(sx, sy) {
    const p = groundPoint(sx, sy);
    return p ? [Math.floor(p.x), Math.floor(p.z)] : [-1, -1];
  }
  function pick(sx, sy) {
    raycaster.setFromCamera(ndc(sx, sy), camera);
    const hits = raycaster.intersectObjects(buildingRoot.children, true);
    // the command-square buildings are scenery; their tools live in the bottom bar
    const usable = b => b && !BUILDINGS[b.type].unique ? b : null;
    for (const h of hits) {
      const id = h.object.userData.bid;
      if (id !== undefined) return usable(G.buildings.find(b => b.id === id));
    }
    const [tx, ty] = screenToTile(sx, sy);
    return usable(buildingAt(tx, ty));
  }

  // ---------- setup ----------
  function init(c) {
    canvas = c;
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    pix = GFX.pixelator(renderer, { pixel: 2, levels: 24, outline: 0.55 });
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = T.SRGBColorSpace;
    scene = new T.Scene();
    scene.fog = new T.Fog(0xb7d0dc, 30, 90);
    camera = new T.OrthographicCamera(-10, 10, 10, -10, 1, 400);
    hemi = new T.HemisphereLight(0xcfe6ff, 0x5a6a3a, 0.9);
    sun = new T.DirectionalLight(0xfff1d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    moon = new T.DirectionalLight(0x8fa8ff, 0);
    scene.add(hemi, sun, sun.target, moon, moon.target);
    for (let i = 0; i < 8; i++) { const pl = new T.PointLight(0xff9a40, 0, 5, 2); pointLights.push(pl); scene.add(pl); }
    worldGroup = new T.Group(); scene.add(worldGroup);
    buildingRoot = new T.Group(); worldGroup.add(buildingRoot);
    makePeople(); makeParticles(); makeSky();
    ring = makeRing(); pulseRing = makeRing();
    resize();
    window.addEventListener('resize', resize);
    centerOn(21, 22);
    want.dist = cam.dist = 26;
  }
  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    pix.setSize(W, H);
  }
  const worldKey = () => G.territory + '|' + has('palisade') + has('stoneWalls');
  // rebuild everything that depends on the map (new game / load / territory change)
  function rebuildWorld() {
    buildGround(); buildSurfaces(); buildTrees(); buildWalls(); buildProps();
    for (const [, rec] of bModels) { buildingRoot.remove(rec.group); disposeGroup(rec.group); }
    bModels.clear();
    api.lightsDirty = true;
    api.worldKey = worldKey();
  }

  function frame(dt) {
    time += dt;
    GFX.windUniform.value = time;
    if (api.terrainDirty) {
      // a new building only changes clutter + trees; territory/walls need a full rebuild
      if (api.worldKey !== worldKey() || !groundMesh || api.fullRebuild) rebuildWorld();
      else { buildSurfaces(); buildTrees(); }
      api.terrainDirty = false; api.fullRebuild = false;
    }
    if (api.worldKey !== worldKey()) rebuildWorld();
    syncBuildings();
    updateCamera(dt);
    updateWalkers(dt * Math.min(G.paused ? 0 : G.speed, 2) || 0);
    updateArrivals(dt * Math.min(G.paused ? 0 : G.speed, 3) || 0);
    animateBuildings(dt);
    drawPeople();
    updateParticles(dt);
    updateSky(dt);
    updateGhost();
    placeRing(ring, api.ghost ? null : (api.hover || api.selected), false);
    placeRing(pulseRing, api.pulse, true);
    if (waterMesh) waterMesh.material.map.offset.set(time * 0.01, time * 0.006);
    updateLighting();
    // folds count when depth bends by more than about half a pixel's worth of world
    pix.render(scene, camera, (cam.dist * 0.68 / pix.size()[1]) * 0.6);
  }

  return Object.assign(api, {
    init, frame, resize, pick, screenToTile, centerOn, clampCam, zoomAt, dragStart, dragMove, panKeys, rotateBy, tiltBy,
    daylight, dayPhase, heightAt, cam, want, resetWalkers: () => { walkers = []; arrivals = []; lastPop = null; },
  });
})();
