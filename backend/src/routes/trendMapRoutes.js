const express = require('express');
const controller = require('../controllers/trendMapController');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/current', controller.getCurrentTrendMap);
router.post('/refresh', controller.refreshTrendMap);

module.exports = router;