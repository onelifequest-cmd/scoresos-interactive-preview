// Scores OS interactive hero proof. Three.js r170 + Lenis, theme from config.json.
import * as THREE from './vendor/three.module.min.js';
import Lenis from './vendor/lenis.mjs';

const qs = new URLSearchParams(location.search);
const DEFAULT_CFG = 'config.json';
const cfgFile = qs.get('config') || DEFAULT_CFG;
let cfg;
try { cfg = await (await fetch(cfgFile)).json(); }
catch (e) { console.warn('config fetch failed, using defaults', e); cfg = { colors:{}, copy:{}, score:{from:520,to:784,unlockAt:760,durationMs:4200,bands:[[580,'Poor'],[670,'Fair'],[740,'Good'],[851,'Excellent']]}, grass:{bladesDesktop:42000,bladesMobile:9000,cursorRadius:2.6}, chat:{label:'Ask Maxine',href:'#'} }; }
document.getElementById('cfgname').textContent = cfgFile;

// ---------- theming (the "template" part) ----------
const C = Object.assign({deep:'#0E2D1A',primary:'#1A6B3C',gold:'#D4AF37',goldLight:'#F4D96B',mint:'#E8F4ED',low:'#E5484D',mid:'#F5A524'}, cfg.colors);
const root = document.documentElement.style;
root.setProperty('--deep', C.deep); root.setProperty('--primary', C.primary);
root.setProperty('--gold', C.gold); root.setProperty('--goldL', C.goldLight); root.setProperty('--mint', C.mint);
document.querySelectorAll('[data-copy]').forEach(el => { const v = cfg.copy?.[el.dataset.copy]; if (v) el.textContent = v; });
document.querySelectorAll('[data-href]').forEach(el => { const k = el.dataset.href; const v = k === 'chatHref' ? cfg.chat?.href : cfg.copy?.[k]; if (v) el.href = v; });
if (cfg.logo) document.querySelectorAll('#logo,.launcher img').forEach(i => i.src = cfg.logo);
if (cfg.client) document.getElementById('brandname').textContent = cfg.client === 'Scores OS' ? 'Score OS' : cfg.client;
if (cfg.chat?.label) document.getElementById('chatlabel').textContent = cfg.chat.label;

const S = cfg.score;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.has('static');
const mobile = matchMedia('(max-width: 900px)').matches || /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent);

// ---------- score state ----------
const numEl = document.getElementById('num'), bandEl = document.getElementById('band'), unlockEl = document.getElementById('unlock');
function bezier(x1,y1,x2,y2){ // cubic-bezier(.35,0,0,1) like Lusion's house curve
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const X=t=>((ax*t+bx)*t+cx)*t, Y=t=>((ay*t+by)*t+cy)*t, dX=t=>(3*ax*t+2*bx)*t+cx;
  return x=>{let t=x;for(let i=0;i<8;i++){const d=dX(t);if(Math.abs(d)<1e-6)break;t-=(X(t)-x)/d;}return Y(Math.min(1,Math.max(0,t)));};
}
const ease = bezier(.35,0,0,1);
const forced = qs.has('score') ? +qs.get('score') : null;
let climbStart = performance.now() + 600;
let score = S.from, burst = 0, wasUnlocked = false;
function bandFor(v){ for (const [max,name] of S.bands) if (v < max) return name; return S.bands.at(-1)[1]; }
function hexToRgb(h){ const c = new THREE.Color(h); return c; }
function scoreColor(t){ // 0..1 along from->to
  const low=hexToRgb(C.low), mid=hexToRgb(C.mid), good=new THREE.Color('#2fbf71'), top=hexToRgb(C.gold);
  if (t < .4) return low.lerp(mid, t/.4);
  if (t < .75) return mid.lerp(good, (t-.4)/.35);
  return good.lerp(top, (t-.75)/.25);
}
function updateScore(now){
  let v;
  if (forced !== null) v = forced;
  else if (reduced) v = S.to;
  else { const t = Math.min(1, Math.max(0, (now - climbStart) / S.durationMs)); v = S.from + (S.to - S.from) * ease(t); }
  score = v;
  const t = (v - S.from) / (S.to - S.from);
  numEl.textContent = Math.round(v);
  numEl.style.color = '#' + scoreColor(t).getHexString();
  bandEl.textContent = bandFor(v);
  const un = v >= S.unlockAt;
  unlockEl.classList.toggle('on', un);
  if (un && !wasUnlocked) burst = 1;
  wasUnlocked = un;
  return Math.min(1, Math.max(0, t));
}
document.getElementById('replay').onclick = () => { climbStart = performance.now(); wasUnlocked = false; };

