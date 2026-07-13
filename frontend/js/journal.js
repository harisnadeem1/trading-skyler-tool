/**
 * Journal - Trade logging and management
 */

import { state } from './state.js';
import { formatCurrency, formatPercent, formatDate } from './utils.js';
import { showToast } from './ui.js';
import { trimModal } from './trimModal.js';
import { dataManager } from './dataManager.js';
import { wizard } from './wizard.js';
import { viewManager } from './viewManager.js';

class Journal {
  constructor() {
    this.elements = {};
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.render();

    state.on('journalEntryAdded', () => this.render());
    state.on('journalEntryUpdated', () => this.render());
    state.on('journalEntryDeleted', () => this.render());
    state.on('journalHydrated', () => this.render());
    state.on('accountChanged', () => {
  this.renderActiveTrades();
  this.renderRiskSummary();
});
    state.on('settingsChanged', () => this.updateWizardHint());

    state.on('resultsRendered', (results) => {
      this.updateLogButtonState(results);
    });

    this.updateLogButtonState(state.results);
    this.updateWizardHint();
  }

 cacheElements() {
  this.elements = {
    tradeNotes: document.getElementById('tradeNotes'),
    logTradeBtn: document.getElementById('logTradeBtn'),
    wizardHint: document.getElementById('wizardHint'),

    activeTrades: document.getElementById('activeTrades'),
    activeTradeCount: document.getElementById('activeTradeCount'),
    riskSummary: document.getElementById('riskSummary'),
    viewPositionsBtn: document.getElementById('viewPositionsBtn'),

    journalModal: document.getElementById('journalModal'),
    journalModalOverlay: document.getElementById('journalModalOverlay'),
    closeJournalBtn: document.getElementById('closeJournalBtn'),
    viewJournalBtn: document.getElementById('viewJournalBtn'),
    journalTableBody: document.getElementById('journalTableBody'),

    journalCount: document.getElementById('journalCount'),
    journalTotalPnL: document.getElementById('journalTotalPnL'),
    journalWinRate: document.getElementById('journalWinRate'),
    journalWins: document.getElementById('journalWins'),
    journalLosses: document.getElementById('journalLosses'),
    journalAvgWin: document.getElementById('journalAvgWin'),
    journalAvgLoss: document.getElementById('journalAvgLoss'),

    exportCSVBtn: document.getElementById('journalExportCSV'),
    exportTSVBtn: document.getElementById('journalExportTSV'),
    exportPDFBtn: document.getElementById('journalExportPDF'),

    journalCopyCSV: document.getElementById('journalCopyCSV'),
    journalCopyTSV: document.getElementById('journalCopyTSV')
  };
}

