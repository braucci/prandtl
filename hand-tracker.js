const ASSETS = {
  moduleURL: new URL('./vendor/mediapipe/vision_bundle.mjs', import.meta.url).href,
  wasmRoot: new URL('./vendor/mediapipe/wasm', import.meta.url).href,
  modelURL: new URL('./assets/models/gesture_recognizer.task', import.meta.url).href
};

const abortError = () => new DOMException('Attivazione annullata.', 'AbortError');

function friendlyError(error, phase = 'recognizer') {
  const names = {
    NotAllowedError: 'Accesso alla videocamera non consentito. Abilitalo nelle impostazioni di questo sito, poi premi «Attiva videocamera».',
    PermissionDeniedError: 'Accesso alla videocamera non consentito. Abilitalo nelle impostazioni di questo sito, poi riprova.',
    NotFoundError: 'Nessuna videocamera disponibile. Collega una videocamera e riprova.',
    DevicesNotFoundError: 'Nessuna videocamera disponibile. Collega una videocamera e riprova.',
    NotReadableError: 'La videocamera non è disponibile. Chiudi le altre applicazioni che la stanno utilizzando e riprova.',
    TrackStartError: 'La videocamera non è disponibile. Chiudi le altre applicazioni che la stanno utilizzando e riprova.',
    OverconstrainedError: 'La videocamera non supporta questa acquisizione. Prova con un’altra videocamera.',
    SecurityError: 'Il browser ha bloccato la videocamera. Apri direttamente il laboratorio in una scheda HTTPS e riprova.'
  };
  if (error?.friendly) return error;
  const graphicsBlocked = /webgl|activeTexture|(?:gl|graphics) context|failed to create.*context|cannot create.*context/i.test(String(error?.message || ''));
  const message = names[error?.name] || (graphicsBlocked
    ? 'Il riconoscimento richiede l’accelerazione grafica del browser. Abilitala nelle impostazioni oppure prova un altro browser aggiornato, poi riattiva le gesture.'
    : phase === 'camera'
    ? 'Impossibile avviare la videocamera. Verifica il collegamento e il permesso del browser, poi riprova.'
    : 'Impossibile avviare il riconoscimento delle mani. Verifica la connessione per caricare il modello e usa un browser aggiornato, poi riprova.');
  const result = new Error(message, { cause: error });
  result.friendly = true;
  return result;
}

/** Optional, explicit-consent webcam acquisition. No microphone or recording. */
export class HandTracker {
  constructor({ onResults = () => {}, onState = () => {}, onError = () => {} } = {}) {
    this.onResults = onResults;
    this.onState = onState;
    this.onError = onError;
    this._generation = 0;
    this._running = false;
    this._pending = new Set();
    this._stream = null;
    this._video = null;
    this._worker = null;
    this._recognizer = null;
    this._recognizerGL = null;
    this._raf = 0;
    this._watchdog = 0;
    this._inFlight = false;
    this._lastVideoTime = -1;
    this._lastFrame = -Infinity;
    this._interval = 1000 / 15;
  }

  get running() { return this._running; }

