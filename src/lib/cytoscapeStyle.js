export const NODE_STYLES = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-family': 'Exo 2, sans-serif',
      'font-size': '9px',
      color: '#c8daea',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '90px',
      width: 'label',
      height: 'label',
      padding: '6px',
      'border-width': 1,
    },
  },
  {
    selector: 'node[node_type="item"][item_type="raw"]',
    style: { 'background-color': '#0d2e1a', 'border-color': '#39ff14', 'border-width': 1.5 },
  },
  {
    selector: 'node[node_type="item"][item_type="processed"]',
    style: { 'background-color': '#2e2200', 'border-color': '#ffcc44', 'border-width': 1.5 },
  },
  {
    selector: 'node[node_type="item"][item_type="component"]',
    style: { 'background-color': '#0a1e33', 'border-color': '#00d4ff', 'border-width': 1.5 },
  },
  {
    selector: 'node[node_type="item"][item_type="material"]',
    style: { 'background-color': '#1e0a33', 'border-color': '#aa88ff', 'border-width': 1.5 },
  },
  {
    selector: 'node[node_type="item"][item_type="ammo"]',
    style: { 'background-color': '#2e0a0a', 'border-color': '#ff6b35', 'border-width': 1.5 },
  },
  {
    selector: 'node[node_type="item"][is_end_tier="true"]',
    style: { 'border-width': 3, 'border-color': '#ff6b35', 'font-weight': 700 },
  },
  {
    selector: 'node[node_type="building"]',
    style: {
      'background-color': '#0a1e0a',
      'border-color': '#44aa44',
      shape: 'round-rectangle',
      'font-family': 'Share Tech Mono, monospace',
      'font-size': '8px',
    },
  },
  {
    selector: 'node[node_type="storage_depot"]',
    style: {
      'background-color': '#1e1400',
      'border-color': '#cc8833',
      shape: 'rectangle',
      'font-size': '8px',
      'font-family': 'Share Tech Mono, monospace',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#00d4ff',
      'overlay-color': '#00d4ff',
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
      'border-color': '#00d4ff',
      'background-blacken': -0.2,
      opacity: 1,
      'text-opacity': 1,
      'z-index': 999,
    },
  },
];

export const EDGE_STYLES = [
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#1a2d44',
      'target-arrow-color': '#1a2d44',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(rate_per_min)',
      'font-size': '7px',
      color: '#4a6a88',
      'text-background-color': '#080c12',
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'font-family': 'Share Tech Mono, monospace',
    },
  },
  {
    selector: 'edge[edge_type="output"]',
    style: { 'line-color': '#1a4a1a', 'target-arrow-color': '#44aa44' },
  },
  {
    selector: 'edge[edge_type="input"]',
    style: { 'line-color': '#1a2d44', 'target-arrow-color': '#00d4ff' },
  },
  {
    selector: 'edge[edge_type="buffer"]',
    style: {
      'line-color': '#3a2a0a',
      'target-arrow-color': '#cc8833',
      'line-style': 'dashed',
      'line-dash-pattern': [4, 3],
    },
  },
  {
    selector: 'edge.hl',
    style: {
      'line-color': '#00d4ff',
      'target-arrow-color': '#00d4ff',
      width: 3,
      opacity: 1,
      'text-opacity': 1,
      'z-index': 999,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#00d4ff',
      'target-arrow-color': '#00d4ff',
      width: 2.5,
    },
  },
];

export const ALL_STYLES = [...NODE_STYLES, ...EDGE_STYLES];
