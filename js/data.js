// ============================================================
//  Static game data: resources, buildings, recipes, weapons,
//  tech tree, neighbouring kingdoms.
// ============================================================

const DAY_SECONDS = 12;          // real seconds per in-game day at 1x speed
const WAGE_WORKER = 0.3;         // coins per worker per day
const WAGE_SOLDIER = 0.6;        // coins per soldier per day
const FOOD_PER_PERSON = 0.15;    // food eaten per person per day
const RECRUIT_COST = 5;          // coins to train one soldier

const RES = {
  food:      { name: 'Food',           icon: '🍞', price: 1 },
  wood:      { name: 'Wood',           icon: '🪵', price: 1 },
  stone:     { name: 'Stone',          icon: '🪨', price: 1.5 },
  planks:    { name: 'Planks',         icon: '🪚', price: 3.5 },
  charcoal:  { name: 'Charcoal',       icon: '⚫', price: 3.5 },
  ironOre:   { name: 'Iron Ore',       icon: '🟤', price: 2.5 },
  copperOre: { name: 'Copper Ore',     icon: '🟠', price: 2.5 },
  tinOre:    { name: 'Tin Ore',        icon: '⚪', price: 3 },
  zincOre:   { name: 'Zinc Ore',       icon: '🔘', price: 3 },
  iron:      { name: 'Iron',           icon: '⚙️', price: 9 },
  bronze:    { name: 'Bronze',         icon: '🥉', price: 10 },
  brass:     { name: 'Brass',          icon: '🔔', price: 11 },
  steel:     { name: 'Steel',          icon: '🔷', price: 24 },
  damascus:  { name: 'Damascus Steel', icon: '💠', price: 60 },
  horses:    { name: 'Horses',         icon: '🐎', price: 45 },
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
const REFINERY_TIER_NAMES = ['', 'Tier I — Workshop', 'Tier II — Smelter', 'Tier III — Blast Furnace', 'Tier IV — Crucible Works'];

// ------------------------------------------------------------
//  Buildings
// ------------------------------------------------------------
const BUILDINGS = {
  house: {
    name: 'House', size: 1, buildable: true, cost: { wood: 20 }, buildDays: 0.4, maxLevel: 3,
    upgrade: [null, { planks: 15, stone: 10 }, { planks: 30, stone: 30, coins: 40 }],
    upgradeReq: [null, null, 'masonry'],
    capacity: [10, 16, 24],
    desc: 'Homes for your people. Free housing attracts new settlers.',
  },
  farm: {
    name: 'Farm', size: 2, buildable: true, cost: { wood: 30 }, buildDays: 0.6, maxLevel: 3,
    upgrade: [null, { planks: 20, coins: 30 }, { planks: 40, iron: 5, coins: 60 }],
    workers: [10, 14, 18], rate: [1.0, 1.15, 1.35], produces: 'food',
    desc: 'Farmers grow food. Every person eats ' + FOOD_PER_PERSON + ' food per day.',
  },
  lumber: {
    name: 'Lumber Camp', size: 1, buildable: true, cost: { wood: 15, coins: 20 }, buildDays: 0.4, maxLevel: 3,
    upgrade: [null, { planks: 15, coins: 30 }, { planks: 30, iron: 5, coins: 60 }],
    workers: [8, 12, 16], rate: [1.0, 1.2, 1.45], produces: 'wood',
    desc: 'Woodcutters steadily fell trees for wood.',
  },
  quarry: {
    name: 'Quarry', size: 1, buildable: true, cost: { wood: 30 }, buildDays: 0.5, maxLevel: 3,
    upgrade: [null, { planks: 20, coins: 30 }, { planks: 30, iron: 8, coins: 60 }],
    workers: [8, 12, 16], rate: [0.6, 0.75, 0.95], produces: 'stone',
    desc: 'Masons cut stone from the earth.',
  },
  mine: {
    name: 'Mine', size: 1, buildable: true, cost: { wood: 40, stone: 20 }, buildDays: 0.8, maxLevel: 3, requires: 'mining',
    upgrade: [null, { planks: 25, stone: 30 }, { planks: 40, iron: 10, stone: 40 }],
    workers: [8, 12, 16], rate: [0.45, 0.55, 0.7], produces: 'ore',
    desc: 'Miners dig for ore. Choose which ore the mine extracts.',
  },
  refinery: {
    name: 'Refinery', size: 1, buildable: true, cost: { wood: 30, stone: 30 }, buildDays: 0.6, maxLevel: 4, requires: 'ref1',
    upgrade: [null, { planks: 20, stone: 40, coins: 60 }, { planks: 30, stone: 60, iron: 10, coins: 120 }, { stone: 100, steel: 10, brass: 10, coins: 250 }],
    upgradeReq: [null, 'ref2', 'ref3', 'ref4'],
    workers: [4, 5, 6, 8],
    desc: 'Refines raw resources. Higher tiers refine faster and unlock advanced recipes.',
  },
  watchtower: {
    name: 'Watchtower', size: 1, buildable: true, cost: { stone: 40, planks: 10 }, buildDays: 0.8, maxLevel: 2, requires: 'watchtowers',
    upgrade: [null, { stone: 60, iron: 10 }],
    desc: 'Archers in the tower shoot at raiders before and during battle.',
  },
  stables: {
    name: 'Stables', size: 2, buildable: true, cost: { planks: 40, stone: 20 }, buildDays: 1, maxLevel: 2, requires: 'horsemanship',
    upgrade: [null, { planks: 40, iron: 10 }],
    workers: [4, 8], rate: [0.08, 0.1], produces: 'horses', consumes: { food: 4 },
    desc: 'Breeds horses (uses food). Horses are needed for cavalry lances.',
  },
  // ---- Command center (unique) ----
  townhall: {
    name: 'Town Hall', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 40, stone: 60, coins: 100 }, { planks: 80, stone: 150, iron: 20, coins: 300 }],
    tax: [0.2, 0.27, 0.35],
    desc: 'Seat of your rule. Collects taxes and organises expeditions.',
  },
  forge: {
    name: 'Forge', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 30, stone: 40, coins: 80 }, { stone: 80, iron: 25, coins: 200 }],
    speed: [1, 1.6, 2.4],
    desc: 'Your old smithy. Forge weapons and research new technology.',
  },
  market: {
    name: 'Marketplace', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 30, coins: 100 }, { planks: 60, brass: 10, coins: 250 }],
    upgradeReq: [null, null, 'tradeGuild'],
    spread: [0.3, 0.22, 0.15],
    desc: 'Trade resources with neighbouring kingdoms for coins.',
  },
  barracks: {
    name: 'Barracks', size: 2, unique: true, maxLevel: 3,
    upgrade: [null, { planks: 40, stone: 40, coins: 80 }, { planks: 60, stone: 100, iron: 20, coins: 200 }],
    capacity: [60, 150, 350],
    desc: 'Train soldiers with weapons from the armoury and command your army.',
  },
};
const BUILD_MENU = ['house', 'farm', 'lumber', 'quarry', 'mine', 'refinery', 'watchtower', 'stables'];
const ORE_TYPES = ['ironOre', 'copperOre', 'tinOre', 'zincOre'];

