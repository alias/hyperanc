/**
 * Sibling Layout
 * Places sibling nodes near their connected tree node,
 * with enough spacing to avoid overlap.
 * Spacing adapts to the conformal factor (nodes near center are bigger)
 * and the number of siblings.
 */

export function layoutSiblings(flatTree, positions) {
  const { siblingNodes, siblingEdges } = flatTree;

  // Build a set for fast lookup
  const siblingIdSet = new Set(siblingNodes.map(n => n.id));

  // Group siblings by their connected tree node
  const siblingsByParent = new Map();
  for (const edge of siblingEdges) {
    const sourceIsSib = siblingIdSet.has(edge.source.id);
    const targetIsSib = siblingIdSet.has(edge.target.id);

    // We want: treeNode -> siblingNode
    let treeNodeId, siblingId;
    if (!sourceIsSib && targetIsSib) {
      treeNodeId = edge.source.id;
      siblingId = edge.target.id;
    } else if (sourceIsSib && !targetIsSib) {
      treeNodeId = edge.target.id;
      siblingId = edge.source.id;
    } else {
      continue; // both are tree nodes or both are siblings
    }

    if (!siblingsByParent.has(treeNodeId)) {
      siblingsByParent.set(treeNodeId, []);
    }
    const list = siblingsByParent.get(treeNodeId);
    if (!list.includes(siblingId)) {
      list.push(siblingId);
    }
  }

  // Collect all occupied positions (tree nodes) for collision avoidance
  const occupied = [];
  for (const [id, pos] of positions) {
    if (!siblingIdSet.has(id)) {
      occupied.push(pos);
    }
  }

  for (const [parentId, sibIds] of siblingsByParent) {
    const parentPos = positions.get(parentId);
    if (!parentPos) continue;

    const px = parentPos[0];
    const py = parentPos[1];
    const parentR = Math.sqrt(px * px + py * py);
    const parentAngle = Math.atan2(py, px);

    // Conformal factor at parent position - determines how big nodes appear here
    const conformal = Math.max(0.1, 1 - parentR * parentR);

    // Base distance: larger when nodes are bigger (near center),
    // also scales with number of siblings
    const baseOffset = conformal * 0.12 + 0.04;

    // Angular spread between siblings - wider when near center
    const spreadAngle = Math.max(0.25, conformal * 0.5);

    // Direction perpendicular to radial (tangential)
    // If parent is near origin, use a default direction
    const perpAngle = parentR > 0.01 ? parentAngle + Math.PI / 2 : 0;

    const count = sibIds.length;

    for (let i = 0; i < count; i++) {
      const sibId = sibIds[i];

      // Fan out siblings in a perpendicular arc
      const angleOffset = (i - (count - 1) / 2) * spreadAngle;
      const placementAngle = perpAngle + angleOffset;

      // Distance increases slightly for each additional sibling to avoid crowding
      const dist = baseOffset + (Math.abs(i - (count - 1) / 2)) * baseOffset * 0.4;

      let sx = px + dist * Math.cos(placementAngle);
      let sy = py + dist * Math.sin(placementAngle);

      // Push away from any nearby occupied positions
      for (let iter = 0; iter < 3; iter++) {
        for (const occ of occupied) {
          const dx = sx - occ[0];
          const dy = sy - occ[1];
          const d = Math.sqrt(dx * dx + dy * dy);
          const minDist = conformal * 0.06 + 0.02;
          if (d < minDist && d > 0.001) {
            const push = (minDist - d) / d;
            sx += dx * push;
            sy += dy * push;
          }
        }
      }

      // Clamp inside disk
      const r = Math.sqrt(sx * sx + sy * sy);
      if (r > 0.97) {
        sx = sx * 0.97 / r;
        sy = sy * 0.97 / r;
      }

      positions.set(sibId, [sx, sy]);
      occupied.push([sx, sy]); // register for collision with subsequent siblings
    }
  }
}
