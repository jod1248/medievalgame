// ============================================================
//  Static game data: resources, buildings, recipes, weapons,
//  tech tree, neighbouring kingdoms.
// ============================================================

const DAY_SECONDS = 48;          // real seconds per in-game day at 1x speed
const FOOD_PER_PERSON = 0.15;    // food eaten per person per day

const RES = {
  food:      { name: 'Food',           icon: 'food', color: '#e0b25a', price: 1 },
  wood:      { name: 'Wood',           icon: 'log', color: '#8a5a32', price: 1 },
  stone:     { name: 'Stone',          icon: 'stone', color: '#a9a49b', price: 1.5 },
  planks:    { name: 'Planks',         icon: 'planks', color: '#c99a5b', price: 3.5 },
  charcoal:  { name: 'Charcoal',       icon: 'charcoal', color: '#3a3634', price: 3.5 },
  ironOre:   { name: 'Iron Ore',       icon: 'ore', color: '#b0704a', price: 2.5 },
  copperOre: { name: 'Copper Ore',     icon: 'ore', color: '#e08a3a', price: 2.5 },
  tinOre:    { name: 'Tin Ore',        icon: 'ore', color: '#d8dde2', price: 3 },
  zincOre:   { name: 'Zinc Ore',       icon: 'ore', color: '#8fb1c9', price: 3 },
  iron:      { name: 'Iron',           icon: 'ingot', color: '#9aa4ad', price: 9 },
  bronze:    { name: 'Bronze',         icon: 'ingot', color: '#c8833f', price: 10 },
  brass:     { name: 'Brass',          icon: 'ingot', color: '#e3c050', price: 11 },
  steel:     { name: 'Steel',          icon: 'ingot', color: '#7fb0e0', price: 24 },
  damascus:  { name: 'Damascus Steel', icon: 'gem', color: '#5fd6d0', price: 60 },
  horses:    { name: 'Horses',         icon: 'horse', color: '#a0703e', price: 45 },
};
const RES_ORDER = Object.keys(RES);

// ------------------------------------------------------------
//  Refinery recipes. `tier` = minimum refinery tier required.
//  `time` = days per batch at speed 1.
// ------------------------------------------------------------
const RECIPES = {
  planks:   { name: 'Planks',         tier: 1, in: { wood: 2 },                            out: { planks: 1 },   time: 0.12 },
  charcoal: { name: 'Charcoal',       tier: 1, in: { wood: 3 },                            out: { charcoal: 1 }, time: 0.15 },
  iron:     { name: 'Iron',           tier: 2, in: { ironOre: 2, charcoal: 1 },            out: { iron: 1 },     time: 0.3 },
  bronze:   { name: 'Bronze',         tier: 2, in: { copperOre: 2, tinOre: 1 },            out: { bronze: 1 },   time: 0.3 },
  brass:    { name: 'Brass',          tier: 2, in: { copperOre: 2, zincOre: 1 },           out: { brass: 1 },    time: 0.3 },
  steel:    { name: 'Steel',          tier: 3, in: { iron: 2, charcoal: 2 },               out: { steel: 1 },    time: 0.5 },
  damascus: { name: 'Damascus Steel', tier: 4, in: { steel: 2, brass: 1, charcoal: 2 },    out: { damascus: 1 }, time: 0.8 },
};
const REFINERY_SPEED = [1, 1.8, 2.8, 4.2];   // by tier 1..4
const TIER_NAMES = ['', 'I', 'II', 'III', 'IV'];

