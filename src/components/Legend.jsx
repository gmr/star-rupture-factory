const ENTRIES = [
  { label: 'Raw', bg: '#1e5c3a', border: '#39ff14' },
  { label: 'Processed', bg: '#5c4a1e', border: '#ffcc44' },
  { label: 'Component', bg: '#1e3a5c', border: '#00d4ff' },
  { label: 'Material', bg: '#3a1e5c', border: '#aa88ff' },
  { label: 'Ammo', bg: '#5c1e1e', border: '#ff6b35' },
  { label: 'Building', bg: '#1e3a1e', border: '#44aa44' },
  { label: 'Storage Depot', bg: '#3a2a0a', border: '#cc8833' },
];

export default function Legend() {
  return (
    <div className="legend">
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-dim)',
          fontFamily: "'Share Tech Mono', monospace",
          marginRight: 4,
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
