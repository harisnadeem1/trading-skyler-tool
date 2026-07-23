const express = require('express');
const router = express.Router();
const bridgeController = require('../controllers/bridgeController');
const requireAuth = require('../middleware/auth');

router.post('/broker/bridge/register', requireAuth, bridgeController.registerBridge);
router.get('/broker/bridge/status', requireAuth, bridgeController.bridgeStatus);

router.post('/bridge/ibkr/heartbeat', bridgeController.heartbeat);
router.post('/bridge/ibkr/executions', bridgeController.executions);
router.post('/bridge/ibkr/positions', bridgeController.positions);
router.post('/bridge/ibkr/open-orders', bridgeController.openOrders);
router.post('/bridge/ibkr/account-summary', bridgeController.accountSummary);

module.exports = router;