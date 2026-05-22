import { LAYOUT_OPTIONS } from '../lib/cytoscapeSetup.js';

// Slider position 0-100 ↔ log-scaled zoom over [MIN_ZOOM, MAX_ZOOM].
// Log scale gives equal slider movement = equal perceived zoom factor.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const LOG_MIN = Math.log(MIN_ZOOM);
const LOG_RANGE = Math.log(MAX_ZOOM) - LOG_MIN;
const sliderToZoom = (s) => Math.exp(LOG_MIN + (s / 100) * LOG_RANGE);
const zoomToSlider = (z) => Math.round(((Math.log(z) - LOG_MIN) / LOG_RANGE) * 100);

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
  zoom,
  onZoomChange,
}) {
  return (
    <header>
      <div className={`status-dot ${statusState}`} />
      <h1>Star Rupture Optimized Factory Explorer</h1>
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
        <div className="zoom-control" title={`Zoom ${Math.round(zoom * 100)}%`}>
          <span className="zoom-label">−</span>
          <input
            type="range"
            min="0"
            max="100"
            value={zoomToSlider(zoom)}
            onChange={(e) => onZoomChange(sliderToZoom(Number(e.target.value)))}
            aria-label="Zoom"
          />
          <span className="zoom-label">+</span>
        </div>
        <button className="danger" onClick={onReset}>Reset Graph</button>
        <button className="help-btn" onClick={onHelp} aria-label="About">?</button>
      </div>
    </header>
  );
}
