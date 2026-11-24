// Pure business rules. No database access, so they can be tested without MongoDB.
const { addDays, daysBetween } = require('../utils/dates');

/**
 * Grade a quiz on the server. `questions` carries the answer key; `answers` is an array of chosen option indexes.
 * Unanswered or out-of-range answers score zero.
 */
function gradeQuiz(questions, answers, passMark) {
  const total = questions.length;
  let score = 0;
  questions.forEach((q, i) => {
    const chosen = Array.isArray(answers) ? answers[i] : undefined;
    if (Number.isInteger(chosen) && chosen === q.correctIndex) score += 1;
  });
  const percentage = total === 0 ? 0 : Math.round((score / total) * 1000) / 10;
  return { score, total, percentage, passed: percentage >= passMark };
}

/** Strip the answer key before sending a quiz to a student. */
function presentQuizForStudent(quiz) {
  return {
    id: quiz._id,
    title: quiz.title,
    partOrder: quiz.partOrder,
    isFinal: quiz.isFinal,
    passMark: quiz.passMark,
    maxAttempts: quiz.maxAttempts,
    questions: quiz.questions.map((q) => ({ id: q._id, prompt: q.prompt, options: q.options })),
  };
}

/** The lecture clock starts at publication, never at upload. */
function computePublicationWindow({ now = new Date(), publishAt, accessDays = 7 }) {
  const publishedAt = publishAt ? new Date(publishAt) : new Date(now);
  const expiresAt = addDays(publishedAt, accessDays);
  const status = publishedAt.getTime() > new Date(now).getTime() ? 'scheduled' : 'live';
  return { publishedAt, expiresAt, status };
}

/** Access is decided from dates, so it stays correct even if the daily job is late. */
function isPublicationAccessible(pub, now = new Date()) {
  if (!pub || pub.status === 'withdrawn') return false;
  const t = new Date(now).getTime();
  return new Date(pub.publishedAt).getTime() <= t && t < new Date(pub.expiresAt).getTime();
}

/**
 * Part N is available when N is 1, or the student has submitted at least one attempt on part N-1's quiz
 * (pass or fail - failing never blocks progress).
 */
function isPartUnlocked(partOrder, attemptedPartOrders) {
  if (partOrder <= 1) return true;
  return attemptedPartOrders.includes(partOrder - 1);
}

/** A video counts as completed only when the student reached (nearly) the end. */
function isVideoCompleted(positionSeconds, durationSeconds, threshold = 0.9) {
  if (!durationSeconds || durationSeconds <= 0) return false;
  return positionSeconds >= durationSeconds * threshold;
}

/** A lesson is complete when every part's video is completed and every part's quiz has been attempted. */
function isLessonComplete(partCount, completedVideoOrders, attemptedQuizOrders) {
  for (let order = 1; order <= partCount; order += 1) {
    if (!completedVideoOrders.includes(order) || !attemptedQuizOrders.includes(order)) return false;
  }
  return partCount > 0;
}

/** Best (highest) attempt per quiz is the official score. */
function bestAttemptsByQuiz(attempts) {
  const best = new Map();
  attempts.forEach((a) => {
    // `quiz` may be an id or a populated document; key on the id either way.
    const key = String(a.quiz && a.quiz._id ? a.quiz._id : a.quiz);
    if (!best.has(key) || a.percentage > best.get(key).percentage) best.set(key, a);
  });
  return [...best.values()];
}

/** Certificate eligibility against configurable programme requirements. */
function evaluateCompletion({ totalLessons, completedLessons, averageScore }, requirements = {}) {
  const minCompletion = requirements.minCompletionPercent ?? 100;
  const minAverage = requirements.minAverageScore ?? 0;
  const completionPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 1000) / 10;
  const eligible = totalLessons > 0 && completionPercent >= minCompletion && (averageScore ?? 0) >= minAverage;
  return { completionPercent, averageScore: averageScore ?? 0, eligible, requirements: { minCompletion, minAverage } };
}

/** Pausing and batch-move rules for inactive students (thresholds come from settings). */
function inactivityAction(lastActivityAt, now, { pauseAfterDays = 7, moveAfterDays = 30 } = {}) {
  if (!lastActivityAt) return 'none';
  const idle = daysBetween(lastActivityAt, now);
  if (idle >= moveAfterDays) return 'move';
  if (idle >= pauseAfterDays) return 'pause';
  return 'none';
}

/** Default expiry for NGO and radio content: from the publish date. */
function contentExpiry(publishedAt, days) {
  return addDays(publishedAt, days);
}

module.exports = {
  gradeQuiz, presentQuizForStudent, computePublicationWindow, isPublicationAccessible, isPartUnlocked,
  isVideoCompleted, isLessonComplete, bestAttemptsByQuiz, evaluateCompletion, inactivityAction, contentExpiry,
};
