// Checks a deployed API (and optionally the Vercel proxy in front of it). Needs Node 18+.
//   node scripts/smoke.js https://avom-backend.onrender.com \
//        --site https://avom-beige.vercel.app --admin https://avom-admin.vercel.app
// Optional login test: SMOKE_EMAIL=... SMOKE_PASSWORD=... (a staff account)
// The first request may take up to a minute if the server was asleep.
const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/+$/, '');
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1].replace(/\/+$/, '') : null; };
const site = opt('--site');
const admin = opt('--admin');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke.js <api-base-url> [--site <url>] [--admin <url>]');
  process.exit(2);
}

let failed = 0;
const line = (ok, name, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
async function call(url, options = {}) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(90000), ...options });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { /* not JSON */ }
  return { res, text, json, ms: Date.now() - started };
}

(async () => {
  const api = `${base}/api/v1`;
  let r = await call(`${api}/health`);
  line(r.res.status === 200 && r.json?.success, 'API health', `${r.res.status}, ${r.ms} ms${r.ms > 8000 ? ', slow: server was probably asleep' : ''}`);
  if (r.json?.data) console.log('      ', JSON.stringify(r.json.data));

  r = await call(`${api}/nope`);
  line(r.res.status === 404 && r.json?.success === false, 'Unknown route returns JSON 404', String(r.res.status));

  r = await call(`${api}/public/settings`);
  line(r.res.status === 200 && r.json?.success, 'Database reachable (public settings)', `${r.res.status}${r.json?.message ? `: ${r.json.message}` : ''}`);

  r = await call(`${api}/public/programmes`);
  line(r.res.status === 200, 'Public programmes list', `${r.res.status}, ${Array.isArray(r.json?.data) ? r.json.data.length : '?'} programmes`);

  for (const [label, origin] of [['public site', site], ['admin site', admin]]) {
    if (!origin) continue;
    r = await call(`${api}/public/settings`, { headers: { Origin: origin } });
    const allowed = r.res.headers.get('access-control-allow-origin');
    line(allowed === origin, `CORS allows the ${label} origin`, allowed ? `got ${allowed}` : 'no CORS header: check CLIENT_URL / ADMIN_URL on Render');
    // Through the Vercel rewrite, the browser talks to its own domain.
    r = await call(`${origin}/api/v1/health`);
    line(r.res.status === 200 && r.json?.success, `${label} proxies /api/v1 to the API`, r.json ? String(r.res.status) : `got ${r.res.status} non-JSON: vercel.json rewrite missing or wrong`);
    r = await call(`${origin}/login`);
    line(r.res.status === 200 && /id="root"/.test(r.text), `${label} serves deep links like /login (SPA rewrite)`, String(r.res.status));
  }

  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    const origin = admin || base; // log in the way the admin site does: through its own domain when given
    r = await call(`${origin}/api/v1/auth/staff/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'avom', Origin: admin || '' },
      body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
    });
    line(r.res.status === 200 && r.json?.data?.accessToken, 'Staff login', `${r.res.status}${r.json?.message ? `: ${r.json.message}` : ''}`);
    const cookie = r.res.headers.get('set-cookie') || '';
    line(/HttpOnly/i.test(cookie) && /Secure/i.test(cookie), 'Refresh cookie is HttpOnly + Secure', cookie.replace(/=[^;]+/, '=…').slice(0, 120));
    if (r.json?.data?.accessToken) {
      const me = await call(`${origin}/api/v1/admin/dashboard`, { headers: { Authorization: `Bearer ${r.json.data.accessToken}`, Origin: admin || '' } });
      line(me.res.status === 200, 'Authenticated admin request (dashboard)', String(me.res.status));
    }
  } else {
    console.log('SKIP  Staff login (set SMOKE_EMAIL and SMOKE_PASSWORD to test it)');
  }

  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Smoke test crashed:', e.message); process.exit(1); });
