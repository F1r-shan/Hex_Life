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
