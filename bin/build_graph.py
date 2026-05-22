#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Build production_graph.graphml from buildings_and_recipes.json + items_catalog.json.

Reads inputs from ./data/ and writes GraphML to ./public/production_graph.graphml
(so Vite serves it at /production_graph.graphml). Paths are overridable via flags.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

GRAPHML_NS = "http://graphml.graphdrawing.org/graphml"
DEPOT_CAPACITY = 400

# (key_id, attr_name, for_type, attr_type)
KEYS: list[tuple[str, str, str, str]] = [
    ("d_node_type", "node_type", "node", "string"),
    ("d_label", "label", "node", "string"),
    ("d_building_id", "building_id", "node", "string"),
    ("d_building_name", "building_name", "node", "string"),
    ("d_instance_num", "instance_num", "node", "int"),
    ("d_item_id", "item_id", "node", "string"),
    ("d_item_name", "item_name", "node", "string"),
    ("d_item_type", "item_type", "node", "string"),
    ("d_out_rate", "output_rate_per_min", "node", "double"),
    ("d_is_end_tier", "is_end_tier", "node", "boolean"),
    ("d_power", "power", "node", "int"),
    ("d_heat", "heat", "node", "int"),
    ("d_capacity", "capacity_units", "node", "int"),
    ("d_flow_rate", "flow_rate_per_min", "node", "double"),
    ("d_demand_rate", "demand_rate_per_min", "node", "double"),
    ("d_edge_type", "edge_type", "edge", "string"),
    ("d_rate", "rate_per_min", "edge", "double"),
]
KEY_ID = {attr: kid for kid, attr, _, _ in KEYS}


def load(path: Path) -> Any:
    with path.open() as fh:
        return json.load(fh)


def select_recipes(buildings: list[dict]) -> dict[str, tuple[dict, dict]]:
    """For each producible item, pick the recipe with the highest output rate."""
    chosen: dict[str, tuple[dict, dict]] = {}
    for b in buildings:
        for r in b.get("recipes", []) or []:
            iid = r["output"]["id"]
            rate = r["output"]["amount_per_minute"]
            if iid not in chosen or rate > chosen[iid][1]["output"]["amount_per_minute"]:
                chosen[iid] = (b, r)
    return chosen


def topological_order(recipe_for: dict[str, tuple[dict, dict]]) -> list[str]:
    """Post-order DFS so that for each item, all of its inputs appear earlier.
    Reversed at the end so end-tier (consumed by nobody) is first, raw is last.
    """
    deps: dict[str, set[str]] = {iid: set() for iid in recipe_for}
    for iid, (_, r) in recipe_for.items():
        for inp in r.get("inputs", []) or []:
            if inp["id"] in recipe_for:
                deps[iid].add(inp["id"])

    order: list[str] = []
    visited: set[str] = set()

    def visit(iid: str) -> None:
        if iid in visited:
            return
        visited.add(iid)
        for d in deps[iid]:
            visit(d)
        order.append(iid)

    for iid in recipe_for:
        visit(iid)

    order.reverse()
    return order


def propagate_demand(
    recipe_for: dict[str, tuple[dict, dict]],
    end_tier: set[str],
) -> dict[str, float]:
    """Seed end-tier items with one instance's worth of output, then walk
    backwards (end-tier → raw) summing required input rates."""
    demand: dict[str, float] = {iid: 0.0 for iid in recipe_for}
    for iid in end_tier:
        _, r = recipe_for[iid]
        demand[iid] = r["output"]["amount_per_minute"]

    for iid in topological_order(recipe_for):
        d = demand[iid]
        if d <= 0:
            continue
        _, r = recipe_for[iid]
        scale = d / r["output"]["amount_per_minute"]
        for inp in r.get("inputs", []) or []:
            if inp["id"] in demand:
                demand[inp["id"]] += inp["amount_per_minute"] * scale
    return demand


def compute_instances(
    recipe_for: dict[str, tuple[dict, dict]],
    demand: dict[str, float],
) -> dict[str, int]:
    """ceil(demand / output_rate) per item; items with zero demand get zero instances."""
    out: dict[str, int] = {}
    for iid, (_, r) in recipe_for.items():
        d = demand.get(iid, 0.0)
        if d <= 0:
            out[iid] = 0
            continue
        out[iid] = max(1, math.ceil(d / r["output"]["amount_per_minute"]))
    return out


