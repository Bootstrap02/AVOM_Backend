# Project status

Last updated after first full test run on a machine with power. This lists what exists, how far it was verified, and what is left.

## Verification level (important)
All three apps have been verified on a machine with Node.js and installed packages:
- **Backend:** all 26 logic tests pass (`npm run test:logic`), all 11 API integration tests pass (`npm run test:api` against in-memory MongoDB). Lint passes. Server starts and responds on `/api/v1/health`.
- **Admin app:** builds cleanly with Vite (`npm run build`), lint passes.
- **User site:** builds cleanly with Vite (`npm run build`), lint passes.

**Next:** `npm run seed -- --demo` against a real MongoDB, start the three apps, and click through the end-to-end workflows in Copilot.md.

## Built (backend)
Auth (student/staff separated, rotating refresh cookies with reuse detection, activation, reset, change password) · roles and per-person permissions · audit log · email service (Resend or console log) with editable templates · applications (pending/accepted/rejected, atomic accept, rejection reason emailed) · student numbers (configurable pattern) · offline students and CSV import · programme/course/module/batch setup · lessons with 3 video+quiz parts · direct-upload signatures and storage provider layer (Cloudinary + mock) · quizzes with server-side grading, attempt limits, highest score official · publishing to batches (clock starts at publish) · progress autosave, Continue Learning, dashboard, results · NGO and radio managers with pin/expiry · podcast RSS feed · support questions and FAQ · attendance · certificates (eligibility, override by Super Admin, PDF, public verify) · Paystack (initialize, verify, signed webhook) · settings · daily sweep job (expire lectures, delete files safely, expire content, 7-day warnings, pause/move inactive students).

## Built (admin app, `AVOM_Admin`)
Login/activate/reset · dashboard with real numbers · applications · students (filters, offline add, CSV import/export, record view, suspend, batch assign) · school setup · batches · lesson editor (chunked direct upload, quiz editor, preview, publish) · published lectures monitor · results/attendance/certificates · NGO and radio managers (with gallery upload) · lecturer course-results screen · support inbox (WhatsApp-aware) · FAQ · staff and permissions · payments · email templates · activity log · settings.

## Built (user site, `AVOM_Frontend`)
Home, About, Our Arms (+ arm pages), Bible School, NGO (+ story pages), Radio/podcast player, Partners and giving, Contact, certificate verification · stepped application form · student login/activate/reset · dashboard with CONTINUE LEARNING · My Courses · lesson page (video autosave every 15s, quizzes, retry, unlock rules) · results · certificates and attendance · profile · Ask a Question with FAQ search.

## Not done / known gaps
- WhatsApp Business API: code is written (signed webhook at `/api/v1/whatsapp/webhook`, inbound messages become support questions matched to students by phone number, staff replies go back over WhatsApp) but needs real Meta credentials and a registered webhook to test. WhatsApp only allows free-form replies within 24 hours of the person's last message; after that a pre-approved template message is needed (not built).
- Live radio: player appears when `radio.liveStreamUrl` is set in Settings; no streaming provider is set up.
- Excel import: the admin app accepts `.xlsx` through the `read-excel-file` package (added to `package.json`, never run). Video.js is not used (native `<video>`; fine for MP4, add Video.js if adaptive streaming is wanted). NGO stories use a small safe formatting syntax (headings, bullets, bold, links) instead of a rich-text editor; TipTap can replace it later.
- Cloudinary signed URLs are **not time-limited** unless token authentication (a paid feature) is enabled; links are unguessable and only issued to authorised students. Screen recording cannot be prevented.
- Refresh and logout require an `X-Requested-With: avom` header (CSRF defence) in addition to the cookie and the CORS allow-list.
- Public site wording: biography is a short summary from AVOM's document; arm pages (Political Wing, City Elders, etc.) are placeholders until AVOM supplies text.
- Browser-level end-to-end tests (Playwright) do not exist yet.

## Open questions for AVOM (configuration, not blockers)
Official programme/course/level names · attendance thresholds (defaults: pause after 7 idle days, move batch after 30) · certificate requirements per programme (defaults: 100% lessons, 0% average).
