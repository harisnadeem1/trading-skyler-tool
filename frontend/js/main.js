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
import { dataManager } from './dataManager.js';
import { clearDataModal } from './clearDataModal.js';
import { viewManager } from './viewManager.js';
import { stats } from './stats.js';
import { equityChart } from './statsChart.js';
import { positionsView } from './positionsView.js';
import { journalView } from './journalView.js';
import { compoundView } from './compoundView.js';
import { authManager } from './auth.js';
import {
  subscribeToTradeAlerts,
  subscribeToMarketConnection,
  closeMarketStream,
} from './marketStream.js';
import { trendMapView } from './trendMap.js';

let appInstance = null;
const taglineMap = {
  dashboard: 'Plan the trade. Define the risk. Execute with discipline.',
  positions: 'Track open risk and manage positions with clarity.',
  journal: 'Log the trade. Review the process. Improve the system.',
  stats: 'Measure what matters. Study the edge.',
  compound: 'Consistency compounds over time.',
  'trend-map': 'Market regime, exposure guidance, and the 7-signal block.',
      'ronin-system': 'The rules, structure, and execution framework behind the method.',

  settings: 'Tune the platform to your workflow.',
};

class App {
  constructor() {
    this.dashboardEls = {};
    this.toastContainer = null;
    this.unsubscribeTradeAlerts = null;
    this.unsubscribeMarketConnection = null;
    this.currentView = 'dashboard';
  }

  async init() {
    console.log('Initializing TradeDeck...');

    dataManager.setModules(settings, calculator, journal, clearDataModal);

    theme.init();

    await viewManager.init();

this.currentView =
  viewManager?.currentView ||
  viewManager?.activeView ||
  this.currentView;

settings.init();
    trimModal.init();
    wizard.init();
    clearDataModal.init();

    calculator.init();
    parser.init();
    journal.init();
    stats.init();
    equityChart.init();
    positionsView.init();
    journalView.init();
    compoundView.init();
    trendMapView.init();

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
    this.setupShellNavigation();
    this.setupMobileNavVisibility();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
  window.lucide.createIcons();
}

    settingsToggle.updateSummary(
      state.account.currentSize,
      state.account.maxPositionPercent
    );

    this.ensureToastContainer();
    this.setupLiveNotifications();

