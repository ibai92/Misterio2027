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
