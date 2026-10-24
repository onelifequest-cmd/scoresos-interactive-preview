// Maxine orb + canned-answer chat. No AI backend: answers come from config.chat.kb.
export function initMaxine(chat, { reduced, coarse }){
  const $ = id => document.getElementById(id);
  const panel = $('chat'), log = $('chat-log'), qwrap = $('chat-q'), form = $('chat-form'), input = $('chat-input');
  const orb = $('orb');
  const avatar = chat.avatar || 'maxine.webp';
  document.querySelectorAll('[data-orb] img, .chat-h img').forEach(i => i.src = avatar);
  document.querySelectorAll('[data-chatlabel]').forEach(e => e.textContent = chat.label || 'Ask Maxine');
  orb.setAttribute('aria-label', chat.label || 'Ask Maxine');
  $('chat-h').textContent = chat.name || 'Maxine';
  $('chat-sub').textContent = chat.sub || '';
  $('chat-f').textContent = chat.footer || '';
  const cta = $('chat-cta');
  (chat.buttons || []).forEach(b => { const a = document.createElement('a'); a.className = 'btn ' + (b.style || 'ghost'); a.href = b.href; a.textContent = b.label; a.target = '_blank'; a.rel = 'noopener'; cta.appendChild(a); });
  const kb = chat.kb || [];
  kb.forEach(item => { const b = document.createElement('button'); b.type = 'button'; b.textContent = item.q; b.onclick = () => ask(item.q, item); qwrap.appendChild(b); });

  function add(text, who){ const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function match(q){
    const s = q.toLowerCase(); let best = null, bs = 0;
    for (const it of kb){ let sc = 0; for (const k of it.k || []) if (s.includes(k)) sc += k.length; if (sc > bs){ bs = sc; best = it; } }
    return best;
  }
  let talking = 0;
  function ask(q, item){
    add(q, 'me');
    const it = item || match(q);
    const t = add('• • •', 'bot typing');
    orb.classList.add('talk'); talking++;
    setTimeout(() => { t.classList.remove('typing'); t.textContent = it ? it.a : (chat.fallback || ''); log.scrollTop = log.scrollHeight; if (--talking === 0) orb.classList.remove('talk'); }, reduced ? 0 : 550);
  }
  form.addEventListener('submit', e => { e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ''; ask(q); });

  let opened = false, lastOpener = null;
  function open(from){
    lastOpener = from; panel.hidden = false;
    if (!opened){ add(chat.intro || 'Hi!', 'bot'); opened = true; }
    document.querySelectorAll('[data-orb]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    if (!coarse) input.focus({ preventScroll: true });
  }
  function close(){ panel.hidden = true; document.querySelectorAll('[data-orb]').forEach(b => b.setAttribute('aria-expanded', 'false')); lastOpener?.focus({ preventScroll: true }); }
  document.querySelectorAll('[data-orb]').forEach(b => b.addEventListener('click', () => panel.hidden ? open(b) : close()));
  $('chat-x').onclick = close;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  // soft follow: the docked orb leans toward the cursor on a damped spring (max ~70px), never leaves its corner
  if (!reduced && !coarse){
    let tx = 0, ty = 0, x = 0, y = 0, vx = 0, vy = 0, last = performance.now();
    addEventListener('pointermove', e => {
      const r = { x: innerWidth - 60, y: innerHeight - 60 };
      const dx = e.clientX - r.x, dy = e.clientY - r.y, d = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, 380 / d) * Math.min(d, 260) / 260; // strongest when the cursor is nearby
      tx = dx / d * 70 * pull; ty = dy / d * 70 * pull;
    }, { passive: true });
    const step = now => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const k = 60, c = 11; // spring + damping (second-order follower)
      vx += (k * (tx - x) - c * vx) * dt; vy += (k * (ty - y) - c * vy) * dt; x += vx * dt; y += vy * dt;
      const bob = Math.sin(now / 900) * 4;
      orb.style.transform = panel.hidden ? `translate(${x.toFixed(1)}px,${(y + bob).toFixed(1)}px)` : 'none';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return { open, close, ask };
}
