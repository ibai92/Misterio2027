// Funciones comunes a todas las páginas
async function api(ruta, datos) {
  const opciones = datos === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos)
  };
  const r = await fetch('/api/' + ruta, opciones);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error inesperado'), { status: r.status });
  return j;
}
function aviso(el, texto, esError) { el.textContent = texto; el.className = 'msg' + (esError ? ' error' : ''); }

// Las páginas privadas llaman a esto: comprueba la sesión y activa el menú
async function iniciar() {
  let yo;
  try { yo = await api('me'); } catch { location.href = '/login.html'; return null; }
  const admin = document.getElementById('adminlink');
  if (admin && yo.role === 'admin') admin.hidden = false;
  const salir = document.getElementById('salir');
  if (salir) salir.onclick = async () => { await api('logout', {}); location.href = '/login.html'; };
  const limpia = p => p.replace(/\.html$/, '') || '/';
  document.querySelectorAll('nav a').forEach(a => {
    if (limpia(new URL(a.href).pathname) === limpia(location.pathname)) a.setAttribute('aria-current', 'page');
  });
  return yo;
}

// ===== Fondo animado: lluvia de estrellas =====
(function () {
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noche = document.body.classList.contains('noche');
  const c = document.createElement('canvas');
  c.id = 'cielo'; c.setAttribute('aria-hidden', 'true');
  document.body.prepend(c);
  const x = c.getContext('2d');
  const col = noche ? ['255,255,255', '246,227,176', '214,179,106'] : ['214,169,63', '224,85,138', '150,110,210'];
  let W, H, fijas = [], fugaces = [], chispas = [], t0 = 0, aF = 0, aC = 0;

  function medir() {
    const D = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = W * D; c.height = H * D; x.setTransform(D, 0, 0, D, 0, 0);
    fijas = Array.from({ length: Math.round(W * H / (noche ? 6500 : 15000)) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + .5,
      f: Math.random() * 6.28, v: Math.random() * .03 + .008, c: col[Math.random() * 3 | 0] }));
  }
  function estrella(px, py, r, rot) {
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + i * Math.PI / 4, d = i % 2 ? r * .3 : r;
      x.lineTo(px + Math.cos(a) * d, py + Math.sin(a) * d);
    }
    x.closePath(); x.fill();
  }
  function dibuja(t) {
    const dt = Math.min(t - t0, 50); t0 = t; aF += dt; aC += dt;
    x.clearRect(0, 0, W, H);
    fijas.forEach(s => {
      s.f += s.v;
      x.fillStyle = 'rgba(' + s.c + ',' + (.25 + .6 * Math.abs(Math.sin(s.f))) + ')';
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, 6.283); x.fill();
    });
    if (!quieto) {
      if (aF > (noche ? 420 : 900) && fugaces.length < 10) {
        aF = 0;
        fugaces.push({ x: Math.random() * W * 1.2, y: -40, vx: -(4 + Math.random() * 5), vy: 5 + Math.random() * 6,
                       l: 90 + Math.random() * 90, c: col[Math.random() * 3 | 0] });
      }
      if (aC > 260 && chispas.length < 40) {
        aC = 0;
        chispas.push({ x: Math.random() * W, y: -10, vx: (Math.random() - .5) * .6, vy: .6 + Math.random() * 1.4,
                       r: 3 + Math.random() * 5, a: Math.random() * 6, c: col[Math.random() * 3 | 0] });
      }
    }
    fugaces = fugaces.filter(s => s.y < H + 120 && s.x > -200);
    fugaces.forEach(s => {
      s.x += s.vx; s.y += s.vy;
      const k = s.l / Math.hypot(s.vx, s.vy), g = x.createLinearGradient(s.x, s.y, s.x - s.vx * k, s.y - s.vy * k);
      g.addColorStop(0, 'rgba(' + s.c + ',.95)'); g.addColorStop(1, 'rgba(' + s.c + ',0)');
      x.strokeStyle = g; x.lineWidth = 2; x.lineCap = 'round';
      x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - s.vx * k, s.y - s.vy * k); x.stroke();
    });
    chispas = chispas.filter(s => s.y < H + 20);
    chispas.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.a += .03;
      x.fillStyle = 'rgba(' + s.c + ',' + (.5 + .4 * Math.sin(s.a * 3)) + ')';
      estrella(s.x, s.y, s.r, s.a);
    });
    if (!quieto) requestAnimationFrame(dibuja);
  }
  medir(); addEventListener('resize', medir);
  requestAnimationFrame(dibuja);
})();

// ===== Transiciones mágicas entre páginas =====
// Los navegadores modernos usan View Transitions (ver style.css); el resto, este fundido.
if (!('CSSViewTransitionRule' in window) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('sin-vt');
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || e.defaultPrevented || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); document.body.classList.add('saliendo');
    setTimeout(() => { location.href = a.href; }, 450);
  });
}
