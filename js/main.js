/**
 * Main entry point
 * Wires together all modules.
 */
import { parseGedcom } from './gedcom-parser.js';
import { buildTree, flattenTree } from './tree-builder.js';
import { layoutTree } from './hyperbolic-layout.js';
import { Renderer } from './renderer.js';
import { Interaction } from './interaction.js';
import { UI } from './ui.js';

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
    this.transformFn = z => z; // identity
  }

  async init() {
    // Load and parse GEDCOM
    const response = await fetch('horst_bob.ged');
    const text = await response.text();
    this.data = parseGedcom(text);

    console.log(`Parsed: ${this.data.individuals.size} Personen, ${this.data.families.size} Familien`);

    // Setup SVG
    const container = document.getElementById('canvas-container');
    const svg = document.getElementById('hyperbolic-svg');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new Renderer(svg, width, height);
    this.interaction = new Interaction(svg, this);
    this.ui = new UI(this);

    // Handle resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.resize(w, h);
      this.render();
    });

    // Start with home person
    const startId = this.data.homePersonId || this.data.individuals.keys().next().value;
    this.selectPerson(startId);
  }

  selectPerson(personId) {
    this.currentRootId = personId;
    this.tree = buildTree(personId, this.data.individuals, this.data.families);
    if (!this.tree) {
      console.error('Could not build tree for', personId);
      return;
    }

    this.flatTree = flattenTree(this.tree);
    this.positions = layoutTree(this.tree, this.step);

    // Reset interaction
    this.interaction.reset();
    this.transformFn = z => this.interaction.transform(z);

    // Update UI
    this.ui.setRootPerson(this.data.individuals.get(personId));
    this.ui.updateInfoPanel(this.tree);

    this.render();
  }

  setTransform(fn) {
    this.transformFn = fn;
    this.render();
  }

  adjustStep(delta) {
    this.step = Math.max(0.3, Math.min(2.0, this.step + delta));
    // Re-layout with new step
    this.positions = layoutTree(this.tree, this.step);
    this.render();
  }

  render() {
    if (!this.flatTree || !this.positions) return;

    this.renderer.render(
      this.flatTree.nodes,
      this.flatTree.edges,
      this.positions,
      this.transformFn,
      // Click handler - recenter on clicked person
      (node) => {
        const diskPos = this.positions.get(node.id);
        if (diskPos) {
          // Rebuild tree centered on this person
          this.selectPerson(node.id);
        }
      },
      // Hover handler
      (node, event) => {
        this.ui.showTooltip(node, event);
      },
      // Leave handler
      () => {
        this.ui.hideTooltip();
      }
    );
  }
}

// Boot
const app = new App();
app.init().catch(err => console.error('Init failed:', err));
