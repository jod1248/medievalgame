// ============================================================
//  Game state, map generation, save / load and small helpers
// ============================================================

const MAP_W = 44, MAP_H = 44;
const T_GRASS = 0, T_FOREST = 1, T_WATER = 2, T_ROAD = 3, T_PLAZA = 4, T_SAND = 5;
const TOWN_CENTER = [20, 22];
const START_TERRITORY = 11, MAX_TERRITORY = 21;
const SAVE_KEY = 'emberfall_save_v1';

let G = null;   // the one and only game state

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smoothNoise(x, y, scale, seed) {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
  return G.map[y * MAP_W + x];
}
function setTile(x, y, t) { G.map[y * MAP_W + x] = t; }
function inTerritory(x, y) {
  return Math.max(Math.abs(x - TOWN_CENTER[0]), Math.abs(y - TOWN_CENTER[1])) <= G.territory;
}

function generateMap() {
  const m = new Array(MAP_W * MAP_H).fill(T_GRASS);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) m[y * MAP_W + x] = t; };
  const get = (x, y) => m[y * MAP_W + x];
  // Lakes
  const lakes = [[11, 7, 3.4], [35, 37, 3.0], [4, 34, 2.6]];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    for (const [lx, ly, r] of lakes) {
      const d = Math.hypot(x - lx, y - ly) + (smoothNoise(x, y, 3, 7) - 0.5) * 1.6;
      if (d < r) set(x, y, T_WATER);
      else if (d < r + 0.9 && get(x, y) !== T_WATER) set(x, y, T_SAND);
    }
  }
  // Forests: denser further from town
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (get(x, y) !== T_GRASS) continue;
    const d = Math.max(Math.abs(x - TOWN_CENTER[0]), Math.abs(y - TOWN_CENTER[1]));
    const n = smoothNoise(x, y, 4, 3);
    const p = Math.min(0.9, Math.max(0, (d - 7) / 9)) * (0.35 + n);
    if (hash2(x, y, 11) < p) set(x, y, T_FOREST);
  }
  // Roads
  // main roads run to the map edge so they pass through the wall gates
  for (let x = 0; x <= 24; x++) set(x, 22, T_ROAD);
  for (let y = 0; y < MAP_H; y++) set(17, y, T_ROAD);
  for (let y = 14; y <= 30; y++) set(9, y, T_ROAD);
  // Command center plaza
  for (let y = 16; y <= 27; y++) for (let x = 24; x <= 31; x++) set(x, y, T_PLAZA);
  // Clear the town core of trees
  for (let y = 12; y <= 32; y++) for (let x = 8; x <= 31; x++)
    if (get(x, y) === T_FOREST && Math.max(Math.abs(x - 20), Math.abs(y - 22)) < 7) set(x, y, T_GRASS);
  return m;
}

function newGame() {
  G = {
    version: 1,
    time: 0,                 // in days
    speed: 1, paused: false,
    coins: 600,
    res: {},
    pop: 200, popAcc: 0,
    map: null, territory: START_TERRITORY,
    buildings: [], nextId: 1,
    techs: {}, research: null,
    forgeQueue: [],
    weapons: {}, army: {},
    expeditions: [], campaigns: [],
    kingdoms: KINGDOMS.map(k => ({ id: k.id, conquered: false, garrison: { ...k.garrison }, known: true })),
    market: {},              // partnerId -> res -> demand factor
    raid: { next: 24, incoming: null, count: 0 },
    tut: 0, started: false, won: false, lost: false,
    stats: { woodGathered: 0, housesBuilt: 0, weaponsForged: 0, recruited: 0, trades: 0, raidsRepelled: 0, conquered: 0, researched: 0 },
  };
  for (const r of RES_ORDER) G.res[r] = 0;
  G.res.food = 400;
  G.res.stone = 40;
  for (const id in TECHS) if (TECHS[id].known) G.techs[id] = true;
  G.map = generateMap();

  // Command center
  placeBuilding('forge', 25, 17, true);
  placeBuilding('market', 28, 17, true);
  placeBuilding('townhall', 28, 21, true);
  placeBuilding('barracks', 25, 25, true);
  // Twenty houses for two hundred people
  for (const x of [10, 12, 14, 19, 21, 23]) { placeBuilding('house', x, 21, true); placeBuilding('house', x, 23, true); }
  for (const y of [16, 18, 26, 28]) { placeBuilding('house', 16, y, true); placeBuilding('house', 18, y, true); }
  // Farms and a quarry
  placeBuilding('farm', 10, 15, true);
  placeBuilding('farm', 13, 15, true);
  placeBuilding('farm', 12, 25, true);
  placeBuilding('quarry', 21, 27, true);
  return G;
}

// ------------------------------------------------------------
//  Buildings
// ------------------------------------------------------------
function buildingAt(x, y) {
  for (const b of G.buildings) {
    const s = BUILDINGS[b.type].size;
    if (x >= b.x && x < b.x + s && y >= b.y && y < b.y + s) return b;
  }
  return null;
}
function canPlace(type, x, y) {
  const s = BUILDINGS[type].size;
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
    const tx = x + dx, ty = y + dy;
    const t = tileAt(tx, ty);
    if (t < 0 || t === T_WATER || t === T_ROAD || t === T_PLAZA) return false;
    if (!inTerritory(tx, ty)) return false;
    if (buildingAt(tx, ty)) return false;
  }
  return true;
}
function placeBuilding(type, x, y, instant) {
  const def = BUILDINGS[type];
  const b = { id: G.nextId++, type, x, y, level: 1, built: instant ? 1 : 0, workers: 0, paused: false, prog: 0 };
  if (BUILDINGS[type].refinery) b.pct = 100;
  b.born = (typeof performance !== 'undefined') ? performance.now() : 0;
  if (type === 'mine') b.ore = 'ironOre';
  let cleared = 0;
  for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
    if (tileAt(x + dx, y + dy) === T_FOREST) { setTile(x + dx, y + dy, T_GRASS); cleared++; }
  }
  if (cleared && !instant) addRes('wood', cleared * 4);
  G.buildings.push(b);
  return b;
}
function findBuilding(type) { return G.buildings.find(b => b.type === type); }

