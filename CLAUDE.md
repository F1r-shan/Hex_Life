# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser simulation with no build step, no dependencies, no server required — open `index.html` directly in a browser.

- `index.html` — HTML structure and panel markup
- `styles.css` — all CSS
- `script.js` — all simulation logic

## Architecture

Everything lives in `index.html` as one `<script>` block, organized in sections (marked with `// ──` comments):

**Performance constants**
- `WW = Math.sqrt(3) * HEX_SIZE` and `RH = HEX_SIZE * 1.5` — pre-computed hex geometry constants used everywhere
- `terrainCache: Map` — keyed by `(row << 16) ^ col`, cleared on seed change; `terrainOverrides: Map` takes priority (used by terraform painting)
- `humanById: Map<id, human>` — O(1) partner/victim lookups; must be kept in sync with `humans[]` on add/remove
- `spatialGrid` — rebuilt each frame in `rebuildSpatialGrid()`; `nearbyHumans(wx, wy, radius)` returns candidates from nearby cells

**Terrain generation**
- Five terrain types (indices 0–4): Water (unwalkable), Sand, Grass, Rock, Blocked (unwalkable)
- `applySeed(str)` hashes via FNV-1a → `seedOffset`; clears `terrainCache`
- `noise(x,y)` is two-octave value noise; `terrainFor(row,col)` checks `terrainOverrides` first, then `terrainCache`, then computes
- `terrainOverrides` persists terraform paints across seed changes; `terrainCache` is cleared on seed change

**Hex grid**
- Pointy-top offset grid: even rows no x-offset, odd rows shift right by `WW/2`
- `hexCenter(row,col)` → `{x,y}`; `hexNeighbors(row,col)` → 6 neighbors; `screenToHex(sx,sy)` → `{row,col}`

**Human simulation** (per-frame `updateHumans(dt, now)`)
- `rebuildSpatialGrid()` called once at top of `updateHumans`
- Each human: `{ row, col, toRow, toCol, t, fromX/Y, toX/Y, wx, wy, age, gender, loveId, zoneId, warGrouped, dying, dyingAlpha, emotion, emotionAt, emotionAlpha, lastBabyAt, birthAnim, partAnim }`
- `fromX/Y, toX/Y` cached on target change in `pickNextTarget`; movement lerp uses these directly
- `pickNextTarget` priority: **war rally** (march toward own particle) → **love** (70% toward partner) → **zone pull** (75%/35%) → random
- Humans with `warGrouped = true` skip movement and all social behaviors (`continue` after zone-membership check)
- Stale `loveId` cleared each tick; random early death risk table peaks at 2%/s for age 80–99
- Births: male+female couple, female age 16–45, male age 16–60; twins (15%) and triplets (3%) possible

**Buildings & zones**
- `buildings[]`: `{ row, col, wx, wy, emoji, hits, level, isolated, clusterId }`
- `clusterId` is the cluster identity — buildings inside an existing zone inherit the nearest building's id; outside gets a new unique id
- `recomputeZones()` → fills `zoneHexes` (Set) and `hexClusterMap` (Map hexKey→clusterId); sets `touchingPairsDirty` and `zoneRenderDirty`
- `touchingPairsCache` rebuilt only when `touchingPairsDirty`; `zoneRenderCache` rebuilt only when `zoneRenderDirty`
- Zones with 0 living bound residents are removed with all their buildings each frame
- **Zone splitting**: each frame, large clusters (`hexCount * 0.00025 * dt` chance) split along axis of greater spatial variance; affected humans are rebound via `zoneCluserIdAt`

**Settlement tiers** (hex count per cluster)
| Range | Label |
|---|---|
| 0–19 | ⛺ Camp |
| 20–39 | 🏘 Village |
| 40–59 | 🏙 Town |
| 60–79 | 🌆 City |
| 80+ | 🌇 Metropolis |

**Zone names**
- `zoneNames: Map<clusterId, string>` — lazy-generated from prefix+suffix word lists via `zoneNameFor(clusterId)`
- Each human has `zoneId` (clusterId); binds on walking into a zone, small chance to leave per second
- Founding couple always binds to the new zone's clusterId

**Wars**
- `wars: Map<warKey, { cidA, cidB, startTime, clashing, firstFormedAt, particles: { [cid]: { wx, wy, memberIds: Set } } }>`
- `warKey(a,b)` normalizes pair; `atWar(a,b)`, `declareWar(a,b,now)`, `endWar(a,b)`
- Touching zone pairs (`touchingPairsCache`) declare war at `0.006*dt` chance per frame
- Particle rally point tracks centroid of zone's humans until combat begins, then charges at enemy at `WAR_SPD = WW*3.5` px/s
- Humans within `MERGE_R = HEX_SIZE*6` of their particle are absorbed (`warGrouped=true`); position synced to particle each frame
- Charge begins when both sides have ≥3 members, or 4s has elapsed since both sides formed
- Clash at `CONTACT_R = HEX_SIZE*2.5`: kills `KILL_RATE=1.2` members/s/side; 💥 flash drawn at midpoint
- `endWar` clears `warGrouped` on all members

**Terraform**
- `terraformOverrides: Map` — hex key → terrain object; checked before `terrainCache` in `terrainFor`
- Panel button "🖊 Paint Terrain" toggles `terraformMode`; drag paints selected terrain type onto hexes
- Painting calls `recomputeZones()` and marks both dirty flags

**Draw order per frame**
hex tiles → zone fills (tier-colored) → zone borders (black peace / red war) → zone labels → buildings → war particles + war line → love lines → birth/part sparkles → humans

**Panel (top-right)**
- Seed input + Generate → `applySeed()`, clears humans/buildings/humanById/caches
- "+ Add Human" + quantity (1–50) → places humans spread across clicked hex + neighbors
- Toggles: Emotions, Love Lines, Village Zones
- Terraform: paint any of 5 terrain types; drag to paint continuously; Esc to exit

**Camera & input**
- Mouse: drag to pan, scroll to zoom (0.1×–10×); Esc cancels placing/terraform
- Touch: single-finger pan, two-finger pinch-to-zoom

## Key constants

| Constant | Value | Effect |
|---|---|---|
| `HEX_SIZE` | 40 | hex radius in px |
| `WALK_SPEED` | 0.8 | hexes/second (elders 0.5×) |
| `YEARS_PER_SECOND` | 1 | simulation speed |
| `MAX_AGE` | 100 | maximum lifespan |
| `BABY_CHANCE` | 0.25 | probability/second when couple close |
| `BABY_MAX_AGE_F` / `BABY_MAX_AGE_M` | 45 / 60 | max fertile age per gender |
| `BABY_COOLDOWN` / `BABY_COOLDOWN_BUILDING` | 9 / 3 | seconds between births |
| `BUILD_CHANCE` | 0.008 | base build probability/second (×3 inside zone) |
| `ZONE_RADIUS` | `HEX_SIZE * 4.5` | aura radius per building in world-px |
| `MERGE_R` | `HEX_SIZE * 6` | war absorb radius |
| `CONTACT_R` | `HEX_SIZE * 2.5` | war clash distance |
| `WAR_SPD` | `WW * 3.5` | war particle speed px/s |
| `KILL_RATE` | 1.2 | war kills per second per side |
