import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import coseBilkent from 'cytoscape-cose-bilkent';

let registered = false;

export function registerPlugins() {
  if (registered) return;
  cytoscape.use(dagre);
  cytoscape.use(coseBilkent);
  registered = true;
}

export const LAYOUT_OPTIONS = [
  { value: 'dagre', label: 'Dagre' },
  { value: 'breadthfirst', label: 'Breadth-First' },
  { value: 'cose-bilkent', label: 'CoSE-Bilkent' },
  { value: 'cose', label: 'CoSE' },
  { value: 'grid', label: 'Grid' },
];

export function getLayoutConfig(name) {
  switch (name) {
    case 'dagre':
      return {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 60,     // spacing between sibling nodes in the same rank
        rankSep: 220,    // spacing between successive ranks (stages)
        edgeSep: 20,     // spacing between parallel edges
        ranker: 'network-simplex',
        animate: false,
      };
    case 'cose-bilkent':
      return {
        name: 'cose-bilkent',
        animate: false,
        idealEdgeLength: 100,
        nodeRepulsion: 8000,
        gravity: 0.4,
        numIter: 2500,
      };
    case 'cose':
      return {
        name: 'cose',
        animate: false,
        idealEdgeLength: 80,
        nodeRepulsion: 400000,
        gravity: 1,
        numIter: 1000,
      };
    case 'grid':
      return { name: 'grid', animate: false, avoidOverlap: true, padding: 20 };
    case 'breadthfirst':
    default:
      return {
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.4,
        animate: false,
        padding: 30,
        avoidOverlap: true,
      };
  }
}
