// Runs under Jest (global test) and under plain `node --test`.
const test = global.test || require('node:test');
const assert = require('node:assert/strict');
const logic = require('../src/services/logic');
const { effectivePermissions } = require('../src/utils/permissions');
const { formatStudentNumber } = require('../src/utils/studentNumber');
const { toCsv } = require('../src/utils/csv');

const questions = [
  { _id: 'a', prompt: 'q1', options: ['x', 'y'], correctIndex: 0 },
  { _id: 'b', prompt: 'q2', options: ['x', 'y'], correctIndex: 1 },
  { _id: 'c', prompt: 'q3', options: ['x', 'y', 'z'], correctIndex: 2 },
];

test('grading is computed from the answer key on the server', () => {
  assert.deepEqual(logic.gradeQuiz(questions, [0, 1, 2], 50), { score: 3, total: 3, percentage: 100, passed: true });
  const fail = logic.gradeQuiz(questions, [1, 0, 0], 50);
  assert.equal(fail.score, 0);
  assert.equal(fail.passed, false);
});

test('grading ignores missing, malformed and out-of-range answers', () => {
  assert.equal(logic.gradeQuiz(questions, [0], 50).score, 1);
  assert.equal(logic.gradeQuiz(questions, ['0', null, 9], 50).score, 0);
  assert.equal(logic.gradeQuiz(questions, undefined, 50).score, 0);
  assert.equal(logic.gradeQuiz([], [], 50).percentage, 0);
});

test('pass mark is configurable, not hard-coded', () => {
  assert.equal(logic.gradeQuiz(questions, [0, 0, 0], 30).passed, true); // 1/3 = 33.3%
  assert.equal(logic.gradeQuiz(questions, [0, 0, 0], 40).passed, false);
});

test('student quiz payload never contains the answer key', () => {
  const payload = logic.presentQuizForStudent({ _id: 'q', title: 'T', partOrder: 1, isFinal: false, passMark: 50, maxAttempts: 3, questions });
  assert.equal(JSON.stringify(payload).includes('correctIndex'), false);
  assert.equal(payload.questions.length, 3);
});

test('seven-day clock starts at publication, not upload', () => {
  const upload = new Date('2026-12-01T10:00:00Z');
  const publishAt = new Date('2026-12-05T08:00:00Z');
  const w = logic.computePublicationWindow({ now: new Date('2026-12-05T08:00:00Z'), publishAt, accessDays: 7 });
  assert.equal(w.publishedAt.toISOString(), '2026-12-05T08:00:00.000Z');
  assert.equal(w.expiresAt.toISOString(), '2026-12-12T08:00:00.000Z');
  assert.equal(w.status, 'live');
  assert.ok(w.expiresAt - upload > 7 * 86400000); // early upload does not shorten access
});

test('future publication is scheduled and not yet accessible', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const w = logic.computePublicationWindow({ now, publishAt: '2026-12-03T00:00:00Z' });
  assert.equal(w.status, 'scheduled');
  assert.equal(logic.isPublicationAccessible({ ...w, status: 'scheduled' }, now), false);
  assert.equal(logic.isPublicationAccessible({ ...w, status: 'live' }, new Date('2026-12-04T00:00:00Z')), true);
});

test('access ends exactly at expiry even if the job has not run', () => {
  const pub = { status: 'live', publishedAt: '2026-12-01T00:00:00Z', expiresAt: '2026-12-08T00:00:00Z' };
  assert.equal(logic.isPublicationAccessible(pub, new Date('2026-12-07T23:59:59Z')), true);
  assert.equal(logic.isPublicationAccessible(pub, new Date('2026-12-08T00:00:00Z')), false);
  assert.equal(logic.isPublicationAccessible({ ...pub, status: 'withdrawn' }, new Date('2026-12-02T00:00:00Z')), false);
});

test('failing a quiz does not lock the next part; skipping it does', () => {
  assert.equal(logic.isPartUnlocked(1, []), true);
  assert.equal(logic.isPartUnlocked(2, []), false);
  assert.equal(logic.isPartUnlocked(2, [1]), true); // attempted, pass or fail
  assert.equal(logic.isPartUnlocked(3, [1]), false);
});

test('opening a video does not complete it', () => {
  assert.equal(logic.isVideoCompleted(0, 900), false);
  assert.equal(logic.isVideoCompleted(300, 900), false);
  assert.equal(logic.isVideoCompleted(820, 900), true);
  assert.equal(logic.isVideoCompleted(820, 0), false);
});

