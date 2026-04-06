/**
 * Timeline View
 * Renders persons as horizontal bars on a time axis.
 */
import { getDisplayName } from './gedcom-parser.js';

function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

function getLifeRange(indi) {
  const birthYear = extractYear(indi.birthDate);
  const deathYear = extractYear(indi.deathDate);

  let startYear = birthYear;
  let endYear = deathYear;
  let startKnown = !!birthYear;
  let endKnown = !!deathYear;

  if (!startYear && !endYear) return null;

  if (!startYear && endYear) {
    startYear = endYear - 50;
    startKnown = false;
  }
  if (!endYear && startYear) {
    endYear = startYear + 50;
    endKnown = false;
  }

  return { startYear, endYear, startKnown, endKnown };
}

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

    // Collect persons
    const persons = [];
    const treeNodes = this.app.flatTree ? this.app.flatTree.nodes : [];
    const siblingNodes = (this.app.showSiblings && this.app.flatTree) ? this.app.flatTree.siblingNodes : [];

    for (const node of [...treeNodes, ...siblingNodes]) {
      const indi = node.individual;
      const range = getLifeRange(indi);
      if (!range) continue;
      persons.push({
        id: node.id,
        individual: indi,
        node,
        isSibling: node.direction === 'sibling',
        ...range
      });
    }

    if (persons.length === 0) return;

    // Time range
    let minYear = Infinity, maxYear = -Infinity;
    for (const p of persons) {
      if (p.startYear < minYear) minYear = p.startYear;
      if (p.endYear > maxYear) maxYear = p.endYear;
    }
    minYear = Math.floor(minYear / 25) * 25 - 25;
    maxYear = Math.ceil(maxYear / 25) * 25 + 25;

    persons.sort((a, b) => a.startYear - b.startYear);

    // Layout
    const rect = this.inner.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const marginLeft = 40;
    const marginRight = 40;
    const axisHeight = 32;
    const barHeight = 16;
    const barGap = 4;
    const barStartY = 8;

    const plotWidth = width - marginLeft - marginRight;
    const yearToX = (year) => marginLeft + (year - minYear) / (maxYear - minYear) * plotWidth;
    const xToYear = (x) => minYear + (x - marginLeft) / plotWidth * (maxYear - minYear);
    const totalBarsHeight = persons.length * (barHeight + barGap) + barStartY + 20;
    const midYear = (minYear + maxYear) / 2;

    // --- Fixed axis overlay ---
    const axisSvg = d3.select(this.inner).append('svg')
      .attr('class', 'tl-axis')
      .attr('width', width)
      .attr('height', axisHeight)
      .style('position', 'sticky')
      .style('top', '0')
      .style('z-index', '5')
      .style('background', 'rgba(13, 27, 42, 0.95)');

    const axisY = axisHeight - 6;

    // Axis line
    axisSvg.append('line')
      .attr('x1', marginLeft).attr('x2', width - marginRight)
      .attr('y1', axisY).attr('y2', axisY)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    // Ticks every 25 years
    for (let year = minYear; year <= maxYear; year += 25) {
      const x = yearToX(year);
      axisSvg.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', axisY - 5).attr('y2', axisY + 2)
        .attr('stroke', '#4a6580').attr('stroke-width', 1);

      axisSvg.append('text')
        .attr('x', x).attr('y', axisY - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#5a7a9a').attr('font-size', '10px')
        .text(year);
    }

    // --- Scrollable bars SVG ---
    const svg = d3.select(this.inner).append('svg')
      .attr('width', width)
      .attr('height', totalBarsHeight)
      .style('display', 'block');

    const defs = svg.append('defs');

    // Vertical gridlines every 25 years
    for (let year = minYear; year <= maxYear; year += 25) {
      const x = yearToX(year);
      svg.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', 0).attr('y2', totalBarsHeight)
        .attr('stroke', '#1a2a3e').attr('stroke-width', 1);
    }

    // --- Crosshair line ---
    const crosshair = svg.append('line')
      .attr('class', 'tl-crosshair')
      .attr('y1', 0).attr('y2', totalBarsHeight)
      .attr('stroke', '#e8b84b').attr('stroke-width', 1)
      .attr('stroke-opacity', 0)
      .attr('pointer-events', 'none');

    const axisCrosshair = axisSvg.append('line')
      .attr('class', 'tl-axis-crosshair')
      .attr('y1', 0).attr('y2', axisHeight)
      .attr('stroke', '#e8b84b').attr('stroke-width', 1)
      .attr('stroke-opacity', 0)
      .attr('pointer-events', 'none');

    // Year label on crosshair
    const crosshairLabel = axisSvg.append('text')
      .attr('class', 'tl-crosshair-label')
      .attr('y', axisY - 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e8b84b').attr('font-size', '10px').attr('font-weight', '600')
      .attr('opacity', 0);

    // Mouse tracking on the whole inner container
    const innerEl = this.inner;
    innerEl.addEventListener('mousemove', (e) => {
      const r = innerEl.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (mx >= marginLeft && mx <= width - marginRight) {
        crosshair.attr('x1', mx).attr('x2', mx).attr('stroke-opacity', 0.6);
        axisCrosshair.attr('x1', mx).attr('x2', mx).attr('stroke-opacity', 0.6);
        const year = Math.round(xToYear(mx));
        crosshairLabel.attr('x', mx).text(year).attr('opacity', 1);
      } else {
        crosshair.attr('stroke-opacity', 0);
        axisCrosshair.attr('stroke-opacity', 0);
        crosshairLabel.attr('opacity', 0);
      }
    });

    innerEl.addEventListener('mouseleave', () => {
      crosshair.attr('stroke-opacity', 0);
      axisCrosshair.attr('stroke-opacity', 0);
      crosshairLabel.attr('opacity', 0);
    });

    // --- Person bars ---
    const barsGroup = svg.append('g');
    const marriageOverlay = svg.append('g').attr('class', 'tl-marriage-overlay');
    const personYMap = new Map();

    persons.forEach((p, i) => {
      const y = barStartY + i * (barHeight + barGap);
      const isFemale = p.individual.sex === 'F';
      const baseColor = isFemale ? '#e94560' : '#4da8da';
      const isCenter = p.node.generation === 0 && p.node.direction !== 'sibling';

      const x1 = yearToX(p.startYear);
      const x2 = yearToX(p.endYear);
      const totalW = x2 - x1;
      if (totalW < 2) return;

      personYMap.set(p.id, { y, x1, x2, midY: y + barHeight / 2 });

      const g = barsGroup.append('g')
        .style('cursor', 'pointer')
        .on('click', () => this.app.selectPerson(p.id))
        .on('mouseenter', () => {
          this.app.ui.showTooltip(p.node, {});
          this._showMarriageLine(p, personYMap, yearToX, marriageOverlay);
        })
        .on('mouseleave', () => {
          marriageOverlay.selectAll('*').remove();
        });

      // Per-person gradient
      const gradId = `tl-bar-${i}`;
      const grad = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%').attr('x2', '100%');

      const opacity = isCenter ? 0.9 : p.isSibling ? 0.35 : 0.65;

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

      g.append('rect')
        .attr('x', x1).attr('y', y)
        .attr('width', totalW).attr('height', barHeight)
        .attr('rx', 3).attr('ry', 3)
        .attr('fill', `url(#${gradId})`);

      if (isCenter) {
        g.append('rect')
          .attr('x', x1).attr('y', y)
          .attr('width', totalW).attr('height', barHeight)
          .attr('rx', 3).attr('ry', 3)
          .attr('fill', 'none')
          .attr('stroke', '#d4a017').attr('stroke-width', 1.5);
      }

      if (p.startKnown && totalW > 60) {
        g.append('text')
          .attr('x', x1 + 4).attr('y', y + barHeight - 4)
          .attr('fill', '#fff').attr('font-size', '9px')
          .text(p.individual.birthDate || p.startYear);
      }

      if (p.endKnown && totalW > 60) {
        g.append('text')
          .attr('x', x2 - 4).attr('y', y + barHeight - 4)
          .attr('text-anchor', 'end')
          .attr('fill', '#fff').attr('font-size', '9px')
          .text(p.individual.deathDate || p.endYear);
      }

      const name = getDisplayName(p.individual);
      const nameColor = p.isSibling ? '#5a6a7a' : '#8a9ab0';
      const lifeMid = (p.startYear + p.endYear) / 2;

      if (lifeMid > midYear) {
        g.append('text')
          .attr('x', x1 - 4).attr('y', y + barHeight - 3)
          .attr('text-anchor', 'end')
          .attr('fill', nameColor).attr('font-size', '10px')
          .text(name);
      } else {
        g.append('text')
          .attr('x', x2 + 4).attr('y', y + barHeight - 3)
          .attr('text-anchor', 'start')
          .attr('fill', nameColor).attr('font-size', '10px')
          .text(name);
      }
    });
  }

  _showMarriageLine(person, personYMap, yearToX, overlay) {
    overlay.selectAll('*').remove();

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
      const overlapX1 = Math.max(fatherPos.x1, motherPos.x1);
      const overlapX2 = Math.min(fatherPos.x2, motherPos.x2);
      lineX = (overlapX1 + overlapX2) / 2;
    }

    const y1 = fatherPos.midY;
    const y2 = motherPos.midY;

    overlay.append('line')
      .attr('x1', lineX).attr('x2', lineX)
      .attr('y1', Math.min(y1, y2)).attr('y2', Math.max(y1, y2))
      .attr('stroke', '#e8b84b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6 4')
      .attr('stroke-opacity', 0.8);

    const label = fam.marriageDate || '';
    if (label) {
      const labelY = (y1 + y2) / 2;
      overlay.append('text')
        .attr('x', lineX + 6).attr('y', labelY + 3)
        .attr('fill', '#e8b84b')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text(label);
    }

    overlay.append('circle')
      .attr('cx', lineX).attr('cy', y1)
      .attr('r', 3).attr('fill', '#e8b84b');
    overlay.append('circle')
      .attr('cx', lineX).attr('cy', y2)
      .attr('r', 3).attr('fill', '#e8b84b');
  }
}
