/* Classic worker: the MediaPipe WASM loader uses importScripts internally.
 * Frames stay inside this browser and only landmarks/categories leave the worker.
 */
let recognizer = null;
let disposed = false;
let graphics = null;

function releaseGraphics() {
  try { graphics?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
  graphics = null;
}

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'init') {
    try {
      // Even the CPU delegate stages image pixels through WebGL. Probe the same
      // canvas given to MediaPipe, so unsupported workers fail before "ready".
      const canvas = new OffscreenCanvas(1, 1);
      try { graphics = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch {}
      if (!graphics) throw new Error('WebGL non disponibile nel worker di riconoscimento.');
      const { FilesetResolver, GestureRecognizer } = await import(data.moduleURL);
      const fileset = await FilesetResolver.forVisionTasks(data.wasmRoot);
      const task = await GestureRecognizer.createFromOptions(fileset, {
        canvas,
        baseOptions: { modelAssetPath: data.modelURL, delegate: 'CPU' },
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
      if (disposed) { task.close(); return; }
      recognizer = task;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      releaseGraphics();
      self.postMessage({ type: 'error', stage: 'init', message: error?.message || String(error) });
    }
    return;
  }
  if (data.type === 'frame') {
    try {
      if (!recognizer || disposed) return;
      const result = recognizer.recognizeForVideo(data.frame, data.timestamp);
      self.postMessage({
        type: 'result',
        timestamp: data.timestamp,
        landmarks: result.landmarks || [],
        gestures: result.gestures || [],
        handedness: result.handednesses || result.handedness || []
      });
    } catch (error) {
      self.postMessage({ type: 'error', stage: 'frame', message: error?.message || String(error) });
    } finally {
      data.frame?.close();
    }
    return;
  }
  if (data.type === 'dispose') {
    disposed = true;
    try { recognizer?.close(); } finally {
      recognizer = null;
      releaseGraphics();
      self.close();
    }
  }
});
