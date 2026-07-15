/**
 * Calculator - Core position sizing calculations
 */

import { state } from './state.js';
import { parseNumber, formatCurrency, formatPercent, formatNumber, formatWithCommas } from './utils.js';
import { showToast } from './ui.js';

class Calculator {
  constructor() {
    this.elements = {};
    this.whatIfMode = false;
    this.savedAccountSize = null;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.syncRiskButton();
    this.syncMaxPositionPresets();
    this.calculate();
  }

  

  syncMaxPositionPresets() {
    const currentMaxPos = state.account.maxPositionPercent || state.settings.defaultMaxPositionPercent;
    const settingsGrid = document.querySelector('.settings-grid');
    if (settingsGrid) {
      const settingsItems = settingsGrid.querySelectorAll('.settings-item');
      if (settingsItems.length >= 2) {
        const maxPosItem = settingsItems[1];
        const presetGroup = maxPosItem.querySelector('.preset-group');
        if (presetGroup) {
          presetGroup.querySelectorAll('.preset-btn').forEach(btn => {
            const btnValue = parseFloat(btn.dataset.value);
            btn.classList.toggle('active', btnValue === currentMaxPos);
          });
        }
      }
    }
  }

  syncRiskButton() {
  const currentRisk = state.account.riskPercent || state.settings.defaultRiskPercent;

  document.querySelectorAll('.risk-btn').forEach(btn => {
    const btnRisk = parseFloat(btn.dataset.risk);
    if (btnRisk === currentRisk) {
      btn.classList.add('risk-btn--active');
    } else {
      btn.classList.remove('risk-btn--active');
    }
  });

  if (this.elements.customRisk) {
    this.elements.customRisk.value = String(currentRisk);
  }
}

  cacheElements() {
    this.elements = {
      accountSize: document.getElementById('accountSize'),
      customRisk: document.getElementById('customRisk'),
      maxPositionPercent: document.getElementById('maxPositionPercent'),
      ticker: document.getElementById('ticker'),
      entryPrice: document.getElementById('entryPrice'),
      stopLoss: document.getElementById('stopLoss'),
      targetPrice: document.getElementById('targetPrice'),

      positionSize: document.getElementById('positionSize'),
      positionPercent: document.getElementById('positionPercent'),
      shares: document.getElementById('shares'),
      riskAmount: document.getElementById('riskAmount'),
      riskPercentDisplay: document.getElementById('riskPercentDisplay'),
      stopDistance: document.getElementById('stopDistance'),
      stopPerShare: document.getElementById('stopPerShare'),
      rMultiple: document.getElementById('rMultiple'),
      profitPerShare: document.getElementById('profitPerShare'),
      potentialProfit: document.getElementById('potentialProfit'),
      profitROI: document.getElementById('profitROI'),
      accountGrowth: document.getElementById('accountGrowth'),

      whatIfSection: document.getElementById('whatIfSection'),
      whatIfTargetPrice: document.getElementById('whatIfTargetPrice'),
      resultsTicker: document.getElementById('resultsTicker'),
      tradeInsights: document.getElementById('tradeInsights'),

      scenariosToggle: document.getElementById('scenariosToggle'),
      scenariosContent: document.getElementById('scenariosContent'),
      scenariosBody: document.getElementById('scenariosBody'),

      clearCalculatorBtn: document.getElementById('clearCalculatorBtn'),

      rProgressBar: document.getElementById('rProgressBar'),
      rStopPrice: document.getElementById('rStopPrice'),
      rStopProfit: document.getElementById('rStopProfit'),
      rEntryPrice: document.getElementById('rEntryPrice'),
      r1RPrice: document.getElementById('r1RPrice'),
      r1RProfit: document.getElementById('r1RProfit'),
      r2RPrice: document.getElementById('r2RPrice'),
      r2RProfit: document.getElementById('r2RProfit'),
      r3RPrice: document.getElementById('r3RPrice'),
      r3RProfit: document.getElementById('r3RProfit'),
      r4RPrice: document.getElementById('r4RPrice'),
      r4RProfit: document.getElementById('r4RProfit'),
      r5RPrice: document.getElementById('r5RPrice'),
      r5RProfit: document.getElementById('r5RProfit'),

      whatIfModeToggle: document.getElementById('whatIfModeToggle'),
      whatIfHint: document.getElementById('whatIfHint'),
      settingsCard: document.getElementById('settingsCard'),

    };
  }

