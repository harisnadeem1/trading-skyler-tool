import { api } from './api.js';
import { formatCurrency, formatPercent } from './utils.js';
import { getLatestPrice, subscribeToPrice } from './marketStream.js';

// ---------------------------------------------------------------------------
// "Ronin Full" palette
// ---------------------------------------------------------------------------
const PALETTE = {
  canvas: {
    background: '#E9DDCA',
    grid: 'rgba(212, 196, 168, 0.3)', // #D4C4A8 @ 30% opacity
    crosshair: '#5D4037',
    scalesText: '#2F2F2F',
    scalesLines: '#C8B89A',
  },
  candles: {
    upBody: '#3D6B4F',
    upBorder: '#2A4A38',
    upWick: '#2A4A38',
    downBody: '#8B2E2E',
    downBorder: '#5C1F1F',
    downWick: '#5C1F1F',
  },
  volume: {
    // #3D6B4F / #8B2E2E @ 45% transparency
    up: 'rgba(61, 107, 79, 0.55)',
    down: 'rgba(139, 46, 46, 0.55)',
  },
  // The palette defines 5 MA lines (8 EMA / Weekly Stepped EMA / 21 EMA /
  // 50 EMA / 200 SMA) but this chart only plots 2 lines (10 & 20 length).
  // Mapped to the closest matching lengths in the palette: 8 EMA -> fast(10),
  // 21 EMA -> slow(20).
  movingAverages: {
    fast: '#B8860B', // 8 EMA
    slow: '#2A4A38', // 21 EMA
  },
  markup: {
    lastPriceLine: '#B8860B',
  },
};

// Background shading colors, matched to the Pine Script's bgcolor() calls.
// Pine uses color.new(color, transparency) where transparency is 0-100
// (higher = more transparent). We convert that to an rgba() alpha value.
//   green:      color.new(color.rgb(0, 150, 0), 50)  -> 50% transparent -> alpha 0.5
//   lightgreen: color.new(color.rgb(0, 255, 0), 80)  -> 80% transparent -> alpha 0.2
//   yellow:     color.new(color.yellow, 80)          -> 80% transparent -> alpha 0.2
// Any other state is `na` in Pine, i.e. no background at all.
const REGIME_BG_COLORS = {
  STRONG_BULLISH: 'rgba(0, 150, 0, 0.5)',
  EARLY_BULLISH: 'rgba(0, 255, 0, 0.2)',
  WEAKENING: 'rgba(255, 255, 0, 0.2)',
};

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

