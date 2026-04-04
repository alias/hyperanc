/**
 * Renderer
 * D3/SVG rendering of the hyperbolic tree in the Poincaré disk.
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

    // Create layers
    this.svg.attr('width', width).attr('height', height);

    // Disk background
    this.svg.append('circle')
      .attr('class', 'disk-boundary')
      .attr('cx', this.cx)
      .attr('cy', this.cy)
      .attr('r', this.radius);

    // Generation rings (visual guide)
    this.ringsGroup = this.svg.append('g').attr('class', 'rings');
    this.edgesGroup = this.svg.append('g').attr('class', 'edges');
    this.nodesGroup = this.svg.append('g').attr('class', 'nodes');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.radius = Math.min(width, height) / 2 - 30;
    this.cx = width / 2;
    this.cy = height / 2;

    this.svg.attr('width', width).attr('height', height);
    this.svg.select('.disk-boundary')
      .attr('cx', this.cx)
      .attr('cy', this.cy)
      .attr('r', this.radius);
  }

  render(nodes, edges, positions, transformFn, onNodeClick, onNodeHover, onNodeLeave) {
    const { cx, cy, radius } = this;

    // Transform positions through current Möbius transform
    const screenPositions = new Map();
    const diskPositions = new Map();
    for (const node of nodes) {
      const diskPos = positions.get(node.id);
      if (!diskPos) continue;
      const transformed = transformFn ? transformFn(diskPos) : diskPos;
      diskPositions.set(node.id, transformed);
      screenPositions.set(node.id, diskToScreen(transformed, cx, cy, radius));
    }

    // Compute node sizes based on conformal factor
    const nodeSizes = new Map();
    for (const node of nodes) {
      const dp = diskPositions.get(node.id);
      if (!dp) continue;
      const r = cAbs(dp);
      // Conformal factor: (1 - |z|^2), clamped
      const conformal = Math.max(0.05, 1 - r * r);
      const size = Math.max(3, conformal * 18);
      nodeSizes.set(node.id, size);
    }

    // --- Edges ---
    const edgeData = edges.filter(e =>
      diskPositions.has(e.source.id) && diskPositions.has(e.target.id)
    );

    const edgePaths = this.edgesGroup.selectAll('.edge')
      .data(edgeData, d => `${d.source.id}-${d.target.id}`);

    edgePaths.exit().remove();

    const edgeEnter = edgePaths.enter()
      .append('path')
      .attr('class', 'edge');

    edgePaths.merge(edgeEnter)
      .attr('d', d => {
        const dp1 = diskPositions.get(d.source.id);
        const dp2 = diskPositions.get(d.target.id);
        return geodesicPath(dp1, dp2, cx, cy, radius);
      })
      .attr('stroke-opacity', d => {
        const dp1 = diskPositions.get(d.source.id);
        const dp2 = diskPositions.get(d.target.id);
        const maxR = Math.max(cAbs(dp1), cAbs(dp2));
        return Math.max(0.1, 1 - maxR);
      });

    // --- Nodes ---
    const nodeData = nodes.filter(n => screenPositions.has(n.id));

    const nodeGroups = this.nodesGroup.selectAll('.node')
      .data(nodeData, d => d.id);

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
        const sex = d.individual.sex;
        if (d.generation === 0) return 'node-circle root';
        if (sex === 'M') return 'node-circle male';
        if (sex === 'F') return 'node-circle female';
        return 'node-circle unknown';
      });

    merged.select('text')
      .text(d => {
        const size = nodeSizes.get(d.id);
        if (size < 6) return '';
        const name = getDisplayName(d.individual);
        if (size < 10) {
          // Show initials only
          return name.split(' ').map(w => w[0]).join('').substring(0, 3);
        }
        return name;
      })
      .attr('dy', d => -(nodeSizes.get(d.id) + 3))
      .attr('font-size', d => {
        const size = nodeSizes.get(d.id);
        return Math.max(7, Math.min(13, size * 0.8)) + 'px';
      })
      .attr('opacity', d => {
        const dp = diskPositions.get(d.id);
        const r = cAbs(dp);
        return Math.max(0, Math.min(1, (1 - r) * 2.5));
      });

    // Event handlers
    merged
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onNodeClick) onNodeClick(d);
      })
      .on('mouseenter', (event, d) => {
        if (onNodeHover) onNodeHover(d, event);
      })
      .on('mouseleave', (event, d) => {
        if (onNodeLeave) onNodeLeave(d);
      });
  }
}
