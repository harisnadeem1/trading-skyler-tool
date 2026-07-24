import { state } from './state.js';

class ViewManager {
  constructor() {
    this.currentView = 'dashboard';
    this.views = {
      dashboard: null,
      positions: null,
      journal: null,
      stats: null,
      compound: null,
      scans: null,
      'trend-map': null
    };
    this.navElement = null;
    this.navButtons = null;
    this.mobileBreakpoint = 800;
    this.mobileNavBackdrop = null;
    this.resizeTimeout = null;
  }

  init() {
    this.views.dashboard = document.querySelector('.main');
    this.views.positions = document.getElementById('positionsView');
    this.views.journal = document.getElementById('journalView');
    this.views.stats = document.getElementById('statsView');
    this.views.compound = document.getElementById('compoundView');
    this.views.scans = document.getElementById('scansView');
    this.views['trend-map'] = document.getElementById('trendMapView');

    this.navElement = document.getElementById('viewNav');
    this.navButtons = document.querySelectorAll('.view-nav__btn');
    this.mobileNavTrigger = document.getElementById('mobileNavTrigger');
    this.mobileNavBackdrop = document.getElementById('mobileNavBackdrop');

    if (!this.views.dashboard) {
      console.warn('ViewManager: Dashboard element not found');
      return;
    }

    Object.entries(this.views).forEach(([name, el]) => {
      if (!el) return;
      if (name === 'dashboard') {
        el.classList.add('view--active');
        el.classList.remove('view--hidden');
      } else {
        el.classList.remove('view--active');
        el.classList.add('view--hidden');
      }
    });

    if (this.mobileNavTrigger) {
      this.mobileNavTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isNavExpanded()) {
          this.collapseNav();
        } else {
          this.expandNav();
        }
      });
      this.updateMobileTriggerIcon();
    }

    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        const isActive = e.currentTarget.classList.contains('view-nav__btn--active');

        if (this.isMobile()) {
          if (view && !isActive) {
            this.switchTo(view);
          }
          this.collapseNav();
        } else {
          if (view) this.switchTo(view);
        }
      });
    });

    if (this.mobileNavBackdrop) {
      this.mobileNavBackdrop.addEventListener('click', () => {
        if (this.isNavExpanded()) {
          this.collapseNav();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (this.isMobile() && this.isNavExpanded()) {
        if (
          !this.navElement.contains(e.target) &&
          !this.mobileNavTrigger?.contains(e.target) &&
          !this.mobileNavBackdrop?.contains(e.target)
        ) {
          this.collapseNav();
        }
      }
    });

    window.addEventListener('resize', () => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        if (!this.isMobile() && this.isNavExpanded()) {
          this.collapseNav();
        }
        this.updateMobileTriggerIcon();
      }, 150);
    });

    this.initDeepLink();

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const viewMap = {
          '1': 'dashboard',
          '2': 'positions',
          '3': 'journal',
          '4': 'stats',
          '5': 'compound',
          '6': 'scans',
          '7': 'trend-map'
        };

        if (viewMap[e.key]) {
          e.preventDefault();
          this.switchTo(viewMap[e.key]);
          if (this.isMobile()) this.collapseNav();
        }
      }
    });
  }

  isMobile() {
    return window.innerWidth <= this.mobileBreakpoint;
  }

  isNavExpanded() {
    return this.navElement?.classList.contains('view-nav--expanded');
  }

  expandNav() {
    if (!this.isMobile()) return;
    this.navElement?.classList.add('view-nav--expanded');
    this.mobileNavTrigger?.classList.add('mobile-nav-trigger--active');
    this.mobileNavBackdrop?.classList.add('mobile-nav-backdrop--active');
    document.body.style.overflow = 'hidden';
  }

  collapseNav() {
    this.navElement?.classList.remove('view-nav--expanded');
    this.mobileNavTrigger?.classList.remove('mobile-nav-trigger--active');
    this.mobileNavBackdrop?.classList.remove('mobile-nav-backdrop--active');
    document.body.style.overflow = '';
  }

  updateMobileTriggerIcon() {
    if (!this.mobileNavTrigger) return;
    const activeBtn = document.querySelector('.view-nav__btn--active');
    if (!activeBtn) return;

    const iconContainer = this.mobileNavTrigger.querySelector('.mobile-nav-trigger__icon');
    if (!iconContainer) return;

    const svg = activeBtn.querySelector('.view-nav__icon')?.cloneNode(true);
    if (svg) {
      iconContainer.innerHTML = '';
      iconContainer.appendChild(svg);
    }
  }

  initDeepLink() {
    const hash = window.location.hash.slice(1);
    if (hash && this.views[hash]) {
      this.switchTo(hash, { animate: false });
    }
  }

  switchTo(view, options = { animate: true }) {
    if (view === this.currentView) return;
    if (!this.views[view]) return;

    const previousView = this.currentView;
    const fromView = this.views[previousView];
    const toView = this.views[view];

    if (!fromView || !toView) return;

    this.navButtons.forEach((btn) => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('view-nav__btn--active', isActive);
    });

    this.updateMobileTriggerIcon();
    window.history.replaceState(null, '', `#${view}`);

    const finishSwitch = () => {
      this.currentView = view;
      state.emit('viewChanged', { from: previousView, to: view });
    };

    if (options.animate) {
      fromView.classList.add('view--hiding');
      fromView.classList.remove('view--active');

      setTimeout(() => {
        fromView.classList.remove('view--hiding');
        fromView.classList.add('view--hidden');

        toView.classList.remove('view--hidden');
        toView.classList.add('view--entering');
        toView.classList.add('view--active');

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            finishSwitch();
          });
        });

        setTimeout(() => {
          toView.classList.remove('view--entering');
        }, 300);
      }, 200);
    } else {
      fromView.classList.remove('view--active');
      fromView.classList.add('view--hidden');
      toView.classList.remove('view--hidden');
      toView.classList.add('view--active');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          finishSwitch();
        });
      });
    }
  }

  toggle() {
    const viewOrder = ['dashboard', 'positions', 'journal', 'stats', 'compound', 'scans', 'trend-map'];
    const currentIndex = viewOrder.indexOf(this.currentView);
    const nextIndex = (currentIndex + 1) % viewOrder.length;
    this.switchTo(viewOrder[nextIndex]);
  }

  isStatsView() {
    return this.currentView === 'stats';
  }

  isDashboardView() {
    return this.currentView === 'dashboard';
  }

  isPositionsView() {
    return this.currentView === 'positions';
  }

  isJournalView() {
    return this.currentView === 'journal';
  }

  isCompoundView() {
    return this.currentView === 'compound';
  }

  isScansView() {
    return this.currentView === 'scans';
  }

  isTrendMapView() {
    return this.currentView === 'trend-map';
  }

  navigateTo(view) {
    if (this.views[view] !== undefined) {
      this.switchTo(view);
    }
  }
}

export const viewManager = new ViewManager();
export { ViewManager };