// ------------------------------------------------------------
//  Expeditions sent from the Town Hall
// ------------------------------------------------------------
const EXPEDITIONS = {
  wood:  { name: 'Gather Wood',    days: 1.5, yield: { wood: 1.2 },  desc: '1.2 wood per person' },
  stone: { name: 'Haul Stone',     days: 2,   yield: { stone: 0.9 }, desc: '0.9 stone per person' },
  food:  { name: 'Hunt & Forage',  days: 1.5, yield: { food: 1.5 },  desc: '1.5 food per person' },
  ore:   { name: 'Prospect Ore',   days: 3,   yield: { ironOre: 0.3, copperOre: 0.25, tinOre: 0.15, zincOre: 0.15 }, desc: 'Mixed ores (~0.85 per person)' },
};

// ------------------------------------------------------------
//  Weapon classes and their matchups
// ------------------------------------------------------------
const CLASSES = {
  sword:   { name: 'Swords',   color: '#c9d1d9', pros: 'Balanced fighters. Strong vs spearmen and javelineers.', cons: 'No special tricks.' },
  axe:     { name: 'War Axes', color: '#e3794b', pros: 'Huge damage, pierce armour, hook shields (strong vs swords & spears).', cons: 'Light armour — javelins and arrows shred them.' },
  mace:    { name: 'Maces',    color: '#b48ead', pros: 'Crushing blows — the heavier the enemy armour, the harder they hit.', cons: 'Mediocre vs unarmoured troops. Vulnerable to javelins.' },
  spear:   { name: 'Spears',   color: '#88c0d0', pros: 'Shields (high armour), strike first, devastating vs cavalry.', cons: 'Low damage. Swords and axes get inside their reach.' },
  javelin: { name: 'Javelins', color: '#a3be8c', pros: 'Throw 2 heavy volleys before melee. Strong vs axes, maces & cavalry.', cons: 'Weak once melee begins. Swords cut them down.' },
  ranged:  { name: 'Ranged',   color: '#ebcb8b', pros: 'Many volleys before melee and keep shooting behind your lines.', cons: 'Fragile, weak vs heavy armour, slaughtered by cavalry.' },
  cavalry: { name: 'Cavalry',  color: '#d08770', pros: 'Massive charge, lots of health, hunts archers & javelineers.', cons: 'Needs horses. Spears counter them hard.' },
  militia: { name: 'Militia',  color: '#999',    pros: 'Free — peasants grab pitchforks.', cons: 'Barely trained.' },
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
  { id: 'melee',    name: '⚔️ Melee Weapons', cols: ['Wood', 'Bronze', 'Iron', 'Steel', 'Masterwork'] },
  { id: 'ranged',   name: '🏹 Ranged Weapons', cols: ['Wood', 'Bronze', 'Iron', 'Steel'] },
  { id: 'refining', name: '🔥 Refining',       cols: ['Tier I', 'Tier II', 'Tier III', 'Tier IV'] },
  { id: 'economy',  name: '💰 Economy',        cols: ['Basic', 'Advanced', 'Expert'] },
  { id: 'military', name: '🛡️ Military & Defence', cols: ['Basic', 'Advanced', 'Expert'] },
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
  ref1:   { tab: 'refining', col: 0, row: 0, name: 'Basic Refinery',  icon: '🪚', desc: 'Unlocks the Refinery building (Tier I): wood → planks, wood → charcoal.', cost: { coins: 50, wood: 20 }, days: 0.6 },
  ref2:   { tab: 'refining', col: 1, row: 0, name: 'Smelting',        icon: '🔥', desc: 'Refinery Tier II (1.8× speed): ore → iron, copper + tin → bronze, copper + zinc → brass.', req: ['ref1', 'mining'], cost: { coins: 150, planks: 20, stone: 30 }, days: 1.5 },
  ref3:   { tab: 'refining', col: 2, row: 0, name: 'Blast Furnace',   icon: '🏭', desc: 'Refinery Tier III (2.8× speed): iron + charcoal → steel.', req: ['ref2'], cost: { coins: 400, iron: 20, stone: 60 }, days: 3 },
  ref4:   { tab: 'refining', col: 3, row: 0, name: 'Crucible Works',  icon: '💠', desc: 'Refinery Tier IV (4.2× speed): steel + brass → Damascus steel.', req: ['ref3', 'bellows'], cost: { coins: 900, steel: 20, brass: 15 }, days: 4.5 },
  mining: { tab: 'refining', col: 0, row: 1, name: 'Mining',          icon: '⛏️', desc: 'Unlocks the Mine building to dig iron, copper, tin and zinc ore.', cost: { coins: 60, wood: 30 }, days: 0.8 },
  deepMining: { tab: 'refining', col: 1, row: 1, name: 'Deep Shafts', icon: '🕳️', desc: 'Mines produce +50% ore.', req: ['mining', 'ref1'], cost: { coins: 180, planks: 30 }, days: 1.5 },
  bellows:{ tab: 'refining', col: 2, row: 1, name: 'Bellows',         icon: '💨', desc: 'All refineries work +25% faster.', req: ['ref2'], cost: { coins: 260, planks: 30, iron: 10 }, days: 2 },

  // ---- Economy ----
  tools:        { tab: 'economy', col: 0, row: 0, name: 'Better Tools',   icon: '🔨', desc: '+25% output from lumber camps, quarries, mines and expeditions.', cost: { coins: 60, wood: 30 }, days: 0.8 },
  cropRotation: { tab: 'economy', col: 1, row: 0, name: 'Crop Rotation',  icon: '🌾', desc: 'Farms produce +30% food.', req: ['tools'], cost: { coins: 120, planks: 15 }, days: 1.2 },
  masonry:      { tab: 'economy', col: 0, row: 1, name: 'Masonry',        icon: '🧱', desc: 'Houses can be upgraded to Level 3.', cost: { coins: 100, stone: 40 }, days: 1 },
  architecture: { tab: 'economy', col: 1, row: 1, name: 'Architecture',   icon: '🏛️', desc: 'All houses hold +25% more people.', req: ['masonry'], cost: { coins: 250, planks: 40, stone: 60 }, days: 2 },
  tradeGuild:   { tab: 'economy', col: 0, row: 2, name: 'Trade Guild',    icon: '⚖️', desc: 'Marketplace can be upgraded to Level 3 (best prices).', cost: { coins: 150 }, days: 1 },
  banking:      { tab: 'economy', col: 1, row: 2, name: 'Banking',        icon: '🏦', desc: '+30% taxes.', req: ['tradeGuild'], cost: { coins: 300, brass: 5 }, days: 2 },
  horsemanship: { tab: 'economy', col: 0, row: 3, name: 'Horsemanship',   icon: '🐎', desc: 'Unlocks Stables (breed horses) for cavalry.', cost: { coins: 150, planks: 20 }, days: 1.2 },
  husbandry:    { tab: 'economy', col: 1, row: 3, name: 'Animal Husbandry', icon: '🐄', desc: 'Farms +20% food and stables breed +50% horses.', req: ['horsemanship', 'cropRotation'], cost: { coins: 250, planks: 30 }, days: 2 },
  guilds:       { tab: 'economy', col: 2, row: 2, name: 'Merchant Republic', icon: '👑', desc: 'Conquered kingdoms pay +50% tribute.', req: ['banking'], cost: { coins: 600, steel: 5 }, days: 3 },

  // ---- Military & defence ----
  palisade:    { tab: 'military', col: 0, row: 0, name: 'Palisade',       icon: '🪵', desc: 'Wooden walls: defenders take 10% less damage in raids.', cost: { coins: 60, wood: 60 }, days: 0.8 },
  stoneWalls:  { tab: 'military', col: 1, row: 0, name: 'Stone Walls',    icon: '🏰', desc: 'Defenders take 25% less damage in raids.', req: ['palisade', 'masonry'], cost: { coins: 250, stone: 150 }, days: 2 },
  watchtowers: { tab: 'military', col: 0, row: 1, name: 'Watchtowers',    icon: '🗼', desc: 'Unlocks Watchtowers that shoot raiders.', req: ['palisade'], cost: { coins: 100, stone: 30 }, days: 1 },
  drill:       { tab: 'military', col: 0, row: 2, name: 'Drill Yards',    icon: '🎯', desc: 'All soldiers +10% attack.', cost: { coins: 120 }, days: 1 },
  warAcademy:  { tab: 'military', col: 1, row: 2, name: 'War Academy',    icon: '📜', desc: 'All soldiers +15% more attack.', req: ['drill'], cost: { coins: 400, iron: 15 }, days: 2.5 },
  tactics:     { tab: 'military', col: 2, row: 2, name: 'Battle Tactics', icon: '♟️', desc: 'Ranged & javelin units get +1 extra volley.', req: ['warAcademy'], cost: { coins: 700, steel: 10 }, days: 3 },
  chainmail:   { tab: 'military', col: 0, row: 3, name: 'Chainmail',      icon: '⛓️', desc: 'All soldiers +1 armour.', req: ['ref2'], cost: { coins: 200, iron: 20 }, days: 2 },
  plateArmor:  { tab: 'military', col: 1, row: 3, name: 'Plate Armour',   icon: '🛡️', desc: 'All soldiers +2 more armour.', req: ['chainmail', 'ref3'], cost: { coins: 600, steel: 20 }, days: 3.5 },
  logistics:   { tab: 'military', col: 0, row: 4, name: 'Logistics',      icon: '🗺️', desc: 'Armies march 35% faster.', cost: { coins: 150, food: 100 }, days: 1.2 },
};

