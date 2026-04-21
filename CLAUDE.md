# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser simulation with no build step, no dependencies, no server required — open `index.html` directly in a browser.

## File structure

| File | Contents |
|---|---|
| `index.html` | HTML structure and panel markup |
| `styles.css` | All CSS including responsive mobile styles |
| `js/core.js` | PixiJS renderer init, DOM refs, terrain constants, seed/noise, hex geometry |
| `js/humans.js` | Emotions, human state/data, event log, `pickNextTarget`, `addHuman`, births |
| `js/zones.js` | Buildings, zones (`recomputeZones`), alliances, wars (data + declare/end), eras, settlement tiers |
| `js/simulation.js` | Spatial grid (`rebuildSpatialGrid`), `updateHumans`, war particle system, zone splitting |
| `js/render.js` | Camera vars, drawing helpers, PixiJS scene graph, `drawGrid`, animation loop |
| `js/ui.js` | Main menu, seed panel, panel toggle, human placement, terraform, zoom/pan/touch |

All files share a single global scope (no modules). Load order in `index.html` is the dependency order: core → humans → zones → simulation → render → ui.

## Architecture

**Performance constants**
- `WW = Math.sqrt(3) * HEX_SIZE` and `RH = HEX_SIZE * 1.5` — pre-computed hex geometry constants used everywhere
- `terrainCache: Map` — keyed by `(row << 16) ^ col`, cleared on seed change; `terrainOverrides: Map` takes priority (terraform painting)
- `humanById: Map<id, human>` — O(1) partner/victim lookups; must be kept in sync with `humans[]` on add/remove
- `spatialGrid` — rebuilt each frame in `rebuildSpatialGrid()`; `nearbyHumans(wx, wy, radius)` returns candidates from nearby cells

**Terrain generation** — `js/core.js`
- Five terrain types (indices 0–4): Water (unwalkable), Sand, Grass, Rock, Blocked (unwalkable)
- `applySeed(str)` hashes via FNV-1a → `seedOffset`; clears `terrainCache`
- `noise(x,y)` is two-octave value noise; `terrainFor(row,col)` checks `terrainOverrides` first, then `terrainCache`, then computes
- `terrainOverrides` persists terraform paints across seed changes; `terrainCache` is cleared on seed change

**Hex grid** — `js/core.js`
- Pointy-top offset grid: even rows no x-offset, odd rows shift right by `WW/2`
- `hexCenter(row,col)` → `{x,y}`; `hexNeighbors(row,col)` → 6 neighbors; `screenToHex(sx,sy)` → `{row,col}`

**Human simulation** — `js/humans.js` + `js/simulation.js`
- Each human: `{ row, col, toRow, toCol, t, fromX/Y, toX/Y, wx, wy, age, gender, loveId, zoneId, warGrouped, dying, dyingAlpha, emotion, emotionAt, emotionAlpha, lastBabyAt, birthAnim, partAnim }`
- `rebuildSpatialGrid()` called once at top of `updateHumans`; also rebuilds `zonePopMap` and advances eras in the same pass
- `fromX/Y, toX/Y` cached on target change in `pickNextTarget`; movement lerp uses these directly
- `pickNextTarget` priority: **war rally** (march toward own particle) → **love** (70% toward partner) → **zone pull** (75%/35%) → random
- Zone movement restriction: adults (age ≥ 16) with `zoneId` only walk to own-zone or allied-zone hexes; children roam freely
- Zone membership loss: checks **both** `h.row,h.col` (from) and `h.toRow,h.toCol` (to) — human leaves if neither hex belongs to their zone (and not allied); single adults have a 0.1%/s random leave chance
- Zone membership join: unbound adults (age ≥ 16) auto-join a zone when they walk into its aura; children never auto-join
- Humans with `warGrouped = true` skip movement and all social behaviors
- Stale `loveId` cleared each tick; random early death risk table peaks at 2%/s for age 80–99
- Births: male+female couple, female age 16–45, male age 16–60; twins (15%) and triplets (3%) possible; babies born **unzoned** (age 0 < 16)

