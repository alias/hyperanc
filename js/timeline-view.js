/**
 * Timeline View - Horizontal Pedigree Timeline
 * Person at left, ancestors branching right.
 * Father line above, Mother line below.
 * Time axis horizontal (left=past, right=present).
 */
import { getDisplayName, formatDate, getLifeRange, extractYear } from './gedcom-parser.js';

const BAR_H = 14;
const ROW_GAP = 3;
const ROW_H = BAR_H + ROW_GAP;

export class TimelineView {
  constructor(container, app) {
    this.container = container;
    this.inner = container.querySelector('.timeline-inner');
    this.app = app;
  }

  render() {
    if (!this.app.data) return;
    this.inner.innerHTML = '';

    const { individuals, families } = this.app.data;
    const rootId = this.app.currentRootId;
    const rootIndi = individuals.get(rootId);
    if (!rootIndi) return;

    // Build ancestor tree
    const tree = this._buildAncestorTree(rootId, individuals, families, 0, 10);
    if (!tree) return;

    // Flatten into rows: each person gets a row index
    // Layout: father branch above, mother branch below, recursively
    const rows = [];
    this._assignRows(tree, rows, individuals, families);

    // Collect siblings for the root person
    const showSiblings = this.app.showSiblings;
    let siblingRows = [];
    if (showSiblings && rootIndi.familyAsChild) {
      const fam = families.get(rootIndi.familyAsChild);
      if (fam) {
        const sibs = fam.childIds.filter(id => id !== rootId);
        for (const sibId of sibs) {
          const sib = individuals.get(sibId);
          if (!sib) continue;
          const range = getLifeRange(sib, families, individuals);
          if (!range) continue;
          siblingRows.push({ id: sibId, individual: sib, isSibling: true, isPartner: false, ...range });
        }
        // Half-siblings
        const fullSet = new Set(fam.childIds);
        for (const pid of [fam.husbandId, fam.wifeId].filter(Boolean)) {
          const parent = individuals.get(pid);
          if (!parent) continue;
          for (const ofid of parent.familiesAsSpouse) {
            if (ofid === rootIndi.familyAsChild) continue;
            const of2 = families.get(ofid);
            if (!of2) continue;
            for (const hid of of2.childIds) {
              if (!fullSet.has(hid) && hid !== rootId) {
                const h = individuals.get(hid);
                if (!h) continue;
                const range = getLifeRange(h, families, individuals);
                if (range && !siblingRows.find(s => s.id === hid)) {
                  siblingRows.push({ id: hid, individual: h, isSibling: true, isHalf: true, isPartner: false, ...range });
                }
              }
            }
          }
        }
      }
    }

    // Collect partners and children of the root person
    const partnerRows = [];
    const childRows = [];
    const addedIds = new Set(rows.map(r => r.id));
    siblingRows.forEach(s => addedIds.add(s.id));

    for (const famId of rootIndi.familiesAsSpouse || []) {
      const fam = families.get(famId);
      if (!fam) continue;
      // Partner
      const spouseId = fam.husbandId === rootId ? fam.wifeId : fam.husbandId;
      if (spouseId && !addedIds.has(spouseId)) {
        const spouse = individuals.get(spouseId);
        if (spouse) {
          const range = getLifeRange(spouse, families, individuals);
          if (range) {
            addedIds.add(spouseId);
            partnerRows.push({ id: spouseId, individual: spouse, isSibling: false, isPartner: true,
              node: { id: spouseId, individual: spouse, direction: 'partner', generation: 0, ahnentafelNumber: null }, ...range });
          }
        }
      }
      // Children
      for (const cid of fam.childIds) {
        if (addedIds.has(cid)) continue;
        const child = individuals.get(cid);
        if (!child) continue;
        const range = getLifeRange(child, families, individuals);
        if (range) {
          addedIds.add(cid);
          childRows.push({ id: cid, individual: child, isSibling: false, isPartner: false, isChild: true,
            node: { id: cid, individual: child, direction: 'descendant', generation: -1, ahnentafelNumber: null }, ...range });
        }
      }
    }

    // Determine time range
    let minYear = Infinity, maxYear = -Infinity;
    for (const r of [...rows, ...siblingRows, ...partnerRows, ...childRows]) {
      if (r.startYear < minYear) minYear = r.startYear;
      if (r.endYear > maxYear) maxYear = r.endYear;
    }
    minYear = Math.floor(minYear / 25) * 25 - 25;
    maxYear = Math.ceil(maxYear / 25) * 25 + 25;

    // Build final row order:
    // Father branch ... | children | partners | ROOT | siblings | Mother branch ...
    const rootRowIdx = rows.findIndex(r => r.id === rootId);
    const allRows = [...rows];
    // Insert children + partners BEFORE root
    if (rootRowIdx >= 0) {
      allRows.splice(rootRowIdx, 0, ...childRows, ...partnerRows);
    }
    // Insert siblings AFTER root (now shifted by inserted rows)
    const newRootIdx = allRows.findIndex(r => r.id === rootId);
    if (newRootIdx >= 0 && siblingRows.length > 0) {
      allRows.splice(newRootIdx + 1, 0, ...siblingRows);
    }

    // Layout
    const rect = this.inner.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const marginTop = 32;
    const marginLeft = 10;
    const marginRight = 10;
    const plotWidth = width - marginLeft - marginRight;

    const yearToX = (year) => marginLeft + (year - minYear) / (maxYear - minYear) * plotWidth;
    const xToYear = (x) => minYear + (x - marginLeft) / plotWidth * (maxYear - minYear);

    const totalH = allRows.length * ROW_H + marginTop + 30;
    const svgHeight = Math.max(height, totalH);

    // --- Fixed axis ---
    const axisSvg = d3.select(this.inner).append('svg')
      .attr('class', 'tl-axis')
      .attr('width', width).attr('height', marginTop)
      .style('position', 'sticky').style('top', '0').style('z-index', '5')
      .style('background', 'rgba(13, 27, 42, 0.95)');

    const axisY = marginTop - 6;
    axisSvg.append('line')
      .attr('x1', marginLeft).attr('x2', width - marginRight)
      .attr('y1', axisY).attr('y2', axisY)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    for (let year = minYear; year <= maxYear; year += 25) {
      const x = yearToX(year);
      axisSvg.append('line').attr('x1', x).attr('x2', x).attr('y1', axisY - 5).attr('y2', axisY + 2).attr('stroke', '#4a6580').attr('stroke-width', 1);
      axisSvg.append('text').attr('x', x).attr('y', axisY - 8).attr('text-anchor', 'middle').attr('fill', '#5a7a9a').attr('font-size', '10px').text(year);
    }

    // --- Main SVG ---
    const svg = d3.select(this.inner).append('svg')
      .attr('width', width).attr('height', svgHeight).style('display', 'block');

    const defs = svg.append('defs');

    // Gridlines
    for (let year = minYear; year <= maxYear; year += 25) {
      const x = yearToX(year);
      svg.append('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', svgHeight).attr('stroke', '#1a2a3e').attr('stroke-width', 1);
    }

    // Crosshair
    const crosshair = svg.append('line').attr('y1', 0).attr('y2', svgHeight).attr('stroke', '#e8b84b').attr('stroke-width', 1).attr('stroke-opacity', 0).attr('pointer-events', 'none');
    const axisCrosshair = axisSvg.append('line').attr('y1', 0).attr('y2', marginTop).attr('stroke', '#e8b84b').attr('stroke-width', 1).attr('stroke-opacity', 0).attr('pointer-events', 'none');
    const crosshairLabel = axisSvg.append('text').attr('y', axisY - 18).attr('text-anchor', 'middle').attr('fill', '#e8b84b').attr('font-size', '10px').attr('font-weight', '600').attr('opacity', 0);

    // Store row layout info for age-at-crosshair calculation
    this._rowLayout = [];

    // Mouse position helper: use offsetX/offsetY which are relative to the target
    // element and already account for CSS transforms in all browsers
    const svgNode = svg.node();
    const axisNode = axisSvg.node();

    const getMouseInSvg = (e) => {
      // offsetX/Y are relative to the event target, but we need relative to the SVG
      // Use the SVG's bounding rect divided by its CSS size to get the scale factor
      const svgRect = svgNode.getBoundingClientRect();
      const svgW = parseFloat(svgNode.getAttribute('width'));
      const svgH = parseFloat(svgNode.getAttribute('height'));
      const scaleX = svgW / svgRect.width;
      const scaleY = svgH / svgRect.height;
      const mx = (e.clientX - svgRect.left) * scaleX;
      const my = (e.clientY - svgRect.top) * scaleY;
      return { mx, my };
    };

    const getMouseInAxis = (e) => {
      const axisRect = axisNode.getBoundingClientRect();
      const axisW = parseFloat(axisNode.getAttribute('width'));
      const scaleX = axisW / axisRect.width;
      return (e.clientX - axisRect.left) * scaleX;
    };

    this.inner.onmousemove = (e) => {
      const { mx, my } = getMouseInSvg(e);
      const axisX = getMouseInAxis(e);

      if (mx >= marginLeft && mx <= width - marginRight) {
        crosshair.attr('x1', mx).attr('x2', mx).attr('stroke-opacity', 0.6);
        axisCrosshair.attr('x1', axisX).attr('x2', axisX).attr('stroke-opacity', 0.6);
        const cursorYear = xToYear(mx);
        const roundedYear = Math.round(cursorYear);
        crosshairLabel.attr('x', axisX).text(roundedYear).attr('opacity', 1);

        // Update age in right info panel if mouse is over a person's bar
        const ageEl = document.getElementById('tl-crosshair-age');
        let found = false;
        for (const rl of this._rowLayout) {
          if (my >= rl.y && my <= rl.y + BAR_H && mx >= rl.x1 && mx <= rl.x2 && rl.birthYear) {
            const ageAtCursor = Math.floor(cursorYear - rl.birthYear);
            if (ageAtCursor >= 0 && ageAtCursor <= 120) {
              if (ageEl) {
                ageEl.textContent = `${roundedYear}: ${ageAtCursor} Jahre`;
                ageEl.style.display = 'block';
              }
              found = true;
            }
            break;
          }
        }
        if (!found && ageEl) ageEl.style.display = 'none';
      } else {
        crosshair.attr('stroke-opacity', 0); axisCrosshair.attr('stroke-opacity', 0);
        crosshairLabel.attr('opacity', 0);
        const ageEl = document.getElementById('tl-crosshair-age');
        if (ageEl) ageEl.style.display = 'none';
      }
    };
    this.inner.onmouseleave = () => {
      crosshair.attr('stroke-opacity', 0); axisCrosshair.attr('stroke-opacity', 0);
      crosshairLabel.attr('opacity', 0);
      const ageEl = document.getElementById('tl-crosshair-age');
      if (ageEl) ageEl.style.display = 'none';
    };

    // --- Render bars ---
    const barsGroup = svg.append('g');
    const marriageOverlay = svg.append('g').attr('class', 'tl-marriage-overlay');
    const personYMap = new Map();

    // Separator line between father and mother branches
    if (rootRowIdx >= 0) {
      const sepY = (rootRowIdx + 0.5) * ROW_H;
      // Don't draw separator, root bar is enough visual anchor
    }

    allRows.forEach((p, i) => {
      const y = i * ROW_H;
      const isFemale = p.individual.sex === 'F';
      const baseColor = isFemale ? '#e94560' : '#4da8da';
      const isCenter = p.id === this.app.currentRootId;

      const x1 = yearToX(p.startYear);
      const x2 = yearToX(p.endYear);
      const totalW = x2 - x1;
      if (totalW < 2) return;

      personYMap.set(p.id, { y, x1, x2, midY: y + BAR_H / 2 });
      this._rowLayout.push({ y, x1, x2, birthYear: extractYear(p.individual.birthDate), id: p.id });

      const g = barsGroup.append('g')
        .style('cursor', 'pointer')
        .on('click', () => this.app.selectPerson(p.id))
        .on('mouseenter', () => {
          // Find the real node from flatTree for correct relationship display
          const realNode = this._findTreeNode(p.id) || p.node || { id: p.id, individual: p.individual, direction: p.isSibling ? 'sibling' : p.isPartner ? 'partner' : p.isChild ? 'descendant' : 'ancestor', generation: p.generation || 0, ahnentafelNumber: null };
          this.app.ui.showTooltip(realNode, {});
          marriageOverlay.selectAll('*').remove();
          this._showMarriageLine(p, personYMap, yearToX, marriageOverlay);
        })
        .on('mouseleave', () => { marriageOverlay.selectAll('*').remove(); });

      // Gradient
      const gradId = `tl-bar-${i}`;
      const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
      const opacity = isCenter ? 0.9 : (p.isSibling || p.isPartner) ? 0.3 : p.isChild ? 0.55 : 0.65;

      if (!p.startKnown) {
        grad.append('stop').attr('offset', '0%').attr('stop-color', baseColor).attr('stop-opacity', 0);
        grad.append('stop').attr('offset', '20%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      } else {
        grad.append('stop').attr('offset', '0%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      }
      if (!p.endKnown) {
        grad.append('stop').attr('offset', '80%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
        grad.append('stop').attr('offset', '100%').attr('stop-color', baseColor).attr('stop-opacity', 0);
      } else {
        grad.append('stop').attr('offset', '100%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      }

      g.append('rect').attr('x', x1).attr('y', y).attr('width', totalW).attr('height', BAR_H).attr('rx', 3).attr('fill', `url(#${gradId})`);

      if (isCenter) {
        g.append('rect').attr('x', x1).attr('y', y).attr('width', totalW).attr('height', BAR_H).attr('rx', 3).attr('fill', 'none').attr('stroke', '#d4a017').attr('stroke-width', 1.5);
      }

      // Date labels inside bar
      if (p.startKnown && totalW > 50) {
        g.append('text').attr('x', x1 + 3).attr('y', y + BAR_H - 3).attr('fill', '#fff').attr('font-size', '8px').text(formatDate(p.individual.birthDate) || p.startYear);
      }
      if (p.endKnown && totalW > 50) {
        g.append('text').attr('x', x2 - 3).attr('y', y + BAR_H - 3).attr('text-anchor', 'end').attr('fill', '#fff').attr('font-size', '8px').text(formatDate(p.individual.deathDate) || p.endYear);
      }

      // Name label
      const name = getDisplayName(p.individual);
      const nameColor = p.isSibling ? '#5a6a7a' : '#8a9ab0';
      const lifeMid = (p.startYear + p.endYear) / 2;

      if (lifeMid > (minYear + maxYear) / 2) {
        g.append('text').attr('x', x1 - 4).attr('y', y + BAR_H - 2).attr('text-anchor', 'end').attr('fill', nameColor).attr('font-size', '9px').text(name);
      } else {
        g.append('text').attr('x', x2 + 4).attr('y', y + BAR_H - 2).attr('text-anchor', 'start').attr('fill', nameColor).attr('font-size', '9px').text(name);
      }
    });

    // Enable drag-to-pan
    this._setupDragPan();
  }

  /**
   * Build ancestor tree and assign row indices.
   * Father branch above root, mother branch below.
   */
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

  _assignRows(node, rows, individuals, families) {
    if (!node) return;

    // Father branch first (above)
    this._assignRows(node.father, rows, individuals, families);

    // This person
    const range = getLifeRange(node.individual, families, individuals);
    const generation = node.depth;
    rows.push({
      id: node.id,
      individual: node.individual,
      node: { id: node.id, individual: node.individual, direction: generation === 0 ? 'ancestor' : 'ancestor', generation, ahnentafelNumber: null },
      isSibling: false,
      isPartner: false,
      generation,
      ...(range || { startYear: 1900, endYear: 1950, startKnown: false, endKnown: false })
    });

    // Mother branch after (below)
    this._assignRows(node.mother, rows, individuals, families);
  }

  /**
   * Find the real tree node from flatTree (with correct ahnentafelNumber, direction, etc.)
   */
  _findTreeNode(personId) {
    const ft = this.app.flatTree;
    if (!ft) return null;
    return ft.nodes.find(n => n.id === personId)
      || ft.siblingNodes.find(n => n.id === personId)
      || null;
  }

  _showMarriageLine(person, personYMap, yearToX, overlay) {
    const indi = person.individual;
    if (!indi.familyAsChild) return;

    const { families } = this.app.data;
    const fam = families.get(indi.familyAsChild);
    if (!fam || !fam.husbandId || !fam.wifeId) return;

    const fatherPos = personYMap.get(fam.husbandId);
    const motherPos = personYMap.get(fam.wifeId);
    if (!fatherPos || !motherPos) return;

    let lineX;
    const marriageYear = fam.marriageDate ? fam.marriageDate.match(/\d{4}/) : null;
    if (marriageYear) {
      lineX = yearToX(parseInt(marriageYear[0]));
    } else {
      lineX = (Math.max(fatherPos.x1, motherPos.x1) + Math.min(fatherPos.x2, motherPos.x2)) / 2;
    }

    const y1 = fatherPos.midY;
    const y2 = motherPos.midY;

    overlay.append('line').attr('x1', lineX).attr('x2', lineX)
      .attr('y1', Math.min(y1, y2)).attr('y2', Math.max(y1, y2))
      .attr('stroke', '#e8b84b').attr('stroke-width', 2).attr('stroke-dasharray', '6 4').attr('stroke-opacity', 0.8);

    const label = formatDate(fam.marriageDate) || '';
    if (label) {
      overlay.append('text').attr('x', lineX + 6).attr('y', (y1 + y2) / 2 + 3)
        .attr('fill', '#e8b84b').attr('font-size', '9px').attr('font-weight', '600').text(label);
    }

    overlay.append('circle').attr('cx', lineX).attr('cy', y1).attr('r', 3).attr('fill', '#e8b84b');
    overlay.append('circle').attr('cx', lineX).attr('cy', y2).attr('r', 3).attr('fill', '#e8b84b');
  }

  _setupDragPan() {
    const el = this.inner;
    let dragging = false;
    let startX, startY, scrollLeft, scrollTop;

    el.onmousedown = (e) => {
      if (e.target.closest('g[style*="cursor"]')) return; // don't interfere with bar clicks
      dragging = true;
      el.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      e.preventDefault();
    };

    const origMove = el.onmousemove; // preserve crosshair handler
    el.onmousemove = (e) => {
      if (origMove) origMove(e);
      if (!dragging) return;
      el.scrollLeft = scrollLeft - (e.clientX - startX);
      el.scrollTop = scrollTop - (e.clientY - startY);
    };

    el.onmouseup = () => { dragging = false; el.style.cursor = 'default'; };
    const origLeave = el.onmouseleave;
    el.onmouseleave = (e) => {
      if (origLeave) origLeave(e);
      dragging = false;
      el.style.cursor = 'default';
    };
  }
}
