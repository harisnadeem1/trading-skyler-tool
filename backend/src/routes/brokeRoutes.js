const express = require('express');
const brokerController = require('../controllers/brokerController');
const auth = require('../middleware/auth');


const router = express.Router();

router.get('/connect/ibkr', auth, brokerController.connectIbkr);
router.get('/callback/ibkr', auth, brokerController.ibkrCallback);
router.get('/status', auth, brokerController.getBrokerStatus);
router.get('/accounts', auth, brokerController.getBrokerAccounts);
router.post('/account/select', auth, brokerController.selectBrokerAccount);
router.post('/sync', auth, brokerController.syncBrokerTrades);
router.post('/disconnect', auth, brokerController.disconnectBroker);
router.get('/trades', auth, brokerController.getBrokerTrades);

module.exports = router;