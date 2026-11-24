// Servidor de la web (Cloudflare Worker + base de datos D1 llamada DB).
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const json = (d, s = 200, h = {}) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const sidDe = req => ((req.headers.get('Cookie') || '').match(/sid=([a-f0-9]+)/) || [])[1];

// Las contraseñas NUNCA se guardan en claro: se guarda un hash con sal.
async function hash(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return b64(bits);
}
async function crear(env, email, password, role) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await env.DB.prepare('INSERT INTO users (email,salt,hash,role) VALUES (?,?,?,?)')
    .bind(email, b64(salt), await hash(password, salt), role).run();
}
async function usuarioActual(env, req) {
  const sid = sidDe(req);
  if (!sid) return null;
  return env.DB.prepare('SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?')
    .bind(sid, Date.now()).first();
}

async function api(request, env, ruta) {
  const post = request.method === 'POST';
  const d = post ? await request.json().catch(() => ({})) : {};
  const email = String(d.email || '').trim().toLowerCase();
  const pass = String(d.password || '');

  // Crear el primer administrador (solo si no hay usuarios y la clave es correcta)
  if (ruta === 'setup' && post) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if (n.n > 0) return json({ error: 'La configuración inicial ya se hizo' }, 403);
    if (!env.SETUP_KEY) return json({ error: 'El servidor no ve SETUP_KEY: revisa dónde la creaste' }, 403);
    if (String(d.key || '').trim() !== String(env.SETUP_KEY).trim()) return json({ error: 'Clave de configuración incorrecta' }, 403);
    if (!emailOk(email) || pass.length < 8) return json({ error: 'Correo no válido o contraseña de menos de 8 caracteres' }, 400);
    await crear(env, email, pass, 'admin');
    return json({ ok: true });
  }

  if (ruta === 'login' && post) {
    const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (!u || (await hash(pass, unb64(u.salt))) !== u.hash) return json({ error: 'Correo o contraseña incorrectos' }, 401);
    const sid = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO sessions (id,user_id,expires) VALUES (?,?,?)').bind(sid, u.id, Date.now() + 86400000).run();
    return json({ ok: true }, 200, { 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400` });
  }

  if (ruta === 'logout' && post) {
    const sid = sidDe(request);
    if (sid) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
    return json({ ok: true }, 200, { 'Set-Cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }

  const yo = await usuarioActual(env, request);
  if (!yo) return json({ error: 'Sesión no iniciada' }, 401);
  if (ruta === 'me') return json({ email: yo.email, role: yo.role });

  // A partir de aquí, solo administradores
  if (yo.role !== 'admin') return json({ error: 'No autorizado' }, 403);

  if (ruta === 'users' && !post) {
    const { results } = await env.DB.prepare('SELECT id,email,role FROM users ORDER BY id').all();
    return json({ users: results });
  }
  if (ruta === 'users' && post) {
    if (!emailOk(email) || pass.length < 8) return json({ error: 'Correo no válido o contraseña de menos de 8 caracteres' }, 400);
    try { await crear(env, email, pass, d.role === 'admin' ? 'admin' : 'user'); }
    catch { return json({ error: 'Ese correo ya existe' }, 409); }
    return json({ ok: true });
  }
  if (ruta === 'users/delete' && post) {
    if (d.id === yo.id) return json({ error: 'No puedes eliminarte a ti mismo' }, 400);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(d.id).run();
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(d.id).run();
    return json({ ok: true });
  }
  return json({ error: 'No encontrado' }, 404);
}

// Páginas que se pueden ver SIN iniciar sesión
const PUBLICAS = ['/login', '/login.html', '/setup', '/setup.html', '/style.css', '/app.js'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname.slice(5).replace(/\/+$/, ''));
    if (PUBLICAS.includes(url.pathname)) return env.ASSETS.fetch(request);
    // Todo lo demás exige sesión iniciada
    if (!(await usuarioActual(env, request))) return Response.redirect(url.origin + '/login.html', 302);
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    h.set('Cache-Control', 'private, no-store');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }
};
