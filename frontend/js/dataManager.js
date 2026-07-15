/**
 * DataManager - Handles data import/export and backup operations
 */

import { state } from './state.js';
import { showToast } from './ui.js';
import { api } from './api.js';

// These will be set after modules are initialized to avoid circular dependencies
let settingsModule = null;
let calculatorModule = null;
let journalModule = null;
let clearDataModalModule = null;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function deriveAccountFromState() {
  const starting = safeNumber(state.state.settings.startingAccountSize, 10000);

  const journalEntries = Array.isArray(state.state.journal.entries)
    ? state.state.journal.entries
    : [];

  const realizedPnL = journalEntries.reduce((sum, entry) => {
    const realized =
      entry?.total_realized_pnl ??
      entry?.totalRealizedPnL ??
      (entry?.status === 'closed' ? entry?.pnl : 0);

    return sum + safeNumber(realized, 0);
  }, 0);

  const dynamicEnabled = !!state.state.settings.dynamicAccountEnabled;
  const currentSize = dynamicEnabled ? starting + realizedPnL : starting;

  state.state.account.realizedPnL = realizedPnL;
  state.state.account.currentSize = currentSize;
  state.state.account.riskPercent = safeNumber(
    state.state.settings.defaultRiskPercent,
    1
  );
  state.state.account.maxPositionPercent = safeNumber(
    state.state.settings.defaultMaxPositionPercent,
    100
  );
}

async function hydrateFromBackend() {
  const [settingsRes, journalRes, metaRes] = await Promise.all([
    api.get('/user/settings'),
    api.get('/user/journal'),
    api.get('/user/journal-meta'),
  ]);

  if (settingsRes?.settings) {
    state.state.settings = {
      ...state.state.settings,
      startingAccountSize: safeNumber(
        settingsRes.settings.starting_account_size,
        10000
      ),
      defaultRiskPercent: safeNumber(
        settingsRes.settings.default_risk_percent,
        1
      ),
      defaultMaxPositionPercent: safeNumber(
        settingsRes.settings.default_max_position_percent,
        100
      ),
      dynamicAccountEnabled: !!settingsRes.settings.dynamic_account_enabled,
      theme: settingsRes.settings.theme ?? 'dark',
      sarMember: !!settingsRes.settings.sar_member,
      wizardEnabled: !!settingsRes.settings.wizard_enabled,
      celebrationsEnabled: settingsRes.settings.celebrations_enabled !== false,
      soundEnabled: !!settingsRes.settings.sound_enabled,
      compoundSettings: settingsRes.settings.compound_settings ?? {},
    };
  }

  state.state.journal.entries = Array.isArray(journalRes?.entries)
    ? journalRes.entries
    : [];

  state.state.journalMeta = metaRes?.meta || state.state.journalMeta;

  deriveAccountFromState();
}

