// ============================================================
//  Custom SVG icon set (replaces emoji). Icons use currentColor
//  so CSS / inline style can tint them.
// ============================================================

const ICONS = {
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#0005" stroke-width="1.6"/><path d="M12 8.5v7" stroke="#0005" stroke-width="1.6"/>',
  pop: '<circle cx="9" cy="7.5" r="3.4"/><path d="M2.5 20c0-4 2.9-7 6.5-7s6.5 3 6.5 7z"/><circle cx="16.8" cy="8" r="2.8" opacity=".75"/><path d="M15.5 13.3c3.6-.6 6.5 1.9 6.5 6.7h-5" opacity=".75"/>',
  food: '<path d="M3 13.5C3 9.4 7 6.5 12 6.5s9 2.9 9 7V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 9.5l1.4 3M12 8.8l1.4 3.4M16 9.5l1.4 3" stroke="#0006" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  log: '<rect x="2" y="8" width="16" height="8" rx="1.5"/><ellipse cx="18" cy="12" rx="3.2" ry="4" fill="#e9c58c"/><ellipse cx="18" cy="12" rx="1.4" ry="1.8" fill="none" stroke="#8a5a2a" stroke-width="1"/><path d="M5 10.5h7M7 13.5h6" stroke="#0004" stroke-width="1.2"/>',
  stone: '<path d="M3.5 18.5l2.2-7.5 5.3-4 6.5 2 3 6.5-3 4z"/><path d="M11 7l1.2 6.3 5.3 1.4M12.2 13.3l-4.7 5" stroke="#0004" fill="none" stroke-width="1.3"/>',
  planks: '<rect x="2.5" y="4.5" width="19" height="4.2" rx="1"/><rect x="2.5" y="10" width="19" height="4.2" rx="1" opacity=".85"/><rect x="2.5" y="15.5" width="19" height="4.2" rx="1" opacity=".7"/>',
  charcoal: '<path d="M3 17.5l3-6.5 5-2.2 5.2 1 3.8 4.2-1 4H5z"/><circle cx="10" cy="14" r="1.5" fill="#ff8a3a"/><circle cx="15" cy="12.8" r="1.1" fill="#ffc04a"/>',
  ore: '<path d="M3 18.5l2-8 6-4.2 7 2.2 3 7.2-3 3.8z" fill="#77706a"/><circle cx="10" cy="12" r="2.3"/><circle cx="15.2" cy="13.8" r="1.9"/><circle cx="11.6" cy="16.6" r="1.5"/>',
  ingot: '<path d="M2.5 17.5l3.5-7.5h12l3.5 7.5z"/><path d="M6 10l2.2-3.2h7.6L18 10z" fill="#fff" opacity=".45"/><path d="M2.5 17.5l3.5-7.5" stroke="#0003" stroke-width="1"/>',
  gem: '<path d="M6 4h12l4 5.5L12 21 2 9.5z"/><path d="M2 9.5h20M9 4l-1.5 5.5L12 21l4.5-11.5L15 4" stroke="#fff6" fill="none" stroke-width="1"/>',
  horse: '<path d="M6.5 21l.8-5.5C5 14.3 4.2 12 5 9.6L8.6 4l1.6 1.8L12.4 3.6l4.3 3.3c2.4 2 3.3 4.6 2.6 6.6l-2.6.6-2-2-1 3.2 1.4 5.7z"/><circle cx="10.3" cy="8.4" r=".9" fill="#0008"/>',
  sword: '<path d="M20.5 2.5l1 1-.3 2.2L11 15.9l-2.9-2.9L18.3 2.8z"/><path d="M5.2 13.4l5.4 5.4-1.3 1.3-1.7-1.6-2.8 2.8-1.3-1.3 2.8-2.8-1.6-1.7z"/>',
  axe: '<path d="M4 21l9.5-9.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11.5 6.5c2.5-3.5 7-4.5 10-3.5-1 3-1 7-3.5 10z"/>',
  mace: '<path d="M4 21l8-8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="15.5" cy="8.5" r="5"/><path d="M15.5 1.5v3M22.5 8.5h-3M20.5 3.5l-2 2M20.5 13.5l-2-2M10.5 3.5l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  spear: '<path d="M3 21L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M22 2l-2.2 7.5-5.3-5.3z"/>',
  javelin: '<path d="M3 17L16 4M8 21L21 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19.5 1.5l-.6 4.2-3-3zM23 6.5l-.6 4.2-3-3z"/>',
  bow: '<path d="M5 3c9 2 13 8 13 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 3l13 18" stroke="currentColor" stroke-width=".9"/><path d="M3 21L16 8" stroke="currentColor" stroke-width="1.5"/><path d="M18.5 5.5l-1.2 4-2.8-2.8z"/>',
  militia: '<path d="M12 2v20" stroke="currentColor" stroke-width="2"/><path d="M7 2v5a5 5 0 0 0 10 0V2" fill="none" stroke="currentColor" stroke-width="2"/>',
  hammer: '<path d="M3.5 20.5l9-9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M10 4.5l4-2 7.5 7.5-2 4z"/>',
  anvil: '<path d="M2 7h14c0 3 2.5 4 6 4-1 2.5-4 3.5-7 3.5h-1l1.5 4.5H8.5L10 14.5c-4 0-6.5-3-8-7.5z"/>',
  tech: '<path d="M9 2h6M10 2v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7.2 15h9.6l2.5 4.6c.3.6-.1 1.4-.8 1.4H5.5c-.7 0-1.1-.8-.8-1.4z"/>',
  scales: '<path d="M12 3v17M7 21h10M4 6h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7l-3 6.5h6zM20 7l-3 6.5h6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1 13.5a3 3 0 0 0 6 0zM17 13.5a3 3 0 0 0 6 0z"/>',
  flag: '<path d="M5 22V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5.5 3.5c4-2 7 2 13 0v9c-6 2-9-2-13 0z"/>',
  compass: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.8 8.2L13.4 13.4 8.2 15.8 10.6 10.6z"/>',
  map: '<path d="M2 5.5l6.5-2.5 7 2.5L22 3v15.5L15.5 21l-7-2.5L2 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 3v15.5M15.5 5.5V21" stroke="currentColor" stroke-width="1.5"/>',
  house: '<path d="M2.5 11.5L12 3l9.5 8.5"/><path d="M5 10.5V21h14V10.5L12 4.3z"/><rect x="10" y="14.5" width="4" height="6.5" fill="#0005"/>',
  wheat: '<path d="M12 22V8" stroke="currentColor" stroke-width="1.8"/><ellipse cx="12" cy="4.5" rx="2" ry="3"/><ellipse cx="8.5" cy="9" rx="2" ry="3" transform="rotate(-35 8.5 9)"/><ellipse cx="15.5" cy="9" rx="2" ry="3" transform="rotate(35 15.5 9)"/><ellipse cx="8.5" cy="14" rx="2" ry="3" transform="rotate(-35 8.5 14)"/><ellipse cx="15.5" cy="14" rx="2" ry="3" transform="rotate(35 15.5 14)"/>',
  lumber: '<rect x="2" y="15" width="20" height="5" rx="1.5"/><path d="M6 13L16 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M13.5 2.5c2-1.5 5-1.5 7 0-1 2-1 4-3 5z"/>',
  pick: '<path d="M12 9l-8.5 12.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3 7c5-5 13-5 18 0-2.5-1.3-5.5-2-9-2S5.5 5.7 3 7z"/>',
  saw: '<path d="M3 6h15l3 3v5H3z"/><path d="M3 14l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 1-3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17.5" cy="9.5" r="1.5" fill="#0006"/>',
  flame: '<path d="M12 22c-4.5 0-7.5-3-7.5-7 0-5 4.5-6.5 4.5-12 3 2 8 6 8 12 0-2-1-3.5-2-4 .5 2-.5 3.5-1.5 4.2 0-1.5-1-3.2-2-4 0 3-3 4-3 6.8 0 2 1.5 4 3.5 4z"/>',
  furnace: '<path d="M4 22V9l3-2V3h3v2.5L12 4l8 5v13z"/><path d="M8 22v-5a4 4 0 0 1 8 0v5z" fill="#ff8a3a"/>',
  crucible: '<path d="M5 6h14l-2 13a3 3 0 0 1-3 2.5h-4A3 3 0 0 1 7 19z"/><path d="M7 10h10" stroke="#ffc04a" stroke-width="2"/><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  tower: '<path d="M5 3h3v2h2V3h4v2h2V3h3v5l-2 2v12H7V10L5 8z"/><rect x="10.5" y="15" width="3" height="7" fill="#0005"/><rect x="10.8" y="10" width="2.4" height="2.6" fill="#0005"/>',
  horseshoe: '<path d="M5 21V12a7 7 0 0 1 14 0v9h-4.5v-9a2.5 2.5 0 0 0-5 0v9z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  fast: '<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/>',
  faster: '<path d="M1 5l7 7-7 7zM8.5 5l7 7-7 7zM16 5l7 7-7 7z"/>',
  save: '<path d="M4 3h13l4 4v14H4z"/><rect x="7" y="3" width="9" height="6" fill="#0005"/><rect x="7" y="13" width="10" height="6" rx="1" fill="#fff5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9 9.2a3 3 0 1 1 4.3 2.7c-.9.5-1.3 1.1-1.3 2.1" fill="none" stroke="#2a1d10" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="#2a1d10"/>',
  close: '<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M20 15.5A9 9 0 1 1 9.5 4a7 7 0 0 0 10.5 11.5z"/>',
  skull: '<path d="M12 2.5c5 0 8.5 3.4 8.5 8 0 2.7-1.3 4.6-3 5.6V20h-3v-2h-1.5v2h-2v-2H9.5v2h-3v-3.9c-1.7-1-3-2.9-3-5.6 0-4.6 3.5-8 8.5-8z"/><circle cx="8.6" cy="11" r="2" fill="#0008"/><circle cx="15.4" cy="11" r="2" fill="#0008"/>',
  trophy: '<path d="M6 3h12v5a6 6 0 0 1-12 0z"/><path d="M6 5H2.5c0 3.5 2 5 4 5.2M18 5h3.5c0 3.5-2 5-4 5.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 13.5h3v4h-3zM7 18h10v3H7z"/>',
  warn: '<path d="M12 2.5l10 18H2z"/><path d="M12 9v5" stroke="#2a1d10" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="#2a1d10"/>',
  up: '<path d="M12 3l8 9h-5v9H9v-9H4z"/>',
  trash: '<path d="M4 6h16M9 6V3.5h6V6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 8h12l-1 13H7z"/>',
  search: '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6.5V12l3.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  crown: '<path d="M2.5 7l5 4.5L12 4l4.5 7.5 5-4.5-2 12h-15z"/><rect x="4.5" y="19.5" width="15" height="2.5" rx="1"/>',
  castle: '<path d="M2 22V9h3V7h2v2h2V5h2V3h2v2h2v4h2V7h2v2h3v13z"/><path d="M10 22v-5a2 2 0 0 1 4 0v5z" fill="#0006"/>',
  shield: '<path d="M12 2l8.5 3v6.5c0 5-3.6 9-8.5 10.5C7.1 20.5 3.5 16.5 3.5 11.5V5z"/><path d="M12 4.3v15.4" stroke="#0003" stroke-width="1.5"/>',
  wall: '<path d="M2 21V9h3V6h3v3h3V6h2v3h3V6h3v3h3v12z"/><path d="M2 14h20M7 9v5M12 14v7M17 9v5" stroke="#0004" stroke-width="1.2"/>',
  battle: '<path d="M4 3l9.5 9.5M20 3l-9.5 9.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3 18l3 3M18 21l3-3M6.5 14.5l3 3M17.5 14.5l-3 3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  bag: '<path d="M8 3h8l-2 4h-4z"/><path d="M9.5 7h5c4 3 6 7 6 10a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4c0-3 2-7 6-10z"/>',
  people: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-5 3.5-8 8-8s8 3 8 8z"/>',
  idle: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-5 3.5-8 8-8s8 3 8 8z" opacity=".5"/><path d="M15 2h5l-5 5h5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  worker: '<circle cx="11" cy="8" r="3.6"/><path d="M4 21c0-5 3-8 7-8s7 3 7 8z"/><path d="M6.5 6.5a4.5 4.5 0 0 1 9 0z" fill="#e8b84a"/><path d="M5.5 6.5h11" stroke="#e8b84a" stroke-width="1.6"/>',
  hourglass: '<path d="M6 2h12v2l-4.5 8L18 20v2H6v-2l4.5-8L6 4z"/><path d="M9 20h6l-3-4z" fill="#0006"/>',
  plus: '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  minus: '<path d="M4 12h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  armor: '<path d="M7 3l5 2 5-2 4 4-2 3v11H5V10L3 7z"/><path d="M12 5v16" stroke="#0004" stroke-width="1.3"/>',
  heart: '<path d="M12 21C5 16 2 12.5 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5c0 4-3 7.5-10 12.5z"/>',
  speed: '<path d="M13 2L4 14h7l-2 8 9-12h-7z"/>',
  barracks: '<path d="M2 10l10-6 10 6v12H2z"/><path d="M8 22v-6h8v6" fill="#0005"/><path d="M12 4V1M12 1h4v2h-4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  townhall: '<path d="M12 2l10 6H2z"/><path d="M4 9h16v11H4z"/><path d="M6.5 11v7M10 11v7M14 11v7M17.5 11v7" stroke="#0005" stroke-width="1.6"/><path d="M2 20h20v2H2z"/>',
  market: '<path d="M3 9l2-6h14l2 6z"/><path d="M3 9h18v1.5a3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0A3 3 0 0 1 3 10.5z" fill="#c0392b"/><path d="M4.5 12v9h15v-9" fill="none" stroke="currentColor" stroke-width="2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="11" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  arrowR: '<path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  dot: '<circle cx="12" cy="12" r="5"/>',
  music: '<path d="M9 18V5.5l11-2.5v13" fill="none" stroke="currentColor" stroke-width="2.2"/><ellipse cx="6.3" cy="18" rx="3.2" ry="2.6"/><ellipse cx="17.3" cy="16" rx="3.2" ry="2.6"/>',
  musicOff: '<path d="M9 18V5.5l11-2.5v13" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".45"/><ellipse cx="6.3" cy="18" rx="3.2" ry="2.6" opacity=".45"/><ellipse cx="17.3" cy="16" rx="3.2" ry="2.6" opacity=".45"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  queue: '<path d="M4 6h12M4 12h12M4 18h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M17 15l4 3-4 3z"/>',
};