// ------------------------------------------------------------
//  Buildings
// ------------------------------------------------------------
const BUILDINGS = {
  house: {
    name: 'House', icon: 'house', size: 1, buildable: true, cost: { wood: 20 }, buildDays: 0.4, maxLevel: 3,
    upgrade: [null, { planks: 15, stone: 10 }, { planks: 30, stone: 30, coins: 40 }],
    upgradeReq: [null, null, 'masonry'],
    capacity: [10, 16, 24],
    desc: 'Free homes attract settlers.',
  },
  farm: {
    name: 'Farm', icon: 'wheat', size: 2, buildable: true, cost: { wood: 30 }, buildDays: 0.6, maxLevel: 3,
    upgrade: [null, { planks: 20, coins: 30 }, { planks: 40, iron: 5, coins: 60 }],
    workers: [10, 14, 18], rate: [1.0, 1.15, 1.35], produces: 'food',
    desc: 'Grows food.',
  },
  lumber: {
    name: 'Lumber Camp', icon: 'lumber', size: 1, buildable: true, cost: { wood: 15, coins: 20 }, buildDays: 0.4, maxLevel: 3,
    upgrade: [null, { planks: 15, coins: 30 }, { planks: 30, iron: 5, coins: 60 }],
    workers: [8, 12, 16], rate: [1.0, 1.2, 1.45], produces: 'wood',
    desc: 'Cuts wood.',
  },
  quarry: {
    name: 'Quarry', icon: 'stone', size: 1, buildable: true, cost: { wood: 30 }, buildDays: 0.5, maxLevel: 3,
    upgrade: [null, { planks: 20, coins: 30 }, { planks: 30, iron: 8, coins: 60 }],
    workers: [8, 12, 16], rate: [0.6, 0.75, 0.95], produces: 'stone',
    desc: 'Cuts stone.',
  },
  mine: {
    name: 'Mine', icon: 'pick', size: 1, buildable: true, cost: { wood: 40, stone: 20 }, buildDays: 0.8, maxLevel: 3, requires: 'mining',
    upgrade: [null, { planks: 25, stone: 30 }, { planks: 40, iron: 10, stone: 40 }],
    workers: [8, 12, 16], rate: [0.45, 0.55, 0.7], produces: 'ore',
    desc: 'Digs the ore you choose.',
  },
  watchtower: {
    name: 'Watchtower', icon: 'tower', size: 1, buildable: true, cost: { stone: 40, planks: 10 }, buildDays: 0.8, maxLevel: 2, requires: 'watchtowers',
    upgrade: [null, { stone: 60, iron: 10 }],
    desc: 'Shoots raiders.',
  },
  stables: {
    name: 'Stables', icon: 'horseshoe', size: 2, buildable: true, cost: { planks: 40, stone: 20 }, buildDays: 1, maxLevel: 2, requires: 'horsemanship',
    upgrade: [null, { planks: 40, iron: 10 }],
    workers: [4, 8], rate: [0.08, 0.1], produces: 'horses', consumes: { food: 4 },
    desc: 'Breeds horses from food.',
  },
  // ---- Command center (unique) ----
  townhall: {
    name: 'Town Hall', icon: 'townhall', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 40, stone: 60, coins: 100 }, { planks: 80, stone: 150, iron: 20, coins: 300 }],
    expSlots: [2, 3, 4], expBonus: [1, 1.15, 1.3],
    desc: 'Sends expeditions.',
  },
  forge: {
    name: 'Forge', icon: 'anvil', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 30, stone: 40, coins: 80 }, { stone: 80, iron: 25, coins: 200 }],
    speed: [1, 1.6, 2.4],
    desc: 'Research and forge weapons.',
  },
  market: {
    name: 'Marketplace', icon: 'market', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 30, coins: 100 }, { planks: 60, brass: 10, coins: 250 }],
    upgradeReq: [null, null, 'tradeGuild'],
    spread: [0.3, 0.22, 0.15],
    desc: 'Buy and sell goods.',
  },
  barracks: {
    name: 'Barracks', icon: 'barracks', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 40, stone: 40, coins: 80 }, { planks: 60, stone: 100, iron: 20, coins: 200 }],
    capacity: [60, 150, 350], trainSpeed: [1, 1.5, 2.2],
    desc: 'Train and command soldiers.',
  },
};

// ------------------------------------------------------------
//  Refineries: one building type per refined resource.
//  Tier (level) N needs the Tier N refining research.
// ------------------------------------------------------------
const REFINERIES = {
  sawmill:    { name: 'Sawmill',        icon: 'saw',      recipe: 'planks',   requires: 'ref1', cost: { wood: 30, stone: 15 } },
  kiln:       { name: 'Charcoal Kiln',  icon: 'flame',    recipe: 'charcoal', requires: 'ref1', cost: { wood: 20, stone: 25 } },
  smelter:    { name: 'Iron Smelter',   icon: 'furnace',  recipe: 'iron',     requires: 'ref2', cost: { wood: 30, stone: 40 } },
  foundry:    { name: 'Bronze Foundry', icon: 'furnace',  recipe: 'bronze',   requires: 'ref2', cost: { wood: 30, stone: 40 } },
  brassworks: { name: 'Brass Works',    icon: 'furnace',  recipe: 'brass',    requires: 'ref2', cost: { wood: 30, stone: 40 } },
  steelworks: { name: 'Steelworks',     icon: 'furnace',  recipe: 'steel',    requires: 'ref3', cost: { stone: 80, iron: 15 } },
  crucible:   { name: 'Crucible',       icon: 'crucible', recipe: 'damascus', requires: 'ref4', cost: { stone: 100, steel: 10 } },
};
for (const id in REFINERIES) {
  const r = REFINERIES[id];
  BUILDINGS[id] = {
    ...r, size: 1, buildable: true, buildDays: 0.6, maxLevel: 4, refinery: true,
    upgrade: [null, { planks: 20, stone: 40, coins: 60 }, { planks: 30, stone: 60, iron: 10, coins: 120 }, { stone: 100, steel: 10, coins: 250 }],
    upgradeReq: [null, 'ref2', 'ref3', 'ref4'],
    workers: [3, 4, 5, 6],
    desc: 'Refines ' + r.recipe + '.',
  };
}
const BUILD_MENU = ['house', 'farm', 'lumber', 'quarry', 'mine', 'sawmill', 'kiln', 'smelter', 'foundry', 'brassworks', 'steelworks', 'crucible', 'watchtower', 'stables'];
const ORE_TYPES = ['ironOre', 'copperOre', 'tinOre', 'zincOre'];

