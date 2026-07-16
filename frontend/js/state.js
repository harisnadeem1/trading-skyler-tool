/**
 * State Management - Centralized app state with event system
 */

import { api } from './api.js';
import { buildTradeEntryFromManualInput } from './tradeEntryFactory.js';

class AppState {
  constructor() {
    this.state = this.getDefaultState();
    this.listeners = new Map();
  }

  getDefaultState() {
    return {
      settings: {
        startingAccountSize: 10000,
        currentAccountSize: 10000,
        realizedPnL: 0,
        defaultRiskPercent: 1,
        defaultMaxPositionPercent: 100,
        dynamicAccountEnabled: true,
        theme: 'dark',
        sarMember: true,
        wizardEnabled: true,
        celebrationsEnabled: true,
        soundEnabled: false,
        compoundSettings: {},
      },

      account: {
        currentSize: 10000,
        realizedPnL: 0,
        riskPercent: 1,
        maxPositionPercent: 100,
      },

      trade: {
        ticker: '',
        entry: null,
        stop: null,
        target: null,
        notes: '',
        direction: 'long',
      },

      results: {
        shares: 0,
        positionSize: 0,
        riskDollars: 0,
        stopDistance: 0,
        stopPerShare: 0,
        rMultiple: null,
        target5R: null,
        profit: null,
        roi: null,
        riskReward: null,
        isLimited: false,
        percentOfAccount: 0,
      },

      journal: {
        entries: [],
        filter: 'all',
      },

      journalMeta: {
        achievements: {
          unlocked: [],
          progress: {
            totalTrades: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastTradeDate: null,
            tradesWithNotes: 0,
            tradesWithThesis: 0,
            completeWizardCount: 0,
          },
        },
        settings: {
          wizardEnabled: true,
          celebrationsEnabled: true,
        },
        schemaVersion: 1,
      },

      ui: {
        scenariosExpanded: false,
        alertExpanded: false,
        settingsOpen: false,
        journalOpen: false,
      },
    };
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => callback(data));
    }
  }

  applyTheme(theme) {
    const resolvedTheme =
      theme === 'system'
        ? (
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
          )
          ? 'dark'
          : 'light'
        : theme || 'dark';

    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }

  mapBackendSettings(row) {
    if (!row) return;

    this.state.settings = {
      ...this.state.settings,
      startingAccountSize: Number(row.starting_account_size ?? 10000),
      currentAccountSize: Number(row.current_account_size ?? 10000),
      realizedPnL: Number(row.realized_pnl ?? 0),
      defaultRiskPercent: Number(row.default_risk_percent ?? 1),
      defaultMaxPositionPercent: Number(row.default_max_position_percent ?? 100),
      dynamicAccountEnabled: !!row.dynamic_account_enabled,
      theme: row.theme ?? 'dark',
      sarMember: !!row.sar_member,
      wizardEnabled: !!row.wizard_enabled,
      celebrationsEnabled: !!row.celebrations_enabled,
      soundEnabled: !!row.sound_enabled,
      compoundSettings: row.compound_settings ?? {},
    };

    this.state.account.realizedPnL = this.state.settings.realizedPnL;
    this.state.account.currentSize = this.state.settings.currentAccountSize;
    this.state.account.riskPercent = this.state.settings.defaultRiskPercent;
    this.state.account.maxPositionPercent = this.state.settings.defaultMaxPositionPercent;
  }