test('lesson completes only when all videos watched and all quizzes attempted', () => {
  assert.equal(logic.isLessonComplete(3, [1, 2, 3], [1, 2]), false);
  assert.equal(logic.isLessonComplete(3, [1, 2], [1, 2, 3]), false);
  assert.equal(logic.isLessonComplete(3, [1, 2, 3], [1, 2, 3]), true);
  assert.equal(logic.isLessonComplete(0, [], []), false);
});

test('highest attempt is the official score', () => {
  const best = logic.bestAttemptsByQuiz([
    { quiz: 'q1', percentage: 33.3 }, { quiz: 'q1', percentage: 100 }, { quiz: 'q1', percentage: 66.7 }, { quiz: 'q2', percentage: 50 },
  ]);
  assert.equal(best.length, 2);
  assert.equal(best.find((a) => a.quiz === 'q1').percentage, 100);
});

test('official score is per quiz even when the quiz is populated', () => {
  const best = logic.bestAttemptsByQuiz([
    { quiz: { _id: 'q1', title: 'Quiz 1' }, percentage: 40 }, { quiz: { _id: 'q1', title: 'Quiz 1' }, percentage: 80 },
    { quiz: { _id: 'q2', title: 'Quiz 2' }, percentage: 60 },
  ]);
  assert.equal(best.length, 2);
  assert.equal(best.find((a) => a.quiz._id === 'q1').percentage, 80);
});

test('certificate eligibility follows configurable requirements', () => {
  assert.equal(logic.evaluateCompletion({ totalLessons: 10, completedLessons: 10, averageScore: 70 }).eligible, true);
  assert.equal(logic.evaluateCompletion({ totalLessons: 10, completedLessons: 9, averageScore: 90 }).eligible, false);
  assert.equal(logic.evaluateCompletion({ totalLessons: 10, completedLessons: 8, averageScore: 90 }, { minCompletionPercent: 80 }).eligible, true);
  assert.equal(logic.evaluateCompletion({ totalLessons: 10, completedLessons: 10, averageScore: 40 }, { minAverageScore: 50 }).eligible, false);
  assert.equal(logic.evaluateCompletion({ totalLessons: 0, completedLessons: 0, averageScore: 0 }).eligible, false);
});

test('inactivity pauses first, then moves to a new batch after a month', () => {
  const now = new Date('2026-12-31T00:00:00Z');
  assert.equal(logic.inactivityAction(new Date('2026-12-29T00:00:00Z'), now), 'none');
  assert.equal(logic.inactivityAction(new Date('2026-12-20T00:00:00Z'), now), 'pause');
  assert.equal(logic.inactivityAction(new Date('2026-11-29T00:00:00Z'), now), 'move');
  assert.equal(logic.inactivityAction(null, now), 'none');
});

test('content expiry defaults count from publish date', () => {
  assert.equal(logic.contentExpiry(new Date('2026-01-01T00:00:00Z'), 100).toISOString(), '2026-04-11T00:00:00.000Z');
  assert.equal(logic.contentExpiry(new Date('2026-01-01T00:00:00Z'), 200).toISOString(), '2026-07-20T00:00:00.000Z');
});

test('permissions: roles, grants and revocations', () => {
  assert.ok(effectivePermissions({ role: 'super_admin' }).includes('staff.manage'));
  assert.equal(effectivePermissions({ role: 'media_admin' }).includes('records.read_all'), false);
  assert.equal(effectivePermissions({ role: 'support' }).includes('records.read_all'), false);
  assert.equal(effectivePermissions({ role: 'lecturer' }).includes('lectures.publish'), false);
  assert.ok(effectivePermissions({ role: 'school_admin' }).includes('lectures.publish'));
  assert.ok(effectivePermissions({ role: 'media_admin', permissions: { granted: ['faq.manage'] } }).includes('faq.manage'));
  assert.equal(effectivePermissions({ role: 'school_admin', permissions: { revoked: ['certificates.issue'] } }).includes('certificates.issue'), false);
});

test('student numbers follow a configurable pattern', () => {
  assert.equal(formatStudentNumber('ABBS/{year}/{seq:3}', 2026, 1), 'ABBS/2026/001');
  assert.equal(formatStudentNumber('AVOM-{seq:5}', 2026, 42), 'AVOM-00042');
  assert.equal(formatStudentNumber(undefined, 2027, 123), 'ABBS/2027/123');
});

test('CSV export escapes quotes and neutralises formula injection', () => {
  const csv = toCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: 'x,"y"', b: '=SUM(A1)' }]);
  assert.equal(csv, 'A,B\r\n"x,""y""","\'=SUM(A1)"'.replace('"\'=SUM(A1)"', "'=SUM(A1)"));
});
