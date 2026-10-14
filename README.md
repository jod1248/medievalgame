# Emberfall — From Blacksmith to Emperor

A 3D medieval town-builder and war game that runs in the browser. No build step; Three.js is vendored in `js/lib`.

**Play:** open `index.html` in a modern browser with WebGL (or serve the folder, e.g. `python3 -m http.server`, and browse to it).

## The story
You are the blacksmith of Emberfall, a town of 200 people. The old reeve is dead and the town looks to you.
Send 50 villagers into the woods to gather wood. They return with 100 wood, enough for 5 new houses, and the free housing attracts settlers.
From there you grow the town, build refineries, forge an army, fight off raiders, and conquer the neighbouring kingdoms.

## Features
- **True 3D town (Three.js):**
  - Real-time shadows, a moving sun, and day/night with glowing windows, torches and lamp-lit streets.
  - Swaying forests, clouds that cast shadows, birds and fireflies.
  - Detailed buildings, from log cottages to stone townhouses, all modelled per level.
  - Fog banks roll along the misty hills at the edge of the world.
  - Drag to pan, right-drag or Q/E to rotate and tilt, scroll to zoom.
- **Walls** ring the town, with gates and corner towers. They upgrade from palisade to stone and grow when you conquer land.
- **Click a building** to open its panel with actions, stats and a next-level preview. Picking a building to place shows its stats before you build.
- **Tech tree** at the Forge, with a research queue for anything you've unlocked.
- **One refinery per material** (Sawmill, Charcoal Kiln, Iron Smelter, Bronze Foundry, Brass Works, Steelworks, Crucible). Each has a slider for how much it refines and four tiers.
- **Barracks:** recruit soldiers from the weapons in your armoury. Each recruit costs a one-time fee and takes time to train, longer for harder weapons.
- **One marketplace** with search. There are no wages and no passive income.
- **3D battles** with every soldier on the field: armies march in, archers and javelins loose volleys, the lines charge and clash, and the loser routs, in front of your town walls or the enemy's castle.
- **3D world map** with 14 cities, from timber villages to walled towns and great castles, linked by roads across an island realm.
- **Generated medieval music** (toggle in the top right). The war drums swell when raiders approach or battle begins.
- Tutorial, custom SVG icons, and autosave to `localStorage`.

## Code layout
| File | Purpose |
|---|---|
| `js/data.js` | All game data: resources, buildings, recipes, weapons, tech tree, kingdoms, objectives |
| `js/state.js` | Game state, map generation, save/load, helpers |
| `js/sim.js` | Economy, population, research, forge, refineries, expeditions, raids, campaigns, market |
| `js/combat.js` | Battle simulation (volleys, melee rounds, class bonuses, armour, morale) |
| `js/lib/three.min.js` | Three.js r158 (MIT, see `three.LICENSE`) |
| `js/gfx.js` | Procedural textures, materials, geometry helpers, mesh baking, foliage sway |
| `js/models.js` | 3D models for every building, level and wall piece |
| `js/render.js` | 3D town renderer: terrain, trees, walls, people, particles, sky, lighting, camera |
| `js/worldmap.js` | 3D world map |
| `js/music.js` | Generated Web Audio score |
| `js/ui.js` | HTML panels, tutorial, tech tree, market, modals |
| `js/battle.js` | 3D battle scene that replays a simulated battle with every soldier |
| `js/icons.js` | Custom SVG icon set |
| `js/main.js` | Game loop and input |
