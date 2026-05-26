import { useEffect, useMemo, useState } from 'react';
import { collectSubtree } from '../lib/parseGraphML.js';

const STORAGE_KEY = 'star-rupture:buildplan:checked';

function loadChecked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function saveChecked(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

// Union of node IDs from every loaded production chain (mirrors canvas
// expansion logic).
function computePlanScope(loadedItems, nodeIndex, edgesBySource, edgesByTarget) {
  const buildingsByItem = new Map();
  for (const id in nodeIndex) {
    const n = nodeIndex[id];
    if (n.node_type !== 'building' || !n.item_id) continue;
    const list = buildingsByItem.get(n.item_id) || [];
    list.push(id);
    buildingsByItem.set(n.item_id, list);
  }

  const nodeIds = new Set();
  for (const [itemId, mode] of loadedItems) {
    const seeds = buildingsByItem.get(itemId) || [];
    const startFrom = mode === 'minimal' && seeds.length > 0 ? [seeds[0]] : seeds;
    for (const seed of startFrom) {
      const sub = collectSubtree(seed, edgesBySource, edgesByTarget);
      for (const id of sub.nodeIds) nodeIds.add(id);
    }
  }
  return nodeIds;
}

function baseLabel(node) {
  if (node.node_type === 'storage_depot') {
    return `Storage Depot (${node.item_name || node.item_id})`;
  }
  // Include the item produced — same building type making different items
  // shares a name in the data, and would otherwise be indistinguishable.
  const name = node.building_name || 'Unknown';
  return node.item_name ? `${name} (${node.item_name})` : name;
}

// DFS-based topo sort. Kahn's algorithm with a stack (LIFO) instead of a
// queue (FIFO) — each time a node is built, the next available step is its
// downstream neighbour if possible, so each linear chain is walked to its
// junction before another source begins. This produces the "build A,
// connect A→B, build B, connect B→C…" reading the user expects.
function topoOrder(nodeIds, nodeIndex, edgesBySource, edgesByTarget) {
  const inDeg = new Map();
  for (const id of nodeIds) {
    let d = 0;
    for (const e of edgesByTarget[id] || []) {
      if (nodeIds.has(e.source)) d += 1;
    }
    inDeg.set(id, d);
  }
  const cmp = (a, b) => {
    const la = baseLabel(nodeIndex[a]);
    const lb = baseLabel(nodeIndex[b]);
    const c = la.localeCompare(lb);
    if (c !== 0) return c;
    const ia = parseInt(nodeIndex[a].instance_num || '0', 10);
    const ib = parseInt(nodeIndex[b].instance_num || '0', 10);
    return ia - ib;
  };
  // Sources sorted in reverse so cmp-first ends up on the stack top.
  const stack = [...nodeIds]
    .filter((id) => inDeg.get(id) === 0)
    .sort(cmp)
    .reverse();
  const order = [];
  const visited = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    const newlyAvailable = [];
    for (const e of edgesBySource[id] || []) {
      if (!nodeIds.has(e.target) || visited.has(e.target)) continue;
      const d = (inDeg.get(e.target) || 0) - 1;
      inDeg.set(e.target, d);
      if (d === 0) newlyAvailable.push(e.target);
    }
    newlyAvailable.sort(cmp).reverse();
    for (const c of newlyAvailable) stack.push(c);
  }
  for (const id of nodeIds) if (!visited.has(id)) order.push(id);
  return order;
}

