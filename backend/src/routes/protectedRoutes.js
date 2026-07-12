const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { dashboard } = require('../controllers/protectedController');

router.get('/dashboard', auth, dashboard);

module.exports = router;