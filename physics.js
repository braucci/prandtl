/** Linear Prandtl lifting-line model; ideal elliptical loading, symmetric section.
 * SI units; alpha input degrees; derived angles radians; w positive downward.
 */
export const MODEL = Object.freeze({ area: 16, density: 1.225, efficiency: 1, a0: 2 * Math.PI, maxAlpha: 10 });
export function computePhysics({ alpha = 6, ar = 8, speed = 50 }) {
  const { area: S, density: rho, efficiency: e, a0 } = MODEL;
  const a = a0 / (1 + a0 / (Math.PI * e * ar));
  const alphaRad = alpha * Math.PI / 180;
  const cl = a * alphaRad;
  const cdi = cl * cl / (Math.PI * e * ar);
  const alphaI = cl / (Math.PI * e * ar);
  const alphaEff = alphaRad - alphaI;
  const q = 0.5 * rho * speed * speed;
  const span = Math.sqrt(S * ar);
  const chord = 4 * S / (Math.PI * span);
  const lift = q * S * cl;
  const drag = q * S * cdi;
  return { area: S, density: rho, e, a, q, cl, cdi, alphaI, alphaEff, span, chord,
    meanChord: S / span, w: speed * alphaI, lift, drag, power: drag * speed,
    gamma0: 2 * speed * S * cl / (Math.PI * span) };
}
export function alphaForCL(cl, ar) {
  return cl / (MODEL.a0 / (1 + MODEL.a0 / (Math.PI * MODEL.efficiency * ar))) * 180 / Math.PI;
}
