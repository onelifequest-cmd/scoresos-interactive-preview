// Scores OS interactive preview. Three.js r170 + GSAP ScrollTrigger + Lenis. Theme from config.json.
import * as THREE from './vendor/three.module.min.js';
import Lenis from './vendor/lenis.mjs';
import { initMaxine } from './maxine.js';

const qs = new URLSearchParams(location.search);
const cfgFile = qs.get('config') || 'config.json';
let cfg;
try { cfg = await (await fetch(cfgFile)).json(); }
catch (e) { console.warn('config fetch failed, using defaults', e); cfg = {}; }
cfg.copy ||= {}; cfg.colors ||= {}; cfg.chat ||= { label:'Ask Maxine', href:'#' };
cfg.score ||= { from:520, to:784, unlockAt:760, durationMs:4200, bands:[[580,'Poor'],[670,'Fair'],[740,'Good'],[851,'Excellent']] };
cfg.grass ||= { bladesDesktop:42000, bladesMobile:9000, cursorRadius:2.6 };
cfg.tiles ||= { labels:[] }; cfg.story ||= { bureaus:[], stages:[] };
document.getElementById('cfgname').textContent = cfgFile;

// ---------- theming (the "template" part) ----------
const C = Object.assign({deep:'#0E2D1A',primary:'#1A6B3C',gold:'#D4AF37',goldLight:'#F4D96B',mint:'#E8F4ED',low:'#E5484D',mid:'#F5A524'}, cfg.colors);
const rs = document.documentElement.style;
[['--deep',C.deep],['--primary',C.primary],['--gold',C.gold],['--goldL',C.goldLight],['--mint',C.mint],['--low',C.low]].forEach(([k,v]) => rs.setProperty(k,v));
document.querySelectorAll('[data-copy]').forEach(el => { const v = cfg.copy[el.dataset.copy]; if (v) el.textContent = v; });
document.querySelectorAll('[data-href]').forEach(el => { const k = el.dataset.href; const v = k === 'chatHref' ? cfg.chat.href : cfg.copy[k]; if (v) el.href = v; });
if (cfg.logo) document.getElementById('logo').src = cfg.logo;
if (cfg.client) document.getElementById('brandname').textContent = cfg.client === 'Scores OS' ? 'Score OS' : cfg.client;

const S = cfg.score;
const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.has('static');
const mobile = matchMedia('(max-width: 900px)').matches || /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent);
const coarse = matchMedia('(pointer: coarse)').matches;
if (reduced) html.classList.add('reduced');
initMaxine(cfg.chat, { reduced, coarse });

// ---------- helpers ----------
function bezier(x1,y1,x2,y2){ // cubic-bezier(.35,0,0,1), Lusion's house curve
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const X=t=>((ax*t+bx)*t+cx)*t, Y=t=>((ay*t+by)*t+cy)*t, dX=t=>(3*ax*t+2*bx)*t+cx;
  return x=>{let t=x;for(let i=0;i<8;i++){const d=dX(t);if(Math.abs(d)<1e-6)break;t-=(X(t)-x)/d;}return Y(Math.min(1,Math.max(0,t)));};
}
const ease = bezier(.35,0,0,1), inOut = bezier(.65,0,.35,1);
const clamp01 = x => Math.min(1, Math.max(0, x));
const sstep = (a,b,x) => { const t = clamp01((x-a)/(b-a)); return t*t*(3-2*t); };
const GOOD = '#2fbf71';
function scoreColor(t){ // 0..1 low -> gold
  const low=new THREE.Color(C.low), mid=new THREE.Color(C.mid), good=new THREE.Color(GOOD), top=new THREE.Color(C.gold);
  if (t < .4) return low.lerp(mid, t/.4);
  if (t < .75) return mid.lerp(good, (t-.4)/.35);
  return good.lerp(top, (t-.75)/.25);
}
function bandFor(v){ for (const [max,name] of S.bands) if (v < max) return name; return S.bands.at(-1)[1]; }

// ---------- tiles: state shared by WebGL and the HTML chip fallback ----------
const TL = cfg.tiles;
const labels = (TL.labels || []).slice(0, mobile ? (TL.mobileCount || 6) : 12);
document.getElementById('hintt').textContent = (coarse ? TL.hintTouch : TL.hint) || 'Move your cursor through the grass';
if (TL.note) document.getElementById('tilenote').textContent = TL.note;
const zone = document.getElementById('tilezone'), chipsEl = document.getElementById('tilechips');
const START = labels.length ? (S.start ?? S.to) : S.to;
const STEP = labels.length ? (S.to - START) / labels.length : 0;
const tiles = labels.map((label, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.setAttribute('aria-label', `${TL.a11yPrefix || 'Dispute'}: ${label} (illustrative)`);
  b.onclick = () => knock(i, null, true);
  chipsEl.appendChild(b);
  return { i, label, chip:b, state:'idle', x:0, y:0, vx:0, vy:0, rx:0, ry:0, rz:0, wx:0, wy:0, wz:0, age:0, ph:Math.random()*6.28 };
});
let cleared = 0, lastUserKnock = -1e9, lastAuto = 0, kick = () => {};
function knock(i, v, fromKey){
  const t = tiles[i]; if (!t || t.state !== 'idle') return;
  t.state = 'flying'; t.age = 0; cleared++;
  if (fromKey !== 'auto') lastUserKnock = performance.now();
  t.chip.classList.add('gone'); t.chip.disabled = true;
  const a = v || { x:(Math.random()-.5)*900, y:-500 - Math.random()*300 };
  t.vx = a.x; t.vy = a.y; t.wx = (Math.random()-.5)*5; t.wy = (Math.random()-.5)*6; t.wz = (Math.random()-.5)*9;
  if (fromKey === true) { const n = tiles.find(o => o.state === 'idle'); (n?.chip)?.focus({ preventScroll:true }); }
  kick();
}
function resetTiles(){ cleared = 0; tiles.forEach(t => { t.state = 'idle'; t.age = 0; t.chip.classList.remove('gone'); t.chip.disabled = false; }); layoutTiles(true); }

