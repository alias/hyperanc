/**
 * Renderer
 * D3/SVG rendering of the hyperbolic tree in the Poincaré disk.
 * Supports tree edges (solid) and sibling edges (dashed).
 */
import { diskToScreen, geodesicPath, cAbs } from './hyperbolic-math.js';
import { getDisplayName, getLifespan } from './gedcom-parser.js';

export class Renderer {
  constructor(svgElement, width, height) {
    this.svg = d3.select(svgElement);
    this.width = width;
    this.height = height;
    this.radius = Math.min(width, height) / 2 - 30;
    this.cx = width / 2;
    this.cy = height / 2;

    this.svg.attr('width', width).attr('height', height);

    const defs = this.svg.append('defs');

    const globeGrad = defs.append('radialGradient')
      .attr('id', 'globe-gradient')
      .attr('cx', '40%').attr('cy', '35%').attr('r', '60%');
    globeGrad.append('stop').attr('offset', '0%').attr('stop-color', '#1a2a4a');
    globeGrad.append('stop').attr('offset', '50%').attr('stop-color', '#0d1b2a');
    globeGrad.append('stop').attr('offset', '100%').attr('stop-color', '#060d16');

    const specGrad = defs.append('radialGradient')
      .attr('id', 'globe-specular')
      .attr('cx', '35%').attr('cy', '30%').attr('r', '40%');
    specGrad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255,255,255,0.08)');
    specGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255,255,255,0)');

    // Arrow marker for descendant edges
    defs.append('marker')
      .attr('id', 'arrow-descendant')
      .attr('viewBox', '0 0 10 8')
      .attr('refX', 0)
      .attr('refY', 4)
      .attr('markerWidth', 14)
      .attr('markerHeight', 10)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 4 L 0 8 Z')
      .attr('fill', '#8ab4d8');

    const atmosGrad = defs.append('radialGradient')
      .attr('id', 'globe-atmosphere')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
    atmosGrad.append('stop').attr('offset', '80%').attr('stop-color', 'rgba(15,52,96,0)');
    atmosGrad.append('stop').attr('offset', '95%').attr('stop-color', 'rgba(15,52,96,0.4)');
    atmosGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(15,52,96,0.8)');

    this.svg.append('circle')
      .attr('class', 'disk-boundary')
      .attr('cx', this.cx).attr('cy', this.cy).attr('r', this.radius)
      .attr('fill', 'url(#globe-gradient)')
      .attr('stroke', '#0f3460').attr('stroke-width', 2);

    this.svg.append('circle')
      .attr('class', 'disk-specular')
      .attr('cx', this.cx).attr('cy', this.cy).attr('r', this.radius)
      .attr('fill', 'url(#globe-specular)')
      .attr('pointer-events', 'none');

    this.ringsGroup = this.svg.append('g').attr('class', 'rings');
    this.siblingEdgesGroup = this.svg.append('g').attr('class', 'sibling-edges');
    this.edgesGroup = this.svg.append('g').attr('class', 'edges');
    this.marriageGroup = this.svg.append('g').attr('class', 'marriage-overlay');
    this.nodesGroup = this.svg.append('g').attr('class', 'nodes');

    this.svg.append('circle')
      .attr('class', 'disk-atmosphere')
      .attr('cx', this.cx).attr('cy', this.cy).attr('r', this.radius)
      .attr('fill', 'url(#globe-atmosphere)')
      .attr('pointer-events', 'none');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.radius = Math.min(width, height) / 2 - 30;
    this.cx = width / 2;
    this.cy = height / 2;

    this.svg.attr('width', width).attr('height', height);
    this.svg.selectAll('.disk-boundary, .disk-specular, .disk-atmosphere')
      .attr('cx', this.cx).attr('cy', this.cy).attr('r', this.radius);
  }

  render(allNodes, treeEdges, siblingEdges, positions, transformFn, showSiblings, families, individuals, onNodeClick, onNodeHover, onNodeLeave) {
    const { cx, cy, radius } = this;

    // Transform all positions
    const screenPositions = new Map();
    const diskPositions = new Map();
    for (const node of allNodes) {
      const diskPos = positions.get(node.id);
      if (!diskPos) continue;
      const transformed = transformFn ? transformFn(diskPos) : diskPos;
      diskPositions.set(node.id, transformed);
      screenPositions.set(node.id, diskToScreen(transformed, cx, cy, radius));
    }

    // Compute node sizes
    const nodeSizes = new Map();
    for (const node of allNodes) {
      const dp = diskPositions.get(node.id);
      if (!dp) continue;
      const r = cAbs(dp);
      const conformal = Math.max(0.05, 1 - r * r);
      nodeSizes.set(node.id, Math.max(3, conformal * 18));
    }

    // --- Tree Edges ---
    const treeEdgeData = treeEdges.filter(e =>
      diskPositions.has(e.source.id) && diskPositions.has(e.target.id)
    );

    const edgePaths = this.edgesGroup.selectAll('.edge')
      .data(treeEdgeData, d => `${d.source.id}-${d.target.id}`);
    edgePaths.exit().remove();
    const edgeEnter = edgePaths.enter().append('path').attr('class', 'edge');
    edgePaths.merge(edgeEnter)
      .attr('d', d => geodesicPath(diskPositions.get(d.source.id), diskPositions.get(d.target.id), cx, cy, radius))
      .attr('stroke-opacity', d => {
        const maxR = Math.max(cAbs(diskPositions.get(d.source.id)), cAbs(diskPositions.get(d.target.id)));
        return Math.max(0.25, 1 - maxR * 0.7);
      })
      .attr('marker-end', null); // arrows rendered separately for visibility

    // --- Sibling Edges (rendered but hidden, shown on hover) ---
    const sibEdgeData = showSiblings ? siblingEdges.filter(e =>
      diskPositions.has(e.source.id) && diskPositions.has(e.target.id)
    ) : [];

    const sibPaths = this.siblingEdgesGroup.selectAll('.sibling-edge')
      .data(sibEdgeData, d => `sib-${d.source.id}-${d.target.id}`);
    sibPaths.exit().remove();
    const sibEnter = sibPaths.enter().append('path').attr('class', 'sibling-edge');
    sibPaths.merge(sibEnter)
      .attr('d', d => geodesicPath(diskPositions.get(d.source.id), diskPositions.get(d.target.id), cx, cy, radius))
      .attr('stroke-opacity', d => {
        const maxR = Math.max(cAbs(diskPositions.get(d.source.id)), cAbs(diskPositions.get(d.target.id)));
        return Math.max(0.2, 1 - maxR * 0.7);
      });

    // Store sibling data for hover lookup
    this._siblingEdgeData = sibEdgeData;
    this._diskPositions = diskPositions;

    // --- Parent->Child Arrows on ALL tree edges ---
    // Uses getPointAtLength on the actual SVG path to sit on the curved geodesic
    const edgePathEls = this.edgesGroup.selectAll('.edge').nodes();
    const edgePathMap = new Map();
    edgePathEls.forEach(el => {
      const d = d3.select(el).datum();
      if (d) edgePathMap.set(`${d.source.id}-${d.target.id}`, el);
    });

    const arrows = this.edgesGroup.selectAll('.desc-arrow')
      .data(treeEdgeData, d => `arr-${d.source.id}-${d.target.id}`);
    arrows.exit().remove();
    const arrowEnter = arrows.enter().append('polygon').attr('class', 'desc-arrow');
    arrows.merge(arrowEnter)
      .attr('points', d => {
        const pathEl = edgePathMap.get(`${d.source.id}-${d.target.id}`);
        if (!pathEl) return '';
        const totalLen = pathEl.getTotalLength();
        if (totalLen < 2) return '';

        // Arrow points from parent to child
        const isAncestor = d.target.direction === 'ancestor' && d.target.generation > d.source.generation;

        // For ancestor edges the path goes source(child)->target(parent),
        // so arrow at 45% points toward source (child). For descendant: 55%.
        const pathFraction = isAncestor ? 0.45 : 0.55;
        const sampleDelta = 2; // px for tangent approximation

        const lenAt = totalLen * pathFraction;
        const pt = pathEl.getPointAtLength(lenAt);

        // Get tangent by sampling nearby points
        const ptBefore = pathEl.getPointAtLength(Math.max(0, lenAt - sampleDelta));
        const ptAfter = pathEl.getPointAtLength(Math.min(totalLen, lenAt + sampleDelta));

        // Tangent direction along the path
        let tdx = ptAfter.x - ptBefore.x;
        let tdy = ptAfter.y - ptBefore.y;
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
        if (tlen < 0.1) return '';
        tdx /= tlen;
        tdy /= tlen;

        // For ancestor edges, reverse direction so arrow points toward child (source)
        if (isAncestor) { tdx = -tdx; tdy = -tdy; }

        // Perpendicular
        const px = -tdy;
        const py = tdx;

        // Size based on conformal factor at the child end
        const childId = isAncestor ? d.source.id : d.target.id;
        const midDisk = diskPositions.get(childId);
        const r = midDisk ? cAbs(midDisk) : 0.5;
        const size = Math.max(5, (1 - r) * 12);

        const tipX = pt.x + tdx * size;
        const tipY = pt.y + tdy * size;
        const leftX = pt.x - tdx * size * 0.3 + px * size * 0.6;
        const leftY = pt.y - tdy * size * 0.3 + py * size * 0.6;
        const rightX = pt.x - tdx * size * 0.3 - px * size * 0.6;
        const rightY = pt.y - tdy * size * 0.3 - py * size * 0.6;
        return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
      })
      .attr('fill', '#8ab4d8')
      .attr('opacity', d => {
        const isAncestor = d.target.direction === 'ancestor' && d.target.generation > d.source.generation;
        const childId = isAncestor ? d.source.id : d.target.id;
        const dp = diskPositions.get(childId);
        const r = dp ? cAbs(dp) : 0.5;
        return Math.max(0.2, 1 - r * 0.8);
      });

    // --- Nodes ---
    // Filter: show sibling nodes only when toggle is on
    const visibleNodes = allNodes.filter(n => {
      if (!screenPositions.has(n.id)) return false;
      if (n.direction === 'sibling' && !showSiblings) return false;
      return true;
    });

    const nodeGroups = this.nodesGroup.selectAll('.node')
      .data(visibleNodes, d => d.id);
    nodeGroups.exit().remove();

    const nodeEnter = nodeGroups.enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');
    nodeEnter.append('circle');
    nodeEnter.append('text');

    const merged = nodeGroups.merge(nodeEnter);

    merged.attr('transform', d => {
      const [sx, sy] = screenPositions.get(d.id);
      return `translate(${sx}, ${sy})`;
    });

    merged.select('circle')
      .attr('r', d => nodeSizes.get(d.id))
      .attr('class', d => {
        const isSibling = d.direction === 'sibling';
        const sex = d.individual.sex;
        if (d.generation === 0 && !isSibling) return 'node-circle root';
        if (isSibling) {
          return sex === 'M' ? 'node-circle sibling-male' : sex === 'F' ? 'node-circle sibling-female' : 'node-circle sibling-unknown';
        }
        if (sex === 'M') return 'node-circle male';
        if (sex === 'F') return 'node-circle female';
        return 'node-circle unknown';
      });

    merged.select('text')
      .text(d => {
        const size = nodeSizes.get(d.id);
        if (size < 6) return '';
        const name = getDisplayName(d.individual);
        if (size < 10) return name.split(' ').map(w => w[0]).join('').substring(0, 3);
        return name;
      })
      .attr('dy', d => -(nodeSizes.get(d.id) + 3))
      .attr('font-size', d => Math.max(7, Math.min(13, nodeSizes.get(d.id) * 0.8)) + 'px')
      .attr('opacity', d => {
        const dp = diskPositions.get(d.id);
        const r = cAbs(dp);
        const base = Math.max(0, Math.min(1, (1 - r) * 2.5));
        return d.direction === 'sibling' ? base * 0.7 : base;
      });

    // Store refs for marriage hover
    this._currentDiskPositions = diskPositions;
    this._currentScreenPositions = screenPositions;
    this._currentNodeMap = new Map(allNodes.map(n => [n.id, n]));
    this._families = families;
    this._individuals = individuals;

    merged
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onNodeClick) onNodeClick(d);
      })
      .on('mouseenter', (event, d) => {
        if (onNodeHover) onNodeHover(d, event);
        this._showMarriageLine(d);
      })
      .on('mouseleave', (event, d) => {
        if (onNodeLeave) onNodeLeave(d);
        this._hideMarriageLine();
      });
  }

  /**
   * On hover over a child node, find its parents. If both are visible,
   * draw a geodesic line between them with marriage date label.
   */
  _showMarriageLine(node) {
    this._hideMarriageLine();
    if (!this._families || !this._individuals) return;

    const indi = node.individual;
    if (!indi.familyAsChild) return;

    const fam = this._families.get(indi.familyAsChild);
    if (!fam || !fam.husbandId || !fam.wifeId) return;

    const dp = this._currentDiskPositions;
    const sp = this._currentScreenPositions;
    if (!dp.has(fam.husbandId) || !dp.has(fam.wifeId)) return;

    const { cx, cy, radius } = this;
    const hDisk = dp.get(fam.husbandId);
    const wDisk = dp.get(fam.wifeId);

    // Draw geodesic between the two parents
    const pathD = geodesicPath(hDisk, wDisk, cx, cy, radius);

    this.marriageGroup.append('path')
      .attr('class', 'marriage-line')
      .attr('d', pathD)
      .attr('fill', 'none')
      .attr('stroke', '#e8b84b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3 2')
      .attr('stroke-opacity', 0.8);

    // Marriage date label at midpoint
    const marriageDate = fam.marriageDate || '';
    const marriagePlace = fam.marriagePlace || '';
    let label = '';
    if (marriageDate && marriagePlace) label = `${marriageDate}, ${marriagePlace}`;
    else if (marriageDate) label = marriageDate;
    else if (marriagePlace) label = marriagePlace;

    if (label) {
      // Get midpoint on the actual path
      const pathEl = this.marriageGroup.select('.marriage-line').node();
      if (pathEl) {
        const totalLen = pathEl.getTotalLength();
        const mid = pathEl.getPointAtLength(totalLen / 2);

        this.marriageGroup.append('text')
          .attr('class', 'marriage-label')
          .attr('x', mid.x)
          .attr('y', mid.y - 6)
          .attr('text-anchor', 'middle')
          .attr('fill', '#e8b84b')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(label);
      }
    }
  }

  _hideMarriageLine() {
    this.marriageGroup.selectAll('*').remove();
  }
}
