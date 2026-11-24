# API reference

Base path `/api/v1`. Responses: `{ success, message, data, meta? }`; errors: `{ success:false, message, errors:[{field,message}] }`.
Student and staff authenticate separately (`/auth/student/*`, `/auth/staff/*`); the backend rejects a student token on admin routes and vice versa. Every `/admin` route is permission-checked in `src/routes/index.js`.
Generated from the route table; see `docs/BUSINESS_RULES.md` for behaviour.

## Authentication

| Method | Path |
|---|---|
| POST | `/api/v1/auth/:audience/login` |
| POST | `/api/v1/auth/:audience/refresh` |
| POST | `/api/v1/auth/:audience/logout` |
| GET | `/api/v1/auth/me` |
| POST | `/api/v1/auth/activate` |
| POST | `/api/v1/auth/forgot-password` |
| POST | `/api/v1/auth/reset-password` |
| POST | `/api/v1/auth/change-password` |

## Public (no login)

| Method | Path |
|---|---|
| GET | `/api/v1/public/programmes` |
| POST | `/api/v1/public/applications` |
| GET | `/api/v1/public/ngo` |
| GET | `/api/v1/public/ngo/:key` |
| GET | `/api/v1/public/gallery` |
| GET | `/api/v1/public/radio` |
| GET | `/api/v1/public/radio/latest` |
| GET | `/api/v1/public/podcast.xml` |
| GET | `/api/v1/public/settings` |
| GET | `/api/v1/public/faq` |
| POST | `/api/v1/public/contact` |
| GET | `/api/v1/public/certificates/verify/:number` |
| POST | `/api/v1/public/payments/initialize` |
| GET | `/api/v1/public/payments/verify/:reference` |

## Student (student login)

| Method | Path |
|---|---|
| GET | `/api/v1/student/dashboard` |
| GET | `/api/v1/student/continue` |
| GET | `/api/v1/student/lectures` |
| GET | `/api/v1/student/lectures/:publicationId` |
| GET | `/api/v1/student/lectures/:publicationId/parts/:order/playback` |
| GET | `/api/v1/student/lectures/:publicationId/parts/:order/quiz` |
| POST | `/api/v1/student/lectures/:publicationId/parts/:order/quiz` |
| PUT | `/api/v1/student/progress` |
| GET | `/api/v1/student/results` |
| GET | `/api/v1/student/certificates` |
| GET | `/api/v1/student/attendance` |
| GET | `/api/v1/student/profile` |
| PATCH | `/api/v1/student/profile` |
| GET | `/api/v1/student/faq` |
| GET | `/api/v1/student/questions` |
| POST | `/api/v1/student/questions` |
| GET | `/api/v1/student/questions/:id` |
| POST | `/api/v1/student/questions/:id/replies` |

## Admin (staff login + permission per route)

