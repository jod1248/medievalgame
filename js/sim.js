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
    Objectives.check();
  }

  function construction(dt) {
    for (const b of G.buildings) {
      if (b.built < 1) {
        b.built = Math.min(1, b.built + dt / BUILDINGS[b.type].buildDays);
        if (b.built >= 1) {
          if (b.type === 'house') G.stats.housesBuilt++;
          log(`${BUILDINGS[b.type].name} completed.`, 'good');
        }
      } else if (b.upg !== undefined) {
        b.upg += dt / ((BUILDINGS[b.type].buildDays || 1) * 1.5);
        if (b.upg >= 1) {
          delete b.upg;
          b.level++;
          log(`${BUILDINGS[b.type].name} upgraded to level ${b.level}.`, 'good');
        }
      }
    }
  }

  function staffing() {
    let avail = availableWorkers();
    const order = { farm: 0, lumber: 1, quarry: 2, mine: 3, refinery: 4, stables: 5 };
    const list = G.buildings.filter(b => BUILDINGS[b.type].workers)
      .sort((a, b) => (order[a.type] - order[b.type]) || (a.id - b.id));
    for (const b of list) {
      if (b.built < 1 || b.paused) { b.workers = 0; continue; }
      const slots = BUILDINGS[b.type].workers[b.level - 1];
      b.workers = Math.min(slots, avail);
      avail -= b.workers;
    }
  }

  function efficiency() { return G.coins > 0 ? 1 : 0.5; }   // unpaid workers slack off

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
      } else if (b.type === 'refinery') {
        const r = RECIPES[b.recipe];
        if (!r || r.tier > b.level) { b.active = false; continue; }
        const staff = b.workers / def.workers[b.level - 1];
        const speed = REFINERY_SPEED[b.level - 1] * (has('bellows') ? 1.25 : 1) * staff * eff;
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

  function taxRate() {
    const th = findBuilding('townhall');
    return BUILDINGS.townhall.tax[th.level - 1] * (has('banking') ? 1.3 : 1);
  }
  function tributePerDay() {
    let t = 0;
    for (const k of G.kingdoms) if (k.conquered) t += kingdomDef(k.id).tribute;
    return t * (has('guilds') ? 1.5 : 1);
  }
  function wagesPerDay() { return employedWorkers() * WAGE_WORKER + totalSoldiers() * WAGE_SOLDIER; }
  function taxPerDay() { return civilians() * taxRate(); }
  function foodPerDay() {
    let prod = 0;
    for (const b of G.buildings) if (b.type === 'farm' && b.workers) {
      prod += BUILDINGS.farm.rate[b.level - 1] * b.workers * efficiency() * (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
    }
    return { prod, use: G.pop * FOOD_PER_PERSON };
  }

  function finances(dt) {
    G.coins += (taxPerDay() + tributePerDay() - wagesPerDay()) * dt;
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
      if (n > 0) UI.floatText(`+${n} settlers`);
    } else if (G.popAcc <= -1) {
      const n = Math.floor(-G.popAcc);
      G.popAcc += n;
      removePeople(n);
      if (!fed) log(`${n} people left — there is no food!`, 'bad');
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
      log(`Research complete: ${techName(G.research.id)}!`, 'good');
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
      log(`The forge finished a batch of ${WEAPONS[q.w].name}s.`, 'good');
    }
  }

  function expeditions(dt) {
    const mult = has('tools') ? 1.25 : 1;
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
      log(`${e.people} villagers returned from "${EXPEDITIONS[e.type].name}" with ${Object.entries(got).map(([k, n]) => `${n} ${RES[k].name}`).join(', ')}.`, 'good');
    }
  }

  function startExpedition(type, people) {
    people = Math.floor(people);
    if (people < 1 || people > availableWorkers()) return false;
    if (G.expeditions.length >= 4) { log('At most 4 expeditions can be out at once.', 'bad'); return false; }
    const d = EXPEDITIONS[type].days;
    G.expeditions.push({ id: G.nextId++, type, people, t: d, total: d });
    log(`${people} villagers set out to ${EXPEDITIONS[type].name.toLowerCase()}.`);
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
    log(`Your army of ${unitCount(sent)} marches on ${kingdomDef(target).name}! (${d.toFixed(1)} days)`, 'warn');
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
        const lostMen = unitCount(res.A.lost);
        G.pop -= lostMen;
        let title;
        if (res.winner === 'A') {
          ks.conquered = true;
          G.stats.conquered++;
          refund(kd.loot);
          G.territory = Math.min(MAX_TERRITORY, G.territory + kd.land);
          Render.terrainDirty = true;
          title = `Victory! ${kd.name} has fallen`;
          log(`${kd.name} is conquered! Loot seized, tribute of ${kd.tribute} coins/day, and your lands expand.`, 'good');
          res.extra = `<p>Loot: ${costHTML(kd.loot)}</p><p>${kd.ruler} bends the knee. ${kd.name} will pay <b>${kd.tribute} 🪙/day</b> in tribute, and your territory expands.</p>`;
          if (G.kingdoms.every(k => k.conquered)) { G.won = true; setTimeout(() => UI.gameOver(true), 1500); }
        } else {
          title = `Defeat at ${kd.name}`;
          log(`Your army was repulsed by ${kd.name}. The survivors retreat.`, 'bad');
        }
        c.phase = 'return'; c.t = c.total;
        UI.battleReport(title, res, `Your army`, kd.name);
        if (!unitCount(c.units)) G.campaigns = G.campaigns.filter(x => x !== c);
      } else {
        for (const k in c.units) G.army[k] = (G.army[k] || 0) + c.units[k];
        G.campaigns = G.campaigns.filter(x => x !== c);
        log(`Your army returned home with ${unitCount(c.units)} soldiers.`);
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
      log(`⚠️ Scouts report a raiding party from ${kingdomDef(src).name} (${unitCount(units)} men) — arriving in 3 days!`, 'bad');
      UI.raidWarning();
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
    let title;
    if (res.winner === 'D') {
      G.stats.raidsRepelled++;
      const loot = Math.round(30 + unitCount(inc.units) * 3);
      G.coins += loot;
      title = `Raid repelled!`;
      res.extra = `<p>The raiders from ${kd.name} flee. You collect <b>${loot} 🪙</b> in abandoned gear.</p>`;
      log(`The raid from ${kd.name} was repelled!`, 'good');
    } else {
      const stolen = {};
      for (const k of RES_ORDER) { const n = Math.floor(G.res[k] * 0.25); if (n > 0) { stolen[k] = n; G.res[k] -= n; } }
      const c = Math.floor(G.coins * 0.25); if (c > 0) { stolen.coins = c; G.coins -= c; }
      const extraDead = Math.floor(G.pop * 0.04);
      removePeople(extraDead);
      const houses = G.buildings.filter(b => b.type === 'house');
      let burned = '';
      if (houses.length > 5) {
        const h = houses[Math.floor(Math.random() * houses.length)];
        if (h.level > 1) { h.level--; burned = 'A house was damaged.'; }
        else { G.buildings = G.buildings.filter(b => b !== h); burned = 'A house was burned to the ground.'; }
      }
      title = `The town was sacked!`;
      res.extra = `<p>Raiders from ${kd.name} plundered: ${costHTML(stolen)}</p><p>${extraDead} villagers were killed. ${burned}</p>`;
      log(`Raiders from ${kd.name} sacked the town!`, 'bad');
    }
    UI.battleReport(title, res, kd.name, 'Your defenders', true);
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
    const base = RES[r].price * (kd.trade[r] || 1) * demand(pid, r);
    return buying ? base * (1 + spread) : base * (1 - spread);
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
    log(`Began researching ${techName(id)}.`);
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
    log(`Upgrading ${def.name} to level ${b.level + 1}.`);
    return true;
  }
  function demolish(b) {
    if (BUILDINGS[b.type].unique) return;
    G.buildings = G.buildings.filter(x => x !== b);
    refund(BUILDINGS[b.type].cost, 0.5);
  }

  return {
    tick, startExpedition, recruit, disband, launchCampaign, trade, price, partners, startResearch, cancelResearch,
    queueWeapon, cancelQueue, upgradeBuilding, demolish, taxPerDay, wagesPerDay, tributePerDay, foodPerDay,
    playerSide, kingdomSide, defenders, militiaCount, marchDays, roundUnits, efficiency,
  };
})();