    console.log('TradeDeck initialized successfully');
  }

  cacheDashboardElements() {
    this.dashboardEls = {
      settingsSummary: document.getElementById('settingsSummary'),
      streakDisplay: document.getElementById('streakDisplay'),
      streakText: document.getElementById('streakText'),
      viewPositionsBtn: document.getElementById('viewPositionsBtn'),
      viewJournalBtn: document.getElementById('viewJournalBtn'),
      currentViewLabel: document.getElementById('currentViewLabel'),
      currentViewTagline: document.getElementById('currentViewTagline'),
      sidebar: document.getElementById('appSidebar'),
      sidebarToggle: document.getElementById('sidebarToggle'),
      desktopNavButtons: Array.from(document.querySelectorAll('.app-sidebar__link[data-view]')),
      mobileNavButtons: Array.from(document.querySelectorAll('.mobile-bottom-nav__item[data-view]')),
      mobileMoreBtn: document.getElementById('mobileMoreBtn'),
      mobileMenuTrigger: document.getElementById('mobileMenuTrigger'),
      mobileMoreSheet: document.getElementById('mobileMoreSheet'),
      mobileMoreBackdrop: document.getElementById('mobileMoreBackdrop'),
      mobileMoreLinks: Array.from(document.querySelectorAll('.mobile-more-sheet__link[data-view]')),
      settingsBtn: document.getElementById('settingsBtn'),
      mobileBottomNav: document.querySelector('.mobile-bottom-nav'),
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
    const accountValueEl = document.querySelector('.topbar__account-value');
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
        this.navigateToView('positions');
      });
    }

    if (this.dashboardEls.viewJournalBtn) {
      this.dashboardEls.viewJournalBtn.addEventListener('click', () => {
        this.navigateToView('journal');
      });
    }
  }

  setupShellNavigation() {
    const {
      sidebarToggle,
      desktopNavButtons,
      mobileNavButtons,
      mobileMoreBtn,
      mobileMenuTrigger,
      mobileMoreSheet,
      mobileMoreBackdrop,
      mobileMoreLinks,
      settingsBtn,
    } = this.dashboardEls;

  if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;

    shell.classList.toggle('sidebar-collapsed');
    const expanded = !shell.classList.contains('sidebar-collapsed');

    sidebarToggle.setAttribute('aria-expanded', String(expanded));
    sidebarToggle.setAttribute(
      'aria-label',
      expanded ? 'Collapse sidebar' : 'Expand sidebar'
    );

    const icon = sidebarToggle.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute(
        'data-lucide',
        expanded ? 'chevrons-left' : 'chevrons-right'
      );
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });
}

    desktopNavButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.handleNavAction(view);
      });
    });

    mobileNavButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.handleNavAction(view);
      });
    });

    mobileMoreLinks.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.handleNavAction(view);
      });
    });

    if (mobileMoreBtn) {
      mobileMoreBtn.addEventListener('click', () => this.openMobileMoreSheet());
    }

    if (mobileMenuTrigger) {
      mobileMenuTrigger.addEventListener('click', () => this.openMobileMoreSheet());
    }

    if (mobileMoreBackdrop) {
      mobileMoreBackdrop.addEventListener('click', () => this.closeMobileMoreSheet());
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.handleNavAction('settings');
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeMobileMoreSheet();
      }
    });

    this.syncNavigationState(this.currentView);
  }

  setupMobileNavVisibility() {
  const { mobileBottomNav, mobileMoreSheet } = this.dashboardEls;
  if (!mobileBottomNav) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  const updateMobileNav = () => {
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const fullHeight = document.documentElement.scrollHeight;
    const nearBottom = currentScrollY + viewportHeight >= fullHeight - 8;
    const scrollingUp = currentScrollY < lastScrollY;
    const moreSheetOpen = mobileMoreSheet?.classList.contains('is-open');

    if (moreSheetOpen) {
      mobileBottomNav.classList.remove('mobile-bottom-nav--hidden');
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    if (nearBottom && !scrollingUp) {
      mobileBottomNav.classList.add('mobile-bottom-nav--hidden');
    } else {
      mobileBottomNav.classList.remove('mobile-bottom-nav--hidden');
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateMobileNav);
        ticking = true;
      }
    },
    { passive: true }
  );
}

  openMobileMoreSheet() {
    const { mobileMoreSheet, mobileMenuTrigger } = this.dashboardEls;
    if (!mobileMoreSheet) return;

    mobileMoreSheet.classList.add('is-open');
    mobileMoreSheet.setAttribute('aria-hidden', 'false');

    if (mobileMenuTrigger) {
      mobileMenuTrigger.setAttribute('aria-expanded', 'true');
    }
  }

  closeMobileMoreSheet() {
    const { mobileMoreSheet, mobileMenuTrigger } = this.dashboardEls;
    if (!mobileMoreSheet) return;

    mobileMoreSheet.classList.remove('is-open');
    mobileMoreSheet.setAttribute('aria-hidden', 'true');

    if (mobileMenuTrigger) {
      mobileMenuTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  handleNavAction(view) {
    if (view === 'logout') {
      const logoutBtn = document.getElementById('logout-btn');
      logoutBtn?.click();
      return;
    }

    if (view === 'settings') {
      this.closeMobileMoreSheet();
      if (typeof settingsToggle.toggle === 'function') {
        settingsToggle.toggle();
      } else if (typeof settingsToggle.open === 'function') {
        settingsToggle.open();
      }
      return;
    }

    this.navigateToView(view);
  }

  navigateToView(view) {
    this.currentView = view;
    this.syncNavigationState(view);
    this.closeMobileMoreSheet();

    if (viewManager && typeof viewManager.navigateTo === 'function') {
      viewManager.navigateTo(view);
    }
  }

  syncNavigationState(view) {
    const labelMap = {
      dashboard: 'Dashboard',
      positions: 'Positions',
      journal: 'Journal',
      stats: 'Statistics',
      compound: 'Compound',
      'trend-map': 'Trend Map',
      'ronin-system': 'The Ronin System',
      settings: 'Settings',
    };

    const {
      desktopNavButtons,
      mobileNavButtons,
      mobileMoreLinks,
      currentViewLabel,
    } = this.dashboardEls;

    desktopNavButtons.forEach((btn) => {
      btn.classList.toggle('app-sidebar__link--active', btn.dataset.view === view);
    });

    mobileNavButtons.forEach((btn) => {
      btn.classList.toggle('mobile-bottom-nav__item--active', btn.dataset.view === view);
    });

    mobileMoreLinks.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });

    if (currentViewLabel) {
      currentViewLabel.textContent = labelMap[view] || 'Dashboard';
    }
    if (currentViewTagline) {
  currentViewTagline.textContent = taglineMap[view] || '';
}
  }

  setupGlobalEvents() {
    state.on('viewChanged', ({ to }) => {
  if (!to) return;
  this.currentView = to;
  this.syncNavigationState(to);
});
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

  ensureToastContainer() {
    let container = document.getElementById('toast-container');

    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    this.toastContainer = container;
  }

  setupLiveNotifications() {
    if (typeof this.unsubscribeTradeAlerts === 'function') {
      this.unsubscribeTradeAlerts();
    }

    if (typeof this.unsubscribeMarketConnection === 'function') {
      this.unsubscribeMarketConnection();
    }

    this.unsubscribeTradeAlerts = subscribeToTradeAlerts((payload) => {
      this.handleTradeAlert(payload);
    });

    this.unsubscribeMarketConnection = subscribeToMarketConnection((payload) => {
      if (payload?.type === 'error') {
        console.error('[marketStream] connection error', payload.error);
      }
    });
  }

  teardownLiveNotifications() {
    if (typeof this.unsubscribeTradeAlerts === 'function') {
      this.unsubscribeTradeAlerts();
    }

    if (typeof this.unsubscribeMarketConnection === 'function') {
      this.unsubscribeMarketConnection();
    }

    this.unsubscribeTradeAlerts = null;
    this.unsubscribeMarketConnection = null;
  }

  handleTradeAlert(payload) {
    if (!payload || payload.type !== 'five_r_hit') return;

    const title = '5R Hit';
    const message = payload.message || `${payload.symbol} reached 5R`;

    this.showToast({
      type: 'success',
      title,
      message,
      duration: 5000,
      persistent: true,
      position: 'top-right',
    });
  }

  showToast({
    type = 'info',
    title = '',
    message = '',
    duration = 4000,
    persistent = false,
    position = 'default',
  }) {
    let container = null;

    if (position === 'top-right') {
      container = document.getElementById('toastContainerTopRight');

      if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainerTopRight';
        document.body.appendChild(container);
      }
    } else {
      if (!this.toastContainer) {
        this.ensureToastContainer();
      }
      container = this.toastContainer;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    toast.innerHTML = `
      <div class="toast__content">
        <div class="toast__title">${title}</div>
        <div class="toast__message">${message}</div>
      </div>
      <button class="toast__close" aria-label="Close notification">×</button>
    `;

    let isClosed = false;

    const close = () => {
      if (isClosed || !toast.parentNode) return;
      isClosed = true;
      toast.classList.add('toast--exit');
      setTimeout(() => toast.remove(), 220);
    };

    toast.querySelector('.toast__close')?.addEventListener('click', close);

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });

    if (!persistent) {
      window.setTimeout(close, duration);
    }
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
  await appInstance.init();
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
        if (appInstance && typeof appInstance.teardownLiveNotifications === 'function') {
          appInstance.teardownLiveNotifications();
        }
        closeMarketStream();
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