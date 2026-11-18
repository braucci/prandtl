import * as THREE from 'three';
import { getPalette } from './theme.js';

/* Compatibility renderer for the same Three.js scene and cameras. It retains
   perspective geometry and animated tracer paths when WebGL is unavailable.
   It intentionally omits environment reflections and the translucent sheet
   membrane; the connected filament sheet remains visible. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const fract = x => x-Math.floor(x);
const toSRGB = v => Math.round(clamp(v<=.0031308?12.92*v:1.055*Math.pow(Math.max(0,v),1/2.4)-.055,0,1)*255);
const rgb = (r,g,b) => `rgb(${toSRGB(r)},${toSRGB(g)},${toSRGB(b)})`;
const countBuckets = 96;

// Shared by the WebGL scenes and the compatibility renderer. The neutral
// reflection map is reused; changing the theme never rebuilds the scene.
const sceneAppearances = {
  light:{exposure:1.05,environment:1,hemi:1.8,key:3,rim:1.5,warm:.7,grid:1,filament:1,particle:1,membrane:1,studioWash:.56,ambient:.25,diffuse:.72,fill:.11,specular:.32,pointHalo:.08,sliceLift:0},
  dark:{exposure:.95,environment:.48,hemi:1.12,key:2.2,rim:1.1,warm:.38,grid:1,filament:.95,particle:.9,membrane:.8,studioWash:.55,ambient:.25,diffuse:.66,fill:.08,specular:.16,pointHalo:.045,sliceLift:.5},
  night:{exposure:.8,environment:.3,hemi:.92,key:1.65,rim:.75,warm:.22,grid:.95,filament:.9,particle:.8,membrane:.65,studioWash:.45,ambient:.2,diffuse:.6,fill:.07,specular:.085,pointHalo:.025,sliceLift:.46}
};
export function getSceneAppearance(p=getPalette()) {
  return sceneAppearances[p.id==='night'?'night':p.scheme==='dark'?'dark':'light'];
}
export function applyStudioAppearance(scene,renderer,studio,p=getPalette()) {
  const a=getSceneAppearance(p),dark=p.scheme==='dark';
  renderer.toneMappingExposure=a.exposure;scene.environmentIntensity=a.environment;
  if(!studio)return a;
  const {hemi,key,rim,warm,grid,gridOpacity}=studio;
  hemi.color.set(dark?p.ink:'#ffffff');hemi.groundColor.set(dark?p.paper:'#c3cbc0');hemi.intensity=a.hemi;
  key.color.set(dark?p.ink:'#ffffff');key.intensity=a.key;
  rim.color.set(dark?p.wingEdge:'#e0e9e2');rim.intensity=a.rim;
  warm.color.set(dark?p.accent:'#fff1dd');warm.intensity=a.warm;
  grid.material.opacity=gridOpacity*a.grid;grid.material.toneMapped=false;
  const positions=grid.geometry.attributes.position,colors=grid.geometry.attributes.color;
  const center=new THREE.Color(p.grid),minor=new THREE.Color(p.line);
  for(let i=0;i<colors.count;i++) {
    const color=positions.getX(i)===0||positions.getZ(i)===0?center:minor;
    colors.setXYZ(i,color.r,color.g,color.b);
  }
  colors.needsUpdate=true;
  return a;
}

export class CanvasRendererFallback {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.context = this.domElement.getContext('2d', {alpha:false, desynchronized:true});
    if(!this.context) throw new Error('Grafica Canvas 2D non disponibile.');
    this.isFallback = true;
    this.shadowMap = {enabled:false,type:null};
    this.outputColorSpace = THREE.SRGBColorSpace;
    this._pixelRatio = 1;
    this._width = 1; this._height = 1;
    this._clearColor = getPalette().sceneBackground;
    this._appearance = getSceneAppearance();
    this._cache = new WeakMap();
    this._projection = new THREE.Matrix4();
    this._modelView = new THREE.Matrix4();
    this._normal = new THREE.Matrix3();
    this._cameraWorld = new THREE.Vector3();
    this._light = new THREE.Vector3(-.40,.84,-.33).normalize();
    this._buckets = Array.from({length:countBuckets},()=>({tri:[],lines:new Map(),points:[]}));
    this._lastRender=0;
  }
  setPixelRatio(value) {this._pixelRatio=Math.min(1.5,Math.max(.5,value||1));}
  getPixelRatio() {return this._pixelRatio;}
  setSize(width,height,updateStyle=true) {
    this._width=Math.max(1,width);this._height=Math.max(1,height);
    this.domElement.width=Math.round(this._width*this._pixelRatio);
    this.domElement.height=Math.round(this._height*this._pixelRatio);
    if(updateStyle){this.domElement.style.width=`${width}px`;this.domElement.style.height=`${height}px`;}
  }
  setClearColor(color) {this._clearColor=new THREE.Color(color).getStyle();}
  dispose() {this._disposed=true;this._cache=new WeakMap();}

  _bucket(depth) {return this._buckets[clamp(Math.floor(depth*.95),0,countBuckets-1)];}
  _geometry(object,camera) {
    const geometry=object.geometry, position=geometry.attributes.position;
    if(!position)return null;
    let cache=this._cache.get(geometry);
    if(!cache||cache.projected.length!==position.count*4) {
      cache={projected:new Float32Array(position.count*4),faces:null};
      this._cache.set(geometry,cache);
    }
    this._modelView.multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld);
    this._projection.multiplyMatrices(camera.projectionMatrix,this._modelView);
    const m=this._projection.elements,v=this._modelView.elements,a=position.array,p=cache.projected;
    const stride=position.itemSize;
    for(let i=0,j=0;i<position.count;i++,j+=4) {
      const k=i*stride,x=a[k],y=a[k+1],z=a[k+2];
      const w=m[3]*x+m[7]*y+m[11]*z+m[15];
      const ndcZ=(m[2]*x+m[6]*y+m[10]*z+m[14])/w;
      p[j]=((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*this._width;
      p[j+1]=(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*this._height;
      p[j+2]=-(v[2]*x+v[6]*y+v[10]*z+v[14]);
      p[j+3]=w>0&&ndcZ>-1&&ndcZ<1?1:0;
    }
    return cache;
  }
  _line(bucket,a,b,color,alpha,width,additive,dashed=false) {
    if(alpha<.009)return;
    const level=Math.max(1,Math.round(alpha*12));
    const key=color+'|'+level+'|'+width+'|'+Number(additive)+'|'+Number(dashed);
    let group=bucket.lines.get(key);
    if(!group){group={color,alpha:Math.min(1,level/12),width,additive,dashed,xy:[]};bucket.lines.set(key,group);}
    group.xy.push(a[0],a[1],b[0],b[1]);
  }
  _lines(object,cache) {
    const g=object.geometry,m=Array.isArray(object.material)?object.material[0]:object.material,p=cache.projected;
    if(!m||m.visible===false)return;
    const shader=m.uniforms?.uColor;
    const grid=object.type==='GridHelper';
    const color=grid?getPalette().grid:(shader?.value||m.color||new THREE.Color(getPalette().wingEdge)).getStyle();
    const opacity=(shader?m.uniforms.uOpacity.value:(m.opacity??1))*(m.uniforms?.uThemeOpacity?.value??1);
    const time=m.uniforms?.uTime?.value||0,speed=m.uniforms?.uSpeed?.value||0;
    const along=g.attributes.along?.array,phase=g.attributes.phase?.array;
    const step=object.isLineSegments?2:1;
    const n=g.attributes.position.count;
    for(let i=0;i<n-1;i+=step) {
      const j=i+1,a=i*4,b=j*4;
      if(!p[a+3]||!p[b+3])continue;
      if((p[a]<-30&&p[b]<-30)||(p[a]>this._width+30&&p[b]>this._width+30)||(p[a+1]<-30&&p[b+1]<-30)||(p[a+1]>this._height+30&&p[b+1]>this._height+30))continue;
      let alpha=opacity,width=n===2?1.7:.8;
      if(shader&&along) {
        const u=(along[i]+along[j])*.5;
        const q=fract(u*2.5-time*speed*2.5+(phase?.[i]||0));
        const pulse=Math.pow(Math.max(0,1-Math.abs(q-.5)*2),13);
        const edge=smooth(0,.018,u)*(1-smooth(.80,1,u));
        alpha*= (.36+.64*pulse)*edge;
        width=pulse>.45?1.15:.7;
      }
      if(grid){alpha*=.45;width=.45;}
      this._line(this._bucket((p[a+2]+p[b+2])*.5),[p[a],p[a+1]],[p[b],p[b+1]],color,alpha,width,!grid&&m.blending===THREE.AdditiveBlending,m.isLineDashedMaterial);
    }
  }
  _mesh(object,cache,camera) {
    const g=object.geometry,m=Array.isArray(object.material)?object.material[0]:object.material;
    if(!m||m.visible===false||m.opacity<.075)return;
    // The huge studio plane is represented by the background and grid.
    if(g.type==='PlaneGeometry'&&g.parameters?.width>50)return;
    if(g.type==='TubeGeometry') {this._tube(object,camera);return;}
    const p=cache.projected,position=g.attributes.position,normal=g.attributes.normal,color=g.attributes.color;
    const indices=g.index?.array;
    if(!cache.faces) {
      const faces=[];
      // A continuous coarser surface for the regular closed wing grid. No
      // arbitrary triangle skipping: adjacent cells still share their edges.
      const cols=indices?.[2],rows=cols?position.count/cols:0;
      const regular=m.isMeshPhysicalMaterial&&cols>8&&Number.isInteger(rows)&&indices.length===(rows-1)*cols*6&&indices[0]===0&&indices[1]===1;
      if(regular) {
        const stepR=2,stepC=2;
        for(let r=0;r<rows-1;r+=stepR)for(let c=0;c<cols;c+=stepC) {
          const rr=Math.min(rows-1,r+stepR),cc=(c+stepC)%cols;
          const a=r*cols+c,b=rr*cols+c,c1=r*cols+cc,d=rr*cols+cc;
          faces.push(a,c1,b,b,c1,d);
        }
      } else if(indices)for(let i=0;i<indices.length;i++)faces.push(indices[i]);
      else for(let i=0;i<position.count;i++)faces.push(i);
      cache.faces=faces;
    }
    this._normal.getNormalMatrix(object.matrixWorld);
    const nm=this._normal.elements,base=m.color||new THREE.Color(getPalette().wing),light=this._light,appearance=this._appearance;
    const normals=normal?.array,col=color?.array,pa=position.array;
    const view=this._cameraWorld.clone().sub(object.getWorldPosition(new THREE.Vector3())).normalize();
    const half=light.clone().add(view).normalize();
    for(let i=0;i<cache.faces.length;i+=3) {
      const ia=cache.faces[i],ib=cache.faces[i+1],ic=cache.faces[i+2],a=ia*4,b=ib*4,c=ic*4;
      if(!p[a+3]||!p[b+3]||!p[c+3])continue;
      const xmin=Math.min(p[a],p[b],p[c]),xmax=Math.max(p[a],p[b],p[c]);
      const ymin=Math.min(p[a+1],p[b+1],p[c+1]),ymax=Math.max(p[a+1],p[b+1],p[c+1]);
      if(xmax<0||xmin>this._width||ymax<0||ymin>this._height)continue;
      const area=(p[b]-p[a])*(p[c+1]-p[a+1])-(p[b+1]-p[a+1])*(p[c]-p[a]);
      if(Math.abs(area)<.015)continue;
      let red=base.r,green=base.g,blue=base.b;
      if(m.vertexColors&&col){red*=(col[ia*3]+col[ib*3]+col[ic*3])/3;green*=(col[ia*3+1]+col[ib*3+1]+col[ic*3+1])/3;blue*=(col[ia*3+2]+col[ib*3+2]+col[ic*3+2])/3;}
      if(!m.isMeshBasicMaterial&&normals) {
        let nx=(normals[ia*3]+normals[ib*3]+normals[ic*3])/3,ny=(normals[ia*3+1]+normals[ib*3+1]+normals[ic*3+1])/3,nz=(normals[ia*3+2]+normals[ib*3+2]+normals[ic*3+2])/3;
        const xx=nm[0]*nx+nm[3]*ny+nm[6]*nz,yy=nm[1]*nx+nm[4]*ny+nm[7]*nz,zz=nm[2]*nx+nm[5]*ny+nm[8]*nz;
        const length=Math.hypot(xx,yy,zz)||1;nx=xx/length;ny=yy/length;nz=zz/length;
        if(nx*view.x+ny*view.y+nz*view.z<0){nx=-nx;ny=-ny;nz=-nz;}
        const diffuse=appearance.ambient+appearance.diffuse*Math.max(0,nx*light.x+ny*light.y+nz*light.z)+appearance.fill*Math.max(0,nx*.7+ny*.3+nz*.6);
        const spec=appearance.specular*Math.pow(Math.max(0,nx*half.x+ny*half.y+nz*half.z),32);
        red=red*diffuse+spec;green=green*diffuse+spec;blue=blue*(diffuse+.035)+spec;
      }
      this._bucket((p[a+2]+p[b+2]+p[c+2])/3).tri.push({xy:[p[a],p[a+1],p[b],p[b+1],p[c],p[c+1]],depth:(p[a+2]+p[b+2]+p[c+2])/3,color:rgb(red,green,blue),alpha:m.opacity??1,additive:m.blending===THREE.AdditiveBlending});
    }
  }
  _tube(object,camera) {
    const g=object.geometry,m=object.material;
    const points=g.parameters.path.getPoints(64);
    const color=m.color.getStyle(),r=g.parameters.radius;
    let previous=null;
    for(const point of points) {
      point.applyMatrix4(object.matrixWorld);
      const depth=-point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      point.project(camera);
      const current=[(point.x*.5+.5)*this._width,(.5-point.y*.5)*this._height,depth];
      if(previous&&point.z>-1&&point.z<1) {
        const width=clamp(r*this._height/(Math.max(1,depth)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),.65,4);
        this._line(this._bucket(depth),previous,current,color,m.opacity,width,m.blending===THREE.AdditiveBlending);
      }
      previous=current;
    }
  }
  _points(object,cache) {
    const g=object.geometry,p=cache.projected,c=g.attributes.color?.array,a=g.attributes.alpha?.array,s=g.attributes.size?.array;
    const n=g.attributes.position.count,stride=Math.max(1,Math.floor(n/1150));
    for(let i=0;i<n;i+=stride) {
      const at=i*4,alpha=(a?.[i]??.5)*(object.material.uniforms?.uThemeOpacity?.value??1);
      if(alpha<.045||!p[at+3]||p[at]<0||p[at]>this._width||p[at+1]<0||p[at+1]>this._height)continue;
      const size=clamp((s?.[i]||.6)*175/Math.max(4,p[at+2]),1,8)*.5;
      const color=c?rgb(c[i*3],c[i*3+1],c[i*3+2]):getPalette().velocity;
      this._bucket(p[at+2]).points.push({x:p[at],y:p[at+1],r:size,color,alpha,additive:object.material.blending===THREE.AdditiveBlending});
    }
  }
  render(scene,camera) {
    if(this._disposed)return;
    const now=performance.now();
    // Keep CPU usage predictable on school laptops and retain interactive orbit.
    if(now-this._lastRender<30)return;
    this._lastRender=now;
    const ctx=this.context,w=this._width,h=this._height,palette=getPalette();
    this._appearance=getSceneAppearance(palette);
    ctx.setTransform(this._pixelRatio,0,0,this._pixelRatio,0,0);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.setLineDash([]);
    ctx.fillStyle=scene.background?.isColor?scene.background.getStyle():this._clearColor;
    ctx.fillRect(0,0,w,h);
    const studio=ctx.createRadialGradient(w*.50,h*.38,0,w*.5,h*.45,w*.6);
    studio.addColorStop(0,palette.surface);studio.addColorStop(1,palette.surface+'00');
    ctx.globalAlpha=this._appearance.studioWash;ctx.fillStyle=studio;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
    scene.updateMatrixWorld();camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this._cameraWorld.setFromMatrixPosition(camera.matrixWorld);
    for(const bucket of this._buckets){bucket.tri.length=0;bucket.lines.clear();bucket.points.length=0;}
    scene.traverseVisible(object=>{
      if(!object.geometry)return;
      if(object.isMesh&&object.geometry.type==='PlaneGeometry'&&object.geometry.parameters?.width>50)return;
      const cache=this._geometry(object,camera);if(!cache)return;
      if(object.isPoints)this._points(object,cache);
      else if(object.isLine)this._lines(object,cache);
      else if(object.isMesh)this._mesh(object,cache,camera);
    });
    for(let b=countBuckets-1;b>=0;b--) {
      const bucket=this._buckets[b];
      bucket.tri.sort((a,b)=>b.depth-a.depth);
      ctx.setLineDash([]);
      for(const triangle of bucket.tri) {
        ctx.globalCompositeOperation=triangle.additive?'lighter':'source-over';ctx.globalAlpha=triangle.alpha;
        ctx.fillStyle=triangle.color;ctx.strokeStyle=triangle.color;ctx.lineWidth=.45;
        const p=triangle.xy;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[2],p[3]);ctx.lineTo(p[4],p[5]);ctx.closePath();ctx.fill();
        // Matching hairline removes subpixel seams between adjacent triangles.
        if(triangle.alpha>.95)ctx.stroke();
      }
      for(const line of bucket.lines.values()) {
        ctx.globalCompositeOperation=line.additive?'lighter':'source-over';ctx.globalAlpha=line.alpha;
        ctx.strokeStyle=line.color;ctx.lineWidth=line.width;ctx.setLineDash(line.dashed?[3,3]:[]);
        ctx.beginPath();const points=line.xy;
        for(let i=0;i<points.length;i+=4){ctx.moveTo(points[i],points[i+1]);ctx.lineTo(points[i+2],points[i+3]);}
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for(const point of bucket.points) {
        ctx.globalCompositeOperation=point.additive?'lighter':'source-over';
        ctx.fillStyle=point.color;ctx.globalAlpha=point.alpha*.72;
        ctx.beginPath();ctx.arc(point.x,point.y,point.r,0,Math.PI*2);ctx.fill();
        if(point.r>1.4){ctx.globalAlpha=point.alpha*this._appearance.pointHalo;ctx.beginPath();ctx.arc(point.x,point.y,point.r*2.5,0,Math.PI*2);ctx.fill();}
      }
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.setLineDash([]);
  }
}
