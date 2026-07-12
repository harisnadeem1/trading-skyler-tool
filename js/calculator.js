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
    this.savedAccountSize = null; // Store real account size when in What If mode
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.syncRiskButton();
    this.syncMaxPositionPresets();
    this.calculate();
  }

  syncRiskButton() {
    // Sync risk button active state with current risk percent
    const currentRisk = state.account.riskPercent || state.settings.defaultRiskPercent;
    document.querySelectorAll('.risk-btn').forEach(btn => {
      const btnRisk = parseFloat(btn.dataset.risk);
      if (btnRisk === currentRisk) {
        btn.classList.add('risk-btn--active');
      } else {
        btn.classList.remove('risk-btn--active');
      }
    });
  }

  syncMaxPositionPresets() {
    // Sync Quick Settings max position preset buttons with current max position percent
    const currentMaxPos = state.account.maxPositionPercent || state.settings.defaultMaxPositionPercent;
    const settingsGrid = document.querySelector('.settings-grid');
    if (settingsGrid) {
      // Find the Max Position Size settings item (second item in settings-grid)
      const settingsItems = settingsGrid.querySelectorAll('.settings-item');
      if (settingsItems.length >= 2) {
        const maxPosItem = settingsItems[1]; // Second item is Max Position Size
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

  cacheElements() {
    this.elements = {
      // Inputs
      accountSize: document.getElementById('accountSize'),
      customRisk: document.getElementById('customRisk'),
      maxPositionPercent: document.getElementById('maxPositionPercent'),
      ticker: document.getElementById('ticker'),
      entryPrice: document.getElementById('entryPrice'),
      stopLoss: document.getElementById('stopLoss'),
      targetPrice: document.getElementById('targetPrice'),

      // Results
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

      // What If Section
      whatIfSection: document.getElementById('whatIfSection'),
      whatIfTargetPrice: document.getElementById('whatIfTargetPrice'),
      resultsTicker: document.getElementById('resultsTicker'),
      tradeInsights: document.getElementById('tradeInsights'),

      // Scenarios
      scenariosToggle: document.getElementById('scenariosToggle'),
      scenariosContent: document.getElementById('scenariosContent'),
      scenariosBody: document.getElementById('scenariosBody'),

      // Clear button
      clearCalculatorBtn: document.getElementById('clearCalculatorBtn'),

      // R-Progress Bar
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

      // What If Mode
      whatIfModeToggle: document.getElementById('whatIfModeToggle'),
      whatIfHint: document.getElementById('whatIfHint'),
      settingsCard: document.getElementById('settingsCard')
    };
  }

  bindEvents() {
    const { accountSize, customRisk, maxPositionPercent, ticker, entryPrice, stopLoss, targetPrice } = this.elements;

    // Helper to filter numeric input (only digits, decimal, comma)
    const filterNumeric = (e) => {
      const cleaned = e.target.value.replace(/[^0-9.,]/g, '');
      if (cleaned !== e.target.value) {
        e.target.value = cleaned;
      }
    };

    // Numeric-only input fields
    [maxPositionPercent, entryPrice, stopLoss, targetPrice].forEach(el => {
      if (el) {
        el.addEventListener('input', (e) => {
          filterNumeric(e);
          this.calculate();
        });
      }
    });

    // Custom risk input - also clears active risk button
    if (customRisk) {
      customRisk.addEventListener('input', (e) => {
        filterNumeric(e);
        document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('risk-btn--active'));
        this.calculate();
      });
    }

    // Ticker is alphanumeric (letters and numbers only)
    if (ticker) {
      ticker.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        this.calculate();
      });
    }

    // Risk button handlers
    document.querySelectorAll('.risk-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleRiskButton(e));
    });

    // Account size with K/M instant conversion and formatting
    if (accountSize) {
      accountSize.addEventListener('input', (e) => {
        // Allow numbers, decimal, comma, and K/M notation
        const cleaned = e.target.value.replace(/[^0-9.,kKmM]/g, '');
        if (cleaned !== e.target.value) {
          e.target.value = cleaned;
        }
        const inputValue = e.target.value.trim();

        // Instant format when K/M notation is used
        if (inputValue && (inputValue.toLowerCase().includes('k') || inputValue.toLowerCase().includes('m'))) {
          const converted = parseNumber(inputValue);
          if (converted !== null) {
            const cursorPosition = e.target.selectionStart;
            const originalLength = e.target.value.length;
            e.target.value = formatWithCommas(converted);
            const newLength = e.target.value.length;
            const newCursorPosition = Math.max(0, cursorPosition + (newLength - originalLength));
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);
            // Only persist to state if NOT in What If mode
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
          // Only persist to state if NOT in What If mode
          if (!this.whatIfMode) {
            state.emit('accountSizeChanged', num);
          }
        }
      });
    }

    // Preset buttons
    document.querySelectorAll('.settings-grid .preset-group').forEach(group => {
      group.addEventListener('click', (e) => this.handlePresetClick(e));
    });

    // Scenarios toggle
    if (this.elements.scenariosToggle) {
      this.elements.scenariosToggle.addEventListener('click', () => this.toggleScenarios());
    }

    // Clear button
    if (this.elements.clearCalculatorBtn) {
      this.elements.clearCalculatorBtn.addEventListener('click', () => this.clear());
    }

    // Stepper buttons for entry/stop
    document.querySelectorAll('.input-stepper__btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleStepper(e));
    });

    // What If Mode toggle
    if (this.elements.whatIfModeToggle) {
      this.elements.whatIfModeToggle.addEventListener('change', (e) => this.toggleWhatIfMode(e.target.checked));
    }
  }

  toggleWhatIfMode(enabled) {
    this.whatIfMode = enabled;
    const { settingsCard, whatIfHint, accountSize } = this.elements;

    if (enabled) {
      // Entering What If mode - save current account size
      this.savedAccountSize = state.account.currentSize;
      settingsCard?.classList.add('what-if-active');
      if (whatIfHint) {
        whatIfHint.textContent = `Real account: ${formatCurrency(this.savedAccountSize)}`;
      }
    } else {
      // Exiting What If mode - restore saved account size
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

    // Update active state
    document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('risk-btn--active'));
    btn.classList.add('risk-btn--active');

    // Clear custom input
    if (this.elements.customRisk) {
      this.elements.customRisk.value = '';
    }

    // Update state and recalculate
    state.updateAccount({ riskPercent: risk });
    this.calculate();
  }

  clear() {
    // Clear trade input fields
    if (this.elements.ticker) this.elements.ticker.value = '';
    if (this.elements.entryPrice) this.elements.entryPrice.value = '';
    if (this.elements.stopLoss) this.elements.stopLoss.value = '';
    if (this.elements.targetPrice) this.elements.targetPrice.value = '';

    // Clear any error states
    this.setStopError(false);

    // Recalculate (will show empty/default results)
    this.calculate();

    // Show feedback
    showToast('🧹 Calculator cleared', 'success');
  }

  handlePresetClick(e) {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;

    const group = btn.closest('.preset-group');
    const value = parseFloat(btn.dataset.value);

    // Update active state
    group.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Determine which preset by finding the parent settings-item label
    const settingsItem = btn.closest('.settings-item');
    const label = settingsItem?.querySelector('.input-label')?.textContent || '';

    if (label.includes('Risk')) {
      this.elements.riskPercent.value = value;
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
    
    // Get risk percent from active button, custom input, or state
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

    // Update state (skip account size update if in What If mode)
    if (!this.whatIfMode) {
      state.updateAccount({
        currentSize: accountSize || state.settings.startingAccountSize,
        riskPercent: riskPercent || state.settings.defaultRiskPercent
      });
    } else {
      // In What If mode, only update risk percent, not account size
      state.updateAccount({
        riskPercent: riskPercent || state.settings.defaultRiskPercent
      });
    }

    state.updateTrade({
      ticker: this.elements.ticker?.value.toUpperCase() || '',
      entry,
      stop,
      target
    });

    // Check target vs entry early (even before full validation)
    const hasTargetWarning = target && entry && target <= entry;

    // Validate minimum inputs
    if (!accountSize || !riskPercent || !entry || !stop) {
      this.clearStopError();
      this.renderEmptyResults();
      // Show target warning even with incomplete form
      if (hasTargetWarning) {
        this.updateInsights([{ type: 'warning', icon: '⚠️', text: 'Target should be above entry for long trades' }]);
      }
      return;
    }

    // Validate trade setup - stop must be below entry for long trades
    if (stop >= entry) {
      this.setStopError(true);
      this.renderEmptyResults();
      this.updateInsights([{ type: 'danger', icon: '⚠️', text: 'Stop must be below entry for long trades' }]);
      return;
    }

    // Valid setup - clear any error state
    this.setStopError(false);

    // Core calculations
    const riskPerShare = entry - stop;
    const riskDollars = accountSize * (riskPercent / 100);
    let shares = Math.floor(riskDollars / riskPerShare);
    let positionSize = shares * entry;
    let isLimited = false;

    // Store original values before limiting
    const originalPositionSize = positionSize;
    const originalPercentOfAccount = (originalPositionSize / accountSize) * 100;
    const originalRiskDollars = riskDollars;
    const originalRiskPercent = riskPercent;

    // Apply max position limit
    const maxPosition = accountSize * (maxPositionPercent / 100);
    if (positionSize > maxPosition) {
      shares = Math.floor(maxPosition / entry);
      positionSize = shares * entry;
      isLimited = true;
    }

    const actualRiskDollars = shares * riskPerShare;
    const actualRiskPercent = (actualRiskDollars / accountSize) * 100;
    const stopDistance = (riskPerShare / entry) * 100;
    const percentOfAccount = (positionSize / accountSize) * 100;

    // Profit calculations
    let rMultiple = null;
    let profit = null;
    let roi = null;
    let targetProfitPerShare = null;

    if (target && target !== entry) {
      targetProfitPerShare = target - entry;
      rMultiple = targetProfitPerShare / riskPerShare;
      profit = shares * targetProfitPerShare;
      roi = (targetProfitPerShare / entry) * 100;
    }

    // 5R Target
    const target5R = entry + (5 * riskPerShare);

    // Update state results
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
      isLimited,
      percentOfAccount,
      originalPositionSize,
      originalPercentOfAccount,
      originalRiskDollars,
      originalRiskPercent,
      actualRiskPercent,
      accountSize,
      accountGrowth: profit !== null ? (profit / accountSize) * 100 : null
    };

    state.updateResults(results);

    // Render
    this.renderResults(results);
    this.renderInsights(entry, stop, target, stopDistance, isLimited);
    this.renderScenarios(accountSize, entry, riskPerShare, maxPositionPercent);
    this.renderRProgressBar(entry, stop, shares, riskPerShare);
  }

  renderResults(r) {
    const ticker = state.trade.ticker || '—';

    // Animate updated cards
    document.querySelectorAll('.result-card').forEach(card => {
      card.classList.add('updated');
      setTimeout(() => card.classList.remove('updated'), 300);
    });

    // Position Size - show strikethrough if limited
    if (this.elements.positionSize) {
      if (r.isLimited) {
        this.elements.positionSize.innerHTML = `<span class="value--struck">${formatCurrency(r.originalPositionSize)}</span> ${formatCurrency(r.positionSize)}`;
      } else {
        this.elements.positionSize.textContent = formatCurrency(r.positionSize);
      }
    }
    // Position % - show strikethrough if limited
    if (this.elements.positionPercent) {
      if (r.isLimited) {
        this.elements.positionPercent.innerHTML = `<span class="value--struck">${formatPercent(r.originalPercentOfAccount)}</span> ${formatPercent(r.percentOfAccount)} of account`;
      } else {
        this.elements.positionPercent.textContent = `${formatPercent(r.percentOfAccount)} of account`;
      }
    }
    if (this.elements.shares) this.elements.shares.textContent = formatNumber(r.shares);
    // Risk Amount - show strikethrough if limited
    if (this.elements.riskAmount) {
      if (r.isLimited) {
        this.elements.riskAmount.innerHTML = `<span class="value--struck">${formatCurrency(r.originalRiskDollars)}</span> ${formatCurrency(r.riskDollars)}`;
      } else {
        this.elements.riskAmount.textContent = formatCurrency(r.riskDollars);
      }
    }
    // Risk % - show strikethrough if limited
    if (this.elements.riskPercentDisplay) {
      if (r.isLimited) {
        this.elements.riskPercentDisplay.innerHTML = `<span class="value--struck">${formatPercent(r.originalRiskPercent)}</span> ${formatPercent(r.actualRiskPercent)} of account`;
      } else {
        this.elements.riskPercentDisplay.textContent = `${formatPercent(r.actualRiskPercent)} of account`;
      }
    }
    if (this.elements.stopDistance) this.elements.stopDistance.textContent = formatPercent(r.stopDistance);
    if (this.elements.stopPerShare) this.elements.stopPerShare.textContent = `${formatCurrency(r.stopPerShare)}/share`;
    if (this.elements.resultsTicker) this.elements.resultsTicker.textContent = `Ticker: ${ticker}`;

    // What If Section - Progressive Disclosure (profit or loss scenarios)
    if (r.rMultiple !== null && r.target) {
      const isProfit = r.profit >= 0;
      const colorClass = isProfit ? 'text-success' : 'text-danger';
      const sign = isProfit ? '+' : '-';

      // Show What If section
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
      // Hide What If section
      if (this.elements.whatIfSection) this.elements.whatIfSection.classList.remove('visible');
    }

    // Emit for header update
    state.emit('resultsRendered', r);
  }

  renderEmptyResults() {
    const defaults = {
      positionSize: '$0.00',
      positionPercent: '0% of account',
      shares: '0',
      riskAmount: '$0.00',
      riskPercentDisplay: '0% of account',
      stopDistance: '0%',
      stopPerShare: '$0.00/share',
      resultsTicker: 'Ticker: —'
    };

    // Hide What If section
    if (this.elements.whatIfSection) this.elements.whatIfSection.classList.remove('visible');

    Object.entries(defaults).forEach(([key, value]) => {
      if (this.elements[key]) this.elements[key].textContent = value;
    });

    // Hide R-progress bar
    if (this.elements.rProgressBar) {
      this.elements.rProgressBar.classList.remove('visible');
    }
  }

  renderInsights(entry, stop, target, stopDistance, isLimited) {
    const insights = [];

    if (entry && stop) {
      insights.push({
        type: 'neutral',
        icon: '📉',
        text: `Stop is ${formatPercent(stopDistance)} below entry`
      });
    }

    if (target && entry) {
      const targetDistance = ((target - entry) / entry) * 100;
      if (target <= entry) {
        insights.push({
          type: 'warning',
          icon: '⚠️',
          text: 'Target should be above entry for long trades'
        });
      } else {
        insights.push({
          type: 'success',
          icon: '📈',
          text: `Target is ${formatPercent(targetDistance)} above entry`
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

  // Public method to fill form from parsed data
  fillFromParsed(parsed) {
    if (parsed.ticker && this.elements.ticker) this.elements.ticker.value = parsed.ticker;
    if (parsed.entry && this.elements.entryPrice) this.elements.entryPrice.value = parsed.entry;
    if (parsed.stop && this.elements.stopLoss) this.elements.stopLoss.value = parsed.stop;
    if (parsed.target && this.elements.targetPrice) this.elements.targetPrice.value = parsed.target;

    if (parsed.riskPercent) {
      state.updateAccount({ riskPercent: parsed.riskPercent });
      // Update custom risk input if it exists
      if (this.elements.customRisk) this.elements.customRisk.value = parsed.riskPercent;
      // Sync risk button active state
      this.syncRiskButton();
    }

    this.calculate();
  }

  // R-Progress Bar rendering
  renderRProgressBar(entry, stop, shares, riskPerShare) {
    const bar = this.elements.rProgressBar;
    if (!bar) return;

    // Only show for valid long positions (entry > stop)
    if (!entry || !stop || stop >= entry || shares <= 0) {
      bar.classList.remove('visible');
      return;
    }

    // Calculate all R-multiple levels
    const levels = {
      stop: { price: stop, profit: -(riskPerShare * shares) },
      entry: { price: entry, profit: 0 },
      r1: { price: entry + (1 * riskPerShare), profit: 1 * riskPerShare * shares },
      r2: { price: entry + (2 * riskPerShare), profit: 2 * riskPerShare * shares },
      r3: { price: entry + (3 * riskPerShare), profit: 3 * riskPerShare * shares },
      r4: { price: entry + (4 * riskPerShare), profit: 4 * riskPerShare * shares },
      r5: { price: entry + (5 * riskPerShare), profit: 5 * riskPerShare * shares }
    };

    // Update DOM elements
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

    // Show the progress bar with animation
    bar.classList.add('visible');
  }

  // Validation helpers
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
