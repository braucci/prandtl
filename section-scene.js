import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CanvasRendererFallback, applyStudioAppearance } from './canvas-renderer.js';
import { getPalette, onThemeChange } from './theme.js';
import { HandOrbit } from './hand-orbit.js';

/* Extracted-section teaching scene. x = span, y = up, z = downstream.
   The slice and parent wing use the same closed NACA 0012 coordinates.
   Geometry is rebuilt only for changes in span or selected span station;
   extraction, model transition, force rotation and camera motion are transforms. */
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
const rad = THREE.MathUtils.degToRad;
const CYAN = 'accent', MINT = 'lift', GOLD = 'resultant', AMBER = 'drag';
const V3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const thickness = q => 5*.12*(.2969*Math.sqrt(q)-.126*q-.3516*q*q+.2843*q*q*q-.1036*q*q*q*q);

function clear(group) {
  group.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});
  group.clear();
}
function themeMaterial(material,role,opacityRole) {
  material.userData.themeRole=role;
  if(opacityRole){material.userData.themeOpacityRole=opacityRole;material.userData.themeBaseOpacity=material.opacity;}
  (material.uniforms?.uColor?.value||material.color)?.set(getPalette()[role]);
  return material;
}
function line(points,role,opacity=1,dashed=false) {
  const g=new THREE.BufferGeometry().setFromPoints(points);
  const m=themeMaterial(dashed?new THREE.LineDashedMaterial({transparent:true,opacity,dashSize:.12,gapSize:.10,depthWrite:false}):new THREE.LineBasicMaterial({transparent:true,opacity,depthWrite:false}),role);
  const o=new THREE.Line(g,m);if(dashed)o.computeLineDistances();return o;
}
function setOpacity(object,opacity) {
  object.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.transparent=true;m.opacity=opacity;}});
}
function arrow(role) {
  const a=new THREE.ArrowHelper(V3(0,1,0),V3(),1,getPalette()[role],.16,.085);
  themeMaterial(a.line.material,role);themeMaterial(a.cone.material,role);
  a.line.material.transparent=true;a.line.material.depthWrite=false;
  a.cone.material.transparent=true;a.cone.material.depthWrite=false;
  return a;
}
function placeArrow(a,start,end,reveal=1,opacity=1) {
  const delta=end.clone().sub(start),length=delta.length();
  a.visible=length>1e-5&&reveal>.005&&opacity>.005;
  if(!a.visible)return;
  a.position.copy(start);a.setDirection(delta.multiplyScalar(1/length));
  const shown=Math.max(.001,length*clamp(reveal,0,1));
  a.setLength(shown,Math.min(.18,shown*.29),Math.min(.095,shown*.15));
  a.line.material.opacity=opacity;a.cone.material.opacity=opacity;
}
function profileOutline(chord,x=0,steps=80) {
  const points=[];
  for(let i=0;i<=steps;i++){const q=(1-Math.cos(Math.PI*i/steps))*.5;points.push(V3(x,thickness(q)*chord,(q-.25)*chord));}
  for(let i=steps-1;i>=0;i--){const q=(1-Math.cos(Math.PI*i/steps))*.5;points.push(V3(x,-thickness(q)*chord,(q-.25)*chord));}
  points.push(points[0].clone());return points;
}
function filamentMaterial(role,opacity,time,speed) {
  // The fallback renderer recognizes this same small line-shader interface.
  return themeMaterial(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false,
    uniforms:{uColor:{value:new THREE.Color(getPalette()[role])},uOpacity:{value:opacity},uThemeOpacity:{value:1},uTime:time,uSpeed:speed},
    vertexShader:`attribute float along;attribute float phase;varying float vAlong;varying float vPhase;
      void main(){vAlong=along;vPhase=phase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform vec3 uColor;uniform float uOpacity,uTime,uSpeed,uThemeOpacity;varying float vAlong,vPhase;
      void main(){float q=fract(vAlong*2.5-uTime*uSpeed*2.5+vPhase);float pulse=pow(max(0.,1.-abs(q-.5)*2.),13.);
      float edge=smoothstep(0.,.025,vAlong)*(1.-smoothstep(.86,1.,vAlong));
      gl_FragColor=vec4(uColor,uOpacity*uThemeOpacity*(.38+.62*pulse)*edge);
      #include <colorspace_fragment>
    }`
  }),role);
}