mapBackendJournal(entries = []) {
  this.state.journal.entries = entries.map((entry) => ({
    ...entry,
    direction: entry.direction ?? 'long',
    entry: entry.entry ?? entry.entry_price,
    stop: entry.stop ?? entry.stop_price,
    target: entry.target ?? entry.target_price,
    originalStop: entry.originalStop ?? entry.original_stop,
    currentStop: entry.currentStop ?? entry.current_stop,
    originalShares: entry.originalShares ?? entry.original_shares,
    remainingShares: entry.remainingShares ?? entry.remaining_shares,
    exitPrice: entry.exitPrice ?? entry.exit_price,
    exitDate: entry.exitDate ?? entry.exit_date,
    positionSize: entry.positionSize ?? entry.position_size,
    riskDollars: entry.riskDollars ?? entry.risk_dollars,
    riskPercent: entry.riskPercent ?? entry.risk_percent,
    stopDistance: entry.stopDistance ?? entry.stop_distance,
    totalRealizedPnL: entry.totalRealizedPnL ?? entry.total_realized_pnl ?? 0,
    wizardComplete: entry.wizardComplete ?? entry.wizard_complete ?? false,
    wizardSkipped: entry.wizardSkipped ?? entry.wizard_skipped ?? [],
    trimHistory: entry.trimHistory ?? entry.trim_history ?? [],
    timestamp: entry.timestamp ?? entry.opened_at ?? entry.created_at,
  }));

  this.recalculateAccountFromJournal({ emitEvent: false });
}

  mapBackendJournalMeta(meta) {
    if (!meta) return;

    const progress = meta.achievements?.progress || {};
    const unlocked = meta.achievements?.unlocked || [];

    this.state.journalMeta = {
      achievements: {
        unlocked: unlocked.map((a) => ({
          id: a.id || a.achievement_key,
          achievementKey: a.achievement_key || a.id,
          unlockedAt: a.unlockedAt || a.unlocked_at,
          notified: !!a.notified,
        })),
        progress: {
          totalTrades: Number(progress.total_trades ?? progress.totalTrades ?? 0),
          currentStreak: Number(progress.current_streak ?? progress.currentStreak ?? 0),
          longestStreak: Number(progress.longest_streak ?? progress.longestStreak ?? 0),
          lastTradeDate: progress.last_trade_date ?? progress.lastTradeDate ?? null,
          tradesWithNotes: Number(progress.trades_with_notes ?? progress.tradesWithNotes ?? 0),
          tradesWithThesis: Number(progress.trades_with_thesis ?? progress.tradesWithThesis ?? 0),
          completeWizardCount: Number(
            progress.complete_wizard_count ?? progress.completeWizardCount ?? 0
          ),
        },
      },
      settings: {
        wizardEnabled: this.state.settings.wizardEnabled,
        celebrationsEnabled: this.state.settings.celebrationsEnabled,
      },
      schemaVersion: meta.schemaVersion ?? progress.schema_version ?? 1,
    };
  }

  async hydrate() {
  const [settingsRes, journalRes, metaRes] = await Promise.allSettled([
    api.get('/user/settings'),
    api.get('/user/journal'),
    api.get('/user/journal-meta'),
  ]);

  if (settingsRes.status === 'fulfilled') {
    this.mapBackendSettings(settingsRes.value?.settings);
  }

  if (journalRes.status === 'fulfilled') {
    this.mapBackendJournal(journalRes.value?.entries || []);
  }

  if (metaRes.status === 'fulfilled') {
    this.mapBackendJournalMeta(metaRes.value?.meta);
  }

  this.applyTheme(this.state.settings.theme);
  this.emit('journalHydrated', this.state.journal.entries);

  this.emit('accountChanged', { old: null, new: this.state.account });

}

  async updateSettings(updates) {
    const payload = {
      startingAccountSize: updates.startingAccountSize ?? this.state.settings.startingAccountSize,
      currentAccountSize: updates.currentAccountSize ?? this.state.account.currentSize,
      realizedPnL: updates.realizedPnL ?? this.state.account.realizedPnL,
      defaultRiskPercent: updates.defaultRiskPercent ?? this.state.settings.defaultRiskPercent,
      defaultMaxPositionPercent:
        updates.defaultMaxPositionPercent ?? this.state.settings.defaultMaxPositionPercent,
      dynamicAccountEnabled:
        updates.dynamicAccountEnabled ?? this.state.settings.dynamicAccountEnabled,
      theme: updates.theme ?? this.state.settings.theme,
      sarMember: updates.sarMember ?? this.state.settings.sarMember,
      wizardEnabled: updates.wizardEnabled ?? this.state.settings.wizardEnabled,
      celebrationsEnabled:
        updates.celebrationsEnabled ?? this.state.settings.celebrationsEnabled,
      soundEnabled: updates.soundEnabled ?? this.state.settings.soundEnabled,
      compoundSettings: updates.compoundSettings ?? this.state.settings.compoundSettings,
    };

    const oldAccount = { ...this.state.account };

    const result = await api.patch('/user/settings', payload);
    this.mapBackendSettings(result.settings);

    this.applyTheme(this.state.settings.theme);

    this.emit('settingsChanged', this.state.settings);
    this.emit('accountChanged', { old: oldAccount, new: this.state.account });

    return this.state.settings;
  }

  updateAccount(updates) {
    const oldAccount = { ...this.state.account };
    Object.assign(this.state.account, updates);
    this.emit('accountChanged', { old: oldAccount, new: this.state.account });
  }

  updateTrade(updates) {
    Object.assign(this.state.trade, updates);
    this.emit('tradeChanged', this.state.trade);
  }

  updateResults(results) {
  this.state.results = { ...this.state.results, ...results };
  this.emit('resultsChanged', this.state.results);
  this.emit('resultsRendered', this.state.results);
}

