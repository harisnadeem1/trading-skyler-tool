const express = require('express');
const router = express.Router();

const controller = require('../controllers/ibkrFlexController');
const requireAuth = require('../middleware/auth');

router.post('/connect', requireAuth, controller.connectFlex);
router.get('/status', requireAuth, controller.getFlexStatus);
router.post('/sync-now', requireAuth, controller.syncNow);
router.post('/sync-history-now', requireAuth, controller.syncHistoryNow);
router.post('/disconnect', requireAuth, controller.disconnectFlex);

module.exports = router;