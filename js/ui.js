// ============================================================
//  HTML user interface. Minimal text: icons, numbers, tooltips.
//  Every panel re-renders only when its HTML actually changes.
// ============================================================

const UI = (() => {
  const $ = id => document.getElementById(id);
  const ui = {
    modal: null,
    selected: null,
    placing: null,
    expPeople: 50, expType: 'wood',
    techTab: 'melee', techSel: null,
    forgeTab: 'tech',
    partner: 'oakhold', tradeQty: 10, mktQuery: '',
    armyTab: 'army', mapSel: null, attackSel: {},
    hoverB: null, hoverHideT: 0,
    armed: null, buildOpen: false,
  };

  // set innerHTML only when it changed (keeps hover states, no flicker)
  function setHTML(el, html) {
    if (el._h === html) return false;
    el.innerHTML = html;
    el._h = html;
    return true;
  }
  const tip = s => String(s).replace(/"/g, '&quot;');

  // ---------------------------------------------------------
  //  Top bar
  // ---------------------------------------------------------
  function renderTop() {
    const f = Sim.foodPerDay();
    const fd = f.prod - f.use;
    const cap = housingCapacity();
    const chips = [
      chip(ic('coin', '', '#f1c75b'), fmt(G.coins), '', 'Coins'),
      chip(ic('pop'), `${G.pop}<small>/${cap}</small>`, '', `People ${G.pop} / ${cap} · idle ${idleCitizens()} · workers ${employedWorkers()} · soldiers ${totalSoldiers()}`),
      chip(resIc('food'), fmt(G.res.food), `${fd >= 0 ? '+' : ''}${fd.toFixed(1)}`, 'Food per day', fd < 0 ? 'neg' : 'pos'),
    ];
    for (const r of RES_ORDER) {
      if (r === 'food' || !G.topRes.includes(r)) continue;     // pick what shows here in the Bank
      chips.push(chip(resIc(r), fmt(G.res[r]), '', RES[r].name));
    }
    setHTML($('resbar'), chips.join(''));
    const sp = G.paused ? 0 : G.speed;
    const night = Render.daylight() < 0.5;
    setHTML($('daybox'), `<span class="clock" title="Day ${day()}">${ic(night ? 'moon' : 'sun', '', night ? '#c9d4ff' : '#ffd36b')}<b>${day()}</b></span>
      ${[[0, 'pause', 'Pause · Space'], [1, 'play', 'Normal · 1'], [2, 'fast', 'Fast · 2'], [4, 'faster', 'Fastest · 3']].map(([v, i, t]) =>
        `<button class="spd ${sp === v ? 'on' : ''}" data-speed="${v}" title="${t}">${ic(i)}</button>`).join('')}
      <button class="spd ${Music.isOn() ? 'on' : ''}" data-act="music" title="Music">${ic(Music.isOn() ? 'music' : 'musicOff')}</button>
      <button class="spd" data-act="save" title="Save">${ic('save')}</button>
      <button class="spd" data-act="help" title="Help">${ic('help')}</button>`);
    document.documentElement.style.setProperty('--toph', $('top').offsetHeight + 'px');
  }
  function chip(icon, val, sub, title, cls = '') {
    return `<div class="rchip" title="${tip(title)}">${icon}<span class="rv">${val}</span>${sub ? `<span class="rs ${cls}">${sub}</span>` : ''}</div>`;
  }

  // ---------------------------------------------------------
  //  Raid alert pill
  // ---------------------------------------------------------
  function renderAlert() {
    const inc = G.raid.incoming;
    const el = $('alert');
    if (!inc) { el.classList.add('hidden'); setHTML(el, ''); return; }
    el.classList.remove('hidden');
    const kd = kingdomDef(inc.from);
    setHTML(el, `<button class="alertpill" data-act="open" data-kind="defense" title="Raid from ${kd.name}">
      ${ic('warn', '', '#ff6b5b')}<span class="dotc" style="background:${kd.color}"></span>${ic('pop')}<b>${unitCount(inc.units)}</b>
      ${ic('clock')}<b>${Math.max(0, inc.eta - G.time).toFixed(1)}d</b></button>`);
  }

  // ---------------------------------------------------------
  //  Tutorial
  // ---------------------------------------------------------
  const TUT = [
    { text: 'Send 50 villagers to gather wood', target: '#act-exp', done: () => G.expeditions.some(e => e.type === 'wood') || G.stats.woodGathered >= 100 },
    { text: 'Wait for the wood to arrive', done: () => G.stats.woodGathered >= 100, progress: () => { const e = G.expeditions.find(e => e.type === 'wood'); return e ? 1 - e.t / e.total : 1; } },
    { text: 'Open Build and place 5 houses', target: () => ui.buildOpen ? '[data-type=house]' : '#act-build', done: () => G.stats.housesBuilt >= 5, progress: () => G.stats.housesBuilt / 5, reward: { wood: 60, coins: 60 } },
    { text: 'Open the Tech Tree', target: '#act-tech', done: () => (ui.modal && ui.modal.kind === 'tech') || G.research || G.stats.researched > 0 },
    { text: 'Research Basic Refinery', target: '.tnode[data-id=ref1]', done: () => (G.research && G.research.id === 'ref1') || has('ref1'), before: () => { ui.techTab = 'refining'; } },
    { text: 'Build a Sawmill', target: () => ui.buildOpen ? '[data-type=sawmill]' : '#act-build', done: () => G.buildings.some(b => b.type === 'sawmill'), reward: { wood: 40, stone: 20 } },
    { text: 'Forge 5 weapons', target: '#act-forge', done: () => G.stats.weaponsForged >= 5, progress: () => G.stats.weaponsForged / 5 },
    { text: 'Train 5 soldiers', target: '#act-army', done: () => G.stats.recruited >= 5, progress: () => G.stats.recruited / 5 },
    { text: 'Sell goods at the Market for coins', target: '#act-market', done: () => G.stats.trades >= 1 },
    { text: 'Defend your walls. Conquer the realm.', final: true },
  ];
  function renderTutorial() {
    const el = $('tutorial');
    document.querySelectorAll('.tut-glow').forEach(e => e.classList.remove('tut-glow'));
    Render.pulse = null;
    if (G.tut < 0 || G.tut >= TUT.length) { el.classList.add('hidden'); return; }
    let st = TUT[G.tut];
    while (!st.final && st.done()) {
      if (st.reward) { refund(st.reward); toast(gainHTML(st.reward), 'good', 'check'); }
      G.tut++;
      st = TUT[G.tut];
      if (st.before) st.before();
    }
    el.classList.remove('hidden');
    const p = st.progress ? Math.max(0, Math.min(1, st.progress())) : null;
    setHTML(el, `<span class="tstep">${G.tut + 1}/${TUT.length}</span><span class="ttext">${st.text}</span>
      ${p !== null ? `<span class="tbar"><i style="width:${p * 100}%"></i></span>` : ''}
      ${st.final ? `<button data-act="tutdone">${ic('check')}</button>` : `<button class="tskip" data-act="tutskip" title="Skip tutorial">${ic('close')}</button>`}`);
    const target = typeof st.target === 'function' ? st.target() : st.target;
    if (target) document.querySelectorAll(target).forEach(e => e.classList.add('tut-glow'));
  }

  // ---------------------------------------------------------
  //  Bottom toolbar; Build opens a tray of buildings above it
  // ---------------------------------------------------------
  const TOOLS = [
    ['act-build', 'hammer', '', '', 'Build'],
    ['act-exp', 'compass', 'townhall', '', 'Expeditions'],
    ['act-tech', 'tech', 'tech', '', 'Tech Tree'],
    ['act-forge', 'anvil', 'forge', '', 'Forge'],
    ['act-market', 'scales', 'market', '', 'Market'],
    ['act-bank', 'coin', 'bank', '', 'Bank'],
    ['act-army', 'battle', 'army', '', 'Army'],
    ['act-defense', 'wall', 'defense', '', 'Defence'],
    ['act-map', 'map', 'map', '', 'World Map'],
  ];
  function renderBottom() {
    let h = '';
    if (ui.buildOpen) {
      h += '<div class="buildtray"><div class="buildlist">';
      for (const t of BUILD_MENU) {
        const d = BUILDINGS[t];
        const locked = d.requires && !has(d.requires);
        if (locked && d.refinery && d.requires !== 'ref1') continue;   // keep the tray short
        const afford = canAfford(d.cost);
        h += `<button class="bbtn ${ui.placing === t ? 'on' : ''} ${locked ? 'locked' : ''} ${!afford ? 'poor' : ''}" data-act="place" data-type="${t}"
          title="${tip(d.desc + (locked ? ' Needs ' + techName(d.requires) + '.' : ''))}">
          ${ic(d.icon, 'bi')}<span class="bn">${d.name}</span><span class="bc">${locked ? ic('lock') + ' ' + techName(d.requires) : costHTML(d.cost)}</span></button>`;
      }
      h += '</div></div>';
    }
    h += '<div class="toolbar">';
    for (const [id, icon, kind, tab, label] of TOOLS) {
      const on = id === 'act-build' ? ui.buildOpen : !!(ui.modal && ui.modal.kind === kind);
      h += id === 'act-build'
        ? `<button id="${id}" class="abtn ${on ? 'on' : ''}" data-act="buildtray">${ic(icon)}<span>${label}</span></button><span class="tsep"></span>`
        : `<button id="${id}" class="abtn ${on ? 'on' : ''}" data-act="open" data-kind="${kind}" data-tab="${tab}">${ic(icon)}<span>${label}</span></button>`;
    }
    h += '</div>';
    setHTML($('bottom'), h);
  }

  // Hovering only highlights a building; its actions open on click.
  function setHover(b) { Render.hover = b; }
  function updateHoverPop() {}

  // ---------------------------------------------------------
  //  Side panel: selected building
  // ---------------------------------------------------------
  function prodRate(b, level = b.level, workers = b.workers) {
    const d = BUILDINGS[b.type];
    let rate = d.rate[level - 1] * workers;
    if (b.type === 'farm') rate *= (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
    if (['lumber', 'quarry', 'mine'].includes(b.type) && has('tools')) rate *= 1.25;
    if (b.type === 'mine' && has('deepMining')) rate *= 1.5;
    if (b.type === 'stables' && has('husbandry')) rate *= 1.5;
    return rate;
  }
  const statLine = (icon, label, value) => `<div class="sline">${icon}<span>${label}</span><b>${value}</b></div>`;
  const nextLine = (label, a, b) => `<div class="sline">${ic('arrowR', '', '#8fd16a')}<span>${label}</span><b>${a} → <em>${b}</em></b></div>`;

  // What the next level changes, per building type
  function nextLevelLines(b) {
    const d = BUILDINGS[b.type], L = b.level, n = L + 1;
    const out = [];
    const arch = has('architecture') ? 1.25 : 1;
    if (b.type === 'house') out.push(nextLine('Residents', Math.floor(d.capacity[L - 1] * arch), Math.floor(d.capacity[n - 1] * arch)));
    if (d.workers) out.push(nextLine('Workers', d.workers[L - 1], d.workers[n - 1]));
    if (d.produces) {
      const key = d.produces === 'ore' ? b.ore : d.produces;
      out.push(nextLine(RES[key].name + ' / day (full)', prodRate(b, L, d.workers[L - 1]).toFixed(1), prodRate(b, n, d.workers[n - 1]).toFixed(1)));
    }
    if (d.refinery) out.push(nextLine('Refining speed', '×' + REFINERY_SPEED[L - 1], '×' + REFINERY_SPEED[n - 1]));
    if (b.type === 'forge') out.push(nextLine('Research & forging speed', '×' + d.speed[L - 1], '×' + d.speed[n - 1]));
    if (b.type === 'market') out.push(nextLine('Trade margin', Math.round(d.spread[L - 1] * 100) + '%', Math.round(d.spread[n - 1] * 100) + '%'));
    if (b.type === 'barracks') out.push(nextLine('Army size', d.capacity[L - 1], d.capacity[n - 1]));
    if (b.type === 'townhall') {
      out.push(nextLine('Expeditions at once', d.expSlots[L - 1], d.expSlots[n - 1]));
      out.push(nextLine('Expedition haul', '+' + Math.round((d.expBonus[L - 1] - 1) * 100) + '%', '+' + Math.round((d.expBonus[n - 1] - 1) * 100) + '%'));
    }
    if (b.type === 'watchtower') out.push(nextLine('Firepower', 12 * L, 12 * n));
    return out.join('');
  }

  // What a building will do, shown while placing it
  function placementPreview(type) {
    const d = BUILDINGS[type];
    const fake = { id: 0, type, level: 1, built: 1, workers: d.workers ? d.workers[0] : 0, ore: 'ironOre', pct: 100 };
    let h = `<button class="close" data-act="stopplace" title="Cancel">${ic('close')}</button>
      <h2>${ic(d.icon)} ${d.name}</h2><div class="sub">New building · ${d.desc}</div><div class="slines">`;
    if (d.workers) h += statLine(ic('worker'), 'Workers needed', d.workers[0]);
    if (d.produces) {
      const key = d.produces === 'ore' ? 'ironOre' : d.produces;
      h += statLine(resIc(key), (d.produces === 'ore' ? 'Ore' : RES[key].name) + ' / day', '+' + prodRate(fake).toFixed(1));
    }
    if (d.consumes) h += statLine(resIc('food'), 'Food used per horse', d.consumes.food);
    if (type === 'house') h += statLine(ic('pop'), 'Residents', Math.floor(d.capacity[0] * (has('architecture') ? 1.25 : 1)));
    if (type === 'watchtower') h += statLine(ic('bow'), 'Firepower', 12);
    if (d.refinery) {
      const r = RECIPES[d.recipe], perDay = REFINERY_SPEED[0] * (has('bellows') ? 1.25 : 1) / r.time;
      h += `</div><div class="lbl">Per day (fully staffed)</div><div class="recipe">${costHTML(r.in, perDay)} ${ic('arrowR')} ${costHTML(r.out, perDay)}</div><div class="slines">`;
    }
    h += statLine(ic('map'), 'Size', `${d.size} × ${d.size}`);
    if (d.maxLevel > 1) h += statLine(ic('up'), 'Upgrades', `up to Tier ${TIER_NAMES[d.maxLevel]}`);
    h += `</div><div class="upbox"><div class="lbl">Cost</div><div class="costrow">${costHTML(d.cost)}</div></div>
      <p class="muted small">Click inside the walls to build. Right-click or Esc to stop.</p>`;
    return h;
  }
  function renderSide() {
    const el = $('side');
    if (ui.placing) { el.classList.add('show'); setHTML(el, placementPreview(ui.placing)); return; }
    const b = ui.selected;
    if (!b || !G.buildings.includes(b)) { el.classList.remove('show'); ui.selected = null; Render.selected = null; return; }
    el.classList.add('show');
    const d = BUILDINGS[b.type];
    let h = `<button class="close" data-act="deselect" title="Close">${ic('close')}</button>
      <h2>${ic(d.icon)} ${d.name}</h2>
      <div class="sub">${d.maxLevel > 1 ? `Tier ${TIER_NAMES[b.level]} of ${TIER_NAMES[d.maxLevel]} · ` : ''}${d.desc}</div>`;
    if (b.built < 1) {
      h += `<div class="bar"><div style="width:${b.built * 100}%"></div></div><div class="sub">Under construction</div>`;
    } else {
      h += '<div class="slines">';
      if (d.workers) h += statLine(ic('worker'), 'Workers', `${b.workers} / ${d.workers[b.level - 1]}`);
      if (d.produces) {
        const key = d.produces === 'ore' ? b.ore : d.produces;
        h += statLine(resIc(key), RES[key].name + ' / day', '+' + prodRate(b).toFixed(1));
      }
      if (b.type === 'house') h += statLine(ic('pop'), 'Residents', Math.floor(d.capacity[b.level - 1] * (has('architecture') ? 1.25 : 1)));
      if (b.type === 'watchtower') h += statLine(ic('bow'), 'Firepower', 12 * b.level);
      if (b.type === 'forge') h += statLine(ic('speed'), 'Speed', '×' + d.speed[b.level - 1]);
      if (b.type === 'market') h += statLine(ic('scales'), 'Trade margin', Math.round(d.spread[b.level - 1] * 100) + '%');
      if (b.type === 'barracks') h += statLine(ic('battle'), 'Army size', `${totalSoldiers()} / ${armyCapacity()}`);
      if (b.type === 'townhall') h += statLine(ic('compass'), 'Expeditions', `${G.expeditions.length} / ${d.expSlots[b.level - 1]}`);
      h += '</div>';
      if (b.type === 'mine') h += '<div class="lbl">Ore to dig</div><div class="opts">' + ORE_TYPES.map(o => `<button class="${b.ore === o ? 'on' : ''}" data-act="ore" data-ore="${o}">${resIc(o)} ${RES[o].name.replace(' Ore', '')}</button>`).join('') + '</div>';
      if (d.refinery) {
        const r = RECIPES[d.recipe];
        const perDay = Sim.refinerySpeed(b) / r.time * b.pct / 100;
        h += `<div class="lbl">Per day</div><div class="recipe">${costHTML(r.in, perDay)} ${ic('arrowR')} ${costHTML(r.out, perDay)}</div>
          <div class="lbl">Refine amount</div>
          <div class="slider"><input type="range" id="ref-pct" min="0" max="100" step="5" value="${b.pct}" aria-label="Refine amount">
          <b>${b.pct}%</b></div>
          ${b.starved ? `<div class="warnline">${ic('warn')} Missing ${costHTML(r.in)}</div>` : ''}`;
      }
      if (b.upg !== undefined) {
        h += `<div class="upbox"><div class="lbl">${ic('hammer')} Upgrading to Tier ${TIER_NAMES[b.level + 1]}</div><div class="bar"><div style="width:${b.upg * 100}%"></div></div></div>`;
      } else if (b.level < d.maxLevel) {
        const req = d.upgradeReq && d.upgradeReq[b.level];
        const locked = req && !has(req);
        const cost = d.upgrade[b.level];
        h += `<div class="upbox"><div class="lbl">Next · Tier ${TIER_NAMES[b.level + 1]}</div>${nextLevelLines(b)}
          <div class="costrow">${locked ? `<span class="lockline">${ic('lock')} Needs ${techName(req)}</span>` : costHTML(cost)}</div>
          <button class="big wide" data-act="upgrade" ${locked || !canAfford(cost) ? 'disabled' : ''}>${ic('up')} Upgrade</button></div>`;
      } else if (d.maxLevel > 1) h += `<div class="upbox"><div class="lbl">${ic('crown')} Top tier</div></div>`;
      h += '<div class="rowbtns">';
      if (d.workers) h += `<button data-act="pause">${ic(b.paused ? 'play' : 'pause')} ${b.paused ? 'Resume' : 'Pause'}</button>`;
      if (!d.unique) h += `<button class="danger ${ui.armed === 'demolish' + b.id ? 'armed' : ''}" data-act="demolish">${ic('trash')} ${ui.armed === 'demolish' + b.id ? 'Confirm' : 'Demolish'}</button>`;
      h += '</div>';
    }
    // keep the slider while dragging it
    if (document.activeElement && document.activeElement.id === 'ref-pct' && el.contains(document.activeElement)) return;
    setHTML(el, h);
  }

  // ---------------------------------------------------------
  //  Modals
  // ---------------------------------------------------------
  function openModal(kind, tab) {
    ui.modal = { kind };
    if (kind === 'army' && tab) ui.armyTab = tab;
    $('modal').classList.add('show');
    renderModal(true);
  }
  function closeModal() { ui.modal = null; $('modal').classList.remove('show'); }

  function renderModal() {
    if (!ui.modal) return;
    const body = $('modal-body');
    const active = document.activeElement;
    const focusId = active && body.contains(active) && active.id;
    const sel = focusId && active.selectionStart;
    const scrolls = [...body.querySelectorAll('.scroll')].map(e => [e.scrollLeft, e.scrollTop]);
    let title = '', html = '';
    switch (ui.modal.kind) {
      case 'tech': title = ic('tech') + ' Tech Tree'; html = techTreeHTML(); break;
      case 'forge': title = ic('anvil') + ' Forge'; html = craftHTML(); break;
      case 'market': title = ic('scales') + ' Market'; html = marketHTML(); break;
      case 'bank': title = ic('coin', '', '#f1c75b') + ' Bank'; html = bankHTML(); break;
      case 'army': title = ic('battle') + ' Army'; html = armyHTML(); break;
      case 'defense': title = ic('wall') + ' Defence'; html = defenseHTML(); break;
      case 'map': title = ic('map') + ' World Map'; html = worldHTML(); break;
      case 'townhall': title = ic('compass') + ' Expeditions'; html = expHTML(); break;
      case 'help': title = ic('help') + ' Help'; html = helpHTML(); break;
    }
    setHTML($('modal-title'), title);
    const changed = setHTML(body, html);
    const slot = body.querySelector('#wm-slot');
    if (slot) WorldMap.mount(slot, id => { ui.mapSel = id; ui.attackSel = {}; renderModal(); });
    if (!changed) return;
    body.querySelectorAll('.scroll').forEach((e, i) => { if (scrolls[i]) { e.scrollLeft = scrolls[i][0]; e.scrollTop = scrolls[i][1]; } });
    if (focusId && $(focusId)) { const f = $(focusId); f.focus(); if (sel != null && f.setSelectionRange) f.setSelectionRange(sel, sel); }
    renderTutorial();
  }
  function tabs(list, cur, act) {
    return '<div class="tabs">' + list.map(([id, label, title]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-tab="${id}" title="${title || ''}">${label}</button>`).join('') + '</div>';
  }

  // ---------- Forge ----------
  function techStatus(id) {
    if (G.techs[id]) return 'done';
    if (G.research && G.research.id === id) return 'active';
    if (G.researchQueue.includes(id)) return 'queued';
    if (techAvailable(id, true)) return 'avail';
    return 'locked';
  }
  function techIcon(id) {
    const t = TECHS[id];
    if (t.icon) return ic(t.icon);
    return ic(CLASSES[WEAPONS[t.weapon].cls].icon, '', CLASSES[WEAPONS[t.weapon].cls].color);
  }

  function techTreeHTML() {
    let h = '';
    if (G.research) {
      const t = TECHS[G.research.id];
      h += `<div class="researching">${techIcon(G.research.id)} <b>${techName(G.research.id)}</b>
        <div class="bar"><div style="width:${G.research.prog / t.days * 100}%"></div></div>
        <small>${ic('clock')} ${Math.max(0, (t.days - G.research.prog) / forgeSpeed()).toFixed(1)}d</small>
        <button data-act="cancelresearch" data-id="${G.research.id}" title="Cancel">${ic('close')}</button></div>`;
      if (G.researchQueue.length) h += `<div class="rqueue">${ic('queue')} Queued: ${G.researchQueue.map(q => `<span class="qchip">${techIcon(q)} ${techName(q)}<button data-act="cancelresearch" data-id="${q}" title="Remove">${ic('close')}</button></span>`).join('')}</div>`;
    }
    h += '<div class="tabs sub">' + TECH_TABS.map(t => `<button class="${ui.techTab === t.id ? 'on' : ''}" data-act="techtab" data-tab="${t.id}">${t.name}</button>`).join('') + '</div>';
    const tab = TECH_TABS.find(t => t.id === ui.techTab);
    const ids = Object.keys(TECHS).filter(id => TECHS[id].tab === tab.id);
    // vertical tree: tiers run top to bottom, each branch is a column
    const NW = 116, NH = 62, CX = 122, CY = 84, LW = 62, HEAD = 30, PAD = 8;
    const nBranch = Math.max(tab.branches.length, ...ids.map(id => TECHS[id].row + 1));
    const width = LW + PAD + nBranch * CX, height = HEAD + tab.cols.length * CY + PAD;
    h += `<div class="treewrap"><div class="tree scroll"><div class="treeinner" style="width:${width}px;height:${height}px">`;
    tab.cols.forEach((c, i) => { h += `<div class="tierhead" style="top:${HEAD + i * CY}px;width:${LW - 8}px;height:${NH}px">${c}</div><div class="tierline" style="top:${HEAD + i * CY - 13}px;width:${width}px"></div>`; });
    for (let i = 0; i < nBranch; i++) h += `<div class="colhead" style="left:${LW + PAD + i * CX}px;width:${NW}px">${tab.branches[i] || ''}</div>`;
    h += `<svg class="links" width="${width}" height="${height}">`;
    const pos = id => [LW + PAD + TECHS[id].row * CX, HEAD + TECHS[id].col * CY];
    for (const id of ids) for (const r of TECHS[id].req || []) {
      if (TECHS[r].tab !== tab.id) continue;
      const [x1, y1] = pos(r), [x2, y2] = pos(id);
      let d;
      if (x1 === x2) d = `M${x1 + NW / 2},${y1 + NH} L${x2 + NW / 2},${y2}`;
      else if (y1 === y2) d = `M${x1 + (x2 > x1 ? NW : 0)},${y1 + NH / 2} L${x2 + (x2 > x1 ? 0 : NW)},${y2 + NH / 2}`;
      else d = `M${x1 + NW / 2},${y1 + NH} C${x1 + NW / 2},${y1 + NH + 22} ${x2 + NW / 2},${y2 - 22} ${x2 + NW / 2},${y2}`;
      h += `<path d="${d}" class="${G.techs[r] ? 'done' : ''}"/>`;
    }
    h += '</svg>';
    for (const id of ids) {
      const t = TECHS[id], st = techStatus(id);
      const [x, y] = pos(id);
      const cross = (t.req || []).filter(r => TECHS[r].tab !== tab.id && !G.techs[r]);
      let foot = '';
      if (st === 'done') foot = ic('check', '', '#8fd16a');
      else if (st === 'active') foot = `<div class="bar"><div style="width:${G.research.prog / t.days * 100}%"></div></div>`;
      else if (st === 'queued') foot = `<span class="queued">${ic('queue')} Queued #${G.researchQueue.indexOf(id) + 1}</span>`;
      else if (cross.length) foot = `<span class="need" title="Needs ${tip(cross.map(techName).join(', '))}">${ic('lock')} ${cross.map(techName).join(', ')}</span>`;
      else foot = costHTML(t.cost || {});
      h += `<div class="tnode ${st} ${ui.techSel === id ? 'sel' : ''} ${t.weapon ? 'cls-' + WEAPONS[t.weapon].cls : ''}" style="left:${x}px;top:${y}px;width:${NW}px;height:${NH}px" data-act="techsel" data-id="${id}" title="${tip(t.desc || WEAPONS[t.weapon].unit)}">
        <div class="tn-name">${techIcon(id)} ${techName(id)}</div>
        <div class="tn-foot">${foot}</div></div>`;
    }
    h += '</div></div>';
    h += `<div class="techdetail scroll">${techDetailHTML(ui.techSel)}</div></div>`;
    return h;
  }

  function techDetailHTML(id) {
    if (!id) return `<div class="empty">${ic('tech', 'huge')}</div>`;
    const t = TECHS[id], st = techStatus(id);
    let h = `<h3>${techIcon(id)} ${techName(id)}</h3>`;
    h += t.weapon ? weaponStatsHTML(t.weapon) : `<p>${t.desc}</p>`;
    if (t.req && t.req.length) h += `<div class="reqs">${t.req.map(r => `<span class="${G.techs[r] ? 'okc' : 'badc'}">${ic(G.techs[r] ? 'check' : 'lock')} ${techName(r)}</span>`).join('')}</div>`;
    if (st === 'done') h += `<p class="okc">${ic('check')} Researched</p>`;
    else if (st === 'active') h += `<p>${ic('clock')} Researching…</p>`;
    else if (st === 'queued') h += `<p>${ic('queue')} Queued</p><button class="wide" data-act="cancelresearch" data-id="${id}">${ic('close')} Remove from queue</button>`;
    else {
      h += `<div class="costrow">${costHTML(t.cost || {})} <span title="Days">${ic('clock')} ${t.days} days</span></div>`;
      const ok = st === 'avail' && canAfford(t.cost || {});
      h += `<button class="big wide" data-act="research" data-id="${id}" ${ok ? '' : 'disabled'}>${ic(G.research ? 'queue' : 'tech')} ${G.research ? 'Add to queue' : 'Research'}</button>`;
    }
    return h;
  }

  function weaponStatsHTML(w) {
    const d = WEAPONS[w], c = CLASSES[d.cls];
    const specials = [];
    if (d.volleys) specials.push(`${ic('bow')}×${d.volleys}`);
    if (d.pierce) specials.push(`${ic('armor')}−${Math.round(d.pierce * 100)}%`);
    if (d.crush) specials.push(`${ic('mace')} crush`);
    const strong = Object.entries(CLASS_BONUS[d.cls] || {}).filter(([, m]) => m > 1).map(([k]) => ic(CLASSES[k].icon, '', CLASSES[k].color));
    const weak = Object.keys(CLASS_BONUS).filter(k => (CLASS_BONUS[k][d.cls] || 1) > 1).map(k => ic(CLASSES[k].icon, '', CLASSES[k].color));
    return `<div class="wstats">
      <div class="statrow"><span title="Attack">${ic('sword')}${d.atk}</span><span title="Health">${ic('heart', '', '#e06666')}${d.hp}</span><span title="Armour">${ic('shield')}${d.armor}</span>${specials.map(s => `<span>${s}</span>`).join('')}</div>
      <div class="pro">＋ ${c.pros}</div><div class="con">－ ${c.cons}</div>
      ${strong.length ? `<div class="vs" title="Strong against">${ic('up', '', '#8fd16a')} ${strong.join('')}</div>` : ''}
      ${weak.length ? `<div class="vs" title="Weak against">${ic('up', 'flip', '#ff7b6b')} ${weak.join('')}</div>` : ''}
      <div class="costrow" title="Forging cost">${ic('anvil')} ${costHTML(d.cost)}</div></div>`;
  }

  function craftHTML() {
    const speed = forgeSpeed();
    let h = '<div class="craftwrap"><div class="craftgrid scroll">';
    for (const w in WEAPONS) {
      const d = WEAPONS[w];
      if (d.hidden || !weaponUnlocked(w)) continue;
      const c = CLASSES[d.cls];
      h += `<div class="wcard cls-${d.cls}" title="${tip(d.unit + ' · ' + (d.time / speed).toFixed(2) + ' days each')}">
        <div class="wc-top">${ic(c.icon, 'big', c.color)}<div><b>${d.name}</b><div class="statrow small"><span>${ic('sword')}${d.atk}</span><span>${ic('heart', '', '#e06666')}${d.hp}</span><span>${ic('shield')}${d.armor}</span></div></div>
        <span class="own" title="In armoury">${G.weapons[w] || 0}</span></div>
        <div class="wc-cost">${costHTML(d.cost)}</div>
        <div class="wc-btns">${[1, 5, 10, 25].map(n => `<button data-act="craft" data-w="${w}" data-n="${n}" ${canAfford(d.cost) ? '' : 'disabled'}>+${n}</button>`).join('')}</div></div>`;
    }
    h += `</div><div class="queue scroll"><h4>${ic('flame')} Forge queue</h4>`;
    if (!G.forgeQueue.length) h += `<div class="empty">${ic('anvil', 'huge')}</div>`;
    G.forgeQueue.forEach((q, i) => {
      const c = CLASSES[WEAPONS[q.w].cls];
      h += `<div class="qrow">${ic(c.icon, '', c.color)}<b>${q.n}</b><span class="qn">${WEAPONS[q.w].name}</span>${i === 0 ? `<div class="bar"><div style="width:${q.prog * 100}%"></div></div>` : ''}<button data-act="cancelq" data-i="${i}" title="Cancel">${ic('close')}</button></div>`;
    });
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    if (arm.length) {
      h += `<h4>${ic('shield')} Armoury</h4>` + arm.map(([w, n]) => `<div class="qrow">${ic(CLASSES[WEAPONS[w].cls].icon, '', CLASSES[WEAPONS[w].cls].color)}<b>${n}</b><span class="qn">${WEAPONS[w].name}</span></div>`).join('');
      h += `<button class="big wide" data-act="open" data-kind="army">${ic('battle')} Train soldiers</button>`;
    }
    h += '</div></div>';
    return h;
  }

  function guideHTML() {
    let h = '<div class="scroll guide"><table class="gtab">';
    for (const k in CLASSES) {
      if (k === 'militia') continue;
      const c = CLASSES[k];
      const strong = Object.entries(CLASS_BONUS[k]).filter(([, m]) => m > 1).map(([o, m]) => `${ic(CLASSES[o].icon, '', CLASSES[o].color)}×${m}`).join(' ');
      h += `<tr><td>${ic(c.icon, 'big', c.color)}</td><td><b>${c.name}</b></td><td class="pro">＋ ${c.pros}</td><td class="con">－ ${c.cons}</td><td title="Bonus damage vs">${strong || '—'}</td></tr>`;
    }
    return h + '</table></div>';
  }

  // ---------- Market ----------
  function marketHTML() {
    const q = ui.mktQuery.trim().toLowerCase();
    let h = `<div class="mktbar"><label class="search">${ic('search')}<input id="mkt-search" type="search" placeholder="Search goods" value="${tip(ui.mktQuery)}" autocomplete="off"></label>
      <div class="qtys">Amount ${[1, 10, 50, 100].map(n => `<button class="${ui.tradeQty === n ? 'on' : ''}" data-act="qty" data-q="${n}">${n}</button>`).join('')}</div></div>`;
    h += '<div class="scroll mtable"><table><tr><th>Goods</th><th>Have</th><th colspan="2">Sell price</th><th colspan="2">Buy price</th></tr>';
    let shown = 0;
    for (const r of RES_ORDER) {
      if (q && !RES[r].name.toLowerCase().includes(q) && !r.toLowerCase().includes(q)) continue;
      shown++;
      const sp = Sim.price(r, false), bp = Sim.price(r, true);
      const d = G.market[r] || 1;
      const tag = d < 0.95 ? `<i class="cheap" title="Price is down">▼</i>` : d > 1.05 ? `<i class="dear" title="Price is up">▲</i>` : '';
      h += `<tr><td>${resIc(r)} ${RES[r].name}${tag}</td><td>${fmt(G.res[r])}</td>
        <td class="num">${sp.toFixed(1)}</td><td><button data-act="sell" data-r="${r}" ${G.res[r] >= 1 ? '' : 'disabled'}>${ic('coin', '', '#f1c75b')} Sell ${ui.tradeQty}</button></td>
        <td class="num">${bp.toFixed(1)}</td><td><button data-act="buy" data-r="${r}" ${G.coins >= bp ? '' : 'disabled'}>${ic('bag')} Buy ${ui.tradeQty}</button></td></tr>`;
    }
    if (!shown) h += `<tr><td colspan="6" class="muted">Nothing matches “${tip(ui.mktQuery)}”</td></tr>`;
    return h + '</table></div>';
  }

  // ---------- Army / defence / world ----------
  // Army training and the unit guide share one window; everything else is its own tool
  function armyHTML() {
    let h = tabs([['army', ic('battle') + ' Train & Army'], ['guide', ic('shield') + ' Unit Guide']], ui.armyTab, 'armytab');
    return h + (ui.armyTab === 'guide' ? guideHTML() : armyTabHTML());
  }
  function unitRow(w, n, btns) {
    const d = WEAPONS[w], c = CLASSES[d.cls];
    return `<div class="urow" title="${tip(d.unit)}">${ic(c.icon, 'big', c.color)}<b>${n}</b><span class="qn">${d.unit}</span><span class="statrow small"><span>${ic('sword')}${d.atk}</span><span>${ic('heart', '', '#e06666')}${d.hp}</span><span>${ic('shield')}${d.armor}</span></span><span class="cr-btns">${btns}</span></div>`;
  }
  function armyTabHTML() {
    const b = armyBonuses();
    const home = Combat.power(G.army, b), away = G.campaigns.reduce((a, c) => a + Combat.power(c.units, b), 0);
    const rank = powerRank(home + away);
    let h = `<div class="powerbox" title="Fighting strength of your trained soldiers: attack, health, armour, volleys and research bonuses">
        <span class="pw-label">${ic('crown', '', '#f1c75b')} Army power</span><b class="pw-num">${fmt(home + away)}</b><span class="pw-rank">${rank.name}</span>
        <span class="pw-bar"><i style="width:${rank.pct}%"></i></span>
        ${away ? `<small class="muted">${fmt(home)} at home · ${fmt(away)} on campaign</small>` : ''}</div>
      <div class="armyhead"><span title="Soldiers (incl. training) / capacity">${ic('battle')} Soldiers ${totalSoldiers()} / ${armyCapacity()}</span>
      <span>${ic('pop')} Recruits available ${availableWorkers()}</span>
      <span>${ic('speed')} Training speed ×${trainSpeed().toFixed(1)}</span>
      ${b.atk > 1 ? `<span>${ic('sword')} Attack ×${b.atk.toFixed(2)}</span>` : ''}${b.armor ? `<span>${ic('shield')} Armour +${b.armor}</span>` : ''}</div>`;
    h += `<div class="cols2"><div class="scroll"><h4>${ic('shield')} Armoury · recruit</h4>`;
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    if (!arm.length) h += `<p class="muted">No weapons yet.</p><button class="big" data-act="open" data-kind="forge">${ic('anvil')} Forge weapons</button>`;
    for (const [w, n] of arm) {
      const d = WEAPONS[w], c = CLASSES[d.cls];
      h += `<div class="urow" title="${tip(d.unit + ' · fee ' + trainFee(w) + ' coins · ' + trainDays(w).toFixed(2) + ' days each')}">${ic(c.icon, 'big', c.color)}<span class="wname">${d.name}</span><b>×${n}</b>
        <span class="cr-btns">${[1, 5, 10].map(k => `<button data-act="recruit" data-w="${w}" data-n="${k}">+${k}</button>`).join('')}<button data-act="recruit" data-w="${w}" data-n="9999">All</button></span></div>
        <div class="feeline">${ic('coin', '', '#f1c75b')} ${trainFee(w)} each · ${ic('clock')} ${trainDays(w).toFixed(2)} days each</div>`;
    }
    h += `</div><div class="scroll">`;
    if (G.training.length) {
      h += `<h4>${ic('hourglass')} Training</h4>`;
      G.training.forEach((q, i) => {
        const c = CLASSES[WEAPONS[q.w].cls];
        h += `<div class="qrow">${ic(c.icon, '', c.color)}<b>${q.n}</b><span class="qn">${WEAPONS[q.w].unit}</span>${i === 0 ? `<div class="bar"><div style="width:${q.prog * 100}%"></div></div>` : ''}<button data-act="canceltrain" data-i="${i}" title="Cancel (refund)">${ic('close')}</button></div>`;
      });
    }
    h += `<h4>${ic('battle')} Army</h4>`;
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) h += `<p class="muted">No trained soldiers yet.</p>`;
    for (const [w, n] of units) h += unitRow(w, n, `<button data-act="disband" data-w="${w}" data-n="1" title="Disband">−1</button><button data-act="disband" data-w="${w}" data-n="10" title="Disband">−10</button>`);
    for (const c of G.campaigns) h += `<div class="camp">${ic('flag')} ${kingdomDef(c.target).name} ${ic(c.phase === 'march' ? 'arrowR' : 'house')} ${ic('clock')} ${c.t.toFixed(1)}d · ${unitsHTML(c.units)}</div>`;
    h += '</div></div>';
    return h;
  }

  function defenseHTML() {
    const def = Sim.defenders();
    const side = Sim.playerSide(def, true);
    const wall = has('stoneWalls') ? 'Stone walls −25%' : has('palisade') ? 'Palisade −10%' : 'Fence';
    let h = `<div class="defrow"><span>${ic('wall')} ${wall}</span>
      <span>${ic('tower')} Towers ${side.towers}</span>
      <span>${ic('militia')} Militia ${Sim.militiaCount()}</span></div>
      <div class="defrow">Defenders ${unitsHTML(def)}</div>`;
    const inc = G.raid.incoming;
    if (inc) {
      const e = Combat.estimate(Sim.kingdomSide(inc.from, inc.units, false), side);
      const kd = kingdomDef(inc.from), b = armyBonuses();
      h += `<div class="raidbox"><div>${ic('warn', 'big', '#ff6b5b')} <span class="dotc" style="background:${kd.color}"></span>${kd.name} ${ic('clock')} ${Math.max(0, inc.eta - G.time).toFixed(1)}d</div>
        <div>${unitsHTML(inc.units)}</div>
        <div class="defrow"><span>${ic('crown')} Their power ${fmt(Combat.power(inc.units))}</span><span>Yours ${fmt(Combat.power(def, b))}</span></div>
        <div class="odds" title="Chance to hold, from 160 simulated battles">${ic('shield')} Chance to hold ${oddsHTML(1 - e.win)}</div>
        <div class="muted small">Expected losses: you ~${Math.round(e.lostD)} · them ~${Math.round(e.lostA)}</div></div>`;
    } else h += `<div class="empty">${ic('shield', 'huge')}</div>`;
    return h;
  }
  function oddsHTML(p) {
    const pc = Math.max(1, Math.min(99, Math.round(p * 100)));
    return `<b class="${pc >= 70 ? 'okc' : pc >= 40 ? 'warn' : 'badc'}">${pc}%</b>`;
  }
  const POWER_RANKS = [[0, 'No army'], [20, 'Village guard'], [60, 'Warband'], [150, 'Company'], [350, 'Host'], [800, 'Legion'], [1800, 'Grand army'], [4000, 'Imperial army']];
  function powerRank(p) {
    let i = 0;
    while (i + 1 < POWER_RANKS.length && p >= POWER_RANKS[i + 1][0]) i++;
    const lo = POWER_RANKS[i][0], hi = POWER_RANKS[i + 1] ? POWER_RANKS[i + 1][0] : lo * 2;
    return { name: POWER_RANKS[i][1], pct: Math.round(Math.min(1, (p - lo) / Math.max(1, hi - lo)) * 100) };
  }

  // ---------- Bank: every stock, its trend, and what shows in the top bar ----------
  function bankHTML() {
    const row = (k, name, icon, have, toggle) => {
      const r = Sim.rate(k);
      const rateTxt = r === null ? '<span class="muted">—</span>' : `<span class="${r > 0.05 ? 'okc' : r < -0.05 ? 'badc' : 'muted'}">${r >= 0 ? '+' : '−'}${fmt(Math.abs(r))}</span>`;
      const on = toggle && G.topRes.includes(k);
      return `<tr><td>${icon} ${name}</td><td class="num">${fmt(have)}</td><td class="num">${rateTxt}</td>
        <td>${toggle ? `<button class="tog ${on ? 'on' : ''}" data-act="toptoggle" data-r="${k}" title="Show in the top bar">${ic(on ? 'check' : 'close')} ${on ? 'Shown' : 'Hidden'}</button>` : '<span class="muted small">always</span>'}</td></tr>`;
    };
    let h = `<div class="bankhead"><span>${ic('clock')} Average change per day over the last ${Math.max(1, Math.round(((G.hist.at(-1) || {}).t - ((G.hist[0] || {}).t || 0)) * 10) / 10 || 0)} days</span>
      <button data-act="topreset">${ic('queue')} Default top bar</button></div>
      <div class="scroll mtable"><table><tr><th>Stock</th><th>Have</th><th>Per day</th><th>Top bar</th></tr>`;
    h += row('coins', 'Coins', ic('coin', '', '#f1c75b'), G.coins, false);
    h += row('food', 'Food', resIc('food'), G.res.food, false);
    for (const r of RES_ORDER) if (r !== 'food') h += row(r, RES[r].name, resIc(r), G.res[r], true);
    return h + '</table></div>';
  }

  function worldHTML() {
    const owned = G.kingdoms.filter(k => k.conquered).length;
    return `<div class="cols2 world"><div class="wm-wrap"><div id="wm-slot" class="wm-slot"></div>
      <div class="wm-hint">${ic('crown', '', '#f1c75b')} ${owned} / ${KINGDOMS.length} cities · drag to turn, scroll to zoom, click a city</div></div>
      <div class="scroll kdetail">${kingdomDetailHTML(ui.mapSel)}</div></div>`;
  }

  function kingdomDetailHTML(id) {
    if (!id) return `<div class="empty">${ic('map', 'huge')}<p class="muted">Click a city on the map.</p></div>`;
    const kd = kingdomDef(id), ks = kingdomState(id);
    const gar = Sim.roundUnits(ks.garrison);
    let h = `<h3><span class="dotc" style="background:${kd.color}"></span>${kd.name}</h3><div class="sub">${kd.desc} · ${kd.ruler}</div>`;
    if (ks.conquered) return h + `<p class="okc">${ic('crown', 'big')}</p>`;
    h += `<div class="defrow"><span>${ic('clock')} March ${Sim.marchDays(id).toFixed(1)} days</span><span>${ic('speed')} Power ${Combat.power(gar)}</span></div>
      <div class="defrow">Garrison ${unitsHTML(gar)}</div>
      <div class="defrow">Spoils ${gainHTML(kd.loot)} <span>${ic('wall')} +${kd.land} land</span></div>`;
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) return h + `<p class="muted">${ic('battle')} 0</p>`;
    h += '<div class="sendbox"><h4>Send soldiers</h4>';
    for (const [w, n] of units) {
      const sel = Math.min(ui.attackSel[w] ?? n, n);
      ui.attackSel[w] = sel;
      const c = CLASSES[WEAPONS[w].cls];
      h += `<div class="selrow" title="${tip(WEAPONS[w].unit)}">${ic(c.icon, '', c.color)}<span class="qn">${WEAPONS[w].unit}</span><span>
        <button data-act="asel" data-w="${w}" data-d="-10">−10</button><button data-act="asel" data-w="${w}" data-d="-1">−</button>
        <b>${sel}</b><button data-act="asel" data-w="${w}" data-d="1">+</button><button data-act="asel" data-w="${w}" data-d="10">+10</button></span></div>`;
    }
    const send = {};
    for (const [w] of units) if (ui.attackSel[w] > 0) send[w] = ui.attackSel[w];
    if (unitCount(send)) {
      const e = Combat.estimate(Sim.playerSide(send, false), Sim.kingdomSide(id, gar, true));
      h += `<div class="defrow"><span title="From 160 simulated battles, counting every unit's strengths and weaknesses">${ic('trophy')} Chance to win ${oddsHTML(e.win)}</span>
        <span>${ic('crown')} Power ${fmt(Combat.power(send, armyBonuses()))} vs ${fmt(Combat.power(gar))}</span></div>
        <div class="muted small">Expected losses: you ~${Math.round(e.lostA)} · them ~${Math.round(e.lostD)}</div>
        <button class="big wide" data-act="attack" data-id="${id}">${ic('flag')} March</button>`;
    }
    return h + '</div>';
  }

  // ---------- Expeditions ----------
  function expHTML() {
    const avail = availableWorkers();
    ui.expPeople = Math.max(1, Math.min(ui.expPeople, Math.max(1, avail)));
    let h = '<div class="exps">';
    for (const t in EXPEDITIONS) {
      const e = EXPEDITIONS[t];
      h += `<button class="expcard ${ui.expType === t ? 'on' : ''}" data-act="exptype" data-t="${t}">
        <b>${e.name}</b>${t === 'ore' ? `<span class="ores">${ORE_TYPES.map(o => resIc(o)).join('')}</span>` : resIc(t)}<small>${ic('clock')} ${e.days}d</small></button>`;
    }
    h += '</div>';
    const story = ui.expType === 'wood' && ui.expPeople >= 50 && G.stats.woodGathered < 100;
    const gain = {};
    for (const [k, v] of Object.entries(EXPEDITIONS[ui.expType].yield)) gain[k] = Math.max(story ? 100 : 0, Math.round(v * ui.expPeople * Sim.expBonus()));
    h += `<div class="selrow big">${ic('pop')} Villagers<span>
        <button data-act="exppeople" data-d="-25">−25</button><button data-act="exppeople" data-d="-5">−5</button>
        <b>${ui.expPeople}</b>
        <button data-act="exppeople" data-d="5">+5</button><button data-act="exppeople" data-d="25">+25</button></span>
        <span class="gain">${ic('arrowR')} ${Object.entries(gain).map(([k, n]) => `${resIc(k)}~${n}`).join(' ')}</span></div>
      ${ui.expPeople > idleCitizens() ? `<div class="warnline">${ic('warn')} ${ic('worker')} −${ui.expPeople - idleCitizens()}</div>` : ''}
      <button class="big wide" data-act="sendexp" ${avail >= ui.expPeople && G.expeditions.length < Sim.expSlots() ? '' : 'disabled'}>${ic('compass')} Send expedition</button>
      <div class="explist">`;
    for (const e of G.expeditions) h += `<div class="qrow">${ic(EXPEDITIONS[e.type].icon)}<b>${e.people}</b><div class="bar"><div style="width:${(1 - e.t / e.total) * 100}%"></div></div><small>${e.t.toFixed(1)}d</small></div>`;
    h += `<div class="muted small">Out now: ${G.expeditions.length} / ${Sim.expSlots()}</div></div>`;
    return h;
  }

  function helpHTML() {
    const row = (icon, text) => `<div class="hrow">${ic(icon, 'big')}<span>${text}</span></div>`;
    return `<div class="scroll guide">
      ${row('map', 'Drag or WASD to move. Scroll or Q / E to zoom. Hold Shift with A / D to turn and W / S to tilt (or right-drag).')}
      ${row('hammer', 'Build opens the building tray. Pick one, click inside the walls. Right-click to stop.')}
      ${row('anvil', 'Each tool at the bottom opens its own window: Tech Tree, Forge, Market, Bank, Army, Defence, World Map.')}
      ${row('coin', 'The Bank shows every stock and its average change per day, and picks what shows in the top bar.')}
      ${row('coin', 'Coins come from selling at the Market and from battle loot.')}
      ${row('furnace', 'Each refinery makes one material. Set how much it refines with its slider.')}
      ${row('battle', 'Mix unit types. Every class has a counter.')}
      ${row('pause', 'Space pauses. 1 · 2 · 3 set speed.')}
      <div class="rowbtns"><button data-act="tutrestart">${ic('compass')} Tutorial</button>
      <button data-act="newgame" class="danger ${ui.armed === 'newgame' ? 'armed' : ''}">${ui.armed === 'newgame' ? 'Click again — progress will be lost' : 'New game'}</button></div></div>`;
  }

  // ---------------------------------------------------------
  //  Toasts, intro, game over
  // ---------------------------------------------------------
  function toast(msg, kind = 'info', icon) {
    const el = document.createElement('div');
    el.className = 'toast t-' + kind;
    el.innerHTML = (icon ? ic(icon) : '') + `<span>${msg}</span>`;
    $('toasts').prepend(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.remove('in'), 2800);
    setTimeout(() => el.remove(), 3300);
    while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  }
  function floatText(msg) {
    const el = document.createElement('div');
    el.className = 'floattext';
    el.innerHTML = ic('pop') + msg;
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
  function showIntro() {
    const saved = hasSave();
    $('intro').innerHTML = `<div class="intro-inner">
      ${ic('anvil', 'hero')}
      <h1>Emberfall</h1>
      <p>The town's blacksmith. Now its ruler.</p>
      <div class="intro-btns"><button class="big" data-act="newgame">${ic('flame')} New game</button>
      ${saved ? `<button class="big" data-act="continue">${ic('play')} Continue</button>` : ''}</div></div>`;
    $('intro').classList.remove('hidden');
  }
  function gameOver(won) {
    G.paused = true;
    $('intro').innerHTML = `<div class="intro-inner">
      ${ic(won ? 'crown' : 'skull', 'hero')}
      <h1>${won ? 'Emperor' : 'Fallen'}</h1>
      <p>${ic('clock')} ${day()}</p>
      <div class="intro-btns"><button class="big" data-act="newgame">${ic('flame')} New game</button>${won ? `<button class="big" data-act="keepplaying">${ic('play')}</button>` : ''}</div></div>`;
    $('intro').classList.remove('hidden');
    if (!won) deleteSave();
  }

  // ---------------------------------------------------------
  //  Input
  // ---------------------------------------------------------
  function onClick(e) {
    const t = e.target.closest('[data-act],[data-speed]');
    if (!t || t.disabled) return;
    if (t.dataset.speed !== undefined) {
      const s = +t.dataset.speed;
      if (s === 0) G.paused = true; else { G.paused = false; G.speed = s; }
      renderTop();
      return;
    }
    const a = t.dataset.act, d = t.dataset;
    if (a !== 'demolish' && a !== 'newgame') ui.armed = null;
    switch (a) {
      case 'save': toast('', saveGame() ? 'good' : 'bad', 'save'); break;
      case 'help': openModal('help'); break;
      case 'open': openModal(d.kind, d.tab || null); break;
      case 'select': ui.selected = G.buildings.find(b => b.id === +d.bid); break;
      case 'deselect': ui.selected = null; Render.selected = null; break;
      case 'stopplace': stopPlacing(); break;
      case 'place': startPlacing(d.type); break;
      case 'ore': ui.selected.ore = d.ore; break;
      case 'upgrade': Sim.upgradeBuilding(ui.selected); break;
      case 'buildtray': ui.buildOpen = !ui.buildOpen; if (!ui.buildOpen && ui.placing) stopPlacing(); break;
      case 'pause': ui.selected.paused = !ui.selected.paused; break;
      case 'demolish':
        if (ui.armed === 'demolish' + ui.selected.id) { Sim.demolish(ui.selected); ui.selected = null; ui.armed = null; Render.terrainDirty = true; }
        else ui.armed = 'demolish' + ui.selected.id;
        break;
      case 'techtab': ui.techTab = d.tab; ui.techSel = null; break;
      case 'techsel': ui.techSel = d.id; break;
      case 'research': if (!Sim.startResearch(d.id)) toast('Not available yet', 'bad', 'lock'); break;
      case 'cancelresearch': Sim.cancelResearch(d.id); break;
      case 'canceltrain': Sim.cancelTraining(+d.i); break;
      case 'music': Music.toggle(); break;
      case 'craft': { const n = Sim.queueWeapon(d.w, +d.n); if (!n) toast('', 'bad', 'bag'); break; }
      case 'cancelq': Sim.cancelQueue(+d.i); break;
      case 'qty': ui.tradeQty = +d.q; break;
      case 'sell': case 'buy': {
        const r = Sim.trade(d.r, ui.tradeQty, a === 'buy');
        if (r) toast(`${a === 'buy' ? '+' : '−'}${r.qty} ${resIc(d.r)} ${a === 'buy' ? '−' : '+'}${r.total.toFixed(0)} ${resIc('coins')}`, 'good');
        break;
      }
      case 'armytab': ui.armyTab = d.tab; break;
      case 'recruit': {
        const n = Sim.recruit(d.w, +d.n);
        if (!n) toast(totalSoldiers() >= armyCapacity() ? 'Barracks full' : G.coins < trainFee(d.w) ? 'Not enough coins' : 'No free villagers', 'bad', 'battle');
        else toast(`${n} recruits training`, 'good', 'hourglass');
        break;
      }
      case 'disband': Sim.disband(d.w, +d.n); break;
      case 'mapsel': ui.mapSel = d.id; ui.attackSel = {}; break;
      case 'asel': ui.attackSel[d.w] = Math.max(0, Math.min(G.army[d.w] || 0, (ui.attackSel[d.w] || 0) + +d.d)); break;
      case 'attack': {
        const send = {};
        for (const w in ui.attackSel) if (ui.attackSel[w] > 0) send[w] = ui.attackSel[w];
        if (Sim.launchCampaign(d.id, send)) { ui.attackSel = {}; closeModal(); }
        break;
      }
      case 'exptype': ui.expType = d.t; break;
      case 'exppeople': ui.expPeople = Math.max(1, Math.min(availableWorkers(), ui.expPeople + +d.d)); break;
      case 'sendexp': if (Sim.startExpedition(ui.expType, ui.expPeople)) closeModal(); break;
      case 'toptoggle': G.topRes = G.topRes.includes(d.r) ? G.topRes.filter(x => x !== d.r) : RES_ORDER.filter(x => x === d.r || G.topRes.includes(x)); break;
      case 'topreset': G.topRes = DEFAULT_TOP.slice(); break;
      case 'tutskip': G.tut = -1; break;
      case 'tutdone': G.tut = -1; break;
      case 'tutrestart': G.tut = 0; closeModal(); break;
      case 'newgame':
        if (G && G.started && $('intro').classList.contains('hidden') && ui.armed !== 'newgame') { ui.armed = 'newgame'; break; }
        ui.armed = null;
        Main.startNew(); return;
      case 'continue': Main.continueGame(); return;
      case 'keepplaying': $('intro').classList.add('hidden'); G.paused = false; return;
    }
    refreshAll();
  }
  function onInput(e) {
    if (e.target.id === 'mkt-search') { ui.mktQuery = e.target.value; renderModal(); }
    if (e.target.id === 'ref-pct' && ui.selected) {
      ui.selected.pct = +e.target.value;
      const b = e.target.parentElement.querySelector('b');
      if (b) b.textContent = ui.selected.pct + '%';
    }
  }

  function startPlacing(type) {
    const d = BUILDINGS[type];
    if (d.requires && !has(d.requires)) { toast(techName(d.requires), 'bad', 'lock'); return; }
    ui.placing = ui.placing === type ? null : type;
    Render.ghost = null;
    if (ui.placing) { ui.selected = null; Render.selected = null; }
    $('placehint').classList.toggle('hidden', !ui.placing);
    if (ui.placing) $('placehint').innerHTML = `${ic(d.icon)} ${d.name} ${costHTML(d.cost)}`;
    renderBottom(); renderSide();
  }
  function stopPlacing() { ui.placing = null; Render.ghost = null; $('placehint').classList.add('hidden'); renderBottom(); renderSide(); }
  function tryPlace(tx, ty) {
    const type = ui.placing;
    if (!type) return;
    const d = BUILDINGS[type];
    if (!canPlace(type, tx, ty) || !pay(d.cost)) return;
    placeBuilding(type, tx, ty, false);
    Render.terrainDirty = true;
    renderBottom(); renderTop();
    if (!canAfford(d.cost)) stopPlacing();
  }

  function refreshAll() {
    renderTop(); renderAlert(); renderBottom(); renderSide();
    if (ui.modal) renderModal();
    renderTutorial();
  }

  function init() {
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('input', onInput);
    $('modal-close').innerHTML = ic('close');
    $('modal-close').addEventListener('click', closeModal);
    $('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  }

  return {
    ui, init, refreshAll, renderTop, renderAlert, renderBottom, renderSide, renderModal, renderTutorial, openModal, closeModal,
    toast, floatText, showIntro, gameOver, setHover, updateHoverPop, startPlacing, stopPlacing, tryPlace,
    select(b) {
      if (b && BUILDINGS[b.type].unique) b = null;      // command-square buildings are run from the toolbar
      ui.selected = b; Render.selected = b; ui.armed = null; renderSide();
    },
    closeBuild() { ui.buildOpen = false; renderBottom(); },
    isModalOpen() { return !!ui.modal || Battle.active() || !$('intro').classList.contains('hidden'); },
  };
})();
