// ============================================================
//  3D building models. Each builder fills a THREE.Group whose
//  origin is the footprint's corner (footprint spans 0..size on
//  x and z). Animated parts are flagged `dynamic` and get an
//  entry in userData.anim; light sources go in userData.lights.
// ============================================================

const Models = (() => {
  const T = THREE;
  const { M, mat, add, block, roof, boxGeo, pyramidGeo } = GFX;
  const cyl = (rt, rb, h, seg = 8) => new T.CylinderGeometry(rt, rb, h, seg);

  // ---------- small reusable parts ----------
  function windowAt(g, x, y, z, face, w = 0.1, h = 0.11) {
    // face: '+z' or '+x' or '-z' or '-x'
    const alongX = face.endsWith('z');
    const sgn = face.startsWith('+') ? 1 : -1;
    const t = 0.03;
    const W = alongX ? w : t, D = alongX ? t : w;
    block(g, W + (alongX ? 0.03 : 0), h + 0.03, D + (alongX ? 0 : 0.03), M.beam(), x, y - 0.015, z);
    const win = block(g, W * (alongX ? 1 : 1.2), h, D * (alongX ? 1.2 : 1), M.window(), x + (alongX ? 0 : sgn * 0.004), y, z + (alongX ? sgn * 0.004 : 0));
    win.castShadow = false;
    // mullion cross
    block(g, alongX ? 0.012 : t * 1.3, h, alongX ? t * 1.3 : 0.012, M.beam(), x, y, z);
    block(g, alongX ? w : t * 1.3, 0.012, alongX ? t * 1.3 : w, M.beam(), x, y + h / 2, z);
  }
  function door(g, x, y, z, face, w = 0.13, h = 0.22) {
    const alongX = face.endsWith('z');
    block(g, alongX ? w + 0.04 : 0.04, h + 0.03, alongX ? 0.04 : w + 0.04, M.beam(), x, y, z);
    block(g, alongX ? w : 0.05, h, alongX ? 0.05 : w, M.darkwood(), x, y, z);
    add(g, new T.SphereGeometry(0.012, 6, 4), M.iron(), x + (alongX ? w * 0.3 : 0.03), y + h * 0.5, z + (alongX ? 0.03 : w * 0.3));
  }
  function chimney(g, x, y, z, h = 0.3) {
    block(g, 0.1, h, 0.1, M.stone(), x, y, z);
    block(g, 0.13, 0.03, 0.13, M.darkstone(), x, y + h, z);
    g.userData.smoke = g.userData.smoke || [];
    g.userData.smoke.push({ x, y: y + h + 0.05, z, rate: 0.05, dark: false });
  }
  function barrel(g, x, z, y = 0) {
    add(g, cyl(0.06, 0.06, 0.15, 10), mat('barrel', { map: GFX.TEX.planks(), color: 0xb08050 }), x, y + 0.075, z);
    for (const hy of [0.03, 0.12]) add(g, cyl(0.063, 0.063, 0.012, 10), M.iron(), x, y + hy, z);
  }
  function crate(g, x, z, s = 0.13, y = 0) {
    block(g, s, s, s, M.planks(), x, y, z, { ry: hash2(x * 10, z * 10, 4) });
  }
  function woodpile(g, x, z, n = 3) {
    for (let r = 0; r < n; r++) for (let k = 0; k < n - r; k++) {
      add(g, cyl(0.035, 0.035, 0.3, 7), mat('logend', { map: GFX.TEX.logs() }), x, 0.035 + r * 0.06, z + (k - (n - r - 1) / 2) * 0.07, { rx: Math.PI / 2 });
    }
  }
  function fence(g, pts, h = 0.12, y0 = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      const n = Math.max(2, Math.round(len / 0.12));
      for (let k = 0; k <= n; k++) block(g, 0.02, h, 0.02, M.wood(), x0 + (x1 - x0) * k / n, y0, z0 + (z1 - z0) * k / n);
      for (const ry of [h * 0.45, h * 0.85]) add(g, boxGeo(len, 0.015, 0.012), M.wood(), (x0 + x1) / 2, y0 + ry, (z0 + z1) / 2, { ry: -ang });
    }
  }
  function flag(g, x, y, z, color, pole = 0.45) {
    add(g, cyl(0.012, 0.015, pole, 6), M.darkwood(), x, y + pole / 2, z);
    add(g, new T.SphereGeometry(0.02, 6, 4), M.gold(), x, y + pole, z);
    const geo = new T.PlaneGeometry(0.24, 0.14, 8, 3);
    geo.translate(0.12, 0, 0);
    const f = add(g, geo, M.flag(color), x, y + pole - 0.09, z, { dynamic: true });
    const base = geo.attributes.position.array.slice();
    anim(g, t => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3];
        p.setZ(i, Math.sin(t * 5 + bx * 25 + x) * 0.025 * (bx / 0.24));
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    });
    return f;
  }
  function torch(g, x, y, z) {
    block(g, 0.02, 0.08, 0.02, M.darkwood(), x, y, z);
    const fl = add(g, new T.ConeGeometry(0.025, 0.07, 6), M.torch(), x, y + 0.11, z, { dynamic: true, noShadow: true });
    anim(g, t => { fl.scale.set(1, 0.8 + Math.sin(t * 13 + x * 7) * 0.25, 1); });
    light(g, x, y + 0.12, z, 0xff9a40);
  }
  function anim(g, fn) { (g.userData.anim = g.userData.anim || []).push(fn); }
  function light(g, x, y, z, color) { (g.userData.lights = g.userData.lights || []).push({ x, y, z, color }); }
  function smokeAt(g, x, y, z, rate, dark) { (g.userData.smoke = g.userData.smoke || []).push({ x, y, z, rate, dark }); }

  // ---------- houses ----------
  function house(g, b) {
    const L = b.level, v = hash2(b.id || 1, 3, 1), yv = hash2(b.id || 1, 9, 2);
    const w = 0.62, d = 0.54, h = [0.4, 0.5, 0.78][L - 1];
    const cx = 0.5, cz = 0.5;
    const wallMat = [M.logs(), M.plaster(), M.stone()][L - 1];
    const roofMat = [M.thatch(), M.tiles(), M.slate()][L - 1];
    block(g, w + 0.06, 0.06, d + 0.06, M.stone(), cx, 0, cz);
    block(g, w, h, d, wallMat, cx, 0.06, cz);
    const top = 0.06 + h;
    if (L === 2) {        // timber framing
      for (const [x, z] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2], [cx, cz + d / 2], [cx + w / 2, cz]])
        block(g, 0.035, h, 0.035, M.beam(), x, 0.06, z);
      block(g, w + 0.02, 0.03, 0.03, M.beam(), cx, 0.06 + h * 0.55, cz + d / 2);
      block(g, 0.03, 0.03, d + 0.02, M.beam(), cx + w / 2, 0.06 + h * 0.55, cz);
      add(g, boxGeo(0.025, Math.hypot(w / 2, h * 0.45), 0.025), M.beam(), cx + w / 4, 0.06 + h * 0.775, cz + d / 2, { rz: Math.atan2(w / 2, h * 0.45) });
    }
    const ry = v < 0.5 ? 0 : Math.PI / 2;
    roof(g, (ry ? d : w) + 0.16, (ry ? w : d) + 0.16, L === 3 ? 0.36 : 0.32, roofMat, wallMat, cx, top, cz, ry);
    chimney(g, cx + (v < 0.5 ? -0.16 : 0.16), top, cz - 0.1, 0.3);
    door(g, cx - 0.14, 0.06, cz + d / 2 + 0.01, '+z');
    windowAt(g, cx + 0.14, 0.06 + h * 0.42, cz + d / 2 + 0.012, '+z');
    windowAt(g, cx + w / 2 + 0.012, 0.06 + h * 0.42, cz, '+x');
    windowAt(g, cx - 0.1, 0.06 + h * 0.42, cz - d / 2 - 0.012, '-z');
    if (L === 3) {
      windowAt(g, cx - 0.14, 0.06 + h * 0.78, cz + d / 2 + 0.012, '+z');
      windowAt(g, cx + 0.14, 0.06 + h * 0.78, cz + d / 2 + 0.012, '+z');
      windowAt(g, cx + w / 2 + 0.012, 0.06 + h * 0.78, cz, '+x');
    }
    // flower box
    block(g, 0.05, 0.03, 0.14, M.wood(), cx + w / 2 + 0.035, 0.06 + h * 0.42 - 0.04, cz);
    const fc = [0xe85d75, 0xf2d14b, 0xc77dde][Math.floor(v * 3)];
    for (let k = 0; k < 3; k++) add(g, new T.SphereGeometry(0.018, 5, 4), M.color(fc), cx + w / 2 + 0.04, 0.06 + h * 0.42 - 0.005, cz - 0.04 + k * 0.04);
    // yard
    if (yv < 0.33) { barrel(g, cx + w / 2 + 0.08, cz + d / 2 + 0.06); barrel(g, cx + w / 2 + 0.06, cz + d / 2 - 0.08); }
    else if (yv < 0.66) woodpile(g, cx - w / 2 - 0.08, cz, 3);
    else fence(g, [[0.04, 0.96], [0.96, 0.96], [0.96, 0.04]]);
  }

  // ---------- farm ----------
  const cropColors = [[0x6f9a3a, 0x8fb84a], [0x8a9a32, 0xc0c24a], [0xa8852e, 0xe0b846]];
  function farm(g, b) {
    const L = b.level;
    block(g, 1.92, 0.03, 1.92, M.field(), 1, 0, 1);
    // crops: one instanced mesh of swaying stalks
    const [stem, ear] = cropColors[L - 1];
    const stalk = GFX.merge([
      { geo: new T.CylinderGeometry(0.006, 0.01, 0.16, 4), matrix: new T.Matrix4().makeTranslation(0, 0.08, 0), color: stem },
      { geo: new T.ConeGeometry(0.022, 0.06, 5), matrix: new T.Matrix4().makeTranslation(0, 0.18, 0), color: ear },
      { geo: new T.CylinderGeometry(0.004, 0.006, 0.12, 4), matrix: new T.Matrix4().compose(new T.Vector3(0.02, 0.06, 0), new T.Quaternion().setFromEuler(new T.Euler(0, 0, -0.5)), new T.Vector3(1, 1, 1)), color: stem },
    ]);
    const spots = [];
    for (let zz = 0.15; zz < 1.88; zz += 0.11) for (let xx = 0.12; xx < 1.88; xx += 0.09) {
      if (xx < 0.95 && zz < 0.9) continue;          // barn corner
      spots.push([xx + (hash2(xx * 99, zz * 99, 5) - 0.5) * 0.03, zz]);
    }
    const im = new T.InstancedMesh(stalk, GFX.swayMaterial('crops'), spots.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3();
    spots.forEach(([x, z], i) => {
      const s = 0.8 + hash2(x * 50, z * 50, 6) * 0.45;
      q.setFromEuler(new T.Euler(0, hash2(x * 30, z * 30, 7) * 6, 0));
      m4.compose(new T.Vector3(x, 0.03, z), q, sc.set(s, s * (0.75 + L * 0.15), s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = true;
    im.userData.dynamic = true;
    g.add(im);
    // barn
    const redPlanks = mat('redplanks', { map: GFX.TEX.planks(), color: 0xe07058 });
    block(g, 0.66, 0.32, 0.58, redPlanks, 0.48, 0.03, 0.46);
    roof(g, 0.8, 0.72, 0.3, M.darkroof(), redPlanks, 0.48, 0.35, 0.46);
    block(g, 0.22, 0.24, 0.03, M.planks(), 0.48, 0.03, 0.76);
    add(g, boxGeo(0.03, 0.3, 0.02), M.plaster(), 0.48, 0.15, 0.78, { rz: 0.65 });
    add(g, boxGeo(0.03, 0.3, 0.02), M.plaster(), 0.48, 0.15, 0.78, { rz: -0.65 });
    // hay bales
    for (const [x, z] of [[0.15, 0.85], [0.26, 0.86]]) add(g, cyl(0.06, 0.06, 0.1, 10), M.thatch(), x, 0.09, z, { rz: Math.PI / 2 });
    fence(g, [[0.02, 1.98], [1.98, 1.98], [1.98, 0.02]], 0.1);
    if (L === 3) {         // windmill
      add(g, cyl(0.12, 0.18, 0.75, 10), M.plaster(), 0.18, 0.4, 1.7);
      add(g, new T.ConeGeometry(0.17, 0.22, 10), M.thatch(), 0.18, 0.88, 1.7);
      const hub = new T.Group(); hub.position.set(0.18, 0.66, 1.84); hub.userData.dynamic = true; g.add(hub);
      for (let k = 0; k < 4; k++) {
        const arm = new T.Mesh(boxGeo(0.06, 0.42, 0.01), M.planks()); arm.castShadow = true;
        arm.geometry.translate(0, 0.21, 0); arm.rotation.z = k * Math.PI / 2; hub.add(arm);
      }
      anim(g, t => { hub.rotation.z = t * 1.4; });
    }
  }

  // ---------- resource camps ----------
  function lumber(g, b) {
    block(g, 0.5, 0.28, 0.42, M.logs(), 0.35, 0.03, 0.32);
    roof(g, 0.64, 0.56, 0.24, M.thatch(), M.logs(), 0.35, 0.31, 0.32);
    door(g, 0.3, 0.03, 0.54, '+z', 0.12, 0.2);
    for (let k = 0; k < b.level + 1; k++) woodpile(g, 0.78, 0.25 + k * 0.25, 3);
    add(g, cyl(0.07, 0.08, 0.1, 9), M.wood(), 0.3, 0.05, 0.82);
    add(g, boxGeo(0.015, 0.16, 0.015), M.wood(), 0.3, 0.16, 0.82, { rz: 0.4 });
    add(g, boxGeo(0.05, 0.03, 0.01), M.iron(), 0.33, 0.23, 0.82, { rz: 0.4 });
  }
  function quarry(g, b) {
    block(g, 0.86, 0.02, 0.86, M.darkstone(), 0.5, 0, 0.5);
    const steps = [[0.25, 0.25, 0.12], [0.5, 0.25, 0.2], [0.75, 0.25, 0.28], [0.25, 0.5, 0.08], [0.75, 0.55, 0.16], [0.25, 0.75, 0.05]];
    for (const [x, z, h] of steps) block(g, 0.24, h, 0.24, M.stone(), x, 0.02, z);
    for (let k = 0; k < 3 + b.level; k++) block(g, 0.08, 0.06, 0.08, M.stone(), 0.55 + (k % 3) * 0.1, 0.02, 0.78 + Math.floor(k / 3) * 0.1, { ry: k });
    // wooden crane
    block(g, 0.03, 0.5, 0.03, M.wood(), 0.85, 0.02, 0.85);
    add(g, boxGeo(0.4, 0.025, 0.025), M.wood(), 0.7, 0.5, 0.85);
    add(g, cyl(0.003, 0.003, 0.25, 4), M.darkwood(), 0.52, 0.38, 0.85);
    block(g, 0.07, 0.05, 0.07, M.stone(), 0.52, 0.22, 0.85);
  }
  const ORE_COL = { ironOre: 0x9a5a3a, copperOre: 0xd0813f, tinOre: 0xd0d0d0, zincOre: 0x8fa3b5 };
  function mine(g, b) {
    const rock = mat('rock', { color: 0x857565, flatShading: true });
    const mound = add(g, new T.IcosahedronGeometry(0.5, 0), rock, 0.48, 0.12, 0.42);
    mound.scale.set(1, 0.65, 0.95);
    add(g, new T.IcosahedronGeometry(0.22, 0), rock, 0.2, 0.08, 0.25);
    // timber entrance on the +z face
    block(g, 0.26, 0.24, 0.05, mat('void', { color: 0x120d0a }), 0.5, 0.02, 0.86);
    block(g, 0.04, 0.26, 0.05, M.wood(), 0.36, 0.02, 0.88); block(g, 0.04, 0.26, 0.05, M.wood(), 0.64, 0.02, 0.88);
    block(g, 0.34, 0.04, 0.06, M.wood(), 0.5, 0.27, 0.88);
    // rails + cart
    for (const x of [0.45, 0.55]) block(g, 0.015, 0.012, 0.3, M.iron(), x, 0.02, 1.0);
    block(g, 0.16, 0.08, 0.12, M.darkwood(), 0.5, 0.04, 0.96);
    for (let k = 0; k < 4; k++) add(g, new T.IcosahedronGeometry(0.03, 0), M.color(ORE_COL[b.ore] || 0x9a5a3a), 0.46 + (k % 2) * 0.07, 0.13, 0.94 + Math.floor(k / 2) * 0.04);
    torch(g, 0.3, 0.1, 0.9);
  }

  // ---------- refineries ----------
  const REF_ACC = { planks: 0xc99a5b, charcoal: 0x4a4440, iron: 0x8a96a2, bronze: 0xc8833f, brass: 0xe3c050, steel: 0x6f9fd0, damascus: 0x5fd6d0 };
  function refinery(g, b) {
    const def = BUILDINGS[b.type], rec = def.recipe, L = b.level, acc = REF_ACC[rec];
    if (rec === 'planks') {
      for (const [x, z] of [[0.18, 0.2], [0.72, 0.2], [0.18, 0.75], [0.72, 0.75]]) block(g, 0.05, 0.36, 0.05, M.wood(), x, 0, z);
      roof(g, 0.74, 0.74, 0.22, M.tiles(), M.planks(), 0.45, 0.36, 0.48);
      block(g, 0.45, 0.12, 0.12, M.planks(), 0.45, 0, 0.48);
      const blade = add(g, cyl(0.1, 0.1, 0.01, 18), M.iron(), 0.45, 0.17, 0.48, { rx: Math.PI / 2, dynamic: true });
      anim(g, (t, act) => { if (act) blade.rotation.y = t * 10; });
      woodpile(g, 0.85, 0.5, 3);
      for (let k = 0; k < 4; k++) block(g, 0.3, 0.02, 0.06, M.planks(), 0.4, k * 0.022, 0.88);
    } else if (rec === 'charcoal') {
      const dome = add(g, new T.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('kiln', { color: 0x5a4436, flatShading: true }), 0.48, 0, 0.45);
      dome.scale.set(1, 0.85, 1);
      block(g, 0.12, 0.1, 0.05, M.fire(), 0.48, 0, 0.78);
      block(g, 0.18, 0.04, 0.06, M.darkstone(), 0.48, 0.1, 0.79);
      woodpile(g, 0.86, 0.3, 3);
      smokeAt(g, 0.48, 0.32, 0.45, 0.25, true);
      light(g, 0.48, 0.08, 0.82, 0xff7a2a);
    } else if (rec === 'damascus') {
      add(g, cyl(0.22, 0.26, 0.9 + L * 0.08, 12), M.darkstone(), 0.5, (0.9 + L * 0.08) / 2, 0.5);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; block(g, 0.07, 0.07, 0.07, M.darkstone(), 0.5 + Math.cos(a) * 0.22, 0.9 + L * 0.08, 0.5 + Math.sin(a) * 0.22); }
      const orb = add(g, new T.SphereGeometry(0.08, 14, 10), M.crucible(), 0.5, 1.08 + L * 0.08, 0.5, { dynamic: true, noShadow: true });
      anim(g, t => { const s = 1 + Math.sin(t * 3) * 0.12; orb.scale.set(s, s, s); });
      door(g, 0.5, 0, 0.75, '+z');
      light(g, 0.5, 1.1 + L * 0.08, 0.5, 0x5fe0d8);
    } else {
      const h = 0.36 + L * 0.06;
      block(g, 0.72, h, 0.66, M.darkstone(), 0.45, 0, 0.45);
      roof(g, 0.84, 0.78, 0.2, mat('roof' + acc, { map: GFX.TEX.slate(), color: acc }), M.darkstone(), 0.45, h, 0.45);
      block(g, 0.2, 0.16, 0.04, M.fire(), 0.35, 0.02, 0.79);
      light(g, 0.35, 0.1, 0.85, 0xff7a2a);
      const chimneys = rec === 'steel' ? 2 : 1;
      for (let k = 0; k < chimneys; k++) {
        const x = 0.2 + k * 0.4, ch = 0.55 + L * 0.08;
        add(g, cyl(0.07, 0.09, ch, 10), M.stone(), x, h + ch / 2, 0.3);
        smokeAt(g, x, h + ch + 0.05, 0.3, 0.3, true);
      }
      crate(g, 0.82, 0.85); barrel(g, 0.12, 0.88);
      // ingots stacked by the door
      for (let k = 0; k < 3; k++) block(g, 0.07, 0.025, 0.035, M.color(acc), 0.65 + (k % 2) * 0.03, Math.floor(k / 2) * 0.025, 0.85 + k * 0.01);
    }
    // tier studs
    for (let k = 0; k < L; k++) add(g, new T.SphereGeometry(0.025, 8, 6), M.gold(), 0.93, 0.05 + k * 0.06, 0.15);
  }

  // ---------- defence & horses ----------
  function watchtower(g, b) {
    const stone = b.level === 2, h = stone ? 1.15 : 0.95;
    if (stone) {
      block(g, 0.42, h, 0.42, M.stone(), 0.5, 0, 0.5);
      for (const [x, z] of [[0.31, 0.31], [0.69, 0.31], [0.31, 0.69], [0.69, 0.69], [0.5, 0.31], [0.5, 0.69], [0.31, 0.5], [0.69, 0.5]]) block(g, 0.08, 0.08, 0.08, M.stone(), x, h, z);
      windowAt(g, 0.5, h * 0.6, 0.715, '+z', 0.05, 0.12);
    } else {
      for (const [x, z] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) block(g, 0.05, h, 0.05, M.logs(), x, 0, z);
      add(g, boxGeo(0.03, 0.5, 0.03), M.wood(), 0.5, 0.3, 0.7, { rz: 0.75 });
      add(g, boxGeo(0.03, 0.5, 0.03), M.wood(), 0.7, 0.3, 0.5, { rx: 0.75 });
      block(g, 0.52, 0.04, 0.52, M.planks(), 0.5, h, 0.5);
      fence(g, [[0.26, 0.26], [0.74, 0.26], [0.74, 0.74], [0.26, 0.74], [0.26, 0.26]], 0.1, h + 0.04);
    }
    for (const [x, z] of [[0.28, 0.28], [0.72, 0.72]]) block(g, 0.03, 0.22, 0.03, M.wood(), x, h + 0.04, z);
    add(g, pyramidGeo(0.6, 0.6, 0.3), M.darkroof(), 0.5, h + 0.26, 0.5);
    flag(g, 0.5, h + 0.55, 0.5, 0xc0392b, 0.3);
    torch(g, 0.5, h + 0.06, 0.74);
  }
  function horseModel(color) {
    const h = new T.Group(), m = M.color(color);
    add(h, boxGeo(0.2, 0.08, 0.07), m, 0, 0.12, 0);
    add(h, boxGeo(0.05, 0.1, 0.05), m, 0.11, 0.18, 0, { rz: -0.5 });
    add(h, boxGeo(0.08, 0.04, 0.045), m, 0.15, 0.22, 0);
    for (const [x, z] of [[-0.08, -0.025], [-0.08, 0.025], [0.08, -0.025], [0.08, 0.025]]) add(h, boxGeo(0.02, 0.09, 0.02), m, x, 0.045, z);
    add(h, boxGeo(0.02, 0.07, 0.015), M.darkwood(), -0.11, 0.1, 0, { rz: 0.4 });
    return h;
  }
  function stables(g, b) {
    block(g, 1.8, 0.34, 0.66, M.planks(), 1, 0.02, 0.42);
    roof(g, 1.94, 0.82, 0.28, M.darkroof(), M.planks(), 1, 0.36, 0.42);
    for (let k = 0; k < 4; k++) door(g, 0.35 + k * 0.42, 0.02, 0.76, '+z', 0.16, 0.2);
    fence(g, [[0.08, 0.95], [1.92, 0.95], [1.92, 1.92], [0.08, 1.92], [0.08, 0.95]]);
    const herd = new T.Group(); herd.userData.dynamic = true; g.add(herd);
    const horses = [0x6b3e1f, 0x3a2a1e, 0xa0703e, 0xd9c7a8].slice(0, 2 + b.level).map((c, i) => { const hm = horseModel(c); hm.position.set(0.4 + i * 0.4, 0, 1.4); herd.add(hm); return hm; });
    anim(g, t => horses.forEach((hm, i) => {
      const a = t * 0.25 + i * 1.7;
      hm.position.x = 1 + Math.cos(a) * (0.55 - i * 0.05); hm.position.z = 1.43 + Math.sin(a) * 0.3;
      hm.rotation.y = -a - Math.PI / 2;
    }));
    block(g, 0.3, 0.06, 0.1, M.wood(), 1.6, 0.02, 1.15);
  }

  // ---------- command center ----------
  function townhall(g, b) {
    const L = b.level, hh = 0.55 + L * 0.06;
    block(g, 1.76, 0.08, 1.76, M.stone(), 1, 0, 1);
    // tower at the back corner
    const th = 1.2 + L * 0.15;
    block(g, 0.5, th, 0.5, M.stone(), 0.42, 0.08, 0.42);
    add(g, pyramidGeo(0.62, 0.62, 0.45), M.slate(), 0.42, 0.08 + th, 0.42);
    add(g, cyl(0.09, 0.09, 0.02, 16), M.plaster(), 0.42, th - 0.1, 0.675, { rx: Math.PI / 2 });
    add(g, boxGeo(0.01, 0.07, 0.006), M.darkwood(), 0.42, th - 0.08, 0.69);
    windowAt(g, 0.42, th * 0.55, 0.675, '+z', 0.08, 0.16);
    flag(g, 0.42, 0.53 + th, 0.42, 0xd4a017, 0.4);
    // L-shaped hall
    block(g, 1.6, hh, 0.95, M.stone(), 1, 0.08, 1.35);
    roof(g, 1.72, 1.08, 0.42, M.slate(), M.stone(), 1, 0.08 + hh, 1.35);
    block(g, 0.95, hh, 0.7, M.stone(), 1.4, 0.08, 0.5);
    roof(g, 0.82, 1.08, 0.36, M.slate(), M.stone(), 1.4, 0.08 + hh, 0.5, Math.PI / 2);
    for (let k = 0; k < 4; k++) windowAt(g, 0.4 + k * 0.4, 0.08 + hh * 0.45, 1.83, '+z', 0.1, 0.18);
    for (let k = 0; k < 2; k++) windowAt(g, 1.885, 0.08 + hh * 0.45, 0.35 + k * 0.32, '+x', 0.1, 0.18);
    windowAt(g, 1.885, 0.08 + hh * 0.45, 1.35, '+x', 0.1, 0.18);
    door(g, 1, 0.08, 1.84, '+z', 0.2, 0.32);
    block(g, 0.4, 0.04, 0.12, M.stone(), 1, 0, 1.92); block(g, 0.4, 0.04, 0.08, M.stone(), 1, 0.04, 1.9);
    for (const x of [0.7, 1.3]) { flag(g, x, 0.08, 1.95, x < 1 ? 0x2c4f8a : 0xb5462e, 0.55); torch(g, x + 0.05, 0.25, 1.85); }
  }
  function forge(g, b) {
    const L = b.level, h = 0.5 + L * 0.05;
    block(g, 1.6, h, 1.3, M.darkstone(), 0.95, 0, 0.8);
    roof(g, 1.74, 1.44, 0.4, M.darkroof(), M.darkstone(), 0.95, h, 0.8);
    // open hearth front
    block(g, 0.6, 0.3, 0.04, M.fire(), 0.55, 0.02, 1.46);
    block(g, 0.72, 0.06, 0.08, M.beam(), 0.55, 0.32, 1.47);
    light(g, 0.55, 0.2, 1.6, 0xff7a2a);
    windowAt(g, 1.765, h * 0.5, 0.7, '+x', 0.14, 0.12);
    // great chimney
    const ch = 0.85 + L * 0.1;
    block(g, 0.34, ch, 0.34, M.stone(), 1.45, h, 0.45);
    block(g, 0.42, 0.06, 0.42, M.darkstone(), 1.45, h + ch, 0.45);
    smokeAt(g, 1.45, h + ch + 0.1, 0.45, 0.55, true);
    g.userData.sparks = { x: 1.45, y: h + ch + 0.1, z: 0.45 };
    // anvil, grindstone, trough
    const anvilY = 0.12;
    block(g, 0.08, anvilY, 0.08, M.darkwood(), 0.9, 0, 1.7);
    block(g, 0.16, 0.05, 0.07, M.iron(), 0.9, anvilY, 1.7);
    add(g, new T.ConeGeometry(0.035, 0.07, 6), M.iron(), 0.995, anvilY + 0.025, 1.7, { rz: -Math.PI / 2 });
    add(g, cyl(0.08, 0.08, 0.03, 14), M.stone(), 1.25, 0.12, 1.7, { rx: Math.PI / 2 });
    block(g, 0.04, 0.1, 0.1, M.wood(), 1.25, 0, 1.7);
    block(g, 0.3, 0.08, 0.12, M.planks(), 1.6, 0, 1.7);
    block(g, 0.26, 0.02, 0.08, mat('trough', { color: 0x3d6f9a, roughness: 0.2 }), 1.6, 0.075, 1.7);
    // tools rack
    for (let k = 0; k < 3; k++) add(g, boxGeo(0.012, 0.2, 0.012), M.iron(), 0.25 + k * 0.05, 0.12, 1.47, { rz: 0.1 * (k - 1) });
    flag(g, 0.2, h, 1.45, 0xb5462e, 0.35);
  }
  function market(g, b) {
    block(g, 1.9, 0.02, 1.9, M.dirt(), 1, 0, 1);
    const stalls = [[0.45, 0.45, 0xc0392b], [1.5, 0.45, 0x2e86c1], [0.45, 1.5, 0x27ae60], [1.5, 1.5, 0xd4a017]];
    const goods = [0xd9534f, 0xf0ad4e, 0x8fbc5a, 0xa0703e, 0xe8e0c0];
    stalls.slice(0, b.level === 1 ? 3 : 4).forEach(([x, z, c], i) => {
      for (const [dx, dz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) block(g, 0.03, dz < 0 ? 0.42 : 0.34, 0.03, M.wood(), x + dx, 0, z + dz);
      block(g, 0.56, 0.16, 0.18, M.planks(), x, 0, z + 0.12);
      const tarp = add(g, boxGeo(0.62, 0.015, 0.52), M.cloth(c), x, 0.38, z, { rx: 0.17 });
      for (let k = 0; k < 6; k++) add(g, new T.SphereGeometry(0.03, 6, 5), M.color(goods[(k + i) % goods.length]), x - 0.2 + k * 0.08, 0.19, z + 0.12);
      crate(g, x + 0.33, z - 0.15, 0.1);
    });
    if (b.level === 1) { crate(g, 1.4, 1.4); crate(g, 1.55, 1.5, 0.1); barrel(g, 1.6, 1.3); }
    // well in the middle
    add(g, cyl(0.12, 0.13, 0.12, 14), M.stone(), 1, 0.08, 1);
    for (const dx of [-0.1, 0.1]) block(g, 0.02, 0.25, 0.02, M.wood(), 1 + dx, 0.12, 1);
    add(g, pyramidGeo(0.3, 0.3, 0.1), M.tiles(), 1, 0.36, 1);
    flag(g, 1, 0.45, 1, 0xe67e22, 0.25);
  }
  function barracks(g, b) {
    const L = b.level, h = 0.4 + L * 0.06;
    block(g, 1.8, h, 0.78, M.stone(), 1, 0, 0.48);
    roof(g, 1.94, 0.94, 0.32, M.tiles(), M.stone(), 1, h, 0.48);
    for (let k = 0; k < 5; k++) windowAt(g, 0.25 + k * 0.38, h * 0.5, 0.875, '+z', 0.08, 0.12);
    door(g, 1, 0, 0.88, '+z', 0.18, 0.26);
    block(g, 1.7, 0.02, 0.85, M.dirt(), 1, 0, 1.45);
    // training dummies
    for (let k = 0; k < 3; k++) {
      const x = 0.4 + k * 0.5;
      block(g, 0.03, 0.26, 0.03, M.wood(), x, 0.02, 1.45);
      add(g, boxGeo(0.2, 0.025, 0.025), M.wood(), x, 0.2, 1.45);
      add(g, new T.SphereGeometry(0.05, 8, 6), M.thatch(), x, 0.3, 1.45);
      add(g, cyl(0.045, 0.05, 0.1, 8), M.thatch(), x, 0.18, 1.45);
    }
    // archery target
    for (const [r, c, dz] of [[0.12, 0xf2efe6, 0], [0.08, 0xc0392b, 0.004], [0.04, 0xf2d14b, 0.008]]) add(g, cyl(r, r, 0.02, 16), M.color(c), 1.75, 0.2, 1.75 + dz, { rx: Math.PI / 2 });
    // spear rack
    block(g, 0.3, 0.03, 0.03, M.wood(), 1.65, 0.15, 1.05);
    for (let k = 0; k < 5; k++) add(g, cyl(0.006, 0.006, 0.42, 4), M.wood(), 1.53 + k * 0.06, 0.21, 1.05, { rz: 0.1 });
    flag(g, 1.9, h, 0.1, 0xc0392b, 0.45);
    flag(g, 0.1, h, 0.85, 0x2c4f8a, 0.45);
  }

  // ---------- construction scaffold ----------
  function scaffold(g, b) {
    const s = BUILDINGS[b.type].size;
    block(g, s - 0.1, 0.02, s - 0.1, M.dirt(), s / 2, 0, s / 2);
    const grow = new T.Group(); grow.userData.dynamic = true; g.add(grow);
    const shell = new T.Mesh(boxGeo(s - 0.3, 1, s - 0.3), M.planks()); shell.position.set(s / 2, 0.5, s / 2); shell.castShadow = true; grow.add(shell);
    for (const [x, z] of [[0.08, 0.08], [s - 0.08, 0.08], [0.08, s - 0.08], [s - 0.08, s - 0.08]]) block(g, 0.03, 0.6 * s, 0.03, M.wood(), x, 0, z);
    for (const y of [0.25 * s, 0.5 * s]) {
      block(g, s - 0.1, 0.02, 0.06, M.planks(), s / 2, y, 0.08);
      block(g, 0.06, 0.02, s - 0.1, M.planks(), s - 0.08, y, s / 2);
    }
    woodpile(g, s - 0.15, s + 0.05, 2);
    g.userData.grow = grow;
  }

  // Build the model for a building's current state
  function build(b) {
    const g = new T.Group();
    if (b.built < 1) scaffold(g, b);
    else {
      const def = BUILDINGS[b.type];
      if (def.refinery) refinery(g, b);
      else ({ house, farm, lumber, quarry, mine, watchtower, stables, townhall, forge, market, barracks }[b.type])(g, b);
    }
    return g;
  }

  // ---------- wall pieces ----------
  function wallPiece(g, sg, stone, tall) {
    const h = stone ? 0.55 : tall ? 0.48 : 0.38;
    if (sg.tower) {
      const x = sg.vx, z = sg.vy;
      if (stone) {
        add(g, cyl(0.32, 0.36, h + 0.35, 12), M.stone(), x, (h + 0.35) / 2, z);
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; block(g, 0.09, 0.09, 0.09, M.stone(), x + Math.cos(a) * 0.3, h + 0.35, z + Math.sin(a) * 0.3); }
      } else {
        block(g, 0.5, h + 0.3, 0.5, M.logs(), x, 0, z);
        add(g, pyramidGeo(0.66, 0.66, 0.3), M.darkroof(), x, h + 0.3, z);
      }
      torch(g, x + 0.28, h * 0.6, z + 0.28);
      return;
    }
    const along = sg.side === 'n' || sg.side === 's';
    const cx = along ? sg.x + 0.5 : (sg.side === 'w' ? sg.x : sg.x + 1);
    const cz = along ? (sg.side === 'n' ? sg.y : sg.y + 1) : sg.y + 0.5;
    if (sg.gate) {
      const wallM = stone ? M.stone() : M.logs();
      for (const o of [-0.42, 0.42]) block(g, along ? 0.18 : 0.26, h + 0.25, along ? 0.26 : 0.18, wallM, cx + (along ? o : 0), 0, cz + (along ? 0 : o));
      block(g, along ? 1.02 : 0.24, 0.12, along ? 0.24 : 1.02, wallM, cx, h + 0.13, cz);
      for (const o of [-0.42, 0.42]) torch(g, cx + (along ? o : 0.15), h * 0.7, cz + (along ? 0.15 : o));
      return;
    }
    if (stone) {
      block(g, along ? 1 : 0.2, h, along ? 0.2 : 1, M.stone(), cx, 0, cz);
      for (let k = 0; k < 4; k++) {
        const o = -0.375 + k * 0.25;
        block(g, along ? 0.13 : 0.22, 0.09, along ? 0.22 : 0.13, M.stone(), cx + (along ? o : 0), h, cz + (along ? 0 : o));
      }
    } else {
      // sharpened palisade logs
      const logM = mat('palisade', { map: GFX.TEX.logs(), color: 0xc8a882 });
      for (let k = 0; k < 7; k++) {
        const o = -0.43 + k * 0.143;
        const x = cx + (along ? o : 0), z = cz + (along ? 0 : o), hh = h * (0.92 + hash2(x * 9, z * 9, 2) * 0.16);
        add(g, cyl(0.065, 0.07, hh, 7), logM, x, hh / 2, z);
        add(g, new T.ConeGeometry(0.065, 0.12, 7), logM, x, hh + 0.06, z);
      }
      if (tall) block(g, along ? 1 : 0.06, 0.04, along ? 0.06 : 1, M.wood(), cx + (along ? 0 : -0.09), h * 0.6, cz + (along ? -0.09 : 0));
    }
  }

  return { build, wallPiece, horseModel, flag, barrel, crate, torch, anim };
})();
