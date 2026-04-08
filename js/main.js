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
import { TreeView } from './tree-view.js';

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
    this._historyStack = [];
    this._historyIndex = -1;
    this._historyBlocked = false;
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

    // Additional views
    this.timelineView = new TimelineView(document.getElementById('timeline-view'), this);
    this.treeView = new TreeView(document.getElementById('tree-view'), this);

    // Ctrl+Wheel zoom (UI scale)
    this._uiScale = 1.0;
    this._setupUiZoom(container);

    // View switching
    this.currentView = 'hyper';
    this._setupViewSwitching();

    // Browser history (back/forward)
    this._setupHistory();
  }

  _setupUiZoom(container) {
    const applyScale = () => {
      container.style.zoom = this._uiScale;
    };

    window.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      this._uiScale = Math.max(0.4, Math.min(2.5, this._uiScale + delta));
      applyScale();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        this._uiScale = 1.0;
        container.style.zoom = '';
      }
    });
  }

  _setupViewSwitching() {
    const btns = {
      hyper: document.getElementById('view-hyper-btn'),
      timeline: document.getElementById('view-timeline-btn'),
      baum: document.getElementById('view-baum-btn')
    };
    const views = {
      hyper: document.getElementById('hyperbolic-svg'),
      timeline: document.getElementById('timeline-view'),
      baum: document.getElementById('tree-view')
    };

    const switchTo = (viewName) => {
      if (this.currentView === viewName) return;
      this.currentView = viewName;
      for (const [name, btn] of Object.entries(btns)) {
        btn.classList.toggle('active', name === viewName);
      }
      for (const [name, el] of Object.entries(views)) {
        if (name === viewName) {
          el.style.display = name === 'baum' ? 'flex' : 'block';
        } else {
          el.style.display = 'none';
        }
      }
      this.render();
    };

    btns.hyper.addEventListener('click', () => switchTo('hyper'));
    btns.timeline.addEventListener('click', () => switchTo('timeline'));
    btns.baum.addEventListener('click', () => switchTo('baum'));
  }

  _setupHistory() {
    // Keyboard: Alt+Left = back, Alt+Right = forward
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.historyBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        this.historyForward();
      }
    });

    // Nav buttons
    document.getElementById('nav-back-btn').addEventListener('click', () => this.historyBack());
    document.getElementById('nav-fwd-btn').addEventListener('click', () => this.historyForward());

    // Also handle browser back/forward via popstate
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.personId && this.data) {
        this._historyBlocked = true;
        this.selectPerson(e.state.personId);
        this._historyBlocked = false;
      }
    });
  }

  _pushHistory(personId) {
    if (this._historyBlocked) return;
    // Don't push if same person
    if (this._historyIndex >= 0 && this._historyStack[this._historyIndex] === personId) return;

    // Truncate forward history
    this._historyStack = this._historyStack.slice(0, this._historyIndex + 1);
    this._historyStack.push(personId);
    this._historyIndex = this._historyStack.length - 1;

    // Also update browser history
    try {
      const state = { personId, view: this.currentView };
      history.pushState(state, '', `#${encodeURIComponent(personId)}`);
    } catch (e) { /* ignore if pushState fails */ }
  }

  historyBack() {
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    const personId = this._historyStack[this._historyIndex];
    this._historyBlocked = true;
    this.selectPerson(personId);
    this._historyBlocked = false;
  }

  historyForward() {
    if (this._historyIndex >= this._historyStack.length - 1) return;
    this._historyIndex++;
    const personId = this._historyStack[this._historyIndex];
    this._historyBlocked = true;
    this.selectPerson(personId);
    this._historyBlocked = false;
  }

  renderTimeline() {
    if (this.timelineView && this.data) {
      this.timelineView.render();
    }
  }

  renderTree() {
    if (this.treeView && this.data) {
      this.treeView.render();
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

    this._pushHistory(personId);
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

    if (this.currentView === 'baum') {
      this.renderTree();
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
