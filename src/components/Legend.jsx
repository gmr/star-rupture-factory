// Swatches are sourced from the same CSS custom properties the cytoscape
// stylesheet reads, so the legend tracks the active theme automatically.
const ENTRIES = [
  { label: 'Raw', bg: 'var(--node-raw-bg)', border: 'var(--node-raw-border)' },
  { label: 'Processed', bg: 'var(--node-processed-bg)', border: 'var(--node-processed-border)' },
  { label: 'Component', bg: 'var(--node-component-bg)', border: 'var(--node-component-border)' },
  { label: 'Material', bg: 'var(--node-material-bg)', border: 'var(--node-material-border)' },
  { label: 'Ammo', bg: 'var(--node-ammo-bg)', border: 'var(--node-ammo-border)' },
  { label: 'Building', bg: 'var(--node-building-bg)', border: 'var(--node-building-border)' },
  { label: 'Storage Depot', bg: 'var(--node-depot-bg)', border: 'var(--node-depot-border)' },
];

export default function Legend() {
  return (
    <div className="legend">
      <span
        style={{
          fontSize: 14,
          color: 'var(--text-dim)',
          fontFamily: "'Share Tech Mono', monospace",
          letterSpacing: '2px',
          marginRight: 6,
        }}
      >
        LEGEND
      </span>
      {ENTRIES.map((e) => (
        <div key={e.label} className="legend-item">
          <div className="legend-dot" style={{ background: e.bg, border: `1px solid ${e.border}` }} />
          {e.label}
        </div>
      ))}
    </div>
  );
}
