const trendMapDataService = require('../services/trendMap/trendMapDataService');

function normalizeSignal5Override(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'AUTO') return null;
  if (['YES', 'NO', 'ATTEMPT'].includes(normalized)) return normalized;
  return null;
}

async function getCurrentTrendMap(req, res) {
  try {
    const signal5Override = normalizeSignal5Override(req.query.signal5Override);
    const userId = req.user?.id || req.user?.userId || null;

    const data = await trendMapDataService.getTrendMapSnapshot({
      userId,
      signal5Override,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[TREND MAP] getCurrentTrendMap error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to build trend map dashboard',
    });
  }
}

async function refreshTrendMap(req, res) {
  try {
    const signal5Override = normalizeSignal5Override(req.query.signal5Override);
    const userId = req.user?.id || req.user?.userId || null;

    const data = await trendMapDataService.getTrendMapSnapshot({
      userId,
      signal5Override,
      forceRefresh: true,
    });

    return res.json({ success: true, refreshed: true, data });
  } catch (error) {
    console.error('[TREND MAP] refreshTrendMap error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh trend map dashboard',
    });
  }
}

module.exports = {
  getCurrentTrendMap,
  refreshTrendMap,
};