async addManualJournalEntry(input) {
  const finalInput = {
    ...input,
    shares: Number(this.state.results.shares ?? input.shares ?? 0),
    entry: Number(this.state.trade.entry ?? input.entry ?? 0),
    stop: Number(this.state.trade.stop ?? input.stop ?? 0),
    target: this.state.trade.target ?? input.target ?? null,
    direction: this.state.trade.direction ?? input.direction ?? 'long',
    ticker: this.state.trade.ticker ?? input.ticker ?? '',
    notes: input.notes ?? this.state.trade.notes ?? '',
  };

  const entry = buildTradeEntryFromManualInput(finalInput, this.state.account);
  return this.addJournalEntry(entry);
}

  async addJournalEntry(entry) {
  const result = await api.post('/user/journal', entry);

  const newEntry = {
    ...result.entry,
    direction: result.entry.direction ?? 'long',
    entry: result.entry.entry ?? result.entry.entry_price,
    stop: result.entry.stop ?? result.entry.stop_price,
    target: result.entry.target ?? result.entry.target_price,
    originalStop:
      result.entry.originalStop ??
      result.entry.original_stop ??
      result.entry.stop ??
      result.entry.stop_price,
    currentStop:
      result.entry.currentStop ??
      result.entry.current_stop ??
      result.entry.stop ??
      result.entry.stop_price,
    originalShares:
      result.entry.originalShares ??
      result.entry.original_shares ??
      result.entry.shares ??
      0,
    remainingShares:
      result.entry.remainingShares ??
      result.entry.remaining_shares ??
      result.entry.shares ??
      0,
    exitPrice: result.entry.exitPrice ?? result.entry.exit_price,
    exitDate: result.entry.exitDate ?? result.entry.exit_date,
    positionSize: result.entry.positionSize ?? result.entry.position_size,
    riskDollars: result.entry.riskDollars ?? result.entry.risk_dollars,
    riskPercent: result.entry.riskPercent ?? result.entry.risk_percent,
    stopDistance: result.entry.stopDistance ?? result.entry.stop_distance,
    totalRealizedPnL:
      result.entry.totalRealizedPnL ??
      result.entry.total_realized_pnl ??
      0,
    wizardComplete:
      result.entry.wizardComplete ??
      result.entry.wizard_complete ??
      false,
    wizardSkipped:
      result.entry.wizardSkipped ??
      result.entry.wizard_skipped ??
      [],
    trimHistory:
      result.entry.trimHistory ??
      result.entry.trim_history ??
      [],
    timestamp:
      result.entry.timestamp ??
      result.entry.opened_at ??
      result.entry.created_at,
  };

  this.state.journal.entries.unshift(newEntry);

  if (result.achievement_progress) {
    this.state.journalMeta.achievements.progress = {
      totalTrades: Number(result.achievement_progress.totalTrades ?? 0),
      currentStreak: Number(result.achievement_progress.currentStreak ?? 0),
      longestStreak: Number(result.achievement_progress.longestStreak ?? 0),
      lastTradeDate: result.achievement_progress.lastTradeDate ?? null,
      tradesWithNotes: Number(result.achievement_progress.tradesWithNotes ?? 0),
      tradesWithThesis: Number(result.achievement_progress.tradesWithThesis ?? 0),
      completeWizardCount: Number(result.achievement_progress.completeWizardCount ?? 0),
      schemaVersion: Number(result.achievement_progress.schemaVersion ?? 1),
      updatedAt: result.achievement_progress.updatedAt ?? null,
    };
  }

  if (Array.isArray(result.new_achievements) && result.new_achievements.length) {
    const existing = new Set(
      (this.state.journalMeta.achievements.unlocked || []).map(
        (a) => a.achievementKey || a.id
      )
    );

    result.new_achievements.forEach((achievement) => {
      const normalized = {
        id: achievement.id || achievement.achievementKey,
        achievementKey: achievement.achievementKey || achievement.id,
        unlockedAt: achievement.unlockedAt || new Date().toISOString(),
        notified: !!achievement.notified,
      };

      const key = normalized.achievementKey || normalized.id;
      if (!existing.has(key)) {
        this.state.journalMeta.achievements.unlocked.push(normalized);
        existing.add(key);
      }
    });
  }

  this.recalculateAccountFromJournal();
  this.emit('journalEntryAdded', newEntry);
  this.emit('journalMetaChanged', this.state.journalMeta);

  return {
    entry: newEntry,
    newAchievements: result.new_achievements || [],
    achievementProgress: this.state.journalMeta.achievements.progress,
  };
}