function buildSteps(loadedItems, nodeIndex, edgesBySource, edgesByTarget) {
  const nodeIds = computePlanScope(loadedItems, nodeIndex, edgesBySource, edgesByTarget);
  if (nodeIds.size === 0) return { steps: [], totals: null };

  // Count instances per label; the data's `instance_num` isn't reliably
  // unique across nodes that share a label, so we assign our own sequence.
  const instanceCount = new Map();
  for (const id of nodeIds) {
    const key = baseLabel(nodeIndex[id]);
    instanceCount.set(key, (instanceCount.get(key) || 0) + 1);
  }

  const order = topoOrder(nodeIds, nodeIndex, edgesBySource, edgesByTarget);

  // Assign sequential per-label instance numbers in topo order so connect
  // steps reference the same number as the build step they follow.
  const instanceIndex = new Map(); // nodeId -> #N
  const seen = new Map(); // label -> running count
  for (const id of order) {
    const base = baseLabel(nodeIndex[id]);
    if (instanceCount.get(base) > 1) {
      const next = (seen.get(base) || 0) + 1;
      seen.set(base, next);
      instanceIndex.set(id, next);
    }
  }
  const label = (node) => {
    const base = baseLabel(node);
    const n = instanceIndex.get(node.id);
    return n ? `${base} #${n}` : base;
  };

  const steps = [];
  let totalBuildings = 0;
  let totalDepots = 0;
  let totalConnections = 0;
  let totalPower = 0;

  for (const id of order) {
    const node = nodeIndex[id];
    const isDepot = node.node_type === 'storage_depot';
    if (isDepot) totalDepots += 1;
    else totalBuildings += 1;
    totalPower += parseFloat(node.power || 0) || 0;

    steps.push({
      id: `build:${id}`,
      kind: 'build',
      label: `Build a ${label(node)}`,
      nodeId: id,
      baseId: node.base_id || null,
      meta: isDepot
        ? node.capacity_units
          ? `cap ${parseFloat(node.capacity_units)} u`
          : ''
        : [
            node.output_rate_per_min &&
              `${parseFloat(node.output_rate_per_min).toFixed(1)}/m ${node.item_name || ''}`.trim(),
            node.power && `${parseFloat(node.power)} kW`,
          ]
            .filter(Boolean)
            .join(' · '),
    });

    const inEdges = (edgesByTarget[id] || []).filter((e) => nodeIds.has(e.source));
    inEdges.sort((a, b) =>
      label(nodeIndex[a.source]).localeCompare(label(nodeIndex[b.source])),
    );
    for (const e of inEdges) {
      const src = nodeIndex[e.source];
      const rate = parseFloat(e.rate_per_min || 0);
      const srcBase = src.base_id || null;
      const dstBase = node.base_id || null;
      const crosses = !!(srcBase && dstBase && srcBase !== dstBase);
      totalConnections += 1;
      steps.push({
        id: `connect:${e.id}`,
        kind: 'connect',
        label: `Connect ${label(src)} → ${label(node)}`,
        nodeId: id,
        baseId: dstBase,
        crossesBase: crosses,
        fromBase: srcBase,
        toBase: dstBase,
        meta: rate > 0 ? `${rate.toFixed(1)}/m` : '',
      });
    }
  }

  return {
    steps,
    totals: {
      totalBuildings,
      totalDepots,
      totalConnections,
      totalPower,
      totalSteps: steps.length,
    },
  };
}

// Bucket steps by base — all of a base's work in one contiguous section,
// regardless of where each step appeared in the original topo walk. Bases
// are then ordered by their numeric index so base_1 comes before base_2.
// Connect steps go in the *destination* base's bucket (which matches
// "the thing you're wiring up sits in this base").
function groupStepsByBase(steps) {
  const byBase = new Map();
  const order = [];
  for (const step of steps) {
    const baseId = (step.kind === 'connect' ? step.toBase : step.baseId) || '__unassigned__';
    if (!byBase.has(baseId)) {
      byBase.set(baseId, []);
      order.push(baseId);
    }
    byBase.get(baseId).push(step);
  }
  order.sort((a, b) => {
    const numA = parseInt((a.match(/\d+/) || ['0'])[0], 10);
    const numB = parseInt((b.match(/\d+/) || ['0'])[0], 10);
    return numA - numB;
  });
  return order.map((baseId) => ({ baseId, steps: byBase.get(baseId) }));
}