// ---------- score ----------
const numEl = document.getElementById('num'), bandEl = document.getElementById('band'), unlockEl = document.getElementById('unlock');
const forced = qs.has('score') ? +qs.get('score') : null;
const autoDemo = !reduced && qs.get('demo') !== '0';
let climbStart = performance.now() + 500, score = reduced ? START : S.from, burst = 0, wasUnlocked = false;
const CLIMB_MS = S.durationMs * 0.55;
function updateScore(now, dt){
  let v;
  if (forced !== null) v = forced;
  else {
    const base = reduced ? START : S.from + (START - S.from) * ease(clamp01((now - climbStart) / CLIMB_MS));
    const tgt = base + cleared * STEP;
    score = reduced ? tgt : score + (tgt - score) * (1 - Math.exp(-7 * dt));
    v = score;
  }
  score = v;
  const t = clamp01((v - S.from) / (S.to - S.from));
  numEl.textContent = Math.round(v);
  numEl.style.color = '#' + scoreColor(t).getHexString();
  bandEl.textContent = bandFor(v);
  const un = Math.round(v) >= S.unlockAt;
  unlockEl.classList.toggle('on', un);
  if (un && !wasUnlocked) burst = 1;
  wasUnlocked = un;
  return t;
}
function autoKnock(now){
  if (!autoDemo || !labels.length) return;
  const climbDone = now - climbStart > CLIMB_MS + 900;
  if (climbDone && now - lastUserKnock > 4500 && now - lastAuto > 950) {
    const idle = tiles.filter(t => t.state === 'idle'); if (!idle.length) return;
    lastAuto = now; knock(idle[Math.floor(idle.length/2)].i, null, 'auto');
  }
}
document.getElementById('replay').onclick = () => { climbStart = performance.now(); score = reduced ? START : S.from; wasUnlocked = false; lastUserKnock = performance.now() - 2500; resetTiles(); kick(); };

// ---------- story DOM ----------
const ST = cfg.story;
const bureausEl = document.getElementById('bureaus'), stextEl = document.getElementById('stext'), sprogEl = document.getElementById('sprog');
const cards = (ST.bureaus || []).map(([name, a, b]) => {
  const d = document.createElement('div'); d.className = 'card';
  d.innerHTML = `<small></small><b>${a}</b><i></i>`; d.querySelector('small').textContent = name;
  bureausEl.appendChild(d); return { el:d, num:d.querySelector('b'), a, b };
});
const stages = (ST.stages || []).map(s => {
  const d = document.createElement('div'); d.className = 'stage';
  if (s.tag) { const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = s.tag; d.appendChild(tg); }
  for (const [tag, cls, txt] of [['p','eyebrow',s.eyebrow],['h2','',s.h],['p','',s.p]]) { if (!txt) continue; const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = txt; d.appendChild(e); }
  stextEl.appendChild(d); const pr = document.createElement('span'); pr.innerHTML = '<i></i>'; sprogEl.appendChild(pr);
  return { el:d, bar:pr.firstChild };
});
const gnum = document.getElementById('gnum'), gaugewrap = document.getElementById('gaugewrap');
let lastStage = -1;
function updateStoryDOM(s){
  const gp = sstep(.04, .40, s);
  let sum = 0;
  cards.forEach(c => { const v = Math.round(c.a + (c.b - c.a) * gp); sum += v; c.num.textContent = v;
    const col = '#' + scoreColor(clamp01((v - S.from) / (S.to - S.from))).getHexString(); c.num.style.color = col; c.el.style.color = col;
    c.el.querySelector('i').style.setProperty('--w', (gp*100).toFixed(1) + '%'); c.num.style.color = col; });
  if (cards.length) { const avg = sum / cards.length; gnum.textContent = Math.round(avg); gnum.style.color = '#' + scoreColor(clamp01((avg - S.from) / (S.to - S.from))).getHexString(); }
  const n = stages.length; const cuts = [.22, .45, .76];
  let idx = 0; while (idx < n - 1 && s >= (cuts[idx] ?? 1)) idx++;
  if (idx !== lastStage) { stages.forEach((st, k) => st.el.classList.toggle('on', k === idx)); lastStage = idx; }
  const bounds = [0, ...cuts.slice(0, n - 1), 1];
  stages.forEach((st, k) => st.bar.style.width = (clamp01((s - bounds[k]) / (bounds[k+1] - bounds[k])) * 100).toFixed(1) + '%');
  const ga = 1 - sstep(.42, .50, s); gaugewrap.style.opacity = ga.toFixed(3); gaugewrap.style.visibility = ga < .01 ? 'hidden' : 'visible';
  return { gp, ga };
}
function staticStory(){ html.classList.add('static-story'); updateStoryDOM(1); stages.forEach(st => st.el.classList.add('on')); gaugewrap.style.opacity = 1; gaugewrap.style.visibility = 'visible'; }

