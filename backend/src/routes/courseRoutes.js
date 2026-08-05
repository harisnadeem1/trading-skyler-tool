// backend/src/routes/courseRoutes.js
const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { requireAcademyAccess } = require('../middleware/academyAccess');
const courseController = require('../controllers/courseController');

// All course routes require auth + academy access
router.get('/outline', auth, requireAcademyAccess, courseController.getOutline);
router.get('/lesson/:lessonId', auth, requireAcademyAccess, courseController.getLesson);
router.post('/progress', auth, requireAcademyAccess, courseController.saveProgress);
router.post('/quiz/:lessonId', auth, requireAcademyAccess, courseController.submitQuiz);

// Optional: serve private assets (palette image etc.)
router.get('/asset/:filename', auth, requireAcademyAccess, courseController.getAsset);

module.exports = router;