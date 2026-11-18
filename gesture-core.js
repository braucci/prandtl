// Gesture decisions are independent of the camera and of aerodynamic state.
// Every input is one real inference result, with a monotonic timestamp in ms.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const HOLD = { palm: 150, fist: 450, palms: 800, fists: 800 };
const COMMAND = { fist: 'pause', palms: 'transition', fists: 'sheet' };

export function classifyHands(result, threshold = .7) {
  const hands = result?.landmarks || [];
  const count = hands.length;
  if (!count) return { pose: 'none', count: 0 };
  if (count > 2) return { pose: 'unknown', count };
  const poses = hands.map((landmarks, i) => {
    if (landmarks.length !== 21 || landmarks.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return 'unknown';
    const candidates = result.gestures?.[i] || [];
    const top = candidates.reduce((a, b) => (b.score > (a?.score || 0) ? b : a), null);
    if (!top || top.score < threshold) return 'unknown';
    return top.categoryName === 'Open_Palm' ? 'palm' : top.categoryName === 'Closed_Fist' ? 'fist' : 'unknown';
  });
  if (count === 2) return { pose: poses.every(p => p === 'palm') ? 'palms' : poses.every(p => p === 'fist') ? 'fists' : 'mixed', count };
  if (poses[0] !== 'palm') return { pose: poses[0], count };
  // Palm centre is less noisy than fingertips. Mirror x to match the selfie preview.
  const centre = [0, 5, 9, 13, 17].reduce((c, i) => ({ x: c.x + hands[0][i].x / 5, y: c.y + hands[0][i].y / 5 }), { x: 0, y: 0 });
  const label = (result.handedness || result.handednesses)?.[0]?.[0]?.categoryName || '';
  return { pose: 'palm', count, palm: { x: clamp(1 - centre.x, 0, 1), y: clamp(centre.y, 0, 1), label } };
}

export class GestureEngine {
  constructor() { this.reset(); }
  reset() {
    this.pose = 'none'; this.since = 0; this.last = null;
    this.latched = null; this.releaseSince = null;
    this.cooldownUntil = 0; this.lastDual = -Infinity;
  }
  step(result, now) {
    const frame = classifyHands(result);
    if (!Number.isFinite(now)) return { ...frame, progress: 0, command: null, tracking: false };
    const discontinuity = this.last !== null && (now - this.last > 350 || now < this.last);
    if (discontinuity) { this.pose = 'none'; this.since = now; }
    this.last = now;
    if (frame.count === 2) this.lastDual = now;
    if (frame.pose !== this.pose) { this.pose = frame.pose; this.since = now; }

    // A short missed frame must not re-arm the same held command.
    if (this.latched) {
      if (frame.pose === this.latched) this.releaseSince = null;
      else {
        if (this.releaseSince === null) this.releaseSince = now;
        if (now - this.releaseSince >= 500) { this.latched = null; this.releaseSince = null; }
      }
    }
    const single = frame.pose === 'palm' || frame.pose === 'fist';
    const settling = single && now - this.lastDual < 650;
    const required = HOLD[frame.pose];
    const elapsed = now - this.since;
    const waiting = now < this.cooldownUntil;
    const progress = required ? clamp(elapsed / required, 0, 1) : 0;
    const armed = required && elapsed >= required && !settling && !waiting;
    let command = null;
    if (armed && COMMAND[frame.pose] && this.latched !== frame.pose) {
      command = COMMAND[frame.pose]; this.latched = frame.pose;
      this.releaseSince = null; this.cooldownUntil = now + 1000;
    }
    return { ...frame, progress, command, settling, waiting,
      tracking: Boolean(armed && frame.pose === 'palm'),
      held: this.latched === frame.pose };
  }
}

export class PalmMotion {
  constructor() { this.reset(); }
  reset() { this.anchor = null; this.filtered = null; this.last = null; }
  step(palm, now) {
    if (!palm || !Number.isFinite(palm.x) || !Number.isFinite(palm.y)) return null;
    if (!this.anchor) {
      this.anchor = { ...palm }; this.filtered = { ...palm }; this.last = now;
      return { yaw: 0, pitch: 0, acquired: true };
    }
    // Switching hands or a lost tracking identity starts a fresh relative grip.
    if ((palm.label && this.anchor.label && palm.label !== this.anchor.label) ||
        Math.hypot(palm.x - this.filtered.x, palm.y - this.filtered.y) > .32) {
      this.reset(); return this.step(palm, now);
    }
    const dt = clamp((now - this.last) / 1000, 0, .16); this.last = now;
    const ease = 1 - Math.exp(-dt * 13);
    this.filtered.x += (palm.x - this.filtered.x) * ease;
    this.filtered.y += (palm.y - this.filtered.y) * ease;
    const deadband = n => Math.sign(n) * Math.max(0, Math.abs(n) - .007);
    return {
      yaw: clamp(-deadband(this.filtered.x - this.anchor.x) * 3.6, -1.5, 1.5),
      pitch: clamp(-deadband(this.filtered.y - this.anchor.y) * 2.7, -.9, .9),
      acquired: false
    };
  }
}
