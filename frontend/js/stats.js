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

      chartValue: document.getElementById('statChartValue')
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

    const activeTrades = entries.filter(
      (e) => e.status === 'open' || e.status === 'trimmed'
    );

    const openRiskTotal = activeTrades.reduce((sum, t) => {
      const shares = Number(t.remainingShares ?? t.remaining_shares ?? t.shares ?? 0);
      const entryPrice = Number(t.entry ?? t.entry_price ?? 0);
      const stopPrice = Number(
        t.currentStop ?? t.current_stop ?? t.stop ?? t.stop_price ?? 0
      );
      const grossRisk = shares * (entryPrice - stopPrice);
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

    const totalPnL = realizedTrades.reduce((sum, t) => {
      return sum + Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0);
    }, 0);

    const wins = realizedTrades.filter(
      (t) => Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0) > 0
    );
    const losses = realizedTrades.filter(
      (t) => Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0) < 0
    );

    const winRate =
      realizedTrades.length > 0 ? (wins.length / realizedTrades.length) * 100 : null;

    const sharpe = this.calculateSharpe(realizedTrades);

    const startingAccount = Number(settings.startingAccountSize ?? 0);
    const currentAccount = Number(
      account.currentSize ?? settings.currentAccountSize ?? startingAccount
    );

    const tradingGrowth =
      startingAccount > 0 ? (totalPnL / startingAccount) * 100 : 0;

    const totalGrowth =
      startingAccount > 0
        ? ((currentAccount - startingAccount) / startingAccount) * 100
        : 0;

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
      this.elements.openRisk.textContent = `$${this.formatNumber(s.openRiskTotal)} at risk`;
    }

    if (this.elements.totalPnL) {
      const isPositive = s.totalPnL >= 0;
      this.elements.totalPnL.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(s.totalPnL)}`;
      this.elements.pnlCard?.classList.toggle(
        'stat-card--success',
        isPositive && s.totalPnL !== 0
      );
      this.elements.pnlCard?.classList.toggle(
        'stat-card--danger',
        !isPositive && s.totalPnL !== 0
      );
    }
    if (this.elements.pnlTrades) {
      this.elements.pnlTrades.textContent = `${s.closedTradeCount} realized trade${s.closedTradeCount !== 1 ? 's' : ''}`;
    }

    if (this.elements.winRate) {
      this.elements.winRate.textContent =
        s.winRate !== null ? `${s.winRate.toFixed(1)}%` : '—';
    }
    if (this.elements.winLoss) {
      const winText = `${s.wins} win${s.wins !== 1 ? 's' : ''}`;
      const lossText = `${s.losses} loss${s.losses !== 1 ? 'es' : ''}`;
      this.elements.winLoss.textContent = `${winText} · ${lossText}`;
    }

    if (this.elements.sharpe) {
      this.elements.sharpe.textContent =
        s.sharpe !== null ? s.sharpe.toFixed(2) : '—';
    }

    if (this.elements.currentAccount) {
      this.elements.currentAccount.textContent = `$${this.formatNumber(s.currentAccount)}`;
    }
    if (this.elements.accountChange) {
      const change = s.currentAccount - s.startingAccount;
      const isPositive = change >= 0;
      this.elements.accountChange.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(change)} from start`;
    }

    if (this.elements.tradingGrowth) {
      const isPositive = s.tradingGrowth >= 0;
      this.elements.tradingGrowth.textContent = `${isPositive ? '+' : ''}${s.tradingGrowth.toFixed(2)}%`;
      this.elements.tradingGrowthCard?.classList.toggle(
        'stat-card--success',
        isPositive && s.tradingGrowth !== 0
      );
      this.elements.tradingGrowthCard?.classList.toggle(
        'stat-card--danger',
        !isPositive && s.tradingGrowth !== 0
      );
    }

    if (this.elements.totalGrowth) {
      const isPositive = s.totalGrowth >= 0;
      this.elements.totalGrowth.textContent = `${isPositive ? '+' : ''}${s.totalGrowth.toFixed(2)}%`;
      this.elements.totalGrowthCard?.classList.toggle(
        'stat-card--success',
        isPositive && s.totalGrowth !== 0
      );
      this.elements.totalGrowthCard?.classList.toggle(
        'stat-card--danger',
        !isPositive && s.totalGrowth !== 0
      );
    }

    if (this.elements.cashFlow) {
      const isPositive = s.netCashFlow >= 0;
      this.elements.cashFlow.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(s.netCashFlow)}`;
    }

    if (this.elements.chartValue) {
      this.elements.chartValue.textContent = `$${this.formatNumber(s.currentAccount)}`;
    }
  }

  formatNumber(num) {
    return Math.abs(Number(num || 0)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
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
        date:
          t.exitDate ||
          t.exit_date ||
          t.timestamp ||
          t.opened_at ||
          t.created_at,
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

  getStats() {
    return this.stats;
  }
}

export const stats = new Stats();
export { Stats };