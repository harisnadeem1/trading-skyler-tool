const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IBKR_API_BASE = 'https://api.ibkr.com/v1/api';

function readPem(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function nonce(size = 16) {
  return crypto.randomBytes(size).toString('hex');
}

function timestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function normalizeParams(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
}

function buildBaseString(method, url, params, prepend = '') {
  return `${prepend}${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(normalizeParams(params))}`;
}

function rsaSha256Sign(privateKeyPem, baseString) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(baseString);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function buildOAuthHeader(params) {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(', ');
  return `OAuth ${sorted}`;
}

function parseDhParamPem(relativePath) {
  const pem = fs.readFileSync(path.resolve(relativePath), 'utf8');
  const base64 = pem
    .replace('-----BEGIN DH PARAMETERS-----', '')
    .replace('-----END DH PARAMETERS-----', '')
    .replace(/\s+/g, '');
  const der = Buffer.from(base64, 'base64');

  let offset = 0;
  function readLength() {
    let len = der[offset++];
    if (len & 0x80) {
      const bytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < bytes; i += 1) {
        len = (len << 8) | der[offset++];
      }
    }
    return len;
  }

  function expect(tag) {
    const actual = der[offset++];
    if (actual !== tag) throw new Error(`Unexpected ASN.1 tag: expected ${tag}, got ${actual}`);
  }

  expect(0x30);
  readLength();
  expect(0x02);
  const modulusLength = readLength();
  let modulus = der.slice(offset, offset + modulusLength);
  offset += modulusLength;
  if (modulus[0] === 0x00) modulus = modulus.slice(1);

  expect(0x02);
  const generatorLength = readLength();
  const generator = der.slice(offset, offset + generatorLength);
  const generatorInt = BigInt(`0x${generator.toString('hex')}`);

  return {
    prime: BigInt(`0x${modulus.toString('hex')}`),
    generator: generatorInt,
  };
}

function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e % 2n === 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

function randomBigInt256() {
  return BigInt(`0x${crypto.randomBytes(32).toString('hex')}`);
}

function decryptAccessTokenSecret(secretBase64, privateEncryptionPem) {
  const decrypted = crypto.privateDecrypt(
    {
      key: privateEncryptionPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(secretBase64, 'base64')
  );
  return decrypted.toString('hex');
}

function computeLiveSessionToken({
  dhResponse,
  dhRandom,
  dhPrime,
  prependHex,
}) {
  let responseHex = dhResponse.toLowerCase();
  if (responseHex.length % 2 !== 0) responseHex = `0${responseHex}`;

  const B = BigInt(`0x${responseHex}`);
  const K = modPow(B, dhRandom, dhPrime);

  let hexK = K.toString(16);
  if (hexK.length % 2 !== 0) hexK = `0${hexK}`;

  const keyBytes = Buffer.from(hexK, 'hex');
  const prependBytes = Buffer.from(prependHex, 'hex');

  return crypto.createHmac('sha1', keyBytes).update(prependBytes).digest('base64');
}

function validateLiveSessionToken(lst, consumerKey, expectedSignature) {
  const actual = crypto
    .createHmac('sha1', Buffer.from(lst, 'base64'))
    .update(Buffer.from(consumerKey, 'utf8'))
    .digest('hex');

  return actual === expectedSignature;
}

function computeSsodhResponse(challengeHex, liveSessionToken) {
  const tokenHex = Buffer.from(liveSessionToken, 'base64').toString('hex');
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`${challengeHex}${tokenHex}`, 'hex'))
    .digest('hex');
}

module.exports = {
  IBKR_API_BASE,
  readPem,
  percentEncode,
  nonce,
  timestamp,
  normalizeParams,
  buildBaseString,
  rsaSha256Sign,
  buildOAuthHeader,
  parseDhParamPem,
  modPow,
  randomBigInt256,
  decryptAccessTokenSecret,
  computeLiveSessionToken,
  validateLiveSessionToken,
  computeSsodhResponse,
};