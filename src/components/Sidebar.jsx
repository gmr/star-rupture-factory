import { useState } from 'react';

function ItemList({ items, loadedItems, onExpand, hint, dotClass, mode }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
        {hint}
      </div>
      <ul className="end-tier-list">
        {items.map((n) => (
          <li
            key={n.data.id}
            className={loadedItems.has(n.data.id) ? 'loaded' : ''}
            onClick={() => onExpand(n.data.id, mode)}
          >
            <div className={dotClass} />
            <span>{n.data.item_name}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function NodeDetail({ data, nodeIndex, edgesBySource, edgesByTarget, onJumpTo }) {
  const rows = [];
  if (data.node_type === 'item') {
    rows.push(['Type', 'item', '']);
    rows.push(['Name', data.item_name, 'accent']);
    rows.push(['Category', data.item_type, '']);
    rows.push(['Demand', `${parseFloat(data.demand_rate_per_min || 0).toFixed(1)}/min`, 'accent2']);
    rows.push(['End-Tier', data.is_end_tier, data.is_end_tier === 'true' ? 'accent3' : '']);
  } else if (data.node_type === 'building') {
    rows.push(['Type', 'building', '']);
    rows.push(['Building', data.building_name, 'accent']);
    rows.push(['Produces', data.item_name, '']);
    rows.push(['Instance', `#${data.instance_num}`, 'accent2']);
    rows.push(['Output', `${data.output_rate_per_min}/min`, 'accent3']);
    rows.push(['Power', `${data.power} kW`, '']);
    rows.push(['Heat', `${data.heat}`, '']);
  } else if (data.node_type === 'storage_depot') {
    rows.push(['Type', 'storage depot v.1', '']);
    rows.push(['Item', data.item_name, 'accent']);
    rows.push(['Instance', `#${data.instance_num}`, 'accent2']);
    rows.push(['Capacity', `${data.capacity_units} units`, 'accent3']);
    rows.push(['Power', `${data.power} kW`, '']);
  }

  const inEdges = edgesByTarget[data.id] || [];
  const outEdges = edgesBySource[data.id] || [];

  function ConnectionList({ title, edges, otherEnd }) {
    if (!edges.length) return null;
    return (
      <>
        <div className="section-title">
          {title} ({edges.length})
        </div>
        <ul className="neighbor-list">
          {edges.slice(0, 20).map((e) => {
            const other = nodeIndex[otherEnd(e)];
            if (!other) return null;
            return (
              <li key={e.id} onClick={() => onJumpTo(otherEnd(e))}>
                <span>{other.label || other.item_name || otherEnd(e)}</span>
                <span className="rate">{parseFloat(e.rate_per_min || 0).toFixed(1)}/m</span>
              </li>
            );
          })}
          {edges.length > 20 && (
            <li>
              <span style={{ color: 'var(--text-dim)' }}>… +{edges.length - 20} more</span>
            </li>
          )}
        </ul>
      </>
    );
  }

  return (
    <>
      {rows.map(([label, value, cls]) => (
        <div key={label} className="info-row">
          <span className="info-label">{label}</span>
          <span className={`info-value ${cls}`}>{value ?? '—'}</span>
        </div>
      ))}
      <ConnectionList title="INPUTS" edges={inEdges} otherEnd={(e) => e.source} />
      <ConnectionList title="OUTPUTS" edges={outEdges} otherEnd={(e) => e.target} />
    </>
  );
}

const TABS = [
  { id: 'end-tier', label: 'End-Tier' },
  { id: 'all', label: 'All Items' },
];

export default function Sidebar({
  selectedNode,
  endTierItems,
  allItems,
  loadedItems,
  nodeIndex,
  edgesBySource,
  edgesByTarget,
  onExpand,
  onJumpTo,
  graphLoaded,
}) {
  const [activeTab, setActiveTab] = useState('end-tier');

  if (selectedNode) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">NODE DETAIL</div>
        <div className="sidebar-body">
          <NodeDetail
            data={selectedNode}
            nodeIndex={nodeIndex}
            edgesBySource={edgesBySource}
            edgesByTarget={edgesByTarget}
            onJumpTo={onJumpTo}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">Products</div>
      <div className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`sidebar-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            <span className="tab-count">
              {(t.id === 'end-tier' ? endTierItems : allItems).length}
            </span>
          </button>
        ))}
      </div>
      <div className="sidebar-body">
        {!graphLoaded ? (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Loading <code style={{ color: 'var(--accent)' }}>production_graph.graphml</code>…
          </div>
        ) : activeTab === 'end-tier' ? (
          <ItemList
            items={endTierItems}
            loadedItems={loadedItems}
            onExpand={onExpand}
            mode="all"
            hint="Click to toggle the full production chain"
            dotClass="tier-dot"
          />
        ) : (
          <ItemList
            items={allItems}
            loadedItems={loadedItems}
            onExpand={onExpand}
            mode="minimal"
            hint="Click an item to load a single production chain"
            dotClass="item-dot"
          />
        )}
      </div>
    </div>
  );
}
