# Scans Archive Feature - Implementation Plan

## Status: Coming Soon (Infrastructure Complete)

The basic infrastructure is in place and ready for content. This document outlines remaining work to fully launch the feature.

---

## What's Done (Phase 1 Infrastructure)

### Navigation & View
- [x] 6th nav button "Scans" with target icon
- [x] Keyboard shortcut (Cmd/Ctrl + 6)
- [x] View container with header, nav buttons, content area
- [x] Empty/coming soon state with proper styling
- [x] CSS styling matching other views

### Core Files Created
- `js/scansView.js` - View logic with manifest loading, table sorting, ticker copy
- `css/scans.css` - Complete view styling
- `site/scans/manifest.json` - Scan registry (empty)
- `scripts/upload_scan.py` - Python CLI for uploading scans

### Upload Script Features
- CSV to HTML table conversion
- Currency formatting ($1.23M, $1.23B notation)
- Positive/negative value coloring
- Flags: `--publish`, `--name`, `--date`, `--title`, `--tags`, `--push`, `--sort`, `--order`
- Auto-updates manifest.json

---

## Phase 2: Launch Ready

### 2.1 Content Upload
- [ ] Upload first batch of scans
- [ ] Verify display and sorting works
- [ ] Test prev/next navigation

### 2.2 Table Polish
- [ ] Click-to-sort column headers (already implemented, needs testing)
- [ ] Sort indicators (arrows) - implemented
- [ ] Click-to-copy ticker symbols - implemented
- [ ] Verify positive/negative coloring

---

## Phase 3: Enhanced Navigation

### 3.1 Date Picker & Archive
- [ ] Hierarchical date picker (month > day)
- [ ] Multiple scans per day shown as pills/tabs
- [ ] URL hash state for sharing links (`#scans/2024-12-27-momentum`)
- [ ] Calendar view for browsing history

### 3.2 Keyboard Navigation
- [ ] Arrow keys for prev/next scan
- [ ] Number keys for quick date jumping
- [ ] `/` to focus search

---

## Phase 4: Tags & Filtering

### 4.1 Tag System
- [ ] Tag pills displayed on each scan card
- [ ] Tag filter bar (click to filter)
- [ ] Multi-tag support
- [ ] Predefined tags: momentum, growth, semis, value, sectors, premarket

### 4.2 Search
- [ ] Search across scan titles/tags
- [ ] Ticker search within scans
- [ ] Recent scans quick access

---

## Phase 5: Enhanced Upload Script

### 5.1 Additional Flags
- [ ] `--sector` presets (semis, energy, etc.)
- [ ] `--subtitle` for additional context
- [ ] `--png` screenshot generation (Playwright)

### 5.2 Validation & Helpers
- [ ] CSV format validation
- [ ] Preview mode (`--dry-run`)
- [ ] List existing scans (`--list`)
- [ ] Delete scan (`--delete`)

---

## Phase 6: Polish & Extras

- [ ] Favorites/bookmarks system
- [ ] Notes per scan
- [ ] Scan comparison view (side-by-side)
- [ ] Export to Discord/clipboard formatted
- [ ] Sparkline charts per ticker (optional)
- [ ] Mobile-optimized table scrolling

---

## File Structure

```
skyler.tools-prod/
├── css/
│   └── scans.css              # View styling
├── js/
│   └── scansView.js           # View logic
├── site/
│   └── scans/
│       ├── manifest.json      # Scan registry
│       └── *.html             # Individual scan files
├── scripts/
│   └── upload_scan.py         # Python CLI tool
└── docs/
    └── scans-implementation-plan.md  # This file
```

---

## Upload Script Usage

```bash
# Basic upload
python scripts/upload_scan.py input.csv --publish --name momentum

# With custom date and title
python scripts/upload_scan.py input.csv --publish --date 2024-12-25 --name premarket --title "Pre-Market Movers"

# Auto push to git
python scripts/upload_scan.py input.csv --publish --name semis --push

# With sorting
python scripts/upload_scan.py input.csv --publish --name gainers --sort "Change %" --order desc
```

---

## Notes

- Manifest is intentionally empty for "Coming Soon" state
- All infrastructure tested and working
- Ready to launch when content pipeline is established
