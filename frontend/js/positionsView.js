/**
 * Positions View - Full-fledged open positions manager
 */

import { state } from './state.js';
import { formatCurrency, formatPercent } from './utils.js';
import { trimModal } from './trimModal.js';
import { viewManager } from './viewManager.js';
import { wizard } from './wizard.js';
import { subscribeToPrice, getLatestPrice } from './marketStream.js';

class PositionsView {
  constructor() {
    this.elements = {};
    this.currentFilter = 'all';
    this.chart = null;
    this.chartSeries = null;
    this.chartLiveUnsubscribe = null;   // add
    this.chartTicker = null;
    this.chartDirection = null;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.render();

    // Listen for journal changes
    state.on('journalEntryAdded', () => this.render());
    state.on('journalEntryUpdated', () => this.render());
    state.on('journalEntryDeleted', () => this.render());

    // Listen for view changes
    state.on('viewChanged', (data) => {
      if (data.to === 'positions') this.render();
    });
  }

  cacheElements() {
    this.elements = {
      // Header
      positionsCount: document.getElementById('positionsCount'),

      // Risk bar
      riskBar: document.getElementById('positionsRiskBar'),
      openRisk: document.getElementById('positionsOpenRisk'),
      riskLevel: document.getElementById('positionsRiskLevel'),

      // Grid
      grid: document.getElementById('positionsGrid'),

      // Empty state
      empty: document.getElementById('positionsEmpty'),
      goToDashboard: document.getElementById('positionsGoToDashboard'),

      // Filter buttons
      filterButtons: document.querySelectorAll('.positions-view .filter-btn'),
      addTradeBtn: document.getElementById('positionsAddTradeBtn'),
      emptyAddTradeBtn: document.getElementById('positionsEmptyAddTradeBtn'),
      addModal: document.getElementById('positionsAddTradeModal'),
      addOverlay: document.getElementById('positionsAddTradeOverlay'),
      addClose: document.getElementById('positionsAddTradeClose'),
      addCancel: document.getElementById('positionsAddTradeCancel'),
      addSave: document.getElementById('positionsAddTradeSave'),

      addTicker: document.getElementById('positionsAddTicker'),
      addEntry: document.getElementById('positionsAddEntry'),
      addStop: document.getElementById('positionsAddStop'),
      addTarget: document.getElementById('positionsAddTarget'),
      addShares: document.getElementById('positionsAddShares'),

      previewShares: document.getElementById('positionsAddPreviewShares'),
      previewPosition: document.getElementById('positionsAddPreviewPosition'),
      previewRisk: document.getElementById('positionsAddPreviewRisk'),
      previewRiskPercent: document.getElementById('positionsAddPreviewRiskPercent'),
      previewStopDistance: document.getElementById('positionsAddPreviewStopDistance'),
      previewPerShare: document.getElementById('positionsAddPreviewPerShare'),
      chartModal: document.getElementById('positionChartModal'),
      chartOverlay: document.getElementById('positionChartOverlay'),
      chartClose: document.getElementById('positionChartClose'),
      chartTitle: document.getElementById('positionChartTitle'),
      chartSubtitle: document.getElementById('positionChartSubtitle'),
      chartLegend: document.getElementById('positionChartLegend'),
      chartCanvas: document.getElementById('positionChartCanvas')
    };
  }

