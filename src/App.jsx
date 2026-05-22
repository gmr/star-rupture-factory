import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatsBar from './components/StatsBar.jsx';
import Legend from './components/Legend.jsx';
import LoadingOverlay from './components/LoadingOverlay.jsx';
import GraphCanvas from './components/GraphCanvas.jsx';
import HelpDialog from './components/HelpDialog.jsx';

import { parseGraphML, buildIndices, collectSubtree } from './lib/parseGraphML.js';
import { ALL_STYLES } from './lib/cytoscapeStyle.js';
import {
  registerPlugins,
  getLayoutConfig,
} from './lib/cytoscapeSetup.js';

registerPlugins();

// Resolves to `/production_graph.graphml` in dev and `/<repo>/production_graph.graphml`
// in production (Vite injects BASE_URL from vite.config.js `base`).
const DEFAULT_GRAPHML_URL = `${import.meta.env.BASE_URL}production_graph.graphml`;

export default function App() {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const runningLayoutRef = useRef(null);

  // Graph data
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [indices, setIndices] = useState({ nodeIndex: {}, edgesBySource: {}, edgesByTarget: {} });
  const [loadedItems, setLoadedItems] = useState(new Set());

  // UI state
  const [selectedNode, setSelectedNode] = useState(null);
  const [layoutName, setLayoutName] = useState('dagre');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState({ visible: true, msg: 'INITIALIZING', percent: 0 });
  const [statusState, setStatusState] = useState('loading'); // '', 'ready', 'loading'
  const [stats, setStats] = useState({ visibleNodes: 0, visibleEdges: 0, total: '' });
  const [dropActive, setDropActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const graphLoaded = allNodes.length > 0;

  // End-tier products = distinct items output by buildings flagged is_end_tier=true.
  // The regenerated GraphML no longer has separate item nodes; item info lives on
  // the building nodes themselves.
  const endTierItems = useMemo(() => {
    const seen = new Map(); // item_id → item_name
    for (const n of allNodes) {
      if (
        n.data.node_type === 'building' &&
        n.data.is_end_tier === 'true' &&
        n.data.item_id &&
        !seen.has(n.data.item_id)
      ) {
        seen.set(n.data.item_id, n.data.item_name || n.data.item_id);
      }
    }
    return [...seen.entries()]
      .map(([id, item_name]) => ({ data: { id, item_id: id, item_name } }))
      .sort((a, b) => a.data.item_name.localeCompare(b.data.item_name));
  }, [allNodes]);

  // Index buildings by the item they produce — expansion walks upstream from
  // every building instance producing the selected item.
  const buildingsByItemId = useMemo(() => {
    const m = new Map();
    for (const n of allNodes) {
      if (n.data.node_type !== 'building' || !n.data.item_id) continue;
      const list = m.get(n.data.item_id) || [];
      list.push(n.data.id);
      m.set(n.data.item_id, list);
    }
    return m;
  }, [allNodes]);

  const updateStats = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    setStats((s) => ({
      ...s,
      visibleNodes: cy.nodes().length,
      visibleEdges: cy.edges().length,
    }));
  }, []);

  const runLayout = useCallback((name) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || cy.nodes().length === 0) return;

    if (runningLayoutRef.current) {
      try { runningLayoutRef.current.stop(); } catch (_) {}
      runningLayoutRef.current = null;
    }

    const config = getLayoutConfig(name);
    const nodeCount = cy.nodes().length.toLocaleString();

    setLoading({
      visible: true,
      msg: `COMPUTING ${name.toUpperCase()} LAYOUT — ${nodeCount} NODES`,
      percent: 50,
    });
    setStatusState('loading');

    const layout = cy.layout(config);
    layout.on('layoutstop', () => {
      // Guard against the instance being torn down mid-layout (StrictMode
      // double-mount, navigation away, etc.).
      if (cyRef.current !== cy || cy.destroyed()) return;
      cy.fit(undefined, 40);
      runningLayoutRef.current = null;
      setLoading({ visible: false, msg: 'READY', percent: 100 });
      setStatusState('ready');
    });
    runningLayoutRef.current = layout;

    // Two RAFs so the overlay paints, then force cytoscape to measure newly-added
    // nodes before running the layout. Without this, dagre sees zero-sized nodes
    // on the first expansion and stacks them at (0,0); switching layouts later
    // works only because by then rendering has happened and sizes are real.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cyRef.current !== cy || cy.destroyed()) return;
        cy.resize();
        cy.style().update();
        layout.run();
      }),
    );
  }, []);

  // Init Cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: ALL_STYLES,
      layout: { name: 'preset' },
      minZoom: 0.05,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });
    cyRef.current = cy;

    const focusOn = (eles) => {
      cy.batch(() => {
        cy.elements().removeClass('hl').addClass('faded');
        eles.removeClass('faded').addClass('hl');
      });
    };
    const clearFocus = () => {
      cy.batch(() => cy.elements().removeClass('faded').removeClass('hl'));
    };

    const onNodeTap = (evt) => {
      const node = evt.target;
      setSelectedNode(node.data());
      focusOn(node.closedNeighborhood());
    };
    const onEdgeTap = (evt) => {
      const edge = evt.target;
      focusOn(edge.union(edge.connectedNodes()));
    };
    const onBackgroundTap = (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        clearFocus();
      }
    };

    cy.on('tap', 'node', onNodeTap);
    cy.on('tap', 'edge', onEdgeTap);
    cy.on('tap', onBackgroundTap);
    cy.on('unselect', () => {
      setSelectedNode(null);
      updateStats();
    });

    return () => {
      // Stop any in-flight layout so its callbacks don't fire after destroy.
      if (runningLayoutRef.current) {
        try { runningLayoutRef.current.stop(); } catch (_) {}
        runningLayoutRef.current = null;
      }
      if (cyRef.current === cy) cyRef.current = null;
      cy.destroy();
    };
  }, [updateStats]);

  const loadGraphML = useCallback(
    async (xmlText) => {
      setStatusState('loading');
      setLoading({ visible: true, msg: 'PARSING GRAPHML…', percent: 10 });
      await new Promise((r) => setTimeout(r, 10));

      const { nodes, edges } = parseGraphML(xmlText);

      setLoading({ visible: true, msg: 'INDEXING NODES…', percent: 40 });
      await new Promise((r) => setTimeout(r, 10));

      const idx = buildIndices(nodes, edges);

      setAllNodes(nodes);
      setAllEdges(edges);
      setIndices(idx);
      setLoadedItems(new Set());
      setSelectedNode(null);

      setStats((s) => ({
        ...s,
        total: `${nodes.length.toLocaleString()} nodes / ${edges.length.toLocaleString()} edges`,
      }));

      setLoading({ visible: true, msg: 'READY', percent: 100 });
      await new Promise((r) => setTimeout(r, 60));
      setLoading((l) => ({ ...l, visible: false }));
      setStatusState('ready');
    },
    [],
  );

  // Auto-load on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(DEFAULT_GRAPHML_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        await loadGraphML(text);
      } catch (err) {
        console.warn(`Auto-load of ${DEFAULT_GRAPHML_URL} failed:`, err);
        setLoading({ visible: true, msg: 'DROP A GRAPHML FILE ON THE CANVAS', percent: 100 });
        setStatusState('');
        setTimeout(() => setLoading((l) => ({ ...l, visible: false })), 800);
      }
    })();
  }, [loadGraphML]);

  // Expand the production chain for an end-tier item: walk upstream from
  // every building that produces it and union the results.
  const onExpand = useCallback(
    (itemId) => {
      if (loadedItems.has(itemId)) return;
      const cy = cyRef.current;
      if (!cy) return;

      const buildingIds = buildingsByItemId.get(itemId) || [];
      if (buildingIds.length === 0) return;

      const nodeIds = new Set();
      const edgeIds = new Set();
      for (const bid of buildingIds) {
        const sub = collectSubtree(bid, indices.edgesBySource, indices.edgesByTarget);
        for (const id of sub.nodeIds) nodeIds.add(id);
        for (const id of sub.edgeIds) edgeIds.add(id);
      }

      const existingNodeIds = new Set(cy.nodes().map((n) => n.id()));
      const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));

      const newNodes = allNodes.filter(
        (n) => nodeIds.has(n.data.id) && !existingNodeIds.has(n.data.id),
      );
      const newEdges = allEdges.filter(
        (e) => edgeIds.has(e.data.id) && !existingEdgeIds.has(e.data.id),
      );

      cy.batch(() => {
        cy.add(newNodes);
        cy.add(newEdges);
      });

      setLoadedItems((prev) => new Set(prev).add(itemId));
      runLayout(layoutName);
      updateStats();
    },
    [allNodes, allEdges, buildingsByItemId, indices, layoutName, loadedItems, runLayout, updateStats],
  );

  const onJumpTo = useCallback((nodeId) => {
    const cy = cyRef.current;
    if (!cy) return;
    const el = cy.$(`#${CSS.escape(nodeId)}`);
    if (el.empty()) return;
    el.select();
    cy.center(el);
    // Match the tap-highlight behaviour: focus the node + its 1-hop neighborhood.
    cy.batch(() => {
      cy.elements().removeClass('hl').addClass('faded');
      el.closedNeighborhood().removeClass('faded').addClass('hl');
    });
  }, []);

  // Search dims unmatched nodes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      cy.nodes().forEach((n) => n.style('opacity', 1));
      return;
    }
    cy.nodes().forEach((n) => {
      const label = (n.data('label') || '').toLowerCase();
      n.style('opacity', label.includes(q) ? 1 : 0.15);
    });
  }, [searchQuery]);

  const onLayoutChange = useCallback(
    (name) => {
      setLayoutName(name);
      runLayout(name);
    },
    [runLayout],
  );

  const onReset = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    setLoadedItems(new Set());
    setSelectedNode(null);
    updateStats();
  }, [updateStats]);

  // Drag & drop file load. Only activate the drop overlay when the browser
  // actually has files in the drag — otherwise an arbitrary drag (text
  // selection, link drag, etc.) could leave the overlay stuck above the
  // canvas and eat all clicks.
  const onDragOver = useCallback((e) => {
    const types = e.dataTransfer?.types;
    if (!types || !Array.from(types).includes('Files')) return;
    e.preventDefault();
    setDropActive(true);
  }, []);
  const onDragLeave = useCallback((e) => {
    // Ignore leave events caused by entering child elements.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropActive(false);
  }, []);
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDropActive(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => loadGraphML(ev.target.result);
      reader.readAsText(file);
    },
    [loadGraphML],
  );

  return (
    <>
      <Header
        statusState={statusState}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        layoutName={layoutName}
        onLayoutChange={onLayoutChange}
        onRelayout={() => runLayout(layoutName)}
        onFit={() => cyRef.current?.fit(undefined, 40)}
        onReset={onReset}
        onHelp={() => setHelpOpen(true)}
      />

      <div className="main">
        <GraphCanvas
          ref={containerRef}
          dropActive={dropActive}
          hint={
            graphLoaded && loadedItems.size === 0
              ? 'Click an end-tier item to load its production chain'
              : null
          }
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <LoadingOverlay visible={loading.visible} message={loading.msg} percent={loading.percent} />
        </GraphCanvas>

        <Sidebar
          graphLoaded={graphLoaded}
          selectedNode={selectedNode}
          endTierItems={endTierItems}
          loadedItems={loadedItems}
          nodeIndex={indices.nodeIndex}
          edgesBySource={indices.edgesBySource}
          edgesByTarget={indices.edgesByTarget}
          onExpand={onExpand}
          onJumpTo={onJumpTo}
        />
      </div>

      <Legend />
      <StatsBar visibleNodes={stats.visibleNodes} visibleEdges={stats.visibleEdges} total={stats.total} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
