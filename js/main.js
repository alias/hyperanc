/**
 * Main entry point
 * Wires together all modules.
 */
import { parseGedcom } from './gedcom-parser.js';
import { buildTree, flattenTree } from './tree-builder.js';
import { layoutTree } from './hyperbolic-layout.js';
import { layoutSiblings } from './sibling-layout.js';
import { Renderer } from './renderer.js';
import { Interaction } from './interaction.js';
import { UI } from './ui.js';
import { cAbs } from './hyperbolic-math.js';
import { loadFromFile, loadFromUrl, saveToFile, setupDragDrop } from './file-io.js';
import { TimelineView } from './timeline-view.js';

class App {
  constructor() {
    this.data = null;
    this.currentRootId = null;
    this.tree = null;
    this.flatTree = null;
    this.positions = null;
    this.renderer = null;
    this.interaction = null;
    this.ui = null;
    this.step = 0.9;
    this.transformFn = z => z;
    this.showSiblings = false;
    this._viewInitialized = false;
    this.timelineView = null;
  }

  async init() {
    // Setup view first
    this._initView();

    // Setup file I/O UI
    this._setupFileIO();

    // Try loading default file
    try {
      const response = await fetch('horst_bob.ged');
      const text = await response.text();
      this.loadData(parseGedcom(text), 'horst_bob.ged');
    } catch (err) {
      console.log('No default GEDCOM found, showing load dialog');
      this._showLoadDialog();
    }
  }

