# Deployment guide (current setup)

Live addresses:

| App | Host | Address |
|---|---|---|
| Public site + student portal (`AVOM_Frontend`) | Vercel | https://avom-beige.vercel.app |
| Staff site (`AVOM_Admin`) | Vercel | https://avom-admin.vercel.app |
| API (`AVOM_Backend`) | Render | https://avom-backend.onrender.com |
| Database / media / email | MongoDB Atlas / Cloudinary / Resend | |

## How the pieces talk (important)
The two sites and the API live on **different domains**, and browsers (Safari, Firefox, Brave, Chrome in some modes) block login cookies between different domains. So each Vercel site **forwards `/api/*` to Render itself** (`vercel.json` rewrite). The browser only ever talks to its own domain, the login cookie is first-party, and it works everywhere. This also means the front ends must call the relative path `/api/v1`: **do not set `VITE_API_URL` on Vercel** (or set it to `/api/v1`).

Later, when AVOM has a domain, the cleaner setup is `avomglobal.org` / `admin.…` / `api.…` with direct calls. Not needed now.

## Fix checklist for what is deployed now
1. **Push the new files** (`vercel.json`, `public/`, logos) in both front-end repos. Without `vercel.json`, refreshing or opening any page except the home page (for example `/login`) shows a Vercel 404, and the API is not reachable without the proxy.
2. **Vercel → each project → Settings → Environment Variables:** delete `VITE_API_URL` (or set it to `/api/v1`), then **Redeploy** (variables are baked in at build time).
3. **Render → Environment** (exact values, no trailing slashes):
   - `NODE_ENV=production`
   - `CLIENT_URL=https://avom-beige.vercel.app`
   - `ADMIN_URL=https://avom-admin.vercel.app`
   - `TRUST_PROXY_HOPS=2`
   - `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, and **no** `COOKIE_DOMAIN`
   - `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (two different long random strings)
   - `STORAGE_PROVIDER=cloudinary` plus the three Cloudinary values (or `mock` while testing)
   - `EMAIL_MODE=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (a verified Resend domain; until then use `EMAIL_MODE=log` and read activation links in the Render logs)
   - `CRON_SECRET` (any long random string)
   Save, and let Render redeploy.
4. **Atlas → Network Access:** allow Render (`0.0.0.0/0` is the practical choice on Render's free tier; use a strong database password).
5. **Create the first Super Admin** (once). Production has none until you create it; the `SEED_*` values alone do nothing.
   - **Easiest (no terminal):** on Render add `SEED_ON_START=true`, `SEED_ADMIN_EMAIL=you@yourmail.com`, `SEED_ADMIN_PASSWORD=` (your own, 10+ characters), `SEED_ADMIN_NAME=Your Name`, save, and let it redeploy. Check the Render logs for "Bootstrap: created Super Admin". Log in, then **delete `SEED_ON_START` and the `SEED_*` variables**. It only runs when no Super Admin exists. The example password `ChangeMe!12345` is public in the repo and is refused in production.
   - **Or from a computer with the backend repo and Node installed:
   - PowerShell: `$env:MONGODB_URI="…"; $env:SEED_ADMIN_EMAIL="you@example.com"; $env:SEED_ADMIN_PASSWORD="a-strong-password"; npm run seed`
   - Mac/Linux: `MONGODB_URI="…" SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run seed`
   (Use `npm run seed -- --demo` to also add a fictional test programme.) Do not commit these values. Change the password after the first login.
6. **Run the smoke test** against production (from the backend repo, Node 18+):
   ```
   node scripts/smoke.js https://avom-backend.onrender.com --site https://avom-beige.vercel.app --admin https://avom-admin.vercel.app
   ```
   Add `SMOKE_EMAIL` and `SMOKE_PASSWORD` (the Super Admin) to also test staff login and the cookie. It prints PASS/FAIL per check with a hint for each failure. Paste the output to me if anything fails.

## Render free tier: what to expect
- The service **sleeps after ~15 minutes** idle. The next visitor waits up to a minute, and through the Vercel rewrite that first request can time out. Fix: a free uptime monitor (UptimeRobot) pinging `https://avom-backend.onrender.com/api/v1/health` every 5 minutes, or switch to the paid always-on plan before students use it.
- **Daily sweep** (expiry, file deletion, warnings, pausing): do not rely on the in-process timer on a sleeping service. Set `RUN_JOBS=false` and have a free scheduler (cron-job.org) call `POST https://avom-backend.onrender.com/api/v1/internal/run-expiry` once a day with header `x-cron-secret: <CRON_SECRET>`. Test it first with throwaway lectures.
- Never put real student data in the system until Atlas backups are on.

## Smoke test by hand
Public site on a phone → apply → admin accepts → activation email (or Render log link) → student activates and logs in → admin uploads a short video to a lesson, adds quizzes, publishes → student plays, takes a quiz, closes the tab, reopens "Continue Learning". Also open `/login` on the admin site directly and refresh it (must not 404).

## Pricing
Free tiers have limits (Cloudinary credits and bandwidth, Resend daily send limits, Vercel Hobby is for non-commercial use). Check each provider's current terms and prices before launch.
