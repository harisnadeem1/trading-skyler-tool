/**
 * Stats - Trading statistics calculations and DOM rendering
 */

import { state } from './state.js';

class Stats {
  constructor() {
    this.elements = {};
    this.stats = {};
  }

  init() {
    this.elements = {
      openPositions: document.getElementById('statOpenPositions'),
      openRisk: document.getElementById('statOpenRisk'),
      totalPnL: document.getElementById('statTotalPnL'),
      pnlCard: document.getElementById('statPnLCard'),
      pnlTrades: document.getElementById('statPnLTrades'),
      winRate: document.getElementById('statWinRate'),
      winLoss: document.getElementById('statWinLoss'),
      sharpe: document.getElementById('statSharpe'),
      currentAccount: document.getElementById('statCurrentAccount'),
      accountChange: document.getElementById('statAccountChange'),
      tradingGrowth: document.getElementById('statTradingGrowth'),
      tradingGrowthCard: document.getElementById('statTradingGrowthCard'),
      totalGrowth: document.getElementById('statTotalGrowth'),
      totalGrowthCard: document.getElementById('statTotalGrowthCard'),
      cashFlow: document.getElementById('statCashFlow'),
      chartValue: document.getElementById('statChartValue'),
      equityChartCanvas: document.getElementById('equityChartCanvas'),
      equityChartEmpty: document.getElementById('equityChartEmpty')
    };

    state.on('journalEntryAdded', () => this.refresh());
    state.on('journalEntryUpdated', () => this.refresh());
    state.on('journalEntryDeleted', () => this.refresh());
    state.on('settingsChanged', () => this.refresh());
    state.on('accountChanged', () => this.refresh());
    state.on('viewChanged', (data) => {
      if (data.to === 'stats') this.refresh();
    });

    this.refresh();
  }

  refresh() {
    this.calculate();
    this.render();
  }

  calculate() {
    const entries = state.journal.entries || [];
    const settings = state.settings || {};
    const account = state.account || {};

    const activeTrades = entries.filter((e) => e.status === 'open' || e.status === 'trimmed');

    const openRiskTotal = activeTrades.reduce((sum, t) => {
      const shares = Number(t.remainingShares ?? t.remaining_shares ?? t.shares ?? 0);
      const entryPrice = Number(t.entry ?? t.entry_price ?? 0);
      const stopPrice = Number(t.currentStop ?? t.current_stop ?? t.stop ?? t.stop_price ?? 0);
      const direction = t.direction ?? (stopPrice > entryPrice ? 'short' : 'long');

      const riskPerShare =
        direction === 'short'
          ? Math.max(0, stopPrice - entryPrice)
          : Math.max(0, entryPrice - stopPrice);

      const grossRisk = shares * riskPerShare;
      const realizedPnL = Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? 0);
      const isTrimmed = t.status === 'trimmed';
      const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;

      return sum + Math.max(0, netRisk);
    }, 0);

    const realizedTrades = entries.filter(
      (e) =>
        e.status === 'closed' ||
        e.status === 'trimmed' ||
        Number(e.totalRealizedPnL ?? e.total_realized_pnl ?? e.pnl ?? 0) !== 0
    );

