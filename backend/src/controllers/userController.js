const userService = require('../services/userService');

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
    return res.status(201).json({ entry });
  } catch (error) {
    console.error('createJournalEntry error:', error);
    return res.status(500).json({ message: 'Failed to create journal entry' });
  }
}

async function updateJournalEntry(req, res) {
  try {
    const entry = await userService.updateJournalEntry(req.user.id, req.params.id, req.body);
    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }
    return res.json({ entry });
  } catch (error) {
    console.error('updateJournalEntry error:', error);
    return res.status(500).json({ message: 'Failed to update journal entry' });
  }
}

async function deleteJournalEntry(req, res) {
  try {
    const deleted = await userService.deleteJournalEntry(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }
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
    return res.status(201).json(result);
  } catch (error) {
    console.error('addJournalExit error:', error);
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