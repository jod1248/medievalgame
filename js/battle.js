// ============================================================
//  3D battle scene. Replays a Combat.simulate() result soldier by
//  soldier: every figure on the field is one fighter (up to 1500
//  a side), and every death in the simulation is dealt on screen
//  by a real attacker of the right type — an archer's arrow, a
//  thrown javelin, a tower bolt, or a blow from the enemy who
//  fought him. Side A forms up on the left, the defender (D) on
//  the right in front of its walls or castle.
// ============================================================

const Battle = (() => {
  const T = THREE;
  const queue = [];
  let cur = null;
  let renderer = null, scene, camera, canvas, W = 1, H = 1;
  let sunL, hemiL, moonL, pix = null;
  const torchLights = [];
  let raf = 0, last = 0;
  let sceneryGroup = null, unitGroup = null;

  const MAX_PER_SIDE = 1500;               // drawn 1:1 up to this many per side
  const SP = 0.42, CAV_SP = 0.62;          // spacing in the ranks
  const GAP = 3.4;                         // centre line to each army's front rank
  const STEP = { deploy: 3.4, volley: 1.9, charge: 3.0, melee: 1.9, rout: 3.8 };
  const INF_ORDER = { spear: 0, sword: 1, axe: 1, mace: 1, militia: 2, javelin: 3, ranged: 4 };
  const PHASE_NAME = { deploy: 'Forming up', volley: 'Volley', charge: 'Charge', melee: 'Melee', rout: 'Rout' };
  const TIER_TINT = [0xb08a5c, 0xe09a52, 0xb4bcc4, 0xeef4fa, 0x9fe6de];
  const HAIR = [0x3a2616, 0x6a4424, 0x1e1a16, 0xb08a4a, 0x8a3a1e];
  const SKIN = [0xf0c9a0, 0xe0b088, 0xc69068, 0xf6d6b4];
  const COATS = [0x6b3e1f, 0x3a2a1e, 0xa0703e, 0x8a7060, 0xd9c7a8, 0x5a5048];
  const WKIND = {
    woodSword: 'sword', bronzeSword: 'sword', ironSword: 'sword', steelSword: 'longsword', damascusBlade: 'longsword',
    bronzeAxe: 'axe', ironAxe: 'axe', steelAxe: 'greataxe', daneAxe: 'greataxe',
    bronzeMace: 'mace', ironMace: 'mace', morningStar: 'star',
    woodSpear: 'spear', bronzeSpear: 'spear', ironSpear: 'spear', steelPike: 'pike', halberd: 'halberd',
    woodJavelin: 'jav', bronzeJavelin: 'jav', ironJavelin: 'jav', pilum: 'jav',
    sling: 'sling', shortBow: 'bow', compositeBow: 'bow', longBow: 'longbow', crossbow: 'xbow', arbalest: 'xbow',
    bronzeLance: 'lance', ironLance: 'lance', knightLance: 'lance', militia: 'fork',
  };
  const CHOP = { sword: 1, longsword: 1, axe: 1, greataxe: 1, mace: 1, star: 1 };
  const POLE = { spear: 1, pike: 1, halberd: 1, lance: 1, fork: 1, jav: 1 };
  const REACH = { spear: 0.6, pike: 0.8, halberd: 0.66, lance: 0.62, fork: 0.5, greataxe: 0.48 };
  const reach = s => s.cav ? 0.62 : (REACH[s.kit.wk] || 0.42);
  const isShooter = c => c === 'ranged' || c === 'javelin';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

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
    renderer = new T.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    pix = GFX.pixelator(renderer, { pixel: 2, levels: 24, outline: 0.55 });
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = T.SRGBColorSpace;
    scene = new T.Scene();
    scene.fog = new T.Fog(0xbfd8e6, 40, 110);
    camera = new T.PerspectiveCamera(34, 1, 0.1, 300);
    hemiL = new T.HemisphereLight(0xe4f1ff, 0x6f8a4a, 1.1);
    sunL = new T.DirectionalLight(0xfff3dc, 2.4);
    sunL.castShadow = true;
    sunL.shadow.mapSize.set(2048, 2048);
    sunL.shadow.camera.near = 1; sunL.shadow.camera.far = 140;
    sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.03;
    moonL = new T.DirectionalLight(0x8fa8ff, 0);
    scene.add(hemiL, sunL, sunL.target, moonL);
    for (let i = 0; i < 4; i++) { const pl = new T.PointLight(0xff9a40, 0, 9, 2); torchLights.push(pl); scene.add(pl); }
    // drag to swing the camera round, scroll to zoom in on the fighting
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag || !cur) return;
      cur.view.yaw = clamp(cur.view.yaw - (e.clientX - drag.x) * 0.005, -1.1, 1.1);
      cur.view.pitch = clamp(cur.view.pitch + (e.clientY - drag.y) * 0.003, 0.18, 1.3);
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (cur) cur.view.zoom = clamp(cur.view.zoom * (e.deltaY < 0 ? 0.88 : 1.14), 0.22, 1.5);
    }, { passive: false });
  }
  function resize() {
    if (!renderer) return;
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    pix.setSize(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------
  //  Equipment: what each fighter wears and carries
  // ---------------------------------------------------------
  function kitFor(id) {
    const w = WEAPONS[id], cls = w.cls, tier = id === 'militia' ? 0 : weaponTier(id), wk = WKIND[id] || 'sword';
    let helm = 'nasal', shield = null, cape = false, quiver = false, mail = tier >= 2;
    if (cls === 'militia') helm = 'cap';
    else if (cls === 'ranged') { helm = tier >= 2 ? 'kettle' : 'hood'; quiver = wk !== 'sling'; mail = tier >= 3; }
    else if (cls === 'javelin') { helm = tier >= 2 ? 'nasal' : 'hood'; shield = 'round'; }
    else if (cls === 'spear') { helm = tier >= 3 ? 'kettle' : 'nasal'; shield = wk === 'spear' ? 'kite' : null; }
    else if (cls === 'sword') { helm = tier >= 3 ? 'great' : tier === 0 ? 'cap' : 'nasal'; shield = 'kite'; cape = tier >= 3; }
    else if (cls === 'axe') { helm = tier >= 2 ? 'nasal' : 'hair'; shield = wk === 'axe' ? 'round' : null; }
    else if (cls === 'mace') { helm = tier >= 3 ? 'great' : 'nasal'; shield = 'round'; }
    else if (cls === 'cavalry') { helm = tier >= 3 ? 'great' : 'nasal'; shield = 'heater'; cape = tier >= 2; }
    const twoHand = wk === 'greataxe' || wk === 'pike' || wk === 'halberd' || wk === 'xbow';
    return { wk, helm, shield, cape, quiver, mail, tier, twoHand, horse: cls === 'cavalry', barding: cls === 'cavalry' && tier >= 2 };
  }
  function projType(s) {
    if (!s) return 'arrow';
    if (s.cls === 'javelin') return 'jav';
    if (s.kit.wk === 'sling') return 'stone';
    if (s.kit.wk === 'xbow') return 'bolt';
    return 'arrow';
  }

  // ---------------------------------------------------------
  //  Part geometry. Figures face +x, feet at the origin;
  //  right hand at +z. Weapons have their grip at the origin
  //  and point along +y. White vertices take the instance tint.
  // ---------------------------------------------------------
  let partGeo = null;
  function parts() {
    if (partGeo) return partGeo;
    const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
    const C = (r, h, seg = 7, rb = r) => new T.CylinderGeometry(r, rb, h, seg);
    const B = (x, y, z) => new T.BoxGeometry(x, y, z);
    const S = (r, w = 8, h = 6) => new T.SphereGeometry(r, w, h);
    const half = r => new T.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const mg = items => GFX.merge(items.map(([geo, matrix, color]) => ({ geo, matrix, color })));
    const WOOD = 0x6e4a2a, LEATHER = 0x4a3220, DARK = 0x2a2522, GUARD = 0x9a8250;
    const shape = (pts, depth) => {
      const sh = new T.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
      const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.rotateY(Math.PI / 2); return g;
    };
    const P = {
      torso: mg([
        [C(0.078, 0.3, 8, 0.1), M4(0, 0.33, 0), 0xffffff],
        [C(0.093, 0.032, 8), M4(0, 0.255, 0), LEATHER],
        [B(0.012, 0.2, 0.045), M4(0.094, 0.33, 0), 0x9a9a9a],
        [C(0.08, 0.025, 8), M4(0, 0.47, 0), 0xd0d0d0],
        [B(0.03, 0.03, 0.03), M4(0.09, 0.255, 0), 0xc8a050],
      ]),
      head: mg([[S(0.058, 10, 8), M4(0, 0.535, 0), 0xffffff], [B(0.02, 0.02, 0.016), M4(0.058, 0.53, 0), 0xffffff]]),
      helm_nasal: mg([[half(0.066), M4(0, 0.545, 0), 0xffffff], [new T.ConeGeometry(0.035, 0.05, 8), M4(0, 0.6, 0), 0xffffff], [B(0.012, 0.06, 0.014), M4(0.066, 0.53, 0), 0xffffff], [C(0.068, 0.014, 10), M4(0, 0.548, 0), 0xc8c8c8]]),
      helm_kettle: mg([[half(0.064), M4(0, 0.548, 0), 0xffffff], [C(0.11, 0.012, 14, 0.115), M4(0, 0.55, 0), 0xe0e0e0]]),
      helm_great: mg([[C(0.068, 0.13, 10), M4(0, 0.55, 0), 0xffffff], [C(0.068, 0.012, 10), M4(0, 0.62, 0), 0xdddddd], [B(0.01, 0.012, 0.09), M4(0.067, 0.56, 0), DARK], [B(0.01, 0.06, 0.012), M4(0.067, 0.535, 0), 0xc8a050]]),
      helm_hood: mg([[half(0.07), M4(-0.006, 0.54, 0, 0, 0, 0, 1, 1.25, 1), 0xffffff], [C(0.07, 0.07, 8, 0.115), M4(0, 0.47, 0), 0xffffff]]),
      helm_cap: mg([[half(0.064), M4(0, 0.545, 0, 0, 0, 0, 1, 0.8, 1), 0xffffff], [C(0.066, 0.02, 10), M4(0, 0.548, 0), 0xdddddd]]),
      helm_hair: mg([[half(0.062), M4(-0.008, 0.548, 0), 0xffffff], [B(0.03, 0.05, 0.05), M4(0.055, 0.495, 0), 0xffffff]]),
      leg: mg([[B(0.048, 0.13, 0.05), M4(0, -0.065, 0), 0xffffff], [B(0.062, 0.07, 0.058), M4(0.008, -0.16, 0), 0x4a3424]]),
      arm: mg([[B(0.042, 0.15, 0.042), M4(0, -0.075, 0), 0xffffff], [S(0.025, 6, 5), M4(0, -0.165, 0), 0xd8b090]]),
      sh_kite: mg([[shape([[-0.09, 0.1], [0.09, 0.1], [0.09, -0.02], [0, -0.17], [-0.09, -0.02]], 0.016), M4(-0.008, 0, 0), 0xcfcfcf],
        [B(0.006, 0.24, 0.022), M4(0.011, -0.025, 0), 0xffffff], [B(0.006, 0.022, 0.16), M4(0.011, 0.04, 0), 0xffffff]]),
      sh_round: mg([[C(0.12, 0.018, 16).rotateZ(Math.PI / 2), M4(0, 0, 0), 0xd4d4d4], [half(0.03).rotateZ(-Math.PI / 2), M4(0.009, 0, 0), 0x8a8a8a],
        [new T.TorusGeometry(0.118, 0.008, 4, 18).rotateY(Math.PI / 2), M4(0.004, 0, 0), 0x5a4632], [B(0.006, 0.2, 0.02), M4(0.01, 0, 0), 0xffffff]]),
      sh_heater: mg([[shape([[-0.08, 0.09], [0.08, 0.09], [0.08, 0], [0, -0.12], [-0.08, 0]], 0.014), M4(-0.007, 0, 0), 0xcfcfcf],
        [B(0.006, 0.08, 0.16), M4(0.01, 0.05, 0), 0xffffff]]),
      w_sword: mg([[B(0.01, 0.3, 0.034), M4(0, 0.2, 0), 0xffffff], [B(0.018, 0.016, 0.11), M4(0, 0.045, 0), GUARD], [C(0.012, 0.07, 6), M4(0, 0.005, 0), LEATHER], [S(0.017, 6, 5), M4(0, -0.035, 0), GUARD]]),
      w_longsword: mg([[B(0.01, 0.42, 0.034), M4(0, 0.27, 0), 0xffffff], [B(0.018, 0.016, 0.14), M4(0, 0.055, 0), GUARD], [C(0.012, 0.1, 6), M4(0, 0, 0), LEATHER], [S(0.018, 6, 5), M4(0, -0.05, 0), GUARD]]),
      w_axe: mg([[C(0.01, 0.42, 6, 0.012), M4(0, 0.13, 0), WOOD], [shape([[0, 0.05], [0.1, 0.07], [0.11, -0.05], [0, -0.02]], 0.012), M4(-0.006, 0.31, 0.012), 0xffffff]]),
      w_greataxe: mg([[C(0.012, 0.8, 6, 0.014), M4(0, 0.26, 0), WOOD], [shape([[0, 0.08], [0.15, 0.13], [0.17, -0.11], [0, -0.04]], 0.014), M4(-0.007, 0.6, 0.012), 0xffffff], [C(0.016, 0.03, 6), M4(0, 0.62, 0), 0x888888]]),
      w_mace: mg([[C(0.011, 0.34, 6, 0.013), M4(0, 0.12, 0), WOOD], [C(0.036, 0.09, 6), M4(0, 0.31, 0), 0xffffff], [new T.ConeGeometry(0.03, 0.04, 6), M4(0, 0.375, 0), 0xffffff]]),
      w_star: mg([[C(0.011, 0.32, 6, 0.013), M4(0, 0.11, 0), WOOD], [S(0.048, 8, 6), M4(0, 0.33, 0), 0xffffff],
        ...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0]].map(([x, y, z]) => [new T.ConeGeometry(0.012, 0.05, 4), M4(x * 0.055, 0.33 + y * 0.055, z * 0.055, z ? (z > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, 0, x ? -Math.atan2(x, y || 0.0001) : 0), 0xffffff])]),
      w_spear: mg([[C(0.009, 1.05, 5), M4(0, 0.3, 0), WOOD], [new T.ConeGeometry(0.022, 0.1, 6), M4(0, 0.87, 0), 0xffffff], [C(0.013, 0.03, 6), M4(0, 0.81, 0), 0xffffff]]),
      w_pike: mg([[C(0.009, 1.6, 5), M4(0, 0.5, 0), WOOD], [new T.ConeGeometry(0.02, 0.12, 6), M4(0, 1.36, 0), 0xffffff]]),
      w_halberd: mg([[C(0.011, 1.3, 6), M4(0, 0.42, 0), WOOD], [new T.ConeGeometry(0.018, 0.14, 6), M4(0, 1.13, 0), 0xffffff],
        [shape([[0, 0.06], [0.11, 0.08], [0.1, -0.06], [0, -0.03]], 0.012), M4(-0.006, 0.98, 0.01), 0xffffff], [new T.ConeGeometry(0.012, 0.07, 4), M4(0, 0.98, -0.04, Math.PI / 2, 0, 0), 0xffffff]]),
      w_lance: mg([[C(0.012, 1.3, 7, 0.024), M4(0, 0.45, 0), 0xffffff], [new T.ConeGeometry(0.045, 0.08, 10, 1, true), M4(0, 0.06, 0, Math.PI, 0, 0), 0xdddddd], [new T.ConeGeometry(0.02, 0.1, 6), M4(0, 1.14, 0), 0xe8e8e8],
        [B(0.004, 0.14, 0.06), M4(0, 0.95, 0.03), 0xff3030]]),
      w_jav: mg([[C(0.008, 0.72, 5), M4(0, 0.2, 0), WOOD], [new T.ConeGeometry(0.016, 0.08, 6), M4(0, 0.6, 0), 0xffffff]]),
      w_sling: mg([[C(0.003, 0.32, 3), M4(0, -0.16, 0), LEATHER], [S(0.022, 6, 5), M4(0, -0.33, 0), LEATHER]]),
      w_bow: bowGeo(0.24, 0x7a5230),
      w_longbow: bowGeo(0.34, 0x8a6236),
      w_xbow: mg([[B(0.34, 0.03, 0.035), M4(0.06, 0, 0), WOOD], [B(0.02, 0.02, 0.3), M4(0.2, 0.01, 0), 0xffffff], [B(0.004, 0.004, 0.27), M4(0.12, 0.022, 0), 0xeeeeee], [B(0.03, 0.05, 0.02), M4(-0.05, -0.03, 0), WOOD]]),
      w_fork: mg([[C(0.009, 0.85, 5), M4(0, 0.28, 0), WOOD], [B(0.012, 0.012, 0.07), M4(0, 0.7, 0), 0x777777], ...[-0.03, 0, 0.03].map(o => [C(0.004, 0.1, 4), M4(0, 0.75, o), 0x888888])]),
      quiver: mg([[C(0.032, 0.22, 7, 0.026), M4(0, 0, 0), LEATHER], ...[-0.012, 0.012].map(o => [B(0.006, 0.05, 0.02), M4(o, 0.13, o), 0xf0ead8])]),
      cape: mg([[B(0.014, 0.32, 0.18), M4(0, -0.16, 0), 0xffffff]]),
      pole: mg([[C(0.012, 1.4, 6), M4(0, 0.5, 0), WOOD], [S(0.022, 6, 5), M4(0, 1.21, 0), 0xd4a017], [B(0.012, 0.012, 0.34), M4(0, 1.18, -0.16), WOOD]]),
      flag: mg([[B(0.006, 0.26, 0.32), M4(0, 1.04, -0.17), 0xffffff], [B(0.008, 0.05, 0.32), M4(0, 0.89, -0.17), 0xd8d8d8]]),
      horse: mg([
        [new T.CapsuleGeometry(0.1, 0.34, 4, 10).rotateZ(Math.PI / 2), M4(0, 0.43, 0, 0, 0, 0, 1, 1.05, 0.95), 0xffffff],
        [B(0.11, 0.28, 0.1), M4(0.25, 0.58, 0, 0, 0, -0.55), 0xffffff],
        [B(0.21, 0.085, 0.085), M4(0.39, 0.69, 0, 0, 0, 0.42), 0xffffff],
        [B(0.06, 0.06, 0.07), M4(0.48, 0.64, 0), 0x2a2420],
        [new T.ConeGeometry(0.018, 0.05, 4), M4(0.32, 0.77, 0.03), 0xffffff], [new T.ConeGeometry(0.018, 0.05, 4), M4(0.32, 0.77, -0.03), 0xffffff],
        [B(0.035, 0.27, 0.03), M4(0.2, 0.62, 0, 0, 0, -0.55), 0x2a2420],
        [B(0.045, 0.24, 0.05), M4(-0.3, 0.38, 0, 0, 0, 0.45), 0x2a2420],
        [B(0.17, 0.045, 0.22), M4(-0.01, 0.535, 0), LEATHER],
        [B(0.05, 0.04, 0.22), M4(-0.08, 0.565, 0), LEATHER],
      ]),
      barding: mg([[B(0.58, 0.19, 0.235), M4(0, 0.4, 0), 0xffffff], [B(0.13, 0.16, 0.12), M4(0.25, 0.55, 0, 0, 0, -0.55), 0xffffff], [B(0.58, 0.025, 0.24), M4(0, 0.31, 0), 0xc8c8c8]]),
      hleg: mg([[B(0.045, 0.3, 0.048), M4(0, -0.15, 0), 0xffffff], [B(0.056, 0.045, 0.06), M4(0, -0.31, 0), 0x2a2420]]),
      arrow: mg([[C(0.004, 0.28, 4).rotateZ(Math.PI / 2), M4(0, 0, 0), 0xd8c49a], [new T.ConeGeometry(0.009, 0.035, 4).rotateZ(-Math.PI / 2), M4(0.155, 0, 0), 0x8a8a8a], [B(0.05, 0.002, 0.02), M4(-0.12, 0, 0), 0xf4f4f4], [B(0.05, 0.02, 0.002), M4(-0.12, 0, 0), 0xd04a3a]]),
      bolt: mg([[C(0.005, 0.18, 4).rotateZ(Math.PI / 2), M4(0, 0, 0), 0x9a7a54], [new T.ConeGeometry(0.011, 0.035, 4).rotateZ(-Math.PI / 2), M4(0.105, 0, 0), 0x777777], [B(0.035, 0.002, 0.02), M4(-0.08, 0, 0), 0xdddddd]]),
      jav: mg([[C(0.007, 0.6, 5).rotateZ(Math.PI / 2), M4(0, 0, 0), 0x9a7a54], [new T.ConeGeometry(0.014, 0.07, 6).rotateZ(-Math.PI / 2), M4(0.33, 0, 0), 0x9a9a9a]]),
      stone: new T.IcosahedronGeometry(0.028, 0),
      blood: new T.CircleGeometry(0.16, 12).rotateX(-Math.PI / 2),
      spark: new T.BoxGeometry(0.02, 0.02, 0.02),
      dust: new T.IcosahedronGeometry(1, 1),
    };
    P.horse.computeVertexNormals();
    function bowGeo(r, col) {
      const arc = Math.PI * 0.8;
      const g = new T.TorusGeometry(r, 0.009, 4, 16, arc);
      g.rotateZ(-arc / 2); g.translate(-r, 0, 0);
      const ex = r * Math.cos(arc / 2) - r, ey = r * Math.sin(arc / 2);
      return mg([[g, M4(0.06, 0, 0), col], [C(0.0025, ey * 2, 3), M4(ex + 0.06, 0, 0), 0xeeeeee], [C(0.013, 0.05, 6), M4(0.06, 0, 0), LEATHER]]);
    }
    partGeo = P;
    return P;
  }

  // ---------------------------------------------------------
  //  Setup
  // ---------------------------------------------------------
  function clearScene() {
    for (const g of [sceneryGroup, unitGroup]) if (g) {
      scene.remove(g);
      g.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    }
    sceneryGroup = unitGroup = null;
  }
  function figs(n, scale) { return n > 0.05 ? Math.max(1, Math.round(n / scale)) : 0; }

  function setup(o) {
    clearScene();
    const res = o.res;
    const playerIsA = o.playerSide === 'A';
    const colors = {
      A: new T.Color(playerIsA ? '#3b6fc4' : o.enemy.color),
      D: new T.Color(playerIsA ? o.enemy.color : '#3b6fc4'),
    };
    const r0 = res.rounds[0];
    const scale = {
      A: Math.max(1, r0.sa.reduce((a, b) => a + b, 0) / MAX_PER_SIDE),
      D: Math.max(1, r0.sd.reduce((a, b) => a + b, 0) / MAX_PER_SIDE),
    };
    const soldiers = [], extent = { A: GAP, D: GAP };
    let halfZ = 4;
    for (const side of ['A', 'D']) {
      const f = formSide(side, res.order[side], side === 'A' ? r0.sa : r0.sd, scale[side]);
      soldiers.push(...f.list);
      extent[side] = f.extent; halfZ = Math.max(halfZ, f.halfZ);
    }
    // timeline
    const steps = [];
    let t = 0;
    res.rounds.forEach((r, i) => { const dur = STEP[r.kind] || 1.5; steps.push({ i, kind: r.kind, start: t, dur, done: false }); t += dur; });
    cur = {
      o, res, colors, soldiers, steps, scale, t: 0, total: t, speed: 1, shake: 0, playerIsA, extent, halfZ,
      projs: [], dust: [], sparks: [], blood: [], finished: false, endT: Infinity, hudT: 0,
      view: { yaw: 0, pitch: 0.58, zoom: 0.9 }, step: steps[0],
      wallX: extent.D + 2.6,
    };
    soldiers.forEach((s, i) => { s.i = i; });
    buildScenery(o, extent, halfZ);
    buildUnits();
    hud(true);
  }

  // Ranks: spears in front, then the other infantry, javelins and
  // archers at the back; cavalry on both wings.
  function formSide(side, ids, counts, scale) {
    const dir = side === 'A' ? 1 : -1;
    const stacks = ids.map((id, k) => ({ id, k, cls: WEAPONS[id].cls, n: figs(counts[k], scale) })).filter(s => s.n > 0);
    const inf = stacks.filter(s => s.cls !== 'cavalry').sort((a, b) => INF_ORDER[a.cls] - INF_ORDER[b.cls]);
    const cav = stacks.filter(s => s.cls === 'cavalry');
    const nInf = inf.reduce((a, s) => a + s.n, 0), nCav = cav.reduce((a, s) => a + s.n, 0);
    const rows = clamp(Math.round(Math.sqrt(Math.max(1, nInf) * 2.4)), 8, 54);
    const list = [];
    let col = 0, extent = GAP;
    const mk = (st, hx, hz) => {
      const s = {
        side, dir, stack: st.k, id: st.id, cls: st.cls, kit: kitFor(st.id), cav: st.cls === 'cavalry',
        hx, hz, x: side === 'D' ? hx : hx - dir * rnd(8.5, 10), z: hz, face: dir > 0 ? 0 : Math.PI,
        alive: true, doom: null, kills: [], foe: null, search: 0, ph: Math.random() * 6, sw: Math.random() * 6,
        moving: 0, fight: false, strikeT: -9, shotT: -9, drawT: -9, shotKind: '', fallT: 0, fallen: 0, fallAxis: 'z', fallSgn: 1,
        cheer: Math.random() * 6, bearer: false, settled: false, mat: new T.Matrix4(), look: Math.random(),
      };
      s.sx = s.x; s.vx = 0; s.vz = 0; s.wantFace = s.face; s.flinchT = -9;
      list.push(s);
      extent = Math.max(extent, Math.abs(hx));
      return s;
    };
    for (const st of inf) {
      const mine = [];
      for (let i = 0; i < st.n; i++) {
        const c = col + Math.floor(i / rows), r = i % rows;
        mine.push(mk(st, -dir * (GAP + c * SP) + rnd(-0.03, 0.03), (r - (rows - 1) / 2) * SP + rnd(-0.04, 0.04)));
      }
      if (mine.length >= 6) mine[Math.min(mine.length - 1, rows + Math.floor(rows / 2))].bearer = true;
      col += Math.ceil(st.n / rows) + 0.6;
    }
    const halfW = (rows - 1) / 2 * SP;
    const cavRows = clamp(Math.ceil(Math.sqrt(nCav / 2 * 0.8)), 2, 12);
    let j = 0;
    for (const st of cav) {
      const mine = [];
      for (let i = 0; i < st.n; i++, j++) {
        const wing = j % 2 ? 1 : -1, q = Math.floor(j / 2);
        const c = Math.floor(q / cavRows), r = q % cavRows;
        mine.push(mk(st, -dir * (GAP + 0.4 + c * CAV_SP) + rnd(-0.04, 0.04), wing * (halfW + 1 + r * CAV_SP)));
      }
      if (mine.length >= 6) mine[4].bearer = true;
    }
    let halfZ = halfW + 1;
    for (const s of list) halfZ = Math.max(halfZ, Math.abs(s.hz) + 0.5);
    return { list, extent: extent + 0.6, halfZ };
  }

  // ---------- scenery: rolling field, trees, walls or castle ----------
  function buildScenery(o, extent, halfZ) {
    sceneryGroup = new T.Group();
    const size = 180;
    const geo = new T.PlaneGeometry(size, size, 130, 130);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
    const flatX = Math.max(extent.A, extent.D) + 5, flatZ = halfZ + 5;
    const lo = new T.Color('#79b04a'), hi = new T.Color('#9ccc5c'), dry = new T.Color('#b9b56a');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.max(0, Math.hypot(Math.max(0, Math.abs(x) - flatX), Math.max(0, Math.abs(z) - flatZ)));
      pos.setY(i, Math.pow(Math.min(1, d / 22), 1.5) * (2 + smoothNoise(x + 500, z + 500, 9, 5) * 9) + (smoothNoise(x, z, 4, 6) - 0.5) * 0.12);
      c.copy(lo).lerp(hi, smoothNoise(x, z, 6, 21)).lerp(dry, Math.max(0, smoothNoise(x, z, 3, 8) - 0.6) * 1.2);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    sceneryGroup.add(ground);
    // trees around the field
    const geos = GFX.trees(), lists = { pine: [], oak: [], birch: [] };
    for (let i = 0; i < 800; i++) {
      const a = hash2(i, 1, 41) * Math.PI * 2, r = 4 + hash2(i, 2, 41) * 42;
      const x = Math.cos(a) * (flatX + r), z = Math.sin(a) * (flatZ + r);
      if (z > 4 && Math.abs(x) < flatX + 12) continue;          // keep the camera side open
      if (Math.abs(x) < flatX + 1 && Math.abs(z) < flatZ + 1) continue;
      const kind = ['pine', 'oak', 'birch'][i % 3];
      lists[kind].push([x, 0, z, 2.2 + hash2(i, 3, 41) * 1.6, hash2(i, 4, 41) * 6]);
    }
    for (const k in lists) {
      const im = new T.InstancedMesh(geos[k], GFX.swayMaterial('tree'), Math.max(1, lists[k].length));
      const m4 = new T.Matrix4(), q = new T.Quaternion();
      lists[k].forEach(([x, , z, s, r], i) => im.setMatrixAt(i, m4.compose(new T.Vector3(x, groundY(ground, x, z), z), q.setFromEuler(new T.Euler(0, r, 0)), new T.Vector3(s, s, s))));
      im.castShadow = true; im.receiveShadow = true;
      sceneryGroup.add(im);
    }
    // defender's stronghold behind the right-hand army
    const backX = extent.D + 2.6;
    const holdLights = [];
    if (o.setting === 'town') buildTownWall(backX, halfZ, holdLights); else buildCastle(backX, halfZ, o.enemy.color, holdLights);
    sceneryGroup.userData.lights = holdLights;
    scene.add(sceneryGroup);
  }
  function groundY(ground, x, z) {
    const ray = new T.Raycaster(new T.Vector3(x, 50, z), new T.Vector3(0, -1, 0));
    const h = ray.intersectObject(ground)[0];
    return h ? h.point.y : 0;
  }
  function buildTownWall(x0, halfZ, lights) {
    const g = new T.Group();
    const stone = has('stoneWalls');
    const half = Math.max(8, halfZ + 3);
    const wallM = stone ? GFX.M.stone() : GFX.mat('palisadeB', { map: GFX.TEX.logs(), color: 0xd8b892 });
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
    for (let i = 0; i < 12; i++) {
      const h = Models.build({ id: 900 + i, type: 'house', x: 0, y: 0, level: 1 + (i % 3), built: 1 });
      h.scale.setScalar(2.4);
      h.position.set(x0 + 1.5 + (i % 3) * 2.6, 0, -half * 0.85 + Math.floor(i / 3) * half * 0.55 + (i % 2) * 0.6);
      g.add(h);
    }
    sceneryGroup.add(GFX.bake(g));
  }
  function buildCastle(x0, halfZ, color, lights) {
    const g = new T.Group();
    const half = Math.max(9, halfZ + 4);
    for (let z = -half; z < half; z += 1.5) {
      if (Math.abs(z) < 1.5) continue;
      GFX.block(g, 1, 3, 1.5, GFX.M.stone(), x0, 0, z + 0.75);
      for (let k = 0; k < 3; k++) GFX.block(g, 1, 0.4, 0.3, GFX.M.stone(), x0, 3, z + 0.25 + k * 0.5);
    }
    const flagM = GFX.M.flag(new T.Color(color).getHex());
    for (const z of [-half, -1.6, 1.6, half]) {
      GFX.add(g, new T.CylinderGeometry(1, 1.1, 5, 12), GFX.M.stone(), x0, 2.5, z);
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; GFX.block(g, 0.3, 0.4, 0.3, GFX.M.stone(), x0 + Math.cos(a) * 0.95, 5, z + Math.sin(a) * 0.95); }
      GFX.add(g, new T.ConeGeometry(1.15, 1.6, 12), GFX.M.slate(), x0, 6.2, z);
      GFX.add(g, new T.CylinderGeometry(0.03, 0.03, 1.4, 5), GFX.M.darkwood(), x0, 7.4, z);
      GFX.add(g, new T.BoxGeometry(0.02, 0.45, 0.75), flagM, x0, 7.8, z + 0.38);
      lights.push([x0 - 1.1, 2.4, z]);
      GFX.add(g, new T.ConeGeometry(0.07, 0.18, 6), GFX.M.torch(), x0 - 1.05, 2.5, z);
    }
    GFX.block(g, 4, 6, 5, GFX.M.darkstone(), x0 + 4.5, 0, 0);
    GFX.add(g, GFX.pyramidGeo(4.6, 5.6, 2.4), GFX.M.slate(), x0 + 4.5, 6, 0);
    GFX.block(g, 0.3, 2.2, 2.2, GFX.mat('gatevoid', { color: 0x1a120c }), x0 - 0.4, 0, 0);
    sceneryGroup.add(GFX.bake(g));
  }

  // ---------------------------------------------------------
  //  Instanced soldiers: one InstancedMesh per part, with a slot
  //  only for the fighters who actually have that part
  // ---------------------------------------------------------
  let IM = null;
  function buildUnits() {
    const P = parts();
    unitGroup = new T.Group();
    const counts = {};
    const take = key => (counts[key] = (counts[key] || 0) + 1) - 1;
    for (const s of cur.soldiers) {
      const k = s.kit, sl = {};
      sl.torso = take('torso'); sl.head = take('head'); sl.helm = take('helm_' + k.helm);
      sl.legs = [take('leg'), take('leg')]; sl.arms = [take('arm'), take('arm')];
      sl.weapon = take('w_' + k.wk);
      if (k.shield) sl.shield = take('sh_' + k.shield);
      if (k.quiver) sl.quiver = take('quiver');
      if (k.cape) sl.cape = take('cape');
      if (s.bearer) { sl.pole = take('pole'); sl.flag = take('flag'); }
      if (k.horse) { sl.horse = take('horse'); sl.hlegs = [take('hleg'), take('hleg'), take('hleg'), take('hleg')]; if (k.barding) sl.barding = take('barding'); }
      s.sl = sl;
    }
    const cloth = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const metal = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 });
    const plain = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const soft = ['helm_hood', 'helm_cap', 'helm_hair', 'w_bow', 'w_longbow', 'w_sling', 'w_fork'];
    const matFor = key => (key.startsWith('w_') || key.startsWith('helm_')) && !soft.includes(key) ? metal : key === 'head' || key === 'horse' || key === 'hleg' || soft.includes(key) ? plain : cloth;
    const mk = (key, n, shadow = true, material) => {
      const m = new T.InstancedMesh(P[key], material || matFor(key), Math.max(1, n));
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
      m.setColorAt(0, new T.Color(1, 1, 1));
      unitGroup.add(m);
      return m;
    };
    IM = {};
    for (const key in counts) IM[key] = mk(key, counts[key]);
    IM.arrow = mk('arrow', 6000, false, plain);
    IM.bolt = mk('bolt', 2500, false, plain);
    IM.jav = mk('jav', 2500, false, plain);
    IM.stone = mk('stone', 2000, false, GFX.mat('slingstone', { color: 0xbbbbbb, flatShading: true }));
    IM.blood = mk('blood', cur.soldiers.length, false, new T.MeshStandardMaterial({ color: 0x8a1414, roughness: 0.35, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    IM.spark = mk('spark', 400, false, new T.MeshBasicMaterial({ color: 0xffe08a }));
    IM.dust = mk('dust', 400, false, new T.MeshStandardMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.22, depthWrite: false }));
    for (const k of ['arrow', 'bolt', 'jav', 'stone', 'blood', 'spark', 'dust']) {
      const m = IM[k], n = m.instanceMatrix.count;
      for (let i = 0; i < n; i++) m.setColorAt(i, new T.Color(1, 1, 1));
      m.count = 0;
    }
    // colours: tabards in the army's colour, metal by the weapon's material, horses by coat
    const c = new T.Color(), white = new T.Color(1, 1, 1);
    for (const s of cur.soldiers) {
      const base = cur.colors[s.side], sl = s.sl, k = s.kit, h = s.i;
      const tint = new T.Color(TIER_TINT[k.tier]);
      IM.torso.setColorAt(sl.torso, c.copy(base).multiplyScalar(0.82 + hash2(h, 1, 5) * 0.28));
      IM.head.setColorAt(sl.head, c.set(SKIN[h % SKIN.length]));
      const helmCol = k.helm === 'hood' ? c.set([0x5a6a3a, 0x6a5232, 0x4a5a4a][h % 3]) : k.helm === 'cap' ? c.set(0x8a6a4a) : k.helm === 'hair' ? c.set(HAIR[h % HAIR.length]) : c.set(k.tier >= 2 ? TIER_TINT[k.tier] : k.tier === 1 ? 0xc89050 : 0x9a8a78);
      IM['helm_' + k.helm].setColorAt(sl.helm, helmCol);
      const hose = c.set([0x4a3a2a, 0x3a3a44, 0x5a4a38, 0x45382c][h % 4]);
      IM.leg.setColorAt(sl.legs[0], hose); IM.leg.setColorAt(sl.legs[1], hose);
      const sleeve = k.mail ? c.set(0x9aa2ac) : c.copy(base).multiplyScalar(0.62);
      IM.arm.setColorAt(sl.arms[0], sleeve); IM.arm.setColorAt(sl.arms[1], sleeve);
      IM['w_' + k.wk].setColorAt(sl.weapon, k.wk === 'bow' || k.wk === 'longbow' || k.wk === 'sling' ? white : tint);
      if (sl.shield !== undefined) IM['sh_' + k.shield].setColorAt(sl.shield, c.copy(base).lerp(white, 0.18));
      if (sl.quiver !== undefined) IM.quiver.setColorAt(sl.quiver, white);
      if (sl.cape !== undefined) IM.cape.setColorAt(sl.cape, c.copy(base).multiplyScalar(0.55));
      if (sl.pole !== undefined) { IM.pole.setColorAt(sl.pole, white); IM.flag.setColorAt(sl.flag, c.copy(base).lerp(white, 0.1)); }
      if (sl.horse !== undefined) {
        IM.horse.setColorAt(sl.horse, c.set(COATS[h % COATS.length]));
        sl.hlegs.forEach(i => IM.hleg.setColorAt(i, c.set(COATS[h % COATS.length])));
        if (sl.barding !== undefined) IM.barding.setColorAt(sl.barding, c.copy(base).multiplyScalar(0.9));
      }
    }
    for (const k in IM) if (IM[k].instanceColor) IM[k].instanceColor.needsUpdate = true;
    scene.add(unitGroup);
  }

  // ---------------------------------------------------------
  //  Deaths: each round's losses are handed to real attackers
  // ---------------------------------------------------------
  function enemiesOf(side) { return side === 'A' ? 'D' : 'A'; }
  function frontness(s) { return s.x * s.dir; }        // larger = closer to the enemy
  function nearestOf(list, x, z, sample = 60) {
    let best = null, bd = Infinity;
    const step = Math.max(1, Math.floor(list.length / sample));
    const off = Math.floor(Math.random() * step);
    for (let i = off; i < list.length; i += step) { const s = list[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function beginStep(st) {
    const r = cur.res.rounds[st.i];
    cur.step = st;
    if (st.kind === 'deploy') return;
    if (st.kind === 'charge') setTimeout(() => { if (cur) cur.shake = 0.3; }, 1400 / cur.speed);
    const evs = r.ev || [];
    const shotThisStep = new Set();
    const living = { A: cur.soldiers.filter(s => s.side === 'A' && s.alive), D: cur.soldiers.filter(s => s.side === 'D' && s.alive) };
    const candCache = new Map();
    const candidates = (side, ai) => {
      const k = side + ai;
      if (!candCache.has(k)) candCache.set(k, living[side].filter(s => !s.doom && (ai < 0 || s.stack === ai)));
      return candCache.get(k);
    };
    for (const side of ['A', 'D']) {
      const counts = side === 'A' ? r.sa : r.sd;
      const foes = enemiesOf(side);
      counts.forEach((n, k) => {
        const want = figs(n, cur.scale[side]);
        const pool = cur.soldiers.filter(s => s.side === side && s.stack === k && s.alive && !s.doom);
        let kill = pool.length - want;
        if (kill <= 0) return;
        const mine = evs.filter(e => e.as === foes && e.ti === k);
        const totalW = mine.reduce((a, e) => a + e.kills, 0);
        // the front ranks fall first in melee; arrows land anywhere
        const byFront = pool.slice().sort((a, b) => frontness(b) - frontness(a));
        while (kill-- > 0) {
          let ev = null;
          if (totalW > 0) { let x = Math.random() * totalW; for (const e of mine) { x -= e.kills; if (x <= 0) { ev = e; break; } } ev = ev || mine[mine.length - 1]; }
          const mode = ev ? ev.mode : st.kind === 'rout' ? 'rout' : st.kind === 'volley' ? 'volley' : 'melee';
          let victim;
          if (mode === 'volley') { const i = Math.floor(Math.random() * byFront.length); victim = byFront.splice(i, 1)[0]; }
          else victim = byFront.shift();
          if (!victim) break;
          const t = st.start + st.dur * (mode === 'volley' ? rnd(0.4, 0.9) : rnd(0.08, 0.85));
          const cands = candidates(foes, ev ? ev.ai : -1).filter(s => s.alive && !s.doom);
          if (mode === 'volley') {
            let shooter = null;
            if (!ev || ev.ai >= 0) {
              const free = cands.filter(s => !shotThisStep.has(s));
              const from = free.length ? free : cands;
              shooter = from.length ? from[Math.floor(Math.random() * from.length)] : null;
              if (shooter) shotThisStep.add(shooter);
            }
            scheduleShot(shooter, victim, t, true);
          } else {
            const killer = nearestOf(cands.length ? cands : living[foes].filter(s => s.alive), victim.x, victim.z);
            victim.doom = { t, by: killer, kind: 'melee' };
            if (killer) killer.kills.push(victim);
          }
        }
      });
    }
    // everyone else in a shooting stack looses too; most shots miss
    const firing = new Set(evs.filter(e => e.mode === 'volley' && e.ai >= 0).map(e => e.as + e.ai));
    for (const s of cur.soldiers) {
      if (!s.alive || shotThisStep.has(s) || !firing.has(s.side + s.stack) || (s.doom && s.doom.t < st.start + 0.5)) continue;
      if (s.cls === 'javelin' && st.kind !== 'volley') continue;
      if (st.kind !== 'volley' && Math.random() > 0.55) continue;
      const foes = living[enemiesOf(s.side)];
      const target = foes[Math.floor(Math.random() * foes.length)];
      if (target) scheduleShot(s, target, st.start + st.dur * rnd(0.05, 0.75), false);
    }
    if (evs.some(e => e.ai < 0)) for (let k = 0; k < 18; k++) {
      const target = living.A[Math.floor(Math.random() * living.A.length)];
      if (target) scheduleShot(null, target, st.start + st.dur * rnd(0.05, 0.8), false);
    }
  }

  // Arrows, bolts, stones and javelins. Lethal shots home in on their
  // victim and land exactly when the simulation says he falls.
  function scheduleShot(shooter, victim, tHit, lethal) {
    const type = projType(shooter);
    const sx = shooter ? shooter.x + shooter.dir * 0.1 : cur.wallX - 0.2;
    const sz = shooter ? shooter.z : clamp(victim.z * 0.6 + rnd(-2, 2), -cur.halfZ, cur.halfZ);
    const sy = shooter ? (type === 'jav' ? 0.62 : 0.52) : 2.7;
    const dist = Math.hypot(victim.x - sx, victim.z - sz);
    const speed = { arrow: 9, bolt: 14, jav: 6.5, stone: 9 }[type];
    const flight = clamp(dist / speed + 0.25, 0.45, 1.8);
    const t0 = lethal ? tHit - flight : tHit;
    const miss = lethal ? null : { x: victim.x + rnd(-0.9, 0.9), z: victim.z + rnd(-0.9, 0.9) };
    const p = { type, shooter, victim: lethal ? victim : null, x0: sx, y0: sy, z0: sz, miss, t0, t1: t0 + flight,
      h: (type === 'bolt' ? 0.25 : type === 'jav' ? 0.7 : 1) * (0.6 + dist * 0.2), state: 'wait' };
    cur.projs.push(p);
    if (lethal) victim.doom = { t: p.t1, by: shooter, kind: 'shot', proj: p };
    if (shooter) { shooter.shotT = t0; shooter.drawT = t0 - (type === 'jav' ? 0.45 : type === 'bolt' ? 0.3 : 0.55); shooter.shotKind = type; }
  }

  function kill(s, from) {
    if (!s.alive) return;
    s.alive = false; s.fallT = cur.t; s.fight = false; s.moving = 0;
    // fall away from whoever struck the blow
    if (from) s.face = Math.atan2(-(from.z - s.z), from.x - s.x);
    const r = Math.random();
    s.fallAxis = r < 0.72 ? 'z' : 'x'; s.fallSgn = r < 0.72 ? 1 : (Math.random() < 0.5 ? 1 : -1);
    if (s.cav) { s.fallAxis = 'x'; s.fallSgn = Math.random() < 0.5 ? 1 : -1; }
    const fx = Math.cos(s.face), fz = -Math.sin(s.face);
    const off = s.fallAxis === 'z' ? [-fx * 0.32, -fz * 0.32] : [-fz * 0.3 * s.fallSgn, fx * 0.3 * s.fallSgn];
    cur.blood.push({ x: s.x + off[0], z: s.z + off[1], t: cur.t, s: rnd(0.7, 1.3), r: Math.random() * 6 });
    if (s.cav) dustAt(s.x, s.z, 2);
    for (const k of s.kills) if (k.alive && k.doom && k.doom.by === s) k.doom.by = null;
  }

  // ---------------------------------------------------------
  //  Simulation of the figures
  // ---------------------------------------------------------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!cur) return;
    update(dt * cur.speed, dt);
    draw(dt);
    raf = requestAnimationFrame(loop);
  }
  const grid = { A: new Map(), D: new Map() }, sep = new Map();
  const key = (x, z, c) => (Math.floor(x / c) + 500) * 2000 + Math.floor(z / c) + 500;
  function buildGrids() {
    grid.A.clear(); grid.D.clear(); sep.clear();
    for (const s of cur.soldiers) {
      if (!s.alive) continue;
      const k1 = key(s.x, s.z, 1.2), g = grid[s.side];
      (g.get(k1) || g.set(k1, []).get(k1)).push(s);
      const k2 = key(s.x, s.z, 0.5);
      (sep.get(k2) || sep.set(k2, []).get(k2)).push(s);
    }
  }
  function searchEnemy(s, maxR = 7) {
    const g = grid[enemiesOf(s.side)], cx = Math.floor(s.x / 1.2), cz = Math.floor(s.z / 1.2);
    for (let r = 0; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== r) continue;
        const cell = g.get((ix + 500) * 2000 + iz + 500);
        if (cell) for (const e of cell) { const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2; if (d < bd) { bd = d; best = e; } }
      }
      if (best) return best;
    }
    return null;
  }
  function separate() {
    for (const s of cur.soldiers) {
      if (!s.alive) continue;
      const rad = s.cav ? 0.27 : 0.19;
      const cx = Math.floor(s.x / 0.5), cz = Math.floor(s.z / 0.5);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const cell = sep.get((ix + 500) * 2000 + iz + 500);
        if (!cell) continue;
        for (const o of cell) {
          if (o === s || o.i < s.i) continue;
          const dx = o.x - s.x, dz = o.z - s.z, min = rad + (o.cav ? 0.27 : 0.19), d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          s.x -= dx / d * push; s.z -= dz / d * push; o.x += dx / d * push; o.z += dz / d * push;
        }
      }
    }
  }
  // ask to head for a point; motion() turns this into eased movement
  function moveTo(s, tx, tz, speed, dt, stopAt = 0.02) {
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (d <= stopAt) return d;
    const sp = Math.min(speed, (d - stopAt) * 5);          // slow down on arrival
    s.tvx = dx / d * sp; s.tvz = dz / d * sp; s.moved = true;
    return d;
  }

  function update(dt, realDt) {
    cur.t += dt;
    GFX.windUniform.value += realDt;
    for (const st of cur.steps) if (!st.done && cur.t >= st.start) { st.done = true; beginStep(st); }
    const kind = cur.step.kind, loser = cur.res.winner === 'A' ? 'D' : 'A';
    const ended = cur.steps[cur.steps.length - 1].done;
    buildGrids();
    for (const s of cur.soldiers) {
      if (!s.alive) { s.fallen = Math.min(1, (cur.t - s.fallT) / 1.1); continue; }
      think(s, dt, kind, loser, ended);
      if (s.alive && kind !== 'deploy') motion(s, dt);
    }
    if (kind !== 'deploy' && kind !== 'volley') separate();
    updateProjectiles();
    for (const p of cur.dust) { p.life += dt; p.y += 0.2 * dt; p.r += 0.1 * dt; }
    cur.dust = cur.dust.filter(p => p.life < 1);
    for (const p of cur.sparks) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 3 * dt; }
    cur.sparks = cur.sparks.filter(p => p.life < 0.45);
    cur.shake = Math.max(0, cur.shake - dt * 0.8);
    cur.hudT -= realDt;
    if (cur.hudT <= 0) { cur.hudT = 0.2; hud(); }
    // the fight is over once every death the simulation recorded has been dealt
    if (ended && cur.endT === Infinity) {
      const pending = cur.soldiers.some(s => s.alive && s.doom);
      if (!pending || cur.t > cur.total + 4) cur.endT = cur.t + 1.2;
    }
    if (cur.t >= cur.endT && !cur.finished) { cur.finished = true; showResult(); }
  }

  // what one fighter does this frame: fall, hold, shoot, close in or fight
  function think(s, dt, kind, loser, ended) {
    // a doomed fighter falls when his killer's blow (or shot) lands
    const dm = s.doom;
    if (dm && cur.t >= dm.t) {
      if (dm.kind === 'shot') { if (cur.t >= dm.t + 0.15) kill(s, dm.by); }
      else if (s.dieAt !== undefined) { if (cur.t >= s.dieAt) kill(s, dm.by); }
      else {
        const k = dm.by;
        const close = k && k.alive && Math.hypot(k.x - s.x, k.z - s.z) <= reach(k) + 0.3;
        if (close) { k.strikeT = cur.t; s.dieAt = cur.t + 0.2; sparkAt((s.x + k.x) / 2, 0.45, (s.z + k.z) / 2); }
        else if (!k || !k.alive || cur.t > dm.t + 3) s.dieAt = cur.t;
      }
      if (!s.alive) return;
    }
    s.fight = false;
    if (kind === 'deploy') {
      const u = clamp((cur.t - cur.step.start) / (cur.step.dur * 0.9), 0, 1);
      // march in step to the start line
      s.x = s.sx + (s.hx - s.sx) * (1 - Math.pow(1 - u, 1.6)); s.z = s.hz;
      s.moving = u < 1 && s.sx !== s.hx ? 1 : 0; s.ph += dt * 9; s.face = s.wantFace = s.dir > 0 ? 0 : Math.PI;
      return;
    }
    const fleeing = kind === 'rout' && s.side === loser;
    if (fleeing) {
      const chaser = dm && dm.by && dm.by.alive;
      moveTo(s, s.x - s.dir * 6, s.z + (s.look - 0.5) * 2, s.cav ? 3.2 : chaser ? 1.55 : 1.9, dt);
      return;
    }
    // targets: the men I'm fated to kill, the man fated to kill me, else the nearest enemy
    let target = null;
    while (s.kills.length && (!s.kills[0].alive || (s.kills[0].doom && s.kills[0].doom.by !== s))) s.kills.shift();
    if (s.kills.length) target = s.kills[0];
    else if (dm && dm.kind === 'melee' && dm.by && dm.by.alive) target = dm.by;
    const shooterHolds = s.cls === 'ranged' && !target;
    if (kind === 'volley' || shooterHolds || (ended && s.side !== loser && !target)) {
      s.moving = 0;
      if (kind !== 'volley' && !shooterHolds) s.ph += dt * 6;
      if (s.cls === 'ranged' || !ended) s.wantFace = s.dir > 0 ? 0 : Math.PI;
      return;
    }
    if (!target) {
      if (!s.foe || !s.foe.alive || cur.t > s.search) { s.foe = searchEnemy(s); s.search = cur.t + 0.3 + Math.random() * 0.3; }
      target = s.foe;
    }
    const charging = kind === 'charge';
    if (target) {
      const dx = target.x - s.x, dz = target.z - s.z, d = Math.hypot(dx, dz), rr = reach(s);
      if (d > rr + 0.03) {
        // keep the line until close, then close in on the man
        const tz = d > 2.6 ? s.z + dz * 0.12 : target.z - dz / d * rr;
        const tx = target.x - dx / d * rr;
        const spd = s.cav ? (charging ? 3.8 : 2.4) : (charging ? 1.8 : 1.25);
        moveTo(s, tx, tz, spd, dt, 0.01);
        if (s.cav && charging && Math.random() < dt * 6) dustAt(s.x, s.z, 1);
      } else {
        s.fight = true;
        s.wantFace = Math.atan2(-dz, dx);
        const before = s.sw;
        s.sw += dt * (5 + (s.i % 5) * 0.4);
        // the moment a blow lands on the other man's shield or guard
        const pa = (before / (Math.PI * 2)) % 1, pb = (s.sw / (Math.PI * 2)) % 1;
        const hit = POLE[s.kit.wk] ? Math.sin(before) < 0.92 && Math.sin(s.sw) >= 0.92 : (pa < 0.7 && pb >= 0.7) || (pb < pa && pa < 0.7);
        if (hit) { target.flinchT = cur.t; target.flinchDir = s.face; if (Math.random() < 0.5) sparkAt(s.x + dx * 0.6, 0.42, s.z + dz * 0.6, 3); }
      }
    } else {
      moveTo(s, s.dir * 0.5, s.z, s.cav ? 2.4 : 1.2, dt, 0.3);
    }
  }

  // Movement eases in and out (a run builds up, a stop slows down) and
  // fighters turn smoothly instead of snapping round.
  function motion(s, dt) {
    const tx = s.moved ? s.tvx : 0, tz = s.moved ? s.tvz : 0;
    const k = Math.min(1, dt * (s.cav ? 3.2 : 7));
    s.vx += (tx - s.vx) * k; s.vz += (tz - s.vz) * k;
    s.x += s.vx * dt; s.z += s.vz * dt;
    const sp = Math.hypot(s.vx, s.vz);
    s.moving = sp > 0.15 ? (sp > 2.6 ? 2 : 1) : 0;
    if (s.moving) s.ph += dt * sp * (s.cav ? 4.5 : 7.5);
    if (sp > 0.25 && !s.fight) s.wantFace = Math.atan2(-s.vz, s.vx);
    const df = Math.atan2(Math.sin(s.wantFace - s.face), Math.cos(s.wantFace - s.face));
    s.face += df * Math.min(1, dt * (s.cav ? 5 : 9));
    s.moved = false;
  }

  function updateProjectiles() {
    for (const p of cur.projs) {
      if (p.state === 'wait' && cur.t >= p.t0) { p.state = 'fly'; if (p.type === 'jav' || p.type === 'stone') dustAt(p.x0, p.z0, 0); }
      if (p.state === 'fly' && cur.t >= p.t1) {
        if (p.victim && p.victim.alive) {
          p.state = 'stuck'; kill(p.victim, p.shooter || { x: cur.wallX, z: p.z0 });
          p.victim.stuck = true;
        } else { p.state = p.type === 'stone' ? 'gone' : 'ground'; if (p.type !== 'arrow') dustAt(p.x1g || 0, p.z1g || 0, 1); }
      }
    }
    // keep the ground from filling up with too many spent arrows
    if (cur.projs.length > 7000) cur.projs = cur.projs.filter((p, i) => p.state !== 'ground' || i % 2);
    cur.projs = cur.projs.filter(p => p.state !== 'gone');
  }
  function dustAt(x, z, n) {
    for (let i = 0; i < n; i++) cur.dust.push({ x: x + rnd(-0.15, 0.15), y: 0.08, z: z + rnd(-0.15, 0.15), r: rnd(0.05, 0.1), life: 0 });
    if (cur.dust.length > 380) cur.dust.splice(0, cur.dust.length - 380);
  }
  function sparkAt(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) cur.sparks.push({ x, y, z, vx: rnd(-0.9, 0.9), vy: rnd(0.4, 1.4), vz: rnd(-0.9, 0.9), life: 0 });
    if (cur.sparks.length > 380) cur.sparks.splice(0, cur.sparks.length - 380);
  }

  // ---------------------------------------------------------
  //  Drawing
  // ---------------------------------------------------------
  const B = new T.Matrix4(), R = new T.Matrix4(), L = new T.Matrix4(), A = new T.Matrix4(), tmp = new T.Matrix4(), fallM = new T.Matrix4();
  const q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(1, 1, 1), e = new T.Euler();
  const ZERO = new T.Matrix4().makeScale(0, 0, 0);
  // out = parent * T(x,y,z) * R(rx,ry,rz)
  function local(out, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
    tmp.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), sc.set(1, 1, 1));
    return out.multiplyMatrices(parent, tmp);
  }
  function put(key, slot, m) { IM[key].setMatrixAt(slot, m); }

  function pose(s) {
    const t = cur.t, k = s.kit, sl = s.sl, wk = k.wk, dead = !s.alive;
    const run = s.moving, bob = run ? Math.abs(Math.sin(s.ph)) * (run === 2 ? 0.03 : 0.018) : 0;
    const ended = cur.steps[cur.steps.length - 1].done;
    const cheering = ended && !dead && !run && cur.res.winner === s.side && !s.fight;
    const cheerY = cheering ? Math.max(0, Math.sin(t * 6 + s.cheer)) * 0.06 : 0;
    // base: position, facing and the fall. A death plays in stages: the man
    // reels from the blow, his legs give, he falls faster and faster, hits
    // the ground with a small bounce and settles.
    const u = dead ? (s.fallen >= 1 ? 9 : t - s.fallT) : 0, TOP = Math.PI / 2 * 0.94;
    let fa = 0, slide = 0;
    if (dead) {
      if (u < 0.18) fa = 0.28 * (u / 0.18);
      else if (u < 0.62) { const k2 = (u - 0.18) / 0.44; fa = 0.28 + (TOP - 0.28) * k2 * k2; }
      else { const k2 = u - 0.62; fa = TOP - 0.1 * Math.exp(-k2 * 9) * Math.abs(Math.sin(k2 * 20)); }
      slide = Math.min(1, u / 0.3) * 0.12;
    }
    const fwdX = Math.cos(s.face), fwdZ = -Math.sin(s.face);
    const sx = dead ? (s.fallAxis === 'z' ? -fwdX * slide : -fwdZ * slide * s.fallSgn) : 0;
    const sz = dead ? (s.fallAxis === 'z' ? -fwdZ * slide : fwdX * slide * s.fallSgn) : 0;
    const breath = !dead && !run ? Math.sin(t * 2.1 + s.i) * 0.004 : 0;
    B.compose(v.set(s.x + sx, dead ? Math.min(1, fa / TOP) * (s.cav ? 0.05 : 0.07) : bob + cheerY + breath, s.z + sz), q.setFromEuler(e.set(0, s.face, 0)), sc.set(1, 1, 1));
    if (dead) B.multiply(s.fallAxis === 'z' ? fallM.makeRotationZ(fa * s.fallSgn) : fallM.makeRotationX(fa * s.fallSgn));
    s.mat.copy(B);
    let seat = 0;
    if (k.horse) {
      const gal = run ? Math.sin(s.ph) : 0;
      local(A, B, 0, 0, 0, 0, 0, gal * 0.05);
      put('horse', sl.horse, A);
      if (sl.barding !== undefined) put('barding', sl.barding, A);
      const legs = [[0.2, 0.065, 0], [0.2, -0.065, 1.4], [-0.2, 0.065, 2.6], [-0.2, -0.065, 4]];
      legs.forEach(([x, z, ph], j) => {
        const sw = dead ? 0.5 : run ? Math.sin(s.ph + ph) * (run === 2 ? 0.75 : 0.45) : 0;
        put('hleg', sl.hlegs[j], local(R, A, x, 0.33, z, 0, 0, sw));
      });
      seat = 0.34; B.copy(A);
    }
    // rider/foot soldier body: leans into a run, rocks back when a blow lands on him
    const flinch = dead ? 0 : Math.max(0, 1 - (t - s.flinchT) / 0.28);
    const lean = !dead && !k.horse && (run === 2 || (run && cur.step.kind === 'charge')) ? -0.13 : 0;
    local(A, B, 0, seat, 0, 0, 0, lean + flinch * 0.24);
    put('torso', sl.torso, A);
    put('head', sl.head, A);
    put('helm_' + k.helm, sl.helm, A);
    if (sl.quiver !== undefined) put('quiver', sl.quiver, local(R, A, -0.1, 0.4, 0.05, 0.35, 0, 0.25));
    if (sl.cape !== undefined) put('cape', sl.cape, local(R, A, -0.085, 0.47, 0, 0, 0, run ? -0.25 - Math.abs(Math.sin(s.ph)) * 0.1 : -0.06));
    // legs
    for (let j = 0; j < 2; j++) {
      const z = j ? 0.045 : -0.045;
      if (k.horse) put('leg', sl.legs[j], local(R, A, 0.02, 0.19, z * 1.4, j ? 0.35 : -0.35, 0, 1.25));
      else put('leg', sl.legs[j], local(R, A, 0, 0.19, z, 0, 0, dead ? 0 : run ? Math.sin(s.ph + j * Math.PI) * (run === 2 ? 0.75 : 0.5) : s.fight && j ? 0.35 : 0));
    }
    // arms: aR = right (weapon) arm raised forward from hanging, aL = left
    let aR = 0.3, aL = 0.25, wAng = -0.5, wSpin = 0, rDx = 0, shieldUp = false;
    const sinceStrike = t - s.strikeT;
    if (dead) { aR = u < 0.4 ? 2.3 - u * 5 : 0.2; aL = u < 0.4 ? 1.9 - u * 4 : 0.15; wAng = 1.1; }
    else if (cheering) { aR = Math.PI - 0.15 + Math.sin(t * 6 + s.cheer) * 0.25; wAng = aR + Math.PI - 0.2; aL = 0.4; }
    else if (s.cls === 'ranged' && !s.fight) {
      const draw = clamp((t - s.drawT) / Math.max(0.01, s.shotT - s.drawT), 0, 1), after = t - s.shotT;
      const aiming = t >= s.drawT && after < 0.35;
      if (wk === 'bow' || wk === 'longbow') {
        const lift = aiming ? 0.45 : 0;
        aL = aiming ? Math.PI / 2 + lift : 0.35; wAng = aiming ? -lift : -0.2;
        aR = aiming ? Math.PI / 2 + lift - (after > 0 ? 0.5 : 0) : 0.3; rDx = aiming && after <= 0 ? -0.12 * draw : 0;
        // reach back over the shoulder for the next arrow
        if (!aiming && after > 0.35 && after < 0.95) { aR = 0.3 + Math.sin((after - 0.35) / 0.6 * Math.PI) * (Math.PI + 0.1); aL = 0.6; }
      } else if (wk === 'xbow') {
        aR = aL = aiming ? 1.45 + 0.2 : 0.9; wAng = aiming ? 0.2 : -0.35;
      } else {                             // sling: whirl overhead, then release
        if (aiming && after < 0) { aR = Math.PI - 0.3; wSpin = t * 22; }
        else { aR = after < 0.35 ? 1.3 : 0.3; }
        wAng = 0;
      }
    } else if (s.cls === 'javelin' && t >= s.drawT && t - s.shotT < 0.3 && !s.fight) {
      const u = clamp((t - s.drawT) / Math.max(0.01, s.shotT - s.drawT), 0, 1), after = t - s.shotT;
      aR = after < 0 ? 0.5 + u * 2.9 : 1.3; wAng = after < 0 ? -Math.PI / 2 + 0.3 : -Math.PI / 2;
      aL = after < 0 ? 1.2 : 0.4;
    } else if (s.fight || sinceStrike < 0.35) {
      shieldUp = true; aL = 1.05;
      if (POLE[wk]) {
        const thrust = sinceStrike < 0.3 ? Math.sin(sinceStrike / 0.3 * Math.PI) : Math.max(0, Math.sin(s.sw)) * 0.6;
        aR = 1.35; wAng = -Math.PI / 2 + 0.12; rDx = thrust * 0.11;
        if (wk === 'pike' || wk === 'halberd') aL = 1.25;
      } else {
        // overhead chop: slow wind-up, fast blow, recover
        let p = (s.sw / (Math.PI * 2)) % 1;
        if (sinceStrike < 0.35) p = 0.6 + sinceStrike / 0.35 * 0.25;
        aR = p < 0.6 ? 0.9 + p / 0.6 * 2.0 : p < 0.75 ? 2.9 - (p - 0.6) / 0.15 * 2.4 : 0.5 + (p - 0.75) / 0.25 * 0.4;
        wAng = aR + Math.PI - 0.5;
        if (k.twoHand) { aL = aR; shieldUp = false; }
      }
    } else if (run) {
      const sw = Math.sin(s.ph) * 0.35;
      if (k.horse && wk === 'lance') { aR = 1.25; wAng = -Math.PI / 2 + 0.06; aL = 0.9; }
      else if (POLE[wk] && cur.step.kind === 'charge') { aR = 1.3; wAng = -Math.PI / 2 + 0.2; aL = wk === 'pike' || wk === 'halberd' ? 1.2 : 0.7; }
      else { aR = 0.4 - sw; aL = k.shield ? 0.6 : 0.3 + sw; wAng = POLE[wk] ? 0 : -0.7; }
    } else {
      if (POLE[wk] || wk === 'lance') { aR = 0.35; wAng = -0.05; }
      if (k.twoHand && !POLE[wk]) aL = aR = 0.8;
      if (cur.step.kind === 'volley' && k.shield) { shieldUp = true; aL = 1.0; }
    }
    // right arm + weapon
    const sY = 0.45, sZ = 0.105, LEN = 0.165;
    put('arm', sl.arms[0], local(R, A, rDx, sY, sZ, 0.08, 0, aR));
    const hx = rDx + Math.sin(aR) * LEN, hy = sY - Math.cos(aR) * LEN;
    const dropped = dead && u > 0.3;          // weapon and shield fall from his hands
    if (dropped) {
      const rX = -fwdZ, rZ = fwdX;             // his right, on the ground
      R.compose(v.set(s.x + fwdX * 0.16 + rX * 0.22, 0.02, s.z + fwdZ * 0.16 + rZ * 0.22), q.setFromEuler(e.set(0, s.face + (s.look - 0.5) * 2.4, -Math.PI / 2)), sc.set(1, 1, 1));
      put('w_' + wk, sl.weapon, R);
    } else if (wk === 'sling') put('w_sling', sl.weapon, local(R, A, hx, hy, sZ + 0.01, 0, wSpin, wSpin ? -1.3 : 0));
    else if (wk === 'bow' || wk === 'longbow') {
      const lx = Math.sin(aL) * LEN, ly = sY - Math.cos(aL) * LEN;
      put('w_' + wk, sl.weapon, local(R, A, lx + 0.02, ly, -sZ + 0.02, 0, 0, wAng));
    } else if (wk === 'xbow') put('w_xbow', sl.weapon, local(R, A, hx - 0.04, hy, 0.02, 0, 0, wAng));
    else put('w_' + wk, sl.weapon, local(R, A, hx, hy, sZ + 0.01, 0, 0, wAng));
    // left arm + shield / banner
    put('arm', sl.arms[1], local(L, A, 0, sY, -sZ, -0.08, 0, aL));
    if (sl.shield !== undefined) {
      const lx = Math.sin(aL) * LEN, ly = sY - Math.cos(aL) * LEN;
      if (dropped) {
        R.compose(v.set(s.x + fwdZ * 0.26 + fwdX * 0.05, 0.014, s.z - fwdX * 0.26 + fwdZ * 0.05), q.setFromEuler(e.set(0, s.face + s.look, Math.PI / 2)), sc.set(1, 1, 1));
        put('sh_' + k.shield, sl.shield, R);
      } else if (dead) put('sh_' + k.shield, sl.shield, local(R, A, 0.02, 0.3, -0.14, 0, 0, 0));
      else put('sh_' + k.shield, sl.shield, local(R, A, lx + 0.03, ly + (shieldUp ? 0.03 : 0.02), -0.145, 0, shieldUp ? 0.15 : 0.35, 0));
    }
    if (sl.pole !== undefined) {
      const sway = dead ? 0 : Math.sin(t * 2 + s.i) * 0.06;
      local(R, A, 0.12, 0.22, -0.16, 0, 0, sway);
      put('pole', sl.pole, R); put('flag', sl.flag, local(L, R, 0, 0, 0, 0, Math.sin(t * 4 + s.i) * 0.3, 0));
    }
  }

  function drawSoldiers() {
    for (const s of cur.soldiers) {
      if (s.settled) continue;
      pose(s);
      if (!s.alive && s.fallen >= 1) s.settled = true;
    }
    for (const k in IM) if (!['arrow', 'bolt', 'jav', 'stone', 'blood', 'spark', 'dust'].includes(k)) IM[k].instanceMatrix.needsUpdate = true;
  }

  const _dir = new T.Vector3(), _x = new T.Vector3(1, 0, 0), _p = new T.Vector3(), _p2 = new T.Vector3();
  function projPos(p, u, out) {
    const tx = p.victim ? p.victim.x : p.miss.x, tz = p.victim ? p.victim.z : p.miss.z, ty = p.victim ? 0.4 : 0;
    return out.set(p.x0 + (tx - p.x0) * u, p.y0 + (ty - p.y0) * u + Math.sin(Math.PI * u) * p.h, p.z0 + (tz - p.z0) * u);
  }
  function drawProjectiles() {
    const n = { arrow: 0, bolt: 0, jav: 0, stone: 0 };
    const m = new T.Matrix4();
    for (const p of cur.projs) {
      if (p.state === 'wait') continue;
      const im = IM[p.type];
      if (n[p.type] >= im.instanceMatrix.count) continue;
      const i = n[p.type]++;
      if (p.state === 'fly') {
        const u = clamp((cur.t - p.t0) / (p.t1 - p.t0), 0, 1);
        projPos(p, u, _p); projPos(p, Math.min(1, u + 0.03), _p2);
        if (u >= 0.97) _p2.copy(_p).add(p.lastDir || _x);
        _dir.subVectors(_p2, _p).normalize();
        p.lastDir = _dir.clone();
        if (p.type === 'stone') { im.setMatrixAt(i, m.makeTranslation(_p.x, _p.y, _p.z)); continue; }
        q.setFromUnitVectors(_x, _dir);
        im.setMatrixAt(i, m.compose(_p, q, sc.set(1, 1, 1)));
        p.x1g = _p.x; p.z1g = _p.z;
        p.world = p.world || new T.Matrix4(); p.world.copy(m);
      } else if (p.state === 'stuck') {
        // rides along with the body it hit
        if (!p.rel) { p.rel = new T.Matrix4().copy(p.victim.mat).invert().multiply(p.world || m.identity()); }
        im.setMatrixAt(i, m.multiplyMatrices(p.victim.mat, p.rel));
      } else if (p.state === 'ground') {
        if (!p.groundM) {
          const d = p.lastDir || _x;
          q.setFromUnitVectors(_x, d);
          p.groundM = new T.Matrix4().compose(new T.Vector3(p.x1g || p.miss.x, p.type === 'jav' ? 0.12 : 0.08, p.z1g || p.miss.z), q, new T.Vector3(1, 1, 1));
        }
        im.setMatrixAt(i, p.groundM);
      }
    }
    for (const k in n) { IM[k].count = n[k]; IM[k].instanceMatrix.needsUpdate = true; }
    let i = 0;
    for (const b of cur.blood) {
      const g = clamp((cur.t - b.t - 0.3) / 1.5, 0, 1) * b.s;
      if (g <= 0) continue;
      IM.blood.setMatrixAt(i++, m.compose(_p.set(b.x, 0.012, b.z), q.setFromEuler(e.set(0, b.r, 0)), sc.set(g, 1, g * 0.8)));
    }
    IM.blood.count = i; IM.blood.instanceMatrix.needsUpdate = true;
    i = 0;
    for (const p of cur.dust) IM.dust.setMatrixAt(i++, m.compose(_p.set(p.x, p.y, p.z), q.identity(), sc.setScalar(p.r * (1 - p.life))));
    IM.dust.count = i; IM.dust.instanceMatrix.needsUpdate = true;
    i = 0;
    for (const p of cur.sparks) IM.spark.setMatrixAt(i++, m.compose(_p.set(p.x, p.y, p.z), q.identity(), sc.setScalar(1 - p.life / 0.45)));
    IM.spark.count = i; IM.spark.instanceMatrix.needsUpdate = true;
  }

  function draw(dt) {
    drawSoldiers();
    drawProjectiles();
    // lighting follows the town's time of day
    const day = Render.daylight(), night = 1 - day, twi = Math.sin(day * Math.PI);
    sunL.intensity = 2.4 * day + 0.05;
    sunL.position.set(-25, 32, 22); sunL.target.position.set(0, 0, 0);
    const span = Math.max(cur.extent.A, cur.extent.D, cur.halfZ) + 6;
    const scam = sunL.shadow.camera;
    if (scam.right !== span) { scam.left = -span; scam.right = span; scam.top = span; scam.bottom = -span; scam.updateProjectionMatrix(); }
    sunL.color.set(0xfff3dc).lerp(new T.Color(0xff9a5a), twi * 0.6);
    moonL.intensity = 0.7 * night; moonL.position.set(15, 30, -10);
    hemiL.intensity = 0.5 + 0.7 * day;
    const sky = new T.Color(0x101a34).lerp(new T.Color(0xbfd8e6), day).lerp(new T.Color(0xe8a87e), twi * 0.3);
    scene.background = sky; scene.fog.color.copy(sky);
    const ls = sceneryGroup.userData.lights || [];
    torchLights.forEach((pl, k) => { const l = ls[k]; if (!l) { pl.intensity = 0; return; } pl.position.set(...l); pl.intensity = night * 3.5 * (0.9 + Math.sin(performance.now() / 90 + k) * 0.1); });
    // camera: fit both armies, then the player's own swing / zoom
    const left = -cur.extent.A - 0.5, right = cur.extent.D + 1.5;
    const width = right - left, mid = (left + right) / 2;
    const hfov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    const fit = Math.max(7, width / 2 / Math.tan(hfov / 2) / 0.9, cur.halfZ * 1.6 / Math.tan(camera.fov * Math.PI / 360));
    const V = cur.view, dist = fit * V.zoom;
    // zoomed in, the camera drifts after the thick of the fighting
    let fx = mid, fz = 0;
    if (V.zoom < 0.8) {
      let n = 0, ax = 0, az = 0;
      for (const so of cur.soldiers) if (so.alive && (so.fight || so.moving)) { ax += so.x; az += so.z; n++; }
      if (n > 4) { const w = Math.min(1, (0.8 - V.zoom) * 2.5); fx = mid + (ax / n - mid) * w; fz = az / n * w; }
    }
    const ease = Math.min(1, (dt || 0.016) * 1.4);
    V.fx = V.fx === undefined ? fx : V.fx + (fx - V.fx) * ease;
    V.fz = V.fz === undefined ? fz : V.fz + (fz - V.fz) * ease;
    const ang = V.yaw + Math.sin(cur.t * 0.06) * 0.06, pitch = V.pitch, sh = cur.shake;
    camera.position.set(V.fx + Math.sin(ang) * dist * Math.cos(pitch) + (Math.random() - 0.5) * sh, dist * Math.sin(pitch) + (Math.random() - 0.5) * sh, V.fz + Math.cos(ang) * dist * Math.cos(pitch));
    camera.lookAt(V.fx, 0, V.fz);
    scene.fog.near = dist * 1.4; scene.fog.far = dist * 4 + 20;
    pix.render(scene, camera, 0.0035);
  }

  // ---------------------------------------------------------
  //  HUD + result card
  // ---------------------------------------------------------
  function aliveBy(side) {
    const out = {};
    for (const s of cur.soldiers) if (s.side === side && s.alive) out[s.id] = (out[s.id] || 0) + 1;
    for (const k in out) out[k] = Math.round(out[k] * cur.scale[side]);
    return out;
  }
  function hud(first) {
    const el = document.getElementById('battle');
    const you = cur.playerIsA ? 'A' : 'D', them = cur.playerIsA ? 'D' : 'A';
    const r0 = cur.res.rounds[0];
    const start = { A: r0.a, D: r0.d };
    for (const [side, sel] of [[you, '.b-you'], [them, '.b-them']]) {
      const box = el.querySelector(sel);
      const units = aliveBy(side), n = Math.min(Math.round(start[side]), unitCount(units));
      box.querySelector('.b-bar div').style.width = Math.max(0, Math.min(100, n / Math.max(1, start[side]) * 100)) + '%';
      box.querySelector('b').textContent = n;
      let u = box.querySelector('.b-units');
      if (!u) { u = document.createElement('div'); u.className = 'b-units'; box.appendChild(u); }
      const html = unitsHTML(units);
      if (u._h !== html) { u.innerHTML = html; u._h = html; }
    }
    el.querySelector('.b-them span').textContent = cur.o.enemy.name;
    el.querySelector('.b-them .b-bar div').style.background = cur.o.enemy.color;
    let ph = el.querySelector('.b-phase');
    if (!ph) { ph = document.createElement('div'); ph.className = 'b-phase'; el.appendChild(ph); }
    const label = cur.finished ? '' : PHASE_NAME[cur.step.kind] || '';
    if (ph.textContent !== label) { ph.textContent = label; ph.classList.remove('flash'); void ph.offsetWidth; ph.classList.add('flash'); }
    if (first) ph.textContent = PHASE_NAME.deploy;
  }
  function showResult() {
    const o = cur.o, res = cur.res;
    const mine = cur.playerIsA ? res.A : res.D, theirs = cur.playerIsA ? res.D : res.A;
    const lostUnits = {}; for (const k in mine.lost) if (mine.lost[k] > 0) lostUnits[k] = mine.lost[k];
    hud();
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
  // jump to the end: every remaining death happens where the man stands
  function skip() {
    for (const st of cur.steps) if (!st.done) { st.done = true; beginStep(st); }
    for (const s of cur.soldiers) if (s.alive && s.doom) { kill(s, s.doom.by); s.fallen = 1; }
    for (const s of cur.soldiers) if (!s.alive) s.fallen = 1;
    for (const p of cur.projs) if (p.state === 'wait' || p.state === 'fly') p.state = 'gone';
    cur.projs = cur.projs.filter(p => p.state !== 'gone');
    for (const b of cur.blood) b.t = -9;
    cur.step = cur.steps[cur.steps.length - 1];
    cur.t = Math.max(cur.t, cur.total);
    cur.endT = cur.t + 0.4;
  }

  function init() {
    const el = document.getElementById('battle');
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-bact]');
      if (!b || !cur) return;
      const a = b.dataset.bact;
      if (a === 'skip') { if (!cur.finished) skip(); }
      else if (a === 'speed') {
        cur.speed = cur.speed === 1 ? 2.5 : 1;
        b.classList.toggle('on', cur.speed > 1);
      } else if (a === 'close') close();
    });
    window.addEventListener('resize', resize);
  }

  // advance the battle clock without drawing (used by automated tests)
  function advance(sec) { while (cur && sec > 0) { const d = Math.min(0.05, sec); update(d, d); sec -= d; } }

  return { play, init, active: () => !!cur, advance };
})();
