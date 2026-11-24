/* Sideways GP: the open world.
   Terrain from world/height.(png|bin) drawn as a quadtree of patches (near patches small and detailed, far ones large),
   textured with real scanned materials (world/tex) mixed by height, slope and the region map (world/map.png); roads as
   ribbons with painted lines, streamed around the car; buildings as merged blocks with windows; free driving with the
   race physics (stepCar) on the ground and roads; a chase camera; a HUD with minimap; a full map with GPS routes.
   It uses the game through window.SGP (defined at the end of index.html) and is entered with SGPWorld.enter(). */
(function(){
'use strict';
const SGP = window.SGP; if(!SGP||!window.THREE) return;
const THREE = window.THREE, G = SGP.G, keys = SGP.keys, clamp = SGP.clamp, lerp = SGP.lerp, wrapPi = SGP.wrapPi;
const $ = s => document.querySelector(s);
const V3 = () => new THREE.Vector3();

const W = window.SGPWorld = { on:false, ready:false, loading:null, data:null, scene:null, cam:null, car:null, paused:false, mapOpen:false, t:0 };
let N=0, SIZE=0, CELL=0, HMIN=0, HS=1, H=null, MAP=null, mapTex=null;

/* ---------------- data ---------------- */
async function imgData(url){ const r=await fetch(url); if(!r.ok) throw new Error(url+': '+r.status); const b=await r.blob();
  const bmp=await createImageBitmap(b,{colorSpaceConversion:'none',premultiplyAlpha:'none'}); const c=document.createElement('canvas'); c.width=bmp.width; c.height=bmp.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(bmp,0,0); const d=g.getImageData(0,0,c.width,c.height); bmp.close&&bmp.close(); return d; }
async function pngData(url){ const r=await fetch(url); if(!r.ok) throw new Error(url+': '+r.status); const buf=new Uint8Array(await r.arrayBuffer());
  if(typeof DecompressionStream!=='function'){ const im=await imgData(url); return {width:im.width,height:im.height,channels:4,data:new Uint8Array(im.data.buffer)}; }
  let p=8, w=0, h=0, depth=8, type=6; const idat=[]; const u32=i=>((buf[i]<<24)|(buf[i+1]<<16)|(buf[i+2]<<8)|buf[i+3])>>>0;
  while(p<buf.length){ const len=u32(p), t=String.fromCharCode(buf[p+4],buf[p+5],buf[p+6],buf[p+7]), d=buf.subarray(p+8,p+8+len);
    if(t==='IHDR'){ w=u32(p+8); h=u32(p+12); depth=d[8]; type=d[9]; if(d[12]) throw new Error('interlaced PNG'); } else if(t==='IDAT') idat.push(d); else if(t==='IEND') break; p+=12+len; }
  const raw=new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const ch={0:1,2:3,4:2,6:4}[type], bpp=ch*depth/8, st=w*bpp, out=new Uint8Array(h*st);
  for(let y=0;y<h;y++){ const f=raw[y*(st+1)], s0=y*(st+1)+1, o=y*st, up=o-st;
    if(f===0) out.set(raw.subarray(s0,s0+st),o);
    else if(f===1){ for(let x=0;x<st;x++) out[o+x]=(raw[s0+x]+(x>=bpp?out[o+x-bpp]:0))&255; }
    else if(f===2){ for(let x=0;x<st;x++) out[o+x]=(raw[s0+x]+(y?out[up+x]:0))&255; }
    else if(f===3){ for(let x=0;x<st;x++) out[o+x]=(raw[s0+x]+(((x>=bpp?out[o+x-bpp]:0)+(y?out[up+x]:0))>>1))&255; }
    else { for(let x=0;x<st;x++){ const a=x>=bpp?out[o+x-bpp]:0, b=y?out[up+x]:0, c=(x>=bpp&&y)?out[up+x-bpp]:0, pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); out[o+x]=(raw[s0+x]+((pa<=pb&&pa<=pc)?a:(pb<=pc?b:c)))&255; } } }
  return {width:w,height:h,channels:ch,depth,data:out}; }
function heightAt(x,z){ const n=N-1; let fx=(x/SIZE+.5)*n, fz=(z/SIZE+.5)*n; if(fx<0) fx=0; else if(fx>n-1e-3) fx=n-1e-3; if(fz<0) fz=0; else if(fz>n-1e-3) fz=n-1e-3;
  const ix=fx|0, iz=fz|0, tx=fx-ix, tz=fz-iz, i=iz*N+ix; const a=H[i]+(H[i+1]-H[i])*tx, b=H[i+N]+(H[i+N+1]-H[i+N])*tx; return a+(b-a)*tz; }
function normalAt(x,z,out,e){ e=e||CELL; out=out||V3(); out.set(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize(); return out; }
function mapAt(x,z){ const n=N-1, ix=clamp(Math.round((x/SIZE+.5)*n),0,n), iz=clamp(Math.round((z/SIZE+.5)*n),0,n), i=(iz*N+ix)*4;
  return {road:MAP[i]/4, forest:MAP[i+1]/255, desert:MAP[i+2]/255, sakura:MAP[i+3]/255}; }

/* ---------------- shared textures ---------------- */
const TEXC = {};
const texLoader = new THREE.TextureLoader();
function tex(name){ if(TEXC[name]) return TEXC[name]; const o={}, ld=(f,srgb)=>{ const t=texLoader.load('world/tex/'+name+'_'+f+'.webp',undefined,undefined,()=>{}); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=SGP.renderer.capabilities.getMaxAnisotropy(); if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t; };
  o.map=ld('diff',true); o.normalMap=ld('nrm',false); if(['asphalt','track','stone','roof','redroof'].includes(name)) o.roughnessMap=ld('rough',false); return TEXC[name]=o; }
// terrain layers go into texture arrays so one shader can blend all of them
const LAYERS = ['grass','forest','rock','sand','desert','snow','gravel'];
async function layerArray(kind,size,onStep){ const data=new Uint8Array(size*size*4*LAYERS.length), c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d',{willReadFrequently:true});
  for(let l=0;l<LAYERS.length;l++){ const r=await fetch('world/tex/'+LAYERS[l]+'_'+kind+'.webp'); const bmp=await createImageBitmap(await r.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
    g.drawImage(bmp,0,0,size,size); data.set(g.getImageData(0,0,size,size).data,l*size*size*4); onStep&&onStep(); }
  const t=new THREE.DataArrayTexture(data,size,size,LAYERS.length); t.format=THREE.RGBAFormat; t.type=THREE.UnsignedByteType; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.generateMipmaps=true; t.anisotropy=Math.min(8,SGP.renderer.capabilities.getMaxAnisotropy());
  if(kind==='diff') t.colorSpace=THREE.SRGBColorSpace; t.needsUpdate=true; return t; }

/* ---------------- terrain ---------------- */
const NOISE_GLSL = `
float wHash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float wNoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(wHash(i),wHash(i+vec2(1,0)),u.x),mix(wHash(i+vec2(0,1)),wHash(i+vec2(1,1)),u.x),u.y); }
float wFbm(vec2 p){ return wNoise(p)*.5+wNoise(p*2.03)*.25+wNoise(p*4.01)*.125+wNoise(p*8.02)*.0625; }`;
function terrainMaterial(diffArr,nrmArr,q){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0}); m.envMapIntensity=.35;
  m.onBeforeCompile=sh=>{ Object.assign(sh.uniforms,{tDiff:{value:diffArr},tNrm:{value:nrmArr},tMap:{value:mapTex},uSize:{value:SIZE},uSnow:{value:W.snowLine},uHi:{value:q}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform highp sampler2DArray tDiff; uniform highp sampler2DArray tNrm; uniform sampler2D tMap; uniform float uSize; uniform float uSnow; uniform float uHi;
varying vec3 vWP; varying vec3 vWN;
${NOISE_GLSL}
vec4 tLayer(float l, vec2 uv){ return texture(tDiff, vec3(uv, l)); }
vec3 tNorm(float l, vec2 uv){ return texture(tNrm, vec3(uv, l)).xyz*2.0-1.0; }
float tW[7]; vec3 tAlb; vec3 tNrmSum; float tRough;
void terrainSurface(){
  vec4 mp=texture2D(tMap, vWP.xz/uSize+0.5);
  float n1=wFbm(vWP.xz*.013), n2=wNoise(vWP.xz*.11);
  float slope=1.0-clamp(vWN.y,0.0,1.0), roadD=mp.r*63.75;
  float wGrass=1.0;
  float wForest=smoothstep(.15,.6,mp.g+(n1-.5)*.35);
  float wDesert=smoothstep(.2,.7,mp.b+(n1-.5)*.3);
  float wSand=1.0-smoothstep(1.2,3.6,vWP.y+(n2-.5)*1.6);
  float wGravel=(1.0-smoothstep(.4,2.6,roadD+(n2-.5)*1.4))*(1.0-wSand);
  float wRock=smoothstep(.24,.42,slope+(n1-.5)*.16);
  float wSnow=smoothstep(uSnow-40.0,uSnow+40.0,vWP.y+(n1-.5)*90.0)*(1.0-smoothstep(.5,.72,slope));
  tW[0]=wGrass; tW[1]=wForest; tW[2]=wRock; tW[3]=wSand; tW[4]=wDesert; tW[5]=wSnow; tW[6]=wGravel;
  // the layers paint over each other: grass, forest floor, desert, sand, gravel, rock, snow
  float rem=1.0; float w[7]; float order[7]; order[0]=5.0; order[1]=2.0; order[2]=6.0; order[3]=3.0; order[4]=4.0; order[5]=1.0; order[6]=0.0;
  for(int i=0;i<7;i++) w[i]=0.0;
  for(int k=0;k<7;k++){ int li=int(order[k]); float a=clamp(tW[li],0.0,1.0)*rem; w[li]=a; rem-=a; }
  w[0]+=rem;
  vec2 uvA=vWP.xz/5.0, uvB=vWP.xz/31.0+vec2(.37,.11);
  // rock is projected from the side on steep ground so it does not stretch
  vec3 an=abs(vWN); vec2 uvR=(an.x>an.z? vWP.zy : vWP.xy)/7.0; float side=smoothstep(.35,.7,slope);
  tAlb=vec3(0.0); tNrmSum=vec3(0.0); tRough=0.0;
  float rough[7]; rough[0]=.95; rough[1]=.97; rough[2]=.82; rough[3]=.9; rough[4]=.93; rough[5]=.62; rough[6]=.9;
  for(int i=0;i<7;i++){ if(w[i]<.004) continue; float l=float(i);
    vec2 ua=i==2? mix(uvA,uvR,side) : uvA;
    vec3 c=mix(tLayer(l,ua).rgb, tLayer(l,uvB).rgb, uHi>0.5? .38 : 0.0);
    tAlb+=c*w[i]; tRough+=rough[i]*w[i];
    if(uHi>0.5) tNrmSum+=tNorm(l,ua)*w[i]; }
  tAlb*=.86+.28*n1;                                   // large-scale variation so tiles do not repeat
  if(roadD<.25) { tAlb=mix(tAlb, vec3(.075,.077,.082), .85); tRough=.85; }   // far roads painted into the ground
}`)
      .replace('#include <map_fragment>','terrainSurface();\n diffuseColor.rgb*=tAlb;')
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=tRough;')
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 if(uHi>0.5){ vec3 wn=normalize(vWN+vec3(tNrmSum.x,0.0,tNrmSum.y)*.85); normal=normalize((viewMatrix*vec4(wn,0.0)).xyz); }`); };
  m.customProgramCacheKey=()=>'terrain'+q; return m; }

const TER = { root:null, shown:new Map(), cache:new Map(), queue:[], R:32, minSize:0, K:2.1, last:new THREE.Vector3(1e9,0,0), mat:null };
function terrainGeo(cx,cz,size){ const R=TER.R, n=R+1, half=size/2, step=size/R, verts=n*n+4*n, pos=new Float32Array(verts*3), nor=new Float32Array(verts*3), nv=V3();
  let k=0; const put=(x,y,z,nx,ny,nz)=>{ pos[k]=x; pos[k+1]=y; nor[k]=nx; pos[k+2]=z; nor[k+1]=ny; nor[k+2]=nz; k+=3; };
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){ const x=cx-half+i*step, z=cz-half+j*step; normalAt(x,z,nv,Math.max(CELL,step*.5)); put(x,heightAt(x,z),z,nv.x,nv.y,nv.z); }
  const skirt=Math.max(3,step*1.2), base=n*n, edge=[]; for(let i=0;i<n;i++) edge.push(i); for(let j=1;j<n;j++) edge.push(j*n+R); for(let i=R-1;i>=0;i--) edge.push(R*n+i); for(let j=R-1;j>0;j--) edge.push(j*n);
  for(const e of edge){ put(pos[e*3],pos[e*3+1]-skirt,pos[e*3+2],nor[e*3],nor[e*3+1],nor[e*3+2]); }
  const idx=[]; for(let j=0;j<R;j++) for(let i=0;i<R;i++){ const a=j*n+i, b=a+1, c=a+n, d=c+1; idx.push(a,c,b,b,c,d); }
  for(let q=0;q<edge.length;q++){ const a=edge[q], b=edge[(q+1)%edge.length], a2=base+q, b2=base+(q+1)%edge.length; idx.push(a,b,a2,b,b2,a2); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos.subarray(0,k),3)); g.setAttribute('normal',new THREE.BufferAttribute(nor.subarray(0,k),3)); g.setIndex(idx); g.computeBoundingSphere(); return g; }
