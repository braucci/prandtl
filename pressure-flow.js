import * as THREE from 'three';

// Near-wing tracers are a geometric teaching aid, not a Navier–Stokes solution.
// x = span, y = up, z = downstream. The downstream portion follows the SAME
// advected vortex sheet as the main scene; no extra tip helix is prescribed.
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const naca = q => 5 * .12 * (.2969 * Math.sqrt(q) - .1260 * q - .3516 * q*q + .2843 * q*q*q - .1036 * q*q*q*q);
const chordAt = (x, half, chord) => chord * Math.sqrt(Math.max(0, 1 - (x / half) ** 2));

function wakeBetween(wakePaths, index) {
  const a = Math.floor(index), b = Math.min(wakePaths.length - 1, a + 1), f = index - a;
  const p = wakePaths[a], q = wakePaths[b];
  const result = new Float32Array(p.length);
  for (let i = 0; i < result.length; i++) result[i] = mix(p[i], q[i], f);
  return result;
}

/** Pure geometry builder, also usable for checking surface clearance. */
export function buildPressurePaths({ half, chord, alpha, strength, wakePaths, quality = 'balanced' }) {
  if (!(strength > 0) || !wakePaths?.length) return [];
  const extent = Math.min(1, Math.sqrt(strength));
  const angle = THREE.MathUtils.degToRad(alpha), cs = Math.cos(angle), sn = Math.sin(angle);
  const rotate = (x, y, z) => new THREE.Vector3(x, y * cs - z * sn, y * sn + z * cs);
  const lanes = quality === 'high' ? 6 : 4, paths = [];
  for (const side of [-1, 1]) for (let lane = 0; lane < lanes; lane++) {
    const rank = lane / Math.max(1, lanes - 1);
    const etaStart = 1 - (1 - (.28 + rank * .325)) * extent;
    const rightIndex = 63 - (11 - rank * 10) * extent;
    const wakeIndex = side > 0 ? rightIndex : 63 - rightIndex;
    const wake = wakeBetween(wakePaths, wakeIndex);
    const endX = wake[0];
    const endEta = Math.abs(endX) / half;
    const endChord = chordAt(endX, half, chord);
    const gap = chord * (.074 + .060 * rank) * (.55 + .45 * extent);
    const tipRadius = (.045 * half + .065 * chord) * (.40 + .60 * extent);
    const tipZ = chord * (.028 + .018 * rank);
    const points = [];
    // Pressure-side flow has an outward component. Keep the whole leg below
    // the real NACA skin, while q < 1/4 makes downstream travel monotonic even
    // as the elliptic chord shrinks to zero at the free tip.
    for (let j = 0; j <= 42; j++) {
      const u = j / 42;
      const phi = mix(Math.asin(etaStart), Math.PI / 2, u);
      const x = side * half * Math.sin(phi), c = chord * Math.cos(phi);
      const q = .075 + .165 * u;
      points.push(rotate(x, -naca(q) * c - gap, (q - .25) * c));
    }
    // An open, downstream-moving turn around the free tip: bottom → outside
    // → top. It is not a closed ring. Mirroring x gives the opposite rotation.
    for (let j = 1; j <= 44; j++) {
      const u = j / 44, a = Math.PI * u;
      points.push(rotate(side * (half + tipRadius * Math.sin(a)), -gap * Math.cos(a), tipZ * u));
    }
    // Suction-side flow turns inward and continues to the trailing edge. The
    // clearance dies smoothly there; the endpoint is the existing sheet.
    for (let j = 1; j <= 50; j++) {
      const u = j / 50;
      const x = side * half * mix(1, endEta, u), c = chordAt(x, half, chord);
      const z = mix(tipZ, .75 * endChord, u);
      const q = clamp(z / Math.max(c, .00001) + .25, 0, 1);
      const y = naca(q) * c + gap * (1 - u) ** 2;
      points.push(rotate(x, y, z));
    }
    // Join one sample downstream of the edge. For interpolated filaments the
    // straight interpolation of an elliptic trailing edge lies microscopically
    // inside its arc; starting one wake cell downstream avoids that chord cut.
    // Only the near wake is accented; the original sheet carries the eye on.
    const joinPoint = new THREE.Vector3().fromArray(wake, 3);
    const wakeCount = wake.length / 3;
    const lastWake = Math.max(8, Math.floor((wakeCount - 1) * .43));
    for (let k = 1; k <= lastWake; k++) points.push(new THREE.Vector3().fromArray(wake, k * 3));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    curve.arcLengthDivisions = 650;
    const sampled = curve.getSpacedPoints(420);
    // Catmull–Rom smooths the changes of surface direction. A very small
    // geometric projection keeps the smoothed path outside the solid skin.
    for (const p of sampled) {
      const x = p.x, y = p.y * cs + p.z * sn, z = -p.y * sn + p.z * cs;
      if (Math.abs(x) >= half) continue;
      const c = chordAt(x, half, chord), q = z / Math.max(c, .00001) + .25;
      if (q < 0 || q > 1) continue;
      const skin = Math.max(0, naca(q) * c);
      if (Math.abs(y) < skin + chord * .00025) {
        const clearY = (y < 0 ? -1 : 1) * (skin + chord * .00025);
        p.y = clearY * cs - z * sn; p.z = clearY * sn + z * cs;
      }
    }
    const coordinates = new Float32Array(sampled.length * 3);
    sampled.forEach((p, i) => p.toArray(coordinates, i * 3));
    let length = 0;
    for (let i = 1; i < sampled.length; i++) length += sampled[i].distanceTo(sampled[i - 1]);
    paths.push({ side, lane, rank, points: coordinates, length, joinPoint, wakeIndex, extent });
  }
  return paths;
}

