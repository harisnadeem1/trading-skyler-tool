/**
 * TrimModal - Handles partial position exits (trimming trades)
 */

import { state } from './state.js';
import { formatCurrency, formatNumber } from './utils.js';
import { showToast } from './ui.js';

class TrimModal {
  constructor() {
    this.elements = {};
    this.currentTrade = null;
    this.selectedR = 5;
    this.selectedTrimPercent = 100;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.elements = {
      modal: document.getElementById('trimModal'),
      overlay: document.getElementById('trimModalOverlay'),
      closeBtn: document.getElementById('closeTrimModalBtn'),
      cancelBtn: document.getElementById('cancelTrimBtn'),
      confirmBtn: document.getElementById('confirmTrimBtn'),
      ticker: document.getElementById('trimModalTicker'),
      entryPrice: document.getElementById('trimEntryPrice'),
      originalStop: document.getElementById('trimOriginalStop'),
      stopLoss: document.getElementById('trimStopLoss'),
      riskPerShare: document.getElementById('trimRiskPerShare'),
      remainingShares: document.getElementById('trimRemainingShares'),
      exitPrice: document.getElementById('trimExitPrice'),
      rDisplay: document.getElementById('trimRDisplay'),
      customTrimPercent: document.getElementById('customTrimPercent'),
      dateInput: document.getElementById('trimDate'),
      newStop: document.getElementById('trimNewStop'),
      sharesClosing: document.getElementById('trimSharesClosing'),
      sharesRemaining: document.getElementById('trimSharesRemaining'),
      profitPerShare: document.getElementById('trimProfitPerShare'),
      totalPnL: document.getElementById('trimTotalPnL'),
      preview: document.getElementById('trimPreview')
    };
  }