// ------------------------------------------------------------
//  Expeditions sent from the Town Hall
// ------------------------------------------------------------
const EXPEDITIONS = {
  wood:  { name: 'Wood',  icon: 'log',   days: 1.5, yield: { wood: 1.2 } },
  stone: { name: 'Stone', icon: 'stone', days: 2,   yield: { stone: 0.9 } },
  food:  { name: 'Food',  icon: 'food',  days: 1.5, yield: { food: 1.5 } },
  ore:   { name: 'Ore',   icon: 'ore',   days: 3,   yield: { ironOre: 0.3, copperOre: 0.25, tinOre: 0.15, zincOre: 0.15 } },
};

// ------------------------------------------------------------
//  Weapon classes and their matchups
// ------------------------------------------------------------
const CLASSES = {
  sword:   { name: 'Swords',   icon: 'sword',   color: '#c9d1d9', pros: 'Balanced', cons: 'No tricks' },
  axe:     { name: 'War Axes', icon: 'axe',     color: '#e3794b', pros: 'Huge damage, pierce armour', cons: 'Light armour' },
  mace:    { name: 'Maces',    icon: 'mace',    color: '#b48ead', pros: 'Crush heavy armour', cons: 'Weak vs light troops' },
  spear:   { name: 'Spears',   icon: 'spear',   color: '#88c0d0', pros: 'Shields, strike first', cons: 'Low damage' },
  javelin: { name: 'Javelins', icon: 'javelin', color: '#a3be8c', pros: '2 volleys before melee', cons: 'Weak in melee' },
  ranged:  { name: 'Ranged',   icon: 'bow',     color: '#ebcb8b', pros: 'Volleys, shoots all battle', cons: 'Fragile' },
  cavalry: { name: 'Cavalry',  icon: 'horse',   color: '#d08770', pros: 'Charge, hunts archers', cons: 'Needs horses' },
  militia: { name: 'Militia',  icon: 'militia', color: '#999999', pros: 'Free', cons: 'Untrained' },
};
// attacker class -> defender class -> damage multiplier
const CLASS_BONUS = {
  sword:   { spear: 1.3, javelin: 1.25 },
  axe:     { sword: 1.3, spear: 1.3 },
  mace:    { },
  spear:   { cavalry: 2.0 },
  javelin: { axe: 1.5, mace: 1.4, cavalry: 1.4 },
  ranged:  { axe: 1.2, mace: 1.2, militia: 1.2 },
  cavalry: { ranged: 1.8, javelin: 1.6, militia: 1.5, spear: 0.5 },
  militia: { },
};

