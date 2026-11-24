const request = require('supertest');
const { startDb, stopDb, createUser, loginStaff, lastEmailTo, tokenFrom } = require('./helpers');

let app;
let admin; // Super Admin bearer token
let ids = {};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const application = (email) => ({
  fullName: 'Grace Tester', email, phone: '+2348012345678', country: 'Nigeria', city: 'Lagos', studyMode: 'online',
});

beforeAll(async () => {
  await startDb();
  app = require('../../src/app'); // load after env + db are ready
  await createUser({ email: 'root@avom.test', role: 'super_admin', name: 'Root Admin' });
  admin = (await loginStaff(app, 'root@avom.test')).token;
});
afterAll(stopDb);

describe('school setup', () => {
  it('creates programme, course, module and batch', async () => {
    const prog = await request(app).post('/api/v1/admin/programmes').set(auth(admin)).send({ name: 'Test Programme' });
    expect(prog.status).toBe(201);
    ids.programme = prog.body.data._id;
    const course = await request(app).post('/api/v1/admin/courses').set(auth(admin)).send({ programme: ids.programme, name: 'Test Course' });
    ids.course = course.body.data._id;
    const mod = await request(app).post('/api/v1/admin/modules').set(auth(admin)).send({ course: ids.course, name: 'Test Module' });
    ids.module = mod.body.data._id;
    const batch = await request(app).post('/api/v1/admin/batches').set(auth(admin)).send({ programme: ids.programme, name: 'Batch A' });
    ids.batch = batch.body.data._id;
    expect([course.status, mod.status, batch.status]).toEqual([201, 201, 201]);
  });
});

