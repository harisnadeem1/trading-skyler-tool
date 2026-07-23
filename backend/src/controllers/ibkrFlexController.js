const flexSyncService = require('../services/ibkrFlex/ibkrFlexSyncService');

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
        message: 'flexToken and tradeConfirmQueryId are required'
      });
    }

    await flexSyncService.saveConnection(userId, {
      flexToken,
      flexTokenExpiresAt: flexTokenExpiresAt || null,
      activityQueryId: activityQueryId || null,
      tradeConfirmQueryId
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getFlexStatus(req, res) {
  try {
    const data = await flexSyncService.getConnectionStatus(req.user.id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function syncNow(req, res) {
  try {
    const result = await flexSyncService.runTradeConfirmSyncForUser(req.user.id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function disconnectFlex(req, res) {
  try {
    await flexSyncService.disconnectFlex(req.user.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  connectFlex,
  getFlexStatus,
  syncNow,
  disconnectFlex
};