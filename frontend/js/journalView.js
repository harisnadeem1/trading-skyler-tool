/**
 * Journal View - Full trade history with filtering and analysis
 */

import { state } from './state.js';
import { formatCurrency, formatDate } from './utils.js';
import { trimModal } from './trimModal.js';
import { viewManager } from './viewManager.js';
import { dataManager } from './dataManager.js';

class JournalView {
  constructor() {
    this.elements = {};
    this.currentFilter = 'all';
    this.sortColumn = 'date';
    this.sortDirection = 'desc';
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.render();

    state.on('journalEntryAdded', () => this.render());

    state.on('journalEntryUpdated', () => {
      this.render();
      this.refreshOpenModal();
    });

    state.on('journalEntryDeleted', () => {
      this.render();
      this.closeTradeModal();
    });

    state.on('viewChanged', (data) => {
      if (data.to === 'journal') this.render();
    });
  }

  cacheElements() {
    this.elements = {
      journalCount: document.getElementById('journalCount'),

      totalPnL: document.getElementById('journalTotalPnL'),
      winRate: document.getElementById('journalWinRate'),
      wins: document.getElementById('journalWins'),
      losses: document.getElementById('journalLosses'),
      avgWin: document.getElementById('journalAvgWin'),
      avgLoss: document.getElementById('journalAvgLoss'),

      tableBody: document.getElementById('journalTableBody'),
      tableContainer: document.querySelector('.journal-table-container'),

      empty: document.getElementById('journalEmpty'),
      goToDashboard: document.getElementById('journalGoToDashboard'),

      exportCSV: document.getElementById('journalExportCSV'),
      exportTSV: document.getElementById('journalExportTSV'),

      tradeModal: document.getElementById('journalTradeModal'),
      tradeModalBody: document.getElementById('journalTradeModalBody'),
      tradeModalClose: document.getElementById('journalTradeModalClose'),

      filterButtons: document.querySelectorAll('.journal-view .filter-btn')
    };
  }

  bindEvents() {
    if (this.elements.goToDashboard) {
      this.elements.goToDashboard.addEventListener('click', () => {
        viewManager.navigateTo('dashboard');
      });
    }

    if (this.elements.tradeModalClose && this.elements.tradeModal) {
      this.elements.tradeModalClose.addEventListener('click', () => {
        this.closeTradeModal();
      });
    }

    if (this.elements.tradeModal) {
      this.elements.tradeModal.addEventListener('click', (e) => {
        const rect = this.elements.tradeModal.getBoundingClientRect();
        const clickedBackdrop =
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;

        if (clickedBackdrop) {
          this.closeTradeModal();
        }
      });
    }

    this.elements.filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    if (this.elements.exportCSV) {
      this.elements.exportCSV.addEventListener('click', () => {
        dataManager.exportCSV();
      });
    }

    if (this.elements.exportTSV) {
      this.elements.exportTSV.addEventListener('click', () => {
        dataManager.exportTSV();
      });
    }

    const table = document.getElementById('journalTable');
    if (table) {
      table.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (th && th.dataset.sort) {
          this.handleSort(th.dataset.sort);
        }
      });
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;