export class SectionScene {
  constructor(container,initialState={}) {
    if(!container)throw new Error('Contenitore della sezione non disponibile.');
    this.container=container;
    this.state={alpha:6,ar:8,speed:50,spanPosition:.38,extraction:0,blend:0,vectorReveal:0,forceReveal:0,decomposition:0,gain:4,paused:false,playback:1,...initialState};
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(getPalette().sceneBackground);
    this.scene.fog=new THREE.FogExp2(getPalette().sceneBackground,.011);
    this.camera=new THREE.PerspectiveCamera(43,1,.03,150);
    try {
      const canvas=document.createElement('canvas');
      const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
      if(!context)throw new Error('WebGL 2 non disponibile');
      this.renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'});
    } catch {this.renderer=new CanvasRendererFallback();}
    this.renderingMode=this.renderer.isFallback?'compatible':'webgl';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    this.renderer.setClearColor(getPalette().sceneBackground,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.style.cssText='display:block;width:100%;height:100%;outline:none;touch-action:none;';
    this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.setAttribute('aria-label','Estrazione tridimensionale di un profilo alare e transizione dalla sezione bidimensionale all’ala finita. Trascina per ruotare.');
    this.renderer.domElement.tabIndex=0;container.appendChild(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.085;this.controls.minDistance=3;this.controls.maxDistance=42;
    this.controls.maxPolarAngle=Math.PI*.85;this.controls.rotateSpeed=.6;this.controls.panSpeed=.55;
    this._handOrbit=new HandOrbit(this.camera,this.controls);this._dragging=false;
    this.controls.addEventListener('start',()=>{this.endHandControl();this._manualCamera=true;this._dragging=true;});
    this.controls.addEventListener('end',()=>{this._dragging=false;});
    this._view='cinematic';this._manualCamera=false;this._active=true;this._disposed=false;
    this._clock=0;this._last=performance.now();this._fps=60;
    this._timeUniform={value:0};this._speedUniform={value:.16};
    this._targetPosition=V3();this._targetLook=V3();
    this._labelAnchors=[];this._shapeDirty=false;this._visualDirty=true;
    this._makeStudio();
    this.wingRoot=new THREE.Group();this.cutRoot=new THREE.Group();this.sectionRoot=new THREE.Group();
    this.ghostRoot=new THREE.Group();this.fieldRoot=new THREE.Group();this.vectorRoot=new THREE.Group();this.wakeRoot=new THREE.Group();
    this.scene.add(this.wingRoot,this.cutRoot,this.sectionRoot,this.ghostRoot,this.fieldRoot,this.vectorRoot,this.wakeRoot);
    this._makeVectors();this._makeTether();this._buildGeometry();this._updateVisuals();
    this._unsubscribeTheme=onThemeChange(p=>this._applyTheme(p));
    this.resize();this._cameraGoal();this.camera.position.copy(this._targetPosition);this.controls.target.copy(this._targetLook);this.controls.update();
    this._resizeObserver=new ResizeObserver(()=>this.resize());this._resizeObserver.observe(container);
    this._contextLost=e=>{e.preventDefault();this.setActive(false);container.dispatchEvent(new CustomEvent('sceneerror',{bubbles:true,detail:'Il contesto grafico è stato interrotto. Ricarica per riprendere.'}));};
    this.renderer.domElement.addEventListener('webglcontextlost',this._contextLost);
    this._animate=this._animate.bind(this);this._raf=requestAnimationFrame(this._animate);
  }

  _makeStudio() {
    const hemi=new THREE.HemisphereLight('#ffffff','#c3cbc0',1.8);this.scene.add(hemi);
    const key=new THREE.DirectionalLight('#ffffff',3.0);key.position.set(-8,10,-5);this.scene.add(key);
    const rim=new THREE.DirectionalLight('#e0e9e2',1.5);rim.position.set(8,5,4);this.scene.add(rim);
    const warm=new THREE.DirectionalLight('#fff1dd',.7);warm.position.set(-4,2,9);this.scene.add(warm);
    const grid=new THREE.GridHelper(45,36,getPalette().grid,getPalette().line);grid.position.y=-3.8;grid.material.transparent=true;grid.material.opacity=.22;grid.material.depthWrite=false;this.scene.add(grid);
    this._studio={hemi,key,rim,warm,grid,gridOpacity:.22};
    if(this.renderer.isFallback)return;
    const env=new THREE.Scene();env.background=new THREE.Color('#d6ddd6');
    for(const [x,y,z,w,h,color,rx,ry] of [[0,8,0,20,10,'#ffffff',Math.PI/2,0],[-9,3,-2,5,14,'#edf2e9',0,Math.PI/2],[8,3,6,8,10,'#fff3dc',0,-Math.PI/2]]) {
      const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));p.position.set(x,y,z);p.rotation.set(rx,ry,0);env.add(p);
    }
    const pmrem=new THREE.PMREMGenerator(this.renderer);this._environment=pmrem.fromScene(env,.08);this.scene.environment=this._environment.texture;
    clear(env);pmrem.dispose();
  }

