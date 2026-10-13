// ============================================================
//  Main loop and input
// ============================================================

const Main = (() => {
  let canvas, last = 0, uiTimer = 0, modalTimer = 0, autosave = 0;
  const keys = {};
  const mouse = { x: 0, y: 0, down: false, dragging: false, sx: 0, sy: 0, camx: 0, camy: 0, overPop: false };

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
    Render.resetWalkers();
    Render.centerOn(22, 21);
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
      if (modalTimer > 0.5) { modalTimer = 0; UI.renderBottom(); UI.renderSide(); UI.renderTutorial(); if (!mouse.down) UI.renderModal(); }
      if (autosave > 30) { autosave = 0; saveGame(); }
      UI.updateHoverPop(dt, mouse.overPop);
    }
    if (G) Render.frame(dt);
    requestAnimationFrame(loop);
  }

  function panKeys(dt) {
    const sp = 700 * dt / Render.cam.zoom, t = Render.tgt;
    if (keys.KeyA || keys.ArrowLeft) t.x -= sp;
    if (keys.KeyD || keys.ArrowRight) t.x += sp;
    if (keys.KeyW || keys.ArrowUp) t.y -= sp;
    if (keys.KeyS || keys.ArrowDown) t.y += sp;
    Render.clampCam();
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function initInput() {
    canvas.addEventListener('mousedown', e => {
      if (e.button === 2) { if (UI.ui.placing) UI.stopPlacing(); return; }
      const [x, y] = canvasPos(e);
      Object.assign(mouse, { down: true, dragging: false, sx: x, sy: y, camx: Render.cam.x, camy: Render.cam.y });
    });
    window.addEventListener('mousemove', e => {
      if (!G || !G.started) return;
      const [x, y] = canvasPos(e);
      mouse.x = x; mouse.y = y;
      mouse.overPop = !!e.target.closest && !!e.target.closest('#hoverpop');
      if (mouse.down) {
        if (!mouse.dragging && Math.hypot(x - mouse.sx, y - mouse.sy) > 5) mouse.dragging = true;
        if (mouse.dragging) {
          Render.panTo(mouse.camx - (x - mouse.sx) / Render.cam.zoom, mouse.camy - (y - mouse.sy) / Render.cam.zoom);
          Render.clampCam();
        }
      }
      if (e.target !== canvas) { if (!mouse.overPop) UI.setHover(null); return; }
      if (UI.ui.placing) {
        const [tx, ty] = Render.screenToTile(x, y);
        const s = BUILDINGS[UI.ui.placing].size;
        const ox = tx - Math.floor((s - 1) / 2), oy = ty - Math.floor((s - 1) / 2);
        Render.ghost = { type: UI.ui.placing, x: ox, y: oy, ok: canPlace(UI.ui.placing, ox, oy) && canAfford(BUILDINGS[UI.ui.placing].cost) };
        UI.setHover(null);
      } else if (!mouse.dragging) {
        UI.setHover(Render.pick(x, y));
      }
      canvas.style.cursor = mouse.dragging ? 'grabbing' : (Render.hover ? 'pointer' : 'default');
    });
    window.addEventListener('mouseup', e => {
      if (!mouse.down) return;
      mouse.down = false;
      if (mouse.dragging || e.target !== canvas || e.button !== 0) { mouse.dragging = false; return; }
      const [x, y] = canvasPos(e);
      if (UI.ui.placing) {
        const g = Render.ghost;
        if (g) UI.tryPlace(g.x, g.y);
        return;
      }
      const b = Render.pick(x, y);
      UI.select(b);
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
    initInput();
    UI.showIntro();
    requestAnimationFrame(loop);
    window.addEventListener('beforeunload', () => { if (G && G.started && !G.lost) saveGame(); });
  }

  return { boot, startNew, continueGame };
})();

window.addEventListener('DOMContentLoaded', Main.boot);
