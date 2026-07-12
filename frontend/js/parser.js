/**
 * Discord Alert Parser - Parse trading alerts from Discord
 */

import { calculator } from './calculator.js';
import { showToast } from './ui.js';

class AlertParser {
  constructor() {
    this.elements = {};
  }

  init() {
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.elements = {
      alertCard: document.getElementById('alertCard'),
      pasteBtn: document.getElementById('pasteAlertBtn'),
      shortcutHint: document.getElementById('shortcutHint'),
      discordHint: document.getElementById('discordHint')
    };
  }

  bindEvents() {
    // Paste button click handler
    if (this.elements.pasteBtn) {
      this.elements.pasteBtn.addEventListener('click', () => this.pasteAndParse());
    }

    // Global paste handler (Cmd/Ctrl+V anywhere)
    document.addEventListener('paste', (e) => {
      // Only handle if focus is not in an input/textarea
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      this.handlePaste(e);
    });

    // Set shortcut hint text (Mac vs Windows)
    this.setShortcutHint();
  }

  setShortcutHint() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (this.elements.shortcutHint) {
      if (isMobile) {
        this.elements.shortcutHint.textContent = 'Tap to paste';
      } else {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const textSpan = this.elements.shortcutHint.querySelector('.shortcut-text');
        if (textSpan) {
          textSpan.textContent = isMac ? '⌘V' : 'Ctrl+V';
        }
      }
    }

    // Update Discord hint text for mobile
    if (this.elements.discordHint && isMobile) {
      this.elements.discordHint.textContent = '(or tap to paste Discord alert to auto-fill)';
    }
  }

  async handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text');
    if (text) {
      await this.parseAndFill(text);
    }
  }

  async pasteAndParse() {
    try {
      const text = await navigator.clipboard.readText();

      if (!text || !text.trim()) {
        this.flashButton('error');
        showToast('⚠️ Clipboard is empty', 'warning');
        return;
      }

      await this.parseAndFill(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      showToast('❌ Could not read clipboard. Try pasting manually.', 'error');
    }
  }

  flashButton(type) {
    if (!this.elements.pasteBtn) return;
    
    const className = type === 'success' ? 'flash-success' : 'error';
    this.elements.pasteBtn.classList.add(className);
    setTimeout(() => {
      this.elements.pasteBtn.classList.remove(className);
    }, type === 'success' ? 1000 : 500);
  }

  parse(text) {
    if (!text) return null;

    const result = {};

    // Ticker MUST have $ prefix (e.g., $TSLA, $AXTI)
    const dollarTickerMatch = text.match(/\$([A-Z]{1,5})\b/i);
    if (dollarTickerMatch) {
      result.ticker = dollarTickerMatch[1].toUpperCase();
    }

    // Entry price: @ 243.10, adding @ 243, bought @ 243
    const entryMatch = text.match(/(?:@|entry|adding|add|bought?)\s*\$?\s*([\d.]+)/i);
    if (entryMatch) {
      result.entry = parseFloat(entryMatch[1]);
    }

    // Stop loss: sl 237.90, stop 237, stop loss @ 237.90
    const stopMatch = text.match(/(?:sl|stop(?:\s*loss)?)\s*@?\s*\$?\s*([\d.]+)/i);
    if (stopMatch) {
      result.stop = parseFloat(stopMatch[1]);
    }

    // Risk percent: risking 1%, risk 0.5%
    const riskMatch = text.match(/risk(?:ing)?\s*([\d.]+)\s*%/i);
    if (riskMatch) {
      result.riskPercent = parseFloat(riskMatch[1]);
    }

    // Target: target 260, tp 260, pt 260
    const targetMatch = text.match(/(?:target|tp|pt)\s*@?\s*\$?\s*([\d.]+)/i);
    if (targetMatch) {
      result.target = parseFloat(targetMatch[1]);
    }

    // Require at least entry AND stop for a valid alert
    if (!result.entry || !result.stop) {
      return null;
    }

    return result;
  }

  async parseAndFill(text) {
    const parsed = this.parse(text);

    if (!parsed || (!parsed.ticker && !parsed.entry && !parsed.stop)) {
      this.flashButton('error');
      showToast('⚠️ Could not parse alert', 'warning');
      return;
    }

    // Fill calculator
    calculator.fillFromParsed(parsed);

    // Build feedback message
    const parts = [];
    if (parsed.ticker) parts.push(parsed.ticker);
    if (parsed.entry) parts.push(`@ $${parseFloat(parsed.entry).toFixed(2)}`);
    if (parsed.stop) parts.push(`SL $${parseFloat(parsed.stop).toFixed(2)}`);
    if (parsed.riskPercent) parts.push(`${parsed.riskPercent}%`);

    this.flashButton('success');
    showToast(`⚡ Loaded: ${parts.join(' | ')}`, 'success');

    // On mobile, scroll to Position Details section
    this.scrollToResultsOnMobile();
  }

  scrollToResultsOnMobile() {
    // Only scroll on mobile viewports (768px or less)
    if (window.innerWidth > 768) return;

    const resultsPanel = document.querySelector('.panel--results');
    if (!resultsPanel) return;

    // Delay to let the results panel become visible after FocusManager.activateResults()
    setTimeout(() => {
      const headerHeight = 60; // Account for fixed header
      const padding = 16; // Extra padding for visual breathing room
      const targetY = resultsPanel.getBoundingClientRect().top + window.scrollY - headerHeight - padding;

      window.scrollTo({
        top: targetY,
        behavior: 'smooth'
      });
    }, 100);
  }
}

export const parser = new AlertParser();
export { AlertParser };