  bindEvents() {
    const { accountSize, customRisk, maxPositionPercent, ticker, entryPrice, stopLoss, targetPrice } = this.elements;

    const filterNumeric = (e) => {
      const cleaned = e.target.value.replace(/[^0-9.,]/g, '');
      if (cleaned !== e.target.value) {
        e.target.value = cleaned;
      }
    };

    [maxPositionPercent, entryPrice, stopLoss, targetPrice].forEach(el => {
      if (el) {
        el.addEventListener('input', (e) => {
          filterNumeric(e);
          this.calculate();
        });
      }
    });

    if (customRisk) {
      customRisk.addEventListener('input', (e) => {
        filterNumeric(e);
        document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('risk-btn--active'));
        this.calculate();
      });
    }

    if (ticker) {
      ticker.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        this.calculate();
      });
    }

    document.querySelectorAll('.risk-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleRiskButton(e));
    });

    if (accountSize) {
      accountSize.addEventListener('input', (e) => {
        const cleaned = e.target.value.replace(/[^0-9.,kKmM]/g, '');
        if (cleaned !== e.target.value) {
          e.target.value = cleaned;
        }
        const inputValue = e.target.value.trim();

        if (inputValue && (inputValue.toLowerCase().includes('k') || inputValue.toLowerCase().includes('m'))) {
          const converted = parseNumber(inputValue);
          if (converted !== null) {
            const cursorPosition = e.target.selectionStart;
            const originalLength = e.target.value.length;
            e.target.value = formatWithCommas(converted);
            const newLength = e.target.value.length;
            const newCursorPosition = Math.max(0, cursorPosition + (newLength - originalLength));
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);
            if (!this.whatIfMode) {
              state.updateAccount({ currentSize: converted });
              state.emit('accountSizeChanged', converted);
            }
          }
        }
        this.calculate();
      });

      accountSize.addEventListener('blur', (e) => {
        const num = parseNumber(e.target.value);
        if (num !== null) {
          e.target.value = formatWithCommas(num);
          if (!this.whatIfMode) {
            state.emit('accountSizeChanged', num);
          }
        }
      });
    }

    document.querySelectorAll('.settings-grid .preset-group').forEach(group => {
      group.addEventListener('click', (e) => this.handlePresetClick(e));
    });

    if (this.elements.scenariosToggle) {
      this.elements.scenariosToggle.addEventListener('click', () => this.toggleScenarios());
    }

    if (this.elements.clearCalculatorBtn) {
      this.elements.clearCalculatorBtn.addEventListener('click', () => this.clear());
    }

    document.querySelectorAll('.input-stepper__btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleStepper(e));
    });

    if (this.elements.whatIfModeToggle) {
      this.elements.whatIfModeToggle.addEventListener('change', (e) => this.toggleWhatIfMode(e.target.checked));
    }

    
  }

  toggleWhatIfMode(enabled) {
    this.whatIfMode = enabled;
    const { settingsCard, whatIfHint, accountSize } = this.elements;

    if (enabled) {
      this.savedAccountSize = state.account.currentSize;
      settingsCard?.classList.add('what-if-active');
      if (whatIfHint) {
        whatIfHint.textContent = `Real account: ${formatCurrency(this.savedAccountSize)}`;
      }
    } else {
      if (this.savedAccountSize !== null) {
        state.updateAccount({ currentSize: this.savedAccountSize });
        if (accountSize) {
          accountSize.value = formatWithCommas(this.savedAccountSize);
        }
        state.emit('accountSizeChanged', this.savedAccountSize);
        this.savedAccountSize = null;
      }
      settingsCard?.classList.remove('what-if-active');
      if (whatIfHint) {
        whatIfHint.textContent = 'Experiment without changing your real settings';
      }
      this.calculate();
    }
  }

  handleStepper(e) {
    const btn = e.target.closest('.input-stepper__btn');
    if (!btn) return;

    const targetId = btn.dataset.target;
    const direction = btn.dataset.direction;
    const input = document.getElementById(targetId);
    if (!input) return;

    const currentValue = parseFloat(input.value) || 0;
    const step = 0.01;
    const newValue = direction === 'up'
      ? currentValue + step
      : Math.max(0, currentValue - step);

    input.value = newValue.toFixed(2);
    this.calculate();
  }

  handleRiskButton(e) {
  const btn = e.target.closest('.risk-btn');
  if (!btn) return;

  const risk = parseFloat(btn.dataset.risk);
  if (isNaN(risk)) return;

  document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('risk-btn--active'));
  btn.classList.add('risk-btn--active');

  if (this.elements.customRisk) {
    this.elements.customRisk.value = String(risk);
  }

  state.updateAccount({ riskPercent: risk });
  this.calculate();
}

  clear() {
    if (this.elements.ticker) this.elements.ticker.value = '';
    if (this.elements.entryPrice) this.elements.entryPrice.value = '';
    if (this.elements.stopLoss) this.elements.stopLoss.value = '';
    if (this.elements.targetPrice) this.elements.targetPrice.value = '';

    this.setStopError(false);
    this.calculate();
    showToast('🧹 Calculator cleared', 'success');
  }

  handlePresetClick(e) {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;

    const group = btn.closest('.preset-group');
    const value = parseFloat(btn.dataset.value);

    group.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const settingsItem = btn.closest('.settings-item');
    const label = settingsItem?.querySelector('.input-label')?.textContent || '';

    if (label.includes('Risk')) {
      if (this.elements.riskPercent) this.elements.riskPercent.value = value;
      state.updateAccount({ riskPercent: value });
    } else if (label.includes('Max Position')) {
      this.elements.maxPositionPercent.value = value;
      state.updateAccount({ maxPositionPercent: value });
    }

    this.calculate();
  }

  toggleScenarios() {
    state.toggleUI('scenariosExpanded');
    this.elements.scenariosToggle?.classList.toggle('active', state.ui.scenariosExpanded);
    this.elements.scenariosContent?.classList.toggle('open', state.ui.scenariosExpanded);
  }

  calculate() {
    const accountSize = parseNumber(this.elements.accountSize?.value);

let riskPercent = null;
const activeRiskBtn = document.querySelector('.risk-btn.risk-btn--active');
if (activeRiskBtn) {
  riskPercent = parseFloat(activeRiskBtn.dataset.risk);
} else if (this.elements.customRisk?.value) {
  riskPercent = parseNumber(this.elements.customRisk.value);
} else {
  riskPercent = state.account.riskPercent || state.settings.defaultRiskPercent;
}

const entry = parseNumber(this.elements.entryPrice?.value);
const stop = parseNumber(this.elements.stopLoss?.value);
const target = parseNumber(this.elements.targetPrice?.value);
const maxPositionPercent = parseNumber(this.elements.maxPositionPercent?.value) || state.account.maxPositionPercent;

let direction = 'long';
if (entry && stop) {
  if (stop > entry) direction = 'short';
  else if (stop < entry) direction = 'long';
}

    if (!this.whatIfMode) {
      state.updateAccount({
        currentSize: accountSize || state.settings.startingAccountSize,
        riskPercent: riskPercent || state.settings.defaultRiskPercent
      });
    } else {
      state.updateAccount({
        riskPercent: riskPercent || state.settings.defaultRiskPercent
      });
    }

    state.updateTrade({
      ticker: this.elements.ticker?.value.toUpperCase() || '',
      entry,
      stop,
      target,
      direction
    });

    const hasTargetWarning = target && entry
      ? (direction === 'short' ? target >= entry : target <= entry)
      : false;

    if (!accountSize || !riskPercent || !entry || !stop) {
      this.clearStopError();
      this.renderEmptyResults();
      if (hasTargetWarning) {
        this.updateInsights([{
          type: 'warning',
          icon: '⚠️',
          text: direction === 'short'
            ? 'Target should be below entry for short trades'
            : 'Target should be above entry for long trades'
        }]);
      }
      return;
    }

    const invalidStop = direction === 'short' ? stop <= entry : stop >= entry;
    if (invalidStop) {
      this.setStopError(true);
      this.renderEmptyResults();
      this.updateInsights([{
        type: 'danger',
        icon: '⚠️',
        text: direction === 'short'
          ? 'Stop must be above entry for short trades'
          : 'Stop must be below entry for long trades'
      }]);
      return;
    }

    this.setStopError(false);

    const riskPerShare = Math.abs(entry - stop);
    const riskDollars = accountSize * (riskPercent / 100);
    let shares = Math.floor(riskDollars / riskPerShare);
    let positionSize = shares * entry;
    let isLimited = false;

    const originalPositionSize = positionSize;
    const originalPercentOfAccount = accountSize > 0 ? (originalPositionSize / accountSize) * 100 : 0;
    const originalRiskDollars = riskDollars;
    const originalRiskPercent = riskPercent;

    const maxPosition = accountSize * (maxPositionPercent / 100);
    if (positionSize > maxPosition) {
      shares = Math.floor(maxPosition / entry);
      positionSize = shares * entry;
      isLimited = true;
    }

    const actualRiskDollars = shares * riskPerShare;
    const actualRiskPercent = accountSize > 0 ? (actualRiskDollars / accountSize) * 100 : 0;
    const stopDistance = entry > 0 ? (riskPerShare / entry) * 100 : 0;
    const percentOfAccount = accountSize > 0 ? (positionSize / accountSize) * 100 : 0;

    let rMultiple = null;
    let profit = null;
    let roi = null;
    let targetProfitPerShare = null;
    let riskReward = null;

    if (target && target !== entry) {
      targetProfitPerShare = direction === 'short' ? (entry - target) : (target - entry);
      rMultiple = riskPerShare > 0 ? targetProfitPerShare / riskPerShare : null;
      profit = shares * targetProfitPerShare;
      roi = entry > 0 ? (targetProfitPerShare / entry) * 100 : null;
      riskReward = rMultiple;
    }

    const target5R = direction === 'short'
      ? entry - (5 * riskPerShare)
      : entry + (5 * riskPerShare);

    const results = {
      shares,
      positionSize,
      riskDollars: actualRiskDollars,
      stopDistance,
      stopPerShare: riskPerShare,
      rMultiple,
      target,
      profit,
      roi,
      targetProfitPerShare,
      target5R,
      riskReward,
      isLimited,
      percentOfAccount,
      originalPositionSize,
      originalPercentOfAccount,
      originalRiskDollars,
      originalRiskPercent,
      actualRiskPercent,
      accountSize,
      accountGrowth: profit !== null && accountSize > 0 ? (profit / accountSize) * 100 : null,
      direction
    };

    state.updateResults(results);

    this.renderResults(results);
    this.renderInsights(entry, stop, target, stopDistance, isLimited, direction);
    this.renderScenarios(accountSize, entry, riskPerShare, maxPositionPercent);
    this.renderRProgressBar(entry, stop, shares, riskPerShare, direction);
  }

  renderResults(r) {
    const ticker = state.trade.ticker || '—';
    const directionLabel = r.direction === 'short' ? 'Short' : 'Long';

    document.querySelectorAll('.result-card').forEach(card => {
      card.classList.add('updated');
      setTimeout(() => card.classList.remove('updated'), 300);
    });

    if (this.elements.positionSize) {
      if (r.isLimited) {
        this.elements.positionSize.innerHTML = `<span class="value--struck">${formatCurrency(r.originalPositionSize)}</span> ${formatCurrency(r.positionSize)}`;
      } else {
        this.elements.positionSize.textContent = formatCurrency(r.positionSize);
      }
    }

    if (this.elements.positionPercent) {
      if (r.isLimited) {
        this.elements.positionPercent.innerHTML = `<span class="value--struck">${formatPercent(r.originalPercentOfAccount)}</span> ${formatPercent(r.percentOfAccount)} of account`;
      } else {
        this.elements.positionPercent.textContent = `${formatPercent(r.percentOfAccount)} of account`;
      }
    }

    if (this.elements.shares) this.elements.shares.textContent = formatNumber(r.shares);

    if (this.elements.riskAmount) {
      if (r.isLimited) {
        this.elements.riskAmount.innerHTML = `<span class="value--struck">${formatCurrency(r.originalRiskDollars)}</span> ${formatCurrency(r.riskDollars)}`;
      } else {
        this.elements.riskAmount.textContent = formatCurrency(r.riskDollars);
      }
    }

    if (this.elements.riskPercentDisplay) {
      if (r.isLimited) {
        this.elements.riskPercentDisplay.innerHTML = `<span class="value--struck">${formatPercent(r.originalRiskPercent)}</span> ${formatPercent(r.actualRiskPercent)} of account`;
      } else {
        this.elements.riskPercentDisplay.textContent = `${formatPercent(r.actualRiskPercent)} of account`;
      }
    }

    if (this.elements.stopDistance) this.elements.stopDistance.textContent = formatPercent(r.stopDistance);
    if (this.elements.stopPerShare) this.elements.stopPerShare.textContent = `${formatCurrency(r.stopPerShare)}/share`;
    if (this.elements.resultsTicker) this.elements.resultsTicker.textContent = `${directionLabel} · Ticker: ${ticker}`;

    if (r.rMultiple !== null && r.target) {
      const isProfit = r.profit >= 0;
      const colorClass = isProfit ? 'text-success' : 'text-danger';
      const sign = isProfit ? '+' : '-';

      if (this.elements.whatIfSection) this.elements.whatIfSection.classList.add('visible');
      if (this.elements.whatIfTargetPrice) {
        this.elements.whatIfTargetPrice.textContent = formatCurrency(r.target);
        this.elements.whatIfTargetPrice.className = `what-if__target-price ${colorClass}`;
      }
      if (this.elements.rMultiple) {
        this.elements.rMultiple.textContent = `${sign}${Math.abs(r.rMultiple).toFixed(2)}R`;
        this.elements.rMultiple.className = `what-if__stat-value ${colorClass}`;
      }
      if (this.elements.profitPerShare) {
        this.elements.profitPerShare.textContent = `${sign}${formatCurrency(Math.abs(r.targetProfitPerShare))}/sh`;
        this.elements.profitPerShare.className = `what-if__stat-value ${colorClass}`;
      }
      if (this.elements.potentialProfit) {
        this.elements.potentialProfit.textContent = `${sign}${formatCurrency(Math.abs(r.profit))}`;
        this.elements.potentialProfit.className = `what-if__stat-value ${colorClass}`;
      }
      if (this.elements.profitROI) {
        this.elements.profitROI.textContent = `${sign}${formatPercent(Math.abs(r.roi))}`;
        this.elements.profitROI.className = `what-if__stat-value ${colorClass}`;
      }
      if (this.elements.accountGrowth) {
        this.elements.accountGrowth.textContent = `${sign}${formatPercent(Math.abs(r.accountGrowth))}`;
        this.elements.accountGrowth.className = `what-if__stat-value ${colorClass}`;
      }
    } else {
      if (this.elements.whatIfSection) this.elements.whatIfSection.classList.remove('visible');
    }

    state.emit('resultsRendered', r);
  }

  renderEmptyResults() {
    const entry = parseNumber(this.elements.entryPrice?.value);
const stop = parseNumber(this.elements.stopLoss?.value);
const directionLabel = entry && stop && stop > entry ? 'Short' : 'Long';
    const defaults = {
      positionSize: '$0.00',
      positionPercent: '0% of account',
      shares: '0',
      riskAmount: '$0.00',
      riskPercentDisplay: '0% of account',
      stopDistance: '0%',
      stopPerShare: '$0.00/share',
      resultsTicker: `${directionLabel} · Ticker: —`
    };

    if (this.elements.whatIfSection) this.elements.whatIfSection.classList.remove('visible');

    Object.entries(defaults).forEach(([key, value]) => {
      if (this.elements[key]) this.elements[key].textContent = value;
    });

    if (this.elements.rProgressBar) {
      this.elements.rProgressBar.classList.remove('visible');
    }
  }

  renderInsights(entry, stop, target, stopDistance, isLimited, direction = 'long') {
    const insights = [];

    if (entry && stop) {
      insights.push({
        type: 'neutral',
        icon: direction === 'short' ? '📈' : '📉',
        text: direction === 'short'
          ? `Stop is ${formatPercent(stopDistance)} above entry`
          : `Stop is ${formatPercent(stopDistance)} below entry`
      });
    }

    if (target && entry) {
      const targetDistance = Math.abs(((target - entry) / entry) * 100);
      const invalidTarget = direction === 'short' ? target >= entry : target <= entry;

      if (invalidTarget) {
        insights.push({
          type: 'warning',
          icon: '⚠️',
          text: direction === 'short'
            ? 'Target should be below entry for short trades'
            : 'Target should be above entry for long trades'
        });
      } else {
        insights.push({
          type: 'success',
          icon: direction === 'short' ? '📉' : '📈',
          text: direction === 'short'
            ? `Target is ${formatPercent(targetDistance)} below entry`
            : `Target is ${formatPercent(targetDistance)} above entry`
        });
      }
    }

    if (isLimited) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        text: `Position limited to ${state.account.maxPositionPercent}% of account`
      });
    }

    this.updateInsights(insights);
  }

  updateInsights(insights) {
    if (!this.elements.tradeInsights) return;

    if (!insights.length) {
      this.elements.tradeInsights.innerHTML = `
        <div class="insight insight--neutral">
          <span class="insight__icon">📊</span>
          <span class="insight__text">Enter entry and stop to see insights</span>
        </div>
      `;
      return;
    }

    this.elements.tradeInsights.innerHTML = insights.map(i => `
      <div class="insight insight--${i.type}">
        <span class="insight__icon">${i.icon || '📊'}</span>
        <span class="insight__text">${i.text}</span>
      </div>
    `).join('');
  }

  renderScenarios(accountSize, entry, riskPerShare, maxPositionPercent) {
    if (!this.elements.scenariosBody) return;

    const riskLevels = [0.1, 0.25, 0.5, 1, 1.5, 2];
    const currentRisk = state.account.riskPercent;
    const maxPosition = accountSize * (maxPositionPercent / 100);

    const rows = riskLevels.map(risk => {
      const riskDollars = accountSize * (risk / 100);
      let shares = Math.floor(riskDollars / riskPerShare);
      let positionSize = shares * entry;

      if (positionSize > maxPosition) {
        shares = Math.floor(maxPosition / entry);
        positionSize = shares * entry;
      }

      const actualRisk = shares * riskPerShare;
      const isActive = risk === currentRisk;

      return `
        <tr class="${isActive ? 'active' : ''}">
          <td>${formatPercent(risk, risk < 1 ? 2 : 1)}</td>
          <td>${formatNumber(shares)}</td>
          <td>${formatCurrency(positionSize)}</td>
          <td>${formatCurrency(actualRisk)}</td>
        </tr>
      `;
    }).join('');

    this.elements.scenariosBody.innerHTML = rows;
  }

  fillFromParsed(parsed) {
    if (parsed.ticker && this.elements.ticker) this.elements.ticker.value = parsed.ticker;
    if (parsed.entry && this.elements.entryPrice) this.elements.entryPrice.value = parsed.entry;
    if (parsed.stop && this.elements.stopLoss) this.elements.stopLoss.value = parsed.stop;
    if (parsed.target && this.elements.targetPrice) this.elements.targetPrice.value = parsed.target;

    if (parsed.direction) {
  state.updateTrade({ direction: parsed.direction === 'short' ? 'short' : 'long' });
}

    if (parsed.riskPercent) {
      state.updateAccount({ riskPercent: parsed.riskPercent });
      if (this.elements.customRisk) this.elements.customRisk.value = parsed.riskPercent;
      this.syncRiskButton();
    }

    this.calculate();
  }

  renderRProgressBar(entry, stop, shares, riskPerShare, direction = 'long') {
    const bar = this.elements.rProgressBar;
    if (!bar) return;

    const invalidSetup = direction === 'short'
      ? (!entry || !stop || stop <= entry || shares <= 0)
      : (!entry || !stop || stop >= entry || shares <= 0);

    if (invalidSetup) {
      bar.classList.remove('visible');
      return;
    }

    const levels = direction === 'short'
      ? {
          stop: { price: stop, profit: -(riskPerShare * shares) },
          entry: { price: entry, profit: 0 },
          r1: { price: entry - (1 * riskPerShare), profit: 1 * riskPerShare * shares },
          r2: { price: entry - (2 * riskPerShare), profit: 2 * riskPerShare * shares },
          r3: { price: entry - (3 * riskPerShare), profit: 3 * riskPerShare * shares },
          r4: { price: entry - (4 * riskPerShare), profit: 4 * riskPerShare * shares },
          r5: { price: entry - (5 * riskPerShare), profit: 5 * riskPerShare * shares }
        }
      : {
          stop: { price: stop, profit: -(riskPerShare * shares) },
          entry: { price: entry, profit: 0 },
          r1: { price: entry + (1 * riskPerShare), profit: 1 * riskPerShare * shares },
          r2: { price: entry + (2 * riskPerShare), profit: 2 * riskPerShare * shares },
          r3: { price: entry + (3 * riskPerShare), profit: 3 * riskPerShare * shares },
          r4: { price: entry + (4 * riskPerShare), profit: 4 * riskPerShare * shares },
          r5: { price: entry + (5 * riskPerShare), profit: 5 * riskPerShare * shares }
        };

    if (this.elements.rStopPrice) this.elements.rStopPrice.textContent = formatCurrency(levels.stop.price);
    if (this.elements.rStopProfit) this.elements.rStopProfit.textContent = formatCurrency(levels.stop.profit);
    if (this.elements.rEntryPrice) this.elements.rEntryPrice.textContent = formatCurrency(levels.entry.price);

    if (this.elements.r1RPrice) this.elements.r1RPrice.textContent = formatCurrency(levels.r1.price);
    if (this.elements.r1RProfit) this.elements.r1RProfit.textContent = `+${formatCurrency(levels.r1.profit)}`;

    if (this.elements.r2RPrice) this.elements.r2RPrice.textContent = formatCurrency(levels.r2.price);
    if (this.elements.r2RProfit) this.elements.r2RProfit.textContent = `+${formatCurrency(levels.r2.profit)}`;

    if (this.elements.r3RPrice) this.elements.r3RPrice.textContent = formatCurrency(levels.r3.price);
    if (this.elements.r3RProfit) this.elements.r3RProfit.textContent = `+${formatCurrency(levels.r3.profit)}`;

    if (this.elements.r4RPrice) this.elements.r4RPrice.textContent = formatCurrency(levels.r4.price);
    if (this.elements.r4RProfit) this.elements.r4RProfit.textContent = `+${formatCurrency(levels.r4.profit)}`;

    if (this.elements.r5RPrice) this.elements.r5RPrice.textContent = formatCurrency(levels.r5.price);
    if (this.elements.r5RProfit) this.elements.r5RProfit.textContent = `+${formatCurrency(levels.r5.profit)}`;

    bar.classList.add('visible');
  }

  setStopError(hasError) {
    if (this.elements.stopLoss) {
      this.elements.stopLoss.classList.toggle('input--error', hasError);
    }
  }

  clearStopError() {
    this.setStopError(false);
  }
}

export const calculator = new Calculator();
export { Calculator };