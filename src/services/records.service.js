const Student = require('../models/Student');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const QuizAttempt = require('../models/QuizAttempt');
const Programme = require('../models/Programme');
const { bestAttemptsByQuiz, evaluateCompletion } = require('./logic');

/** Completion across all of the student's batches for their programme (history counts toward requirements). */
async function programmeCompletion(studentId) {
  const student = await Student.findById(studentId).lean();
  if (!student || !student.programme) return { totalLessons: 0, completedLessons: 0, averageScore: 0, completionPercent: 0, eligible: false };

  const programme = await Programme.findById(student.programme).lean();
  const totalLessons = await Lesson.countDocuments({ programme: student.programme });
  const completed = await Progress.find({ student: studentId, programme: student.programme, lessonCompleted: true }).select('lesson').lean();
  const completedLessons = new Set(completed.map((p) => String(p.lesson))).size;

  const attempts = await QuizAttempt.find({ student: studentId }).lean();
  const best = bestAttemptsByQuiz(attempts);
  const averageScore = best.length ? Math.round((best.reduce((s, a) => s + a.percentage, 0) / best.length) * 10) / 10 : 0;

  return { totalLessons, completedLessons, ...evaluateCompletion({ totalLessons, completedLessons, averageScore }, programme?.requirements) };
}

module.exports = { programmeCompletion };
