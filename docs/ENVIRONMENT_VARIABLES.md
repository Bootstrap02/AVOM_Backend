# Environment variables

Backend values live in `.env` (local) or the host's dashboard (production). Copy `.env.example`. Front ends need only `VITE_API_URL`.

| Variable | Needed | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development`, `test`, `production`. Production refuses to start without secrets. |
| `PORT` | no | Default 5000. |
| `MONGODB_URI` | yes | Atlas connection string. |
| `CLIENT_URL`, `ADMIN_URL` | yes | Exact origins of the two sites (CORS allow-list and email links). |
| `EXTRA_ALLOWED_ORIGINS` | no | Comma-separated extra origins (e.g. preview deployments). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | production | Long random strings, different from each other. |
| `JWT_ACCESS_TTL`, `STAFF_REFRESH_DAYS`, `STUDENT_REFRESH_DAYS` | no | Defaults 15m / 7 / 30. |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | production | `true`, `lax`, and leave `COOKIE_DOMAIN` empty when using the Vercel rewrite setup; `.yourdomain` only with custom domains. |
| `TRUST_PROXY_HOPS` | production | `2` behind Vercel rewrite → Render (so rate limits see the real visitor IP); `1` if only Render is in front. |
| `STORAGE_PROVIDER` | no | `auto`, `cloudinary`, or `mock` (no real uploads or deletes). |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | for real media | Cloudinary credentials. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_MODE` | for real email | `EMAIL_MODE=log` only prints emails to the console. |
| `CONTACT_INBOX` | no | Fallback address for the website contact form. |
| `PAYSTACK_SECRET_KEY`, `_PUBLIC_KEY`, `_WEBHOOK_SECRET` | when payments go live | Without a secret key, online giving is disabled. |
| `WHATSAPP_VERIFY_TOKEN`, `_ACCESS_TOKEN`, `_PHONE_NUMBER_ID`, `_APP_SECRET` | for WhatsApp | Meta Cloud API values. |
| `RUN_JOBS`, `JOBS_TIMEZONE`, `EXPIRY_CRON` | production | Enable the in-process daily sweep. |
| `CRON_SECRET` | if using an external scheduler | Protects `POST /api/v1/internal/run-expiry`. |
| `SEED_ADMIN_EMAIL`, `_PASSWORD`, `_NAME` | first setup only | Used by `npm run seed`; remove afterwards. |

Frontends: `VITE_API_URL`. **Leave it unset (or `/api/v1`) on Vercel** so the browser calls its own domain and `vercel.json` forwards `/api` to Render. Set a full URL only for local development (`http://localhost:5000/api/v1`). It is baked in at build time, so redeploy after changing it.