| Method | Path |
|---|---|
| GET | `/api/v1/admin/dashboard` |
| GET | `/api/v1/admin/storage/usage` |
| GET | `/api/v1/admin/applications` |
| GET | `/api/v1/admin/applications/:id` |
| POST | `/api/v1/admin/applications/:id/accept` |
| POST | `/api/v1/admin/applications/:id/reject` |
| GET | `/api/v1/admin/students` |
| GET | `/api/v1/admin/students/export.csv` |
| POST | `/api/v1/admin/students` |
| POST | `/api/v1/admin/students/import` |
| GET | `/api/v1/admin/students/:id` |
| PATCH | `/api/v1/admin/students/:id` |
| POST | `/api/v1/admin/students/:id/suspend` |
| POST | `/api/v1/admin/students/:id/reactivate` |
| POST | `/api/v1/admin/students/:id/batch` |
| POST | `/api/v1/admin/students/:id/resend-activation` |
| POST | `/api/v1/admin/students/:id/password-reset` |
| GET | `/api/v1/admin/programmes` |
| POST | `/api/v1/admin/programmes` |
| PATCH | `/api/v1/admin/programmes/:id` |
| DELETE | `/api/v1/admin/programmes/:id` |
| GET | `/api/v1/admin/courses` |
| POST | `/api/v1/admin/courses` |
| PATCH | `/api/v1/admin/courses/:id` |
| DELETE | `/api/v1/admin/courses/:id` |
| GET | `/api/v1/admin/modules` |
| POST | `/api/v1/admin/modules` |
| PATCH | `/api/v1/admin/modules/:id` |
| DELETE | `/api/v1/admin/modules/:id` |
| GET | `/api/v1/admin/batches` |
| POST | `/api/v1/admin/batches` |
| PATCH | `/api/v1/admin/batches/:id` |
| DELETE | `/api/v1/admin/batches/:id` |
| GET | `/api/v1/admin/lecturers` |
| GET | `/api/v1/admin/academics/tree` |
| GET | `/api/v1/admin/batches/:id/members` |
| POST | `/api/v1/admin/uploads/signature` |
| GET | `/api/v1/admin/lessons` |
| POST | `/api/v1/admin/lessons` |
| GET | `/api/v1/admin/lessons/:id` |
| PATCH | `/api/v1/admin/lessons/:id` |
| DELETE | `/api/v1/admin/lessons/:id` |
| PUT | `/api/v1/admin/lessons/:id/parts/:order/video` |
| PUT | `/api/v1/admin/lessons/:id/parts/:order/quiz` |
| GET | `/api/v1/admin/lessons/:id/parts/:order/preview` |
| POST | `/api/v1/admin/lessons/:id/publish` |
| GET | `/api/v1/admin/publications` |
| PATCH | `/api/v1/admin/publications/:id/expiry` |
| POST | `/api/v1/admin/publications/:id/withdraw` |
| GET | `/api/v1/admin/records/batches/:batchId/results` |
| GET | `/api/v1/admin/records/courses` |
| GET | `/api/v1/admin/attendance` |
| POST | `/api/v1/admin/attendance` |
| GET | `/api/v1/admin/certificates` |
| GET | `/api/v1/admin/certificates/eligibility/:studentId` |
| POST | `/api/v1/admin/certificates` |
| POST | `/api/v1/admin/certificates/:id/revoke` |
| GET | `/api/v1/admin/ngo` |
| POST | `/api/v1/admin/ngo` |
| GET | `/api/v1/admin/ngo/:id` |
| PATCH | `/api/v1/admin/ngo/:id` |
| POST | `/api/v1/admin/ngo/:id/publish` |
| POST | `/api/v1/admin/ngo/:id/unpublish` |
| POST | `/api/v1/admin/ngo/:id/pin` |
| PATCH | `/api/v1/admin/ngo/:id/expiry` |
| DELETE | `/api/v1/admin/ngo/:id` |
| GET | `/api/v1/admin/radio` |
| POST | `/api/v1/admin/radio` |
| GET | `/api/v1/admin/radio/:id` |
| PATCH | `/api/v1/admin/radio/:id` |
| POST | `/api/v1/admin/radio/:id/publish` |
| POST | `/api/v1/admin/radio/:id/unpublish` |
| POST | `/api/v1/admin/radio/:id/pin` |
| PATCH | `/api/v1/admin/radio/:id/expiry` |
| DELETE | `/api/v1/admin/radio/:id` |
| GET | `/api/v1/admin/questions` |
| GET | `/api/v1/admin/questions/:id` |
| POST | `/api/v1/admin/questions/:id/replies` |
| POST | `/api/v1/admin/questions/:id/resolve` |
| GET | `/api/v1/admin/faq` |
| POST | `/api/v1/admin/faq` |
| PATCH | `/api/v1/admin/faq/:id` |
| DELETE | `/api/v1/admin/faq/:id` |
| GET | `/api/v1/admin/staff/meta` |
| GET | `/api/v1/admin/staff` |
| POST | `/api/v1/admin/staff` |
| PATCH | `/api/v1/admin/staff/:id` |
| POST | `/api/v1/admin/staff/:id/resend-invite` |
| GET | `/api/v1/admin/settings` |
| PUT | `/api/v1/admin/settings` |
| GET | `/api/v1/admin/email-templates` |
| PUT | `/api/v1/admin/email-templates/:key` |
| DELETE | `/api/v1/admin/email-templates/:key` |
| GET | `/api/v1/admin/email-logs` |
| GET | `/api/v1/admin/activity` |
| GET | `/api/v1/admin/payments` |

## Other

| Method | Path |
|---|---|
| GET | `/api/v1/certificates/:id/pdf` |
| POST | `/api/v1/payments/webhook` (raw body, Paystack signature) |
