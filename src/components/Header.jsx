import { LAYOUT_OPTIONS } from '../lib/cytoscapeSetup.js';

export default function Header({
  statusState,
  searchQuery,
  onSearchChange,
  layoutName,
  onLayoutChange,
  onRelayout,
  onFit,
  onReset,
  onHelp,
}) {
  return (
    <header>
      <div className={`status-dot ${statusState}`} />
      <h1>Star Rupture</h1>
      <span className="sep">//</span>
      <h1 style={{ color: 'var(--text-dim)' }}>Optimized Factory Explorer</h1>
      <div className="toolbar">
        <input
          id="item-search"
          type="text"
          placeholder="Search items or buildings…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <select value={layoutName} onChange={(e) => onLayoutChange(e.target.value)}>
          {LAYOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button onClick={onRelayout}>Re-Layout</button>
        <button onClick={onFit}>Fit View</button>
        <button className="danger" onClick={onReset}>Reset Graph</button>
        <button className="help-btn" onClick={onHelp} aria-label="About">?</button>
      </div>
    </header>
  );
}
