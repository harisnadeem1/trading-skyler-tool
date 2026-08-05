// backend/src/services/courseService.js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const db = require('../config/db');
const marked = require('marked'); // install this: npm install marked

const readFile = promisify(fs.readFile);

const CONTENT_ROOT = path.join(__dirname, '..', 'content');
const LESSONS_ROOT = path.join(CONTENT_ROOT, 'lessons');
const ASSETS_ROOT = path.join(CONTENT_ROOT, 'assets');

let courseManifest = null;
let quizzes = null;

async function loadManifest() {
  if (!courseManifest) {
    const manifestPath = path.join(CONTENT_ROOT, 'course-manifest.json');
    const raw = await readFile(manifestPath, 'utf8');
    courseManifest = JSON.parse(raw);
  }
  return courseManifest;
}

function bool(value) {
  return value === true || value === 1 || value === '1';
}

async function loadQuizzes() {
  if (!quizzes) {
    const quizzesPath = path.join(CONTENT_ROOT, 'quizzes.json');
    const raw = await readFile(quizzesPath, 'utf8');
    quizzes = JSON.parse(raw);
  }
  return quizzes;
}

// Helper: fetch progress rows for a user
async function getUserProgress(userId) {
  const result = await db.query(
    'SELECT * FROM lesson_progress WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

// Helper: compute mastery snapshot (you can refine this later)
function computeMastery(manifest, progressRows) {
  const unlockAll = String(process.env.COURSE_UNLOCK_ALL).toLowerCase() === 'true';

  const progressMap = new Map(
    progressRows.map((row) => [row.lesson_id || row.lessonId, row])
  );

  const levels = manifest.levels || [];
  const levelStats = {};

  let overallCompleted = 0;
  let overallTotal = 0;

  levels.forEach((level, index) => {
    const levelModules = manifest.modules.filter((m) => m.levelId === level.id);
    const levelLessons = levelModules.flatMap((m) => m.lessons);

    const completedLessons = levelLessons.filter((lesson) =>
      Boolean(progressMap.get(lesson.id)?.completed)
    ).length;

    const totalLessons = levelLessons.length;
    const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const previousLevel = levels[index - 1];
    const previousStats = previousLevel ? levelStats[previousLevel.id] : null;

    const passed = totalLessons > 0 && completedLessons === totalLessons;
    const unlocked = unlockAll ? true : (index === 0 ? true : Boolean(previousStats?.passed));

    levelStats[level.id] = {
      unlocked,
      percent,
      completedLessons,
      totalLessons,
      passed,
      requiredScore: level.requiredScore || 80,
    };

    overallCompleted += completedLessons;
    overallTotal += totalLessons;
  });

  const overallPercent = overallTotal
    ? Math.round((overallCompleted / overallTotal) * 100)
    : 0;

  return {
    overall: {
      percent: overallPercent,
      completedLessons: overallCompleted,
      totalLessons: overallTotal,
      certified: Boolean(levelStats[levels[levels.length - 1]?.id]?.passed),
    },
    levels: levelStats,
  };
}

exports.getOutline = async (userId) => {
  const manifest = await loadManifest();
  const progressRows = await getUserProgress(userId);
  const mastery = computeMastery(manifest, progressRows);

  // Decide resumeLessonId: last lesson with updated_at, or first incomplete
  const progressMap = new Map(
    progressRows.map((row) => [row.lesson_id || row.lessonId, row])
  );
  const allLessons = manifest.modules.flatMap((m) =>
    m.lessons.map((lesson) => ({ ...lesson, module: m }))
  );

  const resumeCandidate =
    allLessons
      .filter((lesson) => progressMap.get(lesson.id)?.updated_at)
      .sort(
        (a, b) =>
          new Date(progressMap.get(b.id).updated_at) -
          new Date(progressMap.get(a.id).updated_at)
      )[0] ||
    allLessons.find((lesson) => !progressMap.get(lesson.id)?.completed) ||
    allLessons[0];

  return {
    course: {
      version: manifest.course.version,
      lessonCount: allLessons.length,
    },
    levels: manifest.levels,
    modules: manifest.modules,
    mastery,
    progress: progressRows,
    resumeLessonId: resumeCandidate ? resumeCandidate.id : null,
  };
};

exports.getLesson = async (userId, lessonId) => {
  const manifest = await loadManifest();
  const quizzesData = await loadQuizzes();

  const module = manifest.modules.find((m) =>
    m.lessons.some((lesson) => lesson.id === lessonId)
  );
  if (!module) {
    const err = new Error('Lesson not found.');
    err.status = 404;
    err.code = 'LESSON_NOT_FOUND';
    throw err;
  }

  const lesson = module.lessons.find((l) => l.id === lessonId);

  // Optionally enforce level lock here if mastery says locked
  // For now, skip lock or implement basic lock based on manifest.levels[*].state.unlocked.

  const mdPath = path.join(LESSONS_ROOT, `${lessonId}.md`);
  const markdown = await readFile(mdPath, 'utf8');
  const html = marked.parse(markdown);

  // Fetch existing progress for this lesson
  const progressResult = await db.query(
  `
  INSERT INTO lesson_progress (
    user_id,
    lesson_id,
    status,
    last_opened_at,
    updated_at
  )
  VALUES (
    $1,
    $2,
    'in_progress',
    now(),
    now()
  )
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    status = CASE
      WHEN lesson_progress.status = 'not_started' THEN 'in_progress'
      ELSE lesson_progress.status
    END,
    last_opened_at = now(),
    updated_at = now()
  RETURNING *;
  `,
  [userId, lessonId]
);
const progressRow = progressResult.rows[0];

  const quizzesForLesson = quizzesData[lessonId] || [];

  // Compute neighbors in module
  const lessonIndex = module.lessons.findIndex((l) => l.id === lessonId);
  const previousLessonId =
    lessonIndex > 0 ? module.lessons[lessonIndex - 1].id : null;
  const nextLessonId =
    lessonIndex < module.lessons.length - 1
      ? module.lessons[lessonIndex + 1].id
      : null;

  const level = manifest.levels.find((lvl) => lvl.id === module.levelId);
  const progressRows = await getUserProgress(userId);
const mastery = computeMastery(manifest, progressRows);

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      duration: lesson.duration,
      levelId: module.levelId,
      levelTitle: level ? level.title : module.levelId,
      moduleId: module.id,
      moduleNumber: module.number,
      moduleTitle: module.title,
      lessonType: lesson.lessonType,
      isCheckpoint: lesson.isCheckpoint,
      hasQuiz: quizzesForLesson.length > 0,
      practiceRequired: !!lesson.practiceRequired,
      requiredScore: lesson.requiredScore || 80,
      html,
    },
    module: {
      number: module.number,
      title: module.title,
      objectives: module.objectives || [],
    },
    progress: progressRow || {},
    mastery,
    previousLessonId,
    nextLessonId,
    quiz: quizzesForLesson,
  };
};

