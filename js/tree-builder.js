/**
 * Tree Builder
 * Builds a rooted tree from the GEDCOM graph centered on a given person.
 * Expands ancestors (via FAMC) and descendants (via FAMS).
 */

export function buildTree(rootId, individuals, families, maxAncestorGen = 20, maxDescendantGen = 5) {
  const visited = new Set();

  function buildAncestors(personId, generation, ahnNum) {
    if (!personId || visited.has(personId) || generation > maxAncestorGen) return null;
    const indi = individuals.get(personId);
    if (!indi) return null;

    visited.add(personId);

    const node = {
      id: personId,
      individual: indi,
      children: [], // ancestors are "children" in the tree layout sense
      direction: 'ancestor',
      generation: generation,
      ahnentafelNumber: ahnNum
    };

    // Find parents via FAMC
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
      generation: -generation, // negative for descendants
      ahnentafelNumber: null
    };

    // Find children via FAMS
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

  // Build ancestor tree first (root = Ahnentafel #1)
  const rootNode = buildAncestors(rootId, 0, 1);
  if (!rootNode) return null;

  // Now build descendants (remove rootId from visited so we start from root)
  // But keep ancestors visited so we don't re-traverse them
  const ancestorIds = new Set(visited);

  // Add descendants of root
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
 * Flatten the tree into an array of nodes and edges.
 */
export function flattenTree(root) {
  const nodes = [];
  const edges = [];

  function traverse(node, parent) {
    nodes.push(node);
    if (parent) {
      edges.push({ source: parent, target: node });
    }
    for (const child of node.children) {
      traverse(child, node);
    }
  }

  if (root) traverse(root, null);
  return { nodes, edges };
}
