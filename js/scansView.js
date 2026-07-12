/**
 * ScansView - Daily stock scans archive viewer
 */

import { state } from './state.js';

class ScansView {
  constructor() {
    this.elements = {};
    this.manifest = null;
    this.scans = [];
    this.currentIndex = -1;
    this.currentScan = null;
  }

  async init() {
    this.cacheElements();
    this.bindEvents();

    // Load manifest when view is first shown
    state.on('viewChanged', async (data) => {
      if (data.to === 'scans' && !this.manifest) {
        await this.loadManifest();
      }
    });
  }

  cacheElements() {
    this.elements = {
      view: document.getElementById('scansView'),
      subtitle: document.getElementById('scansSubtitle'),
      content: document.getElementById('scansContent'),
      empty: document.getElementById('scansEmpty'),
      prevBtn: document.getElementById('scansPrevBtn'),
      nextBtn: document.getElementById('scansNextBtn')
    };
  }

  bindEvents() {
    // Navigation buttons
    this.elements.prevBtn?.addEventListener('click', () => this.navigatePrev());
    this.elements.nextBtn?.addEventListener('click', () => this.navigateNext());

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isActive()) return;
      if (e.key === 'ArrowLeft') this.navigatePrev();
      if (e.key === 'ArrowRight') this.navigateNext();
    });
  }

  isActive() {
    return this.elements.view?.classList.contains('view--active');
  }

  async loadManifest() {
    try {
      const response = await fetch('site/scans/manifest.json');
      if (!response.ok) {
        console.warn('ScansView: No manifest found');
        this.showEmpty();
        return;
      }

      this.manifest = await response.json();
      this.scans = this.manifest.scans || [];

      if (this.scans.length === 0) {
        this.showEmpty();
        return;
      }

      // Show most recent scan
      this.currentIndex = this.scans.length - 1;
      await this.loadScan(this.currentIndex);
    } catch (err) {
      console.error('ScansView: Failed to load manifest', err);
      this.showEmpty();
    }
  }

  async loadScan(index) {
    if (index < 0 || index >= this.scans.length) return;

    const scan = this.scans[index];
    this.currentScan = scan;
    this.currentIndex = index;

    try {
      const response = await fetch(`site/scans/${scan.file}`);
      if (!response.ok) throw new Error('Scan file not found');

      const html = await response.text();
      this.renderScan(html, scan);
      this.updateNav();
    } catch (err) {
      console.error('ScansView: Failed to load scan', err);
      this.showEmpty();
    }
  }

  renderScan(html, scan) {
    // Hide empty state
    if (this.elements.empty) {
      this.elements.empty.style.display = 'none';
    }

    // Update subtitle with scan info
    if (this.elements.subtitle) {
      const date = new Date(scan.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const name = scan.name ? ` - ${scan.title || scan.name}` : '';
      this.elements.subtitle.textContent = `${date}${name}`;
    }

    // Inject scan HTML
    if (this.elements.content) {
      // Create wrapper for the scan table
      const wrapper = document.createElement('div');
      wrapper.className = 'scan-table-wrapper';
      wrapper.innerHTML = html;

      // Clear and append (keep empty state element)
      const empty = this.elements.empty;
      this.elements.content.innerHTML = '';
      if (empty) this.elements.content.appendChild(empty);
      this.elements.content.appendChild(wrapper);

      // Initialize table sorting
      this.initTableSorting();

      // Initialize ticker copy
      this.initTickerCopy();
    }
  }

  showEmpty() {
    if (this.elements.empty) {
      this.elements.empty.style.display = 'flex';
    }
    if (this.elements.subtitle) {
      this.elements.subtitle.textContent = 'Daily stock scans archive';
    }
    this.updateNav();
  }

  updateNav() {
    const hasPrev = this.currentIndex > 0;
    const hasNext = this.currentIndex < this.scans.length - 1;

    if (this.elements.prevBtn) {
      this.elements.prevBtn.disabled = !hasPrev;
    }
    if (this.elements.nextBtn) {
      this.elements.nextBtn.disabled = !hasNext;
    }
  }

  navigatePrev() {
    if (this.currentIndex > 0) {
      this.loadScan(this.currentIndex - 1);
    }
  }

  navigateNext() {
    if (this.currentIndex < this.scans.length - 1) {
      this.loadScan(this.currentIndex + 1);
    }
  }

  initTableSorting() {
    const table = this.elements.content?.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    headers.forEach((th, colIndex) => {
      th.addEventListener('click', () => this.sortTable(table, colIndex, th));
    });
  }

  sortTable(table, colIndex, th) {
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.querySelector('td'));

    // Determine sort direction
    const isAsc = th.classList.contains('sorted-asc');
    const isDesc = th.classList.contains('sorted-desc');

    // Clear all sort classes
    table.querySelectorAll('th').forEach(header => {
      header.classList.remove('sorted-asc', 'sorted-desc');
    });

    // Set new sort direction
    const newDir = isAsc ? 'desc' : 'asc';
    th.classList.add(`sorted-${newDir}`);

    // Sort rows
    rows.sort((a, b) => {
      const aVal = this.getCellValue(a.cells[colIndex]);
      const bVal = this.getCellValue(b.cells[colIndex]);

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return newDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return newDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
  }

  getCellValue(cell) {
    if (!cell) return '';
    const text = cell.textContent.trim();

    // Try to parse as number (handle $, %, K, M, B)
    const numMatch = text.replace(/[$,]/g, '').match(/^(-?\d+\.?\d*)\s*([KMB%])?$/i);
    if (numMatch) {
      let num = parseFloat(numMatch[1]);
      const suffix = (numMatch[2] || '').toUpperCase();
      if (suffix === 'K') num *= 1000;
      if (suffix === 'M') num *= 1000000;
      if (suffix === 'B') num *= 1000000000;
      return num;
    }

    return text;
  }

  initTickerCopy() {
    const tickers = this.elements.content?.querySelectorAll('td:first-child');
    tickers?.forEach(td => {
      td.addEventListener('click', () => {
        const ticker = td.textContent.trim();
        navigator.clipboard.writeText(ticker).then(() => {
          // Show brief feedback
          const original = td.textContent;
          td.textContent = 'Copied!';
          td.style.color = 'var(--success)';
          setTimeout(() => {
            td.textContent = original;
            td.style.color = '';
          }, 1000);
        });
      });
    });
  }
}

export const scansView = new ScansView();
