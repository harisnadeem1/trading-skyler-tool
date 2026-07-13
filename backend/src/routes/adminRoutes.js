const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { createInvite, getInvites,getAdminUsers,
  getAdminUserDetails, } = require('../controllers/adminController');

router.get('/invites', auth, adminOnly, getInvites);
router.post('/invites', auth, adminOnly, createInvite);
router.get('/users', auth, adminOnly, getAdminUsers);
router.get('/users/:userId', auth, adminOnly, getAdminUserDetails);

module.exports = router;