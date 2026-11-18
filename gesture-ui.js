// Phosphor Duotone hand and camera symbols; gesture recognition is handled separately.
const paths={
  palm:'<path d="M208,116v36a80,80,0,0,1-160,0V76a20,20,0,0,1,40,0V44a20,20,0,0,1,40,0V60a20,20,0,0,1,40,0v56a20,20,0,0,1,40,0Z" opacity=".2"/><path d="M188,88a27.75,27.75,0,0,0-12,2.71V60a28,28,0,0,0-41.36-24.6A28,28,0,0,0,80,44v6.71A27.75,27.75,0,0,0,68,48,28,28,0,0,0,40,76v76a88,88,0,0,0,176,0V116A28,28,0,0,0,188,88Zm12,64a72,72,0,0,1-144,0V76a12,12,0,0,1,24,0v44a8,8,0,0,0,16,0V44a12,12,0,0,1,24,0v68a8,8,0,0,0,16,0V60a12,12,0,0,1,24,0v68.67A48.08,48.08,0,0,0,120,176a8,8,0,0,0,16,0,32,32,0,0,1,32-32,8,8,0,0,0,8-8V116a12,12,0,0,1,24,0Z"/>',
  fist:'<path d="M224,112v16a96,96,0,0,1-192,0V88a24,24,0,0,1,48,0V64a24,24,0,0,1,48,0,24,24,0,0,1,48,0V88h24A24,24,0,0,1,224,112Z" opacity=".2"/><path d="M200,80H184V64a32,32,0,0,0-56-21.13A32,32,0,0,0,72.21,60.42,32,32,0,0,0,24,88v40a104,104,0,0,0,208,0V112A32,32,0,0,0,200,80ZM152,48a16,16,0,0,1,16,16V80H136V64A16,16,0,0,1,152,48ZM88,64a16,16,0,0,1,32,0v40a16,16,0,0,1-32,0ZM40,88a16,16,0,0,1,32,0v16a16,16,0,0,1-32,0Zm176,40a88,88,0,0,1-175.92,3.75A31.93,31.93,0,0,0,80,125.13a31.93,31.93,0,0,0,44.58,3.35,32.21,32.21,0,0,0,11.8,11.44A47.88,47.88,0,0,0,120,176a8,8,0,0,0,16,0,32,32,0,0,1,32-32,8,8,0,0,0,0-16H152a16,16,0,0,1-16-16V96h64a16,16,0,0,1,16,16Z"/>',
  camera:'<path d="M200,72V184a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8H192A8,8,0,0,1,200,72Z" opacity=".2"/><path d="M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,248,184a8,8,0,0,0,8-8V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z"/>',
  off:'<path d="M200,72V184a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8H192A8,8,0,0,1,200,72Z" opacity=".2"/><path d="M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,248,184a8,8,0,0,0,8-8V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z"/><path d="M40 28L216 228" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>',
  minus:'<path d="M48 128H208" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>',
  plus:'<path d="M48 128H208M128 48V208" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${paths[name]||`<use href="#i-${name}"/>`}</svg>`;
const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const defaultMessages={off:'La videocamera è spenta.',loading:'Preparazione della videocamera e del riconoscimento…',active:'Videocamera attiva · elaborazione sul dispositivo.',error:'Impossibile avviare la videocamera. Puoi riprovare.'};

export class GestureUI{
  constructor({onStart,onStop}={}){
    this.onStart=onStart;this.onStop=onStop;this.status='off';this.minimized=false;this.returnFocus=null;
    this.dialog=document.createElement('dialog');
    this.dialog.id='gesture-dialog';this.dialog.className='gesture-dialog';
    this.dialog.setAttribute('aria-labelledby','gesture-title');this.dialog.setAttribute('aria-describedby','gesture-intro');
    this.dialog.innerHTML=`
      <div class="gesture-dialog-top"><span class="eyebrow">INTERAZIONE SENZA CONTATTO</span><button class="icon-button" data-gesture-close aria-label="Chiudi il pannello Gesture">${icon('close')}</button></div>
      <div class="gesture-dialog-title"><div><h2 id="gesture-title">Il laboratorio,<br><em>nelle tue mani.</em></h2><p id="gesture-intro">Orienta l’ala e guida la lezione con quattro gesti. Inquadra le mani intere, con il palmo rivolto alla videocamera.</p></div><div class="gesture-title-mark" aria-hidden="true">${icon('palm')}<span>GESTURE<br>CONTROL</span></div></div>
      <div class="gesture-dialog-grid">
        <section class="gesture-preview-panel" aria-label="Anteprima della videocamera">
          <div class="gesture-section-label"><span>LA TUA INQUADRATURA</span><span class="gesture-camera-status">OFF</span></div>
          <div class="gesture-dialog-slot"></div>
          <p class="gesture-preview-tip">Muovi il palmo lentamente. Per i comandi, mantieni il gesto finché l’indicatore si completa.</p>
        </section>
        <section class="gesture-guide" aria-label="Comandi con le mani">
          <div class="gesture-section-label"><span>QUATTRO GESTI, UN LABORATORIO</span></div>
          <ol class="gesture-cards">
            <li class="gesture-card"><div class="gesture-card-symbol">${icon('palm')}</div><div><span class="gesture-card-label">UN PALMO APERTO</span><h3>Orienta l’ala</h3><p>Sposta la mano: la vista segue il palmo.</p></div><span class="gesture-card-number">01</span></li>
            <li class="gesture-card"><div class="gesture-card-symbol">${icon('fist')}</div><div><span class="gesture-card-label">UN PUGNO CHIUSO</span><h3>Ferma l’animazione</h3><p>Metti in pausa il laboratorio attivo.</p></div><span class="gesture-card-number">02</span></li>
            <li class="gesture-card"><div class="gesture-card-symbol gesture-symbol-pair">${icon('palm')}${icon('palm')}</div><div><span class="gesture-card-label">DUE PALMI APERTI</span><h3>Dal 2D al 3D</h3><p>Avvia la sequenza dal profilo bidimensionale.</p></div><span class="gesture-card-number">03</span></li>
            <li class="gesture-card"><div class="gesture-card-symbol gesture-symbol-pair">${icon('fist')}${icon('fist')}</div><div><span class="gesture-card-label">DUE PUGNI CHIUSI</span><h3>Mostra la vortex sheet</h3><p>Apri la vista della superficie vorticosa.</p></div><span class="gesture-card-number">04</span></li>
          </ol>
        </section>
      </div>
      <div class="gesture-permission-note">${icon('check')}<p>Il riconoscimento avviene nel browser. Le immagini non vengono registrate né inviate a un server. Il microfono resta spento.</p></div>
      <div class="gesture-dialog-footer"><p class="gesture-state-message" role="status">${defaultMessages.off}</p><div class="gesture-dialog-actions"><button class="gesture-secondary" data-gesture-stop hidden>${icon('off')}<span>Disattiva</span></button><button class="gesture-primary" data-gesture-start>${icon('camera')}<span>Attiva la videocamera</span></button><button class="gesture-primary" data-gesture-use hidden>${icon('palm')}<span>Usa le gesture</span></button></div></div>`;

    this.hud=document.createElement('aside');this.hud.className='gesture-hud';this.hud.hidden=true;
    this.hud.setAttribute('aria-label','Controllo con le mani');
    this.hud.innerHTML=`<div class="gesture-hud-heading"><span class="gesture-hud-brand"><i></i>GESTURE</span><div class="gesture-hud-tools"><button data-gesture-minimize aria-label="Riduci anteprima videocamera" aria-expanded="true" title="Riduci anteprima">${icon('minus')}</button><button data-gesture-settings aria-label="Apri il pannello Gesture" title="Comandi Gesture">${icon('sliders')}</button><button data-gesture-stop aria-label="Disattiva videocamera e gesture" title="Disattiva videocamera">${icon('off')}</button></div></div><div class="gesture-hud-slot"></div>`;

    this.feedBlock=document.createElement('div');this.feedBlock.className='gesture-feed-block';
    this.feedBlock.innerHTML=`<div class="gesture-feed"><video autoplay muted playsinline aria-label="Anteprima specchiata della videocamera"></video><canvas aria-hidden="true"></canvas><div class="gesture-feed-empty"><div class="gesture-feed-reticle"><span></span>${icon('palm')}<span></span></div><strong>Uno spazio per le tue mani.</strong><small>Attiva la videocamera per iniziare</small></div><div class="gesture-feed-tag" aria-hidden="true"><i></i><span>VIDEO LOCALE</span></div><div class="gesture-feed-corners" aria-hidden="true"></div></div><div class="gesture-readout" data-kind="idle"><div class="gesture-readout-top"><span class="gesture-feedback-label" role="status" aria-live="polite">In attesa di attivazione</span><span class="gesture-progress-number" aria-hidden="true"></span></div><p class="gesture-feedback-detail">La vista si orienta senza modificare l’incidenza aerodinamica.</p><div class="gesture-progress" aria-hidden="true"><span></span></div></div>`;
    this.video=this.feedBlock.querySelector('video');this.video.muted=true;this.canvas=this.feedBlock.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    this.feed=this.feedBlock.querySelector('.gesture-feed');this.readout=this.feedBlock.querySelector('.gesture-readout');
    this.feedbackLabel=this.feedBlock.querySelector('.gesture-feedback-label');this.feedbackDetail=this.feedBlock.querySelector('.gesture-feedback-detail');this.progressBar=this.feedBlock.querySelector('.gesture-progress>span');this.progressNumber=this.feedBlock.querySelector('.gesture-progress-number');
    this.emptyTitle=this.feedBlock.querySelector('.gesture-feed-empty strong');this.emptyDetail=this.feedBlock.querySelector('.gesture-feed-empty small');
    this.dialogSlot=this.dialog.querySelector('.gesture-dialog-slot');this.hudSlot=this.hud.querySelector('.gesture-hud-slot');this.dialogSlot.append(this.feedBlock);
    document.body.append(this.dialog,this.hud);
    this._metadata=()=>{if(this.video.videoWidth&&this.video.videoHeight)this.feed.style.setProperty('--gesture-feed-aspect',`${this.video.videoWidth} / ${this.video.videoHeight}`);};
    this.video.addEventListener('loadedmetadata',this._metadata);
    this._theme=()=>{const style=getComputedStyle(document.documentElement);this.landmarkColor=style.getPropertyValue('--accent').trim()||'#B54A2B';this.landmarkOther=style.getPropertyValue('--flow-b').trim()||'#25766B';};
    document.addEventListener('vortice-theme',this._theme);this._theme();
    this.dialog.querySelector('[data-gesture-close]').addEventListener('click',()=>this.close());
    this.dialog.querySelector('[data-gesture-use]').addEventListener('click',()=>this.close());
    this.dialog.querySelector('[data-gesture-start]').addEventListener('click',()=>Promise.resolve(this.onStart?.()).catch(error=>this.setState({status:'error',message:error?.message||defaultMessages.error})));
    for(const button of [...this.dialog.querySelectorAll('[data-gesture-stop]'),...this.hud.querySelectorAll('[data-gesture-stop]')])button.addEventListener('click',()=>this.onStop?.());
    this.hud.querySelector('[data-gesture-settings]').addEventListener('click',()=>this.open());
    this.hud.querySelector('[data-gesture-minimize]').addEventListener('click',()=>this._setMinimized(!this.minimized));
    this.dialog.addEventListener('close',()=>{this.hudSlot.append(this.feedBlock);this._syncHud();if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});});
    this.dialog.addEventListener('click',event=>{if(event.target!==this.dialog)return;const rect=this.dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.close();});
    this.setState({status:'off'});
  }

  get isDialogOpen(){return this.dialog.open;}
  open(){
    if(this.dialog.open)return;
    this.returnFocus=document.activeElement;this.dialogSlot.append(this.feedBlock);this.hud.hidden=true;
    this.dialog.showModal();
    const target=this.status==='active'?this.dialog.querySelector('[data-gesture-use]'):this.dialog.querySelector('[data-gesture-start]');
    (target.disabled?this.dialog.querySelector('[data-gesture-close]'):target).focus({preventScroll:true});
  }
  close(){if(this.dialog.open)this.dialog.close();}
  _syncHud(){this.hud.hidden=this.dialog.open||!['loading','active'].includes(this.status);}
  _setMinimized(value){
    this.minimized=value;this.hud.classList.toggle('gesture-hud-minimized',value);
    const button=this.hud.querySelector('[data-gesture-minimize]');button.setAttribute('aria-expanded',String(!value));button.setAttribute('aria-label',value?'Mostra anteprima videocamera':'Riduci anteprima videocamera');button.title=value?'Mostra anteprima':'Riduci anteprima';button.innerHTML=icon(value?'plus':'minus');
  }
  setState({status,message}={}){
    if(!Object.hasOwn(defaultMessages,status))status='off';
    this.status=status;this.dialog.dataset.gestureState=status;this.hud.dataset.gestureState=status;this.feedBlock.dataset.gestureState=status;
    this.dialog.querySelector('.gesture-state-message').textContent=message||defaultMessages[status];
    const start=this.dialog.querySelector('[data-gesture-start]');start.hidden=status==='active';start.disabled=status==='loading';start.querySelector('span').textContent=status==='loading'?'Avvio in corso…':status==='error'?'Riprova l’attivazione':'Attiva la videocamera';
    this.dialog.querySelector('[data-gesture-stop]').hidden=!['loading','active'].includes(status);
    this.dialog.querySelector('[data-gesture-use]').hidden=status!=='active';
    this.dialog.querySelector('.gesture-camera-status').textContent={off:'OFF',loading:'AVVIO',active:'LIVE · LOCALE',error:'NON ATTIVA'}[status];
    this.emptyTitle.textContent=status==='loading'?'Preparazione in corso…':status==='error'?'Videocamera non disponibile':'Uno spazio per le tue mani.';
    this.emptyDetail.textContent=status==='loading'?'Consenti l’accesso alla videocamera nel browser':status==='error'?'Leggi il messaggio qui sotto e riprova':'Attiva la videocamera per iniziare';
    if(status==='off'||status==='error'){
      this.drawLandmarks([]);this.setFeedback({label:status==='error'?'Gesture non attive':'In attesa di attivazione',detail:'La vista si orienta senza modificare l’incidenza aerodinamica.',kind:status==='error'?'warning':'idle',progress:0});
    }else if(status==='loading')this.setFeedback({label:'Avvio del riconoscimento',detail:'Il primo avvio può richiedere qualche istante.',kind:'idle',progress:0});
    else this.setFeedback({label:'Inquadra le mani',detail:'Un palmo aperto per orientare l’ala.',kind:'idle',progress:0});
    if(!this.dialog.open&&this.feedBlock.parentElement!==this.hudSlot)this.hudSlot.append(this.feedBlock);
    this._syncHud();
  }
  setFeedback({label='',detail='',progress=0,kind='idle'}={}){
    const percent=Math.max(0,Math.min(1,Number(progress)||0));
    if(this.feedbackLabel.textContent!==label)this.feedbackLabel.textContent=label;
    if(this.feedbackDetail.textContent!==detail)this.feedbackDetail.textContent=detail;
    this.readout.dataset.kind=kind;this.progressBar.style.transform=`scaleX(${percent})`;
    this.progressNumber.textContent=kind==='hold'?`${Math.round(percent*100)}%`:kind==='success'?'✓':'';
  }
  drawLandmarks(landmarks=[]){
    const w=this.video.videoWidth||640,h=this.video.videoHeight||480;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const ctx=this.ctx;if(!ctx)return;ctx.clearRect(0,0,w,h);
    for(let handIndex=0;handIndex<landmarks.length;handIndex++){
      const hand=landmarks[handIndex];if(!Array.isArray(hand)||hand.length<21)continue;
      const color=handIndex%2?this.landmarkOther:this.landmarkColor;
      ctx.lineWidth=Math.max(2,w/280);ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='#00000080';ctx.shadowBlur=3;
      ctx.beginPath();for(const[a,b]of connections){ctx.moveTo(hand[a].x*w,hand[a].y*h);ctx.lineTo(hand[b].x*w,hand[b].y*h);}ctx.stroke();
      ctx.shadowBlur=0;for(let i=0;i<hand.length;i++){ctx.beginPath();ctx.arc(hand[i].x*w,hand[i].y*h,[0,4,8,12,16,20].includes(i)?Math.max(3,w/150):Math.max(2,w/220),0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#FFFFFFD9';ctx.stroke();}
    }
  }
  destroy(){
    this.video.removeEventListener('loadedmetadata',this._metadata);document.removeEventListener('vortice-theme',this._theme);
    this.dialog.remove();this.hud.remove();
  }
}
