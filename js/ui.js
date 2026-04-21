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

    window.addEventListener('resize', () => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
    });

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
    })();
