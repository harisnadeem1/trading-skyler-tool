// backend/src/controllers/courseController.js
const courseService = require('../services/courseService');

exports.getOutline = async (req, res) => {
  try {
    const userId = req.user.id;
    const outline = await courseService.getOutline(userId);
    res.json(outline);
  } catch (error) {
    console.error('getOutline error:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Failed to load course outline.',
      code: error.code || 'COURSE_OUTLINE_ERROR',
    });
  }
};

exports.getLesson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId } = req.params;
    const payload = await courseService.getLesson(userId, lessonId);
    res.json(payload);
  } catch (error) {
    console.error('getLesson error:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Failed to load lesson.',
      code: error.code || 'COURSE_LESSON_ERROR',
    });
  }
};

exports.saveProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = await courseService.saveProgress(userId, req.body);
    res.json(payload);
  } catch (error) {
    console.error('saveProgress error:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Failed to save progress.',
      code: error.code || 'COURSE_PROGRESS_ERROR',
    });
  }
};

exports.submitQuiz = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId } = req.params;
    const payload = await courseService.submitQuiz(userId, lessonId, req.body.answers);
    res.json(payload);
  } catch (error) {
    console.error('submitQuiz error:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Failed to submit quiz.',
      code: error.code || 'COURSE_QUIZ_ERROR',
    });
  }
};

exports.getAsset = async (req, res) => {
    console.log('[courseController] getAsset called with filename:', req.params.filename);
  try {
    const { filename } = req.params;
    const stream = await courseService.getAssetStream(filename);
    stream.on('error', (err) => {
      console.error('getAsset stream error:', err);
      res.status(404).end();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('getAsset error:', error);
    res.status(404).end();
  }
};