const { Agent, request } = require('undici');

const IBKR_GATEWAY_BASE_URL =
  process.env.IBKR_GATEWAY_BASE_URL || 'https://localhost:5000/v1/api';

const gatewayDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

async function gatewayRequest(path, options = {}) {
  const url = `${IBKR_GATEWAY_BASE_URL}${path}`;
  const method = options.method || 'GET';
  const body = options.body ?? null;

  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'trading-skyler-tool',
    ...(body && body !== '' ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await request(url, {
    method,
    headers,
    body,
    dispatcher: gatewayDispatcher,
  });

  const text = await response.body.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const err = new Error(
      typeof data === 'string'
        ? data
        : data?.error ||
          data?.message ||
          `IBKR Gateway request failed (${response.statusCode})`
    );
    err.status = response.statusCode;
    err.data = data;
    err.url = url;
    throw err;
  }

  return data;
}

async function pingGateway() {
  return gatewayRequest('/tickle', {
    method: 'GET',
  });
}

async function validateSso() {
  return gatewayRequest('/sso/validate', {
    method: 'GET',
  });
}

async function getAuthStatus() {
  const tickleData = await pingGateway();
  return tickleData?.iserver?.authStatus || null;
}

async function reauthenticate() {
  return gatewayRequest('/iserver/reauthenticate', {
    method: 'POST',
    body: '',
    headers: {
      'Content-Length': '0',
    },
  });
}

async function getAccounts() {
  return gatewayRequest('/iserver/accounts', {
    method: 'GET',
  });
}

async function getPortfolioAccounts() {
  return gatewayRequest('/portfolio/accounts', {
    method: 'GET',
  });
}

async function getTrades() {
  return gatewayRequest('/iserver/account/trades', {
    method: 'GET',
  });
}

async function logoutGateway() {
  return gatewayRequest('/logout', {
    method: 'POST',
    body: '',
    headers: {
      'Content-Length': '0',
    },
  });
}

module.exports = {
  pingGateway,
  validateSso,
  getAuthStatus,
  reauthenticate,
  getAccounts,
  getPortfolioAccounts,
  getTrades,
  logoutGateway,
};