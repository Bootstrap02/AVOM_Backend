# Database (MongoDB, Mongoose)

| Collection | Purpose | Notes |
|---|---|---|
| `users` | Login identity for students and staff | `role`, `status` (invited/active/suspended), per-person `permissions.granted/revoked` |
| `students` | Academic profile | unique `studentNumber`, `programme`, `batch`, `studyMode`, `state` (active/paused), `batchHistory`, `phoneDigits` |
| `applications` | Applications and decisions | status `pending/accepted/rejected`; history kept |
| `programmes`, `courses`, `modules`, `batches` | Curriculum and cohorts | programme holds certificate `requirements` |
| `lessons` | A lesson with `parts[]` (video asset + quiz ref) | asset records keep `deletionStatus` after expiry |
| `quizzes` | Questions with `correctIndex` | the key never reaches students |
| `lecturepublications` | Lesson published to a batch | `publishedAt`, `expiresAt` (clock starts at publishing), status |
| `quizattempts` | Every attempt, with score and answers | permanent record |
| `progresses` | Per student, batch and lesson | new batch = new record; old kept as history |
| `ngoposts`, `audioepisodes` | Public content | `pinned`, `expiresAt`, `status` |
| `supportquestions`, `faqs` | Support and FAQ | WhatsApp messages carry `externalId` |
| `certificates` | Issued certificates | unique `verificationNumber`, `status` |
| `attendances` | Session attendance | unique per student/batch/date/session |
| `payments` | Paystack transactions | unique `reference` |
| `tokens`, `refreshtokens` | One-time and refresh tokens | only SHA-256 hashes stored; TTL indexes |
| `activitylogs`, `emaillogs`, `emailtemplates`, `settings`, `counters` | Administration | |

Never store passwords, tokens or keys in plain text. Deleting a student, programme or batch that has history is refused by the API; deactivate or close instead.
