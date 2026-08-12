/**
 * Stats Chart - TradingView Lightweight Charts equity curve
 */

import { state } from './state.js';
import { stats } from './stats.js';

class EquityChart {
  constructor() {
    this.container = null;
    this.emptyState = null;
    this.view = null;

    this.chart = null;
    this.series = null;

    this.frameId = null;
    this.resizeObserver = null;
  }

  init() {
    this.container = document.getElementById('equityChartCanvas');
    this.emptyState = document.getElementById('equityChartEmpty');
    this.view = document.getElementById('statsView');

    if (!this.container) {
      console.warn('EquityChart: Chart container not found');
      return;
    }

    if (!window.LightweightCharts) {
      console.error(
        'EquityChart: Lightweight Charts is not loaded. Add the library script before your app scripts.'
      );
      return;
    }

    state.on('viewChanged', (data) => {
      if (data.to === 'stats') {
        this.handleViewShown();
      }
    });

    state.on('journalEntryAdded', () => this.scheduleRender());
    state.on('journalEntryUpdated', () => this.scheduleRender());
    state.on('journalEntryDeleted', () => this.scheduleRender());
    state.on('settingsChanged', () => this.scheduleRender());
    state.on('accountChanged', () => this.scheduleRender());

    window.addEventListener('resize', () => this.scheduleRender(true));

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleRender(true);
      });

      this.resizeObserver.observe(this.container);
    }

    this.scheduleRender();
  }

  isVisible() {
    if (!this.view || !this.container) return false;
    if (this.view.classList.contains('view--hidden')) return false;

    const rect = this.container.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  }

  scheduleRender(forceResize = false) {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    this.frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.frameId = null;

        if (!this.isVisible()) return;

        this.render(forceResize);
      });
    });
  }

  handleViewShown() {
    let attempts = 0;
    const maxAttempts = 10;

    const tryRender = () => {
      attempts += 1;

      if (this.isVisible()) {
        this.render(true);
        return;
      }

      if (attempts < maxAttempts) {
        requestAnimationFrame(tryRender);
      }
    };

    requestAnimationFrame(tryRender);
  }

  getColors() {
    const rootStyles = getComputedStyle(document.documentElement);

    return {
      background:
        rootStyles.getPropertyValue('--ronin-bg').trim() ||
        rootStyles.getPropertyValue('--bg-surface').trim() ||
        '#F6F1E7',

      surface:
        rootStyles.getPropertyValue('--bg-surface').trim() ||
        '#F6F1E7',

      text:
        rootStyles.getPropertyValue('--ronin-text-secondary').trim() ||
        rootStyles.getPropertyValue('--text-muted').trim() ||
        '#5E574D',

      line:
        rootStyles.getPropertyValue('--ronin-chart-line').trim() ||
        '#3A3A3A',

      gold:
        rootStyles.getPropertyValue('--ronin-gold').trim() ||
        rootStyles.getPropertyValue('--primary').trim() ||
        '#9E7B3B',

      border:
        rootStyles.getPropertyValue('--ronin-border').trim() ||
        rootStyles.getPropertyValue('--border-subtle').trim() ||
        '#D9CFBC',

      grid: 'rgba(158, 123, 59, 0.14)'
    };
  }

  createChart() {
    if (this.chart || !this.container || !window.LightweightCharts) {
      return;
    }

    const { AreaSeries } = window.LightweightCharts;
    const colors = this.getColors();

    this.container.innerHTML = '';

    this.chart = window.LightweightCharts.createChart(this.container, {
      width: this.container.clientWidth || 600,
      height: this.container.clientHeight || 300,
      autoSize: true,

      layout: {
        background: { color: colors.background },
        textColor: colors.text
      },

      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },

      leftPriceScale: {
        visible: false
      },

      rightPriceScale: {
        visible: true,
        borderColor: colors.border
      },

      timeScale: {
        borderColor: colors.border,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 4,
        fixLeftEdge: true
      },

      crosshair: {
        vertLine: {
          color: 'rgba(158, 123, 59, 0.32)',
          width: 1,
          style: 2
        },

        horzLine: {
          color: 'rgba(158, 123, 59, 0.32)',
          width: 1,
          style: 2
        }
      },

      localization: {
        priceFormatter: (price) => {
          return `$${Number(price).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`;
        }
      },

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },

      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });

    this.series = this.chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      lineWidth: 2,

      topColor: 'rgba(158, 123, 59, 0.30)',
      bottomColor: 'rgba(158, 123, 59, 0.02)',

      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: colors.gold,
      crosshairMarkerBackgroundColor: colors.surface,

      lastValueVisible: true,
      priceLineVisible: false,

      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01
      }
    });
  }

  updateChartTheme() {
    if (!this.chart || !this.series) return;

    const colors = this.getColors();

    this.chart.applyOptions({
      layout: {
        background: { color: colors.background },
        textColor: colors.text
      },

      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },

      rightPriceScale: {
        borderColor: colors.border
      },

      timeScale: {
        borderColor: colors.border
      }
    });

    this.series.applyOptions({
      lineColor: colors.line,
      topColor: 'rgba(158, 123, 59, 0.30)',
      bottomColor: 'rgba(158, 123, 59, 0.02)',
      crosshairMarkerBorderColor: colors.gold,
      crosshairMarkerBackgroundColor: colors.surface
    });
  }

  resizeChart() {
    if (!this.chart || !this.container) return;

    const width = Math.max(1, Math.floor(this.container.clientWidth));
    const height = Math.max(1, Math.floor(this.container.clientHeight));

    this.chart.applyOptions({
      width,
      height
    });
  }

  getChartData() {
    const equityPoints = stats.buildEquityCurve();

    const pointsByTime = new Map();

    equityPoints.forEach((point) => {
      const timestamp = Math.floor(
        new Date(point.date).getTime() / 1000
      );

      const balance = Number(point.balance);

      if (!Number.isFinite(timestamp) || !Number.isFinite(balance)) {
        return;
      }

      /*
       * Lightweight Charts requires times to be unique.
       * If two trades share one timestamp, retain the latest balance.
       */
      pointsByTime.set(timestamp, {
        time: timestamp,
        value: balance
      });
    });

    return [...pointsByTime.values()].sort((a, b) => a.time - b.time);
  }

  render(forceResize = false) {
    if (!this.isVisible()) return;

    this.createChart();

    if (!this.chart || !this.series) return;

    if (forceResize) {
      this.resizeChart();
    }

    this.updateChartTheme();

    const chartData = this.getChartData();

    /*
     * buildEquityCurve includes a starting account point.
     * Less than two points means there is no realized trade curve yet.
     */
    if (chartData.length < 2) {
      this.series.setData([]);
      this.showEmptyState(true);
      return;
    }

    this.showEmptyState(false);

    this.series.setData(chartData);
    this.chart.timeScale().fitContent();
  }

  showEmptyState(show) {
    if (this.emptyState) {
      this.emptyState.style.display = show ? 'flex' : 'none';
    }
  }

  destroy() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.series = null;
    }
  }
}

export const equityChart = new EquityChart();
export { EquityChart };