// ------------------------------------------------------------
//  Weapons (each forged weapon equips one soldier)
//  atk/hp/armor per soldier. pierce = fraction of armour ignored.
// ------------------------------------------------------------
const WEAPONS = {
  // Swords
  woodSword:     { name: 'Wooden Sword',     unit: 'Wooden Swordsmen',  cls: 'sword', atk: 4,  hp: 20, armor: 1, cost: { wood: 5 },                         time: 0.04 },
  bronzeSword:   { name: 'Bronze Sword',     unit: 'Bronze Swordsmen',  cls: 'sword', atk: 7,  hp: 24, armor: 2, cost: { bronze: 2, wood: 1 },              time: 0.075 },
  ironSword:     { name: 'Iron Sword',       unit: 'Iron Swordsmen',    cls: 'sword', atk: 10, hp: 28, armor: 3, cost: { iron: 2, planks: 1 },              time: 0.1 },
  steelSword:    { name: 'Steel Longsword',  unit: 'Steel Knights',     cls: 'sword', atk: 15, hp: 32, armor: 4, cost: { steel: 2, planks: 1 },             time: 0.15 },
  damascusBlade: { name: 'Damascus Blade',   unit: 'Blademasters',      cls: 'sword', atk: 22, hp: 36, armor: 5, cost: { damascus: 1, steel: 1, brass: 1 }, time: 0.225 },
  // Axes
  bronzeAxe:     { name: 'Bronze Hatchet',   unit: 'Hatchetmen',        cls: 'axe', atk: 9,  hp: 20, armor: 1, pierce: 0.4, cost: { bronze: 2, wood: 2 },             time: 0.075 },
  ironAxe:       { name: 'Iron War Axe',     unit: 'Axemen',            cls: 'axe', atk: 13, hp: 23, armor: 1, pierce: 0.5, cost: { iron: 3, planks: 1 },             time: 0.11 },
  steelAxe:      { name: 'Bearded Axe',      unit: 'Berserkers',        cls: 'axe', atk: 19, hp: 26, armor: 2, pierce: 0.6, cost: { steel: 2, iron: 1, planks: 1 },   time: 0.16 },
  daneAxe:       { name: 'Dane Axe',         unit: 'Huscarls',          cls: 'axe', atk: 27, hp: 30, armor: 2, pierce: 0.7, cost: { damascus: 1, steel: 1, planks: 2 }, time: 0.225 },
  // Maces
  bronzeMace:    { name: 'Bronze Mace',      unit: 'Macemen',           cls: 'mace', atk: 7,  hp: 24, armor: 2, crush: true, cost: { bronze: 3 },            time: 0.075 },
  ironMace:      { name: 'Flanged Mace',     unit: 'Flanged Macemen',   cls: 'mace', atk: 10, hp: 28, armor: 2, crush: true, cost: { iron: 3 },              time: 0.11 },
  morningStar:   { name: 'Morning Star',     unit: 'Morning Stars',     cls: 'mace', atk: 15, hp: 32, armor: 3, crush: true, cost: { steel: 2, iron: 1 },    time: 0.16 },
  // Spears
  woodSpear:     { name: 'Wooden Spear',     unit: 'Wooden Spearmen',   cls: 'spear', atk: 3,  hp: 22, armor: 2, cost: { wood: 4 },                       time: 0.035 },
  bronzeSpear:   { name: 'Bronze Spear',     unit: 'Bronze Spearmen',   cls: 'spear', atk: 5,  hp: 26, armor: 3, cost: { bronze: 1, wood: 3 },            time: 0.06 },
  ironSpear:     { name: 'Iron Spear',       unit: 'Iron Spearmen',     cls: 'spear', atk: 8,  hp: 30, armor: 4, cost: { iron: 1, planks: 2 },            time: 0.09 },
  steelPike:     { name: 'Steel Pike',       unit: 'Pikemen',           cls: 'spear', atk: 11, hp: 34, armor: 5, cost: { steel: 1, planks: 3 },           time: 0.13 },
  halberd:       { name: 'Halberd',          unit: 'Halberdiers',       cls: 'spear', atk: 15, hp: 36, armor: 5, pierce: 0.3, cost: { steel: 2, iron: 1, planks: 2 }, time: 0.175 },
  // Javelins
  woodJavelin:   { name: 'Fire-hardened Javelins', unit: 'Skirmishers',  cls: 'javelin', atk: 3,  hp: 16, armor: 0, volleys: 2, cost: { wood: 6 },               time: 0.04 },
  bronzeJavelin: { name: 'Bronze Javelins',  unit: 'Javelineers',       cls: 'javelin', atk: 5,  hp: 18, armor: 1, volleys: 2, cost: { bronze: 1, wood: 4 },    time: 0.07 },
  ironJavelin:   { name: 'Iron Javelins',    unit: 'Iron Javelineers',  cls: 'javelin', atk: 7,  hp: 20, armor: 1, volleys: 2, cost: { iron: 1, planks: 3 },    time: 0.1 },
  pilum:         { name: 'Steel Pilum',      unit: 'Legionaries',       cls: 'javelin', atk: 10, hp: 24, armor: 2, volleys: 2, pierce: 0.5, cost: { steel: 1, planks: 3 }, time: 0.15 },
  // Ranged
  sling:         { name: 'Sling',            unit: 'Slingers',          cls: 'ranged', atk: 3,  hp: 14, armor: 0, volleys: 2, cost: { wood: 1, stone: 4 },              time: 0.03 },
  shortBow:      { name: 'Short Bow',        unit: 'Archers',           cls: 'ranged', atk: 4,  hp: 14, armor: 0, volleys: 3, cost: { wood: 8 },                        time: 0.05 },
  compositeBow:  { name: 'Composite Bow',    unit: 'Horn Archers',      cls: 'ranged', atk: 6,  hp: 16, armor: 0, volleys: 3, cost: { planks: 3, bronze: 1, brass: 1 }, time: 0.075 },
  longBow:       { name: 'Longbow',          unit: 'Longbowmen',        cls: 'ranged', atk: 9,  hp: 18, armor: 1, volleys: 3, cost: { planks: 4, iron: 1 },             time: 0.1 },
  crossbow:      { name: 'Crossbow',         unit: 'Crossbowmen',       cls: 'ranged', atk: 12, hp: 20, armor: 1, volleys: 2, pierce: 0.6, cost: { planks: 3, iron: 2, brass: 1 }, time: 0.125 },
  arbalest:      { name: 'Arbalest',         unit: 'Arbalesters',       cls: 'ranged', atk: 18, hp: 22, armor: 2, volleys: 2, pierce: 0.7, cost: { steel: 2, brass: 1, planks: 3 }, time: 0.175 },
  // Cavalry
  bronzeLance:   { name: 'Bronze Lance',     unit: 'Light Riders',      cls: 'cavalry', atk: 9,  hp: 40, armor: 2, cost: { bronze: 2, planks: 2, horses: 1 }, time: 0.125 },
  ironLance:     { name: 'Iron Lance',       unit: 'Lancers',           cls: 'cavalry', atk: 13, hp: 46, armor: 3, cost: { iron: 2, planks: 2, horses: 1 },   time: 0.15 },
  knightLance:   { name: 'Steel Lance',      unit: 'Mounted Knights',   cls: 'cavalry', atk: 19, hp: 55, armor: 5, cost: { steel: 3, planks: 2, horses: 1 },  time: 0.2 },
  // Not craftable
  militia:       { name: 'Pitchfork',        unit: 'Militia',           cls: 'militia', atk: 1.5, hp: 12, armor: 0, cost: {}, time: 0, hidden: true },
};

