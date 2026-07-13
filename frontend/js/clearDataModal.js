import { state } from './state.js';
import { dataManager } from './dataManager.js';

class ClearDataModal {
  constructor() {
    this.elements = {};
    this.isSubmitting = false;
  }

  init() {
    this.elements = {
      modal: document.getElementById('clearDataModal'),
      overlay: document.getElementById('clearDataModalOverlay'),
      closeBtn: document.getElementById('closeClearDataBtn'),
      cancelBtn: document.getElementById('cancelClearDataBtn'),
      confirmBtn: document.getElementById('confirmClearDataBtn'),
      tradeCount: document.getElementById('clearDataTradeCount'),
      achievementCount: document.getElementById('clearDataAchievementCount'),
      confirmInput: document.getElementById('clearDataConfirmInput'),
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());
    this.elements.cancelBtn?.addEventListener('click', () => this.close());

    this.elements.confirmBtn?.addEventListener('click', async () => {
      if (this.isSubmitting) return;
      if (!this.isTypedConfirmationValid()) return;

      this.setSubmitting(true);
      try {
        await dataManager.confirmClearAllData();
      } finally {
        this.setSubmitting(false);
      }
    });

    this.elements.confirmInput?.addEventListener('input', () => {
      this.syncConfirmButtonState();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen() && !this.isSubmitting) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open');
  }

  isTypedConfirmationValid() {
    if (!this.elements.confirmInput) return true;
    return this.elements.confirmInput.value.trim() === 'CLEAR';
  }

  syncConfirmButtonState() {
    if (!this.elements.confirmBtn || this.isSubmitting) return;
    this.elements.confirmBtn.disabled = !this.isTypedConfirmationValid();
  }

  setSubmitting(submitting) {
    this.isSubmitting = submitting;

    if (this.elements.confirmBtn) {
      this.elements.confirmBtn.disabled = submitting || !this.isTypedConfirmationValid();
      this.elements.confirmBtn.textContent = submitting ? 'Clearing...' : 'Clear All Data';
    }

    if (this.elements.cancelBtn) this.elements.cancelBtn.disabled = submitting;
    if (this.elements.closeBtn) this.elements.closeBtn.disabled = submitting;
    if (this.elements.confirmInput) this.elements.confirmInput.disabled = submitting;
  }

  open() {
    if (!this.elements.modal) return;

    const tradeCount = Array.isArray(state.journal?.entries) ? state.journal.entries.length : 0;
    const unlocked = state.journalMeta?.achievements?.unlocked;
    const progress = state.journalMeta?.achievements?.progress;

    const achievementCount = Array.isArray(unlocked) ? unlocked.length : 0;
    const streak = Number(progress?.currentStreak ?? progress?.current_streak ?? 0);

    if (this.elements.tradeCount) {
      this.elements.tradeCount.textContent =
        tradeCount === 0
          ? 'No trades logged'
          : `${tradeCount} trade${tradeCount !== 1 ? 's' : ''} will be deleted`;
    }

    if (this.elements.achievementCount) {
      const parts = [];
      if (achievementCount > 0) parts.push(`${achievementCount} badge${achievementCount !== 1 ? 's' : ''}`);
      if (streak > 0) parts.push(`${streak}-day streak`);

      this.elements.achievementCount.textContent =
        parts.length > 0
          ? `${parts.join(' and ')} will be reset`
          : 'No achievements unlocked';
    }

    if (this.elements.confirmInput) {
      this.elements.confirmInput.value = '';
    }

    this.isSubmitting = false;
    this.elements.modal.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';

    this.setSubmitting(false);
    this.syncConfirmButtonState();

    this.elements.confirmInput?.focus();
  }

  close() {
    if (this.isSubmitting) return;

    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }
}

export const clearDataModal = new ClearDataModal();