async updateJournalEntry(id, updates) {
  const result = await api.patch(`/user/journal/${id}`, updates);
  const updated = result?.entry ?? result ?? {};

  const index = this.state.journal.entries.findIndex((e) => String(e.id) === String(id));
  if (index === -1) return null;

  const existing = this.state.journal.entries[index];

  const merged = {
    ...existing,
    ...updated,
    direction: updated.direction ?? existing.direction ?? 'long',

    entry: updated.entry ?? updated.entry_price ?? existing.entry ?? existing.entry_price ?? null,
    stop: updated.stop ?? updated.stop_price ?? existing.stop ?? existing.stop_price ?? null,
    target: updated.target ?? updated.target_price ?? existing.target ?? existing.target_price ?? null,

    originalStop:
      updated.originalStop ?? updated.original_stop ??
      existing.originalStop ?? existing.original_stop ?? null,

    currentStop:
      updated.currentStop ?? updated.current_stop ??
      updated.stop ?? updated.stop_price ??
      existing.currentStop ?? existing.current_stop ??
      existing.stop ?? existing.stop_price ?? null,

    shares:
      updated.shares ?? existing.shares ?? 0,

    originalShares:
      updated.originalShares ?? updated.original_shares ??
      existing.originalShares ?? existing.original_shares ??
      updated.shares ?? existing.shares ?? 0,

    remainingShares:
      updated.remainingShares ?? updated.remaining_shares ??
      existing.remainingShares ?? existing.remaining_shares ??
      updated.shares ?? existing.shares ?? 0,

    exitPrice:
      updated.exitPrice ?? updated.exit_price ??
      existing.exitPrice ?? existing.exit_price ?? null,

    exitDate:
      updated.exitDate ?? updated.exit_date ??
      existing.exitDate ?? existing.exit_date ?? null,

    positionSize:
      updated.positionSize ?? updated.position_size ??
      existing.positionSize ?? existing.position_size ?? 0,

    riskDollars:
      updated.riskDollars ?? updated.risk_dollars ??
      existing.riskDollars ?? existing.risk_dollars ?? 0,

    riskPercent:
      updated.riskPercent ?? updated.risk_percent ??
      existing.riskPercent ?? existing.risk_percent ?? 0,

    stopDistance:
      updated.stopDistance ?? updated.stop_distance ??
      existing.stopDistance ?? existing.stop_distance ?? 0,

    totalRealizedPnL:
      updated.totalRealizedPnL ?? updated.total_realized_pnl ??
      existing.totalRealizedPnL ?? existing.total_realized_pnl ?? 0,

    wizardComplete:
      updated.wizardComplete ?? updated.wizard_complete ??
      existing.wizardComplete ?? existing.wizard_complete ?? false,

    wizardSkipped:
      updated.wizardSkipped ?? updated.wizard_skipped ??
      existing.wizardSkipped ?? existing.wizard_skipped ?? [],

    trimHistory:
      updated.trimHistory ?? updated.trim_history ??
      existing.trimHistory ?? existing.trim_history ??
      existing.exits ?? [],

    trim_history:
      updated.trim_history ?? updated.trimHistory ??
      existing.trim_history ?? existing.trimHistory ??
      existing.exits ?? [],

    exits:
      updated.exits ??
      existing.exits ??
      existing.trimHistory ??
      existing.trim_history ??
      [],

    timestamp:
      updated.timestamp ?? updated.opened_at ?? updated.created_at ??
      existing.timestamp ?? existing.opened_at ?? existing.created_at ?? null,
  };

  this.state.journal.entries[index] = merged;

  this.recalculateAccountFromJournal();
  this.emit('journalEntryUpdated', merged);
  return merged;
}
  async deleteJournalEntry(id) {
    await api.delete(`/user/journal/${id}`);

    const index = this.state.journal.entries.findIndex((e) => String(e.id) === String(id));
    if (index > -1) {
      const deleted = this.state.journal.entries.splice(index, 1)[0];
      this.recalculateAccountFromJournal();
      this.emit('journalEntryDeleted', deleted);
      return deleted;
    }

    return null;
  }
