import { computePhysics, alphaForCL, MODEL } from './physics.js';
import { renderForces, renderPolar } from './diagrams.js';
import { TransitionLab } from './transition-lab.js';
import { getPalette, setTheme, onThemeChange } from './theme.js';
import { GestureController } from './gestures.js';
import { PressureCallouts } from './pressure-callouts.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const compactDevice = matchMedia('(max-width: 760px)').matches;
const format = (number, digits = 2) => Number(number).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const baseState = () => ({ alpha: 6, ar: 8, speed: 50, stage: 2, paused: reducedMotion, playback: 1,
  quality: compactDevice ? 'balanced' : 'high', autoRotate: false,
  layers: { particles: true, sheet: true, pressure: false, pressureLabels: true, vectors: false, forces: false, labels: true } });
let state = baseState();
let scene = null;
let currentView = 'perspective';
let currentDialog = null;
let toastTimer;
let lastFocused;
let transitionLab = null;
let currentWorkspace = 'transition';
let gestureControls = null;

const chapters = [
  { tag: 'TUTTO COMINCIA DALLA PORTANZA', title: 'Una differenza che muove l’aria.',
    text: 'Con portanza positiva, la pressione è mediamente maggiore sull’<strong>intradosso</strong> e minore sull’<strong>estradosso</strong>. Alle estremità il flusso aggira il bordo libero: sotto va verso l’esterno, sopra verso l’interno.',
    insight: '<button data-inline-view="tip">Osserva un’estremità da vicino <svg class="icon inline-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></button> Segui le frecce dal ventre al dorso e poi nella scia.',
    layers: {particles:true,sheet:true,pressure:true,vectors:false,forces:false}, view:'perspective' },
  { tag: 'DAL BORDO D’USCITA ALLA SCIA', title: 'I vortici non nascono solo in punta.',
    text: 'La <strong>circolazione Γ diminuisce verso le estremità</strong>. La sua variazione lungo l’apertura lascia una superficie vorticosa distribuita lungo il bordo d’uscita. A valle questa scia comincia ad avvolgersi.',
    insight: 'Segui i filamenti dal bordo d’uscita: appartengono alla stessa superficie vorticosa.',
    layers:{particles:true,sheet:true,pressure:false,vectors:false,forces:false},view:'perspective' },
  { tag: 'LA SCIA PRENDE FORMA', title: 'Due vortici, una sola origine.',
    text: 'La scia si arrotola in <strong>due vortici controrotanti</strong>, trasportati a valle dalla corrente. I traccianti rendono visibile questo moto: le spirali non sono oggetti solidi, ma percorsi illustrativi del fluido.',
    insight: 'Prova la vista <button data-inline-view="rear">Da poppa <svg class="icon inline-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></button> e osserva i due versi di rotazione.',
    layers:{particles:true,sheet:true,pressure:false,vectors:false,forces:false},view:'perspective' },
  { tag: 'LA VELOCITÀ INDOTTA', title: 'Fra i vortici, l’aria scende.',
    text: 'Fra i nuclei, i contributi di velocità si sommano verso il basso: è il <strong>downwash</strong>. All’esterno il moto indotto è verso l’alto. Anche all’ala la corrente è inclinata: l’incidenza efficace diventa <strong>α<sub>eff</sub> = α − α<sub>i</sub></strong>.',
    insight: 'Il valore w nel pannello è il downwash all’ala; le frecce nella scia mostrano il campo qualitativo.',
    layers:{particles:true,sheet:false,pressure:false,vectors:true,forces:false},view:'rear' },
  { tag: 'IL PREZZO DELLA PORTANZA', title: 'Una forza inclinata genera resistenza.',
    text: 'La risultante inviscida <strong>R</strong>, normale alla corrente locale, si inclina verso valle. Rispetto alla corrente indisturbata si scompone in portanza <strong>L</strong> e resistenza indotta <strong>D<sub>i</sub></strong>. La scia riceve energia cinetica.',
    insight: '<button data-open-forces>Esplora il triangolo delle velocità e delle forze <svg class="icon inline-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></button>',
    layers:{particles:true,sheet:false,pressure:false,vectors:true,forces:true},view:'side' }
];

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 4200);
}

