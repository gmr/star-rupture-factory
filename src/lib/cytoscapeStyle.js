// Cytoscape can't read CSS custom properties on its canvas, so we resolve the
// theme tokens from :root once and bake them into the stylesheet. Call
// `buildStyles()` again (and `cy.style().fromJson(...).update()`) after a
// theme change to re-apply.

function readVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function readThemeTokens() {
  return {
    bg: readVar('--bg', '#080c12'),
    panel: readVar('--panel', '#0d1520'),
    border: readVar('--border', '#1a2d44'),
    accent: readVar('--accent', '#00d4ff'),
    accent2: readVar('--accent2', '#ff6b35'),
    accent3: readVar('--accent3', '#39ff14'),
    text: readVar('--text', '#c8daea'),
    textDim: readVar('--text-dim', '#4a6a88'),
    // Graph-specific tokens so the per-type item / building palettes can swing
    // between dark and light without losing identity.
    itemRawBg: readVar('--node-raw-bg', '#0d2e1a'),
    itemRawBorder: readVar('--node-raw-border', '#39ff14'),
    itemProcessedBg: readVar('--node-processed-bg', '#2e2200'),
    itemProcessedBorder: readVar('--node-processed-border', '#ffcc44'),
    itemComponentBg: readVar('--node-component-bg', '#0a1e33'),
    itemComponentBorder: readVar('--node-component-border', '#00d4ff'),
    itemMaterialBg: readVar('--node-material-bg', '#1e0a33'),
    itemMaterialBorder: readVar('--node-material-border', '#aa88ff'),
    itemAmmoBg: readVar('--node-ammo-bg', '#2e0a0a'),
    itemAmmoBorder: readVar('--node-ammo-border', '#ff6b35'),
    buildingBg: readVar('--node-building-bg', '#0a1e0a'),
    buildingBorder: readVar('--node-building-border', '#44aa44'),
    depotBg: readVar('--node-depot-bg', '#1e1400'),
    depotBorder: readVar('--node-depot-border', '#cc8833'),
    edgeBase: readVar('--edge-base', '#4a6a88'),
    edgeOutput: readVar('--edge-output', '#3a8a3a'),
    edgeOutputArrow: readVar('--edge-output-arrow', '#44aa44'),
    edgeInput: readVar('--edge-input', '#3a8db0'),
    edgeInputArrow: readVar('--edge-input-arrow', '#00d4ff'),
    edgeBuffer: readVar('--edge-buffer', '#a67328'),
    edgeBufferArrow: readVar('--edge-buffer-arrow', '#cc8833'),
  };
}

export function buildStyles(t = readThemeTokens()) {
  const NODE_STYLES = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-family': 'Exo 2, sans-serif',
        'font-size': '9px',
        color: t.text,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        // Fixed dimensions — width: 'label' / height: 'label' are deprecated in
        // cytoscape 3.33 and the fallback bounding box was zero-sized, so taps
        // on visible nodes resolved to background.
        width: 110,
        height: 38,
        'border-width': 1,
      },
    },
    {
      selector: 'node[node_type="item"][item_type="raw"]',
      style: { 'background-color': t.itemRawBg, 'border-color': t.itemRawBorder, 'border-width': 1.5 },
    },
    {
      selector: 'node[node_type="item"][item_type="processed"]',
      style: { 'background-color': t.itemProcessedBg, 'border-color': t.itemProcessedBorder, 'border-width': 1.5 },
    },
    {
      selector: 'node[node_type="item"][item_type="component"]',
      style: { 'background-color': t.itemComponentBg, 'border-color': t.itemComponentBorder, 'border-width': 1.5 },
    },
    {
      selector: 'node[node_type="item"][item_type="material"]',
      style: { 'background-color': t.itemMaterialBg, 'border-color': t.itemMaterialBorder, 'border-width': 1.5 },
    },
    {
      selector: 'node[node_type="item"][item_type="ammo"]',
      style: { 'background-color': t.itemAmmoBg, 'border-color': t.itemAmmoBorder, 'border-width': 1.5 },
    },
    {
      selector: 'node[node_type="item"][is_end_tier="true"]',
      style: { 'border-width': 3, 'border-color': t.accent2, 'font-weight': 700 },
    },
    {
      selector: 'node[node_type="building"]',
      style: {
        'background-color': t.buildingBg,
        'border-color': t.buildingBorder,
        shape: 'round-rectangle',
        'font-family': 'Share Tech Mono, monospace',
        'font-size': '8px',
      },
    },
    {
      selector: 'node[node_type="storage_depot"]',
      style: {
        'background-color': t.depotBg,
        'border-color': t.depotBorder,
        shape: 'rectangle',
        'font-size': '8px',
        'font-family': 'Share Tech Mono, monospace',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': t.accent,
        'overlay-color': t.accent,
        'overlay-padding': 4,
        'overlay-opacity': 0.1,
      },
    },
    // Highlight classes applied by tap handlers in App.jsx.
    {
      selector: '.faded',
      style: { opacity: 0.12, 'text-opacity': 0.12 },
    },
    {
      selector: '.search-miss',
      style: { opacity: 0.15, 'text-opacity': 0.15 },
    },
    {
      selector: 'node.hl',
      style: {
        'border-width': 4,
        'border-color': t.accent,
        'background-blacken': -0.2,
        opacity: 1,
        'text-opacity': 1,
        'z-index': 999,
      },
    },
  ];

  const EDGE_STYLES = [
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': t.edgeBase,
        'target-arrow-color': t.edgeBase,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(rate_per_min)',
        'font-size': '7px',
        color: t.edgeBase,
        'text-background-color': t.bg,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'font-family': 'Share Tech Mono, monospace',
      },
    },
    {
      selector: 'edge[edge_type="output"]',
      style: { 'line-color': t.edgeOutput, 'target-arrow-color': t.edgeOutputArrow },
    },
    {
      selector: 'edge[edge_type="input"]',
      style: { 'line-color': t.edgeInput, 'target-arrow-color': t.edgeInputArrow },
    },
    {
      selector: 'edge[edge_type="buffer"]',
      style: {
        'line-color': t.edgeBuffer,
        'target-arrow-color': t.edgeBufferArrow,
        'line-style': 'dashed',
        'line-dash-pattern': [4, 3],
      },
    },
    {
      selector: 'edge.hl',
      style: {
        'line-color': t.accent,
        'target-arrow-color': t.accent,
        width: 3,
        opacity: 1,
        'text-opacity': 1,
        'z-index': 999,
      },
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': t.accent,
        'target-arrow-color': t.accent,
        width: 2.5,
      },
    },
  ];

  return [...NODE_STYLES, ...EDGE_STYLES];
}

// Legacy export — read at module load. App.jsx uses buildStyles() per-theme
// instead, but the cytoscape() init still needs an initial value.
export const ALL_STYLES = buildStyles();
