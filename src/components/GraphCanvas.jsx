import { forwardRef } from 'react';

// IMPORTANT: the div bound to `ref` is the Cytoscape container. It must remain
// empty as far as React is concerned — Cytoscape mounts canvas elements into it
// directly, and any React-managed children inside this div will trigger
// "removeChild ... not a child of this node" errors on unmount. Overlays
// (loading, drop zone, hint) MUST be siblings, not children, of this div.
const GraphCanvas = forwardRef(function GraphCanvas(
  { dropActive, children, onDragOver, onDragLeave, onDrop },
  ref,
) {
  return (
    <div id="cy" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="cy-container" ref={ref} />
      {children}
      <div className={`drop-zone ${dropActive ? 'active' : ''}`}>
        <div className="drop-title">DROP GRAPHML FILE</div>
        <div className="drop-sub">production_graph.graphml</div>
      </div>
    </div>
  );
});

export default GraphCanvas;
