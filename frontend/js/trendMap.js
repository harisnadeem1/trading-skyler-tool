import { api } from './api.js';

class TrendMapView {
  constructor() {
    this.els = {};
    this.state = {
      loading: false,
      error: '',
      data: null,
      signal5Mode: 'AUTO',
    };
  }

  init() {
    this.cacheElements();
    if (!this.els.view) return;

    this.bindEvents();
    this.load();
  }

  cacheElements() {
    this.els = {
      view: document.getElementById('trendMapView'),
      status: document.getElementById('trendMapStatus'),
      refreshBtn: document.getElementById('trendMapRefreshBtn'),
      signal5Select: document.getElementById('trendMapSignal5Select'),

      regimeBadge: document.getElementById('trendMapRegimeBadge'),
      actionTitle: document.getElementById('trendMapActionTitle'),
      exposureMessage: document.getElementById('trendMapExposureMessage'),
      asOf: document.getElementById('trendMapAsOf'),
      sourcePill: document.getElementById('trendMapSignal5Source'),

      metricsGrid: document.getElementById('trendMapMetricsGrid'),
      signalsGrid: document.getElementById('trendMapSignalsGrid'),

      warningCard: document.getElementById('trendMapWarningCard'),
      warningText: document.getElementById('trendMapWarningText'),
    };
  }

  bindEvents() {
    if (this.els.refreshBtn) {
      this.els.refreshBtn.addEventListener('click', () => this.refresh());
    }

    if (this.els.signal5Select) {
      this.els.signal5Select.addEventListener('change', () => {
        this.state.signal5Mode = this.els.signal5Select.value || 'AUTO';
        this.load();
      });
    }
  }

  buildTrendMapUrl(basePath) {
    const selected = String(this.state.signal5Mode || 'AUTO').toUpperCase();
    if (!selected || selected === 'AUTO') return basePath;
    return `${basePath}?signal5Override=${encodeURIComponent(selected)}`;
  }

