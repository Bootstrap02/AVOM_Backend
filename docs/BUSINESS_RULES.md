# Business rules (as implemented)

| Rule | Where |
|---|---|
| Application is free; statuses only `pending`, `accepted`, `rejected`; rejection needs a reason and is emailed; applicants may reapply, history kept | `services/applications.service.js` |
| Accepting creates a login (status `invited`) + Student, generates a student number, emails an activation link; atomic so it cannot double-accept | same |
| Student number pattern is a setting (`student.numberPattern`, default `ABBS/{year}/{seq:3}`) | `services/settings.service.js`, `utils/studentNumber.js` |
| Offline students use the same models (admin add or CSV import) | `controllers/students.controller.js` |
| Lesson = N parts (default 3), each a video + quiz | `models/Lesson.js`, `services/lectures.service.js` |
| Quiz graded on the server; answer key never sent to students; pass mark and attempts configurable | `services/logic.js`, `services/learning.service.js` |
| Default 3 attempts per quiz, only while the lecture is live; highest score is official; all attempts stored | `learning.service.js`, `logic.bestAttemptsByQuiz` |
| Failing never blocks progress; the next video unlocks once the previous quiz has been attempted | `logic.isPartUnlocked` |
| Video counts as watched only near the end (default 90%); lesson completes when all videos watched and all quizzes attempted | `logic.js` |
| Progress saved about every 15 s; server is the record; resume works across devices | `learning.service.saveProgress`, student `Lecture.jsx` |
| Admins and Super Admins publish; Lecturers draft only | permissions in `constants/roles.js` |
| Lecture access = 7 days from publication to a batch (never from upload); access is date-checked on every request | `logic.computePublicationWindow`, `loadAccessiblePublication` |
| Expired lectures are deleted permanently (files only when no live/scheduled publication needs them); scores/progress/certificates are never deleted | `services/expiry.service.js` |
| Radio 100 days, NGO 200 days from publication; editable per item; Pin keeps forever; warning 7 days before | `controllers/content.controller.js`, expiry service |
| Inactive 7 days → `paused` (not failed); activity resumes; inactive 30 days → moved to next open batch of the programme, course restarts, old progress kept as history | `expiry.service.handleInactiveStudents`, `students.service.moveToBatch` |
| Moving a student to a new batch restarts the course; progress is stored per batch | `models/Progress.js` |
| Certificate needs the programme requirements; Super Admin may override with a recorded reason; unique verification number; public verify page | `controllers/certificates.controller.js` |
| Permissions enforced in the backend per route; Media/Support staff cannot read student records | `routes/index.js`, `middlewares/auth.js` |
| Payments are initialised and verified on the server; webhook signature checked; amount and currency compared | `controllers/payments.controller.js` |