**Buildings & zones** — `js/zones.js`
- `buildings[]`: `{ row, col, wx, wy, emoji, clusterId }`
- New zone: couple builds first building outside any zone → new `clusterId` generated; founding couple assigned to it; `zonePopMap.set(clusterId, 2)` called immediately so the zone survives same-frame pruning
- `recomputeZones()` → fills `zoneHexes` (Set) and `hexClusterMap` (Map hexKey→clusterId); sets `touchingPairsDirty` and `zoneRenderDirty`
- `touchingPairsCache` rebuilt only when `touchingPairsDirty`; `zoneRenderCache` rebuilt only when `zoneRenderDirty`
- Zones with 0 living bound residents are removed with all their buildings each frame (`zonePopMap` is the authoritative resident count)
- **Zone splitting**: each frame, large clusters split along axis of greater spatial variance; affected humans are rebound via `zoneCluserIdAt`

**Settlement tiers** (hex count per cluster)
| Range | Label |
|---|---|
| 0–19 | ⛺ Camp |
| 20–39 | 🏘 Village |
| 40–59 | 🏙 Town |
| 60–79 | 🌆 City |
| 80+ | 🌇 Metropolis |

**Eras** (`ERAS[]`, index 0–4; advanced per cluster based on `zonePopMap`) — `js/zones.js`
| Era | Min pop | Effect |
|---|---|---|
| 🪨 Stone Age | 0 | baseline |
| 🗡️ Iron Age | 10 | faster building & births |
| 🏰 Medieval | 25 | stronger armies |
| 👑 Kingdom | 50 | significantly faster growth |
| 🌍 Empire | 100 | max bonuses |
- `clusterEras: Map<clusterId, eraIndex>` — updated in `rebuildSpatialGrid`
- Era affects `buildMult`, `cooldownMult`, `killMult`, and which building emojis are placed
- In wars, each side applies its **own** `killMult` against the enemy

**Zone names & colors** — `js/zones.js`
- `zoneNames: Map<clusterId, string>` — lazy-generated from prefix+suffix word lists via `zoneNameFor(clusterId)`
- `zoneColors: Map<clusterId, hue>` — deterministic hue (0–360) derived from `clusterId` string hash; rendered as `hsla(hue, 65%, 55%, 0.32)` fill and `hsla(hue, 80%, 70%, 0.95)` border; deleted alongside `zoneNames` when a zone dies
- `zoneCluserIdAt(wx, wy)` — finds nearest hex center in 3×3 neighborhood, returns its `hexClusterMap` entry

**Alliances** — `js/zones.js`
- `alliances: Map<allianceKey, { cidA, cidB, formedAt }>` — `allianceKey(a,b)` normalizes pair order
- `allied(a, b)` — O(1) lookup; `ALLIANCE_DURATION = 10` sim-seconds
- Touching zone pairs form alliances (green border 🤝); allied zone members can walk into each other's territory and join each other's war groups
- On expiry: soldiers whose `zoneId` matches the ex-ally are released from the war group (`warGrouped = false`)
- Alliance borders drawn green (5px); war borders drawn red (5px); neutral/zone borders `4.5px`; hex grid border `0.6px` (`BORDER` constant)

**Wars** — `js/zones.js` (data/declare/end) + `js/simulation.js` (particle system)
- `wars: Map<warKey, { cidA, cidB, startTime, clashing, firstFormedAt, particles: { [cid]: { wx, wy, memberIds: Set } } }>`
- War declaration chance scales with combined zone population: `0.006 * dt * popScale` (capped at ×8)
- Particle rally point tracks centroid of zone's humans until combat begins, then charges at enemy at `WAR_SPD = WW*3.5` px/s
- Humans within `MERGE_R = HEX_SIZE*6` of their particle are absorbed (`warGrouped=true`); allies within range also absorbed into ally's particle
- Charge begins when both sides have ≥3 members, or 4s has elapsed since both sides formed
- Stall timeout: if one side has members and the other is empty after 10s, war ends automatically
- Clash at `CONTACT_R = HEX_SIZE*2.5`: `KILL_RATE = 1.2` members/s/side, scaled by `battleScale = max(1, maxArmySize / 5)` to keep large wars from lasting forever; each side uses its own era's `killMult`
- `endWar` clears `warGrouped` on all members of both sides

