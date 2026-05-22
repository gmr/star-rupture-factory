# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bin/build_graph.py                              # regenerate public/production_graph.graphml from data/
npm run dev                                     # Vite dev server at http://localhost:5173/
npm run build                                   # production build → dist/
BASE_PATH=/star-rupture-factory/ npm run build  # simulate the CI/Pages build locally
npm run preview                                 # serve the built dist/
```

There is no test runner and no linter configured. CI runs only `bin/build_graph.py` + `npm run build`.

## Architecture

Two halves connected by a single artifact: **`public/production_graph.graphml`**.

- **`bin/build_graph.py`** (Python 3.12, uv shebang, stdlib only) — turns `data/*.json` into the GraphML. `data/` is the source of truth; `public/production_graph.graphml` is generated and `.gitignored`. The algorithm (recipe selection → end-tier detection → demand propagation → instance counts → fan-out/fan-in routing → depot chains) is summarized in the README.
- **Vite + React + Cytoscape.js viewer** — loads the GraphML and renders it with the `dagre` and `cose-bilkent` layout plugins. `App.jsx` owns the cytoscape instance through a `useRef` (cy is imperative, not React state). Components are dumb panes that take callbacks.

The GraphML schema is the contract between the two halves: `bin/build_graph.py:KEYS` declares attributes; `src/lib/cytoscapeStyle.js` reads them in style selectors like `node[node_type="building"]`. Adding a new attribute requires touching both.

### Things that have bitten us (in order of debug pain)

1. **Cytoscape inside React.** The div passed to `cytoscape({ container })` must remain empty from React's perspective — Cytoscape mounts canvas elements as direct DOM children, and any React-managed sibling rendered as a *child* of that div will crash with `removeChild ... not a child of this node`. The pattern in `GraphCanvas.jsx` is: a wrapper `#cy` div, inside it an empty `.cy-container` (ref'd for cytoscape) plus overlays (loading, drop zone, hint) as **siblings** of the container, not children. Don't undo this.

2. **Layout-on-add timing.** When new nodes are added via `cy.add()` and dagre is run immediately, dagre sees zero-sized nodes (style with `width: 'label'` requires a rendered frame to measure text) and stacks them all at (0,0). The fix in `runLayout` is two `requestAnimationFrame`s for paint, then `cy.resize() + cy.style().update()` to force measurement, *then* `layout.run()`. The diagnostic fingerprint of this bug is: "switching layouts works on the second try."

3. **GraphML namespace prefixes.** Different generators emit either `<graphml xmlns=...>` (default namespace, `tagName === 'node'`) or `<ns0:graphml xmlns:ns0=...>` (prefixed, `tagName === 'ns0:node'`). `src/lib/parseGraphML.js` uses `getElementsByTagNameNS('*', name)` and `el.localName` so both forms work — don't replace these with plain `getElementsByTagName`.

4. **Schema drift.** The data model changes between generator versions. The current GraphML has only `building` and `storage_depot` node types — items are not separate nodes, item info is duplicated onto each building. End-tier products are derived from buildings flagged `is_end_tier=true` (the flag lives on the building, not the item). When the sidebar list goes empty, suspect a schema change and check `node_type` and where `is_end_tier=true` actually sits.

5. **Vite base path.** For GitHub Pages, the build needs `BASE_PATH=/<repo>/` so assets resolve correctly under the subpath. `vite.config.js` reads it; `App.jsx` uses `import.meta.env.BASE_URL` to prefix the GraphML fetch URL. Hardcoding `/production_graph.graphml` will 404 on Pages.

6. **StrictMode double-mount.** Cytoscape init is in an effect that gets mounted-then-unmounted in dev. Layout callbacks must check `cyRef.current !== cy || cy.destroyed()` before touching cy, and the cleanup must `stop()` any in-flight layout before `destroy()`.

### When changing the graph model

If `data/*.json` schema or the graph-building algorithm changes:

1. Edit `bin/build_graph.py` (`build()` for logic, `KEYS` for attributes).
2. Re-run `bin/build_graph.py` and verify the summary counts look right.
3. If you added attributes you want to show, extend `src/lib/cytoscapeStyle.js` selectors and/or `Sidebar.jsx:NodeDetail` rows.
4. If you changed `node_type` values or how end-tier is identified, update `App.jsx:endTierItems` (currently builds the sidebar list from buildings with `is_end_tier === 'true'`).

The Python script has no test suite; the cheapest validation is to run it and eyeball the summary it prints, then reload the dev server and click an end-tier item.
