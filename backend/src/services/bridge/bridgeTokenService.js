const crypto = require('crypto');

function generateRawToken() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  generateRawToken,
  hashToken,
};