  _dimensions() {
    this.span=this.state.physics?.span||Math.sqrt(16*this.state.ar);this.half=this.span/2;
    this.chord=this.state.physics?.chord||64/(Math.PI*this.span);
    this.eta=clamp(this.state.spanPosition??.38,.05,.85);
    this.cutX=-this.eta*this.half;
    this.sectionChord=this.state.physics?.sectionChord||this.chord*Math.sqrt(1-this.eta*this.eta);
  }

  _buildGeometry() {
    this._dimensions();
    for(const group of [this.wingRoot,this.cutRoot,this.sectionRoot,this.ghostRoot,this.fieldRoot,this.wakeRoot])clear(group);
    this._buildWing();this._buildCut();this._buildSection();this._buildFlow();this._buildWake();
    this._shapeDirty=false;this._visualDirty=true;this._applyTheme();
  }

  _buildWing() {
    const ns=48,nc=48,cols=nc*2,positions=[],indices=[];
    for(let i=0;i<=ns;i++) {
      const angle=Math.PI*(i/ns-.5),x=this.half*Math.sin(angle),c=Math.max(.002,this.chord*Math.cos(angle));
      for(let j=0;j<cols;j++) {
        const top=j<=nc,k=top?j:cols-j,q=(1-Math.cos(Math.PI*k/nc))*.5;
        positions.push(x,(top?1:-1)*thickness(q)*c,(q-.25)*c);
      }
    }
    for(let i=0;i<ns;i++)for(let j=0;j<cols;j++){const a=i*cols+j,b=(i+1)*cols+j,c=i*cols+(j+1)%cols,d=(i+1)*cols+(j+1)%cols;indices.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    this.wingMaterial=new THREE.MeshPhysicalMaterial({color:getPalette().wing,metalness:.40,roughness:.27,clearcoat:.45,envMapIntensity:.9,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false});
    this.wingRoot.add(new THREE.Mesh(g,this.wingMaterial));
    for(const eta of [-.8,-.55,-.3,0,.3,.55,.8]) {
      const c=this.chord*Math.sqrt(1-eta*eta);this.wingRoot.add(line(profileOutline(c,eta*this.half,32),'wingEdge',.26));
    }
    const le=[],te=[];
    for(let i=0;i<=80;i++){const a=Math.PI*(i/80-.5),x=this.half*Math.sin(a),c=this.chord*Math.cos(a);le.push(V3(x,0,-c*.25));te.push(V3(x,0,c*.75));}
    this.wingRoot.add(line(le,'wingEdge',.72),line(te,'wingEdge',.55));
  }

  _buildCut() {
    const c=this.sectionChord;
    const border=[V3(0,-.36*c,-.48*c),V3(0,.36*c,-.48*c),V3(0,.36*c,.99*c),V3(0,-.36*c,.99*c),V3(0,-.36*c,-.48*c)];
    this.cutBorder=line(border,CYAN,.7);this.cutRoot.add(this.cutBorder);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(c*1.47,c*.72),themeMaterial(new THREE.MeshBasicMaterial({transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false,blending:THREE.NormalBlending}),CYAN,'membrane'));
    plane.rotation.y=Math.PI/2;plane.position.z=.255*c;this.cutRoot.add(plane);
    this.cutOutline=line(profileOutline(c,0,72),'accentStrong',.95);this.cutRoot.add(this.cutOutline);
    // Four small registration marks make the selected geometric plane tangible.
    for(const yy of [-1,1])for(const zz of [-.48,.99]){
      this.cutRoot.add(line([V3(0,yy*.36*c,zz*c),V3(0,yy*.29*c,zz*c)],'accentStrong',.95));
    }
    this.scanLine=line([V3(-.003,-.35*c,0),V3(-.003,.35*c,0)],CYAN,.8);this.cutRoot.add(this.scanLine);
  }

