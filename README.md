# Emberfall — From Blacksmith to Emperor

A 2.5D (isometric) medieval town-builder and war game that runs in the browser. No build step and no dependencies.

**Play:** open `index.html` in a modern browser (or serve the folder, e.g. `python3 -m http.server`, and browse to it).

## The story
You are the blacksmith of Emberfall, a town of 200 people. The old reeve is dead and the town looks to you.
Send 50 villagers into the woods to gather wood. They return with 100 wood, enough for 5 new houses, and the free housing attracts settlers.
From there you grow the town, build refineries, forge an army, fight off raiders, and conquer the neighbouring kingdoms.

## Features
- **Isometric town view:** pan by dragging or with WASD/arrow keys, and zoom with the mouse wheel. Villagers walk the streets, expeditions march into the forest, and armies march to war.
- **Command Center** on the east (right-hand) side of town, with the Forge, Marketplace, Town Hall and Barracks.
  Hover a building to get quick-action buttons. Click it to see details and upgrade it.
- **Forge and tech tree:** five research branches:
  - *Melee:* wood → bronze → iron → steel → masterwork. Swords branch into **war axes** and **maces**. Spears branch into **javelins** and **cavalry lances**. The **Halberd** needs both the pike and axe lines.
  - *Ranged:* sling → short bow → composite bow → longbow, plus crossbow → arbalest.
  - *Refining:* Refinery tiers I–IV (wood→planks/charcoal, ore→iron, copper+tin→bronze, copper+zinc→brass, iron+charcoal→steel, steel+brass→Damascus), plus mining and bellows.
  - *Economy* and *Military & Defence:* tools, crop rotation, masonry, banking, horsemanship, palisade and stone walls, watchtowers, drill, chainmail, plate armour, logistics…
- **Weapon classes with counters:** swords beat spears, spears crush cavalry, axes pierce armour and hook shields, maces crush heavy armour, javelins and archers fire volleys before melee, and cavalry hunts ranged units. A balanced army wins.
- **Refineries:** place them around the city, pick a recipe, and upgrade the tier to refine faster and unlock advanced materials.
- **Marketplace:** buy and sell every resource with six kingdoms. Each has its own prices, and prices shift as you trade. Coins pay your workers and soldiers.
- **Raids and conquest:** raiders attack periodically, and you get a warning and a win-chance forecast in advance. Invade neighbours from the World Map to win loot and daily tribute and to expand your borders. Conquer all six to become Emperor.
- Battle reports with a strength chart and round-by-round log. Autosave to `localStorage`.

## Code layout
| File | Purpose |
|---|---|
| `js/data.js` | All game data: resources, buildings, recipes, weapons, tech tree, kingdoms, objectives |
| `js/state.js` | Game state, map generation, save/load, helpers |
| `js/sim.js` | Economy, population, research, forge, expeditions, raids, campaigns, market |
| `js/combat.js` | Battle simulation (volleys, melee rounds, class bonuses, armour, morale) |
| `js/render.js` | Canvas isometric renderer (terrain, buildings, trees, people, particles) |
| `js/ui.js` | HTML panels, tech tree, modals, battle reports |
| `js/main.js` | Game loop and input |
