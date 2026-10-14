// ============================================================
//  3D battle scene. Replays a Combat.simulate() result with every
//  soldier on the field: armies march in, archers and javelins
//  loose volleys, the lines charge and clash, soldiers fall, the
//  loser routs. Side A starts on the left, the defender (D) on
//  the right in front of its walls or castle.
// ============================================================

const Battle = (() => {
  const T = THREE;
  const queue = [];
  let cur = null;
  let renderer = null, scene, camera, canvas, W = 1, H = 1;
  let sunL, hemiL, moonL, torchLights = [];
  let raf = 0, last = 0;
  let sceneryGroup = null, unitGroup = null;

  const MAX_PER_SIDE = 1500;               // drawn 1:1 up to this many per side
  const SP = 0.42;                         // spacing between soldiers
  const STEP = { deploy: 2.2, volley: 1.25, charge: 1.4, melee: 0.95, rout: 2.4 };
  const RANK = { spear: 0, militia: 1, sword: 1, axe: 1, mace: 1, cavalry: 2, javelin: 3, ranged: 4 };
  const isShooter = cls => cls === 'ranged' || cls === 'javelin';
  const WEAPON_KIND = { sword: 'blade', axe: 'axe', mace: 'mace', spear: 'spear', javelin: 'jav', ranged: 'bow', cavalry: 'lance', militia: 'fork' };

  function play(opts) { queue.push(opts); if (!cur) next(); }

  function next() {
    const opts = queue.shift();
    const el = document.getElementById('battle');
    if (!opts) { cur = null; el.classList.add('hidden'); G.inBattle = false; return; }
    G.inBattle = true;
    el.classList.remove('hidden');
    el.querySelector('.b-result').classList.add('hidden');
    el.querySelector('[data-bact=speed]').classList.remove('on');
    ensureRenderer();
    resize();
    setup(opts);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function ensureRenderer() {
    if (renderer) return;
    canvas = document.querySelector('#battle canvas');
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.outputColorSpace = T.SRGBColorSpace;
    scene = new T.Scene();
    scene.fog = new T.Fog(0xb7d0dc, 40, 110);
    camera = new T.PerspectiveCamera(36, 1, 0.3, 300);
    hemiL = new T.HemisphereLight(0xcfe6ff, 0x5a6a3a, 0.9);
    sunL = new T.DirectionalLight(0xfff1d6, 2.6);
    sunL.castShadow = true;
    sunL.shadow.mapSize.set(2048, 2048);
    sunL.shadow.camera.near = 1; sunL.shadow.camera.far = 140;
    sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.03;
    moonL = new T.DirectionalLight(0x8fa8ff, 0);
    scene.add(hemiL, sunL, sunL.target, moonL);
    for (let i = 0; i < 4; i++) { const pl = new T.PointLight(0xff9a40, 0, 9, 2); torchLights.push(pl); scene.add(pl); }
  }
  function resize() {
    if (!renderer) return;
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------
  //  Soldier parts (feet at origin, facing +x)
  // ---------------------------------------------------------
  let partGeo = null;
  function parts() {
    if (partGeo) return partGeo;
    const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(...s));
    const wood = 0x6b4a2a, steel = 0xc9ced4;
    partGeo = {
      body: new T.CylinderGeometry(0.075, 0.095, 0.3, 8).translate(0, 0.33, 0),
      head: new T.SphereGeometry(0.06, 10, 8).translate(0, 0.54, 0),
      helmet: new T.SphereGeometry(0.066, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.55, 0),
      leg: new T.BoxGeometry(0.045, 0.18, 0.045).translate(0, -0.09, 0),
      arm: new T.BoxGeometry(0.035, 0.16, 0.035).translate(0, -0.08, 0),
      shield: new T.CylinderGeometry(0.1, 0.1, 0.02, 12).rotateZ(Math.PI / 2),
      // weapons, held in the right hand (pivot at the grip), pointing up
      blade: GFX.merge([{ geo: new T.BoxGeometry(0.02, 0.32, 0.008), matrix: M4(0, 0.2, 0), color: steel }, { geo: new T.BoxGeometry(0.02, 0.012, 0.09), matrix: M4(0, 0.04, 0), color: wood }]),
      axe: GFX.merge([{ geo: new T.CylinderGeometry(0.01, 0.01, 0.38, 5), matrix: M4(0, 0.16, 0), color: wood }, { geo: new T.BoxGeometry(0.08, 0.09, 0.012), matrix: M4(0.04, 0.32, 0), color: steel }]),
      mace: GFX.merge([{ geo: new T.CylinderGeometry(0.01, 0.012, 0.3, 5), matrix: M4(0, 0.13, 0), color: wood }, { geo: new T.IcosahedronGeometry(0.045, 0), matrix: M4(0, 0.3, 0), color: 0x8a9096 }]),
      spear: GFX.merge([{ geo: new T.CylinderGeometry(0.009, 0.009, 0.95, 5), matrix: M4(0, 0.3, 0), color: wood }, { geo: new T.ConeGeometry(0.02, 0.08, 5), matrix: M4(0, 0.81, 0), color: steel }]),
      lance: GFX.merge([{ geo: new T.CylinderGeometry(0.012, 0.02, 1.15, 6), matrix: M4(0, 0.35, 0), color: 0x8a6a44 }, { geo: new T.ConeGeometry(0.025, 0.1, 6), matrix: M4(0, 0.97, 0), color: steel }]),
      jav: GFX.merge([{ geo: new T.CylinderGeometry(0.007, 0.007, 0.6, 5), matrix: M4(0, 0.22, 0), color: 0x8a6a44 }, { geo: new T.ConeGeometry(0.014, 0.05, 5), matrix: M4(0, 0.54, 0), color: steel }]),
      bow: GFX.merge([{ geo: new T.TorusGeometry(0.2, 0.008, 4, 12, Math.PI * 0.9), matrix: M4(0, 0.1, 0, 0, Math.PI / 2, Math.PI / 2 - Math.PI * 0.45), color: 0x7a5230 }, { geo: new T.CylinderGeometry(0.002, 0.002, 0.39, 3), matrix: M4(0, 0.1, -0.03), color: 0xeeeeee }]),
      fork: GFX.merge([{ geo: new T.CylinderGeometry(0.009, 0.009, 0.7, 5), matrix: M4(0, 0.22, 0), color: wood }, ...[-0.025, 0, 0.025].map(o => ({ geo: new T.CylinderGeometry(0.004, 0.004, 0.1, 4), matrix: M4(0, 0.6, o), color: 0x777777 }))]),
      horse: GFX.merge([
        { geo: new T.BoxGeometry(0.5, 0.2, 0.17), matrix: M4(0, 0.4, 0) },
        { geo: new T.BoxGeometry(0.12, 0.26, 0.11), matrix: M4(0.26, 0.55, 0, 0, 0, -0.55) },
        { geo: new T.BoxGeometry(0.2, 0.09, 0.09), matrix: M4(0.38, 0.66, 0, 0, 0, 0.2) },
        { geo: new T.BoxGeometry(0.04, 0.18, 0.04), matrix: M4(-0.26, 0.36, 0, 0, 0, 0.5), color: 0x2a1d14 },
        { geo: new T.BoxGeometry(0.05, 0.03, 0.17), matrix: M4(-0.02, 0.52, 0), color: 0x7a2a2a },
      ]),
      hleg: new T.BoxGeometry(0.045, 0.32, 0.045).translate(0, -0.16, 0),
      arrow: GFX.merge([{ geo: new T.CylinderGeometry(0.006, 0.006, 0.42, 4).rotateZ(Math.PI / 2), color: 0xe8dcc0 }, { geo: new T.ConeGeometry(0.014, 0.05, 4).rotateZ(-Math.PI / 2), matrix: M4(0.22, 0, 0), color: 0x777777 }, { geo: new T.BoxGeometry(0.06, 0.004, 0.03), matrix: M4(-0.19, 0, 0), color: 0xdddddd }]),
      javProj: GFX.merge([{ geo: new T.CylinderGeometry(0.009, 0.009, 0.6, 5).rotateZ(Math.PI / 2), color: 0x8a6a44 }, { geo: new T.ConeGeometry(0.016, 0.06, 5).rotateZ(-Math.PI / 2), matrix: M4(0.32, 0, 0), color: 0x999999 }]),
      stone: new T.IcosahedronGeometry(0.03, 0),
      dust: new T.IcosahedronGeometry(1, 1),
    };
    return partGeo;
  }

  // ---------------------------------------------------------
  //  Setup
  // ---------------------------------------------------------
  function clearScene() {
    for (const g of [sceneryGroup, unitGroup]) if (g) {
      scene.remove(g);
      g.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    }
  }

  function setup(o) {
    clearScene();
    const res = o.res;
    const playerIsA = o.playerSide === 'A';
    const colors = {
      A: new T.Color(playerIsA ? '#3b6fc4' : o.enemy.color),
      D: new T.Color(playerIsA ? o.enemy.color : '#3b6fc4'),
    };
    const r0 = res.rounds[0];
    const soldiers = [];
    const extent = { A: 0, D: 0 };
    let maxRows = 8;
    for (const side of ['A', 'D']) {
      const dir = side === 'A' ? 1 : -1;
      const ids = res.order[side];
      const counts = side === 'A' ? r0.sa : r0.sd;
      const sideTotal = counts.reduce((a, b) => a + b, 0);
      const scale = Math.max(1, sideTotal / MAX_PER_SIDE);       // 1 unless an army is enormous
      const stacks = ids.map((id, k) => ({ id, k, cls: WEAPONS[id].cls, n: figs(counts[k], scale) })).sort((a, b) => RANK[a.cls] - RANK[b.cls]);
      const N = stacks.reduce((a, s) => a + s.n, 0);
      const rows = Math.max(8, Math.min(44, Math.round(Math.sqrt(N * 1.7))));
      maxRows = Math.max(maxRows, rows);
      let col = 0;
      for (const st of stacks) {
        for (let i = 0; i < st.n; i++) {
          const c = col + Math.floor(i / rows), row = i % rows;
          const hx = -dir * (2.2 + c * SP * (st.cls === 'cavalry' ? 1.5 : 1)) + (Math.random() - 0.5) * 0.06;
          const hz = (row - (rows - 1) / 2) * SP + (Math.random() - 0.5) * 0.08;
          soldiers.push({
            side, dir, stack: st.k, id: st.id, cls: st.cls, col: c, hx, hz,
            sx: hx - dir * 9, x: hx - dir * 9, z: hz, face: dir > 0 ? 0 : Math.PI,
            alive: true, dieAt: Infinity, fallen: 0, ph: Math.random() * 6, swing: Math.random() * 6, moving: 0, lean: 0,
          });
        }
        col += Math.ceil(st.n / rows) + 0.5;
      }
      extent[side] = 2.2 + col * SP;
    }
    // timeline
    const steps = [];
    let t = 0;
    for (let i = 0; i < res.rounds.length; i++) {
      const kind = res.rounds[i].kind, dur = STEP[kind] || 1;
      steps.push({ i, kind, start: t, dur, done: false });
      t += dur;
    }
    cur = { o, res, colors, soldiers, steps, t: 0, total: t, speed: 1, shake: 0, playerIsA, extent, depth: maxRows * SP,
      arrows: [], dust: [], finished: false };
    buildScenery(o, extent, maxRows * SP);
    buildUnits();
    hud();
  }
  function figs(n, scale) { return n > 0.05 ? Math.max(1, Math.round(n / scale)) : 0; }

  // ---------- scenery: rolling field, trees, walls or castle ----------
  function buildScenery(o, extent, depth) {
    sceneryGroup = new T.Group();
    const size = 160;
    const geo = new T.PlaneGeometry(size, size, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
    const flatR = Math.max(extent.A, extent.D) + 4;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.max(0, Math.hypot(x * 0.8, z) - flatR);
      pos.setY(i, Math.pow(Math.min(1, d / 25), 1.5) * (2 + smoothNoise(x + 500, z + 500, 9, 5) * 9) + (smoothNoise(x, z, 3, 6) - 0.5) * 0.15);
      c.set('#5c9140').lerp(new T.Color('#8cba55'), smoothNoise(x, z, 5, 21));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const tex = GFX.TEX.ground().clone(); tex.needsUpdate = true; tex.repeat.set(40, 40);
    const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
    ground.receiveShadow = true;
    sceneryGroup.add(ground);
    // trees around the field
    const geos = GFX.trees(), lists = { pine: [], oak: [], birch: [] };
    for (let i = 0; i < 700; i++) {
      const a = hash2(i, 1, 41) * Math.PI * 2, r = flatR + 3 + hash2(i, 2, 41) * 40;
      const x = Math.cos(a) * r / 0.8, z = Math.sin(a) * r;
      if (z > 6 && Math.abs(x) < flatR + 8) continue;          // keep the camera side open
      const kind = ['pine', 'oak', 'birch'][i % 3];
      const s = 2.2 + hash2(i, 3, 41) * 1.6;
      lists[kind].push([x, 0, z, s, hash2(i, 4, 41) * 6]);
    }
    for (const k in lists) {
      const im = new T.InstancedMesh(geos[k], GFX.swayMaterial('tree'), lists[k].length);
      const m4 = new T.Matrix4(), q = new T.Quaternion();
      lists[k].forEach(([x, , z, s, r], i) => {
        const y = groundY(ground, x, z);
        im.setMatrixAt(i, m4.compose(new T.Vector3(x, y, z), q.setFromEuler(new T.Euler(0, r, 0)), new T.Vector3(s, s, s)));
      });
      im.castShadow = true; im.receiveShadow = true;
      sceneryGroup.add(im);
    }
    // defender's stronghold behind the right-hand army
    const backX = extent.D + 2.5;
    const holdLights = [];
    if (o.setting === 'town') buildTownWall(backX, depth, holdLights); else buildCastle(backX, depth, o.enemy.color, holdLights);
    sceneryGroup.userData.lights = holdLights;
    scene.add(sceneryGroup);
  }
  function groundY(ground, x, z) {
    const ray = new T.Raycaster(new T.Vector3(x, 50, z), new T.Vector3(0, -1, 0));
    const h = ray.intersectObject(ground)[0];
    return h ? h.point.y : 0;
  }
  function buildTownWall(x0, depth, lights) {
    const g = new T.Group();
    const stone = has('stoneWalls');
    const half = Math.max(8, depth / 2 + 4);
    const wallM = stone ? GFX.M.stone() : GFX.mat('palisadeB', { map: GFX.TEX.logs(), color: 0xc8a882 });
    for (let z = -half; z < half; z += 1.2) {
      if (Math.abs(z) < 1.2) continue;            // gate gap
      if (stone) {
        GFX.block(g, 0.6, 2.2, 1.2, wallM, x0, 0, z + 0.6);
        for (let k = 0; k < 3; k++) GFX.block(g, 0.6, 0.35, 0.25, wallM, x0, 2.2, z + 0.2 + k * 0.4);
      } else for (let k = 0; k < 4; k++) {
        const zz = z + 0.15 + k * 0.3, h = 1.9 + hash2(zz * 9, 1, 2) * 0.3;
        GFX.add(g, new T.CylinderGeometry(0.15, 0.16, h, 7), wallM, x0, h / 2, zz);
        GFX.add(g, new T.ConeGeometry(0.15, 0.3, 7), wallM, x0, h + 0.15, zz);
      }
    }
    for (const z of [-1.5, 1.5]) {
      GFX.add(g, new T.CylinderGeometry(0.7, 0.8, 3.4, 10), GFX.M.stone(), x0, 1.7, z);
      GFX.add(g, new T.ConeGeometry(0.95, 1.2, 10), GFX.M.slate(), x0, 4, z);
      lights.push([x0 - 0.9, 2, z]);
      GFX.add(g, new T.ConeGeometry(0.06, 0.16, 6), GFX.M.torch(), x0 - 0.85, 2.1, z);
    }
    // the town behind the wall
    for (let i = 0; i < 9; i++) {
      const h = Models.build({ id: 900 + i, type: 'house', x: 0, y: 0, level: 1 + (i % 3), built: 1 });
      h.scale.setScalar(2.4);
      h.position.set(x0 + 1.5 + (i % 3) * 2.6, 0, -half * 0.7 + Math.floor(i / 3) * half * 0.7 + (i % 2) * 0.6);
      g.add(h);
    }
    sceneryGroup.add(GFX.bake(g));
  }
  function buildCastle(x0, depth, color, lights) {
    const g = new T.Group();
    const half = Math.max(9, depth / 2 + 5);
    for (let z = -half; z < half; z += 1.5) {
      if (Math.abs(z) < 1.5) continue;
      GFX.block(g, 1, 3, 1.5, GFX.M.stone(), x0, 0, z + 0.75);
      for (let k = 0; k < 3; k++) GFX.block(g, 1, 0.4, 0.3, GFX.M.stone(), x0, 3, z + 0.25 + k * 0.5);
    }
    const flagM = GFX.M.flag(new T.Color(color).getHex());
    for (const z of [-half, -1.6, 1.6, half]) {
      GFX.add(g, new T.CylinderGeometry(1, 1.1, 5, 12), GFX.M.stone(), x0, 2.5, z);
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; GFX.block(g, 0.3, 0.4, 0.3, GFX.M.stone(), x0 + Math.cos(a) * 0.95, 5, z + Math.sin(a) * 0.95); }
      GFX.add(g, new T.CylinderGeometry(0.03, 0.03, 1.4, 5), GFX.M.darkwood(), x0, 6.1, z);
      GFX.add(g, new T.BoxGeometry(0.02, 0.45, 0.75), flagM, x0, 6.5, z + 0.38);
      lights.push([x0 - 1.1, 2.4, z]);
      GFX.add(g, new T.ConeGeometry(0.07, 0.18, 6), GFX.M.torch(), x0 - 1.05, 2.5, z);
    }
    // keep and gate
    GFX.block(g, 4, 6, 5, GFX.M.darkstone(), x0 + 4.5, 0, 0);
    GFX.add(g, GFX.pyramidGeo(4.6, 5.6, 2.4), GFX.M.slate(), x0 + 4.5, 6, 0);
    GFX.block(g, 0.3, 2.2, 2.2, GFX.mat('gatevoid', { color: 0x1a120c }), x0 - 0.4, 0, 0);
    sceneryGroup.add(GFX.bake(g));
  }

  // ---------- instanced soldiers ----------
  let IM = null;
  function buildUnits() {
    const P = parts();
    unitGroup = new T.Group();
    const n = cur.soldiers.length;
    const mk = (geo, mat, count, shadow = true) => {
      const m = new T.InstancedMesh(geo, mat, Math.max(1, count));
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
      unitGroup.add(m); return m;
    };
    const cloth = new T.MeshStandardMaterial({ roughness: 0.85 });
    const steel = GFX.mat('bsteel', { color: 0xaeb4bb, metalness: 0.6, roughness: 0.4 });
    const vc = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });
    IM = {
      body: mk(P.body, cloth, n),
      head: mk(P.head, GFX.mat('skin', { color: 0xf0c9a0 }), n),
      helmet: mk(P.helmet, steel, n),
      leg: mk(P.leg, GFX.mat('btrousers', { color: 0x3a2a1e }), n * 2),
      arm: mk(P.arm, cloth, n),
      shield: mk(P.shield, new T.MeshStandardMaterial({ roughness: 0.6 }), n),
      horse: mk(P.horse, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), n),
      hleg: mk(P.hleg, GFX.mat('hleg', { color: 0x4a2c18 }), n * 4),
      weapons: {},
      arrow: mk(P.arrow, vc, 900, false),
      jav: mk(P.javProj, vc, 300, false),
      stone: mk(P.stone, GFX.mat('slingstone', { color: 0xbbbbbb }), 300, false),
      dust: mk(P.dust, new T.MeshStandardMaterial({ color: 0xb8a580, transparent: true, opacity: 0.35, depthWrite: false }), 260, false),
    };
    for (const k of ['blade', 'axe', 'mace', 'spear', 'lance', 'jav', 'bow', 'fork']) IM.weapons[k] = mk(P[k], vc, n);
    // per-soldier colours (tabard, shield, horse coat)
    const c = new T.Color();
    cur.soldiers.forEach((s, i) => {
      const base = cur.colors[s.side];
      IM.body.setColorAt(i, c.copy(base).multiplyScalar(0.85 + hash2(i, 1, 5) * 0.25));
      IM.arm.setColorAt(i, c.copy(base).multiplyScalar(0.75));
      IM.shield.setColorAt(i, c.copy(base).lerp(new T.Color(0xffffff), 0.15));
      IM.horse.setColorAt(i, c.set([0x6b3e1f, 0x3a2a1e, 0xa0703e, 0x8a7060, 0xd9c7a8][i % 5]));
    });
    scene.add(unitGroup);
  }

  // Mark who falls during a step; ranged deaths get a projectile that hits them
  function beginStep(st) {
    const r = cur.res.rounds[st.i];
    if (st.kind === 'charge') setTimeout(() => { if (cur) cur.shake = 0.35; }, 500 / cur.speed);
    for (const side of ['A', 'D']) {
      const counts = side === 'A' ? r.sa : r.sd;
      if (!counts) continue;
      counts.forEach((n, k) => {
        const total = side === 'A' ? cur.res.rounds[0].sa.reduce((a, b) => a + b, 0) : cur.res.rounds[0].sd.reduce((a, b) => a + b, 0);
        const want = figs(n, Math.max(1, total / MAX_PER_SIDE));
        const alive = cur.soldiers.filter(s => s.side === side && s.stack === k && s.alive && s.dieAt === Infinity).sort((a, b) => a.col - b.col || Math.random() - 0.5);
        let kill = alive.length - want;
        for (const s of alive) {
          if (kill-- <= 0) break;
          const ranged = st.kind === 'volley' || (st.kind === 'melee' && Math.random() < 0.3);
          s.dieAt = st.start + st.dur * (ranged ? 0.55 + Math.random() * 0.35 : 0.2 + Math.random() * 0.7);
          if (ranged) shootAt(s, st);
        }
      });
    }
    if (st.kind === 'volley' || st.kind === 'melee') {
      for (const s of cur.soldiers) {
        if (!s.alive || s.dieAt !== Infinity || !isShooter(s.cls)) continue;
        if (Math.random() < (st.kind === 'volley' ? 0.5 : 0.15)) {
          const tx = s.dir * (1 + Math.random() * cur.extent[s.side === 'A' ? 'D' : 'A'] * 0.8), tz = s.hz + (Math.random() - 0.5) * 3;
          launch(s.x, 0.5, s.z, tx, 0, tz, st.start + Math.random() * st.dur * 0.35, s.cls === 'javelin' ? 'jav' : s.id === 'sling' ? 'stone' : 'arrow');
          s.shot = cur.t;
        }
      }
    }
  }
  function shootAt(v, st) {
    const shooters = cur.soldiers.filter(s => s.side !== v.side && s.alive && isShooter(s.cls));
    const flight = 0.6;
    if (shooters.length) {
      const s = shooters[Math.floor(Math.random() * shooters.length)];
      launch(s.hx, 0.5, s.hz, v.hx, 0.35, v.hz, Math.max(st.start, v.dieAt - flight), s.cls === 'javelin' ? 'jav' : s.id === 'sling' ? 'stone' : 'arrow', v.dieAt, v);
      s.shot = Math.max(st.start, v.dieAt - flight);
    } else {
      const wx = (v.side === 'A' ? 1 : -1) * (cur.extent[v.side === 'A' ? 'D' : 'A'] + 2.5);
      launch(wx, 2.6, v.hz * 0.5, v.hx, 0.35, v.hz, Math.max(st.start, v.dieAt - flight), 'arrow', v.dieAt, v);
    }
  }
  function launch(x0, y0, z0, x1, y1, z1, t0, type, t1, victim) {
    t1 = t1 || t0 + 0.55 + Math.random() * 0.2;
    cur.arrows.push({ x0, y0, z0, x1, y1, z1, t0, t1, type, victim, h: 1.2 + Math.hypot(x1 - x0, z1 - z0) * 0.22 });
  }

  // ---------------------------------------------------------
  //  Loop
  // ---------------------------------------------------------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!cur) return;
    update(dt * cur.speed, dt);
    draw(dt);
    raf = requestAnimationFrame(loop);
  }
  function stepAt(t) { return cur.steps.find(s => t >= s.start && t < s.start + s.dur) || cur.steps[cur.steps.length - 1]; }

  function update(dt, realDt) {
    cur.t += dt;
    GFX.windUniform.value += realDt;
    for (const st of cur.steps) if (!st.done && cur.t >= st.start) { st.done = true; beginStep(st); }
    const st = stepAt(cur.t), kind = st.kind;
    const loser = cur.res.winner === 'A' ? 'D' : 'A';
    for (const s of cur.soldiers) {
      if (s.alive && cur.t >= s.dieAt) { s.alive = false; s.fallT = cur.t; s.fallDir = Math.random() < 0.7 ? -1 : 1; dustAt(s.x, s.z, 2); }
      if (!s.alive) { s.fallen = Math.min(1, (cur.t - s.fallT) / 0.45); continue; }
      let tx = s.hx, tz = s.hz;
      if (kind === 'deploy') {
        const u = Math.min(1, (cur.t - st.start) / (st.dur * 0.92)), e = 1 - Math.pow(1 - u, 2);
        s.x = s.sx + (s.hx - s.sx) * e; s.z = s.hz; s.moving = u < 1 ? 1 : 0; s.ph += dt * 11; s.face = s.dir > 0 ? 0 : Math.PI;
        continue;
      }
      if (kind === 'rout' && s.side === loser) { tx = s.hx - s.dir * 30; }
      else if ((kind === 'charge' || kind === 'melee' || kind === 'rout') && !isShooter(s.cls)) {
        tx = -s.dir * (0.25 + (s.col % 4) * 0.33 + Math.sin(s.ph) * 0.05);
      } else if ((kind === 'charge' || kind === 'melee') && s.cls === 'javelin') tx = -s.dir * (1.6 + (s.col % 3) * 0.35);
      const spd = s.cls === 'cavalry' ? 4.2 : (kind === 'rout' && s.side === loser) ? 3.2 : 2.3;
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.02) {
        const m = Math.min(d, spd * dt);
        s.x += dx / d * m; s.z += dz / d * m;
        s.moving = 1; s.ph += dt * (s.cls === 'cavalry' ? 16 : 11);
        s.face = Math.atan2(-dz, dx);
        if (kind === 'charge' && Math.random() < 0.05) dustAt(s.x, s.z, 1);
      } else {
        s.moving = 0;
        s.face = s.dir > 0 ? 0 : Math.PI;
        if ((kind === 'melee' || kind === 'charge') && !isShooter(s.cls)) s.swing += dt * (7 + Math.sin(s.ph) * 2);
        if (kind === 'rout' && s.side !== loser) s.ph += dt * 7;
      }
    }
    for (const a of cur.arrows) if (!a.hit && cur.t >= a.t1) { a.hit = true; if (!a.victim) dustAt(a.x1, a.z1, 1); }
    cur.arrows = cur.arrows.filter(a => cur.t < a.t1 + (a.victim ? 0 : 1.2));
    for (const p of cur.dust) { p.life += dt; p.y += 0.3 * dt; p.r += 0.25 * dt; }
    cur.dust = cur.dust.filter(p => p.life < 1.1);
    cur.shake = Math.max(0, cur.shake - dt * 0.8);
    hud();
    if (cur.t >= cur.total && !cur.finished) { cur.finished = true; showResult(); }
  }
  function dustAt(x, z, n) {
    for (let i = 0; i < n; i++) cur.dust.push({ x: x + (Math.random() - 0.5) * 0.3, y: 0.05, z: z + (Math.random() - 0.5) * 0.3, r: 0.08 + Math.random() * 0.08, life: 0 });
  }

  // ---------------------------------------------------------
  //  Drawing
  // ---------------------------------------------------------
  const m4 = new T.Matrix4(), base = new T.Matrix4(), part = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(), e = new T.Euler();
  const ZERO = new T.Matrix4().makeScale(0, 0, 0);
  function setPart(im, i, x, y, z, rx, ry, rz, s = 1) {
    part.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc.set(s, s, s));
    im.setMatrixAt(i, m4.multiplyMatrices(base, part));
  }
  function drawSoldiers() {
    const winnerCheer = cur.steps[cur.steps.length - 1].done;
    cur.soldiers.forEach((s, i) => {
      const cav = s.cls === 'cavalry';
      const bob = s.moving ? Math.abs(Math.cos(s.ph)) * 0.025 : 0;
      const cheer = winnerCheer && cur.res.winner === s.side && !s.moving && s.alive ? Math.abs(Math.sin(s.ph)) * 0.12 : 0;
      // base: position, facing, and falling over
      const fall = s.alive ? 0 : s.fallen * Math.PI / 2 * 0.96 * s.fallDir;
      base.compose(v.set(s.x, bob + cheer, s.z), q.setFromEuler(e.set(0, s.face, 0)), sc.set(1, 1, 1));
      if (fall) base.multiply(part.makeRotationZ(fall));
      const ry = cav ? 0.3 : 0;                    // rider sits higher
      if (cav) {
        IM.horse.setMatrixAt(i, base);
        for (let k = 0; k < 4; k++) {
          const swing = s.moving ? Math.sin(s.ph + k * 1.6) * 0.6 : 0;
          setPart(IM.hleg, i * 4 + k, k < 2 ? -0.2 : 0.18, 0.33, k % 2 ? 0.06 : -0.06, 0, 0, swing);
        }
      } else {
        IM.horse.setMatrixAt(i, ZERO);
        for (let k = 0; k < 4; k++) IM.hleg.setMatrixAt(i * 4 + k, ZERO);
      }
      setPart(IM.body, i, 0, ry, 0, 0, 0, 0);
      setPart(IM.head, i, 0, ry, 0, 0, 0, 0);
      if (s.cls === 'militia') IM.helmet.setMatrixAt(i, ZERO); else setPart(IM.helmet, i, 0, ry, 0, 0, 0, 0);
      for (let k = 0; k < 2; k++) {
        const swing = cav ? (k ? 0.7 : -0.7) : (s.moving ? Math.sin(s.ph + k * Math.PI) * 0.6 : 0);
        setPart(IM.leg, i * 2 + k, 0, 0.19 + ry, k ? 0.04 : -0.04, cav ? swing : 0, 0, cav ? 0 : swing);
      }
      // weapon arm: swings in melee, draws for volleys
      const melee = !s.moving && s.alive && !isShooter(s.cls) && s.swing ? Math.sin(s.swing) : 0;
      const shooting = isShooter(s.cls) && s.shot !== undefined && cur.t - s.shot < 0.4;
      let armAng = -0.3 + melee * 1.1, wAng = 0.2 + melee * 1.3;
      if (s.cls === 'spear') { armAng = -1.3; wAng = -1.25 + melee * 0.15; }
      if (cav) { armAng = -1.2; wAng = -1.45; }
      if (s.cls === 'ranged') { armAng = -1.5; wAng = 0; }
      if (s.cls === 'javelin') { armAng = shooting ? -2.4 : -0.4; wAng = shooting ? -1.9 : 0.1; }
      setPart(IM.arm, i, 0.02, 0.45 + ry, -0.1, 0, 0, armAng);
      for (const k in IM.weapons) IM.weapons[k].setMatrixAt(i, ZERO);
      const wk = WEAPON_KIND[s.cls];
      const hand = [0.02 + Math.sin(-armAng) * 0.16, 0.45 + ry - Math.cos(armAng) * 0.16, -0.1];
      if (s.cls === 'ranged') setPart(IM.weapons.bow, i, hand[0] + 0.04, hand[1], hand[2] + 0.05, 0, 0, 0);
      else setPart(IM.weapons[wk], i, hand[0], hand[1], hand[2], 0, 0, wAng);
      if (s.cls === 'spear' || s.cls === 'sword') setPart(IM.shield, i, 0.11, 0.34 + ry, 0.07, 0, 0, 0);
      else IM.shield.setMatrixAt(i, ZERO);
    });
    for (const k of ['body', 'head', 'helmet', 'leg', 'arm', 'shield', 'horse', 'hleg']) IM[k].instanceMatrix.needsUpdate = true;
    for (const k in IM.weapons) IM.weapons[k].instanceMatrix.needsUpdate = true;
  }
  function drawProjectiles() {
    const n = { arrow: 0, jav: 0, stone: 0 };
    for (const a of cur.arrows) {
      if (cur.t < a.t0) continue;
      const u = Math.min(1, (cur.t - a.t0) / (a.t1 - a.t0));
      const at = w => [a.x0 + (a.x1 - a.x0) * w, a.y0 + (a.y1 - a.y0) * w + Math.sin(Math.PI * w) * a.h, a.z0 + (a.z1 - a.z0) * w];
      const p = at(u), p2 = at(Math.min(1, u + 0.02));
      const im = IM[a.type], i = n[a.type]++;
      if (i >= im.count) continue;
      if (a.type === 'stone') { im.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])); continue; }
      // orient along the flight path (stuck arrows keep their last angle)
      const dir = a.hit ? a.lastDir : new T.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]).normalize();
      a.lastDir = dir;
      q.setFromUnitVectors(new T.Vector3(1, 0, 0), dir);
      im.setMatrixAt(i, m4.compose(v.set(p[0], Math.max(0.02, p[1]), p[2]), q, sc.set(1, 1, 1)));
    }
    for (const k in n) { IM[k].count = n[k]; IM[k].instanceMatrix.needsUpdate = true; }
    let i = 0;
    for (const p of cur.dust) {
      if (i >= 260) break;
      IM.dust.setMatrixAt(i++, m4.compose(v.set(p.x, p.y, p.z), q.identity(), sc.setScalar(p.r * (1 - p.life / 1.2))));
    }
    IM.dust.count = i; IM.dust.instanceMatrix.needsUpdate = true;
  }

  function draw(dt) {
    drawSoldiers();
    drawProjectiles();
    // lighting follows the town's time of day
    const day = Render.daylight(), night = 1 - day, twi = Math.sin(day * Math.PI);
    sunL.intensity = 2.6 * day + 0.05;
    sunL.position.set(-25, 30, 22); sunL.target.position.set(0, 0, 0);
    const span = Math.max(cur.extent.A, cur.extent.D) + 8;
    const scam = sunL.shadow.camera; scam.left = -span; scam.right = span; scam.top = span; scam.bottom = -span; scam.updateProjectionMatrix();
    sunL.color.set(0xfff1d6).lerp(new T.Color(0xff9a5a), twi * 0.6);
    moonL.intensity = 0.7 * night; moonL.position.set(15, 30, -10);
    hemiL.intensity = 0.45 + 0.55 * day;
    const sky = new T.Color(0x101a34).lerp(new T.Color(0xb7d0dc), day).lerp(new T.Color(0xe0a07a), twi * 0.35);
    scene.background = sky; scene.fog.color.copy(sky);
    const ls = sceneryGroup.userData.lights || [];
    torchLights.forEach((pl, k) => { const l = ls[k]; if (!l) { pl.intensity = 0; return; } pl.position.set(...l); pl.intensity = night * 3.5 * (0.9 + Math.sin(performance.now() / 90 + k) * 0.1); });
    // camera: fit both armies across the screen, drift slowly, shake on the charge
    const left = -cur.extent.A - 0.5, right = cur.extent.D + 1.5;
    const width = right - left, mid = (left + right) / 2;
    const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    const pitch = 0.62;
    const dist = Math.max(7, Math.max(width / 2 / Math.tan(hfov / 2) / 0.92, cur.depth * 0.75 / Math.tan(camera.fov * Math.PI / 360)));
    const ang = Math.sin(cur.t * 0.07) * 0.1, sh = cur.shake;
    camera.position.set(mid + Math.sin(ang) * dist * Math.cos(pitch) + (Math.random() - 0.5) * sh, dist * Math.sin(pitch) + (Math.random() - 0.5) * sh, Math.cos(ang) * dist * Math.cos(pitch));
    camera.lookAt(mid, 0, 0);
    scene.fog.near = dist * 1.3; scene.fog.far = dist * 4;
    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------
  //  HUD + result card
  // ---------------------------------------------------------
  function sideCount(side) {
    const total = side === 'A' ? cur.res.rounds[0].a : cur.res.rounds[0].d;
    const scale = Math.max(1, total / MAX_PER_SIDE);
    return cur.soldiers.filter(s => s.side === side && s.alive).length * scale;
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
    const mine = cur.playerIsA ? res.A : res.D, theirs = cur.playerIsA ? res.D : res.A;
    const lostUnits = {}; for (const k in mine.lost) if (mine.lost[k] > 0) lostUnits[k] = mine.lost[k];
    const el = document.querySelector('#battle .b-result');
    el.innerHTML = `
      <div class="b-title ${o.won ? 'won' : 'lost'}">${ic(o.won ? 'trophy' : 'skull', 'big')}<span>${o.won ? 'Victory' : 'Defeat'}</span></div>
      <div class="b-rows">
        <div>${ic('skull')} Lost ${unitsHTML(lostUnits)}</div>
        <div>${ic('battle')} Enemies slain: ${unitCount(theirs.lost)}</div>
        ${o.loot ? `<div>${ic('bag')} Spoils ${gainHTML(o.loot)}</div>` : ''}
        ${o.stolen ? `<div class="bad">${ic('bag')} Plundered ${gainHTML(o.stolen, '−')}</div>` : ''}
        ${o.dead ? `<div class="bad">${ic('pop')} Villagers killed: ${o.dead}</div>` : ''}
        ${o.won && o.setting === 'castle' ? `<div>${ic('crown')} ${o.enemy.name} is yours</div>` : ''}
      </div>
      <button class="big" data-bact="close">${ic('arrowR')} Continue</button>`;
    el.classList.remove('hidden');
  }
  function close() {
    cancelAnimationFrame(raf);
    const after = cur && cur.o.after;
    clearScene();
    cur = null;
    next();
    if (after) after();
  }

  function init() {
    const el = document.getElementById('battle');
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-bact]');
      if (!b || !cur) return;
      const a = b.dataset.bact;
      if (a === 'skip') {
        for (const st of cur.steps) if (!st.done) { st.done = true; beginStep(st); }
        cur.t = cur.total - 0.3;
        for (const s of cur.soldiers) if (s.dieAt !== Infinity) { s.alive = false; s.fallT = -1; s.fallen = 1; s.fallDir = s.fallDir || -1; }
        cur.arrows = [];
      } else if (a === 'speed') {
        cur.speed = cur.speed === 1 ? 2.5 : 1;
        b.classList.toggle('on', cur.speed > 1);
      } else if (a === 'close') close();
    });
    window.addEventListener('resize', resize);
  }

  return { play, init, active: () => !!cur };
})();