class GraphBuilder:
    """Accumulates nodes and edges with stable IDs, then serializes to GraphML."""

    def __init__(self) -> None:
        self.nodes: list[dict[str, Any]] = []
        self.edges: list[dict[str, Any]] = []
        self._depot_counter = 0

    def add_node(self, node_id: str, attrs: dict[str, Any]) -> None:
        self.nodes.append({"id": node_id, "attrs": attrs})

    def add_edge(self, source: str, target: str, edge_type: str, rate: float) -> None:
        self.edges.append({
            "id": f"e{len(self.edges)}",
            "source": source,
            "target": target,
            "attrs": {"edge_type": edge_type, "rate_per_min": rate},
        })

    def new_depot_id(self) -> str:
        self._depot_counter += 1
        return f"depot_{self._depot_counter}"

    def add_depot_chain(
        self,
        producer_id: str,
        consumer_id: str,
        flow_rate: float,
        item: dict[str, str],
    ) -> None:
        """Insert ceil(flow / capacity) depots in series between producer and consumer.
        Single-depot chains get an unnumbered label (the `#N` would be noise);
        multi-depot chains number their depots 1..n in flow order."""
        n = max(1, math.ceil(flow_rate / DEPOT_CAPACITY))
        chain: list[str] = []
        for i in range(1, n + 1):
            depot_id = self.new_depot_id()
            label = (
                f"Storage Depot\n{item['name']}"
                if n == 1
                else f"Storage Depot #{i}\n{item['name']}"
            )
            self.add_node(depot_id, {
                "node_type": "storage_depot",
                "label": label,
                "item_id": item["id"],
                "item_name": item["name"],
                "item_type": item["type"],
                "building_id": "storage_depot_v1",
                "building_name": "Storage Depot v.1",
                "instance_num": i,
                "capacity_units": DEPOT_CAPACITY,
                "flow_rate_per_min": flow_rate,
                "power": 5,
                "heat": 5,
            })
            chain.append(depot_id)

        self.add_edge(producer_id, chain[0], "buffer", flow_rate)
        for a, b in zip(chain, chain[1:]):
            self.add_edge(a, b, "buffer", flow_rate)
        self.add_edge(chain[-1], consumer_id, "input", flow_rate)


