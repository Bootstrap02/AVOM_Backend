# AVOM Digital Platform: Project Guide (v2)

Permanent reference for Claude, Copilot and any developer. Supersedes the earlier Copilot.md. Where this file conflicts with the quotation, **this file wins**; the quotation only set the price.

## 1. Architecture (fixed)

Three **separate repositories**. Copy this file into each.

| Repo | Purpose | Dev port |
|---|---|---|
| `AVOM_Backend` | One shared REST API at `/api/v1`, Node, Express 5, Mongoose, CommonJS | 5000 |
| `AVOM_Frontend` | User website: public site and student portal (React 19, Vite) | 5173 |
| `AVOM_Admin` | Staff website: its own app, routing, layout, login (React 19, Vite) | 5174 |

- One MongoDB database. Never a second backend or database.
- Business rules live in the backend only. Frontends display and call the API; hiding a button is not security.
- JavaScript, not TypeScript.

## 2. Stack

Use what is already in the repos: Express 5, Mongoose, JWT with refresh cookies, bcryptjs, helmet, cors, express-rate-limit, express-validator, multer, node-cron, pdfkit, Resend, Cloudinary, Jest and Supertest; React Router, Tailwind 4, react-hook-form with Yup, Axios, Recharts, lucide-react, react-hot-toast.

The owner has given a flexible hand: add or swap a library when it is clearly the better choice (candidates: Video.js for lectures, TipTap for NGO stories, ExcelJS for imports/exports, TanStack Query, qrcode, pino). Mention each addition in the task report with a one-line reason. Do not add dependencies casually.

## 3. Product scope

**User website.** Public: Home, About and Vision, Our Arms (one short page each; includes AVOCOM and Book Publishing/eBooks; Political Wing and City Elders are single pages), NGO, Radio and Podcast (archive, recorded player, live radio player, Spotify/podcast links, podcast feed, Wednesday schedule as configurable data), Gallery, Partners, Contact (form, WhatsApp, social). Student portal: apply, activate, login, reset password, dashboard, My Courses, lessons, quizzes, results, attendance, certificates, profile, Ask a Question and FAQ.

**Admin website.** Dashboard, applications, students (incl. offline add and Excel bulk import), school setup, lectures and quizzes, batches, records, attendance, certificates, NGO manager, radio manager, support inbox (portal and WhatsApp), FAQ, staff and roles, email templates, payments, activity log, settings.

**Included features:** Paystack payments and partner/giving page, WhatsApp Business integration for student questions, live radio player. Implement them in the order the owner chooses, but they are in scope.

**Out of scope:** native mobile apps, SMS.

## 4. Business rules

### Applications and accounts
- Applications are free. Application status has exactly three values: `pending`, `accepted`, `rejected`.
- Reject requires a reason, which is emailed. Applicants may reapply; keep all history.
- Accept assigns programme and batch, generates a unique student number (format configurable, example `ABBS/2026/001`), and emails an activation link.
- Student **account** state is separate from application status: `active`, `paused`, `suspended`.
- Offline (on-ground/modular) students are created by an admin or bulk import into the same student and academic model. No separate database.
- Never use a name as an identifier. Never delete accounts that hold academic history; deactivate instead.

### Learning
- Hierarchy: Programme, Course, Module, Lesson. A lesson has three videos, each followed by a quiz (about 3 questions; 5 to 7 on the last). Counts and pass mark are admin-configurable.
- Quizzes are graded **on the server**. Correct answers are never sent to students before grading.
- Students continue whether they pass or fail. Every attempt is stored.
- **Retake policy (default, configurable per quiz):** up to 3 attempts per quiz, only while the lecture is live. The **highest** score is the official score; all attempts remain in the record. After the lecture expires, no further attempts.
- Progress is saved every ~15 seconds to the backend; browser storage is only a cache. "Continue Learning" restores the exact lesson, video and position on any device. A lesson is complete only when its videos and quizzes are done, not when the page is opened.

