import { api } from './api.js';

function setIbkrFlexStatus(message, tone = 'default') {
  const el = document.getElementById('ibkrFlexStatusText');
  if (!el) return;

  el.textContent = `Status: ${message}`;
  el.classList.remove('text-success', 'text-danger', 'text-warning');

  if (tone === 'success') el.classList.add('text-success');
  if (tone === 'danger') el.classList.add('text-danger');
  if (tone === 'warning') el.classList.add('text-warning');
}

async function loadIbkrFlexStatus() {
  try {
    const data = await api.get('/ibkr/flex/status');

    if (!data.connected || !data.flexEnabled) {
      setIbkrFlexStatus('Disconnected', 'danger');
      return;
    }

    const lastSync = data.flexLastTradeSyncAt || 'never';
    setIbkrFlexStatus(`Connected (${data.status}) | last trade sync: ${lastSync}`, 'success');
  } catch (error) {
    setIbkrFlexStatus(error.message || 'Failed to load', 'danger');
  }
}

async function saveIbkrFlexConnection() {
  try {
    const payload = {
      flexToken: document.getElementById('flexToken')?.value.trim(),
      flexTokenExpiresAt: document.getElementById('flexTokenExpiresAt')?.value || null,
      tradeConfirmQueryId: document.getElementById('tradeConfirmQueryId')?.value.trim(),
      activityQueryId: document.getElementById('activityQueryId')?.value.trim() || null
    };

    await api.post('/ibkr/flex/connect', payload);
    setIbkrFlexStatus('Saved successfully', 'success');
    await loadIbkrFlexStatus();
  } catch (error) {
    setIbkrFlexStatus(error.message || 'Save failed', 'danger');
  }
}

async function syncIbkrFlexNow() {
  try {
    setIbkrFlexStatus('Syncing...', 'warning');
    const result = await api.post('/ibkr/flex/sync-now', {});
    setIbkrFlexStatus(`Sync complete (${result.imported || 0} imported)`, 'success');
    await loadIbkrFlexStatus();
  } catch (error) {
    setIbkrFlexStatus(error.message || 'Sync failed', 'danger');
  }
}

async function disconnectIbkrFlex() {
  try {
    await api.post('/ibkr/flex/disconnect', {});
    setIbkrFlexStatus('Disconnected', 'danger');
  } catch (error) {
    setIbkrFlexStatus(error.message || 'Disconnect failed', 'danger');
  }
}

document.getElementById('saveIbkrFlexBtn')?.addEventListener('click', saveIbkrFlexConnection);
document.getElementById('syncIbkrFlexBtn')?.addEventListener('click', syncIbkrFlexNow);
document.getElementById('disconnectIbkrFlexBtn')?.addEventListener('click', disconnectIbkrFlex);

loadIbkrFlexStatus();