def round_robin_index(consumer_idx: int, fan_out: int, pool_size: int) -> int:
    """Assign consumers in groups of `fan_out` to consecutive producers, wrapping."""
    return (consumer_idx // fan_out) % pool_size


def build(
    items: list[dict],
    buildings: list[dict],
) -> tuple[GraphBuilder, Counter[str]]:
    items_by_id = {it["id"]: it for it in items}
    recipe_for = select_recipes(buildings)

    # End-tier = produced but never used as input.
    consumed: set[str] = set()
    for _, (_, r) in recipe_for.items():
        for inp in r.get("inputs", []) or []:
            consumed.add(inp["id"])
    end_tier = {iid for iid in recipe_for if iid not in consumed}

    demand = propagate_demand(recipe_for, end_tier)
    instances = compute_instances(recipe_for, demand)

    gb = GraphBuilder()

    # ── Building instances ─────────────────────────────────────────────────────
    # Maps item_id → ordered list of producing building instance node IDs.
    producers: dict[str, list[str]] = defaultdict(list)
    building_counts: Counter[str] = Counter()

    for iid, (b, r) in recipe_for.items():
        n = instances[iid]
        if n == 0:
            continue
        item = items_by_id.get(iid)
        item_name = item["name"] if item else iid
        item_type = item["type"] if item else "unknown"
        out_rate = r["output"]["amount_per_minute"]
        is_end = iid in end_tier

        for i in range(1, n + 1):
            node_id = f"b_{b['id']}_{iid}_{i}"
            label = f"{b['name']}\n→ {item_name}"
            gb.add_node(node_id, {
                "node_type": "building",
                "label": label,
                "building_id": b["id"],
                "building_name": b["name"],
                "instance_num": i,
                "item_id": iid,
                "item_name": item_name,
                "item_type": item_type,
                "output_rate_per_min": out_rate,
                "is_end_tier": is_end,
                "power": b.get("power", 0),
                "heat": b.get("heat", 0),
                "demand_rate_per_min": demand[iid],
            })
            producers[iid].append(node_id)
            building_counts[b["id"]] += 1

    # ── End-tier item entry nodes ──────────────────────────────────────────────
    for iid in sorted(end_tier):
        if iid not in producers:
            continue
        item = items_by_id.get(iid)
        item_name = item["name"] if item else iid
        item_type = item["type"] if item else "unknown"
        item_node_id = f"item_{iid}"
        gb.add_node(item_node_id, {
            "node_type": "item",
            "label": item_name,
            "item_id": iid,
            "item_name": item_name,
            "item_type": item_type,
            "is_end_tier": True,
            "demand_rate_per_min": demand[iid],
        })
        producer_id = producers[iid][0]
        out_rate = recipe_for[iid][1]["output"]["amount_per_minute"]
        gb.add_edge(producer_id, item_node_id, "output", out_rate)

    # ── Routing: producer → (depots) → consumer ────────────────────────────────
    for consumer_iid, (consumer_b, consumer_r) in recipe_for.items():
        consumer_pool = producers.get(consumer_iid)
        if not consumer_pool:
            continue

        for inp in consumer_r.get("inputs", []) or []:
            input_iid = inp["id"]
            if input_iid not in recipe_for:
                # Raw input with no recipe; nothing to route from.
                continue
            consumer_input_rate = inp["amount_per_minute"]
            producer_b, producer_r = recipe_for[input_iid]
            producer_rate = producer_r["output"]["amount_per_minute"]
            producer_pool = producers.get(input_iid)
            if not producer_pool:
                continue

            item = items_by_id.get(input_iid)
            input_item_info = {
                "id": input_iid,
                "name": item["name"] if item else input_iid,
                "type": item["type"] if item else "unknown",
            }
            same_type = producer_b["id"] == consumer_b["id"]

            if same_type:
                # Direct edge, no depots — pair by index, wrapping if pool sizes differ.
                for c_idx, c_id in enumerate(consumer_pool):
                    p_id = producer_pool[c_idx % len(producer_pool)]
                    gb.add_edge(p_id, c_id, "input", consumer_input_rate)
                continue

            if producer_rate >= consumer_input_rate:
                fan_out = max(1, math.floor(producer_rate / consumer_input_rate))
                for c_idx, c_id in enumerate(consumer_pool):
                    p_idx = round_robin_index(c_idx, fan_out, len(producer_pool))
                    p_id = producer_pool[p_idx]
                    gb.add_depot_chain(p_id, c_id, consumer_input_rate, input_item_info)
            else:
                fan_in = max(1, math.ceil(consumer_input_rate / producer_rate))
                per_edge_rate = consumer_input_rate / fan_in
                producer_idx = 0
                for c_id in consumer_pool:
                    for _ in range(fan_in):
                        p_id = producer_pool[producer_idx % len(producer_pool)]
                        producer_idx += 1
                        gb.add_depot_chain(p_id, c_id, per_edge_rate, input_item_info)

    return gb, building_counts


# ── Serialization ──────────────────────────────────────────────────────────────


def to_xml_string(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        # Trim trailing zeros without going to scientific notation for typical rates.
        if v.is_integer():
            return str(int(v))
        return f"{v:.4f}".rstrip("0").rstrip(".")
    return str(v)


def write_graphml(gb: GraphBuilder, out: Path) -> None:
    ET.register_namespace("", GRAPHML_NS)
    root = ET.Element(f"{{{GRAPHML_NS}}}graphml")

    for kid, attr_name, for_type, attr_type in KEYS:
        ET.SubElement(
            root,
            f"{{{GRAPHML_NS}}}key",
            {"id": kid, "for": for_type, "attr.name": attr_name, "attr.type": attr_type},
        )

    graph = ET.SubElement(
        root, f"{{{GRAPHML_NS}}}graph", {"id": "G", "edgedefault": "directed"},
    )

    # Nodes first, then edges (graphml convention + our spec requirement).
    for n in gb.nodes:
        el = ET.SubElement(graph, f"{{{GRAPHML_NS}}}node", {"id": n["id"]})
        for attr_name, value in n["attrs"].items():
            kid = KEY_ID[attr_name]
            data = ET.SubElement(el, f"{{{GRAPHML_NS}}}data", {"key": kid})
            data.text = to_xml_string(value)

    for e in gb.edges:
        el = ET.SubElement(
            graph,
            f"{{{GRAPHML_NS}}}edge",
            {"id": e["id"], "source": e["source"], "target": e["target"]},
        )
        for attr_name, value in e["attrs"].items():
            kid = KEY_ID[attr_name]
            data = ET.SubElement(el, f"{{{GRAPHML_NS}}}data", {"key": kid})
            data.text = to_xml_string(value)

    ET.indent(root, space="  ")
    out.parent.mkdir(parents=True, exist_ok=True)
    tree = ET.ElementTree(root)
    tree.write(out, encoding="utf-8", xml_declaration=True)


def print_summary(gb: GraphBuilder, building_counts: Counter[str]) -> None:
    depot_count = sum(1 for n in gb.nodes if n["attrs"]["node_type"] == "storage_depot")
    item_count = sum(1 for n in gb.nodes if n["attrs"]["node_type"] == "item")
    building_count = sum(building_counts.values())

    print("Production graph summary")
    print("─" * 40)
    print(f"Building instances by type ({building_count} total):")
    for bid, n in building_counts.most_common():
        print(f"  {bid:<32} {n:>5}")
    print(f"Storage depot nodes: {depot_count}")
    print(f"Item entry nodes: {item_count}")
    print(f"Total nodes: {len(gb.nodes)}")
    print(f"Total edges: {len(gb.edges)}")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", type=Path, default=Path("data"))
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("public/production_graph.graphml"),
        help="output GraphML path (default: public/production_graph.graphml so Vite serves it)",
    )
    args = ap.parse_args(argv)

    items = load(args.data_dir / "items_catalog.json")
    buildings = load(args.data_dir / "buildings_and_recipes.json")

    gb, building_counts = build(items, buildings)
    write_graphml(gb, args.out)
    print_summary(gb, building_counts)
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
