import { getPalette, onThemeChange } from './theme.js';

/* Dynamic section board. The SVG is allocated once; update only changes
   attributes/text. The same amplification is applied to all three angles. */
let boardSerial = 0;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const blendColor=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const smooth=(v)=>{const t=clamp(v);return t*t*(3-2*t);};
const fmt=(v,d=2)=>finite(v).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d});
const xy=(x,y)=>`${x.toFixed(2)},${y.toFixed(2)}`;
const ray=(x,y,length,angle)=>[x+length*Math.cos(angle),y+length*Math.sin(angle)];
const arc=(x,y,r,a,b)=>{
  if(Math.abs(b-a)<.00001)return `M${xy(x+r,y)}`;
  const p=ray(x,y,r,a),q=ray(x,y,r,b);
  return `M${xy(...p)}A${r},${r} 0 ${Math.abs(b-a)>Math.PI?1:0} ${b>=a?1:0} ${xy(...q)}`;
};
function profilePath(x,y,chord) {
  const points=[],thickness=u=>.6*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u);
  for(let i=0;i<=64;i++){const q=(1-Math.cos(Math.PI*i/64))*.5;points.push([x+chord*(q-.25),y-chord*thickness(q)]);}
  for(let i=63;i>=0;i--){const q=(1-Math.cos(Math.PI*i/64))*.5;points.push([x+chord*(q-.25),y+chord*thickness(q)]);}
  return `M${points.map(p=>xy(...p)).join('L')}Z`;
}

