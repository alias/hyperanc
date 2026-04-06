/**
 * Timeline View
 * Renders persons as horizontal bars on a time axis.
 */
import { getDisplayName } from './gedcom-parser.js';

/**
 * Extract a year from a GEDCOM date string.
 * Returns number or null.
 */
function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Estimate a year range for display purposes.
 * Returns { startYear, endYear, startKnown, endKnown }
 */
function getLifeRange(indi) {
  const birthYear = extractYear(indi.birthDate);
  const deathYear = extractYear(indi.deathDate);

  let startYear = birthYear;
  let endYear = deathYear;
  let startKnown = !!birthYear;
  let endKnown = !!deathYear;

  // If neither is known, skip this person
  if (!startYear && !endYear) return null;

  // Estimate missing dates: use 50 years for unknown start/end
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
    this.svg = null;
  }

  render() {
    if (!this.app.data) return;
    this.inner.innerHTML = '';

    const { individuals, families } = this.app.data;

    // Collect all persons in the current tree with date ranges
    const persons = [];
    const treeNodes = this.app.flatTree ? this.app.flatTree.nodes : [];
    const nodeIds = new Set(treeNodes.map(n => n.id));

    for (const node of treeNodes) {
      const indi = node.individual;
      const range = getLifeRange(indi);
      if (!range) continue;
      persons.push({
        id: node.id,
        individual: indi,
        node,
        ...range
      });
    }

    if (persons.length === 0) return;

    // Determine global time range
    let minYear = Infinity, maxYear = -Infinity;
    for (const p of persons) {
      if (p.startYear < minYear) minYear = p.startYear;
      if (p.endYear > maxYear) maxYear = p.endYear;
    }
    // Add padding
    minYear = Math.floor(minYear / 10) * 10 - 10;
    maxYear = Math.ceil(maxYear / 10) * 10 + 10;

    // Sort by birth year then by generation
    persons.sort((a, b) => a.startYear - b.startYear);

    // Layout
    const rect = this.inner.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const marginLeft = 40;
    const marginRight = 40;
    const marginTop = 30;
    const marginBottom = 30;
    const barHeight = 16;
    const barGap = 4;
    const nameWidth = 140;

    const plotWidth = width - marginLeft - marginRight;
    const yearToX = (year) => marginLeft + (year - minYear) / (maxYear - minYear) * plotWidth;
    const totalBarsHeight = persons.length * (barHeight + barGap);
    const svgHeight = Math.max(height, totalBarsHeight + marginTop + marginBottom);

    // Create SVG
    const svg = d3.select(this.inner).append('svg')
      .attr('width', width)
      .attr('height', svgHeight)
      .style('display', 'block');

    const defs = svg.append('defs');

    // Fade-out gradients for unknown dates
    // Per-person gradients will be created dynamically below

    // --- Time axis ---
    const axisY = marginTop + 10;

    // Axis line
    svg.append('line')
      .attr('x1', marginLeft).attr('x2', width - marginRight)
      .attr('y1', axisY).attr('y2', axisY)
      .attr('stroke', '#334155').attr('stroke-width', 1);

    // Ticks every 10 years
    for (let year = minYear; year <= maxYear; year += 10) {
      const x = yearToX(year);
      svg.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', axisY - 6).attr('y2', axisY + 6)
        .attr('stroke', '#4a6580').attr('stroke-width', 1);

      svg.append('text')
        .attr('x', x).attr('y', axisY - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#5a7a9a').attr('font-size', '10px')
        .text(year);

      // Vertical gridline
      svg.append('line')
        .attr('x1', x).attr('x2', x)
        .attr('y1', axisY + 10)
        .attr('y2', svgHeight - marginBottom)
        .attr('stroke', '#1a2a3e').attr('stroke-width', 1);
    }

    // --- Person bars ---
    const barsGroup = svg.append('g');
    const midYear = (minYear + maxYear) / 2;

    persons.forEach((p, i) => {
      const y = marginTop + 30 + i * (barHeight + barGap);
      const isFemale = p.individual.sex === 'F';
      const baseColor = isFemale ? '#e94560' : '#4da8da';
      const isCenter = p.node.generation === 0 && p.node.direction !== 'sibling';

      const x1 = yearToX(p.startYear);
      const x2 = yearToX(p.endYear);
      const totalW = x2 - x1;
      if (totalW < 2) return;

      const g = barsGroup.append('g')
        .style('cursor', 'pointer')
        .on('click', () => this.app.selectPerson(p.id))
        .on('mouseenter', () => {
          this.app.ui.showTooltip(p.node, {});
        });

      // Create per-person gradient for fade effects
      const gradId = `tl-bar-${i}`;
      const grad = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%').attr('x2', '100%');

      const opacity = isCenter ? 0.9 : 0.65;

      if (!p.startKnown) {
        // Fade in from transparent
        grad.append('stop').attr('offset', '0%').attr('stop-color', baseColor).attr('stop-opacity', 0);
        grad.append('stop').attr('offset', '20%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      } else {
        grad.append('stop').attr('offset', '0%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      }

      if (!p.endKnown) {
        // Fade out to transparent
        grad.append('stop').attr('offset', '80%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
        grad.append('stop').attr('offset', '100%').attr('stop-color', baseColor).attr('stop-opacity', 0);
      } else {
        grad.append('stop').attr('offset', '100%').attr('stop-color', baseColor).attr('stop-opacity', opacity);
      }

      // Single bar rect with gradient
      g.append('rect')
        .attr('x', x1).attr('y', y)
        .attr('width', totalW).attr('height', barHeight)
        .attr('rx', 3).attr('ry', 3)
        .attr('fill', `url(#${gradId})`);

      // Center person highlight border
      if (isCenter) {
        g.append('rect')
          .attr('x', x1).attr('y', y)
          .attr('width', totalW).attr('height', barHeight)
          .attr('rx', 3).attr('ry', 3)
          .attr('fill', 'none')
          .attr('stroke', '#d4a017').attr('stroke-width', 1.5);
      }

      // Birth date label (left inside bar)
      if (p.startKnown && totalW > 60) {
        g.append('text')
          .attr('x', x1 + 4).attr('y', y + barHeight - 4)
          .attr('fill', '#fff').attr('font-size', '9px')
          .text(p.individual.birthDate || p.startYear);
      }

      // Death date label (right inside bar)
      if (p.endKnown && totalW > 60) {
        g.append('text')
          .attr('x', x2 - 4).attr('y', y + barHeight - 4)
          .attr('text-anchor', 'end')
          .attr('fill', '#fff').attr('font-size', '9px')
          .text(p.individual.deathDate || p.endYear);
      }

      // Name label - left of bar if young (center of lifespan > midYear), right if old
      const lifeMid = (p.startYear + p.endYear) / 2;
      const name = getDisplayName(p.individual);

      if (lifeMid > midYear) {
        // Name on the left
        g.append('text')
          .attr('x', x1 - 4).attr('y', y + barHeight - 3)
          .attr('text-anchor', 'end')
          .attr('fill', '#8a9ab0').attr('font-size', '10px')
          .text(name);
      } else {
        // Name on the right
        g.append('text')
          .attr('x', x2 + 4).attr('y', y + barHeight - 3)
          .attr('text-anchor', 'start')
          .attr('fill', '#8a9ab0').attr('font-size', '10px')
          .text(name);
      }
    });

    // Adjust SVG height to actual content
    const actualHeight = marginTop + 30 + persons.length * (barHeight + barGap) + marginBottom;
    svg.attr('height', Math.max(height, actualHeight));
  }
}