  async start(video) {
    if (this._running && video === this._video) return;
    await this.stop();
    const generation = ++this._generation;
    let phase = 'camera';
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const error = new Error('La videocamera richiede una pagina HTTPS e un browser che supporti l’acquisizione video. Apri direttamente il laboratorio in una scheda aggiornata.');
        error.friendly = true;
        throw error;
      }
      if (!(video instanceof HTMLVideoElement)) throw new Error('Anteprima video non disponibile.');
      this.onState({ status: 'loading', message: 'Consenti l’accesso alla videocamera nel browser.' });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }
      });
      if (generation !== this._generation) {
        stream.getTracks().forEach(track => track.stop());
        throw abortError();
      }
      this._stream = stream;
      this._video = video;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this._onTrackEnded = () => {
        if (generation !== this._generation) return;
        const error = new Error('La videocamera è stata scollegata o il permesso è stato revocato. Ricollegala e riattiva le gesture.');
        error.friendly = true;
        this._fail(error);
      };
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', this._onTrackEnded));
      await video.play();
      this._checkGeneration(generation);
      await this._waitForVideo(video, generation);
      phase = 'recognizer';
      this.onState({ status: 'loading', message: 'Caricamento del riconoscimento locale delle mani…' });

      // A classic worker keeps synchronous inference away from the 3D render loop.
      // Older browsers without transferable image frames use a throttled fallback.
      let workerSupported = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
      if (workerSupported) {
        try {
          const probe = await createImageBitmap(video);
          probe.close();
        } catch { workerSupported = false; }
      }
      this._checkGeneration(generation);
      if (workerSupported) {
        try {
          await this._startWorker(generation);
        } catch (error) {
          this._checkGeneration(generation);
          this._terminateWorker();
          await this._startMainThread(generation);
        }
      } else {
        await this._startMainThread(generation);
      }
      this._checkGeneration(generation);
      this._running = true;
      this._inFlight = false;
      this._lastFrame = -Infinity;
      this._lastVideoTime = -1;
      this.onState({ status: 'active', message: 'Videocamera attiva · riconoscimento sul dispositivo' });
      this._raf = requestAnimationFrame(now => this._tick(now, generation));
    } catch (error) {
      if (generation !== this._generation) throw abortError();
      await this.stop();
      throw friendlyError(error, phase);
    }
  }

  _checkGeneration(generation) {
    if (generation !== this._generation) throw abortError();
  }

  _waitForVideo(video, generation) {
    if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', failed);
        this._pending.delete(cancel);
        error ? reject(error) : resolve();
      };
      const ready = () => {
        if (generation !== this._generation) { finish(abortError()); return; }
        if (video.readyState >= 2 && video.videoWidth > 0) finish();
      };
      const failed = () => finish(new Error('Il flusso video non è disponibile.'));
      const cancel = () => finish(abortError());
      const timer = setTimeout(failed, 15000);
      this._pending.add(cancel);
      video.addEventListener('loadeddata', ready);
      video.addEventListener('error', failed);
      ready();
    });
  }

  _startWorker(generation) {
    this._interval = 1000 / 15;
    return new Promise((resolve, reject) => {
      let ready = false;
      const worker = new Worker(new URL('./gesture-worker.js', import.meta.url), { name: 'VORTICE · mani' });
      this._worker = worker;
      const finish = error => {
        clearTimeout(timer);
        this._pending.delete(cancel);
        if (error) reject(error); else { ready = true; resolve(); }
      };
      const cancel = () => finish(abortError());
      const timer = setTimeout(() => finish(new Error('Timeout del modello di riconoscimento.')), 45000);
      this._pending.add(cancel);
      worker.onmessage = ({ data }) => {
        if (generation !== this._generation || this._worker !== worker) return;
        if (data.type === 'ready') { finish(); return; }
        if (data.type === 'error') {
          const error = new Error(data.message || 'Riconoscimento interrotto.');
          if (!ready) finish(error); else this._fail(error);
          return;
        }
        if (data.type === 'result' && this._running) {
          clearTimeout(this._watchdog);
          this._inFlight = false;
          this.onResults({
            landmarks: data.landmarks,
            gestures: data.gestures,
            handedness: data.handedness,
            timestamp: data.timestamp
          });
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (generation !== this._generation || this._worker !== worker) return;
        const error = new Error(event.message || 'Worker di riconoscimento non disponibile.');
        if (!ready) finish(error); else this._fail(error);
      };
      worker.postMessage({ type: 'init', ...ASSETS });
    });
  }

  async _startMainThread(generation) {
    this.onState({ status: 'loading', message: 'Preparazione del riconoscimento per questo browser…' });
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    let graphics = null;
    try { graphics = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch {}
    if (!graphics) throw new Error('WebGL non disponibile per il riconoscimento delle mani.');
    const release = () => { try { graphics.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} };
    try {
      const { FilesetResolver, GestureRecognizer } = await import(ASSETS.moduleURL);
      this._checkGeneration(generation);
      const fileset = await FilesetResolver.forVisionTasks(ASSETS.wasmRoot);
      this._checkGeneration(generation);
      const recognizer = await GestureRecognizer.createFromOptions(fileset, {
        canvas,
        baseOptions: { modelAssetPath: ASSETS.modelURL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: .65,
        minHandPresenceConfidence: .65,
        minTrackingConfidence: .65,
        cannedGesturesClassifierOptions: {
          categoryAllowlist: ['Open_Palm', 'Closed_Fist'],
          scoreThreshold: .65,
          maxResults: 1
        }
      });
      if (generation !== this._generation) { recognizer.close(); throw abortError(); }
      this._recognizer = recognizer;
      this._recognizerGL = graphics;
      this._interval = 1000 / 10;
    } catch (error) {
      release();
      throw error;
    }
  }

  _tick(now, generation) {
    if (!this._running || generation !== this._generation) return;
    this._raf = requestAnimationFrame(time => this._tick(time, generation));
    const video = this._video;
    if (this._inFlight || document.hidden || now - this._lastFrame < this._interval ||
        !video || video.readyState < 2 || video.currentTime === this._lastVideoTime) return;
    this._lastFrame = now;
    this._lastVideoTime = video.currentTime;
    this._inFlight = true;
    this._processFrame(video, now, generation);
  }

  async _processFrame(video, timestamp, generation) {
    try {
      if (this._worker) {
        const frame = await createImageBitmap(video);
        if (!this._running || generation !== this._generation || !this._worker) { frame.close(); return; }
        try { this._worker.postMessage({ type: 'frame', frame, timestamp }, [frame]); }
        catch (error) { frame.close(); throw error; }
        this._watchdog = setTimeout(() => {
          if (generation === this._generation && this._running) this._fail(new Error('Il riconoscimento non risponde.'));
        }, 10000);
      } else if (this._recognizer) {
        const result = this._recognizer.recognizeForVideo(video, timestamp);
        this._inFlight = false;
        this.onResults({
          landmarks: result.landmarks || [],
          gestures: result.gestures || [],
          handedness: result.handednesses || result.handedness || [],
          timestamp
        });
      }
    } catch (error) {
      if (generation === this._generation) this._fail(error);
    }
  }

  _terminateWorker() {
    if (!this._worker) return;
    this._worker.onmessage = null;
    this._worker.onerror = null;
    // Termination also releases WASM memory when initialization is still pending.
    try { this._worker.postMessage({ type: 'dispose' }); } catch {}
    this._worker.terminate();
    this._worker = null;
  }

  async _fail(error) {
    await this.stop();
    this.onError(friendlyError(error));
  }

  async stop() {
    ++this._generation;
    this._running = false;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    clearTimeout(this._watchdog);
    this._watchdog = 0;
    [...this._pending].forEach(cancel => cancel());
    this._pending.clear();
    this._terminateWorker();
    try { this._recognizer?.close(); } catch {}
    this._recognizer = null;
    try { this._recognizerGL?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
    this._recognizerGL = null;
    if (this._stream) {
      this._stream.getTracks().forEach(track => {
        track.removeEventListener('ended', this._onTrackEnded);
        track.stop();
      });
    }
    if (this._video && this._video.srcObject === this._stream) {
      this._video.pause();
      this._video.srcObject = null;
    }
    this._stream = null;
    this._video = null;
    this._onTrackEnded = null;
    this._inFlight = false;
    this.onState({ status: 'off', message: 'Videocamera spenta' });
  }
}
