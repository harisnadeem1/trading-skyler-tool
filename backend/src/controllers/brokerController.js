const brokerService = require('../services/broker/brokerservice');
async function connectIbkr(req, res, next) {
  try {
    const result = await brokerService.startIbkrConnection(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function ibkrCallback(req, res, next) {
  try {
    const result = await brokerService.handleIbkrCallback(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getBrokerStatus(req, res, next) {
  try {
    const result = await brokerService.getBrokerStatus(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getBrokerAccounts(req, res, next) {
  try {
    const result = await brokerService.getBrokerAccounts(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function selectBrokerAccount(req, res, next) {
  try {
    const result = await brokerService.selectBrokerAccount(req.user.id, req.body.accountId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function syncBrokerTrades(req, res, next) {
  try {
    const result = await brokerService.syncBrokerTrades(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function disconnectBroker(req, res, next) {
  try {
    const result = await brokerService.disconnectBroker(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getBrokerTrades(req, res, next) {
  try {
    const result = await brokerService.getBrokerTrades(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}







module.exports = {
  connectIbkr,
  ibkrCallback,
  getBrokerStatus,
  getBrokerAccounts,
  selectBrokerAccount,
  syncBrokerTrades,
  disconnectBroker,
  getBrokerTrades,
};