// ---------- WebGL ----------
const canvas = document.getElementById('gl');
let renderer = null;
if (!qs.has('nogl')) { try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' }); } catch (e) { renderer = null; } }
if (!renderer || !renderer.getContext()) {
  html.classList.add('no-webgl', 'chips-on');
  staticStory();
  let last = performance.now();
  const loop = now => { const dt = Math.min(.05,(now-last)/1000); last = now; autoKnock(now); updateScore(now, dt); if (!reduced) requestAnimationFrame(loop); };
  kick = () => requestAnimationFrame(loop);
  requestAnimationFrame(loop);
  window.__proof = { webgl:false };
} else {
  await document.fonts.load('700 40px Inter').catch(() => {});
  start();
}

function start(){
  const DPR_CAP = mobile ? 1.25 : 1.5;
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  renderer.setClearColor(0x000000, 0); renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  const deep = new THREE.Color(C.deep);
  scene.fog = new THREE.Fog(deep, 8, 24);
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---- instanced grass ----
  const N = mobile ? cfg.grass.bladesMobile : cfg.grass.bladesDesktop;
  const blade = new THREE.PlaneGeometry(0.07, 1, 1, 5); blade.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index; geo.setAttribute('position', blade.attributes.position); geo.setAttribute('uv', blade.attributes.uv);
  const off = new Float32Array(N*3), rnd = new Float32Array(N*4);
  const W = mobile ? 9 : 16, Z0 = -13, Z1 = 4.2;
  for (let i=0;i<N;i++){
    const z = Z0 + Math.pow(rand(), 0.7) * (Z1 - Z0);
    off.set([(rand()-.5)*2*W*(1+(Z1-z)*0.06), 0, z], i*3);
    rnd.set([rand(), rand(), rand(), rand()], i*4);
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = N;
  const U = {
    uTime:{value:0}, uGrow:{value:0}, uMouse:{value:new THREE.Vector3(99,0,99)}, uStrength:{value:0},
    uRadius:{value:cfg.grass.cursorRadius}, uBurst:{value:0},
    uClear:{value:new THREE.Vector3(99,99,1.6)}, uPath:{value:new THREE.Vector4(0,4.5,0,-11)}, uPathK:{value:0},
    cDeep:{value:deep}, cPrim:{value:new THREE.Color(C.primary)}, cMint:{value:new THREE.Color(C.mint)},
    cGold:{value:new THREE.Color(C.gold)}, cGoldL:{value:new THREE.Color(C.goldLight)},
    fogColor:{value:deep}, fogNear:{value:8}, fogFar:{value:24}
  };
  const grassMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, fog: true,
    vertexShader: /* glsl */`
      attribute vec3 aOffset; attribute vec4 aRnd;
      uniform float uTime,uGrow,uStrength,uRadius,uPathK; uniform vec3 uMouse,uClear; uniform vec4 uPath;
      varying float vH, vGold, vNear; varying float vFogDepth;
      void main(){
        float h = uv.y;
        float H = mix(0.14, 0.9, uGrow) * (0.5 + aRnd.x*0.9);
        // story: a trail and a clearing around the Funding door
        vec2 pa = aOffset.xz - uPath.xy, ba = uPath.zw - uPath.xy;
        float sg = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); float dp = length(pa - ba*sg);
        float clr = max(smoothstep(1.7, 0.5, dp)*0.8, smoothstep(uClear.z, uClear.z*0.35, length(aOffset.xz-uClear.xy))*0.9) * uPathK;
        H *= 1.0 - clr;
        vec3 p = position; p.x *= (1.0 - h*0.9); p.y = h*H;
        float a = aRnd.y*6.2831; p.xz = mat2(cos(a),-sin(a),sin(a),cos(a)) * p.xz;
        vec3 w = aOffset + p;
        float bend = h*h;
        float wave = sin(uTime*1.4 + aOffset.x*0.55 + aOffset.z*0.35 + aRnd.z*6.2831);
        float gust = sin(uTime*0.45 + aOffset.x*0.12)*0.5+0.5;
        w.x += (0.10 + 0.16*gust) * wave * bend * H;
        w.z += 0.05 * cos(uTime*1.1 + aRnd.z*9.0) * bend * H;
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
        col += cGoldL * vNear * 0.45 * vH;
        col += cGoldL * uBurst * 0.35 * vH;
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        gl_FragColor = vec4(mix(col, fogColor, fogF), 1.0);
      }`
  });
  const grass = new THREE.Mesh(geo, grassMat); grass.frustumCulled = false; scene.add(grass);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.deep).multiplyScalar(0.75) }));
  ground.rotation.x = -Math.PI/2; ground.position.z = -8; scene.add(ground);

  // fireflies
  const F = mobile ? 120 : 340;
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

  // ---- Funding door (in the 3D scene, placed so its final pose fills #doorslot) ----
  const doorA = { value:0 }, doorOpen = { value:0 };
  const door = new THREE.Group(); door.visible = false; scene.add(door);
  const DW = 0.56, DH = 0.86; // unit door inside a 1-tall slot (sign on top)
  const cGL = new THREE.Color(C.goldLight), cG = new THREE.Color(C.gold), cM = new THREE.Color(C.mint);
  const glowMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms:{ uA:doorA, uO:doorOpen, cA:{value:cGL}, cB:{value:cM}, uTime:U.uTime },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`varying vec2 vUv; uniform float uA,uO,uTime; uniform vec3 cA,cB;
      void main(){ vec2 p=(vUv-0.5)*vec2(1.0,1.0); float r=length(p*vec2(1.0,0.75));
        float core = smoothstep(0.5,0.0,r); float k = (0.18+0.82*uO)*(0.92+0.08*sin(uTime*2.0));
        gl_FragColor = vec4(mix(cA,cB,core*0.6)*core*k, core*k*uA); }` });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.ShaderMaterial({ transparent:true, uniforms:{ uA:doorA, uO:doorOpen, cA:{value:cGL}, cB:{value:new THREE.Color('#ffffff')} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`varying vec2 vUv; uniform float uA,uO; uniform vec3 cA,cB; void main(){ float r=length((vUv-vec2(0.5,0.45))*vec2(1.6,1.0)); vec3 c=mix(cB,cA,smoothstep(0.0,0.6,r)); gl_FragColor=vec4(c*(0.35+0.65*uO), uA); }` }));
  inner.position.set(0, DH/2, -0.01); door.add(inner);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), glowMat); halo.position.set(0, DH*0.5, -0.03); door.add(halo);
  const frameMat = new THREE.MeshBasicMaterial({ color:cGL, transparent:true });
  const fw = 0.035;
  for (const [w,h,x,y] of [[fw,DH+fw,-DW/2,DH/2],[fw,DH+fw,DW/2,DH/2],[DW+fw*2,fw,0,DH+fw/2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,0.04), frameMat); m.position.set(x,y,0); door.add(m); }
  const panelMat = new THREE.ShaderMaterial({ transparent:true, side:THREE.DoubleSide, uniforms:{ uA:doorA, cD:{value:new THREE.Color(C.deep)}, cG:{value:cG} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`varying vec2 vUv; uniform float uA; uniform vec3 cD,cG; void main(){ vec2 e=min(vUv,1.0-vUv); float b=1.0-smoothstep(0.03,0.045,min(e.x*0.5,e.y*0.35)); float inset=1.0-smoothstep(0.1,0.115,min(e.x,e.y*0.6)); vec3 c=mix(cD*1.6,cG*0.55,0.25+0.3*vUv.y); c=mix(c,cG,max(b,(1.0-inset)*0.0)); c=mix(c,cG*0.8,smoothstep(0.115,0.1,abs(min(e.x,e.y*0.6)-0.12))*0.6); gl_FragColor=vec4(c,uA);} ` });
  const panels = [-1, 1].map(sd => {
    const pivot = new THREE.Group(); pivot.position.set(sd*DW/2, 0, 0.005);
    const pm = new THREE.Mesh(new THREE.BoxGeometry(DW/2, DH, 0.02), panelMat); pm.position.set(-sd*DW/4, DH/2, 0); pivot.add(pm); door.add(pivot); return { pivot, sd };
  });
  // sign (graphic, inside the slot)
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128; const sx = sc.getContext('2d');
  sx.fillStyle = C.goldLight; sx.textAlign = 'center'; sx.font = '800 54px Inter'; sx.fillText((ST.doorLabel || 'Funding OS').toUpperCase(), 256, 62);
  sx.font = '700 32px Inter'; sx.fillStyle = C.mint; sx.fillText((ST.doorTag || 'Coming soon').toUpperCase(), 256, 110);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(sc), transparent:true, depthWrite:false }));
  sign.material.map.colorSpace = THREE.SRGBColorSpace; sign.position.set(0, DH + 0.075, 0.02); door.add(sign);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMat); pool.rotation.x = -Math.PI/2; scene.add(pool); pool.visible = false;

  // ---- overlay rings (DOM-synced, CSS-pixel ortho) ----
  const oScene = new THREE.Scene(); const oCam = new THREE.OrthographicCamera(0,1,0,1,-10,10);
  function makeRing(el){
    const u = { uP:{value:0}, uA:{value:1}, uTime:U.uTime, uBurst:U.uBurst, cLow:{value:new THREE.Color(C.low)}, cMid:{value:new THREE.Color(C.mid)},
      cGood:{value:new THREE.Color(GOOD)}, cTop:{value:new THREE.Color(C.gold)}, cTrack:{value:new THREE.Color(C.mint)}, uMouse:{value:new THREE.Vector2(.5,.5)} };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.ShaderMaterial({ transparent:true, depthTest:false, side:THREE.DoubleSide, uniforms:u,
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader:/* glsl */`
        varying vec2 vUv; uniform float uP,uA,uTime,uBurst; uniform vec2 uMouse; uniform vec3 cLow,cMid,cGood,cTop,cTrack;
        vec3 ramp(float t){ return t<.4? mix(cLow,cMid,t/.4) : t<.75? mix(cMid,cGood,(t-.4)/.35) : mix(cGood,cTop,(t-.75)/.25); }
        void main(){
          vec2 p = vUv*2.0-1.0; p += (uMouse-0.5)*0.03;
          float r = length(p);
          float a = mod(atan(-p.x, -p.y), 6.28318) / 6.28318;
          float start = 0.125, span = 0.75; float t = (a - start)/span;
          float band = smoothstep(0.80,0.805,r) * (1.0 - smoothstep(0.88,0.885,r));
          float inArc = step(0.0,t)*step(t,1.0);
          float fill = inArc * step(t, uP);
          vec3 col = mix(cTrack*0.25, ramp(clamp(t,0.,1.)), fill);
          float alpha = band*inArc*(0.35+0.65*fill);
          float kang = (start + span*uP)*6.28318;
          vec2 kp = vec2(-sin(kang), -cos(kang))*0.842;
          float k = 1.0 - smoothstep(0.045,0.05,length(p-kp));
          col = mix(col, vec3(1.0), k); alpha = max(alpha, k);
          float glow = exp(-abs(r-0.842)*18.0) * inArc * fill * 0.55;
          float glowK = exp(-length(p-kp)*14.0);
          vec3 g = ramp(clamp(uP,0.,1.));
          col += g*glow + g*glowK*0.8; alpha = max(alpha, glow + glowK*0.6);
          float halo = (1.0-smoothstep(0.0,0.78,r))*0.10*(0.6+0.4*sin(uTime*1.5)) + uBurst*0.25*(1.0-smoothstep(0.0,0.8,r));
          alpha = max(alpha, halo); if (halo > alpha-0.001) col = g;
          gl_FragColor = vec4(col, alpha*uA);
        }` }));
    oScene.add(m);
    return { m, u, el, sync(){ const r = el.getBoundingClientRect(); m.position.set(r.left + r.width/2, r.top + r.height/2, 0); m.scale.set(r.width, -r.height, 1); m.visible = u.uA.value > .01 && r.bottom > 0 && r.top < innerHeight && r.width > 0; } };
  }
  const heroRing = makeRing(document.getElementById('slot'));
  const storyRing = reduced ? null : makeRing(document.getElementById('gauge'));

  // ---- tiles (3D boxes in a CSS-pixel ortho scene; hand-rolled physics inside #tilezone) ----
  const tScene = new THREE.Scene(); const tCam = new THREE.OrthographicCamera(0,1,0,-1,-2000,2000);
  const TW = mobile ? 118 : 168, TH = mobile ? 40 : 56, TD = mobile ? 10 : 12;
  const box = new THREE.BoxGeometry(1,1,1);
  const lightV = `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
  const edgeMat = new THREE.ShaderMaterial({ transparent:true, uniforms:{ uA:{value:1}, c:{value:new THREE.Color(C.low)} }, vertexShader:lightV,
    fragmentShader:`varying vec3 vN; uniform float uA; uniform vec3 c; void main(){ float l=0.45+0.55*max(dot(vN,normalize(vec3(-.4,.7,.6))),0.0); gl_FragColor=vec4(c*0.55*l,uA);} ` });
  function labelTex(text){
    const cw = 512, ch = Math.round(512*TH/TW), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0,0,0,ch); g.addColorStop(0, new THREE.Color(C.low).lerp(new THREE.Color(C.deep), .55).getStyle()); g.addColorStop(1, new THREE.Color(C.deep).multiplyScalar(.8).getStyle());
    x.fillStyle = g; x.fillRect(0,0,cw,ch);
    x.strokeStyle = C.low; x.lineWidth = 12; x.strokeRect(6,6,cw-12,ch-12);
    x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(12,12,cw-24,ch*0.38);
    const r = ch*0.24, cx0 = ch*0.5; x.fillStyle = C.low; x.beginPath(); x.arc(cx0, ch/2, r, 0, 7); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; const q = r*0.42; x.beginPath(); x.moveTo(cx0-q,ch/2-q); x.lineTo(cx0+q,ch/2+q); x.moveTo(cx0+q,ch/2-q); x.lineTo(cx0-q,ch/2+q); x.stroke();
    let fs = 64; x.font = `700 ${fs}px Inter`; const maxW = cw - ch - 40; while (x.measureText(text).width > maxW && fs > 30) { fs -= 2; x.font = `700 ${fs}px Inter`; }
    x.fillStyle = C.mint; x.textBaseline = 'middle'; x.fillText(text, ch*0.95, ch/2 + 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  tiles.forEach(t => {
    const face = new THREE.ShaderMaterial({ transparent:true, uniforms:{ map:{value:labelTex(t.label)}, uA:edgeMat.uniforms.uA }, vertexShader:lightV,
      fragmentShader:`varying vec2 vUv; varying vec3 vN; uniform sampler2D map; uniform float uA; void main(){ vec4 c=texture2D(map,vUv); float l=0.7+0.3*max(dot(vN,normalize(vec3(-.4,.6,1.0))),0.0); float spec=pow(max(dot(reflect(vec3(0,0,-1),vN),normalize(vec3(-.5,.6,.6))),0.0),24.0)*0.35; gl_FragColor=vec4(c.rgb*l+spec,uA);} ` });
    face.uniforms.uA = { value:1 };
    const e = edgeMat.clone(); e.uniforms.uA = face.uniforms.uA;
    t.mesh = new THREE.Mesh(box, [e,e,e,e,face,face]); t.uA = face.uniforms.uA; tScene.add(t.mesh);
  });
  let ZW = 1, ZH = 1;
  function layoutTiles(reset){
    ZW = zone.clientWidth; ZH = zone.clientHeight;
    const n = tiles.length, rows = mobile ? 3 : 2, cols = Math.ceil(n / rows);
    tiles.forEach((t, k) => { const row = k % rows, col = Math.floor(k / rows); const cw = ZW / cols;
      const st = (row % 2 ? 1 : -1) * Math.max(0, (cw - TW) / 2 - 4) * 0.55;
      t.hx = Math.min(ZW - TW/2 - 4, Math.max(TW/2 + 4, (col + .5) * cw + st)); t.hy = (row + .5) * ZH / rows;
      if (reset || t.state === 'idle') { if (reset) { t.x = t.hx; t.y = t.hy; t.vx = t.vy = 0; t.rx = t.ry = t.rz = 0; } } });
  }
  layoutTiles(true);

  // ---- input ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0), hit = new THREE.Vector3();
  const target = new THREE.Vector3(99,0,99); let lastMove = -1e9, speed = 0, px = .5, py = .5;
  const smoothMouse = new THREE.Vector3(99,0,99);
  const ptr = { x:-1e4, y:-1e4, vx:0, vy:0, t:0, down:false, inZone:false };
  function zonePtr(e, isDown){
    const zr = zone.getBoundingClientRect(); const x = e.clientX - zr.left, y = e.clientY - zr.top; const now = performance.now();
    const dtp = Math.max(8, now - ptr.t);
    if (ptr.t && !isDown) { ptr.vx = ptr.vx*0.5 + 0.5*(x - ptr.x) / dtp * 1000; ptr.vy = ptr.vy*0.5 + 0.5*(y - ptr.y) / dtp * 1000; } else { ptr.vx = ptr.vy = 0; }
    const px0 = ptr.t ? ptr.x : x, py0 = ptr.t ? ptr.y : y;
    ptr.x = x; ptr.y = y; ptr.t = now; ptr.inZone = x > -20 && y > -20 && x < ZW + 20 && y < ZH + 20;
    if (!ptr.inZone || reduced) return;
    const sp = Math.hypot(ptr.vx, ptr.vy), moved = isDown ? 0 : Math.hypot(x - px0, y - py0);
    for (const t of tiles) {
      if (t.state !== 'idle') continue;
      const inside = Math.abs(x - t.x) < TW/2 + 10 && Math.abs(y - t.y) < TH/2 + 10;
      if (inside && (isDown || sp > 60 || moved > 3)) {
        let dx = t.x - x, dy = t.y - y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const s = Math.min(1700, Math.max(560, sp * 0.9));
        knock(t.i, { x: dx * s + ptr.vx * 0.35, y: dy * s * 0.6 + ptr.vy * 0.35 - 260 });
      }
    }
  }
  addEventListener('pointermove', e => {
    const nx = e.clientX/innerWidth, ny = e.clientY/innerHeight;
    speed = Math.min(1, speed + Math.hypot(nx-px, ny-py)*8); px = nx; py = ny; lastMove = performance.now();
    ndc.set(nx*2-1, -(ny*2-1)); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) target.copy(hit);
    zonePtr(e, false);
  }, { passive:true });
  addEventListener('pointerdown', e => zonePtr(e, true), { passive:true });

  // ---- scroll: Lenis + GSAP ScrollTrigger ----
  let lenis = null; const gsap = window.gsap, ST_ = window.ScrollTrigger;
  if (!reduced && !mobile) { lenis = new Lenis({ lerp: 0.1 }); }
  let storyP = 0, storyS = 0, trig = null;
  if (reduced || !gsap || !ST_) { staticStory(); }
  else {
    gsap.registerPlugin(ST_);
    ST_.config({ ignoreMobileResize: true });
    if (lenis) { lenis.on('scroll', ST_.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
    trig = ST_.create({ trigger:'#pin', start:'top top', end:'+=300%', pin:true, pinSpacing:true, anticipatePin:1, onUpdate: self => { storyP = self.progress; } });
    updateStoryDOM(0);
  }
  const pinEl = document.getElementById('pin'), slotEl = document.getElementById('doorslot');

  // camera key poses
  const P1 = new THREE.Vector3(), L1 = new THREE.Vector3(), tmpCam = new THREE.PerspectiveCamera();
  function poses(){
    const portrait = camera.aspect < 0.8;
    P1.set(0, portrait ? 1.0 : 0.92, -6.0); L1.set(0, portrait ? 1.45 : 1.15, -16);
    // place the door so that at the final pose it exactly fills #doorslot (graphics stay inside their layout box)
    tmpCam.copy(camera); tmpCam.position.copy(P1); tmpCam.lookAt(L1); tmpCam.updateMatrixWorld(); tmpCam.updateProjectionMatrix();
    const pr = pinEl.getBoundingClientRect(), r = slotEl.getBoundingClientRect();
    const cyTop = r.top - pr.top, H = pinEl.clientHeight || innerHeight;
    const nx = ((r.left + r.width/2) / innerWidth) * 2 - 1, nyTop = -((cyTop) / H) * 2 + 1, nyBot = -((cyTop + r.height) / H) * 2 + 1;
    const fwd = new THREE.Vector3(); tmpCam.getWorldDirection(fwd);
    const D = 5.0;
    const at = ny => { const v = new THREE.Vector3(nx, ny, 0.5).unproject(tmpCam).sub(P1).normalize(); return P1.clone().add(v.multiplyScalar(D / v.dot(fwd))); };
    const top = at(nyTop), bot = at(nyBot);
    const h = top.distanceTo(bot);
    door.position.copy(bot); door.quaternion.copy(tmpCam.quaternion); door.scale.setScalar(h * 0.98 / (DH + 0.16));
    U.uClear.value.set(bot.x, bot.z, 2.2); U.uPath.value.set(0, 5.5, bot.x, bot.z);
    pool.position.set(bot.x, 0.02, bot.z); pool.scale.setScalar(h * 1.3);
  }

  function resize(){
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth/innerHeight;
    camera.fov = camera.aspect < 0.8 ? 55 : 38;
    camera.updateProjectionMatrix();
    oCam.right = innerWidth; oCam.bottom = innerHeight; oCam.updateProjectionMatrix();
    tCam.right = innerWidth; tCam.bottom = -innerHeight; tCam.updateProjectionMatrix();
    layoutTiles(false); poses();
  }
  addEventListener('resize', () => { resize(); kick(); }); resize();
  if (trig) ST_.refresh();

  // ---- tile physics step ----
  function stepTiles(dt, tt){
    const R = Math.hypot(TW, TH, TD) / 2;
    for (const t of tiles) {
      if (t.state === 'idle') {
        const gx = t.hx + Math.sin(tt*0.8 + t.ph)*5, gy = t.hy + Math.cos(tt*1.1 + t.ph)*6;
        // soft cursor push when hovering slowly
        let fx = 0, fy = 0;
        if (ptr.inZone && !reduced) { const dx = t.x - ptr.x, dy = t.y - ptr.y, d = Math.hypot(dx, dy); if (d < 110 && d > 1) { const f = (1 - d/110) * 700; fx = dx/d*f; fy = dy/d*f; } }
        t.vx += ((gx - t.x) * 40 - t.vx * 9 + fx) * dt; t.vy += ((gy - t.y) * 40 - t.vy * 9 + fy) * dt;
        t.x += t.vx * dt; t.y += t.vy * dt;
        t.vx = Math.max(-900, Math.min(900, t.vx)); t.vy = Math.max(-900, Math.min(900, t.vy));
        t.x = Math.min(ZW - TW/2 - 8, Math.max(TW/2 + 8, t.x)); t.y = Math.min(ZH - TH/2 - 14, Math.max(TH/2 + 14, t.y));
        const cl = v => Math.max(-.4, Math.min(.4, v));
        t.rx = cl(Math.sin(tt*0.9 + t.ph)*0.18 + t.vy*0.0006); t.ry = cl(Math.cos(tt*0.7 + t.ph)*0.25 - t.vx*0.0006); t.rz = cl(Math.sin(tt*0.6 + t.ph*2)*0.05 - t.vx*0.0003);
        t.s = 1;
      } else if (t.state === 'flying') {
        t.age += dt;
        t.vy += 1500 * dt; t.vx *= Math.exp(-0.8*dt); t.vy *= Math.exp(-0.4*dt);
        t.x += t.vx * dt; t.y += t.vy * dt; t.rx += t.wx * dt; t.ry += t.wy * dt; t.rz += t.wz * dt;
        t.s = 1 - sstep(0.25, 0.9, t.age);
        const r = R * t.s;
        if (t.x < r) { t.x = r; t.vx = Math.abs(t.vx) * 0.55; } if (t.x > ZW - r) { t.x = ZW - r; t.vx = -Math.abs(t.vx) * 0.55; }
        if (t.y < r) { t.y = r; t.vy = Math.abs(t.vy) * 0.55; } if (t.y > ZH - r) { t.y = ZH - r; t.vy = -Math.abs(t.vy) * 0.5; }
        // bump idle neighbours
        for (const o of tiles) { if (o.state !== 'idle') continue; const dx = o.x - t.x, dy = o.y - t.y, d = Math.hypot(dx, dy); if (d < (TW*0.6) * (0.5 + t.s*0.5) && d > 1) { o.vx += dx/d*5200*dt; o.vy += dy/d*5200*dt; } }
        if (t.age > 0.9) { t.state = 'gone'; burst = Math.max(burst, 0.25); }
      }
    }
  }

  let visible = true; document.addEventListener('visibilitychange', () => visible = !document.hidden);
  let last = performance.now(), lastR = last, simT = 0, raf = 0, jsAcc = 0, jsN = 0;
  const vTmp = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3();
  function frame(now){
    raf = 0;
    const t0 = performance.now(); renderer.info.reset();
    const dt = Math.min(0.05, (now - last)/1000); last = now;
    if (lenis && !gsap) lenis.raf(now);
    if (!reduced) simT += dt;
    U.uTime.value = simT;
    autoKnock(now);
    const heroT = updateScore(now, reduced ? 1 : dt);
    burst = Math.max(0, burst - dt*0.8); U.uBurst.value = reduced ? 0 : burst;
    heroRing.u.uP.value = heroT;

    const dtR = Math.min(0.25, (now - lastR)/1000); lastR = now;
    storyS = reduced ? 0 : storyS + (storyP - storyS) * (1 - Math.exp(-9 * dtR));
    if (Math.abs(storyS - storyP) < 1e-4) storyS = storyP;
    const s = storyS;
    let gp = 0, ga = 1;
    if (trig) ({ gp, ga } = updateStoryDOM(s));
    if (storyRing) { storyRing.u.uP.value = gp; storyRing.u.uA.value = ga; }
    U.uGrow.value = Math.max(heroT, gp);

    const idle = now - lastMove > 2500;
    if (idle && !reduced) target.set(Math.sin(simT*0.35)*W*0.45, 0, 1.2 + Math.sin(simT*0.21)*1.2);
    const k = 1 - Math.exp(-8*dt); smoothMouse.lerp(target, reduced ? 1 : k);
    U.uMouse.value.copy(smoothMouse);
    speed *= Math.exp(-1.5*dt);
    U.uStrength.value = reduced ? 0 : (idle ? 0.55 : 0.75 + 0.25*speed) * (1 - sstep(.4,.6,s));
    heroRing.u.uMouse.value.lerp(new THREE.Vector2(px, py), k);

    // camera: hero scroll dolly, then the story fly-through (scrubbed by ScrollTrigger, reversible)
    const portrait = camera.aspect < 0.8;
    const sc = Math.min(1, (lenis ? lenis.scroll : scrollY) / innerHeight);
    const y0 = (portrait?1.2:1.0), ly0 = (portrait?3.1:2.15);
    camera.position.set((px-.5)*0.25*(1-s), y0 - sc*0.45, 6.6 - sc*1.6);
    lookA.set(0, ly0 - sc*0.5, 0);
    if (s > 0) {
      const a = inOut(sstep(0, .45, s)), f = inOut(sstep(.45, .8, s));
      // story overview: rise above the field (blades stay below the lens), then fly down the cleared trail
      camera.position.y += (portrait ? 1.05 : 1.15) * a; camera.position.z -= 0.6 * a;
      lookA.y -= (portrait ? 0.9 : 0.75) * a;
      vTmp.copy(camera.position).lerp(P1, f); camera.position.copy(vTmp);
      lookB.copy(lookA).lerp(L1, f); lookA.copy(lookB);
      U.uPathK.value = sstep(.38, .52, s);
    } else U.uPathK.value = 0;
    camera.lookAt(lookA);

    doorA.value = sstep(.45, .62, s); doorOpen.value = inOut(sstep(.8, .97, s));
    door.visible = pool.visible = doorA.value > 0.001;
    frameMat.opacity = doorA.value; sign.material.opacity = doorA.value;
    panels.forEach(p => p.pivot.rotation.y = -p.sd * doorOpen.value * 1.75);

    heroRing.sync(); if (storyRing) storyRing.sync();

    // tiles
    const zr = zone.getBoundingClientRect();
    const zoneOn = zr.bottom > 0 && zr.top < innerHeight;
    if (!reduced) stepTiles(dt, simT);
    for (const t of tiles) {
      const m = t.mesh; m.visible = zoneOn && t.state !== 'gone' && !reduced;
      if (!m.visible) continue;
      m.position.set(zr.left + t.x, -(zr.top + t.y), 0);
      m.scale.set(TW * t.s, TH * t.s, TD * t.s); m.rotation.set(t.rx, t.ry, t.rz); t.uA.value = Math.min(1, t.s * 1.6);
    }

    renderer.autoClear = true; renderer.render(scene, camera);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(tScene, tCam); renderer.render(oScene, oCam);
    jsAcc += performance.now() - t0; jsN++;
    const P = window.__proof; P.score = Math.round(score); P.frames = (P.frames||0)+1; P.story = +s.toFixed(3); P.cleared = cleared;
    if (jsN >= 30) { P.jsMs = +(jsAcc/jsN).toFixed(2); jsAcc = 0; jsN = 0; }
    P.calls = renderer.info.render.calls; P.tris = renderer.info.render.triangles;
    if (!reduced && visible) raf = requestAnimationFrame(frame);
  }
  window.__proof = { webgl:true, blades:N, tiles:tiles.length }; window.__tiles = qs.has("debug") ? tiles : undefined;
  if (reduced) { html.classList.add('chips-on'); }
  // precompile every program up front so the door/tiles don't hitch the first time they appear
  door.visible = pool.visible = true; renderer.compile(scene, camera); renderer.compile(tScene, tCam); renderer.compile(oScene, oCam); door.visible = pool.visible = false;
  kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  kick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduced) { last = performance.now(); kick(); } });
}
