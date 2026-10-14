// ============================================================
//  Simulation: economy, population, research, forge, raids,
//  campaigns. All rates are "per day"; dt is in days.
// ============================================================

const Sim = (() => {
  let dayMark = 0;

  function tick(dt) {
    if (G.won || G.lost) return;
    G.time += dt;
    construction(dt);
    staffing();
    production(dt);
    finances(dt);
    population(dt);
    research(dt);
    forge(dt);
    expeditions(dt);
    campaigns(dt);
    raids(dt);
    marketDrift(dt);
    kingdomGrowth(dt);
    if (Math.floor(G.time) !== dayMark) { dayMark = Math.floor(G.time); newDay(); }
  }

  function construction(dt) {
    for (const b of G.buildings) {
      if (b.built < 1) {
        b.built = Math.min(1, b.built + dt / BUILDINGS[b.type].buildDays);
        if (b.built >= 1) {
          if (b.type === 'house') G.stats.housesBuilt++;
          b.born = performance.now();
        }
      } else if (b.upg !== undefined) {
        b.upg += dt / ((BUILDINGS[b.type].buildDays || 1) * 1.5);
        if (b.upg >= 1) {
          delete b.upg;
          b.level++;
          b.born = performance.now();
          log(`${BUILDINGS[b.type].name} ${TIER_NAMES[b.level]}`, 'good', 'up');
        }
      }
    }
  }

  function staffing() {
    let avail = availableWorkers();
    const order = { farm: 0, lumber: 1, quarry: 2, mine: 3, stables: 5 };
    const rank = b => order[b.type] ?? 4;   // refineries come after raw producers
    const list = G.buildings.filter(b => BUILDINGS[b.type].workers)
      .sort((a, b) => (rank(a) - rank(b)) || (a.id - b.id));
    for (const b of list) {
      if (b.built < 1 || b.paused) { b.workers = 0; continue; }
      const slots = BUILDINGS[b.type].workers[b.level - 1];
      b.workers = Math.min(slots, avail);
      avail -= b.workers;
    }
  }

  function efficiency() { return 1; }

  function production(dt) {
    const eff = efficiency();
    const gather = has('tools') ? 1.25 : 1;
    for (const b of G.buildings) {
      if (b.built < 1 || !b.workers) { b.active = false; continue; }
      const def = BUILDINGS[b.type];
      b.active = true;
      if (def.produces) {
        let rate = def.rate[b.level - 1] * b.workers * eff;
        if (b.type === 'farm') rate *= (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
        if (b.type === 'lumber' || b.type === 'quarry' || b.type === 'mine') rate *= gather;
        if (b.type === 'mine' && has('deepMining')) rate *= 1.5;
        if (b.type === 'stables' && has('husbandry')) rate *= 1.5;
        let amount = rate * dt;
        if (def.consumes) {
          const fCost = def.consumes.food * amount;
          if (G.res.food < fCost) { b.active = false; continue; }
          G.res.food -= fCost;
        }
        const key = def.produces === 'ore' ? b.ore : def.produces;
        addRes(key, amount);
        if (key === 'wood') G.stats.woodGathered += amount;
      } else if (def.refinery) {
        const r = RECIPES[def.recipe];
        const pct = (b.pct ?? 100) / 100;     // player-chosen share of capacity
        if (pct <= 0) { b.active = false; continue; }
        const speed = refinerySpeed(b) * pct * eff;
        if (b.prog <= 0) {
          // need inputs to start a batch
          if (!canAfford(r.in)) { b.active = false; b.starved = true; continue; }
          pay(r.in);
          b.prog = 1e-6;
        }
        b.starved = false;
        b.prog += dt * speed / r.time;
        while (b.prog >= 1) {
          for (const k in r.out) addRes(k, r.out[k]);
          b.prog -= 1;
          if (b.prog > 0) {
            if (canAfford(r.in)) pay(r.in); else { b.prog = 0; break; }
          }
        }
      }
    }
  }

  // full-capacity speed of a refinery (batches scale with staffing)
  function refinerySpeed(b) {
    const def = BUILDINGS[b.type];
    const staff = (b.workers || 0) / def.workers[b.level - 1];
    return REFINERY_SPEED[b.level - 1] * (has('bellows') ? 1.25 : 1) * staff;
  }
  function foodPerDay() {
    let prod = 0;
    for (const b of G.buildings) if (b.type === 'farm' && b.workers) {
      prod += BUILDINGS.farm.rate[b.level - 1] * b.workers * efficiency() * (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
    }
    return { prod, use: G.pop * FOOD_PER_PERSON };
  }

  function finances(dt) {
    // no wages and no passive income: coins only change through trade, loot and spending
    G.res.food -= G.pop * FOOD_PER_PERSON * dt;
    if (G.res.food < 0) G.res.food = 0;
  }

  function population(dt) {
    const cap = housingCapacity();
    const fed = G.res.food > 0.5;
    if (fed && G.pop < cap) {
      // free housing attracts settlers
      G.popAcc += ((cap - G.pop) * 0.35 + 0.5) * dt;
    } else if (!fed) {
      G.popAcc -= G.pop * 0.04 * dt;
    }
    if (G.pop > cap) G.popAcc -= (G.pop - cap) * 0.15 * dt;
    if (G.popAcc >= 1) {
      const n = Math.min(Math.floor(G.popAcc), Math.max(0, cap - G.pop));
      G.pop += n; G.popAcc -= Math.floor(G.popAcc);
      if (n > 0) UI.floatText(`+${n}`);
    } else if (G.popAcc <= -1) {
      const n = Math.floor(-G.popAcc);
      G.popAcc += n;
      removePeople(n);
      if (!fed) log(`−${n} · no food`, 'bad', 'food');
    }
    if (G.pop < 15 && !G.lost) {
      G.lost = true;
      UI.gameOver(false);
    }
  }
  // Remove civilians first, then soldiers at home
  function removePeople(n) {
    const civ = Math.max(0, availableWorkers());
    let fromCiv = Math.min(n, civ);
    G.pop -= fromCiv; n -= fromCiv;
    while (n > 0 && soldiersAtHome() > 0) {
      const k = Object.keys(G.army).find(k => G.army[k] > 0);
      G.army[k]--; if (!G.army[k]) delete G.army[k];
      G.pop--; n--;
    }
  }

  function research(dt) {
    if (!G.research) return;
    const f = findBuilding('forge');
    G.research.prog += dt * BUILDINGS.forge.speed[f.level - 1];
    const t = TECHS[G.research.id];
    if (G.research.prog >= t.days) {
      G.techs[G.research.id] = true;
      G.stats.researched++;
      log(techName(G.research.id), 'good', 'tech');
      G.research = null;
    }
  }

  function forge(dt) {
    const q = G.forgeQueue[0];
    if (!q) return;
    const f = findBuilding('forge');
    q.prog += dt * BUILDINGS.forge.speed[f.level - 1] / WEAPONS[q.w].time;
    while (q.prog >= 1 && q.n > 0) {
      q.prog -= 1; q.n--;
      G.weapons[q.w] = (G.weapons[q.w] || 0) + 1;
      G.stats.weaponsForged++;
    }
    if (q.n <= 0) {
      G.forgeQueue.shift();
      log(`${WEAPONS[q.w].name}`, 'good', 'anvil');
    }
  }

  function expBonus() {
    return (has('tools') ? 1.25 : 1) * BUILDINGS.townhall.expBonus[findBuilding('townhall').level - 1];
  }
  function expSlots() { return BUILDINGS.townhall.expSlots[findBuilding('townhall').level - 1]; }
  function expeditions(dt) {
    const mult = expBonus();
    for (const e of G.expeditions) e.t -= dt;
    const done = G.expeditions.filter(e => e.t <= 0);
    G.expeditions = G.expeditions.filter(e => e.t > 0);
    for (const e of done) {
      const y = EXPEDITIONS[e.type].yield;
      const got = {};
      for (const k in y) {
        const n = Math.round(y[k] * e.people * mult * (0.9 + Math.random() * 0.2));
        if (k === 'wood' && e.people >= 50 && G.stats.woodGathered < 100) got[k] = Math.max(n, 100);   // story beat
        else got[k] = n;
        addRes(k, got[k]);
        if (k === 'wood') G.stats.woodGathered += got[k];
      }
      log(Object.entries(got).map(([k, n]) => `${resIc(k)}+${n}`).join(' '), 'good', 'compass');
    }
  }

  function startExpedition(type, people) {
    people = Math.floor(people);
    if (people < 1 || people > availableWorkers()) return false;
    if (G.expeditions.length >= expSlots()) return false;
    const d = EXPEDITIONS[type].days;
    G.expeditions.push({ id: G.nextId++, type, people, t: d, total: d });
    return true;
  }

  // ---------------- Military ----------------
  function playerSide(units, defending) {
    const b = armyBonuses();
    const side = { name: 'Your army', units, atkMult: b.atk, armorAdd: b.armor, extraVolleys: b.extraVolleys, dmgTaken: 1, towers: 0 };
    if (defending) {
      side.name = 'Your defenders';
      side.dmgTaken = has('stoneWalls') ? 0.75 : has('palisade') ? 0.9 : 1;
      side.towers = G.buildings.filter(x => x.type === 'watchtower' && x.built >= 1).reduce((s, x) => s + 12 * x.level, 0);
    }
    return side;
  }
  function kingdomSide(id, units, defending) {
    const idx = KINGDOMS.findIndex(k => k.id === id);
    const def = KINGDOMS[idx];
    return {
      name: def.name, units,
      atkMult: 1 + idx * 0.04 + Math.min(0.15, G.time * 0.0015), armorAdd: Math.floor(idx / 2),
      dmgTaken: defending ? 0.9 : 1, towers: defending ? 6 * (idx + 1) : 0,
    };
  }
  function militiaCount() { return Math.min(60, Math.floor(availableWorkers() * 0.3)); }
  function defenders() {
    const u = { ...G.army };
    const m = militiaCount();
    if (m > 0) u.militia = m;
    return u;
  }

  function recruit(w, n) {
    n = Math.min(n, G.weapons[w] || 0, availableWorkers(), armyCapacity() - totalSoldiers(), Math.floor(G.coins / RECRUIT_COST));
    if (n <= 0) return 0;
    G.weapons[w] -= n; if (!G.weapons[w]) delete G.weapons[w];
    G.army[w] = (G.army[w] || 0) + n;
    G.coins -= n * RECRUIT_COST;
    G.stats.recruited += n;
    return n;
  }
  function disband(w, n) {
    n = Math.min(n, G.army[w] || 0);
    if (n <= 0) return;
    G.army[w] -= n; if (!G.army[w]) delete G.army[w];
    G.weapons[w] = (G.weapons[w] || 0) + n;
  }

  function marchDays(id) { return kingdomDef(id).dist * (has('logistics') ? 0.65 : 1); }

  function launchCampaign(target, units) {
    const sent = {};
    for (const k in units) {
      const n = Math.min(Math.floor(units[k]), G.army[k] || 0);
      if (n > 0) { sent[k] = n; G.army[k] -= n; if (!G.army[k]) delete G.army[k]; }
    }
    if (!unitCount(sent)) return false;
    const d = marchDays(target);
    G.campaigns.push({ id: G.nextId++, target, units: sent, phase: 'march', t: d, total: d });
    log(`${kingdomDef(target).name}`, 'warn', 'flag');
    return true;
  }

  function campaigns(dt) {
    for (const c of [...G.campaigns]) {
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.phase === 'march') {
        const ks = kingdomState(c.target), kd = kingdomDef(c.target);
        if (ks.conquered) { c.phase = 'return'; c.t = c.total; continue; }
        const res = Combat.simulate(playerSide(c.units, false), kingdomSide(c.target, roundUnits(ks.garrison), true));
        // apply losses
        c.units = cleanUnits(res.A.end);
        for (const k in res.D.lost) ks.garrison[k] = Math.max(0, (ks.garrison[k] || 0) - res.D.lost[k]);
        G.pop -= unitCount(res.A.lost);
        const won = res.winner === 'A';
        if (won) {
          ks.conquered = true;
          G.stats.conquered++;
          refund(kd.loot);
          G.territory = Math.min(MAX_TERRITORY, G.territory + kd.land);
          Render.terrainDirty = true;
          if (G.kingdoms.every(k => k.conquered)) G.won = true;
        }
        c.phase = 'return'; c.t = c.total;
        if (!unitCount(c.units)) G.campaigns = G.campaigns.filter(x => x !== c);
        Battle.play({ res, playerSide: 'A', enemy: kd, setting: 'castle', won, loot: won ? kd.loot : null,
          after: () => { if (G.won) UI.gameOver(true); } });
      } else {
        for (const k in c.units) G.army[k] = (G.army[k] || 0) + c.units[k];
        G.campaigns = G.campaigns.filter(x => x !== c);
        log(`+${unitCount(c.units)}`, 'info', 'flag');
      }
    }
  }
  function roundUnits(u) { const o = {}; for (const k in u) if (Math.round(u[k]) > 0) o[k] = Math.round(u[k]); return o; }
  function cleanUnits(u) { const o = {}; for (const k in u) if (u[k] > 0 && k !== 'militia') o[k] = u[k]; return o; }

  function raidSource() {
    const open = G.kingdoms.filter(k => !k.conquered).map(k => KINGDOMS.findIndex(d => d.id === k.id)).sort((a, b) => a - b);
    if (!open.length) return null;
    // the first raid always comes from the weakest neighbour
    const pick = G.raid.count === 0 ? open[0] : open[Math.floor(Math.random() * Math.min(2, open.length))];
    return KINGDOMS[pick].id;
  }

  function raids(dt) {
    const r = G.raid;
    if (!r.incoming && G.time >= r.next - 3) {
      const src = raidSource();
      if (!src) return;
      const ks = kingdomState(src);
      const frac = Math.min(0.55, 0.25 + G.time * 0.004 + r.count * 0.03);
      const units = {};
      for (const k in ks.garrison) { const n = Math.round(ks.garrison[k] * frac); if (n > 0) units[k] = n; }
      r.incoming = { from: src, units, eta: r.next };
      log(`${unitCount(units)}`, 'bad', 'warn');
      UI.renderAlert();
    }
    if (r.incoming && G.time >= r.incoming.eta) {
      const inc = r.incoming;
      r.incoming = null;
      r.count++;
      r.next = G.time + 9 + Math.random() * 6;
      resolveRaid(inc);
    }
  }

  function resolveRaid(inc) {
    const kd = kingdomDef(inc.from);
    const def = defenders();
    const res = Combat.simulate(kingdomSide(inc.from, inc.units, false), playerSide(def, true));
    // our losses
    for (const k in res.D.lost) {
      if (k === 'militia') { G.pop -= res.D.lost[k]; continue; }
      G.army[k] -= res.D.lost[k]; if (G.army[k] <= 0) delete G.army[k];
      G.pop -= res.D.lost[k];
    }
    // their losses weaken their garrison
    const ks = kingdomState(inc.from);
    for (const k in res.A.lost) ks.garrison[k] = Math.max(0, (ks.garrison[k] || 0) - res.A.lost[k]);
    const won = res.winner === 'D';
    const out = { res, playerSide: 'D', enemy: kd, setting: 'town', won };
    if (won) {
      G.stats.raidsRepelled++;
      const loot = Math.round(30 + unitCount(inc.units) * 3);
      G.coins += loot;
      out.loot = { coins: loot };
    } else {
      const stolen = {};
      for (const k of RES_ORDER) { const n = Math.floor(G.res[k] * 0.25); if (n > 0) { stolen[k] = n; G.res[k] -= n; } }
      const c = Math.floor(G.coins * 0.25); if (c > 0) { stolen.coins = c; G.coins -= c; }
      const extraDead = Math.floor(G.pop * 0.04);
      removePeople(extraDead);
      const houses = G.buildings.filter(b => b.type === 'house');
      if (houses.length > 5) {
        const h = houses[Math.floor(Math.random() * houses.length)];
        if (h.level > 1) h.level--;
        else G.buildings = G.buildings.filter(b => b !== h);
      }
      out.stolen = stolen;
      out.dead = extraDead;
    }
    Battle.play(out);
  }

  // ---------------- Market ----------------
  function partners() {
    return KINGDOMS.map(k => ({ def: k, state: kingdomState(k.id) }));
  }
  function demand(pid, r) {
    G.market[pid] = G.market[pid] || {};
    return G.market[pid][r] || 1;
  }
  function price(pid, r, buying) {
    const kd = kingdomDef(pid), ks = kingdomState(pid);
    const m = findBuilding('market');
    let spread = BUILDINGS.market.spread[m.level - 1];
    if (ks.conquered) spread *= 0.6;
    if (has('guilds')) spread *= 0.6;
    const base = RES[r].price * (kd.trade[r] || 1) * demand(pid, r);
    return buying ? base * (1 + spread) : base * (1 - spread) * (has('banking') ? 1.15 : 1);
  }
  function trade(pid, r, qty, buying) {
    qty = Math.floor(qty);
    if (qty <= 0) return false;
    // price walks with each unit traded
    let total = 0;
    G.market[pid] = G.market[pid] || {};
    const d0 = demand(pid, r);
    for (let i = 0; i < qty; i++) {
      const p = price(pid, r, buying);
      if (buying && G.coins < total + p) { qty = i; break; }
      if (!buying && G.res[r] < i + 1) { qty = i; break; }
      total += p;
      G.market[pid][r] = Math.max(0.4, Math.min(3, demand(pid, r) * (buying ? 1.004 : 0.996)));
    }
    if (qty <= 0) { G.market[pid][r] = d0; return false; }
    if (buying) { G.coins -= total; G.res[r] += qty; }
    else { G.coins += total; G.res[r] -= qty; }
    G.stats.trades++;
    return { qty, total };
  }
  function marketDrift(dt) {
    for (const pid in G.market) for (const r in G.market[pid]) {
      const d = G.market[pid][r];
      G.market[pid][r] = d + (1 - d) * Math.min(1, 0.25 * dt);
    }
  }

  function kingdomGrowth(dt) {
    for (const ks of G.kingdoms) {
      if (ks.conquered) continue;
      const kd = kingdomDef(ks.id);
      for (const k in kd.garrison) {
        const cap = kd.garrison[k] * (1 + Math.min(0.6, G.time * kd.growth));
        const cur = ks.garrison[k] || 0;
        if (cur < cap) ks.garrison[k] = Math.min(cap, cur + kd.garrison[k] * (kd.growth + 0.03) * dt);
      }
    }
  }

  function newDay() {
    if (day() % 5 === 0) saveGame();
  }

  // ---------------- Actions ----------------
  function startResearch(id) {
    if (G.research || G.techs[id]) return false;
    if (!techAvailable(id)) return false;
    if (!pay(TECHS[id].cost)) return false;
    G.research = { id, prog: 0 };
    return true;
  }
  function cancelResearch() {
    if (!G.research) return;
    refund(TECHS[G.research.id].cost);
    G.research = null;
  }
  function queueWeapon(w, n) {
    const t = Object.values(TECHS).find(t => t.weapon === w);
    const id = Object.keys(TECHS).find(k => TECHS[k] === t);
    if (!G.techs[id]) return false;
    let max = n;
    while (max > 0 && !canAfford(WEAPONS[w].cost, max)) max--;
    if (max <= 0) return false;
    pay(WEAPONS[w].cost, max);
    const last = G.forgeQueue[G.forgeQueue.length - 1];
    if (last && last.w === w) last.n += max;
    else G.forgeQueue.push({ w, n: max, prog: 0 });
    return max;
  }
  function cancelQueue(i) {
    const q = G.forgeQueue[i];
    if (!q) return;
    refund(WEAPONS[q.w].cost, q.n);
    G.forgeQueue.splice(i, 1);
  }
  function upgradeBuilding(b) {
    const def = BUILDINGS[b.type];
    if (b.level >= def.maxLevel || b.built < 1 || b.upg !== undefined) return false;
    const req = def.upgradeReq && def.upgradeReq[b.level];
    if (req && !has(req)) return false;
    if (!pay(def.upgrade[b.level])) return false;
    b.upg = 0;   // keeps working while the upgrade is built
    return true;
  }
  function demolish(b) {
    if (BUILDINGS[b.type].unique) return;
    G.buildings = G.buildings.filter(x => x !== b);
    refund(BUILDINGS[b.type].cost, 0.5);
  }

  return {
    tick, startExpedition, recruit, disband, launchCampaign, trade, price, partners, startResearch, cancelResearch,
    queueWeapon, cancelQueue, upgradeBuilding, demolish, foodPerDay, refinerySpeed, expBonus, expSlots,
    playerSide, kingdomSide, defenders, militiaCount, marchDays, roundUnits, efficiency,
  };
})();

// ------------------------------------------------------------
//  Tech helpers
// ------------------------------------------------------------
function techName(id) { const t = TECHS[id]; return t.weapon ? WEAPONS[t.weapon].name : t.name; }
function techAvailable(id) { return (TECHS[id].req || []).every(r => G.techs[r]); }
function weaponUnlocked(w) { const id = Object.keys(TECHS).find(k => TECHS[k].weapon === w); return !!G.techs[id]; }

