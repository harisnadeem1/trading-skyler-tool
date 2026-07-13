const express = require('express');
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.use(auth);

router.get('/settings', userController.getSettings);
router.patch('/settings', userController.updateSettings);

router.get('/journal', userController.getJournalEntries);
router.post('/journal', userController.createJournalEntry);
router.patch('/journal/:id', userController.updateJournalEntry);
router.delete('/journal/:id', userController.deleteJournalEntry);
router.post('/journal/:id/exits', userController.addJournalExit);

router.get('/journal-meta', userController.getJournalMeta);


router.get('/export', userController.exportUserData);
router.post('/import', userController.importUserData);
router.delete('/data', userController.clearUserData);

module.exports = router;