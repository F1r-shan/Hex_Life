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
