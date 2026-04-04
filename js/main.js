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
import { cAbs } from './hyperbolic-math.js';

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
  }

  async init() {
    const response = await fetch('horst_bob.ged');
    const text = await response.text();
    this.data = parseGedcom(text);

    console.log(`Parsed: ${this.data.individuals.size} Personen, ${this.data.families.size} Familien`);

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

    const startId = this.data.homePersonId || this.data.individuals.keys().next().value;
    this.selectPerson(startId);
  }

  selectPerson(personId, resetView = true) {
    if (!this.data.individuals.has(personId)) return;

    this.currentRootId = personId;
    this.tree = buildTree(personId, this.data.individuals, this.data.families);
    if (!this.tree) return;

    this.flatTree = flattenTree(this.tree);
    this.positions = layoutTree(this.tree, this.step);

    if (resetView) {
      this.interaction.reset();
      this.transformFn = z => this.interaction.transform(z);
    }

    this.ui.setRootPerson(this.data.individuals.get(personId));
    this.ui.updateInfoPanel(this.tree);
    this.render();
  }

  /**
   * Find which person is currently closest to the center of the view.
   * Returns the node id or null.
   */
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

  /**
   * Rebuild tree around whoever is closest to center, if it changed.
   * Called on mouseup and during drag (debounced).
   */
  rebuildAroundCenter() {
    const centerId = this.findCenterPerson();
    if (!centerId || centerId === this.currentRootId) return;

    // Remember where the center person is in the current transformed view
    // so we can keep the visual position stable after rebuild
    const oldDiskPos = this.positions.get(centerId);
    if (!oldDiskPos) return;
    const oldScreenPos = this.transformFn(oldDiskPos);

    // Rebuild tree centered on this person
    this.currentRootId = centerId;
    this.tree = buildTree(centerId, this.data.individuals, this.data.families);
    if (!this.tree) return;

    this.flatTree = flattenTree(this.tree);
    this.positions = layoutTree(this.tree, this.step);

    // The new root is at [0,0] in layout space.
    // We want it to appear at oldScreenPos in the view.
    // So set the Möbius center to the negative of oldScreenPos
    // (i.e., shift the view so origin maps to where the person was)
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
    this.render();
  }

  render() {
    if (!this.flatTree || !this.positions) return;

    this.renderer.render(
      this.flatTree.nodes,
      this.flatTree.edges,
      this.positions,
      this.transformFn,
      (node) => {
        this.selectPerson(node.id);
      },
      (node, event) => {
        this.ui.showTooltip(node, event);
      },
      () => {
        this.ui.hideTooltip();
      }
    );
  }
}

const app = new App();
window._app = app; // expose for debugging
app.init().catch(err => console.error('Init failed:', err));
