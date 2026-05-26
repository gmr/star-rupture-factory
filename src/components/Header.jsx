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
  viewMode,
  onViewModeChange,
  theme,
  onThemeToggle,
}) {
  const graphActive = viewMode === 'graph';
  const isLight = theme === 'light';
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
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`view-toggle-btn ${graphActive ? 'active' : ''}`}
            aria-pressed={graphActive}
            onClick={() => onViewModeChange('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${!graphActive ? 'active' : ''}`}
            aria-pressed={!graphActive}
            onClick={() => onViewModeChange('plan')}
          >
            Plan
          </button>
        </div>
        <select
          value={layoutName}
          onChange={(e) => onLayoutChange(e.target.value)}
          disabled={!graphActive}
        >
          {LAYOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button onClick={onRelayout} disabled={!graphActive}>Re-Layout</button>
        <button onClick={onFit} disabled={!graphActive}>Fit View</button>
        <div
          className={`zoom-control ${!graphActive ? 'disabled' : ''}`}
          title={`Zoom ${Math.round(zoom * 100)}%`}
        >
          <span className="zoom-label">−</span>
          <input
            type="range"
            min="0"
            max="100"
            value={zoomToSlider(zoom)}
            onChange={(e) => onZoomChange(sliderToZoom(Number(e.target.value)))}
            aria-label="Zoom"
            disabled={!graphActive}
          />
          <span className="zoom-label">+</span>
        </div>
        <button className="danger" onClick={onReset}>Reset Graph</button>
        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeToggle}
          aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
          title={`Switch to ${isLight ? 'dark' : 'light'} theme`}
        >
          <span className="theme-toggle-glyph" aria-hidden="true">
            {isLight ? '☼' : '☾'}
          </span>
          <span className="theme-toggle-label">{isLight ? 'Light' : 'Dark'}</span>
        </button>
        <button className="help-btn" onClick={onHelp} aria-label="About">?</button>
      </div>
    </header>
  );
}
