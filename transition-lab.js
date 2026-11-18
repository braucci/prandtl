import { computeTransitionPhysics, sequenceAt } from './transition-physics.js';
import { TransitionVectors } from './transition-vectors.js';

const f=(v,n=2)=>Number(v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n});
const icon=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;
const stages=[
  {short:'Estrai il profilo',title:'La stessa ala, osservata dall’interno.',tag:'01 / UNA SEZIONE REALE DELL’ALA',text:'Il piano luminoso individua una sezione. Il suo profilo si stacca dall’ala e si avvicina: forma e corda provengono esattamente da quella posizione.',mark:0},
  {short:'Il limite 2D',title:'Nel modello 2D, nessun effetto di estremità.',tag:'02 / IL PUNTO DI PARTENZA',text:'La sezione rappresenta il limite di apertura infinita. La velocità locale coincide con quella asintotica; la risultante inviscida è verticale e la resistenza indotta è nulla.',mark:.34},
  {short:'Somma le velocità',title:'Il downwash cambia la direzione del flusso.',tag:'03 / UNA SOMMA VETTORIALE',text:'Introduciamo l’effetto dell’ala finita. La velocità indotta, verso il basso, si aggiunge alla punta di V∞. La diagonale è la corrente locale Vloc che incontra il profilo.',mark:.57},
  {short:'Osserva la rotazione',title:'La forza resta normale alla corrente locale.',tag:'04 / STESSA INCIDENZA, FLUSSO DIVERSO',text:'La risultante R′ si inclina verso valle. L’incidenza efficace diminuisce: a incidenza geometrica fissata, la portanza della sezione diminuisce insieme a essa.',mark:.78},
  {short:'Scomponi la forza',title:'La componente a valle è la resistenza indotta.',tag:'05 / LA GEOMETRIA SPIEGA LA FORZA',text:'Proiettiamo R′ sugli assi della corrente indisturbata: L′ resta verticale, Dᵢ′ è diretta a valle. Il rapporto Dᵢ′/L′ è uguale a w/V∞. Le forze sono riferite a un metro di apertura.',mark:1}
];

