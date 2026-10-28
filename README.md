# Emberfall — From Blacksmith to Emperor

A 3D medieval town-builder and war game that runs in the browser. No build step; Three.js is vendored in `js/lib`.

**Play:** open `index.html` in a modern browser with WebGL (or serve the folder, e.g. `python3 -m http.server`, and browse to it).

## The story
You are the blacksmith of Emberfall, a town of 200 people. The old reeve is dead and the town looks to you.
Send 50 villagers into the woods to gather wood. They return with 100 wood, enough for 5 new houses, and the free housing attracts settlers.
From there you grow the town, build refineries, forge an army, fight off raiders, and conquer the neighbouring kingdoms.

## Features
- **Isometric pixel-art town (Three.js):**
  - Seen from the corner through an orthographic camera and rendered at half resolution, with pixel outlines, hand-pixelled textures and a dithered palette (battles and the world map use the same look).
  - A moving sun, hard shadows, and day/night with glowing windows and lamp-lit streets.
  - Swaying forests, clouds, birds and fireflies; fog banks roll along the misty hills at the edge of the world.
  - Settlers arrive through the gates in family groups, carrying bundles or pulling handcarts, and walk to their new homes.
  - Camera: drag or WASD to pan, scroll to zoom. Right-drag (or Q/E, R/F) turns the view up to 15° either side of the corner view and tilts it from low to almost straight down.
- **Command square** in the middle of the town's back-right (north) side: Town Hall, Forge, Barracks and Marketplace round a fountain. They are scenery; you run them from the tool dock at the bottom (Expeditions, Tech Tree, Forge, Market, Army, World Map), and each tool shows its building's level and upgrade.
- **Build tool:** opens a tray of buildings above the dock. Picking one shows its stats before you place it.
- **Walls** ring the town, with gates and corner towers. They upgrade from palisade to stone and grow when you conquer land.
- **Click a building** you placed to see its stats, next-level preview, upgrade and controls.
- **Vertical tech tree** (tiers top to bottom, one column per branch) with a research queue for anything you've unlocked.
- **One refinery per material** (Sawmill, Charcoal Kiln, Iron Smelter, Bronze Foundry, Brass Works, Steelworks, Crucible). Each has a slider for how much it refines and four tiers.
- **Barracks:** recruit soldiers from the weapons in your armoury. Each recruit costs a one-time fee and takes time to train, longer for harder weapons.
- **One marketplace** with search. There are no wages and no passive income.
- **3D battles, soldier by soldier:** every figure is one fighter (up to 1,500 a side), equipped by weapon and material: helmets, shields, capes, quivers, banners and barded horses. Every death in the simulation is dealt on screen by a real attacker of the right type: arrows, bolts, sling stones and javelins that strike their target, tower shots from the walls, or a blow from the enemy they were fighting. Fallen soldiers stay on the field with arrows in them. Live unit counts per type match the simulation exactly. Drag to turn the camera, scroll to zoom in.
- **3D world map** with 14 cities, from timber villages to walled towns and great castles, linked by roads across an island realm.
- **Generated medieval music** (toggle in the top right). The war drums swell when raiders approach or battle begins.
- Tutorial, custom SVG icons, and autosave to `localStorage`.

## Code layout
| File | Purpose |
|---|---|
| `js/data.js` | All game data: resources, buildings, recipes, weapons, tech tree, kingdoms, objectives |
| `js/state.js` | Game state, map generation, save/load, helpers |
| `js/sim.js` | Economy, population, research, forge, refineries, expeditions, raids, campaigns, market |
| `js/combat.js` | Battle simulation (volleys, melee rounds, class bonuses, armour, morale); records who killed whom each round |
| `js/lib/three.min.js` | Three.js r158 (MIT, see `three.LICENSE`) |
| `js/gfx.js` | Procedural textures, materials, geometry helpers, mesh baking, foliage sway |
| `js/models.js` | 3D models for every building, level and wall piece |
| `js/render.js` | 3D town renderer: terrain, trees, walls, people, particles, sky, lighting, camera |
| `js/worldmap.js` | 3D world map |
| `js/music.js` | Generated Web Audio score |
| `js/ui.js` | HTML panels, tutorial, tech tree, market, modals |
| `js/battle.js` | 3D battle scene: replays the simulation soldier by soldier, assigning every death to a visible attacker |
| `js/icons.js` | Custom SVG icon set |
| `js/main.js` | Game loop and input |
