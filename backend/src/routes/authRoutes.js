const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const {
  login,
  me,
  logout,
  getInviteByToken,
  signupWithInvite,
} = require('../controllers/authController');

router.post('/login', login);
router.get('/me', auth, me);
router.post('/logout', auth, logout);

router.get('/invite/:token', getInviteByToken);
router.post('/signup', signupWithInvite);

module.exports = router;