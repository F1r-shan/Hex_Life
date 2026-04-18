# Hex Life

A browser-based god simulator on a procedurally generated hex grid. Watch civilizations rise, form alliances, go to war, and collapse — all on their own.

## Play

Open `index.html` directly in a browser. No build step, no server, no dependencies.

## Controls

| Input | Action |
|---|---|
| Scroll | Zoom in / out |
| Drag | Pan camera |
| Pinch (touch) | Zoom |

### Panel (top-right)

- **World Seed** — type any text and click **Generate** to create a new world
- **+ Add Human** — click to enter placement mode, then click a hex to place humans (set quantity 1–50); click an occupied hex to remove
- **Emotions** — toggle emotion bubbles above humans
- **Love Lines** — toggle dashed hearts between couples
- **Village Zones** — toggle zone fills and labels
- **Paint Terrain** — select a terrain type and drag to reshape the land

Press **Esc** to cancel placement or painting.

## Simulation

### Humans

Each human has an age, gender, and zone membership. They walk around, fall in love, have children, build homes, and eventually die.

- **Aging** — 1 real second = 1 simulation year. Death at 100, or earlier by random risk
- **Love** — single adults near each other may form a couple (shown by a pink dashed line)
- **Children** — male/female couples can have babies (twins 15%, triplets 3%); near a building the cooldown is shorter
- **Walking** — zone members stay inside their zone; they leave if they step outside

### Terrain

Five types: 🌊 Water, 🏖️ Sand, 🌿 Grass, 🪨 Rock, ❌ Blocked. Water and Blocked are unwalkable. Use **Paint Terrain** to modify any hex.

### Settlements & Eras

Couples build structures over time. Buildings cluster into zones with generated names (_Oakhaven_, _Stoneford_…).

**Settlement tiers** grow with zone size (hex count):

| Tier | Size |
|---|---|
| ⛺ Camp | 0–19 |
| 🏘 Village | 20–39 |
| 🏙 Town | 40–59 |
| 🌆 City | 60–79 |
| 🌇 Metropolis | 80+ |

**Eras** advance with population:

| Era | Population | Effect |
|---|---|---|
| 🪨 Stone Age | 0+ | baseline |
| 🗡️ Iron Age | 10+ | faster building & births |
| 🏰 Medieval | 25+ | stronger armies |
| 👑 Kingdom | 50+ | significantly faster growth |
| 🌍 Empire | 100+ | max bonuses |

Higher eras build faster, reproduce more quickly, and win wars more decisively.

### Diplomacy

Neighboring zones interact over time:

- **Alliance** (green border 🤝) — zones form a pact. Members can walk into allied territory and allied soldiers join each other's wars. Lasts 10 years, then dissolves and soldiers return home.
- **War** (red border ⚔️) — larger populations make war more likely. Zone members march to a rally point, form a group, then charge the enemy. Higher-era sides deal more kills per second. Wars end when one side is wiped out or zones stop touching.

War groups that can't find an enemy disband after 10 seconds.

## Files

| File | Contents |
|---|---|
| `index.html` | HTML structure and panel |
| `styles.css` | All CSS |
| `script.js` | All simulation and rendering logic |
