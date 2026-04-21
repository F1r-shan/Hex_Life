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
