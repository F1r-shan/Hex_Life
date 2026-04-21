# Hex Life

A browser-based god simulator on a procedurally generated hex grid. Watch civilizations rise, form alliances, go to war, and collapse — entirely on their own.

No build step. No server. No dependencies. Open `index.html` and it runs.

---

## Getting Started

1. Open `index.html` in any modern browser
2. Click **▶ Start** on the menu — or click **? How to Play** for an in-game tutorial
3. Type a seed and click **Generate** (or press Enter), or leave it blank for a random world
4. Click **+ Add Human** then click a hex to place people
5. Watch what happens

---

## Controls

### Desktop

| Input | Action |
|---|---|
| Scroll wheel | Zoom in / out |
| Click + drag | Pan camera |
| Click label | Rename a settlement |
| **Esc** | Cancel placement or painting |

### Mobile

| Input | Action |
|---|---|
| Single-finger drag | Pan camera |
| Pinch | Zoom in / out |
| Tap label | Rename a settlement |
| **▾ / ▸** button | Collapse / expand the controls panel |

---

## Panel

The **Controls** panel lives top-right. On mobile it auto-collapses — tap **▸** to expand.

| Control | What it does |
|---|---|
| **World Seed** + Generate | Regenerates the world from any text seed |
| **+ Add Human** + qty | Click a hex to place 1–50 humans; click an occupied hex to remove |
| **Emotions** | Toggle speech bubbles above humans |
| **Love Lines** | Toggle pink hearts between couples |
| **Village Zones** | Toggle zone fills, borders, and settlement labels |
| **🖊 Paint Terrain** | Select a terrain type and drag to reshape land |
| **⏸ / ▶** | Pause / resume |
| **½× 1× 2× 5×** | Simulation speed |

Click any **settlement label** to rename it.

---

## Simulation

### Terrain

Five types — Water 🌊 and Blocked ❌ are unwalkable. Sand 🏖️, Grass 🌿, and Rock 🪨 are walkable. Use **Paint Terrain** to edit any hex. Changes persist across seed regenerations.

### Humans

Each human has an age, gender, and zone membership. They walk around, fall in love, have children, build homes, and eventually die.

- **Aging** — 1 real second = 1 simulation year. Death at age 100, or sooner by random risk (risk rises steeply after 50)
- **Emoji** — 👶 baby → 👧/👦 child → 👩/👨 adult → 👵/👴 elder
- **Love** — single adults near each other may pair up (shown by a pink line with ❤️)
- **Children** — male+female couple within range can have babies (twins 15%, triplets 3%); cooldown is shorter near a building
- **Movement** — zone members stay inside their zone or allied zones; elders walk at half speed

### Settlements & Eras

Couples build structures over time. Buildings cluster into **zones** with generated names (_Oakhaven_, _Stoneford_…). Each zone has a unique color.

**Settlement tiers** scale with zone area (hex count):

| Tier | Size |
|---|---|
| ⛺ Camp | 0–19 hexes |
| 🏘 Village | 20–39 hexes |
| 🏙 Town | 40–59 hexes |
| 🌆 City | 60–79 hexes |
| 🌇 Metropolis | 80+ hexes |

**Eras** advance as population grows:

| Era | Population | Bonus |
|---|---|---|
| 🪨 Stone Age | 0+ | Baseline |
| 🗡️ Iron Age | 10+ | Faster building & births |
| 🏰 Medieval | 25+ | Stronger armies |
| 👑 Kingdom | 50+ | Significantly faster growth |
| 🌍 Empire | 100+ | Maximum bonuses |

Large zones can **split** over time, spawning a new independent settlement.

### Diplomacy

Neighboring zones interact automatically:

- **Alliance** 🤝 (green border) — zones form a pact. Members can walk into allied territory and joined soldiers fight together. Alliances last 10 years, then dissolve.
- **War** ⚔️ (red border) — larger combined populations make war more likely. Soldiers rally at a particle, then charge the enemy. Higher-era sides deal more kills per second. Wars end when one side is wiped out or zones stop touching.

---

## Performance

- **LOD** — humans, love lines, and emotion bubbles are hidden when zoomed out past a threshold (scale < 0.35). Only zones, buildings, war particles, and settlement labels remain visible. Everything reappears when you zoom back in.
- **Spatial grid** — rebuilt each frame so range queries (love, births, war absorption) run in O(1) instead of O(n²).
- **Pre-baked textures** — human emoji, age badges, and emotion bubbles are rendered to cached GPU textures once and reused every frame.

---

## Files

| Path | Contents |
|---|---|
| `index.html` | HTML structure and UI markup |
| `styles.css` | All CSS, including responsive mobile styles |
| `js/core.js` | Renderer init, constants, terrain, seed, noise, hex geometry |
| `js/humans.js` | Emotions, human data, movement, love, births, event log |
| `js/zones.js` | Buildings, zones, alliances, wars (data), eras |
| `js/simulation.js` | `updateHumans` — spatial grid, war particles, zone splitting |
| `js/render.js` | Camera, PixiJS scene graph, `drawGrid`, animation loop |
| `js/ui.js` | Main menu, help modal, seed panel, terraform, zoom, pan, touch, panel toggle |
