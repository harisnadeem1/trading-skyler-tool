const userService = require('../services/userService');
const { refreshSubscriptions } = require('../services/marketData/subscriptionManager');
const { getPrice } = require('../services/marketData/priceCache');
const { processLivePriceUpdate } = require('../services/marketData/tradeMonitorService');
const { getTradesForSymbol } = require('../services/marketData/subscriptionManager');
const { emitTradeUpdatesForSymbol } = require('../services/marketData/liveTradeEmitter');
const { processTradeAchievements } = require('../services/achievementService');

async function getSettings(req, res) {
  try {
    const settings = await userService.getSettings(req.user.id);
    return res.json({ settings });
  } catch (error) {
    console.error('getSettings error:', error);
    return res.status(500).json({ message: 'Failed to fetch settings' });
  }
}

async function updateSettings(req, res) {
  try {
    const settings = await userService.updateSettings(req.user.id, req.body);
    return res.json({ settings });
  } catch (error) {
    console.error('updateSettings error:', error);
    return res.status(500).json({ message: 'Failed to update settings' });
  }
}

async function getJournalEntries(req, res) {
  try {
    const entries = await userService.getJournalEntries(req.user.id);
    return res.json({ entries });
  } catch (error) {
    console.error('getJournalEntries error:', error);
    return res.status(500).json({ message: 'Failed to fetch journal entries' });
  }
}

async function createJournalEntry(req, res) {
  try {
    const entry = await userService.createJournalEntry(req.user.id, req.body);
    const achievementResult = await processTradeAchievements(req.user.id, entry);

    await refreshSubscriptions();

    const cachedPrice = getPrice(entry.ticker);
    const tradesForSymbol = getTradesForSymbol(entry.ticker);

    if (cachedPrice && Number.isFinite(Number(cachedPrice.price))) {
      emitTradeUpdatesForSymbol(
        entry.ticker,
        Number(cachedPrice.price),
        tradesForSymbol
      );

      try {
        await processLivePriceUpdate({
          symbol: entry.ticker,
          price: Number(cachedPrice.price),
          timestamp: cachedPrice.timestamp || new Date().toISOString(),
          tick: cachedPrice,
          trades: [
            {
              id: entry.id,
              user_id: req.user.id,
              ticker: entry.ticker,
              direction: entry.direction,
              entry_price: entry.entry_price,
              stop_price: entry.stop_price,
              target_price: entry.target_price,
              original_stop: entry.original_stop,
              current_stop: entry.current_stop,
              shares: entry.shares,
              original_shares: entry.original_shares,
              remaining_shares: entry.remaining_shares,
              position_size: entry.position_size,
              risk_dollars: entry.risk_dollars,
              risk_percent: entry.risk_percent,
              stop_distance: entry.stop_distance,
              status: entry.status,
              opened_at: entry.opened_at,
              updated_at: entry.updated_at,
            },
          ],
        });
      } catch (marketEvalError) {
        console.error('Immediate market evaluation failed:', marketEvalError);
      }
    }

    const normalizedProgress = achievementResult?.progress
      ? {
          totalTrades: Number(
            achievementResult.progress.total_trades ??
            achievementResult.progress.totalTrades ??
            0
          ),
          currentStreak: Number(
            achievementResult.progress.current_streak ??
            achievementResult.progress.currentStreak ??
            0
          ),
          longestStreak: Number(
            achievementResult.progress.longest_streak ??
            achievementResult.progress.longestStreak ??
            0
          ),
          lastTradeDate:
            achievementResult.progress.last_trade_date ??
            achievementResult.progress.lastTradeDate ??
            null,
          tradesWithNotes: Number(
            achievementResult.progress.trades_with_notes ??
            achievementResult.progress.tradesWithNotes ??
            0
          ),
          tradesWithThesis: Number(
            achievementResult.progress.trades_with_thesis ??
            achievementResult.progress.tradesWithThesis ??
            0
          ),
          completeWizardCount: Number(
            achievementResult.progress.complete_wizard_count ??
            achievementResult.progress.completeWizardCount ??
            0
          ),
          schemaVersion: Number(
            achievementResult.progress.schema_version ??
            achievementResult.progress.schemaVersion ??
            1
          ),
          updatedAt:
            achievementResult.progress.updated_at ??
            achievementResult.progress.updatedAt ??
            null,
        }
      : null;

    const normalizedAchievements = (achievementResult?.newlyUnlocked || []).map((item) => ({
      id: item.achievement_key ?? item.achievementKey ?? item.id ?? item,
      achievementKey: item.achievement_key ?? item.achievementKey ?? item.id ?? item,
      unlockedAt: item.unlocked_at ?? item.unlockedAt ?? new Date().toISOString(),
      notified: item.notified ?? false,
    }));

    return res.status(201).json({
      entry,
      new_achievements: normalizedAchievements,
      achievement_progress: normalizedProgress,
    });
  } catch (error) {
    console.error('createJournalEntry error:', error);

    if (error.message?.startsWith('VALIDATION:')) {
      return res.status(400).json({
        message: error.message.replace('VALIDATION: ', ''),
      });
    }

    return res.status(500).json({ message: 'Failed to create journal entry' });
  }
}

