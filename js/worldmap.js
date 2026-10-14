// ============================================================
//  3D world map: an island realm with every city modelled as a
//  village, walled town or castle, roads between them, forests,
//  peaks and drifting clouds. Click a city to inspect it.
// ============================================================

const WorldMap = (() => {
  const T = THREE;
  const SCALE = 2.2;                       // world-map coords -> 3D units
  let root = null, canvas, labels, renderer, scene, camera, raf = 0, last = 0;
  let terrain, cityGroups = {}, hitboxes = [], armyMarkers = [], clouds = [];
  let sunL;
  const view = { yaw: 0.6, pitch: 0.95, dist: 58, tyaw: 0.6, tpitch: 0.95, tdist: 58 };
  let hoverId = null, onSelect = null, builtKey = '';
  const raycaster = new T.Raycaster();

  const cityPos = k => [k.x * SCALE, k.y * SCALE];
  // island height: hills, a central plain, peaks in the far north-west
  function heightAt(x, z) {
    const r = Math.hypot(x / 34, z / 30);
    const island = 1 - Math.pow(Math.min(1.3, r), 3);
    let h = island * 1.6 + (smoothNoise(x + 40, z + 40, 9, 11) - 0.5) * 2.4 * island + (smoothNoise(x, z, 3.5, 12) - 0.5) * 0.5;
    const ridge = Math.max(0, 1 - Math.hypot((x + 22) / 12, (z - 2) / 18));
    h += Math.pow(ridge, 1.5) * 6 * smoothNoise(x, z, 4, 13);
    // flatten ground under the cities
    for (const k of KINGDOMS.concat([{ x: 0, y: 0 }])) {
      const [cx, cz] = cityPos(k), d = Math.hypot(x - cx, z - cz);
      if (d < 2.6) { const f = Math.pow(1 - d / 2.6, 0.7); h = h * (1 - f) + 0.45 * f; }
    }
    return h;
  }

  function build() {
    canvas = document.createElement('canvas');
    canvas.className = 'wm-canvas';
    labels = document.createElement('div');
    labels.className = 'wm-labels';
    root = document.createElement('div');
    root.className = 'wm-root';
    root.append(canvas, labels);
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.outputColorSpace = T.SRGBColorSpace;
    scene = new T.Scene();
    scene.background = new T.Color(0x9fc3d6);
    scene.fog = new T.Fog(0x9fc3d6, 70, 150);
    camera = new T.PerspectiveCamera(38, 1, 0.5, 400);
    scene.add(new T.HemisphereLight(0xdff0ff, 0x4a5a3a, 1));
    sunL = new T.DirectionalLight(0xfff0d8, 2.4);
    sunL.position.set(-30, 45, 25); sunL.castShadow = true;
    sunL.shadow.mapSize.set(2048, 2048);
    Object.assign(sunL.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
    sunL.shadow.bias = -0.0006;
    scene.add(sunL);
    buildTerrain();
    buildCities();
    buildRoads();
    buildClouds();
    // input
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
    window.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        view.tyaw -= dx * 0.006; view.tpitch = Math.max(0.45, Math.min(1.35, view.tpitch + dy * 0.004));
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (e.target === canvas) {
        hoverId = pickAt(e);
        canvas.style.cursor = hoverId ? 'pointer' : 'grab';
      }
    });
    window.addEventListener('pointerup', e => {
      if (drag && !drag.moved && e.target === canvas) { const id = pickAt(e); if (id && onSelect) onSelect(id); }
      drag = null;
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.tdist = Math.max(25, Math.min(95, view.tdist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  }

  function buildTerrain() {
    const size = 110, seg = 160;
    const geo = new T.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
      pos.setY(i, h);
      if (h < 0.08) c.set('#c9b98a');
      else if (h < 0.3) c.set('#d6c48a').lerp(new T.Color('#79a64a'), (h - 0.08) / 0.22);
      else if (h < 2.2) c.set('#6a9a44').lerp(new T.Color('#4f7c35'), smoothNoise(x, z, 4, 14));
      else if (h < 4) c.set('#7d7466').lerp(new T.Color('#8f897e'), (h - 2.2) / 1.8);
      else c.set('#e8eef2');
      if (h < -0.4) c.set('#9b8a62');
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const tex = GFX.TEX.ground().clone(); tex.needsUpdate = true; tex.repeat.set(30, 30);
    terrain = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1, flatShading: false }));
    terrain.receiveShadow = true;
    scene.add(terrain);
    const wtex = GFX.TEX.water().clone(); wtex.needsUpdate = true; wtex.repeat.set(14, 14);
    const sea = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: 0x2f6f9f, map: wtex, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0.02; sea.userData.water = true;
    scene.add(sea);
    // forests
    const geos = GFX.trees(), lists = { pine: [], oak: [] };
    for (let i = 0; i < 2600; i++) {
      const x = (hash2(i, 1, 61) - 0.5) * 100, z = (hash2(i, 2, 61) - 0.5) * 90;
      const h = heightAt(x, z);
      if (h < 0.4 || h > 3) continue;
      if (smoothNoise(x, z, 6, 62) < 0.45) continue;
      if (KINGDOMS.concat([{ x: 0, y: 0 }]).some(k => { const [cx, cz] = cityPos(k); return Math.hypot(x - cx, z - cz) < 2.4; })) continue;
      (h > 1.8 || i % 3 ? lists.pine : lists.oak).push([x, h, z, 0.9 + hash2(i, 3, 61) * 0.6]);
    }
    for (const k in lists) {
      const im = new T.InstancedMesh(geos[k], GFX.swayMaterial('tree'), lists[k].length);
      const m4 = new T.Matrix4();
      lists[k].forEach(([x, y, z, s], i) => im.setMatrixAt(i, m4.compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(s, s, s))));
      im.castShadow = true; im.receiveShadow = true;
      scene.add(im);
    }
  }

  // ---------- cities ----------
  function cityModel(kd, idx, conquered) {
    const g = new T.Group();
    const roofHex = conquered ? 0x3b6fc4 : new T.Color(kd.color).getHex();
    const roofM = GFX.mat('wmroof' + roofHex, { map: GFX.TEX.tiles(), color: new T.Color(roofHex).lerp(new T.Color(0xffffff), 0.25) });
    const tier = kd.capital ? 4 : idx < 3 ? 0 : idx < 7 ? 1 : idx < 13 ? 2 : 3;
    const houses = [5, 8, 10, 12, 14][tier];
    for (let i = 0; i < houses; i++) {
      const a = i / houses * Math.PI * 2 + hash2(idx, i, 3), r = 0.6 + hash2(idx, i, 4) * (0.6 + tier * 0.15);
      const hx = Math.cos(a) * r, hz = Math.sin(a) * r, s = 0.22 + hash2(idx, i, 5) * 0.08;
      GFX.block(g, s, s * 0.9, s * 0.8, GFX.M.plaster(), hx, 0, hz, { ry: a });
      GFX.roof(g, s + 0.06, s * 0.8 + 0.06, s * 0.5, roofM, GFX.M.plaster(), hx, s * 0.9, hz, a);
    }
    if (tier >= 1) {       // walls
      const R = 1.45 + tier * 0.15, n = 16;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, a2 = (k + 1) / n * Math.PI * 2;
        const x0 = Math.cos(a) * R, z0 = Math.sin(a) * R, x1 = Math.cos(a2) * R, z1 = Math.sin(a2) * R;
        GFX.add(g, GFX.boxGeo(Math.hypot(x1 - x0, z1 - z0) + 0.05, 0.28, 0.1), tier >= 2 ? GFX.M.stone() : GFX.mat('wmpal', { map: GFX.TEX.logs() }), (x0 + x1) / 2, 0.14, (z0 + z1) / 2, { ry: -Math.atan2(z1 - z0, x1 - x0) });
        if (k % 4 === 0) {
          GFX.add(g, new T.CylinderGeometry(0.14, 0.16, 0.5, 8), GFX.M.stone(), x0, 0.25, z0);
          GFX.add(g, new T.ConeGeometry(0.18, 0.25, 8), roofM, x0, 0.62, z0);
        }
      }
    } else {
      GFX.add(g, new T.CylinderGeometry(0.1, 0.11, 0.08, 10), GFX.M.stone(), 0, 0.04, 0);
    }
    if (tier >= 2) {       // keep
      const kh = 0.6 + tier * 0.25;
      GFX.block(g, 0.6, kh, 0.6, GFX.M.stone(), 0, 0, 0);
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        GFX.add(g, new T.CylinderGeometry(0.11, 0.12, kh + 0.3, 8), GFX.M.stone(), x, (kh + 0.3) / 2, z);
        GFX.add(g, new T.ConeGeometry(0.14, 0.28, 8), roofM, x, kh + 0.44, z);
      }
      GFX.add(g, GFX.pyramidGeo(0.62, 0.62, 0.35), roofM, 0, kh, 0);
    } else {
      GFX.block(g, 0.32, 0.35, 0.32, GFX.M.planks(), 0, 0, 0);
      GFX.add(g, GFX.pyramidGeo(0.42, 0.42, 0.28), roofM, 0, 0.35, 0);
    }
    const top = tier >= 2 ? 1.0 + tier * 0.25 : 0.65;
    GFX.add(g, new T.CylinderGeometry(0.015, 0.015, 0.7, 5), GFX.M.darkwood(), 0, top + 0.35, 0);
    GFX.add(g, new T.BoxGeometry(0.4, 0.24, 0.015), GFX.M.flag(conquered ? 0x3b6fc4 : roofHex), 0.2, top + 0.58, 0);
    if (conquered) GFX.add(g, new T.OctahedronGeometry(0.1, 0), GFX.M.gold(), 0, top + 0.8, 0);
    return GFX.bake(g);
  }
  function buildCities() {
    for (const id in cityGroups) scene.remove(cityGroups[id]);
    for (const h of hitboxes) scene.remove(h);
    cityGroups = {}; hitboxes = [];
    const all = KINGDOMS.map((k, i) => ({ k, i })).concat([{ k: { id: 'home', x: 0, y: 0, color: '#3b6fc4', capital: true, name: 'Emberfall' }, i: 99 }]);
    for (const { k, i } of all) {
      const conquered = k.id === 'home' || kingdomState(k.id).conquered;
      const g = cityModel(k, i, conquered);
      const [x, z] = cityPos(k);
      g.position.set(x, heightAt(x, z), z);
      g.scale.setScalar(k.capital ? 1.35 : 1.1);
      scene.add(g);
      cityGroups[k.id] = g;
      if (k.id !== 'home') {
        const hb = new T.Mesh(new T.CylinderGeometry(2, 2, 3, 8), new T.MeshBasicMaterial({ visible: false }));
        hb.position.set(x, g.position.y + 1, z); hb.userData.id = k.id;
        scene.add(hb); hitboxes.push(hb);
      }
    }
    // labels
    labels.innerHTML = all.map(({ k }) => `<div class="wm-label ${k.id === 'home' ? 'home' : ''}" data-id="${k.id}"><span class="dotc" style="background:${k.color}"></span>${k.name}</div>`).join('');
    builtKey = conquestKey();
  }
  function buildRoads() {
    const pts = KINGDOMS.map(k => ({ id: k.id, p: cityPos(k) })).concat([{ id: 'home', p: [0, 0] }]);
    const done = new Set();
    const roadM = GFX.mat('wmroad', { map: GFX.TEX.dirt(), color: 0xd8c39a });
    for (const a of pts) {
      const near = pts.filter(b => b !== a).sort((u, v) => Math.hypot(u.p[0] - a.p[0], u.p[1] - a.p[1]) - Math.hypot(v.p[0] - a.p[0], v.p[1] - a.p[1])).slice(0, 2);
      for (const b of near) {
        const key = [a.id, b.id].sort().join('-');
        if (done.has(key)) continue;
        done.add(key);
        const curvePts = [];
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const x = a.p[0] + (b.p[0] - a.p[0]) * t + Math.sin(t * Math.PI) * (hash2(a.p[0], b.p[1], 3) - 0.5) * 3;
          const z = a.p[1] + (b.p[1] - a.p[1]) * t;
          curvePts.push(new T.Vector3(x, Math.max(0.1, heightAt(x, z)) + 0.06, z));
        }
        const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(curvePts), 60, 0.12, 4, false), roadM);
        tube.scale.y = 0.4; tube.receiveShadow = true;
        scene.add(tube);
      }
    }
  }
  function buildClouds() {
    const cm = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 10; i++) {
      const items = [];
      for (let k = 0; k < 6; k++) items.push({ geo: new T.IcosahedronGeometry(1.6, 1), matrix: new T.Matrix4().compose(new T.Vector3((k - 2.5) * 1.7, Math.sin(k) * 0.6, (k % 3 - 1) * 1.2), new T.Quaternion(), new T.Vector3(1.2, 0.7, 1)) });
      const c = new T.Mesh(GFX.merge(items), cm);
      c.castShadow = true;
      c.position.set(-60 + hash2(i, 1, 71) * 120, 14 + hash2(i, 2, 71) * 4, -45 + hash2(i, 3, 71) * 90);
      clouds.push(c); scene.add(c);
    }
  }
  function armyModel(color) {
    const g = new T.Group();
    for (let k = 0; k < 7; k++) {
      GFX.add(g, new T.CylinderGeometry(0.06, 0.08, 0.28, 6), GFX.M.color(color), (k % 3 - 1) * 0.22, 0.14, (Math.floor(k / 3) - 1) * 0.22);
      GFX.add(g, new T.SphereGeometry(0.06, 6, 5), GFX.mat('skin', { color: 0xf0c9a0 }), (k % 3 - 1) * 0.22, 0.34, (Math.floor(k / 3) - 1) * 0.22);
    }
    GFX.add(g, new T.CylinderGeometry(0.015, 0.015, 1, 5), GFX.M.darkwood(), 0, 0.5, 0);
    GFX.add(g, new T.BoxGeometry(0.35, 0.22, 0.015), GFX.M.flag(color), 0.18, 0.88, 0);
    return g;
  }
  function conquestKey() { return G.kingdoms.map(k => k.conquered ? 1 : 0).join(''); }

  function pickAt(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = raycaster.intersectObjects(hitboxes)[0];
    return h ? h.object.userData.id : null;
  }

  function loop(now) {
    if (!root || !root.isConnected) { raf = 0; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = root.clientWidth, h = root.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    }
    if (conquestKey() !== builtKey) buildCities();
    GFX.windUniform.value += dt;
    for (const k of ['yaw', 'pitch', 'dist']) view[k] += (view['t' + k] - view[k]) * Math.min(1, dt * 6);
    camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
    camera.lookAt(0, 0, 0);
    for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x > 70) c.position.x = -70; }
    // cities bob a little when hovered / selected
    for (const id in cityGroups) {
      const g = cityGroups[id], s = (id === hoverId || id === UI.ui.mapSel) ? 1.3 : (id === 'home' ? 1.35 : 1.1);
      g.scale.setScalar(g.scale.x + (s - g.scale.x) * Math.min(1, dt * 8));
    }
    // armies on the march
    for (const m of armyMarkers) scene.remove(m);
    armyMarkers = [];
    for (const c of G.campaigns) {
      const kd = kingdomDef(c.target), [tx, tz] = cityPos(kd);
      const p = c.phase === 'march' ? 1 - c.t / c.total : c.t / c.total;
      const x = tx * p, z = tz * p;
      const m = armyModel(0x3b6fc4); m.position.set(x, Math.max(0.1, heightAt(x, z)), z); m.rotation.y = -Math.atan2(tz, tx);
      scene.add(m); armyMarkers.push(m);
    }
    const inc = G.raid.incoming;
    if (inc) {
      const kd = kingdomDef(inc.from), [sx, sz] = cityPos(kd);
      const p = Math.max(0, 1 - (inc.eta - G.time) / 3);
      const x = sx * (1 - p), z = sz * (1 - p);
      const m = armyModel(new T.Color(kd.color).getHex()); m.position.set(x, Math.max(0.1, heightAt(x, z)), z);
      scene.add(m); armyMarkers.push(m);
    }
    renderer.render(scene, camera);
    // labels follow the cities
    const v = new T.Vector3();
    labels.querySelectorAll('.wm-label').forEach(el => {
      const g = cityGroups[el.dataset.id];
      if (!g) return;
      v.copy(g.position); v.y += 2.4; v.project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      el.classList.toggle('sel', el.dataset.id === UI.ui.mapSel || el.dataset.id === hoverId);
      el.classList.toggle('won', el.dataset.id !== 'home' && kingdomState(el.dataset.id).conquered);
    });
    raf = requestAnimationFrame(loop);
  }

  // Put the map into a slot element (called after each panel render)
  function mount(slot, select) {
    onSelect = select;
    if (!root) build();
    if (root.parentElement !== slot) slot.appendChild(root);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  return { mount };
})();
