/**
 * Trade Wizard - Guided trade logging with thesis prompts
 */

import { state } from './state.js';
import { showToast } from './ui.js';
import { formatCurrency, formatNumber, formatPercent } from './utils.js';

class TradeWizard {
  constructor() {
    this.elements = {};
    this.currentStep = 1;
    this.totalSteps = 4;
    this.skippedSteps = [];

    this.thesis = {
      setupType: null,
      theme: null,
      conviction: null,
      entryType: null,
      riskReasoning: null
    };

    this.notes = '';
  }

  init() {
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.elements = {
      modal: document.getElementById('wizardModal'),
      overlay: document.getElementById('wizardModalOverlay'),
      closeBtn: document.getElementById('closeWizardBtn'),

      progressSteps: document.querySelectorAll('.wizard-progress__step'),
      connectors: document.querySelectorAll('.wizard-progress__connector'),

      steps: document.querySelectorAll('.wizard-step'),

      wizardTickerInput: document.getElementById('wizardTickerInput'),
      wizardTickerHint: document.getElementById('wizardTickerHint'),
      wizardDirection: document.getElementById('wizardDirection'),
      wizardEntry: document.getElementById('wizardEntry'),
      wizardStop: document.getElementById('wizardStop'),
      wizardShares: document.getElementById('wizardShares'),
      wizardPosition: document.getElementById('wizardPosition'),
      wizardRisk: document.getElementById('wizardRisk'),
      wizardTarget: document.getElementById('wizardTarget'),
      skipAllBtn: document.getElementById('wizardSkipAll'),
      next1Btn: document.getElementById('wizardNext1'),

      setupBtns: document.querySelectorAll('[data-setup]'),
      themeInput: document.getElementById('wizardTheme'),
      convictionStars: document.querySelectorAll('.wizard-star'),
      back2Btn: document.getElementById('wizardBack2'),
      skip2Btn: document.getElementById('wizardSkip2'),
      next2Btn: document.getElementById('wizardNext2'),

      entryTypeBtns: document.querySelectorAll('[data-entry-type]'),
      riskReasoningInput: document.getElementById('wizardRiskReasoning'),
      notesInput: document.getElementById('wizardNotes'),
      back3Btn: document.getElementById('wizardBack3'),
      skip3Btn: document.getElementById('wizardSkip3'),
      next3Btn: document.getElementById('wizardNext3'),

      confirmTicker: document.getElementById('wizardConfirmTicker'),
      confirmPosition: document.getElementById('wizardConfirmPosition'),
      confirmRisk: document.getElementById('wizardConfirmRisk'),
      confirmSetupRow: document.getElementById('wizardConfirmSetupRow'),
      confirmSetup: document.getElementById('wizardConfirmSetup'),
      confirmThemeRow: document.getElementById('wizardConfirmThemeRow'),
      confirmTheme: document.getElementById('wizardConfirmTheme'),
      confirmEntryTypeRow: document.getElementById('wizardConfirmEntryTypeRow'),
      confirmEntryType: document.getElementById('wizardConfirmEntryType'),
      streakDisplay: document.getElementById('wizardStreakDisplay'),
      streakText: document.getElementById('wizardStreakText'),
      back4Btn: document.getElementById('wizardBack4'),
      confirmBtn: document.getElementById('wizardConfirmBtn'),

      confettiCanvas: document.getElementById('confettiCanvas')
    };
  }