export const dataManager = {
  setModules(settings, calculator, journal, clearDataModal) {
    settingsModule = settings;
    calculatorModule = calculator;
    journalModule = journal;
    clearDataModalModule = clearDataModal;
  },

  async refreshUIFromBackend() {
    await hydrateFromBackend();

    if (typeof state.emit === 'function') {
      state.emit('settingsChanged', state.state.settings);
      state.emit('journalHydrated', state.state.journal.entries);
      state.emit('accountChanged', state.state.account);
    }

    if (settingsModule?.loadAndApply) settingsModule.loadAndApply();
    if (calculatorModule?.calculate) calculatorModule.calculate();
    if (journalModule?.render) journalModule.render();
  },

  async exportAllData() {
    try {
      const data = await api.get('/user/export');

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trade-manager-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('📥 Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast(error?.message || '❌ Failed to export data', 'error');
    }
  },

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const payload = JSON.parse(text);

        await api.post('/user/import', payload);
        await this.refreshUIFromBackend();

        showToast('📤 Data imported successfully', 'success');
      } catch (error) {
        console.error('Import error:', error);
        showToast(error?.message || '❌ Failed to import data', 'error');
      }
    });

    input.click();
  },

  clearAllData() {
    if (clearDataModalModule?.open) {
      clearDataModalModule.open();
    }
  },

  async confirmClearAllData() {
    try {
      await api.delete('/user/data');
      await this.refreshUIFromBackend();

      if (clearDataModalModule?.close) {
        clearDataModalModule.close();
      }

      showToast('🗑️ All data cleared', 'success');
    } catch (error) {
      console.error('Clear data error:', error);
      showToast(error?.message || '❌ Failed to clear data', 'error');
    }
  },

  exportCSV() {
    const trades = state.journal.entries;
    if (trades.length === 0) {
      showToast('⚠️ No trades to export', 'warning');
      return;
    }

    const headers = [
      'Date',
      'Ticker',
      'Direction',
      'Entry',
      'Stop',
      'Target',
      'Shares',
      'Position Size',
      'Risk $',
      'Risk %',
      'Status',
      'Exit Price',
      'P&L',
      'Notes',
    ];

    const rows = trades.map((t) => {
  const entry = Number(t.entry ?? t.entry_price ?? 0);
  const stop = Number(t.stop ?? t.stop_price ?? 0);
  const direction = t.direction ?? (stop > entry ? 'short' : 'long');

  return [
    new Date(t.timestamp || t.opened_at).toLocaleDateString(),
    t.ticker,
    direction,
    t.entry ?? t.entry_price,
    t.stop ?? t.stop_price,
    t.target ?? t.target_price ?? '',
    t.shares,
    Number(t.positionSize ?? t.position_size ?? 0).toFixed(2) || '',
    Number(t.riskDollars ?? t.risk_dollars ?? 0).toFixed(2) || '',
    t.riskPercent ?? t.risk_percent ?? '',
    t.status,
    t.exitPrice ?? t.exit_price ?? '',
    t.pnl != null ? Number(t.pnl).toFixed(2) : '',
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ];
});

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.downloadFile(csv, 'trades.csv', 'text/csv');
    showToast('📥 CSV exported', 'success');
  },

  exportTSV() {
    const trades = state.journal.entries;
    if (trades.length === 0) {
      showToast('⚠️ No trades to export', 'warning');
      return;
    }

    const headers = [
      'Date',
      'Ticker',
      'Direction',
      'Entry',
      'Stop',
      'Target',
      'Shares',
      'Position Size',
      'Risk $',
      'Risk %',
      'Status',
      'Exit Price',
      'P&L',
      'Notes',
    ];

    const rows = trades.map((t) => {
  const entry = Number(t.entry ?? t.entry_price ?? 0);
  const stop = Number(t.stop ?? t.stop_price ?? 0);
  const direction = t.direction ?? (stop > entry ? 'short' : 'long');

  return [
    new Date(t.timestamp || t.opened_at).toLocaleDateString(),
    t.ticker,
    direction,
    t.entry ?? t.entry_price,
    t.stop ?? t.stop_price,
    t.target ?? t.target_price ?? '',
    t.shares,
    Number(t.positionSize ?? t.position_size ?? 0).toFixed(2) || '',
    Number(t.riskDollars ?? t.risk_dollars ?? 0).toFixed(2) || '',
    t.riskPercent ?? t.risk_percent ?? '',
    t.status,
    t.exitPrice ?? t.exit_price ?? '',
    t.pnl != null ? Number(t.pnl).toFixed(2) : '',
    (t.notes || '').replace(/\t/g, ' '),
  ];
});

    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    this.downloadFile(tsv, 'trades.tsv', 'text/tab-separated-values');
    showToast('📥 TSV exported', 'success');
  },

  copyCSV() {
    const trades = state.journal.entries;
    if (trades.length === 0) {
      showToast('⚠️ No trades to copy', 'warning');
      return;
    }

    const headers = ['Date', 'Ticker', 'Direction', 'Entry', 'Stop', 'Shares', 'Risk $', 'Status', 'P&L'];

    const rows = trades.map((t) => {
  const entry = Number(t.entry ?? t.entry_price ?? 0);
  const stop = Number(t.stop ?? t.stop_price ?? 0);
  const direction = t.direction ?? (stop > entry ? 'short' : 'long');

  return [
    new Date(t.timestamp || t.opened_at).toLocaleDateString(),
    t.ticker,
    direction,
    t.entry ?? t.entry_price,
    t.stop ?? t.stop_price,
    t.shares,
    Number(t.riskDollars ?? t.risk_dollars ?? 0).toFixed(2) || '',
    t.status,
    t.pnl != null ? Number(t.pnl).toFixed(2) : '',
  ];
});

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    navigator.clipboard
      .writeText(csv)
      .then(() => {
        showToast('📋 CSV copied to clipboard', 'success');
      })
      .catch(() => {
        showToast('❌ Failed to copy', 'error');
      });
  },

  copyTSV() {
    const trades = state.journal.entries;
    if (trades.length === 0) {
      showToast('⚠️ No trades to copy', 'warning');
      return;
    }

   const headers = ['Date', 'Ticker', 'Direction', 'Entry', 'Stop', 'Shares', 'Risk $', 'Status', 'P&L'];

const rows = trades.map((t) => {
  const entry = Number(t.entry ?? t.entry_price ?? 0);
  const stop = Number(t.stop ?? t.stop_price ?? 0);
  const direction = t.direction ?? (stop > entry ? 'short' : 'long');

  return [
    new Date(t.timestamp || t.opened_at).toLocaleDateString(),
    t.ticker,
    direction,
    t.entry ?? t.entry_price,
    t.stop ?? t.stop_price,
    t.shares,
    Number(t.riskDollars ?? t.risk_dollars ?? 0).toFixed(2) || '',
    t.status,
    t.pnl != null ? Number(t.pnl).toFixed(2) : '',
  ];
});

    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');

    navigator.clipboard
      .writeText(tsv)
      .then(() => {
        showToast('📋 TSV copied to clipboard (paste into Excel)', 'success');
      })
      .catch(() => {
        showToast('❌ Failed to copy', 'error');
      });
  },

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};