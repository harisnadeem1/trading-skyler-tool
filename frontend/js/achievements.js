/**
 * Achievements - display and notification manager
 * Backend is the source of truth for unlocks and progress.
 */

import { state } from './state.js';
import { confetti } from './confetti.js';
import { soundFx } from './soundFx.js';

const ACHIEVEMENTS = {
  first_steps: {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Log your first trade',
    icon: '🎯',
  },
  day_one: {
    id: 'day_one',
    name: 'Day One',
    description: 'Log a trade today',
    icon: '📅',
  },
  hot_streak: {
    id: 'hot_streak',
    name: 'Hot Streak',
    description: '3-day logging streak',
    icon: '🔥',
  }
};

const FUTURE_ACHIEVEMENTS = {
  getting_started: {
    id: 'getting_started',
    name: 'Getting Started',
    description: 'Log 5 trades',
    icon: '📈',
  },
  first_win: {
    id: 'first_win',
    name: 'First Win',
    description: 'Close a trade in profit',
    icon: '💰',
  },
  committed: {
    id: 'committed',
    name: 'Committed',
    description: 'Log 25 trades',
    icon: '🏆',
  },
  on_fire: {
    id: 'on_fire',
    name: 'On Fire',
    description: '7-day logging streak',
    icon: '🌟',
  }
};

class AchievementManager {
  constructor() {
    this.achievements = ACHIEVEMENTS;
    this.queue = [];
    this.isShowing = false;
  }

  init() {
    // No local unlock calculation anymore.
    // Backend decides unlocks. Frontend only displays them.
  }

  getProgress() {
    return state?.journalMeta?.achievements?.progress || {
      totalTrades: 0,
      lastTradeDate: null,
      currentStreak: 0,
      longestStreak: 0,
      tradesWithNotes: 0,
      tradesWithThesis: 0,
      completeWizardCount: 0,
    };
  }

  getSettings() {
    return state?.journalMeta?.settings || {};
  }

  getUnlockedList() {
    return state?.journalMeta?.achievements?.unlocked || [];
  }

  isUnlocked(id) {
    return this.getUnlockedList().some((a) =>
      a.id === id ||
      a.achievementKey === id
    );
  }

  handleBackendUnlocks(unlockedAchievements = []) {
    if (!Array.isArray(unlockedAchievements) || unlockedAchievements.length === 0) {
      return;
    }

    unlockedAchievements.forEach((item) => {
      const achievementId = item?.achievementKey || item?.id;
      if (!achievementId) return;

      const achievement = this.achievements[achievementId] || FUTURE_ACHIEVEMENTS[achievementId];
      if (!achievement) return;

      this.enqueueUnlock(achievement);
    });
  }

  enqueueUnlock(achievement) {
    this.queue.push(achievement);

    const settings = this.getSettings();

    if (settings.celebrationsEnabled) {
      confetti.rain(30);
    }

    if (settings.soundEnabled && typeof soundFx?.playAchievement === 'function') {
      try {
        soundFx.playAchievement();
      } catch (error) {
        console.warn('Achievement sound failed:', error);
      }
    }

    if (!this.isShowing) {
      this.showNext();
    }
  }

  showNext() {
    if (!this.queue.length) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const achievement = this.queue[0];

    this.showAchievementToast(achievement);

    setTimeout(() => {
      this.queue.shift();
      this.showNext();
    }, 3500);
  }

  showAchievementToast(achievement) {
    const container =
      document.getElementById('toastContainerTop') ||
      document.getElementById('toastContainer');

    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast--achievement';
    toast.innerHTML = `
      <span class="toast__icon">${achievement.icon}</span>
      <div class="toast__content">
        <strong class="toast__title">Achievement Unlocked!</strong>
        <span class="toast__text">${achievement.name}</span>
      </div>
      <button class="toast__close" aria-label="Close">×</button>
    `;

    const removeToast = () => {
      if (!toast.parentElement) return;
      toast.classList.add('toast--hiding');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast__close')?.addEventListener('click', removeToast, { once: true });

    container.appendChild(toast);

    setTimeout(removeToast, 3000);
  }

  getAll() {
    const unlockedList = this.getUnlockedList();

    return Object.values(this.achievements).map((achievement) => {
      const unlockedRow = unlockedList.find((a) =>
        a.id === achievement.id || a.achievementKey === achievement.id
      );

      return {
        ...achievement,
        unlocked: Boolean(unlockedRow),
        unlockedAt: unlockedRow?.unlockedAt || null,
      };
    });
  }

  getUnlockedCount() {
    return this.getUnlockedList().length;
  }

  getTotalCount() {
    return Object.keys(this.achievements).length;
  }
}

export const achievements = new AchievementManager();
export { AchievementManager, ACHIEVEMENTS };