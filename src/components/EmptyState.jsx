export default function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-eyebrow">Production Graph</div>
        <h2 className="empty-title">Pick a product to begin</h2>
        <p className="empty-body">
          Choose any item from the panel on the right to load its production
          chain into the canvas. <strong>End-Tier</strong> shows the 10
          finishable products; <strong>All Items</strong> lets you trace a
          minimal chain for anything in between.
        </p>
      </div>
      <div className="empty-arrow" aria-hidden="true">
        <svg width="120" height="24" viewBox="0 0 120 24">
          <line x1="0" y1="12" x2="108" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
          <polyline points="100,4 112,12 100,20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
