const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { createInvite, getInvites } = require('../controllers/adminController');

router.get('/invites', auth, adminOnly, getInvites);
router.post('/invites', auth, adminOnly, createInvite);

module.exports = router;