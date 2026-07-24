const API_BASE =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api';

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type');
  const data =
    contentType && contentType.includes('application/json')
      ? await response.json()
      : null;

  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => apiRequest(path),

  post: (path, body) =>
    apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: (path, body) =>
    apiRequest(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: (path, body) =>
    apiRequest(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (path) =>
    apiRequest(path, {
      method: 'DELETE',
    }),

  connectIbkr: () => apiRequest('/broker/connect/ibkr'),
getBrokerStatus: () => apiRequest('/broker/status'),
getBrokerAccounts: () => apiRequest('/broker/accounts'),
selectBrokerAccount: (body) =>
  apiRequest('/broker/account/select', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
syncBrokerTrades: () =>
  apiRequest('/broker/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
disconnectBroker: () =>
  apiRequest('/broker/disconnect', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
getBrokerTrades: () => apiRequest('/broker/trades'),


registerBridge: (body) => api.post('/broker/bridge/register', body),
getBridgeStatus: () => api.get('/broker/bridge/status'),


getIbkrFlexStatus: () => apiRequest('/ibkr/flex/status'),

connectIbkrFlex: (body) =>
  apiRequest('/ibkr/flex/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

syncIbkrFlex: () =>
  apiRequest('/ibkr/flex/sync-now', {
    method: 'POST',
    body: JSON.stringify({}),
  }),

disconnectIbkrFlex: () =>
  apiRequest('/ibkr/flex/disconnect', {
    method: 'POST',
    body: JSON.stringify({}),
  }),




  getTrendMapCurrent: () => api.get('/trend-map/current'),
refreshTrendMap: () => api.post('/trend-map/refresh', {}),
};