// ------------------------------------------------------------
//  Neighbouring kingdoms
// ------------------------------------------------------------
const KINGDOMS = [
  { id: 'oakhold', name: 'Oakhold', ruler: 'Baron Aldric the Stout', color: '#7fa650', dist: 2, angle: 200,
    garrison: { woodSpear: 25, woodSword: 20, sling: 15, woodJavelin: 10 }, growth: 0.012,
    loot: { coins: 300, wood: 200, food: 300 }, tribute: 12, land: 2,
    trade: { wood: 0.75, food: 0.8, planks: 0.85, iron: 1.2, steel: 1.25 },
    desc: 'A sleepy timber barony. Cheap wood & food.' },
  { id: 'coppermarch', name: 'Coppermarch', ruler: 'Lady Verena', color: '#d08a4a', dist: 3, angle: 140,
    garrison: { bronzeSpear: 35, bronzeSword: 25, shortBow: 25, bronzeJavelin: 15 }, growth: 0.015,
    loot: { coins: 600, copperOre: 120, zincOre: 80, brass: 20 }, tribute: 20, land: 2,
    trade: { copperOre: 0.7, zincOre: 0.7, brass: 0.8, food: 1.2, wood: 1.15 },
    desc: 'Copper mines in the hills. Cheap copper, zinc & brass.' },
  { id: 'stonebrook', name: 'Stonebrook', ruler: 'Thane Morwick', color: '#9aa3ad', dist: 3, angle: 255,
    garrison: { bronzeSpear: 30, bronzeAxe: 25, bronzeMace: 20, sling: 30 }, growth: 0.015,
    loot: { coins: 600, stone: 300, tinOre: 100, bronze: 25 }, tribute: 20, land: 2,
    trade: { stone: 0.7, tinOre: 0.7, bronze: 0.8, planks: 1.2, horses: 1.2 },
    desc: 'Quarry-town of hard men. Cheap stone, tin & bronze.' },
  { id: 'ironvale', name: 'Ironvale', ruler: 'Duke Harrow', color: '#5e6b7a', dist: 4, angle: 320,
    garrison: { ironSword: 40, ironSpear: 40, longBow: 30, ironAxe: 20, ironJavelin: 15 }, growth: 0.018,
    loot: { coins: 1000, ironOre: 200, iron: 60, charcoal: 100 }, tribute: 32, land: 2,
    trade: { ironOre: 0.7, iron: 0.75, charcoal: 0.75, food: 1.25, brass: 1.2 },
    desc: 'Forges of the north. Cheap iron ore, iron & charcoal.' },
  { id: 'ravenshire', name: 'Ravenshire', ruler: 'Countess Isolde', color: '#3b3f58', dist: 5, angle: 30,
    garrison: { ironLance: 30, ironSpear: 40, crossbow: 40, steelSword: 25, ironMace: 20 }, growth: 0.02,
    loot: { coins: 1600, horses: 25, steel: 40, iron: 80 }, tribute: 45, land: 2,
    trade: { horses: 0.65, food: 0.9, steel: 0.9, stone: 1.2, planks: 1.15 },
    desc: 'Horse lords of the plains. Cheap horses.' },
  { id: 'dragonspire', name: 'Dragonspire', ruler: 'King Oswin the Iron Crown', color: '#a33b3b', dist: 6, angle: 85,
    garrison: { steelSword: 60, steelPike: 60, knightLance: 35, arbalest: 50, steelAxe: 30, morningStar: 20 }, growth: 0.022,
    loot: { coins: 3000, steel: 100, damascus: 20 }, tribute: 70, land: 3,
    trade: { steel: 0.75, damascus: 0.7, iron: 0.85, food: 1.3, wood: 1.3 },
    desc: 'The great kingdom. Conquer it and you rule the realm.' },
];

