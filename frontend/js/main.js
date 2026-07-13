/**
 * Main - Application entry point
 */

import { state } from './state.js';
import { calculator } from './calculator.js';
import { parser } from './parser.js';
import { journal } from './journal.js';
import { settings } from './settings.js';
import {
  theme,
  keyboard,
  settingsToggle,
  focusManager,
  hintArrow,
  tooltipHandler,
} from './ui.js';
import { trimModal } from './trimModal.js';
import { wizard } from './wizard.js';
import { confetti } from './confetti.js';
import { achievements } from './achievements.js';
import { soundFx } from './soundFx.js';
import { dataManager } from './dataManager.js';
import { clearDataModal } from './clearDataModal.js';
import { viewManager } from './viewManager.js';
import { stats } from './stats.js';
import { equityChart } from './statsChart.js';
import { positionsView } from './positionsView.js';
import { journalView } from './journalView.js';
import { compoundView } from './compoundView.js';
import { scansView } from './scansView.js';
import { authManager } from './auth.js';

let appInstance = null;

class App {
  constructor() {
    this.dashboardEls = {};
    this.init();
  }

  init() {
    console.log('Initializing TradeDeck...');

    dataManager.setModules(settings, calculator, journal, clearDataModal);

    settings.init();
    theme.init();
    calculator.init();
    parser.init();
    journal.init();
    trimModal.init();
    wizard.init();
    confetti.init();
    achievements.init();
    soundFx.init();
    clearDataModal.init();
    viewManager.init();
    stats.init();
    equityChart.init();
    positionsView.init();
    journalView.init();
    compoundView.init();
    scansView.init();
    keyboard.init();
    settingsToggle.init();
    focusManager.init();
    hintArrow.init();
    tooltipHandler.init();

    this.cacheDashboardElements();
    this.updateHeaderAccountValue();
    this.renderDashboardSummary();
    this.renderStreak();
    this.setupGlobalEvents();
    this.setupGlobalFunctions();
    this.setupDashboardButtons();

    settingsToggle.updateSummary(
      state.account.currentSize,
      state.account.maxPositionPercent
    );

    console.log('TradeDeck initialized successfully');
  }

  cacheDashboardElements() {
    this.dashboardEls = {
      settingsSummary: document.getElementById('settingsSummary'),
      streakDisplay: document.getElementById('streakDisplay'),
      streakText: document.getElementById('streakText'),
      viewPositionsBtn: document.getElementById('viewPositionsBtn'),
      viewJournalBtn: document.getElementById('viewJournalBtn'),
    };
  }

  formatCurrency(value) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

  updateHeaderAccountValue() {
    const accountValueEl = document.querySelector('.header__account-value');
    if (!accountValueEl) return;

    accountValueEl.textContent = this.formatCurrency(state.account.currentSize);
  }

  renderDashboardSummary() {
    if (!this.dashboardEls.settingsSummary) return;
    this.dashboardEls.settingsSummary.textContent = state.getDashboardSettingsSummary();
  }

  renderStreak() {
    const display = this.dashboardEls.streakDisplay;
    const text = this.dashboardEls.streakText;

    if (!display || !text) return;

    const streak = Number(
      state.journalMeta?.achievements?.progress?.currentStreak || 0
    );

    if (streak > 0) {
      display.style.display = 'inline-flex';
      text.textContent = `${streak} day streak`;
    } else {
      display.style.display = 'none';
    }
  }

  setupDashboardButtons() {
    if (this.dashboardEls.viewPositionsBtn) {
      this.dashboardEls.viewPositionsBtn.addEventListener('click', () => {
        viewManager.navigateTo('positions');
      });
    }

    if (this.dashboardEls.viewJournalBtn) {
      this.dashboardEls.viewJournalBtn.addEventListener('click', () => {
        viewManager.navigateTo('journal');
      });
    }
  }