async addJournalExit(id, payload) {
  const normalizedPayload = {
    sharesClosed: Number(payload.sharesClosed ?? payload.shares ?? 0),
    exitPrice: Number(payload.exitPrice ?? 0),
    exitDate: payload.exitDate ?? new Date().toISOString(),
    rMultiple: Number(payload.rMultiple ?? 0),
    pnl: Number(payload.pnl ?? 0),
    percentTrimmed: Number(payload.percentTrimmed ?? 0),
    exitType: payload.exitType ?? 'trim',
    newStop: payload.newStop ?? null,
  };

  const result = await api.post(`/user/journal/${id}/exits`, normalizedPayload);

  const index = this.state.journal.entries.findIndex((e) => String(e.id) === String(id));
  if (index > -1) {
    const existing = this.state.journal.entries[index];
    const updatedEntry = result.entry;
    const createdExit = result.exit;

    const trimHistory = Array.isArray(existing.trimHistory) ? [...existing.trimHistory] : [];
    trimHistory.push(createdExit);

    this.state.journal.entries[index] = {
  ...existing,
  ...updatedEntry,
  direction: updatedEntry.direction ?? existing.direction ?? 'long',
  entry: updatedEntry.entry ?? updatedEntry.entry_price,
  stop: updatedEntry.stop ?? updatedEntry.stop_price,
  target: updatedEntry.target ?? updatedEntry.target_price,
  originalStop: updatedEntry.originalStop ?? updatedEntry.original_stop,
  currentStop: updatedEntry.currentStop ?? updatedEntry.current_stop,
  originalShares: updatedEntry.originalShares ?? updatedEntry.original_shares,
  remainingShares: updatedEntry.remainingShares ?? updatedEntry.remaining_shares,
  exitPrice: updatedEntry.exitPrice ?? updatedEntry.exit_price,
  exitDate: updatedEntry.exitDate ?? updatedEntry.exit_date,
  positionSize: updatedEntry.positionSize ?? updatedEntry.position_size,
  riskDollars: updatedEntry.riskDollars ?? updatedEntry.risk_dollars,
  riskPercent: updatedEntry.riskPercent ?? updatedEntry.risk_percent,
  stopDistance: updatedEntry.stopDistance ?? updatedEntry.stop_distance,
  totalRealizedPnL: updatedEntry.totalRealizedPnL ?? updatedEntry.total_realized_pnl ?? 0,
  wizardComplete: updatedEntry.wizardComplete ?? updatedEntry.wizard_complete ?? false,
  wizardSkipped: updatedEntry.wizardSkipped ?? updatedEntry.wizard_skipped ?? [],
  trimHistory,
  timestamp: updatedEntry.timestamp ?? updatedEntry.opened_at ?? updatedEntry.created_at,
};

    this.recalculateAccountFromJournal();
    this.emit('journalEntryUpdated', this.state.journal.entries[index]);
    return this.state.journal.entries[index];
  }

  return null;
}

  getOpenTrades() {
    return this.state.journal.entries.filter((e) => e.status === 'open' || e.status === 'trimmed');
  }

  getFilteredEntries(filter = 'all') {
    if (filter === 'all') return this.state.journal.entries;
    return this.state.journal.entries.filter((e) => e.status === filter);
  }

  toggleUI(key) {
    this.state.ui[key] = !this.state.ui[key];
    this.emit('uiChanged', { key, value: this.state.ui[key] });
  }

  setUI(key, value) {
    this.state.ui[key] = value;
    this.emit('uiChanged', { key, value });
  }

  updateJournalMeta(updates) {
    Object.assign(this.state.journalMeta, updates);
    this.emit('journalMetaChanged', this.state.journalMeta);
  }

  updateJournalMetaSettings(updates) {
    Object.assign(this.state.journalMeta.settings, updates);
    this.emit('journalMetaSettingsChanged', this.state.journalMeta.settings);
  }

  updateProgress(key, value) {
  this.state.journalMeta.achievements.progress[key] = value;
  this.emit('journalMetaChanged', this.state.journalMeta);
}

  // updateStreak() {
  //   const progress = this.state.journalMeta.achievements.progress;
  //   const today = new Date().toDateString();
  //   const lastDate = progress.lastTradeDate ? new Date(progress.lastTradeDate).toDateString() : null;

  //   if (lastDate === today) {
  //     return progress.currentStreak;
  //   }

  //   if (lastDate) {
  //     const daysDiff = Math.floor(
  //       (new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24)
  //     );

  //     if (daysDiff === 1) {
  //       progress.currentStreak += 1;
  //     } else {
  //       progress.currentStreak = 1;
  //     }
  //   } else {
  //     progress.currentStreak = 1;
  //   }

  //   if (progress.currentStreak > progress.longestStreak) {
  //     progress.longestStreak = progress.currentStreak;
  //   }

  //   progress.lastTradeDate = new Date().toISOString();
  //   this.emit('streakUpdated', progress.currentStreak);
  //   return progress.currentStreak;
  // }

    unlockAchievement(achievementInput) {
    const achievementId =
      typeof achievementInput === 'string'
        ? achievementInput
        : achievementInput?.achievementKey || achievementInput?.id;

    if (!achievementId) return null;

    const unlocked = this.state.journalMeta.achievements.unlocked;
    const existing = unlocked.find(
      (a) => a.id === achievementId || a.achievementKey === achievementId
    );

    if (existing) {
      return existing;
    }

    const achievement = {
      id: achievementId,
      achievementKey: achievementId,
      unlockedAt:
        (typeof achievementInput === 'object' &&
          (achievementInput?.unlockedAt || achievementInput?.unlocked_at)) ||
        new Date().toISOString(),
      notified:
        typeof achievementInput === 'object'
          ? !!achievementInput?.notified
          : false,
    };

    unlocked.push(achievement);
    this.emit('achievementUnlocked', achievement);
    this.emit('journalMetaChanged', this.state.journalMeta);
    return achievement;
  }

  isAchievementUnlocked(id) {
    return this.state.journalMeta.achievements.unlocked.some(
      (a) => a.id === id || a.achievementKey === id
    );
  }

  markAchievementNotified(id) {
    const achievement = this.state.journalMeta.achievements.unlocked.find(
      (a) => a.id === id || a.achievementKey === id
    );

    if (achievement) {
      achievement.notified = true;
      this.emit('journalMetaChanged', this.state.journalMeta);
    }
  }

  migrateJournalEntries() {
    let migrated = false;
    this.state.journal.entries = this.state.journal.entries.map((entry) => {
      if (!Object.prototype.hasOwnProperty.call(entry, 'thesis')) {
        migrated = true;
        return {
          ...entry,
          thesis: null,
          wizardComplete: false,
          wizardSkipped: [],
        };
      }
      return entry;
    });

    if (migrated) {
      console.log('Migrated journal entries in memory');
    }
  }


  getDashboardSettingsSummary() {
  const acc = Number(this.state.account.currentSize || 0);
  const max = Number(this.state.settings.defaultMaxPositionPercent || 0);
  return `$${Math.round(acc).toLocaleString()} acc. · Max ${max}%`;
}

