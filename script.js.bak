
    // ── PixiJS WebGL renderer ────────────────────────────────
    const app = new PIXI.Application({
      width: window.innerWidth, height: window.innerHeight,
      backgroundColor: 0x000000, antialias: true, resolution: 1,
    });
    app.ticker.stop(); // we drive the loop manually via rAF
    Object.assign(app.view.style, { position: 'fixed', top: '0', left: '0', cursor: 'grab' });
    document.body.insertBefore(app.view, document.body.firstChild);
    const canvas = app.view; // alias so all existing event handlers work unchanged

    const seedInput  = document.getElementById('seed-input');
    const seedBtn    = document.getElementById('seed-btn');
    const humanBtn   = document.getElementById('human-btn');
    const placeHint  = document.getElementById('place-hint');
    const emotionBtn = document.getElementById('emotion-btn');
    const loveBtn    = document.getElementById('love-btn');
    const zoneBtn    = document.getElementById('zone-btn');
    const yearEl     = document.getElementById('year-text');

    const HEX_SIZE = 40;
    const BORDER   = 0.6;

    const TERRAIN = [
      { name: 'Water',   fill: '#1a4f8a', label: '🌊', walkable: false },
      { name: 'Sand',    fill: '#c4a44e', label: '🏖️',  walkable: true  },
      { name: 'Grass',   fill: '#3a7d2c', label: '🌿', walkable: true  },
      { name: 'Rock',    fill: '#6b6b6b', label: '🪨', walkable: true  },
      { name: 'Blocked', fill: '#4a0000', label: '❌', walkable: false },
    ];
    const terrainOverrides = new Map(); // hex key → terrain object

    // ── Seed ────────────────────────────────────────────────
    let seedOffset = 0;
    const terrainCache = new Map();
    function applySeed(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      seedOffset = (h >>> 0) % 100000;
      terrainCache.clear();
    }

    // ── Noise ────────────────────────────────────────────────
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function hash2(x, y) {
      let h = (Math.imul(x + seedOffset, 1619) ^ Math.imul(y + seedOffset, 31337)) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0xd68de2c3) >>> 0;
      return (h >>> 0) / 0xffffffff;
    }
    function valueNoise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const ux = fade(x - ix),  uy = fade(y - iy);
      return lerp(lerp(hash2(ix,iy), hash2(ix+1,iy), ux), lerp(hash2(ix,iy+1), hash2(ix+1,iy+1), ux), uy);
    }
    function noise(x, y) {
      return valueNoise(x*0.18, y*0.18)*0.65 + valueNoise(x*0.06, y*0.06)*0.35;
    }
    function terrainFor(row, col) {
      const k = (row << 16) ^ col;
      const ov = terrainOverrides.get(k);
      if (ov) return ov;
      let t = terrainCache.get(k);
      if (t) return t;
      const n = noise(col + (row % 2) * 0.5, row);
      t = n < 0.30 ? TERRAIN[0] : n < 0.42 ? TERRAIN[1] : n < 0.72 ? TERRAIN[2] : TERRAIN[3];
      terrainCache.set(k, t);
      return t;
    }

    // ── Hex geometry ─────────────────────────────────────────
    const WW = Math.sqrt(3) * HEX_SIZE;
    const RH = HEX_SIZE * 1.5;

    function hexCenter(row, col) {
      return { x: col * WW + (row % 2 === 0 ? 0 : WW / 2), y: row * RH };
    }

    function hexNeighbors(row, col) {
      const even = row % 2 === 0;
      return [
        { row: row-1, col: even ? col-1 : col   },
        { row: row-1, col: even ? col   : col+1 },
        { row: row,   col: col-1 },
        { row: row,   col: col+1 },
        { row: row+1, col: even ? col-1 : col   },
        { row: row+1, col: even ? col   : col+1 },
      ];
    }

    function screenToHex(sx, sy) {
      const wx = (sx - canvas.width/2  - camX) / scale;
      const wy = (sy - canvas.height/2 - camY) / scale;
      const rowEst = Math.round(wy / RH);
      let bestRow=0, bestCol=0, bestDist=Infinity;
      for (let row = rowEst-1; row <= rowEst+1; row++) {
        const off = row % 2 === 0 ? 0 : WW/2;
        const colEst = Math.round((wx - off) / WW);
        for (let col = colEst-1; col <= colEst+1; col++) {
          const cx = col*WW + off, cy = row*RH;
          const d = Math.hypot(wx-cx, wy-cy);
          if (d < bestDist) { bestDist=d; bestRow=row; bestCol=col; }
        }
      }
      return { row: bestRow, col: bestCol };
    }

    // ── Emotions ─────────────────────────────────────────────
    let emotionsOn  = true;
    let loveLinesOn = true;
    let zonesOn     = true;

    const EMOTIONS = [
      '😊', '😴', '🤔', '😤', '😂', '😨', '🥳', '😎', '🥺', '😇',
      'Hi!', 'Tired…', 'Where am I?', 'Nice view!', 'I\'m hungry!',
      'So peaceful', 'Hello?', 'Keep walking!', '⚔️', '🎵',
    ];

    const EMOTION_INTERVAL = 4000; // ms between changes

    // Age: 1 real second = 1 year. Dies at 100.
    const YEARS_PER_SECOND = 1;
    const MAX_AGE = 100;

    function emojiForAge(age, gender) {
      if (gender === 'female') {
        if (age < 13) return '👧';
        if (age < 60) return '👩';
        return '👵';
      } else {
        if (age < 13) return '👦';
        if (age < 60) return '👨';
        return '👴';
      }
    }

    // ── Humans ────────────────────────────────────────────────
    const humans = [];
    const humanById = new Map();
    let placingHuman = false;
    let lastTime = null;
    let simYear = 0;
    let paused = false;
    let simSpeed = 1;
    let simTime = 0;
    let labelHitAreas = [];

    // ── Event log ─────────────────────────────────────────────
    const statsPanel = document.getElementById('stats-panel');
    const statsLog   = document.getElementById('stats-log');
    const MAX_LOG = 80;
    function logEvent(type, msg) {
      const entry = document.createElement('div');
      entry.className = `stat-entry ev-${type}`;
      entry.innerHTML = `<span class="stat-year">Yr ${Math.floor(simYear)}</span>${msg}`;
      statsLog.appendChild(entry);
      while (statsLog.children.length > MAX_LOG) statsLog.firstChild.remove();
      statsLog.scrollTop = statsLog.scrollHeight;
    }

    const WALK_SPEED = 0.8; // hexes per second

    function pickNextTarget(h) {
      const allWalkable = hexNeighbors(h.toRow, h.toCol)
        .filter(n => terrainFor(n.row, n.col).walkable);
      if (allWalkable.length === 0) return;

      // Zone members stay inside their zone or allied zones; fall back to all walkable only if trapped
      let neighbors = allWalkable;
      if (h.zoneId && !h.warGrouped && h.age >= 16) {
        const zoneOnly = allWalkable.filter(n => {
          const nk = `${n.row},${n.col}`;
          if (!zoneHexes.has(nk)) return false;
          const nCid = hexClusterMap.get(nk);
          return nCid === h.zoneId || allied(h.zoneId, nCid);
        });
        if (zoneOnly.length > 0) neighbors = zoneOnly;
      }

      let next;
      // War movement takes priority: march toward ally's war particle (rally point)
      if (!next && h.zoneId && wars.size > 0) {
        for (const w of wars.values()) {
          const mySide = w.cidA === h.zoneId || allied(h.zoneId, w.cidA) ? w.cidA
                       : w.cidB === h.zoneId || allied(h.zoneId, w.cidB) ? w.cidB
                       : null;
          if (!mySide) continue;
          const p = w.particles[mySide];
          if (p) {
            const sorted = neighbors.slice().sort((a, b) => {
              const ca = hexCenter(a.row, a.col);
              const cb = hexCenter(b.row, b.col);
              return Math.hypot(ca.x - p.wx, ca.y - p.wy)
                   - Math.hypot(cb.x - p.wx, cb.y - p.wy);
            });
            next = Math.random() < 0.9 ? sorted[0] : sorted[Math.floor(Math.random() * Math.min(2, sorted.length))];
          }
          break;
        }
      }

      // Love pull (only if not marching to war)
      if (!next && h.loveId) {
        const partner = humanById.get(h.loveId);
        if (partner && !partner.dying) {
          const sorted = neighbors.slice().sort((a, b) => {
            const ca = hexCenter(a.row, a.col);
            const cb = hexCenter(b.row, b.col);
            return Math.hypot(ca.x - partner.wx, ca.y - partner.wy)
                 - Math.hypot(cb.x - partner.wx, cb.y - partner.wy);
          });
          next = Math.random() < 0.7 ? sorted[0] : sorted[Math.floor(Math.random() * sorted.length)];
        }
      }

      // If no partner pull, bias toward bound zone; unbound humans go to nearest building
      if (!next && buildings.length > 0) {
        const VILLAGE_PULL_RADIUS = HEX_SIZE * 10;
        let targetB = null, targetD = Infinity;
        if (h.zoneId) {
          // Find nearest building belonging to bound zone
          for (const b of buildings) {
            if (b.clusterId !== h.zoneId) continue;
            const d = Math.hypot(h.wx - b.wx, h.wy - b.wy);
            if (d < targetD) { targetD = d; targetB = b; }
          }
        }
        if (!targetB) {
          // Unbound: pull toward nearest building overall
          for (const b of buildings) {
            const d = Math.hypot(h.wx - b.wx, h.wy - b.wy);
            if (d < targetD) { targetD = d; targetB = b; }
          }
        }
        if (targetB && targetD < VILLAGE_PULL_RADIUS) {
          const sorted = neighbors.slice().sort((a, b) => {
            const ca = hexCenter(a.row, a.col);
            const cb = hexCenter(b.row, b.col);
            return Math.hypot(ca.x - targetB.wx, ca.y - targetB.wy)
                 - Math.hypot(cb.x - targetB.wx, cb.y - targetB.wy);
          });
          const pullStrength = targetD > HEX_SIZE * 4 ? 0.75 : 0.35;
          next = Math.random() < pullStrength ? sorted[0] : neighbors[Math.floor(Math.random() * neighbors.length)];
        }
      }

      if (!next) next = neighbors[Math.floor(Math.random() * neighbors.length)];

      h.row = h.toRow; h.col = h.toCol;
      h.toRow = next.row; h.toCol = next.col;
      h.t = 0;
      const fc = hexCenter(h.row, h.col);
      const tc = hexCenter(h.toRow, h.toCol);
      h.fromX = fc.x; h.fromY = fc.y;
      h.toX   = tc.x; h.toY   = tc.y;
    }

    function randomEmotion() {
      return EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
    }

    const BABY_COOLDOWN          = 9;  // default seconds between births
    const BABY_COOLDOWN_BUILDING = 3;  // near a building
    const BABY_CHANCE    = 0.25; // probability per second when close enough
    const BABY_MAX_AGE_F = 45;   // max age for female to have baby
    const BABY_MAX_AGE_M = 60;

    function addHuman(row, col, age = 0, gender = null, zoneId = null) {
      const { x, y } = hexCenter(row, col);
      const resolvedZone = age >= 16 ? (zoneId ?? zoneCluserIdAt(x, y)) : null;
      const human = {
        row, col, toRow: row, toCol: col, t: 1, wx: x, wy: y,
        fromX: x, fromY: y, toX: x, toY: y,
        id: Date.now() + Math.random(),
        emotion: randomEmotion(),
        emotionAt: performance.now(),
        emotionAlpha: 1,
        age,
        gender: gender ?? (Math.random() < 0.5 ? 'male' : 'female'),
        dying: false,
        dyingAlpha: 1,
        loveId: null,
        zoneId: resolvedZone,
        lastBabyAt: -BABY_COOLDOWN,
        birthAnim: null,
      };
      humans.push(human);
      humanById.set(human.id, human);
    }

    // Find the nearest walkable hex to world coords (wx, wy)
    function nearestWalkableHex(wx, wy) {
      const rowEst = Math.round(wy / RH);
      const candidates = [];
      for (let row = rowEst - 2; row <= rowEst + 2; row++) {
        const off = row % 2 === 0 ? 0 : WW / 2;
        const colEst = Math.round((wx - off) / WW);
        for (let col = colEst - 2; col <= colEst + 2; col++) {
          if (!terrainFor(row, col).walkable) continue;
          const cx = col * WW + off, cy = row * RH;
          candidates.push({ row, col, d: Math.hypot(wx - cx, wy - cy) });
        }
      }
      if (!candidates.length) return null;
      candidates.sort((a, b) => a.d - b.d);
      return candidates[0];
    }

    // ── Buildings & Zones ────────────────────────────────────
    const buildings = [];
    const BUILDING_EMOJIS = ['🏠', '🏡', '🏘️', '⛺'];
    const BUILD_DIST   = Math.sqrt(3) * HEX_SIZE * 2;
    const BUILD_EXCL   = Math.sqrt(3) * HEX_SIZE * 3;
    const BUILD_CHANCE = 0.008;
    const ZONE_RADIUS  = HEX_SIZE * 4.5; // world-space radius per building
    const ZONE_MERGE   = ZONE_RADIUS * 2; // buildings closer than this merge zones

    // Zone names: clusterId → string
    const zoneNames  = new Map();
    const zoneColors = new Map(); // clusterId → hue (0–360)
    function zoneColorFor(clusterId) {
      if (!zoneColors.has(clusterId)) {
        // deterministic but visually spread hue from cluster id string
        let h = 0;
        for (let i = 0; i < clusterId.length; i++) h = (Math.imul(h * 31 + clusterId.charCodeAt(i), 1) >>> 0);
        zoneColors.set(clusterId, (h >>> 0) % 360);
      }
      return zoneColors.get(clusterId);
    }
    const ZONE_NAME_PRE  = ['Oak','Ash','Stone','River','Hill','Iron','Green','Silver','Dawn','Dusk','Frost','Storm','Red','Black','White'];
    const ZONE_NAME_SUF  = ['haven','hold','wick','ford','stead','keep','vale','moor','bridge','gate','field','brook','wood','cross','fall'];
    function makeZoneName() {
      const p = ZONE_NAME_PRE[Math.floor(Math.random() * ZONE_NAME_PRE.length)];
      const s = ZONE_NAME_SUF[Math.floor(Math.random() * ZONE_NAME_SUF.length)];
      return p + s;
    }
    function zoneNameFor(clusterId) {
      if (!zoneNames.has(clusterId)) zoneNames.set(clusterId, makeZoneName());
      return zoneNames.get(clusterId);
    }

    // Returns the clusterId of the zone the world point (wx,wy) is in, or null
    function zoneCluserIdAt(wx, wy) {
      const rowEst = Math.round(wy / RH);
      const off = rowEst % 2 === 0 ? 0 : WW / 2;
      const colEst = Math.round((wx - off) / WW);
      let best = null, bestD = Infinity;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = rowEst + dr, c = colEst + dc;
        const { x: cx, y: cy } = hexCenter(r, c);
        const d = Math.hypot(wx - cx, wy - cy);
        if (d < bestD) { bestD = d; best = `${r},${c}`; }
      }
      return (best && hexClusterMap.get(best)) || null;
    }

    // ── Alliances ───────────────────────────────────────────────
    const ALLIANCE_DURATION = 10; // sim-seconds (10 sim-years)
    const alliances = new Map(); // allianceKey → { cidA, cidB, formedAt }
    function allianceKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
    function allied(a, b) { return alliances.has(allianceKey(a, b)); }

    // ── Wars ────────────────────────────────────────────────────
    const wars = new Map(); // warKey → { cidA, cidB, startTime }
    function warKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
    function atWar(a, b) { return wars.has(warKey(a, b)); }
    function declareWar(a, b, now) {
      alliances.delete(allianceKey(a, b));
      const k = warKey(a, b);
      if (!wars.has(k)) {
        logEvent('war', `⚔️ <b>${zoneNameFor(a)}</b> vs <b>${zoneNameFor(b)}</b>`);
        const bA = buildings.find(b2 => b2.clusterId === a) ?? { wx: 0, wy: 0 };
        const bB = buildings.find(b2 => b2.clusterId === b) ?? { wx: 0, wy: 0 };
        wars.set(k, {
          cidA: a, cidB: b, startTime: simTime, firstFormedAt: null,
          particles: {
            [a]: { wx: bA.wx, wy: bA.wy, memberIds: new Set() },
            [b]: { wx: bB.wx, wy: bB.wy, memberIds: new Set() },
          }
        });
      }
    }
    function endWar(a, b) {
      const k = warKey(a, b);
      const w = wars.get(k);
      if (w) {
        logEvent('peace', `🕊️ War ended: <b>${zoneNameFor(a)}</b> & <b>${zoneNameFor(b)}</b>`);
        for (const p of Object.values(w.particles))
          for (const id of p.memberIds) {
            const h = humanById.get(id);
            if (h) h.warGrouped = false;
          }
      }
      wars.delete(k);
    }

    // Set of "row,col" strings belonging to any village zone
    let zoneHexes = new Set();
    let hexClusterMap = new Map(); // hexKey → clusterId
    let touchingPairsCache = new Map(); // warKey → [cidA, cidB]
    let touchingPairsDirty = true;
    let zoneRenderCache = { hexTierFill: new Map(), hexTierBorder: new Map(), hexRoot: new Map() };
    let zoneRenderDirty = true;

    function recomputeZones() {
      zoneHexes = new Set();
      hexClusterMap = new Map();
      if (!buildings.length) return;

      // Union-Find to group buildings into villages (isolated buildings never merge)
      const parent = buildings.map((_, i) => i);
      function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
      for (let i = 0; i < buildings.length; i++)
        for (let j = i + 1; j < buildings.length; j++)
          if (buildings[i].clusterId && buildings[i].clusterId === buildings[j].clusterId &&
              Math.hypot(buildings[i].wx - buildings[j].wx, buildings[i].wy - buildings[j].wy) < ZONE_MERGE)
            parent[find(i)] = find(j);

      // Group by root
      const villages = new Map();
      buildings.forEach((b, i) => {
        const r = find(i);
        if (!villages.has(r)) villages.set(r, []);
        villages.get(r).push(b);
      });

      // Each hex is assigned to the zone whose nearest building is closest
      // (Voronoi-like) so no hex ends up isolated inside the wrong zone.
      const hexBestDist = new Map();
      for (const [, group] of villages) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const b of group) {
          minX = Math.min(minX, b.wx - ZONE_RADIUS);
          maxX = Math.max(maxX, b.wx + ZONE_RADIUS);
          minY = Math.min(minY, b.wy - ZONE_RADIUS);
          maxY = Math.max(maxY, b.wy + ZONE_RADIUS);
        }
        const rs = Math.floor(minY / RH) - 1, re = Math.ceil(maxY / RH) + 1;
        for (let row = rs; row <= re; row++) {
          const off = row % 2 === 0 ? 0 : WW / 2;
          const cs = Math.floor((minX - off) / WW) - 1;
          const ce = Math.ceil((maxX - off) / WW) + 1;
          for (let col = cs; col <= ce; col++) {
            const cx = col * WW + off, cy = row * RH;
            if (!terrainFor(row, col).walkable) continue;
            let nearestD = Infinity;
            for (const b of group) {
              const d = Math.hypot(cx - b.wx, cy - b.wy);
              if (d < nearestD) nearestD = d;
            }
            if (nearestD <= ZONE_RADIUS) {
              const hk = `${row},${col}`;
              if (nearestD < (hexBestDist.get(hk) ?? Infinity)) {
                hexBestDist.set(hk, nearestD);
                zoneHexes.add(hk);
                hexClusterMap.set(hk, group[0].clusterId);
              }
            }
          }
        }
      }

      // Majority filter: a hex with ≤1 same-zone neighbor is isolated —
      // reassign it to whichever zone dominates its surroundings.
      for (const hk of zoneHexes) {
        const comma = hk.indexOf(',');
        const row = +hk.slice(0, comma), col = +hk.slice(comma + 1);
        const myCid = hexClusterMap.get(hk);
        const even = row % 2 === 0;
        const nbrs = [
          `${row},${col+1}`, `${row+1},${even?col:col+1}`, `${row+1},${even?col-1:col}`,
          `${row},${col-1}`, `${row-1},${even?col-1:col}`, `${row-1},${even?col:col+1}`,
        ];
        const counts = new Map();
        for (const nk of nbrs) {
          const nCid = hexClusterMap.get(nk);
          if (nCid) counts.set(nCid, (counts.get(nCid) || 0) + 1);
        }
        if ((counts.get(myCid) || 0) <= 1) {
          let bestCid = myCid, bestCount = counts.get(myCid) || 0;
          for (const [cid, cnt] of counts) {
            if (cnt > bestCount) { bestCid = cid; bestCount = cnt; }
          }
          if (bestCid !== myCid) hexClusterMap.set(hk, bestCid);
        }
      }

      touchingPairsDirty = true;
      zoneRenderDirty = true;
    }

    // Settlement tiers by hex count
    const SETTLEMENT_TIERS = [
      { min: 0,   label: '⛺ Camp',        color: 'rgba(180,220,180,0.90)' },
      { min: 20,  label: '🏘 Village',     color: 'rgba(160,210,255,0.90)' },
      { min: 40,  label: '🏙 Town',        color: 'rgba(120,190,255,0.90)' },
      { min: 60,  label: '🌆 City',        color: 'rgba(255,210,100,0.90)' },
      { min: 80,  label: '🌇 Metropolis',  color: 'rgba(255,140, 60,0.90)' },
    ];

    // ── Eras ─────────────────────────────────────────────────
    const ERAS = [
      { name: 'Stone Age', emoji: '🪨', minPop:   0, buildings: ['⛺', '🏕️'],                killMult: 1.0, buildMult: 1.0, cooldownMult: 1.0  },
      { name: 'Iron Age',  emoji: '🗡️', minPop:  10, buildings: ['🏠', '🏡'],                 killMult: 1.4, buildMult: 1.3, cooldownMult: 0.8  },
      { name: 'Medieval',  emoji: '🏰', minPop:  25, buildings: ['🏠', '🏡', '🏰'],           killMult: 1.9, buildMult: 1.6, cooldownMult: 0.65 },
      { name: 'Kingdom',   emoji: '👑', minPop:  50, buildings: ['🏰', '🏯', '⛪'],           killMult: 2.5, buildMult: 1.9, cooldownMult: 0.5  },
      { name: 'Empire',    emoji: '🌍', minPop: 100, buildings: ['🏯', '🏛️', '⛪', '🗼'],    killMult: 3.2, buildMult: 2.2, cooldownMult: 0.4  },
    ];
    const clusterEras = new Map(); // clusterId → era index (0–4)
    function settlementTier(hexCount) {
      let t = SETTLEMENT_TIERS[0];
      for (const tier of SETTLEMENT_TIERS) { if (hexCount >= tier.min) t = tier; }
      return t;
    }

    // Village clusters for labels: { center, size, hexCount }
    function computeVillageClusters() {
      if (!buildings.length) return [];
      const parent = buildings.map((_, i) => i);
      function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
      for (let i = 0; i < buildings.length; i++)
        for (let j = i + 1; j < buildings.length; j++)
          if (buildings[i].clusterId && buildings[i].clusterId === buildings[j].clusterId &&
              Math.hypot(buildings[i].wx - buildings[j].wx, buildings[i].wy - buildings[j].wy) < ZONE_MERGE)
            parent[find(i)] = find(j);
      const villages = new Map();
      buildings.forEach((b, i) => {
        const r = find(i);
        if (!villages.has(r)) villages.set(r, []);
        villages.get(r).push(b);
      });
      // Count zone hexes belonging to each cluster root
      const hexCounts = new Map();
      for (const key of zoneHexes) {
        const [row, col] = key.split(',').map(Number);
        const { x: kx, y: ky } = hexCenter(row, col);
        let bestRoot = -1, bestDist = Infinity;
        buildings.forEach((b, i) => {
          const d = Math.hypot(kx - b.wx, ky - b.wy);
          if (d < bestDist) { bestDist = d; bestRoot = find(i); }
        });
        if (bestRoot !== -1) hexCounts.set(bestRoot, (hexCounts.get(bestRoot) || 0) + 1);
      }
      return [...villages.values()].filter(g => g.length >= 2).map(g => {
        const root = parent[buildings.indexOf(g[0])];
        const cid = g[0].clusterId;
        return {
          wx: g.reduce((s, b) => s + b.wx, 0) / g.length,
          wy: g.reduce((s, b) => s + b.wy, 0) / g.length,
          size: g.length,
          hexCount: hexCounts.get(root) || 0,
          clusterId: cid,
        };
      });
    }

    function buildingNear(wx, wy) {
      for (const b of buildings) {
        if (Math.hypot(wx - b.wx, wy - b.wy) < BUILD_EXCL) return b;
      }
      return null;
    }

    function humanNearBuilding(h) {
      return zoneHexes.has(`${h.row},${h.col}`) || zoneHexes.has(`${h.toRow},${h.toCol}`);
    }

    function breakBond(a, b) {
      if (a) { a.loveId = null; a.partAnim = { wx: a.wx, wy: a.wy, alpha: 1 }; }
      if (b) { b.loveId = null; b.partAnim = { wx: b.wx, wy: b.wy, alpha: 1 }; }
    }

    function removeHumanAt(row, col) {
      const idx = humans.findIndex(h => h.row === row && h.col === col && h.toRow === row && h.toCol === col);
      if (idx !== -1) { humanById.delete(humans[idx].id); humans.splice(idx, 1); }
    }

    // ── Spatial grid (rebuilt each frame, shared by updateHumans + drawGrid) ──
    const CELL = WW * 4; // ~4 hex widths per cell
    let spatialGrid = new Map();
    let zonePopMap = new Map();        // clusterId → living resident count, rebuilt each frame
    let villageClustersCache = [];     // rebuilt only when zoneRenderDirty
    function rebuildSpatialGrid() {
      spatialGrid = new Map();
      zonePopMap  = new Map();
      for (const h of humans) {
        if (h.dying) continue;
        const cx = Math.floor(h.wx / CELL), cy = Math.floor(h.wy / CELL);
        const k = `${cx},${cy}`;
        if (!spatialGrid.has(k)) spatialGrid.set(k, []);
        spatialGrid.get(k).push(h);
        if (h.zoneId) zonePopMap.set(h.zoneId, (zonePopMap.get(h.zoneId) || 0) + 1);
      }
      // Era advancement piggy-backed here to avoid a fourth O(n) pass
      for (const [cid, pop] of zonePopMap) {
        let era = clusterEras.get(cid) ?? 0;
        while (era < ERAS.length - 1 && pop >= ERAS[era + 1].minPop) era++;
        clusterEras.set(cid, era);
      }
    }
    function nearbyHumans(wx, wy, radius) {
      const cx0 = Math.floor((wx - radius) / CELL), cx1 = Math.floor((wx + radius) / CELL);
      const cy0 = Math.floor((wy - radius) / CELL), cy1 = Math.floor((wy + radius) / CELL);
      const result = [];
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cy = cy0; cy <= cy1; cy++) {
          const list = spatialGrid.get(`${cx},${cy}`);
          if (list) for (const h of list) result.push(h);
        }
      return result;
    }

    function updateHumans(dt, now) {
      // Rebuild spatial grid once per frame
      rebuildSpatialGrid();
      let needsRecompute = false;

      for (let i = humans.length - 1; i >= 0; i--) {
        const h = humans[i];

        // Death fade-out
        if (h.dying) {
          h.dyingAlpha -= dt * 0.8;
          if (h.dyingAlpha <= 0) {
            if (h.loveId) breakBond(null, humanById.get(h.loveId));
            humans.splice(i, 1);
            humanById.delete(h.id);
          }
          continue;
        }

        // Age
        h.age += dt * YEARS_PER_SECOND;
        if (h.age >= MAX_AGE) { h.dying = true; h.dyingAlpha = 1; continue; }

        // Random early death: risk rises steeply after 50, tiny chance for young
        const deathRisk = h.age < 5   ? 0.00008 :
                          h.age < 20  ? 0.00003 :
                          h.age < 50  ? 0.00006 :
                          h.age < 65  ? 0.003   :
                          h.age < 80  ? 0.008   :
                                        0.02;
        if (Math.random() < deathRisk * dt) {
          h.dying = true; h.dyingAlpha = 1;
          h.emotion = '💀'; h.emotionAt = now;
          continue;
        }

        // Clear stale loveId (partner died/removed without cleanup)
        if (h.loveId) {
          const _lp = humanById.get(h.loveId);
          if (!_lp || _lp.dying) h.loveId = null;
        }

        // Elders walk slower
        const speed = h.age >= 60 ? WALK_SPEED * 0.5 : WALK_SPEED;

        // Movement (skip for humans absorbed into a war particle)
        if (!h.warGrouped) {
          if (h.t < 1) {
            h.t = Math.min(1, h.t + dt * speed);
            const st = h.t * h.t * (3 - 2 * h.t);
            h.wx = lerp(h.fromX, h.toX, st);
            h.wy = lerp(h.fromY, h.toY, st);
          } else {
            pickNextTarget(h);
          }
        }

        // Zone membership: leave if outside zone, join if unbound and inside one
        if (h.zoneId && h.age >= 16) {
          const hkTo   = `${h.toRow},${h.toCol}`;
          const hkFrom = `${h.row},${h.col}`;
          const toCid   = hexClusterMap.get(hkTo);
          const fromCid = hexClusterMap.get(hkFrom);
          const outsideOwn = toCid !== h.zoneId && fromCid !== h.zoneId;
          const inAllied = outsideOwn && (allied(h.zoneId, toCid) || allied(h.zoneId, fromCid));
          if (outsideOwn && !inAllied && !h.warGrouped) {
            h.zoneId = null;
            h.emotion = '🚶'; h.emotionAt = now;
          }
          // Single adults occasionally wander off to mix with outsiders
          if (h.zoneId && !h.loveId && !h.warGrouped && Math.random() < 0.001 * dt) {
            h.zoneId = null;
            h.emotion = '🚶'; h.emotionAt = now;
          }
        } else if (h.age >= 16) {
          // Unbound adults: join any zone they walk into
          const cid = zoneCluserIdAt(h.wx, h.wy);
          if (cid) {
            h.zoneId = cid;
            h.emotion = '😊'; h.emotionAt = now;
          }
        }

        // Emotion cycle
        const eAge = now - h.emotionAt;
        if (eAge > EMOTION_INTERVAL) {
          h.emotion   = randomEmotion();
          h.emotionAt = now;
        }
        const fadeMs = 600;
        if (eAge < fadeMs) {
          h.emotionAlpha = eAge / fadeMs;
        } else if (eAge > EMOTION_INTERVAL - fadeMs) {
          h.emotionAlpha = (EMOTION_INTERVAL - eAge) / fadeMs;
        } else {
          h.emotionAlpha = 1;
        }

        // Skip all social behaviours while absorbed into a war particle
        if (h.warGrouped) continue;

        // Love: single adults near another single adult may fall in love
        if (!h.loveId && h.age >= 16) {
          const LOVE_DIST = Math.sqrt(3) * HEX_SIZE * 2.5;
          for (const other of nearbyHumans(h.wx, h.wy, LOVE_DIST)) {
            if (other === h || other.loveId || other.dying || other.age < 16) continue;
            const dist = Math.hypot(h.wx - other.wx, h.wy - other.wy);
            const sameGender = h.gender === other.gender;
            const chance = dt * (sameGender ? 0.05 : 0.4);
            if (dist < LOVE_DIST && Math.random() < chance) {
              h.loveId     = other.id;
              other.loveId = h.id;
              break;
            }
          }
        }

        // Baby: male+female couple, both fertile, close together, cooldown elapsed
        if (h.loveId && h.gender === 'female' &&
            h.age >= 16 && h.age <= BABY_MAX_AGE_F) {
          const partner = humanById.get(h.loveId);
          if (partner && !partner.dying &&
              partner.gender === 'male' &&
              partner.age >= 16 && partner.age <= BABY_MAX_AGE_M) {
            const nearBuilding = humanNearBuilding(h) || humanNearBuilding(partner);
            const eraForBaby = ERAS[clusterEras.get(h.zoneId ?? '') ?? clusterEras.get(partner.zoneId ?? '') ?? 0];
            const cooldown = (nearBuilding ? BABY_COOLDOWN_BUILDING : BABY_COOLDOWN) * eraForBaby.cooldownMult;
            const dist = Math.hypot(h.wx - partner.wx, h.wy - partner.wy);
            if ((simTime - h.lastBabyAt) >= cooldown &&
                dist < Math.sqrt(3) * HEX_SIZE * 3.5 && Math.random() < BABY_CHANCE * dt) {
              const midX = (h.wx + partner.wx) / 2;
              const midY = (h.wy + partner.wy) / 2;
              const spot = nearestWalkableHex(midX, midY);
              if (spot) {
                // Twins (15%) or triplets (3%)
                const roll = Math.random();
                const count = roll < 0.03 ? 3 : roll < 0.18 ? 2 : 1;
                const candidates = [spot];
                if (count > 1) {
                  const extras = hexNeighbors(spot.row, spot.col)
                    .filter(n => terrainFor(n.row, n.col).walkable);
                  for (let k = 0; k < count - 1 && k < extras.length; k++)
                    candidates.push(extras[k]);
                }
                for (const s of candidates)
                  addHuman(s.row, s.col, 0, Math.random() < 0.5 ? 'male' : 'female', null);
                h.lastBabyAt = simTime;
                partner.lastBabyAt = simTime;
                h.birthAnim = { wx: midX, wy: midY, alpha: 1, count };

              }
            }
          }
        }

        // Building: couple close together, no building nearby, small chance
        if (h.loveId && h.gender === 'female' && !h.dying) {
          const partner = humanById.get(h.loveId);
          if (partner && !partner.dying) {
            const inZone = zoneHexes.has(`${h.toRow},${h.toCol}`) || zoneHexes.has(`${partner.toRow},${partner.toCol}`);
            const excl   = inZone ? BUILD_EXCL * 0.55 : BUILD_EXCL;
            const eraForBuild = ERAS[clusterEras.get(h.zoneId ?? '') ?? clusterEras.get(partner.zoneId ?? '') ?? 0];
            const chance = (inZone ? BUILD_CHANCE * 3 : BUILD_CHANCE) * eraForBuild.buildMult;
            const tooClose = buildings.some(b => Math.hypot(h.wx - b.wx, h.wy - b.wy) < excl);
            const dist = Math.hypot(h.wx - partner.wx, h.wy - partner.wy);
            if (dist < BUILD_DIST && !tooClose && Math.random() < chance * dt) {
              const midX = (h.wx + partner.wx) / 2;
              const midY = (h.wy + partner.wy) / 2;
              const spot = nearestWalkableHex(midX, midY);
              if (spot) {
                const { x: bx, y: by } = hexCenter(spot.row, spot.col);
                // Inherit clusterId from nearest building in the same zone, or start a new one
                let clusterId;
                if (inZone && buildings.length > 0) {
                  let bestDist = Infinity;
                  for (const b of buildings) {
                    const d = Math.hypot(bx - b.wx, by - b.wy);
                    if (d < bestDist) { bestDist = d; clusterId = b.clusterId; }
                  }
                } else {
                  clusterId = Math.random().toString(36).slice(2);
                  zoneNameFor(clusterId); // register name immediately
                  logEvent('born', `🏛️ <b>${zoneNameFor(clusterId)}</b> founded`);
                  // Couple founds a new zone — always move to it (even if previously bound elsewhere)
                  h.zoneId = clusterId;
                  partner.zoneId = clusterId;
                  // Register immediately so zone pruning doesn't kill it this same frame
                  zonePopMap.set(clusterId, 2);
                  h.emotion = '🏗️'; h.emotionAt = now;
                }
                const eraBuildings = ERAS[clusterEras.get(clusterId) ?? 0].buildings;
                buildings.push({
                  row: spot.row, col: spot.col, wx: bx, wy: by,
                  emoji: eraBuildings[Math.floor(Math.random() * eraBuildings.length)],
                  clusterId,
                });

                needsRecompute = true;
              }
            }
          }
        }

        // Parting: couple may drift apart over time
        if (h.loveId && Math.random() < 0.0005 * dt) {
          const partner = humanById.get(h.loveId);
          breakBond(h, partner);
        }

        // Straying: partnered adult may fall for a nearby different person
        if (h.loveId && h.age >= 16 && Math.random() < 0.002 * dt) {
          const STRAY_DIST = Math.sqrt(3) * HEX_SIZE * 2;
          const strayPartner = humanById.get(h.loveId);
          for (const other of nearbyHumans(h.wx, h.wy, STRAY_DIST)) {
            if (other === h || other === strayPartner || other.dying || other.age < 16) continue;
            const dist = Math.hypot(h.wx - other.wx, h.wy - other.wy);
            if (dist < STRAY_DIST) {
              breakBond(h, strayPartner);
              if (other.loveId) {
                const otherOld = humanById.get(other.loveId);
                breakBond(other, otherOld);
              }
              h.loveId     = other.id;
              other.loveId = h.id;
              break;
            }
          }
        }

        // Decay birth sparkle
        if (h.birthAnim) {
          h.birthAnim.alpha -= dt * 0.6;
          if (h.birthAnim.alpha <= 0) h.birthAnim = null;
        }

        // Decay part sparkle
        if (h.partAnim) {
          h.partAnim.alpha -= dt * 0.7;
          if (h.partAnim.alpha <= 0) h.partAnim = null;
        }
      }

      if (needsRecompute) recomputeZones();

      // ── War ─────────────────────────────────────────────────
      // Recompute touching zone pairs only when zones changed
      if (touchingPairsDirty) {
        touchingPairsCache = new Map();
        for (const [key, cid] of hexClusterMap) {
          const comma = key.indexOf(',');
          const row = +key.slice(0, comma), col = +key.slice(comma + 1);
          const even = row % 2 === 0;
          const neighborKeys = [
            `${row},${col+1}`, `${row+1},${even?col:col+1}`, `${row+1},${even?col-1:col}`,
            `${row},${col-1}`, `${row-1},${even?col-1:col}`, `${row-1},${even?col:col+1}`,
          ];
          for (const nk of neighborKeys) {
            const ncid = hexClusterMap.get(nk);
            if (ncid && ncid !== cid) {
              const wk = warKey(cid, ncid);
              if (!touchingPairsCache.has(wk)) touchingPairsCache.set(wk, wk.split('|'));
            }
          }
        }
        touchingPairsDirty = false;
      }
      const touchingPairs = touchingPairsCache;

      // Expire alliances — release any allied soldiers still in a war group
      for (const [k, al] of alliances) {
        if (simTime - al.formedAt < ALLIANCE_DURATION) continue;
        for (const w of wars.values()) {
          for (const sideCid of [w.cidA, w.cidB]) {
            const alliedZone = al.cidA === sideCid ? al.cidB
                             : al.cidB === sideCid ? al.cidA
                             : null;
            if (!alliedZone) continue;
            const p = w.particles[sideCid];
            for (const id of [...p.memberIds]) {
              const h = humanById.get(id);
              if (h && h.zoneId === alliedZone) {
                h.warGrouped = false;
                p.memberIds.delete(id);
                h.emotion = '🏃'; h.emotionAt = now;
              }
            }
          }
        }
        alliances.delete(k);
      }

      // Chance to declare war or form alliance on touching pairs
      for (const [, [cidA, cidB]] of touchingPairs) {
        if (atWar(cidA, cidB)) continue;
        // War chance scales with combined population (base × up to 8×)
        const popScale = Math.min(8, Math.max(1, ((zonePopMap.get(cidA) || 0) + (zonePopMap.get(cidB) || 0)) / 10));
        if (!allied(cidA, cidB) && Math.random() < 0.003 * dt) {
          alliances.set(allianceKey(cidA, cidB), { cidA, cidB, formedAt: simTime });
          logEvent('ally', `🤝 <b>${zoneNameFor(cidA)}</b> allied <b>${zoneNameFor(cidB)}</b>`);
          for (const h of humans) {
            if (!h.dying && (h.zoneId === cidA || h.zoneId === cidB)) {
              h.emotion = '🤝'; h.emotionAt = now;
            }
          }
        } else if (!allied(cidA, cidB) && Math.random() < 0.006 * popScale * dt) {
          declareWar(cidA, cidB, now);
          for (const h of humans) {
            if (!h.dying && (h.zoneId === cidA || h.zoneId === cidB)) {
              h.emotion = '⚔️'; h.emotionAt = now;
            }
          }
        }
      }

      // ── War particle system ──────────────────────────────────
      const MERGE_R   = HEX_SIZE * 6;    // absorb radius
      const CONTACT_R = HEX_SIZE * 2.5;  // clash distance
      const WAR_SPD   = WW * 3.5;        // particle speed px/s (fast & visible)
      const KILL_RATE = 1.2;             // kills per second per side when clashing

      for (const [k, w] of wars) {
        const pA = w.particles[w.cidA];
        const pB = w.particles[w.cidB];

        // End stalled wars: one side grouped but the other never forms within 10s
        if (!w.clashing && simTime - w.startTime >= 10) {
          const oneSideEmpty = pA.memberIds.size === 0 || pB.memberIds.size === 0;
          if (oneSideEmpty) { endWar(w.cidA, w.cidB); continue; }
        }

        // Snap particle to centroid of its living zone humans each tick
        for (const p of [pA, pB]) {
          const cid = p === pA ? w.cidA : w.cidB;
          let sx = 0, sy = 0, cnt = 0;
          for (const h of humans) {
            if (!h.dying && h.zoneId === cid) { sx += h.wx; sy += h.wy; cnt++; }
          }
          if (cnt > 0 && p.memberIds.size === 0) {
            // Not yet in combat — track centroid so humans find the rally point
            p.wx = sx / cnt; p.wy = sy / cnt;
          }
        }

        // Absorb nearby zone humans (and allies) into their side's particle
        for (const h of humans) {
          if (h.dying || !h.zoneId) continue;
          const myCid = w.cidA === h.zoneId || allied(h.zoneId, w.cidA) ? w.cidA
                      : w.cidB === h.zoneId || allied(h.zoneId, w.cidB) ? w.cidB
                      : null;
          if (!myCid) continue;
          const p = w.particles[myCid];
          if (h.warGrouped) {
            h.wx = p.wx; h.wy = p.wy; // keep in sync
          } else {
            const d = Math.hypot(h.wx - p.wx, h.wy - p.wy);
            if (d < MERGE_R) { p.memberIds.add(h.id); h.warGrouped = true; h.wx = p.wx; h.wy = p.wy; }
          }
        }

        // Clean dead members (safe to delete from Set during for..of)
        for (const p of [pA, pB])
          for (const id of p.memberIds) {
            const hh = humanById.get(id);
            if (!hh || hh.dying) p.memberIds.delete(id);
          }

        // Both sides formed — wait for rally (≥3 soldiers or 4s elapsed) then charge
        const formed = pA.memberIds.size > 0 && pB.memberIds.size > 0;
        if (formed && !w.firstFormedAt) w.firstFormedAt = simTime;
        const readyToCharge = formed && (
          (pA.memberIds.size >= 3 && pB.memberIds.size >= 3) ||
          (w.firstFormedAt && simTime - w.firstFormedAt >= 4)
        );
        const dx = pB.wx - pA.wx, dy = pB.wy - pA.wy;
        const dist = Math.hypot(dx, dy);

        if (readyToCharge && dist > CONTACT_R && dist > 0) {
          const step = WAR_SPD * dt;
          pA.wx += (dx / dist) * step; pA.wy += (dy / dist) * step;
          pB.wx -= (dx / dist) * step; pB.wy -= (dy / dist) * step;
          // Sync grouped humans
          for (const h of humans) {
            if (!h.warGrouped || !h.zoneId) continue;
            const myCid = (h.zoneId === w.cidA || allied(h.zoneId, w.cidA)) ? w.cidA
                        : (h.zoneId === w.cidB || allied(h.zoneId, w.cidB)) ? w.cidB : null;
            if (myCid) { const p = w.particles[myCid]; h.wx = p.wx; h.wy = p.wy; }
          }
        }

        // Clash: fast kills when particles touch
        if (readyToCharge && dist <= CONTACT_R) {
          w.clashing = true;
          const battleScale = Math.max(1, Math.max(pA.memberIds.size, pB.memberIds.size) / 5);
          const eraA = ERAS[clusterEras.get(w.cidA) ?? 0];
          const eraB = ERAS[clusterEras.get(w.cidB) ?? 0];
          const applyKills = (victim, kills) => {
            for (let kk = 0; kk < kills && victim.memberIds.size > 0; kk++) {
              let idx = Math.floor(Math.random() * victim.memberIds.size);
              let h = null;
              for (const id of victim.memberIds) { if (idx-- <= 0) { h = humanById.get(id); break; } }
              if (h && !h.dying) {
                h.dying = true; h.dyingAlpha = 1;
                h.warGrouped = false;
                h.emotion = '💀'; h.emotionAt = now;
                victim.memberIds.delete(h.id);
              }
            }
          };
          applyKills(pB, Math.floor(KILL_RATE * battleScale * eraA.killMult * dt + Math.random()));
          applyKills(pA, Math.floor(KILL_RATE * battleScale * eraB.killMult * dt + Math.random()));
        } else {
          w.clashing = false;
        }

        // End war
        const aAlive = (zonePopMap.get(w.cidA) || 0) > 0;
        const bAlive = (zonePopMap.get(w.cidB) || 0) > 0;
        const stillTouch = touchingPairs.has(k);
        if (!aAlive || !bAlive || !stillTouch) { endWar(w.cidA, w.cidB); }
      }

      // Remove zones whose cluster has no living residents (skip clusters actively at war)
      if (buildings.length > 0) {
        const activeClusters = new Set(zonePopMap.keys());
        const warClusters = new Set();
        for (const w of wars.values()) { warClusters.add(w.cidA); warClusters.add(w.cidB); }
        const before = buildings.length;
        for (let i = buildings.length - 1; i >= 0; i--) {
          const cid = buildings[i].clusterId;
          if (cid && !activeClusters.has(cid) && !warClusters.has(cid)) {
            buildings.splice(i, 1);
          }
        }
        if (buildings.length !== before) {
          recomputeZones();
          // Clean up names, eras, and wars for removed clusters
          for (const cid of zoneNames.keys()) {
            if (!buildings.some(b => b.clusterId === cid)) {
              logEvent('died', `💀 <b>${zoneNames.get(cid)}</b> dissolved`);
              zoneNames.delete(cid); zoneColors.delete(cid);
            }
          }
          for (const cid of clusterEras.keys()) {
            if (!buildings.some(b => b.clusterId === cid)) clusterEras.delete(cid);
          }
          for (const [k, w] of wars) {
            if (!buildings.some(b => b.clusterId === w.cidA) ||
                !buildings.some(b => b.clusterId === w.cidB)) wars.delete(k);
          }
        }
      }

      // ── Zone splitting: larger zones have higher chance to split ──
      if (buildings.length >= 2) {
        // Group buildings by cluster
        const clusterBuildingMap = new Map();
        for (const b of buildings) {
          if (!b.clusterId) continue;
          if (!clusterBuildingMap.has(b.clusterId)) clusterBuildingMap.set(b.clusterId, []);
          clusterBuildingMap.get(b.clusterId).push(b);
        }
        // Count zone hexes per cluster
        const clusterHexCount = new Map();
        for (const cid of hexClusterMap.values())
          clusterHexCount.set(cid, (clusterHexCount.get(cid) || 0) + 1);

        const warZones = new Set();
        for (const w of wars.values()) { warZones.add(w.cidA); warZones.add(w.cidB); }

        let splitOccurred = false;
        for (const [cid, blist] of clusterBuildingMap) {
          if (blist.length < 2) continue;
          if (warZones.has(cid)) continue;
          const hexCount = clusterHexCount.get(cid) || 0;
          if (Math.random() >= hexCount * 0.00025 * dt) continue;

          // Split along axis of greater spatial variance
          const mx = blist.reduce((s, b) => s + b.wx, 0) / blist.length;
          const my = blist.reduce((s, b) => s + b.wy, 0) / blist.length;
          const varX = blist.reduce((s, b) => s + (b.wx - mx) ** 2, 0);
          const varY = blist.reduce((s, b) => s + (b.wy - my) ** 2, 0);
          const groupA = [], groupB = [];
          for (const b of blist)
            (varX >= varY ? b.wx < mx : b.wy < my) ? groupA.push(b) : groupB.push(b);
          if (!groupA.length || !groupB.length) continue;

          const newCid = Math.random().toString(36).slice(2);
          zoneNameFor(newCid);
          logEvent('born', `💥 <b>${zoneNameFor(cid)}</b> split → <b>${zoneNameFor(newCid)}</b>`);
          for (const b of groupB) b.clusterId = newCid;
          splitOccurred = true;
        }

        if (splitOccurred) {
          recomputeZones();
          // Rebind humans whose position now falls in the new cluster
          for (const h of humans) {
            if (!h.zoneId) continue;
            const nowCid = zoneCluserIdAt(h.wx, h.wy);
            if (nowCid && nowCid !== h.zoneId) h.zoneId = nowCid;
          }
        }
      }

    }

    // ── Camera ───────────────────────────────────────────────
    let camX = 0, camY = 0, scale = 1;
    let isDragging = false, dragStartX = 0, dragStartY = 0;

    // ── Drawing helpers ───────────────────────────────────────
    function hexCorners(cx, cy, size) {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
      }
      return pts;
    }

    // '#rrggbb' / 'rgb(r,g,b)' → 0xRRGGBB
    function hexStr2Int(s) {
      if (s[0] === '#') return parseInt(s.slice(1), 16);
      const m = s.match(/\d+/g);
      return ((parseInt(m[0]) << 16) | (parseInt(m[1]) << 8) | parseInt(m[2])) >>> 0;
    }
    // HSL (degrees, 0-100, 0-100) → 0xRRGGBB
    function hslToInt(h, s, l) {
      s /= 100; l /= 100;
      const k = n => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return ((Math.round(f(0)*255) << 16) | (Math.round(f(8)*255) << 8) | Math.round(f(4)*255)) >>> 0;
    }

    // Emoji / text → PIXI.Texture (cached; font & fill-color selectable)
    const _etCache = new Map();
    function emojiTex(text, fontSize, font, color) {
      font = font || 'serif';
      const key = `${text}|${fontSize}|${font}|${color}`;
      if (_etCache.has(key)) return _etCache.get(key);
      const fs2 = fontSize * 2;
      const ph  = Math.ceil(fontSize * 1.8) * 2; // canvas height
      // Measure actual text width so long strings aren't clipped
      const mctx = document.createElement('canvas').getContext('2d');
      mctx.font = `${fs2}px ${font}`;
      const pw = Math.max(ph, Math.ceil(mctx.measureText(text).width) + Math.ceil(fontSize * 0.8));
      const c  = document.createElement('canvas');
      c.width = pw; c.height = ph;
      const c2 = c.getContext('2d');
      c2.font = `${fs2}px ${font}`;
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      if (color) c2.fillStyle = color;
      c2.fillText(text, pw / 2, ph / 2);
      const tex = PIXI.Texture.from(c);
      _etCache.set(key, tex); return tex;
    }
    function emojiSprite(text, size, font, color) {
      const s = new PIXI.Sprite(emojiTex(text, size, font, color));
      s.anchor.set(0.5); s.width = s.height = size * 1.5; return s;
    }

    // ── PixiJS scene graph ───────────────────────────────────
    const worldCtr     = new PIXI.Container(); // camera-space root
    app.stage.addChild(worldCtr);

    const terrainGfx    = new PIXI.Graphics(); // hex fills (WebGL batched)
    const terrainEmoCtr = new PIXI.Container(); // terrain emoji labels
    const zoneFillGfx   = new PIXI.Graphics(); // zone fills (rebuilt only when dirty)
    const zoneBorderGfx = new PIXI.Graphics(); // all zone borders (every frame)
    const buildCtr      = new PIXI.Container(); // building sprites
    const loveGfx       = new PIXI.Graphics(); // love lines + heart sprites
    const sparkleCtr    = new PIXI.Container(); // birth / part sparkles
    const humanCtr      = new PIXI.Container(); // human containers (pooled)
    const warGfx        = new PIXI.Graphics(); // war lines + particles
    worldCtr.addChild(terrainGfx, terrainEmoCtr, zoneFillGfx, zoneBorderGfx,
                      buildCtr, loveGfx, sparkleCtr, humanCtr, warGfx);

    // Screen-space UI layer
    const uiGfx = new PIXI.Graphics();  // label background pills
    const uiCtr = new PIXI.Container(); // label text nodes
    app.stage.addChild(uiGfx, uiCtr);

    // ── Terrain emoji sprite pool ────────────────────────────
    const TPOOL_SZ = 1400;
    const _tPool   = Array.from({ length: TPOOL_SZ }, () => {
      const s = new PIXI.Sprite(PIXI.Texture.EMPTY);
      s.anchor.set(0.5); s.visible = false;
      terrainEmoCtr.addChild(s); return s;
    });

    // ── Human sprite pool ────────────────────────────────────
    const _hPool = new Map(); // h.id → { ctr, shadow, emoSpr, badgeGfx, badgeSpr, bubbGfx, bubbSpr, _c }
    function ensureHuman(h) {
      if (_hPool.has(h.id)) return _hPool.get(h.id);
      const ctr      = new PIXI.Container();
      const shadow   = new PIXI.Graphics();
      const emoSpr   = new PIXI.Sprite(PIXI.Texture.EMPTY); emoSpr.anchor.set(0.5);
      const badgeGfx = new PIXI.Graphics();
      const badgeSpr = new PIXI.Sprite(PIXI.Texture.EMPTY); badgeSpr.anchor.set(0.5);
      const bubbGfx  = new PIXI.Graphics();
      const bubbSpr  = new PIXI.Sprite(PIXI.Texture.EMPTY); bubbSpr.anchor.set(0.5);
      ctr.addChild(shadow, emoSpr, badgeGfx, badgeSpr, bubbGfx, bubbSpr);
      humanCtr.addChild(ctr);
      const rec = { ctr, shadow, emoSpr, badgeGfx, badgeSpr, bubbGfx, bubbSpr,
                    _c: { emoji: '', age: -1, emo: '' } };
      _hPool.set(h.id, rec); return rec;
    }

    // ── Settlement label pool ────────────────────────────────
    const _lblPool = [];
    function getLbl(idx) {
      if (idx < _lblPool.length) return _lblPool[idx];
      const pill = new PIXI.Graphics();
      const mkT  = (sz, col, wt) => {
        const t = new PIXI.Text('', new PIXI.TextStyle({ fontSize: sz, fill: col, fontFamily: 'sans-serif', fontWeight: wt || 'normal' }));
        t.anchor.set(0.5, 0); return t;
      };
      const t1 = mkT(11, 0xffdc64), t2 = mkT(14, 0xffffff, 'bold'), t3 = mkT(11, 0xaaddff);
      uiCtr.addChild(pill, t1, t2, t3);
      const node = { pill, t1, t2, t3 }; _lblPool.push(node); return node;
    }
    function hideLblsFrom(idx) {
      for (let i = idx; i < _lblPool.length; i++) {
        const { pill, t1, t2, t3 } = _lblPool[i];
        pill.visible = t1.visible = t2.visible = t3.visible = false;
      }
    }

    // ── Zone border edge caches (rebuilt with zoneRenderDirty) ─
    let _tierEdges   = new Map();  // key → { color, alpha, coords[] }
    let _zoneBorders = [];         // [{ x1,y1,x2,y2,cidA,cidB }]
    let _zoneFillData = new Map(); // fillInt → { alpha, keys[] }

    function drawHex(_cx, _cy, _size, _terrain) {}

    function drawGrid(now) {
      // Apply camera transform to world container
      worldCtr.x = canvas.width  / 2 + camX;
      worldCtr.y = canvas.height / 2 + camY;
      worldCtr.scale.set(scale);

      const viewW   = canvas.width  / scale;
      const viewH   = canvas.height / scale;
      const originX = -canvas.width  / 2 / scale - camX / scale;
      const originY = -canvas.height / 2 / scale - camY / scale;
      const colStart = Math.floor(originX / WW) - 1;
      const colEnd   = Math.ceil((originX + viewW) / WW) + 1;
      const rowStart = Math.floor(originY / RH) - 1;
      const rowEnd   = Math.ceil((originY + viewH) / RH) + 1;

      // ── Terrain hex tiles (batched fills by colour) ──────────
      terrainGfx.clear();
      const byColor = new Map();
      for (let row = rowStart; row < rowEnd; row++)
        for (let col = colStart; col < colEnd; col++) {
          const { x: cx, y: cy } = hexCenter(row, col);
          const t = terrainFor(row, col);
          if (!byColor.has(t.fill)) byColor.set(t.fill, []);
          byColor.get(t.fill).push(cx, cy);
        }
      for (const [fill, coords] of byColor) {
        terrainGfx.lineStyle(BORDER / scale, 0xffffff, 1);
        terrainGfx.beginFill(hexStr2Int(fill), 1);
        for (let i = 0; i < coords.length; i += 2)
          terrainGfx.drawPolygon(hexCorners(coords[i], coords[i+1], HEX_SIZE).flatMap(p => [p.x, p.y]));
        terrainGfx.endFill();
      }

      // Terrain emoji labels (sprite pool, recycled each frame)
      let tpi = 0;
      if (scale > 0.5) {
        const fs = Math.max(10, HEX_SIZE * 0.55);
        for (let row = rowStart; row < rowEnd && tpi < TPOOL_SZ; row++)
          for (let col = colStart; col < colEnd && tpi < TPOOL_SZ; col++) {
            const { x: cx, y: cy } = hexCenter(row, col);
            const s = _tPool[tpi++];
            s.texture = emojiTex(terrainFor(row, col).label, fs);
            s.width = s.height = fs * 1.3; s.x = cx; s.y = cy; s.visible = true;
          }
      }
      for (let i = tpi; i < TPOOL_SZ; i++) _tPool[i].visible = false;

      // ── Zone fills + borders ─────────────────────────────────
      if (zonesOn && zoneHexes.size > 0) {
        if (zoneRenderDirty && buildings.length) {
          const parent2 = buildings.map((_, i) => i);
          function find2(i) { return parent2[i] === i ? i : (parent2[i] = find2(parent2[i])); }
          for (let i = 0; i < buildings.length; i++)
            for (let j = i + 1; j < buildings.length; j++)
              if (buildings[i].clusterId && buildings[i].clusterId === buildings[j].clusterId &&
                  Math.hypot(buildings[i].wx - buildings[j].wx, buildings[i].wy - buildings[j].wy) < ZONE_MERGE)
                parent2[find2(i)] = find2(j);
          const rootCluster = new Map();
          buildings.forEach((b, i) => { if (b.clusterId) rootCluster.set(find2(i), b.clusterId); });

          const hexFill = new Map(), hexBorder = new Map(), hexRoot = new Map();
          for (const key of zoneHexes) {
            const [rr, cc] = key.split(',').map(Number);
            const { x: kx, y: ky } = hexCenter(rr, cc);
            let bestRoot = -1, bestDist = Infinity;
            buildings.forEach((b, i) => { const d = Math.hypot(kx-b.wx, ky-b.wy); if (d < bestDist) { bestDist=d; bestRoot=find2(i); } });
            hexRoot.set(key, bestRoot);
            const cid = rootCluster.get(bestRoot) || String(bestRoot);
            const hue = zoneColorFor(cid);
            hexFill.set(key,   { fillInt: hslToInt(hue, 65, 55), alpha: 0.32 });
            hexBorder.set(key, { borderInt: hslToInt(hue, 80, 70), alpha: 0.95, cid });
          }

          // Fill data grouped by colour
          _zoneFillData = new Map();
          for (const [key, fd] of hexFill) {
            if (!_zoneFillData.has(fd.fillInt)) _zoneFillData.set(fd.fillInt, { alpha: fd.alpha, keys: [] });
            _zoneFillData.get(fd.fillInt).keys.push(key);
          }
          // Tier border edges + zone border pairs
          _tierEdges = new Map(); _zoneBorders = [];
          for (const key of zoneHexes) {
            const comma = key.indexOf(',');
            const row = +key.slice(0, comma), col = +key.slice(comma+1);
            const { x: cx, y: cy } = hexCenter(row, col);
            const corners = hexCorners(cx, cy, HEX_SIZE);
            const even = row % 2 === 0;
            const { borderInt, alpha: ba, cid: myCid } = hexBorder.get(key);
            const bk = `${borderInt}`;
            const nbrs = [
              `${row},${col+1}`, `${row+1},${even?col:col+1}`, `${row+1},${even?col-1:col}`,
              `${row},${col-1}`, `${row-1},${even?col-1:col}`, `${row-1},${even?col:col+1}`,
            ];
            for (let i = 0; i < 6; i++) {
              const nk = nbrs[i];
              const x1 = corners[i].x, y1 = corners[i].y;
              const x2 = corners[(i+1)%6].x, y2 = corners[(i+1)%6].y;
              if (!zoneHexes.has(nk)) {
                if (!_tierEdges.has(bk)) _tierEdges.set(bk, { color: borderInt, alpha: ba, coords: [] });
                _tierEdges.get(bk).coords.push(x1, y1, x2, y2);
              } else {
                const nCid = hexClusterMap.get(nk);
                if (nCid && nCid !== myCid && myCid < nCid)
                  _zoneBorders.push({ x1, y1, x2, y2, cidA: myCid, cidB: nCid });
              }
            }
          }

          // Rebuild zone fill Graphics (static — not scale-dependent)
          zoneFillGfx.clear();
          for (const [fillInt, { alpha, keys }] of _zoneFillData) {
            zoneFillGfx.beginFill(fillInt, alpha);
            for (const key of keys) {
              const comma = key.indexOf(',');
              const row = +key.slice(0, comma), col = +key.slice(comma+1);
              const { x: cx, y: cy } = hexCenter(row, col);
              zoneFillGfx.drawPolygon(hexCorners(cx, cy, HEX_SIZE).flatMap(p => [p.x, p.y]));
            }
            zoneFillGfx.endFill();
          }

          zoneRenderCache = { hexTierFill: hexFill, hexTierBorder: hexBorder, hexRoot };
          villageClustersCache = computeVillageClusters();
          zoneRenderDirty = false;
        }

        // Borders (tier + dynamic war/alliance/neutral) — every frame from cache
        zoneBorderGfx.removeChildren(); zoneBorderGfx.clear();
        for (const { color, alpha, coords } of _tierEdges.values()) {
          zoneBorderGfx.lineStyle(4.5 / scale, color, alpha);
          for (let i = 0; i < coords.length; i += 4) {
            zoneBorderGfx.moveTo(coords[i], coords[i+1]);
            zoneBorderGfx.lineTo(coords[i+2], coords[i+3]);
          }
        }
        const allyE = [], warE = [], neutE = [];
        // Track centroid of shared edges per zone-pair for icon placement
        const allyPairs = new Map(), warPairs = new Map();
        for (const { x1, y1, x2, y2, cidA, cidB } of _zoneBorders) {
          const mx = (x1+x2)/2, my = (y1+y2)/2;
          if (atWar(cidA, cidB)) {
            warE.push(x1, y1, x2, y2);
            const pk = warKey(cidA, cidB);
            const e = warPairs.get(pk) || { sx:0, sy:0, n:0 };
            e.sx += mx; e.sy += my; e.n++; warPairs.set(pk, e);
          } else if (allied(cidA, cidB)) {
            allyE.push(x1, y1, x2, y2);
            const pk = allianceKey(cidA, cidB);
            const e = allyPairs.get(pk) || { sx:0, sy:0, n:0 };
            e.sx += mx; e.sy += my; e.n++; allyPairs.set(pk, e);
          } else {
            neutE.push(x1, y1, x2, y2);
          }
        }
        const drawEdges = (e, lw, col, al) => {
          if (!e.length) return;
          zoneBorderGfx.lineStyle(lw / scale, col, al);
          for (let i = 0; i < e.length; i += 4) { zoneBorderGfx.moveTo(e[i], e[i+1]); zoneBorderGfx.lineTo(e[i+2], e[i+3]); }
        };
        drawEdges(neutE, 3, 0xffffff, 0.55);
        drawEdges(allyE, 5, 0x32e65a, 1.00);
        drawEdges(warE,  5, 0xe61e1e, 1.00);
        // One icon per zone-pair, at the centroid of their shared border
        if (allyPairs.size || warPairs.size) {
          const icoFs = Math.max(8, HEX_SIZE * 0.3);
          for (const { sx, sy, n } of allyPairs.values()) {
            const s = emojiSprite('🤝', icoFs); s.x = sx/n; s.y = sy/n; zoneBorderGfx.addChild(s);
          }
          for (const { sx, sy, n } of warPairs.values()) {
            const s = emojiSprite('⚔️', icoFs); s.x = sx/n; s.y = sy/n; zoneBorderGfx.addChild(s);
          }
        }
      } else {
        zoneFillGfx.clear();
        zoneBorderGfx.removeChildren(); zoneBorderGfx.clear();
      }

      // ── Buildings ────────────────────────────────────────────
      if (buildCtr.children.length !== buildings.length) {
        buildCtr.removeChildren();
        for (const b of buildings) {
          const s = emojiSprite(b.emoji, Math.max(10, HEX_SIZE * 0.62));
          s.x = b.wx; s.y = b.wy - HEX_SIZE * 0.05; buildCtr.addChild(s);
        }
      }

      // ── Love lines ───────────────────────────────────────────
      loveGfx.removeChildren(); loveGfx.clear();
      if (loveLinesOn) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.004);
        const drawn = new Set();
        for (const h of humans) {
          if (!h.loveId || drawn.has(h.id)) continue;
          const partner = humanById.get(h.loveId);
          if (!partner) continue;
          drawn.add(h.id); drawn.add(partner.id);
          const alpha = Math.min(h.dyingAlpha ?? 1, partner.dyingAlpha ?? 1);
          loveGfx.lineStyle(2.5 / scale, 0xff6eb0, alpha * pulse);
          loveGfx.moveTo(h.wx, h.wy); loveGfx.lineTo(partner.wx, partner.wy);
          const mx = (h.wx+partner.wx)/2, my = (h.wy+partner.wy)/2;
          const hs = emojiSprite('❤️', Math.max(8, HEX_SIZE * 0.42));
          hs.x=mx; hs.y=my; hs.alpha=alpha; loveGfx.addChild(hs);
        }
      }

      // ── Sparkles ─────────────────────────────────────────────
      sparkleCtr.removeChildren();
      for (const h of humans) {
        if (h.partAnim) {
          const { wx, wy, alpha } = h.partAnim;
          const s = emojiSprite('💔', Math.max(8, HEX_SIZE * 0.45));
          s.x=wx; s.y=wy - HEX_SIZE*0.5*(1-alpha); s.alpha=alpha; sparkleCtr.addChild(s);
        }
        if (h.birthAnim) {
          const { wx, wy, alpha, count } = h.birthAnim;
          const cnt = count ?? 1;
          const bfs = Math.max(10, HEX_SIZE * 0.52);
          const yOff = wy - HEX_SIZE * 0.7 * (1 - alpha);
          for (let bi = 0; bi < cnt; bi++) {
            const s = emojiSprite('👶', bfs);
            s.x = wx + (bi - (cnt - 1) / 2) * bfs * 1.1;
            s.y = yOff; s.alpha = alpha; sparkleCtr.addChild(s);
          }
        }
      }

      // ── Humans ───────────────────────────────────────────────
      for (const [id, rec] of _hPool) {
        if (!humanById.has(id)) { rec.ctr.parent && rec.ctr.parent.removeChild(rec.ctr); _hPool.delete(id); }
      }
      for (const h of humans) {
        if (h.warGrouped) { if (_hPool.has(h.id)) _hPool.get(h.id).ctr.visible = false; continue; }
        const rec = ensureHuman(h);
        rec.ctr.visible = true;
        rec.ctr.x = h.wx; rec.ctr.y = h.wy;
        rec.ctr.alpha = h.dyingAlpha ?? 1;

        const moving = h.t < 1;
        const bob = moving ? Math.abs(Math.sin(now * 0.008)) * HEX_SIZE * (h.age >= 60 ? 0.06 : 0.12) : 0;

        rec.shadow.clear();
        rec.shadow.beginFill(0x000000, 0.35);
        rec.shadow.drawEllipse(0, HEX_SIZE*0.25, HEX_SIZE*0.22, HEX_SIZE*0.09);
        rec.shadow.endFill();

        const humanEmoji = emojiForAge(h.age, h.gender);
        const fs = Math.max(10, HEX_SIZE * 0.58);
        if (rec._c.emoji !== humanEmoji) {
          rec.emoSpr.texture = emojiTex(humanEmoji, fs);
          rec.emoSpr.width = rec.emoSpr.height = fs * 1.4;
          rec._c.emoji = humanEmoji;
        }
        rec.emoSpr.y = -HEX_SIZE * 0.08 - bob;

        const ageInt  = Math.floor(h.age);
        const badgeFs = Math.max(6, HEX_SIZE * 0.22);
        const gSym    = h.gender === 'female' ? '♀' : '♂';
        const ageText = gSym + ageInt;
        const badgeW  = badgeFs * (ageText.length * 0.72 + 0.6);
        const badgeH  = badgeFs * 1.4;
        const bxOff   = HEX_SIZE * 0.22;
        const byOff   = -HEX_SIZE * 0.38 - bob;
        const ageRatio = h.age / MAX_AGE, isFem = h.gender === 'female';
        const br = Math.round(lerp(isFem?200:60, 220, ageRatio));
        const bg = Math.round(lerp(isFem?100:140, 50, ageRatio));
        const bb = Math.round(lerp(isFem?160:220, 50, ageRatio));
        rec.badgeGfx.clear();
        rec.badgeGfx.beginFill(((br<<16)|(bg<<8)|bb)>>>0, 1);
        rec.badgeGfx.drawRoundedRect(bxOff-badgeW/2, byOff-badgeH/2, badgeW, badgeH, badgeH/2);
        rec.badgeGfx.endFill();
        if (rec._c.age !== ageInt) {
          rec.badgeSpr.texture = emojiTex(ageText, badgeFs, 'bold sans-serif', '#ffffff');
          rec.badgeSpr.width = rec.badgeSpr.height = badgeFs * 1.2;
          rec._c.age = ageInt;
        }
        rec.badgeSpr.x = bxOff; rec.badgeSpr.y = byOff;

        const eAge = now - h.emotionAt;
        const fadeMs = 600;
        let eAlpha = 1;
        if (eAge < fadeMs)                         eAlpha = eAge / fadeMs;
        else if (eAge > EMOTION_INTERVAL - fadeMs) eAlpha = (EMOTION_INTERVAL - eAge) / fadeMs;
        eAlpha = Math.max(0, Math.min(1, eAlpha));
        const showBubble = emotionsOn && eAlpha > 0.01;
        rec.bubbGfx.visible = rec.bubbSpr.visible = showBubble;
        if (showBubble) {
          const bubY  = -HEX_SIZE * 0.82 - bob;
          const isEmo = /\p{Emoji}/u.test(h.emotion) && h.emotion.length <= 2;
          const efs   = isEmo ? Math.max(10, HEX_SIZE*0.48) : Math.max(8, HEX_SIZE*0.28);
          const pad   = HEX_SIZE * 0.13;
          // Update texture first so we can size the bubble from the real sprite width
          if (rec._c.emo !== h.emotion) {
            const tex = emojiTex(h.emotion, efs, isEmo?'serif':'sans-serif', isEmo?null:'#222222');
            rec.bubbSpr.texture = tex;
            rec.bubbSpr.height = efs * 1.4;
            rec.bubbSpr.width  = rec.bubbSpr.height * (tex.width / tex.height);
            rec._c.emo = h.emotion;
          }
          const bw2 = rec.bubbSpr.width + pad * 2;
          const bh2 = efs + pad * 1.4;
          rec.bubbGfx.clear();
          rec.bubbGfx.alpha = eAlpha;
          rec.bubbGfx.beginFill(0xffffff, 0.92);
          rec.bubbGfx.lineStyle(0.8/scale, 0x000000, 0.15);
          rec.bubbGfx.drawRoundedRect(-bw2/2, bubY-bh2/2, bw2, bh2, bh2/2);
          rec.bubbGfx.moveTo(HEX_SIZE*0.08, bubY+bh2/2);
          rec.bubbGfx.lineTo(0, bubY+bh2/2+HEX_SIZE*0.16);
          rec.bubbGfx.lineTo(-HEX_SIZE*0.08, bubY+bh2/2);
          rec.bubbGfx.endFill();
          rec.bubbSpr.x = 0; rec.bubbSpr.y = bubY; rec.bubbSpr.alpha = eAlpha;
        }
      }

      // ── War particles ────────────────────────────────────────
      warGfx.removeChildren(); warGfx.clear();
      if (wars.size > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.005);
        for (const w of wars.values()) {
          const pA = w.particles[w.cidA], pB = w.particles[w.cidB];
          const bothFormed = pA.memberIds.size > 0 && pB.memberIds.size > 0;
          if (bothFormed) {
            const mx = (pA.wx+pB.wx)/2, my = (pA.wy+pB.wy)/2;
            warGfx.lineStyle(2.5/scale, 0xff2020, pulse);
            warGfx.moveTo(pA.wx, pA.wy); warGfx.lineTo(pB.wx, pB.wy);
            const sw = emojiSprite('⚔️', Math.max(10, HEX_SIZE*0.55)); sw.x=mx; sw.y=my; warGfx.addChild(sw);
            if (w.clashing) {
              warGfx.beginFill(0xffcc00, 0.55+0.45*Math.sin(now*0.04));
              warGfx.drawCircle(mx, my, HEX_SIZE*1.4); warGfx.endFill();
              const bs = emojiSprite('💥', Math.max(14, HEX_SIZE*1.1)); bs.x=mx; bs.y=my; warGfx.addChild(bs);
            }
          }
          for (const p of [pA, pB]) {
            if (!p.memberIds.size) continue;
            const ps = emojiSprite('⚔️', Math.max(12, HEX_SIZE*0.9)); ps.x=p.wx; ps.y=p.wy; warGfx.addChild(ps);
            const cs = emojiSprite(`×${p.memberIds.size}`, Math.max(8, HEX_SIZE*0.35), 'bold sans-serif', '#ffffff');
            cs.x=p.wx; cs.y=p.wy+HEX_SIZE; warGfx.addChild(cs);
          }
        }
      }

      // ── Settlement labels (screen-space) ─────────────────────
      labelHitAreas = [];
      let lblIdx = 0;
      uiGfx.clear();
      if (zonesOn) {
        for (const v of villageClustersCache) {
          const sx = v.wx*scale + canvas.width/2  + camX;
          const sy = v.wy*scale + canvas.height/2 + camY;
          if (sx < -140 || sx > canvas.width+140 || sy < -80 || sy > canvas.height+80) continue;

          const tier = settlementTier(v.hexCount);
          const name = zoneNameFor(v.clusterId);
          const era  = ERAS[clusterEras.get(v.clusterId) ?? 0];
          const residents = zonePopMap.get(v.clusterId) || 0;
          const lineH = 17, pillW = 130, pillH = lineH*3+10, pillR = 7;
          const px = sx - pillW/2, py = sy - 72;

          uiGfx.beginFill(0x000000, 0.62);
          uiGfx.drawRoundedRect(px, py, pillW, pillH, pillR);
          uiGfx.endFill();

          const { t1, t2, t3 } = getLbl(lblIdx++);
          t1.visible = t2.visible = t3.visible = true;
          const { pill } = _lblPool[lblIdx-1]; pill.visible = false; // pill drawn in uiGfx instead
          t1.text = `${era.emoji} ${era.name}`; t1.x=sx; t1.y=py+10;
          t2.text = name;                        t2.x=sx; t2.y=py+10+lineH;
          t3.text = `${tier.label}  👤${residents}`; t3.x=sx; t3.y=py+10+lineH*2;

          labelHitAreas.push({ clusterId: v.clusterId, x: px, y: py, w: pillW, h: pillH });
        }
      }
      hideLblsFrom(lblIdx);

      // Commit to WebGL
      app.renderer.render(app.stage);
    }

    // ── Pause / speed controls ────────────────────────────────
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶' : '⏸';
      pauseBtn.classList.toggle('paused', paused);
      if (paused) lastTime = null;
    });
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        simSpeed = parseFloat(btn.dataset.speed);
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (paused) { paused = false; pauseBtn.textContent = '⏸'; pauseBtn.classList.remove('paused'); }
      });
    });

    // ── Zone rename ───────────────────────────────────────────
    const renameInput = document.getElementById('rename-input');
    function showRenameInput(clusterId, x, y, w) {
      renameInput.value = zoneNames.get(clusterId) || '';
      renameInput.style.left  = x + 'px';
      renameInput.style.top   = (y + 24) + 'px';
      renameInput.style.width = w + 'px';
      renameInput.style.display = 'block';
      renameInput.dataset.clusterId = clusterId;
      renameInput.focus();
      renameInput.select();
    }
    function commitRename() {
      const cid = renameInput.dataset.clusterId;
      const val = renameInput.value.trim();
      if (cid && val) {
        const old = zoneNames.get(cid);
        zoneNames.set(cid, val);
        if (old && old !== val) logEvent('rename', `✏️ <b>${old}</b> → <b>${val}</b>`);
      }
      renameInput.style.display = 'none';
      renameInput.dataset.clusterId = '';
    }
    renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commitRename(); e.preventDefault(); }
      if (e.key === 'Escape') { renameInput.style.display = 'none'; }
      e.stopPropagation();
    });
    renameInput.addEventListener('blur', commitRename);
    renameInput.addEventListener('mousedown', (e) => e.stopPropagation());

    // ── Animation loop ────────────────────────────────────────
    function loop(now) {
      if (!paused && lastTime !== null) {
        const dt = Math.min((now - lastTime) / 1000, 0.1) * simSpeed;
        simYear += dt * YEARS_PER_SECOND;
        simTime += dt;
        updateHumans(dt, now);
        yearEl.textContent = `Year ${Math.floor(simYear)}`;
      }
      if (!paused) lastTime = now;
      drawGrid(now);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // ── Main Menu ─────────────────────────────────────────────
    (function setupMainMenu() {
      const menu     = document.getElementById('main-menu');
      const startBtn = document.getElementById('menu-start-btn');
      const mc       = document.getElementById('menu-canvas');
      const mctx     = mc.getContext('2d');

      // Pick a random seed for the background world
      const MENU_SEED = Math.random().toString(36).slice(2, 8);
      applySeed(MENU_SEED);

      const MENU_SCALE = 1;
      const PAN_SPEED  = WW * 1.2; // px/s — rightward drift
      let menuCamX = 0;
      let menuCamY = 0;
      let menuRaf;
      let lastMenuNow = null;
      let menuElapsed = 0; // seconds since menu opened

      // Wave travels outward from world-origin over REVEAL_DUR seconds
      const REVEAL_DUR  = 3.5;

      function resizeMenuCanvas() {
        mc.width  = window.innerWidth;
        mc.height = window.innerHeight;
      }

      // revealAlpha 0 = black hex, 1 = full terrain colour
      function drawMenuHex(cx, cy, terrain, revealAlpha) {
        const corners = hexCorners(cx, cy, HEX_SIZE);
        mctx.beginPath();
        mctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) mctx.lineTo(corners[i].x, corners[i].y);
        mctx.closePath();

        // Terrain fill fades in
        if (revealAlpha > 0) {
          mctx.globalAlpha = revealAlpha;
          mctx.fillStyle = terrain.fill;
          mctx.fill();
          mctx.globalAlpha = 1;
        }

        // Grid lines always visible — they form the "black hexagon" silhouette at start
        mctx.strokeStyle = `rgba(255,255,255,${0.14 + revealAlpha * 0.08})`;
        mctx.lineWidth = 1.2;
        mctx.stroke();

        // Emoji label fades in after fill is mostly visible
        if (revealAlpha > 0.4) {
          mctx.globalAlpha = Math.min(1, (revealAlpha - 0.4) / 0.6);
          mctx.font = `${Math.max(10, HEX_SIZE * 0.55)}px serif`;
          mctx.textAlign = 'center';
          mctx.textBaseline = 'middle';
          mctx.fillText(terrain.label, cx, cy);
          mctx.globalAlpha = 1;
        }
      }

      function drawMenuFrame(now) {
        if (lastMenuNow === null) lastMenuNow = now;
        const dt = Math.min((now - lastMenuNow) / 1000, 0.1);
        lastMenuNow = now;
        menuElapsed += dt;

        menuCamX -= PAN_SPEED * dt;

        // Black canvas — hexagon grid lines drawn on top give the "dark hex" look at start
        mctx.clearRect(0, 0, mc.width, mc.height);
        mctx.fillStyle = '#000';
        mctx.fillRect(0, 0, mc.width, mc.height);

        mctx.save();
        mctx.translate(mc.width / 2 + menuCamX, mc.height / 2 + menuCamY);
        mctx.scale(MENU_SCALE, MENU_SCALE);

        const viewW   = mc.width  / MENU_SCALE;
        const viewH   = mc.height / MENU_SCALE;
        const originX = -mc.width  / 2 / MENU_SCALE - menuCamX / MENU_SCALE;
        const originY = -mc.height / 2 / MENU_SCALE - menuCamY / MENU_SCALE;

        const colStart = Math.floor(originX / WW) - 1;
        const colEnd   = Math.ceil((originX + viewW) / WW) + 1;
        const rowStart = Math.floor(originY / RH) - 1;
        const rowEnd   = Math.ceil((originY + viewH) / RH) + 1;

        // Wave front: distance from world origin that has been revealed so far
        const maxDist  = Math.hypot(viewW, viewH) * 0.9;
        const waveEdge = maxDist * 0.28; // soft leading edge width
        const waveFront = (menuElapsed / REVEAL_DUR) * (maxDist + waveEdge);

        for (let row = rowStart; row < rowEnd; row++) {
          for (let col = colStart; col < colEnd; col++) {
            const { x: cx, y: cy } = hexCenter(row, col);
            const dist = Math.hypot(cx, cy); // distance from world origin
            const t = Math.max(0, Math.min(1, (waveFront - dist) / waveEdge));
            const revealAlpha = t * t * (3 - 2 * t); // smoothstep
            drawMenuHex(cx, cy, terrainFor(row, col), revealAlpha);
          }
        }

        // Dark vignette overlay so menu text stays readable
        mctx.restore();
        const grad = mctx.createRadialGradient(
          mc.width / 2, mc.height / 2, mc.height * 0.15,
          mc.width / 2, mc.height / 2, mc.height * 0.85
        );
        grad.addColorStop(0, 'rgba(0,0,0,0.35)');
        grad.addColorStop(1, 'rgba(0,0,0,0.78)');
        mctx.fillStyle = grad;
        mctx.fillRect(0, 0, mc.width, mc.height);

        menuRaf = requestAnimationFrame(drawMenuFrame);
      }

      resizeMenuCanvas();
      window.addEventListener('resize', resizeMenuCanvas);
      menuRaf = requestAnimationFrame(drawMenuFrame);

      startBtn.addEventListener('click', () => {
        menu.classList.add('hidden');
        cancelAnimationFrame(menuRaf);
        window.removeEventListener('resize', resizeMenuCanvas);
        const panels = document.getElementById('right-panels');
        panels.style.opacity = '1';
        panels.style.pointerEvents = 'auto';
        statsPanel.classList.add('visible');
        // If the user didn't type a seed, use the menu's random seed so the
        // world they see isn't always identical
        if (!seedInput.value.trim()) seedInput.value = MENU_SEED;
        generate();
      });
    })();

    // ── Seed panel ────────────────────────────────────────────
    function generate() {
      simYear = 0;
      simTime = 0;
      statsLog.innerHTML = '';
      applySeed(seedInput.value.trim());
      terrainOverrides.clear();
      camX = 0; camY = 0; scale = 1;
      humans.length = 0;
      humanById.clear();
      buildings.length = 0;
      villageClustersCache = [];
      clusterEras.clear();
      alliances.clear();
      wars.clear();
      zoneNames.clear();
      zoneColors.clear();
      zoneHexes = new Set();
      hexClusterMap = new Map();
      touchingPairsDirty = true;
      zoneRenderDirty = true;
      zoneRenderCache = { hexTierFill: new Map(), hexTierBorder: new Map(), hexRoot: new Map() };
      drawGrid(performance.now());
    }
    seedBtn.addEventListener('click', generate);
    seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });

    // ── Human placement ───────────────────────────────────────
    humanBtn.addEventListener('click', () => {
      placingHuman = !placingHuman;
      humanBtn.classList.toggle('active', placingHuman);
      placeHint.classList.toggle('visible', placingHuman);
      canvas.classList.toggle('placing', placingHuman);
    });

    function cancelPlacing() {
      placingHuman = false;
      humanBtn.classList.remove('active');
      placeHint.classList.remove('visible');
      canvas.classList.remove('placing');
    }

    emotionBtn.addEventListener('click', () => {
      emotionsOn = !emotionsOn;
      emotionBtn.textContent = `Emotions: ${emotionsOn ? 'ON' : 'OFF'}`;
      emotionBtn.style.opacity = emotionsOn ? '1' : '0.5';
    });

    loveBtn.addEventListener('click', () => {
      loveLinesOn = !loveLinesOn;
      loveBtn.textContent = `Love Lines: ${loveLinesOn ? 'ON' : 'OFF'}`;
      loveBtn.style.opacity = loveLinesOn ? '1' : '0.5';
    });

    zoneBtn.addEventListener('click', () => {
      zonesOn = !zonesOn;
      zoneBtn.textContent = `Village Zones: ${zonesOn ? 'ON' : 'OFF'}`;
      zoneBtn.style.opacity = zonesOn ? '1' : '0.5';
    });

    // ── Terraform ─────────────────────────────────────────────
    const terraformBtn    = document.getElementById('terraform-btn');
    const terrainSelector = document.getElementById('terrain-selector');
    let terraformMode = false;
    let selectedTerrainIdx = 2; // default Grass

    function setSelectedTerrain(idx) {
      selectedTerrainIdx = idx;
      document.querySelectorAll('.terrain-opt').forEach((b, i) => {
        b.style.background   = i === idx ? 'rgba(255,255,255,0.28)' : '';
        b.style.borderColor  = i === idx ? 'rgba(255,255,255,0.7)'  : '';
      });
    }
    setSelectedTerrain(2);

    terraformBtn.addEventListener('click', () => {
      terraformMode = !terraformMode;
      terraformBtn.textContent   = terraformMode ? '🖊 Painting…' : '🖊 Paint Terrain';
      terraformBtn.style.background  = terraformMode ? 'rgba(255,200,50,0.22)' : '';
      terraformBtn.style.borderColor = terraformMode ? 'rgba(255,200,50,0.7)'  : '';
      terrainSelector.style.display  = terraformMode ? 'grid' : 'none';
      if (terraformMode) cancelPlacing();
    });

    document.querySelectorAll('.terrain-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => setSelectedTerrain(i));
    });

    function paintTerrain(clientX, clientY) {
      const { row, col } = screenToHex(clientX, clientY);
      const k = (row << 16) ^ col;
      const t = TERRAIN[selectedTerrainIdx];
      terrainOverrides.set(k, t);
      terrainCache.set(k, t);
      recomputeZones();
      zoneRenderDirty = true;
      touchingPairsDirty = true;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cancelPlacing(); if (terraformMode) { terraformMode = false; terraformBtn.textContent = '🖊 Paint Terrain'; terraformBtn.style.background = ''; terraformBtn.style.borderColor = ''; terrainSelector.style.display = 'none'; } } });
    document.getElementById('right-panels').addEventListener('mousedown', (e) => e.stopPropagation());
    statsPanel.addEventListener('mousedown', (e) => e.stopPropagation());

    canvas.addEventListener('click', (e) => {
      if (terraformMode) { paintTerrain(e.clientX, e.clientY); return; }
      if (!placingHuman) {
        for (const hit of labelHitAreas) {
          if (e.clientX >= hit.x && e.clientX <= hit.x + hit.w &&
              e.clientY >= hit.y && e.clientY <= hit.y + hit.h) {
            showRenameInput(hit.clusterId, hit.x, hit.y, hit.w);
            return;
          }
        }
        return;
      }
      const { row, col } = screenToHex(e.clientX, e.clientY);
      const existing = humans.findIndex(h => {
        const atSrc = h.row === row && h.col === col;
        const atDst = h.toRow === row && h.toCol === col && h.t > 0.8;
        return atSrc || atDst;
      });
      if (existing !== -1) {
        humanById.delete(humans[existing].id);
        humans.splice(existing, 1);
      } else if (terrainFor(row, col).walkable) {
        const qty = Math.max(1, parseInt(document.getElementById('human-qty').value) || 1);
        const candidates = [{ row, col }, ...hexNeighbors(row, col).filter(n => terrainFor(n.row, n.col).walkable)];
        for (let q = 0; q < qty; q++) {
          const spot = candidates[q % candidates.length];
          addHuman(spot.row, spot.col, 18);
        }
      }
    });

    // ── Zoom ──────────────────────────────────────────────────
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zf = e.deltaY < 0 ? 1.1 : 0.9;
      const mx = e.clientX - canvas.width/2, my = e.clientY - canvas.height/2;
      const ns = Math.min(10, Math.max(0.1, scale * zf));
      const r  = ns / scale;
      camX = mx + (camX - mx) * r;
      camY = my + (camY - my) * r;
      scale = ns;
    }, { passive: false });

    // ── Pan ───────────────────────────────────────────────────
    let isTerraformDragging = false;
    canvas.addEventListener('mousedown', (e) => {
      if (terraformMode) { isTerraformDragging = true; paintTerrain(e.clientX, e.clientY); return; }
      if (placingHuman) return;
      isDragging = true;
      dragStartX = e.clientX - camX;
      dragStartY = e.clientY - camY;
      canvas.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (isTerraformDragging) { paintTerrain(e.clientX, e.clientY); return; }
      if (isDragging) { camX = e.clientX - dragStartX; camY = e.clientY - dragStartY; return; }
      if (!placingHuman && !terraformMode) {
        const over = labelHitAreas.some(h =>
          e.clientX >= h.x && e.clientX <= h.x + h.w &&
          e.clientY >= h.y && e.clientY <= h.y + h.h);
        canvas.style.cursor = over ? 'text' : '';
      }
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      isTerraformDragging = false;
      canvas.classList.remove('dragging');
    });

    // ── Touch ─────────────────────────────────────────────────
    let lastTouchDist = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        dragStartX = e.touches[0].clientX - camX;
        dragStartY = e.touches[0].clientY - camY;
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        camX = e.touches[0].clientX - dragStartX;
        camY = e.touches[0].clientY - dragStartY;
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - canvas.width/2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - canvas.height/2;
        const ns = Math.min(10, Math.max(0.1, scale * dist / lastTouchDist));
        const r  = ns / scale;
        camX = midX + (camX - midX) * r;
        camY = midY + (camY - midY) * r;
        scale = ns;
        lastTouchDist = dist;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { isDragging = false; lastTouchDist = null; });

    window.addEventListener('resize', () => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    });