function terrainUpdate(force){ const c=W.cam.position; if(!force&&TER.last.distanceToSquared(c)<20*20&&!TER.queue.length) return; TER.last.copy(c);
  const want=[]; const visit=(cx,cz,size,lv)=>{ const dx=Math.max(Math.abs(c.x-cx)-size/2,0), dz=Math.max(Math.abs(c.z-cz)-size/2,0), dy=Math.max(0,c.y-heightAt(cx,cz)-size*.25), d=Math.hypot(dx,dz,dy*.5);
    if(size>TER.minSize&&d<size*TER.K){ const h=size/4; visit(cx-h,cz-h,size/2,lv+1); visit(cx+h,cz-h,size/2,lv+1); visit(cx-h,cz+h,size/2,lv+1); visit(cx+h,cz+h,size/2,lv+1); } else want.push([cx,cz,size,lv]); };
  visit(0,0,SIZE,0);
  const keyOf=w=>w[3]+':'+Math.round(w[0])+':'+Math.round(w[1]); TER.want=new Set(want.map(keyOf));
  TER.queue=want.filter(w=>!TER.cache.has(keyOf(w))).map(w=>({w,k:keyOf(w),d:Math.hypot(w[0]-c.x,w[1]-c.z)})).sort((a,b)=>a.d-b.d); }
function terrainBuild(budgetMs){ const t0=performance.now();
  while(TER.queue.length&&performance.now()-t0<budgetMs){ const {w,k}=TER.queue.shift(); if(TER.cache.has(k)) continue; const m=new THREE.Mesh(terrainGeo(w[0],w[1],w[2]),TER.mat); m.receiveShadow=true; m.matrixAutoUpdate=false; m.userData.k=k; TER.cache.set(k,m); }
  if(TER.queue.length||!TER.want) return;
  // every wanted patch exists: show exactly those, keep a few spare ones cached, drop the rest
  for(const [k,m] of TER.cache){ const on=TER.want.has(k); if(on&&!m.parent) W.scene.add(m); else if(!on&&m.parent) W.scene.remove(m); }
  if(TER.cache.size>TER.want.size+160){ for(const [k,m] of TER.cache) if(!TER.want.has(k)){ m.geometry.dispose(); TER.cache.delete(k); if(TER.cache.size<=TER.want.size+100) break; } } }