function updateState() {
  state.physics = computePhysics(state);
  const p = state.physics;
  for (const key of ['alpha','ar','speed']) {
    const input = $(key);
    input.value = state[key];
    input.style.setProperty('--range-fill', ((state[key] - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100) + '%');
    input.setAttribute('aria-valuetext', key === 'alpha' ? `${format(state.alpha,1)} gradi` : key === 'ar' ? format(state.ar,1) : `${format(state.speed,0)} metri al secondo`);
  }
  $('alpha-value').innerHTML = `${format(state.alpha,1)}<small>°</small>`;
  $('ar-value').textContent = format(state.ar,1);
  $('speed-value').innerHTML = `${format(state.speed,0)}<small>m/s</small>`;
  $('metric-cl').textContent = format(p.cl,3);
  $('metric-w').textContent = format(p.w,2);
  $('metric-ai').textContent = format(p.alphaI * 180 / Math.PI,2);
  $('metric-drag').textContent = format(p.drag,0);
  $('cdi-value').textContent = format(p.cdi,4);
  for (const [key, value] of Object.entries(state.layers)) {
    const el = $(`layer-${key}`);
    if (el) el.checked = value;
  }
  $('pressure-legend').hidden = !state.layers.pressure || state.alpha === 0;
  $('pressure-flow-status').textContent = !state.layers.particles ? 'Traccianti nascosti' : state.paused ? 'Flusso in pausa' : 'Flusso animato';
  $('pressure-flow-status').classList.toggle('is-moving',state.layers.particles&&!state.paused);
  $('scene-legend').hidden = state.alpha === 0 || (!state.layers.particles && !state.layers.sheet);
  $('phase-insight').innerHTML = state.alpha === 0
    ? 'α = 0°: il profilo simmetrico non genera portanza; vortici, downwash e resistenza indotta si annullano.'
    : chapters[state.stage].insight;
  $('play-toggle').setAttribute('aria-label', state.paused ? 'Riprendi l’animazione' : 'Metti in pausa l’animazione');
  $('play-toggle').setAttribute('aria-pressed', String(state.paused));
  $('play-toggle').innerHTML = `<svg class="icon"><use href="#i-${state.paused ? 'play' : 'pause'}"/></svg>`;
  $('play-status').textContent = state.paused ? 'Flusso in pausa' : 'Flusso in movimento';
  $('quality-label').textContent = state.quality === 'high' ? 'alta' : 'fluida';
  document.querySelectorAll('[data-playback]').forEach(b => {
    const active = Number(b.dataset.playback) === state.playback;
    b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
  });
  renderPolar($('polar-chart'), state);
  scene?.setState(state);
  if (currentDialog === 'forces') updateForceDialog();
}

function selectView(view, notify = false) {
  currentView = view;
  $('stage').dataset.view = view;
  scene?.setView(view);
  document.querySelectorAll('[data-view]').forEach(b => {
    const active = b.dataset.view === view;
    b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active));
  });
  if (notify && view === 'rear') toast('Vista da poppa verso il muso: fra i nuclei, l’aria scende.');
  if (notify && view === 'bottom') toast('Vista del ventre: l’intradosso è la superficie inferiore dell’ala.');
  if (notify && view === 'tip') toast('Segui le frecce: sotto verso l’esterno, attorno alla punta verso l’alto, sopra verso l’interno.');
}

function setChapter(index, adjustView = true) {
  state.stage = ((index % 5) + 5) % 5;
  const chapter = chapters[state.stage];
  state.layers = { ...state.layers, ...chapter.layers };
  $('phase-number').textContent = String(state.stage + 1).padStart(2,'0');
  $('phase-tag').textContent = chapter.tag;
  $('phase-title').textContent = chapter.title;
  $('phase-text').innerHTML = chapter.text;
  $('phase-insight').innerHTML = chapter.insight;
  $('next-phase').setAttribute('aria-label',state.stage === 4 ? 'Ricomincia il percorso' : `Vai alla fase ${state.stage + 2}`);
  document.querySelectorAll('[data-stage]').forEach(b => {
    const active = Number(b.dataset.stage) === state.stage;
    b.classList.toggle('active',active);
    if (active) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
  });
  updateState();
  if (adjustView) selectView(chapter.view);
}

const sources = `<h3>Riferimenti</h3><ol class="sources-list">
  <li><a target="_blank" rel="noopener noreferrer" href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/downwash-effects-on-lift/">NASA Glenn · Downwash Effects on Lift</a><br>Differenza di pressione e flusso tridimensionale attorno alle estremità.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://web.mit.edu/16.unified/www/SPRING/fluids/Spring2005/Spring2005%20Lecture%20Notes/f06.pdf">MIT · Fluids, Lecture 6</a><br>Variazione della circolazione lungo l’apertura e superficie vorticosa distribuita.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://ocw.mit.edu/courses/16-100-aerodynamics-fall-2005/7efba19790d0680afeeea1a01bb7b301_16100lectre17_cg.pdf">MIT OpenCourseWare · Prandtl’s Lifting Line Introduction</a><br>Ipotesi, circolazione, velocità indotta e incidenza efficace.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://ocw.mit.edu/courses/16-100-aerodynamics-fall-2005/0d4e4bdb7badca18ff23efc20f99a285_16100lectre18_cg.pdf">MIT OpenCourseWare · Force Calculations for Lifting Line</a><br>Portanza, resistenza indotta e distribuzione ellittica.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://ocw.mit.edu/courses/16-100-aerodynamics-fall-2005/a50f5b9f91c0ad125d141e041e086167_16100lectre19_cg.pdf">MIT OpenCourseWare · Trefftz Plane Analysis of Induced Drag</a><br>La resistenza letta attraverso il moto trasversale della scia.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/">NASA Glenn · Induced Drag Coefficient</a><br>Formazione dei vortici e legge del coefficiente di resistenza indotta.</li>
  <li><a target="_blank" rel="noopener noreferrer" href="https://ntrs.nasa.gov/citations/20020041919">NASA NTRS · On Betz’ Method for Rollup of Vortex Sheets</a><br>Avvolgimento della superficie vorticosa nella scia.</li>
  </ol>`;