  bindEvents() {
    if (this.elements.logTradeBtn) {
      this.elements.logTradeBtn.addEventListener('click', async (e) => {
        const skipWizard = e.shiftKey;
        await this.logTrade(skipWizard);
      });
    }

    if (this.elements.viewJournalBtn) {
      this.elements.viewJournalBtn.addEventListener('click', () => {
        viewManager.navigateTo('journal');
      });
    }

    if (this.elements.viewPositionsBtn) {
      this.elements.viewPositionsBtn.addEventListener('click', () => {
        viewManager.navigateTo('positions');
      });
    }

    document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderTable(e.target.dataset.filter);
      });
    });

    if (this.elements.exportCSVBtn) {
      this.elements.exportCSVBtn.addEventListener('click', () => dataManager.exportCSV());
    }

    if (this.elements.exportTSVBtn) {
      this.elements.exportTSVBtn.addEventListener('click', () => dataManager.exportTSV());
    }

    if (this.elements.exportPDFBtn) {
      this.elements.exportPDFBtn.addEventListener('click', () => {
        showToast('📄 PDF export coming soon. Use CSV for now.', 'warning');
      });
    }

    if (this.elements.journalCopyCSV) {
      this.elements.journalCopyCSV.addEventListener('click', () => dataManager.copyCSV());
    }

    if (this.elements.journalCopyTSV) {
      this.elements.journalCopyTSV.addEventListener('click', () => dataManager.copyTSV());
    }

  

    window.closeTrade = (id) => this.closeTrade(id);
    window.deleteTrade = (id) => this.deleteTrade(id);
  }

  async logTrade(skipWizard = false) {
    const results = state.results;
    const trade = state.trade;

    if (!results.shares || results.shares === 0) {
      showToast('⚠️ Enter a valid trade to log', 'warning');
      return;
    }

    const wizardEnabled = !!state.settings.wizardEnabled;

    if (wizardEnabled && !skipWizard) {
      wizard.open();
      return;
    }

    const entry = {
      ticker: trade.ticker || 'UNKNOWN',
      entry: trade.entry,
      stop: trade.stop,
      originalStop: trade.stop,
      currentStop: trade.stop,
      target: trade.target,
      shares: results.shares,
      originalShares: results.shares,
      remainingShares: results.shares,
      positionSize: results.positionSize,
      riskDollars: results.riskDollars,
      riskPercent: state.account.riskPercent,
      stopDistance: results.stopDistance,
      notes: this.elements.tradeNotes?.value || '',
      status: 'open',
      exitPrice: null,
      exitDate: null,
      pnl: null,
      totalRealizedPnL: 0,
      thesis: null,
      wizardComplete: false,
      wizardSkipped: [],
    };

    try {
      const newEntry = await state.addJournalEntry(entry);

      const progress = state.journalMeta.achievements.progress;
      progress.totalTrades += 1;

      if (entry.notes) {
        progress.tradesWithNotes += 1;
      }

      state.updateStreak();

      state.emit('tradeLogged', {
        entry: newEntry,
        wizardComplete: false,
        thesis: null,
      });

      if (state.settings.celebrationsEnabled) {
        state.emit('triggerConfetti');
      }

      if (this.elements.tradeNotes) {
        this.elements.tradeNotes.value = '';
      }

      showToast(`✅ ${entry.ticker} trade logged!`, 'success');
      this.updateLogButtonState({ shares: 0 });
    } catch (error) {
      console.error('Failed to log trade:', error);
      showToast('❌ Failed to log trade', 'error');
    }
  }

  updateLogButtonState(results) {
    if (!this.elements.logTradeBtn) return;

    const hasValidResults = results && results.shares > 0;

    if (hasValidResults) {
      this.elements.logTradeBtn.removeAttribute('disabled');
    } else {
      this.elements.logTradeBtn.setAttribute('disabled', 'disabled');
    }
  }

  updateWizardHint() {
    if (!this.elements.wizardHint) return;

    const wizardEnabled = !!state.settings.wizardEnabled;
    this.elements.wizardHint.style.display = wizardEnabled ? '' : 'none';
  }

  closeTrade(id) {
    trimModal.open(id);
  }

  async deleteTrade(id) {
    if (!confirm('Delete this trade?')) return;

    try {
      const deleted = await state.deleteJournalEntry(id);
      if (deleted) {
        showToast('🗑️ Trade deleted', 'success');
      }
    } catch (error) {
      console.error('Failed to delete trade:', error);
      showToast('❌ Failed to delete trade', 'error');
    }
  }

  render() {
    this.renderActiveTrades();
    this.renderRiskSummary();
    this.renderTable(state.journal.filter || 'all');
  }

  renderActiveTrades() {
    const activeTrades = state.getOpenTrades();

    if (this.elements.activeTradeCount) {
      this.elements.activeTradeCount.textContent = `${activeTrades.length} active`;
    }

    if (!this.elements.activeTrades) return;

    if (activeTrades.length === 0) {
      this.elements.activeTrades.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">🧘</span>
          <span class="empty-state__text">No active trades</span>
          <span class="empty-state__hint">Log a trade to see it here</span>
        </div>
      `;
      return;
    }

    this.elements.activeTrades.innerHTML = activeTrades
      .slice(0, 5)
      .map((trade) => {
        const shares = Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0);
        const originalShares = Number(
          trade.originalShares ?? trade.original_shares ?? trade.shares ?? 0
        );
        const entryPrice = Number(trade.entry ?? trade.entry_price ?? 0);
        const stopPrice = Number(
          trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0
        );
        const riskPerShare = entryPrice - stopPrice;
        const currentRisk = shares * riskPerShare;
        const isTrimmed = trade.status === 'trimmed';
        const realizedPnL = Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? 0);
        const target5R = entryPrice + (5 * riskPerShare);
        const isFreeRoll = isTrimmed && realizedPnL >= currentRisk - 0.01;
        const netRisk = isTrimmed ? Math.max(0, currentRisk - realizedPnL) : currentRisk;

        const riskPercent =
          state.account.currentSize > 0 ? (netRisk / state.account.currentSize) * 100 : 0;

        let riskColorClass = 'text-success';
        if (riskPercent >= 2) {
          riskColorClass = 'text-danger';
        } else if (riskPercent >= 0.5) {
          riskColorClass = 'text-warning';
        }

        let statusClass;
        let statusText;

        if (isFreeRoll) {
          statusClass = 'freeroll';
          statusText = 'Free Rolled';
        } else if (isTrimmed) {
          statusClass = 'trimmed';
          statusText = 'Trimmed';
        } else {
          statusClass = 'active';
          statusText = 'Open';
        }

        return `
          <div class="trade-card" data-id="${trade.id}">
            <div class="trade-card__header">
              <div class="trade-card__header-left">
                <span class="trade-card__ticker">${trade.ticker}</span>
                <span class="trade-card__shares">${shares} shares${isTrimmed ? ` (${originalShares} orig)` : ''}</span>
              </div>
              <span class="status-badge status-badge--${statusClass}">${statusText}</span>
            </div>

            <div class="trade-card__details">
              <div class="trade-card__detail">
                <span class="trade-card__label">Entry</span>
                <span class="trade-card__value text-primary">${formatCurrency(entryPrice)}</span>
              </div>

              <div class="trade-card__detail">
                <span class="trade-card__label">Stop</span>
                <span class="trade-card__value text-danger">${formatCurrency(stopPrice)}</span>
              </div>

              <div class="trade-card__detail">
                <span class="trade-card__label">5R Target</span>
                <span class="trade-card__value text-warning">${formatCurrency(target5R)}</span>
              </div>

              <div class="trade-card__detail">
                <span class="trade-card__label">Risk</span>
                <span class="trade-card__value ${riskColorClass}">
                  ${riskPercent.toFixed(2)}% (${formatCurrency(netRisk)})
                </span>
              </div>

              ${isTrimmed ? `
              <div class="trade-card__detail">
                <span class="trade-card__label">Realized</span>
                <span class="trade-card__value ${realizedPnL >= 0 ? 'text-success' : 'text-danger'}">
                  ${realizedPnL >= 0 ? '+' : ''}${formatCurrency(realizedPnL)}
                </span>
              </div>
              ` : ''}
            </div>

            <div class="trade-card__actions">
              <button class="btn btn--sm btn--secondary" onclick="closeTrade('${trade.id}')">
                ${isTrimmed ? 'Trim More' : 'Manage'}
              </button>
              <button class="btn btn--sm btn--secondary btn--danger-outline" onclick="deleteTrade('${trade.id}')">
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  renderRiskSummary() {
    if (!this.elements.riskSummary) return;

    const summary = state.getOpenRiskSummary();

    if (summary.count === 0) {
      this.elements.riskSummary.innerHTML = `
        <span class="risk-summary__label">Status:</span>
        <span class="risk-summary__indicator risk-summary__indicator--low">CASH</span>
      `;
      return;
    }

    const levelClass = summary.level.toLowerCase();

    this.elements.riskSummary.innerHTML = `
      <span class="risk-summary__label">Open Risk:</span>
      <span class="risk-summary__value">${formatCurrency(summary.dollars)}</span>
      <span class="risk-summary__percent">(${formatPercent(summary.percent)})</span>
      <span class="risk-summary__indicator risk-summary__indicator--${levelClass}">
        ${summary.level}
      </span>
    `;
  }

  openModal() {
    this.elements.journalModal?.classList.add('open');
    this.elements.journalModalOverlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
    state.setUI('journalOpen', true);
    this.renderTable();
  }

  closeModal() {
    this.elements.journalModal?.classList.remove('open');
    this.elements.journalModalOverlay?.classList.remove('open');
    document.body.style.overflow = '';
    state.setUI('journalOpen', false);
  }

  renderTable(filter = 'all') {
    if (!this.elements.journalTableBody) return;

    state.state.journal.filter = filter;
    const trades = state.getFilteredEntries(filter);

    if (trades.length === 0) {
      this.elements.journalTableBody.innerHTML = `
        <tr class="journal-empty">
          <td colspan="9">No trades ${filter !== 'all' ? 'with status "' + filter + '"' : 'logged yet'}</td>
        </tr>
      `;
      if (this.elements.journalSummaryText) {
        this.elements.journalSummaryText.textContent = '0 trades';
      }
      return;
    }

    this.elements.journalTableBody.innerHTML = trades
      .map((trade) => {
        const date = formatDate(trade.timestamp || trade.opened_at || trade.created_at);
        const isTrimmed = trade.status === 'trimmed';
        const pnlValue = trade.totalRealizedPnL ?? trade.total_realized_pnl ?? trade.pnl;

        const pnlDisplay =
          pnlValue !== null && pnlValue !== undefined
            ? `<span class="${pnlValue >= 0 ? 'text-success' : 'text-danger'}">${pnlValue >= 0 ? '+' : ''}${formatCurrency(pnlValue)}</span>`
            : '—';

        const sharesDisplay = isTrimmed
          ? `${trade.remainingShares ?? trade.remaining_shares ?? trade.shares}/${trade.originalShares ?? trade.original_shares ?? trade.shares}`
          : trade.shares;

        return `
          <tr data-id="${trade.id}">
            <td>${date}</td>
            <td>${trade.ticker}</td>
            <td>${formatCurrency(trade.entry ?? trade.entry_price)}</td>
            <td>${formatCurrency(trade.stop ?? trade.stop_price)}</td>
            <td>${sharesDisplay}</td>
            <td>${formatCurrency(trade.riskDollars ?? trade.risk_dollars ?? 0)}</td>
            <td><span class="status-badge status-badge--${trade.status}">${trade.status}</span></td>
            <td>${pnlDisplay}</td>
            <td>
              <button class="btn btn--ghost btn--sm" onclick="deleteTrade('${trade.id}')">×</button>
            </td>
          </tr>
        `;
      })
      .join('');

    const getPnL = (t) => Number(t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0);
    const wins = trades.filter((t) => getPnL(t) > 0).length;
    const losses = trades.filter((t) => getPnL(t) < 0).length;
    const open = trades.filter((t) => t.status === 'open').length;
    const trimmed = trades.filter((t) => t.status === 'trimmed').length;
    const totalPnL = trades.reduce((sum, t) => sum + getPnL(t), 0);

    if (this.elements.journalSummaryText) {
      const activeCount = open + trimmed;
      const parts = [];
      parts.push(`${trades.length} trade${trades.length !== 1 ? 's' : ''}`);

      const statParts = [];
      if (wins > 0) statParts.push(`${wins} win${wins !== 1 ? 's' : ''}`);
      if (losses > 0) statParts.push(`${losses} loss${losses !== 1 ? 'es' : ''}`);
      if (activeCount > 0) statParts.push(`${activeCount} open`);

      if (statParts.length > 0) {
        parts.push(statParts.join(', '));
      }

      if (wins > 0 || losses > 0) {
        parts.push(`${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}`);
      }

      this.elements.journalSummaryText.textContent = parts.join(' · ');
    }
  }
}

export const journal = new Journal();
export { Journal };