  bindEvents() {
    if (this.elements.goToDashboard) {
      this.elements.goToDashboard.addEventListener('click', () => {
        viewManager.navigateTo('dashboard');
      });
    }

    this.elements.filterButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.currentTarget.dataset.filter);
      });
    });

    if (this.elements.addTradeBtn) {
      this.elements.addTradeBtn.addEventListener('click', () => {
        this.openAddTradeModal();
      });
    }

    if (this.elements.emptyAddTradeBtn) {
      this.elements.emptyAddTradeBtn.addEventListener('click', () => {
        this.openAddTradeModal();
      });
    }

    if (this.elements.addClose) {
      this.elements.addClose.addEventListener('click', () => {
        this.closeAddTradeModal();
      });
    }

    if (this.elements.addCancel) {
      this.elements.addCancel.addEventListener('click', () => {
        this.closeAddTradeModal();
      });
    }

    if (this.elements.addOverlay) {
      this.elements.addOverlay.addEventListener('click', () => {
        this.closeAddTradeModal();
      });
    }



    const numericInputs = [
      this.elements.addEntry,
      this.elements.addStop,
      this.elements.addTarget,
      this.elements.addShares
    ];

    numericInputs.forEach((el) => {
      if (!el) return;

      el.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9.]/g, '');
        this.updateAddTradePreview();
      });
    });

    if (this.elements.addTicker) {
      this.elements.addTicker.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      });
    }

    if (this.elements.addSave) {
      this.elements.addSave.addEventListener('click', () => {
        this.startWizardFromPositions();
      });
    }

    if (this.elements.chartClose) {
      this.elements.chartClose.addEventListener('click', () => this.closeChartModal());
    }

    if (this.elements.chartOverlay) {
      this.elements.chartOverlay.addEventListener('click', () => this.closeChartModal());
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      if (this.elements.addModal?.classList.contains('open')) {
        this.closeAddTradeModal();
      }

      if (this.elements.chartModal?.classList.contains('open')) {
        this.closeChartModal();
      }
    });
  }




  setFilter(filter) {
    this.currentFilter = filter;

    // Update active button state
    this.elements.filterButtons.forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
    });

    this.render();
  }



  openAddTradeModal() {
    if (!this.elements.addModal) return;

    if (this.elements.addTicker) this.elements.addTicker.value = '';
    if (this.elements.addEntry) this.elements.addEntry.value = '';
    if (this.elements.addStop) this.elements.addStop.value = '';
    if (this.elements.addTarget) this.elements.addTarget.value = '';
    if (this.elements.addShares) this.elements.addShares.value = '';



    this.updateAddTradePreview();

    this.elements.addModal.classList.add('open');
    this.elements.addModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      this.elements.addEntry?.focus();
    });
  }

  closeAddTradeModal() {
    if (!this.elements.addModal) return;

    this.elements.addModal.classList.remove('open');
    this.elements.addModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  getAddTradeFormData() {
    const entry = Number(this.elements.addEntry?.value || 0);
    const stop = Number(this.elements.addStop?.value || 0);

    let direction = 'long';
    if (entry > 0 && stop > 0) {
      direction = stop > entry ? 'short' : 'long';
    }

    return {
      ticker: this.elements.addTicker?.value.trim().toUpperCase() || '',
      direction,
      entry,
      stop,
      target: this.elements.addTarget?.value ? Number(this.elements.addTarget.value) : null,
      shares: Number(this.elements.addShares?.value || 0)
    };
  }



  openChartModal(tradeId) {
  const trade = state.journal.entries.find(t => String(t.id) === String(tradeId));
  if (!trade || !this.elements.chartModal) return;

  console.log('[positions] openChartModal', {
    tradeId,
    trade,
  });

  this.renderChartModal(trade);

  console.log('[positions] after renderChartModal', {
    chartExists: !!this.chart,
    chartSeriesExists: !!this.chartSeries,
  });

  this.startLiveChartFeed(trade);

  this.elements.chartModal.classList.add('open');
  this.elements.chartModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

  closeChartModal() {
    if (!this.elements.chartModal) return;

    // stop live price updates
    this.stopLiveChartFeed();

    this.elements.chartModal.classList.remove('open');
    this.elements.chartModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }


  getTradeChartLevels(trade) {
    const entry = Number(trade.entry ?? trade.entry_price ?? 0);
    const stop = Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0);
    const target = trade.target != null ? Number(trade.target) : null;
    const direction = trade.direction ?? (stop > entry ? 'short' : 'long');

    const riskPerShare = Math.abs(entry - stop);
    const fiveR = direction === 'short'
      ? entry - (riskPerShare * 5)
      : entry + (riskPerShare * 5);

    const values = [entry, stop, fiveR];
    if (target != null) values.push(target);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.12 || 1;

    const chartMin = min - padding;
    const chartMax = max + padding;
    const chartRange = Math.max(chartMax - chartMin, 0.0001);

    const toPercent = (value) => ((value - chartMin) / chartRange) * 100;

    return {
      direction,
      entry,
      stop,
      target,
      fiveR,
      chartMin,
      chartMax,
      entryPos: toPercent(entry),
      stopPos: toPercent(stop),
      targetPos: target != null ? toPercent(target) : null,
      fiveRPos: toPercent(fiveR),
    };
  }

renderChartModal(trade) {
  const entry = Number(trade.entry ?? trade.entry_price ?? 0);
  const stop = Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0);

  const rawTarget = trade.target ?? trade.target_price ?? null;
  const target =
    rawTarget === null || rawTarget === undefined || rawTarget === ''
      ? null
      : Number(rawTarget);

  const direction = trade.direction ?? (stop > entry ? 'short' : 'long');
  const riskPerShare = Math.abs(entry - stop);
  
  const fiveR = direction === 'short'
    ? entry - (riskPerShare * 5)
    : entry + (riskPerShare * 5);

  if (this.elements.chartTitle) {
    this.elements.chartTitle.textContent = `${trade.ticker} Chart`;
  }

  this.chartDirection = direction.toUpperCase();

const liveSnapshot = getLatestPrice(trade.ticker);
const livePrice = Number(
  liveSnapshot?.price ??
  trade.currentPrice ??
  trade.livePrice ??
  NaN
);

if (this.elements.chartSubtitle) {
  this.elements.chartSubtitle.textContent = Number.isFinite(livePrice)
    ? `${this.chartDirection} position • Live ${formatCurrency(livePrice)}`
    : `${this.chartDirection} position • Waiting for live price`;
}

  if (this.elements.chartLegend) {
    this.elements.chartLegend.innerHTML = `
      <div class="position-chart-legend__item">
        <span class="position-chart-legend__dot position-chart-legend__dot--entry"></span>
        <span>Entry: ${formatCurrency(entry)}</span>
      </div>
      <div class="position-chart-legend__item">
        <span class="position-chart-legend__dot position-chart-legend__dot--stop"></span>
        <span>Stop: ${formatCurrency(stop)}</span>
      </div>
      ${target !== null && Number.isFinite(target) ? `
      <div class="position-chart-legend__item">
        <span class="position-chart-legend__dot position-chart-legend__dot--target"></span>
        <span>Target: ${formatCurrency(target)}</span>
      </div>
      ` : ''}
      <div class="position-chart-legend__item">
        <span class="position-chart-legend__dot position-chart-legend__dot--five-r"></span>
        <span>5R: ${formatCurrency(fiveR)}</span>
      </div>
    `;
  }

  if (!this.elements.chartCanvas || !window.LightweightCharts) return;

  if (this.chart) {
    this.chart.remove();
    this.chart = null;
    this.chartSeries = null;
  }

  this.elements.chartCanvas.innerHTML = '';

  const chart = window.LightweightCharts.createChart(this.elements.chartCanvas, {
    width: this.elements.chartCanvas.clientWidth || 700,
    height: 360,
    layout: {
      background: { color: '#121722' },
      textColor: 'rgba(255,255,255,0.82)',
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.05)' },
      horzLines: { color: 'rgba(255,255,255,0.05)' },
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      autoScale: false,
      scaleMargins: { top: 0.20, bottom: 0.20 },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      timeVisible: true,
      secondsVisible: true,
      rightOffset: 8,
      barSpacing: 14,
    },
    crosshair: {
      vertLine: { color: 'rgba(255,255,255,0.15)' },
      horzLine: { color: 'rgba(255,255,255,0.15)' },
    },
    localization: {
      priceFormatter: (price) => Number(price).toFixed(2),
    },
  });

  const { LineSeries } = window.LightweightCharts;

  const series = chart.addSeries(LineSeries, {
    color: '#22d3ee',
    lineWidth: 2,
    lineVisible: true,
    pointMarkersVisible: false,
    crosshairMarkerVisible: true,
    priceLineVisible: false,
    lastValueVisible: true,
  });

 const seedPrice = Number(
  livePrice ??
  trade.currentPrice ??
  trade.livePrice ??
  trade.entry ??
  trade.entry_price ??
  0
);

  const now = Math.floor(Date.now() / 1000);
  const initialPrice = seedPrice > 0 ? seedPrice : entry;

  const levelValues = [initialPrice, entry, stop, fiveR];
  if (target !== null && Number.isFinite(target)) {
    levelValues.push(target);
  }

  const minLevel = Math.min(...levelValues);
  const maxLevel = Math.max(...levelValues);
  const rangePadding = Math.max(
    (maxLevel - minLevel) * 0.15,
    Math.abs(initialPrice || 1) * 0.002,
    0.5
  );

  const visibleMin = minLevel - rangePadding;
  const visibleMax = maxLevel + rangePadding;

  // ONE honest starting point, no fake history
  series.setData([
    { time: now, value: initialPrice },
  ]);

  chart.priceScale('right').applyOptions({
    autoScale: false,
    scaleMargins: { top: 0.20, bottom: 0.20 },
  });

  series.applyOptions({
    autoscaleInfoProvider: () => ({
      priceRange: {
        minValue: visibleMin,
        maxValue: visibleMax,
      },
    }),
  });

  // Horizontal price lines for levels
  series.createPriceLine({
    price: entry,
    color: '#60a5fa',
    lineWidth: 2,
    lineStyle: 0,
    axisLabelVisible: true,
    title: 'Entry',
  });

  series.createPriceLine({
    price: stop,
    color: '#f87171',
    lineWidth: 2,
    lineStyle: 2,
    axisLabelVisible: true,
    title: 'Stop',
  });

  if (target !== null && Number.isFinite(target)) {
    series.createPriceLine({
      price: target,
      color: '#34d399',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Target',
    });
  }

  series.createPriceLine({
    price: fiveR,
    color: '#fbbf24',
    lineWidth: 2,
    lineStyle: 1,
    axisLabelVisible: true,
    title: '5R',
  });

  chart.timeScale().fitContent();

  this.chart = chart;
  this.chartSeries = series;
  this.chartLastTime = now;
  this.chartMinVisiblePrice = visibleMin;
  this.chartMaxVisiblePrice = visibleMax;

  requestAnimationFrame(() => {
    if (!this.chart || !this.elements.chartCanvas) return;

    this.chart.applyOptions({
      width: this.elements.chartCanvas.clientWidth || 700,
    });
  });
}


  startLiveChartFeed(trade) {
  this.stopLiveChartFeed();

  const ticker = String(trade.ticker || '').toUpperCase();
  if (!ticker || !this.chart || !this.chartSeries) return;

  this.chartTicker = ticker;

  this.chartLiveUnsubscribe = subscribeToPrice(ticker, (payload) => {
    this.handleLiveChartPrice(payload);
  });

  console.log('[positions] subscribed chart feed for', ticker);
}

  stopLiveChartFeed() {
    if (typeof this.chartLiveUnsubscribe === 'function') {
      this.chartLiveUnsubscribe();
    }
    this.chartLiveUnsubscribe = null;
this.chartTicker = null;
this.chartDirection = null;
  }


