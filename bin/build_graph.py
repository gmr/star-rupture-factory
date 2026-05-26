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
    ("d_base_id", "base_id", "node", "string"),
    ("d_edge_type", "edge_type", "edge", "string"),
    ("d_rate", "rate_per_min", "edge", "double"),
    ("d_crosses_base", "crosses_base", "edge", "boolean"),
]
KEY_ID = {attr: kid for kid, attr, _, _ in KEYS}

# Greedy partitioner targets this fraction of max base capacity for production
# + transport heat together, leaving the remainder for generators. Tuned so
# the resulting cross-base edge count and dispatcher overhead stay manageable;
# pushing it lower produces more, smaller bases (= more crossings = more
# dispatchers = worse).
PRODUCTION_HEAT_FRACTION = 0.85


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


# ── Base partitioning + power sizing ───────────────────────────────────────────


def topo_order_nodes(gb: GraphBuilder) -> list[str]:
    """DFS-style topological order (Kahn's with a stack, not a queue). Each
    time a node is emitted, the next available step is its downstream
    neighbour where possible — so chains walk end-to-end before another
    source starts. This produces tight bands of locality so the partitioner
    keeps each chain in one base."""
    node_ids = [n["id"] for n in gb.nodes]
    in_deg: dict[str, int] = {nid: 0 for nid in node_ids}
    out_edges: dict[str, list[str]] = defaultdict(list)
    for e in gb.edges:
        out_edges[e["source"]].append(e["target"])
        in_deg[e["target"]] = in_deg.get(e["target"], 0) + 1

    # Sort source nodes reversed so the first source pops off the stack top.
    stack = sorted([nid for nid in node_ids if in_deg[nid] == 0], reverse=True)
    order: list[str] = []
    visited: set[str] = set()
    while stack:
        nid = stack.pop()
        if nid in visited:
            continue
        visited.add(nid)
        order.append(nid)
        newly: list[str] = []
        for t in out_edges[nid]:
            if t in visited:
                continue
            in_deg[t] -= 1
            if in_deg[t] == 0:
                newly.append(t)
        # Sort newly-available children reversed so alphabetical-first lands on
        # top of the stack and gets emitted next.
        for t in sorted(newly, reverse=True):
            stack.append(t)
    for nid in node_ids:
        if nid not in visited:
            order.append(nid)
    return order


def size_generators(
    power_needed_kw: float,
    heat_budget: float,
    power_config: dict,
) -> list[dict]:
    """Pick a generator mix that produces ≥ power_needed_kw and fits in
    heat_budget. Greedy: walk the configured preference order, fill with the
    biggest tier that still has heat room, fall back to smaller tiers when
    blocked."""
    if power_needed_kw <= 0:
        return []
    gens_by_id = {g["id"]: g for g in power_config["generators"]}
    order = power_config.get("generator_selection_order", list(gens_by_id))

    picked: list[dict] = []
    remaining = float(power_needed_kw)
    heat_left = float(heat_budget)
    for gen_id in order:
        gen = gens_by_id.get(gen_id)
        if gen is None or remaining <= 0:
            continue
        per_unit_power = float(gen.get("power_kw") or 0)
        per_unit_heat = float(gen.get("heat") or 0)
        if per_unit_power <= 0:
            continue
        if per_unit_heat > 0:
            max_by_heat = math.floor(heat_left / per_unit_heat) if per_unit_heat > 0 else math.inf
        else:
            max_by_heat = math.inf
        if max_by_heat <= 0:
            continue
        needed = math.ceil(remaining / per_unit_power)
        count = min(needed, max_by_heat)
        if count <= 0:
            continue
        picked.append({
            "id": gen_id,
            "name": gen["name"],
            "count": int(count),
            "power_kw_each": per_unit_power,
            "heat_each": per_unit_heat,
            "total_power_kw": count * per_unit_power,
            "total_heat": count * per_unit_heat,
        })
        remaining -= count * per_unit_power
        heat_left -= count * per_unit_heat
    return picked


def pick_base_level_and_amplifiers(
    total_heat: float,
    power_config: dict,
) -> tuple[int, int]:
    """Return (chosen_level, amplifier_v2_count). Picks the lowest level
    whose heat capacity meets total_heat; if even max level is short, adds
    v.2 amplifiers."""
    levels = power_config["base_core"]["levels"]
    for lv in levels:
        if lv["heat_capacity"] >= total_heat:
            return lv["level"], 0
    max_level = levels[-1]
    deficit = total_heat - max_level["heat_capacity"]
    amp_v2 = next(
        (a for a in power_config["amplifiers"] if a["id"] == "base_core_amplifier_v2"),
        None,
    )
    bonus = float(amp_v2["heat_capacity_bonus"]) if amp_v2 else 250.0
    return max_level["level"], int(math.ceil(deficit / bonus))


