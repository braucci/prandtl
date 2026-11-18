import { getPalette } from './theme.js';

/* Exact numerical labels; amplified angles are explicitly identified in the SVG. */
const ids = new WeakMap();
let serial = 0;
const idFor = (element) => {
  if (!ids.has(element)) ids.set(element, `aerodiagram-${++serial}`);
  return ids.get(element);
};
const number = (value, decimals = 1) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString('it-IT', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) : '—';
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const blendColor = (a,b,t) => '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');

function airfoilPath(alphaDegrees) {
  const alpha = alphaDegrees * Math.PI / 180;
  const chord = 168, x0 = 35, y0 = 211;
  const points = [];
  const rotate = (x, y) => {
    const X = chord * (x - 0.25), Y = chord * y;
    return [x0 + chord * 0.25 + X * Math.cos(alpha) - Y * Math.sin(alpha),
      y0 + X * Math.sin(alpha) + Y * Math.cos(alpha)];
  };
  const thickness = x => 0.6 * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x
    + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  for (let i = 0; i <= 48; i++) {
    const x = (1 - Math.cos(Math.PI * i / 48)) / 2;
    points.push(rotate(x, -thickness(x)));
  }
  for (let i = 47; i >= 0; i--) {
    const x = (1 - Math.cos(Math.PI * i / 48)) / 2;
    points.push(rotate(x, thickness(x)));
  }
  return `M${points.map(p => p.map(v => v.toFixed(2)).join(',')).join('L')}Z`;
}