function openDialog(type) {
  currentDialog = type;
  lastFocused = document.activeElement;
  let html = '';
  if(type === 'transition') {
    $('dialog-eyebrow').textContent = 'DAL 2D AL 3D · prof. B. Raucci';
    html = `<h2>Una somma di velocità. Una forza che si inclina.</h2><p class="lead">La sezione visualizzata proviene dalla stessa geometria NACA 0012 dell’ala. Il piano di taglio si sposta con η; la corda locale è c(η) = c₀√(1 − η²). Durante l’estrazione, il profilo viene ingrandito uniformemente fino a due volte.</p>
      <h3>Il caso bidimensionale è un limite matematico</h3><p>Il pulsante <strong>2D</strong> rappresenta la sezione di un’ala di apertura infinita, priva di effetti di estremità. Non significa che una sottile fetta d’ala reale possa volare senza vortici. In questo limite, il downwash indotto dalle estremità è nullo e la risultante inviscida è verticale.</p>
      <h3>La costruzione vettoriale</h3><div class="math-box">V<sub>∞</sub> = (U, 0) &nbsp; · &nbsp; v<sub>i</sub> = (0, −w)<br>V<sub>loc</sub> = (U, −w)<br>α<sub>i</sub> = arctan(w / U) &nbsp; · &nbsp; α<sub>eff</sub> = α − α<sub>i</sub></div>
      <p>La risultante inviscida della sezione <strong>R′</strong> è normale alla corrente locale: è questa freccia a ruotare. La portanza <strong>L′</strong> è la sua componente verticale; la resistenza indotta <strong>Dᵢ′</strong> è la componente a valle. Il simbolo primo indica una forza per metro di apertura.</p>
      <div class="math-box">R′ = (Dᵢ′, L′)<br>Dᵢ′ / L′ = tan α<sub>i</sub> = w / U<br>V<sub>loc</sub> · R′ = U Dᵢ′ − w L′ = 0<small>La composizione e l’ortogonalità dei vettori sono geometricamente esatte nel modello.</small></div>
      <h3>Perché la freccia si accorcia</h3><p>La transizione mantiene fissa l’incidenza geometrica. Aumentando il downwash, diminuisce α<sub>eff</sub>; con la legge lineare c<sub>l</sub> = 2π α<sub>eff</sub> diminuiscono anche portanza e modulo della risultante. La freccia tratteggiata conserva il riferimento 2D.</p>
      <h3>Come vengono calcolati gli stati intermedi</h3><p>Un parametro τ, fra 0 e 1, attiva progressivamente l’effetto indotto. È un collegamento didattico fra due modelli, <strong>non il tempo fisico dell’avviamento della scia</strong>. Con carico ellittico ideale ed e = 1 si impone:</p>
      <div class="math-box">m = w / U = τ C<sub>L</sub> / (π AR)<br>C<sub>L</sub> = 2π [α − arctan(m)]<br>L′ = q<sub>∞</sub> c(η) C<sub>L</sub> &nbsp; · &nbsp; Dᵢ′ = L′ m<small>La relazione implicita è risolta numericamente. Si usa la pressione dinamica asintotica: rimane un modello ideale derivato dalla linea portante, con legge di portanza lineare.</small></div>
      <p>A τ = 0 si ottiene il limite 2D; a τ = 1 il modello di ala finita. L’uso dell’arcotangente mantiene esatta la geometria del triangolo e modifica solo marginalmente i valori rispetto all’approssimazione interamente lineare della vista “Scia vorticosa”.</p>
      <h3>Scala reale e amplificazione</h3><p><strong>Reali</strong> usa le inclinazioni fisiche del modello. <strong>×4</strong> amplifica insieme α, α<sub>i</sub> e α<sub>eff</sub>, ruotando coerentemente profilo, corrente e risultante. In questa modalità lo schema serve a leggere gli angoli; le lunghezze relative delle componenti non sono una misura in scala. I numeri mostrati restano reali. Durante il distacco, l’orientamento del profilo passa progressivamente a quello dello schema ingrandito.</p>
      <h3>Ipotesi</h3><p>Flusso incomprimibile e attaccato, profilo simmetrico ideale, ala ellittica senza svergolamento, e = 1, S = 16 m², ρ = 1,225 kg/m³. La resistenza di profilo e lo stallo sono esclusi. La precisione della linea portante diminuisce alle basse AR. Le scie nella vista della sezione sono illustrative; la vista “Scia vorticosa” conserva il modello a filamenti.</p>${sources}`;
  } else if(type === 'transition-help') {
    $('dialog-eyebrow').textContent = 'ESPLORA IL PASSAGGIO DAL 2D AL 3D';
    html = `<h2>Fermati nel punto in cui nasce la resistenza.</h2><p class="lead">La sequenza dura 24 secondi. Puoi riprodurla, fermarla e spostare il cursore in qualunque posizione per osservare come cambiano i vettori.</p><ol><li><strong>Estrai il profilo.</strong> Sposta “Posizione della sezione” per scegliere il taglio nell’ala.</li><li><strong>Seleziona 2D.</strong> Osserva il flusso asintotico e la risultante verticale.</li><li><strong>Passa al 3D.</strong> Segui la somma punta-coda delle velocità e l’inclinazione della corrente locale.</li><li><strong>Osserva R′.</strong> La forza ruota e si accorcia, perché a incidenza fissata diminuisce l’incidenza efficace.</li><li><strong>Scomponi.</strong> La proiezione a valle è Dᵢ′. Attiva “Reali” per vedere gli angoli fisici oppure “×4” per leggerli più facilmente.</li></ol><div class="help-shortcuts"><div><kbd>Spazio</kbd> Riproduci / pausa</div><div><kbd>1</kbd>–<kbd>5</kbd> Seleziona il passaggio</div><div><kbd>←</kbd><kbd>→</kbd> Passaggio precedente / successivo</div><div><strong>Trascina nella scena</strong><br>Ruota liberamente; la rotella controlla lo zoom.</div></div><p>Con <strong>Regia automatica</strong> l’inquadratura accompagna l’estrazione. I pulsanti <strong>Profilo</strong> e <strong>Ala</strong> consentono il confronto. La modalità lezione amplia la vista per la proiezione.</p><button class="diagram-button" data-dialog="transition">Equazioni, ipotesi e fonti ${'<svg class="icon"><use href="#i-arrow"/></svg>'}</button>`;
  } else if (type === 'forces') {
    $('dialog-eyebrow').textContent = 'DAL DOWNWASH ALLA RESISTENZA';
    html = `<h2>È una questione di direzione.</h2><p class="lead">La corrente locale scende. La forza normale a quella corrente si inclina verso valle. La sua componente orizzontale è la resistenza indotta.</p><div id="force-diagram" class="force-diagram"></div><div id="force-values" class="live-values"></div><div class="diagram-reading"><div><h3>1. Si inclina il flusso</h3><p>Il downwash si somma alla corrente indisturbata: <span class="formula-inline">V<sub>loc</sub> = V<sub>∞</sub> + v<sub>i</sub></span>. L’incidenza efficace diminuisce: <span class="formula-inline">α<sub>eff</sub> = α − α<sub>i</sub></span>.</p></div><div><h3>2. Si inclina la forza</h3><p>La risultante inviscida <strong>R</strong> è normale alla corrente locale. Le componenti riferite a V<sub>∞</sub> sono <strong>L</strong> e <strong>D<sub>i</sub></strong>: <span class="formula-inline">D<sub>i</sub> = L tan α<sub>i</sub> ≈ L α<sub>i</sub></span>.</p></div></div><p class="source-note">L’angolo e la componente longitudinale dei diagrammi sono amplificati per la lettura. I dati numerici sono quelli del modello lineare; nella scena 3D le frecce delle forze mantengono la stessa scala.</p><button class="diagram-button" data-dialog="physics">Approfondisci il modello e le equazioni <svg class="icon"><use href="#i-arrow"/></svg></button>`;
  } else if (type === 'help') {
    $('dialog-eyebrow').textContent = 'UNA GALLERIA DEL VENTO DA ESPLORARE';
    html = `<h2>Entra nel flusso.</h2><p class="lead">Usa i cinque passaggi numerati per seguire il fenomeno, oppure esplora liberamente con i controlli a destra.</p><div class="help-shortcuts"><div><strong>Ruota l’ala</strong><br>Trascina con il mouse o con un dito.</div><div><strong>Avvicina il punto di vista</strong><br>Rotella del mouse o gesto con due dita.</div><div><kbd>Spazio</kbd> Pausa / riprendi l’animazione</div><div><kbd>1</kbd>–<kbd>5</kbd> Seleziona un passaggio</div><div><kbd>←</kbd><kbd>→</kbd> Passaggio precedente / successivo</div><div><kbd>R</kbd> Ripristina il punto di vista</div></div><h3>Tre osservazioni da fare in classe</h3><ol><li><strong>Porta l’incidenza a zero.</strong> Il profilo è simmetrico: nel modello si annullano portanza, circolazione, downwash e resistenza indotta.</li><li><strong>Passa alla vista da poppa.</strong> Attiva “Velocità indotta”: i contributi dei due vortici sono entrambi diretti in basso tra i nuclei.</li><li><strong>Confronta due allungamenti allo stesso C<sub>L</sub>.</strong> I pulsanti qui sotto mantengono C<sub>L</sub> = 0,50 e V = 50 m/s: raddoppiando AR, C<sub>Dᵢ</sub> si dimezza.</li></ol><div class="preset-actions"><button data-preset="short">AR = 6 · C<sub>L</sub> = 0,50</button><button data-preset="long">AR = 12 · C<sub>L</sub> = 0,50</button><button data-preset="zero">Prova α = 0°</button></div><p class="source-note">“Modalità lezione” amplia la scena per la proiezione. Se il computer è meno potente, seleziona “Qualità fluida”.</p>`;
  } else {
    $('dialog-eyebrow').textContent = type === 'model' ? 'IPOTESI, LETTURA E RIFERIMENTI' : 'LA FISICA DELLA SCIA';
    html = `<h2>Il prezzo aerodinamico della portanza.</h2><p class="lead">Una rappresentazione della scia in 3D, accompagnata da un modello quantitativo della linea portante di Prandtl.</p>
      <div class="model-grid"><div><span>ALA DI RIFERIMENTO</span><strong>Pianta ellittica · profilo NACA 0012</strong></div><div><span>DISTRIBUZIONE DI CARICO</span><strong>Ellittica ideale · e = 1</strong></div><div><span>SUPERFICIE E DENSITÀ</span><strong>S = 16 m² · ρ = 1,225 kg/m³</strong></div><div><span>REGIME DEL MODELLO</span><strong>Subsonico incomprimibile · flusso attaccato</strong></div></div>
      <h3>1. Dalla pressione alla circolazione</h3><p>Per portanza positiva l’ala presenta una differenza di pressione fra le due superfici. Vicino al bordo libero il flusso ha una componente trasversale: sull’intradosso tende all’esterno, sull’estradosso all’interno. La circolazione <strong>Γ</strong> varia lungo l’apertura e si annulla alle estremità. La relazione locale è <span class="formula-inline">L′ = ρ V<sub>∞</sub> Γ</span>.</p>
      <h3>2. Una superficie vorticosa, poi due nuclei</h3><p>La variazione della circolazione lascia vorticità nel fluido a valle di <strong>tutto il bordo d’uscita</strong>. Questa superficie vorticosa si avvolge progressivamente nei due vortici principali. Le traiettorie illuminate permettono di leggere la struttura: l’aria, normalmente, è trasparente. La condensazione dipende dalle condizioni atmosferiche.</p>
      <h3>3. Downwash e incidenza efficace</h3><p>Fra i vortici la velocità indotta è diretta verso il basso; all’esterno è diretta verso l’alto. Il campo agisce anche sull’ala. Per il carico ellittico ideale, il downwash alla linea portante è uniforme. Con <strong>w positivo come modulo verso il basso</strong>, il modello lineare usa:</p>
      <div class="math-box">α<sub>i</sub> ≈ w / V<sub>∞</sub> = C<sub>L</sub> / (π e AR)<br>α<sub>eff</sub> = α − α<sub>i</sub><small>Angoli in radianti. Il valore numerico di w riguarda l’ala, non una posizione arbitraria nella scia.</small></div>
      <p>Nel modello ideale con scia piana non arrotolata, il downwash lontano vale due volte quello alla linea portante. Questo fattore <strong>non va applicato ovunque</strong> nella scia già avvolta: la velocità locale dipende dalla posizione.</p>
      <h3>4. Dall’inclinazione della forza alla resistenza</h3><p>La risultante inviscida <strong>R</strong> è perpendicolare alla corrente locale, che è inclinata. Le componenti rispetto alla corrente indisturbata sono la portanza <strong>L</strong> e la resistenza indotta <strong>D<sub>i</sub></strong>. Per piccoli angoli, <span class="formula-inline">D<sub>i</sub> ≈ L α<sub>i</sub></span>.</p>
      <div class="math-box">C<sub>Dᵢ</sub> = C<sub>L</sub>² / (π e AR)<br>D<sub>i</sub> = ½ ρ V<sub>∞</sub>² S C<sub>Dᵢ</sub><br>P<sub>i</sub> = D<sub>i</sub> V<sub>∞</sub><small>e indica l’efficienza della distribuzione di portanza; qui è fissato a 1. Pᵢ è la potenza associata alla resistenza indotta.</small></div>
      <p>L’ala lascia energia nel moto trasversale della scia. La resistenza indotta esiste anche nel modello inviscido: non è un attrito supplementare da aggiungere al vortice.</p>
      <h3>5. Come leggere i controlli</h3><p><strong>Incidenza:</strong> modifica C<sub>L</sub> e, di conseguenza, circolazione e C<sub>Dᵢ</sub>. <strong>Allungamento:</strong> modifica l’apertura mantenendo S costante: <span class="formula-inline">b = √(AR · S)</span>. <strong>Velocità:</strong> cambia a incidenza fissata, quindi nel modello C<sub>L</sub> resta costante e sia L sia D<sub>i</sub> crescono con V².</p>
      <p>La frase “rallentando aumenta la resistenza indotta” si riferisce invece a <strong>portanza fissata</strong>: occorre aumentare C<sub>L</sub> e vale <span class="formula-inline">D<sub>i</sub> = L² / (π e q b²)</span>. Non è il vincolo del cursore di velocità in questo laboratorio.</p>
      <h3>Equazioni usate per i valori</h3><div class="math-box">a₀ = 2π &nbsp; · &nbsp; a = a₀ / [1 + a₀ / (π e AR)]<br>C<sub>L</sub> = a α &nbsp; · &nbsp; q = ½ ρ V<sub>∞</sub>² &nbsp; · &nbsp; L = q S C<sub>L</sub><small>Profilo simmetrico ideale: α di portanza nulla pari a 0. Il valore 2π è una pendenza teorica, non un dato sperimentale del NACA 0012.</small></div>
      <h3>Cosa è quantitativo e cosa è illustrativo</h3><p>I <strong>valori del pannello</strong> provengono dalle equazioni qui riportate. Il modello assume flusso attaccato, piccoli angoli e distribuzione ellittica; non calcola lo stallo, la resistenza di profilo o la comprimibilità. L’accuratezza della linea portante diminuisce alle basse AR.</p><p>La <strong>scia 3D</strong> è ottenuta facendo evolvere 64 filamenti vorticosi regolarizzati, inizializzati dalla variazione della circolazione lungo l’apertura. Ciascuno si muove nel campo di Biot–Savart degli altri. Il tempo di evoluzione trasversale è amplificato <strong>2,6 volte</strong> per rendere leggibile l’avvolgimento. Le frecce campionano il medesimo campo; le loro lunghezze sono illustrative. Colori e densità dei traccianti non sono misure. La mappa di pressione è qualitativa. Il rendering non è una soluzione CFD e non ricostruisce quantitativamente il nucleo viscoso.</p><p>Se WebGL non è disponibile, la modalità compatibile conserva la geometria tridimensionale, l’animazione e i controlli con un’illuminazione semplificata. La superficie vorticosa è allora rappresentata dai suoi filamenti.</p>
      ${sources}<p class="source-note">Rendering Three.js r180 · Modellazione geometrica e visualizzazione didattica originali. Le fonti sono consultabili nei link sopra.</p>`;
  }
  $('dialog-content').innerHTML = html;
  if (type === 'forces') updateForceDialog();
  if (!$('info-dialog').open) $('info-dialog').showModal();
  $('info-dialog').scrollTop = 0;
}

