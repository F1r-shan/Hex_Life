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
    // Human rendering — split into 4 layers so each is a tight ParticleContainer
    // shadowPCtr: ONE shared texture → ParticleContainer is safe and fast here
    const shadowPCtr    = new PIXI.ParticleContainer(3000, { vertices: true, position: true, alpha: true });
    // humanPCtr / badgePCtr: many different textures → ParticleContainer only binds one base texture
    // so these must stay as regular Containers; pre-baked textures still give the big speedup
    const humanPCtr     = new PIXI.Container();
    const badgePCtr     = new PIXI.Container();
    const bubbleCtr     = new PIXI.Container();                         // speech bubbles (regular; few visible)
    const warGfx        = new PIXI.Graphics(); // war lines + particles
    worldCtr.addChild(terrainGfx, terrainEmoCtr, zoneFillGfx, zoneBorderGfx,
                      buildCtr, loveGfx, sparkleCtr,
                      shadowPCtr, humanPCtr, badgePCtr, bubbleCtr, warGfx);

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
    // Shadow: one shared RenderTexture (black ellipse, alpha controlled per-sprite)
    const SHADOW_TEX = (() => {
      const g = new PIXI.Graphics();
      g.beginFill(0x000000, 1);
      g.drawEllipse(0, 0, HEX_SIZE * 0.22, HEX_SIZE * 0.09);
      g.endFill();
      const t = app.renderer.generateTexture(g, PIXI.SCALE_MODES.LINEAR, 1);
      g.destroy(); return t;
    })();

    // Badge: pre-baked rounded-pill + text, cached by "gender[0]+ageInt" (max ~200 entries)
    const _badgeTexCache = new Map();
    function getBadgeTex(gender, ageInt) {
      const key = gender[0] + ageInt;
      if (_badgeTexCache.has(key)) return _badgeTexCache.get(key);
      const badgeFs = Math.max(6, HEX_SIZE * 0.22);
      const gSym    = gender === 'female' ? '♀' : '♂';
      const ageText = gSym + ageInt;
      const badgeW  = badgeFs * (ageText.length * 0.72 + 0.6);
      const badgeH  = badgeFs * 1.4;
      const ratio   = ageInt / MAX_AGE, isFem = gender === 'female';
      const cr = Math.round(lerp(isFem?200:60,  220, ratio));
      const cg = Math.round(lerp(isFem?100:140, 50,  ratio));
      const cb = Math.round(lerp(isFem?160:220, 50,  ratio));
      const bg = new PIXI.Graphics();
      bg.beginFill(((cr<<16)|(cg<<8)|cb) >>> 0, 1);
      bg.drawRoundedRect(0, 0, badgeW, badgeH, badgeH / 2);
      bg.endFill();
      const ts = new PIXI.Sprite(emojiTex(ageText, badgeFs, 'bold sans-serif', '#ffffff'));
      ts.anchor.set(0.5); ts.x = badgeW / 2; ts.y = badgeH / 2;
      ts.width = ts.height = badgeFs * 1.2;
      const wrap = new PIXI.Container(); wrap.addChild(bg, ts);
      const tex = app.renderer.generateTexture(wrap, PIXI.SCALE_MODES.LINEAR, 1,
        new PIXI.Rectangle(0, 0, badgeW, badgeH));
      wrap.destroy({ children: true });
      _badgeTexCache.set(key, { tex, badgeW, badgeH }); return _badgeTexCache.get(key);
    }

    // Bubble: pre-baked rounded rect + tail + emotion content, cached by emotion string (~20 entries)
    const _bubTexCache = new Map();
    function getBubbleTex(emotion) {
      if (_bubTexCache.has(emotion)) return _bubTexCache.get(emotion);
      const isEmo   = /\p{Emoji}/u.test(emotion) && emotion.length <= 2;
      const efs     = isEmo ? Math.max(10, HEX_SIZE*0.48) : Math.max(8, HEX_SIZE*0.28);
      const pad     = HEX_SIZE * 0.13;
      const textTex = emojiTex(emotion, efs, isEmo ? 'serif' : 'sans-serif', isEmo ? null : '#222222');
      const contH   = efs * 1.4;
      const contW   = contH * (textTex.width / textTex.height);
      const bw      = contW + pad * 2;
      const bh      = efs  + pad * 1.4;
      const tailH   = HEX_SIZE * 0.16;
      const totalH  = bh + tailH;
      const bg = new PIXI.Graphics();
      bg.beginFill(0xffffff, 0.92);
      bg.lineStyle(0.8, 0x000000, 0.15);
      bg.drawRoundedRect(0, 0, bw, bh, bh / 2);
      bg.moveTo(bw/2 + HEX_SIZE*0.08, bh);
      bg.lineTo(bw/2,                  bh + tailH);
      bg.lineTo(bw/2 - HEX_SIZE*0.08, bh);
      bg.endFill();
      const ts = new PIXI.Sprite(textTex);
      ts.anchor.set(0.5); ts.x = bw/2; ts.y = bh/2; ts.width = contW; ts.height = contH;
      const wrap = new PIXI.Container(); wrap.addChild(bg, ts);
      const tex = app.renderer.generateTexture(wrap, PIXI.SCALE_MODES.LINEAR, 1,
        new PIXI.Rectangle(0, 0, bw, totalH));
      wrap.destroy({ children: true });
      _bubTexCache.set(emotion, { tex, bw, bh, totalH }); return _bubTexCache.get(emotion);
    }

    // Pool: id → { shadowSpr, humanSpr, badgeSpr, bubSpr, _c }
    const _hPool = new Map();
    function ensureHuman(h) {
      if (_hPool.has(h.id)) return _hPool.get(h.id);
      const shadowSpr = new PIXI.Sprite(SHADOW_TEX); shadowSpr.anchor.set(0.5);
      shadowPCtr.addChild(shadowSpr);
      const humanSpr = new PIXI.Sprite(PIXI.Texture.EMPTY); humanSpr.anchor.set(0.5);
      humanPCtr.addChild(humanSpr);
      const badgeSpr = new PIXI.Sprite(PIXI.Texture.EMPTY); badgeSpr.anchor.set(0.5);
      badgePCtr.addChild(badgeSpr);
      const bubSpr = new PIXI.Sprite(PIXI.Texture.EMPTY); bubSpr.anchor.set(0.5, 0);
      bubbleCtr.addChild(bubSpr);
      const rec = { shadowSpr, humanSpr, badgeSpr, bubSpr, _c: { emoji: '', age: -1, emo: '' } };
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

      // LOD: hide individuals when zoomed out too far
      const showHumans = scale >= 0.35;

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
        if (zoneRenderDirty && !buildings.length) {
          villageClustersCache = [];
          zoneFillGfx.clear();
          _tierEdges = new Map(); _zoneBorders = [];
          zoneRenderDirty = false;
        }
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
      if (loveLinesOn && showHumans) {
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
      if (showHumans) for (const h of humans) {
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
      // Remove sprites for humans that have been deleted (always run)
      for (const [id, rec] of _hPool) {
        if (!humanById.has(id)) {
          shadowPCtr.removeChild(rec.shadowSpr);
          humanPCtr.removeChild(rec.humanSpr);
          badgePCtr.removeChild(rec.badgeSpr);
          bubbleCtr.removeChild(rec.bubSpr);
          _hPool.delete(id);
        }
      }
      shadowPCtr.visible = humanPCtr.visible = badgePCtr.visible = bubbleCtr.visible = sparkleCtr.visible = showHumans;
      const fs = Math.max(10, HEX_SIZE * 0.58);
      if (showHumans) for (const h of humans) {
        if (h.warGrouped) {
          if (_hPool.has(h.id)) {
            const r = _hPool.get(h.id);
            r.shadowSpr.visible = r.humanSpr.visible = r.badgeSpr.visible = r.bubSpr.visible = false;
          }
          continue;
        }
        const rec   = ensureHuman(h);
        const alpha = h.dyingAlpha ?? 1;
        const bob   = h.t < 1 ? Math.abs(Math.sin(now * 0.008)) * HEX_SIZE * (h.age >= 60 ? 0.06 : 0.12) : 0;

        // Shadow — static pre-baked texture, just reposition each frame
        rec.shadowSpr.visible = true;
        rec.shadowSpr.x = h.wx;
        rec.shadowSpr.y = h.wy + HEX_SIZE * 0.25;
        rec.shadowSpr.alpha = alpha * 0.35;

        // Human emoji — texture cached; update only when life-stage changes
        const humanEmoji = emojiForAge(h.age, h.gender);
        if (rec._c.emoji !== humanEmoji) {
          rec.humanSpr.texture = emojiTex(humanEmoji, fs);
          rec.humanSpr.width = rec.humanSpr.height = fs * 1.4;
          rec._c.emoji = humanEmoji;
        }
        rec.humanSpr.visible = true;
        rec.humanSpr.x = h.wx;
        rec.humanSpr.y = h.wy - HEX_SIZE * 0.08 - bob;
        rec.humanSpr.alpha = alpha;

        // Age/gender badge — pre-baked texture; update only when age integer changes
        const ageInt = Math.floor(h.age);
        if (rec._c.age !== ageInt) {
          const bd = getBadgeTex(h.gender, ageInt);
          rec.badgeSpr.texture = bd.tex;
          rec.badgeSpr.width   = bd.badgeW;
          rec.badgeSpr.height  = bd.badgeH;
          rec._c.age = ageInt;
        }
        rec.badgeSpr.visible = true;
        rec.badgeSpr.x = h.wx + HEX_SIZE * 0.22;
        rec.badgeSpr.y = h.wy - HEX_SIZE * 0.38 - bob;
        rec.badgeSpr.alpha = alpha;

        // Emotion bubble — pre-baked texture; alpha fade on sprite, no per-frame Graphics
        const eAge   = now - h.emotionAt;
        const fadeMs = 600;
        let eAlpha   = eAge < fadeMs ? eAge / fadeMs
                     : eAge > EMOTION_INTERVAL - fadeMs ? (EMOTION_INTERVAL - eAge) / fadeMs : 1;
        eAlpha = Math.max(0, Math.min(1, eAlpha));
        const showBubble = emotionsOn && eAlpha > 0.01;
        if (showBubble) {
          const bd = getBubbleTex(h.emotion); // O(1) cache lookup
          if (rec._c.emo !== h.emotion) {
            rec.bubSpr.texture = bd.tex;
            rec.bubSpr.width   = bd.bw;
            rec.bubSpr.height  = bd.totalH;
            rec._c.emo = h.emotion;
          }
          rec.bubSpr.visible = true;
          rec.bubSpr.x     = h.wx;
          rec.bubSpr.y     = h.wy - HEX_SIZE * 0.82 - bob - bd.bh / 2; // anchor(0.5,0) = top-center
          rec.bubSpr.alpha = eAlpha * alpha;
        } else {
          rec.bubSpr.visible = false;
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
