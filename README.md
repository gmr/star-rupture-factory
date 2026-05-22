# The Ultimate Star-Rupture Factory

Interactive production-graph explorer for the game **Star Rupture**. Given the
game's items and building recipes, the project computes a full factory layout
(building instance counts, storage-depot chains, fan-in/fan-out routing) and
renders it as an interactive graph you can pan, zoom, and walk upstream from any
end-tier product.

Data shamelessly sourced from <https://www.starrupture-planner.com/>.

## Stack

- **`bin/build_graph.py`** — Python 3.12 script (no third-party deps; uses the
  `uv` shebang) that reads `data/*.json` and produces a GraphML file describing
  every building instance, storage depot, and edge in the optimized factory.
- **Vite + React** — interactive viewer that loads the GraphML and renders it
  with [Cytoscape.js](https://js.cytoscape.org/), plus the `dagre` and
  `cose-bilkent` layout extensions.
- **GitHub Actions + Pages** — pushes to `main` are built and published to
  `https://gmr.github.io/star-rupture-factory/`.

## Quick start

```bash
# 1. Generate the graph from the JSON catalog
bin/build_graph.py
# → public/production_graph.graphml

# 2. Install JS deps + start the dev server
npm install
npm run dev
# → http://localhost:5173/
```

The dev server auto-loads `public/production_graph.graphml` on page load. Drop
a different `.graphml` file onto the canvas to swap data sources without
touching disk.

## Layout

```
bin/build_graph.py            # Python: data/*.json → GraphML
data/                         # source of truth: items + buildings + recipes
  buildings_and_recipes.json
  items_catalog.json
public/
  production_graph.graphml    # generated; not checked in
src/
  main.jsx
  App.jsx                     # owns the cytoscape instance + UI state
  components/                 # Header, Sidebar, StatsBar, Legend, …
  lib/
    parseGraphML.js           # DOM-based parser, namespace-prefix tolerant
    cytoscapeStyle.js         # node + edge style arrays
    cytoscapeSetup.js         # cytoscape.use(dagre, coseBilkent) + layouts
  styles/app.css
.github/workflows/pages.yml   # CI: build_graph → vite build → deploy
```

## How the graph is built

`bin/build_graph.py` walks the recipes in roughly this order:

1. **Recipe selection** — for every producible item, pick the recipe with the
   highest output rate (minimizes upstream instance counts).
2. **End-tier detection** — items that are produced but never consumed
   anywhere. Each gets exactly one building instance.
3. **Demand propagation** — seed demand at end-tier items (one instance worth
   of output), topologically sort items end-tier-first, walk backwards summing
   `input.amount_per_minute * (consumer_demand / consumer_output_rate)` onto
   each input's demand.
4. **Building instances** — `ceil(demand / output_rate)` per item.
5. **Physical routing** — for every (consumer, input) pair, pick producer
   instances by fan-out (one producer feeds many consumers) or fan-in
   (multiple producers feed one consumer), with consecutive-group round-robin
   assignment.
6. **Storage depot chains** — each Storage Depot v.1 holds 400 units of one
   item. The script inserts `ceil(flow_rate / 400)` depots in series on every
   inter-building edge.
7. **Entry nodes** — each end-tier item gets a lightweight `item_*` node with
   an `output` edge from its single producer, used as the sidebar's entry
   points.

Re-run the script after editing `data/*.json`; the React app picks up the new
GraphML on next page load.

## UI

- **Sidebar** lists distinct end-tier products. Click one to load the full
  upstream production chain into the canvas.
- **Layout dropdown** swaps between Dagre (default, hierarchical),
  Breadth-First, CoSE-Bilkent, CoSE, and Grid. Switching layouts re-runs
  immediately.
- **Search** dims unmatched nodes by label.
- **Hover** a node and the sidebar shows its inputs/outputs with per-minute
  flow rates; click a connection to jump to that node.
- Loading a layout for newly-added nodes goes through a measure-then-run
  sequence (`cy.resize()` + `cy.style().update()`) so Dagre sees real node
  sizes on the first click rather than collapsing everything to (0,0).

## Deploying

The Pages workflow runs on push to `main` and on manual dispatch. It:

1. Installs `uv` and runs `bin/build_graph.py` to regenerate the GraphML.
2. Installs npm deps (cached) and runs `npm run build` with
   `BASE_PATH=/<repo-name>/` so asset paths resolve under the Pages subpath.
3. Uploads `dist/` and deploys.

On a first deploy, set **Settings → Pages → Source → GitHub Actions**.

## Useful commands

```bash
bin/build_graph.py                                  # regen GraphML
bin/build_graph.py --out custom.graphml             # write elsewhere
npm run dev                                         # local dev server
npm run build                                       # production build
BASE_PATH=/star-rupture-factory/ npm run build      # simulate CI build locally
npm run preview                                     # serve the built dist/
```
