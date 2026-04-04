/**
 * Hyperbolic Layout
 * Assigns Poincaré disk coordinates to tree nodes.
 */

/**
 * Count leaves in a subtree.
 */
function countLeaves(node) {
  if (node.children.length === 0) return 1;
  let count = 0;
  for (const child of node.children) {
    count += countLeaves(child);
  }
  return count;
}

/**
 * Layout the tree in the Poincaré disk.
 * Root is at origin. Each subtree gets an angular wedge proportional to leaf count.
 *
 * @param {object} root - The tree root node
 * @param {number} step - Hyperbolic distance between generations (default 1.0)
 * @returns {Map<string, [number, number]>} Map from node id to disk coordinates
 */
export function layoutTree(root, step = 0.9) {
  const positions = new Map();

  function layout(node, depth, angleStart, angleEnd) {
    // Place this node
    if (depth === 0) {
      positions.set(node.id, [0, 0]);
    } else {
      const angleMid = (angleStart + angleEnd) / 2;
      const r = Math.tanh(depth * step / 2);
      positions.set(node.id, [r * Math.cos(angleMid), r * Math.sin(angleMid)]);
    }

    if (node.children.length === 0) return;

    // Distribute angular wedges proportional to leaf count
    const leafCounts = node.children.map(c => countLeaves(c));
    const totalLeaves = leafCounts.reduce((a, b) => a + b, 0);

    let currentAngle = angleStart;
    for (let i = 0; i < node.children.length; i++) {
      const wedge = (angleEnd - angleStart) * leafCounts[i] / totalLeaves;
      layout(node.children[i], depth + 1, currentAngle, currentAngle + wedge);
      currentAngle += wedge;
    }
  }

  layout(root, 0, 0, 2 * Math.PI);
  return positions;
}