// ------------------------------------------------------------
//  Tech helpers
// ------------------------------------------------------------
function techName(id) { const t = TECHS[id]; return t.weapon ? WEAPONS[t.weapon].name : t.name; }
function techAvailable(id) { return (TECHS[id].req || []).every(r => G.techs[r]); }
function weaponUnlocked(w) { const id = Object.keys(TECHS).find(k => TECHS[k].weapon === w); return !!G.techs[id]; }

// ------------------------------------------------------------
//  Objectives
// ------------------------------------------------------------
const Objectives = {
  done(id) {
    switch (id) {
      case 'sendWood': return G.expeditions.some(e => e.type === 'wood' && e.people >= 50) || G.stats.woodGathered >= 100;
      case 'getWood': return G.stats.woodGathered >= 100;
      case 'houses': return G.stats.housesBuilt >= 5;
      case 'growth': return G.pop >= 240;
      case 'research': return G.stats.researched >= 1;
      case 'refinery': return G.buildings.some(b => b.type === 'refinery' && b.built >= 1);
      case 'craft': return G.stats.weaponsForged >= 10;
      case 'recruit': return G.stats.recruited >= 10;
      case 'trade': return G.stats.trades >= 1;
      case 'defend': return G.stats.raidsRepelled >= 1;
      case 'conquer': return G.stats.conquered >= 1;
      case 'emperor': return G.won;
    }
    return false;
  },
  check() {
    while (G.obj < OBJECTIVES.length && this.done(OBJECTIVES[G.obj].id)) {
      const o = OBJECTIVES[G.obj];
      refund(o.reward);
      const rw = Object.keys(o.reward).length ? ' Reward: ' + Object.entries(o.reward).map(([k, n]) => `${n} ${resName(k)}`).join(', ') : '';
      log(`✔ Objective complete: ${o.text}.${rw}`, 'good');
      G.obj++;
    }
  },
};