  _initView() {
    if (this._viewInitialized) return;
    this._viewInitialized = true;

    const container = document.getElementById('canvas-container');
    const svg = document.getElementById('hyperbolic-svg');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new Renderer(svg, width, height);
    this.interaction = new Interaction(svg, this);
    this.ui = new UI(this);

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.resize(w, h);
      this.render();
    });

    // Drag&drop on canvas
    setupDragDrop(container, (data, file) => this.loadData(data, file?.name));

    // Timeline view
    this.timelineView = new TimelineView(document.getElementById('timeline-view'), this);

    // View switching
    this.currentView = 'hyper';
    this._setupViewSwitching();
  }

  _setupViewSwitching() {
    const hyperBtn = document.getElementById('view-hyper-btn');
    const timelineBtn = document.getElementById('view-timeline-btn');
    const hyperSvg = document.getElementById('hyperbolic-svg');
    const timelineView = document.getElementById('timeline-view');

    hyperBtn.addEventListener('click', () => {
      if (this.currentView === 'hyper') return;
      this.currentView = 'hyper';
      hyperBtn.classList.add('active');
      timelineBtn.classList.remove('active');
      hyperSvg.style.display = 'block';
      timelineView.style.display = 'none';
      this.render();
    });

    timelineBtn.addEventListener('click', () => {
      if (this.currentView === 'timeline') return;
      this.currentView = 'timeline';
      timelineBtn.classList.add('active');
      hyperBtn.classList.remove('active');
      hyperSvg.style.display = 'none';
      timelineView.style.display = 'block';
      this.renderTimeline();
    });
  }

  renderTimeline() {
    if (this.timelineView && this.data) {
      this.timelineView.render();
    }
  }

  /**
   * Load parsed GEDCOM data and initialize the view.
   */
  loadData(data, filename) {
    this.data = data;
    this.currentFileName = filename || '';
    console.log(`Parsed: ${data.individuals.size} Personen, ${data.families.size} Familien (GEDCOM ${data.version || '5.5.1'})`);
    if (this.ui) this.ui.setFileName(this.currentFileName);

    const startId = data.homePersonId || data.individuals.keys().next().value;
    if (startId) {
      this.selectPerson(startId);
    }
  }

  /**
   * Export current data as GEDCOM file.
   */
  exportData(version, filename) {
    if (!this.data) return;
    saveToFile(this.data, version, filename);
  }

  _setupFileIO() {
    // Load dialog
    const loadOverlay = document.getElementById('load-overlay');
    const loadBtn = document.getElementById('load-btn');
    const loadCloseBtn = document.getElementById('load-close-btn');
    const fileInput = document.getElementById('file-input');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    const loadStatus = document.getElementById('load-status');
    const dropZone = document.getElementById('drop-zone');

    loadBtn.addEventListener('click', () => this._showLoadDialog());

    loadCloseBtn.addEventListener('click', () => {
      loadOverlay.style.display = 'none';
    });

    loadOverlay.addEventListener('click', (e) => {
      if (e.target === loadOverlay) loadOverlay.style.display = 'none';
    });

    // File input
    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length === 0) return;
      loadStatus.textContent = 'Lade...';
      try {
        const file = fileInput.files[0];
        const data = await loadFromFile(file);
        this.loadData(data, file.name);
        loadOverlay.style.display = 'none';
        loadStatus.textContent = '';
      } catch (err) {
        loadStatus.textContent = 'Fehler: ' + err.message;
      }
    });

    // URL load
    urlLoadBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      loadStatus.textContent = 'Lade von URL...';
      try {
        const data = await loadFromUrl(url);
        const urlName = url.split('/').pop() || url;
        this.loadData(data, urlName);
        loadOverlay.style.display = 'none';
        loadStatus.textContent = '';
      } catch (err) {
        loadStatus.textContent = 'Fehler: ' + err.message;
      }
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') urlLoadBtn.click();
    });

    // Drop zone in dialog
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].name.toLowerCase().endsWith('.ged')) {
        loadStatus.textContent = 'Lade...';
        try {
          const data = await loadFromFile(files[0]);
          this.loadData(data, files[0].name);
          loadOverlay.style.display = 'none';
        } catch (err) {
          loadStatus.textContent = 'Fehler: ' + err.message;
        }
      }
    });

    // Save dialog
    const saveOverlay = document.getElementById('save-overlay');
    const saveBtn = document.getElementById('save-btn');
    const saveCloseBtn = document.getElementById('save-close-btn');
    const saveDownloadBtn = document.getElementById('save-download-btn');
    const saveFormat = document.getElementById('save-format');
    const saveFilename = document.getElementById('save-filename');

    saveBtn.addEventListener('click', () => {
      saveOverlay.style.display = 'flex';
    });

    saveCloseBtn.addEventListener('click', () => {
      saveOverlay.style.display = 'none';
    });

    saveOverlay.addEventListener('click', (e) => {
      if (e.target === saveOverlay) saveOverlay.style.display = 'none';
    });

    saveDownloadBtn.addEventListener('click', () => {
      const version = saveFormat.value;
      const filename = saveFilename.value.trim() || 'ahnentafel.ged';
      this.exportData(version, filename);
      saveOverlay.style.display = 'none';
    });
  }

  _showLoadDialog() {
    document.getElementById('load-overlay').style.display = 'flex';
    document.getElementById('load-status').textContent = '';
  }

  toggleSiblings() {
    this.showSiblings = !this.showSiblings;
    this._rebuildFlatTree();
    this.render();
    return this.showSiblings;
  }

  _rebuildFlatTree() {
    if (!this.tree) return;
    this.flatTree = flattenTree(this.tree, this.data.individuals, this.data.families);
    this.positions = layoutTree(this.tree, this.step);
    if (this.flatTree.siblingNodes.length > 0) {
      layoutSiblings(this.flatTree, this.positions);
    }
  }

  selectPerson(personId, resetView = true) {
    if (!this.data || !this.data.individuals.has(personId)) return;

    this.currentRootId = personId;
    this.tree = buildTree(personId, this.data.individuals, this.data.families);
    if (!this.tree) return;

    this._rebuildFlatTree();

    if (resetView) {
      this.interaction.reset();
      this.transformFn = z => this.interaction.transform(z);
    }

    this.ui.setRootPerson(this.data.individuals.get(personId));
    this.ui.updateInfoPanel(this.tree);
    this.render();
  }

  findCenterPerson() {
    if (!this.flatTree || !this.positions) return null;

    let closestId = null;
    let closestDist = Infinity;

    for (const node of this.flatTree.nodes) {
      const diskPos = this.positions.get(node.id);
      if (!diskPos) continue;
      const transformed = this.transformFn(diskPos);
      const dist = cAbs(transformed);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = node.id;
      }
    }

    return closestId;
  }

  rebuildAroundCenter() {
    const centerId = this.findCenterPerson();
    if (!centerId || centerId === this.currentRootId) return;

    const oldDiskPos = this.positions.get(centerId);
    if (!oldDiskPos) return;
    const oldScreenPos = this.transformFn(oldDiskPos);

    this.currentRootId = centerId;
    this.tree = buildTree(centerId, this.data.individuals, this.data.families);
    if (!this.tree) return;

    this._rebuildFlatTree();

    const negPos = [-oldScreenPos[0], -oldScreenPos[1]];
    const r = cAbs(negPos);
    if (r < 0.95) {
      this.interaction.center = negPos;
    } else {
      this.interaction.center = [negPos[0] * 0.94 / r, negPos[1] * 0.94 / r];
    }
    this.transformFn = z => this.interaction.transform(z);

    this.ui.setRootPerson(this.data.individuals.get(centerId));
    this.ui.updateInfoPanel(this.tree);
    this.render();
  }

  setTransform(fn) {
    this.transformFn = fn;
  }

  adjustStep(delta) {
    this.step = Math.max(0.3, Math.min(2.0, this.step + delta));
    this.positions = layoutTree(this.tree, this.step);
    if (this.flatTree && this.flatTree.siblingNodes.length > 0) {
      layoutSiblings(this.flatTree, this.positions);
    }
    this.render();
  }

  render() {
    if (!this.flatTree || !this.positions) return;

    if (this.currentView === 'timeline') {
      this.renderTimeline();
      return;
    }

    const allNodes = [...this.flatTree.nodes, ...this.flatTree.siblingNodes];

    this.renderer.render(
      allNodes,
      this.flatTree.edges,
      this.flatTree.siblingEdges,
      this.positions,
      this.transformFn,
      this.showSiblings,
      this.data.families,
      this.data.individuals,
      (node) => { this.selectPerson(node.id); },
      (node, event) => { this.ui.showTooltip(node, event); },
      () => { this.ui.hideTooltip(); }
    );
  }
}

const app = new App();
window._app = app;
app.init().catch(err => console.error('Init failed:', err));