function updateForceDialog() {
  if (!$('force-diagram')) return;
  renderForces($('force-diagram'), state);
  const p = state.physics;
  $('force-values').innerHTML = `<span>α<sub>eff</sub><strong>${format(p.alphaEff*180/Math.PI)}°</strong></span><span>L<strong>${format(p.lift/1000,2)} kN</strong></span><span>D<sub>i</sub><strong>${format(p.drag,0)} N</strong></span><span>P<sub>i</sub><strong>${format(p.power/1000,1)} kW</strong></span>`;
}

function closeDialog() { $('info-dialog').close(); }
$('info-dialog').addEventListener('close', () => { currentDialog=null; lastFocused?.focus?.(); });
$('dialog-close').addEventListener('click', closeDialog);
$('info-dialog').addEventListener('click', e => { if (e.target === $('info-dialog')) { const r=e.target.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) closeDialog(); } });

for (const id of ['alpha','ar','speed']) $(id).addEventListener('input', e => { state[id] = Number(e.target.value); updateState(); });
document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => setChapter(Number(b.dataset.stage))));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => selectView(b.dataset.view,true)));
document.querySelectorAll('[data-playback]').forEach(b => b.addEventListener('click', () => { state.playback=Number(b.dataset.playback); updateState(); }));
for (const key of Object.keys(state.layers)) {
  $(`layer-${key}`)?.addEventListener('change', e => {
    state.layers[key] = e.target.checked;
    if(key==='pressure'&&e.target.checked)state.layers.particles=true;
    updateState();
  });
}
$('next-phase').addEventListener('click',() => setChapter(state.stage+1));
$('start-tour').addEventListener('click',() => { setChapter(0); if(state.alpha === 0) { state.alpha=6; updateState(); } toast('Parti dalla pressione: usa le cinque fasi o la freccia per proseguire.'); });
$('play-toggle').addEventListener('click',() => {state.paused=!state.paused;updateState();});
$('reset-camera').addEventListener('click',() => selectView('perspective'));
$('reset-all').addEventListener('click',() => {state=baseState();setChapter(2);toast('Condizioni ripristinate: α = 6°, AR = 8, V = 50 m/s.');});
$('quality-toggle').addEventListener('click',() => {state.quality=state.quality==='high'?'balanced':'high';updateState();toast(state.quality==='high'?'Qualità alta: traccianti più numerosi.':'Qualità fluida: meno traccianti, stessa fisica.');});
for(const id of ['physics-open','formula-info']) $(id).addEventListener('click',()=>openDialog(currentWorkspace==='transition'?'transition':'physics'));
for(const id of ['sources-open','model-open']) $(id).addEventListener('click',()=>openDialog(currentWorkspace==='transition'?'transition':'model'));
$('help-open').addEventListener('click',()=>openDialog(currentWorkspace==='transition'?'transition-help':'help'));
for(const id of ['forces-open','fallback-diagram']) $(id).addEventListener('click',()=>openDialog('forces'));
document.addEventListener('click', e => {
  const view=e.target.closest('[data-inline-view]');if(view) selectView(view.dataset.inlineView,true);
  if(e.target.closest('[data-open-forces]'))openDialog('forces');
  const dialog=e.target.closest('[data-dialog]');if(dialog)openDialog(dialog.dataset.dialog);
  const preset=e.target.closest('[data-preset]');
  if(preset){
    state.speed=50;
    if(preset.dataset.preset==='zero'){state.alpha=0;setChapter(2);}
    else{state.ar=preset.dataset.preset==='short'?6:12;state.alpha=alphaForCL(.5,state.ar);setChapter(4);}
    closeDialog();toast(preset.dataset.preset==='zero'?'Incidenza nulla: flusso uniforme, L = Dᵢ = 0.':`Confronto a CL = 0,50: AR = ${state.ar}, Dᵢ = ${format(state.physics.drag,0)} N.`);
  }
});