  bindEvents() {
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.cancelBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });

    this.elements.modal?.querySelectorAll('[data-r]').forEach((btn) => {
      btn.addEventListener('click', (e) => this.selectR(e));
    });

    this.elements.modal?.querySelectorAll('[data-trim]').forEach((btn) => {
      btn.addEventListener('click', (e) => this.selectTrimPercent(e));
    });

    this.elements.customTrimPercent?.addEventListener('input', () => this.handleCustomTrimPercent());
    this.elements.exitPrice?.addEventListener('input', () => this.handleManualExitPrice());
    this.elements.confirmBtn?.addEventListener('click', () => this.confirm());
  }

  setDefaultDate() {
    if (this.elements.dateInput) {
      this.elements.dateInput.value = new Date().toISOString().split('T')[0];
    }
  }

  open(tradeId) {
    const trade = state.journal.entries.find((e) => String(e.id) === String(tradeId));
    if (!trade) {
      showToast('❌ Trade not found', 'error');
      return;
    }

    this.currentTrade = {
      ...trade,
      direction:
        trade.direction ??
        (
          Number(trade.stop ?? trade.stop_price ?? 0) >
            Number(trade.entry ?? trade.entry_price ?? 0)
            ? 'short'
            : 'long'
        ),
      originalShares: trade.originalShares ?? trade.original_shares ?? trade.shares,
      remainingShares: trade.remainingShares ?? trade.remaining_shares ?? trade.shares,
      originalStop: trade.originalStop ?? trade.original_stop ?? trade.stop ?? trade.stop_price,
      currentStop: trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price,
      trimHistory: trade.trimHistory ?? trade.trim_history ?? [],
      totalRealizedPnL: trade.totalRealizedPnL ?? trade.total_realized_pnl ?? 0
    };

    this.populateTradeData(this.currentTrade);
    this.selectedR = 5;
    this.selectedTrimPercent = 100;
    this.setDefaultDate();

    this.elements.modal?.querySelectorAll('[data-r]').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.r, 10) === this.selectedR);
    });
    this.elements.modal?.querySelectorAll('[data-trim]').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.trim, 10) === this.selectedTrimPercent);
    });

    if (this.elements.customTrimPercent) this.elements.customTrimPercent.value = '';

    this.calculateExitPrice();
    this.calculatePreview();

    this.elements.modal?.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
    this.currentTrade = null;
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open') ?? false;
  }

  populateTradeData(trade) {
    const remainingShares = Number(trade.remainingShares ?? trade.shares ?? 0);
    const originalStop = Number(trade.originalStop ?? trade.stop ?? trade.stop_price ?? 0);
    const currentStop = Number(trade.currentStop ?? trade.stop ?? trade.stop_price ?? 0);
    const entryPrice = Number(trade.entry ?? trade.entry_price ?? 0);
    const direction = trade.direction ?? 'long';
    const riskPerShare =
      direction === 'short'
        ? Math.max(0, originalStop - entryPrice)
        : Math.max(0, entryPrice - originalStop);

    if (this.elements.ticker) { this.elements.ticker.textContent = `${trade.ticker} · ${(direction || 'long').toUpperCase()}`; }
    if (this.elements.entryPrice) this.elements.entryPrice.textContent = formatCurrency(entryPrice);
    if (this.elements.originalStop) this.elements.originalStop.textContent = formatCurrency(originalStop);
    if (this.elements.stopLoss) this.elements.stopLoss.textContent = formatCurrency(currentStop);
    if (this.elements.riskPerShare) this.elements.riskPerShare.textContent = formatCurrency(riskPerShare);
    if (this.elements.remainingShares) this.elements.remainingShares.textContent = formatNumber(remainingShares);

    if (this.elements.newStop) this.elements.newStop.value = '';
  }

  selectR(e) {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;

    this.selectedR = parseInt(btn.dataset.r, 10);
    this.elements.modal?.querySelectorAll('[data-r]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const suggestedTrimPercent = Math.round((1 / (1 + this.selectedR)) * 100);
    this.setTrimPercent(suggestedTrimPercent);

    this.calculateExitPrice();
    this.calculatePreview();
  }

  setTrimPercent(percent) {
    this.selectedTrimPercent = percent;

    this.elements.modal?.querySelectorAll('[data-trim]').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.trim, 10) === percent);
    });

    const hasMatchingPreset = Array.from(
      this.elements.modal?.querySelectorAll('[data-trim]') || []
    ).some((btn) => parseInt(btn.dataset.trim, 10) === percent);

    if (this.elements.customTrimPercent) {
      this.elements.customTrimPercent.value = hasMatchingPreset ? '' : percent;
    }
  }

  selectTrimPercent(e) {
    const btn = e.target.closest('[data-trim]');
    if (!btn) return;

    this.selectedTrimPercent = parseInt(btn.dataset.trim, 10);
    this.elements.modal?.querySelectorAll('[data-trim]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    if (this.elements.customTrimPercent) this.elements.customTrimPercent.value = '';
    this.calculatePreview();
  }

  handleCustomTrimPercent() {
    const value = parseFloat(this.elements.customTrimPercent?.value);
    if (!isNaN(value) && value > 0 && value <= 100) {
      this.selectedTrimPercent = value;
      this.elements.modal?.querySelectorAll('[data-trim]').forEach((b) => b.classList.remove('active'));
      this.calculatePreview();
    }
  }

  handleManualExitPrice() {
    const exitPrice = parseFloat(this.elements.exitPrice?.value);
    if (!this.currentTrade || isNaN(exitPrice)) return;

    const entryPrice = Number(this.currentTrade.entry ?? this.currentTrade.entry_price ?? 0);
    const stopPrice = Number(
      this.currentTrade.currentStop ??
      this.currentTrade.current_stop ??
      this.currentTrade.stop ??
      this.currentTrade.stop_price ??
      0
    );

    const direction = this.currentTrade.direction ?? 'long';

    const riskPerShare =
      direction === 'short'
        ? Math.max(0, stopPrice - entryPrice)
        : Math.max(0, entryPrice - stopPrice);

    const movePerShare =
      direction === 'short'
        ? (entryPrice - exitPrice)
        : (exitPrice - entryPrice);

    const rMultiple = riskPerShare !== 0 ? movePerShare / riskPerShare : 0;

    if (this.elements.rDisplay) {
      this.elements.rDisplay.textContent = `(${rMultiple.toFixed(1)}R)`;
      this.elements.rDisplay.classList.toggle('negative', rMultiple < 0);
    }

    this.elements.modal?.querySelectorAll('[data-r]').forEach((b) => b.classList.remove('active'));
    this.calculatePreview();
  }

 calculateExitPrice() {
  if (!this.currentTrade) return;

  const entryPrice = Number(this.currentTrade.entry ?? this.currentTrade.entry_price ?? 0);
  const stopPrice = Number(
    this.currentTrade.currentStop ??
    this.currentTrade.current_stop ??
    this.currentTrade.stop ??
    this.currentTrade.stop_price ??
    0
  );

  const direction = this.currentTrade.direction ?? 'long';

  const riskPerShare =
    direction === 'short'
      ? Math.max(0, stopPrice - entryPrice)
      : Math.max(0, entryPrice - stopPrice);

  let exitPrice =
    direction === 'short'
      ? entryPrice - (this.selectedR * riskPerShare)
      : entryPrice + (this.selectedR * riskPerShare);

  // Guardrail for short trades: don’t go below $0
  if (direction === 'short' && exitPrice < 0) {
    exitPrice = 0;
    showToast('⚠️ Selected R target goes below $0 for this short trade', 'warning');
  }

  if (this.elements.exitPrice) this.elements.exitPrice.value = exitPrice.toFixed(2);
  if (this.elements.rDisplay) {
    this.elements.rDisplay.textContent = `(${this.selectedR}R)`;
    this.elements.rDisplay.classList.remove('negative');
  }
}

  calculatePreview() {
    if (!this.currentTrade) return;

    const exitPrice = parseFloat(this.elements.exitPrice?.value) || 0;
    const remainingShares = Number(this.currentTrade.remainingShares ?? this.currentTrade.shares ?? 0);
    const sharesToClose = Math.floor(remainingShares * (this.selectedTrimPercent / 100));
    const sharesRemaining = remainingShares - sharesToClose;
    const entryPrice = Number(this.currentTrade.entry ?? this.currentTrade.entry_price ?? 0);

    const direction = this.currentTrade.direction ?? 'long';

    const profitPerShare =
      direction === 'short'
        ? (entryPrice - exitPrice)
        : (exitPrice - entryPrice);

    const totalPnL = profitPerShare * sharesToClose;
    const isProfit = totalPnL >= 0;

    if (this.elements.sharesClosing) {
      this.elements.sharesClosing.textContent = `${formatNumber(sharesToClose)} shares`;
    }
    if (this.elements.sharesRemaining) {
      this.elements.sharesRemaining.textContent = `(${formatNumber(sharesRemaining)} remaining)`;
    }

    if (this.elements.profitPerShare) {
      this.elements.profitPerShare.textContent = `${isProfit ? '+' : ''}${formatCurrency(profitPerShare)}`;
      this.elements.profitPerShare.className = `trim-preview__value ${isProfit ? 'text-success' : 'text-danger'}`;
    }

    if (this.elements.totalPnL) {
      this.elements.totalPnL.textContent = `${isProfit ? '+' : ''}${formatCurrency(totalPnL)}`;
      this.elements.totalPnL.className = `trim-preview__value ${isProfit ? 'text-success' : 'text-danger'}`;
    }

    if (this.elements.preview) {
      this.elements.preview.classList.toggle('negative', !isProfit);
    }

    if (this.elements.confirmBtn) {
      const isFullClose = sharesRemaining === 0;
      this.elements.confirmBtn.textContent = isFullClose ? 'Confirm Close' : 'Confirm Trim';
    }
  }

  async confirm() {
    if (!this.currentTrade) return;

    const exitPrice = parseFloat(this.elements.exitPrice?.value);
    if (isNaN(exitPrice) || exitPrice <= 0) {
      showToast('⚠️ Please enter a valid exit price', 'error');
      return;
    }

    const remainingShares = Number(this.currentTrade.remainingShares ?? this.currentTrade.shares ?? 0);
    const sharesToClose = Math.floor(remainingShares * (this.selectedTrimPercent / 100));

    if (sharesToClose <= 0) {
      showToast('⚠️ No shares to close', 'error');
      return;
    }

    const entryPrice = Number(this.currentTrade.entry ?? this.currentTrade.entry_price ?? 0);
    const stopPrice = Number(
      this.currentTrade.currentStop ??
      this.currentTrade.current_stop ??
      this.currentTrade.stop ??
      this.currentTrade.stop_price ??
      0
    );

    const direction = this.currentTrade.direction ?? 'long';

    const riskPerShare =
      direction === 'short'
        ? Math.max(0, stopPrice - entryPrice)
        : Math.max(0, entryPrice - stopPrice);

    const movePerShare =
      direction === 'short'
        ? (entryPrice - exitPrice)
        : (exitPrice - entryPrice);

    const rMultiple = riskPerShare !== 0 ? movePerShare / riskPerShare : 0;
    const pnl = movePerShare * sharesToClose;

    const closeDate = this.elements.dateInput?.value
      ? new Date(`${this.elements.dateInput.value}T12:00:00`).toISOString()
      : new Date().toISOString();

    const newStopValue = parseFloat(this.elements.newStop?.value);


if (!isNaN(newStopValue) && newStopValue > 0) {
  if (direction === 'long' && newStopValue >= entryPrice) {
    showToast('⚠️ For a long trade, new stop should be below entry', 'error');
    return;
  }

  if (direction === 'short' && newStopValue <= entryPrice) {
    showToast('⚠️ For a short trade, new stop should be above entry', 'error');
    return;
  }
}

    const payload = {
      sharesClosed: sharesToClose,
      exitPrice,
      exitDate: closeDate,
      rMultiple,
      pnl,
      percentTrimmed: this.selectedTrimPercent,
      exitType: sharesToClose === remainingShares ? 'close' : 'trim',
      newStop:
        !isNaN(newStopValue) && newStopValue > 0
          ? newStopValue
          : null
    };

    try {
      const updatedTrade = await state.addJournalExit(this.currentTrade.id, payload);

      const sharesAfterTrim =
        updatedTrade?.remainingShares ??
        updatedTrade?.remaining_shares ??
        0;

      const isFullClose = Number(sharesAfterTrim) === 0;
      const actionText = isFullClose ? 'closed' : `trimmed ${this.selectedTrimPercent}%`;
      const emoji = pnl >= 0 ? '✅' : '📉';

      showToast(
        `${emoji} ${this.currentTrade.ticker} ${actionText}: ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}`,
        pnl >= 0 ? 'success' : 'warning'
      );

      state.emit('accountSizeChanged', state.account.currentSize);
      this.close();
    } catch (error) {
      console.error('Failed to save trim/close:', error);
      showToast('❌ Failed to save trim/close action', 'error');
    }
  }
}

export const trimModal = new TrimModal();