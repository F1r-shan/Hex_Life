
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

