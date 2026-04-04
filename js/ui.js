/**
 * UI Components
 * Search, info panel, person selector.
 */
import { getDisplayName, getLifespan } from './gedcom-parser.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');
    this.infoPanel = document.getElementById('info-panel');
    this.tooltip = document.getElementById('tooltip');
    this.rootName = document.getElementById('root-name');
    this.helpOverlay = document.getElementById('help-overlay');
    this.helpBtn = document.getElementById('help-btn');

    this.siblingsBtn = document.getElementById('siblings-btn');
    this.legendSibling = document.getElementById('legend-sibling');

    this._setupSearch();
    this._setupHelp();
    this._setupSiblingsToggle();
  }

  _setupSearch() {
    let debounceTimer;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this._performSearch(), 200);
    });

    this.searchInput.addEventListener('focus', () => {
      if (this.searchInput.value.length >= 2) this._performSearch();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.searchResults.style.display = 'none';
      }
    });
  }

  _performSearch() {
    const query = this.searchInput.value.toLowerCase().trim();
    if (query.length < 2) {
      this.searchResults.style.display = 'none';
      return;
    }

    const results = [];
    for (const [id, indi] of this.app.data.individuals) {
      const name = getDisplayName(indi).toLowerCase();
      if (name.includes(query)) {
        results.push({ id, individual: indi });
        if (results.length >= 15) break;
      }
    }

    this.searchResults.innerHTML = '';
    if (results.length === 0) {
      this.searchResults.innerHTML = '<div class="search-item no-result">Keine Ergebnisse</div>';
    } else {
      for (const r of results) {
        const div = document.createElement('div');
        div.className = 'search-item';
        const lifespan = getLifespan(r.individual);
        div.innerHTML = `<strong>${getDisplayName(r.individual)}</strong>${lifespan ? ` <span class="lifespan">(${lifespan})</span>` : ''}`;
        div.addEventListener('click', () => {
          this.app.selectPerson(r.id);
          this.searchResults.style.display = 'none';
          this.searchInput.value = '';
        });
        this.searchResults.appendChild(div);
      }
    }
    this.searchResults.style.display = 'block';
  }

  _setupHelp() {
    if (this.helpBtn) {
      this.helpBtn.addEventListener('click', () => {
        this.helpOverlay.style.display =
          this.helpOverlay.style.display === 'none' ? 'flex' : 'none';
      });
    }
    if (this.helpOverlay) {
      this.helpOverlay.addEventListener('click', (e) => {
        if (e.target === this.helpOverlay) {
          this.helpOverlay.style.display = 'none';
        }
      });
    }
  }

  _setupSiblingsToggle() {
    if (this.siblingsBtn) {
      this.siblingsBtn.addEventListener('click', () => {
        const active = this.app.toggleSiblings();
        this.siblingsBtn.classList.toggle('active', active);
        if (this.legendSibling) {
          this.legendSibling.style.display = active ? 'flex' : 'none';
        }
      });
    }
  }

  setRootPerson(individual) {
    const name = getDisplayName(individual);
    const lifespan = getLifespan(individual);
    this.rootName.textContent = lifespan ? `${name} (${lifespan})` : name;
  }

  showTooltip(node, event) {
    const indi = node.individual;
    const name = getDisplayName(indi);
    const lifespan = getLifespan(indi);

    let html = `<div class="tooltip-name">${name}</div>`;
    if (lifespan) html += `<div class="tooltip-dates">${lifespan}</div>`;
    if (indi.birthPlace) html += `<div class="tooltip-place">Geburtsort: ${indi.birthPlace}</div>`;
    if (indi.occupation) html += `<div class="tooltip-occ">Beruf: ${indi.occupation}</div>`;
    if (node.ahnentafelNumber) html += `<div class="tooltip-ahn">Ahnentafel #${node.ahnentafelNumber}</div>`;
    if (node.direction === 'sibling') html += `<div class="tooltip-gen">Geschwister</div>`;
    else if (node.generation > 0) html += `<div class="tooltip-gen">Generation ${node.generation}</div>`;
    else if (node.generation < 0) html += `<div class="tooltip-gen">Nachkomme Gen. ${-node.generation}</div>`;

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';

    // Position tooltip near mouse
    const rect = document.getElementById('hyperbolic-svg').getBoundingClientRect();
    let x = event.clientX - rect.left + 15;
    let y = event.clientY - rect.top - 10;

    // Keep within bounds
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    if (x + tw > rect.width) x = x - tw - 30;
    if (y + th > rect.height) y = y - th;

    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
  }

  updateInfoPanel(node) {
    if (!node) {
      this.infoPanel.innerHTML = '<div class="info-empty">Klicken Sie auf eine Person</div>';
      return;
    }
    const indi = node.individual;
    const name = getDisplayName(indi);

    let html = `<div class="info-name">${name}</div>`;
    const parts = [];
    if (indi.birthDate) parts.push(`* ${indi.birthDate}${indi.birthPlace ? ', ' + indi.birthPlace : ''}`);
    if (indi.deathDate) parts.push(`+ ${indi.deathDate}${indi.deathPlace ? ', ' + indi.deathPlace : ''}`);
    if (indi.occupation) parts.push(`Beruf: ${indi.occupation}`);
    if (node.ahnentafelNumber) parts.push(`Ahnentafel #${node.ahnentafelNumber}`);

    if (parts.length > 0) {
      html += `<div class="info-details">${parts.join(' | ')}</div>`;
    }

    this.infoPanel.innerHTML = html;
  }
}
