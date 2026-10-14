// ============================================================
//  Main loop and input
// ============================================================

const Main = (() => {
  let canvas, last = 0, uiTimer = 0, modalTimer = 0, autosave = 0;
  const keys = {};
  const mouse = { x: 0, y: 0, down: false, button: 0, dragging: false, sx: 0, sy: 0, lx: 0, ly: 0 };

  function startNew() {
    newGame();
    G.started = true;
    afterLoad();
  }
  function continueGame() {
    if (!loadGame()) { startNew(); return; }
    G.started = true;
    if (G.tut === undefined) G.tut = -1;
    afterLoad();
  }
  function afterLoad() {
    document.getElementById('intro').classList.add('hidden');
    UI.closeModal();
    UI.ui.selected = null;
    UI.stopPlacing();
    Render.terrainDirty = true;
    Render.fullRebuild = true;
    Render.resetWalkers();
    Render.centerOn(22, 22);
    G.paused = false;
    G.inBattle = false;
    UI.refreshAll();
  }

  function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000 || 0);
    last = t;
    if (G && G.started) {
      if (!G.paused && !G.inBattle) {
        let simDt = dt * G.speed / DAY_SECONDS;
        // sub-step for stability at high speed
        while (simDt > 0) { const s = Math.min(simDt, 0.02); Sim.tick(s); simDt -= s; }
      }
      panKeys(dt);
      uiTimer += dt; modalTimer += dt; autosave += dt;
      if (uiTimer > 0.25) { uiTimer = 0; UI.renderTop(); UI.renderAlert(); }
      // never redraw panels mid-click, or the button under the cursor would be replaced
      if (modalTimer > 0.5 && !mouse.pressed) { modalTimer = 0; UI.renderBottom(); UI.renderSide(); UI.renderTutorial(); UI.renderModal(); }
      if (autosave > 30) { autosave = 0; saveGame(); }
      Music.update();
    }
    if (G) Render.frame(dt);
    requestAnimationFrame(loop);
  }

  function panKeys(dt) {
    const ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const ay = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    if (ax || ay) Render.panKeys(ax, ay, dt);
    if (keys.KeyQ) Render.rotateBy(-1.6 * dt);
    if (keys.KeyE) Render.rotateBy(1.6 * dt);
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function initInput() {
    window.addEventListener('pointerdown', () => { mouse.pressed = true; }, true);
    window.addEventListener('pointerup', () => { mouse.pressed = false; }, true);
    window.addEventListener('blur', () => { mouse.pressed = false; });
    // left-drag pans, right-drag rotates and tilts, click selects / places
    canvas.addEventListener('mousedown', e => {
      const [x, y] = canvasPos(e);
      Object.assign(mouse, { down: true, button: e.button, dragging: false, sx: x, sy: y, lx: x, ly: y });
      if (e.button === 0) Render.dragStart(x, y);
    });
    window.addEventListener('mousemove', e => {
      if (!G || !G.started) return;
      const [x, y] = canvasPos(e);
      mouse.x = x; mouse.y = y;
      if (mouse.down) {
        if (!mouse.dragging && Math.hypot(x - mouse.sx, y - mouse.sy) > 5) mouse.dragging = true;
        if (mouse.dragging) {
          if (mouse.button === 0) Render.dragMove(x, y);
          else if (mouse.button === 2) { Render.rotateBy((x - mouse.lx) * 0.006); Render.tiltBy((y - mouse.ly) * 0.004); }
        }
        mouse.lx = x; mouse.ly = y;
      }
      if (e.target !== canvas) { UI.setHover(null); return; }
      if (UI.ui.placing) {
        const [tx, ty] = Render.screenToTile(x, y);
        const s = BUILDINGS[UI.ui.placing].size;
        const ox = tx - Math.floor((s - 1) / 2), oy = ty - Math.floor((s - 1) / 2);
        Render.ghost = { type: UI.ui.placing, x: ox, y: oy, ok: canPlace(UI.ui.placing, ox, oy) && canAfford(BUILDINGS[UI.ui.placing].cost) };
        UI.setHover(null);
      } else if (!mouse.dragging) {
        UI.setHover(Render.pick(x, y));
      }
      canvas.style.cursor = mouse.dragging ? (mouse.button === 2 ? 'move' : 'grabbing') : (Render.hover ? 'pointer' : 'default');
    });
    window.addEventListener('mouseup', e => {
      if (!mouse.down) return;
      mouse.down = false;
      const wasDrag = mouse.dragging;
      mouse.dragging = false;
      if (wasDrag || e.target !== canvas) return;
      if (e.button === 2) { if (UI.ui.placing) UI.stopPlacing(); return; }
      if (e.button !== 0) return;
      const [x, y] = canvasPos(e);
      if (UI.ui.placing) {
        const g = Render.ghost;
        if (g) UI.tryPlace(g.x, g.y);
        return;
      }
      UI.select(Render.pick(x, y));
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = canvasPos(e);
      Render.zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      keys[e.code] = true;
      if (!G || !G.started) return;
      if (G.inBattle) return;
      if (e.code === 'Escape') {
        if (UI.ui.placing) UI.stopPlacing();
        else if (UI.ui.modal) UI.closeModal();
        else UI.select(null);
      }
      if (e.code === 'Space') { G.paused = !G.paused; e.preventDefault(); UI.renderTop(); }
      if (e.code === 'Digit1') { G.paused = false; G.speed = 1; }
      if (e.code === 'Digit2') { G.paused = false; G.speed = 2; }
      if (e.code === 'Digit3') { G.paused = false; G.speed = 4; }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  }

  function boot() {
    canvas = document.getElementById('game');
    installIcons();
    newGame();               // background scene behind the intro
    Render.init(canvas);
    UI.init();
    Battle.init();
    Music.init();
    initInput();
    UI.showIntro();
    requestAnimationFrame(loop);
    window.addEventListener('beforeunload', () => { if (G && G.started && !G.lost) saveGame(); });
  }

  return { boot, startNew, continueGame };
})();

window.addEventListener('DOMContentLoaded', Main.boot);