/* ---------------- roads ---------------- */
const ROAD = { pieces:[], meshes:new Map(), mats:{}, grid:new Map(), cellSz:64, flat:null };
const RTYPE = { hwy:{tex:'asphalt',center:2,lanes:1,dy:.09}, road:{tex:'asphalt',center:1,lanes:0,dy:.07}, street:{tex:'asphalt',center:1,lanes:0,dy:.06}, dirt:{tex:'gravel',center:0,lanes:0,dy:.05}, track:{tex:'track',center:0,lanes:0,dy:.1,curb:1} };
function roadMat(type,hw){ const key=type+hw; if(ROAD.mats[key]) return ROAD.mats[key]; const rt=RTYPE[type]||RTYPE.road, t=tex(rt.tex);
  const m=new THREE.MeshStandardMaterial({map:t.map,normalMap:t.normalMap,roughnessMap:t.roughnessMap||null,roughness:type==='dirt'?1:.9,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  m.normalScale.set(.8,.8); m.envMapIntensity=.5;
  m.onBeforeCompile=sh=>{ sh.uniforms.uHW={value:hw}; sh.uniforms.uCenter={value:rt.center}; sh.uniforms.uLanes={value:rt.lanes}; sh.uniforms.uCurb={value:rt.curb||0};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 ruv; varying vec2 vRuv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRuv=ruv;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv=vec2(ruv.x/4.0,ruv.y/4.0);\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv=vec2(ruv.x/4.0,ruv.y/4.0);\n#endif\n#ifdef USE_ROUGHNESSMAP\nvRoughnessMapUv=vec2(ruv.x/4.0,ruv.y/4.0);\n#endif');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>\nuniform float uHW; uniform float uCenter; uniform float uLanes; uniform float uCurb; varying vec2 vRuv;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>',`#include <map_fragment>
 { float a=abs(vRuv.x), v=vRuv.y, wear=smoothstep(.25,.75,wNoise(vRuv*vec2(1.3,.21)));
   float edge=step(uHW-.55,a)*step(a,uHW-.3);
   float cen=0.0; vec3 cenCol=vec3(.95,.72,.12);
   if(uCenter>1.5) cen=step(abs(a-.16),.06);                                  // highway: double solid yellow
   else if(uCenter>.5) cen=step(a,.07)*step(.5,fract(v/12.0));                  // road: dashed yellow
   float lane=uLanes>.5? step(abs(a-uHW*.5),.07)*step(.55,fract(v/13.0)) : 0.0;
   float paint=max(edge,lane)*(.75+.25*wear), pc=cen*(.8+.2*wear);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.92,.9),paint*.9); diffuseColor.rgb=mix(diffuseColor.rgb,cenCol,pc*.9);
   if(uCurb>.5&&a>uHW-1.2&&a<uHW){ float s=step(.5,fract(v/3.0)); diffuseColor.rgb=mix(vec3(.85,.1,.1),vec3(.93),s); }
   if(a>uHW){ float t=smoothstep(uHW,uHW+1.4,a); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.28,.25)*(.8+.4*wNoise(vRuv*vec2(2.0,.7))),.55+.45*t); }
   diffuseColor.rgb*=.92+.12*wNoise(vRuv*vec2(.6,.05)); }`); };
  m.customProgramCacheKey=()=>'road'+key; return ROAD.mats[key]=m; }
function roadsPrepare(){ // flat arrays for queries and the GPS graph; pieces for streaming
  const R=W.data.roads; let n=0; for(const r of R) n+=r.pts.length;
  const fx=new Float32Array(n), fy=new Float32Array(n), fz=new Float32Array(n), road=new Uint16Array(n); let k=0;
  R.forEach((r,ri)=>{ r.i0=k; for(const p of r.pts){ fx[k]=p[0]; fy[k]=p[1]; fz[k]=p[2]; road[k]=ri; k++; } r.i1=k; });
  ROAD.flat={fx,fy,fz,road,n};
  for(const r of R){ const P=r.pts, L=P.length, step=48; for(let a=0;a<L-1;a+=step){ const b=Math.min(L-1,a+step); let cx=0,cz=0; for(let i=a;i<=b;i++){ cx+=P[i][0]; cz+=P[i][2]; } cx/=b-a+1; cz/=b-a+1;
      let rad=0; for(let i=a;i<=b;i++) rad=Math.max(rad,Math.hypot(P[i][0]-cx,P[i][2]-cz)); ROAD.pieces.push({r,a,b,cx,cz,rad:rad+r.hw,mesh:null}); }
    if(r.closed&&L>2) ROAD.pieces.push({r,a:L-1,b:L-1,wrap:true,cx:P[0][0],cz:P[0][2],rad:20,mesh:null}); }
  // spatial hash of segments for "which road am I on"
  const cs=ROAD.cellSz; for(let ri=0;ri<R.length;ri++){ const r=R[ri], P=r.pts, L=P.length, segs=r.closed?L:L-1;
    for(let i=0;i<segs;i++){ const p=P[i], q=P[(i+1)%L], x0=Math.floor((Math.min(p[0],q[0])-r.hw)/cs), x1=Math.floor((Math.max(p[0],q[0])+r.hw)/cs), z0=Math.floor((Math.min(p[2],q[2])-r.hw)/cs), z1=Math.floor((Math.max(p[2],q[2])+r.hw)/cs);
      for(let gx=x0;gx<=x1;gx++) for(let gz=z0;gz<=z1;gz++){ const key=gx*65536+gz; let c=ROAD.grid.get(key); if(!c) ROAD.grid.set(key,c=[]); c.push(ri,i); } } } }
const RQ={d:0,y:0,hw:0,type:'',road:null,i:0,t:0,tx:0,tz:1};
function roadQuery(x,z){ const cs=ROAD.cellSz, c=ROAD.grid.get(Math.floor(x/cs)*65536+Math.floor(z/cs)); if(!c) return null; let best=1e9, R=W.data.roads;
  for(let k=0;k<c.length;k+=2){ const r=R[c[k]], P=r.pts, i=c[k+1], p=P[i], q=P[(i+1)%P.length], ax=q[0]-p[0], az=q[2]-p[2], l2=ax*ax+az*az||1, t=clamp(((x-p[0])*ax+(z-p[2])*az)/l2,0,1), px=p[0]+ax*t, pz=p[2]+az*t, d=Math.hypot(x-px,z-pz)-r.hw;
    if(d<best){ best=d; RQ.d=d; RQ.y=p[1]+(q[1]-p[1])*t; RQ.hw=r.hw; RQ.type=r.type; RQ.road=r; RQ.i=i; RQ.t=t; const l=Math.sqrt(l2); RQ.tx=ax/l; RQ.tz=az/l; } }
  return best<1e8?RQ:null; }
function roadPieceGeo(pc){ const r=pc.r, P=r.pts, L=P.length, hw=r.hw, dy=(RTYPE[r.type]||RTYPE.road).dy, ids=[];
  if(pc.wrap) ids.push(L-1,0); else { for(let i=pc.a;i<=pc.b;i++) ids.push(i); }
  const n=ids.length, pos=new Float32Array(n*4*3), ruv=new Float32Array(n*4*2), nor=new Float32Array(n*4*3); let v=0, dist=0;
  for(let k=0;k<n;k++){ const i=ids[k], p=P[i], pv=P[(i-1+L)%L], nx=P[(i+1)%L], first=i===0&&!r.closed, last=i===L-1&&!r.closed;
    const a=first?p:pv, b=last?p:nx; let tx=b[0]-a[0], tz=b[2]-a[2]; const tl=Math.hypot(tx,tz)||1; tx/=tl; tz/=tl; const lx=-tz, lz=tx;
    if(k>0){ const q=P[ids[k-1]]; dist+=Math.hypot(p[0]-q[0],p[2]-q[2]); } else dist=pc.wrap?0:pc.a*((r.len||0)/Math.max(1,L-1));
    const y=p[1]+dy, cols=[[-hw-1.6,-.9],[-hw,0],[hw,0],[hw+1.6,-.9]];
    cols.forEach(([u,dyy],c)=>{ const o=(k*4+c); pos[o*3]=p[0]+lx*u; pos[o*3+1]=y+dyy; pos[o*3+2]=p[2]+lz*u; ruv[o*2]=u; ruv[o*2+1]=dist; nor[o*3+1]=1; }); }
  const idx=[]; for(let k=0;k<n-1;k++) for(let c=0;c<3;c++){ const a=k*4+c, b=a+1, cc=a+4, d=cc+1; idx.push(a,cc,b,b,cc,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setAttribute('ruv',new THREE.BufferAttribute(ruv,2));
  g.setAttribute('uv',new THREE.BufferAttribute(ruv,2)); g.setIndex(idx); g.computeBoundingSphere(); return g; }
function roadsUpdate(budgetMs){ const c=W.car||W.cam.position, cx=c.x, cz=c.z, R=W.viewRoads, t0=performance.now();
  for(const pc of ROAD.pieces){ const d=Math.hypot(pc.cx-cx,pc.cz-cz)-pc.rad;
    if(d<R&&!pc.mesh){ if(performance.now()-t0>budgetMs) continue; if(pc.r.len==null){ let s=0; const P=pc.r.pts; for(let i=1;i<P.length;i++) s+=Math.hypot(P[i][0]-P[i-1][0],P[i][2]-P[i-1][2]); pc.r.len=s; }
      const m=new THREE.Mesh(roadPieceGeo(pc),roadMat(pc.r.type,pc.r.hw)); m.receiveShadow=true; m.matrixAutoUpdate=false; pc.mesh=m; W.scene.add(m); }
    else if(d>R+400&&pc.mesh){ W.scene.remove(pc.mesh); pc.mesh.geometry.dispose(); pc.mesh=null; } } }

/* ---------------- buildings ---------------- */
const BLD = { cells:new Map(), cellSz:320, list:[], grid:new Map(), mat:null, roof:null };
const BSTYLE = [[.62,.6,.57],[.78,.74,.66],[.52,.55,.6],[.7,.52,.42],[.85,.84,.8],[.42,.48,.56],[.86,.82,.72],[.9,.88,.84],[.55,.42,.32],[.95,.92,.86],[.6,.2,.16],[.5,.52,.55]];
function buildingsPrepare(){ const B=W.data.buildings; let rows=[];
  if(Array.isArray(B)) rows=B.map(b=>[b.x,b.z,b.w,b.d,b.h,b.r||0,b.y,b.s||0]); else if(B&&B.rows){ const f=B.fields; const ix=k=>f.indexOf(k); rows=B.rows.map(r=>[r[ix('x')],r[ix('z')],r[ix('w')],r[ix('d')],r[ix('h')],r[ix('rot')]||0,r[ix('y')],r[ix('style')]||0]); }
  BLD.list=rows; const cs=BLD.cellSz;
  rows.forEach((b,i)=>{ const key=Math.floor(b[0]/cs)*65536+Math.floor(b[1]/cs); let c=BLD.cells.get(key); if(!c) BLD.cells.set(key,c={key,items:[],cx:(Math.floor(b[0]/cs)+.5)*cs,cz:(Math.floor(b[1]/cs)+.5)*cs,mesh:null}); c.items.push(i);
    const g=Math.floor(b[0]/64)*65536+Math.floor(b[1]/64); const r=Math.hypot(b[2],b[3])/2; for(let gx=Math.floor((b[0]-r)/64);gx<=Math.floor((b[0]+r)/64);gx++) for(let gz=Math.floor((b[1]-r)/64);gz<=Math.floor((b[1]+r)/64);gz++){ const k=gx*65536+gz; let q=BLD.grid.get(k); if(!q) BLD.grid.set(k,q=[]); q.push(i); } });
  const wall=tex('wall'); BLD.mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,metalness:0,vertexColors:true}); BLD.mat.envMapIntensity=.6;
  BLD.mat.onBeforeCompile=sh=>{ sh.uniforms.tWall={value:wall.map}; sh.uniforms.uNight={value:0}; BLD.u=sh.uniforms;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP; varying vec3 vWN; attribute vec2 face;\nvarying vec2 vFace;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal); vFace=face;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>\nuniform sampler2D tWall; uniform float uNight; varying vec3 vWP; varying vec3 vWN; varying vec2 vFace;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>',`
 float glass=0.0; float lit=0.0;
 if(abs(vWN.y)<.5){ vec2 f=vFace;      // metres along the wall, metres up
   vec3 wt=texture2D(tWall,f/3.0).rgb; diffuseColor.rgb*=wt*1.35;
   vec2 cell=vec2(f.x/2.6,(f.y-1.2)/3.3); vec2 g=fract(cell); float row=floor(cell.y);
   float win=step(.18,g.x)*step(g.x,.82)*step(.22,g.y)*step(g.y,.86)*step(0.0,row);
   if(f.y<1.0||f.y>vColor.a-.6) win=0.0;
   glass=win; float h=wHash(floor(cell)+floor(vWP.xz*.05)); lit=win*step(.55,h)*uNight;
   diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.08,.1,.13)+vec3(.05,.06,.08)*h, win); }
 else diffuseColor.rgb*=.55;`)
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(roughness,.08,glass);')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=vec3(1.0,.78,.45)*lit*2.5;'); };
  BLD.mat.customProgramCacheKey=()=>'bld'; }
function buildingCellGeo(cell){ const geos=[]; for(const i of cell.items){ const [x,z,w,d,h,rot,y,s]=BLD.list[i], col=BSTYLE[s%BSTYLE.length]||BSTYLE[0];
    const g=new THREE.BoxGeometry(w,h,d); const n=g.attributes.position.count, cl=new Float32Array(n*4), face=new Float32Array(n*2), p=g.attributes.position, nm=g.attributes.normal;
    for(let k=0;k<n;k++){ cl[k*4]=col[0]; cl[k*4+1]=col[1]; cl[k*4+2]=col[2]; cl[k*4+3]=h; const px=p.getX(k), py=p.getY(k), pz=p.getZ(k), ax=Math.abs(nm.getX(k))>.5;
      face[k*2]=(ax?pz:px)+(ax?d:w)/2; face[k*2+1]=py+h/2; }
    g.setAttribute('color',new THREE.BufferAttribute(cl,4)); g.setAttribute('face',new THREE.BufferAttribute(face,2)); g.deleteAttribute('uv');
    g.rotateY(rot); g.translate(x,(y!=null?y:heightAt(x,z))+h/2-.3,z); geos.push(g.toNonIndexed()); g.dispose(); }
  const m=THREE.BufferGeometryUtils.mergeGeometries(geos); geos.forEach(g=>g.dispose()); m.computeBoundingSphere(); return m; }
function buildingsUpdate(budgetMs){ const c=W.car||W.cam.position, R=W.viewBld, t0=performance.now();
  for(const cell of BLD.cells.values()){ const d=Math.hypot(cell.cx-c.x,cell.cz-c.z);
    if(d<R&&!cell.mesh){ if(performance.now()-t0>budgetMs) continue; const m=new THREE.Mesh(buildingCellGeo(cell),BLD.mat); m.castShadow=m.receiveShadow=true; m.matrixAutoUpdate=false; cell.mesh=m; W.scene.add(m); }
    else if(d>R+500&&cell.mesh){ W.scene.remove(cell.mesh); cell.mesh.geometry.dispose(); cell.mesh=null; } } }
// push the car out of any building it runs into
function collideBuildings(c,me){ const q=BLD.grid.get(Math.floor(c.x/64)*65536+Math.floor(c.z/64)); if(!q) return; const rad=1.15;
  for(const i of q){ const b=BLD.list[i], cs=Math.cos(b[5]), sn=Math.sin(b[5]), dx=c.x-b[0], dz=c.z-b[1], lx=dx*cs-dz*sn, lz=dx*sn+dz*cs, hx=b[2]/2+rad, hz=b[3]/2+rad;
    if(Math.abs(lx)<hx&&Math.abs(lz)<hz){ const px=hx-Math.abs(lx), pz=hz-Math.abs(lz); let nx, nz;
      if(px<pz){ nx=Math.sign(lx); nz=0; } else { nx=0; nz=Math.sign(lz); }
      const wx=nx*cs+nz*sn, wz=-nx*sn+nz*cs, pen=Math.min(px,pz); c.x+=wx*pen; c.z+=wz*pen;
      const vn=c.vx*wx+c.vz*wz; if(vn<0){ c.vx-=wx*vn*1.35; c.vz-=wz*vn*1.35; c.vx*=.8; c.vz*=.8; if(-vn>7&&me){ SGP.SFX.crash&&SGP.SFX.crash(); W.shake=Math.min(1,-vn/30); } } } } }

/* ---------------- sky, light ---------------- */
function skyDome(){ const g=new THREE.SphereGeometry(9000,32,16), m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{uSun:{value:W.sunDir}},
  vertexShader:'varying vec3 vD; void main(){ vD=normalize(position); vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*p; gl_Position.z=gl_Position.w; }',
  fragmentShader:`uniform vec3 uSun; varying vec3 vD;
  void main(){ vec3 d=normalize(vD); float h=max(d.y,0.0); vec3 zen=vec3(.13,.32,.78), hor=vec3(.72,.82,.95);
    vec3 c=mix(hor,zen,pow(h,.45)); float s=max(dot(d,uSun),0.0); c+=vec3(1.0,.85,.62)*pow(s,6.0)*.35+vec3(1.0,.95,.85)*pow(s,700.0)*30.0;
    c=mix(c,vec3(.62,.66,.7),smoothstep(0.02,-0.15,d.y)); gl_FragColor=vec4(c*1.15,1.0); }`});
  const s=new THREE.Mesh(g,m); s.frustumCulled=false; s.renderOrder=-1; return s; }

/* ---------------- the car ---------------- */
function groundAt(x,z){ const rq=roadQuery(x,z); return rq&&rq.d<.6?rq.y+((RTYPE[rq.type]||RTYPE.road).dy):heightAt(x,z); }
function makeCar(ci,x,z,h,opt){ opt=opt||{}; const spec=opt.spec||SGP.tunedSpec(ci), look=opt.look||SGP.lookOf(ci), m=SGP.buildCarMesh(spec,false,true,look,opt.det!=null?opt.det:(SGP.Q.level?2:1));
  m.group.traverse(o=>{ if(o.name==='blob') o.visible=false; if(o.isMesh) o.castShadow=true; }); const y=groundAt(x,z);
  return { spec, look, m, ci, isPlayer:!opt.ai, isAI:!!opt.ai, ai:!!opt.ai, name:opt.name||'', ctrl:{th:0,br:0,st:0,drift:false}, x, z, h, y, vy:0, air:false, vx:0, vz:0, vf:0, vl:0, speed:0, steer:0, yawKick:0,
    p0x:x,p0y:y,p0z:z,p0h:h, dx:x,dy:y,dz:z,dh:h,
    drifting:false, driftDir:0, driftCharge:0, driftTime:0, boostT:0, spinT:0, spinVis:0, zapT:0, shieldT:0, ramT:0, invulnT:0, padT:0, onRoad:true, topMul:1, draft:0, wear:0, gripMul:1, combo:0, score:0, accel:0,
    pitch:0, roll:0, wetT:0, surface:'road' }; }
function readInput(c){ const k=c.ctrl; if(W.paused||W.mapOpen||W.blockInput){ k.th=k.br=k.st=0; k.drift=false; return; }
  k.br=keys.down?1:0; k.th=(keys.up||(SGP.touchMode&&!keys.down))?1:0; k.st=(keys.left?1:0)-(keys.right?1:0); k.drift=!!keys.drift; }
const NV=V3();
function stepCarWorld(c,dt){
  const rq=roadQuery(c.x,c.z), onRoad=!!rq&&rq.d<.6, mp=mapAt(c.x,c.z), me=c.isPlayer;
  // surfaces: tarmac, gravel roads, then grass, forest floor, sand, snow off the road
  let surf='road', top=1;
  if(onRoad){ if(rq.type==='dirt'){ surf='dirt'; top=.92; } }
  else { surf=mp.desert>.5?'sand':c.y>W.snowLine?'snow':mp.forest>.5?'forest':'grass'; top={sand:.74,snow:.66,forest:.7,grass:.78}[surf]; }
  c.surface=surf; c.onRoad=onRoad&&surf==='road'; c.topMul=c.onRoad?1:top/.55; c.gripMul=surf==='dirt'?.85:1;
  SGP.TR.grip=surf==='snow'?.75:surf==='dirt'||surf==='sand'?.85:1;
  SGP.stepCar(c,dt);
  // the slope pulls the car downhill
  normalAt(c.x,c.z,NV); const gk=onRoad?.55:1; c.vx+=NV.x*9.8*gk*dt; c.vz+=NV.z*9.8*gk*dt;
  // keep inside the island
  const lim=SIZE/2-60; if(Math.abs(c.x)>lim){ c.x=Math.sign(c.x)*lim; c.vx*=-.3; } if(Math.abs(c.z)>lim){ c.z=Math.sign(c.z)*lim; c.vz*=-.3; }
  collideBuildings(c,me);
  // height: the road surface on roads, the ground elsewhere; leave the ground over crests and fly a little
  const gy=onRoad?Math.max(rq.y+((RTYPE[rq.type]||RTYPE.road).dy),heightAt(c.x,c.z)-.4):Math.max(heightAt(c.x,c.z),-1.2);
  if(c.air){ c.vy-=9.8*1.7*dt; c.y+=c.vy*dt; if(c.y<=gy){ if(c.vy<-6&&me){ W.shake=Math.min(1,-c.vy/22); SGP.SFX.crash&&c.vy<-12&&SGP.SFX.crash(); } c.y=gy; c.vy=0; c.air=false; } }
  else { const vyG=(gy-c.y)/Math.max(dt,1e-3); if(vyG<c.vy-7&&c.speed>22){ c.air=true; c.y+=c.vy*dt; } else { c.vy=lerp(c.vy,vyG,.5); c.y=gy; } }
  // water: slow down, then put the car back on the nearest road
  if(heightAt(c.x,c.z)<-.6&&!onRoad){ c.wetT+=dt; c.vx*=Math.exp(-2.5*dt); c.vz*=Math.exp(-2.5*dt); if(c.wetT>1.4){ if(me) respawn(); else aiReset(c); } } else c.wetT=0;
  if(me) W.odo+=c.speed*dt; }
function respawn(){ const c=W.car; if(RACE.on&&c.race){ aiReset(c); W.camSnap=true; W.streamNow=true; flash(); return; } let best=null, bd=1e18; const F=ROAD.flat; for(let i=0;i<F.n;i+=3){ const d=(F.fx[i]-c.x)**2+(F.fz[i]-c.z)**2; if(d<bd&&F.fy[i]>1){ bd=d; best=i; } }
  if(best==null) return; const r=W.data.roads[F.road[best]], j=best-r.i0, P=r.pts, a=P[Math.max(0,j-1)], b=P[Math.min(P.length-1,j+1)];
  c.x=F.fx[best]; c.z=F.fz[best]; c.y=F.fy[best]+.2; c.h=Math.atan2(b[0]-a[0],b[2]-a[2]); c.vx=c.vz=c.vy=0; c.air=false; c.wetT=0; c.speed=0; c.drifting=false; W.camSnap=true; W.streamNow=true; snapPrev(); flash(); }
function flash(){ const f=$('#wflash'); if(!f) return; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
const QE=new THREE.Euler(0,0,0,'YXZ');
function placeCar(dt,c){ const m=c.m, g=m.group, L=m.len||4.5, hw=.85, fx=Math.sin(c.dh), fz=Math.cos(c.dh), lx=fz, lz=-fx, me=c.isPlayer;
  const hf=heightAt(c.dx+fx*L*.4,c.dz+fz*L*.4), hb=heightAt(c.dx-fx*L*.4,c.dz-fz*L*.4), hl=heightAt(c.dx+lx*hw,c.dz+lz*hw), hr=heightAt(c.dx-lx*hw,c.dz-lz*hw);
  const on=c.onRoad||c.surface==='dirt'; const pitch=c.air?c.pitch:(on?0:Math.atan2(hb-hf,L*.8)), roll=c.air?c.roll:(on?0:Math.atan2(hl-hr,hw*2));
  let pr=pitch, rr=roll; if(on){ const rq=roadQuery(c.x,c.z); if(rq){ const P=rq.road.pts, i=rq.i, a=P[i], b=P[(i+1)%P.length]; const sl=Math.atan2(b[1]-a[1],Math.hypot(b[0]-a[0],b[2]-a[2]));
      const dirDot=Math.sin(c.h)*rq.tx+Math.cos(c.h)*rq.tz; pr=-sl*dirDot; } }
  c.pitch+=(pr-c.pitch)*Math.min(1,dt*10); c.roll+=(rr-c.roll)*Math.min(1,dt*10);
  g.position.set(c.dx,c.dy,c.dz); QE.set(c.pitch,c.dh,c.roll); g.quaternion.setFromEuler(QE);
  const sp01=Math.min(1,c.speed/c.spec.top);
  m.body.rotation.z+=((c.steer*.05+(c.drifting?c.driftDir*.05:0))*sp01-m.body.rotation.z)*Math.min(1,dt*8);
  m.body.rotation.x+=(clamp(-(c.accel||0)*.0016,-.05,.06)-m.body.rotation.x)*Math.min(1,dt*6);
  for(const w of m.wheels){ w.wh.rotation.x+=c.vf*dt/.36; if(w.front) w.pv.rotation.y=c.steer*.42; }
  const b=c.boostT>0; for(const f of m.flames){ f.visible=b; if(b) f.scale.set(1+Math.random()*.3,1+Math.random()*.3,.7+Math.random()*.7); }
  m.tailM.color.setHex(c.ctrl.br>0&&c.vf>1?0xff2a3a:0x6e1018);
  // dust off the road, tyre smoke when sliding on tarmac
  if(W.fx&&c.speed>9&&(me||(c.dx-W.car.dx)**2+(c.dz-W.car.dz)**2<6400)){ const back=-(L*.42); for(const sd of [1,-1]){ const wx=c.x+fx*back+lx*.8*sd, wz=c.z+fz*back+lz*.8*sd;
      if(!c.onRoad&&Math.random()<.5){ const col=c.surface==='sand'?[.75,.55,.38]:c.surface==='snow'?[.95,.96,1]:c.surface==='dirt'?[.6,.5,.4]:[.45,.42,.33]; W.fx.spawn(wx,c.y+.2,wz,-c.vx*.1+(Math.random()-.5)*2,1+Math.random()*1.5,-c.vz*.1+(Math.random()-.5)*2,.9+Math.random()*.6,1.6,col[0],col[1],col[2],.5,3.5,0); }
      else if(c.onRoad&&(c.drifting||Math.abs(c.vl)>7)&&Math.random()<.7) W.fx.spawn(wx,c.y+.25,wz,-c.vx*.08+(Math.random()-.5),.8+Math.random(),-c.vz*.08+(Math.random()-.5),.7+Math.random()*.6,1.3,.88,.88,.92,.36,3.4,0); } } }

/* ---------------- camera ---------------- */
const CAM={h:0,pos:V3(),look:V3(),want:V3(),fov:62};
function camUpdate(dt){ const c=W.car, cam=W.cam, sp=c.speed, mode=SGP.camMode%3;
  const velH=(sp>5&&c.vf>0)?Math.atan2(c.vx,c.vz):DRAW.h, tgtH=DRAW.h+wrapPi(velH-DRAW.h)*.5; CAM.h+=wrapPi(tgtH-CAM.h)*(1-Math.exp(-dt*(mode===2?14:4.5)));
  const dist=[6.9,10.5,0][mode]+Math.min(sp,70)*.022, hgt=[2.45,3.6,1.2][mode], dx=Math.sin(CAM.h), dz=Math.cos(CAM.h);
  const want=CAM.want.set(DRAW.x-dx*dist,DRAW.y+hgt,DRAW.z-dz*dist); if(mode===2) want.set(DRAW.x+dx*.6,DRAW.y+1.18,DRAW.z+dz*.6);
  const gy=heightAt(want.x,want.z)+1.1; if(want.y<gy) want.y=gy;
  const k=W.camSnap?1:1-Math.exp(-dt*(mode===2?30:9)); W.camSnap=false; CAM.pos.lerp(want,k); cam.position.copy(CAM.pos);
  if(W.shake>0){ cam.position.x+=(Math.random()-.5)*W.shake*.35; cam.position.y+=(Math.random()-.5)*W.shake*.35; W.shake=Math.max(0,W.shake-dt*2.5); }
  CAM.look.set(DRAW.x+dx*(mode===2?20:4.5),DRAW.y+(mode===2?1.0:1.05),DRAW.z+dz*(mode===2?20:4.5)); cam.lookAt(CAM.look);
  const fov=(mode===2?66:58)+12*Math.min(1.3,sp/c.spec.top)+(c.boostT>0?7:0); CAM.fov+=(fov-CAM.fov)*(1-Math.exp(-dt*3)); if(Math.abs(cam.fov-CAM.fov)>.05){ cam.fov=CAM.fov; cam.updateProjectionMatrix(); } }

/* ---------------- map image, minimap, GPS ---------------- */
const MAPI={canvas:null, px:1024};
function paintMap(){ const S=MAPI.px=N, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'), img=g.createImageData(S,S), d=img.data, sp=CELL;
  for(let j=0;j<S;j++) for(let i=0;i<S;i++){ const q=j*N+i, h=H[q], o=q*4, mp={forest:MAP[o+1]/255,desert:MAP[o+2]/255,sakura:MAP[o+3]/255};
    const hx=H[j*N+Math.min(N-1,i+1)]-H[j*N+Math.max(0,i-1)], hz=H[Math.min(N-1,j+1)*N+i]-H[Math.max(0,j-1)*N+i], sh=clamp(.8+(-hx*.6-hz*.8)*(12/sp)/40,.35,1.25);
    let r,gg,b; if(h<0){ const dp=clamp(-h/30,0,1); r=40-20*dp; gg=105-40*dp; b=150-30*dp; }
    else { r=96; gg=128; b=72; const f=mp.forest; r=lerp(r,48,f); gg=lerp(gg,86,f); b=lerp(b,52,f); const ds=mp.desert; r=lerp(r,186,ds); gg=lerp(gg,110,ds); b=lerp(b,72,ds);
      const sk=mp.sakura; r=lerp(r,210,sk*.55); gg=lerp(gg,150,sk*.55); b=lerp(b,170,sk*.55); if(h<3){ const t=clamp((3-h)/2.5,0,1); r=lerp(r,214,t); gg=lerp(gg,198,t); b=lerp(b,150,t); }
      const sn=clamp((h-W.snowLine)/60,0,1); r=lerp(r,236,sn); gg=lerp(gg,240,sn); b=lerp(b,246,sn); r*=sh; gg*=sh; b*=sh; }
    d[o]=r; d[o+1]=gg; d[o+2]=b; d[o+3]=255; }
  g.putImageData(img,0,0);
  const k=S/SIZE, X=x=>(x+SIZE/2)*k; g.lineCap=g.lineJoin='round';
  const draw=(filter,width,col)=>{ g.strokeStyle=col; for(const r of W.data.roads){ if(!filter(r)) continue; g.lineWidth=Math.max(1,width(r)*k); g.beginPath(); r.pts.forEach((p,i)=>i?g.lineTo(X(p[0]),X(p[2])):g.moveTo(X(p[0]),X(p[2]))); if(r.closed) g.closePath(); g.stroke(); } };
  draw(r=>r.type!=='dirt',r=>Math.max(9,r.hw*3.2),'rgba(20,22,26,.55)'); draw(r=>r.type==='dirt',r=>7,'rgba(214,190,150,.8)'); draw(r=>r.type!=='dirt'&&r.type!=='hwy',r=>Math.max(6,r.hw*2.2),'#e9e6dc'); draw(r=>r.type==='hwy',r=>r.hw*3,'#ffcf5a');
  MAPI.canvas=c; }
// the road graph for GPS: points along roads, joined where roads meet
const GPS={adj:null, route:null, target:null};
function gpsPrepare(){ const F=ROAD.flat, n=F.n, adj=new Array(n), R=W.data.roads; for(let i=0;i<n;i++) adj[i]=[];
  for(const r of R){ for(let i=r.i0;i<r.i1-1;i++){ adj[i].push(i+1); adj[i+1].push(i); } if(r.closed){ adj[r.i0].push(r.i1-1); adj[r.i1-1].push(r.i0); } }
  const cs=12, grid=new Map(); for(let i=0;i<n;i++){ const k=Math.floor(F.fx[i]/cs)*65536+Math.floor(F.fz[i]/cs); let c=grid.get(k); if(!c) grid.set(k,c=[]); c.push(i); }
  for(let i=0;i<n;i++){ const gx=Math.floor(F.fx[i]/cs), gz=Math.floor(F.fz[i]/cs); for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const c=grid.get((gx+a)*65536+gz+b); if(!c) continue;
      for(const j of c) if(F.road[j]!==F.road[i]&&j>i&&(F.fx[i]-F.fx[j])**2+(F.fz[i]-F.fz[j])**2<100){ adj[i].push(j); adj[j].push(i); } } }
  GPS.adj=adj; }
function nearestNode(x,z){ const F=ROAD.flat; let best=0, bd=1e18; for(let i=0;i<F.n;i+=2){ const d=(F.fx[i]-x)**2+(F.fz[i]-z)**2; if(d<bd){ bd=d; best=i; } } return best; }
function gpsRoute(tx,tz){ const F=ROAD.flat, s=nearestNode(W.car.x,W.car.z), t=nearestNode(tx,tz), n=F.n, gS=new Float32Array(n).fill(Infinity), from=new Int32Array(n).fill(-1), done=new Uint8Array(n);
  const heap=[]; const push=(i,f)=>{ heap.push([f,i]); let k=heap.length-1; while(k>0){ const p=(k-1)>>1; if(heap[p][0]<=heap[k][0]) break; [heap[p],heap[k]]=[heap[k],heap[p]]; k=p; } };
  const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let k=0; for(;;){ const l=2*k+1, r=l+1; let m=k; if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===k) break; [heap[m],heap[k]]=[heap[k],heap[m]]; k=m; } } return top; };
  const hx=F.fx[t], hz=F.fz[t]; gS[s]=0; push(s,0);
  while(heap.length){ const [,i]=pop(); if(done[i]) continue; done[i]=1; if(i===t) break;
    for(const j of GPS.adj[i]){ const g=gS[i]+Math.hypot(F.fx[i]-F.fx[j],F.fz[i]-F.fz[j]); if(g<gS[j]){ gS[j]=g; from[j]=i; push(j,g+Math.hypot(F.fx[j]-hx,F.fz[j]-hz)); } } }
  if(from[t]<0&&s!==t){ GPS.route=null; return false; } const path=[]; for(let i=t;i>=0;i=from[i]){ path.push(i); if(i===s) break; } path.reverse();
  GPS.route=path.map(i=>[F.fx[i],F.fz[i]]); GPS.target={x:tx,z:tz}; GPS.len=gS[t]; return true; }

/* ---------------- HUD ---------------- */
let HC=null, hx=null, hudT=0;
const SAFE={t:0,r:0,b:0,l:0};
function safeArea(){ let p=$('#wsafe'); if(!p){ p=document.createElement('div'); p.id='wsafe'; p.style.cssText='position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(p); }
  const cs=getComputedStyle(p); SAFE.t=parseFloat(cs.paddingTop)||0; SAFE.r=parseFloat(cs.paddingRight)||0; SAFE.b=parseFloat(cs.paddingBottom)||0; SAFE.l=parseFloat(cs.paddingLeft)||0; }
function hudSize(){ if(!HC) return; safeArea(); const dpr=Math.min(2,window.devicePixelRatio||1), w=HC.clientWidth, h=HC.clientHeight; if(HC.width!==Math.round(w*dpr)||HC.height!==Math.round(h*dpr)){ HC.width=Math.round(w*dpr); HC.height=Math.round(h*dpr); } hx.setTransform(dpr,0,0,dpr,0,0); }
function regionAt(x,z){ let best=null, bd=1e18; for(const r of W.data.places.regions||[]){ const d=(r.x-x)**2+(r.z-z)**2; if(d<bd){ bd=d; best=r; } } return best; }
function drawHUD(dt){ if(!hx) return; hudT+=dt; if(hudT<1/40) return; const step=hudT; hudT=0; hudSize(); const w=HC.clientWidth, h=HC.clientHeight, c=W.car, g=hx; g.clearRect(0,0,w,h);
  const small=Math.min(w,h)<520, R=small?62:86, mx=(small?14:22)+R+SAFE.l, my=h-(small?110:26)-R-SAFE.b;
  // minimap: the painted map turned with the car
  if(MAPI.canvas){ g.save(); g.beginPath(); g.arc(mx,my,R,0,6.283); g.clip(); g.fillStyle='#0d1016'; g.fillRect(mx-R,my-R,R*2,R*2);
    const k=MAPI.px/SIZE, zoom=R/360/k; g.translate(mx,my); g.rotate(c.h-Math.PI); g.scale(zoom,zoom); g.translate(-(c.x+SIZE/2)*k,-(c.z+SIZE/2)*k); g.drawImage(MAPI.canvas,0,0);
    if(RACE.on&&RACE.line){ g.strokeStyle='#ffc21a'; g.lineWidth=4/zoom; g.lineJoin='round'; g.beginPath(); RACE.line.forEach((p,i)=>{ const X=(p[0]+SIZE/2)*k, Z=(p[1]+SIZE/2)*k; i?g.lineTo(X,Z):g.moveTo(X,Z); }); if(RACE.R.closed) g.closePath(); g.stroke();
      for(const q of RACE.cars) if(!q.isPlayer){ g.fillStyle='#ff3b4e'; g.beginPath(); g.arc((q.dx+SIZE/2)*k,(q.dz+SIZE/2)*k,4/zoom,0,6.283); g.fill(); } }
    if(GPS.route){ g.strokeStyle='#ff3bd0'; g.lineWidth=4/zoom; g.lineJoin='round'; g.beginPath(); GPS.route.forEach((p,i)=>{ const X=(p[0]+SIZE/2)*k, Z=(p[1]+SIZE/2)*k; i?g.lineTo(X,Z):g.moveTo(X,Z); }); g.stroke(); }
    g.restore(); g.save(); g.translate(mx,my); g.fillStyle='#ffc21a'; g.strokeStyle='#14151a'; g.lineWidth=2; g.beginPath(); g.moveTo(0,-9); g.lineTo(7,8); g.lineTo(0,4); g.lineTo(-7,8); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=2; g.beginPath(); g.arc(mx,my,R,0,6.283); g.stroke();
    if(GPS.target){ const d=Math.hypot(GPS.target.x-c.x,GPS.target.z-c.z); g.font='700 14px "Barlow Condensed",Arial'; g.fillStyle='#ff9ae8'; g.textAlign='center'; g.fillText((d/1000).toFixed(1)+' km',mx,my-R-8); } }
  if(RACE.on){ const me=c.race, tm=t=>{ const m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(1); }, x0=(small?16:26)+SAFE.l, y0=(small?40:54)+SAFE.t;
    g.textAlign='left'; g.fillStyle='#f4f1e8'; g.font=`italic 900 ${small?38:54}px Kanit,"Arial Black",Arial`; const pl=racePlace(c); g.fillText(pl,x0,y0+(small?6:10)); const pw=g.measureText(String(pl)).width;
    g.font=`800 ${small?16:22}px Kanit,Arial`; g.fillStyle='#ffc21a'; g.fillText((['st','nd','rd'][pl-1]||'th')+' / '+RACE.cars.length,x0+pw+4,y0+(small?6:10));
    g.font=`700 ${small?16:20}px "Barlow Condensed",Arial`; g.fillStyle='#f4f1e8'; g.fillText((RACE.R.closed?'LAP '+clamp(me.lap+1,1,RACE.laps)+' / '+RACE.laps+'   ':'')+tm(RACE.t),x0,y0+(small?28:38));
    if(RACE.state==='count'){ const n=Math.ceil(RACE.cd-.6); g.textAlign='center'; g.font=`italic 900 ${small?90:140}px Kanit,"Arial Black",Arial`; g.fillStyle=n>0?'#f4f1e8':'#49e07a'; g.fillText(n>0?n:'GO!',w/2,h*.42); }
    else if(RACE.t<1.2){ g.textAlign='center'; g.font=`italic 900 ${small?90:140}px Kanit,"Arial Black",Arial`; g.fillStyle='#49e07a'; g.globalAlpha=1-RACE.t/1.2; g.fillText('GO!',w/2,h*.42); g.globalAlpha=1; }
    if(me.off>RACE.R.hw+40){ g.textAlign='center'; g.font=`800 ${small?18:24}px Kanit,Arial`; g.fillStyle='#ff3b4e'; g.fillText('Back to the route! (R)',w/2,h*.3); } }
  if(STUNT.zone){ g.textAlign='center'; g.font=`italic 900 ${small?30:44}px Kanit,"Arial Black",Arial`; g.fillStyle='#ff7a1a'; g.fillText(Math.round(STUNT.zone.score).toLocaleString(),w/2,(small?70:96)+SAFE.t); g.font=`700 ${small?14:18}px "Barlow Condensed",Arial`; g.fillStyle='#f4f1e8'; g.fillText('DRIFT ZONE',w/2,(small?86:116)+SAFE.t); }
  if(W.toastT>0){ W.toastT-=step; const a=clamp(Math.min(W.toastT,3.4-W.toastT)*3,0,1); g.globalAlpha=a; g.textAlign='center'; g.font=`800 ${small?17:22}px Kanit,Arial`; const tw=g.measureText(W.toastMsg).width+30; g.fillStyle='rgba(15,18,26,.88)'; g.fillRect(w/2-tw/2,h*.18,tw,small?32:40); g.fillStyle='#ffc21a'; g.fillText(W.toastMsg,w/2,h*.18+(small?22:28)); g.globalAlpha=1; }
  // speed
  const kmh=Math.round(c.speed*6), sx=w-(small?18:30)-SAFE.r, sy=h-(small?118:34)-SAFE.b; g.textAlign='right'; g.fillStyle='#f4f1e8'; g.font=`italic 900 ${small?40:58}px Kanit,"Arial Black",Arial`; g.fillText(kmh,sx,sy);
  g.font=`700 ${small?14:18}px "Barlow Condensed",Arial`; g.fillStyle='#a2a8b6'; g.fillText('KM/H',sx,sy+(small?16:21));
  const ch=clamp(c.driftCharge/2.6,0,1); if(c.drifting||c.boostT>0){ const bw=small?110:160; g.fillStyle='rgba(255,255,255,.15)'; g.fillRect(sx-bw,sy+(small?22:28),bw,6); g.fillStyle=c.boostT>0?'#39d9ff':ch>=1?'#ff2bd0':ch>.55?'#ff7a1a':'#39d9ff'; g.fillRect(sx-bw,sy+(small?22:28),bw*(c.boostT>0?1:ch),6); }
  // place name, prompts
  const rg=regionAt(c.x,c.z); if(rg&&rg!==W.region){ W.region=rg; W.regionT=3.2; }
  if(W.regionT>0){ W.regionT-=step; const a=clamp(Math.min(W.regionT,3.2-W.regionT)*2,0,1); g.globalAlpha=a; g.textAlign='center'; g.font=`italic 900 ${small?26:36}px Kanit,"Arial Black",Arial`; g.fillStyle='#f4f1e8'; g.fillText(W.region.name,w/2,(small?92:110)+SAFE.t); g.globalAlpha=1; }
  if(W.prompt){ g.textAlign='center'; g.font=`700 ${small?16:20}px "Barlow Condensed",Arial`; const tw=g.measureText(W.prompt).width+28; g.fillStyle='rgba(15,18,26,.85)'; g.fillRect(w/2-tw/2,h*.62,tw,34); g.fillStyle='#ffc21a'; g.fillText(W.prompt,w/2,h*.62+23); } }

/* ---------------- full map screen ---------------- */
const MV={x:0,z:0,s:.25,drag:null};
function openMap(on){ if(on){ MV.s=.25; screenPush('map'); } else screenPop('map'); }
function drawMapView(){ const cv=$('#wmapc'); if(!cv||!MAPI.canvas) return; const dpr=Math.min(2,window.devicePixelRatio||1), w=cv.clientWidth, h=cv.clientHeight; cv.width=w*dpr; cv.height=h*dpr; const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle='#0b1622'; g.fillRect(0,0,w,h); const k=MAPI.px/SIZE, s=MV.s; g.save(); g.translate(w/2,h/2); g.scale(s/k,s/k); g.translate(-(MV.x+SIZE/2)*k,-(MV.z+SIZE/2)*k);
  g.imageSmoothingEnabled=true; g.drawImage(MAPI.canvas,0,0);
  if(GPS.route){ g.strokeStyle='#ff3bd0'; g.lineWidth=5*k/s; g.lineJoin='round'; g.beginPath(); GPS.route.forEach((p,i)=>{ const X=(p[0]+SIZE/2)*k, Z=(p[1]+SIZE/2)*k; i?g.lineTo(X,Z):g.moveTo(X,Z); }); g.stroke(); }
  g.restore();
  const toS=(x,z)=>[w/2+(x-MV.x)*s,h/2+(z-MV.z)*s];
  g.textAlign='center'; for(const r of W.data.places.regions||[]){ const [X,Y]=toS(r.x,r.z); g.font='italic 800 16px Kanit,Arial'; g.fillStyle='rgba(0,0,0,.55)'; g.fillText(r.name,X+1,Y+1); g.fillStyle='#f4f1e8'; g.fillText(r.name,X,Y); }
  for(const m of markers()){ const [X,Y]=toS(m.x,m.z); g.fillStyle=m.col; g.beginPath(); g.arc(X,Y,8,0,6.283); g.fill(); g.strokeStyle='#14151a'; g.lineWidth=2; g.stroke(); if(s>.35){ g.font='700 13px "Barlow Condensed",Arial'; g.fillStyle='#f4f1e8'; g.fillText(m.name,X,Y-13); } }
  const [px,py]=toS(W.car.x,W.car.z); g.save(); g.translate(px,py); g.rotate(-W.car.h+Math.PI); g.fillStyle='#ffc21a'; g.strokeStyle='#14151a'; g.lineWidth=2; g.beginPath(); g.moveTo(0,-11); g.lineTo(8,9); g.lineTo(0,5); g.lineTo(-8,9); g.closePath(); g.fill(); g.stroke(); g.restore();
  if(GPS.target){ const [X,Y]=toS(GPS.target.x,GPS.target.z); g.fillStyle='#ff3bd0'; g.beginPath(); g.moveTo(X,Y); g.arc(X,Y-14,9,Math.PI*.8,Math.PI*2.2); g.closePath(); g.fill(); } }
function markers(){ const P=W.data.places, out=[]; if(P.garage) out.push({x:P.garage.x,z:P.garage.z,name:P.garage.name||'Garage',col:'#ffc21a',kind:'garage'}); for(const v of venues()) out.push({x:v.x,z:v.z,name:v.name,col:'#'+v.col.toString(16).padStart(6,'0'),kind:'venue'}); if(P.festival) out.push({x:P.festival.x,z:P.festival.z,name:P.festival.name,col:'#39d9ff',kind:'fest'});
  for(const r of W.data.races||[]){ const s=r.start||(r.route&&{x:r.route[0][0],z:r.route[0][2]})||raceStartFromRoad(r); if(s) out.push({x:s.x,z:s.z,name:r.name,col:'#ff3b4e',kind:'race',race:r}); }
  for(const p of stuntsPrepare()){ const st=stuntRec(p.id).stars; out.push({x:p.x,z:p.z,name:p.name+' '+'★'.repeat(st),col:p.type==='speedtrap'?'#39d9ff':p.type==='driftzone'?'#ff7a1a':'#49e07a',kind:p.type}); } return out; }
function raceStartFromRoad(r){ const rd=W.data.roads.find(q=>q.id===r.road); return rd?{x:rd.pts[0][0],z:rd.pts[0][2]}:null; }
function mapInput(){ const cv=$('#wmapc'); const pts=new Map();
  cv.addEventListener('pointerdown',e=>{ pts.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY}); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove',e=>{ const p=pts.get(e.pointerId); if(!p) return; if(pts.size===2){ const [a,b]=[...pts.values()], d0=Math.hypot(a.x-b.x,a.y-b.y); p.x=e.clientX; p.y=e.clientY; const d1=Math.hypot(a.x-b.x,a.y-b.y); MV.s=clamp(MV.s*d1/d0,.04,3); drawMapView(); return; }
    MV.x-=(e.clientX-p.x)/MV.s; MV.z-=(e.clientY-p.y)/MV.s; p.x=e.clientX; p.y=e.clientY; drawMapView(); });
  cv.addEventListener('pointerup',e=>{ const p=pts.get(e.pointerId); pts.delete(e.pointerId); if(p&&Math.hypot(e.clientX-p.x0,e.clientY-p.y0)<6){ const r=cv.getBoundingClientRect(), x=MV.x+(e.clientX-r.left-r.width/2)/MV.s, z=MV.z+(e.clientY-r.top-r.height/2)/MV.s;
      // a tap on a marker routes to it, anywhere else drops a waypoint
      let tgt={x,z}; for(const m of markers()){ if(Math.hypot((m.x-x)*MV.s,(m.z-z)*MV.s)<16){ tgt=m; break; } } gpsRoute(tgt.x,tgt.z); drawMapView(); } });
  cv.addEventListener('wheel',e=>{ e.preventDefault(); MV.s=clamp(MV.s*Math.exp(-e.deltaY*.0015),.04,3); drawMapView(); },{passive:false});
  $('#wmapClose').onclick=()=>openMap(false); $('#wmapClear').onclick=()=>{ GPS.route=null; GPS.target=null; drawMapView(); }; }

/* ---------------- UI shell ---------------- */
function ui(){ if($('#whud')) return; const st=document.createElement('style'); st.textContent=`
#whud{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
#wload{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(ellipse at 50% 40%,#1a2233,#07080c 70%);color:#f4f1e8}
#wload h2{font-family:var(--display);font-style:italic;font-weight:900;font-size:clamp(28px,5vw,48px)} #wload p{color:#a2a8b6;font-size:17px;min-height:1.3em}
#wload .bar{width:min(420px,80vw);height:8px;background:rgba(255,255,255,.12);transform:skewX(-14deg);overflow:hidden} #wload .bar i{display:block;height:100%;width:0;background:var(--flag);transition:width .25s var(--ease-out)}
#wmap{position:absolute;inset:0;z-index:12;background:#0b1622;display:flex;flex-direction:column} #wmap[hidden]{display:none}
#wmapc{flex:1;width:100%;min-height:0;touch-action:none;cursor:grab}
#wmap .wbar{position:absolute;top:12px;left:var(--gl);right:var(--gr);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#wmap .wbar h2{font-family:var(--display);font-style:italic;font-weight:900;font-size:26px;margin-right:auto;text-shadow:0 2px 8px #000}
#wmap .whelp{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(15,18,26,.85);padding:6px 14px;color:#a2a8b6;font-size:15px;white-space:nowrap}
#wpause{position:absolute;inset:0;z-index:11;display:flex;align-items:center;justify-content:center;background:rgba(8,9,13,.6)} #wpause[hidden]{display:none}
#wpause .sheet{max-width:380px;gap:10px} #wpause .btn{align-self:stretch;text-align:left}
#wres{z-index:13} #wres .prize{font-family:var(--display);font-style:italic;font-weight:900;font-size:30px;color:var(--flag)}
#wflash{position:absolute;inset:0;z-index:9;background:#000;opacity:0;pointer-events:none} #wflash.on{animation:wFlash .6s var(--ease-out)}
@keyframes wFlash{0%{opacity:.9}100%{opacity:0}}`; document.head.appendChild(st);
  const app=$('#app'); HC=document.createElement('canvas'); HC.id='whud'; HC.hidden=true; app.appendChild(HC); hx=HC.getContext('2d');
  app.insertAdjacentHTML('beforeend',`<div id="wflash"></div>