getOpenRiskSummary() {
  const openTrades = this.getOpenTrades();

  const openRiskDollars = openTrades.reduce((sum, trade) => {
    const shares = Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0);
const entry = Number(trade.entry ?? trade.entry_price ?? 0);
const activeStop = Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0);
const direction =
  trade.direction ??
  (activeStop > entry ? 'short' : 'long');

const grossRisk =
  direction === 'short'
    ? shares * Math.max(0, activeStop - entry)
    : shares * Math.max(0, entry - activeStop);
    const realizedPnL = Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? 0);
    const isTrimmed = trade.status === 'trimmed';

    const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;
    return sum + netRisk;
  }, 0);

  const accountSize = Number(this.state.account.currentSize || 0);
  const openRiskPercent = accountSize > 0 ? (openRiskDollars / accountSize) * 100 : 0;

  let level = 'LOW';
  if (openRiskPercent >= 2) level = 'HIGH';
  else if (openRiskPercent >= 0.5) level = 'MEDIUM';

  return {
    dollars: openRiskDollars,
    percent: openRiskPercent,
    level,
    count: openTrades.length,
  };
}

getActiveTradesForDashboard() {
  return this.getOpenTrades().map((trade) => ({
    id: trade.id,
    ticker: trade.ticker || '—',
    direction: trade.direction ?? 'long',
    entry: Number(trade.entry ?? trade.entry_price ?? 0),
    stop: Number(trade.stop ?? trade.stop_price ?? 0),
    currentStop: Number(trade.currentStop ?? trade.current_stop ?? trade.stop ?? trade.stop_price ?? 0),
    target: Number(trade.target ?? trade.target_price ?? 0),
    shares: Number(trade.shares ?? 0),
    remainingShares: Number(trade.remainingShares ?? trade.remaining_shares ?? trade.shares ?? 0),
    riskDollars: Number(trade.riskDollars ?? trade.risk_dollars ?? 0),
    totalRealizedPnL: Number(trade.totalRealizedPnL ?? trade.total_realized_pnl ?? 0),
    status: trade.status || 'open',
    openedAt: trade.opened_at || trade.created_at || trade.timestamp || null,
  }));
}

 recalculateAccountFromJournal({ emitEvent = true } = {}) {
  const oldAccount = { ...this.state.account };

  const realizedPnL = this.state.journal.entries
    .filter((t) => t.status === 'closed' || t.status === 'trimmed')
    .reduce((sum, t) => sum + Number(t.totalRealizedPnL ?? t.pnl ?? 0), 0);

  this.state.account.realizedPnL = realizedPnL;

  if (this.state.settings.dynamicAccountEnabled) {
    this.state.account.currentSize =
      Number(this.state.settings.startingAccountSize) + realizedPnL;
  } else {
    this.state.account.currentSize = Number(this.state.settings.startingAccountSize);
  }

  this.state.settings.currentAccountSize = this.state.account.currentSize;
  this.state.settings.realizedPnL = this.state.account.realizedPnL;

  if (emitEvent) {
    this.emit('accountChanged', { old: oldAccount, new: this.state.account });
  }
}

  reset() {
    this.state = this.getDefaultState();
    this.applyTheme(this.state.settings.theme);

    this.emit('settingsChanged', this.state.settings);
    this.emit('accountChanged', { old: null, new: this.state.account });
    this.emit('tradeChanged', this.state.trade);
    this.emit('resultsChanged', this.state.results);
    this.emit('journalHydrated', this.state.journal.entries);
    this.emit('journalMetaChanged', this.state.journalMeta);
    this.emit('uiChanged', this.state.ui);
  }

  get settings() { return this.state.settings; }
  get account() { return this.state.account; }
  get trade() { return this.state.trade; }
  get results() { return this.state.results; }
  get journal() { return this.state.journal; }
  get journalMeta() { return this.state.journalMeta; }
  get ui() { return this.state.ui; }
}

export const state = new AppState();
export { AppState };