// ============================================================
//  Battle simulation
//  side = { name, units:{weaponId:n}, atkMult, armorAdd, dmgTaken, towers, extraVolleys }
// ============================================================

const Combat = (() => {
  const MAX_MELEE_ROUNDS = 14;

  function stacksOf(side, tag) {
    return Object.entries(side.units)
      .filter(([, n]) => n >= 1)
      .map(([id, n]) => ({ id, w: WEAPONS[id], n, start: n, side: tag, pending: 0 }));
  }
  const alive = s => s.n > 0.05;
  const isRanged = s => s.w.cls === 'ranged';
  const isSkirm = s => s.w.cls === 'ranged' || s.w.cls === 'javelin';
  const total = stacks => stacks.reduce((t, s) => t + (alive(s) ? s.n : 0), 0);

  function classMult(a, d) {
    const row = CLASS_BONUS[a];
    return (row && row[d]) || 1;
  }

  // Attack: `att` = {w, n, label}, `power` = damage per attacker before armour
  function strike(att, power, attSide, defStacks, defSide, mode, rng, events) {
    let targets;
    if (mode === 'flank') targets = defStacks.filter(s => alive(s) && isSkirm(s));
    else {
      targets = defStacks.filter(s => alive(s) && !isRanged(s));
      if (!targets.length) targets = defStacks.filter(alive);
    }
    if (!targets.length) return;
    const sum = targets.reduce((t, s) => t + s.n, 0);
    for (const t of targets) {
      const share = t.n / sum;
      let raw = att.n * power * share * classMult(att.w.cls, t.w.cls);
      const baseArmor = Math.max(0, t.w.armor + defSide.armorAdd);
      let armor = baseArmor * (1 - (att.w.pierce || 0));
      if (mode === 'volley' && !att.w.pierce) armor *= 2;             // arrows glance off armour
      if (att.w.crush) raw *= 1 + 0.12 * baseArmor;                    // maces crush armour
      const red = armor / (armor + 8);
      const dmg = raw * (1 - red) * defSide.dmgTaken * (0.85 + rng() * 0.3);
      const kills = dmg / t.w.hp;
      t.pending += kills;
      if (events) events.push({ a: att.label, aSide: attSide.tag, t: t, kills });
    }
  }
  function applyPending(stacks) {
    for (const s of stacks) { s.n = Math.max(0, s.n - s.pending); s.pending = 0; }
  }
  function simulate(Ain, Din, opts = {}) {
    const rng = opts.rng || Math.random;
    const detailed = opts.detailed !== false;
    const luck = () => 0.9 + rng() * 0.2;   // fortunes of war
    const A = { tag: 'A', name: Ain.name, atkMult: (Ain.atkMult || 1) * luck(), armorAdd: Ain.armorAdd || 0, dmgTaken: Ain.dmgTaken || 1, towers: Ain.towers || 0, extraVolleys: Ain.extraVolleys || 0 };
    const D = { tag: 'D', name: Din.name, atkMult: (Din.atkMult || 1) * luck(), armorAdd: Din.armorAdd || 0, dmgTaken: Din.dmgTaken || 1, towers: Din.towers || 0, extraVolleys: Din.extraVolleys || 0 };
    const sa = stacksOf(Ain, 'A'), sd = stacksOf(Din, 'D');
    const startA = total(sa), startD = total(sd);
    const rounds = [];
    // each snapshot keeps per-stack counts so the battle can be replayed as an animation
    const snap = (kind, events) => {
      if (!detailed) return;
      rounds.push({ kind, a: total(sa), d: total(sd), sa: sa.map(s => s.n), sd: sd.map(s => s.n), towers: !!(A.towers || D.towers) });
    };
    snap('deploy');
    const towerA = { w: { cls: 'ranged', pierce: 0.3, unit: 'Watchtowers' }, n: A.towers, label: 'Watchtowers' };
    const towerD = { w: { cls: 'ranged', pierce: 0.3, unit: 'Watchtowers' }, n: D.towers, label: 'Watchtowers' };

    if (startA < 0.5 || startD < 0.5) {
      // one side has nobody – automatic result
      return finish(sa, sd, startA, startD, startA >= 0.5 ? 'A' : 'D', rounds, A, D);
    }

    // ---- Volley phase ----
    const vol = s => (s.w.volleys || 0) + (isSkirm(s) ? (s.side === 'A' ? A.extraVolleys : D.extraVolleys) : 0);
    const maxV = Math.max(0, ...sa.map(vol), ...sd.map(vol), (A.towers || D.towers) ? 2 : 0);
    for (let v = 1; v <= Math.min(maxV, 6); v++) {
      const ev = detailed ? [] : null;
      for (const [own, enemy, os, es] of [[sa, sd, A, D], [sd, sa, D, A]]) {
        for (const s of own) {
          if (!alive(s) || vol(s) < v) continue;
          const p = s.w.atk * os.atkMult * (s.w.cls === 'javelin' ? 1.8 : 1);
          strike({ w: s.w, n: s.n, label: s.w.unit }, p, os, enemy, es, 'volley', rng, ev);
        }
      }
      if (A.towers) strike(towerA, 1, A, sd, D, 'volley', rng, ev);
      if (D.towers) strike(towerD, 1, D, sa, A, 'volley', rng, ev);
      applyPending(sa); applyPending(sd);
      snap('volley', ev);
      if (total(sa) < 0.5 || total(sd) < 0.5) break;
    }

    // ---- Melee ----
    let winner = null;
    for (let r = 1; r <= MAX_MELEE_ROUNDS && !winner; r++) {
      if (total(sa) < 0.5) { winner = 'D'; break; }
      if (total(sd) < 0.5) { winner = 'A'; break; }
      const ev = detailed ? [] : null;
      if (r === 1) {
        // spearmen brace and strike first
        for (const [own, enemy, os, es] of [[sa, sd, A, D], [sd, sa, D, A]])
          for (const s of own) if (alive(s) && s.w.cls === 'spear')
            strike({ w: s.w, n: s.n, label: s.w.unit }, s.w.atk * os.atkMult, os, enemy, es, 'melee', rng, ev);
        applyPending(sa); applyPending(sd);
      }
      for (const [own, enemy, os, es] of [[sa, sd, A, D], [sd, sa, D, A]]) {
        const frontAlive = own.some(s => alive(s) && !isRanged(s));
        for (const s of own) {
          if (!alive(s)) continue;
          if (r === 1 && s.w.cls === 'spear') continue;
          const att = { w: s.w, n: s.n, label: s.w.unit };
          let p = s.w.atk * os.atkMult;
          if (s.w.cls === 'ranged') {
            if (frontAlive) { strike(att, p * 0.6, os, enemy, es, 'volley', rng, ev); continue; }
            p *= 0.3;
          } else if (s.w.cls === 'javelin') p *= 0.7;
          else if (s.w.cls === 'cavalry') {
            if (r === 1) p *= 2.5;
            if (enemy.some(e => alive(e) && isSkirm(e))) {
              strike({ ...att, n: s.n * 0.5 }, p, os, enemy, es, 'flank', rng, ev);
              strike({ ...att, n: s.n * 0.5 }, p, os, enemy, es, 'melee', rng, ev);
              continue;
            }
          }
          strike(att, p, os, enemy, es, 'melee', rng, ev);
        }
      }
      if (A.towers) strike(towerA, 0.5, A, sd, D, 'volley', rng, ev);
      if (D.towers) strike(towerD, 0.5, D, sa, A, 'volley', rng, ev);
      applyPending(sa); applyPending(sd);
      snap(r === 1 ? 'charge' : 'melee', ev);
      const ta = total(sa), td = total(sd);
      if (ta < 0.5 && td < 0.5) winner = 'D';
      else if (ta < 0.5) winner = 'D';
      else if (td < 0.5) winner = 'A';
      else {
        // morale: an army reduced below 25% of its strength breaks
        const fa = ta / startA, fd = td / startD;
        if (fa < 0.25 && fa < fd) winner = 'D';
        else if (fd < 0.25 && fd < fa) winner = 'A';
      }
    }
    if (!winner) winner = (total(sa) / startA) > (total(sd) / startD) ? 'A' : 'D';
    // pursuit of the routed army
    const loser = winner === 'A' ? sd : sa;
    for (const s of loser) s.n *= 0.85;
    snap('rout');
    return finish(sa, sd, startA, startD, winner, rounds, A, D);
  }

  function finish(sa, sd, startA, startD, winner, rounds) {
    const res = st => {
      const start = {}, end = {}, lost = {};
      for (const s of st) {
        start[s.id] = Math.round(s.start);
        end[s.id] = Math.min(start[s.id], Math.round(s.n));
        lost[s.id] = start[s.id] - end[s.id];
      }
      return { start, end, lost };
    };
    return { winner, A: res(sa), D: res(sd), rounds, order: { A: sa.map(s => s.id), D: sd.map(s => s.id) } };
  }

  // Monte-Carlo win chance for side A
  function forecast(A, D, runs = 40) {
    let wins = 0;
    for (let i = 0; i < runs; i++) if (simulate(A, D, { detailed: false }).winner === 'A') wins++;
    return wins / runs;
  }

  function power(units) {
    let p = 0;
    for (const k in units) {
      const w = WEAPONS[k];
      p += units[k] * Math.sqrt(w.atk * w.hp * (1 + w.armor * 0.15) * (w.volleys ? 1.3 : 1));
    }
    return Math.round(p / 10);
  }

  return { simulate, forecast, power };
})();