// ---------- WebGL ----------
const canvas = document.getElementById('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  document.documentElement.classList.add('no-webgl');
  const loop = now => { updateScore(now); if (!reduced) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__proof = { webgl: false };
} else {
  start();
}

function start(){
  const DPR_CAP = mobile ? 1.25 : 1.5;            // Lusion caps at 1.5 too
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  const deep = new THREE.Color(C.deep);
  scene.fog = new THREE.Fog(deep, 8, 24);

  // ---- instanced grass ----
  const N = mobile ? cfg.grass.bladesMobile : cfg.grass.bladesDesktop;
  const blade = new THREE.PlaneGeometry(0.07, 1, 1, 5); blade.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index; geo.setAttribute('position', blade.attributes.position); geo.setAttribute('uv', blade.attributes.uv);
  const off = new Float32Array(N*3), rnd = new Float32Array(N*4);
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const W = mobile ? 9 : 16, Z0 = -12, Z1 = 4.2;
  for (let i=0;i<N;i++){
    const z = Z0 + Math.pow(rand(), 0.7) * (Z1 - Z0);   // denser near camera
    off.set([(rand()-.5)*2*W*(1+(Z1-z)*0.06), 0, z], i*3);
    rnd.set([rand(), rand(), rand(), rand()], i*4);
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = N;

  const U = {
    uTime:{value:0}, uGrow:{value:0}, uMouse:{value:new THREE.Vector3(99,0,99)}, uStrength:{value:0},
    uRadius:{value:cfg.grass.cursorRadius}, uBurst:{value:0},
    cDeep:{value:deep}, cPrim:{value:new THREE.Color(C.primary)}, cMint:{value:new THREE.Color(C.mint)},
    cGold:{value:new THREE.Color(C.gold)}, cGoldL:{value:new THREE.Color(C.goldLight)},
    fogColor:{value:deep}, fogNear:{value:8}, fogFar:{value:24}
  };
  const grassMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */`
      attribute vec3 aOffset; attribute vec4 aRnd;
      uniform float uTime,uGrow,uStrength,uRadius; uniform vec3 uMouse;
      varying float vH, vGold, vNear; varying float vFogDepth;
      void main(){
        float h = uv.y;
        float H = mix(0.14, 0.9, uGrow) * (0.5 + aRnd.x*0.9);
        vec3 p = position; p.x *= (1.0 - h*0.9); p.y = h*H;
        float a = aRnd.y*6.2831; p.xz = mat2(cos(a),-sin(a),sin(a),cos(a)) * p.xz;
        vec3 w = aOffset + p;
        float bend = h*h;
        float wave = sin(uTime*1.4 + aOffset.x*0.55 + aOffset.z*0.35 + aRnd.z*6.2831);
        float gust = sin(uTime*0.45 + aOffset.x*0.12)*0.5+0.5;
        w.x += (0.10 + 0.16*gust) * wave * bend * H;
        w.z += 0.05 * cos(uTime*1.1 + aRnd.z*9.0) * bend * H;
        // bend TOWARD the cursor, falloff by distance
        vec2 d = uMouse.xz - aOffset.xz; float dist = length(d);
        float f = smoothstep(uRadius, 0.0, dist) * uStrength;
        w.xz += (d/(dist+1e-3)) * min(dist, 1.1*H) * f * bend;
        w.y  -= 0.35 * f * bend * H;
        vNear = f; vH = h;
        vGold = step(1.0 - 0.28*smoothstep(0.55,1.0,uGrow), aRnd.w);
        vec4 mv = modelViewMatrix * vec4(w,1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 cDeep,cPrim,cMint,cGold,cGoldL,fogColor; uniform float fogNear,fogFar,uGrow,uBurst;
      varying float vH, vGold, vNear, vFogDepth;
      void main(){
        vec3 col = mix(cDeep*0.7, cPrim, smoothstep(0.0,0.6,vH));
        col = mix(col, mix(cPrim, cMint, 0.55), smoothstep(0.55,1.0,vH));
        col = mix(col, mix(cGold,cGoldL,vH), vGold*smoothstep(0.45,1.0,vH));
        col += cGoldL * vNear * 0.45 * vH;                 // cursor glow
        col += cGoldL * uBurst * 0.35 * vH;                // funding unlock flash
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        gl_FragColor = vec4(mix(col, fogColor, fogF), 1.0);
      }`
  });
  const grass = new THREE.Mesh(geo, grassMat); grass.frustumCulled = false; scene.add(grass);

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.deep).multiplyScalar(0.75) }));
  ground.rotation.x = -Math.PI/2; ground.position.z = -6; scene.add(ground);

  // fireflies
  const F = mobile ? 140 : 360;
  const fp = new Float32Array(F*3), fr = new Float32Array(F);
  for (let i=0;i<F;i++){ fp.set([(rand()-.5)*2*W, rand()*2.4, Z0 + rand()*(Z1-Z0)], i*3); fr[i]=rand(); }
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(fp,3)); fgeo.setAttribute('aR', new THREE.BufferAttribute(fr,1));
  const fmat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms:U,
    vertexShader:`attribute float aR; uniform float uTime,uGrow,uBurst; varying float vA;
      void main(){ vec3 p=position; p.y += sin(uTime*0.6+aR*20.0)*0.25 + uBurst*aR*1.2; p.x += cos(uTime*0.4+aR*12.0)*0.3;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=(3.0+aR*5.0)*(6.0/-mv.z)*(1.0+uBurst);
        vA=(0.25+0.75*uGrow)*(0.4+0.6*sin(uTime*2.0+aR*30.0)*0.5+0.3)+uBurst*0.6; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 cGoldL; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(cGoldL, a*vA); }` });
  scene.add(new THREE.Points(fgeo, fmat));

  // ---- DOM-synced score ring (ortho overlay in CSS pixels) ----
  const oScene = new THREE.Scene(); const oCam = new THREE.OrthographicCamera(0,1,0,1,-10,10);
  const ringU = { uP:{value:0}, uTime:U.uTime, uBurst:U.uBurst, cLow:{value:new THREE.Color(C.low)}, cMid:{value:new THREE.Color(C.mid)},
    cGood:{value:new THREE.Color('#2fbf71')}, cTop:{value:new THREE.Color(C.gold)}, cTrack:{value:new THREE.Color(C.mint)}, uMouse:{value:new THREE.Vector2(.5,.5)} };
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.ShaderMaterial({ transparent:true, depthTest:false, side:THREE.DoubleSide, uniforms:ringU,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:/* glsl */`
      varying vec2 vUv; uniform float uP,uTime,uBurst; uniform vec2 uMouse; uniform vec3 cLow,cMid,cGood,cTop,cTrack;
      vec3 ramp(float t){ return t<.4? mix(cLow,cMid,t/.4) : t<.75? mix(cMid,cGood,(t-.4)/.35) : mix(cGood,cTop,(t-.75)/.25); }
      void main(){
        vec2 p = vUv*2.0-1.0; p += (uMouse-0.5)*0.03;           // tiny parallax toward cursor
        float r = length(p);
        float a = mod(atan(-p.x, -p.y), 6.28318) / 6.28318;     // 0 at bottom, clockwise on screen
        float start = 0.125, span = 0.75; float t = (a - start)/span;
        float band = smoothstep(0.80,0.805,r) * (1.0 - smoothstep(0.88,0.885,r));
        float inArc = step(0.0,t)*step(t,1.0);
        float fill = inArc * step(t, uP);
        vec3 col = mix(cTrack*0.25, ramp(clamp(t,0.,1.)), fill);
        float alpha = band*inArc*(0.35+0.65*fill);
        // end knob
        float ka = start + span*uP; float kang = ka*6.28318;
        vec2 kp = vec2(-sin(kang), -cos(kang))*0.842;
        float k = 1.0 - smoothstep(0.045,0.05,length(p-kp));
        float glowK = exp(-length(p-kp)*14.0);
        col = mix(col, vec3(1.0), k); alpha = max(alpha, k);
        // outer glow + inner halo
        float glow = exp(-abs(r-0.842)*18.0) * inArc * fill * 0.55;
        vec3 g = ramp(clamp(uP,0.,1.));
        col += g*glow + g*glowK*0.8; alpha = max(alpha, glow + glowK*0.6);
        float halo = (1.0-smoothstep(0.0,0.78,r))*0.10*(0.6+0.4*sin(uTime*1.5)) + uBurst*0.25*(1.0-smoothstep(0.0,0.8,r));
        col = mix(col, g, 0.0); alpha = max(alpha, halo); if (halo > alpha-0.001) col = g;
        gl_FragColor = vec4(col, alpha);
      }` }));
  oScene.add(ring);
  const slot = document.getElementById('slot');

  // ---- input ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0), hit = new THREE.Vector3();
  const target = new THREE.Vector3(99,0,99); let lastMove = -1e9, speed = 0, px = .5, py = .5;
  const smoothMouse = new THREE.Vector3(99,0,99);
  addEventListener('pointermove', e => {
    const nx = e.clientX/innerWidth, ny = e.clientY/innerHeight;
    speed = Math.min(1, speed + Math.hypot(nx-px, ny-py)*8); px = nx; py = ny; lastMove = performance.now();
    ndc.set(nx*2-1, -(ny*2-1)); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) target.copy(hit);
  }, { passive:true });
  window.__proof = { webgl:true, blades:N, setPointer(nx,ny){ dispatchEvent(new PointerEvent('pointermove',{clientX:nx*innerWidth,clientY:ny*innerHeight})); } };

  // ---- smooth scroll (Lenis) ----
  let lenis = null;
  if (!reduced && !mobile) { lenis = new Lenis({ lerp: 0.1 }); }

  function resize(){
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth/innerHeight;
    camera.fov = camera.aspect < 0.8 ? 55 : 38;
    camera.updateProjectionMatrix();
    oCam.right = innerWidth; oCam.bottom = innerHeight; oCam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let visible = true; document.addEventListener('visibilitychange', () => visible = !document.hidden);
  let last = performance.now(), simT = 0;
  function frame(now){
    const dt = Math.min(0.05, (now - last)/1000); last = now;
    if (lenis) lenis.raf(now);
    if (!reduced) simT += dt;
    U.uTime.value = simT;
    const t = updateScore(now);
    U.uGrow.value = t; ringU.uP.value = t;
    burst = Math.max(0, burst - dt*0.8); U.uBurst.value = reduced ? 0 : burst;

    // idle "ghost cursor" wanders when the visitor isn't moving (also what mobile sees)
    const idle = now - lastMove > 2500;
    if (idle && !reduced) target.set(Math.sin(simT*0.35)*W*0.45, 0, 1.2 + Math.sin(simT*0.21)*1.2);
    const k = 1 - Math.exp(-8*dt); smoothMouse.lerp(target, reduced ? 1 : k);
    U.uMouse.value.copy(smoothMouse);
    speed *= Math.exp(-1.5*dt);
    U.uStrength.value = reduced ? 0 : (idle ? 0.55 : 0.75 + 0.25*speed);
    ringU.uMouse.value.lerp(new THREE.Vector2(px, py), k);

    // camera: scroll dollies down into the grass (scroll-linked, reversible)
    const sc = Math.min(1, (lenis ? lenis.scroll : scrollY) / innerHeight);
    const portrait = camera.aspect < 0.8;
    camera.position.set((px-.5)*0.25, (portrait?1.2:1.0) - sc*0.45, 6.6 - sc*1.6);
    camera.lookAt(0, (portrait?3.1:2.15) - sc*0.5, 0);

    // sync ring plane to the DOM box (Lusion-style DOM->GL mapping)
    const r = slot.getBoundingClientRect();
    ring.position.set(r.left + r.width/2, r.top + r.height/2, 0);
    ring.scale.set(r.width, -r.height, 1);
    ring.visible = r.bottom > 0 && r.top < innerHeight;

    renderer.autoClear = true; renderer.render(scene, camera);
    renderer.autoClear = false; renderer.render(oScene, oCam);
    window.__proof.score = Math.round(score); window.__proof.frames = (window.__proof.frames||0)+1;
    if (!reduced && visible) requestAnimationFrame(frame);
    else if (reduced) { /* one still frame; re-render on resize */ }
  }
  requestAnimationFrame(frame);
  if (reduced) addEventListener('resize', () => requestAnimationFrame(frame));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduced) { last = performance.now(); requestAnimationFrame(frame); } });
}