function lessonMode(value) {document.body.classList.toggle('lesson',value);$('exit-lesson').hidden=!value;setTimeout(()=>{scene?.resize();transitionLab?.resize();},20);}
$('lesson-mode').addEventListener('click',()=>lessonMode(true));
$('exit-lesson').addEventListener('click',()=>lessonMode(false));
$('fullscreen').addEventListener('click',async()=>{
  try {if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else{lessonMode(true);toast('Modalità lezione attivata.');}}catch{lessonMode(true);toast('Modalità lezione attivata.');}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!document.querySelector('dialog[open]'))lessonMode(false);
  if(currentWorkspace!=='wake')return;
  if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Space'){e.preventDefault();state.paused=!state.paused;updateState();}
  if(e.key==='ArrowRight'){e.preventDefault();setChapter(state.stage+1);}
  if(e.key==='ArrowLeft'){e.preventDefault();setChapter(state.stage-1);}
  if(/^[1-5]$/.test(e.key))setChapter(Number(e.key)-1);
  if(e.key.toLowerCase()==='r')selectView('perspective');
  if(e.key==='Escape')lessonMode(false);
});

setChapter(2,false);
$('scene').addEventListener('sceneerror', e => {state.paused=true;updateState();toast(e.detail || 'La grafica è stata interrotta. Ricarica la pagina per riprendere.');});
const labelElements=new Map();
const pressureCallouts = new PressureCallouts($('scene-labels'));
let lastLabels=0;
function updateLabels(t) {
  if(scene && currentWorkspace==='wake' && t-lastLabels>70){
    const rect=$('scene').getBoundingClientRect();
    const labels=scene.projectLabels?.()??[];
    const pressureLabels=state.layers.labels&&state.layers.pressureLabels!==false?labels.filter(label=>label.surface):[];
    const exclusions=[...$('stage').querySelectorAll('.scene-heading,.scene-tools,.view-selector,.scene-legend,.interaction-hint')].filter(el=>!el.hidden).map(el=>{
      const r=el.getBoundingClientRect();
      return{left:r.left-rect.left-8,right:r.right-rect.left+8,top:r.top-rect.top-8,bottom:r.bottom-rect.top+8};
    });
    const calloutBoxes=pressureCallouts.update(pressureLabels,{width:rect.width,height:rect.height,exclusions});
    const seen=new Set();
    for(const label of labels.filter(label=>!label.surface)){
      seen.add(label.id);
      let element=labelElements.get(label.id);
      if(!element){element=document.createElement('div');element.className='scene-label';$('scene-labels').append(element);labelElements.set(label.id,element);}
      element.className=`scene-label kind-${label.kind??'neutral'}`;
      element.textContent=label.text;
      const behindHeading=label.x<330&&label.y<205;
      const outside=label.x<20||label.x>rect.width-20||label.y<20||label.y>rect.height-65;
      const behindPressure=calloutBoxes.some(b=>label.x>b.left-50&&label.x<b.right+50&&label.y>b.top-10&&label.y<b.bottom+10);
      element.hidden=!label.visible||!state.layers.labels||behindHeading||outside||behindPressure;
      element.style.left=`${label.x}px`;element.style.top=`${label.y}px`;
    }
    for(const [id,el] of labelElements)if(!seen.has(id))el.hidden=true;
    lastLabels=t;
  }
  requestAnimationFrame(updateLabels);
}
async function ensureWakeScene(){
 if(scene)return;
 try {
  const { VortexScene } = await import('./scene.js');
  scene=new VortexScene($('scene'),state);
  if(scene.renderingMode === 'compatible') {
    $('quality-toggle').title='Grafica compatibile attiva: illuminazione semplificata, stessa scena tridimensionale';
  }
  selectView(currentView);
  $('loading-state').classList.add('loaded');
  setTimeout(()=>$('loading-state').hidden=true,450);
  requestAnimationFrame(updateLabels);
 } catch(error) {
  console.error('Impossibile avviare la vista 3D:',error);
  $('loading-state').hidden=true;
  $('error-state').hidden=false;
 }
}