export class TransitionLab {
  constructor(root, options={}) {
    this.root=root;this.options=options;this.active=false;
    this.state={alpha:6,ar:8,speed:50,spanPosition:.38,gain:4,progress:0,
      paused:matchMedia('(prefers-reduced-motion: reduce)').matches,playback:1,time:0};
    this.playing=!this.state.paused;this.duration=24;this.phase=-1;this.lastHUD=0;this.lastFrame=performance.now();
    this._renderShell();
    this.board=new TransitionVectors(this.$('tl-vector-board'));
    this._bind();this._update(true);
    this.ready=this._createScene();
    this._tick=this._tick.bind(this);this.raf=requestAnimationFrame(this._tick);
  }
  $(id){return this.root.querySelector('#'+id);}
  _renderShell(){
    this.root.innerHTML=`
      <div class="tl-grid">
        <section class="tl-visual" aria-label="Estrazione tridimensionale del profilo">
          <div class="tl-scene-stage">
            <div id="tl-scene" role="img" aria-label="Sezione NACA 0012 estratta dall’ala: osserva il passaggio dal limite 2D al flusso tridimensionale."></div>
            <div class="tl-ambient"></div>
            <div class="tl-hero"><div class="eyebrow"><span class="live-dot"></span> DAL PROFILO ALL’ALA · ESPERIENZA 02</div><h1>Una sezione.<br>Una nuova <em>direzione.</em></h1><p>Guarda nascere la resistenza indotta.</p></div>
            <div class="tl-top-right"><span class="tl-chip" id="tl-mode-chip">ESTRAZIONE DEL PROFILO</span><button class="icon-button" id="tl-camera-reset" aria-label="Ripristina l’inquadratura">${icon('reset')}</button></div>
            <div id="tl-labels" class="scene-labels" aria-hidden="true"></div>
            <div class="tl-section-identity"><span class="tl-identity-line"></span><div><small>SEZIONE ESTRATTA DALL’ALA</small><strong>NACA 0012 <span id="tl-eta">η = 0,38</span></strong><span id="tl-chord">Corda locale 1,67 m</span></div></div>
            <div class="tl-camera-tabs" role="group" aria-label="Inquadratura della sezione"><button data-section-view="cinematic" class="active" aria-pressed="true">Regia automatica</button><button data-section-view="section" aria-pressed="false">Profilo</button><button data-section-view="wing" aria-pressed="false">Ala</button></div>
            <div class="tl-scene-loading" id="tl-loading"><div class="loading-ring"></div><span>Preparazione del laboratorio…</span></div>
            <div class="tl-scene-error" id="tl-scene-error" hidden>La vista tridimensionale non è disponibile. La composizione vettoriale resta interattiva.</div>
          </div>
          <div class="tl-explanation"><div class="tl-phase-number" id="tl-phase-number">01</div><div><div class="eyebrow" id="tl-phase-tag"></div><h2 id="tl-phase-title"></h2><p id="tl-phase-text"></p></div><button class="next-phase" id="tl-next" aria-label="Passaggio successivo">${icon('arrow')}</button></div>
        </section>
        <aside class="tl-vector-panel" aria-label="Composizione delle velocità e delle forze">
          <div class="tl-panel-heading"><div><span class="eyebrow">IL PROFILO AL MICROSCOPIO</span><h2>La geometria della forza</h2></div><span class="tl-live">LIVE</span></div>
          <div class="tl-angle-control"><span id="tl-scale-note">Schema · angoli amplificati ×4</span><div role="group" aria-label="Scala degli angoli"><button data-gain="1" aria-pressed="false">Reali</button><button data-gain="4" class="active" aria-pressed="true">×4</button></div></div>
          <div id="tl-vector-board"></div>
          <div class="tl-numeric-note">VALORI REALI · FORZE PER METRO DI APERTURA</div>
          <div class="tl-live-metrics"><div><span>DOWNWASH <i>w</i></span><strong id="tl-w">0,00</strong><small>m/s</small></div><div><span>INCIDENZA EFFICACE</span><strong id="tl-aeff">6,00</strong><small>°</small></div><div><span>PORTANZA <i>L′</i></span><strong id="tl-lift">0</strong><small>N/m</small></div><div class="tl-drag-metric"><span>RESISTENZA INDOTTA <i>Dᵢ′</i></span><strong id="tl-drag">0,00</strong><small>N/m</small></div></div>
          <div class="tl-equality"><span id="tl-ratio">Dᵢ′ / L′ = tan αᵢ = w / V∞</span><button id="tl-model" aria-label="Leggi le ipotesi del modello">${icon('info')}</button></div>
        </aside>
      </div>
      <section class="tl-transport" aria-label="Sequenza animata dal 2D al 3D">
        <div class="tl-steps" role="group" aria-label="Passaggi della dimostrazione">${stages.map((s,i)=>`<button data-tl-step="${i}"><span>${String(i+1).padStart(2,'0')}</span>${s.short}</button>`).join('')}</div>
        <div class="tl-timeline-row"><button class="tl-play" id="tl-play" aria-label="Metti in pausa la sequenza">${icon('pause')}</button><button class="tl-replay" id="tl-replay" aria-label="Ricomincia la sequenza" title="Ricomincia">${icon('reset')}</button><span class="tl-time" id="tl-time">00:00</span><div class="tl-scrubber"><label for="tl-progress" class="sr-only">Avanzamento della dimostrazione</label><input id="tl-progress" type="range" min="0" max="1000" value="0" step="1"><div class="tl-timeline-ends"><span>Ala → sezione</span><span>2D</span><span>Somma vettoriale</span><span>Ala finita · 3D</span></div></div><div class="tl-endpoint-buttons"><button id="tl-to2d">2D</button><button id="tl-to3d">3D</button></div><select id="tl-playback" aria-label="Velocità della sequenza"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="1.5">1,5×</option></select></div>
      </section>
      <section class="tl-parameters" id="tl-parameters" tabindex="-1" aria-label="Parametri dell’ala e della sezione">
        <div class="tl-param"><div><label for="tl-alpha">Incidenza geometrica <i>α</i></label><output id="tl-alpha-value" for="tl-alpha">6,0°</output></div><input type="range" id="tl-alpha" min="0" max="10" step="0.1" value="6"><small>0° <span>10°</span></small></div>
        <div class="tl-param"><div><label for="tl-ar">Allungamento dell’ala <i>AR</i></label><output id="tl-ar-value" for="tl-ar">8,0</output></div><input type="range" id="tl-ar" min="4" max="16" step="0.1" value="8"><small>Ala corta <span>Ala allungata</span></small></div>
        <div class="tl-param"><div><label for="tl-section">Posizione della sezione <i>η</i></label><output id="tl-section-value" for="tl-section">0,38</output></div><input type="range" id="tl-section" min="0.05" max="0.85" step="0.01" value="0.38"><small>Verso la radice <span>Verso l’estremità</span></small></div>
        <div class="tl-param"><div><label for="tl-speed">Velocità asintotica <i>V∞</i></label><output id="tl-speed-value" for="tl-speed">50 m/s</output></div><input type="range" id="tl-speed" min="30" max="80" step="1" value="50"><small>30 m/s <span>80 m/s</span></small></div>
      </section>
      <div class="tl-bottom-note"><span>Modello ideale · incidenza fissata · transizione didattica, non un transitorio del fluido</span><span class="tl-signature">prof. B. Raucci</span></div>`;
  }
  _bind(){
    this.$('tl-play').addEventListener('click',()=>this.togglePlay());
    this.$('tl-replay').addEventListener('click',()=>{this.tween=null;this.state.progress=0;this.playing=true;this._update(true);});
    this.$('tl-progress').addEventListener('input',e=>{this.playing=false;this.tween=null;this.state.progress=Number(e.target.value)/1000;this._update(true);});
    this.$('tl-to2d').addEventListener('click',()=>this.goTo(.34));
    this.$('tl-to3d').addEventListener('click',()=>this.goTo(1));
    this.$('tl-playback').addEventListener('change',e=>this.state.playback=Number(e.target.value));
    this.$('tl-next').addEventListener('click',()=>this.goTo(stages[(this.phase+1)%5].mark));
    this.$('tl-camera-reset').addEventListener('click',()=>{this.scene?.setView('cinematic');this._selectView('cinematic');});
    this.root.querySelectorAll('[data-tl-step]').forEach(b=>b.addEventListener('click',()=>this.goTo(stages[Number(b.dataset.tlStep)].mark)));
    this.root.querySelectorAll('[data-gain]').forEach(b=>b.addEventListener('click',()=>{this.state.gain=Number(b.dataset.gain);this._update(true);}));
    this.root.querySelectorAll('[data-section-view]').forEach(b=>b.addEventListener('click',()=>{this.scene?.setView(b.dataset.sectionView);this._selectView(b.dataset.sectionView);}));
    for(const [id,key]of[['tl-alpha','alpha'],['tl-ar','ar'],['tl-section','spanPosition'],['tl-speed','speed']]) {
      this.$(id).addEventListener('input',e=>{this.state[key]=Number(e.target.value);this._update(true);this.options.onParameters?.(this.state);});
    }
    this.$('tl-model').addEventListener('click',()=>this.options.onModel?.());
    this.keyHandler=e=>{
      if(!this.active||document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.code==='Space'){e.preventDefault();this.togglePlay();}
      if(e.key==='ArrowRight'){e.preventDefault();this.goTo(stages[Math.min(4,this.phase+1)].mark);}
      if(e.key==='ArrowLeft'){e.preventDefault();this.goTo(stages[Math.max(0,this.phase-1)].mark);}
      if(/^[1-5]$/.test(e.key))this.goTo(stages[Number(e.key)-1].mark);
      if(e.key.toLowerCase()==='r')this.scene?.resetCamera();
    };
    document.addEventListener('keydown',this.keyHandler);
  }
  _selectView(view){this.root.querySelectorAll('[data-section-view]').forEach(b=>{const a=b.dataset.sectionView===view;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});}
  async _createScene(){
    try {
      const {SectionScene}=await import('./section-scene.js');
      this.scene=new SectionScene(this.$('tl-scene'),this.state);
      this.scene.setActive(this.active);
      this.$('tl-loading').hidden=true;
    }catch(e){console.error('Vista della sezione:',e);this.$('tl-loading').hidden=true;this.$('tl-scene-error').hidden=false;}
  }
  togglePlay(){this.tween=null;if(this.state.progress>=.999&&!this.playing)this.state.progress=0;this.playing=!this.playing;this._update(true);}
  pause(){this.tween=null;this.playing=false;this.state.paused=true;this._update(true);}
  async startFrom2D(){
    this.pause();
    await this.ready;
    this.tween=null;this.state.progress=.34;this.state.time=0;this.playing=true;this.lastFrame=performance.now();
    this.scene?.setView('section');this._selectView('section');this._update(true);
  }
  beginHandControl(){return this.scene?.beginHandControl()??false;}
  updateHandControl(offset){return this.scene?.updateHandControl(offset)??false;}
  endHandControl(){return this.scene?.endHandControl()??false;}
  goTo(p){this.playing=false;this.tween={from:this.state.progress,to:p,start:performance.now(),duration:900};}
  setParameters(s){for(const key of ['alpha','ar','speed'])if(Number.isFinite(s[key]))this.state[key]=s[key];this._update(true);}
  setActive(active){this.active=active;this.lastFrame=performance.now();this.scene?.setActive(active);if(active){this.scene?.resize();this._update(true);}}
  resize(){this.scene?.resize();}
  _update(hud=false){
    Object.assign(this.state,sequenceAt(this.state.progress));
    this.state.paused=!this.playing;
    this.state.physics=computeTransitionPhysics(this.state);
    this.board.update(this.state);
    this.scene?.setState(this.state);
    if(!hud)return;
    const p=this.state.physics;
    const phase=this.state.phase;
    if(phase!==this.phase){this.phase=phase;const s=stages[phase];this.$('tl-phase-number').textContent=String(phase+1).padStart(2,'0');this.$('tl-phase-tag').textContent=s.tag;this.$('tl-phase-title').textContent=s.title;this.$('tl-phase-text').textContent=s.text;this.root.querySelectorAll('[data-tl-step]').forEach(b=>{const i=Number(b.dataset.tlStep);b.classList.toggle('active',i===phase);b.classList.toggle('complete',i<phase);if(i===phase)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
    this.$('tl-mode-chip').textContent=this.state.extraction<.99?'ESTRAZIONE DEL PROFILO':this.state.blend<.001?'LIMITE BIDIMENSIONALE · 2D':this.state.blend>.999?'ALA FINITA · 3D':`EFFETTO 3D · ${Math.round(this.state.blend*100)}%`;
    this.$('tl-eta').textContent='η = '+f(this.state.spanPosition,2);
    this.$('tl-chord').textContent=`Corda reale ${f(p.sectionChord)} m · profilo ingrandito fino a 2× · ${this.state.gain===1?'angoli reali':'angoli ×4'}`;
    this.$('tl-ratio').textContent=this.state.alpha===0?'L′ = Dᵢ′ = 0 · αᵢ = 0°':'Dᵢ′ / L′ = tan αᵢ = w / V∞';
    this.$('tl-w').textContent=f(p.w);this.$('tl-aeff').textContent=f(p.alphaEff*180/Math.PI);
    this.$('tl-lift').textContent=f(p.sectionLift,0);this.$('tl-drag').textContent=f(p.sectionDrag,2);
    this.$('tl-scale-note').textContent=this.state.gain===1?'Geometria reale · angoli in scala':'Schema · angoli amplificati ×4';
    this.root.querySelectorAll('[data-gain]').forEach(b=>{const a=Number(b.dataset.gain)===this.state.gain;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});
    for(const [id,key,unit,digits]of[['tl-alpha','alpha','°',1],['tl-ar','ar','',1],['tl-section','spanPosition','',2],['tl-speed','speed',' m/s',0]]){
      const input=this.$(id);input.value=this.state[key];input.style.setProperty('--range-fill',((this.state[key]-Number(input.min))/(Number(input.max)-Number(input.min))*100)+'%');this.$(id+'-value').textContent=f(this.state[key],digits)+unit;
    }
    const sec=Math.round(this.state.progress*this.duration);
    this.$('tl-time').textContent=`00:${String(sec).padStart(2,'0')}`;
    this.$('tl-progress').value=Math.round(this.state.progress*1000);this.$('tl-progress').style.setProperty('--range-fill',this.state.progress*100+'%');
    this.$('tl-progress').setAttribute('aria-valuetext',`${Math.round(this.state.progress*100)} per cento, ${stages[phase].short}`);
    const desired=this.playing?'pause':'play';
    if(this.$('tl-play').dataset.icon!==desired){this.$('tl-play').innerHTML=icon(desired);this.$('tl-play').dataset.icon=desired;}
    this.$('tl-play').setAttribute('aria-label',this.playing?'Metti in pausa la sequenza':this.state.progress>=.999?'Rivedi l’animazione':'Riprendi la sequenza');
    this.$('tl-play').setAttribute('aria-pressed',String(this.playing));
    this.$('tl-to2d').classList.toggle('active',this.state.extraction>.99&&this.state.blend<.001);
    this.$('tl-to3d').classList.toggle('active',this.state.blend>.999);
    if(this.state.alpha===0)this.$('tl-phase-text').textContent='Incidenza nulla e profilo simmetrico: L′ = Dᵢ′ = 0. La corrente locale coincide con quella asintotica anche nel modello 3D. Aumenta α per osservare la rotazione.';
    else this.$('tl-phase-text').textContent=stages[phase].text;
  }
  _labels(){
    if(!this.scene?.projectLabels)return;
    this.labelMap??=new Map();const used=new Set();const w=this.$('tl-scene').clientWidth,h=this.$('tl-scene').clientHeight;
    for(const label of this.scene.projectLabels()){
      used.add(label.id);let el=this.labelMap.get(label.id);if(!el){el=document.createElement('div');this.$('tl-labels').append(el);this.labelMap.set(label.id,el);}
      el.className='scene-label kind-'+(label.kind||'neutral');el.textContent=label.text;
      el.style.left=label.x+'px';el.style.top=label.y+'px';el.hidden=!label.visible||label.x<25||label.x>w-25||label.y<30||label.y>h-70||(label.x<300&&label.y<200);
    }for(const[id,el]of this.labelMap)if(!used.has(id))el.hidden=true;
  }
  _tick(now){
    this.raf=requestAnimationFrame(this._tick);
    const dt=Math.min(.08,Math.max(0,(now-this.lastFrame)/1000));this.lastFrame=now;
    if(!this.active||document.hidden)return;
    if(this.playing)this.state.time+=dt*this.state.playback;
    let changed=false;
    if(this.tween){const t=Math.min(1,(now-this.tween.start)/this.tween.duration),e=t*t*(3-2*t);this.state.progress=this.tween.from+(this.tween.to-this.tween.from)*e;changed=true;if(t===1)this.tween=null;}
    else if(this.playing){this.state.progress=Math.min(1,this.state.progress+dt*this.state.playback/this.duration);changed=true;if(this.state.progress===1)this.playing=false;}
    const hud=now-this.lastHUD>80;
    if(changed||this.playing||hud)this._update(hud);
    if(hud){this._labels();this.lastHUD=now;}
  }
  destroy(){cancelAnimationFrame(this.raf);document.removeEventListener('keydown',this.keyHandler);this.scene?.destroy();this.board.destroy();}
}