// ------------------------------------------------------------
//  Objectives / story
// ------------------------------------------------------------
const OBJECTIVES = [
  { id: 'sendWood',  text: 'Send 50 villagers to gather wood (Town Hall → Expeditions)', reward: {} },
  { id: 'getWood',   text: 'Wait for the wood gatherers to return with 100 wood', reward: {} },
  { id: 'houses',    text: 'Build 5 new houses to attract settlers', reward: { coins: 100 } },
  { id: 'growth',    text: 'Grow your town to 240 people', reward: { coins: 100, food: 100 } },
  { id: 'research',  text: 'Hover the Forge → Tech Tree, and research any technology', reward: { coins: 80 } },
  { id: 'refinery',  text: 'Research Basic Refinery and build a Refinery', reward: { wood: 60 } },
  { id: 'craft',     text: 'Forge 10 weapons at the Forge', reward: { coins: 100 } },
  { id: 'recruit',   text: 'Train 10 soldiers at the Barracks', reward: { coins: 100 } },
  { id: 'trade',     text: 'Buy or sell goods at the Marketplace', reward: { coins: 50 } },
  { id: 'defend',    text: 'Repel a raid on your town', reward: { coins: 200 } },
  { id: 'conquer',   text: 'Conquer a neighbouring kingdom (Barracks → World Map)', reward: { coins: 300 } },
  { id: 'emperor',   text: 'Conquer every kingdom and become Emperor', reward: {} },
];