async function updateJournalEntry(req, res) {
  try {
    const entry = await userService.updateJournalEntry(req.user.id, req.params.id, req.body);

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    await refreshSubscriptions();
    return res.json({ entry });
  } catch (error) {
    console.error('updateJournalEntry error:', error);

    if (error.message?.startsWith('VALIDATION:')) {
      return res.status(400).json({
        message: error.message.replace('VALIDATION: ', ''),
      });
    }

    return res.status(500).json({ message: 'Failed to update journal entry' });
  }
}

async function deleteJournalEntry(req, res) {
  try {
    const deleted = await userService.deleteJournalEntry(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    await refreshSubscriptions();
    return res.json({ message: 'Journal entry deleted successfully' });
  } catch (error) {
    console.error('deleteJournalEntry error:', error);
    return res.status(500).json({ message: 'Failed to delete journal entry' });
  }
}

async function addJournalExit(req, res) {
  try {
    const result = await userService.addJournalExit(req.user.id, req.params.id, req.body);

    if (!result) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    await refreshSubscriptions();
    return res.status(201).json(result);
  } catch (error) {
    console.error('addJournalExit error:', error);

    if (error.message?.startsWith('VALIDATION:')) {
      return res.status(400).json({
        message: error.message.replace('VALIDATION: ', ''),
      });
    }

    return res.status(500).json({ message: 'Failed to add journal exit' });
  }
}

async function getJournalMeta(req, res) {
  try {
    const meta = await userService.getJournalMeta(req.user.id);
    return res.json({ meta });
  } catch (error) {
    console.error('getJournalMeta error:', error);
    return res.status(500).json({ message: 'Failed to fetch journal meta' });
  }
}

async function exportUserData(req, res) {
  try {
    const data = await userService.exportUserData(req.user.id);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trading-journal-export-${req.user.id}.json"`
    );

    return res.status(200).json(data);
  } catch (error) {
    console.error('exportUserData error:', error);
    return res.status(500).json({ message: 'Failed to export user data' });
  }
}

async function importUserData(req, res) {
  try {
    const result = await userService.importUserData(req.user.id, req.body);
    await refreshSubscriptions();
    return res.status(200).json(result);
  } catch (error) {
    console.error('importUserData error:', error);

    if (error.message?.startsWith('VALIDATION:')) {
      return res.status(400).json({ message: error.message.replace('VALIDATION:', '') });
    }

    return res.status(500).json({ message: 'Failed to import user data' });
  }
}

async function clearUserData(req, res) {
  try {
    const result = await userService.clearUserData(req.user.id);
    await refreshSubscriptions();
    return res.status(200).json(result);
  } catch (error) {
    console.error('clearUserData error:', error);
    return res.status(500).json({ message: 'Failed to clear user data' });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  addJournalExit,
  getJournalMeta,
  exportUserData,
  importUserData,
  clearUserData,
};