  bindEvents() {
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.nextStep();
      }
    });

    this.elements.skipAllBtn?.addEventListener('click', async () => {
      if (this.validateTicker()) await this.skipAll();
    });
    this.elements.next1Btn?.addEventListener('click', () => {
      if (this.validateTicker()) this.goToStep(2);
    });

    this.elements.back2Btn?.addEventListener('click', () => this.goToStep(1));
    this.elements.skip2Btn?.addEventListener('click', () => this.skipStep(2));
    this.elements.next2Btn?.addEventListener('click', () => this.goToStep(3));

    this.elements.back3Btn?.addEventListener('click', () => this.goToStep(2));
    this.elements.skip3Btn?.addEventListener('click', () => this.skipStep(3));
    this.elements.next3Btn?.addEventListener('click', () => this.goToStep(4));

    this.elements.back4Btn?.addEventListener('click', () => this.goToStep(3));
    this.elements.confirmBtn?.addEventListener('click', async () => this.confirmTrade());

    this.elements.setupBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.elements.setupBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.thesis.setupType = btn.dataset.setup;
      });
    });

    this.elements.entryTypeBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.elements.entryTypeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.thesis.entryType = btn.dataset.entryType;
      });
    });

    this.elements.convictionStars?.forEach((star) => {
      star.addEventListener('click', () => {
        const level = parseInt(star.dataset.conviction, 10);
        this.thesis.conviction = level;
        this.elements.convictionStars.forEach((s, i) => {
          s.classList.toggle('active', i < level);
        });
      });
    });

    this.elements.wizardTickerInput?.addEventListener('input', () => {
      const ticker = this.elements.wizardTickerInput.value.toUpperCase();
      this.elements.wizardTickerInput.value = ticker;
      this.updateTickerHint();
      state.updateTrade({ ticker });
    });
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open');
  }

  open() {
    if (!this.elements.modal) return;

    this.currentStep = 1;
    this.skippedSteps = [];
    this.thesis = {
      setupType: null,
      theme: null,
      conviction: null,
      entryType: null,
      riskReasoning: null
    };
    this.notes = '';

    this.resetForm();
    this.prefillFromCalculator();

    this.elements.modal.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';

    this.showStep(1);
  }

  close() {
    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  resetForm() {
    this.elements.setupBtns?.forEach((b) => b.classList.remove('active'));
    this.elements.entryTypeBtns?.forEach((b) => b.classList.remove('active'));
    this.elements.convictionStars?.forEach((s) => s.classList.remove('active'));

    if (this.elements.themeInput) this.elements.themeInput.value = '';
    if (this.elements.riskReasoningInput) this.elements.riskReasoningInput.value = '';
    if (this.elements.notesInput) this.elements.notesInput.value = '';

    this.elements.progressSteps?.forEach((step) => {
      step.classList.remove('active', 'completed');
    });
    this.elements.progressSteps?.[0]?.classList.add('active');
  }

  updateTickerHint() {
    const hasValue = this.elements.wizardTickerInput?.value.trim().length > 0;
    if (this.elements.wizardTickerHint) {
      this.elements.wizardTickerHint.style.display = hasValue ? 'none' : 'block';
    }
    if (this.elements.wizardTickerInput) {
      this.elements.wizardTickerInput.classList.toggle('wizard-ticker-input--empty', !hasValue);
    }
  }

  validateTicker() {
    const ticker = this.elements.wizardTickerInput?.value.trim();
    if (!ticker) {
      this.elements.wizardTickerInput?.classList.add('wizard-ticker-input--shake');
      this.elements.wizardTickerInput?.focus();
      setTimeout(() => {
        this.elements.wizardTickerInput?.classList.remove('wizard-ticker-input--shake');
      }, 500);
      return false;
    }
    return true;
  }

  prefillFromCalculator() {
    const trade = state.trade;
    const results = state.results;
    const account = state.account;

    if (this.elements.wizardTickerInput) {
      this.elements.wizardTickerInput.value = trade.ticker || '';
      this.updateTickerHint();
    }
    if (this.elements.wizardEntry) {
      this.elements.wizardEntry.textContent = formatCurrency(trade.entry || 0);
    }
    if (this.elements.wizardStop) {
      this.elements.wizardStop.textContent = formatCurrency(trade.stop || 0);
    }
    if (this.elements.wizardShares) {
      this.elements.wizardShares.textContent = formatNumber(results.shares || 0);
    }
    if (this.elements.wizardPosition) {
      this.elements.wizardPosition.textContent = formatCurrency(results.positionSize || 0);
    }
    if (this.elements.wizardRisk) {
      this.elements.wizardRisk.textContent = formatCurrency(results.riskDollars || 0);
    }
    if (this.elements.wizardTarget) {
      this.elements.wizardTarget.textContent = trade.target ? formatCurrency(trade.target) : '—';
    }

    if (this.elements.confirmTicker) {
      this.elements.confirmTicker.textContent = trade.ticker || 'No Ticker';
    }
    if (this.elements.confirmPosition) {
      const directionLabel = (trade.direction ?? 'long').toUpperCase();
      this.elements.confirmPosition.textContent =
        `${directionLabel} · ${formatNumber(results.shares || 0)} shares @ ${formatCurrency(trade.entry || 0)}`;
    }
    if (this.elements.wizardDirection) {
  this.elements.wizardDirection.textContent =
    (trade.direction ?? 'long').toUpperCase();
}
    if (this.elements.confirmRisk) {
      this.elements.confirmRisk.textContent =
        `${formatCurrency(results.riskDollars || 0)} (${formatPercent(account.riskPercent || 0)})`;
    }
  }

  showStep(step) {
    this.currentStep = step;

    this.elements.steps?.forEach((stepEl, i) => {
      const stepNum = i + 1;
      stepEl.classList.remove('active', 'exit-left');
      if (stepNum === step) {
        stepEl.classList.add('active');
      }
    });

    this.elements.progressSteps?.forEach((progressStep, i) => {
      const stepNum = i + 1;
      progressStep.classList.remove('active', 'completed');
      if (stepNum < step) {
        progressStep.classList.add('completed');
      } else if (stepNum === step) {
        progressStep.classList.add('active');
      }
    });

    if (step === 4) {
      this.updateConfirmation();
    }
  }

  goToStep(step) {
    if (step < 1 || step > this.totalSteps) return;
    this.collectStepData();
    this.showStep(step);
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.goToStep(this.currentStep + 1);
    } else {
      this.confirmTrade();
    }
  }

  skipStep(step) {
    if (!this.skippedSteps.includes(step)) {
      this.skippedSteps.push(step);
    }
    this.goToStep(step + 1);
  }

  async skipAll() {
    await this.logTrade(false);
    this.close();
  }

  collectStepData() {
    if (this.currentStep === 2) {
      this.thesis.theme = this.elements.themeInput?.value.trim() || null;
    }

    if (this.currentStep === 3) {
      this.thesis.riskReasoning = this.elements.riskReasoningInput?.value.trim() || null;
      this.notes = this.elements.notesInput?.value.trim() || '';
    }
  }

  updateConfirmation() {
    const ticker = this.elements.wizardTickerInput?.value.trim() || '';
    if (this.elements.confirmTicker) {
      this.elements.confirmTicker.textContent = ticker || 'No Ticker';
      this.elements.confirmTicker.classList.toggle('wizard-confirmation__ticker--empty', !ticker);
    }

    if (this.thesis.setupType) {
      this.elements.confirmSetupRow.style.display = 'flex';
      this.elements.confirmSetup.textContent = this.thesis.setupType.toUpperCase();
    } else {
      this.elements.confirmSetupRow.style.display = 'none';
    }

    if (this.thesis.theme) {
      this.elements.confirmThemeRow.style.display = 'flex';
      this.elements.confirmTheme.textContent = this.thesis.theme;
    } else {
      this.elements.confirmThemeRow.style.display = 'none';
    }

    if (this.thesis.entryType) {
      this.elements.confirmEntryTypeRow.style.display = 'flex';
      this.elements.confirmEntryType.textContent =
        this.thesis.entryType.charAt(0).toUpperCase() + this.thesis.entryType.slice(1);
    } else {
      this.elements.confirmEntryTypeRow.style.display = 'none';
    }

    const progress = state.journalMeta.achievements.progress;
    const today = new Date().toDateString();
    const lastDate = progress.lastTradeDate
      ? new Date(progress.lastTradeDate).toDateString()
      : null;

    if (lastDate !== today && progress.currentStreak > 0) {
      this.elements.streakDisplay.style.display = 'flex';
      this.elements.streakText.textContent = `${progress.currentStreak + 1} day streak!`;
    } else if (!lastDate) {
      this.elements.streakDisplay.style.display = 'flex';
      this.elements.streakText.textContent = 'Start your streak!';
    } else {
      this.elements.streakDisplay.style.display = 'none';
    }
  }

  async confirmTrade() {
    this.collectStepData();
    await this.logTrade(true);
    this.close();
  }

  async logTrade(wizardComplete = false) {
    const trade = state.trade;
    const results = state.results;
    const account = state.account;

    const entry = {
      ticker: this.elements.wizardTickerInput?.value.trim() || trade.ticker,
      direction: trade.direction ?? 'long',
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
      riskPercent: account.riskPercent,
      stopDistance: results.stopDistance,
      notes: this.notes || trade.notes || '',
      status: 'open',
      exitPrice: null,
      exitDate: null,
      pnl: null,
      totalRealizedPnL: 0,
      thesis: this.hasThesisData() ? { ...this.thesis } : null,
      wizardComplete,
      wizardSkipped: [...this.skippedSteps]
    };

    try {
      const newEntry = await state.addJournalEntry(entry);

      const progress = state.journalMeta.achievements.progress;
      progress.totalTrades += 1;

      if (this.notes) {
        progress.tradesWithNotes += 1;
      }
      if (this.hasThesisData()) {
        progress.tradesWithThesis += 1;
      }
      if (wizardComplete && this.skippedSteps.length === 0) {
        progress.completeWizardCount += 1;
      }

      state.updateStreak();

      state.emit('tradeLogged', {
  entry: newEntry,
  wizardComplete,
  thesis: this.thesis,
  direction: newEntry.direction ?? trade.direction ?? 'long'
});

      this.showSuccessToast();

      if (state.settings.celebrationsEnabled) {
        state.emit('triggerConfetti');
      }
    } catch (error) {
      console.error('Failed to log wizard trade:', error);
      showToast('❌ Failed to log trade', 'error');
    }
  }

  hasThesisData() {
    return (
      this.thesis.setupType ||
      this.thesis.theme ||
      this.thesis.conviction ||
      this.thesis.entryType ||
      this.thesis.riskReasoning
    );
  }

  showSuccessToast() {
    const messages = [
      '✅ Trade logged! Good luck!',
      '🎯 Nice setup! Tracked.',
      "🔥 You're on a roll! Trade saved.",
      '📝 Disciplined trader! Logged.',
      "✅ Trade captured! Let's go!"
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];
    showToast(message, 'success');
  }
}

export const wizard = new TradeWizard();
export { TradeWizard };