  _buildSection() {
    const c=this.sectionChord,outline=profileOutline(c,0,80);outline.pop();
    const twoD=outline.map(p=>new THREE.Vector2(p.z,p.y));
    const caps=THREE.ShapeUtils.triangulateShape(twoD,[]),positions=[],indices=[],n=outline.length,depth=.045*c;
    for(const x of [-depth/2,depth/2])for(const p of outline)positions.push(x,p.y,p.z);
    for(const tri of caps){indices.push(tri[0],tri[2],tri[1],n+tri[0],n+tri[1],n+tri[2]);}
    for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+i,n+i,j,n+j);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    this.sliceMaterial=themeMaterial(new THREE.MeshPhysicalMaterial({transparent:true,opacity:.84,metalness:.16,roughness:.3,clearcoat:.6,side:THREE.DoubleSide,depthWrite:false}),'accentSoft');
    this.sectionRoot.add(new THREE.Mesh(g,this.sliceMaterial));
    this.sectionRoot.add(line(profileOutline(c,-depth/2-.002,80),CYAN,1),line(profileOutline(c,depth/2+.002,80),'accentStrong',.52));
    this.sectionRoot.add(line([V3(-depth/2-.003,0,-.25*c),V3(-depth/2-.003,0,.75*c)],'wingEdge',.45,true));
    for(const q of [.08,.25,.65,.88]) {
      const y=thickness(q)*c,z=(q-.25)*c;
      this.sectionRoot.add(line([V3(-depth/2,y,z),V3(depth/2,y,z)],'accentStrong',.55));
    }
    this.pivot=new THREE.Mesh(new THREE.SphereGeometry(.026*c,12,8),themeMaterial(new THREE.MeshBasicMaterial(),GOLD));
    this.pivot.position.set(-depth/2-.008,0,0);this.sectionRoot.add(this.pivot);
    // Faint spanwise rays express the infinite-span mathematical reference.
    // They disappear continuously as the finite-wing effect is introduced.
    for(const q of [0,.25,1]) {
      const z=(q-.25)*c;
      this.ghostRoot.add(line([V3(-c*2.6,0,z),V3(c*2.6,0,z)],'muted',.16,true));
    }
    for(const x of [-1.3,1.3])this.ghostRoot.add(line(profileOutline(c,x*c,48),'muted',.18));
  }

  _buildFlow() {
    this._flowLines=[];
    const points=92;
    for(let i=0;i<12;i++) {
      const side=i<6?-1:1,level=(i%6),positions=new Float32Array(points*3),along=new Float32Array(points),phase=new Float32Array(points);
      for(let j=0;j<points;j++){along[j]=j/(points-1);phase[j]=i*.083;}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('along',new THREE.BufferAttribute(along,1));g.setAttribute('phase',new THREE.BufferAttribute(phase,1));
      const m=filamentMaterial(side<0?'flowA':'flowB',.5,this._timeUniform,this._speedUniform);
      const object=new THREE.Line(g,m);object.frustumCulled=false;this.fieldRoot.add(object);
      this._flowLines.push({object,side,level,positions,points});
    }
  }

  _buildWake() {
    this._wakeLines=[];const steps=100;
    for(const side of [-1,1])for(let lane=0;lane<7;lane++) {
      const positions=new Float32Array(steps*3),along=new Float32Array(steps),phase=new Float32Array(steps);
      for(let j=0;j<steps;j++) {
        const t=j/(steps-1),a=side*(t*7+lane*.8),radius=.08+lane*.055;
        positions[j*3]=side*this.half*.9+Math.cos(a)*radius;
        positions[j*3+1]=Math.sin(a)*radius-t*.65;
        positions[j*3+2]=.4+t*this.span*1.1;along[j]=t;phase[j]=lane*.13;
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('along',new THREE.BufferAttribute(along,1));g.setAttribute('phase',new THREE.BufferAttribute(phase,1));
      const m=filamentMaterial(side<0?'flowA':'flowB',.46,this._timeUniform,this._speedUniform);
      const object=new THREE.Line(g,m);object.frustumCulled=false;this.wakeRoot.add(object);this._wakeLines.push(object);
    }
  }

  _makeVectors() {
    this.arrows={vinf:arrow('velocity'),w:arrow('downwash'),vloc:arrow('local'),r:arrow(GOLD),l:arrow(MINT),di:arrow(AMBER)};
    for(const a of Object.values(this.arrows))this.vectorRoot.add(a);
    this.forceGuide=line([V3(),V3(),V3(),V3()], 'muted',.5,true);this.vectorRoot.add(this.forceGuide);
    this.incidenceGuide=line([V3(),V3()], 'muted',.35,true);this.vectorRoot.add(this.incidenceGuide);
    this._arcGeometry=new THREE.BufferGeometry();this._arcGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(42*3),3).setUsage(THREE.DynamicDrawUsage));
    this.inducedArc=new THREE.Line(this._arcGeometry,themeMaterial(new THREE.LineBasicMaterial({transparent:true,opacity:.65,depthWrite:false}),GOLD));this.vectorRoot.add(this.inducedArc);
  }

  _makeTether() {
    this.tether=line([V3(),V3(),V3()], 'accent',.38,true);this.scene.add(this.tether);
    this.tetherDot=new THREE.Mesh(new THREE.SphereGeometry(.046,10,6),themeMaterial(new THREE.MeshBasicMaterial({transparent:true,opacity:.8}),CYAN));this.scene.add(this.tetherDot);
  }

  _updateVisuals() {
    const st=this.state,e=clamp(st.extraction,0,1),detach=smooth(e),blend=clamp(st.blend,0,1);
    const mag=1+smooth(clamp((e-.12)/.88,0,1));
    const angleGain=lerp(1,st.gain||1,smooth(clamp((e-.28)/.62,0,1)));
    const alpha=rad(st.alpha),alphaVisual=alpha*angleGain;
    const ai=st.physics?.alphaI ?? Math.atan(blend*(2*Math.PI*alpha/(1+2*blend/st.ar))/(Math.PI*st.ar));
    const beta=ai*angleGain;
    this._display={e,detach,blend,mag,alphaVisual,beta,unit:this.sectionChord*mag};
    this.wingRoot.rotation.x=alpha;
    this.wingMaterial.opacity=lerp(.94,.22,detach);
    this.wingMaterial.color.set(detach>.3?getPalette().wingEdge:getPalette().wing);
    this.cutRoot.position.set(this.cutX,0,0);this.cutRoot.rotation.x=alpha;
    this.cutBorder.material.opacity=lerp(.72,.22,detach);this.cutOutline.material.opacity=lerp(.96,.3,detach);
    const start=V3(this.cutX,0,0),end=V3(-this.half-2.35,1.15,1.25);
    this.sectionRoot.position.lerpVectors(start,end,detach);this.sectionRoot.position.y+=Math.sin(Math.PI*detach)*.35;
    this.sectionRoot.scale.setScalar(mag);this.sectionRoot.rotation.x=alphaVisual;
    this.sectionRoot.visible=true;
    this.ghostRoot.position.copy(this.sectionRoot.position);this.ghostRoot.rotation.x=alphaVisual;this.ghostRoot.scale.setScalar(mag);
    this.ghostRoot.visible=e>.3&&blend<.995;
    setOpacity(this.ghostRoot,.15*smooth(clamp((e-.3)/.5,0,1))*(1-blend));
    this.fieldRoot.position.copy(this.sectionRoot.position);this.fieldRoot.visible=e>.12;
    this.vectorRoot.position.copy(this.sectionRoot.position);
    this.wakeRoot.visible=blend>.002&&st.alpha>.001;
    for(const l of this._wakeLines)l.material.uniforms.uOpacity.value=.48*blend*clamp(st.alpha/6,0,1.4)*(1-.3*detach);
    this._speedUniform.value=.16*st.speed/50;
    // Only the extracted copy is magnified: the cut outline keeps the exact
    // local wing section, and the tether records its original station.
    const tetherPositions=this.tether.geometry.attributes.position.array;
    const middle=start.clone().lerp(this.sectionRoot.position,.52);middle.y+=.18;
    [start,middle,this.sectionRoot.position].forEach((v,i)=>{tetherPositions[i*3]=v.x;tetherPositions[i*3+1]=v.y;tetherPositions[i*3+2]=v.z;});
    this.tether.geometry.attributes.position.needsUpdate=true;this.tether.computeLineDistances();this.tether.visible=e>.015;
    this.tether.material.opacity=.30*(1-.35*detach);this.tetherDot.position.copy(start);this.tetherDot.visible=e>.015;
    this._updateFlow();this._updateVectors();this._visualDirty=false;
  }

  _updateFlow() {
    const {unit,beta,e}=this._display;
    for(const f of this._flowLines) {
      const base=f.side*(.29+f.level*.22)*unit;
      for(let j=0;j<f.points;j++) {
        const t=j/(f.points-1),z=(-1.65+3.65*t)*unit;
        const local=1/(1+Math.exp(-5*(z/unit+.55)));
        const y=base-z*Math.tan(beta)*local+f.side*.09*unit*Math.exp(-(((z/unit-.17)/.55)**2));
        f.positions[j*3]=-.055*unit;f.positions[j*3+1]=y;f.positions[j*3+2]=z;
      }
      f.object.geometry.attributes.position.needsUpdate=true;
      f.object.material.uniforms.uOpacity.value=(f.level<3?.50:.22)*smooth(clamp((e-.12)/.6,0,1));
    }
  }

  _updateVectors() {
    const st=this.state,{unit,beta,e}=this._display;
    const vr=clamp(st.vectorReveal,0,1)*smooth(clamp((e-.28)/.55,0,1));
    const fr=clamp(st.forceReveal,0,1)*smooth(clamp((e-.28)/.55,0,1));
    const decomp=clamp(st.decomposition,0,1);
    const x=-.10*unit;
    const vbase=V3(x,-.22*unit,-1.12*unit),vtip=vbase.clone().add(V3(0,0,1.02*unit));
    const localTip=vtip.clone().add(V3(0,-1.02*unit*Math.tan(beta),0));
    placeArrow(this.arrows.vinf,vbase,vtip,vr,.72);
    placeArrow(this.arrows.w,vtip,localTip,vr,.95);
    placeArrow(this.arrows.vloc,vbase,localTip,vr,1);
    this.arrows.w.visible&&=beta>1e-5;
    const p=st.physics||{};
    const reference=p.sectionLift2d ?? p.cl2d ?? (2*Math.PI*rad(st.alpha));
    const current=p.sectionResultant ?? (p.cl!==undefined?Math.hypot(p.cl,p.cl*Math.tan(aiSafe(p,beta,this.state.gain))):reference/(1+2*clamp(st.blend,0,1)/st.ar));
    const ratio=reference>1e-8?clamp(current/reference,0,1.3):0;
    const rLength=.95*unit*ratio;
    const origin=V3(x,0,0),rTip=origin.clone().add(V3(0,rLength*Math.cos(beta),rLength*Math.sin(beta)));
    const lTip=origin.clone().add(V3(0,rLength*Math.cos(beta),0));
    const dTip=origin.clone().add(V3(0,0,rLength*Math.sin(beta)));
    placeArrow(this.arrows.r,origin,rTip,fr,1);
    placeArrow(this.arrows.l,origin,lTip,fr*decomp,.76);
    placeArrow(this.arrows.di,origin,dTip,fr*decomp,1);
    this.arrows.di.visible&&=beta>1e-5;
    this._setLinePoints(this.forceGuide,[lTip,rTip,dTip,rTip]);
    this.forceGuide.visible=fr>.01&&decomp>.01&&beta>1e-5;this.forceGuide.material.opacity=.5*fr*decomp;
    this._setLinePoints(this.incidenceGuide,[V3(x,0,-.4*unit),V3(x,0,1.03*unit)]);
    this.incidenceGuide.visible=fr>.01;this.incidenceGuide.material.opacity=.26*fr;
    const arc=this._arcGeometry.attributes.position.array;
    for(let i=0;i<42;i++){const a=beta*i/41;arc[i*3]=x;arc[i*3+1]=Math.cos(a)*unit*.27;arc[i*3+2]=Math.sin(a)*unit*.27;}
    this._arcGeometry.attributes.position.needsUpdate=true;this.inducedArc.visible=fr>.01&&beta>.002;this.inducedArc.material.opacity=.65*fr;
    this._labelAnchors=[];
    const label=(id,text,kind,point,visible=true)=>{if(visible)this._labelAnchors.push({id,text,kind,point});};
    label('section-vinf',beta>.002?'V∞':'V∞ = Vloc','velocity',vbase.clone().lerp(vtip,.48).add(V3(0,.11*unit,0)),vr>.45);
    label('section-w','w','downwash',vtip.clone().lerp(localTip,.5).add(V3(0,0,.12*unit)),vr>.5&&beta>.002);
    label('section-vloc','Vloc','local',vbase.clone().lerp(localTip,.50).add(V3(0,-.12*unit,0)),vr>.45&&beta>.002);
    label('section-r','R′','resultant',rTip.clone().add(V3(0,.11*unit,.08*unit)),fr>.4);
    label('section-l','L′','lift',lTip.clone().add(V3(0,.06*unit,-.15*unit)),fr*decomp>.45);
    label('section-di','Dᵢ′','drag',dTip.clone().add(V3(0,-.13*unit,.13*unit)),fr*decomp>.45&&beta>.002);
    label('section-profile','Profilo estratto','cyan',V3(x,-.13*unit,.38*unit),e>.8&&fr<.3);
  }

  _setLinePoints(object,points) {
    const a=object.geometry.attributes.position.array;
    points.forEach((p,i)=>{a[i*3]=p.x;a[i*3+1]=p.y;a[i*3+2]=p.z;});
    object.geometry.attributes.position.needsUpdate=true;if(object.material.isLineDashedMaterial)object.computeLineDistances();
  }

  _applyTheme(p=getPalette()) {
    this.scene.background.set(p.sceneBackground);this.scene.fog.color.set(p.sceneBackground);
    this.renderer.setClearColor(p.sceneBackground,1);
    const appearance=applyStudioAppearance(this.scene,this.renderer,this._studio,p);
    this.scene.traverse(object=>{
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]) {
        const role=material.userData.themeRole;
        if(role)(material.uniforms?.uColor?.value||material.color)?.set(p[role]);
        if(material.uniforms?.uThemeOpacity)material.uniforms.uThemeOpacity.value=appearance.filament;
        const opacityRole=material.userData.themeOpacityRole;
        if(opacityRole)material.opacity=material.userData.themeBaseOpacity*appearance[opacityRole];
      }
    });
    if(this.sliceMaterial)this.sliceMaterial.color.lerp(new THREE.Color(p.wing),appearance.sliceLift);
    this._visualDirty=true;
  }

  _cameraGoal() {
    const d=this._display||{detach:0,unit:this.sectionChord};
    const factor=this._view==='wing'?0:this._view==='section'?1:smooth(clamp((d.detach-.05)/.85,0,1));
    const spanScale=Math.max(.85,this.span/11.3137);
    const startPos=V3(-10*spanScale,7.5*spanScale,-12.5*spanScale),startTarget=V3(-.5*spanScale,.1,3*spanScale);
    const center=this.sectionRoot.position;
    const unit=Math.max(2.4,d.unit),distance=Math.max(6.0,unit*2.50);
    const endTarget=center.clone().add(V3(0,.24*unit,-.38*unit));
    const endPos=endTarget.clone().add(V3(-distance,distance*.12,-distance*.045));
    this._targetPosition.lerpVectors(startPos,endPos,factor);this._targetLook.lerpVectors(startTarget,endTarget,factor);
    const aspect=(this.container.clientWidth||800)/(this.container.clientHeight||540),fit=Math.max(1,1.45/aspect);
    this._targetPosition.sub(this._targetLook).multiplyScalar(fit).add(this._targetLook);
  }

  setState(next) {
    const before=this.state;this.state={...before,...next};
    if(before.ar!==this.state.ar||before.spanPosition!==this.state.spanPosition||before.physics?.span!==this.state.physics?.span||before.physics?.sectionChord!==this.state.physics?.sectionChord)this._shapeDirty=true;
    this._visualDirty=true;
  }

  setActive(active) {
    if(!active)this.endHandControl();
    this._active=!!active;this.controls.enabled=this._active;
    if(this._active&&!this._raf&&!this._disposed){this._last=performance.now();this._raf=requestAnimationFrame(this._animate);}
    if(!this._active&&this._raf){cancelAnimationFrame(this._raf);this._raf=null;}
  }

  setView(view='cinematic') {
    this.endHandControl();
    this._view=['cinematic','section','wing'].includes(view)?view:'cinematic';this._manualCamera=false;
  }

  resetCamera(){this.setView('cinematic');}

  beginHandControl(){
    if(this._disposed||!this._active||this._dragging)return false;
    this._manualCamera=true;
    return this._handOrbit.begin();
  }
  updateHandControl(offset){return this._handOrbit.update(offset);}
  endHandControl(){
    const ended=this._handOrbit.end();
    if(ended)this._manualCamera=true;
    return ended;
  }

  resize() {
    if(this._disposed)return;
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);
  }

  projectLabels() {
    if(this._disposed||!this._active)return[];
    const w=this.container.clientWidth,h=this.container.clientHeight;
    const labels=this._labelAnchors.map(a=>({...a,world:a.point.clone().add(this.sectionRoot.position)}));
    if(this.state.extraction<.45)labels.push({id:'section-cut',text:'Sezione selezionata',kind:'cyan',world:V3(this.cutX,.42*this.sectionChord,.2*this.sectionChord)});
    return labels.map(a=>{const p=a.world.project(this.camera);return{id:a.id,text:a.text,kind:a.kind,x:(p.x*.5+.5)*w,y:(.5-p.y*.5)*h,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.94&&Math.abs(p.y)<.91};});
  }

  get stats(){return{fps:Math.round(this._fps),particles:0};}

  _animate(now) {
    this._raf=null;if(this._disposed||!this._active)return;
    const dt=Math.min(.05,Math.max(.001,(now-this._last)/1000));this._last=now;this._fps=lerp(this._fps,1/dt,.025);
    if(!document.hidden) {
      if(this._shapeDirty)this._buildGeometry();
      if(this._visualDirty)this._updateVisuals();
      if(!this.state.paused){this._clock+=dt*(this.state.playback||1);this._timeUniform.value=this._clock;}
      this.scanLine.position.z=this.sectionChord*(-.46+1.42*((this._clock*.22)%1));
      const handControlled=this._handOrbit.step(dt);
      if(!handControlled&&!this._manualCamera){this._cameraGoal();const easing=1-Math.exp(-dt*5);this.camera.position.lerp(this._targetPosition,easing);this.controls.target.lerp(this._targetLook,easing);}
      if(!handControlled)this.controls.update();this.renderer.render(this.scene,this.camera);
    }
    this._raf=requestAnimationFrame(this._animate);
  }

  destroy() {
    this._disposed=true;this._unsubscribeTheme?.();if(this._raf)cancelAnimationFrame(this._raf);this._resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost',this._contextLost);this.controls.dispose();clear(this.scene);
    this._environment?.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  }
}

function aiSafe(physics,beta,gain){return physics.alphaI??beta/(gain||1);}
