# HyperAnc - Hyperbolic Ancestry Viewer

An interactive genealogy visualization tool offering three distinct views of family trees: a hyperbolic (Poincare disk) projection, a horizontal pedigree timeline, and a classical ancestor tree. Built as a pure frontend application with no server-side dependencies or build step.

## Features

### Three Visualization Modes

- **Hyperbolic View (Hyper)** - Globe-like Poincare disk projection where the selected person is at the center and ancestors/descendants radiate outward with natural compression at the edges. Navigate by dragging (Mobius transform panning), zoom generations with mouse wheel, click any person to re-center.

- **Timeline View (Zeitlinie)** - Horizontal pedigree timeline with the father line above and mother line below the active person. Features a fixed time axis with 25-year ticks, a crosshair cursor showing the year and age-at-cursor for hovered persons, marriage lines on hover, and partner/children/sibling rows. Drag to pan vertically.

- **Tree View (Baum)** - Classical pedigree chart with the active person in the middle, children branching upward, ancestors branching downward. Partners shown to the left, siblings to the right. Includes a generation time axis on the left panel and green continuation indicators showing where more data exists beyond the displayed depth. Drag to pan in any direction. Names are abbreviated (e.g., "Horst A. H. Stiewe").

### Relationships & Family

- **Sibling Display** - Toggle button to show siblings and half-siblings across all views. Full siblings shown with dashed lines, half-siblings with dotted/paler lines.
- **Relationship Labels** - German relationship terms calculated relative to the active person, including: Vater, Mutter, Onkel, Tante, Schwager, Schwägerin, Schwiegersohn, Schwiegertochter, Neffe, Nichte, Urgroßmutter väterlicherseits, and more.
- **Marriage Lines** - Hover over a child to see a curved line connecting its parents (bowed away from the child), with marriage date label.
- **Direction Arrows** - Small triangles on tree edges indicating parent-to-child direction, following geodesic curves in the hyperbolic view.

### Information Panels

- **Left Panel** - Active (center) person: name, dates, age, birthplace, occupation, parents, siblings (with count), partner (with wedding year), children - all clickable for navigation.
- **Right Panel** - Hovered person: same details plus relationship to center person (e.g., "Großonkel", "Schwägerin"). In timeline view, also shows dynamic age at crosshair position (e.g., "1970: 36 Jahre").
- **Map View** - On-demand geocoding via Nominatim (OpenStreetMap) with Leaflet map in the bottom-left corner showing birth/death locations. Results cached in localStorage.
- **Photos** - GEDCOM image references (OBJE/FILE) displayed in info panels when available (supports URLs and local paths).

### Data Management

- **GEDCOM Support** - Load and save GEDCOM 5.5.1 and 7.0 files with automatic format detection.
- **Multiple Load Methods** - File upload dialog, URL input (e.g., from GitHub), drag & drop onto the dialog or main canvas.
- **Export** - Save as GEDCOM 5.5.1 or 7.0 with selectable filename.
- **German Date Format** - All dates displayed as dd.MM.yyyy with age in years (hidden if >120 years).

### Navigation & Interaction

- **Back/Forward** - Arrow buttons in header bar and Alt+Arrow keyboard shortcuts with internal history stack.
- **UI Zoom** - Ctrl+Mousewheel to scale all fonts and elements, Ctrl+0 to reset.
- **Drag to Pan** - Works in all three views (globe panning in Hyper, scroll panning in Timeline and Tree).
- **Person Search** - Type-ahead search in the header bar.

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- A local HTTP server (required for ES modules and fetch)

### Running

The simplest way to serve the application:

```bash
npx serve . -l 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

Alternative servers:

```bash
# Using http-server
npx http-server . -p 8080 -c-1

# Using Python
python -m http.server 8080

# Using PHP
php -S localhost:8080
```

> **Note:** Opening `index.html` directly via `file://` will not work due to ES module and fetch restrictions.

### Loading Data

The application loads `horst_bob.ged` by default on startup. To load a different file:

1. Click **Laden** in the header bar
2. Choose one of:
   - **File upload** - Select a `.ged` file from your computer
   - **URL** - Enter a URL to a GEDCOM file (e.g., `https://raw.githubusercontent.com/pjcj/Gedcom.pm/master/royal.ged`)
   - **Drag & Drop** - Drop a `.ged` file onto the dialog or the main canvas

### Saving Data

1. Click **Speichern** in the header bar
2. Select format: GEDCOM 5.5.1 or GEDCOM 7.0
3. Enter a filename and click **Herunterladen**

## Project Structure

```
hyperanc/
  index.html              Main HTML shell, view containers, dialogs
  css/
    styles.css            Dark theme, globe effects, panels, dialogs, responsive
  js/
    main.js               Entry point, app orchestration, view switching, zoom, history
    gedcom-parser.js      GEDCOM 5.5.1/7.0 parser, date formatting, age calculation
    gedcom-writer.js      GEDCOM export (5.5.1 and 7.0)
    file-io.js            File loading (upload, URL, drag & drop), download
    tree-builder.js       Rooted tree construction, sibling/half-sibling detection
    hyperbolic-math.js    Poincare disk math (Mobius transforms, geodesics, complex arithmetic)
    hyperbolic-layout.js  Assigns Poincare disk coordinates to tree nodes
    sibling-layout.js     Places sibling nodes with collision avoidance
    renderer.js           D3/SVG rendering for hyperbolic view (nodes, edges, arrows, marriage lines)
    interaction.js        Globe-like Mobius drag panning, zoom, click-to-recenter, touch support
    timeline-view.js      Horizontal pedigree timeline (father above, mother below, crosshair)
    tree-view.js          Classical pedigree tree (children up, ancestors down, time axis, drag pan)
    map-view.js           Leaflet map component for location markers
    geocoder.js           Nominatim geocoding client with localStorage cache
    ui.js                 Info panels, search, tooltips, relationship calculation, map integration
```

## Technology Stack

- **D3.js v7** - SVG rendering, data joins, transitions (CDN)
- **Leaflet.js v1.9** - Map tiles from OpenStreetMap (CDN)
- **Nominatim** - Free geocoding API (no API key required, fair-use policy: max 1 req/sec)
- **ES Modules** - Native browser modules, no bundler needed
- **No build step** - Pure HTML/CSS/JS, no npm install required

## External Dependencies (loaded via CDN)

| Library | Version | Purpose |
|---------|---------|---------|
| D3.js | 7.x | SVG rendering and data visualization |
| Leaflet | 1.9.x | Interactive maps with OpenStreetMap tiles |

## Browser Compatibility

Tested with modern browsers supporting ES2020+ features:
- Chrome 90+
- Firefox 90+ (CSS zoom fallback for versions < 126)
- Edge 90+
- Safari 15+

## GEDCOM Format Support

### Reading
- **GEDCOM 5.5.1** - Full support for INDI, FAM, NAME, SEX, BIRT, DEAT, MARR, OCCU, FAMS, FAMC, OBJE/FILE tags
- **GEDCOM 7.0** - Compatible parsing (same core tag structure, UTF-8 assumed)
- Auto-detection based on `VERS` tag in header
- `_HOME` tag support for default start person

### Writing
- Export to GEDCOM 5.5.1 (with CHAR UTF-8, FORM LINEAGE-LINKED)
- Export to GEDCOM 7.0 (without CHAR tag, UTF-8 implicit)
- Preserves all parsed data fields (names, dates, places, occupations, family links)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Alt + Left Arrow | Navigate back to previous person |
| Alt + Right Arrow | Navigate forward |
| Ctrl + Mousewheel | Zoom UI (fonts and elements) |
| Ctrl + 0 | Reset zoom to 100% |

## Geocoding

Location data is geocoded on-demand using the [Nominatim](https://nominatim.openstreetmap.org/) API when hovering over a person with known birth or death places. Results are cached in the browser's localStorage to avoid repeated API calls. The geocoder handles:

- German place names with regional suffixes (e.g., "Frankfurt/Main", "Oelsnitz/Vogtl.")
- Historical place names (with fallback search without country restriction)
- Places marked as "unbekannt" (unknown) are skipped

## License

This project is provided as-is for genealogy research and visualization purposes.
