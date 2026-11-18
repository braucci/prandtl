import { MODEL } from './physics.js';

/** An ideal pedagogical connection between the 2D limit and a finite wing.
 * blend activates the induced term; it is not physical time.
 * Geometry of the velocity and force triangles is exact. The lift law remains
 * linear and uses q_infinity, as in the small-angle lifting-line model.
 */
export function computeTransitionPhysics({alpha=6, ar=8, speed=50, spanPosition=.38, blend=1}={}) {
  const a0=MODEL.a0, area=MODEL.area, density=MODEL.density;
  const alphaRad=alpha*Math.PI/180;
  const tau=Math.min(1,Math.max(0,blend));
  const k=tau/(Math.PI*MODEL.efficiency*ar);
  let cl=a0*alphaRad/(1+a0*k);
  for(let i=0;i<6;i++) {
    const m=k*cl;
    cl-=(cl-a0*(alphaRad-Math.atan(m)))/(1+a0*k/(1+m*m));
  }
  const m=k*cl,alphaI=Math.atan(m),alphaEff=alphaRad-alphaI;
  const q=.5*density*speed*speed;
  const span=Math.sqrt(area*ar),chord=4*area/(Math.PI*span);
  const eta=Math.min(.85,Math.max(.05,spanPosition));
  const sectionChord=chord*Math.sqrt(1-eta*eta);
  const cl2d=a0*alphaRad,lift=q*area*cl,drag=lift*m;
  const sectionLift=q*sectionChord*cl,sectionDrag=sectionLift*m;
  return {area,density,e:1,q,span,chord,sectionChord,eta,cl,cl2d,cdi:cl*m,
    alphaI,alphaEff,alphaRad,w:speed*m,localSpeed:speed*Math.sqrt(1+m*m),
    lift,drag,resultant:Math.hypot(lift,drag),lift2d:q*area*cl2d,
    sectionLift,sectionDrag,sectionResultant:Math.hypot(sectionLift,sectionDrag),
    sectionLift2d:q*sectionChord*cl2d,ratio:m,power:drag*speed,
    effectiveAR:tau===0?Infinity:ar/tau};
}

export const smoothStep = (a,b,x) => {const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
export function sequenceAt(progress) {
  const p=Math.min(1,Math.max(0,progress));
  return {extraction:smoothStep(0,.25,p),blend:smoothStep(.42,.76,p),
    vectorReveal:smoothStep(.22,.32,p),forceReveal:smoothStep(.19,.34,p),
    decomposition:smoothStep(.76,.96,p),
    phase:p<.26?0:p<.42?1:p<.67?2:p<.84?3:4};
}