def partition_bases(
    gb: GraphBuilder,
    power_config: dict,
    transport_config: dict,
) -> list[dict]:
    """Greedy topological packer: walks all real nodes in topo order, opening
    a new base whenever the production-heat budget would be exceeded. Then
    counts cross-base edges, charges each base for its share of cargo
    dispatcher/receiver overhead, sizes generators and amplifiers.

    Returns a list of base records used both to decorate the GraphML (base_id
    on nodes, crosses_base on edges) and to emit the sidecar factory plan."""
    levels = power_config["base_core"]["levels"]
    max_capacity = float(levels[-1]["heat_capacity"])
    target_production_heat = max_capacity * PRODUCTION_HEAT_FRACTION

    node_by_id = {n["id"]: n for n in gb.nodes}
    order = topo_order_nodes(gb)

    bases: list[dict] = []
    current: dict | None = None
    for nid in order:
        node = node_by_id[nid]
        # Item entry nodes are abstract; assign them to the same base as their
        # (single) upstream producer in a second pass.
        if node["attrs"].get("node_type") == "item":
            continue
        heat = float(node["attrs"].get("heat") or 0)
        power = float(node["attrs"].get("power") or 0)
        if current is None or (
            current["node_ids"] and current["production_heat"] + heat > target_production_heat
        ):
            current = {
                "id": f"base_{len(bases) + 1}",
                "index": len(bases) + 1,
                "node_ids": [],
                "production_heat": 0.0,
                "production_power_kw": 0.0,
            }
            bases.append(current)
        current["node_ids"].append(nid)
        current["production_heat"] += heat
        current["production_power_kw"] += power

    # Decorate every real node with its base_id.
    base_of: dict[str, str] = {}
    for b in bases:
        for nid in b["node_ids"]:
            base_of[nid] = b["id"]
            node_by_id[nid]["attrs"]["base_id"] = b["id"]

    # Item entry nodes inherit their producer's base for downstream consumers.
    incoming: dict[str, list[str]] = defaultdict(list)
    for e in gb.edges:
        incoming[e["target"]].append(e["source"])
    for nid, node in node_by_id.items():
        if node["attrs"].get("node_type") != "item":
            continue
        sources = incoming.get(nid) or []
        if sources:
            src_base = base_of.get(sources[0])
            if src_base:
                node["attrs"]["base_id"] = src_base
                base_of[nid] = src_base

    # Cross-base edges drive dispatcher/receiver overhead. One dispatcher in
    # the source base + one receiver in the target base serves a UNIQUE
    # (source_base, target_base, item_id) "pipe" — not one per edge. Many
    # edges share an item type across the same base boundary, so we
    # deduplicate before counting.
    pipes: set[tuple[str, str, str]] = set()
    cross_count = 0
    for e in gb.edges:
        s_base = base_of.get(e["source"])
        t_base = base_of.get(e["target"])
        cross = bool(s_base and t_base and s_base != t_base)
        e["attrs"]["crosses_base"] = cross
        if cross:
            cross_count += 1
            src_attrs = node_by_id[e["source"]]["attrs"]
            item_id = str(src_attrs.get("item_id") or "")
            pipes.add((s_base, t_base, item_id))

    pipes_out: Counter[str] = Counter()
    pipes_in: Counter[str] = Counter()
    for s, t, _ in pipes:
        pipes_out[s] += 1
        pipes_in[t] += 1

    dispatcher = transport_config["cargo_dispatch"]["dispatcher"]
    receiver = transport_config["cargo_dispatch"]["receiver"]
    dispatcher_heat = float(dispatcher.get("heat") or 0)
    dispatcher_power = float(dispatcher.get("power_kw") or 0)
    receiver_heat = float(receiver.get("heat") or 0)
    receiver_power = float(receiver.get("power_kw") or 0)

    for b in bases:
        # One dispatcher per outgoing pipe, one receiver per incoming pipe.
        # (For maxing out a same-tier rail you'd run 2 dispatchers per
        # receiver; that 2:1 ratio is a tuning decision left to the player.)
        n_dispatchers = int(pipes_out.get(b["id"], 0))
        n_receivers = int(pipes_in.get(b["id"], 0))
        b["dispatchers"] = n_dispatchers
        b["receivers"] = n_receivers
        b["transport_heat"] = (
            n_dispatchers * dispatcher_heat + n_receivers * receiver_heat
        )
        b["transport_power_kw"] = (
            n_dispatchers * dispatcher_power + n_receivers * receiver_power
        )

    # Generator sizing: capacity can be expanded by adding v.2 amplifiers
    # (+250 heat each), so when production + transport already exceeds the
    # max base level cap we have to budget the amplifier expansion *before*
    # we can size generators. Iterate: assume an amplifier count → derive a
    # heat budget → pick generators → see if the total fits or we need more
    # amplifiers. Converges fast in practice.
    amp_v2 = next(
        (a for a in power_config["amplifiers"] if a["id"] == "base_core_amplifier_v2"),
        None,
    )
    amp_v2_bonus = float(amp_v2["heat_capacity_bonus"]) if amp_v2 else 250.0

    for b in bases:
        non_gen_heat = b["production_heat"] + b["transport_heat"]
        non_gen_power = b["production_power_kw"] + b["transport_power_kw"]

        # Bump amplifiers until generators fit AND cover the demand. Start
        # with enough amps to seat non_gen_heat plus a small generator
        # reserve so the first iteration isn't a wasted no-op.
        seed_reserve = 500.0
        amps = max(
            0,
            int(math.ceil(
                (non_gen_heat + seed_reserve - max_capacity) / amp_v2_bonus
            )),
        )
        generators: list[dict] = []
        gen_power = 0.0
        for _ in range(60):
            capacity = max_capacity + amps * amp_v2_bonus
            heat_budget = max(0.0, capacity - non_gen_heat)
            generators = size_generators(non_gen_power, heat_budget, power_config)
            gen_power = sum(g["total_power_kw"] for g in generators)
            gen_heat = sum(g["total_heat"] for g in generators)
            total_heat = non_gen_heat + gen_heat
            if gen_power >= non_gen_power and total_heat <= capacity:
                break
            amps += 1  # bump capacity by one amplifier and try again

        gen_heat = sum(g["total_heat"] for g in generators)
        gen_power = sum(g["total_power_kw"] for g in generators)
        total_heat = non_gen_heat + gen_heat
        level, final_amps = pick_base_level_and_amplifiers(total_heat, power_config)
        b["generators"] = generators
        b["generator_heat"] = gen_heat
        b["generator_power_kw"] = gen_power
        b["total_heat"] = total_heat
        b["total_power_kw"] = non_gen_power
        b["base_level"] = level
        b["amplifier_v2_count"] = final_amps
        b["power_satisfied"] = gen_power >= non_gen_power

    return bases, cross_count