// ------------------------------------------------------------
//  Resources
// ------------------------------------------------------------
function getAmount(k) { return k === 'coins' ? G.coins : (G.res[k] || 0); }
function addRes(k, n) {
  if (k === 'coins') G.coins += n;
  else G.res[k] = (G.res[k] || 0) + n;
}
function canAfford(cost, mult = 1) {
  for (const k in cost) if (getAmount(k) + 1e-9 < cost[k] * mult) return false;
  return true;
}
function pay(cost, mult = 1) {
  if (!canAfford(cost, mult)) return false;
  for (const k in cost) addRes(k, -cost[k] * mult);
  return true;
}
function refund(cost, mult = 1) { for (const k in cost) addRes(k, cost[k] * mult); }
function has(tech) { return !!G.techs[tech]; }

// ------------------------------------------------------------
//  Derived values
// ------------------------------------------------------------
function housingCapacity() {
  let c = 0;
  const mult = has('architecture') ? 1.25 : 1;
  for (const b of G.buildings) if (b.type === 'house' && b.built >= 1) c += BUILDINGS.house.capacity[b.level - 1];
  return Math.floor(c * mult);
}
function soldiersAtHome() { let n = 0; for (const k in G.army) n += G.army[k]; return n; }
function soldiersAway() {
  let n = 0;
  for (const c of G.campaigns) for (const k in c.units) n += c.units[k];
  return n;
}
function totalSoldiers() { return soldiersAtHome() + soldiersAway(); }
function peopleOnExpedition() { return G.expeditions.reduce((s, e) => s + e.people, 0); }
function civilians() { return Math.max(0, G.pop - totalSoldiers()); }
function availableWorkers() { return Math.max(0, civilians() - peopleOnExpedition()); }
function employedWorkers() { return G.buildings.reduce((s, b) => s + (b.workers || 0), 0); }
function idleCitizens() { return Math.max(0, availableWorkers() - employedWorkers()); }
function maxRefTier() { return has('ref4') ? 4 : has('ref3') ? 3 : has('ref2') ? 2 : has('ref1') ? 1 : 0; }
function armyCapacity() {
  const b = findBuilding('barracks');
  return BUILDINGS.barracks.capacity[b.level - 1] + 40 * G.kingdoms.filter(k => k.conquered).length;   // vassal levies
}
function armyBonuses() {
  let atk = 1, armor = 0;
  if (has('drill')) atk += 0.1;
  if (has('warAcademy')) atk += 0.15;
  if (has('chainmail')) armor += 1;
  if (has('plateArmor')) armor += 2;
  return { atk, armor, extraVolleys: has('tactics') ? 1 : 0 };
}
function kingdomDef(id) { return KINGDOMS.find(k => k.id === id); }
function kingdomState(id) { return G.kingdoms.find(k => k.id === id); }
function day() { return Math.floor(G.time) + 1; }

// ------------------------------------------------------------
//  Formatting helpers
// ------------------------------------------------------------
function fmt(n) {
  if (n >= 100000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  if (Math.abs(n) < 10 && Math.abs(n - Math.round(n)) > 0.05) return n.toFixed(1);
  return Math.floor(n + 1e-6).toLocaleString();
}
function resIc(k, cls = '') {
  if (k === 'coins') return ic('coin', cls, '#f1c75b');
  const r = RES[k];
  return r ? ic(r.icon, cls, r.color) : '';
}
function resName(k) { return k === 'coins' ? 'Coins' : (RES[k] ? RES[k].name : k); }
function costHTML(cost, mult = 1) {
  const parts = [];
  for (const k in cost) {
    const need = cost[k] * mult;
    const ok = getAmount(k) + 1e-9 >= need;
    parts.push(`<span class="cost ${ok ? '' : 'missing'}" title="${resName(k)}">${resIc(k)}${fmt(need)}</span>`);
  }
  return parts.join('');
}
// amounts gained or lost (never coloured as "can't afford")
function gainHTML(obj, sign = '+') {
  return Object.entries(obj).map(([k, n]) => `<span class="cost" title="${resName(k)}">${resIc(k)}${sign}${fmt(n)}</span>`).join('');
}
function unitsHTML(units) {
  const parts = [];
  for (const k in units) if (units[k] >= 1) parts.push(`<span class="unitchip cls-${WEAPONS[k].cls}" title="${WEAPONS[k].unit}">${ic(CLASSES[WEAPONS[k].cls].icon)}${Math.round(units[k])}</span>`);
  return parts.join('') || '—';
}
function unitCount(units) { let n = 0; for (const k in units) n += units[k]; return n; }

// Short notifications only; `icon` is an icon name
function log(msg, kind = 'info', icon) {
  if (typeof UI !== 'undefined') UI.toast(msg, kind, icon);
}

// ------------------------------------------------------------
//  Save / load
// ------------------------------------------------------------
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); return true; } catch (e) { return false; }
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return false;
    G = JSON.parse(s);
    return true;
  } catch (e) { return false; }
}
function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
