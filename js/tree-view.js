/**
 * Tree View
 * Classical pedigree chart.
 * Children above, person in middle, ancestors branching downward.
 * Siblings to the right on the same level.
 */
import { getDisplayName, formatDate, getAge } from './gedcom-parser.js';

const CARD_W = 130;
const CARD_H = 42;
const H_GAP = 12;
const V_GAP = 28;
const ROW_H = CARD_H + V_GAP;

/**
 * Shorten a full name for tree cards:
 * "Horst Adolf Hans Stiewe" -> "Horst A. H. Stiewe"
 */
function shortName(individual) {
  const given = individual.givenName || '';
  const surname = individual.surname || '';
  const parts = given.split(/\s+/).filter(Boolean);
  let short;
  if (parts.length > 1) {
    short = parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
  } else {
    short = given;
  }
  if (surname) short += ' ' + surname;
  return short || '(Unbekannt)';
}

export class TreeView {
  constructor(container, app) {
    this.container = container;
    this.inner = container.querySelector('.tree-inner');
    this.app = app;
  }

  render() {
    if (!this.app.data) return;
    this.inner.innerHTML = '';

    const { individuals, families } = this.app.data;
    const rootId = this.app.currentRootId;
    const rootIndi = individuals.get(rootId);
    if (!rootIndi) return;

    // --- Build descendant tree ---
    const descTreeForHeight = this._buildDescendantTree(rootId, individuals, families, 0, 3);
    const descMaxDepth = descTreeForHeight ? this._descMaxDepth(descTreeForHeight) : 0;

    // --- Build ancestor tree ---
    const ancestorTree = this._buildAncestorTree(rootId, individuals, families, 0, 10);
    const ancestorLeafCount = this._countLeaves(ancestorTree);
    const ancestorMaxGen = this._maxDepth(ancestorTree);

    // --- Collect siblings ---
    const showSiblings = this.app.showSiblings;
    let siblings = [];
    let halfSiblings = [];
    if (showSiblings && rootIndi.familyAsChild) {
      const fam = families.get(rootIndi.familyAsChild);
      if (fam) {
        siblings = fam.childIds.filter(id => id !== rootId).map(id => individuals.get(id)).filter(Boolean);
        const fullSet = new Set(fam.childIds);
        for (const pid of [fam.husbandId, fam.wifeId].filter(Boolean)) {
          const p = individuals.get(pid);
          if (!p) continue;
          for (const ofid of p.familiesAsSpouse) {
            if (ofid === rootIndi.familyAsChild) continue;
            const of2 = families.get(ofid);
            if (!of2) continue;
            for (const hid of of2.childIds) {
              if (!fullSet.has(hid) && hid !== rootId) {
                const h = individuals.get(hid);
                if (h && !halfSiblings.find(s => s.id === hid)) halfSiblings.push(h);
              }
            }
          }
        }
      }
    }

    // --- Layout calculation ---
    const rect = this.inner.getBoundingClientRect();

    // Descendants rows above center
    const descHeight = descMaxDepth * ROW_H;

    // Siblings width to the right
    const allSibs = [...siblings, ...halfSiblings];
    const sibColWidth = showSiblings && allSibs.length > 0 ? CARD_W * 0.6 + H_GAP : 0;

    // Ancestor width
    const ancestorWidth = ancestorLeafCount * (CARD_W + H_GAP);

    // Initial dimensions (will be adjusted after rendering)
    const centerY = 20 + descHeight;

    const svg = d3.select(this.inner).append('svg')
      .attr('width', 4000).attr('height', 4000) // temporary large
      .style('display', 'block');

    // All content in a group so we can measure and shift
    const contentGroup = svg.append('g');
    const linesGroup = contentGroup.append('g');
    const cardsGroup = contentGroup.append('g');

    // --- Render descendants (above center) ---
    // Layout ancestor tree first to find center x
    let leafIndex = 0;
    const ancestorPositions = new Map();

    const assignAncestorPos = (node, depth) => {
      if (!node) return;
      const y = centerY + (depth + 1) * ROW_H; // +1 because depth 0 = parents

      if (!node.father && !node.mother) {
        const x = 20 + leafIndex * (CARD_W + H_GAP) + CARD_W / 2;
        leafIndex++;
        ancestorPositions.set(node.id + '_' + depth, { x, y, node, depth });
        return;
      }

      assignAncestorPos(node.father, depth + 1);
      assignAncestorPos(node.mother, depth + 1);

      const fPos = node.father ? ancestorPositions.get(node.father.id + '_' + (depth + 1)) : null;
      const mPos = node.mother ? ancestorPositions.get(node.mother.id + '_' + (depth + 1)) : null;

      let x;
      if (fPos && mPos) x = (fPos.x + mPos.x) / 2;
      else if (fPos) x = fPos.x;
      else if (mPos) x = mPos.x;
      else { x = 20 + leafIndex * (CARD_W + H_GAP) + CARD_W / 2; leafIndex++; }

      ancestorPositions.set(node.id + '_' + depth, { x, y, node, depth });
    };

    // Ancestors start at depth 0 = parents (one row below center)
    if (ancestorTree) {
      if (ancestorTree.father) assignAncestorPos(ancestorTree.father, 0);
      if (ancestorTree.mother) assignAncestorPos(ancestorTree.mother, 0);
    }

    // Determine center X from parents position
    const fatherPos = ancestorTree?.father ? ancestorPositions.get(ancestorTree.father.id + '_0') : null;
    const motherPos = ancestorTree?.mother ? ancestorPositions.get(ancestorTree.mother.id + '_0') : null;
    let centerX;
    if (fatherPos && motherPos) centerX = (fatherPos.x + motherPos.x) / 2;
    else if (fatherPos) centerX = fatherPos.x;
    else if (motherPos) centerX = motherPos.x;
    else centerX = svgWidth / 2;

    // Render center person
    this._renderCard(cardsGroup, { id: rootId, individual: rootIndi, depth: 0 }, centerX - CARD_W / 2, centerY, true);

    // Connector from center to parents
    if (fatherPos) this._renderConnector(linesGroup, centerX, centerY + CARD_H, fatherPos.x, fatherPos.y);
    if (motherPos) this._renderConnector(linesGroup, centerX, centerY + CARD_H, motherPos.x, motherPos.y);

    // Render all ancestor nodes and connectors
    for (const [key, pos] of ancestorPositions) {
      const { x, y, node, depth } = pos;
      this._renderCard(cardsGroup, node, x - CARD_W / 2, y, false);

      if (node.father) {
        const fp = ancestorPositions.get(node.father.id + '_' + (depth + 1));
        if (fp) this._renderConnector(linesGroup, x, y + CARD_H, fp.x, fp.y);
      }
      if (node.mother) {
        const mp = ancestorPositions.get(node.mother.id + '_' + (depth + 1));
        if (mp) this._renderConnector(linesGroup, x, y + CARD_H, mp.x, mp.y);
      }

      // Continuation indicator DOWN: leaf ancestor that has parents not shown
      if (!node.father && !node.mother && node.individual.familyAsChild) {
        this._renderContinuation(linesGroup, x, y + CARD_H, 'down');
      }
    }

    // Also check center person for continuation DOWN (has parents = always shown, so skip)
    // And continuation UP if center has children beyond desc limit
    if (rootIndi.familiesAsSpouse && rootIndi.familiesAsSpouse.length > 0) {
      const descTree2 = this._buildDescendantTree(rootId, individuals, families, 0, 3);
      // Check if any desc leaf at max depth has further children
      // (already handled per-node above)
    }

    // --- Render descendants above center as a proper tree ---
    const descTree = this._buildDescendantTree(rootId, individuals, families, 0, 3);
    const descPositions = new Map();
    if (descTree && descTree.children.length > 0) {
      const descLeafCount = this._countDescLeaves(descTree);
      const descWidth = descLeafCount * (CARD_W + H_GAP);
      const descMaxDepthCalc = this._descMaxDepth(descTree);

      let descLeafIdx = 0;

      const assignDescPos = (node, depth) => {
        if (!node) return;
        // Depth 0 = root (center person), children = depth 1, etc.
        // Rendered upward: deeper = higher on screen
        const y = centerY - depth * ROW_H;

        if (node.children.length === 0 && depth > 0) {
          // Leaf
          const x = centerX - descWidth / 2 + descLeafIdx * (CARD_W + H_GAP) + CARD_W / 2;
          descLeafIdx++;
          descPositions.set(node.id, { x, y, node, depth });
          return;
        }

        if (depth === 0) {
          // Root = center person, already rendered
          descPositions.set(node.id, { x: centerX, y: centerY, node, depth });
          for (const child of node.children) assignDescPos(child, depth + 1);
          return;
        }

        // Internal node: recurse children first
        for (const child of node.children) assignDescPos(child, depth + 1);

        // Position = midpoint of children
        const childPositions = node.children.map(c => descPositions.get(c.id)).filter(Boolean);
        let x;
        if (childPositions.length > 0) {
          x = childPositions.reduce((sum, p) => sum + p.x, 0) / childPositions.length;
        } else {
          x = centerX - descWidth / 2 + descLeafIdx * (CARD_W + H_GAP) + CARD_W / 2;
          descLeafIdx++;
        }
        descPositions.set(node.id, { x, y, node, depth });
      };

      assignDescPos(descTree, 0);

      // Render descendant cards and connectors (skip root = center person)
      for (const [id, pos] of descPositions) {
        if (id === rootId) continue;
        const { x, y, node, depth } = pos;
        const indi = node.individual;
        this._renderCard(cardsGroup, { id, individual: indi, depth: 0 }, x - CARD_W / 2, y, false);

        // Connector to parent
        if (node.parentId) {
          const parentPos = descPositions.get(node.parentId);
          if (parentPos) {
            this._renderConnector(linesGroup, x, y + CARD_H, parentPos.x, parentPos.y, true);
          }
        }

        // Continuation indicator UP: leaf descendant that has children not shown
        if (node.children.length === 0) {
          const hasMoreChildren = (indi.familiesAsSpouse || []).some(fid => {
            const f = families.get(fid);
            return f && f.childIds.length > 0;
          });
          if (hasMoreChildren) {
            this._renderContinuation(linesGroup, x, y, 'up');
          }
        }
      }
    }

    // --- Render siblings to the right ---
    if (showSiblings && allSibs.length > 0) {
      const sibX = centerX + CARD_W / 2 + H_GAP + 20;
      allSibs.forEach((sib, i) => {
        const isHalf = i >= siblings.length;
        const sx = sibX + i * (CARD_W * 0.6 + 8);
        const sy = centerY + (CARD_H - 24) / 2;
        const isFemale = sib.sex === 'F';
        const name = shortName(sib);
        const sibW = CARD_W * 0.6;

        const g = cardsGroup.append('g')
          .attr('class', 'tree-card')
          .style('cursor', 'pointer')
          .on('click', () => this.app.selectPerson(sib.id || Object.keys(this.app.data.individuals).find(k => this.app.data.individuals.get(k) === sib)))
          .on('mouseenter', () => {
            const id = sib.id || [...this.app.data.individuals].find(([k, v]) => v === sib)?.[0];
            this.app.ui.showTooltip({ id, individual: sib, direction: 'sibling', generation: 0, ahnentafelNumber: null }, {});
          });

        g.append('rect')
          .attr('x', sx).attr('y', sy)
          .attr('width', sibW).attr('height', 24)
          .attr('rx', 4).attr('ry', 4)
          .attr('fill', isFemale ? 'rgba(139, 34, 82, 0.3)' : 'rgba(30, 96, 145, 0.3)')
          .attr('stroke', isFemale ? '#e94560' : '#4da8da')
          .attr('stroke-width', 0.8)
          .attr('stroke-dasharray', isHalf ? '3 2' : 'none');

        g.append('text')
          .attr('x', sx + sibW / 2).attr('y', sy + 15)
          .attr('text-anchor', 'middle')
          .attr('fill', '#999').attr('font-size', '8px')
          .text(name.length > 14 ? name.substring(0, 12) + '...' : name);

        // Horizontal dashed connector
        linesGroup.append('line')
          .attr('x1', centerX + CARD_W / 2).attr('y1', centerY + CARD_H / 2)
          .attr('x2', sx).attr('y2', sy + 12)
          .attr('stroke', '#3a5570').attr('stroke-width', 1)
          .attr('stroke-dasharray', isHalf ? '2 3' : '4 3')
          .attr('stroke-opacity', 0.5);
      });
    }

    // --- Render partners to the left ---
    if (rootIndi.familiesAsSpouse && rootIndi.familiesAsSpouse.length > 0) {
      const partners = [];
      for (const famId of rootIndi.familiesAsSpouse) {
        const fam = families.get(famId);
        if (!fam) continue;
        const spouseId = fam.husbandId === rootId ? fam.wifeId : fam.husbandId;
        if (!spouseId) continue;
        const spouse = individuals.get(spouseId);
        if (spouse) partners.push({ id: spouseId, individual: spouse, marriageDate: fam.marriageDate });
      }

      if (partners.length > 0) {
        const partnerW = CARD_W * 0.6;
        partners.forEach((partner, i) => {
          const px = centerX - CARD_W / 2 - H_GAP - 20 - i * (partnerW + 8) - partnerW;
          const py = centerY + (CARD_H - 24) / 2;
          const isFemale = partner.individual.sex === 'F';
          const name = shortName(partner.individual);
          const yearMatch = partner.marriageDate ? partner.marriageDate.match(/\d{4}/) : null;
          const yearLabel = yearMatch ? yearMatch[0] : '';

          const g = cardsGroup.append('g')
            .attr('class', 'tree-card')
            .style('cursor', 'pointer')
            .on('click', () => this.app.selectPerson(partner.id))
            .on('mouseenter', () => {
              this.app.ui.showTooltip({
                id: partner.id, individual: partner.individual,
                direction: 'partner', generation: 0, ahnentafelNumber: null
              }, {});
            });

          g.append('rect')
            .attr('x', px).attr('y', py)
            .attr('width', partnerW).attr('height', 24)
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', isFemale ? 'rgba(139, 34, 82, 0.4)' : 'rgba(30, 96, 145, 0.4)')
            .attr('stroke', '#e8b84b')
            .attr('stroke-width', 0.8);

          g.append('text')
            .attr('x', px + partnerW / 2).attr('y', py + 10)
            .attr('text-anchor', 'middle')
            .attr('fill', '#ccc').attr('font-size', '8px')
            .text(name.length > 14 ? name.substring(0, 12) + '...' : name);

          if (yearLabel) {
            g.append('text')
              .attr('x', px + partnerW / 2).attr('y', py + 20)
              .attr('text-anchor', 'middle')
              .attr('fill', '#e8b84b').attr('font-size', '7px')
              .text(yearLabel);
          }

          // Connector line
          linesGroup.append('line')
            .attr('x1', centerX - CARD_W / 2).attr('y1', centerY + CARD_H / 2)
            .attr('x2', px + partnerW).attr('y2', py + 12)
            .attr('stroke', '#e8b84b').attr('stroke-width', 1)
            .attr('stroke-dasharray', '3 2')
            .attr('stroke-opacity', 0.6);
        });
      }
    }

    // --- Time axis on the left ---
    // Collect Y positions and average lifespan year per row
    const rowData = new Map(); // y -> { years: [], y }

    // Helper: extract mid-life year
    const midLifeYear = (indi) => {
      const bMatch = indi.birthDate ? indi.birthDate.match(/\d{4}/) : null;
      const dMatch = indi.deathDate ? indi.deathDate.match(/\d{4}/) : null;
      const b = bMatch ? parseInt(bMatch[0]) : null;
      const d = dMatch ? parseInt(dMatch[0]) : null;
      if (b && d) return Math.round((b + d) / 2);
      if (b) return b;
      if (d) return d;
      return null;
    };

    // Center person row
    const centerMid = midLifeYear(rootIndi);
    if (centerMid) {
      if (!rowData.has(centerY)) rowData.set(centerY, { years: [], y: centerY });
      rowData.get(centerY).years.push(centerMid);
    }

    // Ancestor rows
    for (const [, pos] of ancestorPositions) {
      const mid = midLifeYear(pos.node.individual);
      if (mid) {
        if (!rowData.has(pos.y)) rowData.set(pos.y, { years: [], y: pos.y });
        rowData.get(pos.y).years.push(mid);
      }
    }

    // Descendant rows
    for (const [id, pos] of descPositions || new Map()) {
      if (id === rootId) continue;
      const mid = midLifeYear(pos.node.individual);
      if (mid) {
        if (!rowData.has(pos.y)) rowData.set(pos.y, { years: [], y: pos.y });
        rowData.get(pos.y).years.push(mid);
      }
    }

    // Draw time axis in the separate left panel
    const rows = [...rowData.values()].sort((a, b) => a.y - b.y);
    this._timeAxisRows = rows;

    // Measure actual bounding box and adjust SVG
    const bbox = contentGroup.node().getBBox();
    const padding = 30;
    const finalW = Math.max(rect.width, bbox.width + padding * 2);
    const finalH = Math.max(rect.height, bbox.height + padding * 2);

    // Shift content so nothing is at negative coords
    const shiftX = -bbox.x + padding;
    const shiftY = -bbox.y + padding;
    contentGroup.attr('transform', `translate(${shiftX}, ${shiftY})`);

    this._shiftY = shiftY;

    svg.attr('width', finalW).attr('height', finalH);

    // Center the view on the root person via transform
    const adjustedCenterX = centerX + shiftX;
    const adjustedCenterY = centerY + shiftY;
    this._panX = rect.width / 2 - adjustedCenterX;
    this._panY = rect.height / 3 - adjustedCenterY;
    svg.style.transform = `translate(${this._panX}px, ${this._panY}px)`;

    // Render time axis in the left panel
    this._renderTimeAxis();

    // Drag-to-pan
    this._setupDragPan();
  }

