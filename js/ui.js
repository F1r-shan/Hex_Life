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

      function _onMenuResize() { resizeMenuCanvas(); }
      function _onMenuOrientation() { setTimeout(resizeMenuCanvas, 300); }
      resizeMenuCanvas();
      window.addEventListener('resize', _onMenuResize);
      window.addEventListener('orientationchange', _onMenuOrientation);
      menuRaf = requestAnimationFrame(drawMenuFrame);

      startBtn.addEventListener('click', () => {
        menu.classList.add('hidden');
        cancelAnimationFrame(menuRaf);
        window.removeEventListener('resize', _onMenuResize);
        window.removeEventListener('orientationchange', _onMenuOrientation);
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
      zoneFoundedYear.clear();
      zoneHexes = new Set();
      hexClusterMap = new Map();
      terrainUndoStack.length = 0;
      touchingPairsDirty = true;
      zoneRenderDirty = true;
      zoneRenderCache = { hexTierFill: new Map(), hexTierBorder: new Map(), hexRoot: new Map() };
      lastTime = null;
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
    const terraformUndoBtn = document.getElementById('terraform-undo-btn');
    let terraformMode = false;
    let selectedTerrainIdx = 2; // default Grass
    const terrainUndoStack = [];
    const MAX_UNDO = 60;

    function undoTerrain() {
      if (!terrainUndoStack.length) return;
      const { k, hadOverride, prev } = terrainUndoStack.pop();
      terrainCache.delete(k);
      if (hadOverride) terrainOverrides.set(k, prev);
      else terrainOverrides.delete(k);
      recomputeZones();
      zoneRenderDirty = true;
      touchingPairsDirty = true;
      terraformUndoBtn.style.opacity = terrainUndoStack.length ? '1' : '0.4';
    }

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
      terraformUndoBtn.style.display = terraformMode ? 'block' : 'none';
      if (terraformMode) cancelPlacing();
    });
    terraformUndoBtn.addEventListener('click', undoTerrain);

    document.querySelectorAll('.terrain-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => setSelectedTerrain(i));
    });

    function paintTerrain(clientX, clientY) {
      const { row, col } = screenToHex(clientX, clientY);
      const k = (row << 16) ^ col;
      terrainUndoStack.push({ k, hadOverride: terrainOverrides.has(k), prev: terrainOverrides.get(k) });
      if (terrainUndoStack.length > MAX_UNDO) terrainUndoStack.shift();
      const t = TERRAIN[selectedTerrainIdx];
      terrainOverrides.set(k, t);
      terrainCache.set(k, t);
      recomputeZones();
      zoneRenderDirty = true;
      touchingPairsDirty = true;
      terraformUndoBtn.style.opacity = '1';
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelPlacing();
        document.getElementById('zone-stats-popup').style.display = 'none'; _zspClusterId = null;
        if (terraformMode) {
          terraformMode = false;
          terraformBtn.textContent = '🖊 Paint Terrain';
          terraformBtn.style.background = ''; terraformBtn.style.borderColor = '';
          terrainSelector.style.display = 'none';
          terraformUndoBtn.style.display = 'none';
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ')) { e.preventDefault(); undoTerrain(); }
    });
    document.getElementById('right-panels').addEventListener('mousedown', (e) => e.stopPropagation());
    statsPanel.addEventListener('mousedown', (e) => e.stopPropagation());
    document.getElementById('zone-stats-popup').addEventListener('mousedown', (e) => e.stopPropagation());

    canvas.addEventListener('click', (e) => {
      if (terraformMode) { paintTerrain(e.clientX, e.clientY); return; }
      if (!placingHuman) {
        for (const hit of labelHitAreas) {
          if (e.clientX >= hit.x && e.clientX <= hit.x + hit.w &&
              e.clientY >= hit.y && e.clientY <= hit.y + hit.h) {
            showZoneStats(hit.clusterId, hit.x, hit.y, hit.w);
            return;
          }
        }
        document.getElementById('zone-stats-popup').style.display = 'none'; _zspClusterId = null;
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
        if (!lastTouchDist) { lastTouchDist = dist; return; }
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

    function _resizeRenderer() {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', _resizeRenderer);
    window.addEventListener('orientationchange', () => setTimeout(_resizeRenderer, 300));

    // ── Zone stats popup ─────────────────────────────────────
    let _zspClusterId = null;

    function _zspDiplomacy(clusterId) {
      for (const w of wars.values()) {
        if (w.cidA === clusterId || w.cidB === clusterId) {
          const enemy = w.cidA === clusterId ? w.cidB : w.cidA;
          return `⚔️ At war with <b>${zoneNameFor(enemy)}</b>`;
        }
      }
      for (const al of alliances.values()) {
        if (al.cidA === clusterId || al.cidB === clusterId) {
          const ally = al.cidA === clusterId ? al.cidB : al.cidA;
          return `🤝 Allied with <b>${zoneNameFor(ally)}</b>`;
        }
      }
      return '';
    }

    function _zspRefresh() {
      const popup = document.getElementById('zone-stats-popup');
      if (!_zspClusterId || popup.style.display === 'none') { _zspClusterId = null; return; }

      const cid  = _zspClusterId;
      const era  = ERAS[clusterEras.get(cid) ?? 0];
      const vc   = villageClustersCache.find(v => v.clusterId === cid);
      const tier = settlementTier(vc ? vc.hexCount : 0);
      const pop  = zonePopMap.get(cid) || 0;
      const maxGen = humans.reduce((m, h) => h.zoneId === cid ? Math.max(m, h.generation || 0) : m, 0);
      const diplo = _zspDiplomacy(cid);

      const eraEl   = popup.querySelector('.zsp-live-era');
      const popEl   = popup.querySelector('.zsp-live-pop');
      const genEl   = popup.querySelector('.zsp-live-gen');
      const diploEl = popup.querySelector('.zsp-live-diplo');

      if (eraEl)   eraEl.textContent = `${era.emoji} ${era.name} · ${tier.label}`;
      if (popEl)   popEl.textContent = `👤 ${pop} resident${pop !== 1 ? 's' : ''}`;
      if (genEl) {
        genEl.textContent = maxGen > 0 ? `🌱 Generation ${maxGen}` : '';
        genEl.style.display = maxGen > 0 ? '' : 'none';
      }
      if (diploEl) {
        diploEl.innerHTML = diplo;
        diploEl.style.display = diplo ? '' : 'none';
      }

      requestAnimationFrame(_zspRefresh);
    }

    function showZoneStats(clusterId, px, py, pw) {
      const popup = document.getElementById('zone-stats-popup');
      const name      = zoneNameFor(clusterId);
      const foundedYr = zoneFoundedYear.get(clusterId);

      popup.innerHTML = `
        <div class="zsp-header">
          <span class="zsp-name">${name}</span>
          <button id="zsp-close">✕</button>
        </div>
        <div class="zsp-row zsp-live-era"></div>
        <div class="zsp-row zsp-live-pop"></div>
        ${foundedYr !== undefined ? `<div class="zsp-row">📅 Founded year ${foundedYr}</div>` : ''}
        <div class="zsp-row zsp-live-gen" style="display:none"></div>
        <div class="zsp-row zsp-diplo zsp-live-diplo" style="display:none"></div>
        <div class="zsp-actions"><button id="zsp-rename">✏ Rename</button></div>
      `;

      const vw = window.innerWidth;
      const popW = 200;
      let left = px, top = py - 148;
      if (left + popW > vw - 8) left = vw - popW - 8;
      if (left < 8) left = 8;
      if (top < 8) top = py + 36;
      popup.style.left = left + 'px';
      popup.style.top  = top + 'px';
      popup.style.display = 'block';

      document.getElementById('zsp-close').onclick  = () => { popup.style.display = 'none'; _zspClusterId = null; };
      document.getElementById('zsp-rename').onclick = () => {
        popup.style.display = 'none'; _zspClusterId = null;
        showRenameInput(clusterId, px, py, pw);
      };

      const wasRunning = _zspClusterId !== null;
      _zspClusterId = clusterId;
      if (!wasRunning) requestAnimationFrame(_zspRefresh);
    }

    // ── Panel toggle ─────────────────────────────────────────
    (function setupPanelToggle() {
      const toggle = document.getElementById('panel-toggle');
      const body   = document.getElementById('seed-panel-body');
      const isMobile = () => window.matchMedia('(max-width:700px),(max-height:500px)').matches;

      function setCollapsed(collapsed) {
        body.classList.toggle('collapsed', collapsed);
        toggle.textContent = collapsed ? '▸' : '▾';
      }

      if (isMobile()) setCollapsed(true);

      toggle.addEventListener('click', () => setCollapsed(!body.classList.contains('collapsed')));

      window.addEventListener('resize', () => {
        if (isMobile() && !body.classList.contains('collapsed')) setCollapsed(true);
      }, { passive: true });
    })();

    // ── Help modal ────────────────────────────────────────────
    (function setupHelp() {
      const modal    = document.getElementById('help-modal');
      const openBtn  = document.getElementById('menu-help-btn');
      const closeBtn = document.getElementById('help-close-btn');
      openBtn.addEventListener('click',  () => modal.classList.remove('hidden'));
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

      // Swap controls table for touch devices
      if (window.matchMedia('(pointer: coarse)').matches) {
        document.getElementById('help-zoom-key').textContent  = '2-finger pinch';
        document.getElementById('help-pan-key').textContent   = '1-finger drag';
        document.getElementById('help-label-key').textContent = 'Tap a label';
        const escRow  = document.getElementById('help-esc-row');
        const undoRow = document.getElementById('help-undo-row');
        escRow.cells[0].textContent  = 'Esc / back button';
        undoRow.cells[0].textContent = 'Undo (Ctrl+Z)';
      }
    })();
