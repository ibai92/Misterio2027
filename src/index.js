// Servidor de la web (Cloudflare Worker + base de datos D1 llamada DB).
// Acceso por número secreto de 4 cifras. El administrador viene configurado con el 2123.
const ADMIN_PIN = '2123';
const PUBLICAS = ['/login', '/login.html', '/style.css', '/app.js'];   // visibles sin sesión
const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const sidDe = req => ((req.headers.get('Cookie') || '').match(/sid=([a-f0-9]+)/) || [])[1];
const pinOk = p => /^[0-9]{4}$/.test(p);
const TABLAS = [
  "CREATE TABLE IF NOT EXISTS personas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, pin TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'user')",
  'CREATE TABLE IF NOT EXISTS sesiones (id TEXT PRIMARY KEY, persona_id INTEGER NOT NULL, expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS respuestas (persona_id INTEGER PRIMARY KEY, estado TEXT NOT NULL, actualizado INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS intentos (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, desde INTEGER NOT NULL)'
];
let listo = false;
async function preparar(env) {
  await env.DB.batch(TABLAS.map(q => env.DB.prepare(q)));
  await env.DB.prepare("INSERT OR IGNORE INTO personas (nombre,pin,role) SELECT 'Administrador', ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM personas WHERE role='admin')").bind(ADMIN_PIN).run();
}
async function actual(env, req) {
  const sid = sidDe(req);
  if (!sid) return null;
  try {
    return await env.DB.prepare('SELECT p.id,p.nombre,p.role FROM sesiones s JOIN personas p ON p.id=s.persona_id WHERE s.id=? AND s.expires>?')
      .bind(sid, Date.now()).first();
  } catch { return null; }
}

async function api(request, env, ruta) {
  if (!listo) { await preparar(env); listo = true; }
  const post = request.method === 'POST';
  const d = post ? await request.json().catch(() => ({})) : {};
  const pin = String(d.pin || '').trim();

  if (ruta === 'login' && post) {
    // Máximo 8 intentos fallidos cada 10 minutos por conexión
    const ip = request.headers.get('CF-Connecting-IP') || 'desconocida', ahora = Date.now();
    const r = await env.DB.prepare('SELECT n,desde FROM intentos WHERE ip=?').bind(ip).first();
    const vigente = r && ahora - r.desde < 600000;
    if (vigente && r.n >= 8) return json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' }, 429);
    const p = pinOk(pin) ? await env.DB.prepare('SELECT id FROM personas WHERE pin=?').bind(pin).first() : null;
    if (!p) {
      await env.DB.prepare('INSERT INTO intentos (ip,n,desde) VALUES (?1,1,?2) ON CONFLICT(ip) DO UPDATE SET n=?3, desde=?4')
        .bind(ip, ahora, vigente ? r.n + 1 : 1, vigente ? r.desde : ahora).run();
      return json({ error: 'Ese número no abre el candado.' }, 401);
    }
    await env.DB.prepare('DELETE FROM intentos WHERE ip=?').bind(ip).run();
    const sid = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO sesiones (id,persona_id,expires) VALUES (?,?,?)').bind(sid, p.id, ahora + 86400000).run();
    return json({ ok: true }, 200, { 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400` });
  }

  if (ruta === 'logout' && post) {
    const sid = sidDe(request);
    if (sid) await env.DB.prepare('DELETE FROM sesiones WHERE id=?').bind(sid).run();
    return json({ ok: true }, 200, { 'Set-Cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }

  const yo = await actual(env, request);
  if (!yo) return json({ error: 'Sesión no iniciada' }, 401);
  if (ruta === 'me') return json({ nombre: yo.nombre, role: yo.role });

  // Confirmación de asistencia (cada persona guarda la suya)
  if (ruta === 'rsvp') {
    if (!post) {
      const r = await env.DB.prepare('SELECT estado FROM respuestas WHERE persona_id=?').bind(yo.id).first();
      return json({ estado: r ? r.estado : null });
    }
    if (!['si', 'no'].includes(d.estado)) return json({ error: 'Respuesta no válida' }, 400);
    await env.DB.prepare('INSERT INTO respuestas (persona_id,estado,actualizado) VALUES (?1,?2,?3) ON CONFLICT(persona_id) DO UPDATE SET estado=?2, actualizado=?3')
      .bind(yo.id, d.estado, Date.now()).run();
    return json({ ok: true });
  }

  // A partir de aquí, solo el administrador
  if (yo.role !== 'admin') return json({ error: 'No autorizado' }, 403);

  if (ruta === 'personas' && !post) {
    const { results } = await env.DB.prepare('SELECT p.id,p.nombre,p.pin,p.role,r.estado FROM personas p LEFT JOIN respuestas r ON r.persona_id=p.id ORDER BY p.id').all();
    return json({ personas: results });
  }
  if (ruta === 'personas' && post) {
    const nombre = String(d.nombre || '').trim().slice(0, 60);
    if (!nombre || !pinOk(pin)) return json({ error: 'Escribe un nombre y un número de 4 cifras' }, 400);
    try { await env.DB.prepare('INSERT INTO personas (nombre,pin,role) VALUES (?,?,?)').bind(nombre, pin, d.role === 'admin' ? 'admin' : 'user').run(); }
    catch { return json({ error: 'Ese número ya lo tiene otra persona' }, 409); }
    return json({ ok: true });
  }
  if (ruta === 'personas/pin' && post) {
    if (!pinOk(pin)) return json({ error: 'El número debe tener 4 cifras' }, 400);
    try { await env.DB.prepare('UPDATE personas SET pin=? WHERE id=?').bind(pin, d.id).run(); }
    catch { return json({ error: 'Ese número ya lo tiene otra persona' }, 409); }
    return json({ ok: true });
  }
  if (ruta === 'personas/delete' && post) {
    if (d.id === yo.id) return json({ error: 'No puedes eliminarte a ti mismo' }, 400);
    await env.DB.prepare('DELETE FROM respuestas WHERE persona_id=?').bind(d.id).run();
    await env.DB.prepare('DELETE FROM sesiones WHERE persona_id=?').bind(d.id).run();
    await env.DB.prepare('DELETE FROM personas WHERE id=?').bind(d.id).run();
    return json({ ok: true });
  }
  return json({ error: 'No encontrado' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname.slice(5).replace(/\/+$/, ''));
    if (PUBLICAS.includes(url.pathname)) return env.ASSETS.fetch(request);
    // Todo lo demás exige sesión iniciada
    if (!(await actual(env, request))) return Response.redirect(url.origin + '/login.html', 302);
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    h.set('Cache-Control', 'private, no-store');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }
};