    const totalPnL = realizedTrades.reduce(
      (sum, t) => sum + Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0),
      0
    );

    const wins = realizedTrades.filter(
      (t) => Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0) > 0
    );
    const losses = realizedTrades.filter(
      (t) => Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0) < 0
    );

    const winRate = realizedTrades.length > 0 ? (wins.length / realizedTrades.length) * 100 : null;
    const sharpe = this.calculateSharpe(realizedTrades);

    const startingAccount = Number(settings.startingAccountSize ?? 0);
    const currentAccount = Number(account.currentSize ?? settings.currentAccountSize ?? startingAccount);

    const tradingGrowth = startingAccount > 0 ? (totalPnL / startingAccount) * 100 : 0;
    const totalGrowth = startingAccount > 0 ? ((currentAccount - startingAccount) / startingAccount) * 100 : 0;
    const netCashFlow = currentAccount - startingAccount - totalPnL;

    this.stats = {
      openPositions: activeTrades.length,
      openRiskTotal,
      closedTradeCount: realizedTrades.length,
      totalPnL,
      wins: wins.length,
      losses: losses.length,
      winRate,
      sharpe,
      startingAccount,
      currentAccount,
      tradingGrowth,
      totalGrowth,
      netCashFlow
    };

    return this.stats;
  }

  calculateSharpe(realizedTrades) {
    if (!realizedTrades || realizedTrades.length < 2) return null;

    const returns = realizedTrades
      .map((t) => {
        const pnl = Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0);
        const positionSize = Number(t.positionSize ?? t.position_size ?? 0);
        if (!positionSize) return null;
        return (pnl / positionSize) * 100;
      })
      .filter((v) => v !== null && Number.isFinite(v));

    if (returns.length < 2) return null;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;
    return mean / stdDev;
  }

  render() {
    const s = this.stats;

    if (this.elements.openPositions) {
      this.elements.openPositions.textContent = s.openPositions;
    }

    if (this.elements.openRisk) {
      this.elements.openRisk.textContent = `$${this.formatCurrency(s.openRiskTotal)} at risk`;
    }

    if (this.elements.totalPnL) {
      this.elements.totalPnL.textContent = this.formatSignedCurrency(s.totalPnL);

      const isPositive = s.totalPnL > 0;
      const isNegative = s.totalPnL < 0;

      this.elements.pnlCard?.classList.toggle('stat-card--success', isPositive);
      this.elements.pnlCard?.classList.toggle('stat-card--danger', isNegative);
    }

    if (this.elements.pnlTrades) {
      this.elements.pnlTrades.textContent = `${s.closedTradeCount} realized trade${s.closedTradeCount !== 1 ? 's' : ''}`;
    }

    if (this.elements.winRate) {
      this.elements.winRate.textContent = s.winRate !== null ? `${s.winRate.toFixed(1)}%` : '—';
    }

    if (this.elements.winLoss) {
      const winText = `${s.wins} win${s.wins !== 1 ? 's' : ''}`;
      const lossText = `${s.losses} loss${s.losses !== 1 ? 'es' : ''}`;
      this.elements.winLoss.textContent = `${winText} · ${lossText}`;
    }

    if (this.elements.sharpe) {
      this.elements.sharpe.textContent = s.sharpe !== null ? s.sharpe.toFixed(2) : '—';
    }

    if (this.elements.currentAccount) {
      this.elements.currentAccount.textContent = `$${this.formatCurrency(s.currentAccount)}`;
    }

    if (this.elements.accountChange) {
      const change = s.currentAccount - s.startingAccount;
      this.elements.accountChange.textContent = `${this.formatSignedCurrency(change)} from start`;
    }

    if (this.elements.tradingGrowth) {
      this.elements.tradingGrowth.textContent = this.formatSignedPercent(s.tradingGrowth);

      const isPositive = s.tradingGrowth > 0;
      const isNegative = s.tradingGrowth < 0;

      this.elements.tradingGrowthCard?.classList.toggle('stat-card--success', isPositive);
      this.elements.tradingGrowthCard?.classList.toggle('stat-card--danger', isNegative);
    }

    if (this.elements.totalGrowth) {
      this.elements.totalGrowth.textContent = this.formatSignedPercent(s.totalGrowth);

      const isPositive = s.totalGrowth > 0;
      const isNegative = s.totalGrowth < 0;

      this.elements.totalGrowthCard?.classList.toggle('stat-card--success', isPositive);
      this.elements.totalGrowthCard?.classList.toggle('stat-card--danger', isNegative);
    }

    if (this.elements.cashFlow) {
      this.elements.cashFlow.textContent = this.formatSignedCurrency(s.netCashFlow);
    }

    if (this.elements.chartValue) {
      this.elements.chartValue.textContent = `$${this.formatCurrency(s.currentAccount)}`;
    }
  }

  formatNumber(num) {
    return Math.abs(Number(num || 0)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  formatCurrency(num) {
    return Number(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  formatSignedCurrency(num) {
    const value = Number(num || 0);
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  formatSignedPercent(num) {
    const value = Number(num || 0);
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${Math.abs(value).toFixed(2)}%`;
  }

  buildEquityCurve() {
    const entries = state.journal.entries || [];
    const startingBalance = Number(state.settings.startingAccountSize ?? 0);

    const realizedTrades = entries
      .filter(
        (e) =>
          e.status === 'closed' ||
          e.status === 'trimmed' ||
          Number(e.totalRealizedPnL ?? e.total_realized_pnl ?? e.pnl ?? 0) !== 0
      )
      .map((t) => ({
        date: t.exitDate || t.exit_date || t.timestamp || t.opened_at || t.created_at,
        pnl: Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0),
        ticker: t.ticker
      }))
      .filter((t) => t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (realizedTrades.length === 0) {
      return [];
    }

    let balance = startingBalance;
    const firstDate = new Date(realizedTrades[0].date).getTime();

    const dataPoints = [
      {
        date: firstDate - 86400000,
        balance: startingBalance,
        pnl: 0,
        ticker: 'Start'
      }
    ];

    realizedTrades.forEach((trade) => {
      balance += trade.pnl;
      dataPoints.push({
        date: new Date(trade.date).getTime(),
        balance,
        pnl: trade.pnl,
        ticker: trade.ticker
      });
    });

    return dataPoints;
  }

  renderEquityCurve() {
    const canvas = this.elements.equityChartCanvas;
    const empty = this.elements.equityChartEmpty;
    if (!canvas) return;

    const data = this.buildEquityCurve();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const rootStyles = getComputedStyle(document.documentElement);
    const bg = rootStyles.getPropertyValue('--ronin-bg').trim() || '#F6F1E7';
    const lineColor = rootStyles.getPropertyValue('--ronin-chart-line').trim() || '#3A3A3A';
    const highlightColor = rootStyles.getPropertyValue('--ronin-gold').trim() || '#9E7B3B';
    const drawdownColor = rootStyles.getPropertyValue('--ronin-stop').trim() || '#6A4B3C';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (!data.length) {
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (empty) empty.style.display = 'none';

    const pad = 28;
    const values = data.map((d) => d.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);

    const gridColor = 'rgba(217, 207, 188, 0.35)';
    const x0 = pad;
    const y0 = pad;
    const chartW = width - pad * 2;
    const chartH = height - pad * 2;

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let i = 0; i < 4; i += 1) {
      const y = y0 + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + chartW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const points = data.map((d, i) => {
      const x = x0 + (chartW * i) / Math.max(1, data.length - 1);
      const y = y0 + chartH - ((d.balance - min) / range) * chartH;
      return { x, y, balance: d.balance };
    });

    if (points.length > 1) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpX = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
      }
      ctx.stroke();

      const peak = points.reduce((best, p) => (p.balance > best.balance ? p : best), points[0]);
      ctx.fillStyle = highlightColor;
      ctx.beginPath();
      ctx.arc(peak.x, peak.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      const last = points[points.length - 1];
      ctx.fillStyle = drawdownColor;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  getStats() {
    return this.stats;
  }
}

export const stats = new Stats();
export { Stats };
