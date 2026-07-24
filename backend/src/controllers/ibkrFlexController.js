const flexSyncService = require('../services/ibkrFlex/ibkrFlexSyncService');

function getStatusCode(error) {
  const message = String(error?.message || '').toLowerCase();

  if (
    message.includes('required') ||
    message.includes('not configured') ||
    message.includes('please wait')
  ) {
    return 400;
  }

  if (message.includes('already in progress')) {
    return 409;
  }

  return 500;
}

async function connectFlex(req, res) {
  try {
    const userId = req.user.id;
    const {
      flexToken,
      flexTokenExpiresAt,
      activityQueryId,
      tradeConfirmQueryId
    } = req.body;

    if (!flexToken || !tradeConfirmQueryId) {
      return res.status(400).json({
        success: false,
        message: 'flexToken and tradeConfirmQueryId are required'
      });
    }

    await flexSyncService.saveConnection(userId, {
      flexToken,
      flexTokenExpiresAt: flexTokenExpiresAt || null,
      activityQueryId: activityQueryId || null,
      tradeConfirmQueryId
    });

    return res.json({
      success: true,
      message: 'IBKR Flex connected successfully'
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
}

async function getFlexStatus(req, res) {
  try {
    const data = await flexSyncService.getConnectionStatus(req.user.id);
    return res.json({
      success: true,
      ...data
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
}

async function syncNow(req, res) {
  try {
    const result = await flexSyncService.runTradeConfirmSyncForUser(req.user.id);
    return res.json({
      success: true,
      message: 'Trade confirmation sync completed successfully',
      ...result
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
}

async function syncHistoryNow(req, res) {
  try {
    const result = await flexSyncService.runHistorySyncForUser(req.user.id);
    return res.json({
      success: true,
      message: 'History sync completed successfully',
      ...result
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
}

async function disconnectFlex(req, res) {
  try {
    await flexSyncService.disconnectFlex(req.user.id);
    return res.json({
      success: true,
      message: 'IBKR Flex disconnected successfully'
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  connectFlex,
  getFlexStatus,
  syncNow,
  syncHistoryNow,
  disconnectFlex
};