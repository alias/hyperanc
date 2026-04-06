/**
 * Tree Builder
 * Builds a rooted tree from the GEDCOM graph centered on a given person.
 * Expands ancestors (via FAMC) and descendants (via FAMS).
 * Optionally includes siblings.
 */

export function buildTree(rootId, individuals, families, maxAncestorGen = 20, maxDescendantGen = 10) {
  const visited = new Set();

  function buildAncestors(personId, generation, ahnNum) {
    if (!personId || visited.has(personId) || generation > maxAncestorGen) return null;
    const indi = individuals.get(personId);
    if (!indi) return null;

    visited.add(personId);

    const node = {
      id: personId,
      individual: indi,
      children: [],
      direction: 'ancestor',
      generation: generation,
      ahnentafelNumber: ahnNum
    };

    if (indi.familyAsChild) {
      const fam = families.get(indi.familyAsChild);
      if (fam) {
        const father = buildAncestors(fam.husbandId, generation + 1, ahnNum * 2);
        const mother = buildAncestors(fam.wifeId, generation + 1, ahnNum * 2 + 1);
        if (father) node.children.push(father);
        if (mother) node.children.push(mother);
      }
    }

    return node;
  }

  function buildDescendants(personId, generation) {
    if (!personId || visited.has(personId) || generation > maxDescendantGen) return null;
    const indi = individuals.get(personId);
    if (!indi) return null;

    visited.add(personId);

    const node = {
      id: personId,
      individual: indi,
      children: [],
      direction: 'descendant',
      generation: -generation,
      ahnentafelNumber: null
    };

    for (const famId of indi.familiesAsSpouse) {
      const fam = families.get(famId);
      if (fam) {
        for (const childId of fam.childIds) {
          const child = buildDescendants(childId, generation + 1);
          if (child) node.children.push(child);
        }
      }
    }

    return node;
  }

  const rootNode = buildAncestors(rootId, 0, 1);
  if (!rootNode) return null;

  const ancestorIds = new Set(visited);

  const indi = individuals.get(rootId);
  if (indi) {
    for (const famId of indi.familiesAsSpouse) {
      const fam = families.get(famId);
      if (fam) {
        for (const childId of fam.childIds) {
          if (!ancestorIds.has(childId)) {
            const child = buildDescendants(childId, 1);
            if (child) rootNode.children.push(child);
          }
        }
      }
    }
  }

  return rootNode;
}

/**
 * Flatten the tree into nodes and edges.
 * Also collects sibling relationships.
 */
export function flattenTree(root, individuals, families) {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map(); // id -> node

  function traverse(node, parent) {
    nodes.push(node);
    nodeMap.set(node.id, node);
    if (parent) {
      edges.push({ source: parent, target: node, type: 'tree' });
    }
    for (const child of node.children) {
      traverse(child, node);
    }
  }

  if (root) traverse(root, null);

  // Find siblings and half-siblings
  // Full siblings: share the same FAMC family
  // Half-siblings: share one parent via a different family
  const siblingNodes = [];
  const siblingEdges = [];
  const edgeKeys = new Set();
  const sibNodeIds = new Set();

  if (individuals && families) {
    for (const node of nodes) {
      const indi = node.individual;
      if (!indi.familyAsChild) continue;

      const fam = families.get(indi.familyAsChild);
      if (!fam) continue;

      // --- Full siblings: other children in same FAMC ---
      for (const sibId of fam.childIds) {
        if (sibId === node.id) continue;
        _addSiblingEdge(node, sibId, 'sibling');
      }

      // --- Half-siblings: children of same father or mother in OTHER families ---
      const parentIds = [fam.husbandId, fam.wifeId].filter(Boolean);
      for (const parentId of parentIds) {
        const parent = individuals.get(parentId);
        if (!parent) continue;
        for (const otherFamId of parent.familiesAsSpouse) {
          if (otherFamId === indi.familyAsChild) continue; // skip own family
          const otherFam = families.get(otherFamId);
          if (!otherFam) continue;
          for (const halfSibId of otherFam.childIds) {
            if (halfSibId === node.id) continue;
            _addSiblingEdge(node, halfSibId, 'half-sibling');
          }
        }
      }
    }
  }

  function _addSiblingEdge(treeNode, sibId, type) {
    const key = [treeNode.id, sibId].sort().join('-') + '-' + type;
    // Don't upgrade a full-sibling edge to half-sibling
    const fullKey = [treeNode.id, sibId].sort().join('-') + '-sibling';
    if (edgeKeys.has(fullKey) && type === 'half-sibling') return;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);

    if (nodeMap.has(sibId)) {
      // Sibling already in tree
      siblingEdges.push({
        source: treeNode,
        target: nodeMap.get(sibId),
        type
      });
    } else {
      // Create sibling node if not exists
      const sibIndi = individuals.get(sibId);
      if (!sibIndi) return;

      let sibNode;
      if (sibNodeIds.has(sibId)) {
        sibNode = siblingNodes.find(n => n.id === sibId);
      } else {
        sibNodeIds.add(sibId);
        sibNode = {
          id: sibId,
          individual: sibIndi,
          children: [],
          direction: 'sibling',
          generation: treeNode.generation,
          ahnentafelNumber: null
        };
        siblingNodes.push(sibNode);
      }

      if (sibNode) {
        siblingEdges.push({
          source: treeNode,
          target: sibNode,
          type
        });
      }
    }
  }

  return { nodes, edges, siblingNodes, siblingEdges };
}