  async load() {
    this.state.loading = true;
    this.state.error = '';
    this.renderStatus();
    this.syncControls();

    try {
      const response = await api.get(this.buildTrendMapUrl('/trend-map/current'));
      this.state.data = response?.data || null;
      this.state.error = '';
    } catch (error) {
      this.state.error = error?.message || 'Failed to load Trend Map.';
      this.state.data = null;
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  async refresh() {
    this.state.loading = true;
    this.state.error = '';
    this.renderStatus();
    this.syncControls();

    try {
      const response = await api.post(this.buildTrendMapUrl('/trend-map/refresh'), {});
      this.state.data = response?.data || null;
      this.state.error = '';
    } catch (error) {
      this.state.error = error?.message || 'Failed to refresh Trend Map.';
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  syncControls() {
    if (this.els.refreshBtn) {
      this.els.refreshBtn.disabled = this.state.loading;
      this.els.refreshBtn.textContent = this.state.loading ? 'Refreshing...' : 'Refresh';
    }

    if (this.els.signal5Select) {
      this.els.signal5Select.disabled = this.state.loading;
      this.els.signal5Select.value = this.state.signal5Mode || 'AUTO';
    }
  }

  formatNumber(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(digits);
  }

  formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';

    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  getRegimeClass(regime) {
    const map = {
      GREEN: 'trend-regime--green',
      YELLOW: 'trend-regime--yellow',
      AMBER: 'trend-regime--amber',
      ORANGE: 'trend-regime--orange',
      RED: 'trend-regime--red',
      PROVISIONAL: 'trend-regime--gray',
    };

    return map[regime] || 'trend-regime--gray';
  }

  getSignalClass(colorKey) {
    const map = {
      GREEN: 'trend-signal--green',
      YELLOW: 'trend-signal--yellow',
      AMBER: 'trend-signal--amber',
      ORANGE: 'trend-signal--orange',
      RED: 'trend-signal--red',
      GRAY: 'trend-signal--gray',
    };

    return map[colorKey] || 'trend-signal--gray';
  }

  getSourceLabel(data) {
    const source = data?.signal5Source;
    if (source === 'MANUAL_OVERRIDE') {
      return `Signal 5: Manual (${this.state.signal5Mode})`;
    }
    return 'Signal 5: Auto from recent trades';
  }

  renderStatus() {
    if (!this.els.status) return;

    if (this.state.loading) {
      this.els.status.innerHTML = `<div class="trend-status trend-status--loading">Loading Trend Map...</div>`;
      return;
    }

    if (this.state.error) {
      this.els.status.innerHTML = `
        <div class="trend-status trend-status--error">
          ${this.state.error}
        </div>
      `;
      return;
    }

    this.els.status.innerHTML = '';
  }

  renderHeader(data) {
    if (!data) return;

    if (this.els.regimeBadge) {
      this.els.regimeBadge.className = `trend-regime ${this.getRegimeClass(data.marketRegime)}`;
      this.els.regimeBadge.textContent = data.marketRegime || '—';
    }

    if (this.els.actionTitle) {
      this.els.actionTitle.textContent = data.regimeActionTitle || '—';
    }

    if (this.els.exposureMessage) {
      this.els.exposureMessage.textContent = data.exposureMessage || '—';
    }

    if (this.els.asOf) {
      this.els.asOf.textContent = `As of ${this.formatDateTime(data.asOf)}`;
    }

    if (this.els.sourcePill) {
      this.els.sourcePill.textContent = this.getSourceLabel(data);
    }
  }

  renderMetrics(metrics = {}) {
    if (!this.els.metricsGrid) return;

    const items = [
      ['Ticker', 'QQQE'],
      ['Latest Close', this.formatNumber(metrics.latestClose)],
      ['MA5', this.formatNumber(metrics.ma5)],
      ['MA10', this.formatNumber(metrics.ma10)],
      ['MA20', this.formatNumber(metrics.ma20)],
      ['Weekly Close', this.formatNumber(metrics.weeklyClose)],
      ['WMA10', this.formatNumber(metrics.wma10)],
      ['WMA20', this.formatNumber(metrics.wma20)],
      ['Pct Above 20MA', this.formatNumber(metrics.latestPctAbove20MA)],
      ['NHNL', this.formatNumber(metrics.latestNHNLFromSheet, 0)],
      ['MCSI', this.formatNumber(metrics.mcClellanSummationIndex)],
      ['MCO', this.formatNumber(metrics.mcClellanOscillator)],
      ['Components Used', this.formatNumber(metrics.componentCountUsed, 0)],
    ];

    this.els.metricsGrid.innerHTML = items
      .map(
        ([label, value]) => `
          <div class="trend-metric">
            <div class="trend-metric__label">${label}</div>
            <div class="trend-metric__value">${value}</div>
          </div>
        `
      )
      .join('');
  }

  renderSignals(signals = []) {
    if (!this.els.signalsGrid) return;

    if (!signals.length) {
      this.els.signalsGrid.innerHTML = `<div class="trend-empty">No signals available.</div>`;
      return;
    }

    this.els.signalsGrid.innerHTML = signals
      .map(
        (signal) => `
          <article class="trend-signal ${this.getSignalClass(signal.colorKey)}">
            <div class="trend-signal__top">
              <span class="trend-signal__name">${signal.key.toUpperCase()}</span>
              <span class="trend-signal__value">${signal.value}</span>
            </div>
            <div class="trend-signal__label">${signal.label}</div>
            <div class="trend-signal__color">${signal.colorKey}</div>
          </article>
        `
      )
      .join('');
  }

  renderWarning(data) {
    if (!this.els.warningCard || !this.els.warningText) return;

    const warning = data?.dashboardWarning || data?.breadthModelReason || '';

    if (!warning) {
      this.els.warningCard.classList.add('view--hidden');
      this.els.warningText.textContent = '';
      return;
    }

    this.els.warningCard.classList.remove('view--hidden');
    this.els.warningText.textContent = warning;
  }

  renderEmpty() {
    if (this.els.regimeBadge) {
      this.els.regimeBadge.className = 'trend-regime trend-regime--gray';
      this.els.regimeBadge.textContent = '—';
    }

    if (this.els.actionTitle) this.els.actionTitle.textContent = 'Trend Map unavailable';
    if (this.els.exposureMessage) this.els.exposureMessage.textContent = 'No data available.';
    if (this.els.asOf) this.els.asOf.textContent = '—';
    if (this.els.sourcePill) this.els.sourcePill.textContent = 'Signal 5: Auto from recent trades';

    if (this.els.metricsGrid) {
      this.els.metricsGrid.innerHTML = `<div class="trend-empty">No metrics available.</div>`;
    }

    if (this.els.signalsGrid) {
      this.els.signalsGrid.innerHTML = `<div class="trend-empty">No signals available.</div>`;
    }

    this.renderWarning(null);
  }

  render() {
    this.syncControls();
    this.renderStatus();

    if (!this.state.data) {
      this.renderEmpty();
      return;
    }

    this.renderHeader(this.state.data);
    this.renderMetrics(this.state.data.metrics || {});
    this.renderSignals(this.state.data.signals || []);
    this.renderWarning(this.state.data);
  }
}

export const trendMapView = new TrendMapView();