// ------------------------------------------------------------
//  Tech tree.  tab / col / row position nodes in the tree view.
// ------------------------------------------------------------
const TECH_TABS = [
  // cols = tiers (top to bottom), branches = the lines of research (left to right)
  { id: 'melee',    name: 'Melee',    cols: ['Wood', 'Bronze', 'Iron', 'Steel', 'Master'], branches: ['Swords', 'Axes', 'Maces', 'Spears', 'Cavalry', 'Javelins'] },
  { id: 'ranged',   name: 'Ranged',   cols: ['Wood', 'Bronze', 'Iron', 'Steel'], branches: ['Slings', 'Bows', 'Crossbows'] },
  { id: 'refining', name: 'Refining', cols: ['Tier I', 'Tier II', 'Tier III', 'Tier IV'], branches: ['Refineries', 'Mining'] },
  { id: 'economy',  name: 'Economy',  cols: ['Basic', 'Advanced', 'Expert'], branches: ['Gathering', 'Building', 'Trade', 'Horses'] },
  { id: 'military', name: 'Military', cols: ['Basic', 'Advanced', 'Expert'], branches: ['Walls', 'Towers', 'Drill', 'Armour', 'Supply'] },
];

const TECHS = {
  // ---- Melee: swords ----
  woodSword:     { tab: 'melee', col: 0, row: 0, weapon: 'woodSword', known: true },
  bronzeSword:   { tab: 'melee', col: 1, row: 0, weapon: 'bronzeSword',   req: ['woodSword', 'ref2'],      cost: { coins: 120, bronze: 4 },   days: 1.5 },
  ironSword:     { tab: 'melee', col: 2, row: 0, weapon: 'ironSword',     req: ['bronzeSword'],            cost: { coins: 250, iron: 8 },     days: 2.5 },
  steelSword:    { tab: 'melee', col: 3, row: 0, weapon: 'steelSword',    req: ['ironSword', 'ref3'],      cost: { coins: 500, steel: 8 },    days: 3.5 },
  damascusBlade: { tab: 'melee', col: 4, row: 0, weapon: 'damascusBlade', req: ['steelSword', 'ref4'],     cost: { coins: 1000, damascus: 4 }, days: 5 },
  // axes branch from swords
  bronzeAxe:     { tab: 'melee', col: 1, row: 1, weapon: 'bronzeAxe',     req: ['woodSword', 'ref2'],      cost: { coins: 150, bronze: 5 },   days: 1.5 },
  ironAxe:       { tab: 'melee', col: 2, row: 1, weapon: 'ironAxe',       req: ['bronzeAxe'],              cost: { coins: 280, iron: 10 },    days: 2.5 },
  steelAxe:      { tab: 'melee', col: 3, row: 1, weapon: 'steelAxe',      req: ['ironAxe', 'ref3'],        cost: { coins: 550, steel: 8 },    days: 3.5 },
  daneAxe:       { tab: 'melee', col: 4, row: 1, weapon: 'daneAxe',       req: ['steelAxe', 'ref4'],       cost: { coins: 1100, damascus: 4 }, days: 5 },
  // maces branch from swords
  bronzeMace:    { tab: 'melee', col: 1, row: 2, weapon: 'bronzeMace',    req: ['woodSword', 'ref2'],      cost: { coins: 130, bronze: 5 },   days: 1.5 },
  ironMace:      { tab: 'melee', col: 2, row: 2, weapon: 'ironMace',      req: ['bronzeMace'],             cost: { coins: 260, iron: 10 },    days: 2.5 },
  morningStar:   { tab: 'melee', col: 3, row: 2, weapon: 'morningStar',   req: ['ironMace', 'ref3'],       cost: { coins: 520, steel: 8 },    days: 3.5 },
  // spears
  woodSpear:     { tab: 'melee', col: 0, row: 3, weapon: 'woodSpear', known: true },
  bronzeSpear:   { tab: 'melee', col: 1, row: 3, weapon: 'bronzeSpear',   req: ['woodSpear', 'ref2'],      cost: { coins: 110, bronze: 4 },   days: 1.5 },
  ironSpear:     { tab: 'melee', col: 2, row: 3, weapon: 'ironSpear',     req: ['bronzeSpear'],            cost: { coins: 230, iron: 8 },     days: 2.5 },
  steelPike:     { tab: 'melee', col: 3, row: 3, weapon: 'steelPike',     req: ['ironSpear', 'ref3'],      cost: { coins: 480, steel: 8 },    days: 3.5 },
  halberd:       { tab: 'melee', col: 4, row: 3, weapon: 'halberd',       req: ['steelPike', 'steelAxe'],  cost: { coins: 900, steel: 15 },   days: 4.5 },
  // javelins branch from spears
  woodJavelin:   { tab: 'melee', col: 0, row: 5, weapon: 'woodJavelin',   req: ['woodSpear'],              cost: { coins: 40, wood: 20 },     days: 0.8 },
  bronzeJavelin: { tab: 'melee', col: 1, row: 5, weapon: 'bronzeJavelin', req: ['woodJavelin', 'ref2'],    cost: { coins: 140, bronze: 4 },   days: 1.5 },
  ironJavelin:   { tab: 'melee', col: 2, row: 5, weapon: 'ironJavelin',   req: ['bronzeJavelin'],          cost: { coins: 260, iron: 8 },     days: 2.5 },
  pilum:         { tab: 'melee', col: 3, row: 5, weapon: 'pilum',         req: ['ironJavelin', 'ref3'],    cost: { coins: 500, steel: 8 },    days: 3.5 },
  // cavalry branch from spears
  bronzeLance:   { tab: 'melee', col: 1, row: 4, weapon: 'bronzeLance',   req: ['bronzeSpear', 'horsemanship'], cost: { coins: 200, bronze: 5, horses: 2 }, days: 2 },
  ironLance:     { tab: 'melee', col: 2, row: 4, weapon: 'ironLance',     req: ['bronzeLance'],            cost: { coins: 350, iron: 10, horses: 3 }, days: 3 },
  knightLance:   { tab: 'melee', col: 3, row: 4, weapon: 'knightLance',   req: ['ironLance', 'ref3'],      cost: { coins: 700, steel: 10, horses: 4 }, days: 4 },

  // ---- Ranged ----
  sling:         { tab: 'ranged', col: 0, row: 0, weapon: 'sling',                                       cost: { coins: 30, stone: 15 },    days: 0.6 },
  shortBow:      { tab: 'ranged', col: 0, row: 1, weapon: 'shortBow',      req: ['sling'],                cost: { coins: 70, wood: 30 },     days: 1 },
  compositeBow:  { tab: 'ranged', col: 1, row: 1, weapon: 'compositeBow',  req: ['shortBow', 'ref2'],     cost: { coins: 220, brass: 5, bronze: 5 }, days: 2 },
  longBow:       { tab: 'ranged', col: 2, row: 1, weapon: 'longBow',       req: ['compositeBow'],         cost: { coins: 320, iron: 8, planks: 20 }, days: 2.5 },
  crossbow:      { tab: 'ranged', col: 2, row: 2, weapon: 'crossbow',      req: ['shortBow', 'ref2'],     cost: { coins: 300, iron: 10, brass: 5 }, days: 2.5 },
  arbalest:      { tab: 'ranged', col: 3, row: 2, weapon: 'arbalest',      req: ['crossbow', 'ref3'],     cost: { coins: 600, steel: 10, brass: 5 }, days: 3.5 },

  // ---- Refining ----
  ref1:   { tab: 'refining', col: 0, row: 0, name: 'Basic Refinery',  icon: 'saw', desc: 'Sawmill & Charcoal Kiln. Tier I refineries.', cost: { coins: 50, wood: 20 }, days: 0.6 },
  ref2:   { tab: 'refining', col: 1, row: 0, name: 'Smelting',        icon: 'furnace', desc: 'Iron Smelter, Bronze Foundry, Brass Works. Tier II refineries (1.8× speed). Forge +30% speed.', req: ['ref1', 'mining'], cost: { coins: 150, planks: 20, stone: 30 }, days: 1.5 },
  ref3:   { tab: 'refining', col: 2, row: 0, name: 'Blast Furnace',   icon: 'flame', desc: 'Steelworks. Tier III refineries (2.8× speed). Forge +30% speed.', req: ['ref2'], cost: { coins: 400, iron: 20, stone: 60 }, days: 3 },
  ref4:   { tab: 'refining', col: 3, row: 0, name: 'Crucible Works',  icon: 'crucible', desc: 'Crucible for Damascus steel. Tier IV refineries (4.2× speed). Forge +30% speed.', req: ['ref3', 'bellows'], cost: { coins: 900, steel: 20, brass: 15 }, days: 4.5 },
  mining: { tab: 'refining', col: 0, row: 1, name: 'Mining',          icon: 'pick', desc: 'Unlocks Mines.', cost: { coins: 60, wood: 30 }, days: 0.8 },
  deepMining: { tab: 'refining', col: 1, row: 1, name: 'Deep Shafts', icon: 'pick', desc: 'Mines +50%.', req: ['mining', 'ref1'], cost: { coins: 180, planks: 30 }, days: 1.5 },
  bellows:{ tab: 'refining', col: 2, row: 1, name: 'Bellows',         icon: 'speed', desc: 'Refineries +25% speed. Forge +20% speed.', req: ['ref2'], cost: { coins: 260, planks: 30, iron: 10 }, days: 2 },

  // ---- Economy ----
  tools:        { tab: 'economy', col: 0, row: 0, name: 'Better Tools',   icon: 'hammer', desc: 'Camps, quarries, mines, expeditions +25%. One more expedition at a time.', cost: { coins: 60, wood: 30 }, days: 0.8 },
  cropRotation: { tab: 'economy', col: 1, row: 0, name: 'Crop Rotation',  icon: 'wheat', desc: 'Farms +30%.', req: ['tools'], cost: { coins: 120, planks: 15 }, days: 1.2 },
  masonry:      { tab: 'economy', col: 0, row: 1, name: 'Masonry',        icon: 'wall', desc: 'House level 3.', cost: { coins: 100, stone: 40 }, days: 1 },
  architecture: { tab: 'economy', col: 1, row: 1, name: 'Architecture',   icon: 'house', desc: 'Houses +25% capacity.', req: ['masonry'], cost: { coins: 250, planks: 40, stone: 60 }, days: 2 },
  tradeGuild:   { tab: 'economy', col: 0, row: 2, name: 'Trade Guild',    icon: 'scales', desc: 'Market margin 28% → 20%.', cost: { coins: 150 }, days: 1 },
  banking:      { tab: 'economy', col: 1, row: 2, name: 'Banking',        icon: 'coin', desc: 'Sell prices +15%.', req: ['tradeGuild'], cost: { coins: 300, brass: 5 }, days: 2 },
  horsemanship: { tab: 'economy', col: 0, row: 3, name: 'Horsemanship',   icon: 'horse', desc: 'Unlocks Stables.', cost: { coins: 150, planks: 20 }, days: 1.2 },
  husbandry:    { tab: 'economy', col: 1, row: 3, name: 'Animal Husbandry', icon: 'horseshoe', desc: 'Farms +20%, horses +50%.', req: ['horsemanship', 'cropRotation'], cost: { coins: 250, planks: 30 }, days: 2 },
  guilds:       { tab: 'economy', col: 2, row: 2, name: 'Merchant Republic', icon: 'crown', desc: 'Trade margin −40%.', req: ['banking'], cost: { coins: 600, steel: 5 }, days: 3 },

  // ---- Military & defence ----
  palisade:    { tab: 'military', col: 0, row: 0, name: 'Palisade',       icon: 'wall', desc: 'Taller palisade. Defenders take −10% damage.', cost: { coins: 60, wood: 60 }, days: 0.8 },
  stoneWalls:  { tab: 'military', col: 1, row: 0, name: 'Stone Walls',    icon: 'castle', desc: 'Stone walls. Defenders take −25% damage.', req: ['palisade', 'masonry'], cost: { coins: 250, stone: 150 }, days: 2 },
  watchtowers: { tab: 'military', col: 0, row: 1, name: 'Watchtowers',    icon: 'tower', desc: 'Unlocks Watchtowers.', req: ['palisade'], cost: { coins: 100, stone: 30 }, days: 1 },
  drill:       { tab: 'military', col: 0, row: 2, name: 'Drill Yards',    icon: 'sword', desc: 'Attack +10%. Training ×1.4 faster. Army size +80.', cost: { coins: 120 }, days: 1 },
  warAcademy:  { tab: 'military', col: 1, row: 2, name: 'War Academy',    icon: 'tech', desc: 'Attack +15%. Training faster again. Army size +150.', req: ['drill'], cost: { coins: 400, iron: 15 }, days: 2.5 },
  tactics:     { tab: 'military', col: 2, row: 2, name: 'Battle Tactics', icon: 'bow', desc: '+1 volley for ranged.', req: ['warAcademy'], cost: { coins: 700, steel: 10 }, days: 3 },
  chainmail:   { tab: 'military', col: 0, row: 3, name: 'Chainmail',      icon: 'armor', desc: 'Armour +1.', req: ['ref2'], cost: { coins: 200, iron: 20 }, days: 2 },
  plateArmor:  { tab: 'military', col: 1, row: 3, name: 'Plate Armour',   icon: 'shield', desc: 'Armour +2.', req: ['chainmail', 'ref3'], cost: { coins: 600, steel: 20 }, days: 3.5 },
  logistics:   { tab: 'military', col: 0, row: 4, name: 'Logistics',      icon: 'map', desc: 'March 35% faster. One more expedition at a time.', cost: { coins: 150, food: 100 }, days: 1.2 },
};

