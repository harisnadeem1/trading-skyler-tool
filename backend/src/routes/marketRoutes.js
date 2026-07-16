const express = require('express');
const auth = require('../middleware/auth');
const marketController = require('../controllers/marketController');

const router = express.Router();

router.use(auth);

router.get('/quote', marketController.testQuote);
router.post('/reload-subscriptions', marketController.reloadSubscriptions);
router.get('/cache', marketController.getCache);
router.post('/run-snapshots', marketController.runSnapshots);
router.get('/stream', auth, marketController.streamMarket);

module.exports = router;