    this.elements.filterButtons.forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
    });

    this.render();
  }

  handleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }

    this.render();
  }

  normalizeTrade(trade) {
    if (!trade) return null;

    const trimHistoryRaw = Array.isArray(trade.trimHistory)
      ? trade.trimHistory
      : Array.isArray(trade.trim_history)
        ? trade.trim_history
        : Array.isArray(trade.exits)
          ? trade.exits
          : [];

    const trimHistory = trimHistoryRaw.map((trim) => ({
      id: trim.id ?? null,
      date: trim.date ?? trim.exitDate ?? trim.exit_date ?? trim.created_at ?? null,
      sharesClosed: Number(trim.sharesClosed ?? trim.shares_closed ?? trim.shares ?? 0),
      exitPrice: Number(trim.exitPrice ?? trim.exit_price ?? 0),
      pnl: Number(trim.pnl ?? 0),
      rMultiple: Number(trim.rMultiple ?? trim.r_multiple ?? 0),
      exitType: trim.exitType ?? trim.exit_type ?? 'trim',
      percentTrimmed: Number(trim.percentTrimmed ?? trim.percent_trimmed ?? 0),
      newStop: trim.newStop ?? trim.new_stop ?? null
    }));

    return {
      ...trade,
      id: String(trade.id),
      ticker: trade.ticker ?? '',
      direction:
        trade.direction ??
        (
          Number(trade.stop ?? trade.stop_price ?? 0) >
            Number(trade.entry ?? trade.entry_price ?? 0)
            ? 'short'
            : 'long'
        ),
      status: trade.status ?? 'open',
      timestamp: trade.timestamp ?? trade.created_at ?? null,
      entry: Number(trade.entry ?? trade.entry_price ?? 0),
      stop: Number(trade.stop ?? trade.stop_price ?? 0),
      currentStop: Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0),
      shares: Number(trade.shares ?? 0),
      remainingShares: Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0),
      originalShares: Number(trade.originalShares ?? trade.original_shares ?? trade.shares ?? 0),
      riskDollars: Number(trade.riskDollars ?? trade.risk_dollars ?? 0),
      totalRealizedPnL: Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? trade.pnl ?? 0),
      notes: trade.notes ?? '',
      thesis: trade.thesis ?? null,
      trimHistory
    };
  }

  getFilteredTrades() {
    const entries = state.journal.entries;

    let filtered;
    switch (this.currentFilter) {
      case 'open':
        filtered = entries.filter(t => t.status === 'open');
        break;
      case 'trimmed':
        filtered = entries.filter(t => t.status === 'trimmed');
        break;
      case 'closed':
        filtered = entries.filter(t => t.status === 'closed');
        break;
      case 'winners':
        filtered = entries.filter(t => {
          const pnl = t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0;
          return (t.status === 'closed' || t.status === 'trimmed') && pnl > 0;
        });
        break;
      case 'losers':
        filtered = entries.filter(t => {
          const pnl = t.totalRealizedPnL ?? t.total_realized_pnl ?? t.pnl ?? 0;
          return (t.status === 'closed' || t.status === 'trimmed') && pnl < 0;
        });
        break;
      default:
        filtered = entries;
    }

    return this.sortTrades(filtered);
  }

  sortTrades(trades) {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...trades].sort((a, b) => {
      let aVal;
      let bVal;

      switch (this.sortColumn) {
        case 'date':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'ticker':
          aVal = String(a.ticker || '').toLowerCase();
          bVal = String(b.ticker || '').toLowerCase();
          break;
        case 'entry':
          aVal = Number(a.entry ?? a.entry_price ?? 0);
          bVal = Number(b.entry ?? b.entry_price ?? 0);
          break;
        case 'pnl':
          aVal = Number(a.totalRealizedPnL ?? a.total_realized_pnl ?? a.pnl ?? 0);
          bVal = Number(b.totalRealizedPnL ?? b.total_realized_pnl ?? b.pnl ?? 0);
          break;
        default:
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
      }

      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }

  render() {
    const trades = this.getFilteredTrades();
    const allTrades = state.journal.entries;

    if (this.elements.journalCount) {
      this.elements.journalCount.textContent = `${allTrades.length} trade${allTrades.length !== 1 ? 's' : ''}`;
    }

    this.renderSummary();

    if (trades.length === 0) {
      this.showEmptyState();
    } else {
      this.hideEmptyState();
      this.renderTable(trades);
    }
  }

  renderSummary() {
    const realizedTrades = state.journal.entries
      .map((trade) => {
        const rawPnL = trade.totalRealizedPnL ?? trade.total_realized_pnl ?? trade.pnl ?? 0;
        const realizedPnL = Number(rawPnL);

        return {
          ...trade,
          realizedPnL: Number.isFinite(realizedPnL) ? realizedPnL : 0,
        };
      })
      .filter((trade) => trade.status === 'closed' || trade.status === 'trimmed');

    const totalPnL = realizedTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0);

    if (this.elements.totalPnL) {
      const isPositive = totalPnL >= 0;
      this.elements.totalPnL.textContent = `${isPositive ? '+' : ''}${formatCurrency(totalPnL)}`;
      this.elements.totalPnL.className =
        `journal-summary-bar__value journal-summary-bar__value--lg ${isPositive
          ? 'journal-summary-bar__value--positive'
          : 'journal-summary-bar__value--negative'
        }`;
    }

    const winningTrades = realizedTrades.filter((trade) => trade.realizedPnL > 0);
    const losingTrades = realizedTrades.filter((trade) => trade.realizedPnL < 0);

    const wins = winningTrades.length;
    const losses = losingTrades.length;
    const decidedTrades = wins + losses;

    if (this.elements.winRate) {
      const winRate = decidedTrades > 0 ? (wins / decidedTrades) * 100 : null;
      this.elements.winRate.textContent = winRate !== null ? `${winRate.toFixed(1)}%` : '—';
    }

    if (this.elements.wins) {
      this.elements.wins.textContent = String(wins);
    }

    if (this.elements.losses) {
      this.elements.losses.textContent = String(losses);
    }

    if (this.elements.avgWin) {
      if (wins > 0) {
        const totalWinPnL = winningTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0);
        const avgWin = totalWinPnL / wins;

        if (Number.isFinite(avgWin)) {
          this.elements.avgWin.textContent = `+${formatCurrency(avgWin)}`;
          this.elements.avgWin.className =
            'journal-summary-bar__value journal-summary-bar__value--positive';
        } else {
          this.elements.avgWin.textContent = '—';
          this.elements.avgWin.className = 'journal-summary-bar__value';
        }
      } else {
        this.elements.avgWin.textContent = '—';
        this.elements.avgWin.className = 'journal-summary-bar__value';
      }
    }

    if (this.elements.avgLoss) {
      if (losses > 0) {
        const totalLossPnL = losingTrades.reduce((sum, trade) => sum + trade.realizedPnL, 0);
        const avgLoss = totalLossPnL / losses;

        if (Number.isFinite(avgLoss)) {
          this.elements.avgLoss.textContent = formatCurrency(avgLoss);
          this.elements.avgLoss.className =
            'journal-summary-bar__value journal-summary-bar__value--negative';
        } else {
          this.elements.avgLoss.textContent = '—';
          this.elements.avgLoss.className = 'journal-summary-bar__value';
        }
      } else {
        this.elements.avgLoss.textContent = '—';
        this.elements.avgLoss.className = 'journal-summary-bar__value';
      }
    }
  }

  renderTable(trades) {
    if (!this.elements.tableBody) return;

    const headers = document.querySelectorAll('.journal-view .journal-table th[data-sort]');
    headers.forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });

    this.elements.tableBody.innerHTML = trades.map(trade => {
      const pnl = Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? trade.pnl ?? 0);
      const hasPnL = trade.status === 'closed' || trade.status === 'trimmed';

      const shares = Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0);
      const originalShares = Number(trade.originalShares ?? trade.original_shares ?? trade.shares ?? 0);
      const sharesDisplay = originalShares ? `${shares}/${originalShares}` : shares;

      let rMultiple = null;
      const riskDollars = Number(trade.riskDollars ?? trade.risk_dollars ?? 0);
      if (hasPnL && riskDollars > 0) {
        rMultiple = pnl / riskDollars;
      }

      let pnlPercent = null;
      if (hasPnL) {
        const totalShares = Number(trade.originalShares ?? trade.original_shares ?? trade.shares ?? 0);
        const entryPrice = Number(trade.entry ?? trade.entry_price ?? 0);
        const positionCost = entryPrice * totalShares;
        if (positionCost > 0) {
          pnlPercent = (pnl / positionCost) * 100;
        }
      }

      const isTrimmed = trade.status === 'trimmed';
      const realizedPnL = Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? trade.pnl ?? 0);
      const activeStop = Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0);
      const entry = Number(trade.entry ?? trade.entry_price ?? 0);
      const direction = trade.direction ?? (activeStop > entry ? 'short' : 'long');

      const currentRiskPerShare =
        direction === 'short'
          ? Math.max(0, activeStop - entry)
          : Math.max(0, entry - activeStop);

      const currentRisk = shares * currentRiskPerShare;
      const isFreeRoll = isTrimmed && realizedPnL >= (currentRisk - 0.01);

      let statusClass = trade.status;
      let statusText = trade.status.charAt(0).toUpperCase() + trade.status.slice(1);

      if (isFreeRoll) {
        statusClass = 'freeroll';
        statusText = 'Free Rolled';
      }

      return `
        <tr class="journal-table__row" data-id="${trade.id}">
          <td>${formatDate(trade.timestamp)}</td>
          <td><strong>${trade.ticker}</strong></td>
          <td>${(trade.direction ?? 'long').toUpperCase()}</td>
          <td>${formatCurrency(trade.entry ?? trade.entry_price ?? 0)}</td>
          <td>${trade.exitPrice || trade.exit_price ? formatCurrency(trade.exitPrice ?? trade.exit_price) : '—'}</td>
          <td>${sharesDisplay}</td>
          <td class="${hasPnL ? (pnl >= 0 ? 'journal-table__pnl--positive' : 'journal-table__pnl--negative') : ''}">
            ${hasPnL ? `${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}` : '—'}
          </td>
          <td class="${hasPnL && pnlPercent !== null ? (pnlPercent >= 0 ? 'journal-table__pnl--positive' : 'journal-table__pnl--negative') : ''}">
            ${pnlPercent !== null ? `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%` : '—'}
          </td>
          <td>
            ${rMultiple !== null
          ? (Math.abs(rMultiple) < 0.05
            ? '<span class="tag tag--breakeven">BE</span>'
            : `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(1)}R`)
          : '—'}
          </td>
          <td>
            <span class="journal-table__status journal-table__status--${statusClass}">
              ${statusText}
            </span>
          </td>
          <td class="journal-table__actions">
            <button class="journal-table__action-btn" data-action="expand" data-id="${trade.id}" title="View details">👁️</button>
            <button class="journal-table__action-btn journal-table__action-btn--delete" data-action="delete" data-id="${trade.id}" title="Delete trade">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    this.bindRowActions();
  }

  renderRowDetails(rawTrade) {
    const trade = this.normalizeTrade(rawTrade);
    if (!trade) return '';

    const isTrimmed = trade.status === 'trimmed';
    const isClosed = trade.status === 'closed';
    const isActive = !isClosed;
    const shares = trade.remainingShares;
    const activeStop = trade.currentStop;
    const trimHistory = trade.trimHistory;



    return `
      <div class="journal-row-details" data-trade-id="${trade.id}">
        <div class="journal-row-details__section">
          <div class="journal-row-details__label">Trade Details</div>
          <div class="journal-row-details__trade-container" data-trade-id="${trade.id}">
           <div class="journal-row-details__trade-view">
  <div class="journal-row-details__trade-grid">
    <div class="journal-row-details__trade-item">
      <span class="journal-row-details__trade-label">Direction</span>
      <span class="journal-row-details__trade-value">${(trade.direction ?? 'long').toUpperCase()}</span>
    </div>
    <div class="journal-row-details__trade-item">
      <span class="journal-row-details__trade-label">Entry</span>
      <span class="journal-row-details__trade-value">${formatCurrency(trade.entry ?? trade.entry_price ?? 0)}</span>
    </div>
    <div class="journal-row-details__trade-item">
      <span class="journal-row-details__trade-label">Stop</span>
      <span class="journal-row-details__trade-value">${formatCurrency(activeStop)}</span>
    </div>
    <div class="journal-row-details__trade-item">
      <span class="journal-row-details__trade-label">Shares</span>
      <span class="journal-row-details__trade-value">${shares}</span>
    </div>
  </div>
  <button class="btn btn--xs btn--ghost" data-action="edit-trade" data-id="${trade.id}">Edit</button>