/** Side-by-side local-velocity and induced-force diagrams. */
export function renderForces(container, state) {
  if (!container) return;
  const id = idFor(container);
  const C = getPalette();
  const dark = C.scheme === 'dark';
  const metalHighlight = dark ? C.wingEdge : C.surface;
  const metalShadow = dark ? blendColor(C.wing,C.paper,.60) : C.wingEdge;
  const p = state.physics || {};
  const alpha = finite(state.alpha);
  const alphaI = Math.max(0, finite(p.alphaI));
  const active = finite(p.lift) > 0.00001;
  const theta = Math.min(alphaI * 6, 0.7);
  const ox = 31, oy = 84, velocityLength = 169;
  const vx = ox + velocityLength, vy = oy + Math.tan(theta) * velocityLength;
  const fx = 344, fy = 217, forceHeight = 125;
  const rx = fx + Math.tan(theta) * forceHeight, ry = fy - forceHeight;
  const arcR = 40;
  const arcX = fx + Math.sin(theta) * arcR, arcY = fy - Math.cos(theta) * arcR;
  const liftText = finite(p.lift) >= 1000 ? `${number(p.lift / 1000, 2)} kN` : `${number(p.lift, 0)} N`;
  const marker = (name, color) => `<marker id="${id}-${name}" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L7,3.5 L0,7 L1.6,3.5 Z" fill="${color}"/></marker>`;
  const arrow = (x1, y1, x2, y2, name, color, width = 2) => `<path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${color}" stroke-width="${width}" marker-end="url(#${id}-${name})"/>`;
  const velocity = active ? `
    ${arrow(ox, oy, vx, vy, 'local', C.local, 2.2)}
    ${arrow(vx, oy, vx, vy, 'downwash', C.downwash, 1.8)}
    <text x="${ox + velocityLength * 0.5}" y="${oy + (vy - oy) * 0.5 + 20}" fill="${C.local}" font-size="14">V<tspan baseline-shift="sub" font-size="10">eff</tspan></text>
    <text x="${vx + 11}" y="${oy + (vy - oy) * 0.5 + 5}" fill="${C.downwash}" font-size="14">w</text>
    <text x="32" y="161" fill="${C.muted}" font-size="11" font-family="var(--mono,'JetBrains Mono',monospace)">αᵢ = ${number(alphaI * 180 / Math.PI, 2)}°</text>` : `
    <text x="31" y="127" fill="${C.muted}" font-size="12">V<tspan baseline-shift="sub" font-size="9">eff</tspan><tspan baseline-shift="baseline"> = V∞ · nessuna deviazione</tspan></text>`;
  const forces = active ? `
    <path d="M${fx},${ry}H${rx}V${fy}" fill="none" stroke="${C.line}" stroke-width="1.5" stroke-dasharray="4 4"/>
    ${arrow(fx, fy, fx, ry, 'lift', C.lift, 2)}
    ${arrow(fx, fy, rx, fy, 'drag', C.drag, 2)}
    ${arrow(fx, fy, rx, ry, 'resultant', C.resultant, 2.5)}
    <path d="M${fx},${fy - arcR}A${arcR},${arcR} 0 0 1 ${arcX},${arcY}" fill="none" stroke="${C.muted}" stroke-width="1"/>
    <text x="${fx - 24}" y="${ry + 19}" fill="${C.lift}" font-size="16">L</text>
    <text x="${rx + 11}" y="${ry + 9}" fill="${C.resultant}" font-size="16">R</text>
    <text x="${Math.max(fx + 25, (fx + rx) / 2)}" y="${fy + 21}" fill="${C.drag}" font-size="15">Dᵢ</text>
    <text x="${fx + Math.tan(theta) * 58 + 12}" y="${fy - 55}" fill="${C.muted}" font-size="12">αᵢ</text>
    <circle cx="${fx}" cy="${fy}" r="3" fill="${C.resultant}"/>` : `
    <circle cx="${fx + 34}" cy="151" r="4" fill="${C.line}"/>
    <text x="${fx + 34}" y="183" fill="${C.muted}" text-anchor="middle" font-size="12">L = Dᵢ = 0</text>
    <text x="${fx + 34}" y="202" fill="${C.muted}" text-anchor="middle" font-size="11">Incidenza nulla, profilo simmetrico</text>`;
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 324" width="100%" role="img" aria-labelledby="${id}-title ${id}-desc" style="display:block;overflow:visible;font-family:var(--font,'Space Grotesk',sans-serif)">
    <title id="${id}-title">Downwash e resistenza indotta</title>
    <desc id="${id}-desc">Il downwash inclina il flusso locale verso il basso. La forza aerodinamica R, perpendicolare a questo flusso nel modello inviscido, si inclina a valle: la sua componente verticale è la portanza L e quella longitudinale è la resistenza indotta Di. Inclinazioni del flusso e della forza amplificate sei volte; valori numerici reali.</desc>
    <defs>
      ${marker('velocity', C.velocity)}${marker('local', C.local)}${marker('downwash', C.downwash)}${marker('resultant', C.resultant)}${marker('lift', C.lift)}${marker('drag', C.drag)}
      <linearGradient id="${id}-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${metalHighlight}"/><stop offset="0.47" stop-color="${C.wing}"/><stop offset="1" stop-color="${metalShadow}"/></linearGradient>
    </defs>
    <path d="M265,20V279" stroke="${C.line}" stroke-width="1"/>
    <text x="24" y="30" fill="${C.ink}" font-size="13" font-weight="600">Il flusso locale</text>
    <text x="287" y="30" fill="${C.ink}" font-size="13" font-weight="600">La forza aerodinamica</text>
    <text x="287" y="51" fill="${C.muted}" font-size="11">R ⟂ V<tspan baseline-shift="sub" font-size="8">eff</tspan><tspan baseline-shift="baseline"> · modello inviscido</tspan></text>
    ${arrow(ox, oy, vx, oy, 'velocity', C.velocity, 1.8)}
    <text x="100" y="70" fill="${C.velocity}" font-size="14">V∞</text>
    ${velocity}
    <path d="${airfoilPath(alpha)}" fill="url(#${id}-wing)" stroke="${C.wingEdge}" stroke-width="0.7"/>
    <text x="31" y="242" fill="${C.muted}" font-size="10">Profilo a incidenza geometrica reale</text>
    ${forces}
    <text x="24" y="270" fill="${C.ink}" font-size="12" font-family="var(--mono,'JetBrains Mono',monospace)">w = ${number(p.w, 2)} m/s</text>
    <text x="287" y="270" fill="${C.lift}" font-size="12" font-family="var(--mono,'JetBrains Mono',monospace)">L = ${liftText}</text>
    <text x="417" y="270" fill="${C.drag}" font-size="12" font-family="var(--mono,'JetBrains Mono',monospace)">Dᵢ = ${number(p.drag, 0)} N</text>
    <path d="M24,288H516" stroke="${C.line}" stroke-width="1"/>
    <text x="270" y="311" fill="${C.muted}" text-anchor="middle" font-size="10.5">Inclinazioni di flusso e forza amplificate ×6 · valori numerici reali</text>
  </svg>`;
}

/** Fixed axes let users compare the induced polar when changing aspect ratio. */
export function renderPolar(container, state) {
  if (!container) return;
  const id = `${idFor(container)}-polar`;
  const C = getPalette();
  const dark = C.scheme === 'dark';
  const p = state.physics || {};
  const ar = Math.max(1, finite(state.ar, 8));
  const clMax = 1.2, cdiMax = 0.08;
  const X = value => 35 + value / clMax * 202;
  const Y = value => 74 - value / cdiMax * 61;
  const end = Math.min(clMax, Math.sqrt(cdiMax * Math.PI * ar));
  const points = Array.from({length: 65}, (_, index) => {
    const cl = end * index / 64;
    return [X(cl), Y(cl * cl / (Math.PI * ar))];
  });
  const curve = `M${points.map(point => point.map(v => v.toFixed(2)).join(',')).join('L')}`;
  const cl = Math.max(0, Math.min(clMax, finite(p.cl)));
  const cdi = Math.max(0, Math.min(cdiMax, finite(p.cdi)));
  const cx = X(cl), cy = Y(cdi);
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100" width="100%" role="img" aria-labelledby="${id}-title ${id}-desc" style="display:block;overflow:visible;font-family:var(--font,'Space Grotesk',sans-serif)">
    <title id="${id}-title">Polare della sola resistenza indotta</title>
    <desc id="${id}-desc">Coefficiente di resistenza indotta in funzione del coefficiente di portanza: CDi uguale CL al quadrato diviso pi greco per AR. Assi fissi; punto corrente CL ${number(p.cl, 3)}, CDi ${number(p.cdi, 4)}.</desc>
    <defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity="0.12"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0.01"/></linearGradient></defs>
    <path d="M35,13H237M35,43.5H237" stroke="${dark?C.grid:C.line}" stroke-width="0.7" stroke-dasharray="2 4"/>
    <path d="M35,11V74H240" fill="none" stroke="${C.muted}" stroke-opacity="${dark?.7:.5}" stroke-width="0.8"/>
    <path d="${curve}L${X(end)},74L35,74Z" fill="url(#${id}-fill)"/>
    <path d="${curve}" fill="none" stroke="${C.accent}" stroke-width="1.8"/>
    <path d="M${cx},74V${cy}H35" fill="none" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="3 3"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="${C.accent}" fill-opacity="0.10"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="${C.accent}" stroke="${C.surface}" stroke-width="0.8"/>
    <text x="29" y="77" text-anchor="end" fill="${C.muted}" font-size="9.5" font-family="var(--mono,'JetBrains Mono',monospace)">0</text>
    <text x="29" y="16" text-anchor="end" fill="${C.muted}" font-size="9.5" font-family="var(--mono,'JetBrains Mono',monospace)">0,08</text>
    <text x="35" y="88" text-anchor="middle" fill="${C.muted}" font-size="9.5" font-family="var(--mono,'JetBrains Mono',monospace)">0</text>
    <text x="237" y="88" text-anchor="middle" fill="${C.muted}" font-size="9.5" font-family="var(--mono,'JetBrains Mono',monospace)">1,2</text>
    <text x="8" y="8" fill="${C.muted}" font-size="10.5">C<tspan baseline-shift="sub" font-size="7">Dᵢ</tspan></text>
    <text x="250" y="78" text-anchor="end" fill="${C.muted}" font-size="10.5">C<tspan baseline-shift="sub" font-size="7">L</tspan></text>
  </svg>`;
}