function BaseHeader({ baseId, baseInfo, stepCount, doneCount }) {
  const pct = stepCount > 0 ? Math.round((doneCount / stepCount) * 100) : 0;
  const num = baseInfo?.index ?? (baseId ? baseId.replace(/^base_/, '') : '—');
  return (
    <li className="plan-base-header">
      <div className="plan-base-row">
        <span className="plan-base-num">{String(num).padStart(2, '0')}</span>
        <div className="plan-base-title-block">
          <span className="plan-base-eyebrow">BASE {String(num).padStart(2, '0')}</span>
          <span className="plan-base-title">
            {baseInfo ? `Core Lv ${baseInfo.base_level}` : 'Unassigned'}
            {baseInfo?.amplifier_v2_count
              ? ` · +${baseInfo.amplifier_v2_count} Amp v.2`
              : ''}
          </span>
        </div>
        <div className="plan-base-pct">
          <span>{doneCount}/{stepCount}</span>
          <div className="plan-base-bar-wrap">
            <div className="plan-base-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {baseInfo && (
        <div className="plan-base-meta">
          <span><em>HEAT</em> {Math.round(baseInfo.total_heat)}</span>
          <span><em>PWR</em> {(baseInfo.production_power_kw / 1000).toFixed(2)} MW</span>
          {baseInfo.dispatchers > 0 && (
            <span><em>DISP</em> {baseInfo.dispatchers}</span>
          )}
          {baseInfo.receivers > 0 && (
            <span><em>RECV</em> {baseInfo.receivers}</span>
          )}
          {baseInfo.generators?.length > 0 && (
            <span className="plan-base-gens">
              <em>GEN</em>{' '}
              {baseInfo.generators.map((g) => `${g.count}× ${g.name}`).join(', ')}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export default function BuildPlan({
  loadedItems,
  nodeIndex,
  edgesBySource,
  edgesByTarget,
  factoryPlan,
  onJumpTo,
}) {
  const [checked, setChecked] = useState(loadChecked);

  useEffect(() => {
    saveChecked(checked);
  }, [checked]);

  const { steps, totals } = useMemo(
    () => buildSteps(loadedItems, nodeIndex, edgesBySource, edgesByTarget),
    [loadedItems, nodeIndex, edgesBySource, edgesByTarget],
  );

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);
  const doneCount = useMemo(
    () => stepIds.filter((id) => checked.has(id)).length,
    [stepIds, checked],
  );
  const pct = totals && totals.totalSteps > 0
    ? Math.round((doneCount / totals.totalSteps) * 100)
    : 0;

  if (loadedItems.size === 0) {
    return (
      <div className="plan-wrap">
        <div className="plan-empty">
          <div className="plan-empty-tag">NO MANIFEST</div>
          <p>
            Load one or more production chains from the <strong>End-Tier</strong>
            {' '}or <strong>All Items</strong> tabs to generate a build punchlist.
          </p>
          <p className="plan-empty-sub">
            Each step is enumerated — every building, every connection — in the
            order you should build them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-wrap">
      <div className="plan-summary">
        <div className="plan-summary-bar-col">
          <div className="plan-summary-bar-wrap">
            <div className="plan-summary-bar" style={{ width: `${pct}%` }} />
            <div className="plan-summary-bar-text">
              <span>BUILD MANIFEST · {pct}%</span>
              <span>{doneCount}/{totals.totalSteps}</span>
            </div>
          </div>
          {doneCount > 0 && (
            <button
              type="button"
              className="plan-reset"
              onClick={() => {
                setChecked((prev) => {
                  const next = new Set(prev);
                  for (const id of stepIds) next.delete(id);
                  return next;
                });
              }}
            >
              Reset checks
            </button>
          )}
        </div>
        <div className="plan-summary-grid">
          <div>
            <span className="plan-stat">{totals.totalBuildings}</span>
            <span className="plan-stat-label">Buildings</span>
            <span className="plan-corner-br" />
          </div>
          <div>
            <span className="plan-stat">{totals.totalDepots}</span>
            <span className="plan-stat-label">Depots</span>
            <span className="plan-corner-br" />
          </div>
          <div>
            <span className="plan-stat">{totals.totalConnections}</span>
            <span className="plan-stat-label">Connections</span>
            <span className="plan-corner-br" />
          </div>
          <div>
            <span className="plan-stat">
              {(totals.totalPower / 1000).toFixed(2)}
            </span>
            <span className="plan-stat-label">MW Load</span>
            <span className="plan-corner-br" />
          </div>
        </div>
      </div>

      <ol className="plan-steps">
        {(() => {
          const groups = groupStepsByBase(steps);
          const baseInfoById = new Map();
          if (factoryPlan?.bases) {
            for (const b of factoryPlan.bases) baseInfoById.set(b.id, b);
          }
          let globalIdx = 0;
          return groups.flatMap((group) => {
            const baseInfo = baseInfoById.get(group.baseId);
            const groupDone = group.steps.filter((s) => checked.has(s.id)).length;
            const rows = [
              <BaseHeader
                key={`header:${group.baseId || 'none'}:${globalIdx}`}
                baseId={group.baseId}
                baseInfo={baseInfo}
                stepCount={group.steps.length}
                doneCount={groupDone}
              />,
            ];
            for (const step of group.steps) {
              globalIdx += 1;
              const isChecked = checked.has(step.id);
              const crosses = step.kind === 'connect' && step.crossesBase;
              rows.push(
                <li
                  key={step.id}
                  className={`plan-step-row ${isChecked ? 'done' : ''} kind-${step.kind} ${crosses ? 'crosses-base' : ''}`}
                >
                  <button
                    type="button"
                    className="plan-check"
                    aria-pressed={isChecked}
                    aria-label={isChecked ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => toggle(step.id)}
                  >
                    <span className="plan-check-box" />
                  </button>
                  <span className="plan-step-num">
                    {String(globalIdx).padStart(3, '0')}
                  </span>
                  <span className={`plan-step-kind kind-${step.kind}`}>
                    {step.kind === 'build' ? '+' : '→'}
                  </span>
                  <span className="plan-step-label">
                    {step.label}
                    {crosses && (
                      <span className="plan-cross-tag" title={`via Cargo Dispatcher in ${step.fromBase} → Cargo Receiver in ${step.toBase}`}>
                        cross-base
                      </span>
                    )}
                  </span>
                  {step.meta && <span className="plan-step-meta">{step.meta}</span>}
                  <button
                    type="button"
                    className="plan-jump"
                    title="Reveal on graph"
                    onClick={() => onJumpTo(step.nodeId)}
                  >
                    ↗
                  </button>
                </li>,
              );
            }
            return rows;
          });
        })()}
      </ol>
    </div>
  );
}