// ------------------------------------------------------------
//  Soldier training: harder weapons take longer and cost more
// ------------------------------------------------------------
const MAT_TIER = { bronze: 1, brass: 1, iron: 2, steel: 3, damascus: 4 };
function weaponTier(w) { return Math.max(0, ...Object.keys(WEAPONS[w].cost).map(k => MAT_TIER[k] || 0)); }
function trainDays(w) {
  const c = WEAPONS[w].cls;
  return 0.1 + weaponTier(w) * 0.08 + (c === 'cavalry' ? 0.15 : 0) + (c === 'ranged' ? 0.05 : 0);
}
function trainFee(w) { return 4 + weaponTier(w) * 6 + (WEAPONS[w].cls === 'cavalry' ? 10 : 0); }

// ------------------------------------------------------------
//  Cities of the realm (x, y = position on the world map; Emberfall is at 0,0).
//  Listed roughly from weakest to strongest.
// ------------------------------------------------------------
const KINGDOMS = [
  { id: 'oakhold', name: 'Oakhold', ruler: 'Baron Aldric', color: '#7fa650', x: -3, y: 2.5,
    garrison: { woodSpear: 25, woodSword: 20, sling: 15, woodJavelin: 10 }, growth: 0.012,
    loot: { coins: 300, wood: 200, food: 300 }, land: 1, desc: 'Timber village' },
  { id: 'millbrook', name: 'Millbrook', ruler: 'Reeve Tamsin', color: '#c9a14a', x: 3.5, y: 2.8,
    garrison: { woodSword: 22, shortBow: 15, woodSpear: 18 }, growth: 0.012,
    loot: { coins: 280, food: 450, planks: 60 }, land: 1, desc: 'Farming village' },
  { id: 'fernwick', name: 'Fernwick', ruler: 'Old Gareth', color: '#4f8f5a', x: -3.8, y: -3,
    garrison: { woodSpear: 30, woodJavelin: 20, sling: 22 }, growth: 0.013,
    loot: { coins: 320, wood: 300, charcoal: 50 }, land: 1, desc: 'Forest hamlet' },
  { id: 'coppermarch', name: 'Coppermarch', ruler: 'Lady Verena', color: '#d08a4a', x: -6.5, y: 5,
    garrison: { bronzeSpear: 35, bronzeSword: 25, shortBow: 25, bronzeJavelin: 15 }, growth: 0.015,
    loot: { coins: 600, copperOre: 120, zincOre: 80, brass: 20 }, land: 1, desc: 'Hill mines' },
  { id: 'stonebrook', name: 'Stonebrook', ruler: 'Thane Morwick', color: '#9aa3ad', x: 6, y: -3.5,
    garrison: { bronzeSpear: 30, bronzeAxe: 25, bronzeMace: 20, sling: 30 }, growth: 0.015,
    loot: { coins: 600, stone: 300, tinOre: 100, bronze: 25 }, land: 1, desc: 'Quarry town' },
  { id: 'ravenford', name: 'Ravenford', ruler: 'Sir Edric', color: '#7a6ac8', x: 1.5, y: -6.5,
    garrison: { bronzeSword: 30, bronzeAxe: 20, shortBow: 30, bronzeSpear: 25 }, growth: 0.016,
    loot: { coins: 700, bronze: 30, iron: 20 }, land: 1, desc: 'River fort' },
  { id: 'saltmere', name: 'Saltmere', ruler: 'Harbourmaster Ysolde', color: '#3f8fa8', x: 7.5, y: 5,
    garrison: { bronzeSpear: 40, compositeBow: 30, bronzeJavelin: 25 }, growth: 0.016,
    loot: { coins: 800, food: 500, brass: 25 }, land: 1, desc: 'Port town' },
  { id: 'ironvale', name: 'Ironvale', ruler: 'Duke Harrow', color: '#5e6b7a', x: -8, y: -6,
    garrison: { ironSword: 40, ironSpear: 40, longBow: 30, ironAxe: 20, ironJavelin: 15 }, growth: 0.018,
    loot: { coins: 1000, ironOre: 200, iron: 60, charcoal: 100 }, land: 1, desc: 'Northern forges' },
  { id: 'greywatch', name: 'Greywatch', ruler: 'Marshal Brann', color: '#7a8590', x: 9, y: -7,
    garrison: { ironSpear: 50, crossbow: 35, ironMace: 25, ironSword: 25 }, growth: 0.018,
    loot: { coins: 1100, iron: 80, stone: 300 }, land: 1, desc: 'Border fortress' },
  { id: 'thornwall', name: 'Thornwall', ruler: 'Lord Cassian', color: '#8a5a3a', x: -10.5, y: 1,
    garrison: { ironAxe: 40, ironJavelin: 30, longBow: 40, ironSpear: 30 }, growth: 0.019,
    loot: { coins: 1100, wood: 500, iron: 60 }, land: 1, desc: 'Walled timber city' },
  { id: 'ravenshire', name: 'Ravenshire', ruler: 'Countess Isolde', color: '#3b3f58', x: 10.5, y: 1,
    garrison: { ironLance: 30, ironSpear: 40, crossbow: 40, steelSword: 25, ironMace: 20 }, growth: 0.02,
    loot: { coins: 1600, horses: 25, steel: 40, iron: 80 }, land: 1, desc: 'Horse lords' },
  { id: 'blackmoor', name: 'Blackmoor', ruler: 'The Grey Abbot', color: '#2d2d33', x: -4.5, y: -10.5,
    garrison: { steelAxe: 40, morningStar: 30, crossbow: 45, ironLance: 25, steelPike: 30 }, growth: 0.021,
    loot: { coins: 2000, steel: 60, charcoal: 200 }, land: 1, desc: 'Fen citadel' },
  { id: 'highcrest', name: 'Highcrest', ruler: 'Queen Maelis', color: '#d6d6e6', x: 5, y: 10.5,
    garrison: { steelSword: 50, knightLance: 25, arbalest: 40, halberd: 25 }, growth: 0.021,
    loot: { coins: 2400, steel: 80, brass: 40 }, land: 1, desc: 'Mountain city' },
  { id: 'dragonspire', name: 'Dragonspire', ruler: 'King Oswin', color: '#a33b3b', x: -11, y: 10,
    garrison: { steelSword: 60, steelPike: 60, knightLance: 35, arbalest: 50, steelAxe: 30, morningStar: 20 }, growth: 0.022,
    loot: { coins: 3000, steel: 100, damascus: 20 }, land: 2, desc: 'The great kingdom' },
];
// march days and the compass direction an army leaves town in
for (const k of KINGDOMS) {
  k.dist = Math.max(1.5, Math.round(Math.hypot(k.x, k.y) / 2.2 * 10) / 10);
  k.angle = Math.atan2(k.y, k.x) * 180 / Math.PI;
}