  setupGlobalEvents() {
    state.on('accountChanged', () => {
      settingsToggle.updateSummary(
        state.account.currentSize,
        state.account.maxPositionPercent
      );
      settings.updateAccountDisplay(state.account.currentSize);
      this.updateHeaderAccountValue();
      this.renderDashboardSummary();
    });

    state.on('resultsRendered', (results) => {
      if (results && results.shares > 0) {
        focusManager.activateResults();
      } else {
        focusManager.deactivateResults();
      }
    });

    state.on('tradeChanged', (trade) => {
      if (!trade.entry && !trade.stop) {
        focusManager.deactivateResults();
      }
    });

    state.on('settingsChanged', (updatedSettings) => {
      settingsToggle.updateSummary(
        state.account.currentSize,
        state.account.maxPositionPercent
      );

      this.updateHeaderAccountValue();
      this.renderDashboardSummary();

      if (updatedSettings?.theme) {
        document.documentElement.setAttribute(
          'data-theme',
          updatedSettings.theme === 'system'
            ? (
                window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches
              )
              ? 'dark'
              : 'light'
            : updatedSettings.theme
        );
      }
    });

    state.on('journalHydrated', () => {
      this.updateHeaderAccountValue();
      this.renderDashboardSummary();
      this.renderStreak();
    });

    state.on('journalEntryAdded', () => {
      this.renderStreak();
    });

    state.on('journalEntryUpdated', () => {
      this.renderStreak();
    });

    state.on('journalEntryDeleted', () => {
      this.renderStreak();
    });

    state.on('journalMetaChanged', () => {
      this.renderStreak();
    });

    state.on('streakUpdated', () => {
      this.renderStreak();
    });

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      state.on('settingsChanged', (s) => console.log('Settings:', s));
      state.on('tradeChanged', (t) => console.log('Trade:', t));
      state.on('journalHydrated', (entries) => console.log('Journal hydrated:', entries));
      state.on('journalMetaChanged', (meta) => console.log('Journal meta:', meta));
      state.on('accountChanged', (account) => console.log('Account changed:', account));
      state.on('resultsRendered', (results) => console.log('Results rendered:', results));
    }
  }

  setupGlobalFunctions() {
    window.closeTrade = (tradeId) => trimModal.open(tradeId);
    window.deleteTrade = (tradeId) => journal.deleteTrade(tradeId);
    window.exportAllData = () => dataManager.exportAllData();
    window.importData = () => dataManager.importData();
    window.clearAllData = () => dataManager.clearAllData();
    window.exportCSV = () => dataManager.exportCSV();
    window.exportTSV = () => dataManager.exportTSV();
    window.copyCSV = () => dataManager.copyCSV();
    window.copyTSV = () => dataManager.copyTSV();
  }
}

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const appRoot = document.getElementById('app-root');

  if (authScreen) authScreen.style.display = 'flex';
  if (appRoot) appRoot.style.display = 'none';
}

function showApp() {
  const authScreen = document.getElementById('auth-screen');
  const appRoot = document.getElementById('app-root');

  if (authScreen) authScreen.style.display = 'none';
  if (appRoot) appRoot.style.display = 'block';
}

async function mountApp() {
  if (appInstance) return appInstance;

  if (!state || typeof state.hydrate !== 'function') {
    throw new TypeError(
      'state.hydrate is not a function. Check that state.js exports "export const state = new AppState()" and main.js imports it as "import { state } from \'./state.js\'".'
    );
  }

  await state.hydrate();
  showApp();

  appInstance = new App();
  return appInstance;
}

async function bootstrapApp() {
  try {
    const user = await authManager.checkAuth();

    if (!user) {
      showAuthScreen();
      return;
    }

    if (user.role === 'admin') {
      window.location.href = './admin.html';
      return;
    }

    await mountApp();
  } catch (error) {
    console.error('Bootstrap failed:', error);
    showAuthScreen();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (errorBox) errorBox.textContent = '';
  submitBtn?.classList.add('is-loading');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const user = await authManager.login(email, password);

    if (user.role === 'admin') {
      window.location.href = './admin.html';
      return;
    }

    await mountApp();
  } catch (error) {
    if (errorBox) {
      errorBox.textContent =
        error.message || 'Unable to sign in. Please check your credentials.';
    }
  } finally {
    submitBtn?.classList.remove('is-loading');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setupAuthUI() {
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('login-password');
  const themeBtn = document.getElementById('themeBtn');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await authManager.logout();
      } finally {
        if (state && typeof state.reset === 'function') {
          state.reset();
        }
        appInstance = null;
        window.location.reload();
      }
    });
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
      togglePasswordBtn.setAttribute(
        'aria-label',
        isPassword ? 'Hide password' : 'Show password'
      );
    });
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      const currentTheme = state.settings?.theme || 'dark';

      let nextTheme = 'dark';
      if (currentTheme === 'dark') nextTheme = 'light';
      else if (currentTheme === 'light') nextTheme = 'system';
      else nextTheme = 'dark';

      try {
        await state.updateSettings({ theme: nextTheme });
      } catch (error) {
        console.error('Theme update failed:', error);
      }
    });
  }
}

function start() {
  setupAuthUI();
  bootstrapApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

export { App };