import { GestureUI } from './gesture-ui.js';
import { HandTracker } from './hand-tracker.js';
import { GestureEngine, PalmMotion } from './gesture-core.js';

const actionMessages = {
  pause: { label: 'Animazione in pausa', detail: 'Muovi la vista con un palmo. Usa ▶ per riprendere.', kind: 'success' },
  transition: { label: 'Dal 2D al 3D · avviato', detail: 'La sequenza riparte dal limite bidimensionale.', kind: 'success' },
  sheet: { label: 'Vortex sheet · attiva', detail: 'La superficie vorticosa è visibile nella scia.', kind: 'success' }
};

export class GestureController {
  constructor({ button, getScene, onPause, onTransition, onSheet, toast }) {
    this.button = button; this.getScene = getScene; this.toast = toast;
    this.actions = { pause: onPause, transition: onTransition, sheet: onSheet };
    this.engine = new GestureEngine(); this.motion = new PalmMotion();
    this.enabled = false; this.starting = false; this.session = 0;
    this.handScene = null; this.busy = false; this.feedbackUntil = 0; this.manualUntil = 0;
    this.ui = new GestureUI({ onStart: () => this.start(), onStop: () => this.stop() });
    this.tracker = new HandTracker({
      onResults: result => this._results(result),
      onState: state => { this.ui.setState(state); this._reflect(state.status); },
      onError: error => this._error(error)
    });
    this._open = () => this.open();
    button.addEventListener('click', this._open);
    this._visibility = () => {
      if (document.hidden && (this.enabled || this.starting)) this.stop('Videocamera spenta perché la scheda non è più visibile.');
    };
    this._pagehide = () => this.stop();
    // Mouse/touch manipulation immediately takes priority over the webcam.
    this._pointer = event => {
      if (!this.enabled || !event.target.closest?.('#scene canvas, #tl-scene canvas')) return;
      this.manualUntil = performance.now() + 1000; this.release(); this.engine.reset();
    };
    document.addEventListener('visibilitychange', this._visibility);
    window.addEventListener('pagehide', this._pagehide);
    document.addEventListener('pointerdown', this._pointer, true);
    this._reflect('off');
  }
  _reflect(status) {
    const active = status === 'active';
    this.button.classList.toggle('active', active);
    this.button.dataset.gestureState = status;
    this.button.setAttribute('aria-label', active ? 'Gesture attive: apri i comandi' : 'Gesture: controlla il laboratorio con le mani');
    this.button.title = active ? 'Videocamera attiva · apri i comandi' : 'Controlla il laboratorio con le mani';
    const lessonButton = document.getElementById('gesture-lesson');
    lessonButton?.classList.toggle('active', active);
    lessonButton?.setAttribute('aria-label', this.button.getAttribute('aria-label'));
  }
  open() { this.release(); this.ui.open(); }
  async start() {
    if (this.starting || this.enabled) return;
    const session = ++this.session; this.starting = true;
    this.engine.reset(); this.release();
    try {
      await this.tracker.start(this.ui.video);
      if (session !== this.session) return;
      this.enabled = true; this.starting = false;
      this.ui.close(); this.toast?.('Gesture attive. Inquadra un palmo aperto per orientare l’ala.');
    } catch (error) {
      if (session !== this.session) return;
      this.starting = false; this.enabled = false;
      this.ui.setState({ status: 'error', message: error.message }); this._reflect('error');
    }
  }
  async stop(message) {
    ++this.session; this.enabled = false; this.starting = false; this.busy = false;
    this.engine.reset(); this.release();
    await this.tracker.stop();
    this.ui.setState({ status: 'off', message }); this._reflect('off');
    if (message && !document.hidden) this.toast?.(message);
  }
  _error(error) {
    ++this.session; this.enabled = false; this.starting = false; this.busy = false;
    this.engine.reset(); this.release();
    this.ui.setState({ status: 'error', message: error.message }); this._reflect('error');
    this.ui.open();
  }
  release() {
    this.handScene?.endHandControl(); this.handScene = null; this.motion.reset();
  }
  _results(result) {
    this.ui.drawLandmarks(result.landmarks || []);
    if (!this.enabled) return;
    const now = performance.now();
    if (this.busy) { this.release(); return; }
    if (document.querySelector('dialog[open]') || now < this.manualUntil) {
      this.release(); this.engine.reset();
      if (!this.busy) this.ui.setFeedback({ label: 'Comandi in attesa', detail: 'Chiudi il pannello o termina il movimento con il mouse.', kind: 'idle' });
      return;
    }
    const decision = this.engine.step(result, now);
    if (decision.tracking) {
      const current = this.getScene();
      if (current !== this.handScene) this.release();
      const offset = this.motion.step(decision.palm, now);
      if (!current || !offset) { this.release(); return; }
      if (offset.acquired || !this.handScene) {
        this.handScene?.endHandControl();
        if (!current.beginHandControl()) { this.release(); return; }
        this.handScene = current;
      }
      if (!this.handScene.updateHandControl(offset)) this.release();
    } else this.release();
    if (decision.command) { this._execute(decision.command); return; }
    if (now < this.feedbackUntil) return;
    this.ui.setFeedback(this._feedback(decision));
  }
  async _execute(command) {
    const session = this.session;
    this.busy = true; this.release();
    try {
      await this.actions[command]?.();
      if (session !== this.session) return;
      const message = actionMessages[command];
      this.ui.setFeedback({ ...message, progress: 1 });
      this.feedbackUntil = performance.now() + 1400;
      this.toast?.(message.label);
    } catch (error) {
      if (session !== this.session) return;
      this.ui.setFeedback({ label: 'Comando non disponibile', detail: error.message || 'Riprova tra un istante.', kind: 'warning' });
      this.feedbackUntil = performance.now() + 2500;
    } finally { if (session === this.session) this.busy = false; }
  }
  _feedback(d) {
    if (d.settling) return { label: 'Una mano inquadrata', detail: 'Mantieni la posa un istante per confermare.', kind: 'hold', progress: 0 };
    if (d.pose === 'palm') return { label: d.tracking ? 'Palmo aperto · vista libera' : 'Palmo riconosciuto', detail: 'Muovi la mano a destra, a sinistra, in alto o in basso.', kind: 'tracking', progress: d.progress };
    const labels = { fist: 'Un pugno · pausa', palms: 'Due palmi · dal 2D al 3D', fists: 'Due pugni · vortex sheet' };
    if (labels[d.pose]) return {
      label: labels[d.pose],
      detail: d.held ? 'Comando eseguito. Cambia posa prima di ripeterlo.' : d.waiting ? 'Mantieni il gesto: il controllo si sta riattivando.' : 'Mantieni la posa fino al completamento dell’indicatore.',
      kind: d.held ? 'success' : 'hold', progress: d.held ? 1 : d.progress
    };
    if (d.pose === 'mixed') return { label: 'Due mani · posa da definire', detail: 'Apri entrambi i palmi oppure chiudi entrambi i pugni.', kind: 'idle' };
    if (d.pose === 'unknown') return { label: 'Mano rilevata', detail: 'Mostra bene il palmo o chiudi completamente il pugno.', kind: 'idle' };
    return { label: 'Inquadra le mani', detail: 'Un palmo orienta la vista. Due palmi avviano il 2D → 3D.', kind: 'idle' };
  }
  async destroy() {
    await this.stop(); this.ui.destroy(); this.button.removeEventListener('click', this._open);
    document.removeEventListener('visibilitychange', this._visibility);
    window.removeEventListener('pagehide', this._pagehide);
    document.removeEventListener('pointerdown', this._pointer, true);
  }
}
