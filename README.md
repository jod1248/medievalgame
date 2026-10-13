# Emberfall — From Blacksmith to Emperor

A 2.5D (isometric) medieval town-builder and war game that runs in the browser. No build step and no dependencies.

**Play:** open `index.html` in a modern browser (or serve the folder, e.g. `python3 -m http.server`, and browse to it).

## The story
You are the blacksmith of Emberfall, a town of 200 people. The old reeve is dead and the town looks to you.
Send 50 villagers into the woods to gather wood. They return with 100 wood, enough for 5 new houses, and the free housing attracts settlers.
From there you grow the town, build refineries, forge an army, fight off raiders, and conquer the neighbouring kingdoms.

## Features
- **Animated isometric town:** swaying trees, drifting clouds and birds, villagers walking the streets, smoke and sparks. Drag or use WASD to pan, scroll to zoom (eased).
- **Day and night:** a full cycle every in-game day (48 seconds at normal speed). At night, windows, torches, forges and lanterns light up, and fireflies come out.
- **Walls** ring the town, with gates where the roads leave and towers on the corners. They grow when you conquer land and upgrade from palisade to stone.
- **Command Center** on the east side of town: Forge, Marketplace, Town Hall, Barracks. Hover a building for quick-action icons and click it for details and upgrades.
- **Tutorial** walks you through the first steps. It can be skipped and restarted from Help.
- **Tech tree** at the Forge, with tabs for melee (swords → axes and maces, spears → javelins and cavalry), ranged (sling, bows, crossbows), refining, economy and military.
- **One refinery per material:** Sawmill, Charcoal Kiln, Iron Smelter, Bronze Foundry, Brass Works, Steelworks, Crucible. Each has a slider for how much of its capacity it uses, and four tiers unlocked by research.
- **No passive income:** wages are paid from coins earned by trading (market with search), loot and repelled raids.
- **Animated battles** for raids and invasions: armies march in, archers and javelins fire volleys, the lines charge and clash, soldiers fall, and the loser routs. You can speed it up or skip.
- Custom SVG icon set (no emoji), minimal text with details in tooltips, and autosave to `localStorage`.

## Code layout
| File | Purpose |
|---|---|
| `js/data.js` | All game data: resources, buildings, recipes, weapons, tech tree, kingdoms, objectives |
| `js/state.js` | Game state, map generation, save/load, helpers |
| `js/sim.js` | Economy, population, research, forge, refineries, expeditions, raids, campaigns, market |
| `js/combat.js` | Battle simulation (volleys, melee rounds, class bonuses, armour, morale) |
| `js/render.js` | Canvas isometric renderer (terrain, buildings, trees, people, particles) |
| `js/ui.js` | HTML panels, tutorial, tech tree, market, modals |
| `js/battle.js` | Animated battle scene that replays a simulated battle |
| `js/icons.js` | Custom SVG icon set |
| `js/main.js` | Game loop and input |
