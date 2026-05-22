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
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 400,
        nodeRepulsion: 48000,
        edgeElasticity: 0.6,
        gravity: 0.075,
        gravityRange: 9,
        numIter: 7000,
        tile: true,
        tilingPaddingVertical: 60,
        tilingPaddingHorizontal: 60,
      };
    case 'cose':
      return {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 400,
        // cose's repulsion is on a much larger numeric scale than cose-bilkent's;
        // bumped roughly proportionally for the same "loose" feel.
        nodeRepulsion: 1600000,
        edgeElasticity: 100,
        gravity: 0.25,
        numIter: 2000,
        nestingFactor: 1.2,
        componentSpacing: 100,
      };
    case 'grid':
      return {
        name: 'grid',
        animate: false,
        avoidOverlap: true,
        padding: 40,
        spacingFactor: 2,
        nodeDimensionsIncludeLabels: true,
      };
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
