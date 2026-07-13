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
};