class TrendMapView {
  constructor() {
    this.els = {};

    this.state = {
      loading: false,
      error: '',
      data: null,
      signal5Mode: 'MANUAL',
      signal5Value: 'YES',
    };

    this.trendSymbols = [
      { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    ];

    this.charts = new Map();
    this.chartSeries = new Map();
    this.regimeSeries = new Map();
    this.chartData = new Map();
    this.chartUnsubscribers = new Map();
    this.chartResizeObserver = null;
  }

  init() {
    this.cacheElements();
    if (!this.els.view) return;

    this.bindEvents();
    this.load();
    this.loadTrendCharts();
    this.observeChartResize();
  }

  cacheElements() {
    this.els = {
      view: document.getElementById('trendMapView'),
      status: document.getElementById('trendMapStatus'),

      signal5ModeSelect: document.getElementById('trendMapSignal5ModeSelect'),
      signal5ValueSelect: document.getElementById('trendMapSignal5ValueSelect'),

      regimeBadge: document.getElementById('trendMapRegimeBadge'),
      actionTitle: document.getElementById('trendMapActionTitle'),
      exposureMessage: document.getElementById('trendMapExposureMessage'),
      asOf: document.getElementById('trendMapAsOf'),
      sourcePill: document.getElementById('trendMapSignal5Source'),

      metricsGrid: document.getElementById('trendMapMetricsGrid'),
      signalsGrid: document.getElementById('trendMapSignalsGrid'),

      warningCard: document.getElementById('trendMapWarningCard'),
      warningText: document.getElementById('trendMapWarningText'),
      chartCards: document.querySelectorAll('.trend-chart-card[data-symbol]'),
    };
  }

  bindEvents() {
    if (this.els.signal5ModeSelect) {
      this.els.signal5ModeSelect.addEventListener('change', () => {
        this.state.signal5Mode = this.els.signal5ModeSelect.value || 'AUTO';
        this.syncControls();
        this.load();
      });
    }

    if (this.els.signal5ValueSelect) {
      this.els.signal5ValueSelect.addEventListener('change', () => {
        this.state.signal5Value = this.els.signal5ValueSelect.value || 'YES';
        this.syncControls();
        if (this.state.signal5Mode === 'MANUAL') {
          this.load();
        }
      });
    }
  }

  buildTrendMapUrl(basePath) {
    const params = new URLSearchParams();

    if (this.state.signal5Mode === 'MANUAL') {
      params.set('signal5Override', this.state.signal5Value || 'YES');
    }

    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
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

  syncControls() {
    if (this.els.signal5ModeSelect) {
      this.els.signal5ModeSelect.disabled = this.state.loading;
      this.els.signal5ModeSelect.value = this.state.signal5Mode || 'AUTO';
    }

    if (this.els.signal5ValueSelect) {
      this.els.signal5ValueSelect.disabled = this.state.loading || this.state.signal5Mode !== 'MANUAL';
      this.els.signal5ValueSelect.value = this.state.signal5Value || 'YES';
    }
  }

  formatNumber(value, digits = 2) {
    if (value === null || value === undefined || value === '') return '—';
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

  getSignalClass(value) {
    const normalizedValue = String(value || '').trim().toUpperCase();

    const map = {
      YES: 'trend-signal--green',
      NO: 'trend-signal--red',
      ATTEMPT: 'trend-signal--orange',
    };

    return map[normalizedValue] || 'trend-signal--gray';
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
      this.els.sourcePill.textContent = data.signal5Source === 'MANUAL_OVERRIDE'
        ? `Signal 5: Manual (${this.state.signal5Value})`
        : 'Signal 5: Auto from database';
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
      ['NHNL', this.formatNumber(metrics.latestNHNL, 0)],
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
          <article class="trend-signal ${this.getSignalClass(signal.value)}">
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
    if (this.els.sourcePill) this.els.sourcePill.textContent = 'Signal 5: Auto from database';

    if (this.els.metricsGrid) {
      this.els.metricsGrid.innerHTML = `<div class="trend-empty">No metrics available.</div>`;
    }

    if (this.els.signalsGrid) {
      this.els.signalsGrid.innerHTML = `<div class="trend-empty">No signals available.</div>`;
    }

    this.renderWarning(null);
  }

  render() {
    this.renderStatus();

    if (!this.state.data) {
      this.renderEmpty();
      return;
    }

    this.syncControls();
    this.renderHeader(this.state.data);
    this.renderMetrics(this.state.data.metrics || {});
    this.renderSignals(this.state.data.signals || []);
    this.renderWarning(this.state.data);
  }

  calculateSMA(candles, length) {
    return candles.map((candle, index) => {
      if (index < length - 1) {
        return {
          time: candle.time,
          value: null,
        };
      }

      const slice = candles.slice(index - length + 1, index + 1);
      const total = slice.reduce((sum, item) => sum + Number(item.close), 0);

      return {
        time: candle.time,
        value: total / length,
      };
    });
  }

  /**
   * Core regime classification, mirrors the Pine Script's green / lightgreen /
   * yellow / na logic exactly, given a single pair of "now" and "trendlen bars
   * ago" MA values. Used both for the latest-bar summary card and for building
   * the full historical background series.
   */
  computeRegimeKey(fastNow, slowNow, fastPast, slowPast) {
    if (
      !Number.isFinite(fastNow) ||
      !Number.isFinite(slowNow) ||
      !Number.isFinite(fastPast) ||
      !Number.isFinite(slowPast)
    ) {
      return 'INSUFFICIENT_DATA';
    }

    const fastAboveSlow = fastNow > slowNow;
    const fastRising = fastNow > fastPast;
    const slowRising = slowNow > slowPast;

    if (fastAboveSlow && fastRising && slowRising) return 'STRONG_BULLISH';
    if (fastAboveSlow && fastRising && !slowRising) return 'EARLY_BULLISH';
    if (fastAboveSlow && !fastRising && !slowRising) return 'WEAKENING';

    return 'NEUTRAL_MIXED';
  }

  getTrendRegime(fastMA, slowMA, trendLength = 5) {
    const lastIndex = fastMA.length - 1;

    const fastNow = fastMA[lastIndex]?.value;
    const slowNow = slowMA[lastIndex]?.value;
    const fastPast = fastMA[lastIndex - trendLength]?.value;
    const slowPast = slowMA[lastIndex - trendLength]?.value;

    const key =
      lastIndex < trendLength
        ? 'INSUFFICIENT_DATA'
        : this.computeRegimeKey(fastNow, slowNow, fastPast, slowPast);

    const REGIME_INFO = {
      INSUFFICIENT_DATA: {
        key: 'INSUFFICIENT_DATA',
        label: 'Building history',
        summary: 'Not enough daily candles to calculate trend.',
        className: 'trend-chart-card--neutral',
      },
      STRONG_BULLISH: {
        key: 'STRONG_BULLISH',
        label: 'Strong bullish',
        summary: '10 SMA is above 20 SMA. Both moving averages are rising.',
        className: 'trend-chart-card--strong',
      },
      EARLY_BULLISH: {
        key: 'EARLY_BULLISH',
        label: 'Early bullish',
        summary: '10 SMA is above and rising. 20 SMA is not yet rising.',
        className: 'trend-chart-card--early',
      },
      WEAKENING: {
        key: 'WEAKENING',
        label: 'Weakening',
        summary: '10 SMA remains above 20 SMA, but momentum is weakening.',
        className: 'trend-chart-card--weak',
      },
      NEUTRAL_MIXED: {
        key: 'NEUTRAL_MIXED',
        label: 'Neutral / mixed',
        summary:
          'The full bullish trend condition is not active. The moving averages are mixed or the 10 SMA is below the 20 SMA.',
        className: 'trend-chart-card--neutral',
      },
    };

    return REGIME_INFO[key];
  }

  /**
   * Builds one background data point per candle, mirroring Pine's per-bar
   * bgcolor(). Bars where Pine would leave the background as `na` (i.e.
   * NEUTRAL_MIXED / INSUFFICIENT_DATA here) get a fully transparent color
   * rather than being omitted, so the histogram series always has a value
   * for every bar time (required by Lightweight Charts).
   */
  buildRegimeBackgroundData(candles, fastMA, slowMA, trendLength = 5) {
    return candles.map((candle, index) => {
      const fastNow = fastMA[index]?.value;
      const slowNow = slowMA[index]?.value;
      const fastPast = fastMA[index - trendLength]?.value;
      const slowPast = slowMA[index - trendLength]?.value;

      const key =
        index < trendLength
          ? 'INSUFFICIENT_DATA'
          : this.computeRegimeKey(fastNow, slowNow, fastPast, slowPast);

      return {
        time: candle.time,
        value: 1,
        color: REGIME_BG_COLORS[key] || TRANSPARENT,
      };
    });
  }

  /**
   * Builds volume histogram data, colored per the Ronin Full palette:
   * green for up bars (close >= open), red for down bars.
   */
  buildVolumeData(candles) {
    return candles.map((candle) => ({
      time: candle.time,
      value: Number(candle.volume ?? 0),
      color: candle.close >= candle.open ? PALETTE.volume.up : PALETTE.volume.down,
    }));
  }

  getCard(symbol) {
    return [...this.els.chartCards].find(
      (card) => card.dataset.symbol === symbol
    );
  }

  setChartLoading(symbol, isLoading, message = '') {
    const card = this.getCard(symbol);
    if (!card) return;

    const loadingEl = card.querySelector('[data-role="loading"]');

    if (!loadingEl) return;

    loadingEl.textContent = message || `Loading ${symbol} chart...`;
    loadingEl.classList.toggle('is-visible', isLoading);
  }

  setChartError(symbol, message) {
    const card = this.getCard(symbol);
    if (!card) return;

    const regimeEl = card.querySelector('[data-role="regime"]');
    const summaryEl = card.querySelector('[data-role="trend-summary"]');

    card.classList.remove(
      'trend-chart-card--strong',
      'trend-chart-card--early',
      'trend-chart-card--weak',
      'trend-chart-card--neutral'
    );
    card.classList.add('trend-chart-card--neutral');

    if (regimeEl) {
      regimeEl.className =
        'trend-chart-card__regime trend-chart-card__regime--error';
      regimeEl.textContent = 'Unavailable';
    }

    if (summaryEl) {
      summaryEl.textContent = message || 'Unable to load chart data.';
    }
  }

  async loadTrendCharts() {
    await Promise.all(
      this.trendSymbols.map(({ symbol }) => this.loadTrendChart(symbol))
    );
  }

  async loadTrendChart(symbol) {
    const card = this.getCard(symbol);
    if (!card) return;

    this.setChartLoading(symbol, true);

    try {
      const response = await api.getMarketHistory(symbol, '1y', '1d');
      const rawCandles = Array.isArray(response?.candles)
        ? response.candles
        : [];

      const candles = rawCandles
        .map((bar) => ({
          time: Number(bar.time),
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
          volume: Number(bar.volume ?? 0),
        }))
        .filter(
          (bar) =>
            Number.isFinite(bar.time) &&
            Number.isFinite(bar.open) &&
            Number.isFinite(bar.high) &&
            Number.isFinite(bar.low) &&
            Number.isFinite(bar.close)
        )
        .sort((a, b) => a.time - b.time);

      if (candles.length < 25) {
        throw new Error('Not enough daily candle data returned.');
      }

      this.chartData.set(symbol, candles);

      this.renderTrendChart(symbol, candles);
      this.subscribeToTrendPrice(symbol);
    } catch (error) {
      console.error(`Trend chart failed for ${symbol}:`, error);
      this.setChartError(
        symbol,
        error?.message || 'Unable to load daily chart data.'
      );
    } finally {
      this.setChartLoading(symbol, false);
    }
  }

  renderTrendChart(symbol, candles) {
    const card = this.getCard(symbol);
    if (!card || !window.LightweightCharts) return;

    const canvas = card.querySelector('.trend-chart-card__canvas');
    if (!canvas) return;

    const existingChart = this.charts.get(symbol);

    if (existingChart) {
      existingChart.remove();
    }

    canvas.innerHTML = '';

    const chart = window.LightweightCharts.createChart(canvas, {
      width: canvas.clientWidth || 600,
      height: 340,
      layout: {
        background: { color: PALETTE.canvas.background },
        textColor: PALETTE.canvas.scalesText,
      },
      grid: {
        vertLines: { color: PALETTE.canvas.grid },
        horzLines: { color: PALETTE.canvas.grid },
      },
      rightPriceScale: {
        borderColor: PALETTE.canvas.scalesLines,
      },
      timeScale: {
  borderColor: PALETTE.canvas.scalesLines,

  timeVisible: true,
  secondsVisible: false,

  minBarSpacing: 4,
  maxBarSpacing: 28,

  /*
   * Cannot scroll before the first candle returned by the 1-year API call.
   */
  fixLeftEdge: true,

  /*
   * Can scroll right into future/empty chart space.
   */
  fixRightEdge: false,

  /*
   * Initial breathing space after the newest candle.
   */
  rightOffset: 5,
},
      crosshair: {
        vertLine: { color: PALETTE.canvas.crosshair },
        horzLine: { color: PALETTE.canvas.crosshair },
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },
    });

    const { CandlestickSeries, LineSeries, HistogramSeries } = window.LightweightCharts;

    // Background regime series, added FIRST so it renders behind everything
    // else (Lightweight Charts draws later-added series on top). It's pinned
    // to its own overlay price scale stretched to fill the full pane height,
    // mimicking Pine's full-height bgcolor() bands.
    const regimeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'regime-bg',
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    });

    chart.priceScale('regime-bg').applyOptions({
      scaleMargins: { top: 0, bottom: 0 },
      visible: false,
    });

    // Volume series, added next so it sits behind candles/MAs but in front
    // of the regime background. Confined to the bottom ~25% of the pane via
    // its own overlay scale.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      visible: false,
    });

