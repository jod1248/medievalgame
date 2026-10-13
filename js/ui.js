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
    armed: null,
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
    const wages = Sim.wagesPerDay();
    const f = Sim.foodPerDay();
    const fd = f.prod - f.use;
    const cap = housingCapacity();
    const chips = [
      chip(ic('coin', '', '#f1c75b'), fmt(G.coins), `−${wages.toFixed(1)}`, `Coins · wages ${wages.toFixed(1)}/day`, 'neg'),
      chip(ic('pop'), `${G.pop}<small>/${cap}</small>`, '', `People ${G.pop} / ${cap} · idle ${idleCitizens()} · workers ${employedWorkers()} · soldiers ${totalSoldiers()}`),
      chip(resIc('food'), fmt(G.res.food), `${fd >= 0 ? '+' : ''}${fd.toFixed(1)}`, 'Food per day', fd < 0 ? 'neg' : 'pos'),
    ];
    for (const r of RES_ORDER) {
      if (r === 'food') continue;
      if (G.res[r] < 0.5 && !['wood', 'stone'].includes(r)) continue;
      chips.push(chip(resIc(r), fmt(G.res[r]), '', RES[r].name));
    }
    setHTML($('resbar'), chips.join(''));
    const sp = G.paused ? 0 : G.speed;
    const night = Render.daylight() < 0.5;
    setHTML($('daybox'), `<span class="clock" title="Day ${day()}">${ic(night ? 'moon' : 'sun', '', night ? '#c9d4ff' : '#ffd36b')}<b>${day()}</b></span>
      ${[[0, 'pause', 'Pause · Space'], [1, 'play', 'Normal · 1'], [2, 'fast', 'Fast · 2'], [4, 'faster', 'Fastest · 3']].map(([v, i, t]) =>
        `<button class="spd ${sp === v ? 'on' : ''}" data-speed="${v}" title="${t}">${ic(i)}</button>`).join('')}
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
    setHTML(el, `<button class="alertpill" data-act="open" data-kind="army" data-tab="defense" title="Raid from ${kd.name}">
      ${ic('warn', '', '#ff6b5b')}<span class="dotc" style="background:${kd.color}"></span>${ic('pop')}<b>${unitCount(inc.units)}</b>
      ${ic('clock')}<b>${Math.max(0, inc.eta - G.time).toFixed(1)}d</b></button>`);
  }

  // ---------------------------------------------------------
  //  Tutorial
  // ---------------------------------------------------------
  const TUT = [
    { text: 'Send 50 villagers to gather wood', target: '#act-exp', done: () => G.expeditions.some(e => e.type === 'wood') || G.stats.woodGathered >= 100 },
    { text: 'Wait for the wood to arrive', done: () => G.stats.woodGathered >= 100, progress: () => { const e = G.expeditions.find(e => e.type === 'wood'); return e ? 1 - e.t / e.total : 1; } },
    { text: 'Build 5 houses', target: '[data-type=house]', done: () => G.stats.housesBuilt >= 5, progress: () => G.stats.housesBuilt / 5, reward: { wood: 60, coins: 60 } },
    { text: 'Open the Forge tech tree', target: '#act-tech', pulse: 'forge', done: () => (ui.modal && ui.modal.kind === 'forge' && ui.forgeTab === 'tech') || G.research || G.stats.researched > 0 },
    { text: 'Research Basic Refinery', target: '.tnode[data-id=ref1]', done: () => (G.research && G.research.id === 'ref1') || has('ref1'), before: () => { ui.techTab = 'refining'; } },
    { text: 'Build a Sawmill', target: '[data-type=sawmill]', done: () => G.buildings.some(b => b.type === 'sawmill'), reward: { wood: 40, stone: 20 } },
    { text: 'Forge 5 weapons', target: '#act-forge', done: () => G.stats.weaponsForged >= 5, progress: () => G.stats.weaponsForged / 5 },
    { text: 'Train 5 soldiers', target: '#act-army', done: () => G.stats.recruited >= 5, progress: () => G.stats.recruited / 5 },
    { text: 'Sell goods to pay wages', target: '#act-market', done: () => G.stats.trades >= 1 },
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
    if (st.target) document.querySelectorAll(st.target).forEach(e => e.classList.add('tut-glow'));
    if (st.pulse) Render.pulse = findBuilding(st.pulse);
  }

  // ---------------------------------------------------------
  //  Bottom build bar
  // ---------------------------------------------------------
  function renderBottom() {
    let h = '<div class="buildlist">';
    for (const t of BUILD_MENU) {
      const d = BUILDINGS[t];
      const locked = d.requires && !has(d.requires);
      if (locked && d.refinery && d.requires !== 'ref1') continue;   // keep the bar short
      const afford = canAfford(d.cost);
      h += `<button class="bbtn ${ui.placing === t ? 'on' : ''} ${locked ? 'locked' : ''} ${!afford ? 'poor' : ''}" data-act="place" data-type="${t}"
        title="${tip(d.name + ' — ' + d.desc + (locked ? ' (needs ' + techName(d.requires) + ')' : ''))}">
        ${ic(d.icon, 'bi')}<span class="bc">${locked ? ic('lock') : costHTML(d.cost)}</span></button>`;
    }
    h += '</div><div class="actlist">';
    for (const [id, icon, act, kind, tab, title] of [
      ['act-exp', 'compass', 'open', 'townhall', '', 'Expeditions'],
      ['act-tech', 'tech', 'open', 'forge', 'tech', 'Tech tree'],
      ['act-forge', 'anvil', 'open', 'forge', 'craft', 'Forge weapons'],
      ['act-market', 'scales', 'open', 'market', '', 'Market'],
      ['act-army', 'battle', 'open', 'army', 'army', 'Army'],
      ['act-map', 'map', 'open', 'army', 'map', 'World'],
    ]) h += `<button id="${id}" class="abtn" data-act="${act}" data-kind="${kind}" data-tab="${tab}" title="${title}">${ic(icon)}</button>`;
    h += '</div>';
    setHTML($('bottom'), h);
  }

  // ---------------------------------------------------------
  //  Hover popup over a building
  // ---------------------------------------------------------
  function setHover(b) {
    if (b) { ui.hoverB = b; ui.hoverHideT = 0; }
    Render.hover = b;
  }
  function updateHoverPop(dt, overPop) {
    const pop = $('hoverpop');
    if (!Render.hover && !overPop) {
      ui.hoverHideT += dt;
      if (ui.hoverHideT > 0.45) ui.hoverB = null;
    }
    const b = ui.hoverB;
    if (!b || ui.placing || !G.buildings.includes(b)) { pop.classList.remove('show'); return; }
    const [sx, sy] = Render.buildingScreenTop(b);
    pop.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    const d = BUILDINGS[b.type];
    let btns;
    switch (b.type) {
      case 'forge': btns = `<button data-act="open" data-kind="forge" data-tab="tech" title="Tech tree">${ic('tech')}</button><button data-act="open" data-kind="forge" data-tab="craft" title="Forge weapons">${ic('anvil')}</button>`; break;
      case 'market': btns = `<button data-act="open" data-kind="market" title="Trade">${ic('scales')}</button>`; break;
      case 'barracks': btns = `<button data-act="open" data-kind="army" data-tab="army" title="Army">${ic('battle')}</button><button data-act="open" data-kind="army" data-tab="map" title="World">${ic('map')}</button>`; break;
      case 'townhall': btns = `<button data-act="open" data-kind="townhall" title="Expeditions">${ic('compass')}</button>`; break;
      default: btns = '';
    }
    btns += `<button data-act="select" data-bid="${b.id}" title="${b.level < d.maxLevel ? 'Upgrade' : 'Details'}">${ic(b.level < d.maxLevel ? 'up' : 'help')}</button>`;
    setHTML(pop, `<div class="hp-title">${ic(d.icon)}${d.name}${d.maxLevel > 1 ? ` <i>${TIER_NAMES[b.level]}</i>` : ''}</div><div class="hp-btns">${btns}</div>`);
    pop.classList.add('show');
  }

  // ---------------------------------------------------------
  //  Side panel: selected building
  // ---------------------------------------------------------
  function prodRate(b) {
    const d = BUILDINGS[b.type];
    let rate = d.rate[b.level - 1] * b.workers * Sim.efficiency();
    if (b.type === 'farm') rate *= (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
    if (['lumber', 'quarry', 'mine'].includes(b.type) && has('tools')) rate *= 1.25;
    if (b.type === 'mine' && has('deepMining')) rate *= 1.5;
    if (b.type === 'stables' && has('husbandry')) rate *= 1.5;
    return rate;
  }
  function renderSide() {
    const el = $('side');
    const b = ui.selected;
    if (!b || !G.buildings.includes(b)) { el.classList.remove('show'); ui.selected = null; return; }
    el.classList.add('show');
    const d = BUILDINGS[b.type];
    let h = `<button class="close" data-act="deselect">${ic('close')}</button>
      <h2>${ic(d.icon)} ${d.name} ${d.maxLevel > 1 ? `<span class="tier">${TIER_NAMES[b.level]}</span>` : ''}</h2>`;
    if (b.built < 1) {
      h += `<div class="bar"><div style="width:${b.built * 100}%"></div></div>`;
    } else {
      const stats = [];
      if (d.workers) stats.push(`<span title="Workers">${ic('worker')} ${b.workers}/${d.workers[b.level - 1]}</span>`);
      if (d.produces) {
        const key = d.produces === 'ore' ? b.ore : d.produces;
        stats.push(`<span title="Per day">${resIc(key)} +${prodRate(b).toFixed(1)}</span>`);
      }
      if (b.type === 'house') stats.push(`<span title="Residents">${ic('pop')} ${Math.floor(d.capacity[b.level - 1] * (has('architecture') ? 1.25 : 1))}</span>`);
      if (b.type === 'watchtower') stats.push(`<span title="Firepower">${ic('bow')} ${12 * b.level}</span>`);
      if (b.type === 'forge') stats.push(`<span title="Speed">${ic('speed')} ×${d.speed[b.level - 1]}</span>`);
      if (b.type === 'market') stats.push(`<span title="Trade margin">${ic('scales')} ${(d.spread[b.level - 1] * 100).toFixed(0)}%</span>`);
      if (b.type === 'barracks') stats.push(`<span title="Army size">${ic('battle')} ${armyCapacity()}</span>`);
      if (b.type === 'townhall') stats.push(`<span title="Expeditions">${ic('compass')} ${d.expSlots[b.level - 1]}</span>`);
      h += `<div class="stats">${stats.join('')}</div>`;
      if (b.type === 'mine') h += '<div class="opts">' + ORE_TYPES.map(o => `<button class="${b.ore === o ? 'on' : ''}" data-act="ore" data-ore="${o}" title="${RES[o].name}">${resIc(o)}</button>`).join('') + '</div>';
      if (d.refinery) {
        const r = RECIPES[d.recipe];
        const full = Sim.refinerySpeed(b) / r.time;
        const perDay = full * b.pct / 100;
        h += `<div class="recipe">${costHTML(r.in, perDay)} ${ic('arrowR')} ${costHTML(r.out, perDay)}<small>/day</small></div>
          <div class="slider"><input type="range" id="ref-pct" min="0" max="100" step="5" value="${b.pct}" aria-label="Refine percent">
          <b>${b.pct}%</b></div>
          ${b.starved ? `<div class="warnline">${ic('warn')} ${costHTML(r.in)}</div>` : ''}`;
      }
      if (d.unique) {
        const map = { forge: ['forge', 'tech', 'tech'], market: ['market', '', 'scales'], barracks: ['army', 'army', 'battle'], townhall: ['townhall', '', 'compass'] };
        const [k, t, i] = map[b.type];
        h += `<button class="big wide" data-act="open" data-kind="${k}" data-tab="${t}">${ic(i)}</button>`;
      }
      if (b.upg !== undefined) {
        h += `<div class="upbox">${ic('hammer')}<div class="bar"><div style="width:${b.upg * 100}%"></div></div></div>`;
      } else if (b.level < d.maxLevel) {
        const req = d.upgradeReq && d.upgradeReq[b.level];
        const locked = req && !has(req);
        const cost = d.upgrade[b.level];
        h += `<div class="upbox"><span class="tier">${TIER_NAMES[b.level]} ${ic('arrowR')} ${TIER_NAMES[b.level + 1]}</span>
          ${locked ? `<span class="lockline">${ic('lock')} ${techName(req)}</span>` : `<span>${costHTML(cost)}</span>`}
          <button class="big" data-act="upgrade" title="Upgrade" ${locked || !canAfford(cost) ? 'disabled' : ''}>${ic('up')}</button></div>`;
      }
      h += '<div class="rowbtns">';
      if (d.workers) h += `<button data-act="pause" title="${b.paused ? 'Resume' : 'Pause'}">${ic(b.paused ? 'play' : 'pause')}</button>`;
      if (!d.unique) h += `<button class="danger ${ui.armed === 'demolish' + b.id ? 'armed' : ''}" data-act="demolish" title="${ui.armed === 'demolish' + b.id ? 'Click again to demolish' : 'Demolish'}">${ic('trash')}${ui.armed === 'demolish' + b.id ? ' ?' : ''}</button>`;
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
    if (kind === 'forge' && tab) ui.forgeTab = tab;
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
      case 'forge': title = ic('anvil') + ' Forge'; html = forgeHTML(); break;
      case 'market': title = ic('scales') + ' Market'; html = marketHTML(); break;
      case 'army': title = ic('battle') + ' War'; html = armyHTML(); break;
      case 'townhall': title = ic('compass') + ' Expeditions'; html = expHTML(); break;
      case 'help': title = ic('help') + ' Help'; html = helpHTML(); break;
    }
    setHTML($('modal-title'), title);
    if (!setHTML(body, html)) return;
    body.querySelectorAll('.scroll').forEach((e, i) => { if (scrolls[i]) { e.scrollLeft = scrolls[i][0]; e.scrollTop = scrolls[i][1]; } });
    if (focusId && $(focusId)) { const f = $(focusId); f.focus(); if (sel != null && f.setSelectionRange) f.setSelectionRange(sel, sel); }
    renderTutorial();
  }
  function tabs(list, cur, act) {
    return '<div class="tabs">' + list.map(([id, label, title]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-tab="${id}" title="${title || ''}">${label}</button>`).join('') + '</div>';
  }

  // ---------- Forge ----------
  function forgeHTML() {
    const f = findBuilding('forge');
    let h = tabs([['tech', ic('tech'), 'Tech tree'], ['craft', ic('anvil'), 'Forge weapons'], ['guide', ic('shield'), 'Unit matchups']], ui.forgeTab, 'forgetab');
    if (ui.forgeTab === 'tech') h += techTreeHTML(f);
    else if (ui.forgeTab === 'craft') h += craftHTML(f);
    else h += guideHTML();
    return h;
  }
  function techStatus(id) {
    if (G.techs[id]) return 'done';
    if (G.research && G.research.id === id) return 'active';
    if (techAvailable(id)) return 'avail';
    return 'locked';
  }
  function techIcon(id) {
    const t = TECHS[id];
    if (t.icon) return ic(t.icon);
    return ic(CLASSES[WEAPONS[t.weapon].cls].icon, '', CLASSES[WEAPONS[t.weapon].cls].color);
  }

  function techTreeHTML(f) {
    let h = '';
    if (G.research) {
      const t = TECHS[G.research.id];
      h += `<div class="researching">${techIcon(G.research.id)} <b>${techName(G.research.id)}</b>
        <div class="bar"><div style="width:${G.research.prog / t.days * 100}%"></div></div>
        <small>${ic('clock')} ${Math.max(0, (t.days - G.research.prog) / BUILDINGS.forge.speed[f.level - 1]).toFixed(1)}d</small>
        <button data-act="cancelresearch" title="Cancel">${ic('close')}</button></div>`;
    }
    h += '<div class="tabs sub">' + TECH_TABS.map(t => `<button class="${ui.techTab === t.id ? 'on' : ''}" data-act="techtab" data-tab="${t.id}">${t.name}</button>`).join('') + '</div>';
    const tab = TECH_TABS.find(t => t.id === ui.techTab);
    const ids = Object.keys(TECHS).filter(id => TECHS[id].tab === tab.id);
    const NW = 150, NH = 58, CX = 182, CY = 76, PAD = 16;
    const maxRow = Math.max(...ids.map(id => TECHS[id].row));
    const width = PAD * 2 + tab.cols.length * CX, height = PAD + 22 + (maxRow + 1) * CY;
    h += `<div class="treewrap"><div class="tree scroll"><div class="treeinner" style="width:${width}px;height:${height}px">`;
    tab.cols.forEach((c, i) => { h += `<div class="colhead" style="left:${PAD + i * CX}px;width:${NW}px">${c}</div>`; });
    h += `<svg class="links" width="${width}" height="${height}">`;
    const pos = id => [PAD + TECHS[id].col * CX, PAD + 22 + TECHS[id].row * CY];
    for (const id of ids) for (const r of TECHS[id].req || []) {
      if (TECHS[r].tab !== tab.id) continue;
      const [x1, y1] = pos(r), [x2, y2] = pos(id);
      let d;
      if (y1 === y2) d = `M${x1 + NW},${y1 + NH / 2} L${x2},${y2 + NH / 2}`;
      else if (x1 === x2) d = `M${x1 + NW / 2},${y1 + NH} L${x2 + NW / 2},${y2}`;
      else d = `M${x1 + NW},${y1 + NH / 2} C${x1 + NW + 20},${y1 + NH / 2} ${x2 - 20},${y2 + NH / 2} ${x2},${y2 + NH / 2}`;
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
    if (st === 'done') h += `<p class="okc">${ic('check')}</p>`;
    else if (st !== 'active') {
      h += `<div class="costrow">${costHTML(t.cost || {})} <span title="Days">${ic('clock')} ${t.days}</span></div>`;
      const ok = st === 'avail' && !G.research && canAfford(t.cost || {});
      h += `<button class="big wide" data-act="research" data-id="${id}" ${ok ? '' : 'disabled'} title="Research">${ic('tech')} Research</button>`;
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

  function craftHTML(f) {
    const speed = BUILDINGS.forge.speed[f.level - 1];
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
    h += `</div><div class="queue scroll"><h4>${ic('flame')}</h4>`;
    if (!G.forgeQueue.length) h += `<div class="empty">${ic('anvil', 'huge')}</div>`;
    G.forgeQueue.forEach((q, i) => {
      const c = CLASSES[WEAPONS[q.w].cls];
      h += `<div class="qrow">${ic(c.icon, '', c.color)}<b>${q.n}</b><span class="qn">${WEAPONS[q.w].name}</span>${i === 0 ? `<div class="bar"><div style="width:${q.prog * 100}%"></div></div>` : ''}<button data-act="cancelq" data-i="${i}" title="Cancel">${ic('close')}</button></div>`;
    });
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    if (arm.length) {
      h += `<h4>${ic('shield')}</h4>` + arm.map(([w, n]) => `<div class="qrow">${ic(CLASSES[WEAPONS[w].cls].icon, '', CLASSES[WEAPONS[w].cls].color)}<b>${n}</b><span class="qn">${WEAPONS[w].name}</span></div>`).join('');
      h += `<button class="big wide" data-act="open" data-kind="army" data-tab="army">${ic('battle')} ${ic('arrowR')}</button>`;
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
    let h = '<div class="mkthead">';
    h += '<div class="tabs">' + KINGDOMS.map(k => `<button class="${ui.partner === k.id ? 'on' : ''}" data-act="partner" data-id="${k.id}" title="${tip(k.desc)}"><span class="dotc" style="background:${k.color}"></span>${k.name}${kingdomState(k.id).conquered ? ic('crown', '', '#f1c75b') : ''}</button>`).join('') + '</div>';
    h += `<div class="mktbar"><label class="search">${ic('search')}<input id="mkt-search" type="search" placeholder="Search" value="${tip(ui.mktQuery)}" autocomplete="off"></label>
      <div class="qtys">${[1, 10, 50, 100].map(n => `<button class="${ui.tradeQty === n ? 'on' : ''}" data-act="qty" data-q="${n}">${n}</button>`).join('')}</div></div></div>`;
    const kd = kingdomDef(ui.partner);
    h += '<div class="scroll mtable"><table><tr><th></th><th>' + ic('bag') + '</th><th colspan="2">Sell</th><th colspan="2">Buy</th></tr>';
    let shown = 0;
    for (const r of RES_ORDER) {
      if (q && !RES[r].name.toLowerCase().includes(q) && !r.toLowerCase().includes(q)) continue;
      shown++;
      const sp = Sim.price(ui.partner, r, false), bp = Sim.price(ui.partner, r, true);
      const mod = kd.trade[r] || 1;
      const tag = mod < 1 ? `<i class="cheap" title="Cheap here">▼</i>` : mod > 1 ? `<i class="dear" title="In demand here">▲</i>` : '';
      h += `<tr><td>${resIc(r)} ${RES[r].name}${tag}</td><td>${fmt(G.res[r])}</td>
        <td class="num">${sp.toFixed(1)}</td><td><button data-act="sell" data-r="${r}" ${G.res[r] >= 1 ? '' : 'disabled'} title="Sell ${ui.tradeQty}">${ic('coin', '', '#f1c75b')}−${ui.tradeQty}</button></td>
        <td class="num">${bp.toFixed(1)}</td><td><button data-act="buy" data-r="${r}" ${G.coins >= bp ? '' : 'disabled'} title="Buy ${ui.tradeQty}">${ic('bag')}+${ui.tradeQty}</button></td></tr>`;
    }
    if (!shown) h += `<tr><td colspan="6" class="muted">No match for “${tip(ui.mktQuery)}”</td></tr>`;
    return h + '</table></div>';
  }

  // ---------- Army / defence / world ----------
  function armyHTML() {
    let h = tabs([['army', ic('battle'), 'Army'], ['defense', ic('wall'), 'Defence'], ['map', ic('map'), 'World']], ui.armyTab, 'armytab');
    if (ui.armyTab === 'army') h += armyTabHTML();
    else if (ui.armyTab === 'defense') h += defenseHTML();
    else h += worldHTML();
    return h;
  }
  function unitRow(w, n, btns) {
    const d = WEAPONS[w], c = CLASSES[d.cls];
    return `<div class="urow" title="${tip(d.unit)}">${ic(c.icon, 'big', c.color)}<b>${n}</b><span class="qn">${d.unit}</span><span class="statrow small"><span>${ic('sword')}${d.atk}</span><span>${ic('heart', '', '#e06666')}${d.hp}</span><span>${ic('shield')}${d.armor}</span></span><span class="cr-btns">${btns}</span></div>`;
  }
  function armyTabHTML() {
    const b = armyBonuses();
    let h = `<div class="armyhead"><span title="Soldiers / capacity">${ic('battle')} ${totalSoldiers()}/${armyCapacity()}</span>
      <span title="Pay per soldier per day">${ic('coin', '', '#f1c75b')} ${WAGE_SOLDIER}/d</span>
      <span title="Training cost">${ic('up')} ${RECRUIT_COST}</span>
      <span title="Available citizens">${ic('pop')} ${availableWorkers()}</span>
      <span title="Army power">${ic('speed')} ${Combat.power(G.army)}</span>
      ${b.atk > 1 ? `<span title="Attack bonus">${ic('sword')} ×${b.atk.toFixed(2)}</span>` : ''}${b.armor ? `<span title="Armour bonus">${ic('shield')} +${b.armor}</span>` : ''}</div>`;
    h += `<div class="cols2"><div class="scroll"><h4>${ic('shield')} Armoury</h4>`;
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    if (!arm.length) h += `<button class="big" data-act="open" data-kind="forge" data-tab="craft">${ic('anvil')} ${ic('arrowR')}</button>`;
    for (const [w, n] of arm) h += unitRow(w, n, [1, 10].map(k => `<button data-act="recruit" data-w="${w}" data-n="${k}" title="Train">+${k}</button>`).join('') + `<button data-act="recruit" data-w="${w}" data-n="9999" title="Train all">${ic('plus')}</button>`);
    h += `</div><div class="scroll"><h4>${ic('battle')} Army</h4>`;
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) h += `<div class="empty">${ic('battle', 'huge')}</div>`;
    for (const [w, n] of units) h += unitRow(w, n, `<button data-act="disband" data-w="${w}" data-n="1" title="Disband">−1</button><button data-act="disband" data-w="${w}" data-n="10" title="Disband">−10</button>`);
    for (const c of G.campaigns) h += `<div class="camp">${ic('flag')} ${kingdomDef(c.target).name} ${ic(c.phase === 'march' ? 'arrowR' : 'house')} ${ic('clock')} ${c.t.toFixed(1)}d · ${unitsHTML(c.units)}</div>`;
    h += '</div></div>';
    return h;
  }

  function defenseHTML() {
    const def = Sim.defenders();
    const side = Sim.playerSide(def, true);
    const wall = has('stoneWalls') ? 'Stone walls −25%' : has('palisade') ? 'Palisade −10%' : 'Fence';
    let h = `<div class="defrow"><span title="${wall}">${ic('wall')} ${has('stoneWalls') ? '−25%' : has('palisade') ? '−10%' : '0%'}</span>
      <span title="Watchtower firepower">${ic('tower')} ${side.towers}</span>
      <span title="Militia (idle villagers)">${ic('militia')} ${Sim.militiaCount()}</span></div>
      <div class="defrow">${unitsHTML(def)}</div>`;
    const inc = G.raid.incoming;
    if (inc) {
      const p = Combat.forecast(Sim.kingdomSide(inc.from, inc.units, false), side);
      const kd = kingdomDef(inc.from);
      h += `<div class="raidbox"><div>${ic('warn', 'big', '#ff6b5b')} <span class="dotc" style="background:${kd.color}"></span>${kd.name} ${ic('clock')} ${Math.max(0, inc.eta - G.time).toFixed(1)}d</div>
        <div>${unitsHTML(inc.units)}</div><div class="odds" title="Chance to hold">${ic('shield')} ${oddsHTML(1 - p)}</div></div>`;
    } else h += `<div class="empty">${ic('shield', 'huge')}</div>`;
    return h;
  }
  function oddsHTML(p) {
    const pc = Math.round(p * 100);
    return `<b class="${pc >= 70 ? 'okc' : pc >= 40 ? 'warn' : 'badc'}">${pc}%</b>`;
  }

  function worldHTML() {
    const W = 560, H = 440, cx = W / 2, cy = H / 2 - 6;
    let h = '<div class="cols2 world"><div><svg class="worldmap" viewBox="0 0 ' + W + ' ' + H + '">';
    h += `<defs><radialGradient id="land" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#7ea35a"/><stop offset="100%" stop-color="#4f6b3a"/></radialGradient></defs>`;
    h += `<rect width="${W}" height="${H}" fill="url(#land)" rx="10"/>`;
    const kpos = k => { const a = k.angle * Math.PI / 180, r = 40 + k.dist * 22; return [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r]; };
    for (const k of KINGDOMS) { const [x, y] = kpos(k); h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#c8b07a" stroke-width="3" stroke-dasharray="6 4"/>`; }
    const owned = G.kingdoms.filter(k => k.conquered).length;
    h += `<circle cx="${cx}" cy="${cy}" r="${26 + owned * 4}" fill="#3b6fc4" opacity="0.35"/><circle cx="${cx}" cy="${cy}" r="15" fill="#3b6fc4" stroke="#ffd75a" stroke-width="3"/>
      <use href="#i-castle" x="${cx - 9}" y="${cy - 9}" width="18" height="18" fill="#fff" color="#fff"/>`;
    for (const c of G.campaigns) {
      const [x, y] = kpos(kingdomDef(c.target));
      const p = c.phase === 'march' ? 1 - c.t / c.total : c.t / c.total;
      h += `<use href="#i-flag" x="${cx + (x - cx) * p - 9}" y="${cy + (y - cy) * p - 18}" width="18" height="18" color="#ffd75a"/>`;
    }
    for (const k of KINGDOMS) {
      const [x, y] = kpos(k), ks = kingdomState(k.id);
      h += `<g class="wk ${ui.mapSel === k.id ? 'sel' : ''}" data-act="mapsel" data-id="${k.id}">
        <circle cx="${x}" cy="${y}" r="21" fill="${ks.conquered ? '#3b6fc4' : k.color}" stroke="${ui.mapSel === k.id ? '#ffd75a' : '#222'}" stroke-width="3"/>
        <use href="#i-${ks.conquered ? 'crown' : 'castle'}" x="${x - 11}" y="${y - 11}" width="22" height="22" color="${ks.conquered ? '#ffd75a' : '#fff'}"/>
        <text x="${x}" y="${y + 37}" class="wlabel">${k.name}</text></g>`;
    }
    h += '</svg></div><div class="scroll kdetail">' + kingdomDetailHTML(ui.mapSel) + '</div></div>';
    return h;
  }

  function kingdomDetailHTML(id) {
    if (!id) return `<div class="empty">${ic('map', 'huge')}</div>`;
    const kd = kingdomDef(id), ks = kingdomState(id);
    const gar = Sim.roundUnits(ks.garrison);
    let h = `<h3><span class="dotc" style="background:${kd.color}"></span>${kd.name}</h3>`;
    if (ks.conquered) return h + `<p class="okc">${ic('crown', 'big')}</p>`;
    h += `<div class="defrow"><span title="March days">${ic('clock')} ${Sim.marchDays(id).toFixed(1)}d</span><span title="Garrison power">${ic('speed')} ${Combat.power(gar)}</span></div>
      <div class="defrow">${unitsHTML(gar)}</div>
      <div class="defrow" title="Spoils">${ic('bag')} ${gainHTML(kd.loot)} <span title="More land">${ic('wall')} +${kd.land}</span></div>`;
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) return h + `<p class="muted">${ic('battle')} 0</p>`;
    h += '<div class="sendbox">';
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
      const p = Combat.forecast(Sim.playerSide(send, false), Sim.kingdomSide(id, gar, true));
      h += `<div class="defrow"><span title="Chance of victory">${ic('trophy')} ${oddsHTML(p)}</span></div>
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
      h += `<button class="expcard ${ui.expType === t ? 'on' : ''}" data-act="exptype" data-t="${t}" title="${e.name}">
        ${t === 'ore' ? `<span class="ores">${ORE_TYPES.map(o => resIc(o)).join('')}</span>` : resIc(t)}<small>${ic('clock')} ${e.days}d</small></button>`;
    }
    h += '</div>';
    const story = ui.expType === 'wood' && ui.expPeople >= 50 && G.stats.woodGathered < 100;
    const gain = {};
    for (const [k, v] of Object.entries(EXPEDITIONS[ui.expType].yield)) gain[k] = Math.max(story ? 100 : 0, Math.round(v * ui.expPeople * Sim.expBonus()));
    h += `<div class="selrow big">${ic('pop')}<span>
        <button data-act="exppeople" data-d="-25">−25</button><button data-act="exppeople" data-d="-5">−5</button>
        <b>${ui.expPeople}</b>
        <button data-act="exppeople" data-d="5">+5</button><button data-act="exppeople" data-d="25">+25</button></span>
        <span class="gain">${ic('arrowR')} ${Object.entries(gain).map(([k, n]) => `${resIc(k)}~${n}`).join(' ')}</span></div>
      ${ui.expPeople > idleCitizens() ? `<div class="warnline">${ic('warn')} ${ic('worker')} −${ui.expPeople - idleCitizens()}</div>` : ''}
      <button class="big wide" data-act="sendexp" ${avail >= ui.expPeople && G.expeditions.length < Sim.expSlots() ? '' : 'disabled'}>${ic('compass')} Send</button>
      <div class="explist">`;
    for (const e of G.expeditions) h += `<div class="qrow">${ic(EXPEDITIONS[e.type].icon)}<b>${e.people}</b><div class="bar"><div style="width:${(1 - e.t / e.total) * 100}%"></div></div><small>${e.t.toFixed(1)}d</small></div>`;
    h += `<div class="muted small">${ic('compass')} ${G.expeditions.length}/${Sim.expSlots()}</div></div>`;
    return h;
  }

  function helpHTML() {
    const row = (icon, text) => `<div class="hrow">${ic(icon, 'big')}<span>${text}</span></div>`;
    return `<div class="scroll guide">
      ${row('map', 'Drag or WASD to move. Scroll to zoom.')}
      ${row('house', 'Pick a building below, click inside the walls. Right-click to stop.')}
      ${row('coin', 'No taxes. Sell goods at the Market to pay wages.')}
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
      case 'deselect': ui.selected = null; break;
      case 'place': startPlacing(d.type); break;
      case 'ore': ui.selected.ore = d.ore; break;
      case 'upgrade': Sim.upgradeBuilding(ui.selected); break;
      case 'pause': ui.selected.paused = !ui.selected.paused; break;
      case 'demolish':
        if (ui.armed === 'demolish' + ui.selected.id) { Sim.demolish(ui.selected); ui.selected = null; ui.armed = null; Render.terrainDirty = true; }
        else ui.armed = 'demolish' + ui.selected.id;
        break;
      case 'forgetab': ui.forgeTab = d.tab; break;
      case 'techtab': ui.techTab = d.tab; ui.techSel = null; break;
      case 'techsel': ui.techSel = d.id; break;
      case 'research': if (!Sim.startResearch(d.id)) toast('', 'bad', 'lock'); break;
      case 'cancelresearch': Sim.cancelResearch(); break;
      case 'craft': { const n = Sim.queueWeapon(d.w, +d.n); if (!n) toast('', 'bad', 'bag'); break; }
      case 'cancelq': Sim.cancelQueue(+d.i); break;
      case 'partner': ui.partner = d.id; break;
      case 'qty': ui.tradeQty = +d.q; break;
      case 'sell': case 'buy': {
        const r = Sim.trade(ui.partner, d.r, ui.tradeQty, a === 'buy');
        if (r) toast(`${a === 'buy' ? '+' : '−'}${r.qty} ${resIc(d.r)} ${a === 'buy' ? '−' : '+'}${r.total.toFixed(0)} ${resIc('coins')}`, 'good');
        break;
      }
      case 'armytab': ui.armyTab = d.tab; break;
      case 'recruit': if (!Sim.recruit(d.w, +d.n)) toast('', 'bad', totalSoldiers() >= armyCapacity() ? 'battle' : G.coins < RECRUIT_COST ? 'coin' : 'pop'); break;
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
    $('placehint').classList.toggle('hidden', !ui.placing);
    if (ui.placing) $('placehint').innerHTML = `${ic(d.icon)} ${d.name} ${costHTML(d.cost)}`;
    renderBottom();
  }
  function stopPlacing() { ui.placing = null; Render.ghost = null; $('placehint').classList.add('hidden'); renderBottom(); }
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
    select(b) { ui.selected = b; ui.armed = null; renderSide(); },
    isModalOpen() { return !!ui.modal || Battle.active() || !$('intro').classList.contains('hidden'); },
  };
})();