**Year counter** — `js/render.js`
- `simYear` — increments by `dt * YEARS_PER_SECOND` each frame; reset to 0 on `generate()`
- Displayed in `#year-panel` element

**Terraform** — `js/ui.js`
- `terrainOverrides: Map` — hex key → terrain object; checked before `terrainCache` in `terrainFor`
- Panel button "🖊 Paint Terrain" toggles `terraformMode`; drag paints selected terrain type onto hexes

**Draw order per frame** — `js/render.js` `drawGrid()`
hex tiles → zone fills (per-zone color) → zone borders (neutral/alliance/war) → zone icons (🤝/⚔️) → buildings → love lines → birth/part sparkles → humans → war particles + war line → settlement labels (screen space, always on top)

**Main menu** — `js/ui.js`
- `#main-menu` overlay shown on page load; fades out (`.hidden` class) when Start is clicked
- Background: a `<canvas id="menu-canvas">` renders the real hex terrain (via `terrainFor`/`hexCenter`) with a random seed, panning right at `WW * 1.2` px/s; a ripple reveal wave expands from the world origin over 3.5s
- `setupMainMenu()` IIFE; calls `applySeed(randomSeed)` on init, then `generate()` on Start click
- `#right-panels` starts with `opacity:0; pointer-events:none` and is revealed on Start click

**Panel (top-right)** — `js/ui.js` + `styles.css`
- `#right-panels` flex column: `#seed-panel` (with collapsible `#seed-panel-body`) + `#year-panel`
- `#seed-panel-header` contains a `▾/▸` toggle button (`#panel-toggle`); body collapses on mobile automatically
- On portrait mobile (`max-width:600px`): `#year-panel` floats to top via `order:-1`; stats log becomes a full-width bottom strip
- On landscape small (`max-height:500px`): panel is scrollable, everything compacted
- `@media (pointer: coarse)` bumps all button min-heights to 44px and input font to 16px (prevents iOS zoom)
- `#right-panels` mousedown stops propagation so panel clicks don't pan the camera

**Camera & input** — `js/render.js` (vars) + `js/ui.js` (handlers)
- Mouse: drag to pan, scroll to zoom (0.1×–10×); Esc cancels placing/terraform
- Touch: single-finger pan, two-finger pinch-to-zoom

## Key constants

| Constant | Value | Effect |
|---|---|---|
| `HEX_SIZE` | 40 | hex radius in px |
| `BORDER` | 0.6 | hex grid stroke width in px (scaled by `1/scale`) |
| `WALK_SPEED` | 0.8 | hexes/second (elders 0.5×) |
| `YEARS_PER_SECOND` | 1 | simulation speed |
| `MAX_AGE` | 100 | maximum lifespan |
| `BABY_CHANCE` | 0.25 | probability/second when couple close |
| `BABY_MAX_AGE_F` / `BABY_MAX_AGE_M` | 45 / 60 | max fertile age per gender |
| `BABY_COOLDOWN` / `BABY_COOLDOWN_BUILDING` | 9 / 3 | seconds between births |
| `BUILD_CHANCE` | 0.008 | base build probability/second (×3 inside zone) |
| `ZONE_RADIUS` | `HEX_SIZE * 4.5` | aura radius per building in world-px |
| `ALLIANCE_DURATION` | 10 | sim-seconds alliance lifespan |
| `MERGE_R` | `HEX_SIZE * 6` | war absorb radius |
| `CONTACT_R` | `HEX_SIZE * 2.5` | war clash distance |
| `WAR_SPD` | `WW * 3.5` | war particle speed px/s |
| `KILL_RATE` | 1.2 | base war kills per second per side |