    // Candle colors matched to the Ronin Full palette.
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: PALETTE.candles.upBody,
      borderUpColor: PALETTE.candles.upBorder,
      wickUpColor: PALETTE.candles.upWick,

      downColor: PALETTE.candles.downBody,
      borderDownColor: PALETTE.candles.downBorder,
      wickDownColor: PALETTE.candles.downWick,

      borderVisible: true,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // MA colors matched to the palette (8 EMA -> fast/10, 21 EMA -> slow/20).
    const fastSeries = chart.addSeries(LineSeries, {
      color: PALETTE.movingAverages.fast,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const slowSeries = chart.addSeries(LineSeries, {
      color: PALETTE.movingAverages.slow,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const fastMA = this.calculateSMA(candles, 10);
    const slowMA = this.calculateSMA(candles, 20);

    const fastData = fastMA.filter((item) => Number.isFinite(item.value));
    const slowData = slowMA.filter((item) => Number.isFinite(item.value));

    regimeSeries.setData(this.buildRegimeBackgroundData(candles, fastMA, slowMA, 5));
    volumeSeries.setData(this.buildVolumeData(candles));
    candleSeries.setData(candles);
    fastSeries.setData(fastData);
    slowSeries.setData(slowData);

    this.applyTrendRegime(symbol, fastMA, slowMA);

    const visibleBars = symbol === 'QQQ' ? 140 : 110;

chart.timeScale().setVisibleLogicalRange({
  from: Math.max(0, candles.length - visibleBars),
  to: candles.length + 5,
});

    this.charts.set(symbol, chart);
    this.chartSeries.set(symbol, {
      candleSeries,
      fastSeries,
      slowSeries,
      volumeSeries,
    });
    this.regimeSeries.set(symbol, regimeSeries);

    this.updateTrendQuote(symbol);
  }

  updateTrendQuote(symbol, pricePayload = null) {
    const card = this.getCard(symbol);
    const candles = this.chartData.get(symbol);

    if (!card || !candles?.length) return;

    const priceEl = card.querySelector('[data-role="price"]');
    const changeEl = card.querySelector('[data-role="change"]');

    const lastClose = Number(candles[candles.length - 1]?.close);
    const previousClose = Number(candles[candles.length - 2]?.close);

    const livePrice = Number(
      pricePayload?.price ??
        pricePayload?.currentPrice ??
        getLatestPrice(symbol)?.price ??
        lastClose
    );

    if (!Number.isFinite(livePrice)) return;

    const change = livePrice - previousClose;
    const changePercent =
      previousClose > 0 ? (change / previousClose) * 100 : 0;

    if (priceEl) {
      priceEl.textContent = formatCurrency(livePrice);
    }

    if (changeEl) {
      changeEl.textContent =
        `${change >= 0 ? '+' : ''}${formatCurrency(change)} ` +
        `(${changePercent >= 0 ? '+' : ''}${formatPercent(changePercent)})`;

      changeEl.classList.remove(
        'trend-chart-card__change--positive',
        'trend-chart-card__change--negative',
        'trend-chart-card__change--neutral'
      );

      changeEl.classList.add(
        change > 0
          ? 'trend-chart-card__change--positive'
          : change < 0
            ? 'trend-chart-card__change--negative'
            : 'trend-chart-card__change--neutral'
      );
    }
  }

  getDateKey(unixTime) {
    const date = new Date(Number(unixTime) * 1000);

    return date.toISOString().slice(0, 10);
  }

  getTodayDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  applyTrendRegime(symbol, fastMA, slowMA) {
    const card = this.getCard(symbol);
    if (!card) return;

    const regimeEl = card.querySelector('[data-role="regime"]');
    const summaryEl = card.querySelector('[data-role="trend-summary"]');

    const regime = this.getTrendRegime(fastMA, slowMA, 5);

    card.classList.remove(
      'trend-chart-card--strong',
      'trend-chart-card--early',
      'trend-chart-card--weak',
      'trend-chart-card--neutral'
    );

    card.classList.add(regime.className);

    if (regimeEl) {
      regimeEl.className = 'trend-chart-card__regime';
      regimeEl.classList.add(
        `trend-chart-card__regime--${regime.key.toLowerCase()}`
      );
      regimeEl.textContent = regime.label;
    }

    if (summaryEl) {
      summaryEl.textContent = regime.summary;
    }
  }

  updateLiveDailyCandle(symbol, payload) {
    const price = Number(payload?.price ?? payload?.currentPrice);

    if (!(price > 0)) return;

    const candles = this.chartData.get(symbol);
    const series = this.chartSeries.get(symbol);
    const regimeSeries = this.regimeSeries.get(symbol);

    if (!candles?.length || !series) return;

    const lastIndex = candles.length - 1;
    const lastCandle = candles[lastIndex];

    /*
     * Only update the existing current daily candle.
     * Do not append a new daily candle for every live price tick.
     */
    if (this.getDateKey(lastCandle.time) !== this.getTodayDateKey()) {
      return;
    }

    const updatedCandle = {
      ...lastCandle,
      high: Math.max(Number(lastCandle.high), price),
      low: Math.min(Number(lastCandle.low), price),
      close: price,
    };

    candles[lastIndex] = updatedCandle;

    /*
     * Updates the existing current daily candle visually.
     */
    series.candleSeries.update(updatedCandle);

    /*
     * Refresh today's volume bar color, since close vs. open (and therefore
     * up/down) may have flipped intraday.
     */
    if (series.volumeSeries) {
      series.volumeSeries.update({
        time: updatedCandle.time,
        value: Number(updatedCandle.volume ?? 0),
        color:
          updatedCandle.close >= updatedCandle.open
            ? PALETTE.volume.up
            : PALETTE.volume.down,
      });
    }

    /*
     * Recalculate 10 SMA and 20 SMA because today's close changed.
     */
    const fastMA = this.calculateSMA(candles, 10);
    const slowMA = this.calculateSMA(candles, 20);

    series.fastSeries.setData(
      fastMA.filter((item) => Number.isFinite(item.value))
    );

    series.slowSeries.setData(
      slowMA.filter((item) => Number.isFinite(item.value))
    );

    /*
     * Refresh only the last bar's background color, since only today's
     * regime could have changed from the live tick.
     */
    if (regimeSeries) {
      const trendLength = 5;
      const fastNow = fastMA[lastIndex]?.value;
      const slowNow = slowMA[lastIndex]?.value;
      const fastPast = fastMA[lastIndex - trendLength]?.value;
      const slowPast = slowMA[lastIndex - trendLength]?.value;

      const key =
        lastIndex < trendLength
          ? 'INSUFFICIENT_DATA'
          : this.computeRegimeKey(fastNow, slowNow, fastPast, slowPast);

      regimeSeries.update({
        time: updatedCandle.time,
        value: 1,
        color: REGIME_BG_COLORS[key] || TRANSPARENT,
      });
    }

    /*
     * Re-evaluate the ChillLax trend state using the updated MA values.
     */
    this.applyTrendRegime(symbol, fastMA, slowMA);
  }

  subscribeToTrendPrice(symbol) {
    const previousUnsubscribe = this.chartUnsubscribers.get(symbol);

    if (typeof previousUnsubscribe === 'function') {
      previousUnsubscribe();
    }

    const unsubscribe = subscribeToPrice(symbol, (payload) => {
      this.updateTrendQuote(symbol, payload);
      this.updateLiveDailyCandle(symbol, payload);
    });

    this.chartUnsubscribers.set(symbol, unsubscribe);
  }

  observeChartResize() {
    if (!window.ResizeObserver) return;

    this.chartResizeObserver = new ResizeObserver(() => {
      this.charts.forEach((chart, symbol) => {
        const card = this.getCard(symbol);
        const canvas = card?.querySelector('.trend-chart-card__canvas');

        if (!chart || !canvas) return;

        chart.applyOptions({
          width: canvas.clientWidth || 600,
        });
      });
    });

    this.els.chartCards.forEach((card) => {
      this.chartResizeObserver.observe(card);
    });
  }

  destroyTrendCharts() {
    this.chartUnsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });

    this.chartUnsubscribers.clear();

    this.charts.forEach((chart) => {
      chart.remove();
    });

    this.charts.clear();
    this.chartSeries.clear();
    this.regimeSeries.clear();
    this.chartData.clear();

    if (this.chartResizeObserver) {
      this.chartResizeObserver.disconnect();
      this.chartResizeObserver = null;
    }
  }

  destroy() {
    this.destroyTrendCharts();
  }
}

export const trendMapView = new TrendMapView();