<div id="wres" class="layer overlay" hidden></div>
<div id="wload" hidden><h2>Sideways Island</h2><div class="bar"><i id="wloadBar"></i></div><p id="wloadTxt">Loading…</p></div>
<div id="wmap" hidden><canvas id="wmapc"></canvas><div class="wbar"><h2>Map</h2><button type="button" class="btn sec" id="wmapClear">Clear route</button><button type="button" class="btn" id="wmapClose">Close</button></div><p class="whelp">Drag to move · scroll or pinch to zoom · tap to set a route</p></div>
<div id="wpause" hidden><div class="sheet"><h2>Paused</h2><button type="button" class="btn" id="wpResume">Resume</button><button type="button" class="btn sec" id="wpMap">Map (M)</button><button type="button" class="btn sec" id="wpGarage">Garage</button>
<button type="button" class="btn sec" id="wpRespawn">Back on the road (R)</button><button type="button" class="btn sec" id="wpGfx">Graphics</button><button type="button" class="btn sec" id="wpMenu">Main menu</button></div></div>`);
  mapInput();
  $('#wpResume').onclick=()=>pause(false); $('#wpMap').onclick=()=>{ pause(false); openMap(true); }; $('#wpRespawn').onclick=()=>{ pause(false); respawn(); };
  $('#wpGfx').onclick=()=>{ SGP.Q.level=(SGP.Q.level+1)%3; SGP.store.set('gfx',SGP.Q.level); SGP.applyQuality(); setQuality(); $('#wpGfx').textContent='Graphics: '+SGP.QN[SGP.Q.level]; };
  $('#wpGarage').onclick=()=>{ pause(false); goGarage(); }; $('#wpMenu').onclick=()=>{ pause(false); exit(); }; }
const STACK=[];
function screenPush(id){ if(STACK[STACK.length-1]===id) return; STACK.push(id); screenSync(); }
function screenPop(id){ const i=STACK.lastIndexOf(id); if(i>=0) STACK.splice(i,1); screenSync(); }
function screenSync(){ const top=STACK[STACK.length-1]; W.paused=STACK.includes('pause'); W.mapOpen=STACK.includes('map');
  $('#wpause').hidden=top!=='pause'; $('#wmap').hidden=top!=='map'; const wr=$('#wres'); if(wr) wr.hidden=top!=='res';
  if(top==='pause'){ $('#wpGfx').textContent='Graphics: '+SGP.QN[SGP.Q.level]; $('#wpResume').focus(); }
  if(top==='map'){ MV.x=W.car.x; MV.z=W.car.z; drawMapView(); $('#wmapClose').focus(); }
  if(W.mapOpen||W.paused||top==='res') for(const k in keys) keys[k]=0; W.blockInput=top==='res'; }
function pause(on){ if(on) screenPush('pause'); else screenPop('pause'); }
function setQuality(){ const q=SGP.Q.level; W.viewRoads=[1000,1700,2400][q]; W.viewBld=[900,1500,2200][q]; TER.K=[1.6,2.0,2.4][q]; TER.R=[24,32,32][q];
  if(W.sun){ W.sun.castShadow=q>0; const ms=q===2?2048:1024; W.sun.shadow.mapSize.set(ms,ms); if(W.sun.shadow.map){ W.sun.shadow.map.dispose(); W.sun.shadow.map=null; } }
  if(W.scene) W.scene.fog=new THREE.FogExp2(0xb4c2d4,[.00022,.00016,.00011][q]); TER.last.set(1e9,0,0); }

/* ---------------- load, enter, exit ---------------- */
async function load(){ const bar=$('#wloadBar'), txt=$('#wloadTxt'); let done=0; const total=LAYERS.length*2+4, step=msg=>{ done++; bar.style.width=Math.round(done/total*100)+'%'; if(msg) txt.textContent=msg; };
  txt.textContent='Reading the island…'; const data=await (await fetch('world/world.json')).json(); W.data=data; step();
  N=data.N; SIZE=data.size; CELL=SIZE/(N-1); HMIN=data.hmin; HS=data.hscale; W.snowLine=data.v>=2?620:330; TER.minSize=SIZE/Math.pow(2,data.v>=2?7:6);
  H=new Float32Array(N*N);
  if(data.v>=2){ const im=await pngData('world/height.png'), d=im.data, c=im.channels; if(im.depth===16){ for(let i=0;i<N*N;i++) H[i]=(d[i*c*2]*256+d[i*c*2+1])/HS+HMIN; } else for(let i=0;i<N*N;i++) H[i]=(d[i*c]*256+d[i*c+1])/HS+HMIN; }
  else { const u=new Uint16Array(await (await fetch('world/height.bin')).arrayBuffer()); for(let i=0;i<N*N;i++) H[i]=u[i]/HS+HMIN; }
  step('Shaping mountains and coast…');
  const mi=await pngData('world/map.png'); if(mi.channels===4) MAP=mi.data; else { MAP=new Uint8Array(N*N*4); for(let i=0;i<N*N;i++){ for(let k=0;k<mi.channels;k++) MAP[i*4+k]=mi.data[i*mi.channels+k]; } }
  mapTex=new THREE.DataTexture(MAP,N,N,THREE.RGBAFormat); mapTex.flipY=false; mapTex.magFilter=mapTex.minFilter=THREE.LinearFilter; mapTex.needsUpdate=true; step('Planting forests…');
  const tsz=SGP.Q.level===2?1024:512; const diff=await layerArray('diff',tsz,()=>step('Laying real ground textures…')), nrm=await layerArray('nrm',tsz,()=>step());
  W.layers={diff,nrm}; roadsPrepare(); gpsPrepare(); buildingsPrepare(); paintMap(); step('Opening the roads…'); W.ready=true; }
function build(){ const sc=W.scene=new THREE.Scene(); sc.background=new THREE.Color(0xb4c2d4);
  W.cam=new THREE.PerspectiveCamera(62,1,.5,12000);
  W.sunDir=new THREE.Vector3(-.45,.62,.38).normalize();
  const sun=W.sun=new THREE.DirectionalLight(0xfff1dc,3.1); sun.position.copy(W.sunDir).multiplyScalar(300); sc.add(sun); sc.add(sun.target);
  sun.shadow.bias=-.0005; sun.shadow.normalBias=.04; sun.shadow.radius=3; const S=sun.shadow.camera; S.left=-90; S.right=90; S.top=90; S.bottom=-90; S.near=10; S.far=700;
  sc.add(new THREE.HemisphereLight(0xcfe0ff,0x4f5a3a,.75*SGP.LK*.45));
  const env=SGP.ENVS&&(SGP.ENVS.park||SGP.ENVS.sky); if(env) sc.environment=env; sc.environmentIntensity=.9;
  W.sky=skyDome(); sc.add(W.sky);
  // the sea
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(SIZE*2.2,SIZE*2.2,1,1),new THREE.MeshPhysicalMaterial({color:0x0e3550,roughness:.06,metalness:0,clearcoat:1,clearcoatRoughness:.04,transparent:true,opacity:.92}));
  sea.rotation.x=-Math.PI/2; sea.position.y=-.05; sea.material.envMapIntensity=1.2; sc.add(sea); W.sea=sea;
  TER.mat=terrainMaterial(W.layers.diff,W.layers.nrm,SGP.Q.level>0?1:0);
  W.fx=SGP.makeParticles(600,false); sc.add(W.fx.pts);
  setQuality(); }
async function enter(){ if(W.on||W.loading) return; ui(); SGP.audioInit(); const ld=$('#wload'); ld.hidden=false;
  try{ if(!W.ready) await (W.loading=load()); if(!W.scene) build(); }
  catch(e){ console.warn('Open world could not load',e); $('#wloadTxt').textContent='The island could not load: '+(e&&e.message||e); W.loading=null; setTimeout(()=>{ ld.hidden=true; },2500); return; }
  W.loading=null;
  // the car you have selected, parked at the festival (or where you left it)
  const C=SGP.CAREER, sv=C&&C.world&&typeof C.world==='object'?C.world:null, sp=W.data.places.spawn||{x:0,z:0,h:0};
  const x=sv&&isFinite(sv.x)?sv.x:sp.x, z=sv&&isFinite(sv.z)?sv.z:sp.z, h=sv&&isFinite(sv.h)?sv.h:sp.h||0;
  if(W.car){ W.scene.remove(W.car.m.group); SGP.disposeTree(W.car.m.group); }
  if(RACE.on) raceEnd(); W.car=makeCar(SGP.sel.car,x,z,h); W.cars=[W.car]; W.scene.add(W.car.m.group); if(!W.beacons) beacons(); const rq=roadQuery(x,z); W.car.y=rq&&rq.d<1?rq.y+.1:heightAt(x,z); W.odo=0; snapPrev(); DRAW.x=W.car.x; DRAW.y=W.car.y; DRAW.z=W.car.z; DRAW.h=W.car.h;
  SGP.setTR({grip:1,th:{night:false,glow:.6},id:'world'}); G.player=W.car; G.rs={driftLong:0,boosts:0,crashes:0,spun:0,hits:0}; G.speedMul=1; G.state='world'; W.on=true; W.paused=false; W.camSnap=true; CAM.h=h;
  $('#menu').hidden=true; ['#tune','#hud','#results','#pause'].forEach(s=>{ const e=$(s); if(e) e.hidden=true; }); HC.hidden=false; if(SGP.touchMode) $('#touch').hidden=false;
  terrainUpdate(true); while(TER.queue.length) terrainBuild(1e9); roadsUpdate(1e9); buildingsUpdate(1e9);
  ld.hidden=true; SGP.resize(true); flash(); }
function exit(after){ if(!W.on) return; if(RACE.on) raceEnd(); trafClear(); savePos(); W.on=false; STACK.length=0; screenSync(); G.state='menu'; G.player=null; SGP.setTR(null); HC.hidden=true; $('#touch').hidden=true; openMap(false); SGP.engSilence();
  $('#menu').hidden=false; SGP.GAR.dirty=true; SGP.garShot('intro',null,true); SGP.RIG.base=''; SGP.renderMenu(); if(after) after(); }
function savePos(){ const C=SGP.CAREER; if(!C||!W.car) return; const w=C.world&&typeof C.world==='object'?C.world:(C.world={}); w.x=Math.round(W.car.x*10)/10; w.z=Math.round(W.car.z*10)/10; w.h=Math.round(W.car.h*1000)/1000; SGP.saveCareer(); }
function venues(){ const F=W.data.places.festival; if(!F) return []; return [{id:'arena',name:'Sideways Arena',x:F.x+70,z:F.z-40,col:0x39d9ff,step:0,line:'Classic races with power-ups, Endurance, Hot Potato and more'},
  {id:'tour',name:'The Ten: campaign',x:F.x-70,z:F.z-40,col:0xb58cff,step:8,line:'Fifty stages against the same ten rivals'}]; }
const venueNear = () => { const c=W.car; return venues().find(v=>Math.hypot(v.x-c.x,v.z-c.z)<26)||null; };
function goVenue(v){ exit(()=>{ W.returnAfterRace=true; SGP.go(v.step); }); }
function goGarage(){ const G0=W.data.places.garage, c=W.car; if(G0&&Math.hypot(G0.x-c.x,G0.z-c.z)>30){ c.x=G0.x; c.z=G0.z+12; c.h=G0.h||0; c.vx=c.vz=0; c.y=groundAt(c.x,c.z); }
  exit(()=>{ W.returnAfterTune=true; SGP.openTune('paint'); }); }
function interact(){ const P=W.data.places, c=W.car; if(RACE.on) return false; const rn=raceNear(); if(rn){ raceStart(rn); return true; } const vn=venueNear(); if(vn){ goVenue(vn); return true; } if(P.garage&&Math.hypot(P.garage.x-c.x,P.garage.z-c.z)<30){ goGarage(); return true; } return false; }

/* ---------------- races out on the roads ----------------
   A race marker (a pillar of light) stands at every start. Drive into it and press E: the field lines up on the road,
   counts down and races the route (laps on a loop, point to point on a sprint) against rivals driven by the same
   physics, which follow the route, brake for the corners ahead and bump into you. */
let RACE={on:false};
const T1={x:0,y:0,z:0,h:0}, T2={x:0,y:0,z:0,h:0};
function routeOf(r){ let P=r.route, hw=6; if(!P){ const rd=W.data.roads.find(q=>q.id===r.road); if(!rd) return null; P=rd.pts; hw=rd.hw; } else { const rq=roadQuery(P[0][0],P[0][2]); if(rq) hw=rq.hw; }
  const n=P.length, x=new Float32Array(n), y=new Float32Array(n), z=new Float32Array(n), s=new Float32Array(n); let acc=0;
  for(let i=0;i<n;i++){ x[i]=P[i][0]; y[i]=P[i][1]; z[i]=P[i][2]; if(i) acc+=Math.hypot(x[i]-x[i-1],z[i]-z[i-1]); s[i]=acc; }
  const gap=Math.hypot(x[0]-x[n-1],z[0]-z[n-1]), closed=(r.laps|0)>0&&gap<60; return {x,y,z,s,n,closed,hw,len:closed?acc+gap:acc}; }
function routeAt(R,d,o){ if(R.closed) d=((d%R.len)+R.len)%R.len; else d=clamp(d,0,R.len-.01);
  let lo=0, hi=R.n-1; if(d>=R.s[R.n-1]){ lo=R.n-1; } else { while(hi-lo>1){ const m=(lo+hi)>>1; if(R.s[m]<=d) lo=m; else hi=m; } }
  const a=lo, b=lo+1<R.n?lo+1:0, sb=b?R.s[b]:R.len, t=clamp((d-R.s[a])/Math.max(.001,sb-R.s[a]),0,1);
  o.x=R.x[a]+(R.x[b]-R.x[a])*t; o.y=R.y[a]+(R.y[b]-R.y[a])*t; o.z=R.z[a]+(R.z[b]-R.z[a])*t; o.h=Math.atan2(R.x[b]-R.x[a],R.z[b]-R.z[a]); return o; }
const raceList = () => (W.data.races||[]).map(r=>{ const R=r._R||(r._R=routeOf(r)); if(!R) return null; const st=r.start||{x:R.x[0],z:R.z[0],h:Math.atan2(R.x[1]-R.x[0],R.z[1]-R.z[0])}; return {r,R,st}; }).filter(Boolean);
function raceNear(){ if(RACE.on) return null; const c=W.car; for(const q of raceList()) if(Math.hypot(q.st.x-c.x,q.st.z-c.z)<22) return q; return null; }
function raceStart(q){ trafClear(); const {r,R}=q, SG=SGP, nAI=7, laps=R.closed?Math.max(1,r.laps|0):1, lane=Math.min(2.6,R.hw*.42);
  const diff=SG.DIFFS?SG.DIFFS[SG.sel.diff]:null, pace=diff?diff[1]:.99, sale=SG.SALE_CARS||SG.CARS.map((c,i)=>i).filter(i=>SG.CARS[i].tier<4);
  RACE={on:true, r, R, laps, state:'count', cd:3.6, t:0, cars:[], order:[], done:false, endT:0, pace};
  // the grid: rivals in front, the player at the back, two abreast, 8 m between rows; a sprint starts a little up the road
  const base=R.closed?0:8*(Math.ceil((nAI+1)/2)+1), names=['Nova','Blaze','Kato','Ziggy','Mako','Rhea','Dash','Onyx','Juno','Pax','Lux','Rook'].sort(()=>Math.random()-.5);
  const slot=k=>{ const row=k>>1, side=k&1?-1:1; routeAt(R,base-8-row*8,T1); return {x:T1.x+Math.cos(T1.h)*side*lane,z:T1.z-Math.sin(T1.h)*side*lane,h:T1.h,s:base-8-row*8}; };
  for(let k=0;k<nAI;k++){ const ci=sale[Math.floor(Math.random()*sale.length)], sp=slot(k), look=SG.aiLook?SG.aiLook(ci):undefined;
    const c=makeCar(ci,sp.x,sp.z,sp.h,{ai:true,spec:SG.CARS[ci],look,det:SG.Q.level?1:0,name:names[k%names.length]}); c.skill=pace*(.95+Math.random()*.08); c.topMul=c.skill;
    c.race={i:0,s:sp.s,lap:sp.s<0&&R.closed?-1:0,total:0,lane:(k&1?-1:1)*lane*(.4+Math.random()*.6),done:false}; W.scene.add(c.m.group); W.cars.push(c); RACE.cars.push(c); }
  const me=W.car, sp=slot(nAI); me.x=sp.x; me.z=sp.z; me.h=sp.h; me.vx=me.vz=me.vy=0; me.speed=0; me.air=false; me.y=groundAt(me.x,me.z);
  me.race={i:0,s:sp.s,lap:sp.s<0&&R.closed?-1:0,total:0,lane:0,done:false}; RACE.cars.push(me);
  for(const c of RACE.cars){ raceSeek(c,true); c.p0x=c.dx=c.x; c.p0z=c.dz=c.z; c.p0y=c.dy=c.y; c.p0h=c.dh=c.h; }
  GPS.route=null; GPS.target=null; RACE.line=Array.from({length:R.n},(_,i)=>[R.x[i],R.z[i]]); W.camSnap=true; W.streamNow=true; CAM.h=me.h; flash(); SGP.SFX.beep&&SGP.SFX.beep(); }
// where a car is along the route: the nearest point near the last one; crossing the line counts a lap
function raceSeek(c,full){ const R=RACE.R, me=c.race; let best=me.i, bd=1e18; const from=full?0:-30, to=full?R.n-1:50;
  for(let k=from;k<=to;k++){ let i=full?k:me.i+k; if(R.closed) i=((i%R.n)+R.n)%R.n; else if(i<0||i>=R.n) continue; const d=(R.x[i]-c.x)**2+(R.z[i]-c.z)**2; if(d<bd){ bd=d; best=i; } }
  if(!full&&R.closed){ if(me.i>R.n*.75&&best<R.n*.25) me.lap++; else if(me.i<R.n*.25&&best>R.n*.75) me.lap--; }
  me.i=best; me.s=R.s[best]; me.total=me.lap*R.len+me.s; me.off=Math.sqrt(bd); }
function aiReset(c){ const R=RACE.R; if(!R||!c.race) return; routeAt(R,c.race.s,T1); c.x=T1.x; c.z=T1.z; c.h=T1.h; c.vx=c.vz=c.vy=0; c.air=false; c.wetT=0; c.y=groundAt(c.x,c.z); c.p0x=c.x; c.p0z=c.z; c.p0y=c.y; c.p0h=c.h; }
// rivals: aim at a point ahead on the route (in their lane), and pick a speed they can still brake from for the corners coming up
function aiDrive(c){ const R=RACE.R, me=c.race, k=c.ctrl; if(RACE.state==='count'||me.done&&me.coast>2){ k.th=0; k.br=1; k.st=0; return; }
  const look=9+c.speed*.5; routeAt(R,me.s+look,T1); const lx=Math.cos(T1.h), lz=-Math.sin(T1.h), tx=T1.x+lx*me.lane, tz=T1.z+lz*me.lane;
  const ang=wrapPi(Math.atan2(tx-c.x,tz-c.z)-c.h); k.st=clamp(ang*2.6,-1,1); k.drift=false;
  const aLat=12.5*c.skill*(c.surface==='road'?1:.75), aBrk=15; let vt=c.spec.top*c.topMul;
  routeAt(R,me.s,T2); let h0=T2.h;
  for(const d of [20,40,65,95,135,180]){ routeAt(R,me.s+d,T2); const kap=Math.abs(wrapPi(T2.h-h0))/20; h0=T2.h; routeAt(R,me.s+d+20,T2); const kk=Math.max(kap,Math.abs(wrapPi(T2.h-h0))/20,1e-4);
    vt=Math.min(vt,Math.sqrt(aLat/kk+2*aBrk*Math.max(0,d-10))); }
  routeAt(R,me.s+12,T2); vt=Math.min(vt,Math.sqrt(aLat/Math.max(1e-4,Math.abs(wrapPi(T2.h-routeAt(R,me.s,T1).h))/12)));
  // a little rubber band so the field stays together
  const p=W.car.race, gap=p?me.total-p.total:0; c.topMul=c.skill*(gap<-160?1.05:gap>220?.96:1);
  k.th=c.speed<vt*.97?1:0; k.br=c.speed>vt*1.06?clamp((c.speed-vt)/8,.2,1):0; if(me.off>R.hw+6) k.th=Math.min(k.th,.6); }
function carCollisions(){ const L=W.cars; for(let i=0;i<L.length;i++) for(let j=i+1;j<L.length;j++){ const a=L[i], b=L[j]; let dx=b.x-a.x, dz=b.z-a.z; const d2=dx*dx+dz*dz; if(d2>16) continue;
    const d=Math.sqrt(d2)||.01, nx=dx/d, nz=dz/d, pen=2.3-d; if(pen<=0) continue; const ma=a.spec.mass||1, mb=b.spec.mass||1, tot=ma+mb;
    for(const q of [a,b]) if(q.traffic&&q.traffic.mode==='path'){ q.traffic.mode='phys'; q.traffic.still=0; }
    a.x-=nx*pen*mb/tot; a.z-=nz*pen*mb/tot; b.x+=nx*pen*ma/tot; b.z+=nz*pen*ma/tot;
    const rv=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz; if(rv<0){ const imp=-1.25*rv/(1/ma+1/mb); a.vx-=imp/ma*nx; a.vz-=imp/ma*nz; b.vx+=imp/mb*nx; b.vz+=imp/mb*nz;
      if((a.isPlayer||b.isPlayer)&&-rv>5){ SGP.SFX.crash&&SGP.SFX.crash(); W.shake=Math.min(.6,-rv/25); } } } }
function raceStep(dt){ if(!RACE.on) return; if(RACE.state==='count'){ RACE.cd-=dt; for(const c of RACE.cars){ c.vx=c.vz=0; } if(RACE.cd<=0){ RACE.state='race'; SGP.SFX.go&&SGP.SFX.go(); } return; }
  RACE.t+=dt; for(const c of RACE.cars){ const me=c.race; raceSeek(c,false); if(me.done){ me.coast=(me.coast||0)+dt; continue; }
    const fin=RACE.R.closed?me.lap>=RACE.laps:me.s>=RACE.R.len-6; if(fin){ me.done=true; me.time=RACE.t; RACE.order.push(c); if(c.isPlayer){ RACE.done=true; RACE.endT=0; SGP.SFX.win&&SGP.SFX.win(); } } }
  if(RACE.done){ RACE.endT+=dt; if(RACE.endT>2.2&&!RACE.shown){ RACE.shown=true; raceResults(); } } }
function racePlace(c){ const L=RACE.cars.slice().sort((a,b)=>{ const A=a.race, B=b.race; if(A.done&&B.done) return A.time-B.time; if(A.done) return -1; if(B.done) return 1; return B.total-A.total; }); return L.indexOf(c)+1; }
function raceResults(){ const me=W.car, place=racePlace(me), n=RACE.cars.length, C=SGP.CAREER, diff=SGP.DIFFS?SGP.DIFFS[SGP.sel.diff]:null;
  const km=RACE.R.len*RACE.laps/1000, base=[2600,1900,1400,1100,850,700,550,450][Math.min(7,place-1)], cr=Math.round(base*Math.sqrt(n/8)*Math.min(3,Math.max(.6,Math.sqrt(km/3)))*(diff?diff[4]:1)/10)*10;
  if(C){ C.credits+=cr; C.earned+=cr; C.races++; if(place===1) C.wins++; if(place<=3) C.podiums++; C.dist+=RACE.R.len*RACE.laps; const tr=C.tracks['w_'+RACE.r.id]||(C.tracks['w_'+RACE.r.id]={races:0,wins:0}); tr.races++; if(place===1) tr.wins++; if(!tr.best||me.race.time<tr.best) tr.best=me.race.time; SGP.saveCareer(); }
  const tm=t=>{ const m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(2); };
  const rows=RACE.cars.slice().sort((a,b)=>racePlace(a)-racePlace(b)).map((c,i)=>`<tr class="${c.isPlayer?'me':''}"><td>${i+1}</td><td>${c.isPlayer?'You':c.name}</td><td>${c.spec.name}</td><td>${c.race.done?tm(c.race.time):'-'}</td></tr>`).join('');
  $('#wres').innerHTML=`<div class="sheet"><h2>${place===1?'You won!':'Finished '+place+(['st','nd','rd'][place-1]||'th')}</h2><p class="sub">${RACE.r.name} · ${km.toFixed(1)} km</p><div class="tblwrap"><table>${rows}</table></div><p class="prize">+${cr.toLocaleString()} CR</p><div class="row"><button type="button" class="btn" id="wresOk">Continue</button><button type="button" class="btn sec" id="wresAgain">Race again</button></div></div>`;
  screenPush('res'); $('#wresOk').onclick=()=>{ screenPop('res'); raceEnd(); }; $('#wresAgain').onclick=()=>{ const q=raceList().find(x=>x.r===RACE.r); screenPop('res'); raceEnd(); if(q) raceStart(q); }; $('#wresOk').focus(); }
function raceEnd(){ for(const c of RACE.cars) if(!c.isPlayer){ W.scene.remove(c.m.group); SGP.disposeTree(c.m.group); } W.cars=[W.car]; W.car.race=null; RACE={on:false}; }
// beacons: a tall column of light over every race start and the garage, seen from across the island
function beacons(){ const g=new THREE.CylinderGeometry(3,3,220,16,1,true); g.translate(0,110,0); const tx=SGP.cvTex('wbeam',8,128,(c,w,h)=>{ const gr=c.createLinearGradient(0,h,0,0); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(.25,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); c.fillStyle=gr; c.fillRect(0,0,w,h); });
  const mk=(x,z,col)=>{ const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tx,color:new THREE.Color(col).multiplyScalar(2.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide})); m.position.set(x,groundAt(x,z),z); m.renderOrder=2; W.scene.add(m); return m; };
  W.beacons=raceList().map(q=>({q,m:mk(q.st.x,q.st.z,0xff3b4e)})); const G0=W.data.places.garage; if(G0) W.beacons.push({m:mk(G0.x,G0.z,0xffc21a)}); for(const v of venues()) W.beacons.push({m:mk(v.x,v.z,v.col)}); }

/* ---------------- challenges on the road: speed traps, drift zones, jumps ----------------
   They come from the world data (pois) or, when it has none, are found on the roads: speed traps on the longest
   straights, drift zones on the twistiest stretches, jumps where a road crests sharply. Each one keeps your best and
   pays credits the first time you earn each star. */
const STUNT={list:null, zone:null, jump:null};
const STAR={speedtrap:[180,230,280], driftzone:[15000,40000,80000], jump:[25,50,90]};
function stuntsPrepare(){ if(STUNT.list) return STUNT.list; let L=(W.data.pois||[]).filter(p=>STAR[p.type]).map((p,i)=>Object.assign({id:p.type+i},p));
  if(!L.length){ L=[]; const roads=W.data.roads.filter(r=>r.type!=='street'&&r.pts.length>120); let k=0;
    for(const r of roads){ const P=r.pts, n=P.length, H=i=>{ i=clamp(i,1,n-2); return Math.atan2(P[i+1][0]-P[i-1][0],P[i+1][2]-P[i-1][2]); }; let bestS=-1, bestSv=1e9, bestD=-1, bestDv=0, bestJ=-1, bestJv=0; const w=Math.max(20,Math.round(260/Math.max(1,Math.hypot(P[1][0]-P[0][0],P[1][2]-P[0][2]))));
      for(let i=w;i<n-w;i+=6){ let turn=0; for(let j=i-w;j<i+w;j+=3) turn+=Math.abs(wrapPi(H(j+3)-H(j))); if(turn<bestSv){ bestSv=turn; bestS=i; } if(turn>bestDv){ bestDv=turn; bestD=i; }
        const crest=(P[i][1]-P[i-8][1])-(P[i+8][1]-P[i][1]); if(crest>bestJv){ bestJv=crest; bestJ=i; } }
      if(bestS>0&&r.type!=='dirt') L.push({id:'speedtrap'+(k++),type:'speedtrap',x:P[bestS][0],z:P[bestS][2],h:H(bestS),road:r.id,name:(r.name||'Road')+' speed trap'});
      if(bestD>0&&bestDv>1.6) L.push({id:'driftzone'+(k++),type:'driftzone',x:P[bestD][0],z:P[bestD][2],h:H(bestD),road:r.id,len:420,i0:Math.max(0,bestD-Math.round(w*.8)),i1:Math.min(n-1,bestD+Math.round(w*.8)),name:(r.name||'Road')+' drift zone'});
      if(bestJ>0&&bestJv>1.2) L.push({id:'jump'+(k++),type:'jump',x:P[bestJ][0],z:P[bestJ][2],h:H(bestJ),road:r.id,name:(r.name||'Road')+' jump'}); } }
  for(const p of L) if(p.type==='driftzone'&&p.i0==null){ const rd=W.data.roads.find(r=>r.id===p.road); if(rd){ let b=0, bd=1e18; rd.pts.forEach((q,i)=>{ const d=(q[0]-p.x)**2+(q[2]-p.z)**2; if(d<bd){ bd=d; b=i; } }); const w=Math.round((p.len||400)/2/8); p.i0=Math.max(0,b-w); p.i1=Math.min(rd.pts.length-1,b+w); } }
  return STUNT.list=L; }
const stuntRec = id => { const C=SGP.CAREER; if(!C) return {best:0,stars:0}; const w=C.world&&typeof C.world==='object'?C.world:(C.world={}); const pr=w.pr||(w.pr={}); return pr[id]||(pr[id]={best:0,stars:0}); };
function stuntScore(p,v,unit){ const T=STAR[p.type], st=v>=T[2]?3:v>=T[1]?2:v>=T[0]?1:0, rec=stuntRec(p.id), gained=Math.max(0,st-rec.stars), C=SGP.CAREER;
  const better=v>rec.best; if(better) rec.best=Math.round(v); let cr=0; if(gained&&C){ cr=[0,300,600,1200].slice(rec.stars+1,st+1).reduce((a,b)=>a+b,0); C.credits+=cr; C.earned+=cr; rec.stars=st; }
  if(better||gained) SGP.saveCareer(); toast(`${p.name}: ${Math.round(v).toLocaleString()} ${unit} ${'★'.repeat(st)}${'☆'.repeat(3-st)}`+(cr?`  +${cr.toLocaleString()} CR`:better?'  new best':'')); }
function toast(msg){ W.toastMsg=msg; W.toastT=3.4; }
function stuntsStep(dt){ if(RACE.on) return; const c=W.car, L=stuntsPrepare();
  for(const p of L){ const dx=c.x-p.x, dz=c.z-p.z, d2=dx*dx+dz*dz;
    if(p.type==='speedtrap'){ const side=dx*Math.sin(p.h)+dz*Math.cos(p.h); if(d2<26*26&&p._side!=null&&Math.sign(side)!==Math.sign(p._side)&&c.speed>8){ stuntScore(p,c.speed*6,'km/h'); SGP.SFX.pickup&&SGP.SFX.pickup(); } p._side=d2<60*60?side:null; } }
  // drift zone: points from the drift combo while inside the stretch of road
  const rq=roadQuery(c.x,c.z); let inZone=null; if(rq&&rq.d<4) for(const p of L) if(p.type==='driftzone'&&rq.road.id===p.road&&rq.i>=p.i0&&rq.i<=p.i1){ inZone=p; break; }
  if(inZone&&!STUNT.zone){ STUNT.zone={p:inZone,score:0}; toast(inZone.name+': drift!'); }
  if(STUNT.zone){ const z=STUNT.zone; if(c.drifting){ const slip=Math.abs(c.vl)/(c.speed+.01); z.score+=c.speed*(.35+slip)*dt*14*6; }
    if(!inZone){ stuntScore(z.p,z.score,'pts'); STUNT.zone=null; } }
  // jumps: distance from take-off to landing
  if(c.air&&!STUNT.jump){ STUNT.jump={x:c.x,z:c.z,p:L.find(p=>p.type==='jump'&&(c.x-p.x)**2+(c.z-p.z)**2<45*45)||null}; }
  else if(!c.air&&STUNT.jump){ const j=STUNT.jump, d=Math.hypot(c.x-j.x,c.z-j.z); STUNT.jump=null; if(j.p&&d>6) stuntScore(j.p,d,'m'); else if(d>20) toast('Air time: '+Math.round(d)+' m'); } }

/* ---------------- traffic ----------------
   Cars driving the roads around you in their lane, turning at junctions now and then. They run on rails (cheap) until
   you hit one: then it becomes a physics car for a few seconds, slides off, and rejoins the road when it is still. */
const TRAF={cars:[], t:0};
const trafMax = () => [6,14,24][SGP.Q.level];
function trafSpawn(){ const F=ROAD.flat, me=W.car, R=W.data.roads; for(let tries=0;tries<30;tries++){ const i=Math.floor(Math.random()*F.n), d=Math.hypot(F.fx[i]-me.x,F.fz[i]-me.z); if(d<250||d>900) continue;
    const r=R[F.road[i]]; if(r.type==='track'||r.type==='dirt') continue; const pool=SGP.SALE_CARS.filter(k=>SGP.CARS[k].tier<=1), ci=pool[Math.floor(Math.random()*pool.length)];
    const c=makeCar(ci,F.fx[i],F.fz[i],0,{ai:true,spec:SGP.CARS[ci],look:SGP.aiLook?Object.assign(SGP.aiLook(ci),{kit:{}}):undefined,det:0}); c.traffic={r,j:i-r.i0,dir:Math.random()<.5?1:-1,v:0,cruise:(r.type==='hwy'?26:r.type==='street'?13:18)*(.85+Math.random()*.3),mode:'path',still:0};
    W.scene.add(c.m.group); TRAF.cars.push(c); W.cars.push(c); return; } }
function trafDrop(c){ W.scene.remove(c.m.group); SGP.disposeTree(c.m.group); TRAF.cars.splice(TRAF.cars.indexOf(c),1); W.cars.splice(W.cars.indexOf(c),1); }
function trafStep(dt){ const me=W.car;
  for(const c of TRAF.cars.slice()){ const t=c.traffic;
    if(t.mode==='phys'){ c.ctrl.th=0; c.ctrl.br=1; c.ctrl.st=0; t.still=c.speed<1.5?t.still+dt:0; if(t.still>2.5){ const rq=roadQuery(c.x,c.z); if(rq){ t.r=rq.road; t.j=rq.i; t.mode='path'; t.v=0; } } continue; }
    // on rails: move along the road at cruise speed, slow for the car ahead (you included) and for sharp bends
    const P=t.r.pts, n=P.length; let j=t.j, frac=t.f||0; const ahead=W.cars.some(o=>o!==c&&Math.hypot(o.x-c.x,o.z-c.z)<14&&((o.x-c.x)*Math.sin(c.h)+(o.z-c.z)*Math.cos(c.h))>2);
    const want=ahead?0:t.cruise; t.v+=clamp(want-t.v,-9*dt,4*dt); let move=t.v*dt;
    while(move>0){ const k=j+t.dir; if(k<0||k>=n){ if(t.r.closed){ j=(k+n)%n; continue; }
        // end of the road: carry on along a road that meets here, else turn round
        const F=ROAD.flat, gi=t.r.i0+j, nb=GPS.adj[gi].filter(q=>F.road[q]!==F.road[gi]); if(nb.length){ const q=nb[Math.floor(Math.random()*nb.length)], rr=W.data.roads[F.road[q]]; t.r=rr; j=q-rr.i0; t.dir=j<rr.pts.length/2?1:-1; } else t.dir=-t.dir; break; }
      const a=P[j], b=P[k], seg=Math.hypot(b[0]-a[0],b[2]-a[2])||1; if(frac+move<seg){ frac+=move; move=0; } else { move-=seg-frac; frac=0; j=k;
        if(Math.random()<.04){ const F=ROAD.flat, gi=t.r.i0+j, nb=GPS.adj[gi].filter(q=>F.road[q]!==F.road[gi]); if(nb.length){ const q=nb[Math.floor(Math.random()*nb.length)], rr=W.data.roads[F.road[q]]; if(rr.type!=='track'&&rr.type!=='dirt'){ t.r=rr; j=q-rr.i0; t.dir=Math.random()<.5?1:-1; frac=0; break; } } } } }
    t.j=j; t.f=frac; const P2=t.r.pts, n2=P2.length, a=P2[clamp(j,0,n2-1)], b=P2[clamp(j+t.dir,0,n2-1)], seg=Math.hypot(b[0]-a[0],b[2]-a[2])||1, u=clamp(frac/seg,0,1);
    const h=Math.atan2(b[0]-a[0],b[2]-a[2]), lane=Math.min(t.r.hw*.5,3.2), x=a[0]+(b[0]-a[0])*u+Math.cos(h)*-lane, z=a[2]+(b[2]-a[2])*u-Math.sin(h)*-lane;
    c.vx=(x-c.x)/dt; c.vz=(z-c.z)/dt; c.x=x; c.z=z; c.h=h; c.y=a[1]+(b[1]-a[1])*u+((RTYPE[t.r.type]||RTYPE.road).dy); c.speed=t.v; c.vf=t.v;
    // hit by you: it becomes a physics car
    if(Math.hypot(c.x-me.x,c.z-me.z)<2.6&&me.speed>4){ t.mode='phys'; }
    const d=Math.hypot(c.x-me.x,c.z-me.z); if(d>1300) trafDrop(c); }
  TRAF.t-=dt; if(TRAF.t<=0){ TRAF.t=.5; if(TRAF.cars.length<trafMax()&&!RACE.on) trafSpawn(); } }
function trafClear(){ for(const c of TRAF.cars.slice()) trafDrop(c); }

/* ---------------- frame ----------------
   Physics runs at a fixed 120 Hz (the same result at any frame rate), at most 12 steps per frame (below 10 FPS the game
   slows down instead of launching the car); the car is drawn between the last two steps so nothing jitters. */
const STEP=1/120, MAXSTEPS=12; let acc=0, saveT=0; const PREV={x:0,y:0,z:0,h:0}, DRAW={x:0,y:0,z:0,h:0};
function snapPrev(){ for(const c of W.cars){ c.p0x=c.dx=c.x; c.p0y=c.dy=c.y; c.p0z=c.dz=c.z; c.p0h=c.dh=c.h; } acc=0; syncDraw(); }
function syncDraw(){ const c=W.car; DRAW.x=c.dx; DRAW.y=c.dy; DRAW.z=c.dz; DRAW.h=c.dh; }
function simulate(dt){ acc+=dt; let n=0;
  while(acc>=STEP&&n<MAXSTEPS){ for(const c of W.cars){ c.p0x=c.x; c.p0y=c.y; c.p0z=c.z; c.p0h=c.h; }
    if(W.autoDrive&&RACE.on&&W.car.race){ W.car.skill=W.car.skill||1; aiDrive(W.car); } else readInput(W.car); if(RACE.on){ if(RACE.state==='count'){ const k=W.car.ctrl; k.th=k.br=0; } for(const c of RACE.cars) if(c.isAI) aiDrive(c); }
    trafStep(STEP); for(const c of W.cars) if(!c.traffic||c.traffic.mode==='phys') stepCarWorld(c,STEP); if(W.cars.length>1) carCollisions(); raceStep(STEP); stuntsStep(STEP); acc-=STEP; n++; }
  if(n===MAXSTEPS) acc=0; const a=acc/STEP;
  for(const c of W.cars){ c.dx=c.p0x+(c.x-c.p0x)*a; c.dy=c.p0y+(c.y-c.p0y)*a; c.dz=c.p0z+(c.z-c.p0z)*a; c.dh=c.p0h+wrapPi(c.h-c.p0h)*a; } syncDraw(); }
W.frame=(dt,raw)=>{ if(!W.on) return; const c=W.car; W.t+=dt; SGP.setT(null);
  if(!W.paused&&!W.mapOpen) simulate(dt); else { for(const q of W.cars){ q.dx=q.x; q.dy=q.y; q.dz=q.z; q.dh=q.h; } syncDraw(); }
  for(const q of W.cars) placeCar(dt,q); W.fx&&W.fx.update(dt); camUpdate(dt);
  // the shadow box follows the car
  const sh=W.sun; sh.target.position.set(DRAW.x,DRAW.y,DRAW.z); sh.position.set(DRAW.x+W.sunDir.x*300,DRAW.y+W.sunDir.y*300,DRAW.z+W.sunDir.z*300);
  W.sky.position.copy(W.cam.position);
  if(W.streamNow){ W.streamNow=false; terrainUpdate(true); while(TER.queue.length) terrainBuild(1e9); roadsUpdate(1e9); buildingsUpdate(1e9); }
  terrainUpdate(false); terrainBuild(4); if((W.t*4|0)!==(W._rt|0)){ W._rt=W.t*4; roadsUpdate(3); buildingsUpdate(3); }
  const P=W.data.places, rn=raceNear(); const vn=venueNear(); W.prompt=RACE.on?'':vn?`Press E: ${vn.name} · ${vn.line}`:rn?`Press E to race: ${rn.r.name} · ${rn.R.closed?Math.max(1,rn.r.laps|0)+' laps':'sprint'} · ${(rn.R.len*(rn.R.closed?Math.max(1,rn.r.laps|0):1)/1000).toFixed(1)} km`:P.garage&&Math.hypot(P.garage.x-c.x,P.garage.z-c.z)<30?'Press E to enter your garage':'';
  if(W.beacons) for(const b of W.beacons){ b.m.visible=!RACE.on; }
  SGP.engUpdate(c,dt);
  saveT+=dt; if(saveT>15){ saveT=0; savePos(); }
  const FX=SGP.FX; FX.ex=1; FX.vig=.32; FX.ca=.0006+Math.min(.0016,c.speed/c.spec.top*.0014); FX.blur=c.boostT>0?.02:Math.max(0,(c.speed/c.spec.top-.6))*.03;
  W.cam.aspect=SGP.bufSize.x/Math.max(1,SGP.bufSize.y); W.cam.updateProjectionMatrix();
  SGP.renderWorld(W.scene,W.cam,0);
  drawHUD(dt); if(W.mapOpen) {} };
W.key=e=>{ if(!W.on) return false; const k=e.code, top=STACK[STACK.length-1];
  if(top==='map'){ if(k==='Escape'||k==='KeyM'){ openMap(false); return true; } return false; }
  if(top==='pause'){ if(k==='Escape'||k==='KeyP'){ pause(false); return true; } return false; }
  if(top==='res') return false;
  if(k==='Escape'||k==='KeyP'){ pause(true); return true; }
  if(k==='KeyM'){ openMap(true); return true; } if(k==='KeyR'){ respawn(); return true; } if(k==='KeyC'){ SGP.camMode=(SGP.camMode+1)%3; return true; }
  if(k==='KeyE'||k==='Enter'){ return interact(); }
  return false; };
W.blocking=()=>W.paused||W.mapOpen||STACK.includes('res');
W.enter=enter; W.exit=exit; W.heightAt=(x,z)=>heightAt(x,z); W.normalAt=(x,z)=>normalAt(x,z); W.mapAt=(x,z)=>mapAt(x,z); W.roadQuery=roadQuery; W.gpsRoute=gpsRoute; W.respawn=respawn;
W.debug={TER,ROAD,BLD,GPS,MAPI,CAM,simulate,snapPrev,DRAW,STUNT,stuntsPrepare,TRAF,get RACE(){return RACE;},raceList,raceStart,racePlace};
})();
