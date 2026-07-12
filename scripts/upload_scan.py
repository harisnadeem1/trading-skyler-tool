#!/usr/bin/env python3
"""
upload_scan.py - Upload stock scan results to skyler.tools

Usage:
    python upload_scan.py input.csv --publish
    python upload_scan.py input.csv --publish --name momentum
    python upload_scan.py input.csv --publish --name semis --push
    python upload_scan.py input.csv --publish --date 2024-12-25 --name premarket --push

Flags:
    --publish       Save scan to site/scans/ with today's date
    --date          Override date (YYYY-MM-DD format)
    --name          Add name suffix (e.g., "momentum", "semis")
    --title         Custom title for the scan
    --tags          Comma-separated tags (e.g., "momentum,growth")
    --push          Git add, commit, and push after publishing
    --sort          Column to sort by
    --order         Sort order: asc or desc (default: desc)
"""

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description='Upload stock scan to skyler.tools')
    parser.add_argument('input', help='Input CSV file')
    parser.add_argument('--publish', action='store_true', help='Publish to site/scans/')
    parser.add_argument('--date', help='Override date (YYYY-MM-DD)', default=None)
    parser.add_argument('--name', help='Scan name suffix', default=None)
    parser.add_argument('--title', help='Custom title', default=None)
    parser.add_argument('--tags', help='Comma-separated tags', default=None)
    parser.add_argument('--push', action='store_true', help='Git add, commit, push')
    parser.add_argument('--sort', help='Column to sort by', default=None)
    parser.add_argument('--order', choices=['asc', 'desc'], default='desc', help='Sort order')
    return parser.parse_args()


def read_csv(filepath):
    """Read CSV file and return headers + rows."""
    rows = []
    headers = []

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            if any(cell.strip() for cell in row):  # Skip empty rows
                rows.append(row)

    return headers, rows


def sort_rows(headers, rows, sort_col, order='desc'):
    """Sort rows by a column."""
    if not sort_col:
        return rows

    try:
        col_idx = headers.index(sort_col)
    except ValueError:
        print(f"Warning: Column '{sort_col}' not found, skipping sort")
        return rows

    def parse_value(val):
        """Parse cell value for sorting (handle $, %, K, M, B)."""
        val = val.strip().replace('$', '').replace(',', '')

        # Handle K/M/B suffixes
        multiplier = 1
        if val.endswith('K'):
            val = val[:-1]
            multiplier = 1000
        elif val.endswith('M'):
            val = val[:-1]
            multiplier = 1000000
        elif val.endswith('B'):
            val = val[:-1]
            multiplier = 1000000000
        elif val.endswith('%'):
            val = val[:-1]

        try:
            return float(val) * multiplier
        except ValueError:
            return val

    reverse = order == 'desc'
    return sorted(rows, key=lambda r: parse_value(r[col_idx]) if col_idx < len(r) else '', reverse=reverse)


def format_currency(val):
    """Format large numbers as $1.23M, $1.23B, etc."""
    try:
        num = float(val.strip().replace(',', ''))
    except ValueError:
        return val

    if abs(num) >= 1_000_000_000:
        return f"${num / 1_000_000_000:.2f}B"
    elif abs(num) >= 1_000_000:
        return f"${num / 1_000_000:.2f}M"
    elif abs(num) >= 1_000:
        return f"${num / 1_000:.2f}K"
    else:
        return f"${num:.2f}"


def format_cell(cell, header):
    """Format cell value based on column type."""
    val = cell.strip()

    # Skip if already formatted or empty
    if not val or val.startswith('$') or val.endswith('%'):
        return val

    # Format liquidity/volume columns with large numbers
    liquidity_cols = ['daily liquidity', 'liquidity', 'volume', 'avg volume', 'market cap']
    if header.lower() in liquidity_cols:
        try:
            num = float(val.replace(',', ''))
            if num >= 1000:  # Only format large numbers
                return format_currency(val)
        except ValueError:
            pass

    return val


def generate_html(headers, rows):
    """Generate HTML table from data."""
    html = ['<table>']

    # Header row
    html.append('  <thead>')
    html.append('    <tr>')
    for header in headers:
        html.append(f'      <th>{header}</th>')
    html.append('    </tr>')
    html.append('  </thead>')

    # Body rows
    html.append('  <tbody>')
    for row in rows:
        html.append('    <tr>')
        for i, cell in enumerate(row):
            # Format cell value
            header = headers[i] if i < len(headers) else ''
            formatted = format_cell(cell, header)

            # Add positive/negative class for numeric values
            cell_class = ''
            cell_val = cell.strip()
            if cell_val.startswith('+') or (cell_val.replace('.', '').replace('%', '').isdigit() and float(cell_val.replace('%', '')) > 0):
                cell_class = ' class="positive"'
            elif cell_val.startswith('-'):
                cell_class = ' class="negative"'

            html.append(f'      <td{cell_class}>{formatted}</td>')
        html.append('    </tr>')
    html.append('  </tbody>')

    html.append('</table>')
    return '\n'.join(html)


def update_manifest(manifest_path, scan_entry):
    """Add scan to manifest.json."""
    manifest = {'scans': []}

    if manifest_path.exists():
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)

    # Remove existing entry with same ID if exists
    manifest['scans'] = [s for s in manifest['scans'] if s['id'] != scan_entry['id']]

    # Add new entry
    manifest['scans'].append(scan_entry)

    # Sort by date
    manifest['scans'].sort(key=lambda s: s['date'])

    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"Updated manifest: {manifest_path}")


def git_push(scan_id):
    """Git add, commit, and push."""
    try:
        subprocess.run(['git', 'add', 'site/scans/'], check=True)
        subprocess.run(['git', 'commit', '-m', f'Add scan: {scan_id}'], check=True)
        subprocess.run(['git', 'push'], check=True)
        print("Pushed to git")
    except subprocess.CalledProcessError as e:
        print(f"Git error: {e}")
        sys.exit(1)


def main():
    args = parse_args()

    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    # Read CSV
    headers, rows = read_csv(input_path)
    print(f"Read {len(rows)} rows from {input_path}")

    # Sort if specified
    if args.sort:
        rows = sort_rows(headers, rows, args.sort, args.order)
        print(f"Sorted by {args.sort} ({args.order})")

    # Generate HTML
    html = generate_html(headers, rows)

    if not args.publish:
        # Just print HTML to stdout
        print(html)
        return

    # Determine output paths
    script_dir = Path(__file__).parent.parent
    scans_dir = script_dir / 'site' / 'scans'
    scans_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    date_str = args.date or datetime.now().strftime('%Y-%m-%d')
    scan_id = date_str
    if args.name:
        scan_id = f"{date_str}-{args.name}"

    filename = f"{scan_id}.html"
    output_path = scans_dir / filename

    # Write HTML file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Saved: {output_path}")

    # Update manifest
    manifest_path = scans_dir / 'manifest.json'
    scan_entry = {
        'id': scan_id,
        'date': date_str,
        'name': args.name or '',
        'title': args.title or (args.name.title() if args.name else 'Daily Scan'),
        'tags': [t.strip() for t in args.tags.split(',')] if args.tags else [],
        'file': filename
    }
    update_manifest(manifest_path, scan_entry)

    # Git push if requested
    if args.push:
        os.chdir(script_dir)
        git_push(scan_id)

    print(f"\nScan published: {scan_id}")
    print(f"View at: https://skyler.tools/#scans")


if __name__ == '__main__':
    main()
