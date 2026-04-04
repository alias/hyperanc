/**
 * UI Components
 * Search, center info panel, hover tooltip, map view.
 */
import { getDisplayName, getLifespan } from './gedcom-parser.js';
import { geocode, collectPlaces } from './geocoder.js';
import { MapView } from './map-view.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');
    this.centerInfo = document.getElementById('center-info');
    this.tooltip = document.getElementById('tooltip');
    this.rootName = document.getElementById('root-name');
    this.helpOverlay = document.getElementById('help-overlay');
    this.helpBtn = document.getElementById('help-btn');
    this.siblingsBtn = document.getElementById('siblings-btn');
    this.legendSibling = document.getElementById('legend-sibling');

    this.mapView = new MapView('map-container');
    this._currentHoverId = null;

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

  /**
   * Determine the relationship label relative to the center person.
   */
  _getRelationship(node) {
    if (node.generation === 0) return null; // is the center person

    // Ancestors via Ahnentafel number
    if (node.ahnentafelNumber && node.ahnentafelNumber > 1) {
      return this._ahnentafelToRelation(node.ahnentafelNumber, node.individual.sex);
    }

    // Descendants
    if (node.direction === 'descendant') {
      const gen = -node.generation;
      const sex = node.individual.sex;
      if (gen === 1) return sex === 'M' ? 'Sohn' : sex === 'F' ? 'Tochter' : 'Kind';
      if (gen === 2) return sex === 'M' ? 'Enkel' : sex === 'F' ? 'Enkelin' : 'Enkel';
      if (gen === 3) return sex === 'M' ? 'Urenkel' : sex === 'F' ? 'Urenkelin' : 'Urenkel';
      const prefix = 'Ur'.repeat(gen - 2);
      return sex === 'M' ? `${prefix}enkel` : sex === 'F' ? `${prefix}enkelin` : `${prefix}enkel`;
    }

    // Siblings
    if (node.direction === 'sibling') {
      return node.individual.sex === 'M' ? 'Bruder' : node.individual.sex === 'F' ? 'Schwester' : 'Geschwister';
    }

    return null;
  }

  /**
   * Convert Ahnentafel number to German relationship term.
   * 1=Proband, 2=Vater, 3=Mutter, 4=Großvater väterl., etc.
   */
  _ahnentafelToRelation(num, sex) {
    if (num === 1) return null;
    if (num === 2) return 'Vater';
    if (num === 3) return 'Mutter';

    // Determine generation from Ahnentafel number
    const gen = Math.floor(Math.log2(num));

    // Trace the path: each bit after the leading 1 tells us father(0) or mother(1)
    // Build the lineage description
    const isMale = num % 2 === 0;

    // Generation prefixes
    const prefixes = ['', '', 'Groß', 'Urgroß'];
    let prefix;
    if (gen < prefixes.length) {
      prefix = prefixes[gen];
    } else {
      // gen 4 = Ururgroß, gen 5 = Urururgroß, etc.
      prefix = 'Ur'.repeat(gen - 2) + 'groß';
    }

    // Determine the lineage path (väterlicherseits / mütterlicherseits)
    // Bit after leading 1: 0=father line, 1=mother line
    const bits = num.toString(2).slice(1); // remove leading 1
    const firstBit = bits[0]; // first ancestor direction
    let lineage = '';
    if (gen >= 2 && bits.length >= 2) {
      // Show the immediate branch
      lineage = firstBit === '0' ? ' väterlicherseits' : ' mütterlicherseits';
    }

    const base = isMale ? 'vater' : 'mutter';
    return `${prefix}${base}${lineage}`;
  }

  /**
   * Build person detail HTML (shared by center info and tooltip).
   */
  _buildPersonHtml(node, showRelation = false) {
    const indi = node.individual;
    const name = getDisplayName(indi);
    const lifespan = getLifespan(indi);
    const data = this.app.data;

    let html = `<div class="tooltip-name">${name}</div>`;
    if (lifespan) html += `<div class="tooltip-dates">${lifespan}</div>`;
    if (indi.birthPlace) html += `<div class="tooltip-place">Geburtsort: ${indi.birthPlace}</div>`;
    if (indi.deathPlace) html += `<div class="tooltip-place">Sterbeort: ${indi.deathPlace}</div>`;
    if (indi.occupation) html += `<div class="tooltip-occ">Beruf: ${indi.occupation}</div>`;
    if (node.ahnentafelNumber) html += `<div class="tooltip-ahn">Ahnentafel #${node.ahnentafelNumber}</div>`;
    if (showRelation) {
      const relation = this._getRelationship(node);
      if (relation) {
        html += `<div class="tooltip-relation">${relation}</div>`;
      }
    }

    // Family links (parents, siblings)
    if (data) {
      const familyHtml = this._buildFamilyLinks(indi, data);
      if (familyHtml) html += familyHtml;
    }

    return html;
  }

  /**
   * Build clickable links for parents and siblings.
   */
  _buildFamilyLinks(indi, data) {
    let html = '';

    // Parents
    if (indi.familyAsChild) {
      const fam = data.families.get(indi.familyAsChild);
      if (fam) {
        const parts = [];
        if (fam.husbandId) {
          const father = data.individuals.get(fam.husbandId);
          if (father) {
            parts.push(`<span class="person-link" data-id="${fam.husbandId}">V: ${getDisplayName(father)}</span>`);
          }
        }
        if (fam.wifeId) {
          const mother = data.individuals.get(fam.wifeId);
          if (mother) {
            parts.push(`<span class="person-link" data-id="${fam.wifeId}">M: ${getDisplayName(mother)}</span>`);
          }
        }
        if (parts.length > 0) {
          html += `<div class="tooltip-family"><div class="family-label">Eltern:</div>${parts.join('')}</div>`;
        }

        // Siblings (other children in the same family)
        const siblings = fam.childIds.filter(id => id !== indi.id);
        if (siblings.length > 0) {
          const sibParts = [];
          for (const sibId of siblings) {
            const sib = data.individuals.get(sibId);
            if (sib) {
              const rel = sib.sex === 'M' ? 'Bruder' : sib.sex === 'F' ? 'Schwester' : '';
              const prefix = rel ? `${rel}: ` : '';
              sibParts.push(`<span class="person-link" data-id="${sibId}">${prefix}${getDisplayName(sib)}</span>`);
            }
          }
          if (sibParts.length > 0) {
            html += `<div class="tooltip-family"><div class="family-label">Geschwister:</div>${sibParts.join('')}</div>`;
          }
        }
      }
    }

    return html;
  }

  /**
   * Update the center person info (top left) - shows the current root person.
   */
  updateCenterInfo(node) {
    if (!node) {
      this.centerInfo.style.display = 'none';
      return;
    }
    this.centerInfo.innerHTML = this._buildPersonHtml(node);
    this.centerInfo.style.display = 'block';
    this._attachLinkHandlers(this.centerInfo);
  }

  /**
   * Show hover tooltip (top right) for the moused-over person.
   */
  showTooltip(node, event) {
    this.tooltip.innerHTML = this._buildPersonHtml(node, true);
    this.tooltip.style.display = 'block';
    this.tooltip.style.right = '16px';
    this.tooltip.style.top = '16px';
    this.tooltip.style.left = 'auto';
    this._attachLinkHandlers(this.tooltip);

    // Update map with person's places
    this._updateMap(node);
  }

  hideTooltip() {
    // Keep tooltip and map visible on mouseout
  }

  async _updateMap(node) {
    const hoverId = node.id;
    this._currentHoverId = hoverId;

    const places = collectPlaces(node.individual);
    if (places.length === 0) {
      this.mapView.hide();
      return;
    }

    const geoResults = [];
    for (const p of places) {
      if (this._currentHoverId !== hoverId) return;
      const coords = await geocode(p.place);
      if (coords) {
        geoResults.push({ ...p, lat: coords.lat, lng: coords.lng });
      }
    }

    if (this._currentHoverId !== hoverId) return;
    this.mapView.show(geoResults);
  }

  /**
   * Attach click handlers to .person-link elements inside a container.
   */
  _attachLinkHandlers(container) {
    const links = container.querySelectorAll('.person-link');
    for (const link of links) {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const personId = link.dataset.id;
        if (personId) {
          this.app.selectPerson(personId);
        }
      });
    }
  }

  // Legacy - kept for compatibility but now uses updateCenterInfo
  updateInfoPanel(node) {
    this.updateCenterInfo(node);
  }
}
