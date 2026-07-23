const express = require('express');
const router = express.Router();

const controller = require('../controllers/ibkrFlexController');
const requireAuth = require('../middleware/auth'); // adjust path if your file is different

console.log('controller =', controller);
console.log('requireAuth =', requireAuth);

router.post('/connect', requireAuth, controller.connectFlex);
router.get('/status', requireAuth, controller.getFlexStatus);
router.post('/sync-now', requireAuth, controller.syncNow);
router.post('/disconnect', requireAuth, controller.disconnectFlex);

module.exports = router;