describe('workflow A and B: applications', () => {
  it('accepts an application, emails an activation link, and the student can activate and log in', async () => {
    expect((await request(app).post('/api/v1/public/applications').send(application('grace@test.dev'))).status).toBe(201);
    const list = await request(app).get('/api/v1/admin/applications?status=pending').set(auth(admin));
    expect(list.body.data).toHaveLength(1);
    const appId = list.body.data[0]._id;

    const accepted = await request(app).post(`/api/v1/admin/applications/${appId}/accept`).set(auth(admin)).send({ programme: ids.programme, batch: ids.batch });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.studentNumber).toMatch(/^ABBS\/\d{4}\/001$/);

    // Cannot be accepted twice, and no duplicate student appears.
    expect((await request(app).post(`/api/v1/admin/applications/${appId}/accept`).set(auth(admin)).send({})).status).toBe(409);

    const token = tokenFrom(lastEmailTo('grace@test.dev'));
    expect(token).toBeTruthy();
    // Cannot log in before activating.
    expect((await request(app).post('/api/v1/auth/student/login').send({ email: 'grace@test.dev', password: 'Password123' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/activate').send({ token, password: 'Password123' })).status).toBe(200);
    // Link works once only.
    expect((await request(app).post('/api/v1/auth/activate').send({ token, password: 'Password123' })).status).toBe(400);
    const login = await request(app).post('/api/v1/auth/student/login').send({ email: 'grace@test.dev', password: 'Password123' });
    expect(login.status).toBe(200);
    ids.student = login.body.data.accessToken;
  });

  it('rejects an application with a reason, keeps the record, and allows reapplying', async () => {
    await request(app).post('/api/v1/public/applications').send(application('nope@test.dev'));
    const pending = (await request(app).get('/api/v1/admin/applications?status=pending').set(auth(admin))).body.data;
    const id = pending.find((a) => a.email === 'nope@test.dev')._id;
    expect((await request(app).post(`/api/v1/admin/applications/${id}/reject`).set(auth(admin)).send({})).status).toBe(422); // reason required
    expect((await request(app).post(`/api/v1/admin/applications/${id}/reject`).set(auth(admin)).send({ reason: 'Incomplete details' })).status).toBe(200);
    expect(lastEmailTo('nope@test.dev')).toBeTruthy();
    const rejected = (await request(app).get('/api/v1/admin/applications?status=rejected').set(auth(admin))).body.data;
    expect(rejected.some((a) => a.email === 'nope@test.dev' && a.rejectionReason === 'Incomplete details')).toBe(true);
    expect((await request(app).post('/api/v1/public/applications').send(application('nope@test.dev'))).status).toBe(201);
  });
});

describe('workflow C, D, E: lecture, quizzes and learning', () => {
  const answersFor = (quiz, right) => quiz.questions.map((q) => (right ? q.correctIndex : (q.correctIndex + 1) % q.options.length));

  it('builds, publishes and lets a student learn with server-side grading', async () => {
    const lesson = (await request(app).post('/api/v1/admin/lessons').set(auth(admin)).send({ module: ids.module, title: 'Lesson One' })).body.data;
    ids.lesson = lesson._id;
    expect(lesson.parts).toHaveLength(3);

    // Not publishable until videos and quizzes exist.
    expect((await request(app).post(`/api/v1/admin/lessons/${lesson._id}/publish`).set(auth(admin)).send({ batchIds: [ids.batch] })).status).toBe(422);

    for (const order of [1, 2, 3]) {
      const v = await request(app).put(`/api/v1/admin/lessons/${lesson._id}/parts/${order}/video`).set(auth(admin))
        .send({ publicId: `avom/lectures/test-${order}`, secureUrl: 'https://x/y', format: 'mp4', bytes: 1000, duration: 600 });
      expect(v.status).toBe(200);
      const q = await request(app).put(`/api/v1/admin/lessons/${lesson._id}/parts/${order}/quiz`).set(auth(admin)).send({
        passMark: 60, maxAttempts: 3,
        questions: [0, 1, 2].map((i) => ({ prompt: `Q${i}`, options: ['A', 'B', 'C'], correctIndex: i })),
      });
      expect(q.status).toBe(200);
    }
    // A video registered outside our folder is refused.
    expect((await request(app).put(`/api/v1/admin/lessons/${lesson._id}/parts/1/video`).set(auth(admin)).send({ publicId: 'evil/other' })).status).toBe(400);

    const published = await request(app).post(`/api/v1/admin/lessons/${lesson._id}/publish`).set(auth(admin)).send({ batchIds: [ids.batch] });
    expect(published.status).toBe(201);
    const pub = published.body.data[0];
    ids.pub = pub._id;
    const days = (new Date(pub.expiresAt) - new Date(pub.publishedAt)) / 86400000;
    expect(Math.round(days)).toBe(7); // clock runs from publication

    // Student sees it; video 2 is locked until quiz 1 is attempted.
    const lectures = await request(app).get('/api/v1/student/lectures').set(auth(ids.student));
    expect(lectures.body.data).toHaveLength(1);
    expect((await request(app).get(`/api/v1/student/lectures/${ids.pub}/parts/1/playback`).set(auth(ids.student))).status).toBe(200);
    expect((await request(app).get(`/api/v1/student/lectures/${ids.pub}/parts/2/playback`).set(auth(ids.student))).status).toBe(403);

    // The quiz payload never contains the answer key.
    const quiz = (await request(app).get(`/api/v1/student/lectures/${ids.pub}/parts/1/quiz`).set(auth(ids.student))).body.data;
    expect(JSON.stringify(quiz)).not.toContain('correctIndex');

    // Fail on purpose: result recorded, next video unlocks anyway.
    const fail = await request(app).post(`/api/v1/student/lectures/${ids.pub}/parts/1/quiz`).set(auth(ids.student)).send({ answers: [2, 2, 1] });
    expect(fail.body.data).toMatchObject({ score: 0, passed: false, attemptNumber: 1, attemptsRemaining: 2 });
    expect((await request(app).get(`/api/v1/student/lectures/${ids.pub}/parts/2/playback`).set(auth(ids.student))).status).toBe(200);

    // Retake: highest score is official; attempts are capped at 3.
    await request(app).post(`/api/v1/student/lectures/${ids.pub}/parts/1/quiz`).set(auth(ids.student)).send({ answers: [0, 1, 2] });
    await request(app).post(`/api/v1/student/lectures/${ids.pub}/parts/1/quiz`).set(auth(ids.student)).send({ answers: [0, 0, 0] });
    expect((await request(app).post(`/api/v1/student/lectures/${ids.pub}/parts/1/quiz`).set(auth(ids.student)).send({ answers: [0, 1, 2] })).status).toBe(403);
    const results = (await request(app).get('/api/v1/student/results').set(auth(ids.student))).body.data;
    expect(results.official[0].percentage).toBe(100);
    expect(results.attempts).toHaveLength(3);
    void answersFor;
  });

  it('saves progress, resumes, and only completes a video near its end', async () => {
    const save = (pos, ended) => request(app).put('/api/v1/student/progress').set(auth(ids.student)).send({ publicationId: ids.pub, partOrder: 2, positionSeconds: pos, ended });
    expect((await save(120, false)).body.data).toMatchObject({ positionSeconds: 120, videoCompleted: false });
    expect((await save(100, true)).body.data.videoCompleted).toBe(false); // "ended" claimed too early is ignored
    const resume = (await request(app).get('/api/v1/student/continue').set(auth(ids.student))).body.data;
    expect(resume).toMatchObject({ partOrder: 2 });
    expect((await save(595, true)).body.data.videoCompleted).toBe(true);
  });
});

describe('security: roles and separation', () => {
  it('keeps students out of admin routes and staff out of student routes', async () => {
    expect((await request(app).get('/api/v1/admin/students').set(auth(ids.student))).status).toBe(403);
    expect((await request(app).get('/api/v1/student/dashboard').set(auth(admin))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/students')).status).toBe(401);
  });

  it('enforces permissions per role in the backend', async () => {
    await createUser({ email: 'media@avom.test', role: 'media_admin' });
    await createUser({ email: 'lect@avom.test', role: 'lecturer' });
    const media = (await loginStaff(app, 'media@avom.test')).token;
    const lect = (await loginStaff(app, 'lect@avom.test')).token;
    expect((await request(app).get('/api/v1/admin/students').set(auth(media))).status).toBe(403); // media staff cannot read student records
    expect((await request(app).get('/api/v1/admin/ngo').set(auth(media))).status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/lessons/${ids.lesson}/publish`).set(auth(lect)).send({ batchIds: [ids.batch] })).status).toBe(403); // lecturers draft only
    expect((await request(app).get(`/api/v1/admin/lessons/${ids.lesson}`).set(auth(lect))).status).toBe(403); // not assigned to the course
  });

  it('rotates refresh tokens, detects replay, and requires the CSRF header', async () => {
    const { cookies } = await loginStaff(app, 'root@avom.test');
    const h = { 'X-Requested-With': 'avom' };
    expect((await request(app).post('/api/v1/auth/staff/refresh').set('Cookie', cookies)).status).toBe(403); // no header
    const first = await request(app).post('/api/v1/auth/staff/refresh').set('Cookie', cookies).set(h);
    expect(first.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/staff/refresh').set('Cookie', cookies).set(h)).status).toBe(401); // old token replayed
    expect((await request(app).post('/api/v1/auth/staff/refresh').set('Cookie', first.headers['set-cookie'].map((c) => c.split(';')[0])).set(h)).status).toBe(401); // family revoked
  });
});

describe('workflow F: expiry', () => {
  it('closes the lecture, deletes its files, and keeps the academic record', async () => {
    const LecturePublication = require('../../src/models/LecturePublication');
    const Lesson = require('../../src/models/Lesson');
    const QuizAttempt = require('../../src/models/QuizAttempt');
    const { runExpirySweep } = require('../../src/services/expiry.service');
    const { createMockProvider } = require('../../src/integrations/storage/mock.provider');

    await LecturePublication.updateOne({ _id: ids.pub }, { expiresAt: new Date(Date.now() - 1000) });
    // Date-checked access ends immediately, even before the job runs.
    expect((await request(app).get(`/api/v1/student/lectures/${ids.pub}`).set(auth(ids.student))).status).toBe(403);

    const storage = createMockProvider();
    const summary = await runExpirySweep({ storage });
    expect(summary.lectures.videosDeleted).toBe(3);
    expect(storage.deleted).toHaveLength(3);

    const lesson = await Lesson.findById(ids.lesson).lean();
    expect(lesson.parts.every((p) => p.video.deletionStatus === 'deleted')).toBe(true);
    expect(await QuizAttempt.countDocuments()).toBeGreaterThanOrEqual(3); // scores survive media deletion

    // Running again deletes nothing more (idempotent).
    const again = await runExpirySweep({ storage });
    expect(again.lectures.videosDeleted).toBe(0);
    expect(storage.deleted).toHaveLength(3);
  });
});

describe('workflow G and H: offline student and content', () => {
  it('adds an offline student into the same system', async () => {
    const res = await request(app).post('/api/v1/admin/students').set(auth(admin))
      .send({ fullName: 'Offline Student', email: 'offline@test.dev', studyMode: 'on_ground', programme: ids.programme, batch: ids.batch });
    expect(res.status).toBe(201);
    expect(res.body.data.student.source).toBe('offline');
    expect(lastEmailTo('offline@test.dev')).toBeTruthy();
  });

  it('publishes NGO content with a 200-day default expiry, pinning keeps it, and it appears publicly', async () => {
    const post = (await request(app).post('/api/v1/admin/ngo').set(auth(admin)).send({ title: 'Food drive', body: 'We served meals.' })).body.data;
    expect((await request(app).get('/api/v1/public/ngo')).body.data).toHaveLength(0); // drafts are not public
    const pub = (await request(app).post(`/api/v1/admin/ngo/${post._id}/publish`).set(auth(admin)).send({})).body.data;
    expect(Math.round((new Date(pub.expiresAt) - new Date(pub.publishedAt)) / 86400000)).toBe(200);
    expect((await request(app).get('/api/v1/public/ngo')).body.data).toHaveLength(1);
    const pinned = await request(app).post(`/api/v1/admin/ngo/${post._id}/pin`).set(auth(admin)).send({ pinned: true });
    expect(pinned.body.data.pinned).toBe(true);
  });
});