export class TransitionVectors {
  constructor(container) {
    if(!container)throw new Error('Contenitore dello schema vettoriale non disponibile.');
    this.container=container;
    const id=`transition-vectors-${++boardSerial}`;
    const marker=(name,color,size=7)=>`<marker id="${id}-${name}" markerUnits="userSpaceOnUse" markerWidth="${size}" markerHeight="${size}" refX="${size-.4}" refY="${size/2}" orient="auto"><path d="M0,0 L${size},${size/2} L0,${size} L${size*.25},${size/2} Z" fill="${color}"/></marker>`;
    container.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 500" width="100%" role="img" aria-labelledby="${id}-title ${id}-desc" style="display:block;font-family:var(--font,'Space Grotesk',sans-serif);overflow:visible">
      <title id="${id}-title">Dalla sezione bidimensionale all'ala finita: velocità e forze</title>
      <desc id="${id}-desc">La velocità locale è la somma della velocità indisturbata e del downwash. La forza sulla stessa sezione NACA 0012 resta perpendicolare alla velocità locale, si inclina a valle e diminuisce rispetto al riferimento bidimensionale. La scomposizione mostra portanza e resistenza indotta per metro di apertura.</desc>
      <defs>
        ${marker('velocity','var(--d-velocity)')}${marker('local','var(--d-local)')}${marker('down','var(--d-downwash)',6)}${marker('resultant','var(--d-resultant)',8)}${marker('lift','var(--d-lift)',6)}${marker('drag','var(--d-drag)',5)}${marker('ghost','var(--d-muted)',5)}
        <linearGradient id="${id}-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--d-metalHighlight)"/><stop offset=".35" stop-color="var(--d-wing)"/><stop offset=".53" stop-color="var(--d-metalMidtone)"/><stop offset="1" stop-color="var(--d-metalShadow)"/></linearGradient>
        <radialGradient id="${id}-focus"><stop offset="0" stop-color="var(--d-accent)" stop-opacity="var(--d-focusOpacity)"/><stop offset="1" stop-color="var(--d-accent)" stop-opacity="0"/></radialGradient>
      </defs>
      <g fill="var(--d-ink)" font-size="16" font-weight="600" letter-spacing=".5"><text x="30" y="27">01 / VELOCITÀ LOCALE</text><text x="30" y="224">02 / LA FORZA NORMALE R′</text></g>
      <text data-el="mode" x="590" y="27" text-anchor="end" fill="var(--d-accentStrong)" font-size="16">Geometria reale</text>
      <path d="M30,199H590" stroke="var(--d-line)" stroke-width="1"/>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path data-el="velocity-reference" stroke="var(--d-muted)" stroke-dasharray="3 5" stroke-width="1"/>
        <path data-el="velocity" stroke="var(--d-velocity)" stroke-width="2.4" marker-end="url(#${id}-velocity)"/>
        <path data-el="down-ghost" stroke="var(--d-downwash)" stroke-width="1" stroke-dasharray="3 5" opacity="0"/>
        <path data-el="down" stroke="var(--d-downwash)" stroke-width="2.1" marker-end="url(#${id}-down)"/>
        <path data-el="local" stroke="var(--d-local)" stroke-width="2.6" marker-end="url(#${id}-local)"/>
        <path data-el="beta-top" stroke="var(--d-local)" stroke-width="1.2"/>
      </g>
      <circle cx="48" cy="82" r="3" fill="var(--d-ink)"/>
      <circle data-el="velocity-bead" r="3" fill="var(--d-surface)" stroke="var(--d-velocity)" stroke-width="1.4"/>
      <circle data-el="local-bead" r="3" fill="var(--d-surface)" stroke="var(--d-local)" stroke-width="1.4"/>
      <text data-el="velocity-label" x="143" y="67" fill="var(--d-velocity)" font-size="23" font-style="italic">V∞</text>
      <text data-el="local-label" fill="var(--d-local)" font-size="22" font-style="italic">V<tspan baseline-shift="sub" font-size="15">loc</tspan></text>
      <text data-el="down-label" fill="var(--d-downwash)" font-size="23" font-style="italic">w</text>
      <text data-el="addition-caption" x="48" y="179" fill="var(--d-muted)" font-size="19">V∞ + w = Vloc</text>
      <text data-el="w-value" font-family="var(--mono,'JetBrains Mono',monospace)" x="401" y="79" fill="var(--d-ink)" font-size="22" font-weight="500">w = 0,00 m/s</text>
      <text data-el="flow-status" x="401" y="105" fill="var(--d-local)" font-size="17">Flusso non deviato</text>
      <text data-el="beta-value" font-family="var(--mono,'JetBrains Mono',monospace)" x="401" y="133" fill="var(--d-muted)" font-size="19">αᵢ = 0,00°</text>
      <text data-el="phase-label" x="401" y="164" fill="var(--d-muted)" font-size="17">Riferimento 2D</text>
      <ellipse cx="170" cy="343" rx="150" ry="95" fill="url(#${id}-focus)"/>
      <g data-el="profile-group">
        <path d="${profilePath(170,345,225)}" fill="url(#${id}-metal)" stroke="var(--d-wingEdge)" stroke-width=".9"/>
        <path d="M113.75,345H338.75" fill="none" stroke="var(--d-ink)" stroke-width=".7" stroke-dasharray="5 5" opacity=".46"/>
      </g>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path data-el="force-reference" stroke="var(--d-muted)" stroke-width="1.35" stroke-dasharray="4 5" marker-end="url(#${id}-ghost)"/>
        <path data-el="force-projections" stroke="var(--d-muted)" stroke-width="1" stroke-dasharray="3 4"/>
        <path data-el="force-lift" stroke="var(--d-lift)" stroke-width="2.05" marker-end="url(#${id}-lift)"/>
        <path data-el="force-drag" stroke="var(--d-drag)" stroke-width="2.4" marker-end="url(#${id}-drag)"/>
        <path data-el="force-resultant" stroke="var(--d-resultant)" stroke-width="2.8" marker-end="url(#${id}-resultant)"/>
      </g>
      <circle cx="170" cy="345" r="3.1" fill="var(--d-surface)" stroke="var(--d-ink)" stroke-width="1"/>
      <circle data-el="force-bead" r="3" fill="var(--d-surface)" stroke="var(--d-resultant)" stroke-width="1.4"/>
      <text data-el="reference-label" x="103" y="255" fill="var(--d-muted)" font-size="18">R′₂D</text>
      <text data-el="resultant-label" fill="var(--d-resultant)" font-size="25" font-weight="500" font-style="italic">R′</text>
      <text data-el="lift-label" fill="var(--d-lift)" font-size="23" font-style="italic">L′</text>
      <text data-el="drag-label" fill="var(--d-drag)" font-size="23" font-style="italic">D′ᵢ</text>
      <text data-el="zero-force" x="48" y="288" fill="var(--d-ink)" font-size="18" opacity="0">L′ = D′ᵢ = 0</text>
      <path d="M166,348L91,382H40V402" fill="none" stroke="var(--d-muted)" stroke-width=".9"/>
      <text x="32" y="423" fill="var(--d-muted)" font-size="17">NACA 0012 · ¼ c</text>
      <text data-el="section-label" display="none">Sezione locale</text>
      <text data-el="force-relation" x="32" y="449" fill="var(--d-ink)" font-size="20">R′ ⟂ Vloc</text>
      <g data-el="incidence-group">
        <text x="405" y="241" fill="var(--d-ink)" font-size="15.5" font-weight="600" letter-spacing=".5">INCIDENZA LOCALE</text>
        <g fill="none" stroke-linecap="round">
          <path d="M412,275H575" stroke="var(--d-muted)" stroke-width="1" stroke-dasharray="3 5"/>
          <path data-el="chord-ray" stroke="var(--d-ink)" stroke-width="1.5"/>
          <path data-el="local-ray" stroke="var(--d-local)" stroke-width="1.7" marker-end="url(#${id}-local)"/>
          <path data-el="alpha-arc" stroke="var(--d-muted)" stroke-width="1"/>
          <path data-el="beta-arc" stroke="var(--d-local)" stroke-width="1.4"/>
          <path data-el="effective-arc" stroke="var(--d-lift)" stroke-width="1.4"/>
        </g>
        <circle cx="412" cy="275" r="2.5" fill="var(--d-ink)"/>
        <text data-el="alpha-label" fill="var(--d-ink)" font-size="20" font-style="italic">α</text>
        <text data-el="beta-label" x="450" y="263" fill="var(--d-local)" font-size="19" font-style="italic">αᵢ</text>
        <text data-el="effective-label" display="none" fill="var(--d-lift)">αeff</text>
        <text data-el="chord-label" text-anchor="end" fill="var(--d-muted)" font-size="16">corda</text>
        <text data-el="alpha-value" font-family="var(--mono,'JetBrains Mono',monospace)" x="405" y="415" fill="var(--d-ink)" font-size="19">α = 0,00°</text>
        <text data-el="effective-value" font-family="var(--mono,'JetBrains Mono',monospace)" x="405" y="440" fill="var(--d-lift)" font-size="19">αeff = 0,00°</text>
        <text x="405" y="463" fill="var(--d-muted)" font-size="17">αeff = α − αᵢ</text>
      </g>
      <path d="M30,475H590" stroke="var(--d-line)" stroke-width="1"/>
      <text data-el="caption" x="310" y="495" text-anchor="middle" fill="var(--d-muted)" font-size="16">Valori reali · forze per metro di apertura</text>
    </svg>`;
    this.svg=container.querySelector('svg');
    this.nodes={};this.svg.querySelectorAll('[data-el]').forEach(node=>{this.nodes[node.dataset.el]=node;});
    this._previousText={};this._previousAttr={};
    this._applyPalette(getPalette());
    this._releaseTheme=onThemeChange(palette=>this._applyPalette(palette));
  }
  _applyPalette(palette) {
    if(!this.svg)return;
    for(const key of ['ink','muted','line','surface','wing','wingEdge','accent','accentStrong','velocity','downwash','local','resultant','lift','drag']) {
      this.svg.style.setProperty('--d-'+key,palette[key]);
    }
    // Keep metal relief visible on dark paper without a bright white patch.
    // The light schemes retain their established gradient unchanged.
    const dark=palette.scheme==='dark';
    this.svg.style.setProperty('--d-metalHighlight',dark?palette.wingEdge:palette.surface);
    this.svg.style.setProperty('--d-metalMidtone',dark?blendColor(palette.wing,palette.paper,.22):palette.wingEdge);
    this.svg.style.setProperty('--d-metalShadow',dark?blendColor(palette.wing,palette.paper,.60):palette.muted);
    this.svg.style.setProperty('--d-focusOpacity',dark?'.045':'.08');
  }
  _attr(name,attributes) {
    const node=this.nodes[name];if(!node)return;
    const previous=this._previousAttr[name]||(this._previousAttr[name]={});
    for(const [key,value] of Object.entries(attributes)) {
      const text=String(value);if(previous[key]!==text){node.setAttribute(key,text);previous[key]=text;}
    }
  }
  _text(name,value) {
    if(this._previousText[name]===value)return;
    if(this.nodes[name])this.nodes[name].textContent=value;
    this._previousText[name]=value;
  }
  update(state={}) {
    if(!this.svg)return;
    const p=state.physics||{},gain=finite(state.gain,1)===4?4:1;
    const alpha=finite(state.alpha)*Math.PI/180;
    const beta=Math.max(0,finite(p.alphaIexact,finite(p.alphaI)));
    const effective=finite(p.alphaEff,alpha-beta);
    const displayAlpha=alpha*gain,displayBeta=beta*gain;
    const blend=clamp(finite(state.blend));
    const vectorReveal=clamp(finite(state.vectorReveal,1));
    const forceReveal=clamp(finite(state.forceReveal,1));
    const decomposition=clamp(finite(state.decomposition,1));
    const time=finite(state.time);
    const finiteFlow=beta>.000005;
    const w=finite(p.w);
    const active=finite(p.sectionLift2d)>1e-6||finite(p.sectionResultant)>1e-6;
    this._text('mode',gain===4?'Schema · angoli ×4 · valori reali':'Geometria reale · angoli ×1');
    this._text('w-value',`w = ${fmt(w)} m/s`);
    this._text('flow-status',finiteFlow?'Flusso deviato':'Flusso non deviato');
    this._text('beta-value',`αᵢ = ${fmt(beta*180/Math.PI)}°`);
    this._text('phase-label',blend<.005?'Riferimento 2D':blend>.995?'Ala finita · 3D':`2D → 3D · ${Math.round(blend*100)}%`);
    this._text('alpha-value',`α = ${fmt(alpha*180/Math.PI)}°`);
    this._text('effective-value',`αeff = ${fmt(effective*180/Math.PI)}°`);
    this._text('section-label',`Sezione locale · η = ${fmt(state.spanPosition)}`);

    // Velocity triangle: w translates from the common origin to the head of V∞.
    const ox=48,oy=82,U=254,dy=U*Math.tan(displayBeta);
    const move=smooth((vectorReveal-.1)/.7);
    const reveal=smooth(vectorReveal/.22)*(finiteFlow?1:0);
    const localReveal=smooth((vectorReveal-.32)/.58)*(finiteFlow?1:0);
    const wx=ox+U*move,ex=ox+U,ey=oy+dy;
    this._attr('velocity',{d:`M${xy(ox,oy)}H${ex}`});
    this._attr('velocity-reference',{d:`M${xy(ex,oy)}V${ey}`,opacity:finiteFlow?.25:0});
    this._attr('down',{d:`M${xy(wx,oy)}V${ey}`,opacity:reveal});
    this._attr('down-ghost',{d:`M${xy(ox,oy)}V${ey}`,opacity:reveal*(1-move)*.26});
    this._attr('local',{d:`M${xy(ox,oy)}L${xy(ex,ey)}`,opacity:localReveal});
    this._attr('beta-top',{d:arc(ox,oy,53,0,displayBeta),opacity:localReveal*.8});
    this._text('velocity-label',finiteFlow?'V∞':'V∞ = Vloc');
    this._attr('velocity-label',{x:finiteFlow?153:116});
    this._attr('down-label',{x:wx+11,y:oy+dy*.55+5,opacity:reveal});
    this._attr('local-label',{x:ox+U*.53,y:oy+dy*.53+21,opacity:localReveal});
    this._text('addition-caption',finiteFlow?'V∞ + w = Vloc':'Vloc = V∞ · w = 0');
    const u1=(time*.24)%1,u2=(time*.19+.25)%1;
    this._attr('velocity-bead',{cx:ox+U*u1,cy:oy,opacity:.85});
    this._attr('local-bead',{cx:ox+U*u2,cy:oy+dy*u2,opacity:localReveal*.9});

    // The same extracted NACA section: only its angle changes, never its shape.
    this._attr('profile-group',{transform:`rotate(${(displayAlpha*180/Math.PI).toFixed(5)} 170 345)`});
    const ax=170,ay=345,referenceLength=active?108:0;
    const referenceForce=finite(p.sectionLift2d);
    const actualResultant=finite(p.sectionResultant,Math.hypot(finite(p.sectionLift),finite(p.sectionDrag)));
    const ratio=referenceForce>1e-8?clamp(actualResultant/referenceForce,0,1.3):0;
    const resultantLength=referenceLength*ratio;
    const rx=ax+resultantLength*Math.sin(displayBeta),ry=ay-resultantLength*Math.cos(displayBeta);
    const refEnd=ay-referenceLength;
    const fOpacity=active?.55+.45*forceReveal:0;
    const components=smooth(decomposition)*(active?1:0);
    this._attr('force-reference',{d:`M${xy(ax,ay)}V${refEnd}`,opacity:active?.35+.25*blend:0});
    this._attr('reference-label',{opacity:active?blend:0});
    this._attr('force-resultant',{d:`M${xy(ax,ay)}L${xy(rx,ry)}`,opacity:fOpacity});
    this._attr('force-lift',{d:`M${xy(ax,ay)}V${ry}`,opacity:components});
    this._attr('force-drag',{d:`M${xy(ax,ay)}H${rx}`,opacity:components*(finiteFlow?1:0)});
    this._attr('force-projections',{d:`M${xy(ax,ry)}H${rx}V${ay}`,opacity:components*.48});
    this._attr('resultant-label',{x:rx+13,y:ry+19,opacity:fOpacity});
    this._attr('lift-label',{x:ax-31,y:ry+45,opacity:components});
    this._attr('drag-label',{x:Math.max(ax+34,rx+12),y:ay-18,opacity:components*(finiteFlow?1:0)});
    this._attr('zero-force',{opacity:active?0:1});
    const uf=(time*.25+.35)%1;
    this._attr('force-bead',{cx:ax+(rx-ax)*uf,cy:ay+(ry-ay)*uf,opacity:fOpacity*forceReveal*.9});
    this._text('force-relation',blend<.005?'R′₂D ⟂ V∞':'R′ ⟂ Vloc');

    // Incidence compass uses the same geometry as the section and velocity.
    const cx=412,cy=275;
    const chordEnd=ray(cx,cy,139,displayAlpha),localEnd=ray(cx,cy,146,displayBeta);
    this._attr('chord-ray',{d:`M${xy(cx,cy)}L${xy(...chordEnd)}`});
    this._attr('chord-label',{x:chordEnd[0]+5,y:chordEnd[1]+18});
    this._attr('local-ray',{d:`M${xy(cx,cy)}L${xy(...localEnd)}`});
    this._attr('alpha-arc',{d:arc(cx,cy,114,0,displayAlpha),opacity:alpha>1e-6?.65:0});
    this._attr('beta-arc',{d:arc(cx,cy,42,0,displayBeta),opacity:finiteFlow?1:0});
    this._attr('effective-arc',{d:arc(cx,cy,78,displayBeta,displayAlpha),opacity:effective>1e-6?1:0});
    const alphaText=ray(cx,cy,138,displayAlpha*.5);
    this._attr('alpha-label',{x:alphaText[0]+4,y:alphaText[1]+18,opacity:displayAlpha>.32?1:0});
    this._attr('beta-label',{opacity:finiteFlow?1:0});
    const effectiveText=ray(cx,cy,87,(displayAlpha+displayBeta)*.5);
    this._attr('effective-label',{x:effectiveText[0]-18,y:effectiveText[1]+26,opacity:effective>1e-6?1:0});
  }
  destroy() {
    this._releaseTheme?.();
    this.svg?.remove();this.svg=null;this.nodes={};this._previousText={};this._previousAttr={};
  }
}