exports.saveProgress = async (userId, body) => {
  const { lessonId, completed, practiceCompleted, notes, reflection, timeSpentSeconds } = body;

  const manifest = await loadManifest();
  const lesson = manifest.modules
    .flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id, levelId: m.levelId })))
    .find((l) => l.id === lessonId);

  const existingResult = await db.query(
    'SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2',
    [userId, lessonId]
  );
  const existing = existingResult.rows[0] || {};
  const existingPracticeCompleted = bool(existing.practice_completed);

  if (completed && lesson?.practiceRequired && !existingPracticeCompleted) {
    const err = new Error('Complete the practice before marking this lesson complete.');
    err.status = 400;
    err.code = 'PRACTICE_REQUIRED';
    throw err;
  }

 const result = await db.query(
  `
  INSERT INTO lesson_progress (
    user_id,
    lesson_id,
    completed,
    practice_completed,
    notes,
    reflection,
    time_spent_seconds,
    completed_at,
    updated_at
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, COALESCE($7, 0),
    CASE WHEN $3 THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    completed = EXCLUDED.completed,
    practice_completed = EXCLUDED.practice_completed,
    notes = EXCLUDED.notes,
    reflection = EXCLUDED.reflection,
    time_spent_seconds = lesson_progress.time_spent_seconds + COALESCE(EXCLUDED.time_spent_seconds, 0),
    completed_at = CASE
      WHEN EXCLUDED.completed THEN COALESCE(lesson_progress.completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  RETURNING *;
  `,
  [userId, lessonId, !!completed, !!practiceCompleted, notes || '', reflection || '', timeSpentSeconds || 0]
);

  const progressRow = result.rows[0];
  const progressRows = await getUserProgress(userId);
  const mastery = computeMastery(manifest, progressRows);

  return {
    progress: progressRow,
    mastery,
  };
};