</div>

            <div class="journal-row-details__trade-edit" style="display: none;">
              <div class="journal-row-details__trade-grid">
                <div class="journal-row-details__trade-item">
                  <label class="journal-row-details__trade-label" for="editEntry-${trade.id}">Entry</label>
                  <div class="journal-row-details__input-wrapper">
                    <span class="journal-row-details__input-prefix">$</span>
                    <input type="text" class="journal-row-details__trade-input" id="editEntry-${trade.id}" value="${trade.entry ?? trade.entry_price ?? ''}" autocomplete="off">
                  </div>
                </div>
                <div class="journal-row-details__trade-item">
                  <label class="journal-row-details__trade-label" for="editStop-${trade.id}">Stop</label>
                  <div class="journal-row-details__input-wrapper">
                    <span class="journal-row-details__input-prefix">$</span>
                    <input type="text" class="journal-row-details__trade-input" id="editStop-${trade.id}" value="${activeStop}" autocomplete="off">
                  </div>
                </div>
                <div class="journal-row-details__trade-item">
                  <label class="journal-row-details__trade-label" for="editShares-${trade.id}">Shares</label>
                  <input type="text" class="journal-row-details__trade-input" id="editShares-${trade.id}" value="${shares}" autocomplete="off">
                </div>
              </div>
              <div class="journal-row-details__trade-actions">
                <button class="btn btn--xs btn--primary" data-action="save-trade" data-id="${trade.id}">Save</button>
                <button class="btn btn--xs btn--ghost" data-action="cancel-trade" data-id="${trade.id}">Cancel</button>
              </div>
            </div>
          </div>
        </div>

        <div class="journal-row-details__section">
          <div class="journal-row-details__label">Notes</div>
          <div class="journal-row-details__notes-container" data-trade-id="${trade.id}">
            <div class="journal-row-details__notes-view">
              <span class="journal-row-details__value">${trade.notes || 'No notes added'}</span>
              <button class="btn btn--xs btn--ghost" data-action="edit-notes" data-id="${trade.id}">Edit</button>
            </div>
            <div class="journal-row-details__notes-edit" style="display: none;">
              <textarea class="journal-row-details__notes-input" rows="3">${trade.notes || ''}</textarea>
              <div class="journal-row-details__notes-actions">
                <button class="btn btn--xs btn--primary" data-action="save-notes" data-id="${trade.id}">Save</button>
                <button class="btn btn--xs btn--ghost" data-action="cancel-notes" data-id="${trade.id}">Cancel</button>
              </div>
            </div>
          </div>
        </div>

        ${trade.thesis ? `
          <div class="journal-row-details__section">
            <div class="journal-row-details__label">Thesis</div>
            <div class="journal-row-details__value">
              ${trade.thesis.setup ? `Setup: ${trade.thesis.setup}` : ''}
              ${trade.thesis.theme ? `<br>Theme: ${trade.thesis.theme}` : ''}
              ${trade.thesis.conviction ? `<br>Conviction: ${'★'.repeat(trade.thesis.conviction)}${'☆'.repeat(5 - trade.thesis.conviction)}` : ''}
            </div>
          </div>
        ` : ''}

        ${trimHistory.length > 0 ? `
  <div class="journal-row-details__section">
    <div class="journal-row-details__label">Trade Log</div>
    <div class="journal-row-details__value journal-row-details__trade-log">
      ${trimHistory.map((trim, index) => {
      const isLastEntry = index === trimHistory.length - 1;
      const isClose = trim.exitType === 'close' || (isLastEntry && trade.status === 'closed');
      const actionText = isClose ? 'Closed' : 'Trimmed';
      const statusClass = isClose ? 'closed' : 'trimmed';

      return `
          <div class="trade-log-entry">
            <span class="journal-table__status journal-table__status--${statusClass}">
              ${actionText}
            </span>
            ${trim.date ? formatDate(trim.date) : '—'}:
            ${trim.sharesClosed} shares @ ${formatCurrency(trim.exitPrice)} =
            <span class="${trim.pnl >= 0 ? 'text-success' : 'text-danger'}">
              ${trim.pnl >= 0 ? '+' : ''}${formatCurrency(trim.pnl)}
            </span>
            (${trim.rMultiple >= 0 ? '+' : ''}${Number(trim.rMultiple).toFixed(1)}R)
          </div>
        `;
    }).join('')}
    </div>
  </div>
` : ''}

        <div class="journal-row-details__actions">
          ${isActive ? `
            <button class="btn btn--sm btn--primary" data-action="close" data-id="${trade.id}">
              ${isTrimmed ? 'Trim More' : 'Close / Trim'}
            </button>
          ` : ''}
          <button class="btn btn--sm btn--ghost" data-action="delete" data-id="${trade.id}">Delete</button>
        </div>
      </div>
    `;
  }

  openTradeModal(tradeId) {
    if (!this.elements.tradeModal || !this.elements.tradeModalBody) return;

    const rawTrade = state.journal.entries.find(t => String(t.id) === String(tradeId));
    const trade = this.normalizeTrade(rawTrade);
    if (!trade) return;

    const titleEl = document.getElementById('journalTradeModalTitle');
    if (titleEl) {
      titleEl.textContent = `${trade.ticker} Trade Details`;
    }

    this.elements.tradeModalBody.innerHTML = this.renderRowDetails(trade);
    this.elements.tradeModal.dataset.tradeId = String(tradeId);

    this.bindModalActions();

    if (typeof this.elements.tradeModal.showModal === 'function' && !this.elements.tradeModal.open) {
      this.elements.tradeModal.showModal();
    }
  }

  closeTradeModal() {
    if (this.elements.tradeModal?.open) {
      this.elements.tradeModal.close();
    }

    if (this.elements.tradeModalBody) {
      this.elements.tradeModalBody.innerHTML = '';
    }

    if (this.elements.tradeModal) {
      this.elements.tradeModal.dataset.tradeId = '';
    }
  }

  refreshOpenModal() {
    if (!this.elements.tradeModal?.open) return;

    const tradeId = this.elements.tradeModal.dataset.tradeId;
    if (!tradeId) return;

    const rawTrade = state.journal.entries.find(t => String(t.id) === String(tradeId));
    const trade = this.normalizeTrade(rawTrade);

    if (!trade) {
      this.closeTradeModal();
      return;
    }

    const titleEl = document.getElementById('journalTradeModalTitle');
    if (titleEl) {
      titleEl.textContent = `${trade.ticker} Trade Details`;
    }

    this.elements.tradeModalBody.innerHTML = this.renderRowDetails(trade);
    this.bindModalActions();
  }

  bindRowActions() {
    if (!this.elements.tableBody) return;

    this.elements.tableBody.querySelectorAll('[data-action="expand"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.openTradeModal(id);
      });
    });

    this.elements.tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('Delete this trade?')) {
          state.deleteJournalEntry(id);
        }
      });
    });
  }

  bindModalActions() {
    if (!this.elements.tradeModalBody) return;

    this.elements.tradeModalBody.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        trimModal.open(id);
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        if (confirm('Delete this trade?')) {
          state.deleteJournalEntry(id);
        }
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="edit-notes"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        if (container) {
          container.querySelector('.journal-row-details__notes-view').style.display = 'none';
          container.querySelector('.journal-row-details__notes-edit').style.display = 'block';
          container.querySelector('.journal-row-details__notes-input').focus();
        }
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="save-notes"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        if (!container) return;

        const newNotes = container.querySelector('.journal-row-details__notes-input').value;
        await state.updateJournalEntry(id, { notes: newNotes });
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="cancel-notes"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        const rawTrade = state.journal.entries.find(t => String(t.id) === String(id));
        const trade = this.normalizeTrade(rawTrade);

        if (container && trade) {
          container.querySelector('.journal-row-details__notes-input').value = trade.notes || '';
          container.querySelector('.journal-row-details__notes-view').style.display = 'flex';
          container.querySelector('.journal-row-details__notes-edit').style.display = 'none';
        }
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="edit-trade"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__trade-container[data-trade-id="${id}"]`);

        if (container) {
          container.querySelector('.journal-row-details__trade-view').style.display = 'none';
          container.querySelector('.journal-row-details__trade-edit').style.display = 'block';
          container.querySelector(`#editEntry-${id}`).focus();
        }
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="save-trade"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__trade-container[data-trade-id="${id}"]`);
        const rawTrade = state.journal.entries.find(t => String(t.id) === String(id));
        const trade = this.normalizeTrade(rawTrade);

        if (!container || !trade) return;

        const newEntry = parseFloat(container.querySelector(`#editEntry-${id}`).value);
        const newStop = parseFloat(container.querySelector(`#editStop-${id}`).value);
        const newRemainingShares = parseInt(container.querySelector(`#editShares-${id}`).value, 10);

        if (!Number.isFinite(newEntry) || newEntry <= 0) {
          alert('Please enter a valid entry price');
          return;
        }

        if (!Number.isFinite(newStop) || newStop <= 0) {
          alert('Please enter a valid stop loss');
          return;
        }

        const direction = trade.direction ?? 'long';

        if (direction === 'long' && newStop >= newEntry) {
          alert('For a long trade, stop must be below entry');
          return;
        }

        if (direction === 'short' && newStop <= newEntry) {
          alert('For a short trade, stop must be above entry');
          return;
        }

        if (!Number.isFinite(newRemainingShares) || newRemainingShares <= 0) {
          alert('Please enter a valid number of shares');
          return;
        }

        const stopDistance = Math.abs(newEntry - newStop);
        const riskDollars = stopDistance * newRemainingShares;
        const positionSize = newEntry * newRemainingShares;

        const updates = {
          entry: newEntry,
          stop: newStop,
          currentStop: newStop,
          stopDistance,
          riskDollars,
          positionSize,
          remainingShares: newRemainingShares
        };

        if (trade.status === 'open' && trade.trimHistory.length === 0) {
          updates.shares = newRemainingShares;
          updates.originalShares = newRemainingShares;
        }

        await state.updateJournalEntry(id, updates);
      });
    });

    this.elements.tradeModalBody.querySelectorAll('[data-action="cancel-trade"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const container = this.elements.tradeModalBody.querySelector(`.journal-row-details__trade-container[data-trade-id="${id}"]`);
        const rawTrade = state.journal.entries.find(t => String(t.id) === String(id));
        const trade = this.normalizeTrade(rawTrade);

        if (container && trade) {
          container.querySelector(`#editEntry-${id}`).value = trade.entry;
          container.querySelector(`#editStop-${id}`).value = trade.currentStop;
          container.querySelector(`#editShares-${id}`).value = trade.remainingShares;
          container.querySelector('.journal-row-details__trade-view').style.display = 'flex';
          container.querySelector('.journal-row-details__trade-edit').style.display = 'none';
        }
      });
    });
  }

  showEmptyState() {
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = 'none';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.add('journal-empty--visible');
    }
  }

  hideEmptyState() {
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = '';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.remove('journal-empty--visible');
    }
  }
}

export const journalView = new JournalView();
export { JournalView };