### Batches, publishing, expiry
- Students belong to batches; a student sees only lectures published to their batch.
- **Who publishes:** School Admin/Registrar and Super Admin. Lecturers create and edit drafts and quizzes but do not publish.
- Lecture access lasts **7 days from the moment it is published to a batch**, never from upload.
- **Expired lectures are deleted permanently.** Students cannot rewatch. No private archive copies are kept. Uploaders keep their own originals.
- Radio audio default 100 days; NGO content default 200 days; both start at publish date. All are editable per item, with a Keep (pin) switch, and admins get a warning email 7 days before.
- Deleting media never deletes progress, quiz attempts, scores, attendance or certificates.
- The daily expiry job must be idempotent: re-check expired, not pinned, not extended, has an asset ID; delete from Cloudinary (with CDN invalidation); record success or failure; keep the database record; a failed delete must not corrupt the record. Test with throwaway assets first.

### Attendance and pausing (defaults; the owner will refine)
- Not attending does **not** fail a student. The programme **pauses** for them (`paused` state).
- A student inactive for **one month** is moved into the next batch of the same course, which starts that course afresh. Their earlier records are kept.
- "Attendance" for online students is lesson activity; for on-ground and modular students it is marked by staff. Keep the thresholds in settings, not in code.

### Certificates
- A student qualifies when they complete the requirements of their programme. Requirements are stored per programme (configurable); do not hard-code them.
- Admins issue the certificate. Each has a unique verification number and a database record; a PDF alone proves nothing. Public verification page.

### Roles (backend-enforced)
Super Admin, School Admin/Registrar, Lecturer, Media Admin, Support. Roles are fixed; Super Admin can switch individual permissions per person. Media and Support staff must not see student academic records. Lecturers see only their own courses.

## 5. Media storage
- **Cloudinary first** for images, lecture video and audio.
- Put all provider calls behind a storage module (`upload`, `delete`, `signedUrl`, `usage`) so videos can move to Cloudflare Stream or Bunny later without touching business code.
- Large videos upload directly from the admin app (chunked, signed by the backend). The video never passes through Express. MongoDB stores metadata only: public ID, URL, type, format, size, duration, upload/publish/expiry dates, deletion status.
- Serve lecture video through signed, time-limited links after the backend checks batch and publish window.
- Monitor Cloudinary usage and surface it to admins.

## 6. Security
Helmet, strict CORS to the two front-end origins, rate limiting on auth routes, bcrypt, short-lived access token plus rotating HTTP-only refresh cookie, request validation, centralised errors, upload validation, audit log of admin actions. Never return password hashes, tokens, secrets or quiz answers. Never commit real secrets; keep `.env.example` current.

## 7. Design
Deep Blue `#2C3E50`, Soft Green `#6ABF4B` (buttons), Golden Yellow `#F1C40F` (sparingly), Light Grey `#BDC3C7`, White. Lato and Open Sans. Mobile first, large buttons, short forms: many students are older ministers. The admin app has its own layout and navigation, a utilitarian dashboard.

## 8. How to work
1. Read this file and the repo's README and `docs/` before changing anything; inspect current code first.
2. Work in small vertical slices (model, validator, service, controller, route, front-end service, UI, test).
3. Preserve existing behaviour; update API and database docs when contracts change.
4. Do not report a feature done until the real workflow works against the real backend and database.
5. Do not invent official AVOM content (programme names, biographies, policies). Use configurable placeholders and list open questions.
6. Do not deploy, buy services or run destructive operations without the owner's approval.
7. Each task ends with a short report: done, files changed, tests run, open items, one recommended next step.

## 9. Still open with AVOM
Real programme, course and level names; expected batch sizes; exact attendance thresholds; per-programme certificate requirements. These are configuration, not blockers.

## 10. Build order
1. Backend foundation: models for user/staff/student/application, auth (login, refresh, logout, reset, activation), roles middleware, audit log, email service.
2. Applications: public form, admin review, accept/reject emails, student numbers.
3. School setup and batches; storage module and direct video upload.
4. Lecture builder, publish-to-batch, signed playback, quizzes with server grading and retakes, progress save and resume.
5. Expiry and warning jobs.
6. Public content: NGO, radio/podcast, contact, gallery.
7. Records, attendance, pausing and batch moves, certificates, exports.
8. Support/WhatsApp, FAQ, payments and partners, hardening, handover docs.