  _renderContinuation(group, x, y, direction) {
    // Short green line + small arrow indicating more data exists
    const len = 14;
    if (direction === 'down') {
      // Below the card: more ancestors exist
      group.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', y).attr('y2', y + len)
        .attr('stroke', '#4caf50').attr('stroke-width', 2)
        .attr('stroke-linecap', 'round').attr('opacity', 0.5);
      group.append('path')
        .attr('d', `M ${x - 4} ${y + len} L ${x} ${y + len + 6} L ${x + 4} ${y + len} Z`)
        .attr('fill', '#4caf50').attr('opacity', 0.5);
    } else {
      group.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', y).attr('y2', y - len)
        .attr('stroke', '#4caf50').attr('stroke-width', 2)
        .attr('stroke-linecap', 'round').attr('opacity', 0.5);
      group.append('path')
        .attr('d', `M ${x - 4} ${y - len} L ${x} ${y - len - 6} L ${x + 4} ${y - len} Z`)
        .attr('fill', '#4caf50').attr('opacity', 0.5);
    }
  }

  _renderTimeAxis() {
    const axisEl = this.container.querySelector('.tree-time-axis');
    if (!axisEl) return;
    axisEl.innerHTML = '';

    const rows = this._timeAxisRows;
    if (!rows || rows.length < 1) return;

    const h = axisEl.clientHeight || 800;
    const axisSvg = d3.select(axisEl).append('svg')
      .attr('width', 70).attr('height', 4000)
      .style('display', 'block');

    this._axisSvgGroup = axisSvg.append('g');
    const g = this._axisSvgGroup;
    const axisX = 55;

    g.append('line')
      .attr('x1', axisX).attr('x2', axisX)
      .attr('y1', rows[0].y + CARD_H / 2)
      .attr('y2', rows[rows.length - 1].y + CARD_H / 2)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    for (const row of rows) {
      const avg = Math.round(row.years.reduce((s, y) => s + y, 0) / row.years.length);
      const tickY = row.y + CARD_H / 2;

      g.append('line')
        .attr('x1', axisX - 5).attr('x2', axisX + 5)
        .attr('y1', tickY).attr('y2', tickY)
        .attr('stroke', '#4a6580').attr('stroke-width', 1);

      g.append('text')
        .attr('x', axisX - 8).attr('y', tickY + 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#5a7a9a').attr('font-size', '10px')
        .text(`~ ${avg}`);
    }

    // Apply initial vertical offset matching tree pan
    this._updateTimeAxisPosition();
  }

  _updateTimeAxisPosition() {
    if (!this._axisSvgGroup) return;
    const offsetY = (this._shiftY || 0) + (this._panY || 0);
    this._axisSvgGroup.attr('transform', `translate(0, ${offsetY})`);
  }

  _setupDragPan() {
    const el = this.inner;
    const svg = el.querySelector('svg');
    if (!svg) return;

    let dragging = false;
    let startX, startY;
    // Current pan offset
    if (!this._panX) this._panX = 0;
    if (!this._panY) this._panY = 0;

    // Apply initial pan from scroll centering
    const applyTransform = () => {
      svg.style.transform = `translate(${this._panX}px, ${this._panY}px)`;
    };

    const onDown = (e) => {
      if (e.target.closest('.tree-card')) return;
      dragging = true;
      el.style.cursor = 'grabbing';
      startX = (e.clientX ?? e.touches?.[0]?.clientX) ?? 0;
      startY = (e.clientY ?? e.touches?.[0]?.clientY) ?? 0;
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const mx = (e.clientX ?? e.touches?.[0]?.clientX) ?? 0;
      const my = (e.clientY ?? e.touches?.[0]?.clientY) ?? 0;
      this._panX += mx - startX;
      this._panY += my - startY;
      startX = mx;
      startY = my;
      applyTransform();
      this._updateTimeAxisPosition();
    };

    const onUp = () => {
      dragging = false;
      el.style.cursor = 'grab';
    };

    el.onmousedown = onDown;
    el.onmousemove = onMove;
    el.onmouseup = onUp;
    el.onmouseleave = onUp;
    el.ontouchstart = onDown;
    el.ontouchmove = onMove;
    el.ontouchend = onUp;
    el.style.cursor = 'grab';
    el.style.overflow = 'hidden';
  }

  _buildDescendantTree(personId, individuals, families, depth, maxDepth) {
    if (!personId || depth > maxDepth) return null;
    const indi = individuals.get(personId);
    if (!indi) return null;

    const node = { id: personId, individual: indi, children: [], parentId: null };

    for (const famId of indi.familiesAsSpouse || []) {
      const fam = families.get(famId);
      if (!fam) continue;
      for (const cid of fam.childIds) {
        const child = this._buildDescendantTree(cid, individuals, families, depth + 1, maxDepth);
        if (child) {
          child.parentId = personId;
          node.children.push(child);
        }
      }
    }

    return node;
  }

  _countDescLeaves(node) {
    if (!node || node.children.length === 0) return 1;
    let count = 0;
    for (const c of node.children) count += this._countDescLeaves(c);
    return count;
  }

  _descMaxDepth(node, depth = 0) {
    if (!node) return depth;
    let max = depth;
    for (const c of node.children) {
      max = Math.max(max, this._descMaxDepth(c, depth + 1));
    }
    return max;
  }

  _collectDescendants(personId, individuals, families, maxGen) {
    const result = []; // array of arrays, one per generation
    let currentGen = [personId];

    for (let g = 0; g < maxGen; g++) {
      const nextGen = [];
      for (const pid of currentGen) {
        const indi = individuals.get(pid);
        if (!indi) continue;
        for (const famId of indi.familiesAsSpouse) {
          const fam = families.get(famId);
          if (!fam) continue;
          for (const cid of fam.childIds) {
            const child = individuals.get(cid);
            if (child) nextGen.push(child);
          }
        }
      }
      if (nextGen.length === 0) break;
      result.push(nextGen);
      currentGen = nextGen.map(c => {
        // Find the id for this individual
        for (const [id, indi] of individuals) {
          if (indi === c) return id;
        }
        return null;
      }).filter(Boolean);
    }

    return result;
  }

  _buildAncestorTree(personId, individuals, families, depth, maxDepth) {
    if (!personId || depth > maxDepth) return null;
    const indi = individuals.get(personId);
    if (!indi) return null;

    const node = { id: personId, individual: indi, father: null, mother: null, depth };
    if (indi.familyAsChild) {
      const fam = families.get(indi.familyAsChild);
      if (fam) {
        node.father = this._buildAncestorTree(fam.husbandId, individuals, families, depth + 1, maxDepth);
        node.mother = this._buildAncestorTree(fam.wifeId, individuals, families, depth + 1, maxDepth);
      }
    }
    return node;
  }

  _countLeaves(node) {
    if (!node) return 0;
    if (!node.father && !node.mother) return 1;
    return this._countLeaves(node.father) + this._countLeaves(node.mother);
  }

  _maxDepth(node) {
    if (!node) return -1;
    return Math.max(node.depth, this._maxDepth(node.father), this._maxDepth(node.mother));
  }

  _renderCard(group, node, x, y, isCenter) {
    const indi = node.individual;
    const isFemale = indi.sex === 'F';
    const name = shortName(indi);
    const birth = formatDate(indi.birthDate);
    const death = formatDate(indi.deathDate);
    const age = getAge(indi);

    let dateStr = '';
    if (birth && death) dateStr = `${birth} - ${death}`;
    else if (birth) dateStr = `* ${birth}`;
    else if (death) dateStr = `+ ${death}`;
    if (age !== null) dateStr += ` (${age})`;

    const g = group.append('g')
      .attr('class', 'tree-card')
      .style('cursor', 'pointer')
      .on('click', () => this.app.selectPerson(node.id))
      .on('mouseenter', () => {
        const treeNode = this.app.flatTree?.nodes.find(n => n.id === node.id) || {
          id: node.id, individual: indi, direction: 'ancestor',
          generation: node.depth, ahnentafelNumber: null
        };
        this.app.ui.showTooltip(treeNode, {});
      });

    g.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', CARD_W).attr('height', CARD_H)
      .attr('rx', 6).attr('ry', 6)
      .attr('fill', isFemale ? 'rgba(139, 34, 82, 0.6)' : 'rgba(30, 96, 145, 0.6)')
      .attr('stroke', isCenter ? '#d4a017' : isFemale ? '#e94560' : '#4da8da')
      .attr('stroke-width', isCenter ? 2 : 1);

    g.append('text')
      .attr('x', x + CARD_W / 2).attr('y', y + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', '600')
      .text(name.length > 22 ? name.substring(0, 20) + '...' : name);

    if (dateStr) {
      g.append('text')
        .attr('x', x + CARD_W / 2).attr('y', y + 30)
        .attr('text-anchor', 'middle')
        .attr('fill', '#aaa').attr('font-size', '8px')
        .text(dateStr.length > 30 ? dateStr.substring(0, 28) + '...' : dateStr);
    }
  }

  _renderConnector(group, x1, y1, x2, y2, upward = false) {
    const midY = y1 + (y2 - y1) / 2;
    group.append('path')
      .attr('d', `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`)
      .attr('fill', 'none')
      .attr('stroke', upward ? '#5a7a5a' : '#4a6580')
      .attr('stroke-width', 1.5);
  }
}
