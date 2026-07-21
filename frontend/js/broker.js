// // frontend/broker.js
// import { api } from './api.js';
// import { state } from './state.js';

// const els = {};

// function cacheEls() {
//   els.connectBtn = document.getElementById('connectIbkrBtn');
//   els.reconnectBtn = document.getElementById('reconnectIbkrBtn');
//   els.syncBtn = document.getElementById('syncIbkrBtn');
//   els.confirmAccountBtn = document.getElementById('confirmIbkrAccountBtn');
//   els.accountSelect = document.getElementById('ibkrAccountSelect');
//   els.accountSelectWrap = document.getElementById('ibkrAccountSelectWrap');
//   els.statusText = document.getElementById('ibkrStatusText');
//   els.tradesCount = document.getElementById('ibkrTradesCount');
// }

// function hideIbkrSection() {
//   const section = document.getElementById('ibkrSection');
//   if (section) section.style.display = 'none';
// }

// async function callBrokerApi(fn) {
//   try {
//     return await fn();
//   } catch (err) {
//     if (err.status === 403) {
//       hideIbkrSection();
//       return null;
//     }
//     throw err;
//   }
// }

// export async function initBrokerUI() {
//   cacheEls();

//   els.connectBtn?.addEventListener('click', handleConnectClick);
//   els.reconnectBtn?.addEventListener('click', handleConnectClick);
//   els.syncBtn?.addEventListener('click', handleSyncClick);
//   els.confirmAccountBtn?.addEventListener('click', handleConfirmAccountClick);

//   await loadBrokerStatus();
// }

// async function handleConnectClick() {
//   setStatus('Connecting…');
//   const result = await callBrokerApi(() => api.connectIbkr());
//   if (!result) return; // section hidden due to 403, stop here

//   try {
//     await loadBrokerStatus();
//     await maybeLoadAccounts();
//   } catch (err) {
//     setStatus('Connection failed: ' + err.message);
//   }
// }

// async function handleSyncClick() {
//   setStatus('Syncing trades…');
//   const result = await callBrokerApi(() => api.syncBrokerTrades());
//   if (!result) return;

//   setStatus(`Synced. Imported ${result.imported} trades.`);
//   await loadBrokerTrades();
// }

// async function handleConfirmAccountClick() {
//   const accountId = els.accountSelect?.value?.trim();

//   console.log('selected dropdown value:', accountId);
//   console.log('select innerHTML:', els.accountSelect?.innerHTML);

//   if (!accountId) {
//     setStatus('Please select an IBKR account first.');
//     return;
//   }

//   const result = await callBrokerApi(() =>
//     api.selectBrokerAccount({ ibkrAccountId: accountId })
//   );
//   if (!result) return;

//   els.accountSelectWrap.style.display = 'none';
//   await loadBrokerStatus();
// }

// export async function loadBrokerStatus() {
//   const status = await callBrokerApi(() => api.getBrokerStatus());
//   if (!status) return; // section hidden due to 403

//   state.broker = { ...(state.broker || {}), ...status };
//   renderBrokerStatus();
// }

// export async function loadBrokerTrades() {
//   const trades = await callBrokerApi(() => api.getBrokerTrades());
//   if (!trades) return;

//   state.broker = { ...(state.broker || {}), trades };
//   if (els.tradesCount) els.tradesCount.textContent = trades.length;
// }

// async function maybeLoadAccounts() {
//   if (state.broker?.connected && !state.broker?.ibkrAccountId) {
//     const accounts = await callBrokerApi(() => api.getBrokerAccounts());
//     if (!accounts) return;

//     console.log('accounts from backend:', accounts);

//     const normalizedAccounts = accounts
//       .map((a) => {
//         if (typeof a === 'string') {
//           return {
//             raw: a,
//             accountId: a.trim(),
//           };
//         }

//         return {
//           raw: a,
//           accountId: a?.accountId ?? a?.id ?? a?.acctId ?? a?.account_id ?? null,
//         };
//       })
//       .filter((a) => a.accountId);

//     console.log('normalizedAccounts:', normalizedAccounts);

//     if (normalizedAccounts.length > 1) {
//       els.accountSelect.innerHTML =
//         '<option value="">Select an account</option>' +
//         normalizedAccounts
//           .map((a) => `<option value="${a.accountId}">${a.accountId}</option>`)
//           .join('');

//       els.accountSelectWrap.style.display = 'block';
//     } else if (normalizedAccounts.length === 1) {
//       const selected = await callBrokerApi(() =>
//         api.selectBrokerAccount({ ibkrAccountId: normalizedAccounts[0].accountId })
//       );
//       if (!selected) return;

//       await loadBrokerStatus();
//     } else {
//       setStatus('No valid IBKR accounts returned by backend.');
//     }
//   }
// }

// function renderBrokerStatus() {
//   const s = state.broker || {};
//   if (els.statusText) {
//     els.statusText.textContent = s.connected
//       ? `Connected${s.ibkrAccountId ? ' (' + s.ibkrAccountId + ')' : ''}`
//       : s.status || 'Disconnected';
//   }
//   if (els.tradesCount && s.trades) els.tradesCount.textContent = s.trades.length;
// }

// function setStatus(text) {
//   if (els.statusText) els.statusText.textContent = text;
// }