# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-file browser simulation: `index.html`. No build step, no dependencies, no server required — open directly in a browser.

## Architecture

Everything lives in `index.html` as one `<script>` block, organized in sections (marked with `// ──` comments):

**Performance constants**
- `WW = Math.sqrt(3) * HEX_SIZE` and `RH = HEX_SIZE * 1.5` — pre-computed hex geometry constants used everywhere
- `terrainCache: Map` — keyed by `(row << 16) ^ col`, cleared on seed change
- `humanById: Map<id, human>` — O(1) partner/victim lookups; must be kept in sync with `humans[]` on add/remove
- `spatialGrid` — rebuilt each frame in `rebuildSpatialGrid()`; `nearbyHumans(wx, wy, radius)` returns candidates from nearby cells

**Terrain generation**
- `applySeed(str)` hashes via FNV-1a → `seedOffset`; clears `terrainCache`
- `noise(x,y)` is two-octave value noise; `terrainFor(row,col)` maps to Water/Sand/Grass/Rock with cache

**Hex grid**
- Pointy-top offset grid: even rows no x-offset, odd rows shift right by `WW/2`
- `hexCenter(row,col)` → `{x,y}`; `hexNeighbors(row,col)` → 6 neighbors

**Human simulation** (per-frame `updateHumans(dt, now)`)
- `rebuildSpatialGrid()` called once at top of `updateHumans`
- Each human: `{ row, col, toRow, toCol, t, fromX/Y, toX/Y, wx, wy, age, gender, loveId, zoneId, warGrouped, dying, dyingAlpha, emotion, emotionAt, emotionAlpha, lastBabyAt, birthAnim, partAnim }`
- `fromX/Y, toX/Y` cached on target change in `pickNextTarget`; movement lerp uses these directly
- `pickNextTarget` priority: **war rally** (march toward own particle) → **love** (70% toward partner) → **zone pull** (75%/35%) → random
- Humans with `warGrouped = true` skip movement and all social behaviors (`continue` after zone-membership check)
- Stale `loveId` cleared each tick; random early death risk table peaks at 2%/s for age 80–99

**Buildings & zones**
- `buildings[]`: `{ row, col, wx, wy, emoji, hits, level, isolated, clusterId }`
- `clusterId` is the cluster identity — buildings inside an existing zone inherit the nearest building's id; outside gets a new unique id
- `recomputeZones()` → fills `zoneHexes` (Set) and `hexClusterMap` (Map hexKey→clusterId); sets `touchingPairsDirty` and `zoneRenderDirty`
- `touchingPairsCache` rebuilt only when `touchingPairsDirty`; `zoneRenderCache` rebuilt only when `zoneRenderDirty`
- Zones with 0 living bound residents are removed with all their buildings each frame

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
- `wars: Map<warKey, { cidA, cidB, startTime, clashing, particles: { [cid]: { wx, wy, memberIds: Set } } }>`
- `warKey(a,b)` normalizes pair; `atWar(a,b)`, `declareWar(a,b,now)`, `endWar(a,b)`
- Touching zone pairs (`touchingPairsCache`) declare war at `0.006*dt` chance per frame
- Particle rally point tracks centroid of zone's humans until combat begins, then charges at enemy at `WAR_SPD = WW*3.5` px/s
- Humans within `MERGE_R = HEX_SIZE*4` of their particle are absorbed (`warGrouped=true`); position synced to particle each frame
- Clash at `CONTACT_R = HEX_SIZE*2.5`: kills `KILL_RATE=3` members/s/side; 💥 flash drawn at midpoint
- `endWar` clears `warGrouped` on all members

**Draw order per frame**
hex tiles → zone fills (tier-colored) → zone borders (black peace / red war) → zone labels → buildings → war particles + war line → love lines → birth/part sparkles → humans

**Panel (top-right)**
- Seed input + Generate → `applySeed()`, clears humans/buildings/humanById/caches
- "+ Add Human" + quantity (1–50) → places humans spread across clicked hex + neighbors
- Toggles: Emotions, Love Lines, Village Zones

## Key constants

| Constant | Effect |
|---|---|
| `HEX_SIZE` | hex radius in px |
| `WALK_SPEED` | hexes/second (elders 0.5×) |
| `YEARS_PER_SECOND` | simulation speed |
| `MAX_AGE` | maximum lifespan |
| `BABY_CHANCE` | probability/second when couple close (0.25) |
| `BABY_COOLDOWN` / `BABY_COOLDOWN_BUILDING` | seconds between births (9 / 3) |
| `BUILD_CHANCE` | base build probability/second (0.008; ×3 inside zone) |
| `ZONE_RADIUS` | aura radius per building in world-px |
| `MERGE_R` | war absorb radius |
| `WAR_SPD` | war particle speed px/s |
| `KILL_RATE` | war kills per second per side |
