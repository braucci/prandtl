import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CanvasRendererFallback, applyStudioAppearance } from './canvas-renderer.js';
import { getPalette, onThemeChange } from './theme.js';
import { HandOrbit } from './hand-orbit.js';
import { PressureFlow } from './pressure-flow.js';

/* Finite-wing teaching scene. Streamlines are analytic visual tracers, not a CFD
   solution. Coordinates: x span, y up, z downstream. Positive lift is +y. */
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function disposeGroup(group) {
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
  group.clear();
}
function seeded(i) { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function themeMaterial(material, role, opacityRole) {
  material.userData.themeRole=role;
  if(opacityRole){material.userData.themeOpacityRole=opacityRole;material.userData.themeBaseOpacity=material.opacity;}
  (material.uniforms?.uColor?.value||material.color)?.set(getPalette()[role]);
  return material;
}

function lineMaterial(role, opacity, uniforms, extra = {}) {
  return themeMaterial(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.NormalBlending, toneMapped:false,
    uniforms: {
      uColor: { value: new THREE.Color(getPalette()[role]) }, uOpacity: { value: opacity },uThemeOpacity:{value:1},
      uTime: uniforms.time, uSpeed: uniforms.speed,
      ...extra
    },
    vertexShader: `attribute float along; attribute float phase;
      varying float vAlong; varying float vPhase;
      void main(){vAlong=along;vPhase=phase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity,uTime,uSpeed,uThemeOpacity;
      varying float vAlong,vPhase;
      void main(){float q=fract(vAlong*2.5-uTime*uSpeed*2.5+vPhase);
        float p=pow(max(0.0,1.0-abs(q-0.5)*2.0),13.0);
        float edge=smoothstep(0.0,0.018,vAlong)*(1.0-smoothstep(0.80,1.0,vAlong));
        gl_FragColor=vec4(uColor,uOpacity*uThemeOpacity*(0.38+0.62*p)*edge);
        #include <colorspace_fragment>
      }`
  }),role);
}

function makeLines(paths, color, opacity, uniforms) {
  const positions = [], along = [], phase = [];
  paths.forEach((p, i) => {
    const n = p.length / 3;
    for (let j = 0; j < n - 1; j++) {
      positions.push(p[j * 3], p[j * 3 + 1], p[j * 3 + 2], p[(j + 1) * 3], p[(j + 1) * 3 + 1], p[(j + 1) * 3 + 2]);
      along.push(j / (n - 1), (j + 1) / (n - 1));
      phase.push(i * 0.078, i * 0.078);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const obj = new THREE.LineSegments(geo, lineMaterial(color, opacity, uniforms));
  obj.frustumCulled = false;
  obj.renderOrder = 2;
  return obj;
}

function pointMaterial(pixelRatio) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, toneMapped:false,
    uniforms: {uPixelRatio: {value:pixelRatio},uThemeOpacity:{value:1}},
    vertexShader: `attribute vec3 color; attribute float size; attribute float alpha;
      varying vec3 vColor; varying float vAlpha; uniform float uPixelRatio;
      void main(){vColor=color;vAlpha=alpha;vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=clamp(size*uPixelRatio*(175.0/max(4.0,-mv.z)),1.0,16.0);
      gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;uniform float uThemeOpacity;
      void main(){float r=length(gl_PointCoord-0.5)*2.0;if(r>1.0)discard;
      float a=exp(-4.5*r*r)*(1.0-smoothstep(0.65,1.0,r));
      gl_FragColor=vec4(vColor,a*vAlpha*uThemeOpacity);
      #include <colorspace_fragment>
    }`
  });
}

function arrowBetween(from, to, role, head = .15) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const arrow = new THREE.ArrowHelper(dir.normalize(), from, len, getPalette()[role], Math.min(head, len * .32), Math.min(head * .55, len * .18));
  themeMaterial(arrow.line.material,role);themeMaterial(arrow.cone.material,role);
  arrow.line.material.transparent = true;
  arrow.line.material.opacity = .85;
  arrow.cone.material.transparent = true;
  arrow.cone.material.opacity = .95;
  return arrow;
}