async function setWorkspace(mode){
  gestureControls?.release();
  document.querySelector('.skip-link').setAttribute('href',mode==='transition'?'#tl-parameters':'#controls-panel');
  currentWorkspace=mode;document.body.dataset.workspace=mode;
  $('lab').hidden=mode!=='wake';$('transition-lab').hidden=mode!=='transition';
  for(const key of ['transition','wake']){const active=key===mode;$('mode-'+key).classList.toggle('active',active);$('mode-'+key).setAttribute('aria-pressed',String(active));}
  if(mode==='transition'){
    scene?.setActive(false);
    if(!transitionLab)transitionLab=new TransitionLab($('transition-lab'),{
      onParameters:s=>{for(const key of ['alpha','ar','speed'])state[key]=s[key];updateState();},
      onModel:()=>openDialog('transition')
    });
    transitionLab.setParameters(state);transitionLab.setActive(true);
  }else{
    transitionLab?.setActive(false);await ensureWakeScene();scene?.setActive(currentWorkspace==='wake');scene?.resize();
  }
}
$('mode-wake').addEventListener('click',()=>setWorkspace('wake'));
$('mode-transition').addEventListener('click',()=>setWorkspace('transition'));

const appearanceDialog=$('appearance-dialog');
const themeChoices=[...document.querySelectorAll('[data-theme-choice]')];
function reflectTheme(p){
  for(const b of themeChoices){const selected=b.dataset.themeChoice===p.id;b.setAttribute('aria-checked',String(selected));b.tabIndex=selected?0:-1;}
  $('appearance-open').setAttribute('aria-label',`Aspetto: ${p.name}`);
}
reflectTheme(getPalette());
onThemeChange(p=>{reflectTheme(p);renderPolar($('polar-chart'),state);if(currentDialog==='forces')updateForceDialog();});
$('appearance-open').addEventListener('click',()=>{appearanceDialog.showModal();themeChoices.find(b=>b.getAttribute('aria-checked')==='true')?.focus();});
$('appearance-close').addEventListener('click',()=>appearanceDialog.close());
appearanceDialog.addEventListener('close',()=>$('appearance-open').focus());
appearanceDialog.addEventListener('click',e=>{if(e.target!==appearanceDialog)return;const r=appearanceDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)appearanceDialog.close();});
themeChoices.forEach((b,i)=>{
  b.addEventListener('click',()=>setTheme(b.dataset.themeChoice));
  b.addEventListener('keydown',e=>{
    let next;if(['ArrowRight','ArrowDown'].includes(e.key))next=(i+1)%themeChoices.length;
    if(['ArrowLeft','ArrowUp'].includes(e.key))next=(i+themeChoices.length-1)%themeChoices.length;
    if(e.key==='Home')next=0;if(e.key==='End')next=themeChoices.length-1;
    if(next===undefined)return;e.preventDefault();e.stopPropagation();themeChoices[next].focus();setTheme(themeChoices[next].dataset.themeChoice);
  });
});
await setWorkspace(location.hash==='#scia'?'wake':'transition');
gestureControls = new GestureController({
  button: $('gesture-open'),
  getScene: () => currentWorkspace === 'transition' ? transitionLab : scene,
  onPause: () => {
    if (currentWorkspace === 'transition') transitionLab?.pause();
    else { state.paused = true; updateState(); }
  },
  onTransition: async () => {
    await setWorkspace('transition');
    await transitionLab.startFrom2D();
  },
  onSheet: async () => {
    await setWorkspace('wake');
    if (!scene) throw new Error('La scena della scia non è ancora disponibile.');
    state.paused = false;
    setChapter(1);
  },
  toast
});
$('gesture-lesson').addEventListener('click', () => gestureControls.open());