def write_factory_plan(bases: list[dict], cross_count: int, out: Path) -> None:
    """Sidecar consumed by the front-end Build Plan to render per-base sections
    + dispatcher/receiver/generator steps without re-parsing the GraphML."""
    payload = {
        "version": 1,
        "cross_base_edges": cross_count,
        "bases": [
            {
                "id": b["id"],
                "index": b["index"],
                "base_level": b["base_level"],
                "amplifier_v2_count": b["amplifier_v2_count"],
                "node_count": len(b["node_ids"]),
                "production_heat": round(b["production_heat"], 1),
                "transport_heat": round(b["transport_heat"], 1),
                "generator_heat": round(b["generator_heat"], 1),
                "total_heat": round(b["total_heat"], 1),
                "production_power_kw": round(b["production_power_kw"], 1),
                "transport_power_kw": round(b["transport_power_kw"], 1),
                "generator_power_kw": round(b["generator_power_kw"], 1),
                "dispatchers": b["dispatchers"],
                "receivers": b["receivers"],
                "generators": b["generators"],
                "power_satisfied": b["power_satisfied"],
            }
            for b in bases
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))


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


def print_summary(
    gb: GraphBuilder,
    building_counts: Counter[str],
    bases: list[dict],
    cross_count: int,
) -> None:
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
    print()
    print(f"Bases: {len(bases)}  (cross-base edges: {cross_count})")
    print("─" * 40)
    for b in bases:
        gen_summary = (
            ", ".join(f"{g['count']}× {g['name']}" for g in b["generators"]) or "—"
        )
        amp = (
            f", +{b['amplifier_v2_count']} amp v.2"
            if b["amplifier_v2_count"] else ""
        )
        sat = "" if b["power_satisfied"] else "  ⚠ POWER SHORT"
        print(
            f"  {b['id']}: lv {b['base_level']}{amp} · "
            f"{len(b['node_ids'])} nodes · "
            f"{b['total_heat']:.0f} heat · "
            f"{b['total_power_kw']:.0f} kW demand{sat}"
        )
        print(f"    generators: {gen_summary}")
        if b["dispatchers"] or b["receivers"]:
            print(
                f"    transport: {b['dispatchers']} dispatchers, "
                f"{b['receivers']} receivers "
                f"(+{b['transport_heat']:.0f} heat, +{b['transport_power_kw']:.0f} kW)"
            )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", type=Path, default=Path("data"))
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("public/production_graph.graphml"),
        help="output GraphML path (default: public/production_graph.graphml so Vite serves it)",
    )
    ap.add_argument(
        "--plan-out",
        type=Path,
        default=Path("public/factory_plan.json"),
        help="output factory plan sidecar (per-base sizing details for the Plan view)",
    )
    args = ap.parse_args(argv)

    items = load(args.data_dir / "items_catalog.json")
    buildings = load(args.data_dir / "buildings_and_recipes.json")
    power_config = load(args.data_dir / "power.json")
    transport_config = load(args.data_dir / "transport.json")

    gb, building_counts = build(items, buildings)
    bases, cross_count = partition_bases(gb, power_config, transport_config)
    write_graphml(gb, args.out)
    write_factory_plan(bases, cross_count, args.plan_out)
    print_summary(gb, building_counts, bases, cross_count)
    print(f"\nWrote {args.out}")
    print(f"Wrote {args.plan_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