export class VortexScene {
  constructor(container, initialState = {}) {
    if (!container) throw new Error('Contenitore 3D non disponibile.');
    this.container = container;
    this.state = {
      alpha:6, ar:8, speed:50, stage:2, paused:false, playback:1,
      quality:'balanced', autoRotate:false,
      layers:{particles:true,sheet:true,pressure:false,pressureLabels:true,vectors:false,forces:false,labels:true},
      ...initialState
    };
    this._time = 0;
    this._lastTime = performance.now();
    this._fps = 60;
    this._disposed = false;
    this._active = true;
    this._geometryDirty = false;
    this._frame = 0;
    this._uniforms = {time:{value:0},speed:{value:.14}};
    this._anchors = [];
    this._dragging = false;
    this._view = 'perspective';
    this._cameraTransition = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(getPalette().sceneBackground);
    this.scene.fog = new THREE.FogExp2(getPalette().sceneBackground, .012);
    this.camera = new THREE.PerspectiveCamera(43, 1, .05, 180);
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', {antialias:true,alpha:false,powerPreference:'high-performance'});
      if (!context) throw new Error('WebGL 2 non disponibile');
      this.renderer = new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'});
    } catch (error) {
      this.renderer = new CanvasRendererFallback();
      this.renderingMode = 'compatible';
      console.info('VORTICE: rendering compatibile attivo; la scena e la camera restano tridimensionali.');
    }
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setClearColor(getPalette().sceneBackground, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none;';
    this.renderer.domElement.setAttribute('aria-label','Ala tridimensionale interattiva con scia vorticosa. Trascina per ruotare; usa la rotella per ingrandire.');
    this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 56;
    this.controls.maxPolarAngle = Math.PI * .82;
    this.controls.enablePan = true;
    this.controls.panSpeed = .55;
    this.controls.rotateSpeed = .6;
    this.controls.zoomSpeed = .75;
    this.controls.autoRotateSpeed = .45;
    this._handOrbit=new HandOrbit(this.camera,this.controls);
    this.controls.addEventListener('start', () => { this.endHandControl();this._cameraTransition = null; this._dragging = true; });
    this.controls.addEventListener('end', () => { this._dragging = false; });
    this._makeStudio();
    this.wingGroup = new THREE.Group();
    this.wakeGroup = new THREE.Group();
    this.sheetGroup = new THREE.Group();
    this.crossflowGroup = new THREE.Group();
    this.freestreamGroup = new THREE.Group();
    this.vectorGroup = new THREE.Group();
    this.forceGroup = new THREE.Group();
    this.scene.add(this.wingGroup, this.wakeGroup, this.sheetGroup, this.crossflowGroup, this.freestreamGroup, this.vectorGroup, this.forceGroup);
    this._rebuild();
    this._unsubscribeTheme=onThemeChange(p=>this._applyTheme(p));
    this.setView('perspective', true);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this._visibilityHandler = () => { this._lastTime = performance.now(); };
    document.addEventListener('visibilitychange',this._visibilityHandler);
    this._contextLost = event => {
      event.preventDefault();
      this.state.paused = true;
      container.dispatchEvent(new CustomEvent('sceneerror',{bubbles:true,detail:'Il contesto grafico è stato interrotto. Ricarica per riprendere la scena.'}));
    };
    this.renderer.domElement.addEventListener('webglcontextlost',this._contextLost);
    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  _pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.state.quality === 'high' ? 1.8 : 1.35);
  }

  _makeStudio() {
    const hemi = new THREE.HemisphereLight('#ffffff','#c3cbc0',1.8);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff',3.0);
    key.position.set(-6,11,-4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024,1024);
    key.shadow.camera.left = -14;key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;key.shadow.camera.bottom = -14;
    key.shadow.camera.near = .5;key.shadow.camera.far = 45;
    key.shadow.bias = -.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#e0e9e2',1.5);
    rim.position.set(9,4,5);this.scene.add(rim);
    const warm = new THREE.DirectionalLight('#fff1dd',.7);
    warm.position.set(-9,2,8);this.scene.add(warm);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160,160),themeMaterial(new THREE.MeshStandardMaterial({roughness:1,metalness:0}),'sceneBackground'));
    floor.rotation.x=-Math.PI/2;floor.position.y=-5.1;floor.receiveShadow=true;this.scene.add(floor);
    const grid = new THREE.GridHelper(100,80,getPalette().grid,getPalette().line);
    grid.position.y=-5.085;grid.material.transparent=true;grid.material.opacity=.34;grid.material.depthWrite=false;this.scene.add(grid);
    this._studio={hemi,key,rim,warm,grid,gridOpacity:.34};
    // Local studio reflection: no texture download and no external assets.
    if(this.renderer.isFallback)return;
    const env = new THREE.Scene();env.background=new THREE.Color('#d6ddd6');
    const card = (color,w,h,x,y,z,rx=0,ry=0) => {
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
      panel.position.set(x,y,z);panel.rotation.set(rx,ry,0);env.add(panel);
    };
    card('#ffffff',20,9,-2,8,-3,Math.PI/2,0);
    card('#edf2e9',6,16,9,2,0,0,Math.PI/2);
    card('#879d8c',12,3,-7,4,7,0,Math.PI/3);
    card('#fff3dc',8,9,-10,1,-2,0,Math.PI/2);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._environment = pmrem.fromScene(env,.06);
    this.scene.environment=this._environment.texture;
    env.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
  }

  _dimensions() {
    this.span = this.state.physics?.span || Math.sqrt(16 * this.state.ar);
    this.half = this.span / 2;
    this.chord = this.state.physics?.chord || 64 / (Math.PI * this.span);
    this.wakeLength = this.span * 1.42;
    const alphaI=this.state.physics?.alphaI ?? THREE.MathUtils.degToRad(this.state.alpha)/(1+this.state.ar/2);
    this.strength = clamp(alphaI/.020943951023931956,0,2.9);
    this._uniforms.speed.value = this.state.speed * .043 / this.wakeLength;
  }

  _rebuild() {
    this._dimensions();
    for(const g of [this.wingGroup,this.wakeGroup,this.sheetGroup,this.crossflowGroup,this.freestreamGroup,this.vectorGroup,this.forceGroup]) disposeGroup(g);
    this._paths=[];this._flowPaths=[];
    this._makeWing();
    this._makeWake();
    this._makeFreestream();
    this._makeCrossflow();
    this._makeVectors();
    this._makeForces();
    this._makeParticles();
    this._applyTheme();
    this._geometryDirty=false;
    if(this._pendingCameraFit){this._pendingCameraFit=false;this.setView(this._view);}
  }

  _makeWing() {
    const nx=64, nq=64, loop=nq*2;
    const verts=[], pressureWeights=[], indices=[];
    const naca = q=>5*.12*(.2969*Math.sqrt(q)-.1260*q-.3516*q*q+.2843*q*q*q-.1036*q*q*q*q);
    for(let i=0;i<=nx;i++) {
      const angle=Math.PI*(i/nx-.5);
      const x=this.half*Math.sin(angle);
      const c=Math.max(.003,this.chord*Math.cos(angle));
      for(let j=0;j<loop;j++) {
        const top=j<=nq;
        const jj=top?j:loop-j;
        const q=(1-Math.cos(Math.PI*jj/nq))*.5;
        verts.push(x,(top?1:-1)*naca(q)*c,(q-.25)*c);
        const pigment=clamp(.22+Math.pow(1-q,.7)*.78,0,1)*(1-.22*Math.pow(Math.abs(x/this.half),4));
        pressureWeights.push(top?pigment:-pigment);
      }
    }
    for(let i=0;i<nx;i++)for(let j=0;j<loop;j++) {
      const a=i*loop+j,b=(i+1)*loop+j,c=i*loop+(j+1)%loop,d=(i+1)*loop+(j+1)%loop;
      indices.push(a,c,b,b,c,d);
    }
    const geom=new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    geom.setAttribute('color',new THREE.BufferAttribute(new Float32Array(verts.length),3));
    this._pressureData={geometry:geom,weights:new Float32Array(pressureWeights)};
    geom.setIndex(indices);geom.computeVertexNormals();
    this.wingMaterial=new THREE.MeshPhysicalMaterial({
      color:getPalette().wing,metalness:.42,roughness:.26,clearcoat:.55,clearcoatRoughness:.3,
      envMapIntensity:.95,side:THREE.DoubleSide,vertexColors:false
    });
    const wing=new THREE.Mesh(geom,this.wingMaterial);wing.castShadow=true;wing.receiveShadow=true;this.wingGroup.add(wing);
    this._wingMesh=wing;
    this._pressureRaycaster=this._pressureRaycaster||new THREE.Raycaster();
    // Both callouts identify the same chordwise section, never opposite semiwings.
    // Take their positions and normals from actual mesh vertices so the anchors
    // remain on the two skins after incidence or aspect-ratio changes.
    const sectionRow=36,sectionChord=26;
    this._pressureAnchors=[
      {id:'pressure-upper',surface:'upper',badge:'D',text:'Dorso · estradosso',detail:'Pressione mediamente minore',kind:'pressure-low',vertex:sectionRow*loop+sectionChord},
      {id:'pressure-lower',surface:'lower',badge:'V',text:'Ventre · intradosso',detail:'Pressione mediamente maggiore',kind:'pressure-high',vertex:sectionRow*loop+loop-sectionChord}
    ].map(({vertex,...entry})=>({...entry,point:new THREE.Vector3().fromBufferAttribute(geom.attributes.position,vertex),normal:new THREE.Vector3().fromBufferAttribute(geom.attributes.normal,vertex)}));
    this.wingGroup.rotation.x=THREE.MathUtils.degToRad(this.state.alpha);
    this._pressureSection=new THREE.Group();
    const sectionAngle=Math.PI*(sectionRow/nx-.5),sectionX=this.half*Math.sin(sectionAngle),sectionC=this.chord*Math.cos(sectionAngle);
    for(const side of [1,-1]){
      const points=[];
      for(let j=0;j<=64;j++){const q=(1-Math.cos(Math.PI*j/64))*.5;points.push(new THREE.Vector3(sectionX,side*(naca(q)*sectionC+.003),(q-.25)*sectionC));}
      const contour=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),themeMaterial(new THREE.LineBasicMaterial({transparent:true,opacity:.9,depthWrite:false} ),side>0?'pressureLow':'pressureHigh'));
      this._pressureSection.add(contour);
    }
    this.wingGroup.add(this._pressureSection);
    // Restrained flush panel seams on both surfaces.
    const seams=[];
    for(const k of [-.82,-.60,-.36,0,.36,.60,.82]) {
      const x=this.half*k,c=this.chord*Math.sqrt(1-k*k);
      for(const side of [1,-1]) {
        const points=[];
        for(let j=0;j<=50;j++){const q=.035+.93*j/50;points.push(new THREE.Vector3(x,side*(naca(q)*c+.0015),(q-.25)*c));}
        seams.push(points);
      }
    }
    for(const points of seams) {
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),themeMaterial(new THREE.LineBasicMaterial({transparent:true,opacity:.34}),'wingEdge'));
      this.wingGroup.add(line);
    }
    // Fine leading edge and trailing edge definition read cleanly at wide views.
    for(const q of [.0,.985]) {
      const points=[];
      for(let i=0;i<=128;i++) {const ang=Math.PI*(i/128-.5),x=this.half*Math.sin(ang),c=this.chord*Math.cos(ang);points.push(new THREE.Vector3(x,naca(q)*c+.001,(q-.25)*c));}
      this.wingGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),themeMaterial(new THREE.LineBasicMaterial({transparent:true,opacity:q===0?.8:.55}),'wingEdge')));
    }
  }

  _computeWake() {
    // Cross-plane advection of the distributed trailing vorticity. Each
    // regularized filament carries Γ(x_left)-Γ(x_right); the same signed
    // strengths advect every other filament. Their differential motion rolls
    // up the sheet continuously, without imposing a helix or a phase seam.
    const n=64, steps=this.state.quality==='high'?200:168;
    const alpha=THREE.MathUtils.degToRad(this.state.alpha);
    const u=Math.max(1,this.state.speed);
    const cl=this.state.physics?.cl ?? 2*Math.PI*alpha/(1+2/this.state.ar);
    const gamma0=this.state.physics?.gamma0 ?? 2*u*16*cl/(Math.PI*this.span);
    const strength=new Float64Array(n),x=new Float64Array(n),y=new Float64Array(n);
    const z0=new Float64Array(n),paths=[];
    const core=.015*this.span;
    const gammaAt=x=>gamma0*Math.sqrt(Math.max(0,1-(x/this.half)**2));
    for(let i=0;i<n;i++) {
      const left=-this.half+this.span*i/n,right=-this.half+this.span*(i+1)/n;
      x[i]=.5*(left+right);strength[i]=gammaAt(left)-gammaAt(right);
      const c=this.chord*Math.sqrt(Math.max(0,1-(x[i]/this.half)**2));
      y[i]=-.75*c*Math.sin(alpha);z0[i]=.75*c*Math.cos(alpha);
      const path=new Float32Array((steps+1)*3);path.set([x[i],y[i],z0[i]],0);paths.push(path);
    }
    // Transverse time is deliberately magnified for classroom visibility.
    // Streamwise distance and the metric readouts retain their own units.
    const transverseAmplification=2.6;
    const dt=this.wakeLength/u*transverseAmplification/steps;
    const vx=new Float64Array(n),vy=new Float64Array(n),mx=new Float64Array(n),my=new Float64Array(n);
    const induced=(px,py,ux,uy)=>{
      ux.fill(0);uy.fill(0);
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++) {
        const dx=px[i]-px[j],dy=py[i]-py[j];
        const factor=1/(TAU*(dx*dx+dy*dy+core*core));
        ux[i]-=strength[j]*dy*factor;uy[i]+=strength[j]*dx*factor;
        ux[j]+=strength[i]*dy*factor;uy[j]-=strength[i]*dx*factor;
      }
    };
    this._wakeSlices=[{x:x.slice(),y:y.slice()}];
    for(let k=1;k<=steps;k++) {
      induced(x,y,vx,vy);
      for(let i=0;i<n;i++){mx[i]=x[i]+.5*dt*vx[i];my[i]=y[i]+.5*dt*vy[i];}
      induced(mx,my,vx,vy);
      for(let i=0;i<n;i++) {
        x[i]+=dt*vx[i];y[i]+=dt*vy[i];
        paths[i].set([x[i],y[i],z0[i]+k/steps*this.wakeLength],k*3);
      }
      this._wakeSlices.push({x:x.slice(),y:y.slice()});
    }
    this._wakeStrengths=strength;this._wakeCore=core;this._wakeSteps=steps;
    this._wakePaths=paths;
    return paths;
  }

  _makeWake() {
    const allPaths=this._computeWake();
    const steps=this._wakeSteps;
    const intensity=clamp(Math.sqrt(this.strength),0,1.3);
    this._wakeSets={};this._wakeCenterLines={};
    for(const side of [-1,1]) {
      const color=side<0?'flowA':'flowB';
      const paths=side<0?allPaths.slice(0,32):allPaths.slice(32);
      this._wakeSets[side]=paths;
      for(const p of paths)this._paths.push({p,themeRole:color,type:'wake'});
      this.sheetGroup.add(makeLines(paths,color,.62*intensity,this._uniforms));
      // Neighbouring material filaments remain connected through a smooth
      // sheet. There is no artificial break at the eventual vortex core.
      const surf=[],ind=[];
      for(const p of paths)for(let j=0;j<p.length;j++)surf.push(p[j]);
      for(let i=0;i<paths.length-1;i++)for(let j=0;j<steps;j++) {
        const a=i*(steps+1)+j,b=a+steps+1;ind.push(a,b,a+1,b,b+1,a+1);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(surf,3));g.setIndex(ind);g.computeVertexNormals();
      const m=themeMaterial(new THREE.MeshBasicMaterial({transparent:true,opacity:.035*intensity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.NormalBlending}),color,'membrane');
      const mesh=new THREE.Mesh(g,m);mesh.renderOrder=1;this.sheetGroup.add(mesh);
      // Highlight the outboard filaments that concentrate into the core.
      const outboard=side<0?paths.slice(0,10):paths.slice(-10);
      this.wakeGroup.add(makeLines(outboard,color,.92*intensity,this._uniforms));
      // The luminous core follows a circulation-weighted centroid of the
      // outboard filaments, rather than a separately prescribed trajectory.
      const corePoints=[],offset=side<0?0:54;
      for(let k=5;k<=steps;k+=2) {
        let px=0,py=0,pz=0,total=0;
        for(let j=0;j<10;j++){
          const idx=offset+j,w=Math.abs(this._wakeStrengths[idx]),p=allPaths[idx];
          px+=p[k*3]*w;py+=p[k*3+1]*w;pz+=p[k*3+2]*w;total+=w;
        }
        if(total>1e-8)corePoints.push(new THREE.Vector3(px/total,py/total,pz/total));
      }
      this._wakeCenterLines[side]=corePoints;
      if(corePoints.length>3) {
        const curve=new THREE.CatmullRomCurve3(corePoints);
        for(const [radius,opacity] of [[.015,.43],[.055,.035]]) {
          const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,90,radius,5,false),themeMaterial(new THREE.MeshBasicMaterial({transparent:true,opacity:opacity*intensity,depthWrite:false,blending:THREE.NormalBlending}),color,radius<.02?'filament':'membrane'));
          tube.renderOrder=2;this.wakeGroup.add(tube);
        }
      }
    }
  }

  _makeFreestream() {
    const paths=[],n=28,steps=90;
    for(let i=0;i<n;i++) {
      const x=(i/(n-1)-.5)*this.span*1.55;
      const yp=(i%2===0?.40:-.38)+(seeded(i+2)-.5)*.32;
      const p=new Float32Array((steps+1)*3);
      for(let j=0;j<=steps;j++) {
        const t=j/steps,z=-this.chord*3.6+t*(this.chord*4.7+1.5);
        const onWing=Math.abs(x)<this.half;
        const localChord=onWing?this.chord*Math.sqrt(1-(x/this.half)**2):0;
        const bend=onWing?Math.exp(-(((z-localChord*.15)/(localChord*.75+.1))**2))*.14*localChord:0;
        const down=onWing?this.strength*.10*Math.max(0,z)*Math.exp(-(Math.abs(x/this.half)**6)):0;
        p.set([x,yp+Math.sign(yp)*bend-down,z],j*3);
      }
      paths.push(p);this._flowPaths.push({p,themeRole:'velocity',type:'free'});
    }
    this.freestreamGroup.add(makeLines(paths,'velocity',.24,this._uniforms));
    // A single neutral streamwise arrow states the wind convention.
    const from=new THREE.Vector3(-this.half-1.7,.1,-2.8);
    const wind=arrowBetween(from,from.clone().add(new THREE.Vector3(0,0,2.0)),'velocity',.21);
    this.freestreamGroup.add(wind);
  }

  _makeCrossflow() {
    this._pressureFlow = new PressureFlow({half:this.half,chord:this.chord,
      alpha:this.state.alpha,strength:this.strength,wakePaths:this._wakePaths,quality:this.state.quality});
    this.crossflowGroup.add(this._pressureFlow.group);
    this._pressureFlow.update(this._time,this.state.speed);
  }

  _makeVectors() {
    if(this.state.alpha<.01)return;
    const s=this.strength;
    // Sample the same advected sheet that is drawn in the scene, using the
    // regularized Biot-Savart field of all 64 streamwise filaments.
    // One transverse sampling plane keeps the aft view readable.
    for(const z of [this.wakeLength*.43]) {
      const k=clamp(Math.round(z/this.wakeLength*this._wakeSteps),0,this._wakeSteps);
      const wake=this._wakeSlices[k];
      for(let ix=0;ix<13;ix++)for(let iy=0;iy<3;iy++) {
        const x=(ix/12-.5)*this.span*1.6;
        const y=(iy-1)*.82-.15-s*.045*this.span*(z/this.wakeLength);
        let vx=0,vy=0;
        for(let j=0;j<this._wakeStrengths.length;j++) {
          const dx=x-wake.x[j],dy=y-wake.y[j];
          const factor=this._wakeStrengths[j]/(TAU*(dx*dx+dy*dy+this._wakeCore*this._wakeCore));
          vx-=dy*factor;vy+=dx*factor;
        }
        const mag=Math.hypot(vx,vy);
        if(mag<.025)continue;
        const len=clamp(mag*.24,.07,.78);
        const from=new THREE.Vector3(x,y,z),to=from.clone().add(new THREE.Vector3(vx/mag,vy/mag,0).multiplyScalar(len));
        const color=vy<0?'downwash':'velocity';
        this.vectorGroup.add(arrowBetween(from,to,color,.13));
      }
    }
    // Distinct wing-plane w arrows. These represent the lifting-line value,
    // not the larger velocity of a downstream Trefftz-plane measurement.
    for(let k=-3;k<=3;k++) {
      const x=k*this.half*.21,from=new THREE.Vector3(x,-.18,0);
      this.vectorGroup.add(arrowBetween(from,from.clone().add(new THREE.Vector3(0,-.7*s,0)),'downwash',.16));
    }
  }

  _makeForces() {
    if(this.state.alpha<.01)return;
    const base=new THREE.Vector3(0,.12,0);
    const length=2.5*clamp(this.state.alpha/6,.2,1.65);
    const ai=this.state.physics?.alphaI ?? THREE.MathUtils.degToRad(this.state.alpha)/(1+this.state.ar/2);
    // Forces share a consistent vector scale; no hidden exaggeration of Di.
    const drag=length*Math.tan(ai);
    this._forceTips={
      L:base.clone().add(new THREE.Vector3(0,length,0)),
      Di:base.clone().add(new THREE.Vector3(0,0,drag)),
      R:base.clone().add(new THREE.Vector3(0,length,drag))
    };
    this.forceGroup.add(arrowBetween(base,this._forceTips.R,'resultant',.22));
    const lift=arrowBetween(base,this._forceTips.L,'lift',.19);lift.line.material.opacity=.8;this.forceGroup.add(lift);
    this.forceGroup.add(arrowBetween(base,this._forceTips.Di,'drag',Math.max(.035,drag*.28)));
    // Component construction from resultant to the vertical reference.
    const guides=new THREE.BufferGeometry().setFromPoints([this._forceTips.L,this._forceTips.R,this._forceTips.Di,this._forceTips.R]);
    const lines=new THREE.LineSegments(guides,themeMaterial(new THREE.LineDashedMaterial({transparent:true,opacity:.5,dashSize:.07,gapSize:.06}),'muted'));lines.computeLineDistances();this.forceGroup.add(lines);
    // Incoming local velocity and its modest downward inclination.
    const from=new THREE.Vector3(this.half*.26,.9,-2.5);
    const vlen=2.3;
    this.forceGroup.add(arrowBetween(from,from.clone().add(new THREE.Vector3(0,0,vlen)),'velocity',.16));
    this.forceGroup.add(arrowBetween(from,from.clone().add(new THREE.Vector3(0,-Math.tan(ai)*vlen,vlen)),'local',.16));
  }

  _makeParticles() {
    this._allParticlePaths=[...this._paths,...this._flowPaths];
    const count=this.state.quality==='high'?3600:2100;
    const positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),alphas=new Float32Array(count);
    this._particleData=[];
    for(let i=0;i<count;i++) {
      const pathIndex=Math.floor(seeded(i+31)*this._allParticlePaths.length);
      const path=this._allParticlePaths[pathIndex];
      const color=new THREE.Color(getPalette()[path.themeRole]);
      colors.set([color.r,color.g,color.b],i*3);
      sizes[i]=(.13+seeded(i+19)*.32)*(path.type==='free'?.50:1);
      alphas[i]=(.13+seeded(i+66)*.43)*(path.type==='free'?.30:1);
      this._particleData.push({pathIndex,offset:seeded(i+171),alpha:alphas[i],speed:.85+seeded(i+99)*.3});
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));
    geometry.setAttribute('alpha',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage));
    if(this.particles){this.scene.remove(this.particles);this.particles.geometry.dispose();this.particles.material.dispose();}
    this.particles=new THREE.Points(geometry,pointMaterial(this._pixelRatio()));
    this.particles.frustumCulled=false;this.particles.renderOrder=3;this.scene.add(this.particles);
    this._updateParticles();
  }

  _updateParticles() {
    if(!this.particles)return;
    const pos=this.particles.geometry.attributes.position.array;
    const alpha=this.particles.geometry.attributes.alpha.array;
    for(let i=0;i<this._particleData.length;i++) {
      const datum=this._particleData[i],path=this._allParticlePaths[datum.pathIndex];
      const enabled=path.type==='free'||this.state.alpha>.01;
      let u=(datum.offset+this._time*this._uniforms.speed.value*datum.speed)%1;
      const pts=path.p,n=pts.length/3,at=u*(n-1),j=Math.floor(at),f=at-j,k=Math.min(j+1,n-1);
      const ix=i*3;
      pos[ix]=mix(pts[j*3],pts[k*3],f);pos[ix+1]=mix(pts[j*3+1],pts[k*3+1],f);pos[ix+2]=mix(pts[j*3+2],pts[k*3+2],f);
      const fade=clamp(u/.035,0,1)*clamp((1-u)/.15,0,1);
      alpha[i]=enabled?datum.alpha*fade*(path.type==='free'?1:clamp(Math.sqrt(this.strength),0,1.18)):0;
    }
    this.particles.geometry.attributes.position.needsUpdate=true;
    this.particles.geometry.attributes.alpha.needsUpdate=true;
  }

  _applyLayers() {
    const l=this.state.layers||{};
    const lifting=this.state.alpha>.01;
    this.wakeGroup.visible=l.particles!==false&&lifting;
    this.sheetGroup.visible=!!l.sheet&&lifting;
    this.crossflowGroup.visible=l.particles!==false&&lifting&&!!l.pressure;
    this.freestreamGroup.visible=l.particles!==false;
    this.vectorGroup.visible=!!l.vectors&&lifting;
    this.forceGroup.visible=!!l.forces&&lifting;
    if(this.particles)this.particles.visible=l.particles!==false;
    const pressure=!!l.pressure&&lifting;
    if(this.wingMaterial.vertexColors!==pressure){this.wingMaterial.vertexColors=pressure;this.wingMaterial.needsUpdate=true;}
    this.wingMaterial.color.set(pressure?'#ffffff':getPalette().wing);
    this.wingMaterial.metalness=pressure?.20:.42;
    this.wingMaterial.roughness=pressure?.39:.26;
    if(this._pressureSection)this._pressureSection.visible=lifting&&l.labels!==false&&l.pressureLabels!==false&&!!l.pressure;
    this.controls.autoRotate=!!this.state.autoRotate&&!this.state.paused&&!this._handOrbit.active;
  }

  _applyTheme(p=getPalette()) {
    this.scene.background.set(p.sceneBackground);this.scene.fog.color.set(p.sceneBackground);
    this.renderer.setClearColor(p.sceneBackground,1);
    const appearance=applyStudioAppearance(this.scene,this.renderer,this._studio,p);
    this.scene.traverse(object=>{
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]) {
        const role=material.userData.themeRole;
        if(role)(material.uniforms?.uColor?.value||material.color)?.set(p[role]);
        if(material.uniforms?.uThemeOpacity)material.uniforms.uThemeOpacity.value=object.isPoints?appearance.particle:appearance.filament;
        const opacityRole=material.userData.themeOpacityRole;
        if(opacityRole)material.opacity=material.userData.themeBaseOpacity*appearance[opacityRole];
      }
    });
    if(this._pressureData){
      const {geometry,weights}=this._pressureData,colors=geometry.attributes.color,dark=p.scheme==='dark';
      const low=new THREE.Color(p.pressureLow),high=new THREE.Color(p.pressureHigh),color=new THREE.Color();
      const top=dark?new THREE.Color(p.wing).lerp(low,.12):new THREE.Color('#e7eee5');
      const bottom=dark?new THREE.Color(p.wing).lerp(high,.12):new THREE.Color('#eee8d8');
      for(let i=0;i<weights.length;i++){
        const weight=weights[i];color.copy(weight>0?top:bottom).lerp(weight>0?low:high,Math.abs(weight));
        colors.setXYZ(i,color.r,color.g,color.b);
      }
      colors.needsUpdate=true;
    }
    const colors=this.particles?.geometry.attributes.color;
    if(colors){
      const swatches=Object.fromEntries(['flowA','flowB','velocity'].map(key=>[key,new THREE.Color(p[key])]));
      for(let i=0;i<this._particleData.length;i++){
        const path=this._allParticlePaths[this._particleData[i].pathIndex],color=swatches[path.themeRole];
        colors.setXYZ(i,color.r,color.g,color.b);
      }
      colors.needsUpdate=true;
    }
    this._pressureFlow?.setTheme?.(p);
    this._applyLayers();
  }

  setState(next) {
    const before=this.state;
    this.state={...before,...next,layers:{...before.layers,...next.layers}};
    const changed=before.alpha!==this.state.alpha||before.ar!==this.state.ar||before.speed!==this.state.speed||before.quality!==this.state.quality;
    if(before.ar!==this.state.ar&&!this._dragging&&!this._handOrbit.active)this._pendingCameraFit=true;
    if(changed)this._geometryDirty=true;
    if(before.quality!==this.state.quality){this.renderer.setPixelRatio(this._pixelRatio());this.resize();}
    this._uniforms.speed.value=this.state.speed*.043/(this.wakeLength||16);
    this._applyLayers();
    if(this.state.paused)this._updateParticles();
  }

  setView(view='perspective',immediate=false) {
    this.endHandControl();
    this._view=view;
    const width=this.container.clientWidth||1000,height=this.container.clientHeight||650;
    const s=Math.max(.84,this.span/11.31);
    const target=new THREE.Vector3(2*s,0,6*s);
    let position;
    switch(view) {
      case 'rear': position=new THREE.Vector3(0,3.2*s,31*s);target.set(0,-.4*s,6*s);break;
      case 'side': position=new THREE.Vector3(24*s,2.8*s,4.3*s);target.set(0,-.1,4.0*s);break;
      case 'top': position=new THREE.Vector3(.01,26*s,4.5*s);target.set(0,0,4.5*s);break;
      case 'bottom': position=new THREE.Vector3(8*s,-10*s,-12*s);target.set(1*s,0,4*s);break;
      case 'tip':
        target.set(this.half-this.chord*.28,0,this.chord*.45);
        position=new THREE.Vector3(this.half+this.chord*1.3,this.chord*.85,-this.chord*1.75);
        break;
      // An upstream three-quarter view places the wing in the foreground
      // and lets the complete wake recede, avoiding cropped near-camera tails.
      default: position=new THREE.Vector3(8*s,8*s,-12*s);break;
    }
    const aspectFit=Math.max(1,1.6/(width/height));
    position.sub(target).multiplyScalar(aspectFit).add(target);
    if(immediate){this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();this._cameraTransition=null;}
    else this._cameraTransition={from:this.camera.position.clone(),targetFrom:this.controls.target.clone(),to:position,targetTo:target,start:performance.now(),duration:1100};
  }

  resetCamera(){this.setView('perspective');}

  beginHandControl(){
    if(this._disposed||!this._active||this._dragging)return false;
    this._cameraTransition=null;this._pendingCameraFit=false;
    return this._handOrbit.begin();
  }
  updateHandControl(offset){return this._handOrbit.update(offset);}
  endHandControl(){
    const ended=this._handOrbit.end();
    this.controls.autoRotate=!!this.state.autoRotate&&!this.state.paused;
    return ended;
  }

  setActive(active){if(!active)this.endHandControl();this._active=active;this.controls.enabled=!!active;this._lastTime=performance.now();if(active)this.resize();}

  resize() {
    if(this._disposed)return;
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);
  }

  projectLabels() {
    if(this.state.layers?.labels===false)return [];
    const entries=[];
    const add=(id,text,kind,p)=>entries.push({id,text,kind,p});
    if(this.state.alpha>.01) {
      if(this.state.layers?.pressure&&this.state.layers.pressureLabels!==false) {
        this._wingMesh.updateWorldMatrix(true,false);
        for(const anchor of this._pressureAnchors){
          const {point,normal,...entry}=anchor;
          entries.push({...entry,p:this._wingMesh.localToWorld(point.clone()),normal:normal.clone().transformDirection(this._wingMesh.matrixWorld)});
        }
      }
      if(this.state.layers?.particles!==false||this.state.layers?.sheet) {
        for(const side of [-1,1]){
          const line=this._wakeCenterLines?.[side];
          const p=line?.length?line[Math.floor(line.length*.33)].clone():new THREE.Vector3(side*this.half*.9,0,this.wakeLength*.33);
          add(side<0?'tip-left':'tip-right',side<0?'Vortice sinistro':'Vortice destro',side<0?'cyan':'amber',p);
        }
      }
      if(this.state.layers?.vectors)add('downwash','Downwash · w','downwash',new THREE.Vector3(0,-1.05,4.5));
      if(this.state.layers?.forces&&this._forceTips) {
        add('L','L','lift',this._forceTips.L.clone().add(new THREE.Vector3(-.28,.25,0)));
        add('R','R','resultant',this._forceTips.R.clone().add(new THREE.Vector3(.28,.33,.22)));
        add('Di','Dᵢ','drag',this._forceTips.Di.clone().add(new THREE.Vector3(.5,-.35,.6)));
      }
    }
    add('freestream','V∞','velocity',new THREE.Vector3(-this.half-1.7,.4,-2.25));
    const w=this.container.clientWidth,h=this.container.clientHeight;
    return entries.map(({p,normal,...entry})=>{
      const projected=p.clone().project(this.camera);
      const x=(projected.x*.5+.5)*w,y=(-.5*projected.y+.5)*h;
      const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.94&&Math.abs(projected.y)<.89;
      if(!entry.surface)return{...entry,x,y,visible};
      const end=p.clone().addScaledVector(normal,this.chord*.45).project(this.camera);
      let normalX=(end.x-projected.x)*w*.5,normalY=-(end.y-projected.y)*h*.5;
      const length=Math.hypot(normalX,normalY);
      if(length>.01){normalX/=length;normalY/=length;}
      else{normalX=0;normalY=entry.surface==='upper'?-1:1;}
      const towardPoint=p.clone().sub(this.camera.position),distance=towardPoint.length();
      this._pressureRaycaster.set(this.camera.position,towardPoint.normalize());
      this._pressureRaycaster.near=0;
      this._pressureRaycaster.far=Math.max(0,distance-this.chord*.004);
      const hiddenSurface=visible&&this._pressureRaycaster.intersectObject(this._wingMesh,false).length>0;
      const verticalSign=Math.abs(normalY)>.15?Math.sign(normalY):entry.surface==='upper'?-1:1;
      return{...entry,anchorX:x,anchorY:y,normalX,normalY,hiddenSurface,
        x:x+normalX*86,y:y+verticalSign*Math.max(70,Math.abs(normalY)*86),visible};
    });
  }

  get stats(){return{fps:Math.round(this._fps),particles:this.particles?.visible?this._particleData?.length||0:0};}

  _animate(now) {
    if(this._disposed)return;
    this._raf=requestAnimationFrame(this._animate);
    const dt=Math.min(.06,(now-this._lastTime)/1000);this._lastTime=now;
    if(document.hidden||!this._active)return;
    this._fps=mix(this._fps,1/Math.max(.001,dt),.025);
    if(this._geometryDirty)this._rebuild();
    if(!this.state.paused){this._time+=dt*(this.state.playback||1);this._uniforms.time.value=this._time;this._updateParticles();}
    if(this.crossflowGroup.visible)this._pressureFlow?.update(this._time,this.state.speed);
    const handControlled=this._handOrbit.step(dt);
    if(!handControlled&&this._cameraTransition) {
      const tr=this._cameraTransition,t=clamp((now-tr.start)/tr.duration,0,1),e=t*t*(3-2*t);
      this.camera.position.lerpVectors(tr.from,tr.to,e);this.controls.target.lerpVectors(tr.targetFrom,tr.targetTo,e);
      if(t===1)this._cameraTransition=null;
    }
    if(!handControlled)this.controls.update();
    // The single-sided floor is invisible from below; suppress its grid there
    // too, keeping the ventral surface unobstructed when looking upward.
    this._studio.grid.visible=this.camera.position.y>-4.9;
    this.renderer.render(this.scene,this.camera);
    this._frame++;
  }

  destroy() {
    this._disposed=true;cancelAnimationFrame(this._raf);this._unsubscribeTheme?.();
    this._resizeObserver?.disconnect();document.removeEventListener('visibilitychange',this._visibilityHandler);
    this.renderer.domElement.removeEventListener('webglcontextlost',this._contextLost);
    this.controls.dispose();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});
    this._environment?.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  }
}
