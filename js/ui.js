// ============================================================
//  HTML user interface: top bar, panels, modals, popups
// ============================================================

const UI = (() => {
  const $ = id => document.getElementById(id);
  const ui = {
    modal: null,          // { kind, tab, sel }
    selected: null,       // building shown in side panel
    placing: null,        // building type being placed
    expPeople: 50, expType: 'wood',
    techTab: 'melee', techSel: null,
    forgeTab: 'tech',
    partner: 'oakhold', tradeQty: 10,
    armyTab: 'army', mapSel: null, attackSel: {},
    reports: [],
    hoverB: null, hoverHideT: 0,
  };

  // ---------------------------------------------------------
  //  Top bar
  // ---------------------------------------------------------
  function renderTop() {
    const tax = Sim.taxPerDay(), wages = Sim.wagesPerDay(), trib = Sim.tributePerDay();
    const net = tax + trib - wages;
    const f = Sim.foodPerDay();
    const cap = housingCapacity();
    const chips = [];
    chips.push(chip('🪙', fmt(G.coins), `${net >= 0 ? '+' : ''}${net.toFixed(1)}/day`, `Coins\nTaxes +${tax.toFixed(1)}/day\nTribute +${trib.toFixed(1)}/day\nWages −${wages.toFixed(1)}/day`, net < 0 ? 'neg' : 'pos'));
    chips.push(chip('👥', `${G.pop}/${cap}`, `${idleCitizens()} idle`, `Population ${G.pop} / housing ${cap}\nWorkers: ${employedWorkers()}\nIdle: ${idleCitizens()}\nOn expedition: ${peopleOnExpedition()}\nSoldiers: ${totalSoldiers()}`));
    const fd = f.prod - f.use;
    chips.push(chip('🍞', fmt(G.res.food), `${fd >= 0 ? '+' : ''}${fd.toFixed(1)}/day`, `Food\nFarms +${f.prod.toFixed(1)}/day\nEaten −${f.use.toFixed(1)}/day`, fd < 0 ? 'neg' : 'pos'));
    for (const r of RES_ORDER) {
      if (r === 'food') continue;
      if (G.res[r] < 0.5 && !['wood', 'stone'].includes(r)) continue;
      chips.push(chip(RES[r].icon, fmt(G.res[r]), '', RES[r].name));
    }
    $('resbar').innerHTML = chips.join('');
    document.documentElement.style.setProperty('--toph', $('top').offsetHeight + 'px');
    const sp = G.paused ? 0 : G.speed;
    $('daybox').innerHTML = `<b>Day ${day()}</b>
      <button class="spd ${sp === 0 ? 'on' : ''}" data-speed="0" title="Pause (Space)">⏸</button>
      <button class="spd ${sp === 1 ? 'on' : ''}" data-speed="1" title="Normal (1)">▶</button>
      <button class="spd ${sp === 2 ? 'on' : ''}" data-speed="2" title="Fast (2)">⏩</button>
      <button class="spd ${sp === 4 ? 'on' : ''}" data-speed="4" title="Very fast (3)">⏭</button>
      <button class="spd" data-act="save" title="Save game">💾</button>
      <button class="spd" data-act="help" title="How to play">❔</button>`;
  }
  function chip(icon, val, sub, title, cls = '') {
    return `<div class="rchip" title="${title}"><span class="ri">${icon}</span><span class="rv">${val}</span>${sub ? `<span class="rs ${cls}">${sub}</span>` : ''}</div>`;
  }

  // ---------------------------------------------------------
  //  Objectives + log
  // ---------------------------------------------------------
  function renderLeft() {
    let h = '<h3>📜 Objectives</h3><ol class="objs">';
    for (let i = Math.max(0, G.obj - 1); i < Math.min(OBJECTIVES.length, G.obj + 3); i++) {
      const o = OBJECTIVES[i];
      const cls = i < G.obj ? 'done' : i === G.obj ? 'cur' : 'next';
      h += `<li class="${cls}">${i < G.obj ? '✔ ' : ''}${o.text}</li>`;
    }
    h += '</ol>';
    if (G.raid.incoming) {
      const inc = G.raid.incoming;
      const left = Math.max(0, inc.eta - G.time);
      h += `<div class="raidbox"><b>⚠️ Raid incoming!</b><br>${unitCount(inc.units)} men from ${kingdomDef(inc.from).name}<br>Arrives in ${left.toFixed(1)} days
        <br><button data-act="open" data-kind="army" data-tab="defense">Prepare defences</button></div>`;
    }
    h += '<h3>📖 Chronicle</h3><div class="log">';
    for (const l of G.log.slice(0, 7)) h += `<div class="l-${l.kind}"><span>D${l.day}</span> ${l.msg}</div>`;
    h += '</div>';
    $('left').innerHTML = h;
  }

  // ---------------------------------------------------------
  //  Bottom build bar
  // ---------------------------------------------------------
  function renderBottom() {
    let h = '<div class="buildlist">';
    for (const t of BUILD_MENU) {
      const d = BUILDINGS[t];
      const locked = d.requires && !has(d.requires);
      const afford = canAfford(d.cost);
      h += `<button class="bbtn ${ui.placing === t ? 'on' : ''} ${locked ? 'locked' : ''} ${!afford ? 'poor' : ''}" data-act="place" data-type="${t}"
        title="${d.name}: ${d.desc}${locked ? '\nRequires research: ' + techName(d.requires) : ''}">
        <span class="bn">${buildIcon(t)} ${d.name}</span><span class="bc">${locked ? '🔒 ' + techName(d.requires) : costHTML(d.cost)}</span></button>`;
    }
    h += '</div><div class="actlist">';
    h += `<button data-act="open" data-kind="townhall" data-tab="exp">🧭 Expeditions</button>`;
    h += `<button data-act="open" data-kind="forge" data-tab="tech">⚒️ Tech Tree</button>`;
    h += `<button data-act="open" data-kind="forge" data-tab="craft">🔨 Forge</button>`;
    h += `<button data-act="open" data-kind="market">⚖️ Market</button>`;
    h += `<button data-act="open" data-kind="army" data-tab="army">⚔️ Army</button>`;
    h += `<button data-act="open" data-kind="army" data-tab="map">🗺️ World</button>`;
    h += '</div>';
    $('bottom').innerHTML = h;
  }
  function buildIcon(t) {
    return { house: '🏠', farm: '🌾', lumber: '🪓', quarry: '🪨', mine: '⛏️', refinery: '🏭', watchtower: '🗼', stables: '🐎', townhall: '🏛️', forge: '⚒️', market: '⚖️', barracks: '⚔️' }[t];
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
      if (ui.hoverHideT > 0.5) ui.hoverB = null;
    }
    const b = ui.hoverB;
    if (!b || ui.placing || !G.buildings.includes(b)) { pop.classList.add('hidden'); pop.dataset.bid = ''; return; }
    const [sx, sy] = Render.buildingScreenTop(b);
    pop.style.left = sx + 'px';
    pop.style.top = sy + 'px';
    if (pop.dataset.bid !== String(b.id) || pop.dataset.lv !== String(b.level)) {
      pop.dataset.bid = b.id; pop.dataset.lv = b.level;
      const d = BUILDINGS[b.type];
      let btns = '';
      switch (b.type) {
        case 'forge': btns = `<button data-act="open" data-kind="forge" data-tab="tech">⚒️ Tech Tree</button><button data-act="open" data-kind="forge" data-tab="craft">🔨 Craft</button>`; break;
        case 'market': btns = `<button data-act="open" data-kind="market">⚖️ Trade</button>`; break;
        case 'barracks': btns = `<button data-act="open" data-kind="army" data-tab="army">⚔️ Army</button><button data-act="open" data-kind="army" data-tab="map">🗺️ World Map</button>`; break;
        case 'townhall': btns = `<button data-act="open" data-kind="townhall" data-tab="exp">🧭 Expeditions</button><button data-act="open" data-kind="townhall" data-tab="overview">📜 Realm</button>`; break;
        default: btns = `<button data-act="select" data-bid="${b.id}">${b.level < d.maxLevel ? '⬆️ Upgrade' : 'ℹ️ Details'}</button>`;
      }
      pop.innerHTML = `<div class="hp-title">${d.name}${d.maxLevel > 1 ? ` <small>Lv ${b.level}</small>` : ''}</div><div class="hp-btns">${btns}</div>`;
    }
    pop.classList.remove('hidden');
  }

  // ---------------------------------------------------------
  //  Side panel: selected building
  // ---------------------------------------------------------
  function renderSide() {
    const el = $('side');
    const b = ui.selected;
    if (!b || !G.buildings.includes(b)) { el.classList.add('hidden'); ui.selected = null; return; }
    el.classList.remove('hidden');
    const d = BUILDINGS[b.type];
    let h = `<button class="close" data-act="deselect">✕</button>
      <h2>${buildIcon(b.type)} ${d.name}</h2>
      <div class="lvl">${d.maxLevel > 1 ? `Level ${b.level} / ${d.maxLevel}` : ''}${b.type === 'refinery' ? ' — ' + REFINERY_TIER_NAMES[b.level] : ''}</div>
      <p class="desc">${d.desc}</p>`;
    if (b.built < 1) {
      h += `<div class="bar"><div style="width:${b.built * 100}%"></div></div><p>Under construction…</p>`;
    } else {
      if (d.workers) {
        const slots = d.workers[b.level - 1];
        h += `<div class="stat">👷 Workers: <b>${b.workers} / ${slots}</b>${b.paused ? ' (paused)' : b.workers < slots ? ' <span class="warn">— not enough idle citizens</span>' : ''}</div>`;
      }
      if (d.produces) {
        const key = d.produces === 'ore' ? b.ore : d.produces;
        let rate = d.rate[b.level - 1] * b.workers * Sim.efficiency();
        if (b.type === 'farm') rate *= (has('cropRotation') ? 1.3 : 1) * (has('husbandry') ? 1.2 : 1);
        if (['lumber', 'quarry', 'mine'].includes(b.type) && has('tools')) rate *= 1.25;
        if (b.type === 'mine' && has('deepMining')) rate *= 1.5;
        if (b.type === 'stables' && has('husbandry')) rate *= 1.5;
        h += `<div class="stat">📦 Producing <b>${rate.toFixed(1)} ${RES[key].icon} ${RES[key].name}</b> per day</div>`;
      }
      if (b.type === 'house') h += `<div class="stat">🛏️ Houses <b>${Math.floor(d.capacity[b.level - 1] * (has('architecture') ? 1.25 : 1))}</b> people</div>`;
      if (b.type === 'mine') {
        h += '<div class="opts"><b>Ore:</b> ' + ORE_TYPES.map(o => `<button class="${b.ore === o ? 'on' : ''}" data-act="ore" data-ore="${o}">${RES[o].icon} ${RES[o].name}</button>`).join('') + '</div>';
      }
      if (b.type === 'refinery') {
        const speed = REFINERY_SPEED[b.level - 1] * (has('bellows') ? 1.25 : 1);
        h += `<div class="stat">⚡ Speed ×${speed.toFixed(2)} ${b.starved ? '<span class="warn">— missing inputs!</span>' : ''}</div>`;
        h += `<div class="bar"><div style="width:${Math.min(1, b.prog) * 100}%"></div></div>`;
        h += '<div class="recipes"><b>Recipe:</b>';
        for (const id in RECIPES) {
          const r = RECIPES[id];
          const locked = r.tier > b.level;
          const perDay = speed / r.time;
          h += `<button class="recipe ${b.recipe === id ? 'on' : ''}" ${locked ? 'disabled' : ''} data-act="recipe" data-recipe="${id}">
            ${costHTML(r.in)} → ${costHTML(r.out)} ${locked ? `<small>🔒 Tier ${r.tier}</small>` : `<small>${perDay.toFixed(1)}/day</small>`}</button>`;
        }
        h += '</div>';
      }
      if (b.type === 'watchtower') h += `<div class="stat">🏹 Tower firepower: <b>${12 * b.level}</b></div>`;
      if (d.unique) {
        const map = { forge: ['forge', 'tech', '⚒️ Open Tech Tree'], market: ['market', null, '⚖️ Open Market'], barracks: ['army', 'army', '⚔️ Open Army'], townhall: ['townhall', 'exp', '🧭 Expeditions'] };
        const [k, t, label] = map[b.type];
        h += `<button class="big" data-act="open" data-kind="${k}" data-tab="${t || ''}">${label}</button>`;
        if (b.type === 'forge') h += `<div class="stat">Research & crafting speed ×${d.speed[b.level - 1]}</div>`;
        if (b.type === 'market') h += `<div class="stat">Trade margin ${(d.spread[b.level - 1] * 100).toFixed(0)}%</div>`;
        if (b.type === 'barracks') h += `<div class="stat">Army capacity ${d.capacity[b.level - 1]}</div>`;
        if (b.type === 'townhall') h += `<div class="stat">Tax ${d.tax[b.level - 1]} 🪙 per citizen per day</div>`;
      }
      // upgrade
      if (b.upg !== undefined) {
        h += `<div class="upbox">Upgrading… <div class="bar"><div style="width:${b.upg * 100}%"></div></div></div>`;
      } else if (b.level < d.maxLevel) {
        const req = d.upgradeReq && d.upgradeReq[b.level];
        const locked = req && !has(req);
        const cost = d.upgrade[b.level];
        h += `<div class="upbox"><b>Upgrade to level ${b.level + 1}</b>${upgradeText(b)}<br>${locked ? `🔒 Requires research: <b>${techName(req)}</b>` : costHTML(cost)}
          <br><button class="big" data-act="upgrade" ${locked || !canAfford(cost) ? 'disabled' : ''}>⬆️ Upgrade</button></div>`;
      } else if (d.maxLevel > 1) h += `<div class="upbox">Fully upgraded ★</div>`;
      if (d.workers) h += `<button data-act="pause">${b.paused ? '▶ Resume work' : '⏸ Pause (free workers)'}</button>`;
      if (!d.unique) h += ` <button class="danger" data-act="demolish">${ui.armed === 'demolish' + b.id ? '⚠️ Click again to demolish (50% refund)' : '🗑 Demolish'}</button>`;
    }
    el.innerHTML = h;
  }
  function upgradeText(b) {
    const d = BUILDINGS[b.type], n = b.level;
    if (b.type === 'house') return `<br><small>Capacity ${d.capacity[n - 1]} → ${d.capacity[n]}</small>`;
    if (d.workers && d.rate) return `<br><small>Workers ${d.workers[n - 1]} → ${d.workers[n]}, output per worker +${Math.round((d.rate[n] / d.rate[n - 1] - 1) * 100)}%</small>`;
    if (b.type === 'refinery') return `<br><small>${REFINERY_TIER_NAMES[n + 1]}: speed ×${REFINERY_SPEED[n]}, new recipes</small>`;
    if (b.type === 'forge') return `<br><small>Speed ×${d.speed[n - 1]} → ×${d.speed[n]}</small>`;
    if (b.type === 'market') return `<br><small>Trade margin ${d.spread[n - 1] * 100}% → ${d.spread[n] * 100}%</small>`;
    if (b.type === 'barracks') return `<br><small>Army capacity ${d.capacity[n - 1]} → ${d.capacity[n]}</small>`;
    if (b.type === 'townhall') return `<br><small>Tax ${d.tax[n - 1]} → ${d.tax[n]} per citizen</small>`;
    if (b.type === 'watchtower') return `<br><small>Firepower 12 → 24</small>`;
    return '';
  }

  // ---------------------------------------------------------
  //  Modals
  // ---------------------------------------------------------
  function openModal(kind, tab) {
    ui.modal = { kind };
    if (kind === 'forge' && tab) ui.forgeTab = tab;
    if (kind === 'army' && tab) ui.armyTab = tab;
    if (kind === 'townhall') ui.thTab = tab || ui.thTab || 'exp';
    $('modal').classList.remove('hidden');
    renderModal(true);
  }
  function closeModal() { ui.modal = null; $('modal').classList.add('hidden'); }

  function renderModal(force) {
    if (!ui.modal) return;
    const body = $('modal-body');
    if (!force && (document.activeElement && body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) return;
    const scrolls = [...body.querySelectorAll('.scroll')].map(e => [e.scrollLeft, e.scrollTop]);
    let title = '', html = '';
    switch (ui.modal.kind) {
      case 'forge': title = '⚒️ The Forge'; html = forgeHTML(); break;
      case 'market': title = '⚖️ Marketplace'; html = marketHTML(); break;
      case 'army': title = '⚔️ Barracks & War Room'; html = armyHTML(); break;
      case 'townhall': title = '🏛️ Town Hall'; html = townhallHTML(); break;
      case 'help': title = '❔ How to play'; html = helpHTML(); break;
    }
    $('modal-title').innerHTML = title;
    body.innerHTML = html;
    body.querySelectorAll('.scroll').forEach((e, i) => { if (scrolls[i]) { e.scrollLeft = scrolls[i][0]; e.scrollTop = scrolls[i][1]; } });
  }
  function tabs(list, cur, act) {
    return '<div class="tabs">' + list.map(([id, label]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-tab="${id}">${label}</button>`).join('') + '</div>';
  }

  // ---------- Forge: tech tree / crafting ----------
  function forgeHTML() {
    const f = findBuilding('forge');
    let h = tabs([['tech', '🌳 Tech Tree'], ['craft', '🔨 Craft Weapons'], ['guide', '📘 Unit Guide']], ui.forgeTab, 'forgetab');
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
    if (t.icon) return t.icon;
    return { sword: '🗡️', axe: '🪓', mace: '🔨', spear: '🔱', javelin: '🎯', ranged: '🏹', cavalry: '🐎' }[WEAPONS[t.weapon].cls];
  }

  function techTreeHTML(f) {
    let h = '';
    if (G.research) {
      const t = TECHS[G.research.id];
      h += `<div class="researching">🔬 Researching <b>${techName(G.research.id)}</b>
        <div class="bar"><div style="width:${G.research.prog / t.days * 100}%"></div></div>
        <small>${Math.max(0, (t.days - G.research.prog) / BUILDINGS.forge.speed[f.level - 1]).toFixed(1)} days left</small>
        <button data-act="cancelresearch">Cancel</button></div>`;
    } else h += `<div class="researching idle">Pick a technology to research. Research speed ×${BUILDINGS.forge.speed[f.level - 1]} (upgrade the Forge to go faster).</div>`;
    h += '<div class="tabs sub">' + TECH_TABS.map(t => `<button class="${ui.techTab === t.id ? 'on' : ''}" data-act="techtab" data-tab="${t.id}">${t.name}</button>`).join('') + '</div>';
    const tab = TECH_TABS.find(t => t.id === ui.techTab);
    const ids = Object.keys(TECHS).filter(id => TECHS[id].tab === tab.id);
    const NW = 168, NH = 74, CX = 200, CY = 96, PAD = 20;
    const maxRow = Math.max(...ids.map(id => TECHS[id].row));
    const width = PAD * 2 + tab.cols.length * CX, height = PAD + 26 + (maxRow + 1) * CY;
    h += `<div class="treewrap"><div class="tree scroll"><div class="treeinner" style="width:${width}px;height:${height}px">`;
    // column headers
    tab.cols.forEach((c, i) => { h += `<div class="colhead" style="left:${PAD + i * CX}px;width:${NW}px">${c}</div>`; });
    // connectors
    h += `<svg class="links" width="${width}" height="${height}">`;
    const pos = id => [PAD + TECHS[id].col * CX, PAD + 26 + TECHS[id].row * CY];
    for (const id of ids) for (const r of TECHS[id].req || []) {
      if (TECHS[r].tab !== tab.id) continue;
      const [x1, y1] = pos(r), [x2, y2] = pos(id);
      const done = G.techs[r];
      let d;
      if (y1 === y2) d = `M${x1 + NW},${y1 + NH / 2} L${x2},${y2 + NH / 2}`;
      else if (x1 === x2) d = `M${x1 + NW / 2},${y1 + NH} L${x2 + NW / 2},${y2}`;
      else d = `M${x1 + NW},${y1 + NH / 2} C${x1 + NW + 20},${y1 + NH / 2} ${x2 - 20},${y2 + NH / 2} ${x2},${y2 + NH / 2}`;
      h += `<path d="${d}" class="${done ? 'done' : ''}"/>`;
    }
    h += '</svg>';
    for (const id of ids) {
      const t = TECHS[id], st = techStatus(id);
      const [x, y] = pos(id);
      const cross = (t.req || []).filter(r => TECHS[r].tab !== tab.id);
      const sub = t.weapon ? `${WEAPONS[t.weapon].unit}` : (t.desc || '').split('.')[0];
      let foot = '';
      if (st === 'done') foot = '✔ Researched';
      else if (st === 'active') foot = `<div class="bar"><div style="width:${G.research.prog / t.days * 100}%"></div></div>`;
      else foot = costHTML(t.cost || {});
      h += `<div class="tnode ${st} ${ui.techSel === id ? 'sel' : ''} ${t.weapon ? 'cls-' + WEAPONS[t.weapon].cls : ''}" style="left:${x}px;top:${y}px;width:${NW}px;height:${NH}px" data-act="techsel" data-id="${id}">
        <div class="tn-name">${techIcon(id)} ${techName(id)}</div>
        <div class="tn-sub">${sub}</div>
        ${cross.length ? `<div class="tn-cross ${cross.every(r => G.techs[r]) ? 'ok' : ''}">needs ${cross.map(techName).join(', ')}</div>` : ''}
        <div class="tn-foot">${foot}</div></div>`;
    }
    h += '</div></div>';
    h += `<div class="techdetail">${techDetailHTML(ui.techSel)}</div></div>`;
    return h;
  }

  function techDetailHTML(id) {
    if (!id) return '<p class="muted">Select a technology to see details.</p>';
    const t = TECHS[id], st = techStatus(id);
    let h = `<h3>${techIcon(id)} ${techName(id)}</h3>`;
    if (t.weapon) h += weaponStatsHTML(t.weapon);
    else h += `<p>${t.desc}</p>`;
    if (t.req && t.req.length) h += `<p><b>Requires:</b> ${t.req.map(r => `<span class="${G.techs[r] ? 'okc' : 'badc'}">${techName(r)}</span>`).join(', ')}</p>`;
    if (st === 'done') h += '<p class="okc"><b>✔ Researched</b></p>';
    else if (st === 'active') h += '<p>Research in progress…</p>';
    else {
      h += `<p><b>Cost:</b> ${costHTML(t.cost || {})} &nbsp; <b>Time:</b> ${t.days} days</p>`;
      const ok = st === 'avail' && !G.research && canAfford(t.cost || {});
      h += `<button class="big" data-act="research" data-id="${id}" ${ok ? '' : 'disabled'}>🔬 Research</button>`;
      if (G.research) h += ' <small class="muted">Another research is in progress.</small>';
    }
    return h;
  }

  function weaponStatsHTML(w) {
    const d = WEAPONS[w], c = CLASSES[d.cls];
    const specials = [];
    if (d.volleys) specials.push(`${d.volleys} volleys before melee`);
    if (d.pierce) specials.push(`ignores ${Math.round(d.pierce * 100)}% armour`);
    if (d.crush) specials.push('crushes armour');
    if (d.cls === 'spear') specials.push('strikes first');
    if (d.cls === 'cavalry') specials.push('charge ×2.5');
    const strong = Object.entries(CLASS_BONUS[d.cls] || {}).filter(([, m]) => m > 1).map(([k]) => CLASSES[k].name);
    const weak = Object.keys(CLASS_BONUS).filter(k => (CLASS_BONUS[k][d.cls] || 1) > 1).map(k => CLASSES[k].name);
    return `<div class="wstats">
      <div><span class="unitchip cls-${d.cls}">${c.name}</span> <b>${d.unit}</b></div>
      <div class="statrow"><span>⚔️ ATK <b>${d.atk}</b></span><span>❤️ HP <b>${d.hp}</b></span><span>🛡️ ARM <b>${d.armor}</b></span></div>
      ${specials.length ? `<div class="spec">✦ ${specials.join(' · ')}</div>` : ''}
      <div class="pro">＋ ${c.pros}</div><div class="con">－ ${c.cons}</div>
      ${strong.length ? `<div class="pro small">Strong vs: ${strong.join(', ')}</div>` : ''}
      ${weak.length ? `<div class="con small">Weak vs: ${weak.join(', ')}</div>` : ''}
      <div class="small muted">Forging cost: ${costHTML(d.cost)}</div></div>`;
  }

  function craftHTML(f) {
    const speed = BUILDINGS.forge.speed[f.level - 1];
    let h = '<div class="craftwrap"><div class="craftlist scroll">';
    const byCls = {};
    for (const w in WEAPONS) if (!WEAPONS[w].hidden && weaponUnlocked(w)) (byCls[WEAPONS[w].cls] = byCls[WEAPONS[w].cls] || []).push(w);
    for (const cls in CLASSES) {
      if (!byCls[cls]) continue;
      h += `<h4 class="cls-${cls}">${CLASSES[cls].name}</h4>`;
      for (const w of byCls[cls]) {
        const d = WEAPONS[w];
        h += `<div class="craftrow"><div class="cr-name"><b>${d.name}</b><br><small>${d.unit} — ⚔️${d.atk} ❤️${d.hp} 🛡️${d.armor}</small></div>
          <div class="cr-cost">${costHTML(d.cost)}<br><small>${(d.time / speed).toFixed(2)} days each · in armoury: <b>${G.weapons[w] || 0}</b></small></div>
          <div class="cr-btns">${[1, 5, 10, 25].map(n => `<button data-act="craft" data-w="${w}" data-n="${n}" ${canAfford(d.cost) ? '' : 'disabled'}>+${n}</button>`).join('')}</div></div>`;
      }
    }
    const locked = Object.keys(WEAPONS).filter(w => !WEAPONS[w].hidden && !weaponUnlocked(w)).length;
    h += `<p class="muted">${locked} more weapons can be unlocked in the Tech Tree.</p></div><div class="queue"><h4>🔥 Forge queue</h4>`;
    if (!G.forgeQueue.length) h += '<p class="muted">The anvil is quiet.</p>';
    G.forgeQueue.forEach((q, i) => {
      h += `<div class="qrow">${q.n}× ${WEAPONS[q.w].name} ${i === 0 ? `<div class="bar"><div style="width:${q.prog * 100}%"></div></div>` : ''}<button data-act="cancelq" data-i="${i}">✕</button></div>`;
    });
    h += '<h4>🗄️ Armoury</h4>';
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    h += arm.length ? arm.map(([w, n]) => `<div>${n}× ${WEAPONS[w].name}</div>`).join('') : '<p class="muted">Empty</p>';
    h += `<button data-act="open" data-kind="army" data-tab="army">⚔️ Train soldiers →</button></div></div>`;
    return h;
  }

  function guideHTML() {
    let h = '<div class="scroll guide"><p>Every soldier carries one weapon. Each weapon class has strengths and weaknesses — a balanced army wins battles. Battles play out as <b>volleys</b> (ranged & javelins fire), then <b>melee rounds</b> until one side breaks.</p><table class="gtab"><tr><th>Class</th><th>Strengths</th><th>Weaknesses</th><th>Bonus damage vs</th></tr>';
    for (const k in CLASSES) {
      if (k === 'militia') continue;
      const strong = Object.entries(CLASS_BONUS[k]).filter(([, m]) => m > 1).map(([c, m]) => `${CLASSES[c].name} ×${m}`).join(', ');
      h += `<tr><td><span class="unitchip cls-${k}">${CLASSES[k].name}</span></td><td>${CLASSES[k].pros}</td><td>${CLASSES[k].cons}</td><td>${strong || '—'}</td></tr>`;
    }
    h += '</table><p>Armour reduces damage by armour/(armour+8). Arrows and slings suffer against armour unless they pierce. Maces gain damage against heavily armoured targets.</p></div>';
    return h;
  }

  // ---------- Market ----------
  function marketHTML() {
    const m = findBuilding('market');
    let h = `<p class="muted">Sell your goods for coins or buy what you lack. Each kingdom has its own prices — conquered kingdoms trade on friendly terms. Prices move as you trade. Margin: ${(BUILDINGS.market.spread[m.level - 1] * 100).toFixed(0)}% (upgrade the Marketplace for better deals).</p>`;
    h += '<div class="tabs">' + KINGDOMS.map(k => `<button class="${ui.partner === k.id ? 'on' : ''}" data-act="partner" data-id="${k.id}" style="border-bottom:3px solid ${k.color}">${k.name}${kingdomState(k.id).conquered ? ' 👑' : ''}</button>`).join('') + '</div>';
    const kd = kingdomDef(ui.partner);
    h += `<p><b>${kd.name}</b> — ${kd.desc}</p>`;
    h += `<div class="qtys">Quantity: ${[1, 10, 50, 100].map(q => `<button class="${ui.tradeQty === q ? 'on' : ''}" data-act="qty" data-q="${q}">${q}</button>`).join('')}</div>`;
    h += '<div class="scroll mtable"><table><tr><th>Resource</th><th>You have</th><th>Sell for</th><th></th><th>Buy for</th><th></th></tr>';
    for (const r of RES_ORDER) {
      const sp = Sim.price(ui.partner, r, false), bp = Sim.price(ui.partner, r, true);
      const mod = kd.trade[r] || 1;
      const tag = mod < 1 ? '<span class="cheap">cheap</span>' : mod > 1 ? '<span class="dear">in demand</span>' : '';
      h += `<tr><td>${RES[r].icon} ${RES[r].name} ${tag}</td><td>${fmt(G.res[r])}</td>
        <td>${sp.toFixed(2)} 🪙</td><td><button data-act="sell" data-r="${r}" ${G.res[r] >= 1 ? '' : 'disabled'}>Sell ${ui.tradeQty}</button></td>
        <td>${bp.toFixed(2)} 🪙</td><td><button data-act="buy" data-r="${r}" ${G.coins >= bp ? '' : 'disabled'}>Buy ${ui.tradeQty}</button></td></tr>`;
    }
    h += '</table></div>';
    return h;
  }

  // ---------- Army / world ----------
  function armyHTML() {
    let h = tabs([['army', '⚔️ Army'], ['defense', '🛡️ Defence'], ['map', '🗺️ World Map']], ui.armyTab, 'armytab');
    if (ui.armyTab === 'army') h += armyTabHTML();
    else if (ui.armyTab === 'defense') h += defenseHTML();
    else h += worldHTML();
    return h;
  }
  function armyTabHTML() {
    const cap = armyCapacity(), tot = totalSoldiers();
    const b = armyBonuses();
    let h = `<div class="armyhead">Soldiers: <b>${tot} / ${cap}</b> (${soldiersAway()} on campaign) · Upkeep ${WAGE_SOLDIER} 🪙/soldier/day · Training ${RECRUIT_COST} 🪙 · Available citizens: ${availableWorkers()}
      · Bonuses: ATK ×${b.atk.toFixed(2)}, ARM +${b.armor} · Army power: <b>${Combat.power(G.army)}</b></div>`;
    h += '<div class="cols2"><div class="scroll"><h4>🗄️ Armoury — recruit soldiers</h4>';
    const arm = Object.entries(G.weapons).filter(([, n]) => n > 0);
    if (!arm.length) h += '<p class="muted">No weapons in the armoury. Forge some first!</p><button data-act="open" data-kind="forge" data-tab="craft">🔨 Go to the Forge</button>';
    for (const [w, n] of arm) {
      const d = WEAPONS[w];
      h += `<div class="craftrow"><div class="cr-name"><span class="unitchip cls-${d.cls}">${CLASSES[d.cls].name}</span> <b>${d.unit}</b><br><small>${n} ${d.name}s · ⚔️${d.atk} ❤️${d.hp} 🛡️${d.armor}</small></div>
        <div class="cr-btns">${[1, 10, 50].map(k => `<button data-act="recruit" data-w="${w}" data-n="${k}">+${k}</button>`).join('')}<button data-act="recruit" data-w="${w}" data-n="9999">All</button></div></div>`;
    }
    h += '</div><div class="scroll"><h4>⚔️ Your army (at home)</h4>';
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) h += '<p class="muted">No soldiers. In a raid, up to 60 idle villagers will fight as militia.</p>';
    for (const [w, n] of units) {
      const d = WEAPONS[w];
      h += `<div class="craftrow"><div class="cr-name"><span class="unitchip cls-${d.cls}">${CLASSES[d.cls].name}</span> <b>${n} ${d.unit}</b></div>
        <div class="cr-btns"><button data-act="disband" data-w="${w}" data-n="1">−1</button><button data-act="disband" data-w="${w}" data-n="10">−10</button></div></div>`;
    }
    if (G.campaigns.length) {
      h += '<h4>🚩 On campaign</h4>';
      for (const c of G.campaigns) h += `<div class="camp">${c.phase === 'march' ? 'Marching on' : 'Returning from'} <b>${kingdomDef(c.target).name}</b> — ${c.t.toFixed(1)} days<br>${unitsHTML(c.units)}</div>`;
    }
    h += '</div></div>';
    return h;
  }

  function defenseHTML() {
    const def = Sim.defenders();
    const side = Sim.playerSide(def, true);
    let h = `<p>When raiders arrive, your soldiers at home defend the town, joined by up to 60 idle villagers as <b>militia</b> (currently ${Sim.militiaCount()}).</p>
      <div class="stat">🛡️ Walls: ${has('stoneWalls') ? 'Stone walls (−25% damage taken)' : has('palisade') ? 'Palisade (−10% damage taken)' : 'None — research Palisade'}</div>
      <div class="stat">🗼 Watchtower firepower: ${side.towers || 'none'}</div>
      <div class="stat">Defenders: ${unitsHTML(def)}</div>`;
    const inc = G.raid.incoming;
    if (inc) {
      const p = Combat.forecast(Sim.kingdomSide(inc.from, inc.units, false), side);
      h += `<div class="raidbox"><b>⚠️ Raid from ${kingdomDef(inc.from).name}</b> arrives in ${Math.max(0, inc.eta - G.time).toFixed(1)} days<br>
        Raiders: ${unitsHTML(inc.units)}<br>Chance to hold the town: ${oddsHTML(1 - p)}</div>`;
    } else {
      h += `<p class="muted">No raid spotted. Next raids are expected around day ${Math.floor(G.raid.next) + 1}.</p>`;
    }
    return h;
  }
  function oddsHTML(p) {
    const pc = Math.round(p * 100);
    const cls = pc >= 70 ? 'okc' : pc >= 40 ? 'warn' : 'badc';
    return `<b class="${cls}">${pc}%</b>`;
  }

  function worldHTML() {
    const W = 560, H = 440, cx = W / 2, cy = H / 2 - 6;
    let h = '<div class="cols2 world"><div><svg class="worldmap" viewBox="0 0 ' + W + ' ' + H + '">';
    h += `<defs><radialGradient id="land" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#7ea35a"/><stop offset="100%" stop-color="#4f6b3a"/></radialGradient></defs>`;
    h += `<rect width="${W}" height="${H}" fill="url(#land)" rx="10"/>`;
    const kpos = k => { const a = k.angle * Math.PI / 180, r = 40 + k.dist * 22; return [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r]; };
    for (const k of KINGDOMS) { const [x, y] = kpos(k); h += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#c8b07a" stroke-width="3" stroke-dasharray="6 4"/>`; }
    // your realm
    const owned = G.kingdoms.filter(k => k.conquered).length;
    h += `<circle cx="${cx}" cy="${cy}" r="${26 + owned * 4}" fill="#2c4f8a" opacity="0.35"/><circle cx="${cx}" cy="${cy}" r="14" fill="#2c4f8a" stroke="#ffd75a" stroke-width="3"/><text x="${cx}" y="${cy + 30 + owned * 4}" class="wlabel">Emberfall (you)</text>`;
    for (const c of G.campaigns) {
      const k = kingdomDef(c.target); const [x, y] = kpos(k);
      const p = c.phase === 'march' ? 1 - c.t / c.total : c.t / c.total;
      h += `<text x="${cx + (x - cx) * p}" y="${cy + (y - cy) * p}" class="wicon">🚩</text>`;
    }
    for (const k of KINGDOMS) {
      const [x, y] = kpos(k), ks = kingdomState(k.id);
      h += `<g class="wk ${ui.mapSel === k.id ? 'sel' : ''}" data-act="mapsel" data-id="${k.id}">
        <circle cx="${x}" cy="${y}" r="20" fill="${ks.conquered ? '#2c4f8a' : k.color}" stroke="${ui.mapSel === k.id ? '#ffd75a' : '#222'}" stroke-width="3"/>
        <text x="${x}" y="${y + 6}" class="wicon">${ks.conquered ? '👑' : '🏰'}</text>
        <text x="${x}" y="${y + 36}" class="wlabel">${k.name}</text></g>`;
    }
    h += '</svg></div><div class="scroll kdetail">';
    h += kingdomDetailHTML(ui.mapSel);
    h += '</div></div>';
    return h;
  }

  function kingdomDetailHTML(id) {
    if (!id) return '<p class="muted">Select a kingdom on the map. Conquer kingdoms to gain loot, daily tribute, better trade and more land to build on.</p>';
    const kd = kingdomDef(id), ks = kingdomState(id);
    const gar = Sim.roundUnits(ks.garrison);
    let h = `<h3 style="color:${kd.color}">${kd.name}</h3><p><i>${kd.ruler}</i><br>${kd.desc}</p>`;
    if (ks.conquered) return h + `<p class="okc"><b>👑 Conquered.</b> Pays ${kd.tribute} 🪙/day tribute.</p>`;
    h += `<p>March: <b>${Sim.marchDays(id).toFixed(1)} days</b> each way</p>`;
    h += `<p><b>Garrison</b> (power ${Combat.power(gar)}):<br>${unitsHTML(gar)}</p>`;
    h += `<p><b>Spoils:</b> ${costHTML(kd.loot)}<br>+${kd.tribute} 🪙/day tribute · +${kd.land} land</p>`;
    // attack selection
    h += '<h4>⚔️ Send an army</h4>';
    const units = Object.entries(G.army).filter(([, n]) => n > 0);
    if (!units.length) return h + '<p class="muted">You have no soldiers at home.</p>';
    for (const [w, n] of units) {
      const sel = Math.min(ui.attackSel[w] ?? n, n);
      ui.attackSel[w] = sel;
      h += `<div class="selrow"><span>${WEAPONS[w].unit}</span><span>
        <button data-act="asel" data-w="${w}" data-d="-10">−10</button><button data-act="asel" data-w="${w}" data-d="-1">−</button>
        <b>${sel}</b>/${n}
        <button data-act="asel" data-w="${w}" data-d="1">+</button><button data-act="asel" data-w="${w}" data-d="10">+10</button></span></div>`;
    }
    const send = {};
    for (const [w] of units) if (ui.attackSel[w] > 0) send[w] = ui.attackSel[w];
    if (unitCount(send)) {
      const p = Combat.forecast(Sim.playerSide(send, false), Sim.kingdomSide(id, gar, true));
      h += `<p>Sending ${unitCount(send)} soldiers (power ${Combat.power(send)}). Estimated chance of victory: ${oddsHTML(p)}</p>`;
      h += `<button class="big" data-act="attack" data-id="${id}">🚩 March on ${kd.name}</button>`;
    }
    return h;
  }

  // ---------- Town hall ----------
  function townhallHTML() {
    let h = tabs([['exp', '🧭 Expeditions'], ['overview', '📜 Realm Overview']], ui.thTab, 'thtab');
    if (ui.thTab === 'exp') {
      const avail = availableWorkers();
      ui.expPeople = Math.max(1, Math.min(ui.expPeople, Math.max(1, avail)));
      h += `<p>Send villagers out of town to gather resources. They return after a few days. Idle citizens: <b>${idleCitizens()}</b> · Available (incl. workers): <b>${avail}</b>${has('tools') ? ' · Better Tools +25%' : ''}</p>`;
      h += '<div class="exps">';
      for (const t in EXPEDITIONS) {
        const e = EXPEDITIONS[t];
        h += `<button class="expcard ${ui.expType === t ? 'on' : ''}" data-act="exptype" data-t="${t}"><b>${e.name}</b><br><small>${e.desc}<br>${e.days} days</small></button>`;
      }
      h += '</div>';
      h += `<div class="selrow big"><span>Villagers to send:</span><span>
        <button data-act="exppeople" data-d="-25">−25</button><button data-act="exppeople" data-d="-5">−5</button>
        <b>${ui.expPeople}</b>
        <button data-act="exppeople" data-d="5">+5</button><button data-act="exppeople" data-d="25">+25</button></span></div>`;
      const story = ui.expType === 'wood' && ui.expPeople >= 50 && G.stats.woodGathered < 100;   // first big wood run
      const yieldTxt = Object.entries(EXPEDITIONS[ui.expType].yield).map(([k, v]) => `~${Math.max(story ? 100 : 0, Math.round(v * ui.expPeople * (has('tools') ? 1.25 : 1)))} ${RES[k].icon}`).join(' ');
      h += `<p>Expected haul: ${yieldTxt}${ui.expPeople > idleCitizens() ? ' <span class="warn">— this will pull workers from their jobs</span>' : ''}</p>`;
      h += `<button class="big" data-act="sendexp" ${avail >= ui.expPeople && G.expeditions.length < 4 ? '' : 'disabled'}>🧭 Send expedition</button>`;
      h += '<h4>Out in the wilds</h4>';
      if (!G.expeditions.length) h += '<p class="muted">No expeditions out.</p>';
      for (const e of G.expeditions) h += `<div class="qrow">${e.people} villagers — ${EXPEDITIONS[e.type].name}<div class="bar"><div style="width:${(1 - e.t / e.total) * 100}%"></div></div><small>${e.t.toFixed(1)} days</small></div>`;
    } else {
      const f = Sim.foodPerDay();
      h += `<div class="cols2"><div><h4>💰 Treasury (per day)</h4>
        <div class="stat">Taxes: +${Sim.taxPerDay().toFixed(1)}</div><div class="stat">Tribute: +${Sim.tributePerDay().toFixed(1)}</div>
        <div class="stat">Worker wages: −${(employedWorkers() * WAGE_WORKER).toFixed(1)}</div><div class="stat">Soldier pay: −${(totalSoldiers() * WAGE_SOLDIER).toFixed(1)}</div>
        ${G.coins <= 0 ? '<p class="badc">The treasury is empty! Unpaid workers only work at half speed. Sell goods at the Marketplace.</p>' : ''}
        <h4>🍞 Food</h4><div class="stat">Farms: +${f.prod.toFixed(1)} · Eaten: −${f.use.toFixed(1)}</div>
        <h4>👥 People</h4><div class="stat">Population ${G.pop} / ${housingCapacity()} housing</div>
        <div class="stat">Workers ${employedWorkers()} · Idle ${idleCitizens()} · Expeditions ${peopleOnExpedition()} · Soldiers ${totalSoldiers()}</div>
        <p class="muted">Build houses to attract settlers. Each needs food and a job (or will idle).</p></div>
        <div><h4>👑 Kingdoms</h4>${KINGDOMS.map(k => `<div class="stat">${kingdomState(k.id).conquered ? '👑' : '🏰'} ${k.name} — ${kingdomState(k.id).conquered ? `tribute ${k.tribute}/day` : 'hostile'}</div>`).join('')}
        <h4>📊 Records</h4><div class="stat">Weapons forged: ${G.stats.weaponsForged} · Soldiers trained: ${G.stats.recruited}</div>
        <div class="stat">Raids repelled: ${G.stats.raidsRepelled} · Kingdoms conquered: ${G.stats.conquered}</div></div></div>`;
    }
    return h;
  }

  function helpHTML() {
    return `<div class="scroll guide">
      <p>You are the blacksmith of <b>Emberfall</b>, a town of 200 souls. Lead them to greatness!</p>
      <ul>
        <li><b>Camera:</b> drag to pan (or WASD / arrow keys), mouse wheel to zoom.</li>
        <li><b>Buildings:</b> hover a building for quick actions, click it for details and upgrades.</li>
        <li><b>Building:</b> pick a building on the bottom bar and click on the map inside your borders (dashed gold line). Right-click or Esc to stop placing. Building on forest clears it and yields wood.</li>
        <li><b>Expeditions:</b> send villagers from the Town Hall to gather wood, stone, food or ore.</li>
        <li><b>Command Center</b> (east side of town): the Forge (tech tree & weapons), Marketplace (trade), Town Hall and Barracks.</li>
        <li><b>Economy:</b> workers cost ${WAGE_WORKER} 🪙/day, soldiers ${WAGE_SOLDIER} 🪙/day. Citizens pay taxes. Sell surplus at the Marketplace.</li>
        <li><b>Refineries:</b> turn wood into planks/charcoal, ore into iron, copper+tin into bronze, copper+zinc into brass, iron+charcoal into steel… Higher tiers refine faster and unlock better recipes.</li>
        <li><b>War:</b> forge weapons, train soldiers at the Barracks, defend against raids and conquer neighbouring kingdoms. Mix unit types — every class has counters!</li>
        <li><b>Keys:</b> Space = pause, 1/2/3 = speed, Esc = close.</li>
      </ul>
      <p><button data-act="newgame" class="danger">${ui.armed === 'newgame' ? '⚠️ Click again — current progress will be lost' : 'Start a new game'}</button></p></div>`;
  }

  // ---------------------------------------------------------
  //  Battle report
  // ---------------------------------------------------------
  function battleReport(title, res, nameA, nameD, defending) {
    ui.reports.push({ title, res, nameA, nameD, defending });
    if (ui.reports.length === 1) showReport();
  }
  function showReport() {
    const r = ui.reports[0];
    if (!r) { $('report').classList.add('hidden'); return; }
    const { res, nameA, nameD, defending } = r;
    const youWon = defending ? res.winner === 'D' : res.winner === 'A';
    const side = (s, name) => {
      let t = `<div><h4>${name}</h4><table class="btab"><tr><th>Unit</th><th>Start</th><th>Lost</th><th>Left</th></tr>`;
      for (const k in s.start) t += `<tr><td><span class="unitchip cls-${WEAPONS[k].cls}">${WEAPONS[k].unit}</span></td><td>${s.start[k]}</td><td class="badc">${s.lost[k]}</td><td>${s.end[k]}</td></tr>`;
      return t + '</table></div>';
    };
    // strength chart
    const R = res.rounds, n = R.length;
    const max = Math.max(1, ...R.map(x => Math.max(x.a, x.d)));
    const Wc = 520, Hc = 120;
    const pts = key => R.map((x, i) => `${(i / Math.max(1, n - 1)) * Wc},${Hc - (x[key] / max) * (Hc - 10)}`).join(' ');
    const colA = defending ? '#c0392b' : '#4a7fd0', colD = defending ? '#4a7fd0' : '#c0392b';
    let chart = `<svg viewBox="0 0 ${Wc} ${Hc + 4}" preserveAspectRatio="none" class="bchart"><polyline points="${pts('a')}" fill="none" stroke="${colA}" stroke-width="3"/><polyline points="${pts('d')}" fill="none" stroke="${colD}" stroke-width="3"/></svg>
      <div class="legend"><span style="color:${colA}">■ ${nameA}</span> <span style="color:${colD}">■ ${nameD}</span></div>`;
    let rounds = '<div class="rounds scroll">';
    for (const x of R) {
      if (!x.events.length && x !== R[0] && x !== R[R.length - 1]) continue;
      rounds += `<div class="round"><b>${x.label}</b> <small>(${Math.round(x.a)} vs ${Math.round(x.d)})</small>${x.events.map(e => `<div class="ev ev-${(e.side === 'A') === !defending ? 'us' : 'them'}">${e.text}</div>`).join('')}</div>`;
    }
    rounds += '</div>';
    $('report').innerHTML = `<div class="report-inner ${youWon ? 'won' : 'lost'}">
      <h2>${youWon ? '🏆' : '💀'} ${r.title}</h2>${res.extra || ''}
      ${chart}
      <div class="cols2">${side(res.A, nameA)}${side(res.D, nameD)}</div>
      <h4>Battle log</h4>${rounds}
      <button class="big" data-act="closereport">Continue</button></div>`;
    $('report').classList.remove('hidden');
  }

  // ---------------------------------------------------------
  //  Toasts, intro, game over
  // ---------------------------------------------------------
  function toast(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast t-' + kind;
    el.innerHTML = msg;
    $('toasts').prepend(el);
    setTimeout(() => el.classList.add('fade'), 4500);
    setTimeout(() => el.remove(), 5200);
    while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
  }
  function floatText(msg) {
    const el = document.createElement('div');
    el.className = 'floattext';
    el.textContent = msg;
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
  function raidWarning() {
    if (ui.modal) renderModal(true);
  }
  function showIntro() {
    const saved = hasSave();
    $('intro').innerHTML = `<div class="intro-inner">
      <h1>⚒️ Emberfall</h1><h3>From Blacksmith to Emperor</h3>
      <p>For twenty years you have worked the forge of <b>Emberfall</b>, a quiet town of <b>200 souls</b>. Now the old reeve is dead, raiders prowl the hills, and the people look to the one who makes their tools and blades.</p>
      <p>Take charge. Gather wood, build homes, raise refineries and a mighty army — then bring the five neighbouring kingdoms to heel.</p>
      <div class="intro-btns"><button class="big" data-act="newgame">🔥 Take Charge (New Game)</button>
      ${saved ? '<button class="big" data-act="continue">📜 Continue saved game</button>' : ''}</div>
      <p class="muted small">Tip: drag to move the camera, scroll to zoom. Hover buildings for actions.</p></div>`;
    $('intro').classList.remove('hidden');
  }
  function gameOver(won) {
    G.paused = true;
    $('intro').innerHTML = `<div class="intro-inner">
      <h1>${won ? '👑 Emperor of the Realm!' : '💀 Emberfall has fallen'}</h1>
      <p>${won ? `In ${day()} days you rose from the anvil to rule every kingdom in the land. Songs will be sung of the Blacksmith Emperor.` : 'Your people have scattered to the winds. Perhaps another smith will rekindle the forge.'}</p>
      <div class="intro-btns"><button class="big" data-act="newgame">🔥 New Game</button>${won ? '<button class="big" data-act="keepplaying">Keep playing</button>' : ''}</div></div>`;
    $('intro').classList.remove('hidden');
    if (!won) deleteSave();
  }

  // ---------------------------------------------------------
  //  Click handling (event delegation)
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
    let rerender = true;
    switch (a) {
      case 'save': toast(saveGame() ? 'Game saved.' : 'Could not save.', 'good'); break;
      case 'help': openModal('help'); break;
      case 'open': openModal(d.kind, d.tab || null); break;
      case 'select': ui.selected = G.buildings.find(b => b.id === +d.bid); renderSide(); break;
      case 'deselect': ui.selected = null; renderSide(); break;
      case 'place': startPlacing(d.type); break;
      case 'ore': ui.selected.ore = d.ore; break;
      case 'recipe': ui.selected.recipe = d.recipe; if (ui.selected.prog > 0) ui.selected.prog = 0; break;
      case 'upgrade': if (!Sim.upgradeBuilding(ui.selected)) toast('Cannot upgrade yet.', 'bad'); break;
      case 'pause': ui.selected.paused = !ui.selected.paused; break;
      case 'demolish':
        // two-step confirm: first click arms the button
        if (ui.armed === 'demolish' + ui.selected.id) { Sim.demolish(ui.selected); ui.selected = null; ui.armed = null; }
        else ui.armed = 'demolish' + ui.selected.id;
        break;
      case 'forgetab': ui.forgeTab = d.tab; break;
      case 'techtab': ui.techTab = d.tab; ui.techSel = null; break;
      case 'techsel': ui.techSel = d.id; break;
      case 'research': if (!Sim.startResearch(d.id)) toast('Cannot research that yet.', 'bad'); break;
      case 'cancelresearch': Sim.cancelResearch(); break;
      case 'craft': { const n = Sim.queueWeapon(d.w, +d.n); if (!n) toast('Not enough materials.', 'bad'); else if (n < +d.n) toast(`Only enough materials for ${n}.`, 'warn'); break; }
      case 'cancelq': Sim.cancelQueue(+d.i); break;
      case 'partner': ui.partner = d.id; break;
      case 'qty': ui.tradeQty = +d.q; break;
      case 'sell': case 'buy': {
        const r = Sim.trade(ui.partner, d.r, ui.tradeQty, a === 'buy');
        if (r) toast(`${a === 'buy' ? 'Bought' : 'Sold'} ${r.qty} ${RES[d.r].name} for ${r.total.toFixed(0)} 🪙`, 'good');
        else toast(a === 'buy' ? 'Not enough coins.' : 'Nothing to sell.', 'bad');
        break;
      }
      case 'armytab': ui.armyTab = d.tab; break;
      case 'recruit': {
        const n = Sim.recruit(d.w, +d.n);
        if (!n) toast(totalSoldiers() >= armyCapacity() ? 'Barracks are full — upgrade them.' : G.coins < RECRUIT_COST ? 'Not enough coins.' : 'No available citizens.', 'bad');
        break;
      }
      case 'disband': Sim.disband(d.w, +d.n); break;
      case 'mapsel': ui.mapSel = d.id; ui.attackSel = {}; break;
      case 'asel': ui.attackSel[d.w] = Math.max(0, Math.min(G.army[d.w] || 0, (ui.attackSel[d.w] || 0) + +d.d)); break;
      case 'attack': {
        const send = {};
        for (const w in ui.attackSel) if (ui.attackSel[w] > 0) send[w] = ui.attackSel[w];
        if (Sim.launchCampaign(d.id, send)) { ui.attackSel = {}; closeModal(); rerender = false; }
        break;
      }
      case 'thtab': ui.thTab = d.tab; break;
      case 'exptype': ui.expType = d.t; break;
      case 'exppeople': ui.expPeople = Math.max(1, Math.min(availableWorkers(), ui.expPeople + +d.d)); break;
      case 'sendexp': if (Sim.startExpedition(ui.expType, ui.expPeople)) { closeModal(); rerender = false; } break;
      case 'closereport': ui.reports.shift(); showReport(); rerender = false; break;
      case 'newgame':
        if (G && G.started && $('intro').classList.contains('hidden') && ui.armed !== 'newgame') {
          ui.armed = 'newgame';
          t.textContent = '⚠️ Click again — current progress will be lost';
          return;
        }
        ui.armed = null;
        Main.startNew(); rerender = false; break;
      case 'continue': Main.continueGame(); rerender = false; break;
      case 'keepplaying': $('intro').classList.add('hidden'); G.paused = false; rerender = false; break;
    }
    if (rerender) refreshAll(true);
  }

  function startPlacing(type) {
    const d = BUILDINGS[type];
    if (d.requires && !has(d.requires)) { toast(`Research ${techName(d.requires)} first (Forge → Tech Tree).`, 'bad'); return; }
    ui.placing = ui.placing === type ? null : type;
    Render.ghost = null;
    $('placehint').classList.toggle('hidden', !ui.placing);
    if (ui.placing) $('placehint').innerHTML = `Placing <b>${d.name}</b> (${costHTML(d.cost)}) — click inside your borders to build · right-click / Esc to stop`;
    renderBottom();
  }
  function stopPlacing() { ui.placing = null; Render.ghost = null; $('placehint').classList.add('hidden'); renderBottom(); }

  function tryPlace(tx, ty) {
    const type = ui.placing;
    if (!type) return;
    const d = BUILDINGS[type];
    if (!canPlace(type, tx, ty)) { toast('Cannot build there.', 'bad'); return; }
    if (!pay(d.cost)) { toast('Not enough resources.', 'bad'); return; }
    placeBuilding(type, tx, ty, false);
    Render.terrainDirty = true;
    renderBottom(); renderTop();
    if (!canAfford(d.cost)) stopPlacing();
  }

  function refreshAll(force) {
    renderTop(); renderLeft(); renderBottom(); renderSide();
    if (ui.modal) renderModal(force);
  }

  function init() {
    document.body.addEventListener('click', onClick);
    $('modal-close').addEventListener('click', closeModal);
    $('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  }

  return {
    ui, init, refreshAll, renderTop, renderLeft, renderBottom, renderSide, renderModal, openModal, closeModal,
    toast, floatText, battleReport, raidWarning, showIntro, gameOver, setHover, updateHoverPop, startPlacing,
    stopPlacing, tryPlace,
    select(b) { ui.selected = b; renderSide(); },
    isModalOpen() { return !!ui.modal || !$('report').classList.contains('hidden') || !$('intro').classList.contains('hidden'); },
  };
})();