// Icons are pixel sprites. At boot each SVG above is drawn into a 16×16
// grid, snapped to hard pixels, given a dark outline and a light/dark
// bevel, and stored as two images: a mask (the sprite's shape, filled
// with the icon's colour) and an overlay (its shading and fixed colours).
const ICON_PX = 16, ICON_UP = 4;
function ic(name, cls = '', color) {
  return `<i class="ic i-${name} ${cls}"${color ? ` style="color:${color}"` : ''} aria-hidden="true"></i>`;
}

function installIcons() {
  const N = ICON_PX, U = ICON_UP;
  const css = [];
  const sprite = (key, img) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d');
    g.drawImage(img, 1, 1, N - 2, N - 2);
    const d = g.getImageData(0, 0, N, N).data;
    const on = new Uint8Array(N * N), over = new Uint8ClampedArray(N * N * 4);
    for (let i = 0; i < N * N; i++) on[i] = d[i * 4 + 3] > 100 ? 1 : 0;
    const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && on[y * N + x];
    const put = (i, r, gg, b, a) => { over[i * 4] = r; over[i * 4 + 1] = gg; over[i * 4 + 2] = b; over[i * 4 + 3] = a; };
    const shape = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (on[i]) {
        shape[i] = 1;
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        const grey = Math.max(r, gg, b) - Math.min(r, gg, b) < 28, v = (r + gg + b) / 3;
        if (!grey) put(i, r, gg, b, 255);                                   // fixed colour detail
        else if (v < 228) put(i, 0, 0, 0, Math.round((1 - v / 255) * 4) / 4 * 255);   // shading detail
        else if (!at(x, y - 1)) put(i, 255, 255, 255, 80);                  // lit top edge
        else if (!at(x, y + 1) || !at(x + 1, y)) put(i, 0, 0, 0, 60);       // shaded bottom/right edge
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        shape[i] = 1; put(i, 20, 13, 8, 235);                               // outline
      }
    }
    // blow both layers up with hard pixels so the browser never blurs them
    const big = (fill) => {
      const o = document.createElement('canvas'); o.width = o.height = N * U;
      const og = o.getContext('2d');
      for (let i = 0; i < N * N; i++) { const col = fill(i); if (col) { og.fillStyle = col; og.fillRect((i % N) * U, Math.floor(i / N) * U, U, U); } }
      return o.toDataURL();
    };
    const m = big(i => shape[i] ? '#fff' : null);
    const o = big(i => over[i * 4 + 3] ? `rgba(${over[i * 4]},${over[i * 4 + 1]},${over[i * 4 + 2]},${(over[i * 4 + 3] / 255).toFixed(3)})` : null);
    css.push(`.i-${key}{--m:url(${m});--o:url(${o})}`);
  };
  const jobs = Object.entries(ICONS).map(([k, v]) => new Promise(res => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${N}" height="${N}" fill="#ffffff" style="color:#ffffff">${v}</svg>`;
    const img = new Image();
    img.onload = () => { try { sprite(k, img); } catch (e) { /* leave this icon blank */ } res(); };
    img.onerror = () => res();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }));
  return Promise.all(jobs).then(() => {
    const st = document.createElement('style');
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  });
}
