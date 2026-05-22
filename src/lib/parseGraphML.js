export function parseGraphML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GraphML parse error');

  // Match by local name regardless of namespace prefix — some generators emit
  // `<graphml xmlns=...>` (default namespace) and others emit `<ns0:graphml ...>`
  // (prefixed). getElementsByTagName only matches literal tagName, which fails
  // for the prefixed form; getElementsByTagNameNS('*', ...) handles both.
  const byLocalName = (root, name) => root.getElementsByTagNameNS('*', name);

  const keyMap = {};
  for (const k of byLocalName(doc, 'key')) {
    keyMap[k.getAttribute('id')] = k.getAttribute('attr.name');
  }

  function getAttrs(el) {
    const attrs = {};
    for (const child of el.childNodes) {
      if (!child.tagName) continue;
      const tag = child.localName || child.tagName.replace(/^.*:/, '');
      if (tag !== 'data') continue;
      const name = keyMap[child.getAttribute('key')];
      if (name) attrs[name] = child.textContent.trim();
    }
    return attrs;
  }

  const nodes = [];
  const edges = [];

  const graphEl = byLocalName(doc, 'graph')[0];
  if (!graphEl) return { nodes, edges };

  for (const el of graphEl.childNodes) {
    if (!el.tagName) continue;
    const tag = el.localName || el.tagName.replace(/^.*:/, '');
    if (tag === 'node') {
      nodes.push({ data: { id: el.getAttribute('id'), ...getAttrs(el) } });
    } else if (tag === 'edge') {
      edges.push({
        data: {
          id: el.getAttribute('id'),
          source: el.getAttribute('source'),
          target: el.getAttribute('target'),
          ...getAttrs(el),
        },
      });
    }
  }

  return { nodes, edges };
}

export function buildIndices(nodes, edges) {
  const nodeIndex = {};
  for (const n of nodes) nodeIndex[n.data.id] = n.data;

  const edgesBySource = {};
  const edgesByTarget = {};
  for (const e of edges) {
    (edgesBySource[e.data.source] ||= []).push(e.data);
    (edgesByTarget[e.data.target] ||= []).push(e.data);
  }
  return { nodeIndex, edgesBySource, edgesByTarget };
}

// Walk upstream from an end-tier item; collect all reachable nodes and edges.
export function collectSubtree(itemId, edgesBySource, edgesByTarget) {
  const visited = new Set();
  const queue = [itemId];
  const nodeIds = new Set();
  const edgeIds = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    nodeIds.add(id);

    const inEdges = edgesByTarget[id] || [];
    for (const e of inEdges) {
      edgeIds.add(e.id);
      if (!visited.has(e.source)) queue.push(e.source);
    }
  }

  // Include edges among already-collected nodes (covers output edges too).
  for (const nid of nodeIds) {
    for (const e of edgesBySource[nid] || []) {
      if (nodeIds.has(e.target)) edgeIds.add(e.id);
    }
  }

  return { nodeIds, edgeIds };
}
