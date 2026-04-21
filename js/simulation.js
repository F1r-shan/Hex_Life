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
          for (const [, w] of [...wars]) {
            if (!buildings.some(b => b.clusterId === w.cidA) ||
                !buildings.some(b => b.clusterId === w.cidB)) endWar(w.cidA, w.cidB);
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
