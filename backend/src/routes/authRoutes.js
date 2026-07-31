const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const {
  login,
  me,
  logout,
  getInviteByToken,
  signupWithInvite,
  register,
} = require('../controllers/authController');

router.post('/login', login);
router.get('/me', auth, me);
router.post('/logout', auth, logout);

router.get('/invite/:token', getInviteByToken);
router.post('/signup', signupWithInvite);
router.post('/register', register);

module.exports = router;