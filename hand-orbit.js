import * as THREE from 'three';

// Gesture control changes the observer's viewpoint only. The wing geometry,
// incidence and aerodynamic state are never part of this helper.
export class HandOrbit {
  constructor(camera, controls) {
    this.camera=camera;this.controls=controls;this.active=false;
    this.anchor=new THREE.Spherical();this.current=new THREE.Spherical();this.goal=new THREE.Spherical();
    this.focus=new THREE.Vector3();this.offset=new THREE.Vector3();
    this.toUp=new THREE.Quaternion();this.fromUp=new THREE.Quaternion();
  }

  _clearInertia() {
    // Flush OrbitControls' pending damping through its public API, then restore
    // exactly the visible pose before the next render. No private fields needed.
    const position=this.camera.position.clone(),target=this.controls.target.clone();
    const damping=this.controls.enableDamping,autoRotate=this.controls.autoRotate;
    this.controls.enableDamping=false;this.controls.autoRotate=false;
    this.controls.update();
    this.camera.position.copy(position);this.controls.target.copy(target);
    this.controls.update();
    this.controls.enableDamping=damping;this.controls.autoRotate=autoRotate;
  }

  begin() {
    if(this.active)return true;
    this._clearInertia();
    this.focus.copy(this.controls.target);
    this.toUp.setFromUnitVectors(this.camera.up.clone().normalize(),new THREE.Vector3(0,1,0));
    this.fromUp.copy(this.toUp).invert();
    this.offset.copy(this.camera.position).sub(this.focus).applyQuaternion(this.toUp);
    this.anchor.setFromVector3(this.offset);this.current.copy(this.anchor);this.goal.copy(this.anchor);
    this.active=true;this.controls.autoRotate=false;
    return true;
  }

  update({yaw=0,pitch=0}={}) {
    if(!this.active||!Number.isFinite(yaw)||!Number.isFinite(pitch))return false;
    const minPhi=Math.max(.03,this.controls.minPolarAngle);
    const maxPhi=Math.min(Math.PI-.03,this.controls.maxPolarAngle);
    this.goal.theta=this.anchor.theta+THREE.MathUtils.clamp(yaw,-Math.PI,Math.PI);
    this.goal.theta=THREE.MathUtils.clamp(this.goal.theta,this.controls.minAzimuthAngle,this.controls.maxAzimuthAngle);
    this.goal.phi=THREE.MathUtils.clamp(this.anchor.phi+pitch,minPhi,maxPhi);
    return true;
  }

  step(dt) {
    if(!this.active)return false;
    const ease=1-Math.exp(-11*Math.min(.1,Math.max(0,dt)));
    this.current.theta=THREE.MathUtils.lerp(this.current.theta,this.goal.theta,ease);
    this.current.phi=THREE.MathUtils.lerp(this.current.phi,this.goal.phi,ease);
    this.offset.setFromSpherical(this.current).applyQuaternion(this.fromUp);
    this.controls.target.copy(this.focus);
    this.camera.position.copy(this.focus).add(this.offset);this.camera.lookAt(this.focus);
    this.controls.autoRotate=false;
    return true;
  }

  end() {
    if(!this.active)return false;
    this.active=false;this._clearInertia();
    return true;
  }
}
