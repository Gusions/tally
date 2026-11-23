# Changelog

### 0.9.10
- Spreadsheet templates (empty and demo) with an editable Categories tab that fills Primary and Secondary, an Investing tab and English labels; rewritten README.
- The year is now read from the "<year> Expenses" tab name when there is no Daily Spending tab.
- English labels accepted next to the Italian ones: Total/Somma, Employee/Dipendente, Freelance/P.IVA, Unemployment/NASpI, Scheduled Payments/PAGAMENTI PROGRAMMATI.
- Home view: electricity is matched with either spelling (Eletricity or Electricity).

### 0.9.9
- Spending: removed the duplicate category legend (the clickable category chips already carry the colours).
- A background refresh that brings identical data now updates only the header, so the page no longer rebuilds or loses its scroll position.
- Browser scroll anchoring disabled inside the dashboard.


### 0.9.8
- Refresh button gives feedback in the flat look: the icon spins while the sheet downloads and a notice says whether data changed.

### 0.9.7
- Faster start: the dashboard paints from the saved copy immediately, then refreshes from Google in the background and re-renders only if the content changed.

### 0.9.6
- Flat look: KPI labels and details stay on one line (ellipsis with a tooltip), no more misaligned text.

### 0.9.5
- New "refined" and "nordic" palettes.

### 0.9.4
- Flat look, desktop: a single header row (tabs, period, Charts/Tables, icon buttons); filters open from a button.

### 0.9.3
- Flat look: clearer separation between header bands.

### 0.9.2
- Flat look: more breathing room between header, tabs and filters.

### 0.9.1
- Flat look: alignment fixes and boxed controls.

### 0.9.0
- New optional visual style "Kith" (Settings, Visual style), a flat and dense layout; classic stays the default.

### 0.8.5
- Chart tooltips now close on touch screens: tap outside, after a short delay, or on scroll.

### 0.8.4
- "Liquidity month by month" is a diverging chart: rises above zero, falls below, signed labels and axis, signed tooltip.
- Net worth: "Zero positions" and "Compare with December" are off by default.

### 0.8.3
- Phone: the tab bar moves to the top, sticky under the title. Nothing at the bottom, so no overlap with Obsidian's navigation bar; extra bottom padding keeps the last card clear of it.
- "More" menu opens downwards.

### 0.8.2
- Phone: detects whatever Obsidian element overlaps the bottom of the view (selector-independent) and reports it to the debug log.

### 0.8.1
- Phone: tab bar lifted above Obsidian's bottom bar; option to hide Obsidian's bottom bar while Tally is open.

### 0.8.0
- Modern phone layout: bottom tab bar, compact header, collapsible filters, KPI grid, full-screen settings.

### 0.7.x
- Phone support, cached file offline.

### 0.6.0
- Customisation dialog.

### 0.5.x
- Blur amounts button.

### 0.4.x
- Filters on every view, positions and monitoring toggles, copyable text, Amex flags, income fixes.
