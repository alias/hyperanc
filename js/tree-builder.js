/**
 * Tree Builder
 * Builds a rooted tree from the GEDCOM graph centered on a given person.
 * Expands ancestors (via FAMC) and descendants (via FAMS).
 * Optionally includes siblings.
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

  // Find siblings: for each node in the tree, find other children
  // in the same FAMC family that are NOT already in the tree
  const siblingNodes = [];
  const siblingEdges = [];
  const siblingIds = new Set();

  if (individuals && families) {
    for (const node of nodes) {
      const indi = node.individual;
      if (!indi.familyAsChild) continue;

      const fam = families.get(indi.familyAsChild);
      if (!fam) continue;

      for (const sibId of fam.childIds) {
        if (sibId === node.id) continue; // skip self

        // Create sibling edge
        if (nodeMap.has(sibId)) {
          // Sibling is already in tree - just add a sibling edge between them
          // But only if we haven't already (avoid duplicates)
          const key = [node.id, sibId].sort().join('-');
          if (!siblingIds.has(key)) {
            siblingIds.add(key);
            siblingEdges.push({
              source: node,
              target: nodeMap.get(sibId),
              type: 'sibling'
            });
          }
        } else {
          // Sibling not in tree - create a sibling node
          const sibIndi = individuals.get(sibId);
          if (!sibIndi) continue;

          // Only add each sibling once
          if (siblingIds.has(sibId)) {
            // Already added as sibling node, just add edge
            const existingSib = siblingNodes.find(n => n.id === sibId);
            if (existingSib) {
              siblingEdges.push({
                source: node,
                target: existingSib,
                type: 'sibling'
              });
            }
            continue;
          }

          siblingIds.add(sibId);

          const sibNode = {
            id: sibId,
            individual: sibIndi,
            children: [],
            direction: 'sibling',
            generation: node.generation,
            ahnentafelNumber: null
          };

          siblingNodes.push(sibNode);
          siblingEdges.push({
            source: node,
            target: sibNode,
            type: 'sibling'
          });
        }
      }
    }
  }

  return { nodes, edges, siblingNodes, siblingEdges };
}