function themed(material, role) {
  material.userData.themeRole = role;
  return material;
}

function sample(path, u, target) {
  const p = path.points, at = clamp(u, 0, 1) * (p.length / 3 - 1);
  const a = Math.floor(at), b = Math.min(a + 1, p.length / 3 - 1), f = at - a;
  return target.set(mix(p[a*3], p[b*3], f), mix(p[a*3+1], p[b*3+1], f), mix(p[a*3+2], p[b*3+2], f));
}

export class PressureFlow {
  constructor(options) {
    this.group = new THREE.Group();
    this.group.name = 'pressure-surface-flow';
    this.paths = buildPressurePaths(options);
    this._intensity = clamp(Math.sqrt(options.strength), 0, 1);
    this._heads = [];
    this._point = new THREE.Vector3(); this._next = new THREE.Vector3();
    this._tangent = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    const scale = clamp(options.chord / 1.8, .85, 1.3);
    const guidePositions = [];
    for (const path of this.paths) {
      const p = path.points;
      for (let j = 0; j < p.length - 3; j += 3) guidePositions.push(...p.slice(j, j + 6));
    }
    const guideGeometry = new THREE.BufferGeometry();
    guideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(guidePositions, 3));
    const guide = new THREE.LineSegments(guideGeometry, themed(new THREE.LineBasicMaterial({
      color: '#4a625c', transparent: true, opacity: .24 * this._intensity, depthWrite: false, toneMapped: false
    }), 'velocity'));
    guide.frustumCulled = false;
    this.group.add(guide);
    const coneGeometry = new THREE.ConeGeometry(.047 * scale, .19 * scale, 7);
    coneGeometry.translate(0, -.19 * scale / 2, 0); // tip is exactly on the path
    for (const path of this.paths) for (let k = 0; k < 3; k++) {
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const trail = new THREE.Line(trailGeometry, themed(new THREE.LineBasicMaterial({
        color: '#202c29', transparent: true, opacity: .9, depthWrite: false, toneMapped: false
      }), 'ink'));
      trail.frustumCulled = false;
      const head = new THREE.Mesh(coneGeometry, themed(new THREE.MeshBasicMaterial({
        color: '#202c29', transparent: true, opacity: .95, depthWrite: false, toneMapped: false
      }), 'ink'));
      head.frustumCulled = false;
      this.group.add(trail, head);
      this._heads.push({ path, trail, head, phase: k / 3 + path.rank * .105 + (path.side < 0 ? 0 : .045), tailLength: .68 * scale });
    }
    this.update(0, 50);
  }

  setTheme(palette) {
    this.group.traverse(object => {
      const role = object.material?.userData.themeRole;
      if (role) object.material.color.set(palette[role]);
    });
  }

  update(time, speed) {
    if (!this.group.visible) return;
    // Constant distance per second avoids the apparent acceleration caused by
    // unequal segment lengths; playback and pause come from the scene clock.
    const distance = time * Math.max(0, speed) * .025;
    for (const item of this._heads) {
      const { path, trail, head } = item;
      const u = (item.phase + distance / Math.max(.1, path.length)) % 1;
      const fade = Math.min(clamp(u / .035, 0, 1), clamp((1 - u) / .12, 0, 1)) * this._intensity;
      head.material.opacity = .98 * fade; trail.material.opacity = .88 * fade;
      head.visible = fade > .02; trail.visible = fade > .02;
      sample(path, u, this._point); sample(path, Math.min(1, u + .001), this._next);
      this._tangent.subVectors(this._next, this._point).normalize();
      head.position.copy(this._point);
      if (this._tangent.lengthSq() > .1) head.quaternion.setFromUnitVectors(this._up, this._tangent);
      const positions = trail.geometry.attributes.position;
      const tailU = item.tailLength / Math.max(.1, path.length);
      for (let j = 0; j < positions.count; j++) {
        sample(path, Math.max(0, u - tailU * (1 - j / (positions.count - 1))), this._next);
        positions.setXYZ(j, this._next.x, this._next.y, this._next.z);
      }
      positions.needsUpdate = true;
    }
  }
}
