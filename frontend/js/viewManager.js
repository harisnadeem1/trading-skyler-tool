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
      'trend-map': null,
    };

    this.viewPaths = {
      dashboard: './views/dashboard.html',
      positions: './views/positions.html',
      journal: './views/journal.html',
      stats: './views/statistics.html',
      compound: './views/compound.html',
    };

    this.partialPaths = [
      './partials/settings-panel.html',
      './partials/journal-modal.html',
      './partials/trim-modal.html',
      './partials/wizard-modal.html',
    ];

    this.dashboardMount = null;
    this.positionsMount = null;
    this.journalMount = null;
    this.statsMount = null;
    this.compoundMount = null;
    this.globalPartialsMount = null;
  }

  async init() {
    this.dashboardMount = document.getElementById('dashboardMount');
    this.positionsMount = document.getElementById('positionsMount');
    this.journalMount = document.getElementById('journalMount');
    this.statsMount = document.getElementById('statsMount');
    this.compoundMount = document.getElementById('compoundMount');
    this.globalPartialsMount = document.getElementById('globalPartialsMount');

    if (
      !this.dashboardMount ||
      !this.positionsMount ||
      !this.journalMount ||
      !this.statsMount ||
      !this.compoundMount
    ) {
      console.warn('ViewManager: One or more view mount elements not found');
      return;
    }

    await this.loadGlobalPartials();
    await this.loadAllViews();

    this.views['trend-map'] = document.getElementById('trendMapView');

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

    await this.initDeepLink();

    document.addEventListener('keydown', async (e) => {
      if (e.metaKey || e.ctrlKey) {
        const viewMap = {
          '1': 'dashboard',
          '2': 'positions',
          '3': 'journal',
          '4': 'stats',
          '5': 'compound',
          '6': 'trend-map',
        };

        if (viewMap[e.key]) {
          e.preventDefault();
          await this.switchTo(viewMap[e.key]);
        }
      }
    });
  }

  async fetchHtml(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.text();
  }

  async loadViewIntoMount(path, mountEl, rootSelector) {
    const html = await this.fetchHtml(path);
    mountEl.innerHTML = html;

    const root = mountEl.querySelector(rootSelector);

    if (!root) {
      throw new Error(`Root selector "${rootSelector}" not found in ${path}`);
    }

    return root;
  }

  async loadGlobalPartials() {
    if (!this.globalPartialsMount) {
      console.warn('ViewManager: globalPartialsMount not found');
      return;
    }

    const partialHtml = await Promise.all(
      this.partialPaths.map((path) => this.fetchHtml(path))
    );

    this.globalPartialsMount.innerHTML = partialHtml.join('\n');
  }

  async loadAllViews() {
    this.views.dashboard = await this.loadViewIntoMount(
      this.viewPaths.dashboard,
      this.dashboardMount,
      '#dashboardView'
    );

    this.views.positions = await this.loadViewIntoMount(
      this.viewPaths.positions,
      this.positionsMount,
      '#positionsView'
    );

    this.views.journal = await this.loadViewIntoMount(
      this.viewPaths.journal,
      this.journalMount,
      '#journalView'
    );

    this.views.stats = await this.loadViewIntoMount(
      this.viewPaths.stats,
      this.statsMount,
      '#statsView'
    );

    this.views.compound = await this.loadViewIntoMount(
      this.viewPaths.compound,
      this.compoundMount,
      '#compoundView'
    );
  }

  async initDeepLink() {
    const hash = window.location.hash.slice(1);
    if (hash && this.views[hash]) {
      await this.switchTo(hash, { animate: false });
    }
  }

  async switchTo(view, options = { animate: true }) {
    if (view === this.currentView) return;
    if (!this.views[view]) return;
    window.scrollTo(0, 0);

    const previousView = this.currentView;
    const fromView = this.views[previousView];
    const toView = this.views[view];

    if (!fromView || !toView) return;

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
    const viewOrder = [
      'dashboard',
      'positions',
      'journal',
      'stats',
      'compound',
      'trend-map',
    ];

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