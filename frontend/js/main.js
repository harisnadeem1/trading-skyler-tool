/**
 * Main - Application entry point
 */

import { state } from './state.js';
import { calculator } from './calculator.js';
import { parser } from './parser.js';
import { journal } from './journal.js';
import { settings } from './settings.js';
import { theme, keyboard, settingsToggle, focusManager, hintArrow, tooltipHandler } from './ui.js';
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

class App {
  constructor() {
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

    settingsToggle.updateSummary(
      state.account.currentSize,
      state.account.maxPositionPercent
    );

    this.setupGlobalEvents();
    this.setupGlobalFunctions();

    console.log('TradeDeck initialized successfully');
  }

  setupGlobalEvents() {
    state.on('accountSizeChanged', () => {
      calculator.calculate();
      settingsToggle.updateSummary(
        state.account.currentSize,
        state.account.maxPositionPercent
      );
    });

    state.on('resultsRendered', (results) => {
      settings.updateAccountDisplay(state.account.currentSize);

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

    state.on('settingsChanged', () => {
      settingsToggle.updateSummary(
        state.account.currentSize,
        state.account.maxPositionPercent
      );
    });

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      state.on('settingsChanged', (s) => console.log('Settings:', s));
      state.on('tradeChanged', (t) => console.log('Trade:', t));
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

async function bootstrapApp() {
  const user = await authManager.checkAuth();

  if (!user) {
    showAuthScreen();
    return;
  }

  showApp();
  new App();
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

    showApp();
    new App();
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message || 'Unable to sign in. Please check your credentials.';
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

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await authManager.logout();
      window.location.reload();
    });
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
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