exports.submitQuiz = async (userId, lessonId, answers) => {
  const manifest = await loadManifest();
  const quizzesData = await loadQuizzes();
  const quizItems = quizzesData[lessonId] || [];

  if (!quizItems.length) {
    const err = new Error('No quiz defined for this lesson.');
    err.status = 400;
    err.code = 'QUIZ_NOT_FOUND';
    throw err;
  }

  const total = quizItems.length;
  let correct = 0;
  const feedback = [];

  quizItems.forEach((item, i) => {
  const givenIndex = Number(answers[i]) ;
  const correctIndex = Number(item.correctIndex ?? item.answerIndex);
  const isCorrect = givenIndex === correctIndex;

  if (isCorrect) correct += 1;
  feedback.push({
    isCorrect,
    question: item.question,
    explanation: item.explanation || '',
  });
});

  const score = total ? Math.round((correct / total) * 100) : 0;

  // Get lesson metadata for requiredScore
  const module = manifest.modules.find((m) =>
    m.lessons.some((lesson) => lesson.id === lessonId)
  );
  const lesson = module.lessons.find((l) => l.id === lessonId);
  const requiredScore = lesson.requiredScore || 80;
  const passed = score >= requiredScore;

  // Update progress: quiz_score, maybe completed if practice already done
  const progressResult = await db.query(
    'SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2',
    [userId, lessonId]
  );

  await db.query(
  `
  INSERT INTO quiz_attempts (
    user_id,
    quiz_id,
    lesson_id,
    module_id,
    level_id,
    attempt_type,
    score,
    passed,
    answers_json,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `,
  [
    userId,
    lessonId,              // quiz_id
    lessonId,              // lesson_id
    module?.id || null,    // module_id
    module?.levelId || null,// level_id
    lesson?.isCheckpoint ? 'milestone' : 'lesson', // attempt_type
    score,
    passed,
    JSON.stringify({
      answers,
      feedback,
      correct,
      total,
      requiredScore
    })
  ]
);


  const existing = progressResult.rows[0] || {};

 const practiceCompleted =
  Boolean(existing.practice_completed || existing.practiceCompleted);

const completed = passed && practiceCompleted;

  const upsertResult = await db.query(
    `
    INSERT INTO lesson_progress (user_id, lesson_id, completed, practice_completed, quiz_score, updated_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (user_id, lesson_id)
    DO UPDATE SET
      completed = EXCLUDED.completed,
      practice_completed = EXCLUDED.practice_completed,
      quiz_score = EXCLUDED.quiz_score,
      updated_at = now()
    RETURNING *;
    `,
    [userId, lessonId, completed, practiceCompleted, score]
  );

  const progressRow = upsertResult.rows[0];

  // Recompute mastery
  const progressRows = await getUserProgress(userId);
  const mastery = computeMastery(manifest, progressRows);

  return {
    passed,
    score,
    correct,
    total,
    requiredScore,
    practiceStillRequired: passed && !practiceCompleted,
    feedback,
    progress: progressRow,
    mastery,
  };
};

exports.getAssetStream = async (filename) => {
  const safeName = path.basename(filename);
  const assetPath = path.join(ASSETS_ROOT, safeName);
  return fs.createReadStream(assetPath);
};