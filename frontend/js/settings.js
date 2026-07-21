/**
 * Settings - Settings panel and configuration
 */

import { state } from './state.js';
import { parseNumber, formatCurrency, formatWithCommas } from './utils.js';
import { showToast } from './ui.js';
import { dataManager } from './dataManager.js';
import { clearDataModal } from './clearDataModal.js';
// import { initBrokerUI } from './broker.js';

class Settings {
  constructor() {
    this.elements = {};

  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadAndApply();
    // initBrokerUI();

    state.on('settingsChanged', () => {
      this.loadAndApply();
      this.updateSummary();
    });

    state.on('accountChanged', () => {
      this.updateAccountDisplay(state.account.currentSize);
      this.updateSummary();
    });

    state.on('journalEntryAdded', () => this.updateSummary());
    state.on('journalEntryUpdated', () => this.updateSummary());
    state.on('journalEntryDeleted', () => this.updateSummary());
    state.on('journalHydrated', () => this.updateSummary());
  }

  cacheElements() {
    this.elements = {
      settingsPanel: document.getElementById('settingsPanel'),
      settingsOverlay: document.getElementById('settingsOverlay'),
      settingsBtn: document.getElementById('settingsBtn'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),

      settingsAccountSize: document.getElementById('settingsAccountSize'),
      dynamicAccountToggle: document.getElementById('dynamicAccountToggle'),
      resetAccountBtn: document.getElementById('resetAccountBtn'),

      wizardEnabledToggle: document.getElementById('wizardEnabledToggle'),
      celebrationsToggle: document.getElementById('celebrationsToggle'),
      soundToggle: document.getElementById('soundToggle'),

      sarMemberToggle: document.getElementById('sarMemberToggle'),
      discordDropZone: document.getElementById('discordDropZone'),

      exportDataBtn: document.getElementById('exportDataBtn'),
      importDataBtn: document.getElementById('importDataBtn'),
      clearDataBtn: document.getElementById('clearDataBtn'),

      summaryStarting: document.getElementById('summaryStarting'),
      summaryPnL: document.getElementById('summaryPnL'),
      summaryCurrent: document.getElementById('summaryCurrent'),

      accountSize: document.getElementById('accountSize'),
      maxPositionPercent: document.getElementById('maxPositionPercent'),
    };
  }