handleLiveChartPrice(payload) {
  if (!this.chart || !this.chartSeries) return;

  const symbol = String(payload.symbol || '').toUpperCase();
  if (!symbol || symbol !== this.chartTicker) return;

  const price = Number(payload.price);
if (!(price > 0)) return;

if (this.elements.chartSubtitle) {
  this.elements.chartSubtitle.textContent =
    `${this.chartDirection || 'LONG'} position • Live ${formatCurrency(price)}`;
}

const now = Math.floor(Date.now() / 1000);
  const nextTime = Math.max(now, (this.chartLastTime || now - 1) + 1);

  this.chartSeries.update({
    time: nextTime,
    value: price,
  });

  this.chartLastTime = nextTime;

  if (
    Number.isFinite(this.chartMinVisiblePrice) &&
    Number.isFinite(this.chartMaxVisiblePrice)
  ) {
    const nextMin = Math.min(this.chartMinVisiblePrice, price);
    const nextMax = Math.max(this.chartMaxVisiblePrice, price);

    if (nextMin !== this.chartMinVisiblePrice || nextMax !== this.chartMaxVisiblePrice) {
      const pad = Math.max((nextMax - nextMin) * 0.12, price * 0.002, 0.5);
      this.chartMinVisiblePrice = nextMin;
      this.chartMaxVisiblePrice = nextMax;

      this.chart.priceScale('right').applyOptions({
        autoScale: false,
        scaleMargins: { top: 0.20, bottom: 0.20 },
      });

      this.chartSeries.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: nextMin - pad,
            maxValue: nextMax + pad,
          },
        }),
      });
    }
  }
}

  updateAddTradePreview() {
    const { direction, entry, stop, shares } = this.getAddTradeFormData();
    const accountSize = Number(state.account.currentSize || 0);

    let stopPerShare = 0;

    if (direction === 'short') {
      stopPerShare = stop > entry ? stop - entry : 0;
    } else {
      stopPerShare = entry > stop ? entry - stop : 0;
    }

    const actualRiskDollars = shares > 0 ? shares * stopPerShare : 0;
    const actualRiskPercent = accountSize > 0
      ? (actualRiskDollars / accountSize) * 100
      : 0;

    const positionSize = shares > 0 ? shares * entry : 0;
    const stopDistancePercent = entry > 0 && stopPerShare > 0
      ? (stopPerShare / entry) * 100
      : 0;

    if (this.elements.previewShares) {
      this.elements.previewShares.textContent = String(shares || 0);
    }

    if (this.elements.previewPosition) {
      this.elements.previewPosition.textContent = formatCurrency(positionSize);
    }

    if (this.elements.previewRisk) {
      this.elements.previewRisk.textContent = formatCurrency(actualRiskDollars);
    }

    if (this.elements.previewRiskPercent) {
      this.elements.previewRiskPercent.textContent = `${formatPercent(actualRiskPercent)} of account`;
    }

    if (this.elements.previewStopDistance) {
      this.elements.previewStopDistance.textContent = formatPercent(stopDistancePercent);
    }

    if (this.elements.previewPerShare) {
      this.elements.previewPerShare.textContent = `${formatCurrency(stopPerShare)}/share`;
    }
  }
  startWizardFromPositions() {
    const { ticker, direction, entry, stop, target, shares } = this.getAddTradeFormData();
    const accountSize = Number(state.account.currentSize || 0);

    if (!(entry > 0)) {
      alert('Enter a valid entry price');
      return;
    }

    if (!(stop > 0)) {
      alert('Enter a valid stop loss');
      return;
    }

    if (!(shares > 0)) {
      alert('Enter a valid number of shares');
      return;
    }

    if (stop === entry) {
      alert('Stop loss must be different from entry');
      return;
    }

    if (direction === 'long' && stop >= entry) {
      alert('For a long trade, stop must be below entry');
      return;
    }

    if (direction === 'short' && stop <= entry) {
      alert('For a short trade, stop must be above entry');
      return;
    }

    if (target !== null) {
      if (direction === 'long' && target <= entry) {
        alert('For a long trade, target should be above entry');
        return;
      }
      if (direction === 'short' && target >= entry) {
        alert('For a short trade, target should be below entry');
        return;
      }
    }

    const stopPerShare = Math.abs(entry - stop);
    const positionSize = shares * entry;
    const stopDistance = entry > 0 ? (stopPerShare / entry) * 100 : 0;
    const actualRiskDollars = shares * stopPerShare;
    const actualRiskPercent = accountSize > 0
      ? (actualRiskDollars / accountSize) * 100
      : 0;

    state.updateTrade({
      ticker,
      direction,
      entry,
      stop,
      target,
      notes: ''
    });

    state.updateResults({
      shares,
      positionSize,
      riskDollars: actualRiskDollars,
      actualRiskDollars,
      stopDistance,
      stopPerShare,
      target,
      direction,
      actualRiskPercent
    });



    this.closeAddTradeModal();
    wizard.open();
  }







  getFilteredPositions() {
    const activeTrades = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    );

    switch (this.currentFilter) {
      case 'open':
        return activeTrades.filter(t => t.status === 'open');
      case 'trimmed':
        return activeTrades.filter(t => t.status === 'trimmed');
      default:
        return activeTrades;
    }
  }







  render() {
    const positions = this.getFilteredPositions();
    const allActiveCount = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    ).length;

    // Update count
    if (this.elements.positionsCount) {
      this.elements.positionsCount.textContent = `${allActiveCount} active position${allActiveCount !== 1 ? 's' : ''}`;
    }

    // Render risk bar
    this.renderRiskBar();

    // Show empty state or grid
    if (positions.length === 0) {
      this.showEmptyState();
    } else {
      this.hideEmptyState();
      this.renderGrid(positions);
    }
  }

  renderRiskBar() {
    const activeTrades = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    );

    if (activeTrades.length === 0) {
      if (this.elements.openRisk) {
        this.elements.openRisk.textContent = '$0.00';
      }
      if (this.elements.riskLevel) {
        this.elements.riskLevel.textContent = 'CASH';
        this.elements.riskLevel.className = 'positions-risk-bar__value positions-risk-bar__value--indicator';
        // Reset any inline styles
        this.elements.riskLevel.style.display = 'inline-block';
      }
      return;
    }

    // Calculate NET risk (remaining risk minus realized profit for trimmed trades)
    const totalRisk = activeTrades.reduce((sum, t) => {
      const shares = Number(t.remainingShares ?? t.remaining_shares ?? t.shares ?? 0);
      const activeStop = Number(t.currentStop ?? t.current_stop ?? t.stop ?? t.stop_price ?? 0);
      const entry = Number(t.entry ?? t.entry_price ?? 0);
      const direction = t.direction ?? (activeStop > entry ? 'short' : 'long');

      const riskPerShare =
        direction === 'short'
          ? Math.max(0, activeStop - entry)
          : Math.max(0, entry - activeStop);

      const grossRisk = shares * riskPerShare;

      const realizedPnL = Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? 0);
      const isTrimmed = t.status === 'trimmed';
      const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;

      return sum + netRisk;
    }, 0);

    const accountSize = Number(state.account.currentSize ?? 0);
    const riskPercent = accountSize > 0 ? (totalRisk / accountSize) * 100 : 0;

    // Determine risk level
    let level = 'LOW';
    let levelClass = '';
    if (riskPercent > 2) {
      level = 'HIGH';
      levelClass = 'risk-high';
    } else if (riskPercent > 0.5) {
      level = 'MEDIUM';
      levelClass = 'risk-medium';
    }

    if (this.elements.openRisk) {
      this.elements.openRisk.textContent = `${formatCurrency(totalRisk)} (${formatPercent(riskPercent)})`;
    }

    if (this.elements.riskLevel) {
      this.elements.riskLevel.textContent = level;
      this.elements.riskLevel.className = `positions-risk-bar__value positions-risk-bar__value--indicator ${levelClass}`;
    }
  }

  renderGrid(positions) {
    if (!this.elements.grid) return;

    this.elements.grid.innerHTML = positions.map(trade => {
      const shares = Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0);
      const originalShares = Number(trade.originalShares ?? trade.original_shares ?? trade.shares ?? 0);
      const entry = Number(trade.entry ?? trade.entry_price ?? 0);
      const activeStop = Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0);
      const direction = trade.direction ?? (activeStop > entry ? 'short' : 'long');

      const riskPerShare =
        direction === 'short'
          ? Math.max(0, activeStop - entry)
          : Math.max(0, entry - activeStop);

      const grossRisk = shares * riskPerShare;
      const isTrimmed = trade.status === 'trimmed';
      const realizedPnL = Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? 0);

      // For trimmed trades, calculate NET risk (remaining risk - realized profit)
      const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;
      const accountSize = Number(state.account.currentSize || 0);
      const riskPercent = accountSize > 0 ? (netRisk / accountSize) * 100 : 0;

      // Check if trade is "free rolled" - realized profit covers remaining risk
      const isFreeRoll = isTrimmed && realizedPnL >= (grossRisk - 0.01);

      // Determine status
      let statusClass = trade.status;
      let statusText = 'Open';
      if (isFreeRoll) {
        statusClass = 'freeroll';
        statusText = 'Free Rolled';
      } else if (isTrimmed) {
        statusText = 'Trimmed';
      }

      return `
        <div class="position-card ${isTrimmed ? 'position-card--trimmed' : ''}" data-id="${trade.id}">
          <div class="position-card__header">
            <span class="position-card__ticker">${trade.ticker}</span>
            <span class="position-card__status position-card__status--${statusClass}">
              ${statusText}
            </span>
          </div>

          <div class="position-card__details">
          <div class="position-card__detail">
    <span class="position-card__detail-label">Direction</span>
    <span class="position-card__detail-value">${direction.toUpperCase()}</span>
  </div>
            <div class="position-card__detail">
              <span class="position-card__detail-label">Shares</span>
              <span class="position-card__detail-value">${shares}${isTrimmed ? ` / ${originalShares}` : ''}</span>
            </div>
            <div class="position-card__detail">
              <span class="position-card__detail-label">Entry</span>
              <span class="position-card__detail-value">${formatCurrency(trade.entry)}</span>
            </div>
            <div class="position-card__detail">
              <span class="position-card__detail-label">Stop</span>
              <span class="position-card__detail-value">${formatCurrency(activeStop)}</span>
            </div>
            ${trade.target ? `
            <div class="position-card__detail">
              <span class="position-card__detail-label">Target</span>
              <span class="position-card__detail-value">${formatCurrency(trade.target)}</span>
            </div>
            ` : ''}
          </div>

          <div class="position-card__risk">
            <div class="position-card__risk-row">
              <span class="position-card__risk-label">Open Risk</span>
              <span class="position-card__risk-value">${formatCurrency(netRisk)} (${formatPercent(riskPercent)})</span>
            </div>
            ${isTrimmed ? `
            <div class="position-card__risk-row position-card__realized">
              <span class="position-card__risk-label">Realized P&L</span>
              <span class="position-card__risk-value position-card__realized-value ${realizedPnL >= 0 ? '' : 'text-danger'}">${realizedPnL >= 0 ? '+' : ''}${formatCurrency(realizedPnL)}</span>
            </div>
            ` : ''}
          </div>

          <div class="position-card__actions">
  <button class="position-card__btn position-card__btn--primary" data-action="close" data-id="${trade.id}">
    ${isTrimmed ? 'Trim More' : 'Close / Trim'}
  </button>
  <button class="position-card__btn position-card__btn--secondary" data-action="chart" data-id="${trade.id}">
    View Chart
  </button>
  <button class="position-card__btn position-card__btn--danger" data-action="delete" data-id="${trade.id}">
    Delete
  </button>
</div>
        </div>
      `;
    }).join('');

    // Bind action buttons
    this.bindCardActions();
  }

  bindCardActions() {
    this.elements.grid.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        trimModal.open(id);
      });
    });

    this.elements.grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('Delete this trade?')) {
          state.deleteJournalEntry(id);
        }
      });
    });

    this.elements.grid.querySelectorAll('[data-action="chart"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.openChartModal(id);
      });
    });
  }

  showEmptyState() {
    if (this.elements.grid) {
      this.elements.grid.style.display = 'none';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.add('positions-empty--visible');
    }
  }

  hideEmptyState() {
    if (this.elements.grid) {
      this.elements.grid.style.display = '';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.remove('positions-empty--visible');
    }
  }
}

export const positionsView = new PositionsView();
export { PositionsView };