  bindEvents() {
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => this.open());
    }

    if (this.elements.closeSettingsBtn) {
      this.elements.closeSettingsBtn.addEventListener('click', () => this.close());
    }

    if (this.elements.settingsOverlay) {
      this.elements.settingsOverlay.addEventListener('click', () => this.close());
    }

    if (this.elements.settingsAccountSize) {
      const syncAccountSize = async (value) => {
        const numericValue = Number(value || 0);
        const currentAccountSize = state.settings.dynamicAccountEnabled
          ? numericValue + Number(state.account.realizedPnL || 0)
          : numericValue;

        await state.updateSettings({
          startingAccountSize: numericValue,
          currentAccountSize,
        });

        if (this.elements.accountSize) {
          this.elements.accountSize.value = formatWithCommas(currentAccountSize);
        }

        state.emit('accountSizeChanged', state.account.currentSize);
      };

      this.elements.settingsAccountSize.addEventListener('input', async (e) => {
        const inputValue = e.target.value.trim();

        if (
          inputValue &&
          (inputValue.toLowerCase().includes('k') || inputValue.toLowerCase().includes('m'))
        ) {
          const converted = parseNumber(inputValue);

          if (converted !== null) {
            const cursorPosition = e.target.selectionStart;
            const originalLength = e.target.value.length;
            e.target.value = formatWithCommas(converted);
            const newLength = e.target.value.length;
            const newCursorPosition = Math.max(
              0,
              cursorPosition + (newLength - originalLength)
            );
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);

            await syncAccountSize(converted);
          }
        }
      });

      this.elements.settingsAccountSize.addEventListener('blur', async (e) => {
        const value = parseNumber(e.target.value);
        if (value !== null && value !== undefined) {
          e.target.value = formatWithCommas(value);
          await syncAccountSize(value);
        }
      });

      this.elements.settingsAccountSize.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = parseNumber(e.target.value);
          if (value !== null && value !== undefined) {
            e.target.value = formatWithCommas(value);
            await syncAccountSize(value);
          }
          e.target.blur();
        }
      });
    }

    if (this.elements.dynamicAccountToggle) {
      this.elements.dynamicAccountToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        const currentSize = enabled
          ? Number(state.settings.startingAccountSize) + Number(state.account.realizedPnL || 0)
          : Number(state.settings.startingAccountSize);

        await state.updateSettings({
          dynamicAccountEnabled: enabled,
          currentAccountSize: currentSize,
        });
      });
    }

    if (this.elements.wizardEnabledToggle) {
      this.elements.wizardEnabledToggle.addEventListener('change', async (e) => {
        await state.updateSettings({ wizardEnabled: e.target.checked });
      });
    }

    if (this.elements.celebrationsToggle) {
      this.elements.celebrationsToggle.addEventListener('change', async (e) => {
        await state.updateSettings({ celebrationsEnabled: e.target.checked });
      });
    }

    if (this.elements.soundToggle) {
      this.elements.soundToggle.addEventListener('change', async (e) => {
        await state.updateSettings({ soundEnabled: e.target.checked });
      });
    }

    if (this.elements.sarMemberToggle) {
      this.elements.sarMemberToggle.addEventListener('change', async (e) => {
        await state.updateSettings({ sarMember: e.target.checked });
        this.updateDiscordDropZoneVisibility(e.target.checked);
      });
    }

    if (this.elements.resetAccountBtn) {
      this.elements.resetAccountBtn.addEventListener('click', () => this.resetAccount());
    }

    if (this.elements.exportDataBtn) {
      this.elements.exportDataBtn.addEventListener('click', () => dataManager.exportAllData());
    }

    if (this.elements.importDataBtn) {
      this.elements.importDataBtn.addEventListener('click', () => dataManager.importData());
    }

    if (this.elements.clearDataBtn) {
      this.elements.clearDataBtn.addEventListener('click', () => clearDataModal.open());
    }

    if (this.elements.settingsPanel) {
      this.elements.settingsPanel.addEventListener('click', (e) => this.handlePresetClick(e));
    }
  }

  async handlePresetClick(e) {
    const btn = e.target.closest('.preset-btn[data-setting]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const setting = btn.dataset.setting;
    const value = btn.dataset.value;
    const group = btn.closest('.preset-group');

    if (!setting || !value) return;

    group?.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    if (setting === 'defaultRisk') {
      const riskValue = parseFloat(value);
      await state.updateSettings({ defaultRiskPercent: riskValue });
      state.updateAccount({ riskPercent: riskValue });
    } else if (setting === 'defaultMaxPos') {
      const maxPosValue = parseFloat(value);
      await state.updateSettings({ defaultMaxPositionPercent: maxPosValue });
      state.updateAccount({ maxPositionPercent: maxPosValue });
      this.syncQuickSettingsMaxPositionPresets(maxPosValue);
    } else if (setting === 'theme') {
      await state.updateSettings({ theme: value });
    }
  }

  syncPresetButtons() {
    const savedRisk = state.settings.defaultRiskPercent;
    document.querySelectorAll('.preset-btn[data-setting="defaultRisk"]').forEach((btn) => {
      const btnValue = parseFloat(btn.dataset.value);
      btn.classList.toggle('active', btnValue === savedRisk);
    });

    const savedMaxPos = state.settings.defaultMaxPositionPercent;
    document.querySelectorAll('.preset-btn[data-setting="defaultMaxPos"]').forEach((btn) => {
      const btnValue = parseFloat(btn.dataset.value);
      btn.classList.toggle('active', btnValue === savedMaxPos);
    });

    const savedTheme = state.settings.theme || 'dark';
    document.querySelectorAll('.preset-btn[data-setting="theme"]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === savedTheme);
    });
  }

  syncQuickSettingsMaxPositionPresets(maxPosValue) {
    const settingsGrid = document.querySelector('.settings-grid');
    if (settingsGrid) {
      const settingsItems = settingsGrid.querySelectorAll('.settings-item');
      if (settingsItems.length >= 2) {
        const maxPosItem = settingsItems[1];
        const presetGroup = maxPosItem.querySelector('.preset-group');
        if (presetGroup) {
          presetGroup.querySelectorAll('.preset-btn').forEach((btn) => {
            const btnValue = parseFloat(btn.dataset.value);
            btn.classList.toggle('active', btnValue === maxPosValue);
          });
        }
      }
    }
  }

  loadAndApply() {
    const themeValue = state.settings.theme || 'dark';
    const resolvedTheme =
      themeValue === 'system'
        ? (
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
          )
          ? 'dark'
          : 'light'
        : themeValue;

    document.documentElement.setAttribute('data-theme', resolvedTheme);

    if (this.elements.settingsAccountSize) {
      this.elements.settingsAccountSize.value = formatWithCommas(
        state.settings.startingAccountSize
      );
    }

    if (this.elements.dynamicAccountToggle) {
      this.elements.dynamicAccountToggle.checked = state.settings.dynamicAccountEnabled;
    }

    if (this.elements.wizardEnabledToggle) {
      this.elements.wizardEnabledToggle.checked = !!state.settings.wizardEnabled;
    }

    if (this.elements.celebrationsToggle) {
      this.elements.celebrationsToggle.checked = state.settings.celebrationsEnabled !== false;
    }

    if (this.elements.soundToggle) {
      this.elements.soundToggle.checked = !!state.settings.soundEnabled;
    }

    if (this.elements.sarMemberToggle) {
      const sarMember = state.settings.sarMember !== false;
      this.elements.sarMemberToggle.checked = sarMember;
      this.updateDiscordDropZoneVisibility(sarMember);
    }

    if (this.elements.accountSize) {
      this.elements.accountSize.value = formatWithCommas(state.account.currentSize);
    }

    if (this.elements.maxPositionPercent) {
      this.elements.maxPositionPercent.value = state.settings.defaultMaxPositionPercent;
    }

    this.syncPresetButtons();
    this.updateAccountDisplay(state.account.currentSize);
    this.updateSummary();
  }

  open() {
    this.elements.settingsPanel?.classList.add('open');
    this.elements.settingsOverlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
    state.setUI('settingsOpen', true);

    if (this.elements.settingsAccountSize) {
      this.elements.settingsAccountSize.value = formatWithCommas(
        state.settings.startingAccountSize
      );
    }

    this.updateSummary();
  }

  close() {
    this.elements.settingsPanel?.classList.remove('open');
    this.elements.settingsOverlay?.classList.remove('open');
    document.body.style.overflow = '';
    state.setUI('settingsOpen', false);
  }

  updateDiscordDropZoneVisibility(visible) {
    if (this.elements.discordDropZone) {
      this.elements.discordDropZone.style.display = visible ? '' : 'none';
    }
  }

  updateSummary() {
    const starting = Number(state.settings.startingAccountSize || 0);
    const pnl = Number(state.account.realizedPnL || 0);
    const current = Number(state.account.currentSize || starting + pnl);

    if (this.elements.summaryStarting) {
      this.elements.summaryStarting.textContent = formatCurrency(starting);
    }

    if (this.elements.summaryPnL) {
      this.elements.summaryPnL.textContent = (pnl >= 0 ? '+' : '') + formatCurrency(pnl);
      this.elements.summaryPnL.className =
        'account-summary__value ' +
        (pnl >= 0 ? 'account-summary__value--success' : 'account-summary__value--danger');
    }

    if (this.elements.summaryCurrent) {
      this.elements.summaryCurrent.textContent = formatCurrency(current);
    }
  }

  updateAccountDisplay(size) {
    if (this.elements.accountSize) {
      this.elements.accountSize.value = formatWithCommas(size);
    }
  }

  async resetAccount() {
  const startingBalance = Number(state.settings.startingAccountSize || 0);

  await state.updateSettings({
    currentAccountSize: startingBalance
  });

  if (typeof state.recalculateAccountFromJournal === 'function') {
    state.recalculateAccountFromJournal();
  } else {
    state.updateAccount({
      currentSize: state.settings.dynamicAccountEnabled
        ? startingBalance + Number(state.account.realizedPnL || 0)
        : startingBalance
    });
  }

  showToast('🔄 Starting balance refreshed', 'success');
}
}

export const settings = new Settings();
export { Settings };